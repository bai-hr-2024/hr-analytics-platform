// ============================================================
//  人力资源分析平台 - 模拟数据 (Mock Data)
//  说明：以下数据用于可视化演示，不对应任何真实企业。
// ============================================================

const DEPTS = ['研发部', '产品部', '市场部', '销售部', '人力资源部', '财务部', '运营部'];

const HR = {
  // ---- 全公司核心指标 ----
  overviewKpis: [
    { label: '在职员工总数', value: '1,284', delta: '+3.2%', dir: 'up', icon: '👥' },
    { label: '本季度离职率', value: '4.1%', delta: '-0.6pt', dir: 'up', icon: '📉' },
    { label: '月均薪资', value: '¥18,640', delta: '+2.4%', dir: 'up', icon: '💰' },
    { label: '任务完成率', value: '87.5%', delta: '+5.1%', dir: 'up', icon: '✅' },
    { label: '人均效能指数', value: '112', delta: '+8', dir: 'up', icon: '⚡' },
  ],

  // ---- 各部门人数 ----
  deptHeadcount: DEPTS.map((d, i) => ({
    dept: d,
    count: [412, 138, 96, 224, 38, 32, 344][i],
  })),

  // ---- 性别 / 层级结构 ----
  gender: [
    { name: '男性', value: 712 },
    { name: '女性', value: 572 },
  ],
  level: [
    { name: '高管', value: 18 },
    { name: '中层管理', value: 126 },
    { name: '高级专员', value: 318 },
    { name: '专员', value: 642 },
    { name: '实习生', value: 180 },
  ],

  // ---- 近8季度人数与离职率 ----
  trendQuarters: ['23Q3', '23Q4', '24Q1', '24Q2', '24Q3', '24Q4', '25Q1', '25Q2'],
  trendHeadcount: [1098, 1120, 1156, 1180, 1202, 1231, 1244, 1284],
  trendAttrition: [5.3, 5.0, 4.8, 4.6, 4.9, 4.7, 4.7, 4.1],

  // ---- 任务概览 ----
  taskOverview: [
    { name: '已完成', value: 642 },
    { name: '进行中', value: 168 },
    { name: '未开始', value: 34 },
    { name: '已逾期', value: 26 },
  ],

  // =================== 人员看板 ===================
  personnelKpis: [
    { label: '在职员工', value: '1,284', delta: '+40', dir: 'up', icon: '👥' },
    { label: '本季入职', value: '96', delta: '+12', dir: 'up', icon: '🆕' },
    { label: '本季离职', value: '52', delta: '-8', dir: 'up', icon: '👋' },
    { label: '平均司龄', value: '3.6 年', delta: '+0.2', dir: 'up', icon: '⏳' },
    { label: '平均年龄', value: '31.2 岁', delta: '-0.3', dir: 'down', icon: '🎂' },
  ],

  headcountYears: ['2021', '2022', '2023', '2024', '2025'],
  headcountHired: [186, 214, 243, 261, 268],
  headcountLeft: [72, 86, 95, 90, 96],

  ageGroups: [
    { name: '20-25岁', value: 286 },
    { name: '26-30岁', value: 392 },
    { name: '31-35岁', value: 318 },
    { name: '36-40岁', value: 176 },
    { name: '41-45岁', value: 72 },
    { name: '46岁以上', value: 40 },
  ],

  education: [
    { name: '博士', value: 24 },
    { name: '硕士', value: 286 },
    { name: '本科', value: 742 },
    { name: '大专', value: 198 },
    { name: '其他', value: 34 },
  ],

  deptStack: DEPTS.map((d, i) => ({
    dept: d,
    active: [400, 132, 92, 218, 36, 31, 332][i],
    left: [12, 6, 4, 6, 2, 1, 12][i],
  })),

  tenureGroups: [
    { name: '<1年', value: 264 },
    { name: '1-3年', value: 412 },
    { name: '3-5年', value: 318 },
    { name: '5-10年', value: 226 },
    { name: '>10年', value: 64 },
  ],

  deptTable: DEPTS.map((d, i) => ({
    dept: d,
    count: [412, 138, 96, 224, 38, 32, 344][i],
    gender: ['65/347', '78/60', '42/54', '128/96', '12/26', '14/18', '210/134'][i],
    avgAge: [30.4, 31.8, 32.5, 33.1, 34.2, 35.0, 29.8][i],
    avgTenure: [3.2, 4.1, 3.8, 4.5, 5.2, 6.1, 2.8][i],
    attrition: ['2.9%', '4.3%', '4.2%', '2.7%', '5.3%', '3.1%', '3.6%'][i],
  })),

  // =================== 薪资看板 ===================
  salaryKpis: [
    { label: '月均薪资', value: '¥18,640', delta: '+2.4%', dir: 'up', icon: '💰' },
    { label: '薪资总额/月', value: '¥23.9M', delta: '+3.0%', dir: 'up', icon: '📊' },
    { label: '薪资占营收比', value: '28.4%', delta: '-1.1%', dir: 'up', icon: '📉' },
    { label: '最高部门均薪', value: '¥24,820', delta: '+1.8%', dir: 'up', icon: '🏆' },
    { label: '人力成本同比', value: '+11.2%', delta: '+1.2%', dir: 'up', icon: '📈' },
  ],

  salaryHist: [
    { range: '<8K', value: 86 },
    { range: '8-12K', value: 248 },
    { range: '12-16K', value: 372 },
    { range: '16-20K', value: 296 },
    { range: '20-25K', value: 168 },
    { range: '25-30K', value: 74 },
    { range: '>30K', value: 40 },
  ],

  deptAvgSalary: DEPTS.map((d, i) => ({
    dept: d,
    avg: [24820, 21640, 15420, 18260, 13240, 14680, 12860][i],
  })),

  salaryLevel: [
    { level: 'P4', count: 314 },
    { level: 'P5', count: 428 },
    { level: 'P6', count: 286 },
    { level: 'P7', count: 168 },
    { level: 'P8', count: 64 },
    { level: 'M1+', count: 24 },
  ],

  budgetMonths: ['1月', '2月', '3月', '4月', '5月', '6月'],
  budgetPlan: [21.8, 22.1, 22.4, 23.0, 23.2, 23.6],
  budgetActual: [22.3, 21.9, 22.6, 23.1, 23.4, 23.9],

  salaryTable: DEPTS.map((d, i) => ({
    dept: d,
    base: [16200, 14800, 9800, 11200, 8600, 9400, 8200][i],
    perf: [6400, 4800, 4200, 5600, 3200, 3800, 3400][i],
    allowance: [2220, 2040, 1420, 1460, 1440, 1480, 1260][i],
    total: [24820, 21640, 15420, 18260, 13240, 14680, 12860][i],
  })),

  // =================== 任务进度看板 ===================
  tasksKpis: [
    { label: '进行中任务', value: '870', delta: '+46', dir: 'up', icon: '🚀' },
    { label: '完成率', value: '87.5%', delta: '+5.1%', dir: 'up', icon: '✅' },
    { label: '逾期任务', value: '26', delta: '-9', dir: 'up', icon: '⚠️' },
    { label: '平均周期', value: '8.4 天', delta: '-0.6', dir: 'up', icon: '⏱️' },
    { label: '按时交付率', value: '91.2%', delta: '+3.4%', dir: 'up', icon: '🎯' },
  ],

  taskStatus: [
    { name: '已完成', value: 642 },
    { name: '进行中', value: 168 },
    { name: '待开始', value: 34 },
    { name: '已逾期', value: 26 },
  ],

  teamCompletion: [
    { team: '研发一部', rate: 92 },
    { team: '研发二部', rate: 88 },
    { team: '产品组', rate: 95 },
    { team: '市场组', rate: 81 },
    { team: '销售组', rate: 84 },
    { team: '运营组', rate: 90 },
    { team: '职能组', rate: 79 },
  ],

  taskTrendMonths: ['1月', '2月', '3月', '4月', '5月', '6月'],
  taskDelivered: [112, 124, 138, 96, 142, 130],
  taskPlanned: [120, 130, 140, 110, 150, 138],

  taskPriority: [
    { name: '紧急高优', value: 96 },
    { name: '高优', value: 248 },
    { name: '中优', value: 362 },
    { name: '低优', value: 164 },
  ],

  // 甘特图数据：重点工作任务进度（按月进度）
  gantt: [
    { name: '核心系统重构', owner: '研发一部', start: 0, duration: 5, progress: 100, status: 'done' },
    { name: '移动端 3.0 发布', owner: '研发二部', start: 1, duration: 4, progress: 75, status: 'doing' },
    { name: '用户增长专项', owner: '市场组', start: 0, duration: 6, progress: 60, status: 'doing' },
    { name: 'Q2 销售冲刺', owner: '销售组', start: 2, duration: 4, progress: 40, status: 'doing' },
    { name: '数据中台建设', owner: '研发一部', start: 3, duration: 5, progress: 25, status: 'doing' },
    { name: '组织架构调整', owner: '职能组', start: 0, duration: 2, progress: 100, status: 'done' },
    { name: '新办公室搬迁', owner: '运营组', start: 4, duration: 2, progress: 0, status: 'todo' },
    { name: '人才盘点项目', owner: '人力资源部', start: 1, duration: 3, progress: 100, status: 'done' },
  ],
};

// ============================================================
//  员工明细数据生成（模拟，约 160 条样本）
//  说明：真实部署时可替换为后端接口返回的员工列表。
// ============================================================
(function generateEmployees() {
  const surnames = ['王','李','张','刘','陈','杨','赵','黄','周','吴','徐','孙','胡','朱','高','林','何','郭','马','罗','梁','宋','郑','谢'];
  const givens = ['伟','芳','娜','秀英','敏','静','丽','强','磊','军','洋','勇','艳','杰','娟','涛','明','超','秀兰','霞','平','刚','桂英','宇','婷','欣','浩','璐','睿','佳'];
  const levels = ['P4','P5','P6','P7','P8','M1','M2'];
  const levelFactor = { P4: 0.72, P5: 0.86, P6: 1.0, P7: 1.22, P8: 1.55, M1: 1.35, M2: 1.7 };
  const edus = ['本科','硕士','博士','大专'];
  const statuses = ['在职','在职','在职','在职','在职','在职','试用','离职'];
  const perfs = ['S','A','A','B','B','B','C'];

  // 固定种子随机，保证每次刷新数据稳定
  let seed = 20250321;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const randInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));

  const employees = [];
  let seq = 1000;

  HR.deptHeadcount.forEach((d, di) => {
    const dept = d.dept;
    const avg = HR.deptAvgSalary[di].avg;
    const n = Math.max(8, Math.round(d.count / 8)); // 取约 1/8 作为样本
    for (let i = 0; i < n; i++) {
      const level = pick(levels);
      const gender = pick(['男', '女']);
      const age = randInt(22, 53);
      const tenure = pick(['离职']) === '离职' ? randInt(0, 3) : randInt(0, 12);
      const status = pick(statuses);
      const edu = pick(edus);
      const perf = pick(perfs);
      let salary = Math.round(avg * levelFactor[level] * (0.85 + rnd() * 0.3) / 100) * 100;
      salary = Math.max(6000, salary);
      const hireYear = 2025 - tenure;
      const hireDate = `${hireYear}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`;
      const name = pick(surnames) + pick(givens);
      employees.push({
        id: 'E' + (seq++),
        name,
        dept,
        level,
        gender,
        age,
        edu,
        tenure,
        status,
        salary,
        perf,
        hireDate,
      });
    }
  });

  HR.employees = employees;
})();
