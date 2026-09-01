// Catálogo de cosméticos do personagem.
//
// Cada peça é descrita UMA vez como uma lista de formas (core/shapes.js) e
// renderizada nos dois lugares: SVG nas telas e canvas dentro das partidas.
//
// Volume sem repetição manual: cada DESENHO usa cores simbólicas ('p'
// principal, 'q' secundária, 'k' detalhe) e é expandido em várias
// COMBINAÇÕES DE COR. A primeira combinação mantém o id do desenho, então
// quem já comprou "cap" continua dono de "cap".
//
// Coordenadas do boneco: quadro 76 × 104, corpo x 11..65 / y 24..96,
// olhos na altura y ≈ 42, topo da cabeça em y ≈ 24.
import { R, C, E, T, L, A, OUTLINE } from './shapes.js';

const W = 0xffffff;

// ---------------------------------------------------------------- combinações de cor
// Cada desenho ganha a original + estas. `mult` encarece as variações.
const COLORWAYS = [
  { id: 'ruby',  name: 'Rubi',    p: 0xe8483f, q: 0x9c2820, k: 0xffd23e, mult: 1.15 },
  { id: 'ocean', name: 'Oceano',  p: 0x2b7fd4, q: 0x1b4f8f, k: 0x9fe8ff, mult: 1.15 },
  { id: 'lime',  name: 'Limão',   p: 0x8fca5e, q: 0x3fae70, k: 0xffd23e, mult: 1.2 },
  { id: 'grape', name: 'Uva',     p: 0x9b59d0, q: 0x6b3fa0, k: 0xff8fc4, mult: 1.2 },
  { id: 'sun',   name: 'Sol',     p: 0xffc23e, q: 0xd9a410, k: W,        mult: 1.25 },
  { id: 'night', name: 'Noite',   p: 0x2a2358, q: 0x151233, k: 0x3ddad7, mult: 1.35 },
  { id: 'snow',  name: 'Neve',    p: 0xf0f4ff, q: 0xbfd4e8, k: 0xff8fc4, mult: 1.35 },
];

// Expande [desenho] → [original, ...variações]. `cw: false` = só a original.
// `cw: null` marca a versão original de cada desenho (usada pelo filtro de
// cor da vitrine — ver showSkins em ui/screens.js); `cwName` é o rótulo do
// filtro ("Rubi", "Original"...).
function expand(designs, cwList = COLORWAYS) {
  const out = [];
  for (const d of designs) {
    const sub = (cw) => (d.parts || []).map(sh => ({ ...sh, c: typeof sh.c === 'string' && cw[sh.c] !== undefined ? cw[sh.c] : sh.c }));
    const own = { p: d.p ?? 0x888888, q: d.q ?? 0x555555, k: d.k ?? W };
    out.push({ id: d.id, name: d.name, cost: d.cost, parts: d.parts ? sub(own) : null, body: d.body, cw: null, cwName: 'Original' });
    if (d.cw === false || !d.parts) continue;
    for (const cw of cwList) {
      out.push({ id: `${d.id}_${cw.id}`, name: `${d.name} ${cw.name}`, cost: Math.round(d.cost * cw.mult), parts: sub(cw), design: d.id, cw: cw.id, cwName: cw.name });
    }
  }
  return out;
}

// ---------------------------------------------------------------- CORES (corpo)
// Trocam a cor do corpo; a skin continua definindo o formato/adereço.
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
export const HATS = expand([
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
  { id: 'halo', name: 'Auréola', cost: 340, cw: false, parts: [
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
]);

// ---------------------------------------------------------------- CABELOS
export const HAIRS = expand([
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
  { id: 'rainbow', name: 'Arco-íris', cost: 600, cw: false, parts: [
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
  { id: 'buzz', name: 'Raspado', cost: 140, p: 0x2a2016, parts: [
    R(13, 16, 50, 14, 7, 'p', 0.85),
  ] },
  { id: 'twintails', name: 'Maria-chiquinha', cost: 320, p: 0xf0a830, k: 0xe8483f, parts: [
    R(12, 12, 52, 18, 9, 'p'), R(0, 22, 12, 30, 6, 'p'), R(64, 22, 12, 30, 6, 'p'), C(6, 24, 4, 'k'), C(70, 24, 4, 'k'),
  ] },
  { id: 'wave', name: 'Ondulado', cost: 260, p: 0x8a4b28, parts: [
    C(16, 26, 8, 'p'), C(26, 14, 9, 'p'), C(38, 10, 9, 'p'), C(50, 14, 9, 'p'), C(60, 26, 8, 'p'), C(10, 40, 7, 'p'), C(66, 40, 7, 'p'),
  ] },
]);

// ---------------------------------------------------------------- ÓCULOS
export const GLASSES = expand([
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
  { id: '3d', name: 'Cinema 3D', cost: 260, cw: false, parts: [
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
]);

// ---------------------------------------------------------------- ROSTOS
// Substituem os olhos padrão. As variações de cor trocam a cor dos olhos.
const EYE_CW = [
  { id: 'ocean', name: 'olhos azuis', p: 0x2b7fd4, mult: 1.2 },
  { id: 'lime', name: 'olhos verdes', p: 0x3fae70, mult: 1.2 },
  { id: 'grape', name: 'olhos roxos', p: 0x9b59d0, mult: 1.25 },
  { id: 'ruby', name: 'olhos rubi', p: 0xe8483f, mult: 1.3 },
  { id: 'sun', name: 'olhos dourados', p: 0xd9a410, mult: 1.35 },
];
export const FACES = expand([
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
], EYE_CW);

// ---------------------------------------------------------------- ASAS
// Ficam ATRÁS do corpo.
export const WINGS = expand([
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
]);

// ---------------------------------------------------------------- ROUPAS
// Desenhadas sobre a barriga, abaixo do rosto.
export const OUTFITS = expand([
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
]);

// ---------------------------------------------------------------- PETS
// Companheiro flutuando ao lado; fica ATRÁS do corpo.
export const PETS = expand([
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
]);

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
export const listOf = (slot) => (SLOTS.find(s => s.id === slot) || SLOTS[0]).list;
export const itemOf = (slot, id) => listOf(slot).find(i => i.id === id) || listOf(slot)[0];

// Cores presentes numa categoria (para o filtro da vitrine): "Original"
// primeiro, depois na ordem em que aparecem — mesma ordem para todas as
// categorias porque todas usam a mesma paleta (COLORWAYS), exceto Rostos.
export function colorwaysOf(slot) {
  const seen = new Map();
  for (const it of listOf(slot)) if (!seen.has(it.cw)) seen.set(it.cw, it.cwName);
  return [...seen.entries()].map(([cw, name]) => ({ cw, name }));
}

export function ownsCosmetic(item, owned) {
  return !item || item.cost === 0 || (owned || []).includes(item.id);
}

// Normaliza o que veio do save: nunca devolve algo que o jogador não tem.
export function resolveCosmetics(progress) {
  const owned = progress?.owned || [];
  const out = {};
  for (const slot of SLOT_IDS) {
    const item = itemOf(slot, progress?.[slot]);
    out[slot] = ownsCosmetic(item, owned) ? item.id : 'none';
  }
  return out;
}

// Chave curta e estável para compor ids de textura.
export const cosKey = (cos) => SLOT_IDS.map(s => (cos?.[s] || 'n')).join('.');

// Peças que vão ATRÁS do corpo, e as que vão na frente (nesta ordem).
export const BACK_SLOTS = ['wings', 'pet'];
export const FRONT_SLOTS = ['outfit', 'glasses', 'hair', 'hat'];

export function backParts(cos) {
  return BACK_SLOTS.flatMap(s => itemOf(s, cos?.[s]).parts || []);
}
export function frontParts(cos) {
  return FRONT_SLOTS.flatMap(s => itemOf(s, cos?.[s]).parts || []);
}
// null = usar o rosto padrão da skin
export function faceParts(cos) {
  return itemOf('face', cos?.face).parts;
}
// Cor que substitui o corpo, ou null para manter a da skin/slot.
export function bodyColor(cos) {
  const c = itemOf('color', cos?.color);
  return c.body ?? null;
}
