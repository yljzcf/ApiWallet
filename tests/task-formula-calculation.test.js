const assert = require('assert');
const fs = require('fs');
const path = require('path');
const projectRoot = path.resolve(__dirname, '..');
const vm = require('vm');

const sharedCode = fs.readFileSync(path.join(projectRoot, 'src/shared/site-config-shared.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(sharedCode, sandbox);
const shared = sandbox.SiteConfigShared;

assert.strictEqual(typeof shared.extractBalanceValue, 'function', '应提供 extractBalanceValue');
assert.strictEqual(typeof shared.buildCustomTaskConfig, 'function', '应提供 buildCustomTaskConfig');
assert.strictEqual(typeof shared.normalizeSiteConfigs, 'function', '应提供 normalizeSiteConfigs');
assert.strictEqual(typeof shared.serializeSiteConfigs, 'function', '应提供 serializeSiteConfigs');
assert.strictEqual(typeof shared.normalizeCalculationExpression, 'function', '应提供 normalizeCalculationExpression');
assert.strictEqual(typeof shared.evaluateCalculationExpression, 'function', '应提供 evaluateCalculationExpression');
assert.strictEqual(typeof shared.applyCalculationExpression, 'function', '应提供 applyCalculationExpression');
assert.strictEqual(shared.normalizeFormula, undefined, '不应再暴露 normalizeFormula');
assert.strictEqual(shared.applyOptionalFormula, undefined, '不应再暴露 applyOptionalFormula');

const normalized = shared.normalizeSiteConfigs([
  {
    id: 'custom-formula',
    name: '公式站点',
    url: 'https://example.test/api',
    fieldPath: 'data.quota',
    calculationExpression: ' X/500000 ',
    formula: ' A/500000 ',
    divideBy: 500000,
    isCustom: true
  }
]);
assert.strictEqual(normalized[0].calculationExpression, 'X/500000', 'normalizeSiteConfigs 应保留新的公式表达式');
assert.strictEqual(normalized[0].formula, undefined, 'normalizeSiteConfigs 应丢弃旧 formula');
assert.strictEqual(normalized[0].divideBy, undefined, 'normalizeSiteConfigs 应丢弃旧 divideBy');

const serialized = shared.serializeSiteConfigs(normalized);
assert.strictEqual(serialized[0].calculationExpression, 'X/500000', 'serializeSiteConfigs 应写出新的公式表达式');
assert.strictEqual(serialized[0].formula, undefined, 'serializeSiteConfigs 不应写出旧 formula');
assert.strictEqual(serialized[0].divideBy, undefined, 'serializeSiteConfigs 不应写出旧 divideBy');

assert.strictEqual(shared.applyCalculationExpression('2500000.00', ''), '2500000.00', '空公式应显示原值');
assert.strictEqual(shared.applyCalculationExpression('2500000.00', 'X/500000'), '5.00', '应支持 X 除法计算');
assert.strictEqual(shared.applyCalculationExpression('10.00', '(X + 10) / 2'), '10.00', '应支持括号和加减乘除优先级');
assert.strictEqual(shared.applyCalculationExpression('10.00', '-X + 15'), '5.00', '应支持一元负号');

[
  ['X + A', '未知变量应报公式错误'],
  ['Math.max(X, 1)', '函数调用应报公式错误'],
  ['(X + 1', '括号不匹配应报公式错误'],
  ['X/0', '除零应报公式错误'],
  ['1..2 + X', '非法数字应报公式错误']
].forEach(([expression, message]) => {
  assert.throws(
    () => shared.applyCalculationExpression('10.00', expression),
    (error) => error && error.kind === 'calculation',
    message
  );
});

const runtimeTask = shared.buildCustomTaskConfig({
  id: 'runtime-formula',
  name: '运行态公式',
  url: 'https://example.test/api/runtime',
  fieldPath: 'data.quota',
  calculationExpression: 'X/500000',
  formula: 'A/500000',
  divideBy: 500000,
  isCustom: true
});
assert.strictEqual(runtimeTask.calculationExpression, 'X/500000', '运行态配置应保留新的公式表达式');
assert.strictEqual(runtimeTask.formula, undefined, '运行态配置不应保留旧 formula');
assert.strictEqual(runtimeTask.divideBy, undefined, '运行态配置不应保留旧 divideBy');
assert.strictEqual(runtimeTask.extract({ data: { quota: 2500000 } }), '5.00', '运行态 extract 应输出公式计算后的值');

const rawRuntimeTask = shared.buildCustomTaskConfig({
  id: 'runtime-raw',
  name: '运行态原值',
  url: 'https://example.test/api/raw',
  fieldPath: 'data.quota',
  calculationExpression: '',
  isCustom: true
});
assert.strictEqual(rawRuntimeTask.extract({ data: { quota: 2500000 } }), '2500000.00', '空公式运行态 extract 应直接输出抓取原值');

console.log('task-formula-calculation.test.js passed');
