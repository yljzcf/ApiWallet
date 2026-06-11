importScripts('../shared/site-config-shared.js');

const SiteConfigShared = globalThis.SiteConfigShared;
if (!SiteConfigShared) {
  throw new Error('SiteConfigShared 未加载');
}

const {
  isDemoTask,
  createTaskError,
  mergeStoredSiteConfigs,
  buildHttpError
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

let bgCookieRuleIdCounter = 1;

async function injectCookiesForUrl(url) {
  try {
    const cookies = await chrome.cookies.getAll({ url });
    if (cookies.length === 0) return null;

    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const ruleId = bgCookieRuleIdCounter++ % 9999 + 20001;
    const domain = new URL(url).hostname;

    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [{
        id: ruleId,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{
            header: 'Cookie',
            operation: 'set',
            value: cookieHeader
          }]
        },
        condition: {
          urlFilter: `*://${domain}/*`,
          resourceTypes: ['xmlhttprequest']
        }
      }],
      removeRuleIds: [ruleId]
    });

    return ruleId;
  } catch (e) {
    return null;
  }
}

async function removeCookieRule(ruleId) {
  if (ruleId === null) return;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [],
      removeRuleIds: [ruleId]
    });
  } catch (e) {
    // ignore
  }
}

async function fetchJsonTaskValue(task) {
  if (task.type !== 'json') {
    throw buildUnsupportedTaskError(task);
  }

  const ruleId = await injectCookiesForUrl(task.url);

  try {
    const fetchOptions = { credentials: 'include' };
    if (task.headers) {
      fetchOptions.headers = task.headers;
    }

    const response = await fetch(task.url, fetchOptions);
    let json = null;
    try {
      json = await response.json();
    } catch (error) {
      throw createTaskError(`JSON 解析失败：${error.message}`, {
        kind: 'json-parse',
        taskId: task.id
      });
    }

    if (!response.ok) {
      throw buildHttpError(task, response, json);
    }

    return task.extract(json);
  } finally {
    await removeCookieRule(ruleId);
  }
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
