const assert = require('assert');
const fs = require('fs');
const path = require('path');
const projectRoot = path.resolve(__dirname, '..');

const html = fs.readFileSync(path.join(projectRoot, 'src/pages/popup.html'), 'utf8');

assert(/<button id="addSiteBtn"[\s\S]*?>\s*站点\s*<\/button>/.test(html), 'popup 应提供“站点”按钮文案');
assert(/<button id="menuToggleBtn"[\s\S]*?>\s*配置\s*<\/button>/.test(html), 'popup 应提供“配置”按钮文案');
assert(/<button id="refreshBtn"[\s\S]*?>\s*同步\s*<\/button>/.test(html), 'popup 应提供“同步”按钮文案');
assert(html.includes('>卡片<'), '设置项文案应为“卡片”');
assert(html.includes('id="autoRefreshToggle"'), '设置面板应提供自动刷新切换控件');
assert(/<span class="menu-label">自动刷新<\/span>[\s\S]*<button id="autoRefreshToggle" class="menu-switch" type="button" role="switch" aria-checked="false" aria-label="切换自动刷新"><\/button>/.test(html), '自动刷新应复用 menu-switch 开关');
assert(html.includes('>颜色模式<'), '设置面板应提供颜色模式项');
assert(/body\s*\{[\s\S]*width:\s*480px;/.test(html), 'popup 面板宽度应为 480px');
assert(html.includes('id="colorModeToggle"'), '设置面板应提供颜色模式切换控件');
assert(!html.includes('id="addSiteWizard"'), 'popup 中不应再保留 addSiteWizard');
assert(!html.includes('id="cardContextOverlay"'), 'popup 中不应再保留右键菜单');
assert(!html.includes('id="tokenEditor"'), 'popup 中不应再保留 token 编辑器');
assert(!html.includes('id="siteNameEditor"'), 'popup 中不应再保留站点名称编辑器');
assert(html.includes('<script src="../shared/site-config-shared.js"></script>'), 'popup 应先加载 site-config-shared.js');
assert(/<script src="\.\.\/shared\/site-config-shared\.js"><\/script>[\s\S]*<script src="popup\.js"><\/script>/.test(html), 'popup 应在 popup.js 前加载共享脚本');

const popupJs = fs.readFileSync(path.join(projectRoot, 'src/pages/popup.js'), 'utf8');
assert(!popupJs.includes('addSiteWizard'), 'popup.js 中不应再保留 addSiteWizard 相关逻辑');
assert(/addSiteBtn\?\.addEventListener\('click', \(\) => \{[\s\S]*chrome\.tabs\.create\(\{\s*url:\s*chrome\.runtime\.getURL\('src\/pages\/add-site\.html'\)\s*\}\);[\s\S]*\}\);/.test(popupJs), '站点按钮应打开 src/pages/add-site.html 页面');
assert(!/body\.innerHTML\s*=\s*`[\s\S]*\$\{task\.name\}/.test(popupJs), '单站点卡片渲染不应通过 innerHTML 拼接站点名称');
assert(!/body\.innerHTML\s*=\s*`[\s\S]*\$\{groupTitle\}/.test(popupJs), '编组卡片渲染不应通过 innerHTML 拼接编组名称');
assert(!/body\.innerHTML\s*=\s*`[\s\S]*\$\{tasks\.map/.test(popupJs), '编组卡片渲染不应通过 innerHTML 拼接任务列表');

const publicConfigPath = path.join(projectRoot, 'src/config/site-config.public.json');
const publicConfigText = fs.readFileSync(publicConfigPath, 'utf8');
assert(!/eyJhbGci/.test(publicConfigText), '公开配置不应包含 JWT');
assert(!/Bearer\s+(?!YOUR_AUTHORIZATION\b)[^"\s]+/.test(publicConfigText), '公开配置不应包含真实 Bearer token');
assert(!/"new-api-user"\s*:\s*"(?!YOUR_NEW_API_USER")\d+"/.test(publicConfigText), '公开配置不应包含真实 new-api-user 数字值');

console.log('task-popup-ui.test.js passed');
