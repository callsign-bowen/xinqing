# AI 页 3D 窗口整合

2026-11-19，按用户澄清后的要求实现。

- 保留首页、情绪、AI、我的原有页面样式、底部导航和原数据。
- 不挂载陪伴舱及全屏月面外壳，不移动四页 DOM，不改变聊天消息和输入框。
- AI 顶部新增「3D」按钮，菜单提供森林营地、水彩海底、安静窗边、月面观星、温暖卧室。
- 选择后在 AI 顶部的小窗口内加载真实 3D；支持切换、归位、打招呼、关闭和加载失败重试。
- 页面或浏览器后台暂停渲染；关闭、切换时卸载旧场景。主页面与场景消息只接受同源且来自当前 iframe 的消息。

## 运行文件

`web/features/scene-window/` 负责 AI 页内的入口和生命周期。`scene-runtime/viewer.html` 为隔离的场景窗口；`scene-runtime/web/`、`forest/`、`bedroom/` 和必要的森林资源从 CBT初版复制，依赖清单在 `scene-runtime/import-manifest.json`。原项目未修改。

`tools/import-scene-runtime.mjs` 记录本次依赖提取方式。复制的森林营地模型约 153 MB，保持原模型；仅在选择森林时加载。

构建包含主页和三个场景窗口入口。正常启动仍为 `npm run dev`，地址 `http://127.0.0.1:5174/`，AI 后端沿用当前项目的 3001 端口。

## 验证

`npm run build` 通过；现有 182 项测试通过，日志在 `tmp/ai-scene-window-tests.log`。界面验证截图保存于 `screenshots/`。

五个场景均已在页内窗口实际加载，含森林与卧室的原始嵌入式渲染。首页、情绪、我的仍显示原页面；来回切换后聊天消息和输入内容一致。关闭窗口后场景 iframe 数量为 0，页面没有挂载全屏 3D 外壳。构建日志在 `tmp/ai-scene-window-build.log`。

开发配置预先优化五个场景使用的 Three.js 依赖，避免首次选择场景导致 Vite 刷新主页面。
