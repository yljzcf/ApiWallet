const assert = require('assert');
const fs = require('fs');
const path = require('path');
const projectRoot = path.resolve(__dirname, '..');
const vm = require('vm');

function createSandbox() {
  const fetchCalls = [];
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
    URL,
    module: { exports: {} },
    exports: {},
    globalThis: null,
    __fetchCalls: fetchCalls,
    document: {
      documentElement: { setAttribute() {} },
      body: null,
      createElement() { return createElementStub(); },
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {},
      removeEventListener() {}
    },
    window: { setTimeout, clearTimeout, close() {} },
    chrome: {
      runtime: {
        getURL(file) { return `chrome-extension://test/${file}`; }
      },
      storage: {
        local: {
          async get() { return {}; },
          async set() {}
        }
      },
      tabs: { create() {} }
    },
    fetch: async (url) => {
      fetchCalls.push(url);
      return { ok: true, status: 200, json: async () => ({}) };
    }
  };
  return sandbox;
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
    getWrites() {
      return writes.map((entry) => JSON.parse(JSON.stringify(entry)));
    },
    getSnapshot() {
      return JSON.parse(JSON.stringify(snapshot));
    }
  };
}

function createElementStub(id = '') {
  const listeners = new Map();
  const queryMap = new Map();
  return {
    id,
    children: [],
    dataset: {},
    style: { setProperty() {} },
    hidden: false,
    disabled: false,
    value: '',
    textContent: '',
    innerText: '',
    innerHTML: '',
    className: '',
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    },
    setAttribute(name, value) { this[name] = value; },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...children) {
      this.children = children;
    },
    remove() {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    dispatch(type, event = {}) {
      const listener = listeners.get(type);
      if (listener) {
        return listener({ target: this, currentTarget: this, stopPropagation() {}, preventDefault() {}, ...event });
      }
      return undefined;
    },
    click() {
      return this.dispatch('click');
    },
    setQuerySelectorAll(selector, nodes) {
      queryMap.set(selector, nodes);
    },
    querySelector() { return null; },
    querySelectorAll(selector) { return queryMap.get(selector) || []; },
    closest() { return null; },
    contains() { return false; },
    focus() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 };
    }
  };
}

function createDocumentStub() {
  const ids = [
    'modeCreateBtn',
    'modeEditBtn',
    'createModePanel',
    'editModePanel',
    'homePanel',
    'configBoard',
    'configBoardEmpty',
    'addSiteConfigBtn',
    'importFileBtn',
    'importFileInput',
    'exportSitesBtn',
    'importMessage',
    'siteConfigPanel',
    'siteNameInput',
    'siteUrlInput',
    'siteFieldPathInput',
    'authHeaderSelect',
    'authHeaderValueInput',
    'fetchRawValueBtn',
    'finishSiteConfigBtn',
    'advancedSettingsToggle',
    'advancedSettingsPanel',
    'testCalculationBtn',
    'calculationExpressionInput',
    'calculatedValueText',
    'authorizationInput',
    'tokenInput',
    'newApiUserInput',
    'nextStepBtn',
    'calculationSection',
    'formulaInput',
    'rawValueText',
    'previewValueText',
    'finishAddSiteBtn',
    'deleteSiteBtn',
    'siteErrorMessage',
    'completionHint',
    'groupEditPanel',
    'groupNameInput',
    'groupTaskNameList',
    'finishGroupEditBtn',
    'groupPopover',
    'groupPopoverNameInput',
    'saveGroupNameBtn',
    'groupPopoverTaskList',
    'createBackHomeBtn',
    'backHomeBtn',
    'editSiteNameInput',
    'editSiteUrlInput',
    'editSiteFieldPathInput',
    'editAuthorizationInput',
    'editTokenInput',
    'editNewApiUserInput',
    'editRawValueText',
    'editPreviewValueText',
    'editPreviewNoteText',
    'editMessage',
    'testEditSiteBtn',
    'saveEditSiteBtn',
    'editFormulaInput'
  ];
  const elements = new Map(ids.map((id) => [id, createElementStub(id)]));

  return {
    elements,
    documentElement: createElementStub('html'),
    body: createElementStub('body'),
    createElement(tagName) {
      const element = createElementStub(tagName);
      element.tagName = tagName.toUpperCase();
      return element;
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {}
  };
}

function loadTestExports() {
  const sharedPath = path.join(projectRoot, 'src/shared/site-config-shared.js');
  const targetPath = path.join(projectRoot, 'src/pages/add-site.js');
  assert(fs.existsSync(targetPath), '文件不存在: add-site.js');

  const sharedCode = fs.readFileSync(sharedPath, 'utf8');
  const code = fs.readFileSync(targetPath, 'utf8');
  const sandbox = createSandbox();
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(sharedCode, sandbox, { filename: 'site-config-shared.js' });
  vm.runInContext(code, sandbox, { filename: 'add-site.js' });

  const testExports = sandbox.__testExports;
  assert(testExports && typeof testExports === 'object', '缺少目标导出/结构: 需要暴露 __testExports 对象');
  testExports.__fetchCalls = sandbox.__fetchCalls;
  return testExports;
}

(async () => {
  const testExports = loadTestExports();
  const createController = testExports.createAddSiteTestController;
  const createSiteManager = testExports.createSiteManagerTestController || testExports.createSiteManagerController;

  assert.strictEqual(typeof createController, 'function', '应提供新增/编辑站点流程控制器');
  assert.strictEqual(typeof createSiteManager, 'function', '应提供站点管理控制器');
  assert.strictEqual(typeof testExports.createPageApp, 'function', '应提供 createPageApp 以测试页面路线');
  assert.strictEqual(typeof testExports.createBoardEditorController, 'function', '应提供 createBoardEditorController 以测试看板草稿');
  assert.deepStrictEqual(testExports.__fetchCalls, [], '站点管理页初始化时不应自动加载外置 JSON 默认站点配置');

  {
    let fetchCount = 0;
    const controller = createController({
      fetchImpl: async () => {
        fetchCount += 1;
        return {
          ok: true,
          status: 200,
          async json() { return { data: { quota: 2500000 } }; }
        };
      }
    });

    const result = await controller.submitBaseInfoAndAutoTest({
      name: '自定义站点',
      url: 'https://demo.test/api/user/self',
      fieldPath: 'data.quota',
      calculationExpression: 'X/500000'
    });

    assert.strictEqual(fetchCount, 1, '提交基础信息后应自动发起一次抓取测试');
    assert.strictEqual(result.step, 'calculation', '基础信息测试成功后应进入测试结果步骤');
    assert.strictEqual(result.rawValue, '2500000.00', '成功后应保留原始抓取值');
    assert.strictEqual(result.calculatedValue, '5.00', '成功后应返回公式计算预览值');
  }

  {
    const storage = createStorageMock({ siteConfigs: [] });
    const fetchedValues = [2500000, 3500000];
    let fetchCount = 0;
    const controller = createController({
      storage,
      fetchImpl: async () => {
        const quota = fetchedValues[fetchCount];
        fetchCount += 1;
        return {
          ok: true,
          status: 200,
          async json() { return { data: { quota } }; }
        };
      }
    });

    const firstPreview = await controller.submitBaseInfoAndAutoTest({
      name: '重算站点',
      url: 'https://demo.test/api/recalc',
      fieldPath: 'data.quota',
      calculationExpression: 'X/500000'
    });
    assert.strictEqual(firstPreview.rawValue, '2500000.00', '首次测试应显示第一次接口原值');
    assert.strictEqual(firstPreview.calculatedValue, '5.00', '首次测试应按第一次原值计算外显值');

    const secondPreview = await controller.recalculateWithExpression('X/700000');
    assert.strictEqual(fetchCount, 2, '修改公式后应重新请求接口，不能复用历史原值');
    assert.strictEqual(secondPreview.rawValue, '3500000.00', '修改公式后左侧应显示重新获取的原值');
    assert.strictEqual(secondPreview.calculatedValue, '5.00', '修改公式后右侧应显示新原值经过新公式后的外显值');

    const finishResult = await controller.getLivePreviewAndFinish({ finish: true });
    assert.strictEqual(finishResult.rawValue, '3500000.00', '保存时应保留最新一次重新获取的原值');
    assert.strictEqual(finishResult.calculatedValue, '5.00', '保存时应保留最新公式计算结果');
    assert.strictEqual(storage.getSnapshot().siteConfigs[0].calculationExpression, 'X/700000', '保存时应写入最新公式');
  }

  {
    const storage = createStorageMock({ siteConfigs: [] });
    const controller = createController({
      storage,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() { return { data: { quota: 2500000 } }; }
      })
    });

    await controller.submitBaseInfoAndAutoTest({
      name: '原值站点',
      url: 'https://demo.test/api/user/self',
      fieldPath: 'data.quota',
      calculationExpression: 'X/500000'
    });

    const finishResult = await controller.getLivePreviewAndFinish({ finish: true });
    assert.strictEqual(finishResult.rawValue, '2500000.00', '完成前应保留抓取原值');
    assert.strictEqual(finishResult.calculatedValue, '5.00', '完成前应保留计算预览值');

    const savedTask = storage.getSnapshot().siteConfigs[0];
    assert.strictEqual(savedTask.fieldPath, 'data.quota', '完成后应保留字段路径');
    assert.strictEqual(savedTask.calculationExpression, 'X/500000', '完成后应保留公式表达式');
    assert.strictEqual(savedTask.formula, undefined, '完成后不应保留 formula 配置');
    assert.strictEqual(savedTask.divideBy, undefined, '完成后不应再写入 divideBy');
  }

  {
    const storage = createStorageMock({
      siteConfigs: [
        {
          id: 'custom-old',
          name: '旧站点',
          url: 'https://demo.test/api/old',
          type: 'json',
          fieldPath: 'data.balance',
          headers: { authorization: 'Bearer old-token' },
          isCustom: true
        }
      ]
    });
    const manager = createSiteManager({ storage });

    const result = await manager.importSiteConfigs([
      {
        id: 'custom-old',
        name: '旧站点已覆盖',
        url: 'https://demo.test/api/updated',
        type: 'json',
        fieldPath: 'data.quota',
        calculationExpression: 'X/500000',
        formula: 'A/500000',
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
        divideBy: 500000,
        isCustom: true
      }
    ]);

    assert.strictEqual(result.importedCount, 2, '导入后应返回导入数量');
    const snapshot = storage.getSnapshot().siteConfigs;
    const overwritten = snapshot.find((task) => task.id === 'custom-old');
    const inserted = snapshot.find((task) => task.id === 'custom-new');
    assert(overwritten, '导入时应保留被覆盖站点');
    assert.strictEqual(overwritten.name, '旧站点已覆盖', '同 id 导入应覆盖旧配置');
    assert.strictEqual(overwritten.calculationExpression, 'X/500000', '导入后应保留新的公式表达式');
    assert.strictEqual(overwritten.formula, undefined, '导入后应清理旧 formula');
    assert.strictEqual(overwritten.divideBy, undefined, '导入后应清理旧 divideBy');
    assert(inserted, '导入时应追加新站点');
    assert.strictEqual(inserted.isCustom, true, '导入站点应被视为自定义站点');
    assert.strictEqual(inserted.formula, undefined, '新导入站点不应保留 formula');
    assert.strictEqual(inserted.divideBy, undefined, '新导入站点不应保留 divideBy');
  }

  {
    const storage = createStorageMock({
      siteConfigs: [
        {
          id: 'custom-a',
          name: '站点 A',
          url: 'https://example.test/api/a',
          type: 'json',
          fieldPath: 'data.balance',
          headers: { authorization: 'Bearer token-a' },
          isCustom: true
        },
        {
          id: 'custom-b',
          name: '站点 B',
          url: 'https://example.test/api/b',
          type: 'json',
          fieldPath: 'data.quota',
          isCustom: true
        }
      ],
      boardData: { 'custom-a': '1.00', 'custom-b': '2.00' },
      groups: [{ id: 'group:1', name: '旧组名', taskIds: ['custom-a', 'custom-b'] }],
      manualOrder: ['group:1']
    });
    let fetchCount = 0;
    const editor = testExports.createBoardEditorController({
      storage,
      fetchImpl: async () => {
        fetchCount += 1;
        return { ok: true, status: 200, json: async () => ({ data: { balance: 9 } }) };
      }
    });

    const initialBoard = await editor.loadDraft();
    assert.strictEqual(initialBoard.cards.length, 1, '配置页默认应按当前卡片和编组构建看板');
    assert.strictEqual(initialBoard.cards[0].type, 'group', '已有编组应显示为组卡片');

    const groupRoute = editor.resolveCardClick('group:1', { target: 'group-frame' });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(groupRoute)), { view: 'groupPopover', groupId: 'group:1' }, '点击编组外框应打开组名弹窗');

    const innerCardRoute = editor.resolveCardClick('custom-a', { target: 'group-card' });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(innerCardRoute)), { view: 'siteForm:edit', taskId: 'custom-a' }, '点击编组内卡片应进入单站点配置页');

    const singleCardRoute = editor.resolveCardClick('custom-b', { target: 'single-card' });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(singleCardRoute)), { view: 'siteForm:edit', taskId: 'custom-b' }, '点击单卡片应直接进入单站点配置页');
    assert.strictEqual(fetchCount, 0, '配置页点击卡片不应触发刷新请求');

    editor.deleteDraftSite('custom-b');
    await editor.saveDraftToBoard();
    const savedSnapshot = storage.getSnapshot();
    assert(!savedSnapshot.siteConfigs.some((task) => task.id === 'custom-b'), '保存后被删除卡片应从 storage siteConfigs 移除');
    assert.deepStrictEqual(savedSnapshot.boardData, { 'custom-a': '1.00' }, '保存后应清理被删除卡片的 boardData');
    assert.deepStrictEqual(savedSnapshot.groups, [], '保存后应清理不完整编组');
    assert.deepStrictEqual(savedSnapshot.manualOrder, ['task:custom-a'], '保存后应写入清理后的看板顺序');
  }

  {
    const storage = createStorageMock({});
    const documentStub = createDocumentStub();
    const app = testExports.createPageApp({
      storage,
      document: documentStub,
      window: { setTimeout, clearTimeout, close() {} },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() { return { data: { balance: 180 } }; }
      })
    });

    await app.bind();
    const emptyStorageBoard = documentStub.elements.get('configBoard');
    assert.strictEqual(emptyStorageBoard.children.length, 2, '配置页 storage 为空时应显示两张 demo 示例卡片');
    assert.deepStrictEqual(
      emptyStorageBoard.children.map((child) => child.textContent),
      ['单击', '长按'],
      '配置页 demo 示例卡片应使用短文案'
    );
    assert.strictEqual(documentStub.elements.get('configBoardEmpty').hidden, true, '显示 demo 卡片时不应展示空状态');

    const demoWritesBeforeEdit = storage.getWrites().length;
    documentStub.elements.get('configBoard').children[0].click();
    assert.strictEqual(app.getCurrentView(), 'siteForm:edit', '点击 demo 卡片应进入站点编辑页');
    assert.strictEqual(storage.getWrites().length, demoWritesBeforeEdit, '点击 demo 卡片进入编辑页不应写入 storage');

    documentStub.elements.get('backHomeBtn').click();
    assert.strictEqual(app.getCurrentView(), 'home', '从 demo 编辑页取消后应返回首页');

    documentStub.elements.get('addSiteConfigBtn').click();
    assert.strictEqual(app.getCurrentView(), 'siteForm:new', '点击新增站点按钮应进入新增站点配置页');
    assert.strictEqual(documentStub.elements.get('homePanel').hidden, true, '进入新增站点配置页后应隐藏首页');
    assert.strictEqual(documentStub.elements.get('siteConfigPanel').hidden, false, '进入新增站点配置页后应显示站点配置面板');
    assert.strictEqual(documentStub.elements.get('siteErrorMessage').hidden, true, '进入新增站点配置页初始不应显示错误提示');

    const writesBeforeCancel = storage.getWrites().length;
    documentStub.elements.get('createBackHomeBtn').click();
    assert.strictEqual(app.getCurrentView(), 'home', '新增流程点击取消后应返回首页');
    assert.strictEqual(storage.getWrites().length, writesBeforeCancel, '取消新增流程不应写入 storage');
    assert.strictEqual(documentStub.elements.get('homePanel').hidden, false, '取消新增流程后应重新显示首页');
    assert.strictEqual(documentStub.elements.get('siteConfigPanel').hidden, true, '取消新增流程后应隐藏站点配置面板');
  }

  {
    const storage = createStorageMock({
      siteConfigs: [
        { id: 'custom-a', name: '站点 A', url: 'https://example.test/a', type: 'json', fieldPath: 'data.balance', isCustom: true }
      ],
      boardData: { 'custom-a': '1.00' },
      groups: [],
      manualOrder: ['task:custom-a']
    });
    const documentStub = createDocumentStub();
    let closeCalled = false;
    const app = testExports.createPageApp({
      storage,
      document: documentStub,
      window: { setTimeout, clearTimeout, close() { closeCalled = true; } },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() { return { data: { balance: 180 } }; }
      })
    });

    await app.bind();
    assert.strictEqual(app.getCurrentView(), 'home', '页面初始化后应停留在首页');
    assert.strictEqual(documentStub.elements.get('configBoard').children.length, 1, '页面初始化应渲染当前卡片到 configBoard');

    documentStub.elements.get('configBoard').children[0].click();
    assert.strictEqual(app.getCurrentView(), 'siteForm:edit', '点击单张卡片应进入站点配置页');
    assert.strictEqual(documentStub.elements.get('createModePanel').hidden, true, '点击单卡进入配置页时不应显示新增站点面板');
    assert.strictEqual(documentStub.elements.get('editModePanel').hidden, false, '点击单卡进入配置页时应显示修改站点面板');
    assert.strictEqual(documentStub.elements.get('deleteSiteBtn').hidden, false, '点击单卡进入修改站点面板后应能看到删除按钮');

    await app.finishSiteEdit({ calculationExpression: 'X/2' });
    assert.strictEqual(storage.getSnapshot().siteConfigs[0].calculationExpression, 'X/2', '编辑完成后应保存新的公式表达式');
    assert.strictEqual(app.getCurrentView(), 'home', '编辑完成后应回到首页');
    assert.strictEqual(closeCalled, false, '完成后不应自动关闭配置页');
    assert.strictEqual(documentStub.elements.get('configBoard').children.length, 1, '完成后应刷新卡片展示区');
  }

  {
    const storage = createStorageMock({
      siteConfigs: [
        { id: 'custom-a', name: '站点 A', url: 'https://example.test/a', type: 'json', fieldPath: 'data.balance', isCustom: true },
        { id: 'custom-b', name: '站点 B', url: 'https://example.test/b', type: 'json', fieldPath: 'data.quota', isCustom: true }
      ],
      boardData: { 'custom-a': '1.00', 'custom-b': '2.00' },
      groups: [{ id: 'group:1', name: '旧组名', taskIds: ['custom-a', 'custom-b'] }],
      manualOrder: ['group:1']
    });
    const documentStub = createDocumentStub();
    const app = testExports.createPageApp({
      storage,
      document: documentStub,
      window: { setTimeout, clearTimeout, close() {} },
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) })
    });

    await app.bind();
    documentStub.elements.get('configBoard').children[0].click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(app.getCurrentView(), 'home', '点击编组卡片后应继续停留在首页');
    assert.strictEqual(documentStub.elements.get('groupPopover').hidden, false, '点击编组卡片应显示编组弹窗');
    assert.strictEqual(documentStub.elements.get('groupPopoverNameInput').value, '旧组名', '弹窗应填入当前组名');
    assert.strictEqual(documentStub.elements.get('groupPopoverTaskList').children.length, 2, '弹窗应显示组内两张站点卡片');

    documentStub.elements.get('groupPopoverNameInput').value = '新组名';
    await documentStub.elements.get('saveGroupNameBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(app.getCurrentView(), 'home', '保存组名后应仍停留在首页');
    assert.strictEqual(documentStub.elements.get('groupPopover').hidden, false, '保存组名后应保持弹窗可见');
    assert.strictEqual(storage.getSnapshot().groups[0].name, '新组名', '弹窗保存后应保存新组名');

    await documentStub.elements.get('groupPopoverTaskList').children[1].click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(app.getCurrentView(), 'siteForm:edit', '点击弹窗内站点卡片应进入对应单站点配置页');
    assert.strictEqual(documentStub.elements.get('groupPopover').hidden, true, '进入单站点配置页后应隐藏编组弹窗');
    assert.strictEqual(documentStub.elements.get('siteNameInput').value, '站点 B', '点击第二张站点卡片应选中对应站点');
  }

  {
    const storage = createStorageMock({});
    const documentStub = createDocumentStub();
    const app = testExports.createPageApp({
      storage,
      document: documentStub,
      window: { setTimeout, clearTimeout, close() {} },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() { return { data: { balance: 2500000 } }; }
      })
    });

    await app.bind();
    documentStub.elements.get('addSiteConfigBtn').click();
    assert.strictEqual(documentStub.elements.get('advancedSettingsPanel').hidden, true, '高级设置默认应保持收起状态');
    documentStub.elements.get('siteNameInput').value = '原值联动站点';
    documentStub.elements.get('siteUrlInput').value = 'https://example.test/raw';
    documentStub.elements.get('siteFieldPathInput').value = 'data.balance';

    await documentStub.elements.get('fetchRawValueBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(documentStub.elements.get('rawValueText').textContent, '2500000.00', '访问接口后应只更新原值展示');
    assert.strictEqual(documentStub.elements.get('calculatedValueText').textContent, '--', '访问接口后不应把原值同步到计算结果展示');

    documentStub.elements.get('advancedSettingsToggle').click();
    assert.strictEqual(documentStub.elements.get('advancedSettingsPanel').hidden, false, '点击后高级设置应展开');
    documentStub.elements.get('calculationExpressionInput').value = 'X/500000';
    await documentStub.elements.get('calculationExpressionInput').dispatch('change');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(documentStub.elements.get('calculationExpressionInput').value, 'X/500000', '公式输入框失焦后不应清空公式');
    assert.strictEqual(documentStub.elements.get('rawValueText').textContent, '2500000.00', '公式输入框失焦后不应清空原值');
    assert.strictEqual(documentStub.elements.get('calculatedValueText').textContent, '--', '公式输入框失焦后不应自动计算');
    await documentStub.elements.get('testCalculationBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(documentStub.elements.get('calculationExpressionInput').value, 'X/500000', '测试计算后不应清空公式输入框');
    assert.strictEqual(documentStub.elements.get('rawValueText').textContent, '2500000.00', '测试计算后原值展示应仍为原值');
    assert.strictEqual(documentStub.elements.get('calculatedValueText').textContent, '5.00', '测试计算后计算结果展示应显示公式结果');
  }

  {
    const storage = createStorageMock({
      siteConfigs: [
        { id: 'custom-preview', name: '预览站点', url: 'https://example.test/preview', type: 'json', fieldPath: 'data.balance', formula: 'A/500000', isCustom: true }
      ],
      boardData: { 'custom-preview': '1.00' },
      groups: [],
      manualOrder: ['task:custom-preview']
    });
    const documentStub = createDocumentStub();
    const app = testExports.createPageApp({
      storage,
      document: documentStub,
      window: { setTimeout, clearTimeout, close() {} },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() { return { data: { balance: 2500000 } }; }
      })
    });

    await app.bind();
    documentStub.elements.get('configBoard').children[0].click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(documentStub.elements.get('rawValueText').textContent, '1.00', '编辑页进入时应展示当前卡片值');

    await documentStub.elements.get('fetchRawValueBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(documentStub.elements.get('rawValueText').textContent, '2500000.00', '编辑页访问接口后应直接显示抓取原值');
  }

  {
    const storage = createStorageMock({
      siteConfigs: [
        { id: 'custom-edit-save', name: '保存站点', url: 'https://example.test/save', type: 'json', fieldPath: 'data.balance', formula: 'A/2', isCustom: true }
      ],
      boardData: { 'custom-edit-save': '1.00' },
      groups: [],
      manualOrder: ['task:custom-edit-save']
    });
    const documentStub = createDocumentStub();
    const app = testExports.createPageApp({
      storage,
      document: documentStub,
      window: { setTimeout, clearTimeout, close() {} },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() { return { data: { balance: 5039770 } }; }
      })
    });

    await app.bind();
    documentStub.elements.get('configBoard').children[0].click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    await documentStub.elements.get('fetchRawValueBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(documentStub.elements.get('rawValueText').textContent, '5039770.00', '编辑页访问接口后应显示原值');

    await documentStub.elements.get('finishSiteConfigBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(storage.getSnapshot().siteConfigs[0].formula, undefined, '保存后不应保留公式配置');
    assert.strictEqual(storage.getSnapshot().siteConfigs[0].divideBy, undefined, '保存后不应保留 divideBy');

    documentStub.elements.get('configBoard').children[0].click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(documentStub.elements.get('rawValueText').textContent, '1.00', '重新进入编辑页时应先展示当前卡片值');

    await documentStub.elements.get('fetchRawValueBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(documentStub.elements.get('rawValueText').textContent, '5039770.00', '保存后重新访问接口仍应能重新抓取原值');
  }

  {
    const storage = createStorageMock({
      siteConfigs: [
        { id: 'custom-delete', name: '待删除站点', url: 'https://example.test/delete', type: 'json', fieldPath: 'data.balance', isCustom: true }
      ],
      boardData: { 'custom-delete': '1.00' },
      groups: [],
      manualOrder: ['task:custom-delete']
    });
    const documentStub = createDocumentStub();
    const deleteClicks = [];
    documentStub.elements.get('deleteSiteBtn').addEventListener = function addDeleteListener(type, listener) {
      if (type === 'click') {
        deleteClicks.push(listener);
      }
    };
    documentStub.elements.get('deleteSiteBtn').click = async function clickDelete() {
      const listeners = deleteClicks.slice();
      const results = listeners.map((listener) => listener({ target: this, currentTarget: this, stopPropagation() {}, preventDefault() {} }));
      await Promise.all(results);
    };
    const app = testExports.createPageApp({
      storage,
      document: documentStub,
      window: { setTimeout, clearTimeout, close() {} },
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) })
    });

    await app.bind();
    const deleteButton = documentStub.elements.get('deleteSiteBtn');
    deleteButton.click = function clickDeleteWithoutPromise() {
      const listeners = deleteClicks.slice();
      listeners.forEach((listener) => listener({ target: this, currentTarget: this, stopPropagation() {}, preventDefault() {} }));
    };
    await documentStub.elements.get('modeEditBtn').click();
    documentStub.elements.get('configBoard').children[0].click();
    assert.strictEqual(app.getCurrentView(), 'siteForm:edit', '点击单卡应进入站点配置页');

    await documentStub.elements.get('deleteSiteBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const snapshot = storage.getSnapshot();
    assert.strictEqual(app.getCurrentView(), 'home', '删除单卡后应返回首页');
    assert.deepStrictEqual(snapshot.siteConfigs, [], '删除后 storage siteConfigs 不应保留该站点');
    assert.deepStrictEqual(snapshot.boardData, {}, '删除后应清理该站点 boardData');
    assert.deepStrictEqual(snapshot.groups, [], '删除后应清理无效编组');
    assert.deepStrictEqual(snapshot.manualOrder, [], '删除后应清理该站点排序');
  }

  {
    const storage = createStorageMock({
      siteConfigs: [
        { id: 'custom-cancel', name: '取消站点', url: 'https://example.test/cancel', type: 'json', fieldPath: 'data.balance', isCustom: true }
      ],
      boardData: { 'custom-cancel': '1.00' },
      groups: [],
      manualOrder: ['task:custom-cancel']
    });
    const documentStub = createDocumentStub();
    const app = testExports.createPageApp({
      storage,
      document: documentStub,
      window: { setTimeout, clearTimeout, close() {} },
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) })
    });

    await app.bind();
    const writesBeforeCancel = storage.getWrites().length;
    documentStub.elements.get('configBoard').children[0].click();
    assert.strictEqual(app.getCurrentView(), 'siteForm:edit', '点击单卡应进入站点配置页');

    documentStub.elements.get('backHomeBtn').click();
    assert.strictEqual(app.getCurrentView(), 'home', '取消修改后应返回首页');
    assert.strictEqual(storage.getWrites().length, writesBeforeCancel, '取消修改不应写入 storage');
    assert.strictEqual(storage.getSnapshot().siteConfigs[0].name, '取消站点', '取消修改不应改变站点配置');
  }

  console.log('task-add-site-flow.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
