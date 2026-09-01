// Geração da arena a partir da seed compartilhada.
//
// Layout clássico e comprovadamente jogável: borda de parede, pilares nas
// células (par, par) e caixotes aleatórios no resto — MENOS nas zonas de
// spawn (o canto + duas células vizinhas), para ninguém nascer preso.
// Como todo caixote é destrutível, sempre existe caminho a bomba.
import { Rng } from '../../core/rng.js';
import { CRATE_CHANCE, DROP_CHANCE, DROPS, GRID_44, GRID_DUO, THEMES } from './config.js';

export const CELL = { FLOOR: 0, WALL: 1, CRATE: 2 };

const DROP_TOTAL = DROPS.reduce((a, d) => a + d.weight, 0);

export function gridFor(playerCount) {
  return playerCount <= 2 ? GRID_DUO : GRID_44;
}

// Cantos em ordem de slot: cada jogador nasce numa região diferente.
export function spawnPoints(grid) {
  const { cols, rows } = grid;
  return [
    { c: 1, r: 1 },
    { c: cols - 2, r: rows - 2 },
    { c: cols - 2, r: 1 },
    { c: 1, r: rows - 2 },
  ];
}

// Gera a arena. Devolve { cells (matriz), drops (Map "c,r" -> tipo), theme }.
// `drops` já é decidido aqui pela seed: quando o caixote quebra, todos os
// aparelhos revelam o MESMO item sem trocar mensagem nenhuma.
export function generateArena(seed, playerCount, round) {
  const rng = new Rng((seed + round * 104729) >>> 0);
  const grid = gridFor(playerCount);
  const { cols, rows } = grid;
  const theme = THEMES[Math.floor(rng.next() * THEMES.length)];

  const cells = [];
  for (let r = 0; r < rows; r++) {
    cells.push(new Array(cols).fill(CELL.FLOOR));
  }

  // borda + pilares
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) cells[r][c] = CELL.WALL;
      else if (r % 2 === 0 && c % 2 === 0) cells[r][c] = CELL.WALL;
    }
  }

  // zonas de spawn protegidas: canto + DUAS células por braço, para a
  // primeira bomba (alcance 1) sempre ter rota de fuga em linha reta
  const safe = new Set();
  for (const s of spawnPoints(grid).slice(0, Math.max(2, playerCount))) {
    for (const [dc, dr] of [[0, 0], [1, 0], [2, 0], [-1, 0], [-2, 0], [0, 1], [0, 2], [0, -1], [0, -2]]) {
      safe.add(`${s.c + dc},${s.r + dr}`);
    }
  }

  // caixotes
  const drops = new Map();
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (cells[r][c] !== CELL.FLOOR || safe.has(`${c},${r}`)) continue;
      if (rng.next() < CRATE_CHANCE) {
        cells[r][c] = CELL.CRATE;
        if (rng.next() < DROP_CHANCE) {
          let x = rng.next() * DROP_TOTAL;
          for (const d of DROPS) {
            x -= d.weight;
            if (x <= 0) { drops.set(`${c},${r}`, d.id); break; }
          }
        }
      }
    }
  }

  return { grid, cells, drops, theme };
}

// Anel de lava n (0 = borda interna) para o fim da rodada.
// Devolve as células do anel que ainda são chão/caixote.
export function ringCells(grid, n) {
  const { cols, rows } = grid;
  const out = [];
  const cMin = 1 + n, cMax = cols - 2 - n, rMin = 1 + n, rMax = rows - 2 - n;
  if (cMin > cMax || rMin > rMax) return out;
  for (let c = cMin; c <= cMax; c++) {
    out.push({ c, r: rMin });
    if (rMax !== rMin) out.push({ c, r: rMax });
  }
  for (let r = rMin + 1; r < rMax; r++) {
    out.push({ c: cMin, r });
    if (cMax !== cMin) out.push({ c: cMax, r });
  }
  return out;
}
