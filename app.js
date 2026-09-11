// ============================================================
//  人力资源分析平台 - 图表与交互逻辑
// ============================================================

const charts = {};
let currentView = 'overview';
const COLORS = ['#4361ee', '#2ec4b6', '#ff9f43', '#ee5a6f', '#8b5cf6', '#00b4d8', '#f15bb5'];
const TEXT = '#1f2a44', SOFT = '#6b7892', LINE = '#e8ecf3';

const baseGrid = { left: 48, right: 24, top: 30, bottom: 36 };
const axisStyle = {
  axisLine: { lineStyle: { color: LINE } },
  axisLabel: { color: SOFT, fontSize: 11 },
  splitLine: { lineStyle: { color: '#f2f4f9' } },
};

// ---------- 通用渲染 ----------
function kpiHtml(list) {
  return list.map(k => {
    const clickable = k.status ? ` data-status="${k.status}"` : (k.onclick ? ' data-onclick' : '');
    return `
    <div class="kpi${k.status ? ' kpi-clickable' : ''}"${clickable}>
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      ${k.delta ? `<div class="kpi-delta ${k.dir}">${k.dir === 'up' ? '▲' : '▼'} ${k.delta}</div>` : ''}
      <div class="kpi-icon">${k.icon}</div>
    </div>`;
  }).join('');
}

function initChart(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (charts[id]) { charts[id].dispose(); }
  const c = echarts.init(el);
  charts[id] = c;
  return c;
}

function safeDispose(id) {
  if (charts[id]) { charts[id].dispose(); delete charts[id]; }
}

// ---------- 数据聚合（全量联动：所有看板由员工明细实时计算）----------
let EMPLOYEES = [];
let AGG = null;

const LVL_ORDER = ['P4', 'P5', 'P6', 'P7', 'P8', 'M1', 'M2', 'M3'];

function computeAggregates(emps) {
  const n = emps.length;
  const sum = (k) => emps.reduce((s, e) => s + (Number(e[k]) || 0), 0);
  const a = {
    total: n,
    active: emps.filter(e => e.status === '在职').length,
    trial: emps.filter(e => e.status === '试用').length,
    left: emps.filter(e => e.status === '离职').length,
    avgSalary: n ? Math.round(sum('salary') / n) : 0,
    avgAge: n ? Math.round(sum('age') / n) : 0,
    avgTenure: n ? +(sum('tenure') / n).toFixed(1) : 0,
  };
  a.attrition = n ? +(a.left / n * 100).toFixed(1) : 0;

  const deptMap = {};
  emps.forEach(e => { deptMap[e.dept] = (deptMap[e.dept] || 0) + 1; });
  a.deptHeadcount = Object.keys(deptMap).map(d => ({ dept: d, count: deptMap[d] })).sort((x, y) => y.count - x.count);

  a.gender = [
    { name: '男性', value: emps.filter(e => e.gender === '男').length },
    { name: '女性', value: emps.filter(e => e.gender === '女').length },
  ];

  const lvlMap = {};
  emps.forEach(e => { lvlMap[e.level] = (lvlMap[e.level] || 0) + 1; });
  a.level = LVL_ORDER.filter(l => lvlMap[l]).map(l => ({ name: l, value: lvlMap[l] }));

  const ageBuckets = [['20-25岁', 20, 25], ['26-30岁', 26, 30], ['31-35岁', 31, 35], ['36-40岁', 36, 40], ['41-45岁', 41, 45], ['46岁以上', 46, 200]];
  a.ageGroups = ageBuckets.map(([name, lo, hi]) => ({ name, value: emps.filter(e => e.age >= lo && e.age <= hi).length }));

  const eduMap = {};
  emps.forEach(e => { eduMap[e.edu] = (eduMap[e.edu] || 0) + 1; });
  a.education = Object.keys(eduMap).map(k => ({ name: k, value: eduMap[k] }));

  const tenBuckets = [['<1年', 0, 0.999], ['1-3年', 1, 3], ['3-5年', 3, 5], ['5-10年', 5, 10], ['>10年', 10, 999]];
  a.tenureGroups = tenBuckets.map(([name, lo, hi]) => ({ name, value: emps.filter(e => (+e.tenure) >= lo && (+e.tenure) <= hi).length }));

  const dm = {};
  emps.forEach(e => {
    dm[e.dept] = dm[e.dept] || { active: 0, left: 0 };
    if (e.status === '离职') dm[e.dept].left++; else dm[e.dept].active++;
  });
  a.deptStack = Object.keys(dm).map(d => ({ dept: d, active: dm[d].active, left: dm[d].left }));

  const salMap = {};
  emps.forEach(e => { salMap[e.dept] = salMap[e.dept] || { sum: 0, n: 0 }; salMap[e.dept].sum += (+e.salary) || 0; salMap[e.dept].n++; });
  a.deptAvgSalary = Object.keys(salMap).map(d => ({ dept: d, avg: Math.round(salMap[d].sum / salMap[d].n) })).sort((x, y) => y.avg - x.avg);

  const ranges = [['<8K', 0, 7999], ['8-12K', 8000, 11999], ['12-16K', 12000, 15999], ['16-20K', 16000, 19999], ['20-25K', 20000, 24999], ['25-30K', 25000, 29999], ['>30K', 30000, 1e9]];
  a.salaryHist = ranges.map(([range, lo, hi]) => ({ range, value: emps.filter(e => (+e.salary) >= lo && (+e.salary) <= hi).length }));

  a.salaryLevel = LVL_ORDER.filter(l => lvlMap[l]).map(l => ({ level: l, count: lvlMap[l] }));

  a.deptTable = Object.keys(deptMap).map(d => {
    const es = emps.filter(e => e.dept === d);
    const male = es.filter(e => e.gender === '男').length;
    const cnt = es.length;
    return {
      dept: d, count: cnt, gender: `${male}/${cnt - male}`,
      avgAge: cnt ? Math.round(es.reduce((s, e) => s + (+e.age || 0), 0) / cnt) : 0,
      avgTenure: cnt ? +(es.reduce((s, e) => s + (+e.tenure || 0), 0) / cnt).toFixed(1) : 0,
      attrition: cnt ? (es.filter(e => e.status === '离职').length / cnt * 100).toFixed(1) + '%' : '0%',
    };
  });

  a.salaryTable = a.deptAvgSalary.map(d => {
    const total = d.avg;
    const base = Math.round(total * 0.7);
    const perf = Math.round(total * 0.22);
    const allowance = total - base - perf;
    return { dept: d.dept, base, perf, allowance, total };
  });

  return a;
}

// ---------- 总览 ----------
function renderOverview() {
  document.getElementById('overviewKpis').innerHTML = kpiHtml([
    { label: '在职员工总数', value: AGG.total.toLocaleString(), delta: '', dir: 'up', icon: '👥' },
    { label: '离职率', value: AGG.attrition + '%', delta: '', dir: 'up', icon: '📉' },
    { label: '月均薪资', value: '¥' + AGG.avgSalary.toLocaleString(), delta: '', dir: 'up', icon: '💰' },
    { label: '任务完成率', value: HR.ovTaskRate || '87.5%', delta: '', dir: 'up', icon: '✅' },
    { label: '人均效能指数', value: HR.ovEfficiency || '112', delta: '', dir: 'up', icon: '⚡' },
  ]);

  initChart('ovDeptBar').setOption({
    grid: baseGrid,
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: AGG.deptHeadcount.map(d => d.dept), ...axisStyle },
    yAxis: { type: 'value', ...axisStyle },
    series: [{
      type: 'bar', data: AGG.deptHeadcount.map(d => d.count),
      itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: '#4361ee' }, { offset: 1, color: '#8b5cf6' }]), borderRadius: [6, 6, 0, 0] },
      barWidth: '52%',
      label: { show: true, position: 'top', formatter: '{c}', color: SOFT, fontSize: 11, fontWeight: 600 },
    }],
  });

  initChart('ovStructure').setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: SOFT } },
    color: COLORS,
    series: [{
      type: 'pie', radius: ['40%', '66%'], center: ['50%', '44%'],
      avoidLabelOverlap: true,
      label: { color: TEXT, formatter: '{b}\n{c} 人 ({d}%)', fontSize: 11 },
      data: [...AGG.gender, ...AGG.level.map(l => ({ name: l.name, value: l.value }))],
    }],
  });

  initChart('ovTrend').setOption({
    grid: baseGrid,
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { color: SOFT }, data: ['在职人数', '离职率'] },
    xAxis: { type: 'category', data: HR.trendQuarters, ...axisStyle },
    yAxis: [
      { type: 'value', ...axisStyle },
      { type: 'value', ...axisStyle, splitLine: { show: false }, axisLabel: { formatter: '{value}%', color: SOFT } },
    ],
    series: [
      { name: '在职人数', type: 'line', smooth: true, data: HR.trendHeadcount,
        lineStyle: { width: 3, color: '#4361ee' }, itemStyle: { color: '#4361ee' }, areaStyle: { opacity: .08 },
        label: { show: true, position: 'top', formatter: '{c}', color: '#4361ee', fontSize: 11, fontWeight: 600 } },
      { name: '离职率', type: 'line', yAxisIndex: 1, smooth: true, data: HR.trendAttrition,
        lineStyle: { width: 3, color: '#ee5a6f' }, itemStyle: { color: '#ee5a6f' },
        label: { show: true, position: 'bottom', formatter: '{c}%', color: '#ee5a6f', fontSize: 11, fontWeight: 600 } },
    ],
  });

  initChart('ovTasks').setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: SOFT } },
    color: ['#2ec4b6', '#4361ee', '#ff9f43', '#ee5a6f'],
    series: [{
      type: 'pie', radius: ['45%', '70%'], center: ['50%', '44%'],
      label: { color: TEXT, formatter: '{b}\n{c} ({d}%)', fontSize: 11 },
      data: HR.taskOverview,
    }],
  });
}

// ---------- 人员看板 ----------
function renderPersonnel() {
  document.getElementById('personnelKpis').innerHTML = kpiHtml([
    { label: '在职员工', value: AGG.total.toLocaleString(), delta: '', dir: 'up', icon: '👥' },
    { label: '在职', value: AGG.active, delta: '', dir: 'up', icon: '✅' },
    { label: '离职', value: AGG.left, delta: '', dir: 'down', icon: '👋' },
    { label: '平均司龄', value: AGG.avgTenure + ' 年', delta: '', dir: 'up', icon: '⏳' },
    { label: '平均年龄', value: AGG.avgAge + ' 岁', delta: '', dir: 'down', icon: '🎂' },
  ]);

  initChart('peHeadcount').setOption({
    grid: baseGrid,
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { color: SOFT } },
    xAxis: { type: 'category', data: HR.headcountYears, ...axisStyle },
    yAxis: { type: 'value', ...axisStyle },
    series: [
      { name: '入职', type: 'bar', data: HR.headcountHired, itemStyle: { color: '#2ec4b6', borderRadius: [4,4,0,0] }, barWidth: '30%',
        label: { show: true, position: 'top', formatter: '{c}', color: '#2ec4b6', fontSize: 11, fontWeight: 600 } },
      { name: '离职', type: 'bar', data: HR.headcountLeft, itemStyle: { color: '#ee5a6f', borderRadius: [4,4,0,0] }, barWidth: '30%',
        label: { show: true, position: 'top', formatter: '{c}', color: '#ee5a6f', fontSize: 11, fontWeight: 600 } },
    ],
  });

  initChart('peGender').setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: SOFT } },
    color: ['#4361ee', '#f15bb5'],
    series: [{ type: 'pie', radius: ['48%', '72%'], center: ['50%', '44%'],
      label: { color: TEXT, formatter: '{b}\n{c} 人 ({d}%)', fontSize: 11 }, data: AGG.gender }],
  });

  initChart('peAge').setOption({
    grid: baseGrid,
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: AGG.ageGroups.map(a => a.name), ...axisStyle },
    yAxis: { type: 'value', ...axisStyle },
    series: [{ type: 'bar', data: AGG.ageGroups.map(a => a.value),
      itemStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#ff9f43'},{offset:1,color:'#ffd6a5'}]), borderRadius:[6,6,0,0] }, barWidth:'55%',
      label: { show: true, position: 'top', formatter: '{c}', color: SOFT, fontSize: 11, fontWeight: 600 } }],
  });

  initChart('peEdu').setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: SOFT } },
    color: COLORS,
    series: [{ type: 'pie', radius: '68%', center: ['50%','44%'],
      label: { color: TEXT, formatter: '{b}\n{c} 人 ({d}%)', fontSize: 11 }, data: AGG.education }],
  });

  initChart('peDeptStack').setOption({
    grid: baseGrid,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, textStyle: { color: SOFT } },
    xAxis: { type: 'category', data: AGG.deptStack.map(d => d.dept), ...axisStyle },
    yAxis: { type: 'value', ...axisStyle },
    series: [
      { name: '在职', type: 'bar', stack: 't', data: AGG.deptStack.map(d => d.active), itemStyle: { color: '#4361ee' }, barWidth:'52%',
        label: { show: true, position: 'inside', formatter: '{c}', color: '#fff', fontSize: 11, fontWeight: 600 } },
      { name: '离职', type: 'bar', stack: 't', data: AGG.deptStack.map(d => d.left), itemStyle: { color: '#ee5a6f' },
        label: { show: true, position: 'inside', formatter: '{c}', color: '#fff', fontSize: 11, fontWeight: 600 } },
    ],
  });

  initChart('peTenure').setOption({
    grid: baseGrid,
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: AGG.tenureGroups.map(t => t.name), ...axisStyle },
    yAxis: { type: 'value', ...axisStyle },
    series: [{ type: 'bar', data: AGG.tenureGroups.map(t => t.value),
      itemStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#8b5cf6'},{offset:1,color:'#c4b5fd'}]), borderRadius:[6,6,0,0] }, barWidth:'55%',
      label: { show: true, position: 'top', formatter: '{c}', color: SOFT, fontSize: 11, fontWeight: 600 } }],
  });

  const t = document.getElementById('peTable');
  t.innerHTML = `<thead><tr><th>部门</th><th>人数</th><th>男/女</th><th>平均年龄</th><th>平均司龄(年)</th><th>离职率</th></tr></thead>
    <tbody>${AGG.deptTable.map(r => `<tr><td>${r.dept}</td><td>${r.count}</td><td>${r.gender}</td><td>${r.avgAge}</td><td>${r.avgTenure}</td><td>${r.attrition}</td></tr>`).join('')}</tbody>`;
}

// ---------- 薪资看板 ----------
// ---------- 薪酬驾驶舱（数据来自后端 /api/payroll，对齐工资表模板列）----------
// 员工明细只有单个 salary，工资表是独立行级明细(含基本/绩效/津贴/社保/个税/实发等分项)，
// 二者相互独立：驾驶舱不依赖 AGG/员工明细，单独读 payroll 数据集。
let PAYROLL = [];            // 后端 /api/payroll 全量
let PAYROLL_PERIOD = '2026-08';   // 当前展示月份
let PAYROLL_PERIODS = [];    // 已入库的全部期间（desc）
let payrollInited = false;

async function loadPayroll() {
  try {
    const data = await apiGet('/payroll');
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[HR] payroll 接口不可用，回退内置：', e.message);
    return [];
  }
}

// 用 PAYROLL 重算期间列表并重建下拉
function refreshPeriodsFromData() {
  PAYROLL_PERIODS = [...new Set(PAYROLL.map(p => p.period))].filter(Boolean).sort().reverse();
  rebuildPeriodSel();
}

async function ensurePayrollLoaded() {
  if (payrollInited) return;
  PAYROLL = await loadPayroll();
  refreshPeriodsFromData();
  if (PAYROLL_PERIODS.length) {
    // 若当前 PAYROLL_PERIOD 已在库里则沿用，否则取最新期间
    if (!PAYROLL_PERIODS.includes(PAYROLL_PERIOD)) PAYROLL_PERIOD = PAYROLL_PERIODS[0];
  }
  payrollInited = true;
}

// 重建期间下拉（显示为 "2026年8月"）
function rebuildPeriodSel() {
  const sel = document.getElementById('saPeriodSel');
  if (!sel) return;
  sel.innerHTML = '';
  if (!PAYROLL_PERIODS.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = '暂无期间';
    sel.appendChild(o);
    return;
  }
  PAYROLL_PERIODS.forEach(p => {
    const o = document.createElement('option');
    o.value = p;
    o.textContent = p.replace('-', '年') + '月';
    sel.appendChild(o);
  });
  sel.value = PAYROLL_PERIODS.includes(PAYROLL_PERIOD) ? PAYROLL_PERIOD : PAYROLL_PERIODS[0];
}

// 对 payroll 行计算驾驶舱聚合（仿 computeAggregates，纯函数）
function computePayrollAgg(rows) {
  const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const r2 = v => Math.round(v * 100) / 100; // 消除浮点尾数
  const n = rows.length;
  const payable = r2(sum('payable')), net = r2(sum('netPay'));
  const social = r2(sum('socialTotal')), tax = r2(sum('taxThis'));
  const a = {
    count: n,
    deptCount: new Set(rows.map(r => r.dept)).size,
    payable, net, social, tax,
    burden: social + tax,                       // 社保+个税负担
    avgPayable: n ? Math.round(payable / n) : 0,
    avgNet: n ? Math.round(net / n) : 0,
    structure: [
      { name: '基本工资', value: r2(sum('basic')) },
      { name: '保密工资', value: r2(sum('secrecy')) },
      { name: '绩效工资', value: r2(sum('perf')) },
      { name: '岗位津贴', value: r2(sum('postAllowance')) },
      { name: '其他补助', value: r2(sum('otherAllowance')) },
    ],
    burdenParts: [
      { name: '养老保险', value: r2(sum('pension')) },
      { name: '医疗保险', value: r2(sum('medical')) },
      { name: '失业保险', value: r2(sum('unemploy')) },
      { name: '住房公积金', value: r2(sum('housingFund')) },
      { name: '个人所得税', value: tax },
    ],
    deductParts: [
      { name: '迟到扣款', value: r2(sum('lateDeduct')) },
      { name: '病假扣款', value: r2(sum('sickDeduct')) },
      { name: '事假扣款', value: r2(sum('affairDeduct')) },
      { name: '其他扣款', value: r2(sum('otherDeduct')) },
    ],
  };
  a.gross = r2(sum('gross'));
  a.burden = r2(a.burden);

  // 部门维度聚合
  const deptMap = {};
  rows.forEach(r => {
    deptMap[r.dept] = deptMap[r.dept] || { payable: 0, net: 0, social: 0, tax: 0, basic: 0, perf: 0, allowance: 0, n: 0, names: [] };
    const d = deptMap[r.dept];
    d.payable = r2(d.payable + r.payable); d.net = r2(d.net + r.netPay);
    d.social = r2(d.social + r.socialTotal); d.tax = r2(d.tax + r.taxThis);
    d.basic = r2(d.basic + r.basic); d.perf = r2(d.perf + r.perf);
    d.allowance = r2(d.allowance + (r.postAllowance + r.otherAllowance));
    d.n++; d.names.push(r.name);
  });
  a.dept = Object.keys(deptMap).map(k => {
    const d = deptMap[k];
    return {
      dept: k, payable: d.payable, net: d.net, social: d.social, tax: d.tax, burden: r2(d.social + d.tax),
      basic: d.basic, perf: d.perf, allowance: d.allowance,
      n: d.n, avgPayable: Math.round(d.payable / d.n), avgNet: Math.round(d.net / d.n),
      names: d.names.join('、'),
    };
  }).sort((x, y) => y.payable - x.payable);

  // 平均个人工资条链路（应发→社保→个税→实发）
  if (n) {
    a.avgSlip = [
      { step: '应发工资', val: Math.round(payable / n), type: 'total' },
      { step: '三险一金', val: -Math.round(social / n), type: 'minus' },
      { step: '个人所得税', val: -Math.round(tax / n), type: 'minus' },
      { step: '实发工资', val: Math.round(net / n), type: 'result' },
    ];
  }
  return a;
}

async function renderSalary() {
  await ensurePayrollLoaded();
  // 按当前月份过滤（本期单月）
  const rows = PAYROLL.filter(p => p.period === PAYROLL_PERIOD);
  if (!rows.length) { document.getElementById('salaryKpis').innerHTML = '<div class="empty-tip">暂无薪酬数据，请先在后端录入 payroll 记录。</div>'; return; }
  const A = computePayrollAgg(rows);
  const yuan = v => '¥' + v.toLocaleString();
  const k = v => Math.round(v / 1000) + 'K';

  document.getElementById('salaryKpis').innerHTML = kpiHtml([
    { label: '应付总额', value: yuan(A.payable), delta: '', dir: 'up', icon: '💵' },
    { label: '实发总额', value: yuan(A.net), delta: '', dir: 'up', icon: '💰' },
    { label: '人均实发', value: yuan(A.avgNet), delta: '', dir: 'up', icon: '👤' },
    { label: '社保+个税负担', value: yuan(A.burden), delta: '', dir: 'up', icon: '🧾' },
    { label: '发放人数', value: A.count, delta: '', dir: 'up', icon: '👥' },
  ]);
  // 同步顶部期间显示与下拉选中
  const sel = document.getElementById('saPeriodSel');
  if (sel && PAYROLL_PERIODS.includes(PAYROLL_PERIOD)) sel.value = PAYROLL_PERIOD;
  document.getElementById('saPeriod').textContent = PAYROLL_PERIOD.replace('-', '年') + '月';

  // 1) 部门薪酬成本构成（堆叠条：基本/绩效/津贴补助）
  const deptAsc = A.dept.slice().reverse();
  initChart('saDeptStack').setOption({
    grid: { ...baseGrid, left: 78, right: 60 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: v => yuan(v) },
    legend: { top: 0, textStyle: { color: SOFT }, data: ['基本工资', '绩效工资', '津贴补助'] },
    xAxis: { type: 'value', ...axisStyle, axisLabel: { formatter: k, color: SOFT } },
    yAxis: { type: 'category', data: deptAsc.map(d => d.dept), ...axisStyle },
    series: [
      { name: '基本工资', type: 'bar', stack: 'cost', barWidth: '58%', itemStyle: { color: '#4361ee' }, data: deptAsc.map(d => d.basic) },
      { name: '绩效工资', type: 'bar', stack: 'cost', itemStyle: { color: '#2ec4b6' }, data: deptAsc.map(d => d.perf) },
      { name: '津贴补助', type: 'bar', stack: 'cost', itemStyle: { color: '#ff9f43' }, data: deptAsc.map(d => d.allowance) },
    ],
  });

  // 2) 部门人均应发 vs 人均实发（分组条）
  const dAsc = A.dept.slice().reverse();
  initChart('saDeptAvg').setOption({
    grid: { ...baseGrid, left: 78, right: 50 },
    tooltip: { trigger: 'axis', valueFormatter: v => yuan(v) },
    legend: { top: 0, textStyle: { color: SOFT } },
    xAxis: { type: 'value', ...axisStyle, axisLabel: { formatter: k, color: SOFT } },
    yAxis: { type: 'category', data: dAsc.map(d => d.dept), ...axisStyle },
    series: [
      { name: '人均应发', type: 'bar', barWidth: 10, itemStyle: { color: '#8b5cf6' }, data: dAsc.map(d => d.avgPayable),
        label: { show: true, position: 'right', color: '#8b5cf6', fontSize: 10, formatter: p => k(p.value) } },
      { name: '人均实发', type: 'bar', barWidth: 10, itemStyle: { color: '#2ec4b6' }, data: dAsc.map(d => d.avgNet),
        label: { show: true, position: 'right', color: '#2ec4b6', fontSize: 10, formatter: p => k(p.value) } },
    ],
  });

  // 3) 全公司薪酬成本构成（环形）
  initChart('saStructure').setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: SOFT } },
    color: ['#4361ee', '#2ec4b6', '#ff9f43', '#8b5cf6', '#ee5a6f'],
    series: [{
      type: 'pie', radius: ['38%', '66%'], center: ['50%', '44%'],
      avoidLabelOverlap: true,
      label: { color: TEXT, formatter: '{b}\n{d}%', fontSize: 11 },
      data: A.structure.filter(x => x.value > 0),
    }],
  });

  // 4) 个税与社保负担分布（玫瑰/环形）
  initChart('saBurden').setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: SOFT } },
    color: ['#4361ee', '#2ec4b6', '#48cae4', '#ff9f43', '#ee5a6f'],
    series: [{
      type: 'pie', radius: ['20%', '66%'], roseType: 'radius', center: ['50%', '44%'],
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 1 },
      label: { color: TEXT, formatter: '{b}\n{c}', fontSize: 11 },
      data: A.burdenParts.filter(x => x.value > 0),
    }],
  });

  // 5) 平均工资条链路（应发 → 社保 → 个税 → 实发）
  const slip = A.avgSlip || [];
  initChart('saSlip').setOption({
    grid: { ...baseGrid, left: 20, right: 20 },
    tooltip: { trigger: 'axis', valueFormatter: v => yuan(v) },
    xAxis: { type: 'category', data: slip.map(s => s.step), ...axisStyle },
    yAxis: { type: 'value', ...axisStyle, axisLabel: { formatter: k, color: SOFT } },
    series: [{
      type: 'bar', data: slip.map(s => s.val),
      barWidth: '42%',
      itemStyle: { color: p => p.value >= 0 ? '#2ec4b6' : '#ee5a6f', borderRadius: [6, 6, 0, 0] },
      label: { show: true, position: p => p.value >= 0 ? 'top' : 'bottom', color: TEXT, fontSize: 11, fontWeight: 600, formatter: p => yuan(p.value) },
    }],
  });

  // 6) 部门成本 / 负担明细表
  const t = document.getElementById('saTable');
  const fmt = yuan;
  t.innerHTML = `<thead><tr><th>部门</th><th>人数</th><th>应付</th><th>实发</th><th>三险一金</th><th>个税</th><th>人均应发</th><th>人均实发</th></tr></thead>
    <tbody>${A.dept.map(d => `<tr>
      <td>${d.dept}</td>
      <td>${d.n}</td><td>${fmt(d.payable)}</td><td>${fmt(d.net)}</td>
      <td>${fmt(d.social)}</td><td>${fmt(d.tax)}</td>
      <td>${fmt(d.avgPayable)}</td><td>${fmt(d.avgNet)}</td></tr>`).join('')}</tbody>`;
}

// 若后端数据变化，强制重绘（删除渲染缓存）
function refreshSalary() { delete rendered.salary; return renderSalary(); }

// 从后端重拉薪酬全量、重建期间下拉并重渲染当前期间（用于导入成功后刷新）
async function reloadSalaryData() {
  PAYROLL = await loadPayroll();
  refreshPeriodsFromData();
  if (PAYROLL_PERIODS.length && !PAYROLL_PERIODS.includes(PAYROLL_PERIOD)) PAYROLL_PERIOD = PAYROLL_PERIODS[0];
  delete rendered.salary;
  await renderSalary();
}

// 一次性绑定薪酬驾驶舱顶部的期间下拉 + 导入按钮（守卫防重复）
let saControlsInited = false;
function initSalaryControls() {
  if (saControlsInited) return;
  saControlsInited = true;
  const sel = document.getElementById('saPeriodSel');
  const btn = document.getElementById('btnSalaryImport');
  const fileInput = document.getElementById('salaryImport');
  if (sel) sel.addEventListener('change', () => {
    if (sel.value) { PAYROLL_PERIOD = sel.value; refreshSalary(); }
  });
  if (btn && fileInput) {
    btn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleSalaryImport);
  }
}

// ---------- 任务进度看板（数据驱动 + AI 分析）----------
let TASKS = [];
let tasksInited = false;
let tkState = { filtered: [], page: 1, pageSize: 8, sortKey: 'due', sortDir: 1 };

const TK_COLS = [
  { key: 'name', label: '任务名称' }, { key: 'owner', label: '负责人' }, { key: 'team', label: '团队' },
  { key: 'priority', label: '优先级' }, { key: 'status', label: '状态' }, { key: 'progress', label: '进度' },
  { key: 'start', label: '开始' }, { key: 'due', label: '截止' }, { key: 'hours', label: '工时' },
  { key: 'remark', label: '备注' },
];

const TK_STATUS_COLOR = { '已完成': '#2ec4b6', '进行中': '#4361ee', '未开始': '#cdd7ec', '阻塞': '#ee5a6f' };
const TK_PRIO_COLOR = { '高': '#ee5a6f', '中': '#ff9f43', '低': '#2ec4b6' };

// ---------- 日期 / 健康度工具 ----------
function d2n(s) { const d = new Date(s); return isNaN(d) ? null : d.getTime(); }
function daysBetween(a, b) { const x = d2n(a), y = d2n(b); return (x === null || y === null) ? null : Math.round((y - x) / 86400000); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

// 计算单条任务的时间进度与偏差
function taskHealth(t, today) {
  const dueN = d2n(t.due), startN = d2n(t.start), todayN = d2n(today);
  const done = t.status === '已完成';
  let timeProgress = null, deviation = null, daysLeft = null;
  if (startN !== null && dueN !== null && dueN >= startN) {
    const total = (dueN - startN) / 86400000;
    const elapsed = (todayN - startN) / 86400000;
    timeProgress = total > 0 ? Math.max(0, Math.min(100, (elapsed / total) * 100)) : (elapsed >= 0 ? 100 : 0);
    deviation = Math.round((t.progress || 0) - timeProgress);
  }
  if (dueN !== null) daysLeft = Math.round((dueN - todayN) / 86400000);
  const overdue = !done && daysLeft !== null && daysLeft < 0;
  return { timeProgress, deviation, daysLeft, overdue, done };
}

// ---------- 聚合 ----------
function groupCount(list, key) {
  const m = new Map();
  list.forEach(t => { const k = t[key] || '未指定'; m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function computeTaskAgg(tasks) {
  const today = todayStr();
  const total = tasks.length;
  const status = groupCount(tasks, 'status');
  const priority = groupCount(tasks, 'priority');

  // 团队：完成率（平均进度）+ 工时
  const teamMap = new Map();
  tasks.forEach(t => {
    const k = t.team || '未指定';
    if (!teamMap.has(k)) teamMap.set(k, { team: k, sum: 0, n: 0, hours: 0, active: 0 });
    const o = teamMap.get(k);
    o.sum += (t.progress || 0); o.n += 1; o.hours += (t.hours || 0);
    if (t.status === '进行中') o.active += 1;
  });
  const teams = [...teamMap.values()].map(o => ({
    team: o.team, rate: Math.round(o.sum / o.n), hours: o.hours, active: o.active, count: o.n,
  })).sort((a, b) => b.rate - a.rate);

  // 健康统计
  const health = tasks.map(t => ({ t, ...taskHealth(t, today) }));
  const overdue = health.filter(h => h.overdue);
  const blocked = tasks.filter(t => t.status === '阻塞');
  const lagging = health.filter(h => !h.done && h.deviation !== null && h.deviation <= -25);
  const dueSoon = health.filter(h => !h.done && h.daysLeft !== null && h.daysLeft >= 0 && h.daysLeft <= 7);
  const notStarted = tasks.filter(t => t.status === '未开始');
  const done = tasks.filter(t => t.status === '已完成');
  const avgProgress = total ? Math.round(tasks.reduce((s, t) => s + (t.progress || 0), 0) / total) : 0;
  const totalHours = tasks.reduce((s, t) => s + (t.hours || 0), 0);

  // 健康分：100 基准扣分
  let score = 100;
  score -= overdue.length * 8;
  score -= blocked.length * 6;
  score -= lagging.length * 4;
  score -= dueSoon.length * 2;
  score -= notStarted.length * 1;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return { total, status, priority, teams, avgProgress, totalHours, health,
    overdue, blocked, lagging, dueSoon, notStarted, done, score };
}

// ---------- AI 分析引擎 ----------
function analyzeTasks(agg) {
  const ins = [];
  const { total, overdue, blocked, lagging, dueSoon, notStarted, done, score, teams, avgProgress } = agg;
  if (!total) return { score: 0, items: [{ level: 'info', icon: '📋', title: '暂无任务数据', text: '请点击「＋ 新增任务」录入日常工作，系统将自动分析进度风险。' }] };

  // 1. 逾期
  if (overdue.length) {
    const names = overdue.slice(0, 3).map(h => `${h.t.name}（${h.t.owner}，逾期 ${Math.abs(h.daysLeft)} 天）`).join('；');
    ins.push({ level: 'critical', icon: '🚨', title: `${overdue.length} 项任务已逾期`,
      text: names + (overdue.length > 3 ? ` 等 ${overdue.length} 项` : ''),
      advice: '建议：立即与负责人确认卡点，重新评估交付时间或拆分任务降低单次交付压力。' });
  }
  // 2. 阻塞
  if (blocked.length) {
    ins.push({ level: 'critical', icon: '⛔', title: `${blocked.length} 项任务处于阻塞状态`,
      text: blocked.slice(0, 3).map(t => `${t.name}（${t.owner}${t.remark ? '：' + t.remark : ''}）`).join('；'),
      advice: '建议：优先升级协调资源，阻塞任务每多滞留一天，下游依赖都会顺延。' });
  }
  // 3. 进度滞后
  if (lagging.length) {
    const worst = lagging.sort((a, b) => a.deviation - b.deviation).slice(0, 3);
    ins.push({ level: 'warning', icon: '⚠️', title: `${lagging.length} 项任务进度落后于时间进度`,
      text: worst.map(h => `${h.t.name}（实际 ${h.t.progress}% vs 应达 ${Math.round(h.timeProgress)}%）`).join('；'),
      advice: '建议：核查是估算偏乐观还是资源不足，必要时追加人力或缩减范围。' });
  }
  // 4. 临期
  if (dueSoon.length) {
    ins.push({ level: 'warning', icon: '⏰', title: `${dueSoon.length} 项任务 7 天内到期`,
      text: dueSoon.slice(0, 3).map(h => `${h.t.name}（剩 ${h.daysLeft} 天，进度 ${h.t.progress}%）`).join('；'),
      advice: '建议：提前检查验收标准与依赖方，避免最后时刻才发现缺口。' });
  }
  // 5. 高优先级风险
  const highRisk = agg.health.filter(h => !h.done && h.t.priority === '高' && (h.overdue || (h.deviation !== null && h.deviation < -10)));
  if (highRisk.length) {
    ins.push({ level: 'critical', icon: '🔥', title: `${highRisk.length} 项高优先级任务存在交付风险`,
      text: highRisk.slice(0, 3).map(h => `${h.t.name}（${h.t.team}·${h.t.owner}，${h.t.progress}%）`).join('；'),
      advice: '建议：这类任务影响面最大，建议每日跟踪，必要时上报管理层协调。' });
  }
  // 6. 团队负载
  if (teams.length >= 2) {
    const avg = teams.reduce((s, t) => s + t.active, 0) / teams.length;
    const heavy = teams.filter(t => t.active > avg * 1.4 && t.active >= 2);
    const weak = teams.filter(t => t.rate < 50);
    if (heavy.length) {
      ins.push({ level: 'info', icon: '⚖️', title: '团队负载不均衡',
        text: heavy.map(t => `${t.team}：进行中 ${t.active} 项（均值 ${avg.toFixed(1)}）`).join('；'),
        advice: '建议：将部分任务横向调配给负载较轻的团队，避免单点过载拖累整体节奏。' });
    }
    if (weak.length) {
      ins.push({ level: 'info', icon: '📉', title: '部分团队整体进度偏低',
        text: weak.map(t => `${t.team}：平均完成 ${t.rate}%`).join('；'),
        advice: '建议：了解该团队是否存在共性障碍（如需求变更频繁、外部依赖多）。' });
    }
  }
  // 7. 未开始
  if (notStarted.length >= 3) {
    ins.push({ level: 'info', icon: '📥', title: `${notStarted.length} 项任务尚未启动`,
      text: notStarted.slice(0, 3).map(t => `${t.name}（${t.owner}）`).join('；'),
      advice: '建议：确认排期是否合理，长期挂起未启动的任务应及时清理或重新排期。' });
  }
  // 8. 正面反馈
  if (!overdue.length && !blocked.length && !lagging.length) {
    ins.push({ level: 'good', icon: '✅', title: '整体进度健康，无逾期与阻塞',
      text: `全部 ${total} 项任务中已完成 ${done.length} 项，平均进度 ${avgProgress}%。`,
      advice: '建议：保持当前节奏，可考虑提前启动下阶段任务以留出缓冲。' });
  }
  if (score >= 85 && ins.length < 3) {
    ins.push({ level: 'good', icon: '💚', title: '任务健康度良好',
      text: `综合健康评分 ${score} 分。`, advice: '建议：按计划推进即可。' });
  }
  return { score, items: ins };
}

function renderAiInsights(agg) {
  const box = document.getElementById('aiInsights');
  if (!box) return;
  const { score, items } = analyzeTasks(agg);
  const level = score >= 85 ? '优' : score >= 70 ? '良' : score >= 50 ? '一般' : '需关注';
  const levelColor = score >= 85 ? '#2ec4b6' : score >= 70 ? '#4361ee' : score >= 50 ? '#ff9f43' : '#ee5a6f';

  box.innerHTML = `
    <div class="ai-summary">
      综合健康评分 <b style="color:${levelColor}">${score} / 100（${level}）</b>　·
      共 ${agg.total} 项任务，平均进度 <b>${agg.avgProgress}%</b>　·
      已逾期 <b style="color:${agg.overdue.length ? '#ee5a6f' : 'inherit'}">${agg.overdue.length}</b> 项，
      阻塞 <b style="color:${agg.blocked.length ? '#ee5a6f' : 'inherit'}">${agg.blocked.length}</b> 项，
      进度滞后 <b style="color:${agg.lagging.length ? '#ff9f43' : 'inherit'}">${agg.lagging.length}</b> 项
    </div>
    ${items.map(i => `
      <div class="insight ${i.level}">
        <span class="ic">${i.icon}</span>
        <div class="tx">
          <b>${i.title}</b>
          <span>${i.text}</span>
          ${i.advice ? `<span style="display:block;margin-top:4px;opacity:.9">${i.advice}</span>` : ''}
        </div>
      </div>`).join('')}`;
}

// ---------- AI 大模型（LLM）接入 ----------
let aiState = { config: null, source: 'rule', model: '' };

async function aiFetch(path, body, method) {
  const opt = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
  if (body !== null) opt.body = JSON.stringify(body);
  const res = await fetch(CONFIG.apiBase + '/api' + path, opt);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || ('HTTP ' + res.status)); e.payload = data; throw e; }
  return data;
}

async function loadAiConfig() {
  try { aiState.config = await aiFetch('/ai/config'); }
  catch (e) { aiState.config = null; }
  updateAiBadge();
}

function updateAiBadge() {
  const el = document.getElementById('aiSource');
  if (!el) return;
  if (aiState.source === 'llm') {
    el.textContent = '由 ' + (aiState.model || '大模型') + ' 生成';
    el.className = 'ai-source llm';
  } else {
    el.textContent = '内置规则引擎';
    el.className = 'ai-source';
  }
}

// 调用大模型做深度分析
async function runDeepAnalysis() {
  const btn = document.getElementById('btnAiDeep');
  const box = document.getElementById('aiInsights');
  if (!TASKS.length) { alert('暂无任务数据可分析'); return; }

  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = '分析中…';
  try {
    const r = await aiFetch('/ai/analyze', { tasks: TASKS }, 'POST');
    if (!r.ok) throw new Error(r.error || '分析失败');
    aiState.source = 'llm';
    aiState.model = r.model;
    renderLlmResult(r);
    updateAiBadge();
  } catch (e) {
    if (e.payload && e.payload.needConfig) {
      const go = confirm('尚未配置大模型 API Key。\n\n现在去「AI 设置」填写吗？');
      if (go) openAiSettings();
    } else {
      alert('AI 深度分析失败：' + (e.message || '未知错误'));
    }
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

function renderLlmResult(r) {
  const box = document.getElementById('aiInsights');
  const level = r.score >= 85 ? '优' : r.score >= 70 ? '良' : r.score >= 50 ? '一般' : '需关注';
  const color = r.score >= 85 ? '#2ec4b6' : r.score >= 70 ? '#4361ee' : r.score >= 50 ? '#ff9f43' : '#ee5a6f';
  const agg = computeTaskAgg(TASKS);
  const actions = r.actions || [];
  const controls = r.controls || [];
  const watch = r.watchlist || [];

  box.innerHTML = `
    <div class="ai-summary">
      <b style="color:${color}">把控健康度 ${r.score} / 100（${level}）</b>
      <br><span style="font-size:13.5px">${r.verdict || '—'}</span>
      <br><span style="color:var(--soft);font-size:12.5px">
        基于你录入的 ${agg.total} 项真实任务（平均进度 ${agg.avgProgress}%）· 模型：${r.model || '—'}
      </span>
    </div>

    ${actions.length ? `
      <div class="ai-sec-title">🎯 立即干预 <span class="ai-sec-sub">按紧急度排序</span></div>
      ${actions.map((a, i) => `
        <div class="action-card ${a.level}">
          <div class="ac-no">${i + 1}</div>
          <div class="ac-main">
            <div class="ac-head">
              <b>${a.task}</b>
              ${a.owner ? `<span class="ac-owner">${a.owner}</span>` : ''}
              <span class="ac-by">${a.by ? '⏱ ' + a.by : ''}</span>
            </div>
            ${a.problem ? `<div class="ac-problem">${a.problem}</div>` : ''}
            <div class="ac-do">👉 ${a.action}</div>
          </div>
        </div>`).join('')}
    ` : ''}

    ${controls.length ? `
      <div class="ai-sec-title">🎛️ 把控建议</div>
      ${controls.map(c => `
        <div class="insight llm">
          <span class="ic">${({ '资源调配': '🔀', '节奏控制': '🎚️', '风险预警': '🚧', '机制优化': '⚙️' })[c.type] || '🚧'}</span>
          <div class="tx">
            <b><span class="ctl-type">${c.type}</span>${c.title}</b>
            <span>${c.detail}</span>
          </div>
        </div>`).join('')}
    ` : ''}

    ${watch.length ? `
      <div class="ai-sec-title">👀 重点盯办</div>
      <div class="watchlist">${watch.map(w => `<span class="watch-tag">${w}</span>`).join('')}</div>
    ` : ''}`;
}

// ---------- AI 设置弹窗 ----------
function openAiSettings() {
  const c = aiState.config || {};
  const sel = document.getElementById('aiProvider');
  if (!sel.options.length) {
    Object.entries(c.presets || {}).forEach(([k, v]) => {
      sel.insertAdjacentHTML('beforeend', `<option value="${k}">${v.name}</option>`);
    });
  }
  sel.value = c.provider || 'deepseek';
  document.getElementById('aiModel').value = c.model || '';
  document.getElementById('aiBaseUrl').value = c.baseUrl || '';
  document.getElementById('aiKey').value = '';
  document.getElementById('aiKeyHint').textContent = c.hasKey
    ? `已保存 Key：${c.apiKeyMasked}（留空则不修改）` : '尚未配置 API Key';
  document.getElementById('aiTestResult').textContent = '';
  document.getElementById('aiModal').classList.add('open');
}
function closeAiSettings() { document.getElementById('aiModal').classList.remove('open'); }

async function testAiConnection() {
  const btn = document.getElementById('aiTestBtn');
  const out = document.getElementById('aiTestResult');
  btn.disabled = true; out.className = 'ai-test-result'; out.textContent = '测试中…';
  try {
    const r = await aiFetch('/ai/test', {
      baseUrl: document.getElementById('aiBaseUrl').value,
      model: document.getElementById('aiModel').value,
      apiKey: document.getElementById('aiKey').value || '__KEEP__',
    }, 'POST');
    out.className = 'ai-test-result ok';
    out.textContent = '✅ 连接成功：' + (r.reply || '正常');
  } catch (e) {
    out.className = 'ai-test-result err';
    out.textContent = '❌ ' + (e.message || '连接失败');
  } finally { btn.disabled = false; }
}

async function saveAiConfig() {
  const payload = {
    enabled: true,
    provider: document.getElementById('aiProvider').value,
    baseUrl: document.getElementById('aiBaseUrl').value.trim(),
    model: document.getElementById('aiModel').value.trim(),
    apiKey: document.getElementById('aiKey').value.trim() || '__KEEP__',
  };
  if (!payload.baseUrl || !payload.model) { alert('请填写接口地址与模型名称'); return; }
  try {
    await aiFetch('/ai/config', payload, 'PUT');
    await loadAiConfig();
    closeAiSettings();
    alert('已保存。现在可以点击「✨ AI 深度分析」。');
  } catch (e) {
    alert('保存失败：' + e.message);
  }
}

// 切换服务商时自动填充预设
function onProviderChange() {
  const c = aiState.config || {};
  const p = (c.presets || {})[document.getElementById('aiProvider').value];
  if (p && p.baseUrl) {
    document.getElementById('aiBaseUrl').value = p.baseUrl;
    document.getElementById('aiModel').value = p.model;
  }
}

// ==================== 智能快速录入（自然语言 → 任务草稿 + 反问补充） ====================

// ---- 中文规则引擎（无需 Key 即可工作）----
const SMART_RULES = {
  actions: [
    { re: /(打电话|电话|通话|致电|call)/i, v: '致电' },
    { re: /(开会|会议|碰头|对齐|review)/i, v: '开会' },
    { re: /(拜访|面谈|去见|去见|上门)/i, v: '拜访' },
    { re: /(确认|核实|核对)/i, v: '确认' },
    { re: /(提交|交付|上传|报)/i, v: '提交' },
    { re: /(催|跟进|追)/i, v: '跟进' },
    { re: /(评审|审阅|看一遍)/i, v: '评审' },
    { re: /(整理|梳理|汇总)/i, v: '整理' },
    { re: /(发送|发邮件|邮件|发给)/i, v: '发送' },
    { re: /(签约|签合同|签)/i, v: '签约' },
    { re: /(洽谈|谈|报价|议价)/i, v: '洽谈' },
    { re: /(下单|采购|买)/i, v: '采购' },
    { re: /(收款|收款|回款|收钱)/i, v: '收款' },
    { re: /(付款|转账|打款|付钱|结款)/i, v: '付款' },
    { re: /(设计|做|完成|搞定)/i, v: '推进' },
  ],
  amountKey: /(合同|方案|报价|发票|采购|订单|付款|费用|预算|工资|薪酬|项目|标的|金额|货款)/,
};

// ---- 业务场景库：开放句式（如"工商变更事宜"）也能智能反问缺失信息 ----
// 场景命中后，把其 asks 中"确实缺失"的项转成追问。kind 取值：
//   note    自由文本（对象/内容等）→ 写入 draft.extra[.key]
//   material 材料/票据类（带常用选项）→ 写入 draft.extra.material
//   amount / deadline / date / contact / priority  复用原有逻辑
// key 命名与 extraLabel 用于把回答拼进可读备注。
const SMART_SCENES = [
  { key: /工商|变更|增资|减资|股权|注册|注销|执照|经营范围|法人|地址变更|经营地址/,
    obj: '工商变更',
    asks: [
      { kind: 'note',    key: 'subject',  label: '涉及哪家公司 / 主体？',  demo: '公司全称', extraLabel: '涉及主体' },
      { kind: 'note',    key: 'scope',    label: '具体要变更什么内容？',    demo: '如 经营范围 / 注册资本 / 股权 / 法人', extraLabel: '变更内容' },
      { kind: 'material',key: 'material', label: '需要准备哪些材料？',      demo: '输入其他材料', extraLabel: '需准备材料',
        options: ['章程修正案', '股东会决议', '营业执照正副本', '身份证明', '新地址证明'] },
    ] },
  { key: /报销|贴票|贴发票|费用报销/,
    obj: '报销',
    asks: [
      { kind: 'note',     key: 'subject',  label: '报销什么项目 / 用途？', demo: '如 出差打车费 / 招待费', extraLabel: '报销项目' },
      { kind: 'amount',   key: 'amount',   label: '金额是多少？' },
      { kind: 'material', key: 'material', label: '票据类型？', demo: '输入其他类型', extraLabel: '票据类型',
        options: ['增值税专用发票', '普票', '电子发票', '打车行程单', '无票（需说明）'] },
    ] },
  { key: /面试|招聘|候选人|约人|猎头|安排?面试/,
    obj: '面试安排',
    asks: [
      { kind: 'note',     key: 'subject',  label: '面试哪个岗位 / 候选人？', demo: '如 前端工程师-李某某', extraLabel: '面试对象' },
      { kind: 'note',     key: 'scope',    label: '面试官 / 形式？',         demo: '如 技术主管 / 视频面试', extraLabel: '面试安排' },
      { kind: 'deadline', key: 'deadline', label: '预计哪天前完成？' },
    ] },
  // 通用兜底：凡出现开放事务词都主动反问关键信息，避免"识别不到"
  { key: /事宜|事务|办理|处理|跟进|推进|安排|准备|申请|报备|申报|备案/,
    obj: '', fallback: true,
    asks: [
      { kind: 'note',     key: 'subject',  label: '涉及哪个对象 / 单位？', demo: '公司 / 部门 / 联系人', extraLabel: '涉及对象' },
      { kind: 'note',     key: 'scope',    label: '具体要做什么？',        demo: '一句话说明要点', extraLabel: '具体事项' },
      { kind: 'deadline', key: 'deadline', label: '预计哪天前办完？' },
      { kind: 'contact',  key: 'contact',  label: '和谁对接？' },
    ] },
];

function smartDetectContact(text) {
  // 优先匹配 "X总/X经理/X哥/王老板" 等
  const titled = text.match(/([张王李赵刘陈杨黄周吴徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向常][总经理老板哥哥姐长])/);
  if (titled) return titled[1];
  // 中文联系人单位
  const unit = text.match(/([张王李赵刘陈杨黄周吴徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向常])/);
  return unit ? unit[1] + '' : '';
}

// 相对时间换算
function smartResolveDate(text) {
  const t = new Date();
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const t1 = new Date(t); t1.setDate(t.getDate() + 1);
  const t2 = new Date(t); t2.setDate(t.getDate() + 2);
  const t3 = new Date(t); t3.setDate(t.getDate() + 3);
  const weekMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
  const wm = text.match(/周([一二三四五六日天])/);
  if (wm && weekMap[wm[1]]) {
    const want = weekMap[wm[1]];
    let d = new Date(t); const cur = d.getDay() === 0 ? 7 : d.getDay();
    let delta = want - cur; if (delta <= 0) delta += 7;
    d.setDate(d.getDate() + delta); return fmt(d);
  }
  if (/大后天/.test(text)) return fmt(t3);
  if (/后天/.test(text)) return fmt(t2);
  if (/明天|明日/.test(text)) return fmt(t1);
  if (/今天|今日|今晚/.test(text)) return fmt(t);
  return '';
}

// 金额解析
function smartDetectAmount(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(万|万元|元|块|k|K)/);
  if (!m) return '';
  const num = parseFloat(m[1]);
  let val = num;
  if (/万/.test(m[2])) val = num * 10000;
  return String(Math.round(val));
}

// 规则引擎主函数：返回草稿草稿对象
// 根据草稿当前字段，重新生成备注（保留原话，供回溯）
function smartComposeRemark(d) {
  const parts = [];
  if (d.amountText) parts.push('涉及金额约 ' + d.amountText + ' 元');
  if (d.timePhrase) parts.push('安排时间：' + d.timePhrase);
  if (d.contact) parts.push('对接人：' + d.contact);
  // 场景自由文本（extra）：把回答结构化地拼进备注
  if (d.extra && typeof d.extra === 'object') {
    const ordered = [];
    const labels = { subject: '涉及对象', scope: '具体内容', material: '需准备材料', note: '补充信息' };
    Object.keys(d.extra).forEach(k => {
      if (k.indexOf('__label_') === 0) return;                       // 跳过内部标签键
      if (d.extra[k] == null || d.extra[k] === '') return;
      const hasLbl = d.extra['__label_' + k];
      const label = (hasLbl && typeof hasLbl === 'string' && hasLbl) || labels[k] || k;
      ordered.push(label.replace(/[？?。.!！：:]\s*$/, '') + '：' + d.extra[k]);  // 去掉末尾标点
    });
    parts.push(ordered.join('；'));
  }
  const head = parts.filter(Boolean).join('；') + '。';
  return (head === '。' ? '' : head) + '原话：' + (d.raw || '');
}

function smartParseByRules(text) {
  const draft = {
    name: '', owner: '', team: '', priority: '中', status: '进行中',
    start: '', due: '', hours: 0, progress: 0, remark: '',
    tags: [], questions: [], contact: '', amountText: '',
    raw: text, timePhrase: '',
  };
  // 动作
  let action = '';
  for (const a of SMART_RULES.actions) {
    if (a.re.test(text)) { action = a.v; break; }
  }
  // 联系人
  draft.contact = smartDetectContact(text);
  // 对象/领域词（任务名后缀）
  const obj = text.match(/(合同|方案|报价单?|发票|采购单?|订单|报告|项目书?|计划书?|PPT|预算|简历|名单|清单|工资|招聘|回访|材料|资料)/);
  let objWord = obj ? obj[1] : '';

  // 场景识别：优先具体场景；通用兜底场景(fallback)只在"没有具体对象/领域词"时才启用，
  // 避免把"合同事宜/处理发票事宜"等已能识别的话术误判成开放事务。
  const specific = SMART_SCENES.find(s => !s.fallback && s.key.test(text));
  const generic = SMART_SCENES.find(s => s.fallback && s.key.test(text));
  let scene = specific || null;
  if (!scene && generic && !objWord) scene = generic;   // 仅真正开放句式走兜底
  if (scene) draft.scene = scene;              // 供反问阶段使用
  if (scene && scene.obj && !objWord) objWord = scene.obj;

  // 时间与截止
  draft.due = smartResolveDate(text);
  draft.start = '';
  const atTime = text.match(/(上午|下午|晚上|中午)?\s*(0?[0-9]|1[0-9]|2[0-3])[:点时]([0-5]?[0-9])?分?/);
  let timePhrase = '';
  if (atTime) timePhrase = (atTime[1] || '') + (atTime[2] ? atTime[2] + '点' : '') + (atTime[3] ? atTime[3] + '分' : '');

  // 金额
  draft.amountText = smartDetectAmount(text);

  // 优先级
  if (/(紧急|尽快|很重要|加急|马上)/.test(text)) draft.priority = '高';
  else if (/(不急|有空|低优)/.test(text)) draft.priority = '低';

  // 组装任务名（动作 + 联系人 + 对象 + 时间点）
  const nameParts = [];
  if (action) nameParts.push(action);
  if (draft.contact) nameParts.push(draft.contact);
  if (objWord) nameParts.push(objWord);
  if (!nameParts.length) {
    const cleaned = text.replace(/(今天|明天|后天|大后天|周[一二三四五六日天]|上午|下午|晚上|中午|[0-9]{1,2}[点时][0-5]?[0-9]?分?)/g, '').replace(/[，。！？\s]+/g, '').trim();
    nameParts.push(cleaned.slice(0, 20) || text.slice(0, 20));
  }
  if (timePhrase && nameParts[0] !== timePhrase) nameParts.push('(' + timePhrase + ')');
  draft.name = nameParts.join('').slice(0, 40);
  draft.timePhrase = timePhrase;
  draft.remark = smartComposeRemark(draft);

  // tags
  const tagSet = new Set();
  if (draft.contact) tagSet.add(draft.contact);
  if (objWord) tagSet.add(objWord);
  if (action) tagSet.add(action);
  if (timePhrase) tagSet.add(timePhrase);
  if (scene && scene.obj) tagSet.add(scene.obj);
  draft.tags = [...tagSet].slice(0, 5);

  // ---- 反问生成（缺什么问什么）----
  const qs = [];
  const isMoneyScene = SMART_RULES.amountKey.test(text);
  if (isMoneyScene && !draft.amountText) {
    qs.push({ q: '这笔涉及金额是？（如 50 万）', kind: 'amount', options: [] });
  }
  if (!draft.due) {
    qs.push({ q: '预计哪天前办完？', kind: 'deadline', options: ['今天', '明天', '本周五', '自定义'] });
  }
  if (!/电话|通话/.test(text) && (/(沟通|确认|洽谈|拜访|对接)/.test(text) || draft.contact) && !draft.contact) {
    qs.push({ q: '和谁对接？', kind: 'contact', options: [] });
  }
  if (/(签|签约|什么时候|哪天签)/.test(text)) {
    qs.push({ q: '什么时候签？', kind: 'date', options: ['今天', '明天', '本周内', '自定义'] });
  }

  // ---- 场景反问：命中业务场景后，把其中仍缺失的项补上 ----
  // 用 ask 的 key 标记问题，回答时据此归类到 draft.extra[key] 或原生字段。
  const asks = (draft.scene && draft.scene.asks) || [];
  asks.forEach(a => {
    // 已通过通用规则问过的原生字段不再重复
    if (a.kind === 'amount' && (draft.amountText || qs.some(q => q.kind === 'amount'))) return;
    if (a.kind === 'deadline' && (draft.due || qs.some(q => q.kind === 'deadline'))) return;
    if (a.kind === 'date' && (draft.due || qs.some(q => q.kind === 'date'))) return;
    if (a.kind === 'contact' && (draft.contact || qs.some(q => q.kind === 'contact'))) return;
    // note/material：写进 extra，除非已答过同 key
    if ((a.kind === 'note' || a.kind === 'material') && draft.extra && draft.extra[a.key]) return;
    if (qs.some(q => q.key === a.key)) return;
    qs.push({
      q: a.label, kind: a.kind, key: a.key || '',
      options: a.options || [], demo: a.demo || '',
      extraLabel: a.extraLabel || a.label,
    });
  });

  // 去重 & 上限（场景化开放事务放宽到 5 条，让反问更完整）
  const seen = new Set();
  draft.questions = qs.filter(q => { if (seen.has(q.q)) return false; seen.add(q.q); return true; }).slice(0, 5);
  return draft;
}

// 根据草稿 + 回答更新草稿（kind 处理；qKey 用于归类场景自由文本）
function smartApplyAnswer(draft, qKind, answer, qKey, qExtraLabel) {
  if (!answer) return;
  if (qKind === 'amount') {
    const m = String(answer).match(/(\d+(?:\.\d+)?)\s*(万|万元|元|块|k|K)?/);
    if (m) {
      let val = parseFloat(m[1]);
      if (/万/.test(m[2] || '')) val = val * 10000;
      draft.amountText = String(Math.round(val));
    }
  } else if (qKind === 'deadline') {
    if (/今天/.test(answer)) draft.due = smartResolveDate('今天');
    else if (/明天/.test(answer)) draft.due = smartResolveDate('明天');
    else if (/周五/.test(answer)) draft.due = smartResolveDate('周五');
    else if (answer.includes('-')) draft.due = answer.match(/\d{4}-\d{2}-\d{2}/)?.[0] || draft.due;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(answer)) draft.due = answer;
  } else if (qKind === 'date') {
    if (answer.includes('-')) draft.due = answer.match(/\d{4}-\d{2}-\d{2}/)?.[0] || draft.due;
    else if (/今天/.test(answer)) draft.due = smartResolveDate('今天');
    else if (/明天/.test(answer)) draft.due = smartResolveDate('明天');
    else if (/周/.test(answer)) draft.due = smartResolveDate(answer);
  } else if (qKind === 'contact') {
    draft.contact = answer;
  } else if (qKind === 'priority') {
    draft.priority = ['高', '中', '低'].includes(answer) ? answer : draft.priority;
  } else if (qKind === 'note' || qKind === 'material') {
    // 场景自由文本：写入 extra，键用 scene ask 的 key，未命名键归并到 note
    draft.extra = draft.extra || {};
    const key = qKey || 'note';
    const label = qExtraLabel || (key === 'subject' ? '涉及对象' : key === 'scope' ? '具体内容' : '补充信息');
    const labelKey = '__label_' + key;
    draft.extra[key] = String(answer).trim();
    draft.extra[labelKey] = label;
  }
  // 更新备注中的结构化信息（保留原话）
  draft.remark = smartComposeRemark(draft);
}

// ---- 面板状态 ----
const smartState = { draft: null, hasKey: false, analyzing: false };

// 渲染识别结果
function smartRender() {
  const panel = document.getElementById('smartPanel');
  const d = smartState.draft;
  if (!d) { panel.classList.remove('show'); panel.innerHTML = ''; return; }
  panel.classList.add('show');
  const esc = escapeHtml;
  const fmtMoney = d.amountText ? (d.amountText >= 10000 ? (d.amountText / 10000) + ' 万' : d.amountText + ' 元') : '';
  const tags = (d.tags || []).map(t => `<span class="sr-tag">🏷 ${esc(t)}</span>`).join('');
  const fields = [];
  if (d.due) fields.push(`<span>截止：<b>${esc(d.due)}</b></span>`);
  if (fmtMoney) fields.push(`<span>金额：<b>${fmtMoney}</b></span>`);
  if (d.contact) fields.push(`<span>对接：<b>${esc(d.contact)}</b></span>`);
  if (d.priority) fields.push(`<span>优先级：<b>${esc(d.priority)}</b></span>`);
  // 已答的场景信息也展示在字段条（取短摘要）
  if (d.extra && typeof d.extra === 'object') {
    const ex = d.extra;
    Object.keys(ex).forEach(k => {
      if (k.indexOf('__label_') === 0 || ex[k] == null || ex[k] === '') return;
      const hasLbl = ex['__label_' + k];
      const label = (hasLbl && typeof hasLbl === 'string' && hasLbl) || k;
      fields.push(`<span>${esc(label.replace(/[？?。.!！：:]\s*$/, ''))}：<b>${esc(String(ex[k]).slice(0, 18))}</b></span>`);
    });
  }
  const fieldHtml = fields.length ? `<div class="sr-fields">${fields.join('')}</div>` : '';
  const src = smartState.hasKey ? 'LLM 解析' : '规则引擎';
  panel.innerHTML = `
    <div class="smart-result">
      <div class="sr-head">
        <span class="sr-name">📌 ${esc(d.name)}</span>
        <span class="sr-badge">${src}</span>
      </div>
      ${tags ? `<div class="sr-tags">${tags}</div>` : ''}
      ${fieldHtml}
      ${(d.questions && d.questions.length) ? `<div class="q-block">
        <div class="q-title">🤔 请确认以下信息（点选项或直接填）：</div>
        ${d.questions.map((q, i) => `
          <div class="q-item" data-kind="${q.kind}" data-key="${esc(q.key || '')}" data-label="${esc(q.extraLabel || '')}">
            <div class="q-line">
              <span class="q-text">${esc(q.q)}</span>
              ${(q.options || []).filter(o => o !== '自定义').map(o => `<button class="q-opt" data-ans="${esc(o)}">${esc(o)}</button>`).join('')}
              <input class="q-input" placeholder="${esc(q.demo || '直接输入')}" data-idx="${i}" />
            </div>
          </div>`).join('')}
      </div>` : `<div class="sr-fields" style="color:#12817a">✅ 信息已齐全，可保存。</div>`}
      <div class="sr-actions">
        <button class="btn btn-add" id="smartConfirm">✅ 确认存入任务</button>
        <button class="btn" id="smartClear">清除</button>
      </div>
    </div>`;

  // 事件：选项点击
  panel.querySelectorAll('.q-opt').forEach(b => {
    b.onclick = () => {
      const item = b.closest('.q-item');
      smartApplyAnswer(smartState.draft, item.dataset.kind, b.dataset.ans, item.dataset.key, item.dataset.label);
      smartRerenderQuestions();
    };
  });
  // 事件：输入框回车
  panel.querySelectorAll('.q-input').forEach(inp => {
    inp.onkeydown = e => {
      if (e.key === 'Enter') {
        const item = inp.closest('.q-item');
        if (inp.value.trim()) smartApplyAnswer(smartState.draft, item.dataset.kind, inp.value.trim(), item.dataset.key, item.dataset.label);
        smartRerenderQuestions();
      }
    };
  });
  // 事件：确认 / 清除
  const cf = document.getElementById('smartConfirm');
  if (cf) cf.onclick = () => smartCommit();
  const cl = document.getElementById('smartClear');
  if (cl) cl.onclick = () => { smartState.draft = null; document.getElementById('smartInput').value = ''; smartRender(); };
}

// 刷新反问（去掉已回答的问题）
function smartRerenderQuestions() {
  const panel = document.getElementById('smartPanel');
  // 用一个标志记录哪些已答：这里简单重建整个 result（保留 draft）
  // 为支持"问题即时消失"，重建并跳过那些 draft 里已经补全的
  const d = smartState.draft;
  // 维护一个已答集合：若金额已补则不显示金额问题
  d.questions = d.questions.filter(q => {
    if (q.kind === 'amount' && d.amountText) return false;
    if (q.kind === 'deadline' && d.due) return false;
    if (q.kind === 'date' && d.due) return false;
    if (q.kind === 'contact' && d.contact) return false;
    if (q.kind === 'priority' && d.priority) return false;
    if ((q.kind === 'note' || q.kind === 'material') && q.key && d.extra && d.extra[q.key]) return false;
    return true;
  });
  smartRender();
}

// 把草稿填入已有任务弹窗并打开
function smartCommit() {
  const d = smartState.draft || {};
  // 负责人与团队默认
  openTaskModal(null);
  // 此时弹窗已填了默认值，再覆盖为草稿解析值
  document.getElementById('t_name').value = d.name || '';
  // 负责人：保留弹窗默认；若解析明确指定负责人则覆盖（联系人≠负责人，不把对接方当执行人）
  if (d.owner) document.getElementById('t_owner').value = d.owner;
  const teamSel = document.getElementById('t_team');
  if (d.team && [...teamSel.options].some(o => o.value === d.team)) teamSel.value = d.team;
  document.getElementById('t_priority').value = d.priority || '中';
  document.getElementById('t_start').value = d.start || (d.due ? '' : todayStr());
  document.getElementById('t_due').value = d.due || '';
  const remark = d.remark ? (d.contact && d.amountText ? d.remark : d.remark) : '';
  document.getElementById('t_remark').value = d.remark || '';
  // 标记来源备注，便于用户看见后删改
  document.getElementById('t_remark').placeholder = '由智能录入生成，可修改';
  // 触发表单校验视觉
}

// 触发智能分析（规则 或 LLM）
async function smartAnalyze() {
  const input = document.getElementById('smartInput');
  const text = (input.value || '').trim();
  const panel = document.getElementById('smartPanel');
  if (!text) { smartState.draft = null; smartRender(); return; }
  panel.classList.add('show');
  panel.innerHTML = '<div class="smart-loading">正在识别…</div>';

  // LLM 增强（若配置 key）
  let parsed = null;
  const hasKey = aiState.config && aiState.config.hasKey;
  smartState.hasKey = !!hasKey;
  if (hasKey) {
    try {
      const r = await apiJson('/ai/parse', { text }, 'POST');
      if (r && r.ok) parsed = r;
    } catch (e) { /* 回退规则 */ smartState.hasKey = false; }
  }
  if (!parsed) {
    smartState.hasKey = false;
    const d = smartParseByRules(text);
    // 让默认负责人 = 若表格有当前默认 owner（用表格第一行负责人作参考，无则留空）
    smartState.draft = d;
    smartRender();
    return;
  }
  // LLM 结果 → 规则字段格式
  const rulesDraft = smartParseByRules(text);
  const ownerFromLlm = parsed.owner && parsed.owner !== rulesDraft.contact ? parsed.owner : '';
  const d = {
    name: parsed.name || rulesDraft.name,
    owner: ownerFromLlm,
    team: rulesDraft.team,
    priority: parsed.priority || rulesDraft.priority,
    status: '进行中',
    start: parsed.start || rulesDraft.start,
    due: parsed.due || rulesDraft.due,
    hours: parsed.hours || 0,
    progress: 0,
    remark: parsed.remark || rulesDraft.remark,
    tags: (parsed.tags || []).concat(rulesDraft.tags || []).slice(0, 4),
    amountText: rulesDraft.amountText,
    contact: rulesDraft.contact,
    raw: text,
    timePhrase: rulesDraft.timePhrase,
    questions: parsed.questions || [],
  };
  smartState.draft = d;
  smartRender();
}

// 防抖 & 事件绑定
let smartTimer = null;
function initSmartEntry() {
  const inp = document.getElementById('smartInput');
  const btn = document.getElementById('smartAnalyze');
  inp.addEventListener('input', () => {
    clearTimeout(smartTimer);
    smartTimer = setTimeout(smartAnalyze, 800);
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(smartTimer); smartAnalyze(); } });
  if (btn) btn.onclick = smartAnalyze;
  // 示例 chip
  document.querySelectorAll('.chip-btn[data-demo]').forEach(b => {
    b.onclick = () => { inp.value = b.dataset.demo; smartAnalyze(); };
  });
}

// ---------- 任务看板渲染 ----------
// 按状态联动：设置下拉筛选、重绘表格并滚动到任务明细区、高亮匹配行
function gotoTaskStatus(status) {
  const sel = document.getElementById('tkStatusFilter');
  if (sel) sel.value = status;
  tkState.page = 1;
  tkRenderTable();
  const card = document.getElementById('tkListCard');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  flashTaskRows(status);
}

// 高亮当前状态下匹配的任务行
function flashTaskRows(status) {
  if (!status) return;
  setTimeout(() => {
    const rows = document.querySelectorAll('#tkTable tbody tr');
    let shown = 0;
    rows.forEach(tr => {
      const tag = tr.querySelector('.tag[data-status]');
      if (tag && tag.getAttribute('data-status') === status) {
        tr.classList.add('row-flash');
        shown++;
      }
    });
    if (!shown) {
      const el = document.getElementById('tkPager');
      if (el) {
        const hint = document.createElement('div');
        hint.className = 'tk-hint';
        hint.textContent = `已筛选「${status}」任务，可点击表头下方工具栏的「+ 新增任务」录入，或在“全部状态”处切换查看其它状态。`;
        el.prepend(hint);
        setTimeout(() => { const h = el.querySelector('.tk-hint'); if (h) h.remove(); }, 4000);
      }
    }
  }, 50);
}

function renderTasks() {
  const agg = computeTaskAgg(TASKS);

  document.getElementById('tasksKpis').innerHTML = kpiHtml([
    { label: '任务总数', value: agg.total, delta: '', dir: 'up', icon: '📋' },
    { label: '已完成', value: agg.done.length, delta: '', dir: 'up', icon: '✅', status: '已完成' },
    { label: '进行中', value: TASKS.filter(t => t.status === '进行中').length, delta: '', dir: 'up', icon: '🔄', status: '进行中' },
    { label: '逾期 / 阻塞', value: agg.overdue.length + ' / ' + agg.blocked.length, delta: '', dir: 'down', icon: '🚨' },
    { label: '平均进度', value: agg.avgProgress + '%', delta: '', dir: 'up', icon: '📈' },
  ]);

  renderAiInsights(agg);

  // 状态分布
  const tkStatusChart = initChart('tkStatus');
  tkStatusChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: SOFT } },
    color: agg.status.map(s => TK_STATUS_COLOR[s.name] || '#8b5cf6'),
    series: [{ type: 'pie', radius: ['45%', '70%'], center: ['50%', '44%'],
      label: { color: TEXT, formatter: '{b}\n{c} 项 ({d}%)', fontSize: 11 }, data: agg.status }],
  });
  tkStatusChart.off('click');
  tkStatusChart.on('click', p => {
    const st = p && p.name;
    if (['未开始', '进行中', '已完成', '阻塞'].includes(st)) gotoTaskStatus(st);
  });

  // 团队完成率
  initChart('tkTeam').setOption({
    grid: { ...baseGrid, left: 70, right: 60 },
    tooltip: { trigger: 'axis', valueFormatter: v => v + '%' },
    xAxis: { type: 'value', max: 100, ...axisStyle, axisLabel: { formatter: '{value}%', color: SOFT } },
    yAxis: { type: 'category', data: agg.teams.map(t => t.team).reverse(), ...axisStyle },
    series: [{ type: 'bar', data: agg.teams.map(t => t.rate).reverse(),
      itemStyle: { color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [{ offset: 0, color: '#2ec4b6' }, { offset: 1, color: '#48cae4' }]), borderRadius: [0, 6, 6, 0] }, barWidth: '55%',
      label: { show: true, position: 'right', formatter: '{c}%', color: SOFT, fontSize: 11, fontWeight: 600 } }],
  });

  // 优先级分布
  initChart('tkPriority').setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: SOFT } },
    color: agg.priority.map(p => TK_PRIO_COLOR[p.name] || '#8b5cf6'),
    series: [{ type: 'pie', radius: '68%', center: ['50%', '44%'],
      label: { color: TEXT, formatter: '{b}\n{c} 项 ({d}%)', fontSize: 11 }, data: agg.priority }],
  });

  // 工时投入
  initChart('tkHours').setOption({
    grid: { ...baseGrid, left: 70 },
    tooltip: { trigger: 'axis', valueFormatter: v => v + ' 小时' },
    xAxis: { type: 'category', data: agg.teams.map(t => t.team), ...axisStyle },
    yAxis: { type: 'value', ...axisStyle },
    series: [{ type: 'bar', data: agg.teams.map(t => t.hours),
      itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#8b5cf6' }, { offset: 1, color: '#c4b5fd' }]), borderRadius: [6, 6, 0, 0] }, barWidth: '52%',
      label: { show: true, position: 'top', formatter: '{c}h', color: SOFT, fontSize: 11, fontWeight: 600 } }],
  });

  renderGantt(TASKS);
  tkRenderTable();
}

// ---------- 甘特图（按真实起止日期）----------
function renderGantt(tasks) {
  const g = initChart('tkGantt');
  const valid = tasks.filter(t => d2n(t.start) !== null && d2n(t.due) !== null && d2n(t.due) >= d2n(t.start));
  if (!valid.length) {
    g.setOption({ title: { text: '暂无可展示的任务（需填写开始/截止日期）', left: 'center', top: 'middle', textStyle: { color: SOFT, fontSize: 13 } } });
    return;
  }
  const minT = Math.min(...valid.map(t => d2n(t.start)));
  const maxT = Math.max(...valid.map(t => d2n(t.due)));
  const totalDays = Math.max(1, Math.ceil((maxT - minT) / 86400000));
  const toX = s => (d2n(s) - minT) / 86400000;
  const today = new Date().getTime();

  const names = valid.map(t => t.name);
  const data = valid.map((t, i) => {
    const yIdx = valid.length - 1 - i;
    return {
      value: [yIdx, toX(t.start), toX(t.due) - toX(t.start), t.progress || 0],
      itemStyle: { color: TK_STATUS_COLOR[t.status] || '#4361ee' },
      t,
    };
  });

  // 生成月份刻度
  const ticks = [];
  const cur = new Date(minT); cur.setDate(1);
  while (cur.getTime() <= maxT) {
    ticks.push({ value: (cur.getTime() - minT) / 86400000, label: (cur.getMonth() + 1) + '月' });
    cur.setMonth(cur.getMonth() + 1);
  }

  g.setOption({
    grid: { left: 160, right: 60, top: 20, bottom: 30 },
    tooltip: { formatter: p => {
      const t = p.data.t;
      const h = taskHealth(t, todayStr());
      const dl = h.daysLeft === null ? '—' : (h.daysLeft < 0 ? `已逾期 ${Math.abs(h.daysLeft)} 天` : `剩 ${h.daysLeft} 天`);
      return `<b>${t.name}</b><br/>负责人：${t.owner}（${t.team}）<br/>状态：${t.status} · ${t.priority}优先级<br/>进度：${t.progress}%<br/>周期：${t.start} ~ ${t.due}<br/>${dl}`;
    }},
    xAxis: { type: 'value', min: 0, max: totalDays, ...axisStyle, axisLabel: { show: false }, splitLine: { lineStyle: { color: '#eef2f9' } } },
    yAxis: { type: 'category', data: names.slice().reverse(), ...axisStyle, axisTick: { show: false } },
    series: [
      { type: 'custom',
        renderItem: (params, api) => {
          const catIdx = api.value(0);
          const start = api.coord([api.value(1), catIdx]);
          const end = api.coord([api.value(1) + api.value(2), catIdx]);
          const progEnd = api.coord([api.value(1) + api.value(2) * api.value(3) / 100, catIdx]);
          const height = api.size([0, 1])[1] * 0.45;
          const full = end[0] - start[0];
          const doneW = progEnd[0] - start[0];
          return { type: 'group', children: [
            { type: 'rect', shape: { x: start[0], y: start[1] - height/2, width: full, height, r: 5 }, style: { fill: '#eef2f9' } },
            { type: 'rect', shape: { x: start[0], y: start[1] - height/2, width: Math.max(doneW, 2), height, r: 5 }, style: { fill: api.visual('color') } },
            { type: 'text', style: { text: api.value(3) + '%', x: end[0] + 6, y: start[1], fill: SOFT, font: '11px sans-serif', verticalAlign: 'middle' } },
          ]};
        },
        encode: { x: [1, 2], y: 0 }, data,
        markLine: today >= minT && today <= maxT ? {
          silent: true, symbol: 'none',
          lineStyle: { color: '#ee5a6f', width: 2, type: 'dashed' },
          label: { formatter: '今天', position: 'end', color: '#ee5a6f', fontSize: 11 },
          data: [{ xAxis: (today - minT) / 86400000 }],
        } : undefined,
      },
    ],
  });
}

// ---------- 任务表格 ----------
function tkApplyFilters() {
  const q = (document.getElementById('tkSearch').value || '').trim().toLowerCase();
  const team = document.getElementById('tkTeamFilter').value;
  const status = document.getElementById('tkStatusFilter').value;
  const prio = document.getElementById('tkPriorityFilter').value;
  tkState.filtered = TASKS.filter(t => {
    if (q && !(`${t.name} ${t.owner}`.toLowerCase().includes(q))) return false;
    if (team && t.team !== team) return false;
    if (status && t.status !== status) return false;
    if (prio && t.priority !== prio) return false;
    return true;
  });
}

function tkRenderTable() {
  tkApplyFilters();
  const today = todayStr();
  const { sortKey, sortDir } = tkState;
  const sorted = tkState.filtered.slice().sort((a, b) => {
    let x = a[sortKey], y = b[sortKey];
    if (sortKey === 'due' || sortKey === 'start') { x = d2n(x) || 0; y = d2n(y) || 0; }
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sortDir;
    return String(x ?? '').localeCompare(String(y ?? ''), 'zh') * sortDir;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / tkState.pageSize));
  if (tkState.page > totalPages) tkState.page = totalPages;
  const rows = sorted.slice((tkState.page - 1) * tkState.pageSize, tkState.page * tkState.pageSize);

  const head = '<thead><tr>' + TK_COLS.map(c =>
    `<th class="sortable" data-key="${c.key}">${c.label}${tkState.sortKey === c.key ? (tkState.sortDir === 1 ? ' ▲' : ' ▼') : ''}</th>`
  ).join('') + '<th>操作</th></tr></thead>';

  const body = '<tbody>' + (rows.length ? rows.map(t => {
    const h = taskHealth(t, today);
    const dl = h.daysLeft === null ? '—' : (h.done ? '已交付' : (h.daysLeft < 0 ? `<span style="color:#ee5a6f">逾期${Math.abs(h.daysLeft)}天</span>` : `${h.daysLeft}天`));
    return `<tr>
      <td>${t.name}</td>
      <td>${t.owner}</td>
      <td>${t.team}</td>
      <td><span class="tag" style="background:${TK_PRIO_COLOR[t.priority] || '#888'}1a;color:${TK_PRIO_COLOR[t.priority] || '#888'}">${t.priority}</span></td>
      <td><span class="tag tag-${t.status}" data-status="${t.status}">${t.status}</span></td>
      <td><div class="mini-bar"><i style="width:${t.progress || 0}%;background:${TK_STATUS_COLOR[t.status] || '#4361ee'}"></i><span>${t.progress || 0}%</span></div></td>
      <td>${t.start || '—'}</td>
      <td>${t.due || '—'}<br><small style="color:${h.overdue ? '#ee5a6f' : SOFT}">${dl}</small></td>
      <td>${t.hours || 0}h</td>
      <td class="remark-cell" title="点击编辑备注" data-task-id="${t.id}" data-remark="${escapeHtml(t.remark || '')}">
        ${t.remark
          ? `<span class="remark-text">${escapeHtml(t.remark)}</span>`
          : `<span class="remark-empty">＋ 添加备注</span>`}
      </td>
      <td class="row-actions">
        <button class="link-btn" onclick="openTaskModal('${t.id}')">编辑</button>
        <button class="link-btn danger" onclick="deleteTask('${t.id}')">删除</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="11" style="text-align:center;color:#8a94a6;padding:24px">暂无任务，点击「＋ 新增任务」开始录入</td></tr>') + '</tbody>';

  const tbl = document.getElementById('tkTable');
  tbl.innerHTML = head + body;

  document.getElementById('tkPager').innerHTML =
    `共 ${sorted.length} 条 · 第 ${tkState.page}/${totalPages} 页
     <button id="tkPrev" ${tkState.page <= 1 ? 'disabled' : ''}>上一页</button>
     <button id="tkNext" ${tkState.page >= totalPages ? 'disabled' : ''}>下一页</button>`;
  const prev = document.getElementById('tkPrev'), next = document.getElementById('tkNext');
  if (prev) prev.onclick = () => { tkState.page--; tkRenderTable(); };
  if (next) next.onclick = () => { tkState.page++; tkRenderTable(); };

  tbl.querySelectorAll('th.sortable').forEach(th => {
    th.onclick = () => {
      const k = th.dataset.key;
      if (tkState.sortKey === k) tkState.sortDir *= -1;
      else { tkState.sortKey = k; tkState.sortDir = 1; }
      tkState.page = 1; tkRenderTable();
    };
  });

  // 备注：点击单元格进入内联编辑
  tbl.querySelectorAll('.remark-cell').forEach(cell => {
    cell.onclick = () => startRemarkEdit(cell);
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 任务行备注的内联编辑器
function startRemarkEdit(cell) {
  if (cell.dataset.editing === '1') return;
  cell.dataset.editing = '1';
  const taskId = cell.getAttribute('data-task-id');
  const current = cell.getAttribute('data-remark') || '';
  const ta = document.createElement('textarea');
  ta.className = 'remark-inline';
  ta.value = current;
  ta.rows = 2;
  ta.maxLength = 200;
  const save = document.createElement('button');
  save.className = 'btn btn-excel btn-sm';
  save.textContent = '保存';
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-sm';
  cancel.textContent = '取消';
  const wrap = document.createElement('div');
  wrap.className = 'remark-edit';
  wrap.appendChild(ta);
  const row = document.createElement('div');
  row.className = 'remark-edit-actions';
  row.appendChild(save);
  row.appendChild(cancel);
  wrap.appendChild(row);
  cell.textContent = '';
  cell.appendChild(wrap);

  const finish = () => { cell.textContent = ''; cell.dataset.editing = '0'; cell.innerHTML = (cell.getAttribute('data-remark') ? `<span class="remark-text">${escapeHtml(cell.getAttribute('data-remark'))}</span>` : '<span class="remark-empty">＋ 添加备注</span>'); };
  cancel.onclick = e => { e.stopPropagation(); finish(); };
  save.onclick = async e => {
    e.stopPropagation();
    const val = ta.value.trim();
    try {
      await apiJson('/tasks/' + taskId, { remark: val }, 'PUT');
      // 同步更新内存中的任务，避免整表重载打断筛选/分页
      const t = TASKS.find(x => x.id === taskId);
      if (t) { t.remark = val; t.updatedAt = new Date().toISOString(); }
      cell.setAttribute('data-remark', val);
      finish();
      tkRenderTable();
    } catch (err) {
      alert('保存备注失败：' + err.message);
    }
  };
  ta.onkeydown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save.click(); }
    if (e.key === 'Escape') { e.preventDefault(); finish(); }
  };
  setTimeout(() => { ta.focus(); }, 10);
}

// ---------- 任务 增 / 改 / 删 ----------
async function loadTasks() {
  try {
    const data = await apiGet('/tasks');
    if (Array.isArray(data)) return data;
  } catch (e) {
    console.warn('[HR] 任务接口不可用，使用内置数据：', e.message);
  }
  // 回退：把内置甘特数据转成任务结构
  return HR.gantt.map((g, i) => ({
    id: 'T' + (1000 + i), name: g.name, owner: g.owner, team: g.owner || '未指定',
    priority: i % 3 === 0 ? '高' : (i % 3 === 1 ? '中' : '低'),
    status: g.status === 'done' ? '已完成' : (g.status === 'doing' ? '进行中' : '未开始'),
    progress: g.progress, start: '2025-01-01', due: '2025-06-30', hours: 80, remark: '',
  }));
}

function openTaskModal(id) {
  const t = id ? TASKS.find(x => x.id === id) : null;
  document.getElementById('taskModalTitle').textContent = t ? '编辑任务' : '新增任务';
  document.getElementById('t_id').value = t ? t.id : '';
  document.getElementById('t_name').value = t ? t.name : '';
  document.getElementById('t_owner').value = t ? t.owner : '';
  document.getElementById('t_team').value = t ? t.team : (document.getElementById('tkTeamFilter').value || '');
  document.getElementById('t_priority').value = t ? t.priority : '中';
  document.getElementById('t_status').value = t ? t.status : '进行中';
  document.getElementById('t_start').value = t ? (t.start || '') : todayStr();
  document.getElementById('t_due').value = t ? (t.due || '') : '';
  document.getElementById('t_hours').value = t ? (t.hours || '') : '';
  document.getElementById('t_remark').value = t ? (t.remark || '') : '';
  const p = t ? (t.progress || 0) : 0;
  document.getElementById('t_progress').value = p;
  document.getElementById('t_progressVal').textContent = p + '%';
  document.getElementById('taskModal').classList.add('open');
}
function closeTaskModal() { document.getElementById('taskModal').classList.remove('open'); }

function collectTaskForm() {
  return {
    name: document.getElementById('t_name').value.trim(),
    owner: document.getElementById('t_owner').value.trim(),
    team: document.getElementById('t_team').value,
    priority: document.getElementById('t_priority').value,
    status: document.getElementById('t_status').value,
    progress: Number(document.getElementById('t_progress').value) || 0,
    start: document.getElementById('t_start').value,
    due: document.getElementById('t_due').value,
    hours: Number(document.getElementById('t_hours').value) || 0,
    remark: document.getElementById('t_remark').value.trim(),
  };
}

async function submitTaskForm(e) {
  e.preventDefault();
  const payload = collectTaskForm();
  if (!payload.name || !payload.owner) { alert('请填写任务名称与负责人'); return; }
  // 状态与进度一致性
  if (payload.status === '已完成') payload.progress = 100;
  if (payload.status === '未开始') payload.progress = 0;

  const id = document.getElementById('t_id').value;
  try {
    if (id) await apiJson('/tasks/' + id, payload, 'PUT');
    else await apiJson('/tasks', payload, 'POST');
  } catch (err) {
    alert('保存失败：' + err.message);
    return;
  }
  closeTaskModal();
  await refreshTasks();
}

async function deleteTask(id) {
  const t = TASKS.find(x => x.id === id);
  if (!t || !confirm(`确认删除任务「${t.name}」？`)) return;
  try { await apiJson('/tasks/' + id, null, 'DELETE'); }
  catch (e) { alert('删除失败：' + e.message); return; }
  await refreshTasks();
}

function syncTeamOptions() {
  const teams = [...new Set(TASKS.map(t => t.team).filter(Boolean))].sort();
  const sel = document.getElementById('tkTeamFilter');
  const keep = sel.value;
  sel.innerHTML = '<option value="">全部团队</option>' + teams.map(t => `<option value="${t}">${t}</option>`).join('');
  sel.value = teams.includes(keep) ? keep : '';
  document.getElementById('t_team').innerHTML = teams.map(t => `<option value="${t}">${t}</option>`).join('');
}

// 重新加载任务并刷新看板（含 AI 分析）
async function refreshTasks() {
  TASKS = await loadTasks();
  syncTeamOptions();
  tkState.page = 1;
  // 仅在当前处于任务看板时重绘（隐藏容器尺寸为 0，渲染无意义）
  if (currentView === 'tasks') renderTasks();
}

function exportTasksExcel() {
  tkApplyFilters();
  const rows = tkState.filtered.map(t => ({
    '任务名称': t.name, '负责人': t.owner, '团队': t.team, '优先级': t.priority,
    '状态': t.status, '进度(%)': t.progress || 0, '开始日期': t.start || '', '截止日期': t.due || '',
    '计划工时': t.hours || 0, '备注': t.remark || '',
  }));
  if (!rows.length) { alert('当前没有可导出的任务'); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '任务明细');
  XLSX.writeFile(wb, `任务明细_${todayStr()}.xlsx`);
}

// ============ 任务 A4 横版打印报表（甘特图 + 彩色明细） ============
const TK_PRINT_W = 1500;      // 导出渲染像素宽度
const PRINT_COLORS = { '已完成': '#2ec4b6', '进行中': '#4361ee', '未开始': '#b6c0d6', '阻塞': '#ee5a6f' };
const PRINT_PRIO = { '高': '#ee5a6f', '中': '#ff9f43', '低': '#2ec4b6' };

function printLegendHtml() {
  const legend = Object.entries(PRINT_COLORS).map(([k, c]) =>
    `<span class="pk"><i style="background:${c}"></i>${k}</span>`).join('');
  return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;font-size:12px;color:#1f2a44;margin:4px 0 8px;">
    图例　${legend}
    <span style="margin-left:8px;color:#ee5a6f;font-size:12px;">■ 红字/浅红行=逾期</span>
    <span style="color:#ff9f43;font-size:12px;">■ 橙字/浅黄行=临期(≤7天)</span>
  </div>`;
}

// 构建导出用甘特 option
function buildPrintGanttOption(tasks) {
  const valid = tasks.filter(t => d2n(t.start) !== null && d2n(t.due) !== null && d2n(t.due) >= d2n(t.start));
  if (!valid.length) return null;
  const minT = Math.min(...valid.map(t => d2n(t.start)));
  const maxT = Math.max(...valid.map(t => d2n(t.due)));
  const totalDays = Math.max(1, Math.ceil((maxT - minT) / 86400000));
  const toX = s => (d2n(s) - minT) / 86400000;
  const todayN = new Date().getTime();
  const names = valid.map(t => t.name);
  const data = valid.map((t, i) => {
    const yIdx = valid.length - 1 - i;
    return {
      value: [yIdx, toX(t.start), toX(t.due) - toX(t.start), t.progress || 0],
      itemStyle: { color: PRINT_COLORS[t.status] || '#4361ee' },
      t,
    };
  });
  return {
    grid: { left: 250, right: 80, top: 16, bottom: 36 },
    textStyle: { fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif' },
    xAxis: {
      type: 'value', min: 0, max: totalDays,
      axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: '#eef2f9' } },
    },
    yAxis: { type: 'category', data: names.slice().reverse(), axisTick: { show: false },
      axisLine: { lineStyle: { color: '#ccd4e3' } },
      axisLabel: { color: '#1f2a44', fontSize: 12, fontWeight: 600, width: 225, overflow: 'truncate' } },
    series: [{
      type: 'custom',
      renderItem: (params, api) => {
        const catIdx = api.value(0);
        const start = api.coord([api.value(1), catIdx]);
        const end = api.coord([api.value(1) + api.value(2), catIdx]);
        const progEnd = api.coord([api.value(1) + api.value(2) * api.value(3) / 100, catIdx]);
        const height = api.size([0, 1])[1] * 0.42;
        const full = end[0] - start[0];
        const doneW = progEnd[0] - start[0];
        const isDone = data[params.dataIndex].t.status === '已完成';
        return { type: 'group', children: [
          { type: 'rect', shape: { x: start[0], y: start[1] - height / 2, width: full, height, r: 6 }, style: { fill: isDone ? '#d9f5ef' : '#eef2f9' } },
          { type: 'rect', shape: { x: start[0], y: start[1] - height / 2, width: Math.max(doneW, 2), height, r: 6 }, style: { fill: api.visual('color') } },
          { type: 'text', style: { text: api.value(3) + '%', x: end[0] + 8, y: start[1], fill: '#1f2a44', font: 'bold 12px sans-serif', verticalAlign: 'middle' } },
        ]};
      },
      encode: { x: [1, 2], y: 0 }, data,
      markLine: todayN >= minT && todayN <= maxT ? {
        silent: true, symbol: 'none',
        lineStyle: { color: '#ee5a6f', width: 2, type: 'dashed' },
        label: { formatter: '今天', position: 'end', color: '#ee5a6f', fontSize: 11 },
        data: [{ xAxis: (todayN - minT) / 86400000 }],
      } : undefined,
    }],
  };
}

// 彩色任务明细表 HTML
function buildPrintTableHtml(tasks) {
  const today = todayStr();
  const order = ['进行中', '未开始', '阻塞', '已完成'];
  const sorted = tasks.slice().sort((a, b) => {
    const ia = order.indexOf(a.status) === -1 ? 99 : order.indexOf(a.status);
    const ib = order.indexOf(b.status) === -1 ? 99 : order.indexOf(b.status);
    return ia - ib || String(a.due || '9999-99').localeCompare(String(b.due || '9999-99'));
  });
  const head = '<tr style="background:#f0f3fa;">' +
    '<th style="width:210px;text-align:left">任务名称</th><th>负责人</th><th>团队</th><th>优先级</th>' +
    '<th>状态</th><th>进度</th><th>开始</th><th>截止</th><th style="width:110px">剩余</th><th style="width:240px">备注</th></tr>';
  const rows = sorted.map(t => {
    const h = taskHealth(t, today);
    let remain = '—', rc = '#9aa4b2';
    if (h.daysLeft !== null && !h.done) {
      if (h.daysLeft < 0) { remain = '逾期 ' + Math.abs(h.daysLeft) + ' 天'; rc = '#ee5a6f'; }
      else if (h.daysLeft <= 7) { remain = '临期 ' + h.daysLeft + ' 天'; rc = '#ff9f43'; }
      else { remain = h.daysLeft + ' 天'; rc = '#12817a'; }
    } else if (h.done) remain = '已交付';
    const sc = PRINT_COLORS[t.status] || '#4361ee';
    const bg = h.overdue ? '#fff4f4' : (h.daysLeft !== null && !h.done && h.daysLeft >= 0 && h.daysLeft <= 7 ? '#fffaf0' : '#ffffff');
    return '<tr style="background:' + bg + '">' +
      '<td style="border-left:6px solid ' + sc + ';font-weight:600;">' + escapeHtml(t.name) + '</td>' +
      '<td>' + escapeHtml(t.owner || '') + '</td><td>' + escapeHtml(t.team || '') + '</td>' +
      '<td><b style="color:' + (PRINT_PRIO[t.priority] || '#8a94a6') + '">' + escapeHtml(t.priority || '') + '</b></td>' +
      '<td><span style="display:inline-block;background:' + sc + ';color:#fff;border-radius:10px;padding:1px 10px;font-size:11px;">' + escapeHtml(t.status || '') + '</span></td>' +
      '<td>' + (t.progress || 0) + '%</td>' +
      '<td>' + (t.start || '—') + '</td><td>' + (t.due || '—') + '</td>' +
      '<td><b style="color:' + rc + '">' + remain + '</b></td>' +
      '<td style="font-size:11px;color:#4a5568;">' + escapeHtml((t.remark || '').replace(/\n/g, ' ')) + '</td></tr>';
  }).join('');
  return '<table style="width:100%;border-collapse:collapse;font-size:11.5px;color:#1f2a44;table-layout:fixed;">' +
    head + rows + '</table>';
}

function addHiddenBox(html, w) {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:-99999px;top:0;width:' + w + 'px;background:#fff;';
  el.setAttribute('data-tkprint', '1');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

// 生成标题+图例+甘特 段 HTML
function buildGanttSectionHtml(list, hasGantt, ganttH) {
  return `<div style="padding:16px 22px 6px;background:#fff;font-family:'PingFang SC','Microsoft YaHei',sans-serif;">
    <div style="font-size:21px;font-weight:700;color:#1f2a44;">📋 项目任务进度报表</div>
    <div style="font-size:12px;color:#6b7892;margin:3px 0 8px;">共 ${list.length} 项任务　·　生成时间：${todayStr()}</div>
    ${printLegendHtml()}
    ${hasGantt ? `<div id="tkPrintGantt" style="width:${TK_PRINT_W - 44}px;height:${ganttH}px;"></div>` : '<div style="padding:10px 0;color:#9aa4b2;">（暂无可绘制的甘特任务，需填写开始/截止日期）</div>'}
  </div>`;
}

function buildTableSectionHtml(list) {
  return `<div style="padding:4px 22px 18px;background:#fff;font-family:'PingFang SC','Microsoft YaHei',sans-serif;">
    <div style="font-size:14px;font-weight:700;color:#1f2a44;padding:2px 0 6px;">任务明细（按状态分组 · 节点着色）</div>
    ${buildPrintTableHtml(list)}
  </div>`;
}

// jsPDF 分页排版多个 canvas 片段
function composePrintPdf(canvases) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 20;
  const contentW = pw - m * 2;
  const headerBand = 26;   // 顶部标题行占用
  // 第一页页眉
  let cursorY = headerBand;
  doc.setFontSize(9); doc.setTextColor(110, 120, 146); doc.setFont(undefined, 'normal');
  doc.text('任务进度报表 · ' + todayStr(), m, 14);

  canvases.forEach(img => {
    const ratio = img.height / img.width;
    const w = contentW;
    const fullH = w * ratio;
    const pxPerPt = img.width / w;
    const usableH = ph - headerBand - 8;
    if (fullH <= usableH) {
      if (cursorY + fullH > ph - 8) { doc.addPage(); cursorY = headerBand; }
      doc.addImage(img.toDataURL('image/png'), 'PNG', m, cursorY, w, fullH);
      cursorY += fullH + 6;
    } else {
      // 按页高切条
      const bandPx = Math.floor(usableH * pxPerPt);
      let yPx = 0;
      while (yPx < img.height) {
        const srcH = Math.min(bandPx, img.height - yPx);
        if (cursorY + srcH / pxPerPt > ph - 8) { doc.addPage(); cursorY = headerBand; }
        const tmp = document.createElement('canvas');
        tmp.width = img.width; tmp.height = srcH;
        const c = tmp.getContext('2d');
        c.fillStyle = '#ffffff'; c.fillRect(0, 0, tmp.width, srcH);
        c.drawImage(img, 0, yPx, img.width, srcH, 0, 0, img.width, srcH);
        doc.addImage(tmp.toDataURL('image/png'), 'PNG', m, cursorY, w, srcH / pxPerPt);
        cursorY += srcH / pxPerPt + 4;
        yPx += srcH;
      }
    }
  });
  doc.save(`任务进度报表_${todayStr()}.pdf`);
}

async function exportTasksPdf() {
  const btn = document.getElementById('btnTaskPdf');
  if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }
  try {
    tkApplyFilters();
    const list = tkState.filtered.slice();
    if (!list.length) { alert('当前没有可导出的任务'); return; }
    const hasGantt = list.some(t => d2n(t.start) !== null && d2n(t.due) !== null && d2n(t.due) >= d2n(t.start));
    const ganttH = hasGantt ? Math.max(320, 100 + list.length * 34) : 0;

    // 1) 页眉+甘特段
    const gEl = addHiddenBox(buildGanttSectionHtml(list, hasGantt, ganttH), TK_PRINT_W);
    const canvases = [];
    if (hasGantt) {
      const gbox = document.getElementById('tkPrintGantt');
      const opt = buildPrintGanttOption(list);
      const chart = echarts.init(gbox);
      chart.setOption(opt);
      await new Promise(r => setTimeout(r, 400));
    }
    const gCv = await html2canvas(gEl, { scale: 1.2, backgroundColor: '#ffffff', useCORS: true });
    canvases.push(gCv);
    // 2) 明细表段
    const tEl = addHiddenBox(buildTableSectionHtml(list), TK_PRINT_W);
    const tCv = await html2canvas(tEl, { scale: 1.2, backgroundColor: '#ffffff', useCORS: true });
    canvases.push(tCv);

    gEl.remove(); tEl.remove();
    composePrintPdf(canvases);
  } catch (e) {
    console.error(e);
    alert('生成报表失败：' + (e && e.message ? e.message : e));
  } finally {
    // 清理残留的打印容器
    document.querySelectorAll('[data-tkprint]').forEach(n => n.remove());
    if (btn) { btn.disabled = false; btn.textContent = '🖨 A4 打印版'; }
  }
}

async function ensureTasksLoaded() {
  if (tasksInited) return;
  TASKS = await loadTasks();
  syncTeamOptions();
  await loadAiConfig();
  initSmartEntry();
  ['tkSearch'].forEach(id => document.getElementById(id).addEventListener('input', () => { tkState.page = 1; tkRenderTable(); }));
  document.getElementById('tasksKpis').addEventListener('click', e => {
    const chip = e.target.closest('.kpi-clickable');
    if (chip) { const st = chip.dataset.status; if (st) gotoTaskStatus(st); }
  });
  ['tkTeamFilter', 'tkStatusFilter', 'tkPriorityFilter'].forEach(id => document.getElementById(id).addEventListener('change', () => { tkState.page = 1; tkRenderTable(); }));
  document.getElementById('btnTaskAdd').onclick = () => openTaskModal(null);
  document.getElementById('btnTaskExcel').onclick = exportTasksExcel;
  document.getElementById('btnTaskPdf').onclick = exportTasksPdf;
  document.getElementById('btnAiRefresh').onclick = () => { aiState.source = 'rule'; updateAiBadge(); refreshTasks(); };
  document.getElementById('btnAiDeep').onclick = runDeepAnalysis;
  document.getElementById('btnAiSettings').onclick = openAiSettings;
  document.getElementById('aiModalClose').onclick = closeAiSettings;
  document.getElementById('aiCancel').onclick = closeAiSettings;
  document.getElementById('aiSaveBtn').onclick = saveAiConfig;
  document.getElementById('aiTestBtn').onclick = testAiConnection;
  document.getElementById('aiProvider').onchange = onProviderChange;
  document.getElementById('aiModal').addEventListener('click', e => {
    if (e.target.id === 'aiModal') closeAiSettings();
  });
  document.getElementById('taskModalClose').onclick = closeTaskModal;
  document.getElementById('taskCancel').onclick = closeTaskModal;
  document.getElementById('taskForm').onsubmit = submitTaskForm;
  document.getElementById('t_progress').addEventListener('input', e => {
    document.getElementById('t_progressVal').textContent = e.target.value + '%';
  });
  document.getElementById('taskModal').addEventListener('click', e => {
    if (e.target.id === 'taskModal') closeTaskModal();
  });
  tasksInited = true;
}
// ---------- 员工明细（搜索 / 筛选 / 排序 / 分页 / 导出）----------
const EMP_COLS = [
  { key: 'id', label: '工号' }, { key: 'name', label: '姓名' }, { key: 'dept', label: '部门' },
  { key: 'level', label: '职级' }, { key: 'gender', label: '性别' }, { key: 'age', label: '年龄' },
  { key: 'edu', label: '学历' }, { key: 'tenure', label: '司龄(年)' }, { key: 'status', label: '状态' },
  { key: 'salary', label: '月薪(元)' }, { key: 'salaryNet', label: '实发工资(元)' }, { key: 'perf', label: '绩效' }, { key: 'hireDate', label: '入职日期' },
];

let empState = { data: [], filtered: [], page: 1, pageSize: 10, sortKey: 'id', sortDir: 1 };
let empInited = false;

function empApplyFilters() {
  const q = document.getElementById('empSearch').value.trim().toLowerCase();
  const dept = document.getElementById('empDept').value;
  const level = document.getElementById('empLevel').value;
  const gender = document.getElementById('empGender').value;
  const status = document.getElementById('empStatus').value;
  empState.filtered = empState.data.filter(e => {
    if (q && !(e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))) return false;
    if (dept && e.dept !== dept) return false;
    if (level && e.level !== level) return false;
    if (gender && e.gender !== gender) return false;
    if (status && e.status !== status) return false;
    return true;
  });
}

function empRenderTable() {
  empApplyFilters();
  const sorted = empState.filtered.slice().sort((a, b) => {
    let va = a[empState.sortKey], vb = b[empState.sortKey];
    if (typeof va === 'string') { const c = va.localeCompare(vb, 'zh'); return empState.sortDir * (c > 0 ? 1 : c < 0 ? -1 : 0); }
    return empState.sortDir * ((Number(va) || 0) - (Number(vb) || 0));
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / empState.pageSize));
  if (empState.page > totalPages) empState.page = totalPages;
  const start = (empState.page - 1) * empState.pageSize;
  const rows = sorted.slice(start, start + empState.pageSize);

  const t = document.getElementById('empTable');
  const head = '<thead><tr>' + EMP_COLS.map(c =>
    `<th class="sortable" data-key="${c.key}">${c.label}${empState.sortKey === c.key ? (empState.sortDir === 1 ? ' ▲' : ' ▼') : ''}</th>`).join('') + '<th>操作</th></tr></thead>';
  const body = '<tbody>' + rows.map(e => `<tr>
    <td>${e.id}</td><td>${e.name}</td><td>${e.dept}</td><td>${e.level}</td>
    <td>${e.gender}</td><td>${e.age}</td><td>${e.edu}</td><td>${e.tenure}</td>
    <td><span class="tag tag-${e.status}">${e.status}</span></td>
    <td>${(e.salary || 0).toLocaleString()}</td><td>${(e.salaryNet || 0).toLocaleString()}</td><td>${e.perf}</td><td>${e.hireDate}</td>
    <td><button class="row-btn" data-edit="${e.id}">编辑</button><button class="row-btn danger" data-del="${e.id}">删除</button></td></tr>`).join('') + '</tbody>';
  t.innerHTML = head + body;

  document.getElementById('empPager').innerHTML =
    `共 ${sorted.length} 条 · 第 ${empState.page}/${totalPages} 页
     <button id="pgPrev" ${empState.page <= 1 ? 'disabled' : ''}>上一页</button>
     <button id="pgNext" ${empState.page >= totalPages ? 'disabled' : ''}>下一页</button>`;
  document.getElementById('pgPrev').onclick = () => { empState.page--; empRenderTable(); };
  document.getElementById('pgNext').onclick = () => { empState.page++; empRenderTable(); };
  t.querySelectorAll('th.sortable').forEach(th => {
    th.onclick = () => {
      const k = th.dataset.key;
      if (empState.sortKey === k) empState.sortDir *= -1;
      else { empState.sortKey = k; empState.sortDir = 1; }
      empState.page = 1; empRenderTable();
    };
  });
  t.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => { const e = empState.data.find(x => x.id === btn.dataset.edit); openEmpModal(e || null); };
  });
  t.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = () => deleteEmp(btn.dataset.del);
  });
}

async function renderEmployees() {
  if (!empInited) {
    empState.data = EMPLOYEES;
    const deptSel = document.getElementById('empDept');
    DEPTS.forEach(d => deptSel.insertAdjacentHTML('beforeend', `<option value="${d}">${d}</option>`));
    const modalDept = document.getElementById('f_dept');
    DEPTS.forEach(d => modalDept.insertAdjacentHTML('beforeend', `<option value="${d}">${d}</option>`));
    const levels = [...new Set(EMPLOYEES.map(e => e.level))].sort();
    const lvlSel = document.getElementById('empLevel');
    levels.forEach(l => lvlSel.insertAdjacentHTML('beforeend', `<option value="${l}">${l}</option>`));
    ['empSearch', 'empDept', 'empLevel', 'empGender', 'empStatus'].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('input', () => { empState.page = 1; empRenderTable(); });
      el.addEventListener('change', () => { empState.page = 1; empRenderTable(); });
    });
    document.getElementById('btnExcel').onclick = exportEmployeesExcel;
    document.getElementById('btnPdf').onclick = exportEmployeesPdf;
    document.getElementById('btnAdd').onclick = () => openEmpModal(null);
    document.getElementById('btnImport').onclick = () => document.getElementById('empImport').click();
    document.getElementById('empImport').addEventListener('change', importEmployees);
    document.getElementById('empModalClose').onclick = closeEmpModal;
    document.getElementById('empCancel').onclick = closeEmpModal;
    document.getElementById('empForm').addEventListener('submit', submitEmpForm);
    empInited = true;
  }

  const d = empState.data;
  const active = d.filter(e => e.status === '在职').length;
  const trial = d.filter(e => e.status === '试用').length;
  const left = d.filter(e => e.status === '离职').length;
  const avg = Math.round(d.reduce((s, e) => s + e.salary, 0) / d.length);
  document.getElementById('empKpis').innerHTML = kpiHtml([
    { label: '员工总数', value: d.length, delta: active ? `在册 ${active + trial} 人` : '', dir: 'up', icon: '🗂️' },
    { label: '在职', value: active, delta: '', dir: 'up', icon: '✅' },
    { label: '试用', value: trial, delta: '', dir: 'up', icon: '🆕' },
    { label: '离职', value: left, delta: '', dir: 'down', icon: '👋' },
    { label: '平均月薪', value: '¥' + avg.toLocaleString(), delta: '', dir: 'up', icon: '💰' },
  ]);
  empRenderTable();
}

// ----- 录入 / 编辑 / 删除 / 导入 -----
function openEmpModal(emp) {
  const m = document.getElementById('empModal');
  document.getElementById('empModalTitle').textContent = emp ? '编辑员工' : '新增员工';
  document.getElementById('f_id').value = emp ? emp.id : '';
  document.getElementById('f_name').value = emp ? emp.name : '';
  document.getElementById('f_empno').value = emp ? emp.id : '';
  document.getElementById('f_dept').value = emp ? emp.dept : DEPTS[0];
  document.getElementById('f_level').value = emp ? emp.level : 'P5';
  document.getElementById('f_gender').value = emp ? emp.gender : '男';
  document.getElementById('f_age').value = emp ? emp.age : '';
  document.getElementById('f_edu').value = emp ? emp.edu : '本科';
  document.getElementById('f_tenure').value = emp ? emp.tenure : '';
  document.getElementById('f_status').value = emp ? emp.status : '在职';
  document.getElementById('f_salary').value = emp ? (emp.salary ?? '') : '';
  document.getElementById('f_salaryNet').value = emp ? (emp.salaryNet ?? '') : '';
  document.getElementById('f_perf').value = emp ? emp.perf : 'B';
  document.getElementById('f_hireDate').value = emp ? emp.hireDate : '';
  m.classList.add('open');
}
function closeEmpModal() { document.getElementById('empModal').classList.remove('open'); }

function collectEmpForm() {
  return {
    name: document.getElementById('f_name').value.trim(),
    id: document.getElementById('f_empno').value.trim() || undefined,
    dept: document.getElementById('f_dept').value,
    level: document.getElementById('f_level').value,
    gender: document.getElementById('f_gender').value,
    age: Number(document.getElementById('f_age').value) || 0,
    edu: document.getElementById('f_edu').value,
    tenure: Number(document.getElementById('f_tenure').value) || 0,
    status: document.getElementById('f_status').value,
    salary: Number(document.getElementById('f_salary').value) || 0,
    salaryNet: Number(document.getElementById('f_salaryNet').value) || 0,
    perf: document.getElementById('f_perf').value,
    hireDate: document.getElementById('f_hireDate').value || new Date().toISOString().slice(0, 10),
  };
}

function afterMutation() {
  location.href = location.pathname + '?view=employees';
}

async function submitEmpForm(e) {
  e.preventDefault();
  const editId = document.getElementById('f_id').value;
  const body = collectEmpForm();
  if (!body.name) { alert('请填写姓名'); return; }
  try {
    if (editId) {
      await apiJson('/employees/' + editId, body, 'PUT');
    } else {
      if (body.id && EMPLOYEES.some(x => x.id === body.id)) { alert('工号已存在'); return; }
      await apiJson('/employees', body, 'POST');
    }
    closeEmpModal();
    afterMutation();
  } catch (err) {
    alert('保存失败：' + err.message);
  }
}

async function deleteEmp(id) {
  if (!confirm('确定删除该员工（' + id + '）？此操作不可撤销。')) return;
  try {
    await apiJson('/employees/' + id, null, 'DELETE');
    afterMutation();
  } catch (err) {
    alert('删除失败：' + err.message);
  }
}

const HEADER_MAP = {
  '工号': 'id', '编号': 'id', '姓名': 'name', '名字': 'name', '名称': 'name', '部门': 'dept', '职级': 'level',
  '性别': 'gender', '年龄': 'age', '学历': 'edu', '司龄': 'tenure', '司龄(年)': 'tenure', '工龄': 'tenure',
  '状态': 'status', '月薪': 'salary', '薪资': 'salary', '工资': 'salary', '月薪(元)': 'salary', '绩效': 'perf',
  '实发': 'salaryNet', '实发工资': 'salaryNet', '实发工资(元)': 'salaryNet',
  '入职日期': 'hireDate', '入职时间': 'hireDate', '入职': 'hireDate',
};

function excelDateToStr(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = new Date((v - 25569) * 86400000);
    return isNaN(d) ? String(v) : d.toISOString().slice(0, 10);
  }
  return String(v || '').slice(0, 10);
}

async function importEmployees(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const mapped = rows.map(r => {
      const o = {};
      Object.keys(r).forEach(k => {
        const key = HEADER_MAP[String(k).trim()];
        if (key) o[key] = r[k];
      });
      return {
        name: String(o.name || '').trim(),
        id: o.id ? String(o.id).trim() : undefined,
        dept: String(o.dept || '未分配').trim(),
        level: String(o.level || 'P5').trim(),
        gender: o.gender === '女' ? '女' : '男',
        age: Number(o.age) || 0,
        edu: String(o.edu || '本科').trim(),
        tenure: Number(o.tenure) || 0,
        status: o.status || '在职',
        salary: Number(o.salary) || 0,
        salaryNet: Number(o.salaryNet) || 0,
        perf: String(o.perf || 'B').trim(),
        hireDate: excelDateToStr(o.hireDate),
      };
    }).filter(o => o.name);
    if (!mapped.length) { alert('未识别到有效员工数据（需包含“姓名”列）'); return; }
    const res = await apiJson('/employees/bulk', mapped, 'POST');
    alert('成功导入 ' + res.imported + ' 条员工记录');
    e.target.value = '';
    afterMutation();
  } catch (err) {
    alert('导入失败：' + err.message);
  }
}

// ============================================================
//  薪酬工资表 Excel 解析（针对"双层表头"工资表模板）
//  模板结构：第1行合并标题「YYYY年M月工资表」；第2行大栏目；第3行子字段名；第4行起数据。
//  不依赖列名文本，而用「列位置映射」逐行读取，天然兼容列名细节变化。
// ============================================================
// 列位置(0-based) -> payroll 字段名（对齐后端 PAYROLL_NUM_FIELDS）
const SALARY_NUM_COLS = {
  3: 'basic', 4: 'secrecy', 5: 'perf', 6: 'postAllowance', 7: 'otherAllowance', 8: 'gross',
  9: 'lateDeduct', 10: 'sickDeduct', 11: 'affairDeduct', 12: 'otherDeduct', 13: 'deductTotal', 14: 'payable',
  15: 'pension', 16: 'medical', 17: 'unemploy', 18: 'housingFund', 19: 'socialTotal',
  20: 'childEdu', 21: 'continueEdu', 22: 'interest', 23: 'rent', 24: 'infantCare', 25: 'parentCare', 26: 'specialDeductTotal',
  27: 'taxableThis', 28: 'taxableCum', 29: 'taxThis', 30: 'taxCum', 31: 'taxPaid', 32: 'netPay',
};
const SALARY_DIRTY_NAMES = new Set(['合计', '小计', '总计', '制表人', '审核人', '复核人', '审批人', '单位', '备注', '合计（人民币元）']);
function cleanCell(ws, r, c) {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  if (cell === undefined || cell.v === undefined || cell.v === null) return '';
  if (cell.t === 'n') return cell.v;            // 数字原样返回
  return String(cell.v).trim();
}
function numVal(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }

// 解析工资表 Excel，返回 { period: 'YYYY-MM'|null, rows: [...] }
async function parsePayrollExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  // 1) 标题行(第1行,0-based r0)解析期间
  const title = cleanCell(ws, 0, 0);
  const m = String(title).match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
  let period = null;
  if (m) period = m[1] + '-' + String(Number(m[2])).padStart(2, '0');

  // 2) 数据从第4行(0-based r3)起；剔除合计/页脚/空行
  const rows = [];
  for (let r = 3; r <= range.e.r; r++) {
    const name = cleanCell(ws, r, 2);   // C 姓名
    const dept = cleanCell(ws, r, 1);   // B 部门
    if (!name) continue;                // 空行
    const nm = String(name).replace(/[\s\n\u3000]/g, '');
    // 合计/页脚等杂质行：姓名本身是合计类文本，或姓名是"制表人："前缀
    if (SALARY_DIRTY_NAMES.has(nm) || /^(制表|审核|复核|审批)/.test(nm) || nm.includes('制表人')) continue;
    const row = { seq: rows.length + 1, dept, name: nm };
    Object.keys(SALARY_NUM_COLS).forEach(c => { row[SALARY_NUM_COLS[c]] = numVal(cleanCell(ws, r, Number(c))); });
    rows.push(row);
  }
  return { period, rows };
}

// 手动选择月份（标题无法识别时），返回 'YYYY-MM' 或 null
function askPayrollPeriod() {
  const now = new Date();
  const y = prompt('未能在工资表标题中识别到月份，请输入年份（如 2026）：', String(now.getFullYear()));
  if (!y) return null;
  const mo = prompt('请输入月份（1-12）：', String(now.getMonth() + 1));
  if (!mo) return null;
  const Y = Number(y), M = Number(mo);
  if (!Y || !M || M < 1 || M > 12) { alert('年份或月份无效'); return null; }
  return Y + '-' + String(M).padStart(2, '0');
}

// 导入工资表后的主流程：解析 -> 确认期间/覆盖 -> POST /payroll/import -> 刷新
async function handleSalaryImport(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const { period: autoPeriod, rows } = await parsePayrollExcel(file);
    if (!rows.length) { alert('未能从该文件中解析出有效的工资记录（需包含“姓名”“部门”等列）'); e.target.value = ''; return; }
    let period = autoPeriod;
    if (!period) {
      period = askPayrollPeriod();
      if (!period) { e.target.value = ''; return; }
    }
    // 若该期间已有数据，提示覆盖（按期间替换，不影响其它月份）
    if (PAYROLL_PERIODS.includes(period) && PAYROLL.some(p => p.period === period)) {
      if (!confirm('期间 ' + period.replace('-', '年') + '月 已有 ' + PAYROLL.filter(p => p.period === period).length + ' 条记录，导入将覆盖该期间的旧数据，是否继续？')) { e.target.value = ''; return; }
    }
    const res = await apiJson('/payroll/import', { period, rows }, 'POST');
    // 弹提示
    let msg = '成功导入 ' + period.replace('-', '年') + '月 工资表：' + res.inserted + ' 条记录';
    if (res.removed) msg += '（覆盖旧 ' + res.removed + ' 条）';
    if (res.linked) msg += '\n已同步更新员工花名册月薪 ' + res.linked + ' 人';
    if (res.unmatched) msg += '\n' + res.unmatched + ' 人在花名册未匹配到（可在员工明细中手动核对）';
    if (res.ambiguous) msg += '\n' + res.ambiguous + ' 人因重名无法确定被跳过';
    alert(msg);
    e.target.value = '';
    // 刷新数据并切到该期间（保持停留在薪酬驾驶舱）
    PAYROLL_PERIOD = period;
    await reloadSalaryData();
  } catch (err) {
    alert('导入失败：' + err.message);
    e.target.value = '';
  }
}

async function apiJson(path, body, method) {
  const opt = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
  if (body !== null) opt.body = JSON.stringify(body);
  const res = await fetch(CONFIG.apiBase + '/api' + path, opt);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}

// ----- 导出 -----
function exportEmployeesExcel() {
  const rows = empState.filtered.map(e => ({
    '工号': e.id, '姓名': e.name, '部门': e.dept, '职级': e.level, '性别': e.gender,
    '年龄': e.age, '学历': e.edu, '司龄(年)': e.tenure, '状态': e.status,
    '月薪(元)': e.salary, '实发工资(元)': e.salaryNet || 0, '绩效': e.perf, '入职日期': e.hireDate,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '员工明细');
  XLSX.writeFile(wb, `员工明细_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportEmployeesPdf() {
  const { jsPDF } = window.jspdf;
  const el = document.getElementById('empTable');
  html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then(canvas => {
    const imgData = canvas.toDataURL('image/png');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    const maxW = pageW - margin * 2;
    const ratio = canvas.height / canvas.width;
    let imgW = maxW;
    let imgH = maxW * ratio;
    if (imgH > pageH - 70 - margin) {
      imgH = pageH - 70 - margin;
      imgW = imgH / ratio;
    }
    doc.setFontSize(14);
    doc.text('员工明细报表', margin, 28);
    doc.addImage(imgData, 'PNG', margin, 44, imgW, imgH);
    doc.save(`员工明细_${new Date().toISOString().slice(0, 10)}.pdf`);
  });
}

// ---------- 视图切换 ----------
const renderers = {
  overview: renderOverview,
  personnel: renderPersonnel,
  salary: renderSalary,
  tasks: renderTasks,
  employees: renderEmployees,
};
const rendered = { overview: false, personnel: false, salary: false, tasks: false, employees: false };

async function switchView(view) {
  currentView = view;

  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(s => s.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');

  const titles = {
    overview: ['数据总览', '全公司人力资源核心指标概览'],
    personnel: ['人员看板', '员工结构、流动与分布分析'],
    salary: ['薪酬驾驶舱', '成本构成、部门对比、实发与税负分析'],
    tasks: ['任务进度看板', '重点工作进度与交付追踪'],
    employees: ['员工明细', '员工搜索、筛选、排序与导出'],
  };
  document.getElementById('viewTitle').textContent = titles[view][0];
  document.getElementById('viewSub').textContent = titles[view][1];

  // 任务/薪酬看板依赖后端数据，需异步加载后再渲染（此时容器已可见，尺寸正确）
  if (view === 'tasks') {
    await ensureTasksLoaded();
    renderTasks();
    rendered.tasks = true;
  } else if (view === 'salary') {
    initSalaryControls();
    await renderSalary();
    rendered.salary = true;
  } else if (!rendered[view]) {
    renderers[view]();
    rendered[view] = true;
  }

  requestAnimationFrame(() => {
    Object.values(charts).forEach(c => c.resize());
  });
}

// ---------- 初始化 ----------
async function boot() {
  const params = new URLSearchParams(location.search);
  const startView = params.get('view') || 'overview';

  try {
    EMPLOYEES = await loadEmployees();
  } catch (e) {
    EMPLOYEES = HR.employees;
  }
  AGG = computeAggregates(EMPLOYEES);

  switchView(startView);
  document.getElementById('footTotal').textContent = AGG.total.toLocaleString();

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.getElementById('periodSelect').addEventListener('change', () => {
    Object.values(charts).forEach(c => c.resize());
  });

  window.addEventListener('resize', () => Object.values(charts).forEach(c => c.resize()));
}

document.addEventListener('DOMContentLoaded', boot);
