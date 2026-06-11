(function (root, factory) {
  const shared = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = shared;
  }
  root.SiteConfigShared = shared;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createTaskError(message, extra = {}) {
    const error = new Error(message);
    Object.assign(error, extra);
    return error;
  }

  function toFiniteNumber(value) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      // 去除英文和中文引号
      const unquoted = trimmed.replace(/^["'"'「」『』""'']+|["'"'「」『』""'']+$/g, '');
      const num = Number(unquoted);
      return Number.isFinite(num) ? num : null;
    }

    if (typeof value !== 'number') {
      return null;
    }

    return Number.isFinite(value) ? value : null;
  }

  function createMissingFieldError(fieldPath) {
    return createTaskError(`接口字段缺失：${fieldPath}（接口字段可能变更）`, {
      kind: 'missing-field',
      fieldPath
    });
  }

  function createInvalidValueError(fieldPath, rawValue) {
    const displayValue = rawValue === '' ? '(空字符串)' : String(rawValue);
    return createTaskError(`接口字段存在但不是可解析数字：${fieldPath}（原始值：${displayValue}）`, {
      kind: 'invalid-value',
      fieldPath,
      rawValue
    });
  }

  function createCalculationError(message, extra = {}) {
    return createTaskError(message || '公式错误', {
      kind: 'calculation',
      ...extra
    });
  }

  function normalizeCalculationExpression(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function tokenizeCalculationExpression(expression) {
    const tokens = [];
    let index = 0;

    while (index < expression.length) {
      const char = expression[index];
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if (char === 'X' || char === 'x') {
        tokens.push({ type: 'variable' });
        index += 1;
        continue;
      }
      if ('+-*/()'.includes(char)) {
        tokens.push({ type: char });
        index += 1;
        continue;
      }
      if (/\d|\./.test(char)) {
        let numberText = '';
        while (index < expression.length && /\d|\./.test(expression[index])) {
          numberText += expression[index];
          index += 1;
        }
        if (!/^\d+(\.\d+)?$|^\.\d+$/.test(numberText)) {
          throw createCalculationError('公式中的数字格式不正确', { expression });
        }
        tokens.push({ type: 'number', value: Number(numberText) });
        continue;
      }
      throw createCalculationError('公式包含不支持的字符', { expression });
    }

    return tokens;
  }

  function evaluateCalculationExpression(expression, x) {
    const normalizedExpression = normalizeCalculationExpression(expression);
    const numericX = toFiniteNumber(x);
    if (numericX === null) {
      throw createCalculationError('公式变量 X 不是有效数字', { expression: normalizedExpression, rawValue: x });
    }
    if (!normalizedExpression) {
      return numericX.toFixed(2);
    }

    const tokens = tokenizeCalculationExpression(normalizedExpression);
    let current = 0;

    function peek() {
      return tokens[current];
    }

    function consume(type) {
      if (peek()?.type === type) {
        current += 1;
        return true;
      }
      return false;
    }

    function parsePrimary() {
      const token = peek();
      if (!token) {
        throw createCalculationError('公式不完整', { expression: normalizedExpression });
      }
      if (consume('number')) {
        return token.value;
      }
      if (consume('variable')) {
        return numericX;
      }
      if (consume('(')) {
        const value = parseExpression();
        if (!consume(')')) {
          throw createCalculationError('公式括号不匹配', { expression: normalizedExpression });
        }
        return value;
      }
      throw createCalculationError('公式语法不正确', { expression: normalizedExpression });
    }

    function parseUnary() {
      if (consume('+')) {
        return parseUnary();
      }
      if (consume('-')) {
        return -parseUnary();
      }
      return parsePrimary();
    }

    function parseFactor() {
      let value = parseUnary();
      while (peek()?.type === '*' || peek()?.type === '/') {
        const operator = peek().type;
        current += 1;
        const right = parseUnary();
        if (operator === '*') {
          value *= right;
        } else {
          if (right === 0) {
            throw createCalculationError('公式不能除以 0', { expression: normalizedExpression });
          }
          value /= right;
        }
      }
      return value;
    }

    function parseExpression() {
      let value = parseFactor();
      while (peek()?.type === '+' || peek()?.type === '-') {
        const operator = peek().type;
        current += 1;
        const right = parseFactor();
        value = operator === '+' ? value + right : value - right;
      }
      return value;
    }

    const result = parseExpression();
    if (current !== tokens.length) {
      throw createCalculationError('公式语法不正确', { expression: normalizedExpression });
    }
    if (!Number.isFinite(result)) {
      throw createCalculationError('公式计算结果不是有效数字', { expression: normalizedExpression });
    }
    return result.toFixed(2);
  }

  function applyCalculationExpression(rawValue, expression) {
    const normalizedExpression = normalizeCalculationExpression(expression);
    if (!normalizedExpression) {
      return rawValue;
    }
    return evaluateCalculationExpression(normalizedExpression, rawValue);
  }

  function createAppErrorPayloadError(json) {
    const code = typeof json?.code === 'string' ? json.code : '';
    const message = typeof json?.message === 'string' ? json.message : '';
    const detail = [code, message].filter(Boolean).join('：') || '接口返回了应用层错误结构';
    return createTaskError(detail, {
      kind: 'app-error',
      code,
      payloadMessage: message
    });
  }

  function parseFieldPath(fieldPath) {
    return String(fieldPath)
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .filter((key) => key !== '');
  }

  function getNestedValue(source, fieldPath) {
    return parseFieldPath(fieldPath)
      .reduce((current, key) => (current === null || current === undefined ? undefined : current[key]), source);
  }

  function isAppErrorPayload(json) {
    return Boolean(
      json
      && typeof json === 'object'
      && !Array.isArray(json)
      && ((typeof json.code === 'string' && json.code.trim()) || (typeof json.message === 'string' && json.message.trim()))
      && getNestedValue(json, 'data.balance') === undefined
    );
  }

  function extractBalanceValue(json, fieldPath) {
    const balance = getNestedValue(json, fieldPath);
    if (balance === undefined) {
      if (isAppErrorPayload(json)) {
        throw createAppErrorPayloadError(json);
      }
      throw createMissingFieldError(fieldPath);
    }

    const numericBalance = toFiniteNumber(balance);
    if (numericBalance === null) {
      throw createInvalidValueError(fieldPath, balance);
    }

    return numericBalance.toFixed(2);
  }

  function normalizeHeaders(headers) {
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
      return undefined;
    }

    const entries = Object.entries(headers)
      .filter(([key, value]) => typeof key === 'string' && key.trim() && value !== undefined && value !== null)
      .map(([key, value]) => [key.trim(), String(value)]);

    if (!entries.length) {
      return undefined;
    }

    return Object.fromEntries(entries);
  }

  async function generateNekoSignHeaders(url) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const nonce = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const fullPath = new URL(url).pathname;
    const path = fullPath.replace(/^\/api/, '');
    const input = timestamp + nonce + path + 'nekoneko';
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    const sign = Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
    return { 'X-Timestamp': timestamp, 'X-Nonce': nonce, 'X-Sign': sign };
  }

  function normalizeDivideBy(value) {
    if (value === '' || value === null || value === undefined) {
      return null;
    }

    const numericValue = toFiniteNumber(value);
    if (numericValue === null || numericValue === 0) {
      return null;
    }

    return numericValue;
  }

  function buildManagedTaskConfig(task) {
    const fieldPath = typeof task?.fieldPath === 'string' ? task.fieldPath.trim() : '';
    const headers = normalizeHeaders(task?.headers);
    const calculationExpression = normalizeCalculationExpression(task?.calculationExpression);
    const dynamicSign = typeof task?.dynamicSign === 'string' && task.dynamicSign.trim() ? task.dynamicSign.trim() : '';
    const runtimeTask = {
      id: String(task?.id || '').trim(),
      name: typeof task?.name === 'string' && task.name.trim() ? task.name.trim() : '自定义站点',
      url: typeof task?.url === 'string' ? task.url.trim() : '',
      type: task?.type === 'html' ? 'html' : 'json',
      ...(fieldPath ? { fieldPath } : {}),
      ...(headers ? { headers } : {}),
      ...(dynamicSign ? { dynamicSign } : {}),
      ...(calculationExpression ? { calculationExpression } : {}),
      ...(task?.isCustom === true ? { isCustom: true } : {}),
      ...(task?.isDemo === true ? { isDemo: true } : {}),
      extract: (payload) => applyCalculationExpression(extractBalanceValue(payload, fieldPath), calculationExpression)
    };

    return runtimeTask;
  }

  function buildCustomTaskConfig(task) {
    return buildManagedTaskConfig({
      ...task,
      isCustom: true,
      type: 'json'
    });
  }

  const DEMO_SITE_CONFIGS = [
    {
      id: 'demo-click-refresh',
      name: '单击',
      url: '',
      type: 'json',
      fieldPath: '',
      isCustom: true,
      isDemo: true
    },
    {
      id: 'demo-drag-group',
      name: '长按',
      url: '',
      type: 'json',
      fieldPath: '',
      isCustom: true,
      isDemo: true
    }
  ];

  function isDemoTask(task) {
    return Boolean(task && task.isDemo === true);
  }

  function createPublicSiteConfig(value) {
    const normalizedConfig = normalizeSiteConfigs([value])[0];
    if (!normalizedConfig) {
      return null;
    }
    return normalizedConfig;
  }

  function createSiteConfigArchive(value) {
    const normalizedConfig = normalizeSiteConfigs([value])[0];
    if (!normalizedConfig) {
      return null;
    }
    return normalizedConfig;
  }

  function getExportValuePath(task) {
    if (typeof task?.fieldPath === 'string' && task.fieldPath.trim()) {
      return task.fieldPath.trim();
    }
    if (typeof task?.valuePath === 'string' && task.valuePath.trim()) {
      return task.valuePath.trim();
    }
    return '';
  }

  function normalizeSiteConfigs(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((task) => task && typeof task === 'object' && typeof task.id === 'string')
      .map((task) => {
        const fieldPath = getExportValuePath(task);
        const normalizedTask = {
          id: task.id.trim(),
          ...(typeof task.name === 'string' && task.name.trim() ? { name: task.name.trim() } : {}),
          ...(typeof task.url === 'string' && task.url.trim() ? { url: task.url.trim() } : {}),
          ...(task.type === 'json' || task.type === 'html' ? { type: task.type } : {}),
          ...(normalizeHeaders(task.headers) ? { headers: normalizeHeaders(task.headers) } : {}),
          ...(typeof task.dynamicSign === 'string' && task.dynamicSign.trim() ? { dynamicSign: task.dynamicSign.trim() } : {}),
          ...(fieldPath ? { fieldPath } : {}),
          ...(normalizeCalculationExpression(task.calculationExpression) ? { calculationExpression: normalizeCalculationExpression(task.calculationExpression) } : {}),
          ...(task.isCustom === true ? { isCustom: true } : {}),
          ...(task.isDemo === true ? { isDemo: true } : {})
        };

        return normalizedTask;
      })
      .filter((task) => task.id);
  }

  function serializeSiteConfigs(siteConfigs) {
    return siteConfigs.map((task) => {
      const baseTask = {
        id: String(task.id || '').trim(),
        ...(typeof task.name === 'string' && task.name.trim() ? { name: task.name.trim() } : {}),
        ...(typeof task.url === 'string' && task.url.trim() ? { url: task.url.trim() } : {}),
        ...(task.type === 'json' || task.type === 'html' ? { type: task.type } : {}),
        ...(normalizeHeaders(task.headers) ? { headers: normalizeHeaders(task.headers) } : {}),
        ...(typeof task.dynamicSign === 'string' && task.dynamicSign.trim() ? { dynamicSign: task.dynamicSign.trim() } : {}),
        ...(typeof task.fieldPath === 'string' && task.fieldPath.trim() ? { fieldPath: task.fieldPath.trim() } : {}),
        ...(normalizeCalculationExpression(task.calculationExpression) ? { calculationExpression: normalizeCalculationExpression(task.calculationExpression) } : {}),
        ...(task.isCustom === true ? { isCustom: true } : {}),
        ...(task.isDemo === true ? { isDemo: true } : {})
      };

      return {
        ...baseTask,
        type: baseTask.type || 'json'
      };
    });
  }

  function serializePublicSiteConfigs(siteConfigs) {
    return siteConfigs.map((task) => {
      const valuePath = getExportValuePath(task);
      return {
        ...(typeof task.name === 'string' && task.name.trim() ? { name: task.name.trim() } : {}),
        ...(typeof task.url === 'string' && task.url.trim() ? { url: task.url.trim() } : {}),
        type: task.type === 'html' ? 'html' : 'json',
        ...(normalizeHeaders(task.headers) ? { headers: normalizeHeaders(task.headers) } : {}),
        ...(valuePath ? { valuePath } : {}),
        ...(normalizeCalculationExpression(task.calculationExpression) ? { calculationExpression: normalizeCalculationExpression(task.calculationExpression) } : {})
      };
    });
  }

  function buildPersistedSiteConfigsFromRuntime(runtimeConfigs) {
    return normalizeSiteConfigs(serializeSiteConfigs(runtimeConfigs));
  }

  function mergeStoredSiteConfigs(storedSiteConfigs) {
    return normalizeSiteConfigs(storedSiteConfigs).map((task) => (
      task.isCustom === true ? buildCustomTaskConfig(task) : buildManagedTaskConfig(task)
    ));
  }

  function buildUpdatedSiteConfigs(siteConfigs, task) {
    const nextTask = task.isCustom === true
      ? buildCustomTaskConfig(task)
      : buildManagedTaskConfig(task);
    const hasExisting = siteConfigs.some((entry) => entry.id === nextTask.id);
    if (!hasExisting) {
      return [...siteConfigs, nextTask];
    }

    return siteConfigs.map((entry) => (entry.id === nextTask.id ? nextTask : entry));
  }

  function deleteSiteConfigEntry(persistedSiteConfigs, taskId) {
    return normalizeSiteConfigs(persistedSiteConfigs).filter((task) => task.id !== taskId);
  }

  function detectSuggestedAuthHeader(error, responseStatus) {
    if (responseStatus === 401 || responseStatus === 403) {
      return 'authorization';
    }

    const taskErrorMessage = String(error?.message || '').toLowerCase();
    if (taskErrorMessage.includes('new-api-user')) {
      return 'new-api-user';
    }
    if (taskErrorMessage.includes('token')) {
      return 'token';
    }
    if (taskErrorMessage.includes('authorization') || taskErrorMessage.includes('bearer')) {
      return 'authorization';
    }
    return 'authorization';
  }

  function formatWizardErrorMessage(error) {
    if (!error || typeof error !== 'object') {
      return '测试失败，请检查接口地址和字段路径。';
    }

    if (error.kind === 'auth') {
      return `鉴权失败：${error.message}`;
    }
    if (error.kind === 'http') {
      return `HTTP 失败：${error.message}`;
    }
    if (error.kind === 'missing-field') {
      return `字段不存在：${error.fieldPath}`;
    }
    if (error.kind === 'invalid-value') {
      const displayValue = error.rawValue === '' ? '(空字符串)' : String(error.rawValue);
      return `字段存在但不是可解析数字：${error.fieldPath}（原始值：${displayValue}）`;
    }
    if (error.kind === 'app-error') {
      return `接口返回错误：${error.message}`;
    }
    if (error.kind === 'json-parse') {
      return `JSON 解析失败：${error.message}`;
    }
    return error.message || '测试失败，请检查配置。';
  }

  function buildHttpError(task, response, json = null) {
    const isAuthError = response.status === 401 || response.status === 403;
    const baseError = createTaskError(isAuthError ? `HTTP ${response.status}: token 失效或缺少鉴权信息` : `HTTP ${response.status}`, {
      kind: isAuthError ? 'auth' : 'http',
      status: response.status,
      taskId: task.id
    });

    if (!isAppErrorPayload(json)) {
      return baseError;
    }

    return createTaskError(baseError.message, {
      kind: baseError.kind,
      status: response.status,
      taskId: task.id,
      code: typeof json?.code === 'string' ? json.code : '',
      payloadMessage: typeof json?.message === 'string' ? json.message : ''
    });
  }

  return {
    DEMO_SITE_CONFIGS,
    isDemoTask,
    createPublicSiteConfig,
    createSiteConfigArchive,
    createTaskError,
    toFiniteNumber,
    createMissingFieldError,
    createInvalidValueError,
    createCalculationError,
    normalizeCalculationExpression,
    evaluateCalculationExpression,
    applyCalculationExpression,
    createAppErrorPayloadError,
    getNestedValue,
    isAppErrorPayload,
    extractBalanceValue,
    normalizeHeaders,
    normalizeDivideBy,
    buildManagedTaskConfig,
    buildCustomTaskConfig,
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
    generateNekoSignHeaders
  };
});