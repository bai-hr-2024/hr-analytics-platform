// ============================================================
//  数据源配置 —— 对接真实接口的接入点
//  使用方式：将 useApi 设为 true，并填写你的后端 apiBase。
//  接口需返回与 HR.employees 结构一致的对象数组，例如：
//  GET {apiBase}/employees  ->  [ { id, name, dept, level, gender, age, edu, tenure, status, salary, perf, hireDate }, ... ]
// ============================================================

const CONFIG = {
  // 是否启用真实接口（false 时使用内置模拟数据）
  useApi: true,
  // 后端 API 根地址（同源部署时留空，使用相对路径 /api）
  apiBase: '',
};

/**
 * 通用 GET 请求
 */
async function apiGet(path) {
  const res = await fetch(CONFIG.apiBase + '/api' + path, { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('API 请求失败: ' + res.status);
  return res.json();
}

/**
 * 加载员工明细数据：
 *  - 若 useApi 为 true，则请求真实接口，失败自动回退到模拟数据；
 *  - 否则直接使用内置模拟数据。
 */
async function loadEmployees() {
  if (CONFIG.useApi) {
    try {
      const data = await apiGet('/employees');
      if (Array.isArray(data)) {
        HR.employees = data; // 保持全局数据一致
        return data;
      }
      throw new Error('返回格式异常');
    } catch (e) {
      console.warn('[HR] 接口获取失败，已回退到模拟数据：', e.message);
    }
  }
  return HR.employees;
}

// 预留：其它看板若需对接接口，可在此扩展（如 loadDeptStats / loadTasks）。
// 当前看板数据仍取自 data.js 的 HR 对象；接入真实后端时，
// 把 renderXxx() 中的 HR.xxx 替换为 await apiGet('/xxx') 即可。

window.CONFIG = CONFIG;
window.apiGet = apiGet;
window.loadEmployees = loadEmployees;
