# Changelog

## [1.3.0] - 2026-06-11

### 新增

- 鉴权字段支持「自定义」模式，可输入任意请求头名称（如 `x-group-id`）
- 鉴权字段支持「动态签名」模式，内置 nekocode.ai 签名算法，自动生成 `X-Timestamp`/`X-Nonce`/`X-Sign`
- 选择动态签名后自动隐藏鉴权值输入框，简化配置流程

### 修复

- 修复 minimaxi.com 因缺少 `x-group-id` 头导致 `available_amount` 返回空字符串的问题
- 修复 nekocode.ai 因缺少动态签名头导致接口返回「未登录」的问题
- 修复扩展跨域请求无法携带 Cookie 的认证问题（declarativeNetRequest 注入）
- 修复带引号的数字字符串无法正确解析的问题

### 重构

- 将 cookie 注入和请求逻辑统一到 `site-config-shared.js`（`createCookieInjector` + `fetchJsonWithAuth`）
- 消除 popup/add-site/auto-refresh 三处重复的 fetch 实现

## [1.2.1] - 2026-06-10

### 修复

- 使用 declarativeNetRequest 注入 Cookie 解决认证问题
- 支持带引号的数字字符串解析

## [1.2.0] - 2026-04-29

### 新增

- 面向发布的 README（安装方式、权限、隐私和配置说明）
- MIT License
- 清理仓库目录，便于公开发布
