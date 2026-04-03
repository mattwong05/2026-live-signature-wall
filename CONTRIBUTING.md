# Contributing

## Development

- 使用 Python 3.10 或更高版本
- 使用 `uv` 管理环境和依赖
- 初始化环境：`uv venv`
- 安装依赖：`uv pip install -e ".[dev]"`
- 本地运行命令：`uv run python app.py`
- 管理页入口：`/admin`
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
