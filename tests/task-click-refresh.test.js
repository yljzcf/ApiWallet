const assert = require('assert');
const fs = require('fs');
const path = require('path');
const projectRoot = path.resolve(__dirname, '..');
const vm = require('vm');

function createClassList(initial = '') {
  const values = new Set(String(initial).split(/\s+/).filter(Boolean));
  return {
    add(...names) {
      names.forEach((name) => values.add(name));
    },
    remove(...names) {
      names.forEach((name) => values.delete(name));
    },
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
    contains(name) {
      return values.has(name);
    },
    toString() {
      return Array.from(values).join(' ');
    }
  };
}

function createElementStub(label = 'element') {
  let innerHTMLValue = '';
  const listeners = new Map();
  const selectorMap = new Map();
  const selectorAllMap = new Map();
  const attributes = new Map();
  const pointerCaptures = new Set();

  const element = {
    label,
    style: { setProperty() {} },
    dataset: {},
    hidden: false,
    disabled: false,
    innerText: '',
    value: '2',
    children: [],
    parentNode: null,
    className: '',
    classList: createClassList(),
    _selectorMap: selectorMap,
    _selectorAllMap: selectorAllMap,
    _closestMap: new Map(),
    _attributes: attributes,
    setAttribute(name, value) {
      attributes.set(name, String(value));
      if (name === 'class') {
        this.className = String(value);
        this.classList = createClassList(value);
      }
    },
    getAttribute(name) {
      return attributes.get(name) || null;
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      listeners.set(type, handlers.filter((entry) => entry !== handler));
    },
    async dispatchEvent(type, event = {}) {
      const handlers = listeners.get(type) || [];
      for (const handler of handlers) {
        await handler(event);
      }
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    remove() {},
    querySelector(selector) {
      return selectorMap.get(selector) || createElementStub(`${label}:${selector}`);
    },
    querySelectorAll(selector) {
      return selectorAllMap.get(selector) || [];
    },
    closest(selector) {
      return this._closestMap.get(selector) || null;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 };
    },
    releasePointerCapture(pointerId) {
      pointerCaptures.delete(pointerId);
    },
    setPointerCapture(pointerId) {
      pointerCaptures.add(pointerId);
    },
    hasPointerCapture(pointerId) {
      return pointerCaptures.has(pointerId);
    },
    contains(target) {
      return target === this || this.children.includes(target);
    },
    focus() {}
  };

  Object.defineProperty(element, 'innerHTML', {
    get() {
      return innerHTMLValue;
    },
    set(value) {
      innerHTMLValue = String(value);
      if (value.includes('class="card-main"')) {
        const mainButton = createElementStub(`${label}:card-main`);
        const body = createElementStub(`${label}:card-body`);
        mainButton.className = 'card-main';
        mainButton.classList = createClassList('card-main');
        body.className = 'card-body';
        body.classList = createClassList('card-body');
        mainButton._closestMap.set('.card-main', mainButton);
        selectorMap.set('.card-main', mainButton);
        selectorMap.set('.card-body', body);
        mainButton.appendChild(body);
        element.appendChild(mainButton);
      }

      if (value.includes('class="single-row"')) {
        const row = createElementStub(`${label}:single-row`);
        const title = createElementStub(`${label}:title`);
        const valueEl = createElementStub(`${label}:value`);
        row.className = 'single-row';
        row.classList = createClassList('single-row');
        title.className = 'title';
        title.classList = createClassList('title');
        valueEl.className = 'value';
        valueEl.classList = createClassList('value');
        selectorMap.set('.single-row', row);
        selectorMap.set('.title', title);
        selectorMap.set('.value', valueEl);
        row.appendChild(title);
        row.appendChild(valueEl);
        element.appendChild(row);
      }
    }
  });

  return element;
}

function bindCardClosests(card, mainButton) {
  card._closestMap.set('.card', card);
  mainButton._closestMap.set('.card', card);
  mainButton._closestMap.set('.card-main', mainButton);
}

function loadPopupSandbox() {
  const sharedCode = fs.readFileSync(path.join(projectRoot, 'src/shared/site-config-shared.js'), 'utf8');
  const code = fs.readFileSync(path.join(projectRoot, 'src/pages/popup.js'), 'utf8');
  const elementCache = new Map();
  const getEl = (id) => {
    if (!elementCache.has(id)) {
      elementCache.set(id, createElementStub(`id:${id}`));
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
      body: createElementStub('document:body'),
      createElement() { return createElementStub('document:created'); },
      getElementById(id) { return getEl(id); },
      querySelector() { return createElementStub('document:query'); },
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
    renderBoard,
    buildDefaultSiteConfigs,
    buildCustomTaskConfig,
    setState(snapshot) {
      boardDataCache = snapshot.boardData || {};
      groupsCache = snapshot.groups || [];
      manualOrderCache = snapshot.manualOrder || [];
      layoutColumns = snapshot.layoutColumns || 2;
      autoSortEnabled = Boolean(snapshot.autoSortEnabled);
      setSiteConfigs(snapshot.siteConfigs || buildDefaultSiteConfigs());
    },
    realFetchSingleData: fetchSingleData,
    setFetchSingleData(fn) {
      fetchSingleData = fn;
    },
    fetchSingleData(taskId) {
      return fetchSingleData(taskId);
    },
    getBoardData() {
      return { ...boardDataCache };
    },
    getCardValue(taskId) {
      const viewItemId = getViewItemIdByTaskId(taskId);
      const refs = cardRefs.get(viewItemId);
      const valueEl = refs?.values?.get(taskId);
      return valueEl ? (valueEl.innerText || valueEl.textContent) : 'missing:' + viewItemId + ':' + Boolean(refs);
    },
    async dispatchCardPointer(viewItemId, type, overrides = {}) {
      const refs = cardRefs.get(viewItemId);
      if (!refs?.card || !refs?.mainButton) {
        return false;
      }
      refs.card._closestMap.set('.card', refs.card);
      refs.mainButton._closestMap.set('.card', refs.card);
      refs.mainButton._closestMap.set('.card-main', refs.mainButton);
      const target = refs.mainButton;
      if (overrides.targetClosestTaskId) {
        const row = {
          dataset: { taskId: overrides.targetClosestTaskId },
          closest() { return null; }
        };
        target._closestMap.set('.group-row[data-task-id]', row);
      }
      const event = {
        button: 0,
        pointerId: 1,
        clientX: 10,
        clientY: 10,
        target,
        preventDefault() {},
        ...overrides
      };
      await refs.card.dispatchEvent(type, event);
      return true;
    }
  };`, sandbox);
  return sandbox;
}

(async () => {
  const sandbox = loadPopupSandbox();
  await sandbox.__popupInitPromise;
  const exported = sandbox.__testExports;

  exported.setState({
    boardData: { 'duck-api': '30' },
    layoutColumns: 2,
    autoSortEnabled: false,
    siteConfigs: [
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

  const calls = [];
  exported.setFetchSingleData(async (taskId) => {
    calls.push(taskId);
    return { ok: true, taskId };
  });

  exported.renderBoard([
    { id: 'task:duck-api', type: 'single', taskId: 'duck-api' }
  ]);

  await exported.dispatchCardPointer('task:duck-api', 'pointerdown');
  await exported.dispatchCardPointer('task:duck-api', 'pointerup');

  assert.deepStrictEqual(calls, ['duck-api'], '左键轻点单卡时应直接触发单站点刷新，而不是依赖额外 click 合成');

  exported.setState({
    boardData: { 'ikun-api': '100', '发现-api': '40' },
    layoutColumns: 2,
    autoSortEnabled: false,
    groups: [{ id: 'group:pair', taskIds: ['ikun-api', '发现-api'] }],
    manualOrder: ['group:pair'],
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
      })
    ]
  });

  const groupedCalls = [];
  exported.setFetchSingleData(async (taskId) => {
    groupedCalls.push(taskId);
    return { ok: true, taskId };
  });

  exported.renderBoard([
    { id: 'group:pair', type: 'group', taskIds: ['ikun-api', '发现-api'] }
  ]);

  await exported.dispatchCardPointer('group:pair', 'pointerdown', {
    targetClosestTaskId: 'ikun-api'
  });
  await exported.dispatchCardPointer('group:pair', 'pointerup', {
    targetClosestTaskId: 'ikun-api'
  });

  assert.deepStrictEqual(groupedCalls, ['ikun-api', '发现-api'], '左键轻点组卡时应刷新组内两个站点');

  exported.setState({
    boardData: { 'formula-api': '旧值' },
    layoutColumns: 2,
    autoSortEnabled: false,
    siteConfigs: [
      exported.buildCustomTaskConfig({
        id: 'formula-api',
        name: '公式站点',
        url: 'https://example.test/api/formula',
        type: 'json',
        fieldPath: 'data.quota',
        calculationExpression: 'X/0',
        isCustom: true
      })
    ]
  });

  exported.renderBoard([
    { id: 'task:formula-api', type: 'single', taskId: 'formula-api' }
  ]);

  const originalFetch = sandbox.fetch;
  sandbox.fetch = async () => ({
    ok: true,
    status: 200,
    async json() { return { data: { quota: 2500000 } }; }
  });
  await exported.realFetchSingleData('formula-api');
  sandbox.fetch = originalFetch;

  assert.strictEqual(exported.getBoardData()['formula-api'], '旧值', '公式错误时不应覆盖上一次成功值');
  assert.strictEqual(exported.getCardValue('formula-api'), '公式错误', '公式错误时卡片应显示“公式错误”');

  console.log('task-click-refresh.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
