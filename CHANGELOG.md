# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [Unreleased]

### Added
- None.

### Changed
- None.

### Fixed
- None.

### Removed
- None.

## [0.12.0] - 2026-04-09

### Added
- 新增 GitHub Actions Windows 构建工作流。
- Windows 程序启动后会自动打开 `/admin` 和 `/screen`。

### Changed
- Windows 打包从单文件 `.exe` 改为文件夹版 `dist/signature-wall/` 产物。
- 打包脚本改为生成目录版可执行程序，并在构建前清理旧的 `build/` 与 `dist/`。

### Fixed
- None.

### Removed
- None.

## [0.11.0] - 2026-04-09

### Added
- 结束签名动画的汇聚阶段会重新回放每个签名的笔迹。

### Changed
- 长签名在结束动画中会自动加速回放，以便在汇聚消失前完成。

### Fixed
- 修复手机端旋转签名浮层背景卡片未完整包裹工作区、左侧可能溢出的问题。

### Removed
- None.

## [0.10.3] - 2026-04-09

### Added
- None.

### Changed
- 手机端旋转签名浮层改为按当前视口动态计算工作台尺寸。

### Fixed
- 修复旋转签名模式下签名框没有占满可用高度的问题。

### Removed
- None.

## [0.10.2] - 2026-04-09

### Added
- None.

### Changed
- 手机端宽屏签名模式改为仅在旋转后画布的一侧放置小型操作按钮。
- 删除宽屏签名模式中的额外提示文案，把更多空间留给签名区。

### Fixed
- 进一步减少宽屏签名模式中控制元素对签名区可用空间的占用。

### Removed
- 删除提示文案“页面保持竖屏，签名区旋转为横向宽画布。”

## [0.10.1] - 2026-04-09

### Added
- None.

### Changed
- 手机端宽屏签名模式改为将签名工作区直接旋转 90 度显示。
- 宽屏签名模式的操作控件改到左右两侧，不再占用签名框高度。

### Fixed
- 优化手机端宽屏签名模式的真实宽高体验，使签名区在竖屏页面中也能保持宽大于高。
- 修正旋转后的签名坐标映射，保证笔迹与手势方向一致。

### Removed
- None.

## [0.10.0] - 2026-04-09

### Added
- 手机端点击签名框后，可进入页面内的宽屏签名模式。
- 宽屏签名模式包含独立的宽画布、返回、重置和提交操作。

### Changed
- 签名页前端改为使用归一化坐标记录笔迹，便于在普通签名框和宽屏签名浮层之间共享同一份笔迹数据。
- 手机端即使没有真正横屏，也能在宽大于高的签名区完成签名。

### Fixed
- 修复手机直接横屏时，签名框仍会被其他页面内容挤压、无法完整展示的问题。

### Removed
- None.

## [0.9.2] - 2026-04-09

### Added
- None.

### Changed
- 结束签名动画的汇聚初速度提高，同时继续保持后段加速。
- 中心光点改为从几乎不可见的半径逐步生成，并在汇聚过半后才明显可见。
- 白光扩散阶段改为更长、更平滑的冲击波式过渡。

### Fixed
- 缓解结束签名动画中白光扩散阶段不够丝滑的视觉跳变感。

### Removed
- None.

## [0.9.1] - 2026-04-09

### Added
- None.

### Changed
- 结束签名动画的汇聚阶段改为逐渐加速。
- 中心能量点缩小为更凝聚的小光点，并使用更柔和的能量渐变。
- 白光爆发阶段的过渡进一步平滑，整体动画更顺。

### Fixed
- None.

### Removed
- None.

## [0.9.0] - 2026-04-09

### Added
- 管理页顶部新增“结束签名”按钮。
- 新增 `POST /api/admin/end-sequence`，用于向大屏广播结束签名动画事件。

### Changed
- 大屏收到结束签名事件后，会让所有签名向中心汇聚、缩小、融合成白色光点，并最终爆发成全屏白光。
- 结束签名事件会打断当前正在进行的中央签名回放。

### Fixed
- None.

### Removed
- None.

## [0.8.2] - 2026-04-09

### Added
- None.

### Changed
- 管理页模板、静态资源和 `/api/admin/config` 配置接口统一添加了禁用缓存响应头。

### Fixed
- 修复浏览器继续使用旧版管理页资源时，“当前签名数量”可能长期停留在 `0` 的问题。

### Removed
- None.

## [0.8.1] - 2026-04-09

### Added
- None.

### Changed
- 管理页会在接收到新签名、清空签名和配置变更事件后主动刷新后台配置，并增加周期性兜底刷新。

### Fixed
- 修复管理页中的“当前签名数量”可能停留在旧值的问题。
- 修复管理页可能因浏览器缓存而读取到过期签名数量的问题。

### Removed
- None.

## [0.8.0] - 2026-04-09

### Added
- 管理页支持显示当前签名数量。
- 管理页支持将全部签名导出为透明背景 PNG 的 zip 压缩包。

### Changed
- 签名页移除了无效的“进入横屏全屏”按钮。

### Fixed
- None.

### Removed
- 删除签名页的“进入横屏全屏”按钮。

## [0.7.0] - 2026-04-09

### Added
- 管理页支持维护签名端宣誓文案列表。
- 新增签名端配置接口，供 `/sign` 拉取宣誓文案。

### Changed
- 签名页标题改为“我承诺：”。
- 签名页小标题改为从后台宣誓文案列表中随机选择一条展示。
- 签名页加载后会自动尝试进入全屏并锁定横屏。

### Fixed
- None.

### Removed
- None.

## [0.6.1] - 2026-04-03

### Added
- None.

### Changed
- 背景签名亮度与发光效果继续增强。
- 背景签名整体移动速度进一步放慢。

### Fixed
- 删除播放期间的副标题文案“正在中央回放最新签名”。

### Removed
- None.

## [0.6.0] - 2026-04-03

### Added
- 管理页支持编辑大屏标题内容。

### Changed
- 背景签名改为无重叠布局，尺寸会随着数量和已占区域动态调整。
- 背景签名现在支持边界碰撞和相互碰撞，移动更明显。
- 删除空闲态下的大屏副标题提示文案。

### Fixed
- None.

### Removed
- 删除空闲态提示文案“空闲时背景签名会切换为活跃展示”。

## [0.5.0] - 2026-04-03

### Added
- None.

### Changed
- 大屏空闲态下，背景签名现在会以更接近中央播放的亮度显示，并使用更明显的位移和缩放变化。

### Fixed
- 修复签名中夹带单点 stroke 时，背景层可能只剩一个小点的问题。

### Removed
- None.

## [0.4.1] - 2026-04-03

### Added
- None.

### Changed
- None.

### Fixed
- 修复单点签名在大屏背景层中因点半径过小而几乎不可见的问题。

### Removed
- None.

## [0.4.0] - 2026-04-03

### Added
- 管理页支持设置本机局域网 IP 并生成签名页二维码。
- 管理页支持一键清空全部签名。
- 新增管理配置接口与签名页二维码 SVG 接口。

### Changed
- 背景签名改为按真实笔迹包围盒生成，避免个别签名在背景中显示得异常小。
- 管理页操作会通过 WebSocket 即时同步到大屏。

### Fixed
- 修复背景层中部分签名缩得过小的问题。

### Removed
- None.

## [0.3.0] - 2026-04-03

### Added
- 管理页面 `/admin`，支持上传和清除大屏背景图。
- 背景图配置接口，支持保存并恢复当前大屏底图。
- 大屏全屏按钮，并在页面加载后自动尝试进入全屏。

### Changed
- 大屏在空闲时将历史签名切换为更清晰、更明显的活跃展示状态。
- 大屏状态接口现在返回背景图地址。

### Fixed
- None.

### Removed
- None.

## [0.2.2] - 2026-04-03

### Added
- None.

### Changed
- None.

### Fixed
- 修复 `/sign` 页面重置后右侧残留未清空的问题，清屏改为覆盖画布真实像素区域。

### Removed
- None.

## [0.2.1] - 2026-04-03

### Added
- None.

### Changed
- README 和 CONTRIBUTING 改为 `uv` 环境与依赖管理说明。

### Fixed
- 修复 `/sign` 页面在触摸设备上的签名坐标偏移问题。
- 限制签名页触摸手势，避免落笔时页面缩放和误触滚动。

### Removed
- None.

## [0.2.0] - 2026-04-03

### Added
- 局域网签名页 `/sign`，支持鼠标和触摸手写签名、重置和提交。
- 大屏页 `/screen`，支持按提交顺序回放签名，并把已完成签名加入动态背景。
- SQLite 持久化存储，用于保存签名轨迹、提交顺序和背景恢复状态。
- WebSocket 实时事件通知，用于在单大屏场景下即时接收新签名。
- API 与测试用例，覆盖签名提交、读取、状态快照和完成回写。

### Changed
- 服务实现从 Python 标准库 HTTP 服务器升级为 FastAPI 应用结构。
- Windows 打包脚本更新为包含静态资源和应用依赖的签名墙构建方式。
- 项目文档更新为签名墙局域网部署与运行说明。

### Fixed
- None.

### Removed
- 旧的单页测试网页行为已被正式签名墙流程替代。

## [0.1.0] - 2026-04-03

### Added
- Initial Python HTTP test web service on port 8000.
- Simple test webpage with title and text content.
- Windows `.exe` packaging configuration using PyInstaller.
- Project documentation set including README, roadmap, contributing guide, architecture notes, and agent workflow guidance.

### Changed
- Established project versioning and release process.

### Fixed
- None.

### Removed
- None.
