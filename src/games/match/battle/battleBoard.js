// Pomar Mágico — Batalha: camada ADITIVA sobre o Board da Aventura.
//
// Nada aqui muda o Match-3 principal: só LÊ as fases que trySwap/
// useBooster já devolvem (pra virar energia) e ACRESCENTA métodos novos
// pra receber ataques, reaproveitando mecânicas que já existem (gelo,
// caixa, corrente) — board.js continua exatamente como estava.
import { ENERGY, ATTACKS } from './config.js';

// energia ganha por UMA fase 'clear' (chame pra cada fase clear de uma troca)
export function energyFromPhase(ph) {
  if (ph.t !== 'clear') return 0;
  const n = ph.pieces.length + ph.created.length;
  let e = n >= 5 ? ENERGY.match5 : n === 4 ? ENERGY.match4 : n >= 3 ? ENERGY.match3 : 0;
  for (const c of ph.created) e += ENERGY.specialBonus[c.s] || 0;
  if (ph.combo > 1) e *= Math.pow(ENERGY.cascadeMult, ph.combo - 1);
  return Math.round(e);
}

// tipo de ataque a partir do que mais contribuiu na carga atual — liga o
// tipo de ataque ao que o jogador realmente fez, não a uma escolha manual
export function pickAttackType(chargeLog) {
  const has = (pred) => chargeLog.some(pred);
  if (has(c => c.special === 'color')) return 'shuffle';
  if (has(c => c.special === 'bomb')) return 'ice';
  if (has(c => c.combo >= 5)) return 'lock';
  if (has(c => c.special === 'rh' || c.special === 'rv')) return 'garbage';
  return 'cloud';
}

// aplica um ataque recebido num Board vivo (aditivo; board.js não muda)
export function receiveAttack(board, type) {
  const def = ATTACKS[type]; if (!def) return null;
  const free = board._allPieces().filter(p => !p.piece.s);
  if (!free.length) return { type, cells: [] };
  const pick = (n) => { const arr = [...free]; const out = []; for (let i = 0; i < n && arr.length; i++) { const j = Math.floor(board.rnd() * arr.length); out.push(arr.splice(j, 1)[0]); } return out; };
  if (type === 'garbage') {
    const cells = pick(def.blocks);
    for (const c of cells) { c.cell.piece = null; c.cell.box = 1; }
    return { type, cells: cells.map(c => ({ r: c.r, c: c.c })) };
  }
  if (type === 'ice') {
    const cells = pick(def.pieces);
    for (const c of cells) c.cell.ice = Math.min(2, (c.cell.ice || 0) + 1);
    return { type, cells: cells.map(c => ({ r: c.r, c: c.c })) };
  }
  if (type === 'shuffle') {
    const cells = pick(def.pieces);
    const colors = cells.map(c => c.piece.c);
    for (let i = colors.length - 1; i > 0; i--) { const j = Math.floor(board.rnd() * (i + 1)); [colors[i], colors[j]] = [colors[j], colors[i]]; }
    cells.forEach((c, i) => { c.piece.c = colors[i]; });
    return { type, cells: cells.map(c => ({ r: c.r, c: c.c })) };
  }
  if (type === 'lock') {
    const cells = pick(def.pieces);
    const until = (board._attackClock || 0) + def.durationMs;
    for (const c of cells) { c.cell.chain = true; c.cell.lockUntil = until; }
    return { type, cells: cells.map(c => ({ r: c.r, c: c.c })), until };
  }
  if (type === 'cloud') {
    const cells = pick(def.pieces);
    const until = (board._attackClock || 0) + def.durationMs;
    board._fogUntil = board._fogUntil || new Map();
    for (const c of cells) board._fogUntil.set(c.r * 32 + c.c, until);
    return { type, cells: cells.map(c => ({ r: c.r, c: c.c })), until, cosmetic: true };
  }
  return null;
}

// chame a cada tick com o relógio (ms) da rodada: solta travas e nuvem por tempo
export function tickAttacks(board, nowMs) {
  board._attackClock = nowMs;
  const freed = [];
  for (let r = 0; r < board.rows; r++) for (let c = 0; c < board.cols; c++) {
    const cell = board.grid[r][c];
    if (cell.chain && cell.lockUntil !== undefined && nowMs >= cell.lockUntil) { cell.chain = false; cell.lockUntil = undefined; freed.push({ r, c }); }
  }
  if (board._fogUntil) for (const [k, t] of board._fogUntil) if (nowMs >= t) board._fogUntil.delete(k);
  return freed;
}
