const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createElementStub() {
  return {
    style: { setProperty() {} },
    dataset: {},
    hidden: false,
    disabled: false,
    innerText: '',
    innerHTML: '',
    value: '2',
    className: '',
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    },
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    remove() {},
    querySelector() { return createElementStub(); },
    querySelectorAll() { return []; },
    closest() { return null; },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 };
    },
    releasePointerCapture() {},
    setPointerCapture() {},
    hasPointerCapture() { return false; },
    contains() { return false; },
    focus() {}
  };
}

(async () => {
  const sharedCode = fs.readFileSync(path.join(__dirname, 'site-config-shared.js'), 'utf8');
  const sharedSandbox = {};
  vm.createContext(sharedSandbox);
  vm.runInContext(sharedCode, sharedSandbox);
  const shared = sharedSandbox.SiteConfigShared;

  assert(Array.isArray(shared.DEMO_SITE_CONFIGS), 'DEMO_SITE_CONFIGS 应是数组');
  assert.strictEqual(shared.DEMO_SITE_CONFIGS.length, 2, '应有 2 个示例站点');
  assert(shared.DEMO_SITE_CONFIGS.every((t) => t.isDemo === true), '每个 demo 站点应有 isDemo: true');
  assert(shared.DEMO_SITE_CONFIGS.every((t) => t.isCustom === true), '每个 demo 站点应有 isCustom: true');
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(shared.DEMO_SITE_CONFIGS.map((t) => ({ id: t.id, name: t.name })))),
    [
      { id: 'demo-click-refresh', name: '单击' },
      { id: 'demo-drag-group', name: '长按' }
    ],
    'demo 卡片标题应使用短文案'
  );

  assert.strictEqual(shared.isDemoTask(shared.DEMO_SITE_CONFIGS[0]), true, 'isDemoTask 应识别 demo 站点');
  assert.strictEqual(shared.isDemoTask({ id: 'real-site', isCustom: true }), false, 'isDemoTask 应排除非 demo 站点');
  assert.strictEqual(shared.isDemoTask(null), false, 'isDemoTask 应安全处理 null');

  const normalized = shared.normalizeSiteConfigs(shared.DEMO_SITE_CONFIGS);
  assert(normalized.every((t) => t.isDemo === true), 'normalizeSiteConfigs 应保留 isDemo 标记');

  const serialized = shared.serializeSiteConfigs(
    shared.DEMO_SITE_CONFIGS.map((t) => shared.buildManagedTaskConfig(t))
  );
  assert(serialized.every((t) => t.isDemo === true), 'serializeSiteConfigs 应保留 isDemo 标记');

  const runtimeTasks = shared.DEMO_SITE_CONFIGS.map((t) => shared.buildManagedTaskConfig(t));
  assert(runtimeTasks.every((t) => t.isDemo === true), 'buildManagedTaskConfig 应保留 isDemo 标记');

  const popupCode = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
  const elementCache = new Map();
  const getEl = (id) => {
    if (!elementCache.has(id)) {
      elementCache.set(id, createElementStub());
    }
    return elementCache.get(id);
  };

  let storedData = {};
  const storageSetCalls = [];

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Intl,
    Date,
    Map,
    Set,
    WeakMap,
    Array,
    Object,
    Number,
    String,
    Boolean,
    Math,
    JSON,
    Promise,
    Error,
    URL,
    chrome: {
      runtime: {
        getURL(file) {
          return `chrome-extension://test/${file}`;
        }
      },
      storage: {
        local: {
          async get() { return { ...storedData }; },
          async set(payload) {
            storageSetCalls.push(payload);
            Object.assign(storedData, payload);
          }
        },
        onChanged: {
          addListener() {}
        }
      }
    },
    document: {
      body: createElementStub(),
      createElement() { return createElementStub(); },
      getElementById(id) { return getEl(id); },
      querySelector() { return createElementStub(); },
      addEventListener() {},
      removeEventListener() {}
    },
    window: { setTimeout, clearTimeout },
    DOMParser: class {
      parseFromString() {
        return { querySelector() { return null; } };
      }
    },
    fetch: async () => {
      return { ok: true, json: async () => ({}) };
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(sharedCode, sandbox);
  vm.runInContext(`${popupCode}\nglobalThis.__popupInitPromise = typeof initPromise !== 'undefined' ? initPromise : Promise.resolve();\nthis.__testExports = {
    injectDemoCardsIfFirstRun,
    setState(snapshot) {
      boardDataCache = snapshot.boardData || {};
      groupsCache = snapshot.groups || [];
      manualOrderCache = snapshot.manualOrder || [];
      layoutColumns = snapshot.layoutColumns || 2;
      autoSortEnabled = Boolean(snapshot.autoSortEnabled);
      setSiteConfigs(snapshot.siteConfigs || []);
    },
    getTaskList,
    isDemoTask: globalThis.SiteConfigShared.isDemoTask
  };`, sandbox);

  await sandbox.__popupInitPromise;
  const exported = sandbox.__testExports;

  assert(storageSetCalls.length > 0, '首次启动应注入 demo 配置到 storage');
  const injectedConfigs = storageSetCalls[0].siteConfigs;
  assert(Array.isArray(injectedConfigs), '注入的 siteConfigs 应为数组');
  assert.strictEqual(injectedConfigs.length, 2, '应注入 2 个 demo 站点');
  assert(injectedConfigs.every((t) => t.isDemo === true), '注入的站点应标记 isDemo');
  assert(storageSetCalls[0]._demoInjected === true, '应设置 _demoInjected 标志');
  assert(storageSetCalls[0].boardData, '应注入预设 boardData');
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(storageSetCalls[0].boardData)),
    { 'demo-click-refresh': '点我', 'demo-drag-group': '拖我' },
    'demo 卡片初始值应使用短文案'
  );

  const storedData2 = { _demoInjected: true, siteConfigs: [{ id: 'real', name: 'R', isCustom: true }] };
  const sandbox2SetCalls = [];
  sandbox.chrome.storage.local.get = async () => ({ ...storedData2 });
  sandbox.chrome.storage.local.set = async (payload) => { sandbox2SetCalls.push(payload); };
  await exported.injectDemoCardsIfFirstRun();
  assert.strictEqual(sandbox2SetCalls.length, 0, '已注入过后不应重复注入');

  console.log('task-demo-cards.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
