// Pomar Mágico — SaveManager + ProgressionManager + GameBridge.
//
// Moedas são as da PLATAFORMA (core/storage.js): ganhar aqui credita lá,
// gastar aqui debita lá — uma economia só. O resto (fase, estrelas, XP,
// vidas, boosters, login diário, missões, roda, baús, coleção, ilha,
// evento, ajustes) vive numa chave própria, em formato trocável por backend.
import { addCoins, spendCoins, getProgress } from '../../core/storage.js';
import { mulberry32 } from '../../core/rng.js';
import { LIVES_MAX, LIFE_REGEN_MS, BOOSTERS, xpToNext, LEVEL_UP_REWARD, CHESTS, COLLECTION, DAILY_LOGIN, WHEEL, MISSION_POOL, EVENT, ISLAND, levelRewards } from './config.js';

const KEY = 'ct-m3-v1';
export const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const weekKey = () => { const d = new Date(); const onejan = new Date(d.getFullYear(), 0, 1); return `${d.getFullYear()}-w${Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7)}`; };
const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

const DEFAULTS = () => ({
  level: 1, stars: {}, scores: {}, cleared: 0, threeStars: 0,
  xp: 0, lvl: 1,
  boosters: Object.fromEntries(BOOSTERS.map(b => [b.id, b.start])),
  lives: LIVES_MAX, livesAt: Date.now(),
  login: { last: '', streak: 0, day: 0 },          // day: próximo índice do ciclo de 7
  missions: { daily: { date: '', list: [] }, weekly: { week: '', list: [] } },
  wheel: { date: '' },
  chests: { common: 0, rare: 0, epic: 0, legendary: 0 },
  cards: [],
  island: { built: [], spent: 0 },
  event: { start: '', keys: 0, claimed: 0 },
  settings: { vibration: true },
  stats: { matches: 0, rockets: 0, bombs: 0, colorBombs: 0, specials: 0, bestCombo: 0 },
});

let cache = null;
export function load() {
  if (cache) return cache;
  cache = DEFAULTS();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const d = DEFAULTS();
      Object.assign(cache, saved);
      for (const k of ['boosters', 'login', 'missions', 'wheel', 'chests', 'island', 'event', 'settings', 'stats']) cache[k] = { ...d[k], ...(saved[k] || {}) };
      cache.missions.daily = { ...d.missions.daily, ...(cache.missions.daily || {}) };
      cache.missions.weekly = { ...d.missions.weekly, ...(cache.missions.weekly || {}) };
    }
  } catch (_) {}
  regen(cache);
  return cache;
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (_) {} }
export const coins = () => getProgress().coins;

// ---------------------------------------------------------------- vidas
function regen(s) {
  if (s.lives >= LIVES_MAX) { s.livesAt = Date.now(); return; }
  const gained = Math.floor((Date.now() - s.livesAt) / LIFE_REGEN_MS);
  if (gained > 0) { s.lives = Math.min(LIVES_MAX, s.lives + gained); s.livesAt = s.lives >= LIVES_MAX ? Date.now() : s.livesAt + gained * LIFE_REGEN_MS; }
}
export function lives() { const s = load(); regen(s); return s.lives; }
export function nextLifeIn() { const s = load(); regen(s); return s.lives >= LIVES_MAX ? 0 : Math.max(0, LIFE_REGEN_MS - (Date.now() - s.livesAt)); }
export function loseLife() { const s = load(); regen(s); if (s.lives > 0) { if (s.lives === LIVES_MAX) s.livesAt = Date.now(); s.lives--; } save(); return s.lives; }
export function addLives(n) { const s = load(); regen(s); s.lives = Math.min(LIVES_MAX, s.lives + n); save(); }
export function buyLife(cost = 150) { if (!spendCoins(cost)) return false; addLives(1); return true; }

// ---------------------------------------------------------------- fases
export function completeLevel(n, stars, score, boardStats) {
  const s = load();
  const first = !s.stars[n];
  const prevStars = s.stars[n] || 0;
  s.stars[n] = Math.max(prevStars, stars);
  s.scores[n] = Math.max(s.scores[n] || 0, score);
  if (first) s.cleared++;
  if (stars === 3 && prevStars < 3) s.threeStars++;
  if (n >= s.level) s.level = n + 1;
  const rw = levelRewards(n, stars, score);
  addCoins(rw.coins);
  const up = addXp(rw.xp);
  // estatísticas + missões
  if (boardStats) {
    s.stats.matches += boardStats.matches; s.stats.rockets += boardStats.rockets; s.stats.bombs += boardStats.bombs; s.stats.colorBombs += boardStats.colorBombs; s.stats.specials += boardStats.specialsUsed;
    s.stats.bestCombo = Math.max(s.stats.bestCombo, boardStats.cascadeMax);
    missionProgress('matches', boardStats.matches); missionProgress('rockets', boardStats.rockets); missionProgress('bombs', boardStats.bombs); missionProgress('specials', boardStats.specialsUsed); missionProgress('combo', boardStats.cascadeMax);
  }
  missionProgress('levels', 1); missionProgress('stars', Math.max(0, stars - prevStars));
  // evento
  const ev = eventState();
  const keys = ev.active ? EVENT.keysPerWin[stars - 1] || 2 : 0;
  if (keys) { s.event.keys += keys; }
  save();
  return { ...rw, levelUp: up, first, keys, starsGained: Math.max(0, stars - prevStars) };
}
export function totalStars() { const s = load(); return Object.values(s.stars).reduce((a, b) => a + b, 0); }
export function starsAvailable() { const s = load(); return totalStars() - s.island.spent; }

// ---------------------------------------------------------------- XP
export function addXp(n) {
  const s = load(); s.xp += n; let up = null;
  while (s.xp >= xpToNext(s.lvl)) { s.xp -= xpToNext(s.lvl); s.lvl++; const rw = LEVEL_UP_REWARD(s.lvl); addCoins(rw.coins); if (rw.chest) s.chests[rw.chest]++; if (rw.booster) s.boosters[rw.booster]++; up = { lvl: s.lvl, ...rw }; }
  save(); return up;
}

// ---------------------------------------------------------------- boosters
export function boosterCount(id) { return load().boosters[id] || 0; }
export function useBooster(id) { const s = load(); if (!s.boosters[id]) return false; s.boosters[id]--; save(); return true; }
export function grantBooster(id, n = 1) { const s = load(); s.boosters[id] = (s.boosters[id] || 0) + n; save(); }
export function buyBooster(id) { const b = BOOSTERS.find(x => x.id === id); if (!b || !spendCoins(b.cost)) return false; grantBooster(id); return true; }
export function spend(n) { return spendCoins(n); }
export function earn(n) { addCoins(n); }

// ---------------------------------------------------------------- login diário
export function loginState() {
  const s = load(); const today = todayKey();
  if (s.login.last === today) return { claimable: false, day: s.login.day, streak: s.login.streak };
  const gap = s.login.last ? dayDiff(s.login.last, today) : 99;
  const streak = gap === 1 ? s.login.streak : 0;
  const day = gap === 1 ? s.login.day % 7 : 0;
  return { claimable: true, day, streak, broke: gap > 1 && s.login.streak > 0 };
}
export function claimLogin() {
  const st = loginState(); if (!st.claimable) return null;
  const s = load(); const rw = DAILY_LOGIN[st.day];
  s.login = { last: todayKey(), streak: st.streak + 1, day: st.day + 1 };
  applyReward(rw); save();
  return { ...rw, day: st.day, streak: s.login.streak };
}
export function applyReward(rw) {
  const s = load();
  if (rw.coins) addCoins(rw.coins);
  if (rw.booster) s.boosters[rw.booster] = (s.boosters[rw.booster] || 0) + 1;
  if (rw.chest) s.chests[rw.chest]++;
  if (rw.lives) addLives(rw.lives);
  save();
}

// ---------------------------------------------------------------- missões
function rollMissions(pool, n, seedStr) {
  let h = 2166136261; for (const ch of seedStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = mulberry32(h >>> 0);
  const list = [...pool].sort(() => rnd() - 0.5).slice(0, n);
  return list.map(m => ({ ...m, got: 0, claimed: false }));
}
export function missions() {
  const s = load();
  if (s.missions.daily.date !== todayKey()) s.missions.daily = { date: todayKey(), list: rollMissions(MISSION_POOL.daily, 3, 'd' + todayKey()) };
  if (s.missions.weekly.week !== weekKey()) s.missions.weekly = { week: weekKey(), list: rollMissions(MISSION_POOL.weekly, 2, 'w' + weekKey()) };
  save();
  return s.missions;
}
export function missionProgress(metric, n) {
  if (!n) return;
  const m = missions();
  for (const list of [m.daily.list, m.weekly.list]) for (const x of list) if (x.metric === metric && !x.claimed) x.got = x.best ? Math.max(x.got, n) : Math.min(x.n, x.got + n);
  save();
}
export function claimMission(id) {
  const m = missions();
  for (const list of [m.daily.list, m.weekly.list]) for (const x of list) if (x.id === id && x.got >= x.n && !x.claimed) { x.claimed = true; applyReward(x); save(); return x; }
  return null;
}
export function missionsClaimable() { const m = missions(); return [...m.daily.list, ...m.weekly.list].some(x => x.got >= x.n && !x.claimed); }

// ---------------------------------------------------------------- roda
export function wheelAvailable() { return load().wheel.date !== todayKey(); }
export function spinWheel() {
  const s = load(); if (!wheelAvailable()) return null;
  const i = Math.floor(Math.random() * WHEEL.length);
  s.wheel.date = todayKey(); applyReward(WHEEL[i]); save();
  return { index: i, reward: WHEEL[i] };
}

// ---------------------------------------------------------------- baús e coleção
export function openChest(type) {
  const s = load(); if (!s.chests[type]) return null;
  s.chests[type]--;
  const def = CHESTS[type];
  const out = { coins: def.coins[0] + Math.floor(Math.random() * (def.coins[1] - def.coins[0])), boosters: [], lives: def.lives, card: null };
  addCoins(out.coins);
  for (let i = 0; i < def.boosters; i++) { const b = BOOSTERS[Math.floor(Math.random() * BOOSTERS.length)].id; s.boosters[b]++; out.boosters.push(b); }
  if (def.lives) addLives(def.lives);
  if (Math.random() < def.card) {
    const missing = COLLECTION.filter(c => !s.cards.includes(c.id));
    if (missing.length) { const card = missing[Math.floor(Math.random() * missing.length)]; s.cards.push(card.id); out.card = card; if (s.cards.length === COLLECTION.length && !s.collectionDone) { s.collectionDone = true; s.chests.legendary++; out.collectionDone = true; } }
  }
  save(); return out;
}
export function grantChest(type) { const s = load(); s.chests[type] = (s.chests[type] || 0) + 1; save(); }

// ---------------------------------------------------------------- ilha
export function islandBuild(id) {
  const s = load(); const b = ISLAND.find(x => x.id === id);
  if (!b || s.island.built.includes(id) || starsAvailable() < b.cost) return null;
  s.island.spent += b.cost; s.island.built.push(id);
  addCoins(b.coins);
  let card = null;
  if (b.card && !s.cards.includes(b.card)) { s.cards.push(b.card); card = COLLECTION.find(c => c.id === b.card); }
  save(); return { ...b, cardGot: card };
}
export function nextBuilding() { const s = load(); return ISLAND.find(b => !s.island.built.includes(b.id)) || null; }

// ---------------------------------------------------------------- evento
export function eventState() {
  const s = load();
  if (!s.event.start || dayDiff(s.event.start, todayKey()) >= EVENT.days) { s.event = { start: todayKey(), keys: 0, claimed: 0 }; save(); }
  const daysLeft = EVENT.days - dayDiff(s.event.start, todayKey());
  return { active: true, keys: s.event.keys, goal: EVENT.goal, daysLeft, claimed: s.event.claimed, canClaim: s.event.keys >= EVENT.goal };
}
export function claimEvent() { const s = load(); if (s.event.keys < EVENT.goal) return null; s.event.keys -= EVENT.goal; s.event.claimed++; s.chests[EVENT.chest]++; save(); return EVENT.chest; }

// ---------------------------------------------------------------- ajustes
export function setVibration(v) { const s = load(); s.settings.vibration = v; save(); }
export function vibration() { return load().settings.vibration !== false; }

export function summary() {
  const s = load();
  return { level: s.level, cleared: s.cleared, threeStars: s.threeStars, xp: s.xp, lvl: s.lvl, xpNext: xpToNext(s.lvl), lives: lives(), stars: totalStars(), cards: s.cards.length, built: s.island.built.length, streak: s.login.streak, stats: s.stats };
}
