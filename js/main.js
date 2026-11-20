/* ============================================================
   main.js —— 入口：加载数据 → 建索引 → 建图 → 绑事件
   负责人：A
   ============================================================ */

let D = null;              // 全部数据（app_data.json）
let GEO_OK = false;        // 地图注册成功与否
const IX = { val: {}, byName: {} };   // 索引：城市名→下标；[下标][年份]→AQI

const getVal = (ci, y) => (IX.val[ci] ? IX.val[ci][y] : undefined);

/* ---------------- 启动 ---------------- */
async function boot() {
  // 优先用脚本内联的数据（双击也能跑）；没有再用 fetch（http 环境下更标准）
  try {
    D = window.APP_DATA || await fetch('data/app_data.json').then(r => r.json());
  } catch (e) {
    fatal('数据加载失败：请确认 data/app_data.js 存在，或用 http:// 打开（在 aqi-viz 目录执行 python -m http.server 8000）。');
    console.error(e);
    return;
  }

  buildIndex();
  await loadGeo();
  bindFilters();
  applyHash();      // 支持 #year=2018&region=东部&city=上海市 直接定位
  renderAll();

  // 窗口变化后重算尺寸（图表容器是百分比宽，必须 resize）
  let t = null;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => Object.values(INST).forEach(c => c && c.resize()), 120);
  });

  // 状态变化后按需重绘：只重画受影响的图，地图的缩放/平移不会被重置
  let prev = { ...state };
  subscribe(s => {
    const yearChanged = s.year !== prev.year;
    const regionChanged = s.region !== prev.region;
    const cityChanged = s.city !== prev.city;

    if (yearChanged || regionChanged) {
      chartMap();      // 依赖 年份 + 区域
      chartHeat();     // 依赖 区域（行集合）
      chartTrend();    // 依赖 区域（叠加对比线）
      chartRegion();   // 依赖 区域（高亮当前区域）
      chartRank();     // B：依赖 年份 + 区域
      chartBox();      // B：依赖 区域
      chartLevel();    // B：依赖 区域
      chartQuad();     // B：依赖 区域
    }
    // 07 固定 2015→2024：只随区域变，拖年份不重画（少一次渲染）
    if (regionChanged) chartDelta();
    if (cityChanged) {
      chartDetail();   // 依赖 城市
    }
    prev = { ...s };
  });
}

/* ---------------- 索引 ---------------- */
function buildIndex() {
  D.cities.forEach((c, i) => {
    IX.byName[c.name] = i;
    IX.val[i] = {};
  });
  D.long.forEach(([ci, y, v]) => { IX.val[ci][y] = v; });

  // 城市下拉提示
  const dl = document.getElementById('city-list');
  const frag = document.createDocumentFragment();
  D.cities.map(c => c.name).sort((a, b) => a.localeCompare(b, 'zh'))
    .forEach(n => {
      const o = document.createElement('option');
      o.value = n;
      frag.appendChild(o);
    });
  dl.appendChild(frag);
}

/* ---------------- 地图 ---------------- */
/* 地图被拆成两张注册（build_geo.py 生成）：
   ① china_main  —— 34 个省级行政区，海南省只保留北纬 17° 以北；
   ② china_south —— 九段线 + 南海诸岛，放在右下角做附图。
   原因：南海诸岛最低到 3.4°N，与大陆同图会把外接矩形拉高近一倍，
   陆地被压成小小一团，而且 center/zoom 会跟着失准。
   拆开后主图用自然边界，缩放、下钻都正常；附图保证地图完整性。 */
async function loadGeo() {
  try {
    let main = window.CHINA_MAIN, south = window.CHINA_SOUTH;
    if (!main || !south) {
      [main, south] = await Promise.all([
        fetch('vendor/china_main.json').then(r => r.json()),
        fetch('vendor/china_south.json').then(r => r.json())
      ]);
    }
    echarts.registerMap('china_main', main);
    echarts.registerMap('china_south', south);
    GEO_OK = true;
  } catch (e) {
    GEO_OK = false;
    console.warn('地图数据未加载，其他图表不受影响', e);
  }
}

/* ---------------- 城市聚焦 ---------------- */
/* 详情卡在页面底部：只改 state 不滚动，用户会觉得“点了没反应”。
   地图点、排行条、四象限散点、输入框统一走这一个入口。 */
function focusCity(name) {
  if (IX.byName[name] == null) return;
  setState({ city: name });
  const card = document.getElementById('c-detail').closest('.card');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------------- 事件绑定 ---------------- */
function bindFilters() {
  const fy = document.getElementById('f-year');
  const fr = document.getElementById('f-region');
  const fc = document.getElementById('f-city');
  const hint = document.getElementById('f-hint');

  paintRange(fy);
  fy.addEventListener('input', () => {
    paintRange(fy);
    setState({ year: +fy.value });
  });

  fr.addEventListener('change', () => setState({ region: fr.value }));

  const pickCity = () => {
    const name = fc.value.trim();
    if (!name) return;
    if (IX.byName[name] == null) {
      hint.textContent = `没有找到「${name}」，请从下拉提示里选一个城市`;
      hint.style.color = '#ff9a9a';
      return;
    }
    hint.style.color = '';
    hint.textContent = `已切到 ${name}`;
    focusCity(name);
  };
  fc.addEventListener('change', pickCity);
  fc.addEventListener('keydown', e => { if (e.key === 'Enter') pickCity(); });

  document.getElementById('f-reset').addEventListener('click', () => {
    fc.value = '';
    hint.style.color = '';
    hint.textContent = '拖动年份看地图变化，点地图上的点查看城市详情';
    setState({ year: 2024, region: '全部', city: '北京市' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ---------------- 链接参数 ---------------- */
function applyHash() {
  const h = location.hash.replace(/^#/, '');
  if (!h) return;
  const q = new URLSearchParams(h);
  const y = +q.get('year');
  if (y >= 2015 && y <= 2024) state.year = y;
  const r = q.get('region');
  if (r && ['东部', '中部', '西部', '东北', '全部'].includes(r)) state.region = r;
  const c = q.get('city');
  if (c && IX.byName[c] != null) state.city = c;
  // 让筛选条同步显示（不触发重绘，重绘在 renderAll 里一次完成）
  const fy = document.getElementById('f-year');
  fy.value = state.year; paintRange(fy);
  document.getElementById('f-region').value = state.region;
  document.getElementById('f-year-val').textContent = state.year;
  document.getElementById('map-year').textContent = state.year + ' 年';
  document.getElementById('detail-name').textContent = state.city;
}

/* ---------------- 首屏渲染 ---------------- */
function renderAll() {
  renderKPI();
  chartTrend();
  chartMap();
  chartRegion();
  chartRank();
  chartBox();
  chartLevel();
  chartDelta();
  chartHeat();
  chartQuad();
  chartDetail();
}

/* ---------------- 异常兜底 ---------------- */
function fatal(msg) {
  const d = document.createElement('div');
  d.style.cssText = 'margin:40px 32px;padding:20px 24px;border:1px solid #5a2b2b;' +
    'background:#1e1420;border-radius:12px;color:#ffb3b3;font-size:14px;line-height:1.9';
  d.innerHTML = '<b>页面没能启动</b><br>' + msg;
  document.body.insertBefore(d, document.querySelector('main'));
}

document.addEventListener('DOMContentLoaded', boot);
