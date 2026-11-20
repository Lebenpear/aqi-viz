/* ============================================================
   state.js —— 全局状态 + 订阅发布
   负责人：B（A 先按约定接口写好，B 直接在此扩展即可）
   设计：单一状态对象 + 全量重绘。367 城的数据量重绘一次约 20—30 ms，
        比局部 diff 简单得多，也不会出现“图和状态不一致”的 bug。
   ============================================================ */

const state = {
  year: 2024,        // 当前年份：影响地图、排行、热力图高亮
  region: '全部',    // 当前区域：影响地图、排行、热力图
  city: '北京市',    // 当前城市：影响详情图
  rankMode: 'worst'  // 排行模式（B 的图 04 用）：worst | best
};

const subscribers = [];

function subscribe(fn) { subscribers.push(fn); }

function setState(patch) {
  Object.assign(state, patch);

  // 状态变了，所有图重画（各图自己读 state，不必传参）
  subscribers.forEach(fn => fn(state));

  // 同步筛选条上与状态绑定的显示
  const yv = document.getElementById('f-year-val');
  const my = document.getElementById('map-year');
  const dn = document.getElementById('detail-name');
  const fy = document.getElementById('f-year');
  const fr = document.getElementById('f-region');
  if (yv) yv.textContent = state.year;
  if (my) my.textContent = state.year + ' 年';
  if (dn) dn.textContent = state.city;
  if (fy && +fy.value !== state.year) { fy.value = state.year; paintRange(fy); }
  if (fr && fr.value !== state.region) fr.value = state.region;
}

/* 滑杆已走过的部分填强调色（纯视觉，Chrome/Edge/Safari 有效） */
function paintRange(el) {
  const min = +el.min || 0, max = +el.max || 100;
  const p = ((+el.value - min) / (max - min)) * 100;
  el.style.setProperty('--p', p + '%');
}
