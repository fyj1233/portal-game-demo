// ============== 音效（纯 WebAudio 合成，零外部文件，离线可用） ==============
// 在 AudioContext 尚未启动时静默跳过（浏览器自动播放策略要求用户交互后才允许发声）。
let _audioCtx = null;
function _getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}
// 合成四种音效：portal(放门) / teleport(传送) / goal(过关) / grab(拾取方块)
function playSound(type) {
  try {
    const ctx = _getAudioCtx();
    const t = ctx.currentTime;
    switch (type) {
      case 'portal': {
        // 高频嗖声：蓝色更亮、橙色更暖
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(900, t);
        o.frequency.exponentialRampToValueAtTime(300, t + 0.18);
        g.gain.setValueAtTime(0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.start(t); o.stop(t + 0.18);
        break;
      }
      case 'teleport': {
        // 低沉嗡鸣：穿越感
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(200, t);
        o.frequency.exponentialRampToValueAtTime(500, t + 0.22);
        g.gain.setValueAtTime(0.08, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.start(t); o.stop(t + 0.22);
        break;
      }
      case 'goal': {
        // 过关：三音上行和弦
        [523, 659, 784].forEach((f, i) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.type = 'sine';
          o.frequency.value = f;
          g.gain.setValueAtTime(0.1, t + i * 0.07);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.35);
          o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.35);
        });
        break;
      }
      case 'grab': {
        // 短促点击
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'square';
        o.frequency.value = 600;
        g.gain.setValueAtTime(0.06, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        o.start(t); o.stop(t + 0.06);
        break;
      }
    }
  } catch (_) { /* AudioContext 未就绪时静默 */ }
}
