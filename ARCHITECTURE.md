# Architecture

## Overview

项目采用单进程、单服务、单大屏设计：

- `app.py` 负责启动 FastAPI 服务
- `SQLite` 保存签名轨迹和队列状态
- `SQLite` 同时保存管理配置，例如大屏背景图地址
- `SQLite` 同时保存管理配置，例如大屏背景图地址和大屏标题
- `WebSocket` 负责向大屏发送实时提交事件
- `/sign` 负责采集签名轨迹
- `/screen` 负责队列回放和背景渲染
- `/admin` 负责背景图管理
- `/admin` 同时负责局域网 IP 配置、签名二维码展示和签名清空操作
- `/admin` 同时负责大屏标题编辑

## Request Flow

1. 来宾在 `/sign` 页面使用 `Canvas` 手写签名
2. 前端记录 `strokes -> points(x, y, t)` 并提交到 `/api/signatures`
3. 服务端将签名写入 `SQLite`，状态标记为 `pending`
4. 服务端通过 `/ws/screen` 向大屏通知有新签名进入队列
5. 大屏通过 `/api/signatures/{id}` 拉取完整轨迹并开始中央回放
6. 回放完成后，大屏调用完成接口，将该签名切换为 `background`
7. 背景层持续渲染历史签名的缓慢漂移和缩放动画
8. 如果配置了背景图，大屏会在最底层铺设底图
9. 当没有签名在中央回放时，背景签名进入更强调的活跃展示状态
10. 管理页变更通过 `WebSocket` 事件即时同步到大屏
11. 背景签名使用无重叠布局，并在边界和彼此之间进行碰撞反弹

## Data Model

- 每个签名保存为多段 `strokes`
- 每个点包含 `x`、`y`、`t`
- `t` 使用相对毫秒时间，保证回放保留原始停顿和节奏
- `status` 仅有 `pending` 和 `background`

## Packaging

- 使用 PyInstaller 打包为单文件可执行程序
- 需要把 `signature_wall/static` 和 `signature_wall/templates` 一并带入产物
- Windows 环境产物为 `dist/signature-wall.exe`
