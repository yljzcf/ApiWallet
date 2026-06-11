importScripts('../shared/site-config-shared.js');

const SiteConfigShared = globalThis.SiteConfigShared;
if (!SiteConfigShared) {
  throw new Error('SiteConfigShared 未加载');
}

const {
  isDemoTask,
  createTaskError,
  mergeStoredSiteConfigs,
  buildHttpError,
  createCookieInjector,
  fetchJsonWithAuth
} = SiteConfigShared;

const AUTO_REFRESH_ALARM_NAME = 'auto-refresh-board-data';
const AUTO_REFRESH_PERIOD_MINUTES = 30;
const AUTO_REFRESH_STORAGE_KEYS = [
  'autoRefreshEnabled',
  'siteConfigs',
  'boardData'
];

function formatDateTime(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function toErrorSummary(error) {
  if (!error || typeof error !== 'object') {
    return String(error || '未知错误');
  }

  const parts = [];
  if (error.taskId) {
    parts.push(String(error.taskId));
  }
  if (error.kind) {
    parts.push(String(error.kind));
  }
  parts.push(error.message || '未知错误');
  return parts.filter(Boolean).join(': ');
}

function buildUnsupportedTaskError(task) {
  return createTaskError('后台自动刷新暂不支持 HTML 任务', {
    kind: 'unsupported-task-type',
    taskId: task.id,
    taskType: task.type
  });
}

async function ensureAutoRefreshAlarm() {
  const stored = await chrome.storage.local.get(['autoRefreshEnabled']);
  if (stored.autoRefreshEnabled === true) {
    await chrome.alarms.create(AUTO_REFRESH_ALARM_NAME, {
      periodInMinutes: AUTO_REFRESH_PERIOD_MINUTES
    });
    return;
  }

  await chrome.alarms.clear(AUTO_REFRESH_ALARM_NAME);
}

const bgInjector = createCookieInjector(20001);

async function fetchJsonTaskValue(task) {
  if (task.type !== 'json') {
    throw buildUnsupportedTaskError(task);
  }

  const { json } = await fetchJsonWithAuth(task, bgInjector);
  return task.extract(json);
}

function shouldRefreshTask(task) {
  return Boolean(task && !isDemoTask(task) && typeof task.url === 'string' && task.url.trim());
}

async function runAutoRefresh() {
  const runAt = formatDateTime();
  const stored = await chrome.storage.local.get(AUTO_REFRESH_STORAGE_KEYS);
  if (stored.autoRefreshEnabled !== true) {
    await chrome.storage.local.set({
      autoRefreshLastRunAt: runAt,
      autoRefreshLastError: ''
    });
    return { ok: true, skipped: true, reason: 'disabled' };
  }

  const boardData = stored.boardData && typeof stored.boardData === 'object' ? stored.boardData : {};
  const tasks = mergeStoredSiteConfigs(stored.siteConfigs);
  const realTasks = tasks.filter(shouldRefreshTask);
  const results = await Promise.all(realTasks.map(async (task) => {
    try {
      const value = await fetchJsonTaskValue(task);
      return { ok: true, taskId: task.id, value };
    } catch (error) {
      return { ok: false, taskId: task.id, error };
    }
  }));

  const failures = results.filter((result) => !result.ok);
  const successfulResults = results.filter((result) => result.ok);
  const nextBoardData = { ...boardData };
  successfulResults.forEach((result) => {
    nextBoardData[result.taskId] = result.value;
  });

  const payload = {
    autoRefreshLastRunAt: runAt,
    autoRefreshLastError: failures.map((result) => toErrorSummary({
      ...result.error,
      taskId: result.taskId
    })).join('\n')
  };

  if (realTasks.length > 0 && failures.length === 0) {
    payload.boardData = nextBoardData;
    payload.lastUpdateTime = runAt;
    payload.autoRefreshLastSuccessAt = runAt;
  }

  await chrome.storage.local.set(payload);

  return {
    ok: failures.length === 0,
    total: realTasks.length,
    successCount: successfulResults.length,
    failureCount: failures.length
  };
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAutoRefreshAlarm().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  ensureAutoRefreshAlarm().catch(console.error);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.autoRefreshEnabled) {
    return;
  }

  ensureAutoRefreshAlarm().catch(console.error);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name !== AUTO_REFRESH_ALARM_NAME) {
    return;
  }

  runAutoRefresh().catch(console.error);
});

globalThis.__AutoRefreshBackground = {
  AUTO_REFRESH_ALARM_NAME,
  AUTO_REFRESH_PERIOD_MINUTES,
  ensureAutoRefreshAlarm,
  fetchJsonTaskValue,
  runAutoRefresh,
  shouldRefreshTask,
  toErrorSummary
};
