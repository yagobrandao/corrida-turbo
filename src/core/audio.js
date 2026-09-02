// Áudio 100% sintetizado com WebAudio (sem arquivos).
// O AudioContext só é criado/retomado após o primeiro toque do usuário,
// respeitando o bloqueio de autoplay do Safari/Chrome.
const prefs = {
  sound: localStorage.getItem('ct-sound') !== '0',
  music: localStorage.getItem('ct-music') !== '0',
};

let ctx = null;
let musicTimer = null;
let musicGain = null;

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Chamar em qualquer gesto do usuário (click/touch) para destravar o áudio.
export function unlockAudio() {
  ensureCtx();
}

export function getPrefs() { return { ...prefs }; }
export function setSound(v) { prefs.sound = v; localStorage.setItem('ct-sound', v ? '1' : '0'); }
export function setMusic(v) {
  prefs.music = v;
  localStorage.setItem('ct-music', v ? '1' : '0');
  if (!v) stopMusic();
}

export function tone({ freq = 440, dur = 0.15, type = 'square', vol = 0.2, slide = 0, delay = 0 }) {
  if (!prefs.sound) return;
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function noise({ dur = 0.2, vol = 0.25, delay = 0 }) {
  if (!prefs.sound) return;
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t0);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(t0);
}

export const sfx = {
  click:  () => tone({ freq: 600, dur: 0.06, type: 'sine', vol: 0.15 }),
  jump:   () => tone({ freq: 300, dur: 0.18, type: 'square', vol: 0.12, slide: 350 }),
  slide:  () => noise({ dur: 0.15, vol: 0.1 }),
  lane:   () => tone({ freq: 480, dur: 0.05, type: 'triangle', vol: 0.1 }),
  coin:   () => { tone({ freq: 988, dur: 0.07, type: 'square', vol: 0.1 }); tone({ freq: 1319, dur: 0.12, type: 'square', vol: 0.1, delay: 0.06 }); },
  hit:    () => { noise({ dur: 0.3, vol: 0.35 }); tone({ freq: 160, dur: 0.3, type: 'sawtooth', vol: 0.2, slide: -100 }); },
  death:  () => { tone({ freq: 300, dur: 0.5, type: 'sawtooth', vol: 0.2, slide: -240 }); noise({ dur: 0.5, vol: 0.3 }); },
  count:  () => tone({ freq: 700, dur: 0.12, type: 'square', vol: 0.18 }),
  go:     () => tone({ freq: 1050, dur: 0.35, type: 'square', vol: 0.2 }),
  win:    () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'square', vol: 0.15, delay: i * 0.14 })),
  lose:   () => [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.28, type: 'triangle', vol: 0.16, delay: i * 0.18 })),
  powerup:() => [660, 880, 1100].forEach((f, i) => tone({ freq: f, dur: 0.1, type: 'square', vol: 0.12, delay: i * 0.07 })),
};

// Música: arpejo leve em loop, agendado por compasso.
const SCALE = [220, 262, 330, 392, 440, 392, 330, 262];
export function startMusic() {
  if (!prefs.music || musicTimer) return;
  const c = ensureCtx();
  if (!c) return;
  let step = 0;
  musicTimer = setInterval(() => {
    if (!prefs.music) return;
    const f = SCALE[step % SCALE.length] * (step % 16 >= 8 ? 1.5 : 1);
    tone({ freq: f, dur: 0.12, type: 'triangle', vol: 0.05 });
    if (step % 4 === 0) tone({ freq: f / 2, dur: 0.2, type: 'sine', vol: 0.06 });
    step++;
  }, 160);
}

export function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}
