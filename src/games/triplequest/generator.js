// Triple Quest — gerador de fases (puro, determinístico por seed).
//
// Uma fase é uma lista de peças em (gx, gy, layer). As coordenadas são em
// MEIAS peças: peças da mesma camada ficam a 2 unidades uma da outra, e
// camadas alternadas deslocam meia peça, então uma peça de cima "senta" em
// quatro de baixo. Duas peças se sobrepõem quando |dx| < 2 e |dy| < 2.
//
// Formas: uma máscara em células (coração, estrela...) dá a camada 0; cada
// camada seguinte só existe onde tem quatro apoios embaixo, o que cria
// pirâmides naturais. Os tipos são sorteados em trios e a fase é validada
// por um resolvedor guloso — se ele não fecha, sorteia de novo.
import { mulberry32 } from '../../core/rng.js';
import { TILE_TYPES, TRAY_SIZE, levelParams } from './config.js';

// ---------------------------------------------------------------- máscaras (u, v em 0..1)
const MASKS = {
  pyramid: (u, v) => Math.abs(u - 0.5) <= v * 0.55 + 0.08,
  diamond: (u, v) => Math.abs(u - 0.5) + Math.abs(v - 0.5) <= 0.52,
  circle: (u, v) => ((u - 0.5) ** 2 + (v - 0.5) ** 2) <= 0.24,
  ring: (u, v) => { const d = (u - 0.5) ** 2 + (v - 0.5) ** 2; return d <= 0.26 && d >= 0.05; },
  heart: (u, v) => {
    const x = (u - 0.5) * 2.6, y = (0.42 - v) * 2.6;
    return Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y <= 0;
  },
  star: (u, v) => {
    const x = u - 0.5, y = v - 0.5, r = Math.hypot(x, y), a = Math.atan2(y, x);
    return r <= 0.24 + 0.24 * Math.abs(Math.cos(2.5 * a + Math.PI / 2));
  },
  cross: (u, v) => Math.abs(u - 0.5) <= 0.18 || Math.abs(v - 0.5) <= 0.18,
  island: (u, v) => ((u - 0.5) ** 2 / 0.3 + (v - 0.55) ** 2 / 0.16) <= 1,
  butterfly: (u, v) => { const x = Math.abs(u - 0.5), y = v - 0.5; return (x - 0.28) ** 2 + y * y <= 0.07 || (x <= 0.08 && Math.abs(y) <= 0.4); },
  tower: (u, v) => Math.abs(u - 0.5) <= 0.22 + (v > 0.7 ? 0.2 : 0),
};

const key = (gx, gy, l) => `${gx},${gy},${l}`;

// Posições candidatas de uma grade W×H com a máscara, todas as camadas,
// ordenadas por camada e depois pela distância ao centro.
function candidates(shape, W, H, layers, rnd, holeRate) {
  const mask = MASKS[shape] || MASKS.diamond;
  const out = [];
  const has = new Set();
  for (let l = 0; l < layers; l++) {
    const off = l % 2;
    const cells = [];
    for (let cy = 0; cy < H - off; cy++) for (let cx = 0; cx < W - off; cx++) {
      const u = (cx + 0.5 + off * 0.5) / W, v = (cy + 0.5 + off * 0.5) / H;
      if (!mask(u, v)) continue;
      const gx = 2 * cx + off, gy = 2 * cy + off;
      if (l > 0) {
        // precisa dos quatro apoios na camada de baixo
        const ok = [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([dx, dy]) => has.has(key(gx + dx, gy + dy, l - 1)));
        if (!ok) continue;
      } else if (holeRate && rnd() < holeRate) continue;
      cells.push({ gx, gy, layer: l, d: Math.hypot(u - 0.5, v - 0.5) });
    }
    cells.sort((a, b) => a.d - b.d);
    for (const c of cells) { has.add(key(c.gx, c.gy, l)); out.push(c); }
  }
  return out;
}

// ---------------------------------------------------------------- livre / coberta
export function covers(a, b) {
  return a.layer > b.layer && Math.abs(a.gx - b.gx) < 2 && Math.abs(a.gy - b.gy) < 2;
}
export function isFree(tile, tiles) {
  if (!tile.alive || tile.frozen > 0 || tile.locked) return false;
  for (const o of tiles) if (o.alive && o !== tile && covers(o, tile)) return false;
  return true;
}

// ---------------------------------------------------------------- resolvedor guloso
// Devolve true se a fase fecha jogando "com bom senso"; também serve de dica.
export function solvable(tilesIn, traySize) {
  const tiles = tilesIn.map(t => ({ ...t, alive: true }));
  const tray = [];
  let guard = 0;
  while (tiles.some(t => t.alive) && guard++ < 1000) {
    const frees = tiles.filter(t => isFree(t, tiles));
    if (!frees.length) return false;
    const pick = chooseGreedy(frees, tray, tiles);
    if (!pick) return false;
    pick.alive = false;
    tray.push(pick.type);
    const n = tray.filter(x => x === pick.type).length;
    if (n >= 3) { for (let i = 0; i < 3; i++) tray.splice(tray.indexOf(pick.type), 1); onTriple(tiles, pick.type); }
    else if (tray.length >= traySize) return false;
  }
  return !tiles.some(t => t.alive);
}

function onTriple(tiles, type) {
  for (const t of tiles) {
    if (t.frozen > 0) t.frozen--;
    if (t.locked === type) t.locked = null;
  }
}

// Ordem: fecha trio → continua par com cópia livre → tipo com 3 livres →
// par → qualquer, preferindo camadas altas (libera mais).
export function chooseGreedy(frees, tray, tiles) {
  const inTray = (type) => tray.filter(x => x === type).length;
  const freeOf = (type) => frees.filter(f => f.type === type).length;
  const byLayer = (a, b) => b.layer - a.layer;
  const c3 = frees.filter(f => inTray(f.type) === 2).sort(byLayer);
  if (c3.length) return c3[0];
  const c2 = frees.filter(f => inTray(f.type) === 1 && freeOf(f.type) >= 2).sort(byLayer);
  if (c2.length) return c2[0];
  const c1 = frees.filter(f => freeOf(f.type) >= 3).sort(byLayer);
  if (c1.length) return c1[0];
  const c0 = frees.filter(f => inTray(f.type) === 1).sort(byLayer);
  if (c0.length && tray.length < TRAY_SIZE - 1) return c0[0];
  // último caso: só arrisca se houver espaço de sobra na bandeja
  if (tray.length <= TRAY_SIZE - 3) return frees.sort(byLayer)[0];
  return c0[0] || frees.sort(byLayer)[0];
}

// ---------------------------------------------------------------- geração
export function generateLevel(n, seedIn = null, relax = 0) {
  const p = levelParams(n);
  // fase que o resolvedor não fecha: tenta de novo com menos camadas e sem
  // mecânicas especiais (relax cresce a cada tentativa)
  if (relax) { p.layers = Math.max(1, p.layers - relax); p.frozen = 0; p.locked = 0; }
  const seed = (seedIn === null ? (n * 2654435761) : seedIn) >>> 0;
  const rnd = mulberry32(seed + relax * 977);
  const types = pickTypes(p.types, rnd);
  let W = 4, tiles = null;
  // acha a menor grade que comporta as peças pedidas
  for (W = 4; W <= 9; W++) {
    const cand = candidates(p.shape, W, W + 1, p.layers, rnd, n > 8 ? 0.08 : 0);
    if (cand.length >= p.tiles) { tiles = cand.slice(0, p.tiles); break; }
    if (W === 9) tiles = cand.slice(0, Math.floor(cand.length / 3) * 3);
  }
  // garante múltiplo de 3 e reindexa
  tiles = tiles.slice(0, Math.floor(tiles.length / 3) * 3).map((t, i) => ({ id: i, gx: t.gx, gy: t.gy, layer: t.layer, type: null, frozen: 0, locked: null, alive: true }));

  // tipos em trios; tenta até o resolvedor aprovar
  let ok = false;
  for (let attempt = 0; attempt < 40 && !ok; attempt++) {
    assignTypes(tiles, types, rnd);
    applySpecials(tiles, p, types, rnd);
    ok = solvable(tiles, TRAY_SIZE);
    if (!ok) for (const t of tiles) { t.frozen = 0; t.locked = null; }
  }
  if (!ok && relax < 4) return generateLevel(n, seedIn, relax + 1);
  return { n, seed, shape: p.shape, traySize: TRAY_SIZE, moves: p.moves, tiles, solvable: ok };
}

function pickTypes(k, rnd) {
  const pool = TILE_TYPES.map(t => t.id);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, k);
}

function assignTypes(tiles, types, rnd) {
  const bag = [];
  const triples = tiles.length / 3;
  for (let i = 0; i < triples; i++) { const t = types[i % types.length]; bag.push(t, t, t); }
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  tiles.forEach((t, i) => { t.type = bag[i]; });
}

function applySpecials(tiles, p, types, rnd) {
  if (!p.frozen && !p.locked) return;
  const top = [...tiles].sort((a, b) => b.layer - a.layer);
  let placed = 0;
  for (const t of top) {
    if (placed >= p.frozen) break;
    if (rnd() < 0.5) { t.frozen = 2; placed++; }
  }
  placed = 0;
  for (const t of top) {
    if (placed >= p.locked) break;
    if (t.frozen || rnd() < 0.5) continue;
    const other = types.filter(x => x !== t.type);
    t.locked = other[Math.floor(rnd() * other.length)];
    placed++;
  }
}

// Desafio diário: mesma fase para todo mundo no mesmo dia, com limite de jogadas.
export function dailyLevel(dateKey, moves) {
  let h = 2166136261;
  for (const ch of dateKey) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const n = 12 + (h >>> 0) % 10;
  const lv = generateLevel(n, h >>> 0);
  return { ...lv, n: 'daily', moves, dateKey };
}
