# 给 B 的交接说明

A 已经把框架、主题、数据层和 5 张时空类图表做完了。你只需要在 `js/charts.js` 末尾替换 5 个占位函数，其他文件基本不用动。

---

## 一、现在的状态

| 已完成（A） | 待实现（B） |
|---|---|
| 页面骨架 `index.html`、主题 `css/style.css`、`theme.js` | 04 最差/最优 20 城 → `chartRank()` |
| 数据层 `main.js`（加载、索引、地图注册、筛选、按需重绘） | 05 年度箱线图 → `chartBox()` |
| 状态与订阅 `state.js` | 06 等级结构堆叠柱 → `chartLevel()` |
| KPI 卡、01 趋势、02 地图、03 区域、08 热力图、10 城市详情 | 07 改善幅度排行 → `chartDelta()` |
| | 09 四象限散点 → `chartQuad()` |

> 说明：分工表里图 10（城市详情）写在 A 名下，执行手册里写在 B 名下。因为"点地图 → 看详情"是同一个交互闭环，A 已一并做完。**所以 B 实际是 5 张图**，工作量与 A 基本持平。

每张占位卡片已经在页面上画成虚线框，写着"待 B 同学实现 · 执行手册步骤 x.x"。替换函数体后，虚线框自动消失。

---

## 二、直接可用的全局对象（不用 import，都是全局）

```js
D              // 整个 app_data.json
D.cities       // [{name, province, region, level, lon, lat}] × 367
D.long         // [[城市下标, 年份, AQI]] × 3724，压缩数组
D.summary      // [{name, rank, mean, y2015, y2024, change, std, quadrant}] × 367
D.yearStats    // [{year, n, mean, median, p10, p90, best, bestV, worst, worstV}]
D.regionYear   // {years:[2015..2024], 东部:[...], 中部:[...], 西部:[...], 东北:[...], 全国:[...]}
D.levelDist    // {years:[...], 优:[...], 良:[...], 轻度污染:[...], ...}  ← 全国口径，百分比
D.medians      // {mean: 73.8, change: -15.5}   ← 四象限的分界值
D.meta         // {cities:367, years, mainYears, unit, regions}
D.kpi          // {cities, mean2015, mean2024, worst, improvedCities, worsenedCities, dropPct}

IX.byName['北京市']    // → 城市下标
getVal(ci, 2024)      // → AQI 值，无数据返回 undefined

state                 // {year, region, city, rankMode}
setState({...})       // 改状态并触发重绘（不要直接改 state 字段）

TH                    // 色板 / 等级 / aqi(v) / levelName(v)
base(option)          // 统一的背景、字体、tooltip 样式
axisX(data, extra)    // 类目轴
axisY(name, extra)    // 数值轴（必须传轴名）
init('c-xxx')         // 取/建 ECharts 实例
fmt1(v)               // 保留 1 位小数，null → '—'
hexA('#4c9aff', .3)   // 十六进制转 rgba
```

**约定**：每个图函数自己不接收参数，直接读 `state`。在函数末尾写 `init('c-xxx').setOption(base({...}), true)`，第二个参数 `true` 表示不合并旧配置（避免上一次的 series 残留）。

---

## 三、5 张图怎么写

### 04 最差 / 最优 20 城 — `chartRank()`

```js
function chartRank() {
  const y = state.year;
  const list = D.summary
    .map(s => ({ name: s.name, v: getVal(IX.byName[s.name], y) }))
    .filter(d => d.v != null)
    .sort((a, b) => state.rankMode === 'worst' ? b.v - a.v : a.v - b.v)
    .slice(0, 20)
    .reverse();                      // 反转，让最大值出现在顶部

  init('c-rank').setOption(base({
    grid: { left: 78, right: 56, top: 16, bottom: 24 },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: p => `${p[0].name}<br/>${y} 年 AQI：<b>${fmt1(p[0].value)}</b>　${TH.levelName(p[0].value)}`
    },
    xAxis: axisY('', { max: v => Math.ceil(v.max / 50) * 50 }),
    yAxis: axisX(list.map(d => d.name), { axisLabel: { color: TH.sub, fontSize: 11 } }),
    series: [{
      type: 'bar', barWidth: '62%',
      data: list.map(d => ({ value: d.v, itemStyle: { color: TH.aqi(d.v), borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: TH.sub, fontSize: 11, formatter: p => fmt1(p.value) }
    }]
  }), true);

  const ch = init('c-rank');
  ch.off('click');
  ch.on('click', p => setState({ city: p.name }));   // 点条形切详情
}
```

**验收**：拖年份，名字和长度一起变；点"北京市"的条形，右下详情切到北京。

> 想加"最差/最优"切换按钮的话：在 `index.html` 筛选条里加一个 button，点击时 `setState({rankMode:'best'})`，但要在 `main.js` 的 `subscribe` 里补一行 `chartRank()`，否则不会重绘。

---

### 05 年度箱线图 — `chartBox()`

ECharts 不算五数概括，自己算：

```js
function five(arr) {
  const a = [...arr].sort((x, y) => x - y);
  const q = p => {
    const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return +(a[lo] + (a[hi] - a[lo]) * (i - lo)).toFixed(1);
  };
  return [a[0], q(.25), q(.5), q(.75), a[a.length - 1]];
}

function chartBox() {
  const years = D.meta.mainYears;
  const data = years.map(y => five(
    D.long.filter(r => r[1] === y && (
      state.region === '全部' || D.cities[r[0]].region === state.region
    )).map(r => r[2])
  ));
  // ...（执行手册 4.1 的 option 可直接用，series.type = 'boxplot'）
}
```

**验收**：2015 的箱体明显高于 2024；上须逐年下压；tooltip 显示五数而不是 `[object Object]`。

---

### 06 等级结构 — `chartLevel()`

`D.levelDist` 是**全国口径**的百分比（每年 6 个等级占比，合计 100%）。如果用户切了区域，你有两个选择：

- **省事**：仍然画全国，标题里写清"全国口径"；
- **严谨**：按 `D.long` 自己重算该区域的占比 —— 推荐，代码不到 10 行：

```js
function levelDistByRegion(region) {
  const order = ['优', '良', '轻度污染', '中度污染', '重度污染', '严重污染'];
  const out = {}; order.forEach(k => out[k] = []);
  D.meta.mainYears.forEach(y => {
    const vs = D.long.filter(r => r[1] === y && (region === '全部' || D.cities[r[0]].region === region))
      .map(r => r[2]);
    const cnt = { }; order.forEach(k => cnt[k] = 0);
    vs.forEach(v => cnt[TH.levelName(v)]++);
    order.forEach(k => out[k].push(+(cnt[k] / vs.length * 100).toFixed(1)));
  });
  return { years: D.meta.mainYears, ...out };
}
```

堆叠柱的 `stack: 't'`、`yAxis.max: 100`、`axisLabel.formatter: '{value}%'`。

**验收**：每根柱子加起来 100%；2020 年"优"的占比跃升能读到；点图例能隐藏某一等级。

---

### 07 改善幅度排行 — `chartDelta()`

用 `D.summary` 的 `change` 字段（已经是 2015→2024 的变化率 %）。注意这张图**不随年份变**，所以它在 `main.js` 里只在首屏 `renderAll()` 调用，没进 `subscribe`——这是对的，别去改。

```js
function chartDelta() {
  const list = [...D.summary].sort((a, b) => a.change - b.change);   // 降幅最大在前
  const top = list.slice(0, 10), bottom = list.slice(-10).reverse();  // 头尾各 10，中间断开
  // 建议：用两组条形 + 中间省略号，或只画 top20（改善最多）
}
```

**验收**：能说出"降幅最大的是哪座城市、降了多少 %"；条形的正负分色（改善用青绿、恶化用红）。

---

### 09 四象限散点 — `chartQuad()`

横轴 `mean`（十年均值，越高越差），纵轴 `change`（变化率，越负越好）。分界值用 `D.medians.mean`（73.8）和 `D.medians.change`（-15.5）。

```js
const colors = { '高位恶化': '#ff7a7a', '高位改善': '#ffb547', '低位恶化': '#a78bfa', '低位改善': '#38c9a8' };
// series 按 quadrant 分 4 组，每组一个 scatter，方便图例开关
// markLine：xAxis = D.medians.mean，yAxis = D.medians.change，虚线
// tooltip 显示城市名 + 均值 + 变化率 + 类型
```

**验收**：四个象限各有城市；和田（高位恶化）在右上、三亚（低位改善）在左下；点一个点能切详情。

---

## 四、改完怎么验

1. `python -m http.server 8000` 打开页面，5 个虚线框应该全部变成真图；
2. 控制台无红色报错；
3. 拖年份 → 04 的条形跟着变，其余不该乱跳；
4. 切区域 → 05、06、09 的数据跟着变；
5. 点条形/散点 → 右下详情切换；
6. 把浏览器缩到 1000 px 宽 → 所有卡片变单列，图不重叠。

---

## 五、5 个已经踩过的坑（别再踩）

| 现象 | 原因 | 处理 |
|---|---|---|
| 整页空白、控制台 CORS 报错 | 双击了 `index.html` | 必须 `http://localhost` |
| 地图区一片空白但没报错 | `registerMap` 没执行完就画图 | 已在 `main.js` 里 `await loadGeo()`，别改加载顺序 |
| 折线末端标签不显示 | series 的 `symbol: 'none'` | 给个 `symbolSize: 3` 的小圆点，标签才会渲染 |
| 改了状态图不更新 | 没在 `subscribe` 里加你的函数 | 在 `main.js` 的 `subscribe` 中补 `chartXxx()` |
| 上一次的 series 还在 | `setOption` 默认是合并 | 第二个参数传 `true` |
