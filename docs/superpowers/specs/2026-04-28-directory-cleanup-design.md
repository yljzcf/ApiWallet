# 009 Chrome 扩展目录整理设计

## 背景

`009_chromeExt` 已初始化为独立 Git 仓库，但根目录同时放置扩展入口、共享脚本、公开配置、测试文件、工作日志和本机临时文件，后续多轮开发时不利于定位文件与管理提交。用户希望清理无用文件、保留测试能力，并进行更深度的目录整理。

## 目标

- 根目录只保留项目级入口和元信息：`manifest.json`、`.gitignore`、`icons/`、`docs/`、`worklog/`、`src/`、`tests/`。
- 将扩展页面与共享代码移动到 `src/` 下，按职责分组。
- 将现有 `task-*.test.js` 全部移动到 `tests/`，继续作为回归测试保留。
- 删除确认无用的本机临时文件和公开配置副本。
- 不改业务逻辑，不重构函数，不改变功能行为。

## 目标结构

```text
009_chromeExt/
  manifest.json
  .gitignore
  src/
    pages/
      popup.html
      popup.js
      add-site.html
      add-site.js
    shared/
      site-config-shared.js
    config/
      site-config.public.json
  tests/
    task-*.test.js
  icons/
  docs/
  worklog/
```

## 文件调整

- `popup.html` → `src/pages/popup.html`
- `popup.js` → `src/pages/popup.js`
- `add-site.html` → `src/pages/add-site.html`
- `add-site.js` → `src/pages/add-site.js`
- `site-config-shared.js` → `src/shared/site-config-shared.js`
- `site-config.public.json` → `src/config/site-config.public.json`
- `task-*.test.js` → `tests/task-*.test.js`
- 删除 `CUsers本地.claudeclaude-notify-signalsstop`
- 删除 `site-config.public - 副本.json`

## 引用更新

- `manifest.json` 的 `action.default_popup` 更新为 `src/pages/popup.html`。
- `src/pages/popup.html` 与 `src/pages/add-site.html` 中的脚本引用改为相对新目录的路径。
- `src/pages/add-site.js` 和 `src/pages/popup.js` 中如有读取 `site-config.public.json` 或页面跳转到 `add-site.html` 的路径，改为新相对路径。
- `tests/task-*.test.js` 中所有读取源码、HTML、配置文件的路径改为新位置。
- 测试运行命令改为遍历 `/e/vscode/009_chromeExt/tests/task-*.test.js`。

## 验证

- `for f in /e/vscode/009_chromeExt/tests/task-*.test.js; do node "$f" || exit 1; done`
- `node --check "/e/vscode/009_chromeExt/src/pages/add-site.js"`
- `node --check "/e/vscode/009_chromeExt/src/pages/popup.js"`
- `node --check "/e/vscode/009_chromeExt/src/shared/site-config-shared.js"`
- `git -C "/e/vscode/009_chromeExt" status --short --branch`

## 提交策略

- 先提交本设计文档。
- 实施完成且验证通过后，再提交目录整理结果。
