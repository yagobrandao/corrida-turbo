// Constantes do Pega-Pega.
export const TILE = 40;
export const GRID = { cols: 11, rows: 13, tile: TILE };      // 3-4 jogadores
export const GRID_DUO = { cols: 9, rows: 11, tile: 46 };     // 1v1: arena menor

export const ROUND_TIME = 90;         // s por rodada
export const FLEE_SPEED = 165;        // px/s dos fugitivos
export const TAGGER_MULT = 1.08;      // pegador 8% mais rápido (ajustado em teste)

// Anti-enrolação: pegador sem capturar ganha fôlego aos poucos.
export const HUNT_BOOST_EVERY = 18;   // s sem captura para subir um nível
export const HUNT_BOOST_STEP = 0.05;  // +5% por nível
export const HUNT_BOOST_MAX = 3;      // até +15%

export const CATCH_DIST = 30;         // px entre centros para capturar (generoso)
export const SWAP_IMMUNITY = 1.3;     // s que o novo pegador não pode capturar

// Power-ups (3 para começar; a arquitetura aceita mais).
export const POWER_EVERY = 9;         // s entre aparições
export const POWERS = [
  { id: 'speed',  emoji: '⚡', dur: 4,  weight: 3 },   // +35% por 4s
  { id: 'shield', emoji: '🛡️', dur: 8,  weight: 2 },   // bloqueia UMA captura
  { id: 'freeze', emoji: '❄️', dur: 3,  weight: 2 },   // pegador a 55% por 3s
];
export const SPEED_BUFF = 1.35;
export const FREEZE_MULT = 0.55;

// Pontos.
export const PTS_FLEE_PER_S = 10;
export const PTS_CAPTURE = 100;
export const PTS_SURVIVOR = 250;      // não era o pegador quando acabou
export const PTS_NEVER_CAUGHT = 250;  // atravessou a rodada sem ser pego
export const PTS_HUNTER_BONUS = 300;  // 3+ capturas na rodada

export const THEMES = [
  { id: 'parque', floorA: 0x8fca5e, floorB: 0x83bf54, wall: 0x4a6b35, wallTop: 0x5d8243, rock: 0x8d93a8, tree: 0x3e8a4f, treeTop: 0x51a763 },
  { id: 'praia',  floorA: 0xe8d194, floorB: 0xdfc684, wall: 0xb08748, wallTop: 0xc79c58, rock: 0xa8987f, tree: 0x3e8a6b, treeTop: 0x54ab88 },
];
