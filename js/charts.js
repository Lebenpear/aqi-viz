/* ============================================================
   charts.js —— 全部图表
   负责人：A 完成 01 / 02 / 03 / 08 / 10 + KPI；
          B 完成 04 / 05 / 06 / 07 / 09（本文件末尾已留好占位与接口）。
   约定：每个函数自己读全局 state，不接收参数；数据从 D / IX 取。
   ============================================================ */

/* ============================================================
   KPI 总览卡（A）
   四张卡回答四个问题：覆盖多少、变好多少、谁在变好、谁最差
   ============================================================ */
function renderKPI() {
  const k = D.kpi;
  const worstMean = (D.summary.find(s => s.name === k.worst) || {}).mean;
  const items = [
    { cls: '', k: '覆盖城市', v: k.cities, unit: '城',
      t: `2015—2024 共 <b>10</b> 个年份 · 3724 条记录` },
    { cls: 'good', k: '全国年均 AQI', v: k.mean2015, unit: '→ ' + k.mean2024,
      t: `累计下降 <b>${Math.abs(k.dropPct)}%</b>，但 2022 年后反弹` },
    { cls: '', k: '改善城市', v: k.improvedCities, unit: '/ 367',
      t: `另有 <b>${k.worsenedCities}</b> 城十年间反而变差` },
    { cls: 'bad', k: '长期最差', v: k.worst.replace(/地区|市$/, ''), unit: '',
      t: `十年均值 <b>${fmt1(worstMean)}</b>，是全国的 2.8 倍` }
  ];
  document.getElementById('kpi').innerHTML = items.map(it => `
    <div class="item ${it.cls}">
      <div class="k">${it.k}</div>
      <div class="v">${it.v}${it.unit ? `<small>${it.unit}</small>` : ''}</div>
      <div class="t">${it.t}</div>
    </div>`).join('');
}

/* ============================================================
   图 01 全国均值年度趋势（A）
   编码：位置（y）+ 折线斜率表达趋势；面积填充只为强化“下降”的方向感，
        不承载额外信息；2022 处用标注线把“拐点”直接说出来。
   ============================================================ */
function chartTrend() {
  const s = D.yearStats.filter(d => d.year >= 2015);   // 2014 覆盖率仅 44%，不进主线
  const years = s.map(d => d.year);
  const region = state.region;
  const series = [{
    name: '全国',
    type: 'line',
    smooth: 0.35,
    symbol: 'circle',
    symbolSize: 7,
    data: s.map(d => d.mean),
    lineStyle: { width: 3, color: TH.accent, shadowColor: hexA(TH.accent, .45), shadowBlur: 12, shadowOffsetY: 4 },
    itemStyle: { color: TH.accent, borderColor: '#0d1522', borderWidth: 2 },
    areaStyle: { color: vGrad(TH.accent, .30, 0) },
    label: {
      show: true, position: 'top', color: '#bcd2ee', fontSize: 11, distance: 8,
      offset: [10, 0],
      formatter: p => (p.dataIndex === 0 || p.dataIndex === s.length - 1) ? fmt1(p.value) : ''
    },
    markLine: {
      silent: true, symbol: 'none',
      lineStyle: { type: 'dashed', color: TH.warn, width: 1.2, opacity: .8 },
      // 竖向标注线的标签默认会跟着旋转，这里强制横排，否则要歪头看
      label: { formatter: '2022 起反弹', color: TH.warn, fontSize: 11, position: 'insideEndTop', rotate: 0, offset: [38, 0] },
      data: [{ xAxis: '2022' }]   // 类目轴上必须用字符串，写 2022 匹配不到
    },
    // 试过给 2022—2024 加浅色底纹，深色底上会变成一块灰方块，反而像 UI 残留；
    // 只保留标注线 + 文字，信息一样清楚
    markArea: { silent: true, data: [] }
  }];

  // 选了区域就把该区域叠上来对比，避免“筛选了却看不出差别”
  if (region !== '全部') {
    series.push({
      name: region,
      type: 'line',
      smooth: 0.35,
      symbol: 'circle',
      symbolSize: 5,
      data: D.regionYear[region],
      lineStyle: { width: 2, type: 'dashed', color: TH.warn },
      itemStyle: { color: TH.warn },
      z: 4
    });
  }

  init('c-trend').setOption(base({
    grid: { left: 58, right: 34, top: 40, bottom: 30 },
    legend: region === '全部' ? { show: false } : {
      top: 2, right: 6, itemWidth: 14, itemHeight: 8,
      textStyle: { color: TH.sub, fontSize: 11 }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: TH.line2 } },
      formatter: ps => {
        const y = ps[0].axisValue;
        const st = D.yearStats.find(d => d.year === +y) || {};
        return `<b>${y} 年</b><br/>` +
          ps.map(p => `${p.marker}${p.seriesName}：<b>${fmt1(p.value)}</b>`).join('<br/>') +
          (st.n ? `<br/><span style="color:#6b7f9e">样本 ${st.n} 城 · 中位 ${fmt1(st.median)}</span>` : '');
      }
    },
    xAxis: axisX(years, { boundaryGap: false }),
    yAxis: axisY('AQI 年均值', { min: 55, max: 95, interval: 10 }),
    series
  }), true);
}

/* ============================================================
   图 02 城市分布地图（A）
   技术决策：367 城里含 30 个县级市，地级市边界对不上；
            改用「省级底图 + 经纬度气泡」，零匹配风险，且能同时表达
            “在哪里”（位置）和“多严重”（大小+颜色）两个维度。
   ============================================================ */
const REGION_VIEW = {
  '全部': { center: null, zoom: 1.0 },
  '东部': { center: [117.6, 31.5], zoom: 1.9 },
  '中部': { center: [112.8, 31.0], zoom: 1.9 },
  '西部': { center: [95.0, 36.0], zoom: 1.25 },
  '东北': { center: [126.2, 46.4], zoom: 2.0 }
};

function chartMap() {
  const ch = init('c-map');
  if (!GEO_OK) {
    ch.setOption({
      graphic: [{
        type: 'text', left: 'center', top: 'middle',
        style: {
          text: '地图数据未加载\n请用 http:// 打开（python -m http.server），不要双击 html',
          fill: '#ff9a9a', font: '13px "Microsoft YaHei"', lineHeight: 24, align: 'center'
        }
      }]
    }, true);
    return;
  }

  const y = state.year;
  const pts = D.cities.map((c, i) => ({
    name: c.name,
    province: c.province,
    region: c.region,
    value: [c.lon, c.lat, getVal(i, y)]
  })).filter(p => p.value[2] != null && (state.region === '全部' || p.region === state.region));

  // 标注当前年份最差的 3 个城市：不标名字读者只能猜；
  // 但喀什与克孜勒苏只差 0.3°，标签会叠死，所以按“经纬度间隔”去重后再取
  const picked = [];
  [...pts].sort((a, b) => b.value[2] - a.value[2]).forEach(p => {
    if (picked.length >= 3) return;
    const far = picked.every(q =>
      Math.abs(q.value[0] - p.value[0]) > 1.4 || Math.abs(q.value[1] - p.value[1]) > 1.2);
    if (far) picked.push(p);
  });
  const topNames = picked.map(p => p.name);
  const shortName = n => n.replace(/(维吾尔|壮族|回族|藏族羌族|藏族|苗族侗族|布依族苗族|哈尼族彝族|白族|傣族|土家族苗族|蒙古族藏族|柯尔克孜|自治州|地区|市)$/g, '') || n;
  const data = pts.map(p => topNames.includes(p.name)
    ? { ...p, label: { show: true, formatter: shortName(p.name), position: 'right', color: '#ffd0d0', fontSize: 10, distance: 5, fontWeight: 600 } }
    : p);

  const v = REGION_VIEW[state.region] || REGION_VIEW['全部'];

  ch.setOption(base({
    grid: { left: 0, right: 0, top: 0, bottom: 0 },
    geo: [
      {
        map: 'china_main',
        roam: true,
        zoom: v.zoom,
        center: v.center || undefined,
        layoutCenter: ['50%', '51%'],
        layoutSize: '120%',
        scaleLimit: { min: 0.9, max: 14 },
        itemStyle: { areaColor: '#101c2e', borderColor: '#2b3d5c', borderWidth: .8 },
        emphasis: {
          itemStyle: { areaColor: '#182a44' },
          label: { show: true, color: '#cfe0f5', fontSize: 10 }
        },
        select: { disabled: true }
      },
      {
        // 南海诸岛附图：贴在右下角，行为上不可交互，只保证地图完整
        map: 'china_south',
        right: 20, bottom: 18, width: 68, height: 84,
        silent: true,
        itemStyle: { areaColor: 'rgba(16,28,46,.55)', borderColor: '#3a5478', borderWidth: 1 },
        emphasis: { disabled: true },
        z: 3
      }
    ],
    // 分级而不是连续渐变：颜色直接对应国标等级，读者不用心算色阶
    visualMap: {
      type: 'piecewise',
      orient: 'horizontal',
      left: 14, bottom: 12,
      itemWidth: 15, itemHeight: 9, itemGap: 8,
      textStyle: { color: TH.sub, fontSize: 10 },
      itemSymbol: 'roundRect',
      pieces: [
        { lte: 50, label: '优 ≤50', color: '#38c9a8' },
        { gt: 50, lte: 100, label: '良 50–100', color: '#8fd15c' },
        { gt: 100, lte: 150, label: '轻度 100–150', color: '#ffb547' },
        { gt: 150, lte: 200, label: '中度 150–200', color: '#ff7a7a' },
        { gt: 200, label: '重度 >200', color: '#c0392b' }
      ],
      outOfRange: { color: '#2b3d5c' }
    },
    tooltip: {
      formatter: p => {
        if (p.componentSubType !== 'scatter') return p.name || '';
        const val = p.value[2];
        return `<b>${p.name}</b><br/>` +
          `<span style="color:#6b7f9e">${p.data.province} · ${p.data.region}</span><br/>` +
          `${state.year} 年 AQI：<b style="color:${TH.aqi(val)}">${fmt1(val)}</b>` +
          `　<span style="color:${TH.aqi(val)}">${TH.levelName(val)}</span>`;
      }
    },
    // 南海诸岛附图的边框：外扩 4px，视觉上成为独立小图
    graphic: [{
      type: 'rect', right: 16, bottom: 14, z: 4, silent: true,
      shape: { width: 76, height: 92, r: 3 },
      style: { fill: 'none', stroke: 'rgba(58,84,120,.5)', lineWidth: 1 }
    }, {
      type: 'text', right: 20, bottom: 108, z: 4, silent: true,
      style: { text: '南海诸岛', fill: TH.dim, font: '9px "Microsoft YaHei"' }
    }],
    series: [{
      name: '城市',
      type: 'scatter',
      coordinateSystem: 'geo',
      data: data,
      symbolSize: val => 3 + Math.sqrt(val[2]) * 0.92,   // 面积感知：按数值开根号
      itemStyle: { opacity: .86, borderColor: '#0d1522', borderWidth: .6 },
      emphasis: {
        scale: 1.8,
        itemStyle: { opacity: 1, borderColor: '#fff', borderWidth: 1 },
        label: { show: true, formatter: '{b}', position: 'right', color: '#fff', fontSize: 11 }
      },
      labelLayout: { hideOverlap: true },   // 新疆三个地区挨得近，标签自动避让
      z: 5
    }]
  }), true);

  ch.off('click');
  ch.on('click', p => {
    if (p.componentSubType === 'scatter') setState({ city: p.name });
  });
}

/* ============================================================
   图 03 四大区域小倍数趋势（A）
   编码：多线共用一套坐标（不是真的小倍数，是为了直接比较斜率）；
        线末端直接标“区域名 + 数值”，省掉图例来回对照。
   ============================================================ */
function chartRegion() {
  const R = D.regionYear, years = R.years;
  const regions = ['东部', '中部', '西部', '东北'];
  const focus = state.region;

  const series = regions.map((r, i) => {
    const dim = focus !== '全部' && focus !== r;
    const lastI = R[r].length - 1;
    // 末端标签：直接在最后一个点上标“区域名 + 数值”，省掉图例对照。
    // 东部 68.8 与西部 70.3 只差 1.5 AQI，标签会叠在一起，所以各自给一个像素级纵向偏移。
    const dy = { '东部': 13, '中部': 0, '西部': 0, '东北': 6 }[r] || 0;
    return {
      name: r,
      type: 'line',
      smooth: 0.35,
      symbol: 'circle',
      symbolSize: 5,
      data: R[r].map((v, k) => k === lastI ? {
        value: v,
        label: {
          // 聚焦某区域时，其余线只保留形状，末端不再标字，右侧才不会挤成一团
          show: !dim, position: 'right', distance: 7, offset: [0, dy],
          formatter: `${r} ${fmt1(v)}`,
          color: TH.palette[i], fontSize: 11, fontWeight: 600
        }
      } : v),
      lineStyle: { width: dim ? 1.4 : 2.6, color: TH.palette[i], opacity: dim ? .28 : 1 },
      itemStyle: { color: TH.palette[i], opacity: dim ? .3 : 1 },
      emphasis: { focus: 'series' },
      z: dim ? 2 : 4
    };
  });

  series.push({
    name: '全国',
    type: 'line',
    // 全国只是参照线，末端不再标字：右端已有 4 个区域标签，
    // 再加一个会和“西部 70.3”贴在一起；数值交给图例和 tooltip
    data: R['全国'],
    symbol: 'circle', symbolSize: 3,     // 有 symbol 末点标签才会渲染
    itemStyle: { color: TH.sub },
    lineStyle: { width: 1.8, type: 'dashed', color: TH.sub, opacity: .75 },
    z: 1
  });

  init('c-region').setOption(base({
    grid: { left: 50, right: 72, top: 54, bottom: 28 },
    legend: { top: 8, left: 0, itemWidth: 12, itemHeight: 8, itemGap: 14, textStyle: { color: TH.sub, fontSize: 11 } },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: TH.line2 } },
      formatter: ps => `<b>${ps[0].axisValue} 年</b><br/>` +
        ps.map(p => `${p.marker}${p.seriesName}：<b>${fmt1(p.value)}</b>`).join('<br/>')
    },
    xAxis: axisX(years, { boundaryGap: false }),
    yAxis: axisY('AQI 年均值', { min: 50, max: 95, interval: 10 }),
    series
  }), true);
}

/* ============================================================
   图 08 城市 × 年份热力图（A）
   编码：行=城市（按十年均值从差到好排序），列=年份，颜色=AQI。
        367 行必须配 dataZoom，否则每行不到 1 px，等于没画。
   ============================================================ */
function chartHeat() {
  const list = [...D.summary]
    .filter(s => state.region === '全部' || (D.cities[IX.byName[s.name]] || {}).region === state.region)
    .sort((a, b) => b.mean - a.mean);
  const years = D.meta.mainYears;
  const data = [];

  list.forEach((s, yi) => {
    const ci = IX.byName[s.name];
    years.forEach((y, xi) => {
      const v = getVal(ci, y);
      // 缺失格用哨兵 -1 送进 visualMap 的 outOfRange，画成浅灰而不是留黑；
      // 留黑会被读成“AQI 极低”，恰好和事实相反
      data.push([xi, yi, v == null ? -1 : v]);
    });
  });

  // 初始只显示最差的约 20 行，其余靠滚动查看；一屏塞 367 行会糊成一条
  const endPct = Math.min(100, (20 / Math.max(list.length, 1)) * 100);

  init('c-heat').setOption(base({
    grid: { left: 92, right: 44, top: 22, bottom: 58 },
    tooltip: {
      formatter: p => {
        const s = list[p.value[1]]; if (!s) return '';
        const val = p.value[2];
        if (val < 0) return `<b>${s.name}</b> · ${years[p.value[0]]}<br/>` +
          `<span style="color:#93a4bf">当年无有效值</span>（原值异常，清洗时置空、未做填补）`;
        return `<b>${s.name}</b> · ${years[p.value[0]]}<br/>` +
          `AQI <b style="color:${TH.aqi(val)}">${fmt1(val)}</b>　` +
          `<span style="color:${TH.aqi(val)}">${TH.levelName(val)}</span>`;
      }
    },
    xAxis: axisX(years, { position: 'top', splitArea: { show: false }, axisLabel: { color: TH.sub, fontSize: 11 } }),
    yAxis: axisX(list.map(s => s.name), {
      type: 'category',
      inverse: true,
      axisLabel: {
        color: TH.sub, fontSize: 10, margin: 8,
        // 克孜勒苏柯尔克孜自治州这种 12 字的名字会把轴挤爆，统一截到 6 字
        formatter: v => (v.length > 7 ? v.slice(0, 6) + '…' : v)
      },
      axisTick: { show: false },
      axisLine: { show: false }
    }),
    dataZoom: [
      { type: 'inside', yAxisIndex: 0, start: 0, end: endPct, zoomOnMouseWheel: true, moveOnMouseMove: true },
      {
        type: 'slider', yAxisIndex: 0, right: 6, width: 9,
        start: 0, end: endPct,
        fillerColor: 'rgba(76,154,255,.22)',
        borderColor: 'transparent',
        backgroundColor: 'rgba(147,164,191,.06)',
        handleSize: '70%',
        showDetail: false,
        textStyle: { color: TH.sub, fontSize: 9 }
      }
    ],
    visualMap: {
      type: 'continuous',
      min: 20, max: 240,          // 上限取到和田 (238)，否则超标格子会掉进 outOfRange 变成近黑块
      calculable: false,
      orient: 'horizontal',
      left: 'center', bottom: 4,
      itemWidth: 12, itemHeight: 128,
      text: ['污染重', '清洁'],
      textStyle: { color: TH.sub, fontSize: 10 },
      inRange: { color: TH.ramp },
      outOfRange: { color: 'rgba(147,164,191,.20)' }   // 仅 -1（缺失）会走到这里
    },
    series: [{
      name: 'AQI',
      type: 'heatmap',
      data: data,
      progressive: 1200,
      itemStyle: { borderColor: 'rgba(13,21,34,.55)', borderWidth: .4 },
      emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 1 } }
    }]
  }), true);
}

/* ============================================================
   图 10 城市详情（A）
   编码：单城十年折线 + 等级色带。
        “这座城市常年在哪一档”比“它今年多少”更有信息量，
        所以底色不是装饰，是把国标等级刻度画进图里。
   ============================================================ */
function chartDetail() {
  const ci = IX.byName[state.city];
  const ch = init('c-detail');
  const note = document.getElementById('detail-note');

  if (ci == null) {
    ch.clear();
    note.textContent = '未找到该城市，请从下拉提示中选择。';
    return;
  }

  const years = D.meta.mainYears;
  const vals = years.map(y => getVal(ci, y));
  const s = D.summary.find(x => x.name === state.city) || {};
  const valid = vals.filter(v => v != null);

  if (!valid.length) {
    ch.clear();
    note.textContent = `${state.city} 在 2015—2024 年间没有有效记录。`;
    return;
  }

  const maxV = Math.max(...valid);
  const top = Math.max(150, Math.ceil((maxV * 1.12) / 50) * 50);   // 上限取 50 的整数倍，刻度才整齐

  ch.setOption(base({
    grid: { left: 48, right: 20, top: 30, bottom: 26 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: TH.line2 } },
      formatter: ps => {
        const p = ps[0], v = p.value;
        if (v == null) return `${p.axisValue} 年：无数据`;
        return `<b>${p.axisValue} 年</b><br/>AQI <b style="color:${TH.aqi(v)}">${fmt1(v)}</b>　` +
          `<span style="color:${TH.aqi(v)}">${TH.levelName(v)}</span>`;
      }
    },
    xAxis: axisX(years, { boundaryGap: false }),
    yAxis: axisY('AQI 年均值', { min: 0, max: top, interval: 50 }),
    series: [{
      name: state.city,
      type: 'line',
      smooth: 0.3,
      connectNulls: true,
      symbol: 'circle',
      symbolSize: 7,
      data: vals.map((v, i) => ({
        value: v,
        itemStyle: v == null ? {} : { color: TH.aqi(v), borderColor: '#0d1522', borderWidth: 2 },
        label: (i === 0 || i === vals.length - 1) && v != null ? {
          show: true,
          position: i === 0 ? 'bottom' : 'top',
          distance: 7,
          formatter: fmt1(v),
          color: '#dbe7f7', fontSize: 11, fontWeight: 600
        } : { show: false }
      })),
      lineStyle: { width: 2.6, color: TH.accent },
      areaStyle: { color: vGrad(TH.accent, .16, 0) },
      markLine: {
        silent: true, symbol: 'none',
        label: { position: 'insideEndTop', fontSize: 9, color: TH.dim },
        data: [
          { yAxis: 50,  lineStyle: { color: hexA('#38c9a8', .45), type: 'dashed' }, label: { formatter: '优 50' } },
          { yAxis: 100, lineStyle: { color: hexA('#8fd15c', .45), type: 'dashed' }, label: { formatter: '良 100' } },
          { yAxis: 150, lineStyle: { color: hexA('#ffb547', .45), type: 'dashed' }, label: { formatter: '轻度 150' } },
          { yAxis: 200, lineStyle: { color: hexA('#ff7a7a', .45), type: 'dashed' }, label: { formatter: '中度 200' } }
        ].filter(d => d.yAxis <= top)
      }
    }]
  }), true);

  // 图下的一句话结论：把数字翻译成判断，展示时直接照着念
  const first = vals[0], last = vals[vals.length - 1];
  const lvl = TH.levelName(s.mean);
  let txt;
  if (first != null && last != null) {
    const d = ((last - first) / first) * 100;
    const trend = d < -1 ? `下降 <b style="color:#7fe0c8">${Math.abs(d).toFixed(1)}%</b>`
      : d > 1 ? `上升 <b style="color:#ff9a9a">${d.toFixed(1)}%</b>` : '基本持平';
    txt = `${state.city}：2015 年 ${fmt1(first)} → 2024 年 ${fmt1(last)}，十年${trend}；` +
      `十年均值 ${fmt1(s.mean)}，长期处在「${lvl}」档。`;
  } else {
    txt = `${state.city}：十年均值 ${fmt1(s.mean)}，长期处在「${lvl}」档。`;
  }
  note.innerHTML = txt + '　横向虚线为国标等级分界。';
}

/* ============================================================
   图 04—07、09（B）
   本轮修复：等级统计口径、区域联动、点击交互、排行可读性、
             恶化侧缺失、四象限定义与配色
   ============================================================ */

/* 城市名太长会把类目轴挤爆：去掉行政区后缀，只留地名 */
const axisName = n => {
  const t = shortCity(n);
  return t.length > 6 ? t.slice(0, 5) + '…' : t;
};
const shortCity = n => (n || '').replace(
  /(维吾尔|壮族|回族|藏族羌族|藏族|苗族侗族|布依族苗族|哈尼族彝族|白族|傣族|土家族苗族|蒙古族藏族|柯尔克孜|哈萨克|自治州|地区|市|盟)$/g, ''
) || n;

/* 图注随筛选变化：写死的“2024 年 337 城”在切到东北 2015 时就是假话 */
function setNote(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

/* 区域过滤：所有 B 图共用，避免各处重复写 IX.byName 查找 */
const inRegion = (name, region) =>
  region === '全部' || ((D.cities[IX.byName[name]] || {}).region === region);

/* ------------------------------------------------------------
   图 04 最优 / 最差 20 城
   编码：两张并排的横向条形，左“最优”右“最差”。
        竖柱 + 45° 斜排名字在 6 栏卡里必然糊成一片，横置后一行一城，
        名字左对齐直接可读；两组分开画，读者一眼看出差距是几倍。
   ------------------------------------------------------------ */
function chartRank() {
  const year = state.year, region = state.region;
  const pool = D.summary.filter(s =>
    inRegion(s.name, region) && getVal(IX.byName[s.name], year) != null);

  /* 东北只有 37 城：写死 20+20 会让 3 座城市重复上榜，按城市数收缩 */
  const n = Math.min(20, Math.floor(pool.length / 2));
  if (n < 1) return;

  const asc = [...pool].sort((a, b) =>
    getVal(IX.byName[a.name], year) - getVal(IX.byName[b.name], year));
  const best = asc.slice(0, n);
  const worst = asc.slice(-n).reverse();     // 最差排在最上面

  const pack = arr => arr.map(s => {
    const v = getVal(IX.byName[s.name], year);
    return { name: s.name, value: v, itemStyle: { color: TH.aqi(v) } };
  });

  /* 多网格时每个轴必须显式声明 gridIndex，否则所有轴都默认挂到 grid 0 上重叠 */
  const catAxis = (arr, gi) => ({
    gridIndex: gi,
    type: 'category',
    inverse: true,
    data: arr.map(s => s.name),
    axisTick: { show: false },
    axisLine: { show: false },
    axisLabel: { color: TH.sub, fontSize: 9, margin: 6, formatter: axisName }
  });
  const valAxis = (max, gi) => ({
    gridIndex: gi,
    type: 'value',
    max: Math.max(50, Math.ceil(max * 1.14 / 50) * 50),
    axisLine: { show: false }, axisTick: { show: false },
    splitLine: { lineStyle: { color: TH.line, type: 'dashed' } },
    axisLabel: { show: true, color: TH.dim, fontSize: 8, margin: 4 }
  });

  const barLabel = {
    show: true, position: 'right', distance: 3,
    color: '#bcd2ee', fontSize: 9, formatter: p => fmt1(p.value)
  };
  const ch = init('c-rank');
  ch.setOption(base({
    grid: [
      { left: 66, right: '54%', top: 44, bottom: 26 },
      { left: '59%', right: 26, top: 44, bottom: 26 }
    ],
    graphic: [
      { type: 'text', left: 66, top: 20, silent: true,
        style: { text: `最优 ${n} 城（AQI 最低）`, fill: TH.good, font: '600 11px "Microsoft YaHei"' } },
      { type: 'text', left: '59%', top: 20, silent: true,
        style: { text: `最差 ${n} 城（AQI 最高）`, fill: TH.bad, font: '600 11px "Microsoft YaHei"' } }
    ],
    tooltip: {
      trigger: 'item',
      formatter: p => {
        const ci = IX.byName[p.name];
        const c = D.cities[ci] || {};
        const v = p.value;
        return `<b>${p.name}</b><br/>` +
          `<span style="color:#6b7f9e">${c.province || ''} · ${c.region || ''}</span><br/>` +
          `${year} 年 AQI <b style="color:${TH.aqi(v)}">${fmt1(v)}</b>　` +
          `<span style="color:${TH.aqi(v)}">${TH.levelName(v)}</span><br/>` +
          `<span style="color:#6b7f9e">点击查看该城市十年详情</span>`;
      }
    },
    xAxis: [
      valAxis(Math.max(...best.map(s => getVal(IX.byName[s.name], year))), 0),
      valAxis(Math.max(...worst.map(s => getVal(IX.byName[s.name], year))), 1)
    ],
    yAxis: [catAxis(best, 0), catAxis(worst, 1)],
    series: [
      { name: '最优', type: 'bar', xAxisIndex: 0, yAxisIndex: 0, barWidth: '66%',
        data: pack(best), label: barLabel, emphasis: { itemStyle: { opacity: .85 } } },
      { name: '最差', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, barWidth: '66%',
        data: pack(worst), label: barLabel, emphasis: { itemStyle: { opacity: .85 } } }
    ]
  }), true);

  const bMax = getVal(IX.byName[best[best.length - 1].name], year);
  const wMin = getVal(IX.byName[worst[worst.length - 1].name], year);
  const wMax = getVal(IX.byName[worst[0].name], year);
  setNote('n-rank',
    `${year} 年${region === '全部' ? '全国' : region}最优 ${n} 城全部在 ${fmt1(bMax)} 以下，` +
    `最差 ${n} 城全部在 ${fmt1(wMin)} 以上，最高 ${worst[0].name} ${fmt1(wMax)}——` +
    `相差 ${(wMax / bMax).toFixed(1)} 倍。左右两栏刻度不同，条形长度只在栏内比较。`);

  ch.off('click');
  ch.on('click', p => { if (p.name) focusCity(p.name); });
}

/* ------------------------------------------------------------
   图 05 年度分布箱线
   编码：箱体表达四分位，须线表达极值。
        纵轴从 0 起会把 8 个点的位移压平，而这图的核心结论就是“箱体下移”，
        所以底端按数据下沿留白，而不是从 0 起。
   ------------------------------------------------------------ */
function chartBox() {
  const years = D.meta.mainYears;
  const region = state.region;
  const boxData = [];
  let lo = Infinity;

  years.forEach(y => {
    const vals = D.cities
      .filter(c => region === '全部' || c.region === region)
      .map(c => getVal(IX.byName[c.name], y))
      .filter(v => v != null)
      .sort((a, b) => a - b);
    if (!vals.length) { boxData.push(null); return; }
    /* 线性插值分位数（type-7），与 pandas/Excel 的 QUARTILE 一致；
       直接取 vals[floor(n*p)] 会在偶数样本上偏高，中位数能差 1 个点 */
    const q = p => {
      const pos = (vals.length - 1) * p;
      const i = Math.floor(pos), j = Math.ceil(pos);
      return vals[i] + (vals[j] - vals[i]) * (pos - i);
    };
    const min = vals[0];
    lo = Math.min(lo, min);
    boxData.push([min, q(.25), q(.5), q(.75), vals[vals.length - 1]]);
  });

  const yMin = Math.max(0, Math.floor((lo - 6) / 10) * 10);

  const m15 = boxData[0] ? boxData[0][2] : null;
  const m24 = boxData[boxData.length - 1] ? boxData[boxData.length - 1][2] : null;
  if (m15 != null && m24 != null) {
    const d = m15 - m24;
    setNote('n-box',
      `${region === '全部' ? '全国' : region}中位数 ${fmt1(m15)} → ${fmt1(m24)}，` +
      `${d >= 0 ? '降' : '升'} ${fmt1(Math.abs(d))}；箱体高度（中间 50% 的跨度）` +
      `${boxData[boxData.length - 1][3] - boxData[boxData.length - 1][1] <
        boxData[0][3] - boxData[0][1] ? '收窄' : '基本持平'}，说明离散度在${d >= 0 ? '下降' : '上升'}。`);
  }

  init('c-box').setOption(base({
    grid: { left: 56, right: 30, top: 30, bottom: 34 },
    tooltip: {
      trigger: 'item',
      formatter: p => {
        if (!p.data) return '';
        /* ECharts 5 的 boxplot，p.data 有时带前导的类目下标，这里两种都兼容 */
        const d = p.data.length === 6 ? p.data.slice(1) : p.data;
        return `<b>${p.name} 年</b><br/>` +
          `最大 ${fmt1(d[4])}　Q3 ${fmt1(d[3])}<br/>` +
          `中位 <b>${fmt1(d[2])}</b>　Q1 ${fmt1(d[1])}<br/>` +
          `最小 ${fmt1(d[0])}`;
      }
    },
    xAxis: axisX(years, { axisLabel: { color: TH.sub, fontSize: 10 } }),
    yAxis: axisY('AQI', { min: yMin, splitNumber: 5 }),
    series: [{
      name: '分布',
      type: 'boxplot',
      data: boxData,
      boxWidth: [10, 26],
      itemStyle: { color: 'rgba(76,154,255,.30)', borderColor: TH.accent, borderWidth: 1.2 },
      emphasis: { itemStyle: { color: 'rgba(76,154,255,.55)', borderColor: '#9cc4ff' } }
    }]
  }), true);
}

/* ------------------------------------------------------------
   图 06 等级结构（环形饼）
   编码：扇形面积 = 城市数量。
        坑点：TH.levelName() 返回“轻度污染”这类全称，计数器 key 若写“轻度”
        就永远匹配不上，轻度以上会被整片吞掉——2015 年能丢 59 城。
   ------------------------------------------------------------ */
function chartLevel() {
  const year = state.year, region = state.region;
  const cnt = {};
  TH.levels.forEach(l => { cnt[l.name] = 0; });
  let total = 0;

  D.cities.forEach(c => {
    if (region !== '全部' && c.region !== region) return;
    const v = getVal(IX.byName[c.name], year);
    if (v == null) return;
    const lv = TH.levelName(v);
    if (cnt[lv] === undefined) cnt[lv] = 0;
    cnt[lv]++; total++;
  });

  /* 0 值扇区会退化成一撮重叠的标签，先滤掉，由图例兜住 */
  const pie = TH.levels
    .map(l => ({ name: l.name, value: cnt[l.name] || 0, color: l.color }))
    .filter(d => d.value > 0)
    .map(d => ({ name: d.name, value: d.value, itemStyle: { color: d.color } }));

  const good = (cnt['优'] || 0) + (cnt['良'] || 0);
  const non = total - good;
  setNote('n-level',
    `${year} 年${region === '全部' ? '全国' : region} ${total} 城有监测数据，` +
    `优良 ${good} 城（${total ? (good / total * 100).toFixed(0) : 0}%），非优良 ${non} 城。` +
    `${region === '全部' ? '对照 2015 年：非优良 59 城。' : ''}`);

  init('c-level').setOption(base({
    tooltip: {
      trigger: 'item',
      formatter: p => `${p.name}　<b>${p.value}</b> 城　${p.percent}%`
    },
    legend: {
      bottom: 4, left: 'center', itemWidth: 10, itemHeight: 8, itemGap: 9,
      textStyle: { color: TH.sub, fontSize: 10 },
      formatter: nm => `${nm} ${cnt[nm]}`
    },
    graphic: [
      { type: 'text', left: 'center', top: '38%', silent: true,
        style: { text: String(total), fill: '#e8eef8', font: '600 20px "Microsoft YaHei"', textAlign: 'center' } },
      { type: 'text', left: 'center', top: '47%', silent: true,
        style: { text: '城有监测数据', fill: TH.dim, font: '10px "Microsoft YaHei"', textAlign: 'center' } }
    ],
    series: [{
      name: '等级',
      type: 'pie',
      radius: ['44%', '66%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      label: {
        color: TH.sub, fontSize: 10, lineHeight: 14,
        formatter: p => p.percent >= 3 ? `${p.name}\n${p.percent}%` : ''
      },
      labelLine: { length: 6, length2: 10, lineStyle: { color: TH.line2 } },
      labelLayout: { hideOverlap: true },
      data: pie
    }]
  }), true);
}

/* ------------------------------------------------------------
   图 07 十年改善 / 恶化对照
   编码：双向横向条形，右绿=改善、左红=恶化，零轴居中。
        文档要求“绿色改善、红色恶化”，只画改善 Top20 会全绿、
        等于把 68 座恶化城市藏起来。横向同样解决城市名拥挤。
   ------------------------------------------------------------ */
function chartDelta() {
  const region = state.region;
  const rows = D.summary.filter(s => {
    if (!inRegion(s.name, region)) return false;
    const ci = IX.byName[s.name];
    return getVal(ci, 2015) != null && getVal(ci, 2024) != null;
  }).map(s => {
    const ci = IX.byName[s.name];
    return { name: s.name, d: getVal(ci, 2015) - getVal(ci, 2024) };   // 正值 = 改善
  });

  const up = rows.filter(r => r.d > 0).sort((a, b) => b.d - a.d).slice(0, 10);
  const down = rows.filter(r => r.d < 0).sort((a, b) => a.d - b.d).slice(0, 10);
  const list = [...up, ...down];        // 改善在上、恶化在下
  if (!list.length) return;

  const span = Math.max(10, Math.ceil(Math.max(...list.map(r => Math.abs(r.d))) * 1.16 / 10) * 10);

  const upSum = up.reduce((a, r) => a + r.d, 0);
  const downSum = down.reduce((a, r) => a + r.d, 0);
  const badCnt = rows.filter(r => r.d < 0).length;
  setNote('n-delta',
    `改善最多的 ${up.length} 城合计降 ${Math.round(upSum)} 分，恶化最多的 ${down.length} 城合计升 ` +
    `${Math.round(Math.abs(downSum))} 分；${region === '全部' ? '全国' : region}仍有 ${badCnt} 城在恶化。`);

  init('c-delta').setOption(base({
    grid: { left: 84, right: 36, top: 30, bottom: 30 },
    tooltip: {
      trigger: 'item',
      formatter: p => {
        const d = p.value;
        return `<b>${p.name}</b><br/>` +
          `${d >= 0 ? '下降' : '上升'} <b style="color:${d >= 0 ? TH.good : TH.bad}">${fmt1(Math.abs(d))}</b> 分` +
          `<br/><span style="color:#6b7f9e">2015 → 2024 年均值差值</span>`;
      }
    },
    xAxis: {
      type: 'value', min: -span, max: span,
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: TH.line, type: 'dashed' } },
      axisLabel: { color: TH.sub, fontSize: 9, formatter: v => Math.abs(v) }
    },
    yAxis: {
      type: 'category', inverse: true,
      data: list.map(r => r.name),
      axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { color: TH.sub, fontSize: 9, margin: 6, formatter: axisName }
    },
    series: [{
      name: '改善幅度',
      type: 'bar',
      barWidth: '60%',
      data: list.map(r => ({
        value: r.d,
        itemStyle: { color: r.d >= 0 ? TH.good : TH.bad, opacity: .88 },
        label: {
          show: true, position: r.d >= 0 ? 'right' : 'left', distance: 3,
          formatter: () => fmt1(Math.abs(r.d)),
          color: r.d >= 0 ? '#7fe0c8' : '#ffb0b0', fontSize: 9
        }
      })),
      labelLayout: { hideOverlap: true },
      markLine: {
        silent: true, symbol: 'none',
        lineStyle: { color: '#3b4d68', width: 1 },
        label: { show: false },
        data: [{ xAxis: 0 }]
      }
    }]
  }), true);
}

/* ------------------------------------------------------------
   图 09 城市类型：初始污染 × 改善幅度
   编码：X = 2015 年 AQI（高/低位），Y = 2015→2024 下降分值（改善/恶化），
        点径 = 十年波动（标准差）。四象限 = 高低 × 改善恶化。
        配色回到文档约定：改善两档用绿、恶化两档用红。
   ------------------------------------------------------------ */
function chartQuad() {
  const region = state.region;
  const pool = D.summary.filter(s => {
    if (!inRegion(s.name, region)) return false;
    const ci = IX.byName[s.name];
    return getVal(ci, 2015) != null && getVal(ci, 2024) != null;
  }).map(s => {
    const ci = IX.byName[s.name];
    const y15 = getVal(ci, 2015), y24 = getVal(ci, 2024);
    return { name: s.name, x: y15, y: +(y15 - y24).toFixed(1), y24, std: s.std || 0 };
  });
  if (!pool.length) return;

  const xs = pool.map(p => p.x).sort((a, b) => a - b);
  const mid = xs[Math.floor(xs.length / 2)];

  const Q = ['高位改善', '低位改善', '高位恶化', '低位恶化'];
  const COL = { '高位改善': '#2fbf9a', '低位改善': '#8fd15c', '高位恶化': '#c0392b', '低位恶化': '#ff7a7a' };
  const tag = p => (p.x > mid ? '高位' : '低位') + (p.y >= 0 ? '改善' : '恶化');

  const series = Q.map(q => ({
    name: q,
    type: 'scatter',
    data: pool.filter(p => tag(p) === q).map(p => [p.x, p.y, p.std, p.name, p.y24]),
    symbolSize: d => Math.max(5, Math.min(19, 5 + d[2] * 0.55)),
    itemStyle: { color: COL[q], opacity: .78, borderColor: 'rgba(13,21,34,.5)', borderWidth: .5 },
    emphasis: {
      scale: 1.35,
      label: { show: true, formatter: p => p.data[3], position: 'top', color: '#fff', fontSize: 10 }
    }
  }));

  /* 参考线单独挂一条空 series：直接写在有数据的 series 上，
     当该象限恰好没有城市时线就不见了；legend.data 只列 Q，不会多出图例项 */
  series.push({
    name: '__ref', type: 'scatter', data: [], silent: true, symbol: 'none',
    markLine: {
      silent: true, symbol: 'none',
      lineStyle: { color: '#3b4d68', type: 'dashed', width: 1 },
      data: [
        { xAxis: mid, label: { formatter: `2015 中位数 ${Math.round(mid)}`, position: 'insideMiddleTop',
          rotate: 0, offset: [0, -6], color: TH.dim, fontSize: 9 } },
        { yAxis: 0, label: { formatter: '零改善', position: 'insideEndTop',
          rotate: 0, offset: [0, -2], color: TH.dim, fontSize: 9 } }
      ]
    }
  });

  const cntQ = {};
  pool.forEach(p => { const k = tag(p); cntQ[k] = (cntQ[k] || 0) + 1; });
  setNote('n-quad',
    `以 2015 年中位数 ${Math.round(mid)} 分高低：右上“又脏又改善”${cntQ['高位改善'] || 0} 城，` +
    `左上“本来干净还在变好”${cntQ['低位改善'] || 0} 城；右下“又脏又恶化”${cntQ['高位恶化'] || 0} 城，` +
    `左下“本来干净却在变差”${cntQ['低位恶化'] || 0} 城。点大小＝十年波动。`);

  const ch = init('c-quad');
  ch.setOption(base({
    grid: { left: 58, right: 20, top: 38, bottom: 46 },
    legend: {
      data: Q, top: 2, left: 'center',
      itemWidth: 9, itemHeight: 9, itemGap: 12,
      textStyle: { color: TH.sub, fontSize: 10 }
    },
    tooltip: {
      trigger: 'item',
      formatter: p => {
        const [x, y, sd, nm, y24] = p.data;
        return `<b>${nm}</b><br/>` +
          `2015 年 <b style="color:${TH.aqi(x)}">${fmt1(x)}</b> → 2024 年 <b style="color:${TH.aqi(y24)}">${fmt1(y24)}</b><br/>` +
          `${y >= 0 ? '下降' : '上升'} <b style="color:${y >= 0 ? TH.good : TH.bad}">${fmt1(Math.abs(y))}</b> 分　` +
          `<span style="color:#6b7f9e">波动 σ ${fmt1(sd)}</span>`;
      }
    },
    xAxis: {
      type: 'value',
      name: '2015 年 AQI（越低越清洁）', nameLocation: 'middle', nameGap: 26,
      nameTextStyle: { color: TH.dim, fontSize: 10 },
      min: Math.max(0, Math.floor(xs[0] / 10) * 10),
      max: Math.ceil(xs[xs.length - 1] / 10) * 10,
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: TH.line, type: 'dashed' } },
      axisLabel: { color: TH.sub, fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      name: '改善幅度（AQI 下降分值）', nameLocation: 'end',
      nameTextStyle: { color: TH.dim, fontSize: 10, padding: [0, 0, 4, 0] },
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: TH.line, type: 'dashed' } },
      axisLabel: { color: TH.sub, fontSize: 10 }
    },
    series
  }), true);

  ch.off('click');
  ch.on('click', p => { if (p.data && p.data[3]) focusCity(p.data[3]); });
}
