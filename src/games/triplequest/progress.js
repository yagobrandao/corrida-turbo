// Triple Quest — progresso persistente (SaveManager + ProgressionManager).
//
// Moedas são as da PLATAFORMA (core/storage.js): ganhar aqui credita lá,
// comprar booster debita lá — uma economia só, e o GameBridge é esse
// módulo. O resto (fase, estrelas, XP, vidas, boosters, diário) vive numa
// chave própria, num formato que dá para trocar por backend depois.
import { addCoins, spendCoins, getProgress } from '../../core/storage.js';
import { LIVES_MAX, LIFE_REGEN_MS, BOOSTERS, xpToNext, CHESTS } from './config.js';

const KEY = 'ct-tq-v1';

const DEFAULTS = () => ({
  level: 1,                 // próxima fase a jogar
  stars: {},                // n -> 1..3
  cleared: 0,
  threeStars: 0,
  xp: 0,
  lvl: 1,
  boosters: Object.fromEntries(BOOSTERS.map(b => [b.id, b.start])),
  lives: LIVES_MAX,
  livesAt: Date.now(),      // instante em que a regeneração começou a contar
  bestCombo: 0,
  triples: 0,
  daily: { date: '', done: false, moves: null },
  settings: {},
});

let cache = null;
export function load() {
  if (cache) return cache;
  cache = DEFAULTS();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      Object.assign(cache, saved);
      cache.boosters = { ...DEFAULTS().boosters, ...(saved.boosters || {}) };
      cache.daily = { ...DEFAULTS().daily, ...(saved.daily || {}) };
    }
  } catch (_) {}
  regen(cache);
  return cache;
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (_) {}
}

// ---------------------------------------------------------------- vidas
function regen(s) {
  if (s.lives >= LIVES_MAX) { s.livesAt = Date.now(); return; }
  const gained = Math.floor((Date.now() - s.livesAt) / LIFE_REGEN_MS);
  if (gained > 0) {
    s.lives = Math.min(LIVES_MAX, s.lives + gained);
    s.livesAt = s.lives >= LIVES_MAX ? Date.now() : s.livesAt + gained * LIFE_REGEN_MS;
  }
}
export function lives() { const s = load(); regen(s); return s.lives; }
export function nextLifeIn() {
  const s = load(); regen(s);
  if (s.lives >= LIVES_MAX) return 0;
  return Math.max(0, LIFE_REGEN_MS - (Date.now() - s.livesAt));
}
export function loseLife() {
  const s = load(); regen(s);
  if (s.lives >= LIVES_MAX) s.livesAt = Date.now();
  s.lives = Math.max(0, s.lives - 1);
  save();
  return s.lives;
}
export function addLives(n) {
  const s = load(); s.lives = Math.min(LIVES_MAX, s.lives + n); save();
}

// ---------------------------------------------------------------- moedas (ponte com a plataforma)
export const coins = () => getProgress().coins;
export function earnCoins(n) { addCoins(n); }
export function buyBooster(id) {
  const b = BOOSTERS.find(x => x.id === id);
  if (!b || !spendCoins(b.cost)) return false;
  const s = load(); s.boosters[id] = (s.boosters[id] || 0) + 1; save();
  return true;
}
export function useBooster(id) {
  const s = load();
  if ((s.boosters[id] || 0) <= 0) return false;
  s.boosters[id]--; save();
  return true;
}
export function grantBooster(id, n = 1) { const s = load(); s.boosters[id] = (s.boosters[id] || 0) + n; save(); }

// ---------------------------------------------------------------- XP
export function addXp(n) {
  const s = load();
  s.xp += n;
  const ups = [];
  while (s.xp >= xpToNext(s.lvl)) { s.xp -= xpToNext(s.lvl); s.lvl++; ups.push(s.lvl); }
  save();
  return ups;
}

// ---------------------------------------------------------------- fase concluída
export function completeLevel(n, stars, rewards, bestCombo, triples) {
  const s = load();
  const prev = s.stars[n] || 0;
  if (stars > prev) { s.stars[n] = stars; if (stars === 3 && prev < 3) s.threeStars++; }
  if (!prev) s.cleared++;
  if (n === s.level) s.level = n + 1;
  s.bestCombo = Math.max(s.bestCombo, bestCombo);
  s.triples += triples;
  earnCoins(rewards.coins);
  const ups = addXp(rewards.xp);
  save();
  return { levelUps: ups, newRecord: stars > prev };
}

export function openChest(kind) {
  const c = CHESTS[kind];
  if (!c) return null;
  earnCoins(c.coins);
  const ids = BOOSTERS.map(b => b.id);
  const got = [];
  for (let i = 0; i < c.boosters; i++) { const id = ids[Math.floor(Math.random() * ids.length)]; grantBooster(id); got.push(id); }
  if (c.lives) addLives(c.lives);
  return { ...c, got };
}

// ---------------------------------------------------------------- diário
export const todayKey = () => new Date().toISOString().slice(0, 10);
export function dailyState() {
  const s = load();
  if (s.daily.date !== todayKey()) { s.daily = { date: todayKey(), done: false, moves: null }; save(); }
  return s.daily;
}
export function completeDaily(moves) {
  const s = load();
  dailyState();
  s.daily.done = true; s.daily.moves = moves; save();
}

export function summary() {
  const s = load(); regen(s);
  return { ...s, coins: coins(), xpNext: xpToNext(s.lvl), livesMax: LIVES_MAX };
}
