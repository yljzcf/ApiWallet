const assert = require('assert');
const fs = require('fs');
const path = require('path');
const projectRoot = path.resolve(__dirname, '..');

const targetPath = path.join(projectRoot, 'src/pages/add-site.html');

assert(fs.existsSync(targetPath), '文件不存在: add-site.html');

const html = fs.readFileSync(targetPath, 'utf8');
const compactHtml = html.replace(/\s+/g, ' ');
const bodyHtml = html.slice(html.indexOf('<body'));
const homeSectionMatch = bodyHtml.match(/<section[^>]+id="homePanel"[\s\S]*?<\/section>/);
const siteFormMatch = bodyHtml.match(/<section[^>]+id="siteConfigPanel"[\s\S]*?<\/section>/);
const advancedSectionMatch = bodyHtml.match(/<section[^>]+class="advanced-settings"[\s\S]*?<\/section>/);

assert(/站点管理|id="siteManagerLayout"/.test(html), '独立页面应是站点管理页');
assert(/id="homePanel"/.test(html), '配置页应有首页容器 homePanel');
assert(homeSectionMatch, '首页容器应是独立 section，便于只显示首页内容');

const homeHtml = homeSectionMatch ? homeSectionMatch[0] : '';
assert(/id="configBoard"/.test(homeHtml), '首页应显示当前卡片展示区');
assert(/id="addSiteConfigBtn"[^>]*>[\s\S]*新增站点/.test(homeHtml), '首页应显示“新增站点”按钮');
assert(/id="importFileBtn"[^>]*>[\s\S]*导入配置/.test(homeHtml), '首页应显示“导入配置”按钮');
assert(/id="exportSitesBtn"[^>]*>[\s\S]*导出配置/.test(homeHtml), '首页应显示“导出配置”按钮');
assert(!/id="saveBoardBtn"|保存到看板/.test(homeHtml), '首页不应固定显示“保存到看板”按钮');
assert(/id="groupPopover"/.test(homeHtml), '首页应提供编组弹窗容器');
assert(/id="groupPopoverNameInput"/.test(homeHtml), '编组弹窗应提供组名输入框');
assert(/id="saveGroupNameBtn"[\s\S]*保存组名/.test(homeHtml), '编组弹窗应提供保存组名按钮');
assert(/id="groupPopoverTaskList"/.test(homeHtml), '编组弹窗应提供组内站点卡片列表');
assert(/class="[^"]*board-popover-layer/.test(homeHtml), '首页应提供看板浮层定位容器');
assert(!/id="configBoard"[^>]*class="[^"]*board-popover-layer/.test(homeHtml), 'configBoard 不应同时作为网格布局和弹窗定位容器');
const configBoardOpenIndex = homeHtml.indexOf('id="configBoard"');
const configBoardCloseIndex = configBoardOpenIndex === -1 ? -1 : homeHtml.indexOf('</div>', configBoardOpenIndex);
const groupPopoverIndex = homeHtml.indexOf('id="groupPopover"');
assert(configBoardOpenIndex !== -1 && groupPopoverIndex !== -1 && configBoardCloseIndex !== -1 && groupPopoverIndex > configBoardCloseIndex, '编组弹窗不应放在 configBoard 内部成为 grid 子项');
assert(!/id="siteConfigPanel"|id="groupEditPanel"|id="groupNamePanel"|id="managedSiteList"/.test(homeHtml), '首页不应显示表单、组编辑或旧站点列表');
assert(!/错误提示/.test(homeHtml), '首页初始不应显示“错误提示”固定区');

assert(!/id="cardActionMenu"|id="groupActionMenu"|id="siteCardMenu"|id="siteGroupMenu"/.test(html), '卡片点击不应再依赖旧弹出菜单');
assert(!/id="modeCreateBtn"|id="modeEditBtn"/.test(html), '配置页不应再使用新增/修改双模式切换');

assert(siteFormMatch, '配置页应提供单站点配置页面');
const siteFormHtml = siteFormMatch ? siteFormMatch[0].replace(/\s+/g, ' ') : '';
assert(/class="[^"]*site-config-card/.test(siteFormHtml), '单站点配置页应使用现代卡片式主容器');
assert(/id="backHomeBtn"[\s\S]*返回面板/.test(html), '单站点配置页应提供返回面板按钮');
assert(!/class="[^"]*site-name-field[\s\S]*<span class="label">站点名<\/span>/.test(siteFormHtml), '站点名输入框上方不应显示突出文字标签');
assert(/\.site-config-card\s*\{[\s\S]*--site-control-height:\s*44px;[\s\S]*--site-action-width:\s*150px;/.test(html), '单站点配置页应定义统一控件高度和动作区宽度');
assert(/\.site-config-card__topbar\s*\{[\s\S]*grid-template-columns:\s*var\(--site-action-width\)\s+minmax\(0,\s*1fr\)\s+var\(--site-action-width\);/.test(html), '顶部返回、站点名和完成配置动作区应使用统一动作宽度列');
assert(/\.site-config-actions\s*\{[\s\S]*width:\s*var\(--site-action-width\);[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+48px;[\s\S]*gap:\s*0;/.test(html), '完成配置动作区应使用固定宽度的合并式 split button 布局');
assert(/#backHomeBtn,\s*#fetchRawValueBtn,\s*#testCalculationBtn\s*\{[\s\S]*width:\s*var\(--site-action-width\);/.test(html), '返回面板、访问接口和测试计算按钮应使用同一宽度');
assert(/#siteConfigPanel\s+button,[\s\S]*#siteConfigPanel\s+input,[\s\S]*#siteConfigPanel\s+select\s*\{[\s\S]*height:\s*var\(--site-control-height\);[\s\S]*box-sizing:\s*border-box;/.test(html), '单站点配置页按钮、输入框和下拉框应统一高度');
assert(/#finishSiteConfigBtn,[\s\S]*#siteActionMenuToggle\s*\{[\s\S]*background:\s*var\(--accent-soft\);[\s\S]*border-color:\s*rgba\(142,\s*232,\s*178,\s*0\.28\);/.test(html), '完成配置按钮和下拉按钮应使用相同背景与边框色');
assert(/#finishSiteConfigBtn\s*\{[\s\S]*border-top-right-radius:\s*0;[\s\S]*border-bottom-right-radius:\s*0;/.test(html), '完成配置按钮右侧应与下拉按钮合并');
assert(/\.site-action-menu-toggle\s*\{[\s\S]*border-top-left-radius:\s*0;[\s\S]*border-bottom-left-radius:\s*0;/.test(html), '下拉按钮左侧应与完成配置按钮合并');
assert(/class="[^"]*site-config-actions/.test(siteFormHtml), '单站点配置页应提供完成配置动作区');
assert(/id="finishSiteConfigBtn"[\s\S]*完成配置/.test(siteFormHtml), '单站点配置页应在动作区提供完成配置按钮');
assert(/id="siteActionMenuToggle"[\s\S]*aria-label="站点操作"/.test(siteFormHtml), '完成配置按钮旁应提供站点操作下拉箭头');
assert(/id="siteActionMenu"[\s\S]*id="deleteSiteBtn"[\s\S]*删除站点/.test(siteFormHtml), '删除站点应隐藏在完成配置旁的下拉菜单中');
assert(!/正在新增站点/.test(html), '新增站点时不应显示“正在新增站点”提示');
const nameIndex = siteFormHtml.indexOf('站点名');
const urlIndex = siteFormHtml.indexOf('接口地址');
const fieldIndex = siteFormHtml.indexOf('监控字段');
assert(nameIndex !== -1 && urlIndex !== -1 && fieldIndex !== -1, '单站点配置页面应包含站点名、接口地址和监控字段');
assert(nameIndex < urlIndex && urlIndex < fieldIndex, '新增站点字段顺序必须是：站点名 → 接口地址 → 监控字段');
assert(/id="authHeaderSelect"[\s\S]*authorization[\s\S]*token[\s\S]*new-api-user/.test(html), '鉴权字段应使用包含三种选项的下拉框');
assert(/#authHeaderSelect\s+option\s*\{[\s\S]*color:\s*#111827;[\s\S]*background-color:\s*#ffffff;[\s\S]*\}/.test(html), '鉴权字段下拉选项应使用深色文字和浅色背景');
assert(/id="authHeaderValueInput"/.test(html), '单站点配置页应提供鉴权字段值输入框');
assert(!/错误提示/.test(siteFormHtml), '单站点配置页初始不应显示“错误提示”文案');

assert(!/id="createModePanel"|id="editModePanel"/.test(siteFormHtml), '单站点配置页不应再保留新增/编辑两套表单面板');

const addSiteJs = fs.readFileSync(path.join(projectRoot, 'src/pages/add-site.js'), 'utf8');
assert(!/button\.innerHTML\s*=\s*`[\s\S]*\$\{site\.name\}/.test(addSiteJs), '站点列表不应通过 innerHTML 拼接站点名称');
assert(!/button\.innerHTML\s*=\s*`[\s\S]*\$\{site\.fieldPath/.test(addSiteJs), '站点列表不应通过 innerHTML 拼接监控字段');

assert(advancedSectionMatch, '配置页应提供高级配置区域');
const advancedHtml = advancedSectionMatch ? advancedSectionMatch[0] : '';
assert(/\.raw-value-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--site-action-width\);/.test(html), '原值行右侧访问接口按钮应使用统一动作宽度');
assert(/\.formula-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--site-action-width\);/.test(html), '公式行右侧测试计算按钮应使用统一动作宽度');
assert(/\.raw-value-card,\s*\.calculated-value-card\s*\{[\s\S]*min-height:\s*var\(--site-control-height\);[\s\S]*height:\s*var\(--site-control-height\);[\s\S]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\);/.test(html), '原值和计算结果展示应使用统一高度的一行控件');
assert(/\.raw-value-card\s+\.metric-value,\s*\.calculated-value-card\s+\.metric-value\s*\{[\s\S]*font-size:\s*clamp\(24px,\s*4vw,\s*30px\);/.test(html), '原值和计算结果展示值字号应限制为最小 24px、最大 30px');
assert(!/\.raw-value-card,\s*\.calculated-value-card\s*\{[\s\S]*min-height:\s*76px;/.test(html), '原值和计算结果展示不应保留过高卡片');
assert(/id="rawValueSection"[\s\S]*id="rawValueText"[\s\S]*id="fetchRawValueBtn"/.test(html), '原值行应同时包含原值展示和访问接口按钮');
assert(/id="advancedSettingsToggle"[\s\S]*点击展开高级设置/.test(html), '高级配置应提供默认收起的展开入口');
assert(/id="advancedSettingsPanel"[^>]*hidden/.test(html), '高级配置面板应默认收起');
assert(/id="calculationExpressionInput"/.test(html), '页面应提供输出公式输入框');
assert(/id="testCalculationBtn"/.test(html), '页面应提供测试计算按钮');
assert(/id="calculatedValueText"/.test(html), '页面应提供计算结果展示');
assert(/data-calculation-expression="X\/500000"/.test(advancedHtml), '公式区域应提供 X/500000 快捷输入按钮');
assert(/data-calculation-expression="180-X"/.test(advancedHtml), '公式区域应提供 180-X 快捷输入按钮');
assert(/data-calculation-expression="X\+1"/.test(advancedHtml), '公式区域应提供 X+1 快捷输入按钮');
assert(!/A\/500000/.test(advancedHtml), '页面不应再提供 A/500000 快捷公式');
assert(!/180-A/.test(advancedHtml), '页面不应再提供 180-A 快捷公式');
assert(!/id="finishAddSiteBtn"/.test(html), '统一单页表单不应再使用旧完成按钮 id');
assert(!/id="divideByInput"/.test(html), '页面不应再提供 divideByInput');
assert(!/id="skipCalculationBtn"|不需要/.test(html), '页面不应再提供“不需要”按钮');

console.log('task-add-site-ui.test.js passed');
