// ================= 配置区 =================
const SiteConfigShared = globalThis.SiteConfigShared;
if (!SiteConfigShared) {
  throw new Error('SiteConfigShared 未加载');
}

const {
  DEMO_SITE_CONFIGS,
  isDemoTask,
  toFiniteNumber,
  getNestedValue,
  extractBalanceValue,
  buildCustomTaskConfig,
  normalizeSiteConfigs: normalizeSharedSiteConfigs,
  serializeSiteConfigs: serializeSharedSiteConfigs,
  mergeStoredSiteConfigs: mergeSharedSiteConfigs,
  buildPersistedSiteConfigsFromRuntime: buildPersistedSharedSiteConfigsFromRuntime,
  buildHttpError: buildSharedHttpError
} = SiteConfigShared;

async function injectDemoCardsIfFirstRun() {
  const stored = await chrome.storage.local.get(['siteConfigs', '_demoInjected']);
  if (stored._demoInjected) return;
  const existing = Array.isArray(stored.siteConfigs) ? stored.siteConfigs : [];
  if (existing.length > 0) {
    await chrome.storage.local.set({ _demoInjected: true });
    return;
  }
  await chrome.storage.local.set({
    siteConfigs: DEMO_SITE_CONFIGS.map((c) => ({ ...c })),
    boardData: { 'demo-click-refresh': '点我', 'demo-drag-group': '拖我' },
    _demoInjected: true
  });
}

function formatTaskErrorValue(error, fallbackValue) {
  if (!error || typeof error !== 'object') {
    return fallbackValue;
  }

  if (error.kind === 'auth') {
    if (error.code === 'TOKEN_EXPIRED') {
      return 'Token过期';
    }
    return `认证失效${error.status ? `(${error.status})` : ''}`;
  }

  if (error.kind === 'missing-field') {
    return '字段变更';
  }

  if (error.kind === 'calculation') {
    return '公式错误';
  }

  if (error.kind === 'app-error') {
    if (error.code === 'TOKEN_EXPIRED') {
      return 'Token过期';
    }
    return error.code ? `接口异常(${error.code})` : '接口异常';
  }

  return fallbackValue;
}

let CONFIG = [];

const boardEl = document.getElementById('board');
const refreshBtn = document.getElementById('refreshBtn');
const addSiteBtn = document.getElementById('addSiteBtn');
const menuToggleBtn = document.getElementById('menuToggleBtn');
const heroMenuEl = document.getElementById('heroMenu');
const autoSortToggleEl = document.getElementById('autoSortToggle');
const layoutColumnsSelectEl = document.getElementById('layoutColumnsSelect');
const colorModeToggleEl = document.getElementById('colorModeToggle');
const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});
const cardRefs = new Map();
const taskToViewItemIdMap = new Map();
const inFlightTaskIds = new Set();
const viewItemTaskStateMap = new Map();
const POPUP_STATE_KEYS = ['boardData', 'lastUpdateTime', 'autoSortEnabled', 'layoutColumns', 'manualOrder', 'groups', 'siteConfigs', 'colorMode'];
const LONG_PRESS_DELAY = 320;
const GROUP_OVERLAP_THRESHOLD = 0.32;
const REORDER_EDGE_RATIO = 0.35;
let boardDataCache = {};
let lastSuccessfulSyncTime = '';
let isBatchRefreshing = false;
let currentViewItems = [];
let autoSortEnabled = false;
let colorMode = 'dark';
let layoutColumns = 2;
let groupsCache = [];
let manualOrderCache = [];
let siteConfigsCache = [];
let persistedSiteConfigsCache = [];
let siteConfigMap = new Map();
let isMenuOpen = false;
let longPressTimer = null;
let longPressContext = null;
let dragState = null;
let dragPreviewEl = null;
let dragPreviewCardEl = null;
let dragPreviewTitleEl = null;
let dragPreviewValueEl = null;

function cloneTaskConfig(task, { includeRuntime = true } = {}) {
  const nextTask = {
    ...task,
    headers: task?.headers ? { ...task.headers } : undefined
  };

  if (!includeRuntime) {
    delete nextTask.extract;
  }

  if (!nextTask.headers) {
    delete nextTask.headers;
  }

  if (!nextTask.divideBy) {
    delete nextTask.divideBy;
  }

  if (!nextTask.fieldPath) {
    delete nextTask.fieldPath;
  }

  if (!nextTask.name) {
    delete nextTask.name;
  }

  return nextTask;
}

function getTaskList() {
  return siteConfigsCache;
}

function getTaskMap() {
  return siteConfigMap;
}

function getTaskById(taskId) {
  return getTaskMap().get(taskId) || null;
}

function setSiteConfigs(nextConfigs) {
  siteConfigsCache = nextConfigs.map((task) => cloneTaskConfig(task));
  siteConfigMap = new Map(siteConfigsCache.map((task) => [task.id, task]));
}

function setPersistedSiteConfigs(nextConfigs) {
  persistedSiteConfigsCache = normalizeSiteConfigs(nextConfigs);
}

function buildPersistedSiteConfigsFromRuntime(runtimeConfigs = siteConfigsCache) {
  return normalizeSiteConfigs(buildPersistedSharedSiteConfigsFromRuntime(runtimeConfigs));
}

function serializeSiteConfigs(siteConfigs = siteConfigsCache) {
  return serializeSharedSiteConfigs(siteConfigs);
}

function normalizeSiteConfigs(value) {
  return normalizeSharedSiteConfigs(value);
}

function buildDefaultSiteConfigs() {
  return [];
}

function mergeStoredSiteConfigs(storedSiteConfigs) {
  return mergeSharedSiteConfigs(storedSiteConfigs);
}

function normalizeLayoutColumns(value) {
  return value === 2 || value === 3 ? value : 2;
}

function normalizeColorMode(value) {
  return value === 'light' ? 'light' : 'dark';
}

function normalizeManualOrder(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => typeof item === 'string');
}

function normalizeGroups(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((group) => {
    if (!group || typeof group !== 'object') {
      return false;
    }

    if (typeof group.id !== 'string' || !group.id.startsWith('group:')) {
      return false;
    }

    if (!Array.isArray(group.taskIds)) {
      return false;
    }

    return group.taskIds.every((taskId) => typeof taskId === 'string');
  }).map((group) => ({
    id: group.id,
    taskIds: [...group.taskIds],
    ...(typeof group.name === 'string' && group.name.trim() ? { name: group.name.trim() } : {})
  }));
}

function applyLayoutColumns(nextColumns) {
  layoutColumns = normalizeLayoutColumns(nextColumns);
  boardEl.style.setProperty('--board-columns', String(layoutColumns));
  boardEl.dataset.columns = String(layoutColumns);
  if (layoutColumnsSelectEl) {
    layoutColumnsSelectEl.value = String(layoutColumns);
  }
}

function setMenuOpen(nextOpen) {
  isMenuOpen = Boolean(nextOpen);
  if (heroMenuEl) {
    heroMenuEl.hidden = !isMenuOpen;
    heroMenuEl.classList.toggle('is-open', isMenuOpen);
  }
  if (menuToggleBtn) {
    menuToggleBtn.setAttribute('aria-expanded', String(isMenuOpen));
    menuToggleBtn.setAttribute('aria-label', isMenuOpen ? '收起面板设置' : '显示面板设置');
  }
}

function applyAutoSortEnabled(nextValue) {
  autoSortEnabled = Boolean(nextValue);
  if (autoSortToggleEl) {
    autoSortToggleEl.setAttribute('aria-checked', String(autoSortEnabled));
  }
}

function applyColorMode(nextValue) {
  colorMode = normalizeColorMode(nextValue);
  document.documentElement?.setAttribute('data-theme', colorMode);
  if (colorModeToggleEl) {
    colorModeToggleEl.setAttribute('aria-checked', String(colorMode === 'light'));
    colorModeToggleEl.setAttribute('aria-label', colorMode === 'light' ? '切换深色模式' : '切换浅色模式');
  }
}

function rebuildBoard() {
  const viewItems = buildViewItems(groupsCache, manualOrderCache);
  manualOrderCache = syncManualOrderWithViewItems(viewItems, manualOrderCache.length ? manualOrderCache : buildDefaultManualOrder());
  const normalizedViewItems = buildViewItems(groupsCache, manualOrderCache);
  const finalViewItems = sortViewItemsIfNeeded(normalizedViewItems);
  renderBoard(finalViewItems);
  updateUI(boardDataCache);
}

async function loadPopupState() {
  const storedState = await chrome.storage.local.get(POPUP_STATE_KEYS);
  const normalizedState = {
    boardData: storedState.boardData && typeof storedState.boardData === 'object' ? storedState.boardData : {},
    lastUpdateTime: typeof storedState.lastUpdateTime === 'string' ? storedState.lastUpdateTime : '',
    autoSortEnabled: Boolean(storedState.autoSortEnabled),
    colorMode: normalizeColorMode(storedState.colorMode),
    layoutColumns: storedState.layoutColumns === 4 ? 2 : normalizeLayoutColumns(storedState.layoutColumns),
    manualOrder: normalizeManualOrder(storedState.manualOrder),
    groups: normalizeGroups(storedState.groups),
    siteConfigs: normalizeSiteConfigs(storedState.siteConfigs)
  };
  const sanitized = sanitizePopupState(normalizedState);

  if (sanitized.changed) {
    await persistPopupState(sanitized.state);
  }

  return sanitized.state;
}

async function persistPopupState(partialState = {}) {
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(partialState, 'autoSortEnabled')) {
    payload.autoSortEnabled = Boolean(partialState.autoSortEnabled);
  }

  if (Object.prototype.hasOwnProperty.call(partialState, 'layoutColumns')) {
    payload.layoutColumns = normalizeLayoutColumns(partialState.layoutColumns);
  }

  if (Object.prototype.hasOwnProperty.call(partialState, 'colorMode')) {
    payload.colorMode = normalizeColorMode(partialState.colorMode);
  }

  if (Object.prototype.hasOwnProperty.call(partialState, 'manualOrder')) {
    payload.manualOrder = normalizeManualOrder(partialState.manualOrder);
  }

  if (Object.prototype.hasOwnProperty.call(partialState, 'groups')) {
    payload.groups = normalizeGroups(partialState.groups);
  }

  if (Object.prototype.hasOwnProperty.call(partialState, 'boardData')) {
    payload.boardData = partialState.boardData && typeof partialState.boardData === 'object' ? partialState.boardData : {};
  }

  if (Object.prototype.hasOwnProperty.call(partialState, 'lastUpdateTime')) {
    payload.lastUpdateTime = typeof partialState.lastUpdateTime === 'string' ? partialState.lastUpdateTime : '';
  }

  if (Object.prototype.hasOwnProperty.call(partialState, 'siteConfigs')) {
    payload.siteConfigs = buildPersistedSiteConfigsFromRuntime(normalizeSiteConfigs(partialState.siteConfigs));
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'siteConfigs')) {
    setPersistedSiteConfigs(payload.siteConfigs);
  }

  await chrome.storage.local.set(payload);
}

function formatDateTime(date = new Date()) {
  return dateTimeFormatter.format(date);
}

function buildGroupIndex(groups) {
  const groupIndex = new Map();
  const usedTaskIds = new Set();

  groups.forEach((group) => {
    const validTaskIds = Array.isArray(group.taskIds)
      ? group.taskIds.filter((taskId) => getTaskMap().has(taskId)).slice(0, 2)
      : [];

    if (validTaskIds.length !== 2) {
      return;
    }

    if (validTaskIds[0] === validTaskIds[1]) {
      return;
    }

    if (validTaskIds.some((taskId) => usedTaskIds.has(taskId))) {
      return;
    }

    validTaskIds.forEach((taskId) => usedTaskIds.add(taskId));
    groupIndex.set(group.id, {
      id: group.id,
      taskIds: validTaskIds,
      ...(typeof group.name === 'string' && group.name.trim() ? { name: group.name.trim() } : {})
    });
  });

  return groupIndex;
}

function buildViewItems(groups = [], manualOrder = []) {
  const groupIndex = buildGroupIndex(groups);
  const taskToGroupId = new Map();

  groupIndex.forEach((group) => {
    group.taskIds.forEach((taskId) => {
      if (!taskToGroupId.has(taskId)) {
        taskToGroupId.set(taskId, group.id);
      }
    });
  });

  const allItems = [];
  const allItemMap = new Map();

  groupIndex.forEach((group) => {
    const item = {
      id: group.id,
      type: 'group',
      taskIds: [...group.taskIds],
      name: typeof group.name === 'string' && group.name.trim() ? group.name.trim() : ''
    };
    allItems.push(item);
    allItemMap.set(item.id, item);
  });

  getTaskList().forEach((task) => {
    if (taskToGroupId.has(task.id)) {
      return;
    }

    const item = {
      id: `task:${task.id}`,
      type: 'single',
      taskId: task.id
    };
    allItems.push(item);
    allItemMap.set(item.id, item);
  });

  const orderedItems = [];
  const consumedItemIds = new Set();

  normalizeManualOrder(manualOrder).forEach((itemId) => {
    const item = allItemMap.get(itemId);
    if (!item || consumedItemIds.has(itemId)) {
      return;
    }

    orderedItems.push(item);
    consumedItemIds.add(itemId);
  });

  allItems.forEach((item) => {
    if (!consumedItemIds.has(item.id)) {
      orderedItems.push(item);
    }
  });

  return orderedItems;
}

function buildTaskToViewItemMap(viewItems) {
  const index = new Map();

  viewItems.forEach((item) => {
    if (item.type === 'single') {
      index.set(item.taskId, item.id);
      return;
    }

    item.taskIds.forEach((taskId) => {
      index.set(taskId, item.id);
    });
  });

  return index;
}

function getViewItemIdByTaskId(taskId) {
  return taskToViewItemIdMap.get(taskId) || null;
}

function getCardElements(taskId) {
  const viewItemId = getViewItemIdByTaskId(taskId);
  return viewItemId ? cardRefs.get(viewItemId) : null;
}

function getViewItemById(viewItemId) {
  return currentViewItems.find((item) => item.id === viewItemId) || null;
}

function buildDefaultManualOrder() {
  return getTaskList().map((task) => `task:${task.id}`);
}

function sanitizePopupState(state) {
  const normalizedManualOrder = normalizeManualOrder(state.manualOrder);
  const normalizedGroups = normalizeGroups(state.groups);
  const normalizedStoredSiteConfigs = normalizeSiteConfigs(state.siteConfigs);
  const normalizedSiteConfigs = mergeStoredSiteConfigs(normalizedStoredSiteConfigs);
  const validTaskIds = new Set(normalizedSiteConfigs.map((task) => task.id));
  const nextBoardData = Object.fromEntries(Object.entries(state.boardData).filter(([taskId]) => validTaskIds.has(taskId)));
  const nextGroups = normalizedGroups.filter((group) => group.taskIds.every((taskId) => validTaskIds.has(taskId)));
  const validGroupIds = new Set(nextGroups.map((group) => group.id));
  const nextManualOrder = normalizedManualOrder.filter((itemId) => {
    if (itemId.startsWith('task:')) {
      return validTaskIds.has(itemId.slice('task:'.length));
    }
    if (itemId.startsWith('group:')) {
      return validGroupIds.has(itemId);
    }
    return false;
  });
  const sanitizedPersistedSiteConfigs = normalizeSiteConfigs(serializeSiteConfigs(normalizedSiteConfigs));
  const changed = (
    Object.keys(nextBoardData).length !== Object.keys(state.boardData).length
    || nextManualOrder.length !== normalizedManualOrder.length
    || nextGroups.length !== normalizedGroups.length
    || JSON.stringify(sanitizedPersistedSiteConfigs) !== JSON.stringify(normalizedStoredSiteConfigs)
  );

  return {
    changed,
    state: {
      ...state,
      boardData: nextBoardData,
      manualOrder: nextManualOrder,
      groups: nextGroups,
      siteConfigs: normalizedSiteConfigs,
      persistedSiteConfigs: sanitizedPersistedSiteConfigs
    }
  };
}

function syncManualOrderWithViewItems(viewItems, preferredOrder = manualOrderCache) {
  const validIds = new Set(viewItems.map((item) => item.id));
  const nextOrder = [];
  const seenIds = new Set();

  normalizeManualOrder(preferredOrder).forEach((itemId) => {
    if (!validIds.has(itemId) || seenIds.has(itemId)) {
      return;
    }
    nextOrder.push(itemId);
    seenIds.add(itemId);
  });

  viewItems.forEach((item) => {
    if (!seenIds.has(item.id)) {
      nextOrder.push(item.id);
      seenIds.add(item.id);
    }
  });

  return nextOrder;
}

function getViewItemsForCurrentState() {
  return buildViewItems(groupsCache, manualOrderCache);
}

function getSingleTaskIdFromViewItem(viewItem) {
  return viewItem?.type === 'single' ? viewItem.taskId : null;
}

function getTaskValue(taskId) {
  const value = boardDataCache[taskId];
  return value === undefined || value === null || value === '' ? '--' : String(value);
}

function parseComparableValue(taskId, rawValue) {
  const numericValue = toFiniteNumber(rawValue);
  return numericValue === null ? null : numericValue;
}

function getViewItemSortValue(item) {
  if (!item) {
    return null;
  }

  if (item.type === 'single') {
    return parseComparableValue(item.taskId, boardDataCache[item.taskId]);
  }

  if (item.type !== 'group' || !Array.isArray(item.taskIds) || item.taskIds.length !== 2) {
    return null;
  }

  const values = item.taskIds.map((taskId) => parseComparableValue(taskId, boardDataCache[taskId]));
  if (values.some((value) => value === null)) {
    return null;
  }

  return values[0] + values[1];
}

function formatGroupTotalValue(item) {
  const totalValue = getViewItemSortValue(item);
  return totalValue === null ? '--' : totalValue.toFixed(2);
}

function getViewItemHeightUnits(item) {
  return item?.type === 'group' ? 2 : 1;
}

function getBaseSortedViewItems(items) {
  if (!autoSortEnabled) {
    return [...items];
  }

  return items
    .map((item, index) => ({ item, index, sortValue: getViewItemSortValue(item) }))
    .sort((left, right) => {
      const leftInvalid = left.sortValue === null;
      const rightInvalid = right.sortValue === null;

      if (leftInvalid && rightInvalid) {
        return left.index - right.index;
      }

      if (leftInvalid) {
        return 1;
      }

      if (rightInvalid) {
        return -1;
      }

      if (right.sortValue !== left.sortValue) {
        return right.sortValue - left.sortValue;
      }

      return left.index - right.index;
    })
    .map(({ item }) => item);
}

function sortViewItemsForLayout(items, columns = layoutColumns) {
  const orderedItems = getBaseSortedViewItems(items);
  if (columns < 2) {
    return orderedItems;
  }

  const nextItems = [...orderedItems];
  for (let index = 1; index < nextItems.length; index += 1) {
    const currentItem = nextItems[index];
    const previousItem = nextItems[index - 1];
    if (!currentItem || !previousItem) {
      continue;
    }

    if (getViewItemHeightUnits(currentItem) !== 2 || getViewItemHeightUnits(previousItem) !== 1) {
      continue;
    }

    const beforePrevious = nextItems[index - 2];
    if (beforePrevious && getViewItemHeightUnits(beforePrevious) === 2) {
      continue;
    }

    nextItems[index - 1] = currentItem;
    nextItems[index] = previousItem;
  }

  return nextItems;
}

function buildLayoutSlots(items, columns = layoutColumns) {
  const occupancy = [];
  const slots = [];

  const isCellOccupied = (rowIndex, columnIndex) => Boolean(occupancy[rowIndex]?.[columnIndex]);
  const markOccupied = (rowIndex, columnIndex) => {
    if (!occupancy[rowIndex]) {
      occupancy[rowIndex] = [];
    }
    occupancy[rowIndex][columnIndex] = true;
  };

  items.forEach((item) => {
    const rowSpan = getViewItemHeightUnits(item);
    let placed = false;
    let row = 1;

    while (!placed) {
      for (let column = 1; column <= columns; column += 1) {
        const canPlace = Array.from({ length: rowSpan }).every((_, offset) => !isCellOccupied(row + offset, column));
        if (!canPlace) {
          continue;
        }

        Array.from({ length: rowSpan }).forEach((_, offset) => markOccupied(row + offset, column));
        slots.push({ id: item.id, column, row, rowSpan });
        placed = true;
        break;
      }

      row += 1;
    }
  });

  return slots;
}

function sortViewItemsIfNeeded(items) {
  return sortViewItemsForLayout(items, layoutColumns);
}

function reorderBoardDomIfNeeded() {
  const sortedViewItems = sortViewItemsIfNeeded(currentViewItems);
  const nextSlotMap = new Map(buildLayoutSlots(sortedViewItems, layoutColumns).map((slot) => [slot.id, slot]));
  const hasOrderChange = sortedViewItems.some((item, index) => item.id !== currentViewItems[index]?.id);
  const hasLayoutChange = sortedViewItems.some((item) => {
    const refs = cardRefs.get(item.id);
    const slot = nextSlotMap.get(item.id);
    if (!refs?.card || !slot) {
      return false;
    }

    return refs.card.style.gridColumn !== String(slot.column)
      || refs.card.style.gridRow !== `${slot.row} / span ${slot.rowSpan}`;
  });

  if (!hasOrderChange && !hasLayoutChange) {
    return false;
  }

  currentViewItems = sortedViewItems;
  currentViewItems.forEach((item) => {
    const refs = cardRefs.get(item.id);
    if (refs?.card) {
      applyLayoutToCard(refs.card, nextSlotMap.get(item.id));
      boardEl.appendChild(refs.card);
    }
  });

  return true;
}

function getGroupByTaskId(taskId) {
  return groupsCache.find((group) => Array.isArray(group.taskIds) && group.taskIds.includes(taskId)) || null;
}

function canGroup(taskIdA, taskIdB) {
  if (!getTaskMap().has(taskIdA) || !getTaskMap().has(taskIdB) || taskIdA === taskIdB) {
    return false;
  }

  if (getGroupByTaskId(taskIdA) || getGroupByTaskId(taskIdB)) {
    return false;
  }

  return true;
}

function createGroup(taskIdA, taskIdB) {
  if (!canGroup(taskIdA, taskIdB)) {
    return null;
  }

  const group = {
    id: `group:${taskIdA}:${taskIdB}:${Date.now()}`,
    taskIds: [taskIdA, taskIdB],
    name: ''
  };
  groupsCache = [...groupsCache, group];
  return group;
}

function ungroupByTaskId(taskId) {
  const targetGroup = getGroupByTaskId(taskId);
  if (!targetGroup) {
    return null;
  }

  const [taskA, taskB] = targetGroup.taskIds;
  const remainingTaskId = taskA === taskId ? taskB : taskA;
  const orderBeforeUngroup = syncManualOrderWithViewItems(getViewItemsForCurrentState());
  const groupIndex = orderBeforeUngroup.indexOf(targetGroup.id);

  groupsCache = groupsCache.filter((group) => group.id !== targetGroup.id);

  const insertionIndex = groupIndex >= 0 ? groupIndex : orderBeforeUngroup.length;
  const nextOrder = orderBeforeUngroup.filter((itemId) => (
    itemId !== targetGroup.id
    && itemId !== `task:${remainingTaskId}`
    && itemId !== `task:${taskId}`
  ));
  nextOrder.splice(insertionIndex, 0, `task:${remainingTaskId}`, `task:${taskId}`);
  manualOrderCache = syncManualOrderWithViewItems(getViewItemsForCurrentState(), nextOrder);

  return {
    groupId: targetGroup.id,
    draggedTaskId: taskId,
    remainingTaskId,
    insertionIndex
  };
}

function moveItemInOrder(order, itemId, targetIndex) {
  const nextOrder = order.filter((entry) => entry !== itemId);
  const boundedIndex = Math.max(0, Math.min(targetIndex, nextOrder.length));
  nextOrder.splice(boundedIndex, 0, itemId);
  return nextOrder;
}

function removeSiteTask(taskId) {
  const targetTask = getTaskById(taskId);
  if (!targetTask) {
    return false;
  }

  inFlightTaskIds.delete(taskId);

  const nextSiteConfigs = getTaskList().filter((task) => task.id !== taskId);
  const nextPersistedSiteConfigs = buildPersistedSiteConfigsFromRuntime(nextSiteConfigs);

  const group = getGroupByTaskId(taskId);
  if (group) {
    const [taskA, taskB] = group.taskIds;
    const remainingTaskId = taskA === taskId ? taskB : taskA;
    const orderBeforeRemoval = syncManualOrderWithViewItems(getViewItemsForCurrentState());
    const groupIndex = orderBeforeRemoval.indexOf(group.id);

    groupsCache = groupsCache.filter((entry) => entry.id !== group.id);
    setSiteConfigs(nextSiteConfigs);
    setPersistedSiteConfigs(nextPersistedSiteConfigs);
    delete boardDataCache[taskId];

    const insertionIndex = groupIndex >= 0 ? groupIndex : orderBeforeRemoval.length;
    const nextOrder = orderBeforeRemoval.filter((itemId) => (
      itemId !== group.id
      && itemId !== `task:${taskId}`
      && itemId !== `task:${remainingTaskId}`
    ));
    nextOrder.splice(insertionIndex, 0, `task:${remainingTaskId}`);
    manualOrderCache = syncManualOrderWithViewItems(getViewItemsForCurrentState(), nextOrder);
    return true;
  }

  setSiteConfigs(nextSiteConfigs);
  setPersistedSiteConfigs(nextPersistedSiteConfigs);
  delete boardDataCache[taskId];
  manualOrderCache = syncManualOrderWithViewItems(
    getViewItemsForCurrentState(),
    manualOrderCache.filter((itemId) => itemId !== `task:${taskId}`)
  );
  groupsCache = groupsCache.filter((entry) => !entry.taskIds.includes(taskId));
  return true;
}

function persistInteractionState() {
  return persistPopupState({
    autoSortEnabled,
    layoutColumns,
    colorMode,
    manualOrder: manualOrderCache,
    groups: groupsCache,
    boardData: boardDataCache,
    lastUpdateTime: lastSuccessfulSyncTime,
    siteConfigs: buildPersistedSiteConfigsFromRuntime()
  });
}

function ensureDragPreview() {
  if (dragPreviewEl) {
    return;
  }

  dragPreviewEl = document.createElement('div');
  dragPreviewEl.className = 'drag-preview';
  dragPreviewEl.hidden = true;
  dragPreviewEl.innerHTML = `
    <div class="drag-preview-card">
      <p class="drag-preview-title"></p>
      <p class="drag-preview-value"></p>
    </div>
  `;
  document.body.appendChild(dragPreviewEl);
  dragPreviewCardEl = dragPreviewEl.querySelector('.drag-preview-card');
  dragPreviewTitleEl = dragPreviewEl.querySelector('.drag-preview-title');
  dragPreviewValueEl = dragPreviewEl.querySelector('.drag-preview-value');
}

function resolveViewItemState(viewItem, taskStateMap) {
  if (viewItem?.type !== 'group') {
    const taskId = viewItem?.taskId;
    const stateEntry = taskId ? taskStateMap.get(taskId) : null;
    return stateEntry || { state: 'idle' };
  }

  const states = viewItem.taskIds.map((taskId) => taskStateMap.get(taskId)).filter(Boolean);
  const loadingState = states.find((entry) => entry.state === 'loading');
  if (loadingState) {
    return loadingState;
  }

  const errorState = states.find((entry) => entry.state === 'error');
  if (errorState) {
    return errorState;
  }

  const successState = [...states].reverse().find((entry) => entry.state === 'success');
  if (successState) {
    return successState;
  }

  return { state: 'idle' };
}

function setCardState(taskId, state) {
  const viewItemId = getViewItemIdByTaskId(taskId);
  const refs = viewItemId ? cardRefs.get(viewItemId) : null;
  if (!viewItemId || !refs) return;

  let taskStateMap = viewItemTaskStateMap.get(viewItemId);
  if (!taskStateMap) {
    taskStateMap = new Map();
    viewItemTaskStateMap.set(viewItemId, taskStateMap);
  }

  taskStateMap.set(taskId, { state });
  const displayState = resolveViewItemState(getViewItemById(viewItemId), taskStateMap);
  refs.card.dataset.state = displayState.state;
}

function resetClickSuppressionFlags() {
  window.setTimeout(() => {
    cardRefs.forEach(({ card }) => {
      card.dataset.dragInitiated = 'false';
      card.dataset.longPressTriggered = 'false';
      card.dataset.dragSuppressClick = 'false';
      card.classList.remove('is-long-pressing');
    });
  }, 0);
}

function updateGlobalSyncSummary(successCount, totalCount, syncTime) {
  if (successCount === totalCount) {
    lastSuccessfulSyncTime = syncTime;
  }
}

function createBaseCardElement(id, titleText) {
  const card = document.createElement('article');
  card.className = 'card';
  card.id = `card-${id}`;
  card.dataset.state = 'idle';
  card.dataset.viewItemId = id;

  const mainButton = document.createElement('button');
  mainButton.className = 'card-main';
  mainButton.type = 'button';
  mainButton.setAttribute('aria-label', `刷新卡片 ${titleText}`);

  const body = document.createElement('div');
  body.className = 'card-body';
  mainButton.appendChild(body);
  card.appendChild(mainButton);
  return card;
}

function triggerViewItemRefresh(item) {
  if (!item) {
    return;
  }

  if (item.type === 'single') {
    fetchSingleData(item.taskId);
    return;
  }

  if (item.type === 'group') {
    item.taskIds.forEach((taskId) => {
      fetchSingleData(taskId);
    });
  }
}

function shouldSuppressCardClick(card) {
  if (card.dataset.dragSuppressClick === 'true') {
    card.dataset.dragSuppressClick = 'false';
    return true;
  }

  return card.dataset.dragInitiated === 'true' || card.dataset.longPressTriggered === 'true';
}

function renderSingleCard(item) {
  const task = getTaskMap().get(item.taskId);
  if (!task) {
    return null;
  }

  const card = createBaseCardElement(item.id, task.name);
  const body = card.querySelector('.card-body');
  const mainButton = card.querySelector('.card-main');

  const row = document.createElement('div');
  row.className = 'single-row';

  const title = document.createElement('h2');
  title.className = 'title';
  title.textContent = task.name;

  const value = document.createElement('p');
  value.className = 'value';
  value.textContent = '--';

  row.appendChild(title);
  row.appendChild(value);
  body.appendChild(row);

  mainButton.addEventListener('click', () => {
    if (shouldSuppressCardClick(card)) {
      return;
    }
    if (card.dataset.disabled === 'true') return;
    triggerViewItemRefresh(item);
  });

  return {
    card,
    refs: {
      viewItemId: item.id,
      card,
      mainButton,
      values: new Map([[item.taskId, body.querySelector('.value')]])
    }
  };
}

function renderGroupCard(item) {
  const tasks = item.taskIds.map((taskId) => getTaskMap().get(taskId)).filter(Boolean);
  if (tasks.length !== 2) {
    return null;
  }

  const titleText = `${tasks[0].name} + ${tasks[1].name}`;
  const groupTitle = item.name || titleText;
  const card = createBaseCardElement(item.id, groupTitle);
  const mainButton = card.querySelector('.card-main');
  card.classList.add('group-card');

  const body = card.querySelector('.card-body');
  body.classList.add('group-body');

  const header = document.createElement('div');
  header.className = 'group-header';

  const groupTitleEl = document.createElement('div');
  groupTitleEl.className = 'group-title';
  groupTitleEl.textContent = groupTitle;

  const groupTotal = document.createElement('div');
  groupTotal.className = 'group-total';
  groupTotal.textContent = formatGroupTotalValue(item);

  header.appendChild(groupTitleEl);
  header.appendChild(groupTotal);
  body.appendChild(header);

  tasks.forEach((task) => {
    const row = document.createElement('div');
    row.className = 'group-row is-drag-handle';
    row.dataset.taskId = task.id;

    const name = document.createElement('div');
    name.className = 'group-name';
    name.textContent = task.name;

    const value = document.createElement('div');
    value.className = 'group-value';
    value.textContent = '--';

    row.appendChild(name);
    row.appendChild(value);
    body.appendChild(row);
  });

  mainButton.addEventListener('click', () => {
    if (shouldSuppressCardClick(card)) {
      return;
    }
    if (card.dataset.disabled === 'true') return;
    triggerViewItemRefresh(item);
  });

  const values = new Map();
  body.querySelectorAll('.group-row').forEach((row) => {
    values.set(row.dataset.taskId, row.querySelector('.group-value'));
  });

  return {
    card,
    refs: {
      viewItemId: item.id,
      card,
      mainButton,
      values
    }
  };
}

function applyLayoutToCard(card, slot) {
  if (!card || !slot) {
    return;
  }

  card.style.gridColumn = String(slot.column);
  card.style.gridRow = `${slot.row} / span ${slot.rowSpan}`;
}

function renderBoard(viewItems) {
  boardEl.innerHTML = '';
  cancelLongPress();
  dragState = null;
  clearDropIndicators();
  taskToViewItemIdMap.clear();
  viewItemTaskStateMap.clear();
  currentViewItems = viewItems;
  cardRefs.clear();

  const taskViewIndex = buildTaskToViewItemMap(viewItems);
  taskViewIndex.forEach((viewItemId, taskId) => {
    taskToViewItemIdMap.set(taskId, viewItemId);
  });

  const layoutSlotMap = new Map(buildLayoutSlots(viewItems, layoutColumns).map((slot) => [slot.id, slot]));

  viewItems.forEach((item) => {
    const rendered = item.type === 'group' ? renderGroupCard(item) : renderSingleCard(item);
    if (!rendered) {
      return;
    }

    applyLayoutToCard(rendered.card, layoutSlotMap.get(item.id));
    cardRefs.set(item.id, rendered.refs);
    boardEl.appendChild(rendered.card);
    bindDragInteractions(item, rendered.refs);
  });
}

function updateValueText(taskId, value) {
  const refs = getCardElements(taskId);
  const valueEl = refs?.values?.get(taskId);
  if (!valueEl) {
    return;
  }

  valueEl.innerText = value;
}

function setCardDisabled(refs, disabled) {
  if (!refs?.card) {
    return;
  }

  refs.card.dataset.disabled = disabled ? 'true' : 'false';
  if (refs.mainButton) {
    refs.mainButton.disabled = disabled;
  }
}

function getPointerCardContext(event) {
  const target = event.target;
  const card = target?.closest?.('.card');
  if (!card) {
    return null;
  }

  const viewItemId = card.dataset.viewItemId;
  const viewItem = viewItemId ? getViewItemById(viewItemId) : null;
  if (!viewItem) {
    return null;
  }

  const row = target.closest?.('.group-row[data-task-id]');
  const rowTaskId = row?.dataset?.taskId || null;
  const onGroupHeader = Boolean(target.closest?.('.group-header'));

  return {
    event,
    card,
    viewItemId,
    viewItem,
    rowTaskId,
    onGroupHeader,
    onRefreshControl: false,
    onMainControl: Boolean(target.closest?.('.card-main'))
  };
}


function renameSiteTask(taskId, nextName) {
  const task = getTaskById(taskId);
  if (!task) {
    return getTaskList();
  }

  const trimmedName = typeof nextName === 'string' ? nextName.trim() : '';
  if (!trimmedName) {
    return getTaskList();
  }

  const nextConfigs = getTaskList().map((entry) => (
    entry.id === taskId
      ? {
        ...entry,
        name: trimmedName
      }
      : entry
  ));
  setSiteConfigs(nextConfigs);
  return nextConfigs;
}

function renameGroup(groupId, nextName) {
  const trimmedName = typeof nextName === 'string' ? nextName.trim() : '';
  if (!trimmedName) {
    return groupsCache;
  }

  groupsCache = groupsCache.map((group) => (
    group.id === groupId
      ? {
        ...group,
        name: trimmedName
      }
      : group
  ));
  return groupsCache;
}

function clearDropIndicators() {
  cardRefs.forEach(({ card }) => {
    card.classList.remove('is-drop-target', 'is-group-target');
  });
}

function cancelLongPress({ resetCardState = true } = {}) {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  if (longPressContext?.card && resetCardState) {
    longPressContext.card.classList.remove('is-long-pressing');
    longPressContext.card.dataset.longPressTriggered = 'false';
    longPressContext.card.dataset.dragInitiated = 'false';
  }

  longPressContext = null;
}

function getGroupingTarget(pointerX, pointerY, sourceViewItemId) {
  if (!dragState?.draggedTaskId) {
    return null;
  }

  const draggedRect = {
    left: pointerX - dragState.offsetX,
    top: pointerY - dragState.offsetY,
    right: pointerX - dragState.offsetX + dragState.cardRect.width,
    bottom: pointerY - dragState.offsetY + dragState.cardRect.height
  };
  const draggedArea = dragState.cardRect.width * dragState.cardRect.height || 1;

  for (const item of currentViewItems) {
    if (item.id === sourceViewItemId || item.type !== 'single') {
      continue;
    }

    const refs = cardRefs.get(item.id);
    const card = refs?.card;
    if (!card) {
      continue;
    }

    const rect = card.getBoundingClientRect();
    const overlapX = Math.max(0, Math.min(draggedRect.right, rect.right) - Math.max(draggedRect.left, rect.left));
    const overlapY = Math.max(0, Math.min(draggedRect.bottom, rect.bottom) - Math.max(draggedRect.top, rect.top));
    const overlapArea = overlapX * overlapY;
    if (overlapArea / draggedArea < GROUP_OVERLAP_THRESHOLD) {
      continue;
    }

    const targetTaskId = getSingleTaskIdFromViewItem(item);
    if (targetTaskId && canGroup(dragState.draggedTaskId, targetTaskId)) {
      return {
        type: 'group',
        targetViewItemId: item.id,
        targetTaskId,
        rect
      };
    }
  }

  return null;
}

function getReorderTarget(pointerX, pointerY, sourceViewItemId) {
  if (autoSortEnabled || !dragState) {
    return null;
  }

  for (let index = 0; index < currentViewItems.length; index += 1) {
    const item = currentViewItems[index];
    if (item.id === sourceViewItemId) {
      continue;
    }

    const refs = cardRefs.get(item.id);
    const card = refs?.card;
    if (!card) {
      continue;
    }

    const rect = card.getBoundingClientRect();
    const insideX = pointerX >= rect.left && pointerX <= rect.right;
    const insideY = pointerY >= rect.top && pointerY <= rect.bottom;
    if (!insideX || !insideY) {
      continue;
    }

    const beforeThreshold = rect.top + rect.height * REORDER_EDGE_RATIO;
    const afterThreshold = rect.bottom - rect.height * REORDER_EDGE_RATIO;
    let insertIndex = index;

    if (pointerY > afterThreshold) {
      insertIndex = index + 1;
    } else if (pointerY >= beforeThreshold) {
      insertIndex = index + (pointerX > rect.left + rect.width / 2 ? 1 : 0);
    }

    return {
      type: 'reorder',
      targetViewItemId: item.id,
      targetIndex: insertIndex,
      rect
    };
  }

  return null;
}

function updateDragPreview(pointerX, pointerY) {
  if (!dragState || !dragPreviewEl || !dragPreviewCardEl || !dragPreviewTitleEl || !dragPreviewValueEl) {
    return;
  }

  const previewX = pointerX - dragState.offsetX;
  const previewY = pointerY - dragState.offsetY;
  dragPreviewEl.hidden = false;
  dragPreviewCardEl.style.setProperty('--drag-preview-width', `${Math.round(dragState.cardRect.width)}px`);
  dragPreviewCardEl.style.transform = `translate(${previewX}px, ${previewY}px)`;

  clearDropIndicators();
  const groupTarget = getGroupingTarget(pointerX, pointerY, dragState.sourceViewItemId);
  const activeTarget = groupTarget || getReorderTarget(pointerX, pointerY, dragState.sourceViewItemId);
  dragState.activeTarget = activeTarget;

  if (activeTarget?.targetViewItemId) {
    const targetRefs = cardRefs.get(activeTarget.targetViewItemId);
    if (targetRefs?.card) {
      targetRefs.card.classList.add(activeTarget.type === 'group' ? 'is-group-target' : 'is-drop-target');
    }
  }
}

function applyGroupDrop() {
  const targetTaskId = dragState?.activeTarget?.targetTaskId;
  const draggedTaskId = dragState?.draggedTaskId;
  if (!targetTaskId || !draggedTaskId) {
    return false;
  }

  const sourceOrder = syncManualOrderWithViewItems(getViewItemsForCurrentState());
  const targetViewItemId = `task:${targetTaskId}`;
  const targetIndex = sourceOrder.indexOf(targetViewItemId);
  const createdGroup = createGroup(draggedTaskId, targetTaskId);
  if (!createdGroup) {
    return false;
  }

  const nextOrder = sourceOrder.filter((itemId) => itemId !== `task:${draggedTaskId}` && itemId !== targetViewItemId);
  const insertionIndex = targetIndex >= 0 ? Math.min(targetIndex, nextOrder.length) : nextOrder.length;
  nextOrder.splice(insertionIndex, 0, createdGroup.id);
  manualOrderCache = syncManualOrderWithViewItems(getViewItemsForCurrentState(), nextOrder);
  return true;
}

function applyReorderDrop() {
  if (!dragState?.activeTarget || autoSortEnabled) {
    return false;
  }

  const currentOrder = syncManualOrderWithViewItems(getViewItemsForCurrentState());
  manualOrderCache = moveItemInOrder(currentOrder, dragState.sourceViewItemId, dragState.activeTarget.targetIndex);
  manualOrderCache = syncManualOrderWithViewItems(getViewItemsForCurrentState(), manualOrderCache);
  return true;
}

async function finishDrag(pointerEvent = null) {
  if (!dragState) {
    cancelLongPress();
    clearDropIndicators();
    return;
  }

  if (pointerEvent) {
    updateDragPreview(pointerEvent.clientX, pointerEvent.clientY);
  }

  const { sourceCard, pointerId } = dragState;
  sourceCard.classList.remove('is-dragging', 'is-long-pressing');
  sourceCard.dataset.dragInitiated = 'true';
  sourceCard.dataset.longPressTriggered = 'true';
  sourceCard.dataset.dragSuppressClick = 'true';

  if (pointerId !== null && pointerId !== undefined && sourceCard.hasPointerCapture(pointerId)) {
    sourceCard.releasePointerCapture(pointerId);
  }

  if (dragPreviewEl) {
    dragPreviewEl.hidden = true;
  }
  clearDropIndicators();

  let changed = Boolean(dragState.stateChangedBeforeDrop);
  if (dragState.activeTarget?.type === 'group') {
    changed = applyGroupDrop() || changed;
  } else if (dragState.activeTarget?.type === 'reorder') {
    changed = applyReorderDrop() || changed;
  }

  dragState = null;
  cancelLongPress({ resetCardState: false });
  resetClickSuppressionFlags();

  if (changed) {
    rebuildBoard();
    await persistInteractionState();
  }
}

function startLongPressDrag(context) {
  if (!context?.card || dragState || context.onRefreshControl) {
    cancelLongPress();
    return;
  }

  const pointerX = context.event.clientX;
  const pointerY = context.event.clientY;
  let draggedTaskId = null;
  let sourceViewItemId = context.viewItemId;

  if (context.viewItem.type === 'group' && context.rowTaskId) {
    const ungroupResult = ungroupByTaskId(context.rowTaskId);
    if (!ungroupResult) {
      cancelLongPress();
      return;
    }
    draggedTaskId = context.rowTaskId;
    sourceViewItemId = `task:${context.rowTaskId}`;
    rebuildBoard();
  } else if (context.viewItem.type === 'single') {
    draggedTaskId = context.viewItem.taskId;
  }

  const sourceRefs = cardRefs.get(sourceViewItemId);
  const sourceCard = sourceRefs?.card;
  if (!sourceCard) {
    cancelLongPress();
    return;
  }

  ensureDragPreview();
  const titleText = context.viewItem.type === 'group' && context.rowTaskId
    ? (getTaskMap().get(context.rowTaskId)?.name || '')
    : (getTaskMap().get(draggedTaskId)?.name || '');

  dragPreviewTitleEl.textContent = titleText;
  dragPreviewValueEl.textContent = getTaskValue(draggedTaskId);

  const sourceCardRect = sourceCard.getBoundingClientRect();
  dragState = {
    sourceViewItemId,
    sourceCard,
    draggedTaskId,
    pointerId: context.event.pointerId,
    cardRect: sourceCardRect,
    offsetX: pointerX - sourceCardRect.left,
    offsetY: pointerY - sourceCardRect.top,
    activeTarget: null,
    stateChangedBeforeDrop: context.viewItem.type === 'group' && context.rowTaskId
  };

  sourceCard.classList.add('is-dragging');
  sourceCard.dataset.longPressTriggered = 'true';
  sourceCard.dataset.dragInitiated = 'true';
  updateDragPreview(pointerX, pointerY);
}

function scheduleLongPress(context) {
  cancelLongPress();

  if (!context || context.onRefreshControl || context.card.dataset.disabled === 'true') {
    return;
  }

  longPressContext = context;
  context.card.classList.add('is-long-pressing');
  context.card.dataset.longPressTriggered = 'false';
  context.card.dataset.dragInitiated = 'false';
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    startLongPressDrag(context);
  }, LONG_PRESS_DELAY);
}

function handleCardPointerMove(event) {
  if (dragState?.pointerId === event.pointerId) {
    updateDragPreview(event.clientX, event.clientY);
    return;
  }

  if (!longPressContext || longPressContext.event.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = Math.abs(event.clientX - longPressContext.event.clientX);
  const deltaY = Math.abs(event.clientY - longPressContext.event.clientY);
  if (deltaX > 6 || deltaY > 6) {
    cancelLongPress();
  }
}

function bindDragInteractions(item, refs) {
  const pointerDownHandler = (event) => {
    if (event.button !== 0 || isBatchRefreshing || dragState) {
      return;
    }

    const context = getPointerCardContext(event);
    if (!context || context.viewItemId !== item.id) {
      return;
    }

    if (context.onRefreshControl) {
      return;
    }

    if (context.viewItem.type === 'group' && !context.rowTaskId) {
      return;
    }

    refs.card.setPointerCapture(event.pointerId);
    scheduleLongPress(context);
  };

  const pointerMoveHandler = (event) => {
    handleCardPointerMove(event);
  };

  const pointerUpHandler = async (event) => {
    if (dragState?.pointerId === event.pointerId) {
      await finishDrag(event);
      return;
    }

    if (refs.card.hasPointerCapture(event.pointerId)) {
      refs.card.releasePointerCapture(event.pointerId);
    }

    const shouldActivate = Boolean(
      longPressContext
      && longPressContext.card === refs.card
      && longPressContext.event.pointerId === event.pointerId
      && refs.card.dataset.disabled !== 'true'
    );
    cancelLongPress();

    if (shouldActivate) {
      refs.card.dataset.dragSuppressClick = 'true';
      triggerViewItemRefresh(item);
    }
  };

  const pointerCancelHandler = () => {
    if (dragState) {
      finishDrag();
      return;
    }
    cancelLongPress();
  };

  refs.card.addEventListener('pointerdown', pointerDownHandler);
  refs.card.addEventListener('pointermove', pointerMoveHandler);
  refs.card.addEventListener('pointerup', pointerUpHandler);
  refs.card.addEventListener('pointercancel', pointerCancelHandler);
  refs.card.addEventListener('lostpointercapture', () => {
    if (!dragState) {
      cancelLongPress();
    }
  });

  refs.mainButton?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    if (refs.card.dataset.disabled === 'true') {
      return;
    }

      if (refs.card.dataset.dragInitiated === 'true' || refs.card.dataset.longPressTriggered === 'true') {
      return;
    }

    if (item.type === 'single') {
      fetchSingleData(item.taskId);
      return;
    }

    item.taskIds.forEach((taskId) => {
      fetchSingleData(taskId);
    });
  });
}

function applyFetchErrorToCard(taskId, valueEl, error, fallbackValue) {
  valueEl.innerText = formatTaskErrorValue(error, fallbackValue);
  setCardState(taskId, 'error');
}

function updateUI(data) {
  for (const [id, value] of Object.entries(data)) {
    const refs = getCardElements(id);
    const valueEl = refs?.values?.get(id);
    if (!refs || !valueEl) continue;

    valueEl.innerText = value;
    setCardState(id, 'success', '');
  }
}

function buildPersistedPopupState(overrides = {}) {
  return {
    autoSortEnabled,
    layoutColumns,
    colorMode,
    manualOrder: manualOrderCache,
    groups: groupsCache,
    boardData: boardDataCache,
    lastUpdateTime: lastSuccessfulSyncTime,
    siteConfigs: buildPersistedSiteConfigsFromRuntime(),
    ...overrides
  };
}

function applyExternalSiteConfigsChange(nextStoredSiteConfigs) {
  const sanitizedState = sanitizePopupState({
    boardData: boardDataCache,
    lastUpdateTime: lastSuccessfulSyncTime,
    autoSortEnabled,
    colorMode,
    layoutColumns,
    manualOrder: manualOrderCache,
    groups: groupsCache,
    siteConfigs: normalizeSiteConfigs(nextStoredSiteConfigs)
  }).state;

  boardDataCache = sanitizedState.boardData;
  groupsCache = sanitizedState.groups;
  manualOrderCache = sanitizedState.manualOrder;
  setSiteConfigs(sanitizedState.siteConfigs);
  setPersistedSiteConfigs(sanitizedState.persistedSiteConfigs || serializeSiteConfigs(sanitizedState.siteConfigs));
  rebuildBoard();
}

async function persistBoardData() {
  await persistPopupState(buildPersistedPopupState({
    boardData: boardDataCache
  }));
}

async function init() {
  await injectDemoCardsIfFirstRun();
  ensureDragPreview();
  const popupState = await loadPopupState();
  setSiteConfigs(popupState.siteConfigs);
  setPersistedSiteConfigs(popupState.persistedSiteConfigs || serializeSiteConfigs(popupState.siteConfigs));
  boardDataCache = popupState.boardData;
  groupsCache = popupState.groups;
  manualOrderCache = popupState.manualOrder;
  applyAutoSortEnabled(popupState.autoSortEnabled);
  applyColorMode(popupState.colorMode);
  applyLayoutColumns(popupState.layoutColumns);
  rebuildBoard();

  if (popupState.lastUpdateTime) {
    lastSuccessfulSyncTime = popupState.lastUpdateTime;
  }
}

function buildHttpError(task, response, json = null) {
  return buildSharedHttpError(task, response, json);
}

async function fetchTaskValue(task) {
  const fetchOptions = { credentials: 'include' };
  if (task.headers) {
    fetchOptions.headers = task.headers;
  }

  const response = await fetch(task.url, fetchOptions);
  if (task.type === 'json') {
    const json = await response.json();

    if (!response.ok) {
      throw buildHttpError(task, response, json);
    }

    return task.extract(json);
  }

  if (!response.ok) {
    throw buildHttpError(task, response);
  }

  const text = await response.text();
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return task.extract(doc);
}

async function fetchSingleData(taskId) {
  const task = getTaskMap().get(taskId);
  const refs = getCardElements(taskId);
  const valueEl = refs?.values?.get(taskId);
  if (!task || !refs || !valueEl) return { ok: false, taskId };
  if (isDemoTask(task)) {
    const demoValue = taskId === 'demo-click-refresh' ? '就是这样 ✓' : boardDataCache[taskId] || '--';
    valueEl.innerText = demoValue;
    setCardState(taskId, 'success');
    return { ok: true, taskId, value: demoValue, changed: false };
  }
  if (isBatchRefreshing || inFlightTaskIds.has(taskId)) return { ok: false, taskId, skipped: true };

  const originalValue = valueEl.innerText;
  inFlightTaskIds.add(taskId);
  setCardDisabled(refs, true);
  setCardState(taskId, 'loading');
  valueEl.innerText = '...';

  try {
    const newValue = await fetchTaskValue(task);
    if (!getTaskById(taskId)) {
      return { ok: false, taskId, removed: true };
    }

    const hasChanged = boardDataCache[taskId] !== newValue;

    valueEl.innerText = newValue;
    setCardState(taskId, 'success');

    if (hasChanged) {
      boardDataCache[taskId] = newValue;
      await persistBoardData();
    }

    if (reorderBoardDomIfNeeded()) {
      updateUI(boardDataCache);
    }

    return { ok: true, taskId, value: newValue, changed: hasChanged };
  } catch (error) {
    console.error(`抓取 ${task.name} 失败:`, error);
    applyFetchErrorToCard(taskId, valueEl, error, originalValue);
    return { ok: false, taskId, error };
  } finally {
    inFlightTaskIds.delete(taskId);
    if (!Array.from(inFlightTaskIds).some((id) => getViewItemIdByTaskId(id) === refs.viewItemId)) {
      setCardDisabled(refs, false);
    }
  }
}

async function fetchAllData() {
  if (isBatchRefreshing) return;

  refreshBtn.disabled = true;
  const originalBtnText = refreshBtn.innerText;
  refreshBtn.innerText = '同步中';
  isBatchRefreshing = true;

  try {
    const batchTimestamp = formatDateTime();
    const results = await Promise.all(getTaskList().map(async (task) => {
      const refs = getCardElements(task.id);
      const valueEl = refs?.values?.get(task.id);
      if (!refs || !valueEl) {
        return { ok: false, taskId: task.id, error: new Error('未找到卡片节点') };
      }

      if (isDemoTask(task)) {
        return {
          ok: true,
          taskId: task.id,
          value: boardDataCache[task.id] || '--',
          originalValue: valueEl.innerText,
          skipped: true
        };
      }

      const originalValue = valueEl.innerText;
      setCardDisabled(refs, true);
      setCardState(task.id, 'loading', '正在请求最新数据…');
      valueEl.innerText = '...';

      try {
        const newValue = await fetchTaskValue(task);
        if (!getTaskById(task.id)) {
          return { ok: false, taskId: task.id, removed: true, originalValue };
        }
        return { ok: true, taskId: task.id, value: newValue, originalValue };
      } catch (error) {
        return { ok: false, taskId: task.id, error, originalValue };
      }
    }));

    const nextBoardData = { ...boardDataCache };
    let hasStorageChange = false;

    results.forEach((result) => {
      const refs = getCardElements(result.taskId);
      const valueEl = refs?.values?.get(result.taskId);
      if (!refs || !valueEl) return;

      setCardDisabled(refs, false);

      if (!result.ok) {
        if (!result.removed) {
          applyFetchErrorToCard(result.taskId, valueEl, result.error, result.originalValue);
        }
        return;
      }

      if (result.skipped) {
        setCardState(result.taskId, 'success');
        valueEl.innerText = result.value;
        return;
      }

      const hasChanged = nextBoardData[result.taskId] !== result.value;
      valueEl.innerText = result.value;
      setCardState(result.taskId, 'success');

      if (hasChanged) {
        nextBoardData[result.taskId] = result.value;
        hasStorageChange = true;
      }
    });

    const successCount = results.filter((result) => result.ok).length;

    if (hasStorageChange) {
      boardDataCache = nextBoardData;
    }

    if (successCount === getTaskList().length) {
      await persistPopupState(buildPersistedPopupState({
        ...(hasStorageChange ? { boardData: boardDataCache } : {}),
        lastUpdateTime: batchTimestamp
      }));
    } else if (hasStorageChange) {
      await persistBoardData();
    }

    if (reorderBoardDomIfNeeded()) {
      updateUI(boardDataCache);
    }

    updateGlobalSyncSummary(successCount, getTaskList().length, batchTimestamp);
  } finally {
    isBatchRefreshing = false;
    refreshBtn.innerText = originalBtnText;
    refreshBtn.disabled = false;

    cardRefs.forEach((refs) => {
      setCardDisabled(refs, false);
    });
  }
}

async function handleAutoSortToggle() {
  applyAutoSortEnabled(!autoSortEnabled);
  await persistPopupState({
    autoSortEnabled,
    layoutColumns,
    colorMode,
    manualOrder: manualOrderCache,
    groups: groupsCache,
    boardData: boardDataCache,
    lastUpdateTime: lastSuccessfulSyncTime,
    siteConfigs: siteConfigsCache
  });
  rebuildBoard();
}

async function handleLayoutColumnsChange(event) {
  const nextColumns = normalizeLayoutColumns(Number(event.target.value));
  applyLayoutColumns(nextColumns);
  rebuildBoard();
  await persistPopupState({
    autoSortEnabled,
    layoutColumns,
    colorMode,
    manualOrder: manualOrderCache,
    groups: groupsCache,
    boardData: boardDataCache,
    lastUpdateTime: lastSuccessfulSyncTime,
    siteConfigs: siteConfigsCache
  });
}

async function handleColorModeToggle() {
  applyColorMode(colorMode === 'light' ? 'dark' : 'light');
  await persistPopupState({ colorMode });
}


refreshBtn.addEventListener('click', fetchAllData);
menuToggleBtn?.addEventListener('click', () => {
  setMenuOpen(!isMenuOpen);
});
addSiteBtn?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/add-site.html') });
});
autoSortToggleEl?.addEventListener('click', () => {
  handleAutoSortToggle();
});
colorModeToggleEl?.addEventListener('click', () => {
  handleColorModeToggle();
});
layoutColumnsSelectEl?.addEventListener('change', (event) => {
  handleLayoutColumnsChange(event);
});
chrome.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes || isBatchRefreshing) {
    return;
  }

  if (changes.siteConfigs) {
    applyExternalSiteConfigsChange(changes.siteConfigs.newValue);
  }

  if (changes.colorMode) {
    applyColorMode(changes.colorMode.newValue);
  }
});
setMenuOpen(false);
const initPromise = init();
