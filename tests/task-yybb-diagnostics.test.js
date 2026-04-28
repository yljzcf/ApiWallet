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
    window: {},
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
    CONFIG,
    loadPopupState,
    extractBalanceValue: globalThis.SiteConfigShared.extractBalanceValue,
    buildHttpError,
    createTaskError: globalThis.SiteConfigShared.createTaskError,
    createMissingFieldError: globalThis.SiteConfigShared.createMissingFieldError
  };`, sandbox);
  return sandbox;
}

(async () => {
  const sandbox = loadPopupSandbox();
  await sandbox.__popupInitPromise;
  const exported = sandbox.__testExports;

  assert(!exported.CONFIG.some((task) => task.id === 'yybb-api' || task.id === 'yybb-api2'), 'CONFIG 不应再包含 yybb 两个站点');

  sandbox.chrome.storage.local.get = async () => ({
    boardData: {
      'yybb-api': '1.00',
      'yybb-api2': '2.00',
      'ikun-api': '3.00'
    },
    manualOrder: ['task:yybb-api', 'task:ikun-api', 'task:yybb-api2'],
    groups: [
      { id: 'group:legacy', taskIds: ['yybb-api', 'ikun-api'] },
      { id: 'group:valid', taskIds: ['ikun-api', '发现-api'] }
    ],
    autoSortEnabled: true,
    layoutColumns: 4,
    lastUpdateTime: '04/26 10:00'
  });

  const popupState = await exported.loadPopupState();
  assert.strictEqual(popupState.layoutColumns, 2, '历史 4 列配置应迁移回 2 列大号');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(popupState.boardData)), {}, '默认站点为空时应清理 boardData 中所有失效残留');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(popupState.manualOrder)), [], '默认站点为空时应清理 manualOrder 中所有失效残留');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(popupState.groups)), [], '默认站点为空时应移除所有失效分组');

  assert.strictEqual(exported.extractBalanceValue({ data: { balance: '12.5' } }, 'data.balance'), '12.50', '纯数字字符串应能被提取');

  let missingFieldError = null;
  try {
    exported.extractBalanceValue({ data: {} }, 'data.balance');
  } catch (error) {
    missingFieldError = error;
  }
  assert(missingFieldError, '字段缺失时应抛错');
  assert.strictEqual(missingFieldError.kind, 'missing-field');

  let invalidValueError = null;
  try {
    exported.extractBalanceValue({ data: { balance: 'abc' } }, 'data.balance');
  } catch (error) {
    invalidValueError = error;
  }
  assert(invalidValueError, '字段值非法时应抛错');
  assert.strictEqual(invalidValueError.kind, 'invalid-value', '应把非法值和字段缺失区分开');

  let appError = null;
  try {
    exported.extractBalanceValue({ code: 'TOKEN_EXPIRED', message: 'Token has expired' }, 'data.balance');
  } catch (error) {
    appError = error;
  }
  assert(appError, '应用层错误结构时应抛错');
  assert.strictEqual(appError.kind, 'app-error', '应识别应用层错误结构');
  assert(/TOKEN_EXPIRED/.test(appError.message), '错误信息应带上应用层错误码');

  const authError = exported.buildHttpError({ id: 'ikun-api' }, { status: 401 });
  assert.strictEqual(authError.kind, 'auth');
  assert(/token/i.test(authError.message), '401 认证错误应明确提示 token 失效');

  console.log('task-yybb-diagnostics.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
