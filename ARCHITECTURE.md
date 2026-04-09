# Architecture

## Overview

项目采用单进程、单服务、单大屏设计：

- `app.py` 负责启动 FastAPI 服务
- `SQLite` 保存签名轨迹和队列状态
- `SQLite` 同时保存管理配置，例如大屏背景图地址、大屏标题和签名端宣誓文案列表
- `WebSocket` 负责向大屏发送实时提交事件和后台配置事件
- `/sign` 负责采集签名轨迹
- `/screen` 负责队列回放和背景渲染
- `/admin` 负责背景图、局域网 IP、二维码、大屏标题、宣誓文案和签名清空管理
- `/admin` 同时负责签名数量实时展示和透明 PNG 导出
- `/admin` 页面、配置接口与静态资源默认禁用缓存，避免后台展示旧状态
- `/admin` 还能触发一次性结束签名事件，让 `/screen` 播放收场动画

## Request Flow

1. 来宾在 `/sign` 页面使用 `Canvas` 手写签名
2. 签名页启动时读取宣誓文案列表，并随机展示其中一条
3. 前端记录 `strokes -> points(x, y, t)` 并提交到 `/api/signatures`
4. 服务端将签名写入 `SQLite`，状态标记为 `pending`
5. 服务端通过 `/ws/screen` 向大屏通知有新签名进入队列
6. 大屏通过 `/api/signatures/{id}` 拉取完整轨迹并开始中央回放
7. 回放完成后，大屏调用完成接口，将该签名切换为 `background`
8. 背景层持续渲染历史签名，使用无重叠布局，并在边界和彼此之间进行碰撞反弹
9. 如果配置了背景图，大屏会在最底层铺设底图
10. 管理页变更通过 `WebSocket` 事件即时同步到大屏
11. 管理页自身也会监听实时事件，并在必要时重新读取后台配置，避免签名数量显示为旧值
12. 签名页会自动尝试进入全屏并锁定横屏
13. 管理页可将所有签名渲染为透明背景 PNG 并打包导出
14. 管理页触发结束签名后，`/screen` 会打断当前播放，让所有签名以逐渐加速的方式向中心收束；中心光点在后半程才显现，随后用更平滑的白光冲击波覆盖全屏

## Data Model

- 每个签名保存为多段 `strokes`
- 每个点包含 `x`、`y`、`t`
- `t` 使用相对毫秒时间，保证回放保留原始停顿和节奏
- `status` 仅有 `pending` 和 `background`

## Packaging

- 使用 PyInstaller 打包为单文件可执行程序
- 需要把 `signature_wall/static` 和 `signature_wall/templates` 一并带入产物
- Windows 环境产物为 `dist/signature-wall.exe`
