// ============================================================
//  人力资源分析平台 —— 后端服务
//  - 提供 /api 接口对员工数据进行持久化（JSON 文件存储，无需原生依赖）
//  - 同时托管前端静态资源（index.html 等）
//  说明：生产环境可替换为数据库（Postgres/MySQL），接口契约不变。
// ============================================================
const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
// 数据目录可用环境变量覆盖（便于 Docker/平台挂载持久卷，默认 ./data）
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'employees.json');
const TASK_FILE = path.join(DATA_DIR, 'tasks.json');
const PAYROLL_FILE = path.join(DATA_DIR, 'payroll.json');
const SEED_FILE = path.join(__dirname, 'seed.json');
const TASK_SEED_FILE = path.join(__dirname, 'taskSeed.json');
const PAYROLL_SEED_FILE = path.join(__dirname, 'payrollSeed.json');
const AI_CONFIG_FILE = path.join(DATA_DIR, 'ai-config.json');

// 默认 LLM 配置（OpenAI 兼容协议，覆盖国内外主流厂商）
const AI_DEFAULTS = {
  enabled: false,
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: '',
  temperature: 0.3,
  timeoutMs: 60000,
};

// 厂商预设，便于前端下拉选择
const AI_PRESETS = {
  deepseek:  { name: 'DeepSeek',      baseUrl: 'https://api.deepseek.com/v1',                    model: 'deepseek-chat' },
  openai:    { name: 'OpenAI',        baseUrl: 'https://api.openai.com/v1',                      model: 'gpt-4o-mini' },
  qwen:      { name: '通义千问',       baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  zhipu:     { name: '智谱 GLM',       baseUrl: 'https://open.bigmodel.cn/api/paas/v4',           model: 'glm-4-flash' },
  moonshot:  { name: 'Kimi',          baseUrl: 'https://api.moonshot.cn/v1',                     model: 'moonshot-v1-8k' },
  hunyuan:   { name: '腾讯混元',       baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',        model: 'hunyuan-turbo' },
  custom:    { name: '自定义',         baseUrl: '',                                               model: '' },
};

function readAiConfig() {
  try { return { ...AI_DEFAULTS, ...JSON.parse(fs.readFileSync(AI_CONFIG_FILE, 'utf8')) }; }
  catch (e) { return { ...AI_DEFAULTS }; }
}
function writeAiConfig(cfg) { fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(cfg, null, 2)); }
function maskKey(k) {
  if (!k) return '';
  if (k.length <= 10) return k.slice(0, 2) + '***';
  return k.slice(0, 6) + '***' + k.slice(-4);
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const seed = fs.existsSync(SEED_FILE) ? JSON.parse(fs.readFileSync(SEED_FILE, 'utf8')) : [];
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2));
    console.log(`[HR] 已用种子数据初始化：${seed.length} 条员工`);
  }
  if (!fs.existsSync(TASK_FILE)) {
    const seed = fs.existsSync(TASK_SEED_FILE) ? JSON.parse(fs.readFileSync(TASK_SEED_FILE, 'utf8')) : [];
    fs.writeFileSync(TASK_FILE, JSON.stringify(resolveTaskDates(seed), null, 2));
    console.log(`[HR] 已用种子数据初始化：${seed.length} 条任务`);
  }
  if (!fs.existsSync(PAYROLL_FILE)) {
    const seed = fs.existsSync(PAYROLL_SEED_FILE) ? JSON.parse(fs.readFileSync(PAYROLL_SEED_FILE, 'utf8')) : [];
    fs.writeFileSync(PAYROLL_FILE, JSON.stringify(seed, null, 2));
    console.log(`[HR] 已用种子数据初始化：${seed.length} 条工资记录`);
  }
}

// 种子里的日期用相对今天的天数偏移存储，初始化时换算成真实日期，
// 保证任何时候部署，任务周期都相对"今天"合理（否则 AI 分析会算出满屏逾期）。
function resolveTaskDates(seed) {
  const DAY = 86400000;
  const base = Date.now();
  return seed.map((t, i) => {
    const { startOffset, dueOffset, ...rest } = t;
    const fmt = ms => new Date(ms).toISOString().slice(0, 10);
    return {
      ...rest,
      id: 'T' + String(1001 + i),
      start: fmt(base + (Number(startOffset) || 0) * DAY),
      due: fmt(base + (Number(dueOffset) || 0) * DAY),
    };
  });
}

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.static(__dirname));

// ---- 通用 CRUD 工厂（员工 / 任务共用同一套契约）----
function makeCrud(basePath, file, idPrefix, numericFields = []) {
  const readAll = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { return []; }
  };
  const writeAll = list => fs.writeFileSync(file, JSON.stringify(list, null, 2));
  const genId = () => idPrefix + Date.now().toString().slice(-8) + Math.floor(Math.random() * 90 + 10);
  const normalize = e => {
    const o = { ...e };
    numericFields.forEach(f => { o[f] = Number(o[f]) || 0; });
    return o;
  };

  app.get(basePath, (req, res) => res.json(readAll()));

  app.post(basePath, (req, res) => {
    const list = readAll();
    const item = normalize(req.body);
    item.id = item.id || genId();
    item.updatedAt = new Date().toISOString();
    list.push(item);
    writeAll(list);
    res.json(item);
  });

  // 批量导入（?mode=replace 覆盖，否则追加）
  app.post(basePath + '/bulk', (req, res) => {
    let incoming = Array.isArray(req.body) ? req.body : (req.body && req.body.items) || [];
    incoming = incoming.map(normalize).map(e => ({
      ...e, id: e.id || genId(), updatedAt: new Date().toISOString(),
    }));
    const list = req.query.mode === 'replace' ? [] : readAll();
    const merged = list.concat(incoming);
    writeAll(merged);
    res.json({ count: merged.length, imported: incoming.length });
  });

  app.put(basePath + '/:id', (req, res) => {
    const list = readAll();
    const idx = list.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '未找到该记录' });
    list[idx] = normalize({ ...list[idx], ...req.body, id: req.params.id });
    list[idx].updatedAt = new Date().toISOString();
    writeAll(list);
    res.json(list[idx]);
  });

  app.delete(basePath + '/:id', (req, res) => {
    const next = readAll().filter(e => e.id !== req.params.id);
    writeAll(next);
    res.json({ count: next.length });
  });
}

// 员工（保留原有接口路径不变）
makeCrud('/api/employees', DB_FILE, 'E', ['salary', 'age', 'tenure']);
// 任务（新增）
makeCrud('/api/tasks', TASK_FILE, 'T', ['progress', 'hours']);
// 工资表（薪酬驾驶舱，行级明细，对齐"2026年8月工资表"模板列）
makeCrud('/api/payroll', PAYROLL_FILE, 'PR', [
  'basic', 'secrecy', 'perf', 'postAllowance', 'otherAllowance', 'gross',
  'lateDeduct', 'sickDeduct', 'affairDeduct', 'otherDeduct', 'deductTotal', 'payable',
  'pension', 'medical', 'unemploy', 'housingFund', 'socialTotal',
  'childEdu', 'continueEdu', 'interest', 'rent', 'infantCare', 'parentCare', 'specialDeductTotal',
  'taxableThis', 'taxableCum', 'taxThis', 'taxCum', 'taxPaid', 'netPay',
]);

// ============================================================
//  AI（大语言模型）接口
//  - 配置与密钥只保存在服务端，前端拿不到明文 key
//  - 采用 OpenAI 兼容的 /chat/completions 协议
// ============================================================

// 读取配置（脱敏）
app.get('/api/ai/config', (req, res) => {
  const c = readAiConfig();
  res.json({
    enabled: c.enabled, provider: c.provider, baseUrl: c.baseUrl, model: c.model,
    hasKey: !!c.apiKey, apiKeyMasked: maskKey(c.apiKey), temperature: c.temperature,
    presets: AI_PRESETS,
  });
});

// 保存配置
app.put('/api/ai/config', (req, res) => {
  const cur = readAiConfig();
  const b = req.body || {};
  // apiKey 传 __KEEP__ 表示保留原值
  const key = b.apiKey === '__KEEP__' ? cur.apiKey : (b.apiKey || '');
  const next = {
    enabled: b.enabled !== undefined ? !!b.enabled : cur.enabled,
    provider: b.provider || cur.provider,
    baseUrl: b.baseUrl !== undefined ? String(b.baseUrl).trim().replace(/\/+$/, '') : cur.baseUrl,
    model: b.model !== undefined ? String(b.model).trim() : cur.model,
    apiKey: key,
    temperature: b.temperature !== undefined ? Number(b.temperature) : cur.temperature,
    timeoutMs: cur.timeoutMs,
  };
  writeAiConfig(next);
  res.json({ ok: true, hasKey: !!next.apiKey, apiKeyMasked: maskKey(next.apiKey), enabled: next.enabled });
});

// 构造分析提示词（把控导向：只针对用户录入的真实任务，产出可执行的管控动作）
function buildPrompt(tasks, today) {
  const compact = (tasks || []).slice(0, 200).map(t => ({
    任务: t.name, 负责人: t.owner, 团队: t.team, 优先级: t.priority,
    状态: t.status, 进度: t.progress, 开始: t.start, 截止: t.due, 工时: t.hours, 备注: t.remark || '',
  }));
  return `你是我的项目管理搭档。下面是我在跟进的【真实任务清单】，请只基于这些数据，告诉我该怎么把控。

今天是 ${today}。

我的任务清单（JSON）：
${JSON.stringify(compact, null, 1)}

判定规则（必须严格遵守）：
- 时间进度 =（今天 − 开始）÷（截止 − 开始）× 100%。进度落后 = 实际进度 − 时间进度。
- 落后 ≤ −25% 视为严重滞后；截止日已过且未完成视为逾期；剩余天数 ≤ 7 且未完成视为临期。

请严格按以下 JSON 输出，不要输出任何解释、前言或 markdown 代码块：
{
  "score": <0-100 整数，我对这批任务的把控健康度>,
  "verdict": "<总体研判，55字以内，必须点名最关键的那个人或那个任务，不要说套话>",
  "actions": [
    {
      "level": "critical|warning",
      "task": "<任务名，必须来自清单>",
      "owner": "<负责人，必须来自清单>",
      "problem": "<问题到底是什么，必须带数字：如逾期5天/进度15%但应达64%>",
      "action": "<我作为管理者具体该做什么，要可执行，禁止'加强沟通'这类空话>",
      "by": "<什么时间前，如 今天 / 本周五前 / 9月15日前>"
    }
  ],
  "controls": [
    { "type": "资源调配|节奏控制|风险预警|机制优化", "title": "<把控点，18字以内>", "detail": "<怎么做，55字以内，要具体>" }
  ],
  "watchlist": ["<接下来最该盯住的任务名1>", "<任务名2>"]
}

硬性要求：
1. actions 输出 3-5 条，按紧急度排序，level=critical 排最前；若没有紧急项，全部给 warning。
2. controls 输出 2-4 条，是给我的【管理动作建议】，不是对任务的描述。
3. watchlist 输出 2-5 个任务名。
4. 所有 task、owner、watchlist 里的名字【必须与清单完全一致】，严禁编造任何清单中不存在的任务或人。
5. action 必须是我能立刻执行的动作（找谁、调整什么、砍掉什么、加什么人、重定什么时间）。
6. 如果清单整体健康，actions 仍要给出 1-2 条预防性动作（防止滑落），不要留空。
7. 不要写"建议加强沟通""建议关注进度"这类无信息量的话。`;
}

// 从 LLM 返回中稳健地提取 JSON
function parseLlmJson(raw) {
  if (!raw) throw new Error('模型返回为空');
  let s = String(raw).trim();
  // 去掉常见的 markdown 代码围栏
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('模型未返回 JSON：' + s.slice(0, 120));
  const json = s.slice(start, end + 1);
  try { return JSON.parse(json); }
  catch (e) { throw new Error('JSON 解析失败：' + e.message); }
}

async function callLlm(cfg, messages) {
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs || 60000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: cfg.temperature ?? 0.3,
        stream: false,
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`模型服务返回 ${res.status}：${text.slice(0, 200)}`);
    let data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error('模型返回非 JSON：' + text.slice(0, 200)); }
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error('模型返回内容为空：' + text.slice(0, 200));
    return content;
  } finally { clearTimeout(timer); }
}

// 执行 AI 分析
app.post('/api/ai/analyze', async (req, res) => {
  const cfg = readAiConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    return res.status(400).json({ ok: false, needConfig: true, error: '尚未配置大模型，请在「AI 设置」中填写 API Key。' });
  }
  const tasks = req.body && req.body.tasks;
  if (!Array.isArray(tasks) || !tasks.length) {
    return res.status(400).json({ ok: false, error: '没有可分析的任务数据' });
  }
  const today = new Date().toISOString().slice(0, 10);
  try {
    const content = await callLlm(cfg, [
      { role: 'system', content: '你是专业的项目管理与人力效能分析顾问，只输出严格合法的 JSON。' },
      { role: 'user', content: buildPrompt(tasks, today) },
    ]);
    const parsed = parseLlmJson(content);
    const norm = {
      score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0))),
      verdict: String(parsed.verdict || parsed.summary || '').slice(0, 200),
      source: 'llm',
      model: cfg.model,
      provider: cfg.provider,
      ok: true,
    };

    // 立即干预动作（核心把控项）
    const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
    norm.actions = actions.filter(a => a && (a.task || a.title)).slice(0, 6).map((a, i) => ({
      level: a.level === 'critical' ? 'critical' : 'warning',
      task: String(a.task || a.title || '').slice(0, 60),
      owner: String(a.owner || '').slice(0, 30),
      problem: String(a.problem || '').slice(0, 200),
      action: String(a.action || '').slice(0, 250),
      by: String(a.by || '').slice(0, 40),
    }));

    // 管理把控建议
    const controls = Array.isArray(parsed.controls) ? parsed.controls : [];
    norm.controls = controls.filter(c => c && (c.title || c.detail)).slice(0, 6).map(c => ({
      type: ['资源调配', '节奏控制', '风险预警', '机制优化'].includes(c.type) ? c.type : '风险预警',
      title: String(c.title || '').slice(0, 60),
      detail: String(c.detail || '').slice(0, 250),
    }));

    // 重点盯办清单
    const watch = Array.isArray(parsed.watchlist) ? parsed.watchlist : [];
    norm.watchlist = watch.map(w => String(w || '').trim()).filter(Boolean).slice(0, 8);

    // 兼容旧格式（模型若仍返回 insights）
    if (!norm.actions.length && Array.isArray(parsed.insights)) {
      norm.actions = parsed.insights.filter(i => i && i.title).slice(0, 6).map(i => ({
        level: i.level === 'critical' ? 'critical' : 'warning',
        task: String(i.title || '').slice(0, 60),
        owner: '',
        problem: String(i.text || '').slice(0, 200),
        action: String(i.advice || '').slice(0, 250),
        by: '',
      }));
    }
    res.json(norm);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'AI 分析失败' });
  }
});

// 测试连接
app.post('/api/ai/test', async (req, res) => {
  const body = req.body || {};
  const cfg = { ...readAiConfig() };
  if (body.baseUrl) cfg.baseUrl = body.baseUrl;
  if (body.model) cfg.model = body.model;
  if (body.apiKey && body.apiKey !== '__KEEP__') cfg.apiKey = body.apiKey;
  cfg.timeoutMs = 20000;
  if (!cfg.apiKey) return res.status(400).json({ ok: false, error: '请先填写 API Key' });
  try {
    const content = await callLlm(cfg, [{ role: 'user', content: '回复两个字：正常' }]);
    res.json({ ok: true, reply: String(content).slice(0, 80) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || '连接失败' });
  }
});

// 一句话解析为任务草稿（智能录入，LLM 增强）
app.post('/api/ai/parse', async (req, res) => {
  const cfg = readAiConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    return res.status(400).json({ ok: false, needConfig: true, error: '尚未配置大模型，请先在「AI 设置」中填写 API Key。' });
  }
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: '请输入要识别的内容' });
  const today = new Date().toISOString().slice(0, 10);
  try {
    const content = await callLlm(cfg, [
      { role: 'system', content: '你是个人任务管理助手，把用户用自然语言描述的一件事，转成一条结构化待办任务的草稿。只输出严格合法的 JSON。' },
      { role: 'user', content: buildParsePrompt(text, today) },
    ]);
    const parsed = parseLlmJson(content);
    const task = parsed && typeof parsed.task === 'object' ? parsed.task : {};
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    res.json({
      ok: true,
      source: 'llm',
      model: cfg.model,
      provider: cfg.provider,
      name: String(task.name || '').slice(0, 60),
      owner: String(task.owner || '').slice(0, 30),
      priority: ['高', '中', '低'].includes(task.priority) ? task.priority : '中',
      due: String(task.due || '').slice(0, 10),
      start: String(task.start || '').slice(0, 10),
      hours: Number(task.hours) > 0 ? Math.round(Number(task.hours)) : 0,
      remark: String(task.remark || '').slice(0, 300),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(x => String(x).slice(0, 12)).slice(0, 6) : [],
      questions: questions.filter(q => q && q.q).slice(0, 5).map(q => ({
        q: String(q.q || '').slice(0, 40),
        kind: ['amount', 'date', 'contact', 'owner', 'deadline', 'priority', 'note'].includes(q.kind) ? q.kind : 'note',
        options: Array.isArray(q.options) ? q.options.map(o => String(o).slice(0, 24)).slice(0, 6) : [],
      })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || '解析失败' });
  }
});

function buildParsePrompt(text, today) {
  return `今天是 ${today}。请把下面这句话理解成一条要跟进的任务草稿：

「${text}」

请严格按以下 JSON 输出，不要输出任何解释或 markdown 代码块：
{
  "task": {
    "name": "<简洁任务名，用'动作+对象'，如 跟进王总合同确认>",
    "owner": "<若提到某人/自己则填，否则留空>",
    "priority": "高|中|低",
    "start": "YYYY-MM-DD 或 ''",
    "due": "YYYY-MM-DD 或 ''，若原文有'今天/明天/周X/几点前'等相对时间请换算成真实日期",
    "hours": <数字，无法估计给0>,
    "remark": "<把原文里的关键信息都保留下来，如联系人、金额、对象、要求>",
    "extra": "<一句话说明这句话的意图，用于帮你判断该问什么>"
  },
  "tags": ["<提取2-4个关键词标签，如 合同/电话/王总>"],
  "questions": [
    { "q": "问题文案", "kind": "amount|date|contact|owner|deadline|priority|note", "options": ["可选答案1"] }
  ]
}

要求：
1. questions 只列【真实缺失】且【从这句话本身还能问出来】的信息，比如：说了'打电话/签约/付款'但没给金额 → 问金额；说了'今天'但没说截止 → 可问'预计哪天前办完'；没说联系人 → 可问'和谁对接'。
2. 每个 question 给 0-3 个常用可选答案（kind=date 时给 '今天/明天/本周五' 之类；amount 给空）。
3. questions 最多 3 条，宁缺毋滥。
4. task.name、tags 必须贴合原文，不要编造原文没有的人名、金额、对象。`;
}

// ---- 健康检查 ----
app.get('/api/health', (req, res) => res.json({
  ok: true,
  count: (() => { try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')).length; } catch (e) { return 0; } })(),
  tasks: (() => { try { return JSON.parse(fs.readFileSync(TASK_FILE, 'utf8')).length; } catch (e) { return 0; } })(),
}));

ensureStore();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[HR] 服务已启动：http://0.0.0.0:${PORT}`);
});
