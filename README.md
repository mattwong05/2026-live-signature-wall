# 2026-大屏

一个面向会场场景的局域网签名墙系统。服务启动后监听 `0.0.0.0:8000`，对外提供签名页、大屏页和管理页。签名会以真实笔迹和时间节奏在大屏中央回放，并在完成后进入动态背景。

## 功能

- `/sign`：签名页，固定标题“我承诺：”，随机展示 1 条宣誓文案，并提供签名框、提交、重置
- `/sign`：手机端点击签名框后，可进入页面内的旋转 90 度宽屏签名模式，在竖屏页面中获得真正宽大于高的签名工作区
- `/screen`：大屏页，按提交顺序依次回放签名
- `/admin`：管理页，可设置本机 IP、生成签名页二维码、上传背景图、清空签名、编辑大屏标题、维护宣誓文案列表
- `/admin`：管理页还可显示签名数量，并将所有签名导出为透明背景 PNG 压缩包
- `/admin`：管理页顶部可触发“结束签名”动画，让大屏中的所有签名向中心汇聚并白光爆发收场
- Windows 打包产物改为文件夹形式，主程序为 `signature-wall.exe`
- 启动 Windows `.exe` 后，会自动打开 `/admin` 和 `/screen`
- 使用 `SQLite` 持久保存完整签名轨迹与后台配置
- 使用 `WebSocket` 向大屏实时通知新签名提交和后台配置变更
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
- `PUT /api/admin/config/pledges`
- `GET /api/admin/background-image`
- `POST /api/admin/background-image`
- `DELETE /api/admin/background-image`
- `GET /api/admin/sign-qr.svg`
- `DELETE /api/admin/signatures`
- `GET /api/admin/signatures/export`
- `POST /api/admin/end-sequence`
- `GET /api/sign-config`
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
- 管理页触发“结束签名”后，大屏会让所有签名向中心收束、融合成白色光点，并最终爆发为全屏白光
- 结束签名动画的汇聚阶段会逐渐加速，中心光点保持更小、更凝聚的能量感
- 中心光点会从几乎不可见的小半径开始生成，并在汇聚过半后才明显出现；白光扩散阶段采用更平滑的冲击波过渡
- 结束签名动画在汇聚阶段会重新按笔迹回放每个签名，长签名会自动加速，以便在收束到中心前完成

## 管理页行为

- 设置本机局域网 IP 后，会生成签名页 `/sign` 的二维码
- 可以直接编辑大屏标题内容
- 可以维护签名端宣誓文案列表，签名页会随机展示其中 1 条
- 上传背景图后，大屏会即时更新底图
- 可以看到当前签名数量，管理页打开期间也会随新签名和清空动作实时刷新
- 管理页页面、静态资源和配置接口已禁用缓存，避免签名数量显示旧值
- 可以导出全部签名，下载为透明背景 PNG 的 zip 压缩包
- 清空签名后，大屏队列和背景签名会立即清空
- 顶部“结束签名”按钮会向大屏发送一次性收场动画指令

## 签名页行为

- 标题固定为“我承诺：”
- 小标题会从后台维护的宣誓文案列表中随机选择 1 条
- 页面加载后会自动尝试进入全屏，并尝试锁定横屏
- 浏览器或系统是否允许横屏锁定，取决于具体设备和浏览器策略
- 无效的“进入横屏全屏”按钮已移除
- 在手机上点击签名框，会打开一个旋转 90 度的宽屏签名工作区；小按钮贴在旋转后画布的一侧，尽可能把空间留给签名区
- 旋转后的宽屏签名框会按当前视口动态铺满可用高度，而不是使用固定保守高度
- 宽屏签名浮层的背景卡片会完整包裹旋转后的签名工作区，避免左侧溢出

## 测试

```bash
uv run pytest -q
```

## 打包为 Windows `.exe`

在 Windows 环境中执行：

```bat
build_windows.bat
```

生成文件夹默认位于：

```text
dist\signature-wall\
```

主程序位于：

```text
dist\signature-wall\signature-wall.exe
```

运行后默认监听：

```text
0.0.0.0:8000
```

启动 `.exe` 后，默认会自动打开：

```text
http://127.0.0.1:8000/admin
http://127.0.0.1:8000/screen
```

如果不希望自动打开浏览器，可设置环境变量：

```text
SIGNATURE_WALL_NO_BROWSER=1
```

## GitHub Actions

项目已提供 Windows 自动构建工作流：

- [windows-build.yml](/Users/matt_wong/Desktop/Processing/2026-大屏/.github/workflows/windows-build.yml)

工作流会：

- 在 Windows runner 上安装依赖
- 运行测试
- 执行 `build_windows.bat`
- 上传 `dist/signature-wall/` 作为 artifact
- 测试已显式关闭 `TestClient`，存储层也会在每次访问后立即关闭 sqlite 连接，避免 Windows 上的文件占用导致构建失败

## 注意事项

- 当前版本按单大屏场景设计，不处理多大屏同步
- 如果 `8000` 端口已被占用，服务会启动失败
- 浏览器是否允许自动全屏和横屏锁定，取决于具体浏览器策略；页面已提供手动全屏按钮
