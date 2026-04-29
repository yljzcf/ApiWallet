const assert = require('assert');
const fs = require('fs');
const path = require('path');
const projectRoot = path.resolve(__dirname, '..');
const vm = require('vm');

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    }
  };
}

function loadBackgroundSandbox(initialStorage = {}, fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({}) })) {
  const sharedCode = fs.readFileSync(path.join(projectRoot, 'src/shared/site-config-shared.js'), 'utf8');
  const backgroundCode = fs.readFileSync(path.join(projectRoot, 'src/background/auto-refresh.js'), 'utf8');
  const storageState = { ...initialStorage };
  const setPayloads = [];
  const createdAlarms = [];
  const clearedAlarms = [];
  const onInstalled = createEvent();
  const onStartup = createEvent();
  const onChanged = createEvent();
  const onAlarm = createEvent();

  const sandbox = {
    console,
    Intl,
    Date,
    Map,
    Set,
    Array,
    Object,
    Number,
    String,
    Boolean,
    Math,
    JSON,
    Promise,
    Error,
    fetch: fetchImpl,
    importScripts(file) {
      assert.strictEqual(file, '../shared/site-config-shared.js', 'background 应通过 importScripts 加载共享模块');
      vm.runInContext(sharedCode, sandbox);
    },
    chrome: {
      runtime: {
        onInstalled,
        onStartup
      },
      storage: {
        local: {
          async get(keys) {
            if (Array.isArray(keys)) {
              return Object.fromEntries(keys.map((key) => [key, storageState[key]]));
            }
            if (typeof keys === 'string') {
              return { [keys]: storageState[keys] };
            }
            if (keys && typeof keys === 'object') {
              return Object.fromEntries(Object.keys(keys).map((key) => [key, storageState[key] ?? keys[key]]));
            }
            return { ...storageState };
          },
          async set(payload) {
            setPayloads.push(payload);
            Object.assign(storageState, payload);
          }
        },
        onChanged
      },
      alarms: {
        async create(name, options) {
          createdAlarms.push({ name, options });
        },
        async clear(name) {
          clearedAlarms.push(name);
          return true;
        },
        onAlarm
      }
    },
    __storageState: storageState,
    __setPayloads: setPayloads,
    __createdAlarms: createdAlarms,
    __clearedAlarms: clearedAlarms,
    __events: { onInstalled, onStartup, onChanged, onAlarm }
  };

  vm.createContext(sandbox);
  vm.runInContext(backgroundCode, sandbox);
  return sandbox;
}

function buildTask(overrides = {}) {
  return {
    id: 'json-a',
    name: 'JSON A',
    url: 'https://example.test/api/a',
    type: 'json',
    fieldPath: 'data.balance',
    isCustom: true,
    ...overrides
  };
}

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.json'), 'utf8'));
  assert(manifest.permissions.includes('alarms'), 'manifest 应声明 alarms 权限');
  assert.strictEqual(manifest.background?.service_worker, 'src/background/auto-refresh.js', 'manifest 应声明 background service worker');

  const alarmSandbox = loadBackgroundSandbox({ autoRefreshEnabled: true });
  const exported = alarmSandbox.__AutoRefreshBackground;
  await exported.ensureAutoRefreshAlarm();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(alarmSandbox.__createdAlarms)), [{
    name: 'auto-refresh-board-data',
    options: { periodInMinutes: 30 }
  }], '启用自动刷新时应创建 30 分钟周期 alarm');

  alarmSandbox.__storageState.autoRefreshEnabled = false;
  await exported.ensureAutoRefreshAlarm();
  assert.deepStrictEqual(alarmSandbox.__clearedAlarms, ['auto-refresh-board-data'], '关闭自动刷新时应清除 alarm');

  const storageChangeSandbox = loadBackgroundSandbox({ autoRefreshEnabled: true });
  storageChangeSandbox.__events.onChanged.listeners[0]({ autoRefreshEnabled: { oldValue: false, newValue: true } }, 'local');
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(storageChangeSandbox.__createdAlarms[0].name, 'auto-refresh-board-data', 'autoRefreshEnabled 变更时应重建 alarm');

  const fetchCalls = [];
  const refreshSandbox = loadBackgroundSandbox({
    autoRefreshEnabled: true,
    boardData: { 'json-a': '旧值', 'json-b': '5.00', 'demo-click-refresh': '点我' },
    siteConfigs: [
      buildTask({ id: 'json-a', url: 'https://example.test/api/a', headers: { authorization: 'Bearer token-a' } }),
      buildTask({ id: 'json-b', url: 'https://example.test/api/b', fieldPath: 'data.quota' }),
      buildTask({ id: 'demo-click-refresh', url: '', isDemo: true }),
      buildTask({ id: 'empty-url', url: '' })
    ]
  }, async (url, options) => {
    fetchCalls.push({ url, options });
    if (url.endsWith('/a')) {
      return { ok: true, status: 200, json: async () => ({ data: { balance: 12.5 } }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: { quota: 9 } }) };
  });

  const refreshResult = await refreshSandbox.__AutoRefreshBackground.runAutoRefresh();
  assert.strictEqual(refreshResult.ok, true, '全部真实 JSON 任务成功时结果应为 ok');
  assert.deepStrictEqual(fetchCalls.map((call) => call.url), ['https://example.test/api/a', 'https://example.test/api/b'], '只应抓取真实且有 URL 的任务');
  assert.strictEqual(fetchCalls[0].options.credentials, 'include', '后台 fetch 应携带 credentials include');
  assert.deepStrictEqual(fetchCalls[0].options.headers, { authorization: 'Bearer token-a' }, '后台 fetch 应传入任务 headers');
  assert.strictEqual(refreshSandbox.__storageState.boardData['json-a'], '12.50', '成功任务应写入 boardData');
  assert.strictEqual(refreshSandbox.__storageState.boardData['json-b'], '9.00', '成功任务应写入 boardData');
  assert.strictEqual(refreshSandbox.__storageState.boardData['demo-click-refresh'], '点我', 'demo 数据不应被后台抓取覆盖');
  assert(refreshSandbox.__storageState.lastUpdateTime, '全部真实任务成功时应更新 lastUpdateTime');
  assert.strictEqual(refreshSandbox.__storageState.autoRefreshLastSuccessAt, refreshSandbox.__storageState.lastUpdateTime, '全部成功时应更新 autoRefreshLastSuccessAt');
  assert.strictEqual(refreshSandbox.__storageState.autoRefreshLastError, '', '全部成功时错误摘要应为空');
  assert(refreshSandbox.__storageState.autoRefreshLastRunAt, '每次运行都应更新 autoRefreshLastRunAt');

  const demoFetchCalls = [];
  const demoSandbox = loadBackgroundSandbox({
    autoRefreshEnabled: true,
    boardData: { 'demo-click-refresh': '点我' },
    siteConfigs: [buildTask({ id: 'demo-click-refresh', url: '', isDemo: true })]
  }, async (url) => {
    demoFetchCalls.push(url);
    return { ok: true, status: 200, json: async () => ({}) };
  });
  await demoSandbox.__AutoRefreshBackground.runAutoRefresh();
  assert.deepStrictEqual(demoFetchCalls, [], 'demo task 不应触发 fetch');
  assert.strictEqual(demoSandbox.__storageState.lastUpdateTime, undefined, '无真实任务时不应更新 lastUpdateTime');
  assert.strictEqual(demoSandbox.__storageState.autoRefreshLastSuccessAt, undefined, '无真实任务时不应更新 autoRefreshLastSuccessAt');
  assert(demoSandbox.__storageState.autoRefreshLastRunAt, '无真实任务时仍应更新 autoRefreshLastRunAt');

  const partialFetchCalls = [];
  const partialSandbox = loadBackgroundSandbox({
    autoRefreshEnabled: true,
    boardData: { 'json-a': '旧 A', 'json-b': '旧 B' },
    lastUpdateTime: '旧时间',
    autoRefreshLastSuccessAt: '旧成功时间',
    siteConfigs: [
      buildTask({ id: 'json-a', url: 'https://example.test/api/a' }),
      buildTask({ id: 'json-b', url: 'https://example.test/api/b' })
    ]
  }, async (url) => {
    partialFetchCalls.push(url);
    if (url.endsWith('/b')) {
      return { ok: false, status: 500, json: async () => ({ message: 'server failed' }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: { balance: 77 } }) };
  });
  const partialResult = await partialSandbox.__AutoRefreshBackground.runAutoRefresh();
  assert.strictEqual(partialResult.ok, false, '部分失败时结果应为失败');
  assert.strictEqual(partialSandbox.__storageState.boardData['json-a'], '旧 A', '部分失败时不应写入新的 boardData');
  assert.strictEqual(partialSandbox.__storageState.boardData['json-b'], '旧 B', '失败任务不应覆盖旧值');
  assert.strictEqual(partialSandbox.__storageState.lastUpdateTime, '旧时间', '部分失败时不应更新 lastUpdateTime');
  assert.strictEqual(partialSandbox.__storageState.autoRefreshLastSuccessAt, '旧成功时间', '部分失败时不应更新 autoRefreshLastSuccessAt');
  assert(partialSandbox.__storageState.autoRefreshLastRunAt, '部分失败时仍应更新 autoRefreshLastRunAt');
  assert(partialSandbox.__storageState.autoRefreshLastError.includes('json-b'), '部分失败时应记录失败任务摘要');

  const alarmRunSandbox = loadBackgroundSandbox({
    autoRefreshEnabled: true,
    boardData: {},
    siteConfigs: [buildTask({ id: 'json-a', url: 'https://example.test/api/a' })]
  }, async () => ({ ok: true, status: 200, json: async () => ({ data: { balance: 3 } }) }));
  alarmRunSandbox.__events.onAlarm.listeners[0]({ name: 'not-target' });
  await Promise.resolve();
  assert.strictEqual(alarmRunSandbox.__setPayloads.length, 0, '非目标 alarm 不应触发刷新');
  alarmRunSandbox.__events.onAlarm.listeners[0]({ name: 'auto-refresh-board-data' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(alarmRunSandbox.__storageState.boardData['json-a'], '3.00', '目标 alarm 应触发后台抓取');

  console.log('task-auto-refresh-background.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
