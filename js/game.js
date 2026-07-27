// ============== 暂停菜单 / 选关 ==============
let levelSelectReturn = 'start';   // 'start' = 从主界面进入选关；'pause' = 从暂停菜单进入选关
function showOverlay(id) { document.getElementById(id).style.display = 'flex'; }
function hideOverlay(id) { document.getElementById(id).style.display = 'none'; }

function pauseGame() {
  isPaused = true;
  if (document.pointerLockElement) document.exitPointerLock();   // 释放鼠标以便操作菜单
  showOverlay('pause-menu');
}
function resumeGame() {
  // 重新锁定指针；pointerlockchange 会清掉 isPaused 并隐藏暂停菜单 / 选关面板
  dom.requestPointerLock();
}
function returnToMainMenu() {
  isPaused = false;
  hideOverlay('pause-menu');
  hideOverlay('level-select');
  showOverlay('start-screen');    // 指针已释放，显式回到主界面
}
function openLevelSelect(from) {
  levelSelectReturn = from;
  if (from === 'start') hideOverlay('start-screen');
  else hideOverlay('pause-menu');
  buildLevelButtons();
  showOverlay('level-select');
}
function closeLevelSelect() {
  hideOverlay('level-select');
  if (levelSelectReturn === 'start') showOverlay('start-screen');
  else showOverlay('pause-menu');
}
function buildLevelButtons() {
  const box = document.getElementById('level-buttons');
  box.innerHTML = '';
  if (!levels || !levels.length) return;
  levels.forEach((lv, i) => {
    const btn = document.createElement('button');
    btn.className = 'menu-btn';
    btn.textContent = (i + 1) + '. ' + (lv.name || ('关卡 ' + (i + 1)));
    btn.addEventListener('click', () => {
      loadLevelByIndex(i);
      hideOverlay('level-select');
      hideOverlay('pause-menu');
      resumeGame();    // 进入所选关卡
    });
    box.appendChild(btn);
  });
}

// 暂停菜单按钮
document.getElementById('pm-resume').addEventListener('click', resumeGame);
document.getElementById('pm-select').addEventListener('click', () => openLevelSelect('pause'));
document.getElementById('pm-restart').addEventListener('click', () => {
  loadLevelByIndex(currentLevelIndex);
  hideOverlay('pause-menu');
  hideOverlay('level-select');
  resumeGame();
});
document.getElementById('pm-mainmenu').addEventListener('click', returnToMainMenu);
// 主界面「选择关卡」
document.getElementById('ls-open-start').addEventListener('click', () => openLevelSelect('start'));
// 选关面板「返回」
document.getElementById('ls-back').addEventListener('click', closeLevelSelect);

// ============== 帧率显示 ==============
// 每 500ms 统计一次 frames 数，换算成 FPS 写到 #fps。滑动窗口简单稳定，避免每帧重写 DOM。
let _fpsFrames = 0;
let _fpsLastUpdate = performance.now();
const _fpsEl = document.getElementById('fps');
let _fpsText = '';
function updateFPS() {
  _fpsFrames++;
  const now = performance.now();
  const elapsed = now - _fpsLastUpdate;
  if (elapsed >= 500) {
    const fps = (_fpsFrames * 1000 / elapsed);
    const text = fps.toFixed(0) + ' FPS';
    if (text !== _fpsText) { _fpsText = text; if (_fpsEl) _fpsEl.textContent = text; }
    _fpsFrames = 0;
    _fpsLastUpdate = now;
  }
}

let prevTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - prevTime) / 1000, 0.05);
  prevTime = now;
  const time = now / 1000;
  updatePlayer(dt);
  updateCube(dt);
  checkGoal();
  goal.rotation.z += dt * 0.8;
  goal.position.y = goalBaseY + Math.sin(time * 2) * 0.12;
  goalLight.position.copy(goal.position);
  animatePortals(time);
  animateEnv(dt, time);
  updatePortalViews();
  renderer.render(scene, camera);
  updateFPS();
}
applyLook();

// 内置默认关卡：fetch('levels.json') 失败（例如直接双击 file:// 打开）时回退为单关使用，
// 保证游戏仍可运行；用本地服务器运行时则加载外部 levels.json 的全部关卡。
const DEFAULT_LEVEL = {
  name: "默认关卡",
  hint: "🎯 把<span class='orange'>橙门</span>射向后墙高处、<span class='blue'>蓝门</span>射向前墙，走进蓝门登顶触碰发光目标。",
  room:  { w: 16, d: 20, h: 6 },
  start: { x: 0, y: 1.7, z: 3 },
  platforms: [
    { w: 2,   h: 1,   d: 2,   x: -4, y: 0.5, z: -3 },
    { w: 1.5, h: 2,   d: 1.5, x: 4,  y: 1,   z: 2 },
    { w: 3,   h: 0.5, d: 1.5, x: 0,  y: 0.25, z: 5 },
    { w: 3,   h: 3,   d: 2,   x: 0,  y: 1.5, z: -8.9 }   // 解谜高台（跳跃不可达）
  ],
  interactCube: { x: -2, y: 0.35, z: 2 },
  goal: { x: 0, y: 3.55, z: -8.05 }
};

function loadLevelByIndex(i) {
  currentLevelIndex = i;
  clearLevel();
  levelGroup = new THREE.Group();
  scene.add(levelGroup);
  buildLevel(levels[i]);
  const tag = document.getElementById('level-tag');
  if (tag) tag.textContent = '关卡 ' + (i + 1) + ' / ' + levels.length + ' · ' + (levels[i].name || '');
  const hint = document.getElementById('level-hint');
  if (hint) hint.innerHTML = levels[i].hint || '';
}

async function loadLevel() {
  let data;
  try {
    const res = await fetch('levels.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    data = await res.json();
    if (!data.levels || !data.levels.length) throw new Error('levels 字段为空');
  } catch (e) {
    data = { levels: [DEFAULT_LEVEL] };
    const note = document.getElementById('loading');
    note.style.display = 'block';
    note.style.color = '#ffcc66';
    note.textContent = '未加载 levels.json（' + e.message + '），使用内置默认单关。建议用本地服务器运行以加载全部关卡：python -m http.server';
  }
  levels = data.levels;
  loadLevelByIndex(0);
  animate();
}
loadLevel();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
