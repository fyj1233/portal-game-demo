// ============== 伴侣方块（Companion Cube）模块 ==============
// 把原本只自转的装饰绿块升级为可玩道具：[F] 拾取/放下、脱手时向前抛出，
// 自由状态受重力与平台碰撞约束，并能像玩家一样穿越传送门（复用 teleport()）。
// 设计要点：
//  - 携带时关闭物理，方块平滑跟随相机前方"手持位"，避免穿墙抖动；
//  - 放下时继承玩家水平速度并叠加向前冲量，方便把方块"丢进"传送门送到远处；
//  - 方块无朝向，teleport() 返回的 yaw/pitch 直接忽略，只用 position/velocity；
//  - 掉出房间（y<-3）自动回到出生点，防止道具丢失卡死。
let _cubeHintCache = '';
function setCubeHint(t) {
  if (t === _cubeHintCache) return;            // 避免每帧重写同一文本
  _cubeHintCache = t;
  const el = document.getElementById('cube-hint');
  if (el) el.textContent = t;
}

function toggleCubeGrab() {
  if (cubeCarried) dropCube();
  else tryGrabCube();
}

// 拾取：需在 GRAB_RANGE 内且大致正对方块（GRAB_DOT 防隔墙/背后抓取）
function tryGrabCube() {
  if (!interactCube) return;
  _cubeToC.copy(interactCube.position).sub(camera.position);
  const dist = _cubeToC.length();
  if (dist > GRAB_RANGE) return;
  camera.getWorldDirection(_cubeFwd);
  if (_cubeFwd.dot(_cubeToC.normalize()) < GRAB_DOT) return;
  cubeCarried = true;
  cubeVel.set(0, 0, 0);
  playSound('grab');
}

// 放下：继承玩家速度 + 向前抛投，使方块能被"扔"进传送门
function dropCube() {
  cubeCarried = false;
  camera.getWorldDirection(_cubeFwd);
  cubeVel.copy(player.velocity);
  cubeVel.add(_cubeFwd.multiplyScalar(4));
  cubeVel.y += 1.5;
  playSound('grab');
}

// 方块专属传送检测（与玩家 checkPortalTeleport 同构，但无视角量）
function tryCubeTeleport() {
  if (!portals.blue || !portals.orange) return;
  if (cubeTeleportCd > 0) return;
  _tpPos.copy(interactCube.position);
  for (const [fk, tk] of [['blue', 'orange'], ['orange', 'blue']]) {
    const from = portals[fk], to = portals[tk];
    _tpLocal.copy(_tpPos).sub(from.position).applyQuaternion(from.quaternion.clone().invert());
    if (Math.abs(_tpLocal.z) < PORTAL_TRIGGER_DIST) {
      const distSq = _tpLocal.x * _tpLocal.x + _tpLocal.y * _tpLocal.y;
      if (distSq < PORTAL_SIZE * PORTAL_SIZE * 0.7) {
        const r = teleport(_tpPos, cubeVel, from, to);
        interactCube.position.copy(r.position);
        cubeVel.copy(r.velocity);
        cubeTeleportCd = TELEPORT_COOLDOWN;
        playSound('teleport');
        return;
      }
    }
  }
}

function updateCube(dt) {
  if (!interactCube) return;
  if (!isLocked || isPaused) return;            // 未锁定/暂停 → 冻结（与玩家一致）
  if (cubeCarried) {
    // 手持位：相机前方 1.6m、略低于视线；lerp 平滑跟随
    camera.getWorldDirection(_cubeFwd);
    _cubeTarget.copy(camera.position).add(_cubeFwd.multiplyScalar(1.6));
    _cubeTarget.y -= 0.15;
    interactCube.position.lerp(_cubeTarget, Math.min(1, dt * 12));
    interactCube.rotation.y += dt * 1.2;
    if (interactCube.material.emissiveIntensity !== 0) interactCube.material.emissiveIntensity = 0;
    setCubeHint('携带方块中 · 按 F 放下（向前抛出）');
    return;
  }
  // ---- 自由物理 ----
  if (cubeTeleportCd > 0) cubeTeleportCd -= dt;
  cubeVel.y += GRAVITY * dt;
  // cubeVel.x/z 在空闲时保持 0（方块无水平动量，由 player push 直接移位置）；
  // teleport() 传来的水平冲量在冷却期内物理仍会处理，但下一帧即归零，实现"无滑行"效果
  cubeVel.x = 0; cubeVel.z = 0;
  const newPos = interactCube.position.clone().add(cubeVel.clone().multiplyScalar(dt));

  resolveAABBCollision(newPos, cubeVel, CUBE_HALF, interactCube.position.y, CUBE_HALF);

  // 房间边界
  newPos.x = Math.max(-_boundsC.hw, Math.min(_boundsC.hw, newPos.x));
  newPos.z = Math.max(-_boundsC.hd, Math.min(_boundsC.hd, newPos.z));
  if (newPos.y > ROOM_H - CUBE_HALF) { newPos.y = ROOM_H - CUBE_HALF; cubeVel.y = 0; }
  // 掉出世界 → 回到出生点（防止方块永久丢失）
  if (newPos.y < -3) { newPos.copy(cubeStartPos); cubeVel.set(0, 0, 0); }

  interactCube.position.copy(newPos);
  tryCubeTeleport();

  // 更新方块在 platforms 中的动态平台边界（使玩家能站在方块上）
  const cubePlat = platforms.find(p => p.isCube);
  if (cubePlat) {
    cubePlat.minX = interactCube.position.x - CUBE_HALF;
    cubePlat.maxX = interactCube.position.x + CUBE_HALF;
    cubePlat.minY = interactCube.position.y - CUBE_HALF;
    cubePlat.maxY = interactCube.position.y + CUBE_HALF;
    cubePlat.minZ = interactCube.position.z - CUBE_HALF;
    cubePlat.maxZ = interactCube.position.z + CUBE_HALF;
  }

  // 可拾取高亮 + 提示文本（在范围内且正对方块时）
  _cubeToC.copy(interactCube.position).sub(camera.position);
  const d = _cubeToC.length();
  camera.getWorldDirection(_cubeFwd);
  const grabbable = d < GRAB_RANGE && _cubeFwd.dot(_cubeToC.normalize()) > GRAB_DOT;
  interactCube.material.emissiveIntensity = grabbable ? (0.5 + Math.sin(performance.now() * 0.006) * 0.25) : 0;
  setCubeHint(grabbable ? '按 F 拾取方块' : '');
  interactCube.rotation.y += dt * 0.6;
}
