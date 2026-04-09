# Contributing

## Development

- 使用 Python 3.10 或更高版本
- 使用 `uv` 管理环境和依赖
- 初始化环境：`uv venv`
- 安装依赖：`uv pip install -e ".[dev]"`
- 本地运行命令：`uv run python app.py`
- 管理页入口：`/admin`
- 签名页入口：`/sign`
- 调整管理页统计或导出能力时，确认签名数量会随提交与清空实时刷新
- 调整页面模板或静态资源时，确认管理页相关响应保持禁用缓存
- 修改大屏控制行为时，确认 `/api/admin/end-sequence` 能通过 WebSocket 正确广播到 `/screen`
- 调整结束签名动画时，确认加速汇聚、中心光点和白光爆发三个阶段过渡平滑
- 调整白光扩散阶段时，优先控制爆发时长、冲击波半径曲线和发光开销，避免视觉卡顿
- 修改功能后同步更新版本与文档

## Release Process

1. 根据变更类型更新 `VERSION`
2. 更新 `CHANGELOG.md`
3. 确认 `README.md` 与实际行为一致
4. 运行 `uv run pytest -q`
5. 在 Windows 环境执行 `build_windows.bat` 生成 `.exe`

## Commit Convention

使用 Conventional Commits：

- `feat`
- `fix`
- `docs`
- `refactor`
- `test`
- `chore`
- `style`
