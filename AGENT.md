# Agent Workflow

## Scope

本项目用于提供一个本地可打包的局域网签名墙服务。

## Rules

- 所有功能变更必须同步更新 `README.md`、`ROADMAP.md`、`CHANGELOG.md` 和 `VERSION`
- 新功能遵循语义化版本规则，默认新增功能提升次版本号
- 优先保持实现简单，前端尽量使用原生 HTML、CSS、JavaScript
- 默认按单大屏场景实现，不额外引入多屏同步复杂度

## Automation Notes

- 默认服务监听 `8000` 端口
- 本地状态使用 `SQLite` 持久保存
- 大屏实时通知使用 `WebSocket` 事件流
- 管理页可维护大屏背景图配置
- 管理页可维护局域网 IP、签名页二维码和清空签名
- 管理页可维护大屏标题内容
- 打包目标为 Windows 单文件 `.exe`
- 如果未来增加自动化构建，应围绕 PyInstaller 与静态资源打包流程扩展
