// Constantes do Tower Defense.
export const COLS = 9;
export const ROWS = 12;
export const TILE = 48;

export const START_COINS = 220;   // moedas DA PARTIDA (resetam ao fim)
export const BASE_LIVES = 10;
export const PREP_TIME = 12;      // s entre ondas
export const EARLY_BONUS = 2;     // moedas por segundo economizado no INICIAR AGORA

// Mapas: caminho em coordenadas de célula (c, r). O primeiro ponto fica fora
// da tela (entrada) e o último é a base. `unlock` usa o nível da plataforma.
export const MAPS = [
  {
    id: 'forest', name: 'Floresta', unlock: 1,
    grassA: 0x8fca5e, grassB: 0x83bf54, path: 0xc9a56b, pathEdge: 0xa5834e,
    waypoints: [[-1, 1], [7, 1], [7, 4], [1, 4], [1, 7], [7, 7], [7, 10], [4, 10]],
  },
  {
    id: 'desert', name: 'Deserto', unlock: 3,
    grassA: 0xe8cf8f, grassB: 0xdfc27d, path: 0xb08748, pathEdge: 0x8f6c38,
    waypoints: [[4, -1], [4, 2], [1, 2], [1, 5], [7, 5], [7, 8], [1, 8], [1, 10], [6, 10]],
  },
  {
    id: 'volcano', name: 'Vulcão', unlock: 6,
    grassA: 0x6b6474, grassB: 0x5e5769, path: 0x4a4356, pathEdge: 0x38323f,
    waypoints: [[-1, 10], [4, 10], [4, 7], [1, 7], [1, 3], [6, 3], [6, 1], [8, 1]],
  },
];

// Torres: stats por nível (1..5). `unlock` usa o nível da plataforma.
// Aos 3 pontos de nível o jogador escolhe um RAMO (rapidez ou força).
const growth = (base, per) => [1, 2, 3, 4, 5].map(lv => Math.round((base + per * (lv - 1)) * 10) / 10);
export const TOWERS = [
  {
    id: 'archer', name: 'Arqueiro', color: 0x39a9f4, dark: 0x1b6bb0, unlock: 1,
    cost: 50, upCost: [0, 45, 70, 110, 160],
    dmg: growth(14, 7), range: growth(130, 8), rate: growth(0.8, -0.07),
    splash: 0, slow: 0,
    desc: 'Rápido e confiável',
  },
  {
    id: 'mage', name: 'Mago', color: 0xa06bde, dark: 0x6b3fa0, unlock: 1,
    cost: 100, upCost: [0, 80, 120, 180, 260],
    dmg: growth(34, 16), range: growth(120, 7), rate: growth(1.5, -0.1),
    splash: 46, slow: 0,
    desc: 'Dano alto em área pequena',
  },
  {
    id: 'ice', name: 'Gelo', color: 0x3ddad7, dark: 0x1a8b89, unlock: 5,
    cost: 120, upCost: [0, 90, 130, 190, 270],
    dmg: growth(6, 3), range: growth(110, 7), rate: growth(1.0, -0.06),
    splash: 0, slow: 0.42,       // reduz 42% da velocidade por 1.4s
    desc: 'Congela quem passa perto',
  },
  {
    id: 'cannon', name: 'Canhão', color: 0xe8483f, dark: 0x9c2820, unlock: 10,
    cost: 150, upCost: [0, 110, 170, 250, 360],
    dmg: growth(40, 22), range: growth(115, 6), rate: growth(2.2, -0.15),
    splash: 78, slow: 0,
    desc: 'Explosão devastadora, lenta',
  },
];
export const SLOW_TIME = 1.4;
export const SELL_RATIO = 0.6;

// Ramos escolhidos no nível 3.
export const BRANCHES = [
  { id: 'speed', name: 'Rapidez', desc: '+40% cadência', rateMult: 1 / 1.4, dmgMult: 1 },
  { id: 'power', name: 'Força', desc: '+50% dano', rateMult: 1, dmgMult: 1.5 },
];

// Inimigos. hp/reward escalam com a onda em waves().
export const ENEMIES = {
  basic: { name: 'Lesma',    hp: 36,  speed: 62,  reward: 8,  lives: 1, color: 0x8fe66a, size: 17 },
  fast:  { name: 'Zippy',    hp: 22,  speed: 118, reward: 10, lives: 1, color: 0xffd23e, size: 13 },
  tank:  { name: 'Brutus',   hp: 150, speed: 36,  reward: 22, lives: 2, color: 0x8d93a8, size: 22 },
  ghost: { name: 'Vulto',    hp: 55,  speed: 70,  reward: 16, lives: 1, color: 0xb7a5f7, size: 16, phasing: true },
  boss:  { name: 'Golem',    hp: 1400, speed: 26, reward: 120, lives: 5, color: 0xd45de0, size: 30, boss: true },
};

// Composição da onda n (1-based). Boss a cada 10.
export function waveSpec(n) {
  const out = [];
  const push = (type, count, gap) => { for (let i = 0; i < count; i++) out.push({ type, gap }); };
  if (n % 10 === 0) {
    push('boss', 1 + Math.floor(n / 30), 2.2);
    push('basic', 6, 0.7);
  } else {
    push('basic', 5 + Math.floor(n * 1.4), 0.8);
    if (n >= 3) push('fast', Math.floor(n * 0.8), 0.5);
    if (n >= 5) push('tank', Math.floor(n / 3), 1.6);
    if (n >= 7) push('ghost', Math.floor(n / 4), 1.1);
  }
  return out;
}

// Multiplicador de HP/recompensa por onda.
export const hpMult = (n) => 1 + (n - 1) * 0.17 + Math.pow(Math.max(0, n - 12), 1.5) * 0.012;
export const rewardMult = (n) => 1 + (n - 1) * 0.05;

// Recompensa por fechar a onda sem vazar ninguém.
export const wavePerfectBonus = (n) => 12 + n * 3;

// Melhorias PERMANENTES (compradas com as moedas da plataforma).
export const PERMS = [
  { id: 'dano',  name: 'Dano global',  desc: '+4% dano por nível',        per: 0.04, max: 5, cost: (lv) => 250 + lv * 200 },
  { id: 'vida',  name: 'Muralha',      desc: '+2 vidas por nível',        per: 2,    max: 5, cost: (lv) => 200 + lv * 180 },
  { id: 'renda', name: 'Renda',        desc: '+6% moedas por nível',      per: 0.06, max: 5, cost: (lv) => 250 + lv * 200 },
];

// Combos: marcos de abates sem deixar vazar.
export const COMBO_MILESTONES = [10, 25, 50, 100, 200];
export const comboBonus = (m) => m * 2;

// Conversão para recompensa permanente no fim da partida.
export const permCoinsFor = (wave, kills) => Math.round(wave * 9 + kills * 0.35);
