// Progresso persistente no localStorage.
// Tudo é opcional: se o navegador bloquear o storage (modo privado do Safari,
// por exemplo), o jogo continua funcionando com os valores padrão em memória.
import { SLOT_IDS, TINT_SLOTS, PALETTE_IDS } from './cosmetics.js';

const KEY = 'ct-progress-v1';

const DEFAULTS = {
  coins: 0,          // moedas acumuladas em todas as partidas (moeda de compra)
  totalCoins: 0,     // total histórico, nunca diminui — destrava as skins
  bestDist: 0,
  bestScore: 0,
  bestSpeed: 0,
  races: 0,
  wins: 0,
  skin: 'azul',
  // cosméticos equipados, um por categoria (ver core/cosmetics.js): o
  // desenho (formato) e, para as categorias com paleta, a cor escolhida
  // (null = cores originais do desenho — a cor em si nunca custa nada)
  color: 'none', hat: 'none', hair: 'none', glasses: 'none',
  face: 'none', outfit: 'none', wings: 'none', pet: 'none',
  hatTint: null, hairTint: null, glassesTint: null, faceTint: null,
  outfitTint: null, wingsTint: null, petTint: null,
  owned: [],         // ids de cosméticos (desenhos) comprados
  name: '',          // apelido; vazio = usa "Jogador N" do slot
  diff: 'normal',    // última dificuldade escolhida, reaproveitada na próxima sala
  howto: {},         // por jogo: já viu as instruções?
  upgrades: {},      // power-up id -> nível (1 a 5); ausente = nível 1
};

let cache = null;

function read() {
  if (cache) return cache;
  cache = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(cache, JSON.parse(raw));
  } catch (_) {
    // storage indisponível: segue com os padrões
  }
  // migração: o rosto "Descolado" virou o óculos "Escuros" — quem comprou
  // ganha o item novo no lugar, sem perder as moedas
  const owned = cache.owned || [];
  if (owned.includes('cool') && !owned.includes('shades')) {
    cache.owned = [...owned, 'shades'];
    if (cache.face === 'cool') { cache.face = 'none'; cache.glasses = 'shades'; }
  }
  // migração: cor deixou de ser uma peça separada ("cap_ruby") e virou um
  // desenho + uma cor da paleta escolhida à parte. Separa o que já estava
  // equipado e comprado, sem perder nada.
  const splitVariant = (id) => {
    const i = typeof id === 'string' ? id.lastIndexOf('_') : -1;
    if (i <= 0) return null;
    const tint = id.slice(i + 1);
    return PALETTE_IDS.has(tint) ? { base: id.slice(0, i), tint } : null;
  };
  let migrated = false;
  for (const slot of TINT_SLOTS) {
    const v = splitVariant(cache[slot]);
    if (v) { cache[slot] = v.base; if (!cache[slot + 'Tint']) cache[slot + 'Tint'] = v.tint; migrated = true; }
  }
  if (owned.some(id => splitVariant(id))) {
    const cleaned = new Set();
    for (const id of owned) { const v = splitVariant(id); cleaned.add(v ? v.base : id); }
    cache.owned = [...cleaned];
    migrated = true;
  }
  if (migrated) write();
  return cache;
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (_) {
    // cota estourada ou storage bloqueado: ignora, o jogo não depende disso
  }
}

export function getProgress() {
  return { ...read() };
}

// Cosméticos: comprar debita as moedas e registra a posse.
export function buyCosmetic(id, cost) {
  const p = read();
  if ((p.owned || []).includes(id)) return true;
  if (!spendCoins(cost)) return false;
  p.owned = [...(p.owned || []), id];
  write();
  return true;
}

export function equipCosmetic(slot, id) {
  const p = read();
  if (SLOT_IDS.includes(slot)) { p[slot] = id; write(); }
}

// Cor é sempre de graça: não é comprada, só escolhida — vale pra qualquer
// desenho já comprado naquela categoria. `null` volta às cores originais.
export function setTint(slot, tintId) {
  const p = read();
  if (TINT_SLOTS.includes(slot)) { p[slot + 'Tint'] = tintId; write(); }
}

export function setSkin(id) {
  read().skin = id;
  write();
}

// Apelido: no máximo 12 caracteres visíveis, sem quebras nem espaços duplos.
export function sanitizeName(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 12);
}

export function setName(raw) {
  read().name = sanitizeName(raw);
  write();
}

export function setDifficulty(id) {
  read().diff = id;
  write();
}

export function markHowToSeen(gameId) {
  const p = read();
  if (!p.howto || typeof p.howto !== 'object') p.howto = {};
  p.howto[gameId] = true;
  write();
}
export function hasSeenHowTo(gameId) {
  const h = read().howto;
  return !!(h && h[gameId]);
}

// Nível de um power-up (1 = base).
export function upgradeLevel(id) {
  const u = read().upgrades;
  return (u && u[id]) || 1;
}
export function setUpgradeLevel(id, level) {
  const p = read();
  if (!p.upgrades || typeof p.upgrades !== 'object') p.upgrades = {};
  p.upgrades[id] = level;
  write();
}

// Recompensa de missão/conquista: entra nas moedas gastáveis e no total
// histórico (que é o que destrava skins e melhorias).
export function addCoins(n) {
  const p = read();
  p.coins += n;
  p.totalCoins += n;
  write();
}

export function spendCoins(n) {
  const p = read();
  if (p.coins < n) return false;
  p.coins -= n;
  write();
  return true;
}

// Registra o resultado de uma corrida e devolve o que foi recorde,
// para a tela de resultado poder comemorar.
export function recordRace({ dist, score, coins, speed, won }) {
  const p = read();
  const records = {
    dist: dist > p.bestDist,
    score: score > p.bestScore,
    speed: speed > p.bestSpeed,
  };
  p.races++;
  if (won) p.wins++;
  p.coins += coins;
  p.totalCoins += coins;
  if (records.dist) p.bestDist = dist;
  if (records.score) p.bestScore = score;
  if (records.speed) p.bestSpeed = speed;
  write();
  return records;
}

export function resetProgress() {
  cache = { ...DEFAULTS };
  write();
}
