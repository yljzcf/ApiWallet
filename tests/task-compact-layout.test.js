const assert = require('assert');
const fs = require('fs');
const path = require('path');
const projectRoot = path.resolve(__dirname, '..');
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
  const sharedCode = fs.readFileSync(path.join(projectRoot, 'src/shared/site-config-shared.js'), 'utf8');
  const code = fs.readFileSync(path.join(projectRoot, 'src/pages/popup.js'), 'utf8');
  const elementCache = new Map();
  const getEl = (id) => {
    if (!elementCache.has(id)) {
      elementCache.set(id, createElementStub());
    }
    return elementCache.get(id);
  };

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
  vm.runInContext(`${code}\nglobalThis.__popupInitPromise = typeof initPromise !== 'undefined' ? initPromise : Promise.resolve();\nthis.__testExports = {
    sortViewItemsForLayout,
    buildLayoutSlots,
    renderBoard,
    handleLayoutColumnsChange,
    buildCustomTaskConfig,
    getCardLayout(viewItemId) {
      const refs = cardRefs.get(viewItemId);
      if (!refs) {
        return null;
      }
      return {
        column: refs.card.style.gridColumn,
        row: refs.card.style.gridRow
      };
    },
    setState(snapshot) {
      boardDataCache = snapshot.boardData;
      layoutColumns = snapshot.layoutColumns;
      autoSortEnabled = snapshot.autoSortEnabled;
      groupsCache = snapshot.groups || [];
      manualOrderCache = snapshot.manualOrder || [];
      setSiteConfigs(snapshot.siteConfigs || buildDefaultSiteConfigs());
    }
  };`, sandbox);
  return sandbox;
}

(async () => {
  const sandbox = loadPopupSandbox();
  await sandbox.__popupInitPromise;
  const exported = sandbox.__testExports;

  const singleA = { id: 'task:a', type: 'single', taskId: 'a' };
  const groupBC = { id: 'group:bc', type: 'group', taskIds: ['b', 'c'] };
  const singleD = { id: 'task:d', type: 'single', taskId: 'd' };

  exported.setState({
    boardData: { a: '100', b: '40', c: '30', d: '20' },
    layoutColumns: 2,
    autoSortEnabled: true
  });

  const sortedForLayout = JSON.parse(JSON.stringify(exported.sortViewItemsForLayout([singleA, groupBC, singleD])));
  assert.deepStrictEqual(sortedForLayout.map((item) => item.id), ['group:bc', 'task:a', 'task:d'], '自动排序时应允许组合卡前置以避免空洞');

  exported.setState({
    boardData: { a: '100', b: '40', c: '30', d: '20' },
    layoutColumns: 2,
    autoSortEnabled: false
  });

  const manualAdjusted = JSON.parse(JSON.stringify(exported.sortViewItemsForLayout([singleA, groupBC, singleD])));
  assert.deepStrictEqual(manualAdjusted.map((item) => item.id), ['group:bc', 'task:a', 'task:d'], '手动模式下也应做最低限度的无空洞修正');

  const slots = exported.buildLayoutSlots([
    { id: 'group:bc', type: 'group', taskIds: ['b', 'c'] },
    { id: 'task:a', type: 'single', taskId: 'a' },
    { id: 'task:d', type: 'single', taskId: 'd' }
  ], 2);

  assert.deepStrictEqual(JSON.parse(JSON.stringify(slots)), [
    { id: 'group:bc', column: 1, row: 1, rowSpan: 2 },
    { id: 'task:a', column: 2, row: 1, rowSpan: 1 },
    { id: 'task:d', column: 2, row: 2, rowSpan: 1 }
  ], '显式排布应让组卡占两行，旁边单卡补齐空位');

  const slotsThreeCols = exported.buildLayoutSlots([
    { id: 'group:xy', type: 'group', taskIds: ['x', 'y'] },
    { id: 'task:a', type: 'single', taskId: 'a' },
    { id: 'task:b', type: 'single', taskId: 'b' },
    { id: 'task:c', type: 'single', taskId: 'c' }
  ], 3);

  assert.deepStrictEqual(JSON.parse(JSON.stringify(slotsThreeCols)), [
    { id: 'group:xy', column: 1, row: 1, rowSpan: 2 },
    { id: 'task:a', column: 2, row: 1, rowSpan: 1 },
    { id: 'task:b', column: 3, row: 1, rowSpan: 1 },
    { id: 'task:c', column: 2, row: 2, rowSpan: 1 }
  ], '3 列布局下也应优先填补组卡旁边的空位');

  exported.setState({
    boardData: {
      'ikun-api': '100',
      '发现-api': '40',
      'duck-api': '30'
    },
    layoutColumns: 2,
    autoSortEnabled: false,
    groups: [
      { id: 'group:pair', taskIds: ['ikun-api', '发现-api'] }
    ],
    manualOrder: ['group:pair', 'task:duck-api'],
    siteConfigs: [
      exported.buildCustomTaskConfig({
        id: 'ikun-api',
        name: 'Ikun',
        url: 'https://api.team-invite.cn/api/v1/auth/me',
        type: 'json',
        headers: { authorization: 'Bearer YOUR_AUTHORIZATION' },
        fieldPath: 'data.balance',
        isCustom: true
      }),
      exported.buildCustomTaskConfig({
        id: '发现-api',
        name: '发现',
        url: 'https://www.findcg.com/api/v1/auth/me',
        type: 'json',
        headers: { authorization: 'Bearer YOUR_AUTHORIZATION' },
        fieldPath: 'data.balance',
        isCustom: true
      }),
      exported.buildCustomTaskConfig({
        id: 'duck-api',
        name: 'Duck',
        url: 'https://www.duckcoding.ai/api/user/self',
        type: 'json',
        headers: { 'new-api-user': 'YOUR_NEW_API_USER' },
        fieldPath: 'data.quota',
        divideBy: 500000,
        isCustom: true
      })
    ]
  });
  exported.renderBoard([
    { id: 'group:pair', type: 'group', taskIds: ['ikun-api', '发现-api'] },
    { id: 'task:duck-api', type: 'single', taskId: 'duck-api' }
  ]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(exported.getCardLayout('task:duck-api'))), {
    column: '2',
    row: '1 / span 1'
  }, '初始 2 列布局下 duck 单卡应位于第 2 列第 1 行');

  exported.handleLayoutColumnsChange({ target: { value: '3' } });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(exported.getCardLayout('task:duck-api'))), {
    column: '2',
    row: '1 / span 1'
  }, '切换列数后应立即重算显式布局，不能沿用旧列数槽位');

  console.log('task-compact-layout.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
