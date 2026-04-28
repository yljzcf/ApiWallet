const SiteConfigShared = globalThis.SiteConfigShared;
if (!SiteConfigShared) {
  throw new Error('SiteConfigShared 未加载');
}

const {
  DEMO_SITE_CONFIGS,
  normalizeHeaders,
  buildCustomTaskConfig,
  buildManagedTaskConfig,
  normalizeSiteConfigs,
  serializeSiteConfigs,
  serializePublicSiteConfigs,
  buildPersistedSiteConfigsFromRuntime,
  mergeStoredSiteConfigs,
  buildUpdatedSiteConfigs,
  deleteSiteConfigEntry,
  detectSuggestedAuthHeader,
  formatWizardErrorMessage,
  buildHttpError,
  createTaskError,
  extractBalanceValue,
  applyCalculationExpression,
  normalizeCalculationExpression,
  isDemoTask
} = SiteConfigShared;

const STORAGE_KEYS = ['siteConfigs', 'colorMode'];
const SUPPORTED_AUTH_HEADERS = ['authorization', 'token', 'new-api-user'];
const DEFAULT_MODE = 'create';

function createDomRefs(doc = document) {
  return {
    modeCreateBtn: doc.getElementById('modeCreateBtn'),
    modeEditBtn: doc.getElementById('modeEditBtn'),
    createPanel: doc.getElementById('createModePanel'),
    editPanel: doc.getElementById('editModePanel'),
    siteNameInput: doc.getElementById('siteNameInput'),
    siteUrlInput: doc.getElementById('siteUrlInput'),
    siteFieldPathInput: doc.getElementById('siteFieldPathInput'),
    authHeaderSelect: doc.getElementById('authHeaderSelect'),
    authHeaderValueInput: doc.getElementById('authHeaderValueInput'),
    fetchRawValueBtn: doc.getElementById('fetchRawValueBtn'),
    finishSiteConfigBtn: doc.getElementById('finishSiteConfigBtn'),
    advancedSettingsToggle: doc.getElementById('advancedSettingsToggle'),
    advancedSettingsPanel: doc.getElementById('advancedSettingsPanel'),
    testCalculationBtn: doc.getElementById('testCalculationBtn'),
    nextStepBtn: doc.getElementById('nextStepBtn'),
    finishAddSiteBtn: doc.getElementById('finishAddSiteBtn'),
    authSupplementSection: doc.getElementById('authSupplementSection'),
    authHintText: doc.getElementById('authHintText'),
    siteErrorMessage: doc.getElementById('siteErrorMessage'),
    calculationSection: doc.getElementById('calculationSection'),
    rawValueText: doc.getElementById('rawValueText'),
    calculationExpressionInput: doc.getElementById('calculationExpressionInput'),
    calculatedValueText: doc.getElementById('calculatedValueText'),
    authorizationInput: doc.getElementById('authorizationInput'),
    tokenInput: doc.getElementById('tokenInput'),
    newApiUserInput: doc.getElementById('newApiUserInput'),
    stepBasePill: doc.getElementById('stepBasePill'),
    stepAuthPill: doc.getElementById('stepAuthPill'),
    stepCalcPill: doc.getElementById('stepCalcPill'),
    completionHint: doc.getElementById('completionHint'),
    managedSiteList: doc.getElementById('managedSiteList'),
    siteListEmpty: doc.getElementById('siteListEmpty'),
    homePanel: doc.getElementById('homePanel'),
    configBoard: doc.getElementById('configBoard'),
    configBoardEmpty: doc.getElementById('configBoardEmpty'),
    siteConfigPanel: doc.getElementById('siteConfigPanel'),
    groupEditPanel: doc.getElementById('groupEditPanel'),
    groupNameInput: doc.getElementById('groupNameInput'),
    groupTaskNameList: doc.getElementById('groupTaskNameList'),
    finishGroupEditBtn: doc.getElementById('finishGroupEditBtn'),
    groupPopover: doc.getElementById('groupPopover'),
    groupPopoverNameInput: doc.getElementById('groupPopoverNameInput'),
    saveGroupNameBtn: doc.getElementById('saveGroupNameBtn'),
    groupPopoverTaskList: doc.getElementById('groupPopoverTaskList'),
    selectedSiteBadge: doc.getElementById('selectedSiteBadge'),
    editSiteNameInput: doc.getElementById('editSiteNameInput'),
    editSiteUrlInput: doc.getElementById('editSiteUrlInput'),
    editSiteFieldPathInput: doc.getElementById('editSiteFieldPathInput'),
    editAuthorizationInput: doc.getElementById('editAuthorizationInput'),
    editTokenInput: doc.getElementById('editTokenInput'),
    editNewApiUserInput: doc.getElementById('editNewApiUserInput'),
    editRawValueText: doc.getElementById('editRawValueText'),
    editCalculationExpressionInput: doc.getElementById('editCalculationExpressionInput'),
    editCalculatedValueText: doc.getElementById('editCalculatedValueText'),
    editMessage: doc.getElementById('editMessage'),
    testEditSiteBtn: doc.getElementById('testEditSiteBtn'),
    saveEditSiteBtn: doc.getElementById('saveEditSiteBtn'),
    deleteSiteBtn: doc.getElementById('deleteSiteBtn'),
    backHomeBtn: doc.getElementById('backHomeBtn'),
    createBackHomeBtn: doc.getElementById('createBackHomeBtn'),
    addSiteConfigBtn: doc.getElementById('addSiteConfigBtn'),
    importFileBtn: doc.getElementById('importFileBtn'),
    importFileInput: doc.getElementById('importFileInput'),
    importMessage: doc.getElementById('importMessage'),
    exportSitesBtn: doc.getElementById('exportSitesBtn')
  };
}

function createInitialState() {
  return {
    step: 'base',
    pending: false,
    siteName: '',
    siteUrl: '',
    fieldPath: '',
    headers: {},
    authVisible: false,
    suggestedHeader: '',
    rawValue: null,
    calculationExpression: '',
    calculatedValue: null,
    errorMessage: '',
    completionMessage: '只有点击“完成”后，站点配置才会真正写入看板。',
    saved: false,
    closeRequested: false
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function sanitizeBaseInfo(input = {}) {
  return {
    name: typeof input.name === 'string' ? input.name.trim() : '',
    url: typeof input.url === 'string' ? input.url.trim() : '',
    fieldPath: typeof input.fieldPath === 'string' ? input.fieldPath.trim() : '',
    calculationExpression: normalizeCalculationExpression(input.calculationExpression)
  };
}

function sanitizeHeaderInputs(input = {}) {
  const collected = Object.fromEntries(
    SUPPORTED_AUTH_HEADERS
      .map((key) => [key, typeof input[key] === 'string' ? input[key].trim() : ''])
      .filter(([, value]) => value)
  );

  return normalizeHeaders(collected) || {};
}

function sanitizeRetryInput(input = {}) {
  return {
    baseInfo: {
      name: typeof input.name === 'string' ? input.name.trim() : '',
      url: typeof input.url === 'string' ? input.url.trim() : '',
      fieldPath: typeof input.fieldPath === 'string' ? input.fieldPath.trim() : '',
      calculationExpression: normalizeCalculationExpression(input.calculationExpression)
    },
    headers: sanitizeHeaderInputs(input)
  };
}

function sanitizeEditableSiteInput(input = {}) {
  const normalizedHeaders = normalizeHeaders(input.headers) || sanitizeHeaderInputs(input);
  return {
    id: typeof input.id === 'string' ? input.id.trim() : '',
    name: typeof input.name === 'string' ? input.name.trim() : '',
    url: typeof input.url === 'string' ? input.url.trim() : '',
    fieldPath: typeof input.fieldPath === 'string' ? input.fieldPath.trim() : '',
    headers: normalizedHeaders,
    calculationExpression: normalizeCalculationExpression(input.calculationExpression),
    isCustom: input.isCustom === true
  };
}

function validateBaseInfo(baseInfo) {
  if (!baseInfo.name) {
    throw createTaskError('请先填写站点名称。', { kind: 'validation' });
  }
  if (!baseInfo.url) {
    throw createTaskError('请先填写接口地址。', { kind: 'validation' });
  }
  if (!baseInfo.fieldPath) {
    throw createTaskError('请先填写监控字段。', { kind: 'validation' });
  }
}

function validateManagedSiteDraft(siteDraft) {
  if (!siteDraft.id) {
    throw createTaskError('请先选择需要修改的站点。', { kind: 'validation' });
  }
  validateBaseInfo(siteDraft);
}

function buildDraftTask(state) {
  return {
    id: `custom-${Date.now()}`,
    name: state.siteName,
    url: state.siteUrl,
    fieldPath: state.fieldPath,
    calculationExpression: state.calculationExpression,
    headers: normalizeHeaders(state.headers) || undefined
  };
}

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch (error) {
    throw createTaskError(error?.message || '响应内容不是合法 JSON', {
      kind: 'json-parse'
    });
  }
}

async function requestPreview(task, fetchImpl) {
  const fetchOptions = { credentials: 'include' };
  const normalizedHeaders = normalizeHeaders(task.headers);
  if (normalizedHeaders) {
    fetchOptions.headers = normalizedHeaders;
  }

  const response = await fetchImpl(task.url, fetchOptions);
  const json = await parseJsonSafely(response);

  if (!response.ok) {
    const sharedError = buildHttpError(task, response, json, {
      diagnosticTaskIds: new Set([task.id])
    });
    if (response.status === 401 || response.status === 403) {
      throw createTaskError(sharedError.message, {
        ...sharedError,
        kind: 'auth',
        status: response.status,
        taskId: task.id
      });
    }
    throw sharedError;
  }

  const rawValue = extractBalanceValue(json, task.fieldPath);
  const calculatedValue = applyCalculationExpression(rawValue, task.calculationExpression);
  return {
    rawValue,
    calculatedValue,
    headers: normalizedHeaders || {}
  };
}

function buildTaskFromEditableDraft(siteDraft) {
  const baseTask = {
    id: siteDraft.id,
    name: siteDraft.name,
    url: siteDraft.url,
    type: 'json',
    fieldPath: siteDraft.fieldPath,
    calculationExpression: siteDraft.calculationExpression,
    headers: siteDraft.headers,
    ...(siteDraft.isCustom ? { isCustom: true } : {})
  };

  return siteDraft.isCustom === true
    ? buildCustomTaskConfig(baseTask)
    : buildManagedTaskConfig(baseTask);
}

function createUniqueImportedSiteId(existingIds) {
  let id = `custom-${Date.now()}`;
  while (existingIds.has(id)) {
    id = `custom-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  }
  existingIds.add(id);
  return id;
}

async function loadStoredSiteConfigs(storage) {
  const stored = await storage.get(['siteConfigs']);
  return Array.isArray(stored.siteConfigs) ? stored.siteConfigs : [];
}

async function saveSiteConfig(state, storage) {
  const existingSiteConfigs = await loadStoredSiteConfigs(storage);
  const customTask = buildCustomTaskConfig({
    id: `custom-${Date.now()}`,
    name: state.siteName,
    url: state.siteUrl,
    fieldPath: state.fieldPath,
    calculationExpression: state.calculationExpression,
    headers: state.headers,
    isCustom: true
  });

  const serializedTask = serializeSiteConfigs([customTask])[0];

  await storage.set({
    siteConfigs: [...existingSiteConfigs, serializedTask]
  });

  return serializedTask;
}

function createAddSiteController(options = {}) {
  const storage = options.storage?.local
    ? options.storage.local
    : (options.storage || chrome.storage.local);
  const fetchImpl = options.fetchImpl || fetch;
  const state = createInitialState();

  function setError(error) {
    state.errorMessage = formatWizardErrorMessage(error);
  }

  function setBaseInfo(baseInfo) {
    state.siteName = baseInfo.name;
    state.siteUrl = baseInfo.url;
    state.fieldPath = baseInfo.fieldPath;
    state.calculationExpression = baseInfo.calculationExpression;
  }

  function setHeaders(headers) {
    state.headers = headers;
  }

  function getSuggestedHeader(error, status = 0) {
    return SUPPORTED_AUTH_HEADERS.includes(detectSuggestedAuthHeader(error, status))
      ? detectSuggestedAuthHeader(error, status)
      : 'authorization';
  }

  async function runAutoTest() {
    const draftTask = buildDraftTask(state);
    const preview = await requestPreview(draftTask, fetchImpl);
    state.step = 'calculation';
    state.authVisible = false;
    state.suggestedHeader = '';
    state.rawValue = preview.rawValue;
    state.calculatedValue = preview.calculatedValue;
    state.errorMessage = '抓取测试成功，确认后点击完成保存。';
    return {
      step: state.step,
      rawValue: state.rawValue,
      calculatedValue: state.calculatedValue
    };
  }

  return {
    async submitBaseInfoAndAutoTest(input) {
      const baseInfo = sanitizeBaseInfo(input);
      validateBaseInfo(baseInfo);
      setBaseInfo(baseInfo);
      state.saved = false;

      try {
        return await runAutoTest();
      } catch (error) {
        state.step = 'base';
        state.authVisible = error.kind === 'auth';
        state.suggestedHeader = state.authVisible ? getSuggestedHeader(error, error.status) : '';
        state.rawValue = null;
        state.calculatedValue = null;
        setError(error);
        return cloneState(state);
      }
    },

    async recalculateWithExpression(calculationExpression) {
      if (state.step !== 'calculation') {
        throw createTaskError('请先完成接口测试后再修改公式。', { kind: 'validation' });
      }
      state.calculationExpression = normalizeCalculationExpression(calculationExpression);
      return runAutoTest();
    },

    getErrorOrAuthChallengeState() {
      return cloneState(state);
    },

    async retryAfterAuthAndContinue(input = {}) {
      const retryInput = sanitizeRetryInput(input);
      const nextBaseInfo = {
        name: retryInput.baseInfo.name || state.siteName,
        url: retryInput.baseInfo.url || state.siteUrl,
        fieldPath: retryInput.baseInfo.fieldPath || state.fieldPath,
        calculationExpression: retryInput.baseInfo.calculationExpression || state.calculationExpression
      };
      validateBaseInfo(nextBaseInfo);
      setBaseInfo(nextBaseInfo);
      setHeaders(retryInput.headers);

      try {
        return await runAutoTest();
      } catch (error) {
        state.step = 'base';
        state.authVisible = error.kind === 'auth';
        state.suggestedHeader = state.authVisible ? getSuggestedHeader(error, error.status) : '';
        setError(error);
        return cloneState(state);
      }
    },

    async getLivePreviewAndFinish(input = {}) {
      if (state.step !== 'calculation') {
        throw createTaskError('当前还不能完成保存。', { kind: 'validation' });
      }

      if (!input.finish) {
        return {
          saved: false,
          rawValue: state.rawValue,
          calculatedValue: state.calculatedValue,
          step: state.step
        };
      }

      const serializedTask = await saveSiteConfig(state, storage);
      state.saved = true;
      state.errorMessage = '站点已保存，返回看板后即可看到新卡片。';
      state.completionMessage = '站点已保存，返回看板后即可看到新卡片。';
      return {
        saved: true,
        rawValue: state.rawValue,
        calculatedValue: state.calculatedValue,
        task: serializedTask,
        step: state.step
      };
    }
  };
}

function createSiteManagerController(options = {}) {
  const storage = options.storage?.local
    ? options.storage.local
    : (options.storage || chrome.storage.local);
  const fetchImpl = options.fetchImpl || fetch;
  let selectedSiteId = null;

  async function getStoredSiteConfigs() {
    return loadStoredSiteConfigs(storage);
  }

  async function getRuntimeSiteConfigs() {
    const storedSiteConfigs = await getStoredSiteConfigs();
    return mergeStoredSiteConfigs(storedSiteConfigs);
  }

  function buildPersistedSiteConfigs(runtimeConfigs) {
    return buildPersistedSiteConfigsFromRuntime(runtimeConfigs);
  }

  function snapshotSite(site) {
    return sanitizeEditableSiteInput(site);
  }

  return {
    async listSites() {
      const runtimeSites = await getRuntimeSiteConfigs();
      return runtimeSites.map((site) => snapshotSite(site));
    },

    async selectSite(siteId) {
      const runtimeSites = await getRuntimeSiteConfigs();
      const site = runtimeSites.find((entry) => entry.id === siteId);
      if (!site) {
        throw createTaskError('未找到要修改的站点。', { kind: 'validation' });
      }
      selectedSiteId = site.id;
      return snapshotSite(site);
    },

    async testSiteDraft(input = {}) {
      const siteDraft = sanitizeEditableSiteInput({
        ...input,
        id: input.id || selectedSiteId
      });
      validateManagedSiteDraft(siteDraft);
      const runtimeTask = buildTaskFromEditableDraft(siteDraft);
      const preview = await requestPreview(runtimeTask, fetchImpl);
      return {
        rawValue: preview.rawValue,
        calculatedValue: preview.calculatedValue
      };
    },

    async saveSiteEdits(input = {}) {
      const siteDraft = sanitizeEditableSiteInput({
        ...input,
        id: input.id || selectedSiteId
      });
      validateManagedSiteDraft(siteDraft);
      const storedSiteConfigs = await getStoredSiteConfigs();
      const runtimeSites = await getRuntimeSiteConfigs();
      const existingSite = runtimeSites.find((entry) => entry.id === siteDraft.id);
      if (!existingSite) {
        throw createTaskError('未找到要保存的站点。', { kind: 'validation' });
      }

      const nextRuntimeConfigs = buildUpdatedSiteConfigs(runtimeSites, siteDraft);
      const nextPersistedSiteConfigs = buildPersistedSiteConfigs(nextRuntimeConfigs, storedSiteConfigs);
      await storage.set({ siteConfigs: nextPersistedSiteConfigs });
      selectedSiteId = siteDraft.id;
      return snapshotSite(nextRuntimeConfigs.find((entry) => entry.id === siteDraft.id));
    },

    async addSiteDraft(input = {}) {
      const siteDraft = sanitizeEditableSiteInput(input);
      validateManagedSiteDraft(siteDraft);
      const storedSiteConfigs = await getStoredSiteConfigs();
      const runtimeSites = await getRuntimeSiteConfigs();
      const nextRuntimeConfigs = buildUpdatedSiteConfigs(runtimeSites, {
        ...siteDraft,
        isCustom: true
      });
      const nextPersistedSiteConfigs = buildPersistedSiteConfigs(nextRuntimeConfigs, storedSiteConfigs);
      await storage.set({ siteConfigs: nextPersistedSiteConfigs });
      selectedSiteId = siteDraft.id;
      return snapshotSite(nextRuntimeConfigs.find((entry) => entry.id === siteDraft.id));
    },

    async importSiteConfigs(rawConfigs) {
      if (!Array.isArray(rawConfigs)) {
        throw createTaskError('导入文件必须是站点配置数组。', { kind: 'validation' });
      }
      const storedSiteConfigs = await getStoredSiteConfigs();
      const existingIds = new Set(normalizeSiteConfigs(storedSiteConfigs).map((task) => task.id));
      const importedConfigs = rawConfigs.map((task) => ({
        ...task,
        id: typeof task?.id === 'string' && task.id.trim() ? task.id.trim() : createUniqueImportedSiteId(existingIds),
        isCustom: true
      }));
      const existingById = new Map(normalizeSiteConfigs(storedSiteConfigs).map((task) => [task.id, task]));
      normalizeSiteConfigs(importedConfigs).forEach((task) => existingById.set(task.id, task));
      const nextPersistedSiteConfigs = normalizeSiteConfigs([...existingById.values()]);
      await storage.set({ siteConfigs: nextPersistedSiteConfigs });
      return { importedCount: importedConfigs.length };
    },

    async deleteSite(siteId = selectedSiteId) {
      if (!siteId) {
        throw createTaskError('请先选择需要删除的站点。', { kind: 'validation' });
      }
      const storedSiteConfigs = await getStoredSiteConfigs();
      const nextPersistedSiteConfigs = deleteSiteConfigEntry(storedSiteConfigs, siteId);
      await storage.set({ siteConfigs: nextPersistedSiteConfigs });
      if (selectedSiteId === siteId) {
        selectedSiteId = null;
      }
      return nextPersistedSiteConfigs;
    }
  };
}

function normalizeDraftGroups(groups, validTaskIds) {
  if (!Array.isArray(groups)) {
    return [];
  }

  return groups
    .filter((group) => group && typeof group.id === 'string' && group.id.startsWith('group:') && Array.isArray(group.taskIds))
    .map((group) => ({
      id: group.id,
      taskIds: group.taskIds.filter((taskId) => validTaskIds.has(taskId)),
      ...(typeof group.name === 'string' && group.name.trim() ? { name: group.name.trim() } : {})
    }))
    .filter((group) => group.taskIds.length >= 2);
}

function sanitizeDraftBoardState(state) {
  const siteConfigs = normalizeSiteConfigs(state.siteConfigs);
  const validTaskIds = new Set(siteConfigs.map((task) => task.id));
  const originalGroups = Array.isArray(state.groups) ? state.groups : [];
  const groups = normalizeDraftGroups(originalGroups, validTaskIds);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const originalGroupById = new Map(
    originalGroups
      .filter((group) => group && typeof group.id === 'string' && Array.isArray(group.taskIds))
      .map((group) => [group.id, group])
  );
  const orderedTaskIds = new Set();
  const orderedGroupIds = new Set();
  const manualOrder = [];

  (Array.isArray(state.manualOrder) ? state.manualOrder : []).forEach((itemId) => {
    if (typeof itemId !== 'string') {
      return;
    }

    if (itemId.startsWith('task:')) {
      const taskId = itemId.slice('task:'.length);
      if (validTaskIds.has(taskId) && !orderedTaskIds.has(taskId)) {
        manualOrder.push(itemId);
        orderedTaskIds.add(taskId);
      }
      return;
    }

    if (!itemId.startsWith('group:')) {
      return;
    }

    const group = groupById.get(itemId);
    if (group && !orderedGroupIds.has(itemId)) {
      manualOrder.push(itemId);
      orderedGroupIds.add(itemId);
      group.taskIds.forEach((taskId) => orderedTaskIds.add(taskId));
      return;
    }

    const originalGroup = originalGroupById.get(itemId);
    if (originalGroup) {
      originalGroup.taskIds.forEach((taskId) => {
        if (validTaskIds.has(taskId) && !orderedTaskIds.has(taskId)) {
          manualOrder.push(`task:${taskId}`);
          orderedTaskIds.add(taskId);
        }
      });
    }
  });

  siteConfigs.forEach((task) => {
    if (!orderedTaskIds.has(task.id)) {
      manualOrder.push(`task:${task.id}`);
      orderedTaskIds.add(task.id);
    }
  });

  const boardData = Object.fromEntries(
    Object.entries(state.boardData && typeof state.boardData === 'object' ? state.boardData : {})
      .filter(([taskId]) => validTaskIds.has(taskId))
  );

  return { siteConfigs, boardData, groups, manualOrder };
}

function buildDraftCards(siteConfigs, groups, manualOrder, boardData = {}) {
  const siteById = new Map(siteConfigs.map((task) => [task.id, task]));
  const groupById = new Map(groups.map((group) => [group.id, group]));

  return manualOrder
    .map((itemId) => {
      if (itemId.startsWith('group:')) {
        const group = groupById.get(itemId);
        if (!group) {
          return null;
        }
        const tasks = group.taskIds.map((taskId) => siteById.get(taskId)).filter(Boolean);
        const fallbackName = tasks.map((task) => task.name).filter(Boolean).join(' + ');
        return {
          type: 'group',
          id: group.id,
          name: group.name || fallbackName || '编组',
          taskIds: [...group.taskIds],
          tasks
        };
      }

      if (itemId.startsWith('task:')) {
        const task = siteById.get(itemId.slice('task:'.length));
        return task ? {
          type: 'task',
          id: task.id,
          task,
          value: boardData?.[task.id]
        } : null;
      }

      return null;
    })
    .filter(Boolean);
}

function createBoardEditorController(options = {}) {
  const storage = options.storage?.local
    ? options.storage.local
    : (options.storage || chrome.storage.local);
  let draftSiteConfigs = [];
  let draftBoardData = {};
  let draftGroups = [];
  let draftManualOrder = [];

  function applySanitizedDraft(nextState) {
    const sanitized = sanitizeDraftBoardState(nextState);
    draftSiteConfigs = sanitized.siteConfigs;
    draftBoardData = sanitized.boardData;
    draftGroups = sanitized.groups;
    draftManualOrder = sanitized.manualOrder;
    return getDraftSnapshot();
  }

  function getDraftSnapshot() {
    return {
      siteConfigs: JSON.parse(JSON.stringify(draftSiteConfigs)),
      boardData: JSON.parse(JSON.stringify(draftBoardData)),
      groups: JSON.parse(JSON.stringify(draftGroups)),
      manualOrder: JSON.parse(JSON.stringify(draftManualOrder)),
      cards: JSON.parse(JSON.stringify(buildDraftCards(draftSiteConfigs, draftGroups, draftManualOrder, draftBoardData)))
    };
  }

  return {
    async loadDraft() {
      const stored = await storage.get(['siteConfigs', 'boardData', 'groups', 'manualOrder', '_demoInjected']);
      const storedSiteConfigs = Array.isArray(stored.siteConfigs) ? stored.siteConfigs : [];
      const shouldShowDemo = storedSiteConfigs.length === 0 && stored._demoInjected !== true;
      return applySanitizedDraft({
        siteConfigs: shouldShowDemo ? DEMO_SITE_CONFIGS : stored.siteConfigs,
        boardData: shouldShowDemo
          ? { 'demo-click-refresh': '点我', 'demo-drag-group': '拖我' }
          : stored.boardData,
        groups: stored.groups,
        manualOrder: shouldShowDemo
          ? ['task:demo-click-refresh', 'task:demo-drag-group']
          : stored.manualOrder
      });
    },

    getDraftSnapshot,

    resolveCardClick(itemId, event = {}) {
      if (event.target === 'group-frame' && draftGroups.some((group) => group.id === itemId)) {
        return { view: 'groupPopover', groupId: itemId };
      }
      if (draftSiteConfigs.some((task) => task.id === itemId)) {
        return { view: 'siteForm:edit', taskId: itemId };
      }
      throw createTaskError('未找到卡片。', { kind: 'validation' });
    },

    openCardMenu(itemId) {
      if (draftGroups.some((group) => group.id === itemId)) {
        return { id: itemId, type: 'group', actions: ['renameGroup', 'edit', 'delete'] };
      }
      if (draftSiteConfigs.some((task) => task.id === itemId)) {
        return { id: itemId, type: 'task', actions: ['edit', 'delete'] };
      }
      throw createTaskError('未找到卡片。', { kind: 'validation' });
    },

    renameDraftGroup(groupId, nextName) {
      const normalizedName = typeof nextName === 'string' ? nextName.trim() : '';
      if (!normalizedName) {
        return getDraftSnapshot();
      }
      draftGroups = draftGroups.map((group) => (
        group.id === groupId ? { ...group, name: normalizedName } : group
      ));
      return getDraftSnapshot();
    },

    deleteDraftSite(taskId) {
      draftSiteConfigs = draftSiteConfigs.filter((task) => task.id !== taskId);
      delete draftBoardData[taskId];
      return applySanitizedDraft({
        siteConfigs: draftSiteConfigs,
        boardData: draftBoardData,
        groups: draftGroups,
        manualOrder: draftManualOrder
      });
    },

    createDraftGroup(groupId, taskIds, name = '') {
      const validTaskIds = new Set(draftSiteConfigs.map((task) => task.id));
      const normalizedTaskIds = Array.isArray(taskIds)
        ? taskIds.filter((taskId, index) => validTaskIds.has(taskId) && taskIds.indexOf(taskId) === index)
        : [];
      if (typeof groupId !== 'string' || !groupId.startsWith('group:') || normalizedTaskIds.length < 2) {
        throw createTaskError('编组至少需要两张有效卡片。', { kind: 'validation' });
      }
      const nextGroup = {
        id: groupId,
        taskIds: normalizedTaskIds,
        ...(typeof name === 'string' && name.trim() ? { name: name.trim() } : {})
      };
      draftGroups = [...draftGroups.filter((group) => group.id !== groupId), nextGroup];
      draftManualOrder = [
        ...draftManualOrder.filter((itemId) => itemId !== groupId && !normalizedTaskIds.includes(itemId.slice('task:'.length))),
        groupId
      ];
      return applySanitizedDraft({
        siteConfigs: draftSiteConfigs,
        boardData: draftBoardData,
        groups: draftGroups,
        manualOrder: draftManualOrder
      });
    },

    reorderDraftItems(itemIds) {
      draftManualOrder = Array.isArray(itemIds) ? [...itemIds] : [];
      return applySanitizedDraft({
        siteConfigs: draftSiteConfigs,
        boardData: draftBoardData,
        groups: draftGroups,
        manualOrder: draftManualOrder
      });
    },

    async saveDraftToBoard() {
      const snapshot = applySanitizedDraft({
        siteConfigs: draftSiteConfigs,
        boardData: draftBoardData,
        groups: draftGroups,
        manualOrder: draftManualOrder
      });
      await storage.set({
        siteConfigs: snapshot.siteConfigs,
        boardData: snapshot.boardData,
        groups: snapshot.groups,
        manualOrder: snapshot.manualOrder
      });
      return snapshot;
    }
  };
}

async function detectAndApplyColorMode(storage = chrome.storage.local) {
  const stored = await storage.get(STORAGE_KEYS);
  const colorMode = stored.colorMode === 'light' ? 'light' : 'dark';
  document.documentElement?.setAttribute('data-theme', colorMode);
}

function createPageApp(options = {}) {
  const controller = options.controller || createAddSiteController(options);
  const siteManager = options.siteManager || createSiteManagerController(options);
  const boardEditor = options.boardEditor || createBoardEditorController(options);
  const pageDocument = options.document || document;
  const refs = createDomRefs(pageDocument);
  let activeMode = DEFAULT_MODE;
  let selectedSiteId = null;
  let selectedGroupId = null;
  let currentView = 'home';
  let lastRawValue = null;
  let lastTestedExpression = '';
  let lastCalculatedValue = null;

  function hideGroupPopover() {
    if (refs.groupPopover) refs.groupPopover.hidden = true;
  }

  function showView(nextView) {
    currentView = nextView;
    if (refs.homePanel) refs.homePanel.hidden = nextView !== 'home';
    if (refs.siteConfigPanel) refs.siteConfigPanel.hidden = !nextView.startsWith('siteForm') && !nextView.startsWith('calculation');
    if (refs.groupEditPanel) refs.groupEditPanel.hidden = nextView !== 'groupEdit';
    if (nextView !== 'home') {
      hideGroupPopover();
    }
  }

  function setMode(nextMode) {
    activeMode = nextMode === 'edit' ? 'edit' : 'create';
    refs.modeCreateBtn?.classList.toggle('is-selected', activeMode === 'create');
    refs.modeEditBtn?.classList.toggle('is-selected', activeMode === 'edit');
    if (refs.createPanel) {
      refs.createPanel.hidden = activeMode !== 'create';
    }
    if (refs.editPanel) {
      refs.editPanel.hidden = activeMode !== 'edit';
    }
  }

  function toggleStep(step) {
    refs.stepBasePill?.classList.toggle('is-active', step === 'base');
    refs.stepAuthPill?.classList.toggle('is-active', step === 'base' && Boolean(refs.authSupplementSection && !refs.authSupplementSection.hidden));
    refs.stepCalcPill?.classList.toggle('is-active', step === 'calculation');
  }

  function updateAuthInputs(state) {
    if (refs.authSupplementSection) {
      refs.authSupplementSection.hidden = !state.authVisible;
    }
    if (refs.authHintText) {
      refs.authHintText.textContent = state.authVisible
        ? `检测到可能缺少 ${state.suggestedHeader || 'authorization'}，补齐后再次点击“下一步”。`
        : '抓取失败后，如果提示缺少鉴权，可在这里补齐请求头后再次测试。';
    }
  }

  function updateCalculationArea(state) {
    const inCalculationStep = state.step === 'calculation';
    if (refs.calculationSection) {
      refs.calculationSection.hidden = !inCalculationStep;
    }
    if (refs.nextStepBtn) {
      refs.nextStepBtn.hidden = inCalculationStep;
    }
    if (refs.finishAddSiteBtn) {
      refs.finishAddSiteBtn.hidden = !inCalculationStep;
    }
    if (refs.rawValueText) {
      refs.rawValueText.textContent = state.rawValue || '--';
    }
    if (refs.calculationExpressionInput && refs.calculationExpressionInput.value !== state.calculationExpression) {
      refs.calculationExpressionInput.value = state.calculationExpression || '';
    }
    if (refs.calculatedValueText) {
      refs.calculatedValueText.textContent = state.calculatedValue || state.rawValue || '--';
    }
  }

  function updateMessages(state) {
    if (refs.siteErrorMessage) {
      refs.siteErrorMessage.textContent = state.errorMessage;
      refs.siteErrorMessage.classList.toggle('is-error', /失败|错误|缺少|请先/.test(state.errorMessage));
      refs.siteErrorMessage.classList.toggle('is-success', /成功|已选择|已保存/.test(state.errorMessage));
    }
    if (refs.completionHint) {
      refs.completionHint.textContent = state.completionMessage;
    }
  }

  function updateFormState(state) {
    toggleStep(state.step);
    updateAuthInputs(state);
    updateCalculationArea(state);
    updateMessages(state);
  }

  function setEditMessage(message, kind = '') {
    if (!refs.editMessage) {
      return;
    }
    refs.editMessage.textContent = message;
    refs.editMessage.classList.toggle('is-error', kind === 'error');
    refs.editMessage.classList.toggle('is-success', kind === 'success');
  }

  function setMessage(message, kind = '') {
    if (refs.siteErrorMessage) {
      refs.siteErrorMessage.hidden = false;
      refs.siteErrorMessage.textContent = message;
      refs.siteErrorMessage.classList.toggle('is-error', kind === 'error');
      refs.siteErrorMessage.classList.toggle('is-success', kind === 'success');
    }
    setEditMessage(message, kind);
  }

  function setImportMessage(message, kind = '') {
    if (!refs.importMessage) {
      return;
    }
    refs.importMessage.hidden = false;
    refs.importMessage.textContent = message;
    refs.importMessage.classList.toggle('is-error', kind === 'error');
    refs.importMessage.classList.toggle('is-success', kind === 'success');
  }

  function readAuthHeaderInputs() {
    const key = refs.authHeaderSelect?.value;
    const value = typeof refs.authHeaderValueInput?.value === 'string' ? refs.authHeaderValueInput.value.trim() : '';
    return key && value ? { [key]: value } : {};
  }

  function fillAuthHeaderInputs(headers = {}) {
    const normalized = normalizeHeaders(headers) || {};
    const selectedKey = SUPPORTED_AUTH_HEADERS.find((key) => normalized[key]) || 'authorization';
    if (refs.authHeaderSelect) refs.authHeaderSelect.value = selectedKey;
    if (refs.authHeaderValueInput) refs.authHeaderValueInput.value = normalized[selectedKey] || '';
  }

  function readUnifiedDraftFromInputs() {
    return {
      id: selectedSiteId,
      name: refs.siteNameInput?.value,
      url: refs.siteUrlInput?.value,
      fieldPath: refs.siteFieldPathInput?.value,
      calculationExpression: refs.calculationExpressionInput?.value,
      headers: readAuthHeaderInputs(),
      isCustom: refs.selectedSiteBadge?.dataset?.isCustom === 'true'
    };
  }

  function updateUnifiedPreview(result) {
    if (refs.rawValueText) refs.rawValueText.textContent = result.rawValue || '--';
    if (refs.calculatedValueText) refs.calculatedValueText.textContent = result.calculatedValue || '--';
  }

  function resetUnifiedPreview() {
    updateUnifiedPreview({ rawValue: '--', calculatedValue: '--' });
  }

  function readEditDraftFromInputs() {
    return {
      id: selectedSiteId,
      name: refs.editSiteNameInput?.value,
      url: refs.editSiteUrlInput?.value,
      fieldPath: refs.editSiteFieldPathInput?.value,
      calculationExpression: refs.editCalculationExpressionInput?.value,
      authorization: refs.editAuthorizationInput?.value,
      token: refs.editTokenInput?.value,
      'new-api-user': refs.editNewApiUserInput?.value,
      isCustom: refs.selectedSiteBadge?.dataset?.isCustom === 'true'
    };
  }

  function updateEditPreview(result) {
    if (refs.editRawValueText) {
      refs.editRawValueText.textContent = result.rawValue || '--';
    }
    if (refs.editCalculatedValueText) {
      refs.editCalculatedValueText.textContent = result.calculatedValue || result.rawValue || '--';
    }
  }

  function resetEditPreview() {
    updateEditPreview({ rawValue: '--' });
  }

  function resetCalculationState() {
    lastRawValue = null;
    lastTestedExpression = '';
    lastCalculatedValue = null;
    if (refs.calculatedValueText) refs.calculatedValueText.textContent = '--';
  }

  function setAdvancedSettingsExpanded(expanded) {
    if (refs.advancedSettingsPanel) refs.advancedSettingsPanel.hidden = !expanded;
    refs.advancedSettingsToggle?.setAttribute('aria-expanded', String(expanded));
    if (refs.advancedSettingsToggle) {
      refs.advancedSettingsToggle.textContent = expanded ? '− 收起高级设置' : '+ 点击展开高级设置';
    }
  }

  function fillEditForm(site) {
    selectedSiteId = site.id;
    if (refs.selectedSiteBadge) {
      refs.selectedSiteBadge.textContent = site.id ? `当前编辑：${site.name || '未命名站点'}` : '正在新增站点';
      refs.selectedSiteBadge.dataset.isCustom = site.isCustom ? 'true' : 'false';
    }
    if (refs.siteNameInput) refs.siteNameInput.value = site.name || '';
    if (refs.siteUrlInput) refs.siteUrlInput.value = site.url || '';
    if (refs.siteFieldPathInput) refs.siteFieldPathInput.value = site.fieldPath || '';
    if (refs.editSiteNameInput) refs.editSiteNameInput.value = site.name || '';
    if (refs.editSiteUrlInput) refs.editSiteUrlInput.value = site.url || '';
    if (refs.editSiteFieldPathInput) refs.editSiteFieldPathInput.value = site.fieldPath || '';
    if (refs.calculationExpressionInput) refs.calculationExpressionInput.value = site.calculationExpression || '';
    fillAuthHeaderInputs(site.headers);
    if (refs.deleteSiteBtn) refs.deleteSiteBtn.hidden = !site.id || isDemoTask(site);
    resetUnifiedPreview();
    resetCalculationState();
    setAdvancedSettingsExpanded(false);
  }

  function buildDemoEditSite(card) {
    const demoTask = card?.task || card || {};
    return {
      id: demoTask.id,
      name: demoTask.name || '',
      url: demoTask.url || '',
      fieldPath: demoTask.fieldPath || '',
      calculationExpression: demoTask.calculationExpression || '',
      headers: normalizeHeaders(demoTask.headers) || {},
      isCustom: demoTask.isCustom === true,
      isDemo: true
    };
  }

  async function openSiteEdit(card) {
    selectedSiteId = card?.id || null;
    setMode('edit');
    showView('siteForm:edit');
    const selected = isDemoTask(card.task)
      ? buildDemoEditSite(card)
      : await siteManager.selectSite(card.id);
    fillEditForm(selected);
    if (card?.value !== undefined && card.value !== null && card.value !== '') {
      lastRawValue = card.value;
      updateUnifiedPreview({ rawValue: card.value, calculatedValue: '--' });
    }
  }

  function openCreateSiteForm() {
    selectedSiteId = null;
    selectedGroupId = null;
    fillEditForm({
      id: '',
      name: '',
      url: '',
      fieldPath: '',
      calculationExpression: '',
      headers: {},
      isCustom: true
    });
    if (refs.siteErrorMessage) {
      refs.siteErrorMessage.hidden = true;
    }
    setMode('create');
    showView('siteForm:new');
  }

  async function openGroupPopover(group) {
    const groupId = typeof group === 'string' ? group : group.id;
    const knownGroupCard = typeof group === 'string' ? null : group;
    selectedSiteId = null;
    selectedGroupId = groupId;
    showView('home');

    const snapshot = await boardEditor.loadDraft();
    const groupCard = knownGroupCard || snapshot.cards.find((card) => card.type === 'group' && card.id === groupId);
    if (!groupCard) {
      throw createTaskError('未找到编组。', { kind: 'validation' });
    }

    if (refs.groupPopoverNameInput) {
      refs.groupPopoverNameInput.value = groupCard.name || '';
    }
    if (refs.groupPopoverTaskList) {
      const taskButtons = groupCard.tasks.map((task) => {
        const button = pageDocument.createElement('button');
        button.type = 'button';
        button.className = 'site-list-item group-popover-site';
        button.textContent = task.name || '未命名站点';
        button.addEventListener('click', async () => {
          const card = {
            type: 'task',
            id: task.id,
            task,
            value: snapshot.boardData?.[task.id]
          };
          hideGroupPopover();
          await openSiteEdit(card);
        });
        return button;
      });
      refs.groupPopoverTaskList.replaceChildren(...taskButtons);
    }
    if (refs.groupPopover) {
      refs.groupPopover.hidden = false;
    }
  }

  async function openGroupEdit(group) {
    const groupId = typeof group === 'string' ? group : group.id;
    const knownGroupCard = typeof group === 'string' ? null : group;
    selectedSiteId = null;
    selectedGroupId = groupId;
    if (refs.groupNameInput && knownGroupCard) {
      refs.groupNameInput.value = knownGroupCard.name || '';
    }
    showView('groupEdit');

    const snapshot = await boardEditor.loadDraft();
    const groupCard = knownGroupCard || snapshot.cards.find((card) => card.type === 'group' && card.id === groupId);
    if (!groupCard) {
      throw createTaskError('未找到编组。', { kind: 'validation' });
    }

    if (refs.groupNameInput && !knownGroupCard) {
      refs.groupNameInput.value = groupCard.name || '';
    }
    if (refs.groupTaskNameList) {
      const taskNameInputs = groupCard.tasks.map((task) => {
        const input = pageDocument.createElement('input');
        input.type = 'text';
        input.value = task.name || '';
        input.dataset.taskId = task.id;
        return input;
      });
      refs.groupTaskNameList.replaceChildren(...taskNameInputs);
    }
  }

  async function renderConfigBoard() {
    if (!refs.configBoard) {
      return null;
    }
    const snapshot = await boardEditor.loadDraft();
    const boardChildren = [];
    if (refs.configBoardEmpty) {
      refs.configBoardEmpty.hidden = snapshot.cards.length > 0;
      if (snapshot.cards.length === 0) {
        boardChildren.push(refs.configBoardEmpty);
      }
    }
    snapshot.cards.forEach((card) => {
      const cardElement = pageDocument.createElement('button');
      cardElement.type = 'button';
      cardElement.className = card.type === 'group' ? 'config-board-card is-group' : 'config-board-card';
      cardElement.textContent = card.type === 'group' ? card.name : card.task.name;
      cardElement.addEventListener('click', async () => {
        if (card.type === 'group') {
          await openGroupPopover(card);
          return;
        }
        await openSiteEdit(card);
      });
      boardChildren.push(cardElement);
    });
    refs.configBoard.replaceChildren(...boardChildren);
    return snapshot;
  }

  async function renderManagedSiteList() {
    if (!refs.managedSiteList) {
      return;
    }
    const sites = await siteManager.listSites();
    refs.managedSiteList.innerHTML = '';
    if (refs.siteListEmpty) {
      refs.siteListEmpty.hidden = sites.length > 0;
    }
    sites.forEach((site) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `site-list-item${site.id === selectedSiteId ? ' is-selected' : ''}`;

      const name = document.createElement('span');
      name.className = 'site-list-item-name';
      name.textContent = site.name;

      const meta = document.createElement('span');
      meta.className = 'site-list-item-meta';
      meta.textContent = site.fieldPath || '--';

      button.appendChild(name);
      button.appendChild(meta);
      button.addEventListener('click', async () => {
        const selected = await siteManager.selectSite(site.id);
        fillEditForm(selected);
        await renderManagedSiteList();
      });
      refs.managedSiteList.appendChild(button);
    });
  }

  async function fetchUnifiedRawValue() {
    const draft = readUnifiedDraftFromInputs();
    const result = await siteManager.testSiteDraft({
      ...draft,
      id: draft.id || `preview-${Date.now()}`,
      calculationExpression: ''
    });
    updateUnifiedPreview({ rawValue: result.rawValue, calculatedValue: '--' });
    lastRawValue = result.rawValue;
    lastTestedExpression = '';
    lastCalculatedValue = null;
    setMessage('原值获取成功。', 'success');
    return result;
  }

  async function testUnifiedCalculation() {
    const expression = normalizeCalculationExpression(refs.calculationExpressionInput?.value);
    if (!lastRawValue) {
      throw createTaskError('请先访问接口获取原值。', { kind: 'validation' });
    }
    if (!expression) {
      throw createTaskError('请先输入公式。', { kind: 'validation' });
    }
    const calculatedValue = applyCalculationExpression(lastRawValue, expression);
    lastTestedExpression = expression;
    lastCalculatedValue = calculatedValue;
    updateUnifiedPreview({ rawValue: lastRawValue, calculatedValue });
    if (refs.calculationExpressionInput) refs.calculationExpressionInput.value = expression;
    setMessage('测试计算成功。', 'success');
    return { rawValue: lastRawValue, calculatedValue };
  }

  async function finishUnifiedSiteConfig(input = {}) {
    const currentSite = selectedSiteId ? await siteManager.selectSite(selectedSiteId) : {};
    const draft = Object.fromEntries(
      Object.entries({
        ...readUnifiedDraftFromInputs(),
        ...input
      }).filter(([, value]) => value !== undefined)
    );

    const expression = normalizeCalculationExpression(draft.calculationExpression);
    if (expression && (expression !== lastTestedExpression || !lastCalculatedValue)) {
      throw createTaskError('请先测试计算当前公式。', { kind: 'validation' });
    }
    draft.calculationExpression = expression;

    const saved = selectedSiteId
      ? await siteManager.saveSiteEdits({
        ...currentSite,
        ...draft,
        id: selectedSiteId
      })
      : await siteManager.addSiteDraft({
        ...draft,
        id: `custom-${Date.now()}`,
        isCustom: true
      });

    fillEditForm(saved);
    await refreshHomeBoard();
    setMessage('站点配置已保存。', 'success');
    return saved;
  }

  async function refreshCreatePreviewForFormula() {
    const result = await controller.recalculateWithExpression(refs.calculationExpressionInput?.value);
    updateFormState(result);
    return result;
  }

  async function refreshEditPreviewForFormula() {
    const result = await siteManager.testSiteDraft(readEditDraftFromInputs());
    updateEditPreview(result);
    setEditMessage('公式已更新，并已重新抓取接口原值完成预览。', 'success');
    return result;
  }

  async function submitNextStep() {
    const authVisible = refs.authSupplementSection && !refs.authSupplementSection.hidden;
    const result = authVisible
      ? await controller.retryAfterAuthAndContinue({
        name: refs.siteNameInput?.value,
        url: refs.siteUrlInput?.value,
        fieldPath: refs.siteFieldPathInput?.value,
        calculationExpression: refs.calculationExpressionInput?.value,
        authorization: refs.authorizationInput?.value,
        token: refs.tokenInput?.value,
        'new-api-user': refs.newApiUserInput?.value
      })
      : await controller.submitBaseInfoAndAutoTest({
        name: refs.siteNameInput?.value,
        url: refs.siteUrlInput?.value,
        fieldPath: refs.siteFieldPathInput?.value,
        calculationExpression: refs.calculationExpressionInput?.value
      });

    updateFormState(result);
  }

  async function refreshHomeBoard() {
    await renderManagedSiteList();
    await renderConfigBoard();
    showView('home');
  }

  async function finishAddSite() {
    const result = await controller.getLivePreviewAndFinish({ finish: true });
    updateFormState({
      ...controller.getErrorOrAuthChallengeState(),
      errorMessage: '站点已保存，返回看板后即可看到新卡片。',
      completionMessage: '站点已保存，返回看板后即可看到新卡片。'
    });

    await refreshHomeBoard();

    return result;
  }

  async function testEditSite() {
    const result = await siteManager.testSiteDraft(readEditDraftFromInputs());
    updateEditPreview(result);
    setEditMessage('测试成功，确认无误后可以直接保存修改。', 'success');
  }

  async function saveGroupNameFromPopover() {
    if (!selectedGroupId) {
      throw createTaskError('请先选择需要修改的编组。', { kind: 'validation' });
    }
    const groupId = selectedGroupId;
    await boardEditor.loadDraft();
    const groupName = refs.groupPopoverNameInput?.value || '';
    const renamedSnapshot = boardEditor.renameDraftGroup(groupId, groupName);
    if (groupName.trim() && !renamedSnapshot.groups.some((group) => group.id === groupId && group.name === groupName.trim())) {
      throw createTaskError('编组名称保存失败。', { kind: 'validation' });
    }
    await boardEditor.saveDraftToBoard();
    await renderConfigBoard();
    selectedGroupId = groupId;
    const snapshot = await boardEditor.loadDraft();
    const groupCard = snapshot.cards.find((card) => card.type === 'group' && card.id === groupId);
    if (refs.groupPopoverNameInput && groupCard) {
      refs.groupPopoverNameInput.value = groupCard.name || '';
    }
    if (refs.groupPopover) refs.groupPopover.hidden = false;
  }

  async function finishGroupEdit() {
    if (!selectedGroupId) {
      throw createTaskError('请先选择需要修改的编组。', { kind: 'validation' });
    }

    await boardEditor.loadDraft();
    const taskNameInputs = refs.groupTaskNameList?.querySelectorAll?.('input') || [];
    for (const input of taskNameInputs) {
      const taskId = input.dataset?.taskId;
      const nextName = typeof input.value === 'string' ? input.value.trim() : '';
      if (!taskId || !nextName) {
        continue;
      }
      const site = await siteManager.selectSite(taskId);
      await siteManager.saveSiteEdits({
        ...site,
        name: nextName,
        id: taskId
      });
    }

    const groupId = selectedGroupId;
    await boardEditor.loadDraft();
    const groupName = refs.groupNameInput?.value || '';
    const renamedSnapshot = boardEditor.renameDraftGroup(groupId, groupName);
    if (groupName.trim() && !renamedSnapshot.groups.some((group) => group.id === groupId && group.name === groupName.trim())) {
      throw createTaskError('编组名称保存失败。', { kind: 'validation' });
    }
    await boardEditor.saveDraftToBoard();
    selectedGroupId = null;
    await refreshHomeBoard();
  }

  async function saveEditSite(input = {}) {
    const currentSite = selectedSiteId ? await siteManager.selectSite(selectedSiteId) : {};
    const inputDraft = Object.fromEntries(
      Object.entries({
        ...readEditDraftFromInputs(),
        ...input
      }).filter(([, value]) => value !== undefined)
    );
    const saved = await siteManager.saveSiteEdits({
      ...currentSite,
      ...inputDraft,
      id: selectedSiteId || inputDraft.id
    });
    fillEditForm(saved);
    await refreshHomeBoard();
    setEditMessage('站点修改已保存，popup 会通过 storage 变更立即吸收新配置。', 'success');
    return saved;
  }

  async function deleteCurrentSite() {
    if (!selectedSiteId) {
      throw createTaskError('请先选择需要删除的站点。', { kind: 'validation' });
    }
    await boardEditor.loadDraft();
    boardEditor.deleteDraftSite(selectedSiteId);
    await boardEditor.saveDraftToBoard();
    selectedSiteId = null;
    if (refs.selectedSiteBadge) {
      refs.selectedSiteBadge.textContent = '当前未选中站点';
      refs.selectedSiteBadge.dataset.isCustom = 'false';
    }
    ['editSiteNameInput', 'editSiteUrlInput', 'editSiteFieldPathInput', 'editAuthorizationInput', 'editTokenInput', 'editNewApiUserInput'].forEach((key) => {
      if (refs[key]) {
        refs[key].value = '';
      }
    });
    updateEditPreview({ rawValue: '--' });
    await refreshHomeBoard();
    setEditMessage('站点已删除。', 'success');
  }

  function returnHomeWithoutSaving() {
    selectedSiteId = null;
    selectedGroupId = null;
    setEditMessage('修改已取消。');
    if (refs.siteErrorMessage) {
      refs.siteErrorMessage.hidden = true;
    }
    showView('home');
    return renderConfigBoard();
  }

  function buildImportedBoardPayload(parsed) {
    if (Array.isArray(parsed)) {
      return { siteConfigs: parsed };
    }

    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.siteConfigs)) {
      return { siteConfigs: parsed.siteConfigs };
    }

    throw createTaskError('导入文件必须是站点配置数组或完整看板配置。', { kind: 'validation' });
  }

  function buildExportBoardPayload(snapshot) {
    const exportedSites = snapshot.siteConfigs.filter((task) => !isDemoTask(task));

    return {
      siteConfigs: serializePublicSiteConfigs(exportedSites)
    };
  }

  async function importSiteConfigsFromText(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      setImportMessage('导入文件不是合法 JSON。', 'error');
      showView('home');
      throw createTaskError('导入文件不是合法 JSON。', { kind: 'validation' });
    }

    try {
      const payload = buildImportedBoardPayload(parsed);
      const result = await siteManager.importSiteConfigs(payload.siteConfigs);
      const stored = await boardEditor.loadDraft();
      const nextSnapshot = sanitizeDraftBoardState(stored);
      await (options.storage?.local ? options.storage.local : (options.storage || chrome.storage.local)).set({
        siteConfigs: nextSnapshot.siteConfigs,
        boardData: nextSnapshot.boardData,
        groups: nextSnapshot.groups,
        manualOrder: nextSnapshot.manualOrder
      });
      await renderManagedSiteList();
      await renderConfigBoard();
      showView('home');
      setImportMessage(`已导入 ${result.importedCount} 个站点配置。`, 'success');
      return result;
    } catch (error) {
      setImportMessage(formatWizardErrorMessage(error), 'error');
      showView('home');
      throw error;
    }
  }

  function handleFileImport() {
    refs.importFileInput?.click();
  }

  function handleFileSelected(event) {
    const file = event?.target?.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      importSiteConfigsFromText(String(reader.result || '')).catch((error) => {
        setImportMessage(formatWizardErrorMessage(error), 'error');
      });
    };
    reader.onerror = () => {
      setImportMessage('读取导入文件失败。', 'error');
    };
    reader.readAsText(file);
    if (event.target) {
      event.target.value = '';
    }
  }

  async function exportSiteConfigs() {
    const snapshot = await boardEditor.loadDraft();
    const payload = buildExportBoardPayload(snapshot);
    if (payload.siteConfigs.length === 0) {
      setImportMessage('当前没有可导出的站点。', 'error');
      return null;
    }
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
    const urlApi = options.window?.URL || window.URL;
    const objectUrl = urlApi.createObjectURL(blob);
    const anchor = (options.document || document).createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    anchor.href = objectUrl;
    anchor.download = `site-configs-${date}.json`;
    (options.document || document).body?.appendChild(anchor);
    anchor.click();
    anchor.remove();
    urlApi.revokeObjectURL?.(objectUrl);
    setImportMessage(`已导出 ${payload.siteConfigs.length} 个站点配置。`, 'success');
    return payload;
  }

  return {
    async bind() {
      refs.modeCreateBtn?.addEventListener('click', () => setMode('create'));
      refs.modeEditBtn?.addEventListener('click', async () => {
        setMode('edit');
        await renderManagedSiteList();
      });
      refs.addSiteConfigBtn?.addEventListener('click', openCreateSiteForm);
      refs.fetchRawValueBtn?.addEventListener('click', () => {
        fetchUnifiedRawValue().catch((error) => setMessage(formatWizardErrorMessage(error), 'error'));
      });
      refs.testCalculationBtn?.addEventListener('click', () => {
        testUnifiedCalculation().catch((error) => setMessage(formatWizardErrorMessage(error), 'error'));
      });
      refs.finishSiteConfigBtn?.addEventListener('click', () => {
        finishUnifiedSiteConfig().catch((error) => setMessage(formatWizardErrorMessage(error), 'error'));
      });
      refs.advancedSettingsToggle?.addEventListener('click', () => {
        const nextExpanded = refs.advancedSettingsPanel?.hidden !== false;
        setAdvancedSettingsExpanded(nextExpanded);
      });
      refs.nextStepBtn?.addEventListener('click', () => {
        submitNextStep().catch((error) => {
          updateFormState({
            ...controller.getErrorOrAuthChallengeState(),
            errorMessage: formatWizardErrorMessage(error)
          });
        });
      });
      refs.finishAddSiteBtn?.addEventListener('click', () => {
        finishAddSite().catch((error) => {
          updateFormState({
            ...controller.getErrorOrAuthChallengeState(),
            errorMessage: formatWizardErrorMessage(error)
          });
        });
      });
      refs.calculationExpressionInput?.addEventListener('input', () => {
        lastTestedExpression = '';
        lastCalculatedValue = null;
        if (refs.calculatedValueText) refs.calculatedValueText.textContent = '--';
      });
      refs.createBackHomeBtn?.addEventListener('click', () => (
        returnHomeWithoutSaving().catch((error) => {
          setMessage(formatWizardErrorMessage(error), 'error');
        })
      ));
      refs.testEditSiteBtn?.addEventListener('click', () => {
        testEditSite().catch((error) => {
          setEditMessage(formatWizardErrorMessage(error), 'error');
        });
      });
      refs.editCalculationExpressionInput?.addEventListener('change', () => {
        refreshEditPreviewForFormula().catch((error) => {
          setEditMessage(formatWizardErrorMessage(error), 'error');
        });
      });
      refs.saveEditSiteBtn?.addEventListener('click', () => {
        saveEditSite().catch((error) => {
          setEditMessage(formatWizardErrorMessage(error), 'error');
        });
      });
      refs.deleteSiteBtn?.addEventListener('click', () => (
        deleteCurrentSite().catch((error) => {
          setMessage(formatWizardErrorMessage(error), 'error');
        })
      ));
      refs.backHomeBtn?.addEventListener('click', () => (
        returnHomeWithoutSaving().catch((error) => {
          setMessage(formatWizardErrorMessage(error), 'error');
        })
      ));
      refs.finishGroupEditBtn?.addEventListener('click', () => (
        finishGroupEdit().catch((error) => {
          setEditMessage(formatWizardErrorMessage(error), 'error');
        })
      ));
      refs.saveGroupNameBtn?.addEventListener('click', () => (
        saveGroupNameFromPopover().catch((error) => {
          setImportMessage(formatWizardErrorMessage(error), 'error');
        })
      ));
      refs.importFileBtn?.addEventListener('click', handleFileImport);
      refs.importFileInput?.addEventListener('change', handleFileSelected);
      refs.exportSitesBtn?.addEventListener('click', () => {
        exportSiteConfigs().catch((error) => {
          setEditMessage(formatWizardErrorMessage(error), 'error');
        });
      });
      updateFormState(controller.getErrorOrAuthChallengeState());
      setMode(DEFAULT_MODE);
      showView('home');
      await renderManagedSiteList();
      await renderConfigBoard();
    },

    getCurrentView() {
      return currentView;
    },

    finishSiteEdit: saveEditSite,
    importSiteConfigsFromText,
    exportSiteConfigs
  };
}

this.__testExports = {
  createAddSiteTestController: createAddSiteController,
  createSiteManagerTestController: createSiteManagerController,
  createSiteManagerController,
  createBoardEditorController,
  createPageApp,
  buildPersistedSiteConfigsFromRuntime,
  buildCustomTaskConfig
};

if (typeof document !== 'undefined' && document.getElementById('siteNameInput')) {
  detectAndApplyColorMode().catch(() => {});
  const app = createPageApp({ window, document });
  app.bind();
}
