# 009 Chrome 扩展目录整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 009 Chrome 扩展整理为清晰的 `src/` + `tests/` 结构，删除已确认无用文件，同时保持现有功能和测试能力不变。

**Architecture:** 根目录保留项目元信息与一级资源目录；扩展页面放入 `src/pages/`，共享逻辑放入 `src/shared/`，公开配置放入 `src/config/`，自动化回归测试放入 `tests/`。本次只移动文件和更新路径引用，不重构业务逻辑。

**Tech Stack:** Chrome Extension Manifest V3、原生 JavaScript、Node.js `vm` 测试、Git。

---

## Context

`009_chromeExt` 当前根目录包含扩展页面、脚本、配置、测试、日志和本机临时文件。用户确认：测试文件移动保留；无用文件直接删除；采用深度整理，把页面与脚本移入 `src/`，测试移入 `tests/`。设计文档已提交到 `docs/superpowers/specs/2026-04-28-directory-cleanup-design.md`。

## File Structure

**Create directories:**
- `E:/vscode/009_chromeExt/src/pages/` — Chrome 扩展页面 HTML 与页面脚本。
- `E:/vscode/009_chromeExt/src/shared/` — 页面共用逻辑。
- `E:/vscode/009_chromeExt/src/config/` — 可公开提交的初始配置。
- `E:/vscode/009_chromeExt/tests/` — Node 回归测试。

**Move:**
- `popup.html` → `src/pages/popup.html`
- `popup.js` → `src/pages/popup.js`
- `add-site.html` → `src/pages/add-site.html`
- `add-site.js` → `src/pages/add-site.js`
- `site-config-shared.js` → `src/shared/site-config-shared.js`
- `site-config.public.json` → `src/config/site-config.public.json`
- `task-*.test.js` → `tests/task-*.test.js`

**Delete:**
- `CUsers本地.claudeclaude-notify-signalsstop`
- `site-config.public - 副本.json`

**Modify:**
- `manifest.json` — `action.default_popup` 指向 `src/pages/popup.html`。
- `src/pages/popup.html` — 脚本引用改为 `../shared/site-config-shared.js` 和 `popup.js`。
- `src/pages/add-site.html` — 脚本引用改为 `../shared/site-config-shared.js` 和 `add-site.js`。
- `src/pages/popup.js` — 打开配置页路径保持同目录相对路径 `add-site.html`；如测试断言需同步。
- `tests/task-*.test.js` — 使用 `projectRoot = path.resolve(__dirname, '..')` 后读取 `src/...`。
- `.gitignore` — 移除已删除本机文件规则，保留敏感和产物忽略规则。
- `worklog/2026-04-29.md` — 记录整理与验证结果。

### Task 1: Move Files Into Target Structure

**Files:**
- Create directories listed above
- Move files listed above
- Delete files listed above

- [ ] **Step 1: Create target directories**

Run:

```bash
mkdir -p "/e/vscode/009_chromeExt/src/pages" "/e/vscode/009_chromeExt/src/shared" "/e/vscode/009_chromeExt/src/config" "/e/vscode/009_chromeExt/tests"
```

Expected: exit code `0`.

- [ ] **Step 2: Move page and shared files**

Run:

```bash
mv "/e/vscode/009_chromeExt/popup.html" "/e/vscode/009_chromeExt/src/pages/popup.html" && mv "/e/vscode/009_chromeExt/popup.js" "/e/vscode/009_chromeExt/src/pages/popup.js" && mv "/e/vscode/009_chromeExt/add-site.html" "/e/vscode/009_chromeExt/src/pages/add-site.html" && mv "/e/vscode/009_chromeExt/add-site.js" "/e/vscode/009_chromeExt/src/pages/add-site.js" && mv "/e/vscode/009_chromeExt/site-config-shared.js" "/e/vscode/009_chromeExt/src/shared/site-config-shared.js" && mv "/e/vscode/009_chromeExt/site-config.public.json" "/e/vscode/009_chromeExt/src/config/site-config.public.json"
```

Expected: exit code `0`.

- [ ] **Step 3: Move tests**

Run:

```bash
mv /e/vscode/009_chromeExt/task-*.test.js "/e/vscode/009_chromeExt/tests/"
```

Expected: exit code `0`.

- [ ] **Step 4: Delete confirmed useless files**

Run:

```bash
rm -f "/e/vscode/009_chromeExt/CUsers本地.claudeclaude-notify-signalsstop" "/e/vscode/009_chromeExt/site-config.public - 副本.json"
```

Expected: exit code `0`.

### Task 2: Update Runtime Paths

**Files:**
- Modify: `E:/vscode/009_chromeExt/manifest.json`
- Modify: `E:/vscode/009_chromeExt/src/pages/popup.html`
- Modify: `E:/vscode/009_chromeExt/src/pages/add-site.html`

- [ ] **Step 1: Update manifest popup path**

Replace in `manifest.json`:

```json
"default_popup": "popup.html"
```

with:

```json
"default_popup": "src/pages/popup.html"
```

- [ ] **Step 2: Update popup script paths**

Replace in `src/pages/popup.html`:

```html
<script src="site-config-shared.js"></script>
<script src="popup.js"></script>
```

with:

```html
<script src="../shared/site-config-shared.js"></script>
<script src="popup.js"></script>
```

- [ ] **Step 3: Update add-site script paths**

Replace in `src/pages/add-site.html`:

```html
<script src="site-config-shared.js"></script>
<script src="add-site.js"></script>
```

with:

```html
<script src="../shared/site-config-shared.js"></script>
<script src="add-site.js"></script>
```

### Task 3: Update Test Paths

**Files:**
- Modify: all `E:/vscode/009_chromeExt/tests/task-*.test.js`

- [ ] **Step 1: Update direct root reads in UI tests**

In `tests/task-popup-ui.test.js`, add after `const path = require('path');`:

```js
const projectRoot = path.resolve(__dirname, '..');
```

Then replace:

```js
path.join(__dirname, 'popup.html')
path.join(__dirname, 'popup.js')
path.join(__dirname, 'site-config.public.json')
'<script src="site-config-shared.js"></script>'
/<script src="site-config-shared\.js"><\/script>[\s\S]*<script src="popup\.js"><\/script>/
chrome\.tabs\.create\(\{\s*url:\s*'add-site\.html'\s*\}\);
```

with:

```js
path.join(projectRoot, 'src/pages/popup.html')
path.join(projectRoot, 'src/pages/popup.js')
path.join(projectRoot, 'src/config/site-config.public.json')
'<script src="../shared/site-config-shared.js"></script>'
/<script src="\.\.\/shared\/site-config-shared\.js"><\/script>[\s\S]*<script src="popup\.js"><\/script>/
chrome\.tabs\.create\(\{\s*url:\s*'add-site\.html'\s*\}\);
```

In `tests/task-add-site-ui.test.js`, add `projectRoot`, then replace root reads with:

```js
path.join(projectRoot, 'src/pages/add-site.html')
path.join(projectRoot, 'src/pages/add-site.js')
```

- [ ] **Step 2: Update VM tests reading popup.js and shared code**

For these files:

```text
tests/task-compact-layout.test.js
tests/task-yybb-diagnostics.test.js
tests/task-click-refresh.test.js
tests/task-demo-cards.test.js
tests/task-site-config-state.test.js
```

Add after `const path = require('path');` if missing:

```js
const projectRoot = path.resolve(__dirname, '..');
```

Replace reads:

```js
path.join(__dirname, 'site-config-shared.js')
path.join(__dirname, 'popup.js')
```

with:

```js
path.join(projectRoot, 'src/shared/site-config-shared.js')
path.join(projectRoot, 'src/pages/popup.js')
```

- [ ] **Step 3: Update VM tests reading add-site.js and shared code**

For these files:

```text
tests/task-import-export.test.js
tests/task-add-site-flow.test.js
```

Add after `const path = require('path');` if missing:

```js
const projectRoot = path.resolve(__dirname, '..');
```

Replace reads:

```js
path.join(__dirname, 'site-config-shared.js')
path.join(__dirname, 'add-site.js')
```

with:

```js
path.join(projectRoot, 'src/shared/site-config-shared.js')
path.join(projectRoot, 'src/pages/add-site.js')
```

- [ ] **Step 4: Update shared-only and source scan tests**

In `tests/task-formula-calculation.test.js`, add `projectRoot`, then replace:

```js
path.join(__dirname, 'site-config-shared.js')
```

with:

```js
path.join(projectRoot, 'src/shared/site-config-shared.js')
```

In `tests/task-no-builtin-sites.test.js`, add `projectRoot`, then replace source file list with:

```js
const sourceFiles = [
  'src/pages/popup.js',
  'src/pages/add-site.js',
  'src/shared/site-config-shared.js'
];
```

and ensure reads use:

```js
fs.readFileSync(path.join(projectRoot, file), 'utf8')
```

### Task 4: Update Ignore Rules and Worklog

**Files:**
- Modify: `E:/vscode/009_chromeExt/.gitignore`
- Create/Modify: `E:/vscode/009_chromeExt/worklog/2026-04-29.md`

- [ ] **Step 1: Simplify `.gitignore`**

Replace `.gitignore` content with:

```gitignore
site-config.archive.json
site-config.private.json
.env
.env.*
*.pem
*.key
node_modules/
dist/
build/
coverage/
.DS_Store
Thumbs.db
```

- [ ] **Step 2: Write worklog entry**

Create or append `worklog/2026-04-29.md` with:

```markdown
# 2026-04-29

## 目录整理与无用文件清理

目标：清理 009 Chrome 扩展根目录，把页面、共享脚本、公开配置和测试文件按职责归档，便于后续持续开发与 commit 存档。

### 改动清单

- 将页面文件移动到 `src/pages/`。
- 将共享脚本移动到 `src/shared/`。
- 将公开配置移动到 `src/config/`。
- 将 `task-*.test.js` 移动到 `tests/` 并更新测试读取路径。
- 删除本机临时文件和公开配置副本。
- 更新 `manifest.json` 与页面脚本引用路径。

### 验证结果

待执行后补充实际命令结果。

### 简短复盘

- 值得保留：先建立 Git 基线后再整理目录，移动和删除都能通过 Git 清晰追踪。
- 可以优化：后续新增测试时直接放入 `tests/`，新增共享逻辑直接放入 `src/shared/`，避免根目录再次膨胀。
```

### Task 5: Verify and Commit

**Files:**
- All moved/modified files

- [ ] **Step 1: Run path search to catch stale references**

Run:

```bash
grep -R "path.join(__dirname, 'popup.html')\|path.join(__dirname, 'popup.js')\|path.join(__dirname, 'add-site.js')\|path.join(__dirname, 'site-config-shared.js')\|path.join(__dirname, 'site-config.public.json')\|<script src=\"site-config-shared.js\"\|\"default_popup\": \"popup.html\"" "/e/vscode/009_chromeExt" --exclude-dir=.git || true
```

Expected: no stale root-path references.

- [ ] **Step 2: Run all tests from new tests directory**

Run:

```bash
for f in /e/vscode/009_chromeExt/tests/task-*.test.js; do node "$f" || exit 1; done
```

Expected: all tests print `passed`; `task-click-refresh.test.js` may print the expected divide-by-zero error log and still pass.

- [ ] **Step 3: Run syntax checks in new source locations**

Run:

```bash
node --check "/e/vscode/009_chromeExt/src/pages/add-site.js" && node --check "/e/vscode/009_chromeExt/src/pages/popup.js" && node --check "/e/vscode/009_chromeExt/src/shared/site-config-shared.js"
```

Expected: no output and exit code `0`.

- [ ] **Step 4: Fill worklog verification results**

Replace `待执行后补充实际命令结果。` in `worklog/2026-04-29.md` with:

```markdown
已通过：

- `grep -R "path.join(__dirname, 'popup.html')\|path.join(__dirname, 'popup.js')\|path.join(__dirname, 'add-site.js')\|path.join(__dirname, 'site-config-shared.js')\|path.join(__dirname, 'site-config.public.json')\|<script src=\"site-config-shared.js\"\|\"default_popup\": \"popup.html\"" "/e/vscode/009_chromeExt" --exclude-dir=.git || true`
- `for f in /e/vscode/009_chromeExt/tests/task-*.test.js; do node "$f" || exit 1; done`
- `node --check "/e/vscode/009_chromeExt/src/pages/add-site.js" && node --check "/e/vscode/009_chromeExt/src/pages/popup.js" && node --check "/e/vscode/009_chromeExt/src/shared/site-config-shared.js"`
```

- [ ] **Step 5: Review Git status**

Run:

```bash
git -C "/e/vscode/009_chromeExt" status --short --branch
```

Expected: moves/deletions/modifications are visible; no unexpected untracked local files.

- [ ] **Step 6: Commit directory cleanup**

Run:

```bash
git -C "/e/vscode/009_chromeExt" add -A && git -C "/e/vscode/009_chromeExt" commit -m "$(cat <<'EOF'
chore: organize extension project structure

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

- [ ] **Step 7: Final clean status**

Run:

```bash
git -C "/e/vscode/009_chromeExt" status --short --branch
```

Expected: clean working tree.
