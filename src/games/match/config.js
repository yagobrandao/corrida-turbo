// Pomar Mágico — dados: peças, especiais, pontuação, economia, regiões,
// ilha (metaprogressão), recompensas diárias, missões, baús, coleção.
//
// Tudo o que é NÚMERO mora aqui. O tabuleiro (board.js), o gerador
// (levels.js), o progresso (progress.js) e as cenas só leem estas tabelas.

// ---------------------------------------------------------------- peças
// 6 frutas com silhuetas diferentes (não dependem só da cor): cone,
// meia-lua, cacho, redonda com folha, gomo e baga sextavada com coroa.
export const FRUITS = [
  { id: 'morango', name: 'Morango', c: 0xe8483f, c2: 0xff8b8b, shape: 'cone' },
  { id: 'banana',  name: 'Banana',  c: 0xffd23e, c2: 0xfff0a8, shape: 'crescent' },
  { id: 'uva',     name: 'Uva',     c: 0x8d5ac0, c2: 0xc9a3ff, shape: 'cluster' },
  { id: 'maca',    name: 'Maçã',    c: 0x3fae70, c2: 0x8fe66a, shape: 'round' },
  { id: 'laranja', name: 'Laranja', c: 0xff8b3d, c2: 0xffc48a, shape: 'wedge' },
  { id: 'mirtilo', name: 'Mirtilo', c: 0x2b7fd4, c2: 0x9fe8ff, shape: 'berry' },
];
export const OBSTACLES = { ice: 'Gelo', box: 'Caixa', chain: 'Corrente', honey: 'Mel', gen: 'Gerador' };
export const SPECIALS = {
  rh: { name: 'Foguete', desc: 'Limpa a linha inteira' },
  rv: { name: 'Foguete', desc: 'Limpa a coluna inteira' },
  bomb: { name: 'Bomba', desc: 'Explode tudo ao redor' },
  color: { name: 'Bomba de Cor', desc: 'Some com todas as frutas de uma cor' },
};

// ---------------------------------------------------------------- pontuação
export const SCORE = {
  piece: 20,             // por peça removida × combo
  specialPiece: 10,      // extra por peça removida por um especial
  create: { rh: 100, rv: 100, bomb: 200, color: 400 },
  comboCap: 8,
};
export const COMBO_LABELS = ['', '', 'COMBO!', 'GREAT!', 'AMAZING!', 'INCREDIBLE!', 'UNSTOPPABLE!'];

// ---------------------------------------------------------------- economia
export const LIVES_MAX = 5;
export const LIFE_REGEN_MS = 20 * 60 * 1000;
export const CONTINUE_COST = 200;      // moedas por +5 jogadas
export const CONTINUE_MOVES = 5;
export const BOOSTERS = [
  { id: 'hammer',  name: 'Martelo',    desc: 'Toque numa peça para removê-la',   cost: 80,  start: 2, inGame: true },
  { id: 'shuffle', name: 'Embaralhar', desc: 'Redistribui as peças',            cost: 60,  start: 2, inGame: true },
  { id: 'moves',   name: '+5 jogadas', desc: 'Cinco jogadas extras',            cost: 120, start: 1, inGame: true },
  { id: 'rocket',  name: 'Foguete',    desc: 'Começa a fase com um foguete',     cost: 90,  start: 2, pre: true },
  { id: 'bomb',    name: 'Bomba',      desc: 'Começa a fase com uma bomba',      cost: 120, start: 1, pre: true },
  { id: 'color',   name: 'Bomba de Cor', desc: 'Começa com uma bomba de cor',    cost: 180, start: 1, pre: true },
];
export const BOOSTER_BY_ID = Object.fromEntries(BOOSTERS.map(b => [b.id, b]));

export function levelRewards(n, stars, score) {
  const coins = 30 + Math.min(60, n * 2) + stars * 20 + Math.floor(score / 4000);
  const xp = 25 + n * 2 + stars * 10;
  return { coins, xp };
}
export const xpToNext = (lvl) => 120 + (lvl - 1) * 80;
export const LEVEL_UP_REWARD = (lvl) => ({ coins: 100 + lvl * 20, chest: lvl % 5 === 0 ? 'epic' : lvl % 2 === 0 ? 'rare' : null, booster: lvl % 3 === 0 ? 'hammer' : null });

// ---------------------------------------------------------------- baús e coleção
export const CHESTS = {
  common:    { name: 'Baú comum',     color: 0xb5773a, coins: [40, 90],   boosters: 0, lives: 0, card: 0.15 },
  rare:      { name: 'Baú raro',      color: 0x2b7fd4, coins: [100, 200], boosters: 1, lives: 0, card: 0.4 },
  epic:      { name: 'Baú épico',     color: 0x8d5ac0, coins: [250, 400], boosters: 2, lives: 1, card: 0.8 },
  legendary: { name: 'Baú lendário',  color: 0xffd23e, coins: [600, 900], boosters: 3, lives: 2, card: 1 },
};
// cartas da Coleção Pomar: aparecem nos baús; a coleção completa dá um baú lendário
export const COLLECTION = [
  { id: 'c_morango', name: 'Morango Solar', fruit: 0 }, { id: 'c_banana', name: 'Banana Lunar', fruit: 1 },
  { id: 'c_uva', name: 'Uva Estelar', fruit: 2 }, { id: 'c_maca', name: 'Maçã do Bosque', fruit: 3 },
  { id: 'c_laranja', name: 'Laranja de Fogo', fruit: 4 }, { id: 'c_mirtilo', name: 'Mirtilo Gelado', fruit: 5 },
  { id: 'c_tuca', name: 'Tuca, a guia', fruit: -1 }, { id: 'c_farol', name: 'O Farol', fruit: -2 },
  { id: 'c_moinho', name: 'O Moinho', fruit: -3 }, { id: 'c_ponte', name: 'A Ponte', fruit: -4 },
  { id: 'c_pomar', name: 'O Pomar Antigo', fruit: -5 }, { id: 'c_lua', name: 'A Lua do Pomar', fruit: -6 },
];

// ---------------------------------------------------------------- diário
export const DAILY_LOGIN = [
  { coins: 100 }, { booster: 'hammer' }, { coins: 200 }, { booster: 'rocket' },
  { chest: 'rare' }, { coins: 300 }, { chest: 'legendary' },
];
export const WHEEL = [
  { coins: 50 }, { booster: 'hammer' }, { coins: 150 }, { lives: 1 },
  { booster: 'shuffle' }, { coins: 300 }, { chest: 'rare' }, { coins: 80 },
];
export const MISSION_POOL = {
  daily: [
    { id: 'm_matches', text: 'Faça {n} combinações', metric: 'matches', n: 40, coins: 80 },
    { id: 'm_levels', text: 'Complete {n} fases', metric: 'levels', n: 2, coins: 120 },
    { id: 'm_rockets', text: 'Crie {n} foguetes', metric: 'rockets', n: 4, coins: 90 },
    { id: 'm_combo', text: 'Faça um combo x{n}', metric: 'combo', n: 4, coins: 100, best: true },
    { id: 'm_stars', text: 'Ganhe {n} estrelas', metric: 'stars', n: 4, coins: 110 },
    { id: 'm_bombs', text: 'Crie {n} bombas', metric: 'bombs', n: 2, coins: 100 },
    { id: 'm_specials', text: 'Use {n} especiais', metric: 'specials', n: 6, coins: 90 },
  ],
  weekly: [
    { id: 'w_levels', text: 'Complete {n} fases', metric: 'levels', n: 15, chest: 'epic' },
    { id: 'w_matches', text: 'Faça {n} combinações', metric: 'matches', n: 300, coins: 500 },
    { id: 'w_specials', text: 'Use {n} especiais', metric: 'specials', n: 30, chest: 'rare' },
  ],
};
// evento local: Semana do Tesouro — cada fase vencida dá chaves; 20 abrem um baú épico
export const EVENT = { id: 'treasure', name: 'Semana do Tesouro', keysPerWin: [2, 3, 4], goal: 20, chest: 'epic', days: 7 };

// ---------------------------------------------------------------- regiões e ilha
export const REGIONS = [
  { id: 'bosque', name: 'Bosque das Frutas', from: 1, to: 30, sky: [0x8fe66a, 0x2f8f5b], ground: 0x3fae70 },
  { id: 'praia', name: 'Praia do Coco', from: 31, to: 60, sky: [0x9fe8ff, 0x2b7fd4], ground: 0xffe58a },
  { id: 'montanha', name: 'Montanha Gelada', from: 61, to: 90, sky: [0xc9d8ff, 0x6b7fb0], ground: 0xe0e8ff },
  { id: 'reino', name: 'Reino Mágico', from: 91, to: 120, sky: [0xd45de0, 0x4a2a7a], ground: 0x8d5ac0 },
  { id: 'vulcao', name: 'Vulcão Doce', from: 121, to: 150, sky: [0xff8b3d, 0x7a2a2a], ground: 0x5a3a3a },
];
export const regionFor = (n) => REGIONS[Math.min(REGIONS.length - 1, Math.floor((n - 1) / 30))];

// Ilha do Pomar: cada construção custa estrelas (as estrelas continuam
// contando no mapa — aqui elas são um "orçamento" acumulado). Construir
// libera decoração, uma carta e moedas; a última libera a região seguinte.
export const ISLAND = [
  { id: 'casa', name: 'Casa da Tuca', cost: 3, coins: 80, x: 0.22, y: 0.62 },
  { id: 'pomar', name: 'Pomar', cost: 6, coins: 100, x: 0.5, y: 0.72 },
  { id: 'poco', name: 'Poço', cost: 9, coins: 120, x: 0.72, y: 0.6 },
  { id: 'ponte', name: 'Ponte', cost: 12, coins: 150, x: 0.36, y: 0.46, card: 'c_ponte' },
  { id: 'moinho', name: 'Moinho', cost: 16, coins: 180, x: 0.7, y: 0.38, card: 'c_moinho' },
  { id: 'praca', name: 'Praça', cost: 20, coins: 220, x: 0.5, y: 0.52 },
  { id: 'farol', name: 'Farol', cost: 26, coins: 300, x: 0.84, y: 0.22, card: 'c_farol' },
  { id: 'barco', name: 'Barco', cost: 32, coins: 400, x: 0.16, y: 0.26, unlocks: 'praia' },
];
