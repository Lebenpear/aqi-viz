/* ============================================================
   theme.js —— 色板 / 字号 / base option / AQI 语义色
   负责人：A
   目的：让 10 张图长得像一套东西。所有图都从 base() 出发，
        轴名、单位、tooltip 样式、字体统一在这里定义，不在各图里重复写。
   ============================================================ */

const TH = {
  bg: '#0d1522',
  panel: '#131e2f',
  line: '#1e2b40',
  line2: '#26374f',
  text: '#e8eef8',
  sub: '#93a4bf',
  dim: '#6b7f9e',
  accent: '#4c9aff',
  good: '#38c9a8',   // 改善 / 安全
  warn: '#ffb547',   // 提示 / 拐点
  bad:  '#ff7a7a',   // 恶化 / 超标

  /* 区域/系列主色板：按“可区分 + 同亮度”挑选，避免某条线视觉上被压住 */
  palette: ['#4c9aff', '#38c9a8', '#ffb547', '#ff7a7a', '#a78bfa', '#22d3ee'],

  /* 国标空气质量等级（GB 3095-2012）：
     AQI 越低越好，所以绿=优、红=污染重。
     注意这是“危险度”配色，与股市红涨绿跌的约定无关。 */
  levels: [
    { name: '优',       max: 50,  color: '#38c9a8' },
    { name: '良',       max: 100, color: '#8fd15c' },
    { name: '轻度污染', max: 150, color: '#ffb547' },
    { name: '中度污染', max: 200, color: '#ff7a7a' },
    { name: '重度污染', max: 300, color: '#c0392b' },
    { name: '严重污染', max: 500, color: '#7f1d1d' }
  ],

  /* 连续色带：与等级色同源，visualMap 与地图点色一致 */
  ramp: ['#38c9a8', '#8fd15c', '#ffb547', '#ff7a7a', '#c0392b'],

  /* 数值 → 等级名 */
  levelName(v) {
    if (v == null) return '无数据';
    for (const l of this.levels) if (v <= l.max) return l.name;
    return '严重污染';
  },

  /* 数值 → 颜色 */
  aqi(v) {
    if (v == null) return '#2b3d5c';
    for (const l of this.levels) if (v <= l.max) return l.color;
    return '#7f1d1d';
  },

  /* 数值 → 文字用的浅色（深色底上直接写等级色会发闷，提亮一档） */
  aqiText(v) {
    if (v == null) return this.dim;
    return this.aqi(v);
  }
};

/* ---------- base option ----------
   extra 中的 tooltip / textStyle 会与默认值合并，而不是整体替换，
   这样每张图只覆盖自己要改的那几个字段。 */
function base(extra) {
  const o = Object.assign({
    backgroundColor: 'transparent',
    animationDuration: 620,
    animationEasing: 'cubicOut',
    textStyle: {
      fontFamily: '"Microsoft YaHei","PingFang SC",sans-serif',
      color: TH.text,
      fontSize: 12
    },
    tooltip: {
      backgroundColor: 'rgba(16,24,38,.96)',
      borderColor: TH.line2,
      borderWidth: 1,
      padding: [8, 11],
      textStyle: { color: TH.text, fontSize: 12, lineHeight: 20 },
      extraCssText: 'border-radius:8px;box-shadow:0 8px 22px rgba(0,0,0,.45)'
    }
  }, extra || {});

  if (extra && extra.tooltip) {
    o.tooltip = Object.assign({
      backgroundColor: 'rgba(16,24,38,.96)',
      borderColor: TH.line2, borderWidth: 1, padding: [8, 11],
      textStyle: { color: TH.text, fontSize: 12, lineHeight: 20 },
      extraCssText: 'border-radius:8px;box-shadow:0 8px 22px rgba(0,0,0,.45)'
    }, extra.tooltip);
  }
  if (extra && extra.textStyle) {
    o.textStyle = Object.assign({
      fontFamily: '"Microsoft YaHei","PingFang SC",sans-serif',
      color: TH.text, fontSize: 12
    }, extra.textStyle);
  }
  return o;
}

/* ---------- 轴：名字和单位必须在，这是“图表规范”的得分点 ---------- */
function axisX(data, extra) {
  return Object.assign({
    type: 'category',
    data: data,
    boundaryGap: true,
    axisLine: { lineStyle: { color: TH.line2 } },
    axisTick: { show: false },
    axisLabel: { color: TH.sub, fontSize: 11 }
  }, extra || {});
}

function axisY(name, extra) {
  return Object.assign({
    type: 'value',
    name: name,
    nameTextStyle: { color: TH.dim, fontSize: 11, padding: [0, 0, 4, 0] },
    nameGap: 14,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: TH.line, type: 'dashed' } },
    axisLabel: { color: TH.sub, fontSize: 11 }
  }, extra || {});
}

/* ---------- 实例池：一个容器只 init 一次 ---------- */
const INST = {};
function init(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (!INST[id]) INST[id] = echarts.init(el, null, { renderer: 'canvas' });
  return INST[id];
}

/* ---------- 通用小工具 ---------- */
const fmt1 = v => (v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1));

/* 上下渐变填充，用于折线面积 */
function vGrad(hex, a1, a2) {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: hexA(hex, a1) },
    { offset: 1, color: hexA(hex, a2) }
  ]);
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* B 同学的图先占位：容器不空着，交接时一眼看到“这里该放什么、怎么接”。
   画成虚线框而不是空白，视觉上像设计稿里的线框槽位，不会让人误以为页面坏了。 */
function placeholder(id, owner, step, title) {
  const ch = init(id);
  if (!ch) return;
  ch.setOption({
    graphic: [{
      type: 'group', left: 'center', top: 'middle',
      children: [
        { type: 'rect', shape: { x: -128, y: -44, width: 256, height: 88, r: 10 },
          style: { fill: 'rgba(147,164,191,.035)', stroke: 'rgba(147,164,191,.26)', lineWidth: 1, lineDash: [5, 4] } },
        { type: 'text', left: 'center', top: -26,
          style: { text: title, fill: '#a9bcd6', font: '600 13px "Microsoft YaHei"' } },
        { type: 'text', left: 'center', top: -4,
          style: { text: `待 ${owner} 同学实现 · 执行手册步骤 ${step}`, fill: '#7d90ab', font: '11.5px "Microsoft YaHei"' } },
        { type: 'text', left: 'center', top: 18,
          style: { text: '数据与筛选联动已就绪，替换 charts.js 中同名函数即可', fill: '#5d6f8a', font: '11px "Microsoft YaHei"' } }
      ]
    }]
  }, true);
}
