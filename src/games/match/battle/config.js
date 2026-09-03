// Pomar Mágico — Batalha: constantes do modo competitivo (puro, sem Phaser).
export const START_HP = 100;
export const ROUND_MS = 75000;          // 60–90s; padrão 75s
export const INTERMISSION_MS = 10000;   // 8–12s entre rodadas

// energia da barra de ataque: cada trio/quarteto/quinteto/especial soma;
// cascatas multiplicam. Ao chegar em `bar`, dá pra disparar um ataque.
export const ENERGY = {
  match3: 10, match4: 25, match5: 40,
  cascadeMult: 1.15,
  specialBonus: { rh: 15, rv: 15, bomb: 25, color: 45 },
  bar: 100,
};

// cada ataque tem aviso (telegraphMs), efeito limitado e reação possível —
// nunca "trava o jogo", só atrapalha por um tempo ou numa área pequena.
export const ATTACKS = {
  garbage: { name: 'Pedra',       cost: 100, telegraphMs: 1300, blocks: 2 },
  ice:     { name: 'Gelo',        cost: 100, telegraphMs: 1300, pieces: 4 },
  shuffle: { name: 'Embaralhar',  cost: 100, telegraphMs: 1300, pieces: 8 },
  lock:    { name: 'Trava',       cost: 100, telegraphMs: 1300, pieces: 3, durationMs: 6000 },
  cloud:   { name: 'Nuvem',       cost: 100, telegraphMs: 1300, pieces: 6, durationMs: 5000 },
};

// tabuleiro da rodada: mesma forma pros dois lados (roundSeed garante
// dificuldade equivalente), sem objetivo nem limite de jogadas — só o
// tempo manda. Grade cheia e retangular, sem camadas nem obstáculo (o
// mapa da Aventura já cobre gelo/caixa/corrente; a Batalha usa ATAQUES
// pra isso).
export const ROUND_BOARD = { cols: 8, rows: 8, colors: 6 };

export const BOT_BATTLE_PROFILES = {
  easy:   { name: 'Fácil',   think: 1.0,  quality: 0.5 },
  medium: { name: 'Médio',   think: 0.6,  quality: 0.75 },
  hard:   { name: 'Difícil', think: 0.35, quality: 0.95 },
};
