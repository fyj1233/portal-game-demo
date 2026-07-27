// ============== 玩家状态 ==============
const player = {
  position: new THREE.Vector3(0, PLAYER_HEIGHT, 3),
  velocity: new THREE.Vector3(0, 0, 0),
  onGround: false,
  teleportCooldown: 0,
};
const keys = {};
let isLocked = false;
let isPaused = false;        // 暂停菜单状态：true 时游戏冻结、显示菜单，但不回主界面

// ============== 指针锁定 + 第一人称视角（核心 THREE 自实现，无外部插件） ==============
let yaw = 0, pitch = 0;
const PI_2 = Math.PI / 2;
const dom = renderer.domElement;

function applyLook() {
  camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
}
document.addEventListener('mousemove', (e) => {
  if (!isLocked) return;
  yaw -= e.movementX * MOUSE_SENSITIVITY;
  pitch -= e.movementY * MOUSE_SENSITIVITY;
  pitch = Math.max(-PI_2 + 0.05, Math.min(PI_2 - 0.05, pitch));
  applyLook();
});
document.addEventListener('pointerlockchange', () => {
  isLocked = (document.pointerLockElement === dom);
  if (isLocked) {
    hideOverlay('start-screen');
    hideOverlay('level-select');
    if (isPaused) {                 // 由暂停恢复：清标志并隐藏暂停菜单
      isPaused = false;
      hideOverlay('pause-menu');
    }
  } else {
    // 非暂停导致的释放（如浏览器自动退出锁定）→ 回到主界面
    if (!isPaused) showOverlay('start-screen');
  }
});
document.addEventListener('pointerlockerror', () => {
  alert('指针锁定失败，请允许后重试，或检查浏览器是否阻止了全屏/锁定。');
});
document.getElementById('start-btn').addEventListener('click', () => dom.requestPointerLock());

// 键盘：移动 / 暂停 / 拾取方块 / 通关后继续
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (levelComplete && e.code === 'KeyR') {
    const isLast = currentLevelIndex >= levels.length - 1;
    loadLevelByIndex(isLast ? 0 : currentLevelIndex + 1);
    return;
  }
  if (e.code === 'KeyF' && !e.repeat && isLocked && !isPaused && !levelComplete) {
    toggleCubeGrab();   // 拾取 / 放下 伴侣方块
  }
  if (e.code === 'KeyE' || e.code === 'Escape') {
    if (levelComplete) return;                       // 通关画面下不弹暂停，用 R 继续
    if (isLocked && !isPaused) {                     // 游戏中 → 暂停
      e.preventDefault();
      pauseGame();
    } else if (isPaused && !isLocked) {              // 暂停中 → 继续
      e.preventDefault();
      resumeGame();
    }
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// 鼠标放置传送门
dom.addEventListener('mousedown', (e) => {
  if (!isLocked) return;
  e.preventDefault();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const intersects = raycaster.intersectObjects(portalSurfaces, false);
  if (intersects.length > 0) {
    const hit = intersects[0];
    const point = hit.point;
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    // 墙面 / 地面 / 天花板 / 平台 任意表面都可放置；placePortal 不再依赖"墙"形参
    if (e.button === 0) placePortal('blue', point, normal);
    else if (e.button === 2) placePortal('orange', point, normal);
  }
});
dom.addEventListener('contextmenu', e => e.preventDefault());
