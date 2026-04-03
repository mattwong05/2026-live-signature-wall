# 2026-大屏

一个面向会场场景的局域网签名墙系统。服务启动后监听 `0.0.0.0:8000`，对外提供签名页和大屏页，签名会以真实笔迹和时间节奏在大屏中央回放，并在完成后进入动态背景。

## 功能

- `/sign`：签名页，只提供签名框、提交、重置
- `/screen`：大屏页，按提交顺序依次回放签名
- `/admin`：管理页，可设置本机 IP、生成签名页二维码、上传背景图、清空签名
- `/admin`：管理页，可设置本机 IP、生成签名页二维码、上传背景图、清空签名、编辑大屏标题
- 使用 `SQLite` 持久保存完整签名轨迹
- 使用 `WebSocket` 向大屏实时通知新签名提交
- 支持打包为 Windows `.exe`

## 项目结构

```text
app.py                         本地服务启动入口
signature_wall/main.py         FastAPI 应用与接口
signature_wall/storage.py      SQLite 存储与队列状态
signature_wall/templates/      页面模板
signature_wall/static/         前端脚本与样式
tests/test_app.py              基础 API 测试
build_windows.bat              Windows 打包脚本
```

## 本地运行

项目使用 `uv` 管理 Python 环境与依赖。建议直接使用 `uv`：

```bash
uv venv
source .venv/bin/activate
uv pip install -e ".[dev]"
uv run python app.py
```

启动后访问：

```text
签名页：http://127.0.0.1:8000/sign
大屏页：http://127.0.0.1:8000/screen
管理页：http://127.0.0.1:8000/admin
```

如果需要局域网访问，把 `127.0.0.1` 替换为服务所在电脑的内网 IP。

## 页面与接口

页面：

- `/sign`
- `/screen`
- `/admin`

API：

- `POST /api/signatures`
- `GET /api/signatures/{id}`
- `GET /api/screen-state`
- `POST /api/signatures/{id}/complete`
- `GET /api/admin/config`
- `PUT /api/admin/config/ip`
- `PUT /api/admin/config/title`
- `GET /api/admin/background-image`
- `POST /api/admin/background-image`
- `DELETE /api/admin/background-image`
- `GET /api/admin/sign-qr.svg`
- `DELETE /api/admin/signatures`
- `WS /ws/screen`

## 数据说明

签名按轨迹保存，而不是保存为一张图片。每个点包含：

- `x`
- `y`
- `t`

其中 `t` 是相对时间戳，单位为毫秒，用于大屏按真实书写速度和停顿回放。

## 大屏行为

- 页面加载后会自动尝试进入浏览器全屏模式
- 如果浏览器策略拦截自动全屏，可点击页面左上角“进入全屏”
- 当没有签名正在中央回放时，背景签名会进入更活跃、更清晰的展示状态
- 背景签名之间不会相互重叠，尺寸会随着数量和占用面积自动缩放
- 背景签名会像屏保一样在边界和彼此之间发生碰撞反弹
- 如果已在管理页设置背景图，大屏会在最底层显示该图片
- 背景签名现在按各自真实笔迹包围盒生成，避免有些签名缩得异常小

## 管理页行为

- 设置本机局域网 IP 后，会生成签名页 `/sign` 的二维码
- 可以直接编辑大屏标题内容
- 上传背景图后，大屏会即时更新底图
- 清空签名后，大屏队列和背景签名会立即清空

## 测试

```bash
uv run pytest -q
```

## 打包为 Windows `.exe`

在 Windows 环境中执行：

```bat
build_windows.bat
```

生成文件默认位于：

```text
dist\signature-wall.exe
```

运行后默认监听：

```text
0.0.0.0:8000
```

## 注意事项

- 当前版本按单大屏场景设计，不处理多大屏同步
- 如果 `8000` 端口已被占用，服务会启动失败
- 浏览器是否允许自动全屏取决于具体浏览器策略；页面已提供手动全屏按钮
