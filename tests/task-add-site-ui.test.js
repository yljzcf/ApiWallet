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
assert(/id="configBoard"[^>]*class="[^"]*board-popover-layer/.test(homeHtml), '编组弹窗应放在看板自身的浮层定位上下文中，避免脱离展示区错位');
assert(!/id="siteConfigPanel"|id="groupEditPanel"|id="groupNamePanel"|id="managedSiteList"/.test(homeHtml), '首页不应显示表单、组编辑或旧站点列表');
assert(!/错误提示/.test(homeHtml), '首页初始不应显示“错误提示”固定区');

assert(!/id="cardActionMenu"|id="groupActionMenu"|id="siteCardMenu"|id="siteGroupMenu"/.test(html), '卡片点击不应再依赖旧弹出菜单');
assert(!/id="modeCreateBtn"|id="modeEditBtn"/.test(html), '配置页不应再使用新增/修改双模式切换');

assert(siteFormMatch, '配置页应提供单站点配置页面');
const siteFormHtml = siteFormMatch ? siteFormMatch[0].replace(/\s+/g, ' ') : '';
assert(/class="[^"]*site-config-card/.test(siteFormHtml), '单站点配置页应使用现代卡片式主容器');
assert(/id="backHomeBtn"[\s\S]*返回面板/.test(html), '单站点配置页应提供返回面板按钮');
assert(/id="deleteSiteBtn"[\s\S]*删除站点/.test(html), '单站点配置页应提供删除站点按钮');
const nameIndex = siteFormHtml.indexOf('站点名');
const urlIndex = siteFormHtml.indexOf('接口地址');
const fieldIndex = siteFormHtml.indexOf('监控字段');
assert(nameIndex !== -1 && urlIndex !== -1 && fieldIndex !== -1, '单站点配置页面应包含站点名、接口地址和监控字段');
assert(nameIndex < urlIndex && urlIndex < fieldIndex, '新增站点字段顺序必须是：站点名 → 接口地址 → 监控字段');
assert(/id="authHeaderSelect"[\s\S]*authorization[\s\S]*token[\s\S]*new-api-user/.test(html), '鉴权字段应使用包含三种选项的下拉框');
assert(/id="authHeaderValueInput"/.test(html), '单站点配置页应提供鉴权字段值输入框');
assert(!/错误提示/.test(siteFormHtml), '单站点配置页初始不应显示“错误提示”文案');

assert(!/id="createModePanel"|id="editModePanel"/.test(siteFormHtml), '单站点配置页不应再保留新增/编辑两套表单面板');

const addSiteJs = fs.readFileSync(path.join(projectRoot, 'src/pages/add-site.js'), 'utf8');
assert(!/button\.innerHTML\s*=\s*`[\s\S]*\$\{site\.name\}/.test(addSiteJs), '站点列表不应通过 innerHTML 拼接站点名称');
assert(!/button\.innerHTML\s*=\s*`[\s\S]*\$\{site\.fieldPath/.test(addSiteJs), '站点列表不应通过 innerHTML 拼接监控字段');

assert(advancedSectionMatch, '配置页应提供高级配置区域');
const advancedHtml = advancedSectionMatch ? advancedSectionMatch[0] : '';
assert(/id="rawValueSection"[\s\S]*id="fetchRawValueBtn"[\s\S]*id="rawValueText"[\s\S]*id="finishSiteConfigBtn"/.test(html), '原值行应按方案 B 同时包含访问接口、原值展示和完成配置按钮');
assert(/id="advancedSettingsToggle"[\s\S]*点击展开高级设置/.test(html), '高级配置应提供默认收起的展开入口');
assert(/id="advancedSettingsPanel"[^>]*hidden/.test(html), '高级配置面板应默认收起');
assert(/id="calculationExpressionInput"/.test(html), '页面应提供输出公式输入框');
assert(/id="testCalculationBtn"/.test(html), '页面应提供测试计算按钮');
assert(/id="calculatedValueText"/.test(html), '页面应提供计算结果展示');
assert(!/A\/500000/.test(advancedHtml), '页面不应再提供 A/500000 快捷公式');
assert(!/180-A/.test(advancedHtml), '页面不应再提供 180-A 快捷公式');
assert(!/id="finishAddSiteBtn"/.test(html), '统一单页表单不应再使用旧完成按钮 id');
assert(!/id="divideByInput"/.test(html), '页面不应再提供 divideByInput');
assert(!/id="skipCalculationBtn"|不需要/.test(html), '页面不应再提供“不需要”按钮');

console.log('task-add-site-ui.test.js passed');
