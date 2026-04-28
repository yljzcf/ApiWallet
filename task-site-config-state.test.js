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

function loadPopupSandbox() {
  const sharedCode = fs.readFileSync(path.join(__dirname, 'site-config-shared.js'), 'utf8');
  const code = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
  const elementCache = new Map();
  const getEl = (id) => {
    if (!elementCache.has(id)) {
      elementCache.set(id, createElementStub());
    }
    return elementCache.get(id);
  };

  let storageChangeListener = null;
  const fetchCalls = [];

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
          async get() { return {}; },
          async set() {}
        },
        onChanged: {
          addListener(listener) {
            storageChangeListener = listener;
          }
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
    fetch: async (url) => {
      fetchCalls.push(url);
      return { ok: true, json: async () => ({}) };
    },
    __fetchCalls: fetchCalls
  };

  vm.createContext(sandbox);
  vm.runInContext(sharedCode, sandbox);
  vm.runInContext(`${code}\nglobalThis.__popupInitPromise = typeof initPromise !== 'undefined' ? initPromise : Promise.resolve();\nthis.__testExports = {
    CONFIG,
    loadPopupState,
    persistPopupState,
    buildDefaultSiteConfigs,
    getTaskList,
    setSiteConfigs,
    normalizeColorMode,
    applyColorMode,
    buildCustomTaskConfig,
    SiteConfigShared: globalThis.SiteConfigShared,
    __fetchCalls: globalThis.__fetchCalls,
    setState(snapshot) {
      boardDataCache = snapshot.boardData;
      groupsCache = snapshot.groups;
      manualOrderCache = snapshot.manualOrder;
      setSiteConfigs(snapshot.siteConfigs);
    },
    getState() {
      return {
        boardData: boardDataCache,
        groups: groupsCache,
        manualOrder: manualOrderCache,
        siteConfigs: getTaskList(),
        persistedSiteConfigs: persistedSiteConfigsCache
      };
    },
    removeSiteTask,
    renameSiteTask,
    renameGroup,
    applyExternalSiteConfigsChange,
    serializeSiteConfigs,
    normalizeSiteConfigs,
    buildPersistedSiteConfigsFromRuntime
  };`, sandbox);
  return sandbox;
}

(async () => {
  const sandbox = loadPopupSandbox();
  await sandbox.__popupInitPromise;
  const exported = sandbox.__testExports;

  assert(exported.SiteConfigShared, '应先加载共享站点配置模块');
  assert.strictEqual(exported.buildCustomTaskConfig, exported.SiteConfigShared.buildCustomTaskConfig, 'popup 应直接复用共享模块的 buildCustomTaskConfig');
  assert.deepStrictEqual(exported.__fetchCalls, [], 'popup 初始化时不应再自动加载外置 JSON 默认站点配置');
  assert.strictEqual(exported.buildDefaultSiteConfigs().length, 0, 'popup 默认站点列表应为空');

  const persistedPayloads = [];
  sandbox.chrome.storage.local.set = async (payload) => {
    persistedPayloads.push(payload);
  };

  const runtimeConfigs = [
    exported.buildCustomTaskConfig({
      id: 'custom-a',
      name: '自定义 A',
      url: 'https://example.test/api/a',
      type: 'json',
      headers: { authorization: 'Bearer token-a' },
      fieldPath: 'data.balance',
      isCustom: true
    }),
    exported.buildCustomTaskConfig({
      id: 'custom-b',
      name: '自定义 B',
      url: 'https://example.test/api/b',
      type: 'json',
      headers: { 'new-api-user': 'test-user-id' },
      fieldPath: 'data.quota',
      isCustom: true
    }),
    exported.buildCustomTaskConfig({
      id: 'custom-c',
      name: '自定义 C',
      url: 'https://example.test/api/c',
      type: 'json',
      headers: { authorization: 'Bearer token-c' },
      fieldPath: 'data.balance',
      isCustom: true
    })
  ];
  const customRuntimeTask = exported.buildCustomTaskConfig({
    id: 'custom-demo',
    name: '自定义站点',
    url: 'https://demo.test/api/user/self',
    type: 'json',
    fieldPath: 'data.quota',
    headers: { authorization: 'Bearer custom-token' },
    isCustom: true
  });
  await exported.persistPopupState({ siteConfigs: [...runtimeConfigs, customRuntimeTask] });
  assert(persistedPayloads.length > 0, '应写入 siteConfigs');
  assert(!('extract' in persistedPayloads[0].siteConfigs[0]), '落盘的 siteConfigs 必须可序列化，不能包含 extract 函数');
  const persistedCustomTask = persistedPayloads[0].siteConfigs.find((task) => task.id === 'custom-demo');
  assert(persistedCustomTask, '自定义站点应一并落盘');
  assert.strictEqual(persistedCustomTask.fieldPath, 'data.quota', '自定义站点落盘时应保留字段路径');
  assert.strictEqual(persistedCustomTask.formula, undefined, '自定义站点落盘时不应保留公式');
  assert.strictEqual(persistedCustomTask.isCustom, true, '自定义站点落盘时应保留 custom 标记');

  sandbox.chrome.storage.local.get = async () => ({
    siteConfigs: [
      {
        id: 'custom-a',
        name: '自定义 A 已保存',
        url: 'https://example.test/api/a',
        type: 'json',
        headers: { authorization: 'Bearer new-token' },
        fieldPath: 'data.balance',
        isCustom: true
      },
      {
        id: 'custom-demo',
        name: '自定义站点',
        url: 'https://demo.test/api/user/self',
        type: 'json',
        fieldPath: 'data.quota',
        headers: { authorization: 'Bearer custom-token' },
        isCustom: true
      }
    ],
    boardData: {},
    groups: [],
    manualOrder: [],
    autoSortEnabled: false,
    layoutColumns: 2,
    colorMode: 'light',
    lastUpdateTime: ''
  });

  const popupState = await exported.loadPopupState();
  assert.strictEqual(exported.normalizeColorMode('light'), 'light', '应支持 light 主题值');
  assert.strictEqual(exported.normalizeColorMode('weird'), 'dark', '非法主题值应回退为 dark');
  const customATask = popupState.siteConfigs.find((task) => task.id === 'custom-a');
  assert(customATask, '应保留自定义 A 站点');
  assert.strictEqual(customATask.name, '自定义 A 已保存');
  assert.strictEqual(customATask.headers.authorization, 'Bearer new-token');
  assert.strictEqual(typeof customATask.extract, 'function', '运行时站点配置仍需保留 extract 函数');

  const customTask = popupState.siteConfigs.find((task) => task.id === 'custom-demo');
  assert(customTask, 'reload 后应恢复自定义站点');
  assert.strictEqual(customTask.isCustom, true, '自定义站点应保留 custom 标记');
  assert.strictEqual(customTask.fieldPath, 'data.quota', '自定义站点应保留字段路径');
  assert.strictEqual(customTask.formula, undefined, '自定义站点不应保留公式配置');
  assert.strictEqual(typeof customTask.extract, 'function', '自定义站点 reload 后仍应恢复运行时 extract');
  assert.strictEqual(customTask.extract({ data: { quota: 2500000 } }), '2500000.00', '自定义站点的 extract 应直接返回抓取原值');

  sandbox.chrome.storage.local.get = async () => ({
    siteConfigs: [
      {
        id: 'custom-a',
        name: '自定义 A 已保存',
        url: 'https://example.test/api/a',
        type: 'json',
        headers: { authorization: 'Bearer new-token' },
        fieldPath: 'data.balance',
        isCustom: true
      }
    ],
    boardData: {},
    groups: [],
    manualOrder: [],
    autoSortEnabled: false,
    layoutColumns: 2,
    colorMode: 'dark',
    lastUpdateTime: ''
  });
  const restoreOneState = await exported.loadPopupState();
  assert(restoreOneState.siteConfigs.some((task) => task.id === 'custom-a'), '保留单个自定义站点后应继续存在');
  assert(!restoreOneState.siteConfigs.some((task) => task.id === 'custom-b'), '删除自定义站点后不应自动恢复');

  exported.setState({
    boardData: {
      'custom-a': '1.00',
      'custom-c': '2.00',
      'custom-b': '3.00'
    },
    groups: [
      { id: 'group:1', taskIds: ['custom-a', 'custom-c'] }
    ],
    manualOrder: ['group:1', 'task:custom-b'],
    siteConfigs: runtimeConfigs
  });

  const renamedConfigs = exported.renameSiteTask('custom-c', '  自定义 C 新名字  ');
  const renamedTask = renamedConfigs.find((task) => task.id === 'custom-c');
  assert(renamedTask, '修改站点名称后应保留该站点配置');
  assert.strictEqual(renamedTask.name, '自定义 C 新名字', '修改站点名称时应写入去空白后的新名称');

  const ignoredConfigs = exported.renameSiteTask('custom-c', '   ');
  const ignoredTask = ignoredConfigs.find((task) => task.id === 'custom-c');
  assert.strictEqual(ignoredTask.name, '自定义 C 新名字', '空白名称不应覆盖已有显示名');

  const renamedGroups = exported.renameGroup('group:1', '  我的双卡组  ');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(renamedGroups)), [
    { id: 'group:1', taskIds: ['custom-a', 'custom-c'], name: '我的双卡组' }
  ], '修改分组名时应写入去空白后的新名称');

  const ignoredGroups = exported.renameGroup('group:1', '   ');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ignoredGroups)), [
    { id: 'group:1', taskIds: ['custom-a', 'custom-c'], name: '我的双卡组' }
  ], '空白分组名不应覆盖已有分组名称');

  await exported.removeSiteTask('custom-a');
  const nextState = JSON.parse(JSON.stringify(exported.getState()));
  assert(!nextState.siteConfigs.some((task) => task.id === 'custom-a'), '删除站点后，当前显示态不应再包含该站点');
  assert(!nextState.persistedSiteConfigs.some((task) => task.id === 'custom-a'), '删除自定义站点后不应再保留 removed 标记');
  assert.deepStrictEqual(nextState.groups, [], '删除组内站点后应清理对应分组');
  assert.deepStrictEqual(nextState.manualOrder.slice(0, 2), ['task:custom-c', 'task:custom-b'], '删除组内站点后应让剩余卡片回到原组位置');
  assert.deepStrictEqual(nextState.boardData, {
    'custom-c': '2.00',
    'custom-b': '3.00'
  }, '删除站点后应同步清理缓存值');
  const renamedTaskAfterDelete = nextState.siteConfigs.find((task) => task.id === 'custom-c');
  assert.strictEqual(renamedTaskAfterDelete.name, '自定义 C 新名字', '删除其他站点后应保留已修改的显示名');

  exported.applyExternalSiteConfigsChange([
    {
      id: 'custom-a',
      name: '自定义 A',
      url: 'https://example.test/api/a',
      type: 'json',
      fieldPath: 'data.balance',
      headers: { authorization: 'Bearer token-a' },
      isCustom: true
    }
  ]);
  const cleanedStateAfterDelete = exported.getState();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(cleanedStateAfterDelete.groups)), [], '配置变更删除站点后应清理包含无效 task 的分组');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(cleanedStateAfterDelete.manualOrder)), ['task:custom-a'], '配置变更删除站点后不应保留悬空 group 顺序项');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(cleanedStateAfterDelete.boardData)), {}, '配置变更删除站点后应清理无效 boardData');

  exported.applyExternalSiteConfigsChange([
    {
      id: 'custom-live',
      name: '实时新增站点',
      url: 'https://demo.test/api/live',
      type: 'json',
      fieldPath: 'data.quota',
      headers: { authorization: 'Bearer live-token' },
      isCustom: true
    }
  ]);
  const stateAfterStorageChange = exported.getState();
  const liveTask = stateAfterStorageChange.siteConfigs.find((task) => task.id === 'custom-live');
  assert(liveTask, 'storage 中新增 siteConfigs 后，popup 运行态应立即吸收新站点');
  assert.strictEqual(typeof liveTask.extract, 'function', 'storage 变更注入的自定义站点应恢复运行时 extract');
  assert.strictEqual(liveTask.extract({ data: { quota: 1500000 } }), '1500000.00', 'storage 变更注入的自定义站点应直接返回抓取原值');

  exported.setState({
    boardData: {},
    groups: [],
    manualOrder: [],
    siteConfigs: runtimeConfigs
  });
  const editedCustomConfigs = exported.getTaskList().map((task) => (
    task.id === 'custom-a'
      ? {
        ...task,
        name: '自定义 A 改名',
        url: 'https://example.test/api/a-updated',
        headers: { authorization: 'Bearer changed-token' },
        fieldPath: 'data.quota'
      }
      : task
  ));
  const editedPersisted = exported.buildPersistedSiteConfigsFromRuntime(editedCustomConfigs);
  const persistedCustomA = editedPersisted.find((task) => task.id === 'custom-a');
  assert(persistedCustomA, '修改站点后应仍能生成持久化条目');
  assert.strictEqual(persistedCustomA.name, '自定义 A 改名', '修改站点后应保留新名称');
  assert.strictEqual(persistedCustomA.url, 'https://example.test/api/a-updated', '修改站点后应保留新接口地址');
  assert.strictEqual(persistedCustomA.headers.authorization, 'Bearer changed-token', '修改站点后应保留新鉴权头');
  assert.strictEqual(persistedCustomA.fieldPath, 'data.quota', '修改站点后应保留字段路径');
  assert.strictEqual(persistedCustomA.formula, undefined, '修改站点后不应保留公式配置');

  exported.applyExternalSiteConfigsChange(editedPersisted);
  const stateAfterEdit = exported.getState();
  const runtimeCustomA = stateAfterEdit.siteConfigs.find((task) => task.id === 'custom-a');
  assert(runtimeCustomA, 'storage 中修改站点后，popup 运行态应保留该站点');
  assert.strictEqual(runtimeCustomA.name, '自定义 A 改名', '运行态应吸收站点的新名称');
  assert.strictEqual(runtimeCustomA.url, 'https://example.test/api/a-updated', '运行态应吸收站点的新接口地址');
  assert.strictEqual(runtimeCustomA.headers.authorization, 'Bearer changed-token', '运行态应吸收站点的新鉴权头');

  exported.applyExternalSiteConfigsChange([
    {
      id: 'custom-edit',
      name: '自定义可编辑站点',
      url: 'https://demo.test/api/edit',
      type: 'json',
      fieldPath: 'data.balance',
      headers: { token: 'before-token' },
      isCustom: true
    }
  ]);
  exported.applyExternalSiteConfigsChange([
    {
      id: 'custom-edit',
      name: '自定义已修改站点',
      url: 'https://demo.test/api/edit-updated',
      type: 'json',
      fieldPath: 'data.quota',
      headers: { authorization: 'Bearer after-token' },
      isCustom: true
    }
  ]);
  const stateAfterCustomEdit = exported.getState();
  const editedCustom = stateAfterCustomEdit.siteConfigs.find((task) => task.id === 'custom-edit');
  assert(editedCustom, 'storage 中修改自定义站点后，popup 运行态应保留该站点');
  assert.strictEqual(editedCustom.name, '自定义已修改站点', '运行态应吸收自定义站点的新名称');
  assert.strictEqual(editedCustom.url, 'https://demo.test/api/edit-updated', '运行态应吸收自定义站点的新接口地址');
  assert.strictEqual(editedCustom.fieldPath, 'data.quota', '运行态应吸收自定义站点的新字段路径');
  assert.strictEqual(editedCustom.formula, undefined, '运行态不应吸收自定义站点的公式配置');
  assert.strictEqual(editedCustom.headers.authorization, 'Bearer after-token', '运行态应吸收自定义站点的新鉴权头');
  assert.strictEqual(editedCustom.extract({ data: { quota: 1500000 } }), '1500000.00', '修改后的自定义站点应直接返回抓取原值');

  console.log('task-site-config-state.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
