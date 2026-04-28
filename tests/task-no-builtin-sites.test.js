const assert = require('assert');
const fs = require('fs');
const path = require('path');
const projectRoot = path.resolve(__dirname, '..');

const productionFiles = [
  'src/pages/popup.js',
  'src/pages/add-site.js',
  'src/shared/site-config-shared.js'
];

const forbiddenPatterns = [
  'yybb-api',
  'ikun-api',
  '发现-api',
  'duck-api',
  'api.team-invite.cn',
  'duckcoding.ai',
  'findcg.com',
  'REMOVED_TASK_IDS',
  'DIAGNOSTIC_TASK_IDS',
  'includeDefaultSites',
  'builtinIds',
  'removedTaskIds'
];

for (const file of productionFiles) {
  const code = fs.readFileSync(path.join(projectRoot, file), 'utf8');
  for (const pattern of forbiddenPatterns) {
    assert(!code.includes(pattern), `${file} 不应包含旧站点或内置/隐藏站点语义: ${pattern}`);
  }
}

console.log('task-no-builtin-sites.test.js passed');
