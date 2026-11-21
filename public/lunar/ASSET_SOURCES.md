# 月面资源来源

- `reference-approved.png`：用户在本对话确认的月面营地概念图；用于视觉对照。
- `textures/space-panorama.png`：通过内置 imagegen 生成。提示目标为 2:1 无缝等距柱状全天星空、细小星点、克制的银河和暗尘带；无行星、地平线或地物。实际输出约 1774 × 887，因此当前放大清晰度不足，等待替换。
- `textures/regolith.png`：通过内置 imagegen 生成。提示目标为正交俯视、四边平铺、均匀光照的中性灰月壤，包含细碎玄武岩颗粒，无大岩石、脚印和方向阴影。
- `textures/earth-colour.jpg`：来自 Three.js 示例资源： https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg 。用于地球球面颜色，未把它当作观测数据。
- App 的 `public/draco/`：复制自已安装 Three.js 包 `examples/jsm/libs/draco/gltf/`，用于其 GLTFLoader/DRACOLoader 解码。

## 当前使用的星空（v3 / v4）

- NASA SVS / Ernie Wright, [Deep Star Maps 2020](https://svs.gsfc.nasa.gov/4851/)：`starmap_2020_8k_gal.exr`，8192×4096 全天星图。原始下载地址见 `download_sky.ps1`。此 EXR 大于 GitHub 单文件限制，不加入 Git；重新建模前可运行下载脚本。
- 网页使用 `public/scenes/lunar/deep-sky-8k.jpg`，由 Blender 对上述星图调整方向、亮度后导出。保留完整球面，不含地平线、地球或人物。旧 `space-panorama.png` 仅供历史对照。
- 星图适用于球面环境；当前场景的地球大小、银河朝向和曝光为视觉构图，不是月面实地观测还原。

场景的地形、岩石、设备、座椅和灯具由本目录 Blender 脚本创建。`sky_procedural.py` 的程序化银河方案未使用，仅复用了其中的球面导出工具。
