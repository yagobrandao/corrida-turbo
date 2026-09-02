// Triple Quest — dados: peças, curva de dificuldade, economia, vidas.
//
// Tudo o que é número mora aqui. O gerador (generator.js), a lógica da
// partida (match.js) e a cena só leem estas tabelas.

// ---------------------------------------------------------------- peças
// 30 objetos. `c` é a cor de destaque (usada no aro da peça e na dica);
// o desenho em si mora em art.js.
export const TILE_TYPES = [
  { id: 'potion',   name: 'Poção',     c: 0xd45de0 },
  { id: 'backpack', name: 'Mochila',   c: 0xe8483f },
  { id: 'icecream', name: 'Sorvete',   c: 0xff8fc4 },
  { id: 'camera',   name: 'Câmera',    c: 0x4a5378 },
  { id: 'gift',     name: 'Presente',  c: 0xe8483f },
  { id: 'crown',    name: 'Coroa',     c: 0xffd23e },
  { id: 'glasses',  name: 'Óculos',    c: 0x2b7fd4 },
  { id: 'ball',     name: 'Bola',      c: 0xff8b3d },
  { id: 'clock',    name: 'Relógio',   c: 0x3ddad7 },
  { id: 'crystal',  name: 'Cristal',   c: 0x9fe8ff },
  { id: 'lantern',  name: 'Lanterna',  c: 0xffc23e },
  { id: 'cupcake',  name: 'Cupcake',   c: 0xff6fb5 },
  { id: 'plant',    name: 'Plantinha', c: 0x3fae70 },
  { id: 'apple',    name: 'Maçã',      c: 0xe8483f },
  { id: 'chest',    name: 'Baú',       c: 0xb5773a },
  { id: 'key',      name: 'Chave',     c: 0xffd23e },
  { id: 'compass',  name: 'Bússola',   c: 0x2b7fd4 },
  { id: 'book',     name: 'Livro',     c: 0x9b59d0 },
  { id: 'bottle',   name: 'Garrafa',   c: 0x3ddad7 },
  { id: 'star',     name: 'Estrela',   c: 0xffd23e },
  { id: 'heart',    name: 'Coração',   c: 0xff6b9d },
  { id: 'moon',     name: 'Lua',       c: 0xffe58a },
  { id: 'mushroom', name: 'Cogumelo',  c: 0xe8483f },
  { id: 'fish',     name: 'Peixe',     c: 0xff8b3d },
  { id: 'cloud',    name: 'Nuvem',     c: 0x9fe8ff },
  { id: 'leaf',     name: 'Folha',     c: 0x8fca5e },
  { id: 'diamond',  name: 'Diamante',  c: 0x7fd0ff },
  { id: 'bell',     name: 'Sino',      c: 0xffc23e },
  { id: 'coin',     name: 'Moeda',     c: 0xffd23e },
  { id: 'rocket',   name: 'Foguete',   c: 0xc8ceda },
];
export const TYPE_BY_ID = Object.fromEntries(TILE_TYPES.map(t => [t.id, t]));

export const TRAY_SIZE = 7;
export const TILE = 56;               // tamanho base da peça em px (o gerador escala para caber)
export const COMBO_WINDOW = 2.6;      // segundos entre trios para manter o combo

// ---------------------------------------------------------------- curva de dificuldade
// Devolve os parâmetros da fase n (1..∞). Múltiplos de 3 sempre.
export function levelParams(n) {
  // Curva mais encorpada: a fase 1 já tem peça de sobra pra sentir o jogo
  // (não são 3 toques e acabou), e o número de TIPOS cresce quase junto
  // com o de peças — poucos tipos numa fase grande é o que deixa fácil
  // demais (qualquer toque tem chance alta de combinar).
  const tiles = Math.min(150, 21 + 5 * Math.floor(n * 1.2));
  const types = Math.min(16, Math.max(4, 4 + Math.floor(n / 1.8)), Math.floor(tiles / 3));
  const layers = 1 + Math.min(5, Math.floor((n + 2) / 3));
  const shapes = n <= 2 ? ['pyramid', 'diamond'] : SHAPES;
  return {
    n, tiles, types, layers,
    shape: shapes[(n * 7 + Math.floor(n / 10) * 3 + 3) % shapes.length],
    // mecânicas especiais entram aos poucos
    frozen: n >= 15 ? Math.min(6, 1 + Math.floor((n - 15) / 8)) : 0,
    locked: n >= 31 ? Math.min(4, 1 + Math.floor((n - 31) / 12)) : 0,
    moves: null,                       // só o desafio diário limita movimentos
  };
}
export const SHAPES = ['pyramid', 'diamond', 'heart', 'circle', 'star', 'cross', 'island', 'ring', 'butterfly', 'tower'];

// ---------------------------------------------------------------- economia
export const LIVES_MAX = 5;
export const LIFE_REGEN_MS = 15 * 60 * 1000;

export const BOOSTERS = [
  { id: 'undo',    name: 'Desfazer',   desc: 'Devolve a última peça ao tabuleiro', cost: 60,  start: 3 },
  { id: 'shuffle', name: 'Embaralhar', desc: 'Redistribui os tipos das peças',     cost: 80,  start: 2 },
  { id: 'hint',    name: 'Dica',       desc: 'Destaca uma peça que combina',        cost: 50,  start: 3 },
  { id: 'remove',  name: 'Remover',    desc: 'Tira um trio inteiro do tabuleiro',   cost: 120, start: 1 },
  { id: 'tray',    name: 'Bandeja +1', desc: 'Um espaço extra nesta fase',          cost: 90,  start: 1 },
];

// estrelas: 3 sem sufoco, 2 com a bandeja apertando, 1 só por terminar
export function starsFor(maxTray, traySize, boostersUsed) {
  if (maxTray <= traySize - 3 && boostersUsed === 0) return 3;
  if (maxTray <= traySize - 1) return 2;
  return 1;
}
export function levelRewards(n, stars, bestCombo) {
  const coins = 40 + n * 4 + stars * 25 + Math.max(0, bestCombo - 1) * 15;
  const xp = 30 + n * 2 + stars * 12 + Math.max(0, bestCombo - 1) * 6;
  return { coins, xp };
}
export const xpToNext = (level) => 100 + (level - 1) * 60;
export const chestFor = (n) => (n % 15 === 0 ? 'epic' : n % 5 === 0 ? 'rare' : null);
export const CHESTS = {
  rare: { name: 'Baú raro',  coins: 150, boosters: 1, lives: 0 },
  epic: { name: 'Baú épico', coins: 400, boosters: 2, lives: 1 },
};
export const DAILY = { movesBuffer: 4, coins: 500, booster: 'hint' };
export const COMBO_LABELS = ['', '', 'NICE!', 'GREAT!', 'AMAZING!', 'COMBO!'];
