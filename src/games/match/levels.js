// Pomar Mágico — fases: 25 feitas à mão (tutorial e introdução de cada
// mecânica) + gerador por gabaritos para as seguintes, com validador que
// joga a fase com um bot guloso e ajusta o número de jogadas até a taxa de
// vitória ficar numa faixa justa (nem impossível, nem de graça).
import { Board } from './board.js';
import { regionFor } from './config.js';

const O = {
  collect: (color, n) => ({ type: 'collect', color, n }),
  score: (n) => ({ type: 'score', n }),
  ice: (n) => ({ type: 'ice', n }),
  box: (n) => ({ type: 'box', n }),
  chain: (n) => ({ type: 'chain', n }),
};
// gabaritos de layout: função (r, c, rows, cols) -> caractere
const L = {
  full: () => '.',
  corners: (r, c, R, C) => ((r === 0 || r === R - 1) && (c === 0 || c === C - 1)) ? 'X' : '.',
  diamond: (r, c, R, C) => (Math.abs(r - (R - 1) / 2) / (R / 2) + Math.abs(c - (C - 1) / 2) / (C / 2) > 1.05) ? 'X' : '.',
  iceBand: (r, c, R) => r >= R - 3 ? 'i' : '.',
  icePatches: (r, c) => ((r + c) % 3 === 0 && r > 1) ? 'i' : '.',
  iceHeavy: (r, c, R) => r >= 2 ? (r >= R - 2 ? 'I' : 'i') : '.',
  iceCenter: (r, c, R, C) => (Math.abs(r - (R - 1) / 2) < 2 && Math.abs(c - (C - 1) / 2) < 2) ? 'I' : (Math.abs(r - (R - 1) / 2) < 3 && Math.abs(c - (C - 1) / 2) < 3) ? 'i' : '.',
  boxBottom: (r, c, R) => r === R - 1 ? 'b' : '.',
  boxPillars: (r, c, R) => (c % 3 === 1 && r >= R - 3) ? 'b' : '.',
  boxHeavy: (r, c, R) => r === R - 1 ? 'B' : r === R - 2 && c % 2 === 0 ? 'b' : '.',
  boxIce: (r, c, R) => r === R - 1 ? 'b' : r >= R - 4 ? 'i' : '.',
  chains: (r, c) => ((r * 3 + c * 5) % 7 === 0 && r > 0) ? 'c' : '.',
  chainIce: (r, c, R) => ((r * 3 + c * 5) % 8 === 0 && r > 0) ? 'c' : r >= R - 3 ? 'i' : '.',
  chainRow: (r, c, R) => r === Math.floor(R / 2) ? 'c' : '.',
  boxChain: (r, c, R) => r === R - 1 ? 'b' : ((r + c) % 4 === 0 && r > 0 && r < R - 2) ? 'c' : '.',
  everything: (r, c, R) => r === R - 1 ? 'b' : r >= R - 4 ? 'i' : ((r * 3 + c * 5) % 9 === 0 && r > 0) ? 'c' : '.',
};
const layout = (fn, rows, cols) => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => fn(r, c, rows, cols)).join(''));
const count = (lay, chars) => lay.join('').split('').filter(ch => chars.includes(ch)).length;

// ---------------------------------------------------------------- 25 fases à mão
// [cols, rows, cores, jogadas, objetivos, gabarito, tutorial]
const HAND = [
  [7, 7, 4, 18, [O.collect(0, 10)], L.full, 'swap'],
  [7, 7, 4, 20, [O.collect(1, 12), O.collect(2, 12)], L.full, null],
  [7, 8, 4, 20, [O.score(3000)], L.full, 'cascade'],
  [7, 8, 4, 20, [O.collect(3, 16)], L.full, 'rocket'],
  [7, 8, 5, 22, [O.collect(4, 12), O.collect(1, 12)], L.full, null],
  [7, 8, 5, 22, [O.score(6000)], L.full, null],
  [7, 8, 5, 20, [O.collect(0, 20)], L.corners, 'bomb'],
  [7, 8, 5, 22, [O.collect(2, 14), O.collect(1, 14)], L.full, null],
  [7, 8, 5, 22, [O.score(7000)], L.diamond, null],
  [7, 8, 5, 22, [O.collect(3, 18), O.collect(2, 10)], L.full, 'color'],
  [7, 8, 5, 24, ['ice'], L.iceBand, 'ice'],
  [7, 8, 5, 24, ['ice', O.collect(4, 10)], L.icePatches, null],
  [7, 8, 5, 26, ['ice'], L.iceHeavy, null],
  [8, 8, 5, 22, [O.score(10000)], L.full, null],
  [8, 8, 5, 26, ['ice'], L.iceCenter, null],
  [8, 8, 5, 24, ['box'], L.boxBottom, 'box'],
  [8, 8, 5, 24, ['box', O.collect(0, 12)], L.boxPillars, null],
  [8, 8, 5, 26, ['box'], L.boxHeavy, null],
  [8, 8, 6, 26, ['box', 'ice'], L.boxIce, null],
  [8, 8, 6, 24, [O.score(11000)], L.full, null],
  [8, 8, 6, 24, ['chain'], L.chains, 'chain'],
  [8, 8, 6, 26, ['chain', 'ice'], L.chainIce, null],
  [8, 8, 6, 26, ['chain', O.collect(2, 12)], L.chainRow, null],
  [8, 9, 6, 28, ['box', 'chain'], L.boxChain, null],
  [8, 9, 6, 30, ['ice', 'box', O.collect(1, 15)], L.everything, null],
];

function build(n, cols, rows, colors, moves, objs, fn, tutorial) {
  const lay = layout(fn, rows, cols);
  const objectives = objs.map(o => o === 'ice' ? O.ice(count(lay, 'i') + count(lay, 'I') * 2) : o === 'box' ? O.box(count(lay, 'b') + count(lay, 'B') * 2) : o === 'chain' ? O.chain(count(lay, 'c')) : o);
  return { n, cols, rows, colors, moves, objectives, layout: lay, tutorial, region: regionFor(n).id, seed: (n * 2654435761 + 12345) >>> 0 };
}

// ---------------------------------------------------------------- gerador (n > 25)
const GEN_LAYOUTS = [L.full, L.corners, L.diamond, L.icePatches, L.iceBand, L.iceCenter, L.boxBottom, L.boxPillars, L.boxIce, L.chains, L.chainIce, L.boxChain, L.everything, L.iceHeavy, L.boxHeavy, L.chainRow];
function generate(n) {
  const h = (n * 2654435761) >>> 0;
  const cols = 8, rows = n % 4 === 0 ? 9 : 8;
  const colors = n < 40 ? 5 : 6;
  const fn = GEN_LAYOUTS[(h >>> 3) % GEN_LAYOUTS.length];
  const lay = layout(fn, rows, cols);
  const objs = [];
  const hasIce = count(lay, 'iI') > 0, hasBox = count(lay, 'bB') > 0, hasChain = count(lay, 'c') > 0;
  if (hasIce) objs.push('ice'); if (hasBox) objs.push('box'); if (hasChain) objs.push('chain');
  const kind = (h >>> 8) % 3;
  if (!objs.length || kind === 0) objs.push(O.collect((h >>> 12) % colors, 14 + Math.min(20, Math.floor(n / 4))));
  if (kind === 1 && objs.length < 2) objs.push(O.collect(((h >>> 12) + 3) % colors, 12 + Math.min(16, Math.floor(n / 5))));
  if (kind === 2 && objs.length < 2) objs.push(O.score(8000 + n * 250));
  const moves = 24 + Math.min(10, Math.floor(n / 12));
  return build(n, cols, rows, colors, moves, objs.slice(0, 3), fn, null);
}

// ---------------------------------------------------------------- validador
// Bot guloso: escolhe a troca que mais remove (com bônus para especiais e
// cores do objetivo). Joga K vezes; devolve taxa de vitória e pontuação.
export function listMoves(b) {
  const out = [];
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) {
    if (!b._canMove(r, c)) continue;
    for (const [dr, dc] of [[0, 1], [1, 0]]) { const r2 = r + dr, c2 = c + dc; if (b._canMove(r2, c2) && b._swapValid(r, c, r2, c2)) out.push({ r1: r, c1: c, r2, c2 }); }
  }
  return out;
}
function botPlay(level, seed) {
  const b = new Board(level, seed);
  let guard = 0;
  while (!b.over && guard++ < 80) {
    const mv = listMoves(b);
    if (!mv.length) break;
    // avalia cada troca pelo tamanho do grupo formado (barato: sem simular a cascata)
    let best = null, bestScore = -1;
    for (const m of mv) {
      b._swap(m.r1, m.c1, m.r2, m.c2);
      const groups = b._findGroups();
      let s = 0;
      for (const g of groups) { s += g.cells.length; if (g.special) s += g.special === 'color' ? 8 : g.special === 'bomb' ? 5 : 3; for (const o of b.objectives) if (o.type === 'collect' && o.color === g.color && o.got < o.n) s += g.cells.length; }
      const pa = b.pieceAt(m.r1, m.c1), pb = b.pieceAt(m.r2, m.c2);
      if (pa && pb && pa.s && pb.s) s += 14; else if ((pa && pa.s === 'color') || (pb && pb.s === 'color')) s += 10;
      for (const x of [[m.r1, m.c1], [m.r2, m.c2]]) { const cell = b.cell(x[0], x[1]); if (cell.ice) s += 2; }
      b._swap(m.r1, m.c1, m.r2, m.c2);
      s += b.rnd() * 1.5;
      if (s > bestScore) { bestScore = s; best = m; }
    }
    b.trySwap(best.r1, best.c1, best.r2, best.c2);
  }
  return { won: b.over === 'won', score: b.score, movesLeft: b.moves, pct: b.progressPct() };
}

export function validate(level, runs = 10) {
  let wins = 0, scoreSum = 0, pctSum = 0;
  for (let i = 0; i < runs; i++) { const r = botPlay(level, level.seed + i * 7919); if (r.won) wins++; scoreSum += r.score; pctSum += r.pct; }
  return { winRate: wins / runs, avgScore: scoreSum / runs, avgPct: pctSum / runs };
}

// Ajusta as jogadas até o bot vencer entre 35% e 75% das vezes (o humano
// joga melhor que o bot guloso, então isso vira "desafiador mas justo").
export function tune(level, runs = 10) {
  const floor = level.n <= 4 ? 12 : 14, ceil = 40;
  let v = validate(level, runs);
  for (let i = 0; i < 10; i++) {
    if (v.winRate < 0.35 && level.moves < ceil) level.moves += 2;
    else if (v.winRate > 0.75 && level.moves > floor) level.moves -= 2;
    else break;
    v = validate(level, runs);
  }
  level.star2 = Math.round(v.avgScore * 1.25 / 100) * 100;
  level.star3 = Math.round(v.avgScore * 1.7 / 100) * 100;
  level.tuned = v;
  return level;
}

const cache = new Map();
export function levelFor(n) {
  if (cache.has(n)) return cache.get(n);
  const lv = n <= HAND.length ? build(n, ...HAND[n - 1]) : generate(n);
  tune(lv, n <= HAND.length ? 8 : 6);
  cache.set(n, lv);
  return lv;
}
