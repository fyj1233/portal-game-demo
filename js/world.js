// ===================== 依赖检查 =====================
if (typeof THREE === 'undefined' || !THREE.Scene) {
  document.getElementById('loading').textContent = '未找到 libs/three.min.js';
  document.getElementById('err-box').style.display = 'block';
  document.getElementById('start-btn').disabled = true;
  throw new Error('本地 Three.js 未加载，请先运行 下载依赖.bat');
}
document.getElementById('loading').style.display = 'none';

// ============== 常量 ==============
const GRAVITY = -25;
const JUMP_VELOCITY = 9;
const WALK_SPEED = 6;
const RUN_SPEED = 11;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.35;
const TELEPORT_COOLDOWN = 0.15;
// 交互
const MOUSE_SENSITIVITY = 0.0022;
const GRAB_RANGE = 3.5;         // 方块拾取最大距离（m）
const GRAB_DOT = 0.5;           // 拾取时玩家视线与方块方向的最小点积（防隔墙/背后抓取）
const PORTAL_TRIGGER_DIST = 0.5; // 传送触发：实体中心到门面距离
const PORTAL_TRIGGER_RADIUS = 0.8; // 传送触发：到门轴切向距离（× PORTAL_SIZE）
const CUBE_PUSH_EPS = 0.05;      // 方块推挤：玩家脚底与方块顶部的容差

// ============== 场景 ==============
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3b4258);
scene.fog = new THREE.Fog(0x3b4258, 40, 110);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, PLAYER_HEIGHT, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ============== 光照（已调亮） ==============
scene.add(new THREE.AmbientLight(0x7a88b8, 1.25));
scene.add(new THREE.HemisphereLight(0xc8d4ff, 0x6a5a4a, 0.95));

const sun = new THREE.DirectionalLight(0xfff3e0, 0.75);
sun.position.set(6, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(512, 512);
sun.shadow.camera.left = -15; sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15; sun.shadow.camera.bottom = -15;
scene.add(sun);

const ceilLight1 = new THREE.PointLight(0xfff0dd, 1.9, 22);
ceilLight1.position.set(0, 5.5, 0);
// 点光源立方体阴影在每帧 3 遍渲染（主相机 + 2 个传送门透视）下开销极大，关闭以保流畅；
// 仅保留方向光(太阳)的 1 张阴影图，视觉足够且性能可控。
ceilLight1.castShadow = false;
scene.add(ceilLight1);
// 性能优化：移除 ceilLight2/3（fragment shader 中每盏 PointLight 都参与逐像素光照计算）。
// 用 ambient + hemi 的小幅提升补偿，视觉差异极小，shader 灯光数 3 → 1。

// ============== 关卡数据状态 ==============
let ROOM_W = 16, ROOM_D = 20, ROOM_H = 6;   // 由关卡数据覆盖
let portalSurfaces = [];   // 可放置传送门的表面：墙、地面、天花板、平台（用于射线检测）
let platforms = [];
let goal = null, goalLight = null, goalBaseY = 0;
let interactCube = null;
let cubeCarried = false;             // 伴侣方块是否正被玩家携带
let cubeVel = new THREE.Vector3();   // 方块自由状态下的速度（重力/抛投/传送用）
let cubeStartPos = new THREE.Vector3(); // 方块出生点（掉出世界时复位）
let cubeTeleportCd = 0;              // 方块传送冷却，避免在门内反复跳变
const CUBE_HALF = 0.35;              // 方块半边长（碰撞用）
let levelGroup = null;        // 当前关卡所有 mesh 的容器，切换时整体移除
let levels = [];              // 从 levels.json 加载的关卡数组
let currentLevelIndex = 0;    // 当前关卡序号
// 每关缓存的房间边界（buildLevel 时计算，避免每帧重复运算）
let _boundsP = { hw: 0, hd: 0 }, _boundsC = { hw: 0, hd: 0 };

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xb4b4c6, roughness: 0.8, metalness: 0.05 });
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x76707f, roughness: 0.85, metalness: 0.0 });
const ceilMaterial = new THREE.MeshStandardMaterial({ color: 0x565064, roughness: 0.9, metalness: 0.0 });
const boxMaterial = new THREE.MeshStandardMaterial({ color: 0xb08050, roughness: 0.7 });
// 跨关卡共享材质集合：clearLevel 时禁止 dispose，否则每切一关都触发一次 shader 重编译
const SHARED_MATERIALS = new Set([wallMaterial, floorMaterial, ceilMaterial, boxMaterial]);

// ============== 纹理系统（本地素材 assets/textures + 程序化兜底，无任何外部链接） ==============
const texLoader = new THREE.TextureLoader();
const RPT = THREE.RepeatWrapping;
function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h); return c;
}
function procFloorTex() {
  const c = makeCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#6b5640'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2400; i++) {
      g.fillStyle = 'rgba(' + (90 + (Math.random()*60|0)) + ',' + (70 + (Math.random()*40|0)) + ',' + (50 + (Math.random()*30|0)) + ',0.22)';
      g.fillRect(Math.random()*w, Math.random()*h, 2, 2);
    }
  });
  return new THREE.CanvasTexture(c);
}
function procWallTex() {
  const c = makeCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#9a8f86'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7d7268';
    for (let y = 0; y < h; y += 32) for (let x = ((y/32)%2)*16; x < w; x += 32) g.fillRect(x+2, y+2, 28, 28);
  });
  return new THREE.CanvasTexture(c);
}
function procBoxTex() {
  const c = makeCanvas(128, 128, (g, w, h) => {
    g.fillStyle = '#b5803f'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#5e3d18'; g.lineWidth = 8; g.strokeRect(5, 5, w-10, h-10);
  });
  return new THREE.CanvasTexture(c);
}
function procSwirlTex() {
  const c = makeCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const a = Math.random()*Math.PI*2, r = Math.random()*120;
      const x = 128 + Math.cos(a)*r, y = 128 + Math.sin(a)*r;
      const grd = g.createRadialGradient(x, y, 0, x, y, 42);
      grd.addColorStop(0, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, 42, 0, 7); g.fill();
    }
  });
  return new THREE.CanvasTexture(c);
}
function setColorSpace(t) { if (t.colorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace; return t; }

// 先同步铺上程序化纹理（保证不空白），再异步尝试用本地 jpg 升级，失败则保留程序化
floorMaterial.map = setColorSpace(procFloorTex()); floorMaterial.map.repeat.set(4, 5);
wallMaterial.map = setColorSpace(procWallTex()); wallMaterial.map.repeat.set(3, 2);
boxMaterial.map = setColorSpace(procBoxTex());
floorMaterial.roughness = 0.7; wallMaterial.roughness = 0.9; boxMaterial.roughness = 0.8;

function upgradeTex(material, file, repeat, bumpFile) {
  texLoader.load('assets/textures/' + file, tex => {
    tex.wrapS = tex.wrapT = RPT; setColorSpace(tex);
    if (repeat) tex.repeat.set(repeat[0], repeat[1]);
    if (material.map && material.map.isTexture) material.map.dispose();  // 释放程序化兜底纹理，避免显存泄漏累积
    material.map = tex; material.needsUpdate = true;
    if (bumpFile) texLoader.load('assets/textures/' + bumpFile, bt => {
      bt.wrapS = bt.wrapT = RPT; if (repeat) bt.repeat.set(repeat[0], repeat[1]);
      material.bumpMap = bt; material.bumpScale = 0.4; material.needsUpdate = true;
    });
  }, undefined, () => {});
}
upgradeTex(floorMaterial, 'hardwood2_diffuse.jpg', [4, 5]);
upgradeTex(wallMaterial, 'brick_diffuse.jpg', [3, 2], 'brick_bump.jpg');
upgradeTex(boxMaterial, 'crate.gif', [1, 1]);

// 传送门涡流纹理（程序化 + 尝试升级 disturb.jpg）
const portalTex = setColorSpace(procSwirlTex());
portalTex.wrapS = portalTex.wrapT = RPT; portalTex.center.set(0.5, 0.5);
texLoader.load('assets/textures/disturb.jpg', t => {
  portalTex.image = t.image; setColorSpace(portalTex); portalTex.needsUpdate = true;
}, undefined, () => {});

// 渐变天空盒（程序化，无外部依赖）
(function () {
  const c = makeCanvas(16, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#2a3350'); grd.addColorStop(0.5, '#3b4258'); grd.addColorStop(1, '#161a28');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  scene.background = new THREE.CanvasTexture(c);
})();

// 漂浮尘埃粒子（氛围感）
const DUST = 600;
const dustGeo = new THREE.BufferGeometry();
const dpos = new Float32Array(DUST * 3);
const dspd = new Float32Array(DUST);
for (let i = 0; i < DUST; i++) {
  dpos[i*3]   = (Math.random()-0.5) * 15;
  dpos[i*3+1] = Math.random() * 6;
  dpos[i*3+2] = (Math.random()-0.5) * 19;
  dspd[i] = 0.2 + Math.random()*0.5;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  color: 0xbfd4ff, size: 0.06, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending
}));
scene.add(dust);

function createWall(width, height, x, y, z, rotY = 0) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMaterial);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.receiveShadow = true;
  // 性能优化：墙不再投影。墙与墙之间互投影子几乎不可见，但每帧 shadow pass 都会渲染它们；
  // 只保留方块/平台投影，shadow pass 顶点数大幅下降。
  mesh.castShadow = false;
  levelGroup.add(mesh);
  portalSurfaces.push(mesh);
  return mesh;
}

// 根据关卡配置构建场景：地图、平台、解谜目标、可互动物体、出生点
function buildLevel(level) {
  ROOM_W = level.room.w; ROOM_D = level.room.d; ROOM_H = level.room.h;
  // 缓存每关边界，避免 updatePlayer/updateCube 每帧重算
  _boundsP.hw = ROOM_W / 2 - PLAYER_RADIUS; _boundsP.hd = ROOM_D / 2 - PLAYER_RADIUS;
  _boundsC.hw = ROOM_W / 2 - CUBE_HALF;     _boundsC.hd = ROOM_D / 2 - CUBE_HALF;

  portalSurfaces = [];   // 先重置，再依次推入 地面/天花板/墙/平台，保证所有可放置表面都在

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  levelGroup.add(floor);
  portalSurfaces.push(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), ceilMaterial);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM_H;
  ceil.receiveShadow = true;
  levelGroup.add(ceil);
  portalSurfaces.push(ceil);

  createWall(ROOM_W, ROOM_H, 0, ROOM_H/2, -ROOM_D/2, 0);
  createWall(ROOM_W, ROOM_H, 0, ROOM_H/2, ROOM_D/2, Math.PI);
  createWall(ROOM_D, ROOM_H, -ROOM_W/2, ROOM_H/2, 0, Math.PI/2);
  createWall(ROOM_D, ROOM_H, ROOM_W/2, ROOM_H/2, 0, -Math.PI/2);

  // 平台：第一个是地面，其余来自关卡数据（箱子 / 解谜高台等）
  platforms = [{
    minX: -ROOM_W/2, maxX: ROOM_W/2, minY: 0, maxY: 0, minZ: -ROOM_D/2, maxZ: ROOM_D/2, isFloor: true
  }];
  level.platforms.forEach(p => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), boxMaterial);
    mesh.position.set(p.x, p.y, p.z);
    mesh.castShadow = false; mesh.receiveShadow = true;
    levelGroup.add(mesh);
    portalSurfaces.push(mesh);
    platforms.push({
      minX: p.x - p.w/2, maxX: p.x + p.w/2,
      minY: p.y - p.h/2, maxY: p.y + p.h/2,
      minZ: p.z - p.d/2, maxZ: p.z + p.d/2, isFloor: false
    });
  });

  // 解谜目标（发光圆环，登顶触碰即过关）
  goal = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.13, 18, 36),
    new THREE.MeshStandardMaterial({ color: 0x7dffd0, emissive: 0x33ffaa, emissiveIntensity: 1.4, roughness: 0.25 })
  );
  goalBaseY = level.goal.y;
  goal.position.set(level.goal.x, goalBaseY, level.goal.z);
  goal.rotation.x = Math.PI / 2;
  levelGroup.add(goal);
  goalLight = new THREE.PointLight(0x66ffcc, 1.3, 9);
  goalLight.position.copy(goal.position);
  levelGroup.add(goalLight);

  // 可互动立方体
  interactCube = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.7, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x55cc88, roughness: 0.4, metalness: 0.3 })
  );
  interactCube.position.set(level.interactCube.x, level.interactCube.y, level.interactCube.z);
  interactCube.castShadow = true; interactCube.receiveShadow = true;
  // 给方块加可发光的自发光通道：被瞄准可拾取时高亮提示
  interactCube.material.emissive = new THREE.Color(0x2a6a4a);
  interactCube.material.emissiveIntensity = 0;
  cubeStartPos.copy(interactCube.position);   // 记出生点，方块掉出世界时回到这里
  cubeCarried = false; cubeVel.set(0, 0, 0); cubeTeleportCd = 0;
  levelGroup.add(interactCube);
  // 方块作为可站立的动态平台（边界由 updateCube 每帧更新）
  platforms.push({
    minX: interactCube.position.x - CUBE_HALF,
    maxX: interactCube.position.x + CUBE_HALF,
    minY: interactCube.position.y - CUBE_HALF,
    maxY: interactCube.position.y + CUBE_HALF,
    minZ: interactCube.position.z - CUBE_HALF,
    maxZ: interactCube.position.z + CUBE_HALF,
    isFloor: false, isCube: true
  });

  // 出生点
  player.position.set(level.start.x, level.start.y, level.start.z);
  camera.position.copy(player.position);
}

let levelComplete = false;
function checkGoal() {
  if (levelComplete) return;
  const dx = player.position.x - goal.position.x;
  const dy = player.position.y - goal.position.y;
  const dz = player.position.z - goal.position.z;
  if (dx * dx + dy * dy + dz * dz < 1.6 * 1.6) {
    levelComplete = true;
    const isLast = currentLevelIndex >= levels.length - 1;
    const title = document.getElementById('win-title');
    const desc = document.getElementById('win-desc');
    if (isLast) {
      if (title) title.textContent = '全部通关！';
      if (desc) desc.innerHTML = '你完成了所有关卡 🎉 &nbsp;（按 <b>R</b> 从头再玩）';
    } else {
      if (title) title.textContent = '关卡 ' + (currentLevelIndex + 1) + ' 完成！';
      if (desc) desc.innerHTML = '准备进入下一关… &nbsp;（按 <b>R</b> 继续）';
    }
    const el = document.getElementById('win-box');
    if (el) el.style.display = 'block';
    playSound('goal');
  }
}

// ============== 物理 ==============
// 共享 AABB 平台碰撞解算：实体从所有平台中推回，返回是否落地（isFloor 或平台顶）
// newPos: 实体的"下一帧位置"（会被修改）；vel: 实体速度（碰撞时清零竖直分量）；
// halfSize: 水平碰撞半径；prevPosY: 实体上一帧的 y（用于判定是否从上方落下）；
// feetOffset: 实体中心到脚底的垂直偏移（玩家=PLAYER_HEIGHT，方块=CUBE_HALF）
function resolveAABBCollision(newPos, vel, halfSize, prevPosY, feetOffset) {
  let onGround = false;
  const feetY = newPos.y - feetOffset;
  platforms.forEach(plat => {
    if (plat.isCube) return;
    if (plat.isFloor) {
      if (feetY < 0 && prevPosY - feetOffset >= -0.1) {
        newPos.y = feetOffset; vel.y = 0; onGround = true;
      }
      return;
    }
    const px = newPos.x, pz = newPos.z;
    if (px + halfSize > plat.minX && px - halfSize < plat.maxX &&
        pz + halfSize > plat.minZ && pz - halfSize < plat.maxZ) {
      if (feetY < plat.maxY && newPos.y > plat.minY) {
        if (prevPosY - feetOffset >= plat.maxY - 0.1 && vel.y <= 0) {
          newPos.y = plat.maxY + feetOffset; vel.y = 0; onGround = true;
        } else if (newPos.y <= plat.minY && vel.y > 0) {
          vel.y = 0;
        }
      }
    }
    if (newPos.y - feetOffset < plat.maxY && newPos.y + feetOffset > plat.minY) {
      if (px + halfSize > plat.minX && px - halfSize < plat.maxX &&
          pz + halfSize > plat.minZ && pz - halfSize < plat.maxZ) {
        const oL = (px + halfSize) - plat.minX, oR = plat.maxX - (px - halfSize);
        const oF = (pz + halfSize) - plat.minZ, oB = plat.maxZ - (pz - halfSize);
        const m = Math.min(oL, oR, oF, oB);
        if (m === oL) newPos.x = plat.minX - halfSize;
        else if (m === oR) newPos.x = plat.maxX + halfSize;
        else if (m === oF) newPos.z = plat.minZ - halfSize;
        else newPos.z = plat.maxZ + halfSize;
      }
    }
  });
  return onGround;
}

// 预分配临时向量（避免每帧 new 造成 GC 压力）
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _cubeFwd = new THREE.Vector3();
const _cubeTarget = new THREE.Vector3();
const _tpPos = new THREE.Vector3();
const _tpLocal = new THREE.Vector3();
const _cubeToC = new THREE.Vector3();

function updatePlayer(dt) {
  if (!isLocked) return;
  camera.getWorldDirection(_fwd);
  _fwd.y = 0; _fwd.normalize();
  _right.crossVectors(_fwd, _cubeToC.set(0, 1, 0)).normalize();
  _moveDir.set(0, 0, 0);
  if (keys['KeyW']) _moveDir.add(_fwd);
  if (keys['KeyS']) _moveDir.sub(_fwd);
  if (keys['KeyD']) _moveDir.add(_right);
  if (keys['KeyA']) _moveDir.sub(_right);
  const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? RUN_SPEED : WALK_SPEED;
  if (_moveDir.lengthSq() > 0) _moveDir.normalize().multiplyScalar(speed);
  player.velocity.x = _moveDir.x;
  player.velocity.z = _moveDir.z;
  if (keys['Space'] && player.onGround) { player.velocity.y = JUMP_VELOCITY; player.onGround = false; }
  if (!player.onGround) player.velocity.y += GRAVITY * dt;

  const newPos = player.position.clone().add(player.velocity.clone().multiplyScalar(dt));
  player.onGround = false;
  player.onGround = resolveAABBCollision(newPos, player.velocity, PLAYER_RADIUS, player.position.y, PLAYER_HEIGHT);

  const hw = _boundsP.hw, hd = _boundsP.hd;
  newPos.x = Math.max(-hw, Math.min(hw, newPos.x));
  newPos.z = Math.max(-hd, Math.min(hd, newPos.z));
  if (newPos.y > ROOM_H - 0.2) { newPos.y = ROOM_H - 0.2; player.velocity.y = 0; }

  // 伴侣方块水平推挤（可搬动箱子风格）：玩家顶着方块走，方块不反推玩家；携带中不推
  if (interactCube && !cubeCarried) {
    const dx = newPos.x - interactCube.position.x;
    const dz = newPos.z - interactCube.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const minDist = PLAYER_RADIUS + CUBE_HALF;
    if (dist < minDist && dist > 0.001) {
      const feetY = newPos.y - PLAYER_HEIGHT;
      const cubeTop = interactCube.position.y + CUBE_HALF;
      // 仅当玩家脚底在方块顶部以下时推方块（站在方块上时不应推）
      if (feetY < cubeTop - CUBE_PUSH_EPS) {
        const overlap = minDist - dist;
        const nX = dx / dist, nZ = dz / dist;
        const newCX = interactCube.position.x - nX * overlap;
        const newCZ = interactCube.position.z - nZ * overlap;
        interactCube.position.x = Math.max(-_boundsC.hw, Math.min(_boundsC.hw, newCX));
        interactCube.position.z = Math.max(-_boundsC.hd, Math.min(_boundsC.hd, newCZ));
        // 方块不放冲量，只移位置（无动量、不滑行）；玩家也不被反推
      }
    }
  }

  player.position.copy(newPos);
  camera.position.copy(player.position);
  if (player.teleportCooldown > 0) player.teleportCooldown -= dt;
  checkPortalTeleport();
}

// ============== 环境动画 ==============
function animateEnv(dt, time) {
  const arr = dustGeo.attributes.position.array;
  for (let i = 0; i < DUST; i++) {
    arr[i*3+1] += dspd[i] * dt * 0.3;
    if (arr[i*3+1] > ROOM_H) arr[i*3+1] = 0;
  }
  dustGeo.attributes.position.needsUpdate = true;
  portalTex.rotation = time * 0.4;
  portalTex.offset.set(Math.sin(time * 0.2) * 0.05, Math.cos(time * 0.15) * 0.05);
}

// ============== 关卡切换 ==============
// 切换关卡：先清掉上一关的所有 mesh 与传送门，再构建新关
function clearLevel() {
  if (levelGroup) {
    scene.remove(levelGroup);
    levelGroup.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        // 共享材质（墙/地/天花板/箱子）跨关卡复用，禁止 dispose
        mats.forEach(m => { if (!SHARED_MATERIALS.has(m)) m.dispose(); });
      }
    });
    levelGroup = null;
  }
  ['blue', 'orange'].forEach(t => {
    if (portals[t]) { scene.remove(portals[t].group); if (portals[t].rt) portals[t].rt.dispose(); portals[t] = null; }
  });
  levelComplete = false;
  cubeCarried = false; cubeVel.set(0, 0, 0); cubeTeleportCd = 0;   // 切关时复位方块状态
  setCubeHint('');
  const wb = document.getElementById('win-box');
  if (wb) wb.style.display = 'none';
}
