// Catálogo de cosméticos do personagem.
//
// Cada peça é um DESENHO descrito uma vez como lista de formas (core/shapes.js)
// e renderizado nos dois lugares: SVG nas telas e canvas dentro das partidas.
// Até três papéis de cor (`p` principal, `q` secundária, `k` detalhe) ficam
// como texto dentro das formas; o desenho define suas próprias cores padrão,
// mas qualquer forma que use um desses papéis pode ser REPINTADA em runtime
// por uma cor da paleta (PALETTE) — formas com cor fixa (número) nunca mudam.
//
// Isso separa FORMATO de COR: você compra o desenho (o chapéu, a roupa...)
// uma vez, e depois escolhe a cor numa paleta compartilhada e de graça — a
// mesma cor vale pra qualquer desenho daquela categoria. Sem multiplicar
// cada peça por N cores, sobra espaço pra ter muito mais desenhos.
//
// Coordenadas do boneco: quadro 76 × 104, corpo x 11..65 / y 24..96,
// olhos na altura y ≈ 42, topo da cabeça em y ≈ 24.
import { R, C, E, T, L, A, OUTLINE, hex } from './shapes.js';

const W = 0xffffff;

// ---------------------------------------------------------------- paleta compartilhada
// Vale para chapéus, cabelos, óculos, rostos (cor dos olhos), roupas, asas
// e pets. `null` = as cores originais do próprio desenho ("Original").
export const PALETTE = [
  { id: 'ruby',  name: 'Rubi',   p: 0xe8483f, q: 0x9c2820, k: 0xffd23e },
  { id: 'ocean', name: 'Oceano', p: 0x2b7fd4, q: 0x1b4f8f, k: 0x9fe8ff },
  { id: 'lime',  name: 'Limão',  p: 0x8fca5e, q: 0x3fae70, k: 0xffd23e },
  { id: 'grape', name: 'Uva',    p: 0x9b59d0, q: 0x6b3fa0, k: 0xff8fc4 },
  { id: 'sun',   name: 'Sol',    p: 0xffc23e, q: 0xd9a410, k: W },
  { id: 'night', name: 'Noite',  p: 0x2a2358, q: 0x151233, k: 0x3ddad7 },
  { id: 'snow',  name: 'Neve',   p: 0xf0f4ff, q: 0xbfd4e8, k: 0xff8fc4 },
].map(c => ({ ...c, hex: hex(c.p) }));
export const PALETTE_IDS = new Set(PALETTE.map(c => c.id));

// Resolve as formas de um desenho para uma cor: `tintId` nulo usa as cores
// originais do desenho; um id da paleta substitui 'p'/'q'/'k' por ela.
// Formas com cor numérica (não-símbolo) nunca são afetadas.
function resolveParts(design, tintId) {
  if (!design || !design.parts) return null;
  const t = tintId && PALETTE.find(c => c.id === tintId);
  const roles = t || { p: design.p ?? 0x888888, q: design.q ?? 0x555555, k: design.k ?? W };
  return design.parts.map(sh => ({ ...sh, c: typeof sh.c === 'string' && roles[sh.c] !== undefined ? roles[sh.c] : sh.c }));
}

// ---------------------------------------------------------------- CORES (corpo)
// Trocam a cor do corpo; a skin continua definindo o formato/adereço.
// Sistema à parte do resto (compra cada cor, não usa a paleta compartilhada).
export const COLORS = [
  { id: 'none',   name: 'Original', cost: 0 },
  ...[
    ['ruby', 'Rubi', 0xe8483f, 120], ['ocean', 'Oceano', 0x2b7fd4, 120], ['lime', 'Limão', 0x8fca5e, 150],
    ['grape', 'Uva', 0x9b59d0, 150], ['candy', 'Algodão', 0xff8fc4, 180], ['sun', 'Sol', 0xffc23e, 180],
    ['mint', 'Menta', 0x3ddac0, 220], ['coal', 'Carvão', 0x4a5378, 260], ['cream', 'Creme', 0xf0e0c0, 260],
    ['coral', 'Coral', 0xff7f6e, 140], ['tangerine', 'Tangerina', 0xff8b3d, 140], ['peach', 'Pêssego', 0xffb48a, 160],
    ['lemon', 'Limão-siciliano', 0xfff17a, 160], ['olive', 'Oliva', 0x9aa83c, 170], ['forest', 'Floresta', 0x2a7a4a, 190],
    ['teal', 'Petróleo', 0x1f7a8c, 190], ['sky', 'Céu', 0x7fd0ff, 170], ['navy', 'Marinho', 0x1b3a6b, 220],
    ['indigo', 'Índigo', 0x4b3fbf, 220], ['lavender', 'Lavanda', 0xb9a3f7, 200], ['magenta', 'Magenta', 0xd42e9a, 210],
    ['rose', 'Rosa-chá', 0xf2b5c9, 200], ['wine', 'Vinho', 0x7a1f3d, 240], ['brick', 'Tijolo', 0xb0412e, 200],
    ['chocolate', 'Chocolate', 0x6b4a2e, 210], ['caramel', 'Caramelo', 0xb5773a, 210], ['sand', 'Areia', 0xe8d194, 180],
    ['stone', 'Pedra', 0x8d93a8, 220], ['silver', 'Prata', 0xc8ceda, 320], ['ink', 'Tinta', 0x222744, 300],
    ['ice', 'Gelo', 0xdff6ff, 260], ['jade', 'Jade', 0x3fae70, 230], ['emerald', 'Esmeralda', 0x1f9a5c, 280],
    ['cherry', 'Cereja', 0xc9163f, 230], ['plum', 'Ameixa', 0x5e2a6b, 260], ['aqua', 'Água', 0x3ddad7, 230],
    ['lilac', 'Lilás', 0xd9b8ff, 220], ['mustard', 'Mostarda', 0xd9a410, 220], ['moss', 'Musgo', 0x6b8e3c, 200],
    ['cobalt', 'Cobalto', 0x2648c8, 260], ['salmon', 'Salmão', 0xff9e8a, 180], ['bubblegum', 'Chiclete', 0xff6fb5, 240],
    ['pumpkin', 'Abóbora', 0xf07a1f, 190], ['midnight', 'Meia-noite', 0x0f1533, 340], ['pearl', 'Pérola', 0xf7f2ff, 340],
    ['copper', 'Cobre', 0xb8733a, 300], ['neon', 'Neon', 0x8bff3d, 360], ['ultraviolet', 'Ultravioleta', 0x7a2bff, 380],
    ['gold', 'Ouro', 0xffd23e, 900], ['diamond', 'Diamante', 0xbff4ff, 1200],
  ].map(([id, name, body, cost]) => ({ id, name, cost, body })),
];

// ---------------------------------------------------------------- CHAPÉUS
export const HATS = [
  { id: 'none', name: 'Nenhum', cost: 0 },
  { id: 'cap', name: 'Boné', cost: 120, p: 0xe8483f, q: 0x9c2820, parts: [
    R(11, 8, 54, 18, 9, OUTLINE), R(13, 10, 50, 14, 7, 'p'), R(13, 20, 62, 7, 3.5, 'q'),
  ] },
  { id: 'party', name: 'Festa', cost: 160, p: 0xffd23e, q: 0xe8483f, k: 0x3ddad7, parts: [
    T(38, -4, 20, 26, 56, 26, OUTLINE), T(38, 1, 24, 24, 52, 24, 'p'),
    T(38, 1, 30, 16, 44, 16, 'q'), C(38, -2, 5, 'k'),
  ] },
  { id: 'top', name: 'Cartola', cost: 260, p: 0x2a2358, q: 0xffd23e, parts: [
    R(8, 20, 60, 8, 4, OUTLINE), R(20, -6, 36, 28, 4, OUTLINE),
    R(22, -4, 32, 24, 3, 'p'), R(22, 12, 32, 6, 0, 'q'),
  ] },
  { id: 'horns', name: 'Chifres', cost: 300, p: 0xe8483f, parts: [
    T(16, 24, 26, 24, 12, 0, OUTLINE), T(60, 24, 50, 24, 64, 0, OUTLINE),
    T(18, 22, 25, 22, 14, 4, 'p'), T(58, 22, 51, 22, 62, 4, 'p'),
  ] },
  { id: 'halo', name: 'Auréola', cost: 340, parts: [
    E(38, 6, 21, 7, 0xffd23e), E(38, 6, 15, 3.5, 0x151233),
  ] },
  { id: 'beanie', name: 'Gorro', cost: 200, p: 0x3ddad7, q: W, parts: [
    R(12, 6, 52, 22, 11, OUTLINE), R(14, 8, 48, 18, 9, 'p'),
    R(11, 20, 54, 9, 4.5, 'q'), C(38, 2, 7, 'q'),
  ] },
  { id: 'cowboy', name: 'Caubói', cost: 380, p: 0xc9954d, q: 0x6b4a2e, parts: [
    E(38, 24, 34, 8, OUTLINE), E(38, 23, 31, 6, 'p'),
    R(22, 2, 32, 22, 8, OUTLINE), R(24, 4, 28, 18, 7, 'p'), R(22, 15, 32, 5, 2, 'q'),
  ] },
  { id: 'wizard', name: 'Bruxo', cost: 480, p: 0x6b4aa8, q: 0x4a3f8c, k: 0xffd23e, parts: [
    E(38, 25, 30, 7, OUTLINE), E(38, 24, 27, 5, 'q'),
    T(38, -14, 18, 25, 58, 25, OUTLINE), T(38, -9, 22, 23, 54, 23, 'p'),
    C(30, 12, 3, 'k'), C(45, 6, 2.4, 'k'), C(38, 18, 2, 'k'),
  ] },
  { id: 'pirate', name: 'Pirata', cost: 440, p: 0x2a2358, q: 0x1c2440, parts: [
    R(10, 12, 56, 14, 7, OUTLINE), R(12, 14, 52, 10, 5, 'p'),
    E(38, 12, 26, 9, 'q'), C(38, 9, 4, W), C(33, 14, 2, W), C(43, 14, 2, W),
  ] },
  { id: 'chef', name: 'Chef', cost: 320, p: W, q: W, parts: [
    R(16, 14, 44, 14, 4, OUTLINE), R(18, 16, 40, 10, 3, 'q'),
    C(24, 6, 10, 'p'), C(38, 2, 11, 'p'), C(52, 6, 10, 'p'),
  ] },
  { id: 'flower', name: 'Florzinha', cost: 240, p: 0xff8fc4, k: 0xffd23e, parts: [
    L(46, 22, 50, 8, 3, 0x3fae70),
    C(50, 4, 5, 'p'), C(56, 8, 5, 'p'), C(52, 14, 5, 'p'), C(44, 12, 5, 'p'), C(44, 5, 5, 'p'), C(50, 9, 3.4, 'k'),
  ] },
  { id: 'crown', name: 'Coroa', cost: 800, p: 0xffd23e, k: 0xe8483f, parts: [
    T(14, 26, 26, 26, 20, 2, OUTLINE), T(30, 26, 46, 26, 38, -4, OUTLINE),
    T(50, 26, 62, 26, 56, 2, OUTLINE), R(14, 20, 48, 8, 0, OUTLINE),
    T(17, 24, 25, 24, 21, 7, 'p'), T(33, 24, 45, 24, 39, 2, 'p'),
    T(51, 24, 59, 24, 55, 7, 'p'), R(16, 21, 44, 5, 0, 'p'), C(39, 10, 2.6, 'k'),
  ] },
  { id: 'viking', name: 'Viking', cost: 520, p: 0x8d93a8, q: 0x5f6b8a, k: 0xf0e0c0, parts: [
    T(14, 22, 24, 20, 8, 0, OUTLINE), T(62, 22, 52, 20, 68, 0, OUTLINE),
    T(16, 20, 23, 19, 11, 4, 'k'), T(60, 20, 53, 19, 65, 4, 'k'),
    R(12, 6, 52, 22, 11, OUTLINE), R(14, 8, 48, 18, 9, 'p'), R(12, 20, 52, 6, 3, 'q'), R(35, 4, 6, 22, 3, 'q'),
  ] },
  { id: 'bucket', name: 'Pescador', cost: 220, p: 0xc9954d, q: 0x9c7a3a, parts: [
    R(6, 20, 64, 8, 4, OUTLINE), R(8, 21, 60, 6, 3, 'q'),
    R(16, 4, 44, 20, 6, OUTLINE), R(18, 6, 40, 16, 5, 'p'), R(18, 14, 40, 3, 1.5, 'q'),
  ] },
  { id: 'bow', name: 'Laço', cost: 180, p: 0xff8fc4, q: 0xd45de0, parts: [
    T(52, 14, 36, 6, 36, 22, OUTLINE), T(52, 14, 68, 6, 68, 22, OUTLINE),
    T(52, 14, 38, 8, 38, 20, 'p'), T(52, 14, 66, 8, 66, 20, 'p'), C(52, 14, 5, 'q'),
  ] },
  { id: 'propeller', name: 'Hélice', cost: 260, p: 0xe8483f, q: 0xffd23e, k: 0x3ddad7, parts: [
    R(12, 10, 52, 18, 9, OUTLINE), R(14, 12, 48, 14, 7, 'p'), R(14, 12, 12, 14, 4, 'q'), R(50, 12, 12, 14, 4, 'q'),
    L(38, 10, 38, 2, 3, OUTLINE), R(20, -2, 36, 5, 2.5, 'k'), C(38, 0, 3, OUTLINE),
  ] },
  { id: 'tiara', name: 'Tiara', cost: 420, p: 0x9fe8ff, q: 0xffd23e, parts: [
    A(38, 26, 26, 5, OUTLINE), A(38, 26, 26, 3, 'q'),
    T(38, 2, 32, 14, 44, 14, OUTLINE), T(38, 5, 34, 13, 42, 13, 'p'), C(26, 12, 3, 'p'), C(50, 12, 3, 'p'),
  ] },
  { id: 'santa', name: 'Natalino', cost: 300, p: 0xe8483f, q: W, parts: [
    T(60, 4, 22, 22, 56, 26, OUTLINE), T(58, 6, 26, 21, 54, 24, 'p'),
    R(10, 18, 56, 10, 5, OUTLINE), R(12, 20, 52, 6, 3, 'q'), C(62, 4, 6, 'q'),
  ] },
  { id: 'helmet', name: 'Capacete', cost: 340, p: 0xffc23e, q: 0x1c2440, parts: [
    R(10, 6, 56, 24, 12, OUTLINE), R(12, 8, 52, 20, 10, 'p'), R(12, 22, 52, 5, 2.5, 'q'), R(20, 12, 36, 4, 2, 'q'),
  ] },
  { id: 'bandana', name: 'Bandana', cost: 180, p: 0xe8483f, q: 0xffd23e, parts: [
    R(10, 10, 56, 16, 8, OUTLINE), R(12, 12, 52, 12, 6, 'p'), T(58, 12, 72, 8, 72, 22, 'p'),
    C(20, 18, 2, 'q'), C(30, 15, 2, 'q'), C(40, 19, 2, 'q'), C(50, 15, 2, 'q'),
  ] },
  { id: 'headphones', name: 'Fone de ouvido', cost: 280, p: 0x2a2358, q: 0x3ddad7, parts: [
    R(20, 2, 36, 8, 4, 'p'), R(8, 8, 8, 28, 4, 'p'), R(60, 8, 8, 28, 4, 'p'),
    R(10, 10, 5, 20, 2, 'q'), R(62, 10, 5, 20, 2, 'q'),
  ] },
  { id: 'paperhat', name: 'Chapéu de jornal', cost: 160, p: 0xf0e0c0, q: 0xd9c3a3, parts: [
    T(38, -8, 14, 20, 62, 20, OUTLINE), T(38, -4, 18, 18, 58, 18, 'p'), T(38, -4, 30, 12, 46, 12, 'q'),
  ] },
  { id: 'earflaps', name: 'Gorro de orelhas', cost: 260, p: 0x8fca5e, q: 0x3fae70, parts: [
    R(10, 4, 56, 22, 11, OUTLINE), R(12, 6, 52, 18, 9, 'p'),
    R(6, 18, 14, 22, 6, 'p'), R(56, 18, 14, 22, 6, 'p'), C(13, 40, 3, 'q'), C(63, 40, 3, 'q'),
  ] },
  { id: 'mortarboard', name: 'Capelo', cost: 340, p: 0x2a2358, q: 0xffd23e, parts: [
    R(6, 16, 64, 6, 3, OUTLINE), R(6, 17, 64, 4, 0, 'p'),
    T(38, -6, 8, 16, 68, 16, OUTLINE), T(38, -3, 12, 15, 64, 15, 'p'),
    C(38, 15, 2.4, 'q'), L(38, 15, 52, 30, 2, 'q'), C(52, 31, 2.4, 'q'),
  ] },
  { id: 'newsboy', name: 'Boina', cost: 220, p: 0x6b4a2e, q: 0x9c7a3a, parts: [
    E(36, 12, 30, 12, OUTLINE), E(36, 11, 27, 10, 'p'), R(56, 14, 14, 6, 3, 'q'), C(38, 0, 3, 'p'),
  ] },
  { id: 'bunnyears', name: 'Orelhas de coelho', cost: 260, p: 0xf0f4ff, q: 0xff8fc4, parts: [
    R(18, -20, 10, 34, 5, OUTLINE), R(48, -20, 10, 34, 5, OUTLINE),
    R(20, -17, 6, 26, 3, 'p'), R(50, -17, 6, 26, 3, 'p'),
    R(21.5, -13, 3, 18, 1.5, 'q'), R(51.5, -13, 3, 18, 1.5, 'q'),
  ] },
  { id: 'catears', name: 'Orelhas de gato', cost: 240, p: 0x2a2016, q: 0xff8fc4, parts: [
    T(14, 12, 26, 12, 16, -10, OUTLINE), T(62, 12, 50, 12, 60, -10, OUTLINE),
    T(16, 10, 24, 10, 18, -4, 'p'), T(60, 10, 52, 10, 58, -4, 'p'),
    T(18, 9, 22, 9, 19.5, 2, 'q'), T(58, 9, 54, 9, 56.5, 2, 'q'),
  ] },
  { id: 'laurel', name: 'Coroa de louros', cost: 380, p: 0x8fca5e, k: 0xffd23e, parts: [
    T(20, 22, 10, 16, 12, 26, 'p'), T(22, 16, 12, 10, 14, 20, 'p'), T(24, 10, 14, 4, 16, 14, 'p'),
    T(56, 22, 66, 16, 64, 26, 'p'), T(54, 16, 64, 10, 62, 20, 'p'), T(52, 10, 62, 4, 60, 14, 'p'), C(38, 8, 3, 'k'),
  ] },
  { id: 'headscarf', name: 'Lenço', cost: 200, p: 0xff8fc4, q: 0xd45de0, parts: [
    R(10, 10, 56, 16, 8, OUTLINE), R(12, 12, 52, 12, 6, 'p'), T(58, 12, 72, 20, 62, 24, 'p'),
    C(24, 18, 1.6, 'q'), C(38, 15, 1.6, 'q'), C(52, 18, 1.6, 'q'),
  ] },
  { id: 'jester', name: 'Bobo da corte', cost: 420, p: 0xe8483f, q: 0x2a2358, k: 0xffd23e, parts: [
    T(14, 24, 22, 24, 8, -6, 'p'), T(30, 22, 46, 22, 38, -12, 'q'), T(54, 24, 62, 24, 68, -6, 'p'),
    C(8, -8, 3, 'k'), C(38, -14, 3, 'k'), C(68, -8, 3, 'k'), R(14, 22, 48, 6, 3, OUTLINE),
  ] },
  { id: 'sombrero', name: 'Sombreiro', cost: 340, p: 0xe8b968, q: 0xe8483f, parts: [
    E(38, 22, 42, 9, OUTLINE), E(38, 21, 39, 7, 'p'), E(38, 19, 20, 5, 'q'), R(24, 2, 28, 20, 8, OUTLINE), R(26, 4, 24, 16, 7, 'p'),
  ] },
  { id: 'flamehat', name: 'Chama', cost: 300, p: 0xff8b3d, q: 0xffd23e, parts: [
    T(38, -18, 22, 14, 54, 14, OUTLINE), T(38, -12, 26, 12, 50, 12, 'p'), T(38, -4, 30, 10, 46, 10, 'q'),
  ] },
  { id: 'visor', name: 'Viseira', cost: 180, p: 0xffd23e, q: 0x2a2358, parts: [
    R(12, 14, 52, 8, 4, 'q'), E(38, 22, 30, 6, 'p'),
  ] },
];

// ---------------------------------------------------------------- CABELOS
export const HAIRS = [
  { id: 'none', name: 'Nenhum', cost: 0 },
  { id: 'afro', name: 'Black power', cost: 200, p: 0x2a2016, q: 0x463628, parts: [
    C(22, 18, 12, 'p'), C(38, 12, 14, 'p'), C(54, 18, 12, 'p'), C(26, 14, 5, 'q', 0.6),
  ] },
  { id: 'spiky', name: 'Espetado', cost: 180, p: 0xf0a830, parts: [
    T(16, 26, 26, 26, 18, 4, 'p'), T(28, 24, 40, 24, 32, 0, 'p'), T(40, 24, 52, 24, 46, 2, 'p'), T(52, 26, 62, 26, 58, 6, 'p'),
  ] },
  { id: 'long', name: 'Longo', cost: 240, p: 0x8a4b28, q: 0xa35c33, parts: [
    R(8, 20, 12, 46, 6, 'p'), R(56, 20, 12, 46, 6, 'p'), R(12, 12, 52, 20, 10, 'p'), R(20, 10, 36, 10, 5, 'q'),
  ] },
  { id: 'pony', name: 'Rabo de cavalo', cost: 260, p: 0x2a2016, k: 0xff8fc4, parts: [
    R(12, 12, 52, 18, 9, 'p'), R(60, 20, 12, 34, 6, 'p'), C(66, 54, 6, 'p'), R(58, 18, 16, 7, 3.5, 'k'),
  ] },
  { id: 'mohawk', name: 'Moicano', cost: 320, p: 0x3ddad7, parts: [
    R(33, -2, 10, 30, 5, OUTLINE), R(34.5, 0, 7, 28, 3.5, 'p'), T(38, -8, 32, 4, 44, 4, 'p'),
  ] },
  { id: 'bun', name: 'Coque', cost: 220, p: 0x2a2016, k: 0xe8483f, parts: [
    C(38, 6, 9, 'p'), R(12, 14, 52, 16, 8, 'p'), R(30, 0, 16, 6, 3, 'k'),
  ] },
  { id: 'curly', name: 'Cachos', cost: 280, p: 0x6b3a1c, q: 0x8a4b28, parts: [
    C(18, 22, 8, 'p'), C(30, 14, 9, 'p'), C(46, 14, 9, 'p'), C(58, 22, 8, 'p'), C(38, 10, 8, 'p'), C(32, 12, 3.4, 'q', 0.7),
  ] },
  { id: 'rainbow', name: 'Arco-íris', cost: 600, parts: [
    R(12, 12, 52, 18, 9, 0xe8483f), R(12, 16, 52, 14, 7, 0xffc23e), R(12, 20, 52, 10, 5, 0x3ddad7), R(12, 24, 52, 6, 3, 0x9b59d0),
    T(16, 28, 24, 28, 18, 8, 0xe8483f), T(52, 28, 60, 28, 56, 8, 0x9b59d0),
  ] },
  { id: 'bob', name: 'Chanel', cost: 240, p: 0x2a2016, q: 0x463628, parts: [
    R(9, 14, 58, 40, 14, 'p'), R(14, 30, 48, 20, 6, 'p'), R(18, 10, 40, 10, 5, 'q'),
  ] },
  { id: 'braids', name: 'Tranças', cost: 300, p: 0x6b3a1c, k: 0xffd23e, parts: [
    R(12, 12, 52, 18, 9, 'p'), R(4, 26, 10, 40, 5, 'p'), R(62, 26, 10, 40, 5, 'p'),
    C(9, 32, 3, 'k'), C(9, 44, 3, 'k'), C(9, 56, 3, 'k'), C(67, 32, 3, 'k'), C(67, 44, 3, 'k'), C(67, 56, 3, 'k'),
  ] },
  { id: 'sweep', name: 'Franjão', cost: 220, p: 0xf0a830, parts: [
    R(12, 12, 52, 16, 8, 'p'), T(12, 20, 52, 16, 20, 36, 'p'), T(52, 16, 62, 28, 44, 30, 'p'),
  ] },
  { id: 'buzz', name: 'Raspado', cost: 140, p: 0x2a2016, parts: [R(13, 16, 50, 14, 7, 'p', 0.85)] },
  { id: 'twintails', name: 'Maria-chiquinha', cost: 320, p: 0xf0a830, k: 0xe8483f, parts: [
    R(12, 12, 52, 18, 9, 'p'), R(0, 22, 12, 30, 6, 'p'), R(64, 22, 12, 30, 6, 'p'), C(6, 24, 4, 'k'), C(70, 24, 4, 'k'),
  ] },
  { id: 'wave', name: 'Ondulado', cost: 260, p: 0x8a4b28, parts: [
    C(16, 26, 8, 'p'), C(26, 14, 9, 'p'), C(38, 10, 9, 'p'), C(50, 14, 9, 'p'), C(60, 26, 8, 'p'), C(10, 40, 7, 'p'), C(66, 40, 7, 'p'),
  ] },
  { id: 'ponytailhigh', name: 'Rabo alto', cost: 260, p: 0x2a2016, k: 0xffd23e, parts: [
    R(12, 12, 52, 18, 9, 'p'), R(30, -14, 16, 28, 8, 'p'), C(38, -16, 8, 'p'), R(28, -18, 20, 6, 3, 'k'),
  ] },
  { id: 'undercut', name: 'Undercut', cost: 260, p: 0x2a2016, parts: [
    R(13, 10, 50, 12, 6, 'p'), R(13, 20, 24, 6, 0, 'p', 0.85),
  ] },
  { id: 'dreadlocks', name: 'Dreads', cost: 320, p: 0x2a2016, parts: [
    R(12, 12, 52, 14, 7, 'p'), R(14, 24, 6, 30, 3, 'p'), R(24, 24, 6, 34, 3, 'p'), R(34, 24, 6, 30, 3, 'p'), R(44, 24, 6, 34, 3, 'p'), R(54, 24, 6, 30, 3, 'p'),
  ] },
  { id: 'pompadour', name: 'Topete', cost: 280, p: 0x2a2016, q: 0x463628, parts: [
    T(38, -6, 18, 20, 58, 20, 'p'), R(13, 14, 50, 10, 5, 'p'), C(38, -2, 8, 'q'),
  ] },
  { id: 'emo', name: 'Franja lateral', cost: 260, p: 0x2a2016, parts: [
    R(12, 12, 52, 18, 9, 'p'), T(20, 20, 44, 20, 26, 46, 'p'),
  ] },
  { id: 'halfup', name: 'Meio preso', cost: 240, p: 0x8a4b28, k: 0xff8fc4, parts: [
    R(10, 16, 56, 20, 10, 'p'), C(38, 4, 7, 'p'), R(30, -2, 16, 5, 2.5, 'k'),
  ] },
  { id: 'pixiecut', name: 'Pixie', cost: 180, p: 0x2a2016, parts: [
    R(13, 12, 50, 16, 8, 'p'), T(13, 20, 26, 20, 16, 30, 'p'), T(50, 20, 63, 20, 60, 30, 'p'),
  ] },
  { id: 'mullet', name: 'Mullet', cost: 300, p: 0xf0a830, parts: [
    R(13, 12, 50, 14, 7, 'p'), R(10, 22, 12, 32, 5, 'p'), R(54, 22, 12, 32, 5, 'p'),
  ] },
  { id: 'topknot', name: 'Coque samurai', cost: 260, p: 0x2a2016, k: 0xe8483f, parts: [
    R(13, 14, 50, 14, 7, 'p'), C(38, -2, 8, 'p'), R(30, -6, 16, 6, 3, 'k'),
  ] },
  { id: 'windswept', name: 'Despenteado', cost: 200, p: 0x8a4b28, parts: [
    T(16, 24, 8, 6, 26, 4, 'p'), T(28, 20, 22, 0, 38, 2, 'p'), T(42, 20, 40, -2, 54, 4, 'p'), T(56, 24, 58, 6, 66, 10, 'p'),
  ] },
];

// ---------------------------------------------------------------- ÓCULOS
export const GLASSES = [
  { id: 'none', name: 'Nenhum', cost: 0 },
  { id: 'round', name: 'Redondo', cost: 140, p: OUTLINE, q: 0xbfe4ff, parts: [
    C(28, 42, 10, 'p'), C(48, 42, 10, 'p'), C(28, 42, 8, 'q', 0.85), C(48, 42, 8, 'q', 0.85), R(36, 40, 4, 3, 1.5, 'p'),
  ] },
  { id: 'square', name: 'Quadrado', cost: 140, p: OUTLINE, q: 0xbfe4ff, parts: [
    R(15, 34, 22, 16, 4, 'p'), R(39, 34, 22, 16, 4, 'p'), R(17, 36, 18, 12, 3, 'q', 0.85), R(41, 36, 18, 12, 3, 'q', 0.85), R(35, 40, 6, 3, 1.5, 'p'),
  ] },
  { id: 'shades', name: 'Escuros', cost: 220, p: OUTLINE, q: 0x2a2358, parts: [
    R(14, 33, 48, 17, 6, 'p'), R(17, 36, 18, 11, 4, 'q'), R(41, 36, 18, 11, 4, 'q'), R(19, 38, 6, 3, 1.5, W, 0.4),
  ] },
  { id: 'starglasses', name: 'Estrela', cost: 380, p: 0xffd23e, q: 0xff8fc4, parts: [
    T(28, 33, 20, 48, 36, 48, 'p'), T(28, 50, 20, 36, 36, 36, 'p'), T(48, 33, 40, 48, 56, 48, 'q'), T(48, 50, 40, 36, 56, 36, 'q'), R(35, 40, 6, 3, 1.5, OUTLINE),
  ] },
  { id: 'monocle', name: 'Monóculo', cost: 300, p: 0xffd23e, q: 0xbfe4ff, parts: [
    C(48, 42, 11, 'p'), C(48, 42, 8.5, 'q', 0.8), L(48, 53, 44, 66, 2, 'p'), C(28, 42, 8, W), C(30, 43, 4, OUTLINE),
  ] },
  { id: 'ski', name: 'Esqui', cost: 340, p: 0xff8b3d, q: 0x3ddad7, parts: [
    R(12, 32, 52, 19, 9, OUTLINE), R(15, 35, 46, 13, 6, 'p'), R(18, 37, 14, 5, 2.5, W, 0.45), R(10, 36, 56, 5, 2.5, 'q'),
  ] },
  { id: '3d', name: 'Cinema 3D', cost: 260, parts: [
    R(14, 34, 48, 15, 5, W), R(17, 36, 18, 11, 3, 0xe8483f, 0.75), R(41, 36, 18, 11, 3, 0x3ddad7, 0.75),
  ] },
  { id: 'visorled', name: 'Visor LED', cost: 520, p: 0x3ddad7, q: 0xff8fc4, parts: [
    R(12, 33, 52, 17, 7, OUTLINE), R(15, 36, 46, 11, 5, 0x151233), C(24, 41, 2.4, 'p'), C(32, 41, 2.4, 'p'), C(44, 41, 2.4, 'q'), C(52, 41, 2.4, 'q'),
  ] },
  { id: 'heart', name: 'Coração', cost: 320, p: 0xe8483f, q: 0xff8fc4, parts: [
    C(23, 38, 6, 'p'), C(33, 38, 6, 'p'), T(17, 40, 39, 40, 28, 52, 'p'),
    C(43, 38, 6, 'p'), C(53, 38, 6, 'p'), T(37, 40, 59, 40, 48, 52, 'p'), R(35, 40, 6, 3, 1.5, 'q'),
  ] },
  { id: 'cateye', name: 'Gatinho', cost: 280, p: 0x2a2358, q: 0xbfe4ff, parts: [
    T(14, 34, 38, 36, 36, 50, 'p'), T(62, 34, 38, 36, 40, 50, 'p'), R(17, 38, 18, 10, 4, 'q', 0.85), R(41, 38, 18, 10, 4, 'q', 0.85),
  ] },
  { id: 'aviator', name: 'Aviador', cost: 360, p: 0xffd23e, q: 0x6b4a2e, parts: [
    L(12, 34, 64, 34, 3, 'p'), T(15, 34, 37, 34, 26, 54, OUTLINE), T(39, 34, 61, 34, 50, 54, OUTLINE),
    T(17, 36, 35, 36, 26, 51, 'q', 0.85), T(41, 36, 59, 36, 50, 51, 'q', 0.85),
  ] },
  { id: 'pixel', name: 'Pixel', cost: 300, p: OUTLINE, q: 0xbfe4ff, parts: [
    R(14, 36, 20, 12, 0, 'p'), R(42, 36, 20, 12, 0, 'p'), R(18, 39, 12, 6, 0, 'q'), R(46, 39, 12, 6, 0, 'q'), R(34, 39, 8, 4, 0, 'p'),
  ] },
  { id: 'cyber', name: 'Cyber', cost: 480, p: 0xe8483f, q: 0x151233, parts: [
    R(12, 34, 52, 14, 3, OUTLINE), R(14, 36, 48, 10, 2, 'q'), R(16, 39, 44, 3, 1.5, 'p'), C(60, 41, 3, 'p'),
  ] },
  { id: 'goggles', name: 'Óculos de proteção', cost: 320, p: 0xb5773a, q: 0x9fe8ff, parts: [
    R(10, 38, 56, 6, 3, 'p'), C(28, 42, 11, 'p'), C(48, 42, 11, 'p'), C(28, 42, 8, 'q', 0.8), C(48, 42, 8, 'q', 0.8),
  ] },
  { id: 'nerdy', name: 'Nerd', cost: 200, p: OUTLINE, q: 0xbfe4ff, parts: [
    R(15, 34, 22, 16, 3, 'p'), R(39, 34, 22, 16, 3, 'p'), R(17, 36, 18, 12, 2, 'q', 0.85), R(41, 36, 18, 12, 2, 'q', 0.85),
    L(35, 40, 41, 40, 3, 'p'), L(11, 38, 15, 40, 2, 'p'), L(61, 38, 65, 40, 2, 'p'),
  ] },
  { id: 'halfmoon', name: 'Meia-lua', cost: 220, p: 0xb8860b, q: 0xbfe4ff, parts: [
    A(28, 48, 9, 3, 'p'), A(48, 48, 9, 3, 'p'), C(28, 44, 8, 'q', 0.4), C(48, 44, 8, 'q', 0.4), R(35, 44, 6, 2, 1, 'p'),
  ] },
  { id: 'steampunk', name: 'Steampunk', cost: 420, p: 0xb8733a, q: 0x9fe8ff, parts: [
    C(28, 42, 11, 'p'), C(48, 42, 5, 'p'), C(28, 42, 8, 'q', 0.85), C(48, 42, 3.5, 'q', 0.85),
    R(35, 40, 6, 3, 1.5, 'p'), C(56, 42, 3, 'p', 0.9), L(48, 36, 48, 30, 2, 'p'),
  ] },
  { id: 'sporty', name: 'Esportivo', cost: 260, p: 0xe8483f, q: 0x1c2440, parts: [
    R(14, 34, 48, 15, 6, 'p'), R(17, 36, 18, 11, 4, 'q', 0.85), R(41, 36, 18, 11, 4, 'q', 0.85), R(9, 34, 6, 4, 2, 'p'), R(61, 34, 6, 4, 2, 'p'),
  ] },
  { id: 'skimask', name: 'Máscara de esqui', cost: 320, p: 0x2a2358, q: 0x9fe8ff, parts: [
    R(10, 30, 56, 26, 10, 'p'), E(28, 42, 8, 6, 'q', 0.9), E(48, 42, 8, 6, 'q', 0.9),
  ] },
  { id: 'butterflyglasses', name: 'Borboleta', cost: 340, p: 0xff8fc4, q: 0xffd23e, parts: [
    E(26, 40, 13, 10, 'p'), E(50, 40, 13, 10, 'p'), E(26, 40, 8, 6, 'q', 0.8), E(50, 40, 8, 6, 'q', 0.8), R(35, 40, 6, 3, 1.5, OUTLINE),
  ] },
  { id: 'hexagon', name: 'Hexagonal', cost: 300, p: 0xffd23e, q: 0x2a2358, parts: [
    T(28, 34, 20, 42, 28, 50, 'p'), T(28, 34, 36, 42, 28, 50, 'p'), T(48, 34, 40, 42, 48, 50, 'p'), T(48, 34, 56, 42, 48, 50, 'p'),
    C(28, 42, 6, 'q', 0.7), C(48, 42, 6, 'q', 0.7),
  ] },
  { id: 'rimless', name: 'Sem aro', cost: 180, p: 0xbfe4ff, parts: [
    C(28, 42, 9, 'p', 0.55), C(48, 42, 9, 'p', 0.55), L(35, 42, 41, 42, 1.5, 0x8d93a8),
  ] },
  { id: 'xglasses', name: 'Nocaute', cost: 160, p: OUTLINE, parts: [
    L(20, 35, 36, 49, 4, 'p'), L(36, 35, 20, 49, 4, 'p'), L(40, 35, 56, 49, 4, 'p'), L(56, 35, 40, 49, 4, 'p'),
  ] },
  { id: 'wrap', name: 'Envolvente', cost: 280, p: 0x2a2358, q: 0x9fe8ff, parts: [
    E(38, 42, 30, 12, 'p'), E(38, 42, 26, 9, 'q', 0.6),
  ] },
];

// ---------------------------------------------------------------- ROSTOS
// Substituem os olhos padrão. A cor da paleta tinge a íris (papel 'p').
export const FACES = [
  { id: 'none', name: 'Normal', cost: 0 },
  { id: 'happy', name: 'Feliz', cost: 100, p: OUTLINE, parts: [A(28, 44, 8, 4, 'p'), A(48, 44, 8, 4, 'p')] },
  { id: 'wink', name: 'Piscada', cost: 160, p: OUTLINE, parts: [C(28, 42, 8, W), C(30, 43, 4, 'p'), A(48, 44, 8, 4, 'p')] },
  { id: 'angry', name: 'Bravo', cost: 220, p: OUTLINE, parts: [
    C(28, 42, 8, W), C(48, 42, 8, W), C(30, 43, 4, 'p'), C(50, 43, 4, 'p'), T(18, 29, 36, 36, 18, 36, OUTLINE), T(58, 29, 40, 36, 58, 36, OUTLINE),
  ] },
  { id: 'star', name: 'Estrelado', cost: 400, p: 0xffd23e, parts: [
    C(28, 42, 8, W), C(48, 42, 8, W), T(28, 35, 22, 47, 34, 47, 'p'), T(28, 49, 22, 37, 34, 37, 'p'), T(48, 35, 42, 47, 54, 47, 'p'), T(48, 49, 42, 37, 54, 37, 'p'),
  ] },
  { id: 'blush', name: 'Corado', cost: 180, p: OUTLINE, parts: [
    A(28, 44, 8, 4, 'p'), A(48, 44, 8, 4, 'p'), E(19, 52, 6, 4, 0xff8fc4, 0.75), E(57, 52, 6, 4, 0xff8fc4, 0.75),
  ] },
  { id: 'sleepy', name: 'Sonolento', cost: 200, p: OUTLINE, parts: [
    L(20, 42, 36, 42, 4, 'p'), L(40, 42, 56, 42, 4, 'p'), C(24, 48, 2, 0xbfe4ff), C(52, 48, 2, 0xbfe4ff),
  ] },
  { id: 'dizzy', name: 'Tonto', cost: 260, p: OUTLINE, parts: [
    C(28, 42, 8, W), C(48, 42, 8, W), L(23, 37, 33, 47, 3, 'p'), L(33, 37, 23, 47, 3, 'p'), L(43, 37, 53, 47, 3, 'p'), L(53, 37, 43, 47, 3, 'p'),
  ] },
  { id: 'robot', name: 'Robô', cost: 460, p: 0x3ddad7, parts: [
    R(16, 34, 44, 16, 4, OUTLINE), R(18, 36, 40, 12, 3, 0x151233), R(23, 39, 8, 6, 1, 'p'), R(45, 39, 8, 6, 1, 'p'), R(33, 41, 10, 2, 1, 'p', 0.6),
  ] },
  { id: 'surprised', name: 'Surpreso', cost: 180, p: OUTLINE, parts: [
    C(28, 42, 9, W), C(48, 42, 9, W), C(28, 42, 3.5, 'p'), C(48, 42, 3.5, 'p'), E(38, 58, 5, 6, OUTLINE),
  ] },
  { id: 'sad', name: 'Tristinho', cost: 160, p: OUTLINE, parts: [
    C(28, 42, 8, W), C(48, 42, 8, W), C(28, 45, 4, 'p'), C(48, 45, 4, 'p'), T(18, 36, 36, 30, 34, 36, OUTLINE), T(58, 36, 40, 30, 42, 36, OUTLINE),
  ] },
  { id: 'laugh', name: 'Gargalhada', cost: 240, p: OUTLINE, parts: [
    A(28, 44, 8, 4, 'p'), A(48, 44, 8, 4, 'p'), E(38, 60, 9, 6, OUTLINE), E(38, 62, 6, 3, 0xff8fc4),
  ] },
  { id: 'hearteyes', name: 'Apaixonado', cost: 360, p: 0xe8483f, parts: [
    C(24, 39, 4, 'p'), C(32, 39, 4, 'p'), T(20, 41, 36, 41, 28, 50, 'p'), C(44, 39, 4, 'p'), C(52, 39, 4, 'p'), T(40, 41, 56, 41, 48, 50, 'p'),
  ] },
  { id: 'catface', name: 'Felino', cost: 300, p: 0xffd23e, parts: [
    C(28, 42, 8, W), C(48, 42, 8, W), C(28, 42, 6, 'p'), C(48, 42, 6, 'p'), E(28, 42, 1.6, 5.5, OUTLINE), E(48, 42, 1.6, 5.5, OUTLINE),
  ] },
  { id: 'cyclops', name: 'Ciclope', cost: 420, p: OUTLINE, parts: [
    C(38, 42, 13, OUTLINE), C(38, 42, 10.5, W), C(38, 43, 5, 'p'), C(35, 39, 2, W),
  ] },
  { id: 'closed', name: 'Zen', cost: 140, p: OUTLINE, parts: [A(28, 40, 8, 4, 'p'), A(48, 40, 8, 4, 'p'), A(38, 60, 5, 3, OUTLINE)] },
  { id: 'tongue', name: 'Língua', cost: 200, p: OUTLINE, parts: [
    C(28, 42, 8, W), C(30, 43, 4, 'p'), A(48, 44, 8, 4, 'p'), R(34, 56, 10, 10, 5, 0xff6b9d), R(34, 54, 10, 3, 1.5, OUTLINE),
  ] },
  { id: 'dots', name: 'Pontinhos', cost: 120, p: OUTLINE, parts: [C(28, 42, 3.5, 'p'), C(48, 42, 3.5, 'p'), L(35, 52, 41, 52, 2.5, OUTLINE)] },
  { id: 'glow', name: 'Brilhante', cost: 480, p: 0x3ddad7, parts: [
    C(28, 42, 9, 'p', 0.35), C(48, 42, 9, 'p', 0.35), C(28, 42, 6, 'p'), C(48, 42, 6, 'p'), C(26, 40, 2, W), C(46, 40, 2, W),
  ] },
  { id: 'brows', name: 'Sobrancelhudo', cost: 180, p: OUTLINE, parts: [
    C(28, 42, 8, W), C(48, 42, 8, W), C(30, 43, 4, 'p'), C(50, 43, 4, 'p'), R(18, 28, 20, 5, 2.5, OUTLINE), R(38, 28, 20, 5, 2.5, OUTLINE),
  ] },
  { id: 'wide', name: 'Olhos arregalados', cost: 160, p: OUTLINE, parts: [
    C(28, 42, 10, W), C(48, 42, 10, W), C(28, 42, 3, 'p'), C(48, 42, 3, 'p'),
  ] },
  { id: 'sparkle', name: 'Brilhoso', cost: 260, p: 0x2b7fd4, parts: [
    C(28, 42, 8, W), C(48, 42, 8, W), C(29, 43, 4, 'p'), C(49, 43, 4, 'p'), C(26, 40, 1.6, W), C(46, 40, 1.6, W),
  ] },
  { id: 'pirateeye', name: 'Tapa-olho', cost: 220, p: OUTLINE, parts: [
    A(48, 44, 8, 4, 'p'), E(28, 42, 10, 8, 'p'), L(20, 36, 8, 30, 2, 'p'), L(36, 36, 48, 30, 2, 'p'),
  ] },
  { id: 'bandaid', name: 'Curativo', cost: 140, p: OUTLINE, parts: [
    A(28, 44, 8, 4, 'p'), A(48, 44, 8, 4, 'p'), R(30, 50, 16, 6, 3, 0xf2b5c9), L(33, 50, 38, 56, 1.5, 'p'),
  ] },
  { id: 'freckles', name: 'Sardinhas', cost: 160, p: OUTLINE, parts: [
    A(28, 44, 8, 4, 'p'), A(48, 44, 8, 4, 'p'), C(20, 50, 1.2, 0xb5773a), C(24, 53, 1.2, 0xb5773a), C(52, 50, 1.2, 0xb5773a), C(56, 53, 1.2, 0xb5773a), C(38, 52, 1.2, 0xb5773a),
  ] },
  { id: 'mustache', name: 'Bigode', cost: 240, p: OUTLINE, parts: [
    C(28, 42, 8, W), C(48, 42, 8, W), C(30, 43, 4, 'p'), C(50, 43, 4, 'p'), T(28, 52, 38, 56, 38, 50, 0x6b4a2e), T(48, 52, 38, 56, 38, 50, 0x6b4a2e),
  ] },
  { id: 'monsterface', name: 'Monstrinho', cost: 260, p: OUTLINE, parts: [
    C(28, 42, 8, W), C(48, 42, 8, W), C(30, 43, 4, 'p'), C(50, 43, 4, 'p'), T(30, 54, 26, 62, 34, 60, W), T(46, 54, 42, 62, 50, 60, W),
  ] },
  { id: 'stitched', name: 'Costurado', cost: 300, p: OUTLINE, parts: [
    L(22, 36, 34, 48, 2, 'p'), L(22, 48, 34, 36, 2, 'p'), L(42, 36, 54, 48, 2, 'p'), L(42, 48, 54, 36, 2, 'p'),
    L(30, 56, 46, 56, 2, 'p'), L(32, 53, 32, 59, 1.5, 'p'), L(38, 53, 38, 59, 1.5, 'p'), L(44, 53, 44, 59, 1.5, 'p'),
  ] },
  { id: 'puppy', name: 'Pidão', cost: 300, p: 0x6b4a2e, parts: [
    C(28, 43, 9, W), C(48, 43, 9, W), C(29, 45, 5.5, 'p'), C(49, 45, 5.5, 'p'), C(27, 42, 1.6, W), C(47, 42, 1.6, W),
  ] },
  { id: 'sunburn', name: 'Queimado de sol', cost: 180, p: OUTLINE, parts: [
    A(28, 44, 8, 4, 'p'), A(48, 44, 8, 4, 'p'), C(38, 50, 4, 0xe8483f, 0.8),
  ] },
];

// ---------------------------------------------------------------- ASAS
// Ficam ATRÁS do corpo.
export const WINGS = [
  { id: 'none', name: 'Nenhuma', cost: 0 },
  { id: 'angel', name: 'Anjo', cost: 420, p: W, q: 0xe8f0ff, parts: [
    E(8, 52, 12, 20, 'p'), E(68, 52, 12, 20, 'p'), E(9, 50, 8, 14, 'q'), E(67, 50, 8, 14, 'q'),
  ] },
  { id: 'bat', name: 'Morcego', cost: 400, p: 0x4a3f8c, q: 0x6b4aa8, parts: [
    T(14, 34, -4, 46, 14, 62, 'p'), T(62, 34, 80, 46, 62, 62, 'p'), T(12, 40, 2, 48, 12, 56, 'q'), T(64, 40, 74, 48, 64, 56, 'q'),
  ] },
  { id: 'fairy', name: 'Fada', cost: 480, p: 0xbfe4ff, q: 0xff8fc4, parts: [
    E(10, 44, 11, 15, 'p', 0.75), E(66, 44, 11, 15, 'p', 0.75), E(12, 62, 8, 11, 'q', 0.7), E(64, 62, 8, 11, 'q', 0.7),
  ] },
  { id: 'beewings', name: 'Abelha', cost: 380, p: W, q: 0xffd23e, parts: [
    E(11, 40, 10, 14, 'p', 0.7), E(65, 40, 10, 14, 'p', 0.7), L(4, 34, 18, 46, 2, 'q'), L(72, 34, 58, 46, 2, 'q'),
  ] },
  { id: 'dragonwings', name: 'Dragão', cost: 700, p: 0x2fb573, q: 0x8fe66a, k: 0xffd23e, parts: [
    T(14, 30, -6, 44, 14, 66, 'p'), T(62, 30, 82, 44, 62, 66, 'p'), T(13, 36, 2, 46, 13, 58, 'q'), T(63, 36, 74, 46, 63, 58, 'q'), C(-4, 44, 3, 'k'), C(80, 44, 3, 'k'),
  ] },
  { id: 'jet', name: 'Foguete', cost: 640, p: 0x8d93a8, q: 0xff8b3d, k: 0xffd23e, parts: [
    R(0, 44, 16, 12, 6, 'p'), R(60, 44, 16, 12, 6, 'p'), T(6, 58, 0, 76, 12, 76, 'q'), T(70, 58, 64, 76, 76, 76, 'q'), T(7, 62, 3, 72, 11, 72, 'k'), T(69, 62, 65, 72, 73, 72, 'k'),
  ] },
  { id: 'leaf', name: 'Folhas', cost: 360, p: 0x3fae70, q: 0x2a7a4a, parts: [
    E(10, 48, 10, 17, 'p'), E(66, 48, 10, 17, 'p'), L(10, 34, 10, 62, 2, 'q'), L(66, 34, 66, 62, 2, 'q'),
  ] },
  { id: 'butterfly', name: 'Borboleta', cost: 520, p: 0xff8b3d, q: 0xffd23e, k: OUTLINE, parts: [
    E(8, 40, 13, 14, 'k'), E(68, 40, 13, 14, 'k'), E(8, 40, 10, 11, 'p'), E(68, 40, 10, 11, 'p'),
    E(10, 60, 10, 11, 'k'), E(66, 60, 10, 11, 'k'), E(10, 60, 7, 8, 'p'), E(66, 60, 7, 8, 'p'), C(8, 40, 4, 'q'), C(68, 40, 4, 'q'),
  ] },
  { id: 'ghostwings', name: 'Espectro', cost: 460, p: 0xbfe4ff, parts: [
    E(8, 50, 12, 22, 'p', 0.5), E(68, 50, 12, 22, 'p', 0.5), E(10, 48, 6, 12, W, 0.4), E(66, 48, 6, 12, W, 0.4),
  ] },
  { id: 'crystal', name: 'Cristal', cost: 600, p: 0x9fe8ff, q: 0x3ddad7, parts: [
    T(14, 36, -2, 40, 10, 64, 'p'), T(62, 36, 78, 40, 66, 64, 'p'), T(14, 46, 2, 52, 12, 66, 'q'), T(62, 46, 74, 52, 64, 66, 'q'),
  ] },
  { id: 'mech', name: 'Mecânica', cost: 680, p: 0x8d93a8, q: 0x5f6b8a, k: 0xe8483f, parts: [
    R(-2, 36, 18, 10, 3, 'q'), R(60, 36, 18, 10, 3, 'q'), R(-4, 48, 20, 10, 3, 'p'), R(60, 48, 20, 10, 3, 'p'),
    R(-2, 60, 18, 10, 3, 'q'), R(60, 60, 18, 10, 3, 'q'), C(4, 41, 2, 'k'), C(72, 41, 2, 'k'),
  ] },
  { id: 'phoenix', name: 'Fênix', cost: 760, p: 0xff8b3d, q: 0xe8483f, k: 0xffd23e, parts: [
    T(14, 30, -8, 26, 12, 70, 'q'), T(62, 30, 84, 26, 64, 70, 'q'), T(14, 36, -2, 34, 12, 62, 'p'), T(62, 36, 78, 34, 64, 62, 'p'),
    T(13, 44, 4, 44, 12, 56, 'k'), T(63, 44, 72, 44, 64, 56, 'k'),
  ] },
  { id: 'moth', name: 'Mariposa', cost: 420, p: 0x8d6a4c, q: 0xd9c3a3, parts: [
    E(8, 44, 13, 18, 'p', 0.85), E(68, 44, 13, 18, 'p', 0.85), C(8, 44, 5, 'q', 0.7), C(68, 44, 5, 'q', 0.7),
  ] },
  { id: 'solarwings', name: 'Painel solar', cost: 640, p: 0x1b3a6b, q: 0x3ddad7, parts: [
    R(-4, 36, 20, 30, 2, OUTLINE), R(-2, 38, 16, 26, 0, 'p'), R(60, 36, 20, 30, 2, OUTLINE), R(62, 38, 16, 26, 0, 'p'),
    L(6, 38, 6, 64, 1, 'q'), L(70, 38, 70, 64, 1, 'q'),
  ] },
  { id: 'paperwings', name: 'Origami', cost: 380, p: W, q: 0xe0e0e0, parts: [
    T(14, 36, -6, 40, 12, 62, 'p'), T(14, 44, 4, 50, 12, 62, 'q'), T(62, 36, 82, 40, 64, 62, 'p'), T(62, 44, 72, 50, 64, 62, 'q'),
  ] },
  { id: 'flamewings', name: 'Chamas', cost: 560, p: 0xe8483f, q: 0xff8b3d, k: 0xffd23e, parts: [
    T(14, 30, -6, 44, 14, 66, 'p'), T(13, 36, 0, 46, 13, 60, 'q'), T(13, 44, 6, 50, 13, 58, 'k'),
    T(62, 30, 82, 44, 62, 66, 'p'), T(63, 36, 76, 46, 63, 60, 'q'), T(63, 44, 70, 50, 63, 58, 'k'),
  ] },
  { id: 'stormwings', name: 'Tempestade', cost: 600, p: 0x4a5378, q: 0xffd23e, parts: [
    T(14, 32, -4, 44, 14, 64, 'p'), T(62, 32, 80, 44, 62, 64, 'p'),
    L(4, 44, 12, 50, 3, 'q'), L(12, 50, 6, 56, 3, 'q'), L(64, 44, 72, 50, 3, 'q'), L(72, 50, 66, 56, 3, 'q'),
  ] },
  { id: 'coralwings', name: 'Coral', cost: 460, p: 0xff8fc4, q: 0xd45de0, parts: [
    E(9, 44, 10, 16, 'p', 0.85), E(67, 44, 10, 16, 'p', 0.85), C(4, 36, 4, 'q', 0.7), C(10, 32, 3, 'q', 0.7), C(72, 36, 4, 'q', 0.7), C(66, 32, 3, 'q', 0.7),
  ] },
  { id: 'discowings', name: 'Holográfica', cost: 700, p: 0xd45de0, q: 0x3ddad7, k: 0xffd23e, parts: [
    E(9, 44, 11, 17, 'p', 0.55), E(67, 44, 11, 17, 'p', 0.55), C(9, 40, 2, 'q'), C(9, 48, 2, 'k'), C(67, 40, 2, 'q'), C(67, 48, 2, 'k'),
  ] },
  { id: 'featherwings', name: 'Penas', cost: 480, p: 0xf0e0c0, q: 0xb5773a, parts: [
    T(10, 40, -4, 44, 8, 52, 'p'), T(12, 48, -2, 52, 10, 60, 'p'), T(14, 56, 0, 60, 12, 68, 'p'),
    T(66, 40, 80, 44, 68, 52, 'p'), T(64, 48, 78, 52, 66, 60, 'p'), T(62, 56, 76, 60, 64, 68, 'p'),
  ] },
];

// ---------------------------------------------------------------- ROUPAS
// Desenhadas sobre a barriga, abaixo do rosto.
export const OUTFITS = [
  { id: 'none', name: 'Nenhuma', cost: 0 },
  { id: 'tie', name: 'Gravata', cost: 140, p: 0xe8483f, q: 0x9c2820, parts: [
    T(38, 58, 32, 66, 44, 66, 'p'), T(38, 88, 31, 68, 45, 68, 'p'), R(33, 55, 10, 5, 2, 'q'),
  ] },
  { id: 'bowtie', name: 'Borboleta', cost: 160, p: 0x9b59d0, q: 0x6b3fa0, parts: [
    T(38, 60, 24, 54, 24, 66, 'p'), T(38, 60, 52, 54, 52, 66, 'p'), C(38, 60, 4, 'q'),
  ] },
  { id: 'scarf', name: 'Cachecol', cost: 200, p: 0xe8483f, parts: [
    R(14, 56, 48, 11, 5, 'p'), R(44, 62, 11, 26, 5, 'p'), R(14, 59, 48, 3, 1.5, W, 0.35),
  ] },
  { id: 'cape', name: 'Capa', cost: 340, p: 0x9b59d0, q: 0xb478e8, k: 0xffd23e, parts: [
    R(12, 52, 52, 44, 12, 'p'), R(16, 54, 44, 40, 10, 'q'), R(14, 50, 48, 8, 4, 'k'),
  ] },
  { id: 'armor', name: 'Armadura', cost: 520, p: 0x8d93a8, q: 0xa8aec2, k: 0xffd23e, parts: [
    R(16, 54, 44, 40, 10, 'p'), R(19, 57, 38, 34, 8, 'q'), R(30, 57, 16, 34, 4, 0x6f7590), C(38, 66, 5, 'k'), R(12, 52, 14, 12, 5, 'p'), R(50, 52, 14, 12, 5, 'p'),
  ] },
  { id: 'hoodie', name: 'Moletom', cost: 300, p: 0x4a5378, q: 0x5f6b8a, parts: [
    R(14, 52, 48, 44, 12, 'p'), R(17, 55, 42, 40, 10, 'q'), R(24, 74, 28, 12, 6, 0x3a4160), L(30, 56, 34, 68, 3, W), L(46, 56, 42, 68, 3, W),
  ] },
  { id: 'vest', name: 'Colete', cost: 280, p: 0x2fb573, k: 0xffd23e, parts: [
    R(14, 54, 20, 42, 8, 'p'), R(42, 54, 20, 42, 8, 'p'), C(28, 70, 2.6, 'k'), C(28, 82, 2.6, 'k'),
  ] },
  { id: 'apron', name: 'Avental', cost: 240, p: W, q: 0xe0e0e0, parts: [
    R(22, 56, 32, 40, 6, 'p'), R(25, 70, 26, 14, 3, 'q'), L(28, 56, 34, 48, 3, 'p'), L(48, 56, 42, 48, 3, 'p'),
  ] },
  { id: 'medal', name: 'Medalha', cost: 460, p: 0x3ddad7, q: 0xd9a410, k: 0xffd23e, parts: [
    L(26, 52, 38, 70, 4, 'p'), L(50, 52, 38, 70, 4, 'p'), C(38, 76, 9, 'q'), C(38, 76, 6.5, 'k'), T(38, 71, 34, 80, 42, 80, 'q'),
  ] },
  { id: 'stripes', name: 'Camisa listrada', cost: 220, p: 0x2b7fd4, q: W, parts: [
    R(14, 54, 48, 42, 10, 'q'), R(14, 60, 48, 6, 0, 'p'), R(14, 72, 48, 6, 0, 'p'), R(14, 84, 48, 6, 0, 'p'),
  ] },
  { id: 'overalls', name: 'Jardineira', cost: 260, p: 0x2b7fd4, q: 0x1b4f8f, k: 0xffd23e, parts: [
    R(16, 66, 44, 30, 8, 'p'), R(24, 54, 8, 14, 2, 'p'), R(44, 54, 8, 14, 2, 'p'), R(30, 70, 16, 10, 3, 'q'), C(28, 56, 2.4, 'k'), C(48, 56, 2.4, 'k'),
  ] },
  { id: 'tux', name: 'Smoking', cost: 420, p: 0x1c2440, q: W, k: 0xe8483f, parts: [
    R(14, 54, 48, 42, 10, 'p'), T(28, 54, 48, 54, 38, 84, 'q'), T(38, 62, 30, 58, 30, 66, 'k'), T(38, 62, 46, 58, 46, 66, 'k'), C(38, 74, 2, 'p'), C(38, 80, 2, 'p'),
  ] },
  { id: 'lifevest', name: 'Colete salva-vidas', cost: 240, p: 0xff8b3d, q: 0x1c2440, parts: [
    R(14, 54, 20, 42, 6, 'p'), R(42, 54, 20, 42, 6, 'p'), R(14, 70, 20, 5, 0, 'q'), R(42, 70, 20, 5, 0, 'q'),
  ] },
  { id: 'sash', name: 'Faixa', cost: 200, p: 0xe8483f, k: 0xffd23e, parts: [
    L(16, 56, 60, 90, 9, OUTLINE), L(16, 56, 60, 90, 6, 'p'), C(52, 84, 4, 'k'),
  ] },
  { id: 'sweater', name: 'Suéter', cost: 280, p: 0xe8483f, q: W, parts: [
    R(14, 54, 48, 42, 10, 'p'), R(14, 58, 48, 4, 0, 'q'), T(22, 66, 30, 76, 22, 76, 'q'), T(38, 66, 46, 76, 38, 76, 'q'), T(54, 66, 58, 76, 54, 76, 'q'),
  ] },
  { id: 'labcoat', name: 'Jaleco', cost: 300, p: W, q: 0x3ddad7, parts: [
    R(12, 54, 52, 42, 8, 'p'), R(36, 54, 4, 42, 0, 0xe0e0e0), R(16, 62, 8, 4, 1, 'q'), R(20, 78, 12, 8, 2, 0xe0e0e0),
  ] },
  { id: 'jersey', name: 'Camisa de time', cost: 260, p: 0x2fb573, q: W, parts: [
    R(14, 54, 48, 42, 10, 'p'), R(12, 52, 14, 12, 5, 'p'), R(50, 52, 14, 12, 5, 'p'), R(30, 62, 16, 22, 3, 'q', 0.9),
  ] },
  { id: 'raincoat', name: 'Capa de chuva', cost: 260, p: 0xffd23e, q: 0xd9a410, parts: [
    R(12, 52, 52, 42, 12, 'p'), R(16, 54, 44, 8, 4, 'q'), R(16, 50, 44, 6, 3, OUTLINE),
  ] },
  { id: 'kimono', name: 'Quimono', cost: 320, p: 0xe8483f, q: W, k: 0x2a2358, parts: [
    R(14, 54, 48, 42, 8, 'p'), T(38, 54, 24, 96, 34, 60, 'q'), T(38, 54, 52, 96, 42, 60, 'q'), R(30, 68, 16, 6, 3, 'k'),
  ] },
  { id: 'astronaut', name: 'Astronauta', cost: 460, p: W, q: 0x9fe8ff, k: 0xe8483f, parts: [
    R(14, 52, 48, 44, 12, 'p'), C(38, 68, 16, 'q', 0.5), R(20, 78, 12, 8, 3, 'k'), R(44, 78, 12, 8, 3, 'k'),
  ] },
  { id: 'referee', name: 'Juiz', cost: 240, p: OUTLINE, q: W, parts: [
    R(14, 54, 48, 42, 10, 'q'), R(14, 58, 48, 6, 0, 'p'), R(14, 70, 48, 6, 0, 'p'), R(14, 82, 48, 6, 0, 'p'),
  ] },
  { id: 'waistcoat', name: 'Colete xadrez', cost: 280, p: 0x9b59d0, q: 0x6b3fa0, parts: [
    R(14, 54, 20, 42, 8, 'p'), R(42, 54, 20, 42, 8, 'p'), R(16, 60, 16, 4, 0, 'q'), R(16, 70, 16, 4, 0, 'q'), R(44, 60, 16, 4, 0, 'q'), R(44, 70, 16, 4, 0, 'q'),
  ] },
  { id: 'pajamas', name: 'Pijama', cost: 220, p: 0x7fd0ff, q: W, parts: [
    R(14, 54, 48, 42, 10, 'p'), C(22, 64, 2, 'q'), C(22, 74, 2, 'q'), C(22, 84, 2, 'q'), C(54, 64, 2, 'q'), C(54, 74, 2, 'q'), C(54, 84, 2, 'q'),
  ] },
  { id: 'toga', name: 'Toga', cost: 260, p: W, k: 0xffd23e, parts: [
    T(14, 54, 62, 54, 38, 96, 'p'), L(16, 54, 60, 54, 3, 'k'),
  ] },
  { id: 'knightchest', name: 'Peitoral', cost: 480, p: 0xc8ceda, q: 0x8d93a8, k: 0xffd23e, parts: [
    R(16, 54, 44, 40, 10, 'p'), T(38, 54, 30, 78, 46, 78, 'q'), C(38, 60, 3, 'k'),
  ] },
  { id: 'swimsuit', name: 'Sunga listrada', cost: 200, p: 0x2b7fd4, q: W, parts: [
    R(20, 74, 36, 20, 10, 'p'), R(20, 78, 36, 4, 0, 'q'), R(20, 86, 36, 4, 0, 'q'),
  ] },
  { id: 'poncho', name: 'Poncho', cost: 300, p: 0xff8b3d, q: 0xffd23e, k: 0xe8483f, parts: [
    T(38, 50, 8, 90, 68, 90, 'p'), L(16, 66, 60, 66, 3, 'q'), L(16, 78, 60, 78, 3, 'k'),
  ] },
];

// ---------------------------------------------------------------- PETS
// Companheiro flutuando ao lado; fica ATRÁS do corpo.
export const PETS = [
  { id: 'none', name: 'Nenhum', cost: 0 },
  { id: 'bird', name: 'Passarinho', cost: 300, p: 0x3ddad7, q: 0x2a9d9a, k: 0xffd23e, parts: [
    E(70, 30, 9, 4, 0x000000, 0.15), C(70, 22, 8, 'p'), T(78, 20, 88, 23, 78, 27, 'q'), T(62, 20, 54, 23, 62, 26, 'k'), C(73, 19, 2.4, W), C(73.6, 19, 1.2, OUTLINE),
  ] },
  { id: 'slime', name: 'Geleca', cost: 260, p: 0x8fe66a, parts: [
    E(70, 84, 11, 4, 0x000000, 0.2), E(70, 76, 11, 9, 'p', 0.9), C(66, 74, 2, OUTLINE), C(74, 74, 2, OUTLINE), C(67, 71, 3, W, 0.5),
  ] },
  { id: 'ghost', name: 'Fantasminha', cost: 380, p: W, parts: [
    C(70, 26, 9, 'p', 0.8), R(61, 26, 18, 12, 3, 'p', 0.8), C(66, 25, 2, OUTLINE), C(74, 25, 2, OUTLINE),
  ] },
  { id: 'cat', name: 'Gatinho', cost: 420, p: 0xffc23e, parts: [
    E(70, 88, 10, 4, 0x000000, 0.2), C(70, 80, 9, 'p'), T(63, 74, 63, 64, 70, 72, 'p'), T(77, 74, 77, 64, 70, 72, 'p'), C(66, 79, 2, OUTLINE), C(74, 79, 2, OUTLINE), L(79, 84, 88, 76, 3, 'p'),
  ] },
  { id: 'beepet', name: 'Abelhinha', cost: 340, p: 0xffd23e, parts: [
    C(70, 24, 8, 'p'), R(64, 20, 12, 4, 1, OUTLINE), R(64, 26, 12, 4, 1, OUTLINE), E(66, 15, 6, 4, W, 0.65), E(76, 15, 6, 4, W, 0.65),
  ] },
  { id: 'rock', name: 'Pedrinha', cost: 220, p: 0x8d93a8, q: 0xa8aec2, parts: [
    E(70, 90, 11, 4, 0x000000, 0.2), C(70, 82, 10, 'p'), C(66, 78, 4, 'q'), C(66, 82, 2, OUTLINE), C(74, 82, 2, OUTLINE),
  ] },
  { id: 'starpet', name: 'Estrelinha', cost: 560, p: 0xffd23e, parts: [
    T(70, 12, 60, 32, 80, 32, 'p'), T(70, 36, 60, 16, 80, 16, 'p'), C(67, 23, 1.8, OUTLINE), C(73, 23, 1.8, OUTLINE),
  ] },
  { id: 'dragonpet', name: 'Dragãozinho', cost: 800, p: 0x2fb573, q: 0x8fe66a, parts: [
    E(70, 88, 11, 4, 0x000000, 0.2), C(70, 80, 10, 'p'), T(64, 72, 66, 62, 71, 71, 'q'), T(76, 72, 78, 63, 71, 71, 'q'), C(66, 79, 2.2, OUTLINE), C(74, 79, 2.2, OUTLINE), T(80, 76, 90, 72, 82, 82, 'p'),
  ] },
  { id: 'frog', name: 'Sapinho', cost: 280, p: 0x8fca5e, q: 0x3fae70, parts: [
    E(70, 90, 11, 4, 0x000000, 0.2), E(70, 82, 12, 8, 'p'), C(65, 74, 4, 'p'), C(75, 74, 4, 'p'), C(65, 74, 2, OUTLINE), C(75, 74, 2, OUTLINE), A(70, 86, 4, 1.5, 'q'),
  ] },
  { id: 'bunny', name: 'Coelhinho', cost: 320, p: 0xf0f4ff, k: 0xff8fc4, parts: [
    E(70, 90, 10, 4, 0x000000, 0.2), C(70, 82, 9, 'p'), R(64, 62, 5, 16, 2.5, 'p'), R(71, 62, 5, 16, 2.5, 'p'), R(65.5, 65, 2, 10, 1, 'k'), R(72.5, 65, 2, 10, 1, 'k'), C(67, 81, 2, OUTLINE), C(73, 81, 2, OUTLINE),
  ] },
  { id: 'robotpet', name: 'Robozinho', cost: 480, p: 0x8d93a8, q: 0x3ddad7, k: 0xe8483f, parts: [
    R(62, 70, 16, 16, 3, OUTLINE), R(64, 72, 12, 12, 2, 'p'), R(66, 75, 8, 4, 1, 'q'), L(70, 70, 70, 64, 2, OUTLINE), C(70, 63, 2.4, 'k'), R(66, 86, 8, 4, 1, OUTLINE),
  ] },
  { id: 'fish', name: 'Peixinho', cost: 300, p: 0xff8b3d, q: 0xffd23e, parts: [
    C(70, 24, 4, 0x9fe8ff, 0.4), C(74, 16, 2.5, 0x9fe8ff, 0.4), E(70, 30, 10, 7, 'p'), T(80, 30, 88, 24, 88, 36, 'p'), C(66, 29, 2, W), C(66.5, 29, 1, OUTLINE), E(72, 30, 3, 4, 'q'),
  ] },
  { id: 'owl', name: 'Corujinha', cost: 400, p: 0x8a6a4c, q: 0xd9c3a3, k: 0xffd23e, parts: [
    E(70, 28, 9, 11, 'p'), E(70, 31, 6, 6, 'q'), C(67, 24, 3, 'q'), C(73, 24, 3, 'q'), C(67, 24, 1.6, OUTLINE), C(73, 24, 1.6, OUTLINE), T(70, 26, 68, 29, 72, 29, 'k'),
  ] },
  { id: 'cloud', name: 'Nuvenzinha', cost: 360, p: W, parts: [
    C(66, 24, 6, 'p', 0.9), C(73, 21, 7, 'p', 0.9), C(78, 26, 5, 'p', 0.9), R(62, 24, 20, 6, 3, 'p', 0.9), C(70, 26, 1.5, OUTLINE), C(76, 26, 1.5, OUTLINE),
  ] },
  { id: 'penguin', name: 'Pinguinzinho', cost: 340, p: 0x1c2440, q: W, k: 0xff8b3d, parts: [
    E(70, 90, 11, 4, 0x000000, 0.2), E(70, 80, 10, 9, 'p'), E(70, 82, 6, 6, 'q'), T(70, 78, 66, 82, 74, 82, 'k'), C(67, 78, 1.6, OUTLINE), C(73, 78, 1.6, OUTLINE),
  ] },
  { id: 'hedgehog', name: 'Porco-espinho', cost: 320, p: 0xb5773a, q: 0xf0e0c0, parts: [
    E(70, 90, 11, 4, 0x000000, 0.2), C(70, 82, 9, 'p'), T(62, 76, 68, 66, 72, 76, 'p'), T(72, 76, 78, 66, 82, 76, 'p'), T(66, 74, 70, 64, 76, 74, 'p'), E(70, 84, 6, 4, 'q'), C(75, 80, 1.6, OUTLINE),
  ] },
  { id: 'snail', name: 'Caracol', cost: 260, p: 0x8fca5e, q: 0xff8b3d, parts: [
    E(72, 90, 13, 4, 0x000000, 0.2), C(66, 80, 9, 'q'), C(66, 80, 6, 'p', 0.7), E(80, 88, 10, 6, 'p'),
    L(72, 82, 70, 74, 1.5, 'p'), C(70, 73, 1.4, OUTLINE), L(76, 82, 78, 74, 1.5, 'p'), C(78, 73, 1.4, OUTLINE),
  ] },
  { id: 'crab', name: 'Caranguejo', cost: 280, p: 0xe8483f, parts: [
    E(70, 84, 12, 8, 'p'), C(64, 80, 3, 'p'), C(76, 80, 3, 'p'), C(64, 80, 1.4, OUTLINE), C(76, 80, 1.4, OUTLINE),
    L(58, 84, 66, 86, 2, 'p'), L(82, 84, 74, 86, 2, 'p'), T(56, 82, 60, 78, 62, 84, 'p'), T(84, 82, 80, 78, 78, 84, 'p'),
  ] },
  { id: 'mushroom', name: 'Cogumelo', cost: 260, p: 0xe8483f, q: W, parts: [
    E(70, 90, 11, 4, 0x000000, 0.2), R(64, 82, 12, 12, 4, 'q'), E(70, 78, 13, 9, 'p'), C(65, 76, 2, 'q'), C(74, 74, 2, 'q'), C(70, 80, 2, 'q'), C(67, 88, 2, OUTLINE), C(73, 88, 2, OUTLINE),
  ] },
  { id: 'firefly', name: 'Vaga-lume', cost: 380, p: 0x2a2016, q: 0xffd23e, parts: [
    C(70, 24, 7, 'p'), C(72, 28, 4, 'q', 0.9), C(66, 22, 1.6, W), L(64, 18, 60, 12, 2, 'p'), L(76, 18, 80, 12, 2, 'p'),
  ] },
  { id: 'turtle', name: 'Tartaruguinha', cost: 300, p: 0x3fae70, q: 0x8fca5e, parts: [
    E(70, 90, 11, 4, 0x000000, 0.2), E(70, 82, 11, 8, 'q'), C(70, 82, 8, 'p', 0.4), C(58, 84, 4, 'p'), C(82, 84, 4, 'p'), C(64, 76, 1.4, OUTLINE), C(76, 76, 1.4, OUTLINE),
  ] },
  { id: 'unicornpet', name: 'Unicórnio', cost: 620, p: W, q: 0xff8fc4, k: 0xffd23e, parts: [
    E(70, 88, 10, 4, 0x000000, 0.2), C(70, 80, 9, 'p'), T(70, 72, 68, 62, 72, 72, 'k'), T(63, 74, 58, 68, 65, 70, 'q'), C(66, 79, 2, OUTLINE), C(74, 79, 2, OUTLINE),
  ] },
  { id: 'spiderpet', name: 'Aranha', cost: 320, p: 0x2a2016, parts: [
    C(70, 84, 7, 'p'), C(66, 82, 1.4, W), C(74, 82, 1.4, W), L(64, 80, 56, 76, 2, 'p'), L(64, 88, 56, 92, 2, 'p'), L(76, 80, 84, 76, 2, 'p'), L(76, 88, 84, 92, 2, 'p'),
  ] },
  { id: 'jellyfish', name: 'Água-viva', cost: 340, p: 0xd7a9ff, q: 0xff8fc4, parts: [
    E(70, 78, 12, 9, 'p', 0.75), L(62, 84, 60, 96, 2, 'q', 0.7), L(70, 86, 70, 98, 2, 'q', 0.7), L(78, 84, 80, 96, 2, 'q', 0.7),
  ] },
];

// ---------------------------------------------------------------- registro
// A ordem define como a tela mostra as abas.
export const SLOTS = [
  { id: 'color',   name: 'Cores',    list: COLORS },
  { id: 'hat',     name: 'Chapéus',  list: HATS },
  { id: 'hair',    name: 'Cabelos',  list: HAIRS },
  { id: 'glasses', name: 'Óculos',   list: GLASSES },
  { id: 'face',    name: 'Rostos',   list: FACES },
  { id: 'outfit',  name: 'Roupas',   list: OUTFITS },
  { id: 'wings',   name: 'Asas',     list: WINGS },
  { id: 'pet',     name: 'Pets',     list: PETS },
];

export const SLOT_IDS = SLOTS.map(s => s.id);
// Slots que têm formato + cor de paleta (todos menos "color", que já É a paleta).
export const TINT_SLOTS = ['hat', 'hair', 'glasses', 'face', 'outfit', 'wings', 'pet'];

export const listOf = (slot) => (SLOTS.find(s => s.id === slot) || SLOTS[0]).list;
export const itemOf = (slot, id) => listOf(slot).find(i => i.id === id) || listOf(slot)[0];

export function ownsCosmetic(item, owned) {
  return !item || item.cost === 0 || (owned || []).includes(item.id);
}

// Normaliza o que veio do save: desenho nunca é algo que o jogador não tem;
// cor nunca é um id fora da paleta atual.
export function resolveCosmetics(progress) {
  const owned = progress?.owned || [];
  const out = {};
  for (const slot of SLOT_IDS) {
    const item = itemOf(slot, progress?.[slot]);
    out[slot] = ownsCosmetic(item, owned) ? item.id : 'none';
  }
  for (const slot of TINT_SLOTS) {
    const t = progress?.[slot + 'Tint'];
    out[slot + 'Tint'] = PALETTE_IDS.has(t) ? t : null;
  }
  return out;
}

// Chave curta e estável para compor ids de textura — inclui a cor, porque
// trocar de cor tem que gerar uma textura nova.
export const cosKey = (cos) => {
  const shapes = SLOT_IDS.map(s => cos?.[s] || 'n').join('.');
  const tints = TINT_SLOTS.map(s => cos?.[s + 'Tint'] || 'n').join('.');
  return `${shapes}_${tints}`;
};

// Peças que vão ATRÁS do corpo, e as que vão na frente (nesta ordem).
export const BACK_SLOTS = ['wings', 'pet'];
export const FRONT_SLOTS = ['outfit', 'glasses', 'hair', 'hat'];

const partsFor = (slot, cos) => resolveParts(itemOf(slot, cos?.[slot]), cos?.[slot + 'Tint']);

export function backParts(cos) {
  return BACK_SLOTS.flatMap(s => partsFor(s, cos) || []);
}
export function frontParts(cos) {
  return FRONT_SLOTS.flatMap(s => partsFor(s, cos) || []);
}
// null = usar o rosto padrão da skin
export function faceParts(cos) {
  return partsFor('face', cos);
}
// Cor que substitui o corpo, ou null para manter a da skin/slot.
export function bodyColor(cos) {
  const c = itemOf('color', cos?.color);
  return c.body ?? null;
}
