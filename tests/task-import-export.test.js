const assert = require('assert');
const fs = require('fs');
const path = require('path');
const projectRoot = path.resolve(__dirname, '..');
const vm = require('vm');

function createClassList(initial = '') {
  const values = new Set(String(initial).split(/\s+/).filter(Boolean));
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    toggle(name, force) {
      if (force === true) {
        values.add(name);
        return true;
      }
      if (force === false) {
        values.delete(name);
        return false;
      }
      if (values.has(name)) {
        values.delete(name);
        return false;
      }
      values.add(name);
      return true;
    },
    contains(name) { return values.has(name); }
  };
}

function createElementStub(label = 'element') {
  return {
    label,
    hidden: false,
    disabled: false,
    value: '',
    textContent: '',
    innerText: '',
    dataset: {},
    className: '',
    classList: createClassList(),
    style: { setProperty() {} },
    files: [],
    children: [],
    addEventListener() {},
    removeEventListener() {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...children) {
      this.children = children;
    },
    remove() {},
    click() { this.clicked = true; },
    setAttribute() {},
    getAttribute() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focus() {}
  };
}

function createStorageMock(initialState = {}) {
  let snapshot = JSON.parse(JSON.stringify(initialState));
  const writes = [];
  return {
    local: {
      async get(keys) {
        if (!keys) {
          return JSON.parse(JSON.stringify(snapshot));
        }
        if (Array.isArray(keys)) {
          return Object.fromEntries(keys.map((key) => [key, snapshot[key]]));
        }
        if (typeof keys === 'string') {
          return { [keys]: snapshot[keys] };
        }
        if (keys && typeof keys === 'object') {
          return Object.fromEntries(Object.keys(keys).map((key) => [key, snapshot[key] ?? keys[key]]));
        }
        return {};
      },
      async set(payload) {
        writes.push(JSON.parse(JSON.stringify(payload)));
        snapshot = { ...snapshot, ...JSON.parse(JSON.stringify(payload)) };
      }
    },
    getSnapshot() { return JSON.parse(JSON.stringify(snapshot)); },
    getWrites() { return writes.map((entry) => JSON.parse(JSON.stringify(entry))); }
  };
}

function loadTestExports() {
  const sharedPath = path.join(projectRoot, 'src/shared/site-config-shared.js');
  const targetPath = path.join(projectRoot, 'src/pages/add-site.js');
  const sharedCode = fs.readFileSync(sharedPath, 'utf8');
  const code = fs.readFileSync(targetPath, 'utf8');
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Error,
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
    Date,
    URL,
    Blob: class Blob {
      constructor(parts, options = {}) {
        this.parts = parts;
        this.type = options.type || '';
      }
    },
    module: { exports: {} },
    exports: {},
    globalThis: null,
    document: {
      documentElement: { setAttribute() {} },
      body: createElementStub('body'),
      createElement() { return createElementStub('created'); },
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {},
      removeEventListener() {}
    },
    window: { setTimeout, clearTimeout, close() {} },
    chrome: {
      runtime: { getURL(file) { return `chrome-extension://test/${file}`; } },
      storage: { local: { async get() { return {}; }, async set() {} } },
      tabs: { create() {} }
    },
    fetch: async () => ({ ok: true, json: async () => [] })
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(sharedCode, sandbox, { filename: 'site-config-shared.js' });
  vm.runInContext(code, sandbox, { filename: 'add-site.js' });
  return sandbox.__testExports;
}

(async () => {
  const exported = loadTestExports();
  assert(exported, '应暴露 __testExports');
  assert.strictEqual(typeof exported.createPageApp, 'function', '应暴露 createPageApp 供导入导出测试使用');
  assert.strictEqual(typeof exported.createSiteManagerController, 'function', '应暴露 createSiteManagerController');
  assert.strictEqual(typeof exported.createBoardEditorController, 'function', '应暴露 createBoardEditorController');

  const storage = createStorageMock({
    siteConfigs: [
      { id: 'demo-click-refresh', name: '单击', url: '', type: 'json', fieldPath: '', isCustom: true, isDemo: true },
      {
        id: 'custom-old',
        name: '旧站点',
        url: 'https://demo.test/api/old',
        type: 'json',
        fieldPath: 'data.balance',
        headers: { authorization: 'Bearer old-token' },
        isCustom: true
      }
    ],
    boardData: { 'demo-click-refresh': '点我', 'custom-old': '9.00' },
    groups: [],
    manualOrder: ['task:demo-click-refresh', 'task:custom-old']
  });

  const manager = exported.createSiteManagerController({ storage });
  const imported = await manager.importSiteConfigs([
    {
      id: 'custom-old',
      name: '旧站点已覆盖',
      url: 'https://demo.test/api/updated',
      type: 'json',
      fieldPath: 'data.quota',
      headers: { authorization: 'Bearer new-token' },
      isCustom: true
    },
    {
      id: 'custom-new',
      name: '新站点',
      url: 'https://demo.test/api/new',
      type: 'json',
      fieldPath: 'data.balance',
      headers: { token: 'new-site-token' },
      isCustom: true
    }
  ]);

  assert.strictEqual(imported.importedCount, 2, '导入后应返回导入数量');
  const savedAfterImport = storage.getSnapshot().siteConfigs;
  const overwritten = savedAfterImport.find((task) => task.id === 'custom-old');
  const inserted = savedAfterImport.find((task) => task.id === 'custom-new');
  assert(overwritten, '同 id 站点应被覆盖保留');
  assert.strictEqual(overwritten.name, '旧站点已覆盖', '同 id 导入应覆盖旧配置');
  assert.strictEqual(overwritten.formula, undefined, '导入后不应保留 formula');
  assert.strictEqual(overwritten.divideBy, undefined, '导入后不应再写 divideBy');
  assert(inserted, '新站点应被追加');
  assert.strictEqual(inserted.isCustom, true, '导入站点应写入 isCustom');

  let invalidError = null;
  try {
    await manager.importSiteConfigs({ not: 'array' });
  } catch (error) {
    invalidError = error;
  }
  assert(invalidError, '非法导入结构应报错');
  assert.strictEqual(invalidError.kind, 'validation', '非法导入结构应返回校验错误');

  const refs = {
    homePanel: createElementStub('homePanel'),
    configBoard: createElementStub('configBoard'),
    configBoardEmpty: createElementStub('configBoardEmpty'),
    addSiteConfigBtn: createElementStub('addSiteConfigBtn'),
    importFileBtn: createElementStub('importFileBtn'),
    importFileInput: createElementStub('importFileInput'),
    importMessage: createElementStub('importMessage'),
    exportSitesBtn: createElementStub('exportSitesBtn'),
    siteConfigPanel: createElementStub('siteConfigPanel'),
    siteNameInput: createElementStub('siteNameInput'),
    siteUrlInput: createElementStub('siteUrlInput'),
    siteFieldPathInput: createElementStub('siteFieldPathInput'),
    formulaInput: createElementStub('formulaInput'),
    calculationSection: createElementStub('calculationSection'),
    rawValueText: createElementStub('rawValueText'),
    finishAddSiteBtn: createElementStub('finishAddSiteBtn'),
    deleteSiteBtn: createElementStub('deleteSiteBtn'),
    siteErrorMessage: createElementStub('siteErrorMessage'),
    completionHint: createElementStub('completionHint'),
    groupEditPanel: createElementStub('groupEditPanel'),
    groupNameInput: createElementStub('groupNameInput'),
    groupTaskNameList: createElementStub('groupTaskNameList'),
    finishGroupEditBtn: createElementStub('finishGroupEditBtn')
  };

  const objectUrls = [];
  const clickedAnchors = [];
  const doc = {
    documentElement: { setAttribute() {} },
    body: createElementStub('body'),
    createElement(tag) {
      if (tag === 'a') {
        const anchor = createElementStub('anchor');
        anchor.click = () => clickedAnchors.push({ href: anchor.href, download: anchor.download });
        return anchor;
      }
      return createElementStub(tag);
    },
    getElementById(id) { return refs[id] || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {}
  };

  const exportStorage = createStorageMock({
    siteConfigs: [
      { id: 'demo-click-refresh', name: '单击', url: '', type: 'json', fieldPath: '', isCustom: true, isDemo: true },
      {
        id: 'custom-export',
        name: '导出站点',
        url: 'https://demo.test/api/export',
        type: 'json',
        fieldPath: 'data.quota',
        headers: { authorization: 'Bearer export-token' },
        isCustom: true
      },
      {
        id: 'custom-board-b',
        name: '看板站点 B',
        url: 'https://demo.test/api/board-b',
        type: 'json',
        fieldPath: 'data.balance',
        headers: { token: 'board-b-token' },
        isCustom: true
      }
    ],
    boardData: { 'demo-click-refresh': '点我', 'custom-export': '3.00', 'custom-board-b': '2.00' },
    groups: [{ id: 'group:test', name: '导出组', taskIds: ['custom-export', 'custom-board-b'] }],
    manualOrder: ['task:demo-click-refresh', 'group:test']
  });

  const app = exported.createPageApp({
    document: doc,
    window: {
      setTimeout,
      clearTimeout,
      close() {},
      URL: {
        createObjectURL(blob) {
          objectUrls.push(blob);
          return 'blob://exported-site-configs';
        },
        revokeObjectURL() {}
      }
    },
    storage: exportStorage
  });

  assert.strictEqual(typeof app.exportSiteConfigs, 'function', '页面应用应暴露 exportSiteConfigs');
  assert.strictEqual(typeof app.importSiteConfigsFromText, 'function', '页面应用应暴露 importSiteConfigsFromText');

  await app.bind();
  await app.importSiteConfigsFromText(JSON.stringify({
    siteConfigs: [
      {
        id: 'custom-imported',
        name: '导入站点',
        url: 'https://demo.test/api/imported',
        type: 'json',
        fieldPath: 'data.balance',
        headers: { token: 'import-token' }
      }
    ],
    boardData: { 'custom-imported': '8.00' },
    groups: [],
    manualOrder: ['task:custom-imported']
  }));
  const importedSnapshot = exportStorage.getSnapshot();
  assert(importedSnapshot.siteConfigs.some((task) => task.id === 'custom-imported'), '页面导入完整包后应写入 storage');
  assert.strictEqual(importedSnapshot.boardData['custom-imported'], '8.00', '页面导入完整包后应写入 boardData');
  assert.deepStrictEqual(importedSnapshot.manualOrder, ['task:custom-imported'], '页面导入完整包后应写入 manualOrder');
  assert.strictEqual(refs.importMessage.hidden, false, '导入后应显示结果消息');
  assert(/导入/.test(refs.importMessage.textContent), '导入消息应提示导入结果');
  assert(refs.configBoard.children.length > 0, '导入后应刷新首页卡片展示区');

  await app.importSiteConfigsFromText(JSON.stringify([
    {
      id: 'custom-array-import',
      name: '数组导入站点',
      url: 'https://demo.test/api/array-imported',
      type: 'json',
      fieldPath: 'data.balance'
    }
  ]));
  assert(exportStorage.getSnapshot().siteConfigs.some((task) => task.id === 'custom-array-import'), '页面应兼容旧数组格式导入');

  await app.importSiteConfigsFromText(JSON.stringify([
    {
      id: 'custom-value-path-import',
      name: '新格式导入站点',
      url: 'https://demo.test/api/value-path',
      type: 'json',
      valuePath: 'data.quota'
    }
  ]));
  const valuePathImported = exportStorage.getSnapshot().siteConfigs.find((task) => task.id === 'custom-value-path-import');
  assert(valuePathImported, '页面应兼容 valuePath 新格式导入');
  assert.strictEqual(valuePathImported.fieldPath, 'data.quota', '导入 valuePath 后应恢复为内部 fieldPath');
  assert.strictEqual(valuePathImported.isCustom, true, '导入 valuePath 后应写入 isCustom');

  let pageImportError = null;
  try {
    await app.importSiteConfigsFromText('{ bad json');
  } catch (error) {
    pageImportError = error;
  }
  assert(pageImportError, '非法 JSON 应报错');
  assert.strictEqual(refs.importMessage.hidden, false, '非法 JSON 应在首页显示错误提示');
  assert(refs.importMessage.classList.contains('is-error'), '非法 JSON 提示应标记为错误');
  assert.strictEqual(app.getCurrentView(), 'home', '非法 JSON 导入失败后应留在首页');

  await app.exportSiteConfigs();
  assert.strictEqual(objectUrls.length, 1, '导出时应创建 Blob URL');
  assert.strictEqual(clickedAnchors.length, 1, '导出时应触发下载');
  const blobText = objectUrls[0].parts.join('');
  const exportedJson = JSON.parse(blobText);
  assert(Array.isArray(exportedJson.siteConfigs), '导出应使用完整看板包格式');
  assert(exportedJson.siteConfigs.every((task) => task.isDemo !== true), '导出配置时应过滤 demo 站点');
  assert(exportedJson.siteConfigs.every((task) => task.isCustom !== true), '导出站点不应暴露 isCustom 内部字段');
  assert(exportedJson.siteConfigs.every((task) => !Object.prototype.hasOwnProperty.call(task, 'fieldPath')), '导出站点不应暴露 fieldPath 技术字段名');
  assert(exportedJson.siteConfigs.some((task) => task.id === 'custom-export'), '导出配置时应包含普通站点');
  assert(exportedJson.siteConfigs.some((task) => task.id === 'custom-array-import'), '导出配置时应包含新导入站点');
  assert.strictEqual(exportedJson.siteConfigs.find((task) => task.id === 'custom-export').valuePath, 'data.quota', '导出站点应使用 valuePath 表达取值路径');
  assert(exportedJson.groups.every((group) => group.taskIds.every((taskId) => taskId !== 'demo-click-refresh')), '导出 groups 应过滤 demo');
  assert(exportedJson.manualOrder.every((itemId) => itemId !== 'task:demo-click-refresh'), '导出 manualOrder 应过滤 demo');
  assert(!Object.prototype.hasOwnProperty.call(exportedJson.boardData, 'demo-click-refresh'), '导出 boardData 应过滤 demo');

  const boardStorage = createStorageMock({
    siteConfigs: [
      {
        id: 'custom-board-a',
        name: '看板站点 A',
        url: 'https://example.test/api/board-a',
        type: 'json',
        fieldPath: 'data.balance',
        headers: { authorization: 'Bearer board-a' },
        isCustom: true
      },
      { id: 'custom-board-b', name: '看板站点 B', url: 'https://example.test/api/board-b', type: 'json', fieldPath: 'data.quota', isCustom: true }
    ],
    boardData: { 'custom-board-a': '1.00', 'custom-board-b': '2.00' },
    manualOrder: ['task:custom-board-a', 'task:custom-board-b'],
    groups: []
  });
  const boardEditor = exported.createBoardEditorController({ storage: boardStorage });
  await boardEditor.loadDraft();
  boardEditor.createDraftGroup('group:test', ['custom-board-a', 'custom-board-b'], '测试组');
  boardEditor.renameDraftGroup('group:test', '已改名测试组');
  boardEditor.reorderDraftItems(['group:test']);
  await boardEditor.saveDraftToBoard();
  const savedBoard = boardStorage.getSnapshot();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(savedBoard.manualOrder)), ['group:test'], '配置页保存草稿时应写入 manualOrder');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(savedBoard.groups)), [{ id: 'group:test', taskIds: ['custom-board-a', 'custom-board-b'], name: '已改名测试组' }], '配置页保存草稿时应写入 groups');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(savedBoard.boardData)), { 'custom-board-a': '1.00', 'custom-board-b': '2.00' }, '配置页保存草稿时应保留 boardData');

  console.log('task-import-export.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
