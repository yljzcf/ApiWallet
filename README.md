# ApiWallet - 钱包看板

ApiWallet 是一个 Chrome Manifest V3 扩展，用于在浏览器本地创建多站点数据看板。它复用当前浏览器登录态和本地配置，从指定接口读取余额、额度或其他数值，并在 popup 面板中集中展示。

## 功能特性

- 多站点数据看板
- 自定义接口地址和字段路径
- 支持 JSON 接口取值
- 支持简单公式计算，例如 `X/500000`
- 支持站点导入与导出
- 支持卡片排序、分组和布局切换
- 支持绿色主题与后台自动刷新

## 安装方式

1. 下载或克隆本仓库。
2. 打开 Chrome，访问 `chrome://extensions/`。
3. 打开右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本项目根目录。
6. 点击工具栏中的扩展图标打开看板。

## 权限说明

本扩展在 `manifest.json` 中声明以下权限：

- `storage`：保存站点配置、看板数据、布局偏好和自动刷新设置。
- `alarms`：用于后台定时刷新。
- `cookies`：读取浏览器 Cookie 并注入到接口请求中，解决扩展跨域请求无法携带 SameSite Cookie 的问题。
- `<all_urls>`：允许用户自行配置任意站点接口并发起请求。

## 隐私说明

- 扩展数据保存在浏览器本地 `chrome.storage.local`。
- 本仓库不包含任何私有 token、Cookie 或接口密钥。
- 扩展请求用户配置的接口时，会使用浏览器当前登录态。
- 导出配置时请自行检查是否包含敏感请求头。
- 请不要把私人配置、token、Cookie 或接口密钥提交到 GitHub。

## 配置说明

公开配置示例位于 `src/config/site-config.public.json`。默认应保持空数组或不含私人站点信息。

站点配置通常包含：

- 站点名称
- 接口地址
- 字段路径，例如 `data.balance`
- 鉴权 Header，例如 `authorization`、`token`、`new-api-user`
- 公式表达式，例如 `X/500000`

## 目录结构

```text
.
├── manifest.json
├── README.md
├── LICENSE
├── icons/
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
└── src/
    ├── background/
    │   └── auto-refresh.js
    ├── config/
    │   └── site-config.public.json
    ├── pages/
    │   ├── add-site.html
    │   ├── add-site.js
    │   ├── popup.html
    │   └── popup.js
    └── shared/
        └── site-config-shared.js
```

## License

MIT License. See [LICENSE](LICENSE) for details.
