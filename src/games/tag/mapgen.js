// Arena do Pega-Pega, gerada pela seed compartilhada.
//
// Diferente do Bomb Arena, aqui o mapa é ABERTO: poucos obstáculos, com
// espaçamento mínimo de 1 célula entre eles e das bordas. Essa regra garante
// que nenhum canto fica isolado (sempre dá para contornar qualquer obstáculo)
// e cria os corredores e rotas de fuga que uma perseguição pede.
import { Rng } from '../../core/rng.js';
import { GRID, GRID_DUO, THEMES } from './config.js';

export const OB = { WALL: 'wall', ROCK: 'rock', TREE: 'tree' };

export function gridFor(playerCount) {
  return playerCount <= 2 ? GRID_DUO : GRID;
}

// Cantos em ordem de slot (mesma convenção do resto da plataforma).
export function spawnPoints(grid) {
  const { cols, rows } = grid;
  return [
    { c: 1, r: 1 },
    { c: cols - 2, r: rows - 2 },
    { c: cols - 2, r: 1 },
    { c: 1, r: rows - 2 },
  ];
}

export function generateArena(seed, playerCount, round) {
  const rng = new Rng((seed + round * 62497) >>> 0);
  const grid = gridFor(playerCount);
  const { cols, rows } = grid;
  const theme = THEMES[Math.floor(rng.next() * THEMES.length)];

  // matriz de ocupação: borda é parede, resto livre
  const solid = [];
  for (let r = 0; r < rows; r++) {
    solid.push(new Array(cols).fill(false));
    for (let c = 0; c < cols; c++) {
      if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) solid[r][c] = true;
    }
  }

  // zonas de spawn intocáveis
  const banned = new Set();
  for (const s of spawnPoints(grid).slice(0, Math.max(2, playerCount))) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) banned.add(`${s.c + dc},${s.r + dr}`);
    }
  }

  // obstáculos: peças 1x1, 2x1 e 1x2, cada uma exigindo um anel livre em volta
  const obstacles = [];   // { c, r, w, h, kind }
  const target = Math.floor(cols * rows * 0.085);
  let tries = 0;
  while (obstacles.length < target && tries < 300) {
    tries++;
    const w = rng.chance(0.4) ? 2 : 1;
    const h = w === 2 ? 1 : (rng.chance(0.4) ? 2 : 1);
    const c = rng.int(2, cols - 2 - w);
    const r = rng.int(2, rows - 2 - h);

    // checa a peça + o anel de 1 célula em volta
    let ok = true;
    for (let rr = r - 1; rr <= r + h && ok; rr++) {
      for (let cc = c - 1; cc <= c + w && ok; cc++) {
        if (solid[rr][cc] || banned.has(`${cc},${rr}`)) ok = false;
      }
    }
    if (!ok) continue;

    for (let rr = r; rr < r + h; rr++) {
      for (let cc = c; cc < c + w; cc++) solid[rr][cc] = true;
    }
    const kind = rng.pick([OB.WALL, OB.ROCK, OB.TREE]);
    obstacles.push({ c, r, w, h, kind });
  }

  // células livres (para nascer power-up)
  const free = [];
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (!solid[r][c] && !banned.has(`${c},${r}`)) free.push({ c, r });
    }
  }

  return { grid, solid, obstacles, free, theme };
}
