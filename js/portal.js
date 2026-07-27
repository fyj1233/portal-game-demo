// ============== 传送门 ==============
const portals = { blue: null, orange: null };
const PORTAL_SIZE = 1.2;

// 传送门透视角（Render-to-Texture）：从一门望进去看到另一门的实时画面。
// 虚拟摄像机 = 显示门.matrixWorld × 180°翻转 × 源门.matrixWorld⁻¹ × 主摄像机.matrixWorld
const RT_SIZE = 512;
const portalCam = new THREE.PerspectiveCamera();
portalCam.matrixAutoUpdate = false;
const rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
function makePortalRT() {
  const rt = new THREE.WebGLRenderTarget(RT_SIZE, RT_SIZE, rtOpts);
  // 各向异性过滤：斜视传送门时纹理不会被拉糊，进一步缓解"靠近后画面被放大变糊"的观感
  rt.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return rt;
}
let portalsActive = false;   // 两门都放置后才开启透视角

function createPortalMesh(colorHex) {
  const group = new THREE.Group();
  const color = new THREE.Color(colorHex);
  // 门面统一为圆形（不再 scale.y 拉伸），避免把方形 RT 纵向拉伸导致透视畸变
  // 外发光环（叠加混合，营造能量外溢）
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(PORTAL_SIZE * 1.0, PORTAL_SIZE * 1.4, 64),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  group.add(glow);
  // 旋涡面（涡流纹理 + 叠加混合 + 颜色染色）
  const swirl = new THREE.Mesh(
    new THREE.CircleGeometry(PORTAL_SIZE * 0.95, 48),
    new THREE.MeshBasicMaterial({ map: portalTex, color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  swirl.position.z = 0.02; group.add(swirl);
  // 内圈亮核
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(PORTAL_SIZE * 0.45, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  core.position.z = 0.03; group.add(core);
  // 边界环
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(PORTAL_SIZE * 0.85, PORTAL_SIZE * 1.0, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
  );
  group.add(ring);
  // 透视画面层（默认隐藏；两门都放置后显示另一门的实时渲染贴图）
  const view = new THREE.Mesh(
    new THREE.CircleGeometry(PORTAL_SIZE * 0.95, 48),
    new THREE.MeshBasicMaterial({ map: portalTex, transparent: true, opacity: 1.0, side: THREE.DoubleSide, depthWrite: false })
  );
  view.position.z = 0.04; view.visible = false; group.add(view);
  const rt = makePortalRT();
  const light = new THREE.PointLight(colorHex, 0.9, 6);
  light.position.z = 0.6; group.add(light);
  return { group, glow, swirl, core, ring, view, rt, light, color };
}

// 构建传送门的一致基矩阵：局部 +Z = 法线，局部 +Y = 接近世界 up（法线竖直时改用水平 up），
// 局部 +X = Y×Z。这样地面/天花板/平台顶底门也能得到合法、稳定的朝向，
// 修复"门面法线竖直时 lookAt(up=世界Y) 退化成 NaN/乱朝向，导致透视与传送后方位错乱"的问题。
function makePortalBasis(pos, normal) {
  const z = normal.clone().normalize();
  let y = new THREE.Vector3(0, 1, 0);
  if (Math.abs(z.y) > 0.99) y.set(0, 0, 1);                 // 法线接近竖直 → 用水平 up 避免退化
  y.sub(z.clone().multiplyScalar(y.dot(z))).normalize();    // 令 y ⟂ z
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  m.setPosition(pos);
  return m;
}

function placePortal(type, point, normal) {
  if (portals[type]) { scene.remove(portals[type].group); if (portals[type].rt) portals[type].rt.dispose(); }
  const meshes = createPortalMesh(type === 'blue' ? 0x4db8ff : 0xff8c42);
  const group = meshes.group;
  const portalPos = point.clone().add(normal.clone().multiplyScalar(0.02));
  const m = makePortalBasis(portalPos, normal);
  group.position.copy(portalPos);
  group.quaternion.setFromRotationMatrix(m);
  scene.add(group);
  portals[type] = { ...meshes, position: portalPos.clone(), normal: normal.clone(), group, quaternion: group.quaternion.clone() };
  playSound('portal');
}

// 传送旋转：出口门旋转 × 180°翻转 × 入口门旋转⁻¹
// 关键：必须包含"绕竖直轴 180° 翻转"，否则"进入一面墙"只会变成"朝向另一面墙里"，
// 而不是从另一面门里朝外走出来（这正是之前视角朝向错误、且动量方向反了的根因）。
const _flipAxis = new THREE.Vector3(0, 1, 0);
function teleport(entityPos, entityVel, fromPortal, toPortal) {
  const flipQuat = new THREE.Quaternion().setFromAxisAngle(_flipAxis, Math.PI);
  const R = toPortal.quaternion.clone()           // 出口门本地->世界
    .multiply(flipQuat)                            // 180° 翻转（进->出）
    .multiply(fromPortal.quaternion.clone().invert()); // 世界->入口门本地

  // 位置：保留进门时的横向偏移（左右/上下），并在出口门前留一段站立距离，避免嵌进墙里
  const relLocal = entityPos.clone().sub(fromPortal.position)
    .applyQuaternion(fromPortal.quaternion.clone().invert());
  const newRelTangential = new THREE.Vector3(relLocal.x, relLocal.y, 0)
    .applyQuaternion(toPortal.quaternion);
  const position = toPortal.position.clone()
    .add(newRelTangential)
    .add(toPortal.normal.clone().multiplyScalar(0.6));

  // 速度：方向随旋转变换（含翻转），动量大小守恒
  const velocity = entityVel.clone().applyQuaternion(R);

  // 视角：把当前朝向按同一旋转变换，再分解回 yaw / pitch（第一人称相机用 YXZ 欧拉角）
  const fwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  fwd.applyQuaternion(R);
  const newYaw = Math.atan2(-fwd.x, -fwd.z);
  const newPitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));

  return { position, velocity, yaw: newYaw, pitch: newPitch };
}

function checkPortalTeleport() {
  if (!portals.blue || !portals.orange) return;
  if (player.teleportCooldown > 0) return;
  _tpPos.copy(player.position);
  _tpPos.y -= PLAYER_HEIGHT;
  for (const [fromKey, toKey] of [['blue', 'orange'], ['orange', 'blue']]) {
    const from = portals[fromKey], to = portals[toKey];
    _tpLocal.copy(_tpPos).sub(from.position).applyQuaternion(from.quaternion.clone().invert());
    if (Math.abs(_tpLocal.z) < PORTAL_TRIGGER_DIST) {
      const distSq = (_tpLocal.x * _tpLocal.x) + (_tpLocal.y * _tpLocal.y);
      if (distSq < PORTAL_SIZE * PORTAL_SIZE * PORTAL_TRIGGER_RADIUS) {
        const speed = player.velocity.length();
        if (speed < 0.5 && Math.abs(_tpLocal.z) > 0.3) continue;
        const result = teleport(_tpPos, player.velocity, from, to);
        player.position.copy(result.position); player.position.y += PLAYER_HEIGHT;
        player.velocity.copy(result.velocity);
        yaw = result.yaw; pitch = result.pitch; applyLook();
        camera.position.copy(player.position);
        player.teleportCooldown = TELEPORT_COOLDOWN;
        player.onGround = false;
        playSound('teleport');
        return;
      }
    }
  }
}

// 传送门透视角渲染：每帧为每扇门用虚拟摄像机渲染另一侧画面到 RT，并贴回门面
function renderPortalView(display, source) {
  display.group.updateMatrixWorld(true);
  source.group.updateMatrixWorld(true);
// 传送门透视角矩阵（修正版）
// 原公式 display × flip(Y,π) × source⁻¹ × camera 会在两门位于"相对侧"（前后墙）时，
// 把虚拟相机甩到显示门的"错误侧"（房间外、蓝门后面 15m 处），导致透视内容位置/方向全错。
// 正确公式：source × display⁻¹ × camera —— 虚拟相机永远位于"对面门（source）"的房间侧、
// 面向房间。同侧和对侧都能正确显示。
const m = new THREE.Matrix4()
  .copy(source.group.matrixWorld)
  .multiply(display.group.matrixWorld.clone().invert())
  .multiply(camera.matrixWorld);
  portalCam.matrixWorld.copy(m);
  portalCam.matrixWorldInverse.copy(m).invert();
  // 传送门 RT 与门面均为正方形/圆形，故虚拟相机用正方形投影（aspect=1）。
  // 直接改 elements[0]=elements[5] 的 hack 在 Three.js 内部状态上不严谨；
  // 改为设 fov/aspect/near/far 后调 updateProjectionMatrix()，与相机模型自洽。
  portalCam.fov = camera.fov;
  portalCam.aspect = 1;
  portalCam.near = camera.near;
  portalCam.far = camera.far;
  portalCam.updateProjectionMatrix();
  renderer.setRenderTarget(display.rt);
  renderer.render(scene, portalCam);
  renderer.setRenderTarget(null);
  display.view.material.map = display.rt.texture;
  display.view.visible = true;
}
// 视锥裁剪：只有当"显示门"位于主相机画面内时，才渲染它的透视 RT。
// 望向别处时直接跳过，把每帧渲染从固定 3 遍降到"主画面 + 当前可见的门"遍数。
const _frustum = new THREE.Frustum();
const _projScreen = new THREE.Matrix4();
const _portalSphere = new THREE.Sphere();
const _portalCenter = new THREE.Vector3();
function portalOnScreen(p) {
  p.group.getWorldPosition(_portalCenter);
  _portalSphere.set(_portalCenter, PORTAL_SIZE * 1.6);   // 1.2 太紧，边缘门会被误判裁掉看不到 RT；1.6 留足余量
  return _frustum.intersectsSphere(_portalSphere);
}
function updatePortalViews() {
  portalsActive = !!(portals.blue && portals.orange);
  if (!portalsActive) {
    ['blue', 'orange'].forEach(t => { if (portals[t]) portals[t].view.visible = false; });
    return;
  }
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  _projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_projScreen);
  ['blue', 'orange'].forEach(t => {
    const display = portals[t];
    if (!display) return;
    // 显示门不在画面内则跳过它的 RT 渲染（也隐藏其透视画面，只留旋涡兜底）
    if (!portalOnScreen(display)) { display.view.visible = false; return; }
    const source = (t === 'blue') ? portals.orange : portals.blue;
    // 渲染透视前隐藏两扇门自身，避免门面被拍进对方画面
    portals.blue.group.visible = false; portals.orange.group.visible = false;
    renderPortalView(display, source);
    portals.blue.group.visible = true; portals.orange.group.visible = true;
  });
}

function animatePortals(time) {
  ['blue', 'orange'].forEach(type => {
    const p = portals[type];
    if (!p) return;
    p.ring.material.opacity = 0.7 + Math.sin(time * 3) * 0.2;
    p.glow.material.opacity = 0.25 + Math.sin(time * 2.5) * 0.12;
    p.core.material.opacity = 0.25 + Math.sin(time * 4) * 0.12;
    p.swirl.material.opacity = (portalsActive ? 0.3 : 0.9) + Math.sin(time * 4) * 0.08;
    p.light.intensity = 0.7 + Math.sin(time * 2) * 0.25;
  });
}
