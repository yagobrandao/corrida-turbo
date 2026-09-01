// Constantes do Bomb Arena.
export const TILE = 40;              // px por célula (3-4 jogadores)
export const TILE_DUO = 46;          // arena 1v1 é menor, células maiores

// Grade: colunas x linhas (ímpares, para o padrão de pilares fechar certo).
// Retrato: mais linhas que colunas.
export const GRID_44 = { cols: 11, rows: 13, tile: TILE };
export const GRID_DUO = { cols: 9, rows: 11, tile: TILE_DUO };

export const PLAYER_SPEED = 150;     // px/s base
export const SPEED_STEP = 22;        // por power-up de velocidade (máx 3)

export const BOMB_FUSE = 2.4;        // s até explodir
export const CHAIN_FUSE = 0.14;      // pavio de bomba atingida por explosão
export const BLAST_TIME = 0.45;      // s que o fogo fica ativo
// Alcance 1 de propósito: com o corredor de spawn de 2 células, plantar e
// fugir em linha reta é sempre possível — e o 🔥 vira um power-up desejado.
export const BASE_RANGE = 1;
export const BASE_BOMBS = 1;         // bombas simultâneas iniciais

export const ROUND_TIME = 90;        // s; depois disso a arena começa a fechar
export const SHRINK_EVERY = 4;       // s entre anéis de lava no fim da rodada

export const CRATE_CHANCE = 0.62;    // chance de célula livre virar caixote
export const DROP_CHANCE = 0.34;     // chance de caixote soltar power-up

// Pontos por colocação na rodada (1º, 2º, 3º, 4º).
export const ROUND_POINTS = [100, 70, 40, 20];

// Power-ups do chão (fase 1: os quatro fundamentais).
export const DROPS = [
  { id: 'fire',   emoji: '🔥', weight: 3 },   // +1 alcance
  { id: 'bomb',   emoji: '💣', weight: 3 },   // +1 bomba simultânea
  { id: 'speed',  emoji: '👟', weight: 2 },   // +velocidade
  { id: 'shield', emoji: '🛡️', weight: 1 },   // absorve uma explosão
];

// Temas de arena (paleta trocada por rodada, mecânica igual).
export const THEMES = [
  { id: 'forest',  name: 'Floresta', floorA: 0x9bd05a, floorB: 0x8cc24f, wall: 0x4a6b35, wallTop: 0x5d8243, crate: 0xb8863e, crateEdge: 0x8a6127, hazard: 0x3d5c2b },
  { id: 'desert',  name: 'Deserto',  floorA: 0xe8cf8f, floorB: 0xdfc27d, wall: 0xa5763c, wallTop: 0xbf8c4a, crate: 0xc9964d, crateEdge: 0x96692f, hazard: 0xb35e2a },
  { id: 'volcano', name: 'Vulcão',   floorA: 0x6b6474, floorB: 0x5e5769, wall: 0x352f3d, wallTop: 0x453e4f, crate: 0x8a5a41, crateEdge: 0x64402e, hazard: 0xe8483f },
];
