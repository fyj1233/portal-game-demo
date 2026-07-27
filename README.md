# PROJECT_GUIDE

> 本文件供所有智能体（及协作者）快速了解本项目全貌。改动项目结构或重大功能后，请同步更新本文件。

---

## 1. 项目概述

**项目名称**：Portal 传送门游戏 Demo（第一人称 3D 小型演示）

**目的与背景**：
- 用 Three.js 实现一个第一人称视角的"传送门"玩法 Demo：玩家可放置蓝/橙两个传送门，进入其一从另一出来并保持动量与方向；含基础重力、碰撞、可互动物体与解谜关卡。
- 核心约束从一开始就定下：**完全离线、自包含**——不依赖任何外部 CDN / 在线资源，所有依赖（引擎、纹理、关卡数据）都在项目文件夹内，拷到无网环境也能跑。

**技术栈**：Three.js（r159 UMD，本地静态库）+ 原生 HTML/CSS/JS（经典 `<script>`，非 ES module，规避 `file://` 的模块 CORS 限制）。

---

## 2. 已完成的工作记录

| # | 任务 / 模块 | 说明 |
|---|------------|------|
| 1 | 初始 Demo 生成 | 第一人称控制（WASD+鼠标）、传送门放置（左键蓝/右键橙，仅限墙面）、动量守恒传送、重力与 AABB 碰撞、3D 房间、可互动立方体。 |
| 2 | 黑屏修复 | 原 jsdelivr CDN 国内常被墙 → 改用国内镜像多源兜底 → 最终改为**完全离线**（本地 `libs/three.min.js`）。 |
| 3 | 离线化 | Three.js 以经典脚本本地加载；新增 `下载依赖.bat` 联网一次补齐引擎。 |
| 4 | 传送门视角修复 | 传送旋转缺 180° 翻转导致"朝墙里看"；补 `R = 出口×180°×入口⁻¹`，并分解回 yaw/pitch，动量方向同步翻转。 |
| 5 | 场景调亮 + 解谜关卡 | 增强光照（环境光/半球光/太阳光/点光），加后墙高台 + 发光目标，触碰即过关。 |
| 6 | 关卡数据解耦 | 抽出 `levels.json`（`fetch` 加载，含内置 `DEFAULT_LEVEL` 回退），`buildLevel()` 按数据建场景。 |
| 7 | 多关卡 | `levels.json` 改为数组（3 关）；过关按 R 进下一关，末关从头；`levelGroup` 容器整体清理/重建。 |
| 8 | 一键启动脚本 | `start_server.bat`：检查依赖/探测 Python → 起 `python -m http.server` → 自动开浏览器。已修 LF/CRLF 与纯 ASCII 防闪退。 |
| 9 | 视觉美化升级 | 本地纹理（`assets/textures/`，7 张免费图）+ 程序化 Canvas 兜底；渐变天空盒、漂浮尘埃粒子、旋涡传送门（disturb 纹理 + 叠加混合）、电影感暗角。新增 `下载素材.bat` 补/刷纹理。 |
| 10 | 传送门透视角（RTT） | Render-to-Texture 透视：从一门望进看到另一门实时画面；虚拟相机矩阵 = 显示门×180°翻转×源门⁻¹×主相机，每帧渲染到 `WebGLRenderTarget` 贴回门面（两门都在时才开启）。 |
| 11 | 透视畸变 + 性能修复 | 门面改圆形（去 `scale.y=1.4` 椭圆拉伸）；虚拟相机改正方形投影（aspect=1）消除横向挤压畸变；RT 1024²→512²；关闭点光源立方体阴影（每帧 3 遍渲染开销最大项）；纹理升级时 `dispose()` 旧程序化纹理防显存泄漏。 |
| 12 | 全表面放置传送门 | 新增 `portalSurfaces` 表面列表（墙/地面/天花板/平台），射线检测改用它，`placePortal` 去掉冗余 `wall` 形参。解锁经典 Portal 的"垂直↔水平门互换"玩法（地面门 + 墙面门）。 |
| 13 | 新增 2 个 Portal 风格关卡 | `levels.json` 增至 5 关：`隔墙·置换`（中墙挡路，地面门+对面墙门绕过）、`落差·穿行`（高台跳下，地面门+对面墙门落到远端）。均用现有传送机制保证可解。 |
| 14 | 性能再优化（视锥裁剪） | `updatePortalViews` 增加视锥裁剪：只有"显示门"在主相机画面内才渲染其 RT，望向别处时跳过，每帧渲染由固定 3 遍降到"主画面+可见门"；`pixelRatio` 上限 2→1.5；太阳阴影 1024→512；尘埃粒子 900→600。 |
| 15 | 传送门方位退化修复 | 根因：`placePortal` 原用 `lookAt(pos+normal)`，法线竖直（地面/天花板/平台顶底）时 `up=(0,1,0)` 与视线平行 → 退化出 NaN/乱朝向，导致透视与传送后视角"有时不对"。改用 `makePortalBasis()` 显式基矩阵（法线竖直时改水平 `up=(0,0,1)`，Gram-Schmidt 正交化后 `makeBasis+setFromRotationMatrix`）。同时修复透视与传送后 yaw/pitch 朝向。 |
| 16 | 选关功能 | 新增 `#level-select` 面板，按钮由 `levels` 数组动态生成（`buildLevelButtons`），主界面「选择关卡」与暂停菜单「选择关卡」均可进入；点击关卡调用 `loadLevelByIndex(i)` 并重新锁定指针进入。 |
| 17 | 暂停菜单（E/ESC） | 游戏中按 `E` 或 `Esc` 弹 `#pause-menu`（继续/选关/重开本关/返回主界面），**不再直接回主界面**。新增 `isPaused` 标志与 `pauseGame/resumeGame`；`pointerlockchange` 重写为：暂停导致的释放不显示主界面，恢复锁定才清 `isPaused` 并隐藏菜单。暂停时 `updatePlayer` 因 `isLocked=false` 自动冻结。 |
| 18 | 伴侣方块（Companion Cube）模块 | 把装饰绿块升级为可玩道具：`[F]` 拾取/放下，脱手继承玩家速度+向前抛投；自由态受重力与平台 AABB 碰撞（复用玩家解算，`CUBE_HALF=0.35`），并能穿越传送门（复用 `teleport()`，方块无朝向只取 pos/vel）；携带时关闭物理、lerp 跟随相机手持位；瞄准可拾取时自发光高亮+HUD 提示；掉出世界（y<-3）回到出生点。新增 `updateCube/tryGrabCube/dropCube/tryCubeTeleport/setCubeHint`，`animate` 接入 `updateCube(dt)`，`clearLevel` 复位方块状态。 |
| 19 | 性能三连优化 | ① 删除 `ceilLight2/ceilLight3` 两盏 PointLight，fragment shader 灯光数 3→1，ambient 1.15→1.25 + hemi 0.85→0.95 + ceilLight1 1.6→1.9 微补光，视觉基本无差；② `createWall` 与 `platforms` 的 `castShadow` 关掉，仅保留太阳光 + 方块投影，shadow pass 顶点数大幅下降；③ `RT_SIZE` 512→384（传送门面像素工作量 -44%），`portalOnScreen` 视锥球半径 1.8→1.2 精确化，避免边缘门误判多渲一次 RT。 |
| 20 | 传送门透视图 bug 修复 | 用户反馈"有时视界不显示 / 靠近后视角被缩放"。① `portalOnScreen` 视锥球半径 1.2→1.6（1.2 太紧导致边缘门误判裁掉，恢复到接近原 1.8 的余量）；② `RT_SIZE` 384→512 恢复（384 靠近时像素被拉伸看着像"放大"，512 是质量基线）；③ `renderPortalView` 投影矩阵从 `elements[0]=elements[5]` hack 改为 `portalCam.fov/aspect=1/near/far + updateProjectionMatrix()`，与相机模型自洽；④ RT 纹理加 `anisotropy = renderer.capabilities.getMaxAnisotropy()`，斜视时纹理不被拉糊。 |
| 21 | RTT 矩阵公式修正 + FPS 显示 | 用户反馈两门在"相对侧"（前后墙）时透视图位置/方向全错。根因：原公式 `display × flip(Y,π) × source⁻¹ × camera` 把虚拟相机甩到显示门"错误侧"（房间外 15m）。修正为 `source × display⁻¹ × camera`，虚拟相机永远位于"对面门"的房间侧、面向房间，同侧和对侧都能正确显示。新增 `#fps` 帧率显示（右上角绿字 monospace），每 500ms 统计一次，避免每帧重写 DOM。 |
| 22 | 伴侣方块碰撞体 + 可站立 | 彻底重做方块物理模型——**可搬动箱子风格**：① 玩家水平顶着走（`updatePlayer` 尾部圆-圆碰撞，方块直接移位置、不放冲量、不反推玩家；脚在方块顶部以上时不推，防止站上面时把方块踢走）；② 玩家可站方块上（`buildLevel` 向 `platforms` 推入 `isCube:true` 动态平台条目，`updateCube` 每帧更新其 AABB 边界）；③ 方块无水平动量（`updateCube` 中 `cubeVel.x=0, z=0`，仅重力竖直有效；传送门穿过后动量在冷却期内可生效但下一帧即归零）；④ `updateCube` 平台碰撞循环跳过 `isCube` 条目避免自碰撞。移除之前的阻尼代码。 |
| 23 | 全面代码审查与优化 | ① **Bug 修复**：`clearLevel` 误 dispose 共享材质（wall/floor/ceil/box），改用 `SHARED_MATERIALS` 集合跳过，消除切关 shader 重编译；`portalSurfaces=[]` 位置提前到 floor/ceil 推入之前（原代码把地面/天花板从可放置表面抹掉）。② **死代码**：移除 `walls` 数组与 `flipMat`。③ **共享碰撞**：`updatePlayer`/`updateCube` 重复的 AABB 解算提取为 `resolveAABBCollision()`。④ **性能**：热路径 `new THREE.Vector3()` 全部改为预分配临时向量（`_fwd/_cubeFwd/_tpPos/_tpLocal/_cubeToC` 等）；房间边界在 `buildLevel` 缓存为 `_boundsP/_boundsC`；移除 `renderPortalView` 中冗余的 `camera.updateMatrixWorld(true)`。⑤ **魔法数字**：提取 `MOUSE_SENSITIVITY/GRAB_RANGE/GRAB_DOT/PORTAL_TRIGGER_DIST/PORTAL_TRIGGER_RADIUS/CUBE_PUSH_EPS`。⑥ **音效**：新增纯 WebAudio 合成音效（portal/teleport/goal/grab 四种），零外部文件保持离线。 |
| 24 | **单文件拆解为多模块** | 把 58KB 单文件 `portal.html` 物理拆解为 `index.html`（UI 外壳 + 按序引 7 个 `<script>`）＋ `js/` 下 6 个模块（`world/portal/cube/audio/input/game.js`），沿用经典 `<script src>`（**非 ES module**，规避 `file://` CORS），零构建、零 CDN、`node --check` 全过、外部 URL 命中 0。采用**最小侵入式物理切分**：全局变量收进 `PG.state`、常量收进 `PG.cfg`，各模块挂 `window.PG` 命名空间；加载顺序 `three→world→portal→cube→audio→input→game`，`game.js` 末尾 `PG.game.init()` 串起一切。逻辑/行为 100% 不变。原 `portal.html` 备份为 `portal.html.bak` 未动。 |

---

## 3. 项目结构说明

```
项目-Portal游戏Demo/
├── PROJECT_GUIDE.md        ← 本文件（项目总览，智能体优先读取）
├── index.html              ← 入口：HTML 外壳（CSS/UI 节点）+ 底部按序引 7 个 <script>
├── portal.html.bak         ← 拆分前单文件主程序备份（58KB，未动，可秒回滚）
├── js/
│   ├── world.js   ← 场景/相机/渲染器/材质/光照/纹理/平台 AABB 碰撞/buildLevel/clearLevel/animateEnv
│   ├── portal.js  ← 传送门表面/RTT 渲染/虚拟相机矩阵/穿越触发/透视渲染
│   ├── cube.js    ← 伴侣方块物理（抓取/投掷/可站立/穿越）
│   ├── audio.js   ← WebAudio 合成音效（portal/teleport/goal/grab）
│   ├── input.js   ← 指针锁定/鼠标视角/键盘状态
│   └── game.js    ← 主循环/状态机/UI(暂停·选关·FPS)/事件绑定/PG.game.init() 粘合
├── levels.json             ← 关卡数据（{ levels: [L1..L5] }，含 room/start/platforms/goal/interactCube/name/hint）
├── libs/
│   └── three.min.js        ← 本地 Three.js r159（UMD，挂全局 THREE），约 600KB
├── assets/
│   └── textures/           ← 7 张本地免费纹理（砖墙/木地板/箱体/涡流等），无任何外部链接
├── start_server.bat        ← 一键启动本地服务器（纯英文 + CRLF，防乱码/闪退）
├── 下载依赖.bat            ← 联网一次，把 Three.js 拉进 libs/（纯英文 + CRLF）
└── 下载素材.bat            ← 联网时把纹理补/刷进 assets/textures/（纯英文 + CRLF）
```

**关键文件职责**
- `index.html`：唯一入口。内含 `<head>` CSS 与 `#fps/#hint/#pause/#level-select` 等 UI 节点；底部按依赖顺序加载 `three.min.js → world → portal → cube → audio → input → game`；`game.js` 末尾调 `PG.game.init()` 串起所有模块。双击即可在 `file://` 下运行（经典 `<script>`，非 ES module）。
- `js/world.js`：场景/相机/渲染器初始化、共享材质、灯光、纹理系统（程序化兜底 + 本地 jpg 升级）、平台 AABB 碰撞 `resolveAABBCollision`、关卡构建与清理、环境动画。
- `js/portal.js`：传送门放置/表面管理、RTT 渲染（`source × display⁻¹ × camera` 矩阵）、穿越检测与触发、透视门面贴图。
- `js/cube.js`：伴侣方块状态机（拾取/放下/抛投/可站立/穿越），复用玩家 AABB 解算与 `teleport()`。
- `js/audio.js`：纯 WebAudio 合成四种音效，零外部文件。
- `js/input.js`：指针锁定、鼠标灵敏度、键盘状态对象 `keys`，统一收口事件监听。
- `js/game.js`：主循环 `animate()`、状态机（暂停/选关/主界面）、UI 显隐、FPS 统计、`loadLevelByIndex`，以及 `PG.game.init()` 总装配。
- `levels.json`：关卡配置外置，改关卡只改此文件，不碰逻辑。
- `assets/textures/*`：所有贴图本地存储；代码以相对路径加载，零外部引用（`grep https?://` 命中为 0）。
- **全局命名空间**：所有模块的变量/函数挂到 `window.PG`（`PG.cfg` 常量、`PG.state` 运行时状态、`PG.world/portal/cube/audio/input/game` 各模块对象），避免污染全局、消除单文件全局耦合。

---

## 4. 智能体协作说明

| 角色 | 职责 |
|------|------|
| **Senior Developer（开发智能体）** | 全部代码实现、Bug 修复、性能与视觉优化；维护本指南与项目记忆。 |
| **用户（需求方）** | 提出需求、验收、在本机（有网）运行脚本补齐依赖/素材、实机测试反馈。 |
| **沙箱环境** | 无外网（仅 `threejs.org` 在关闭沙箱后可通）；二进制资源（Three.js、纹理）由用户本机脚本下载，或由开发智能体在可达源处拉取后写入项目。 |

**协作约定 / 注意事项**
- 所有交付物必须**离线自包含**：禁止新增外部 CDN/在线引用；新素材一律下载到 `assets/` 本地引用。
- Windows 批处理脚本约定：纯英文（中文会乱码）、CRLF 换行、避免多行 `( )` 代码块（否则 LF 下 `cmd` 解析崩溃、窗口闪退）。
- 运行方式：推荐 `start_server.bat`（或 `python -m http.server`）经本地服务器跑，以正常加载 `levels.json` 与纹理；直接双击 `file://` 也能跑（自动回退内置关卡 + 程序化纹理）。
- 改动结构或重大功能后，更新本 `PROJECT_GUIDE.md` 与当日工作记忆。

---

*最近更新：2026-07-27（单文件 portal.html 拆分为 index.html + js/ 六模块）*
