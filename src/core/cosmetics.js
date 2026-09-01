// Catálogo de cosméticos do personagem.
//
// Cada peça é descrita UMA vez como uma lista de formas (core/shapes.js) e
// renderizada nos dois lugares: SVG nas telas e canvas dentro das partidas.
// Adicionar um cosmético novo é acrescentar uma linha aqui — nada de código.
//
// Coordenadas do boneco: quadro 76 × 104, corpo x 11..65 / y 24..96,
// olhos na altura y ≈ 42, topo da cabeça em y ≈ 24.
import { R, C, E, T, L, A, OUTLINE } from './shapes.js';

// ---------------------------------------------------------------- CORES
// Trocam a cor do corpo (a skin continua definindo o formato/adereço).
export const COLORS = [
  { id: 'none',   name: 'Original', cost: 0 },
  { id: 'ruby',   name: 'Rubi',     cost: 120, body: 0xe8483f },
  { id: 'ocean',  name: 'Oceano',   cost: 120, body: 0x2b7fd4 },
  { id: 'lime',   name: 'Limão',    cost: 150, body: 0x8fca5e },
  { id: 'grape',  name: 'Uva',      cost: 150, body: 0x9b59d0 },
  { id: 'candy',  name: 'Algodão',  cost: 180, body: 0xff8fc4 },
  { id: 'sun',    name: 'Sol',      cost: 180, body: 0xffc23e },
  { id: 'mint',   name: 'Menta',    cost: 220, body: 0x3ddac0 },
  { id: 'coal',   name: 'Carvão',   cost: 260, body: 0x4a5378 },
  { id: 'cream',  name: 'Creme',    cost: 260, body: 0xf0e0c0 },
  { id: 'gold',   name: 'Ouro',     cost: 900, body: 0xffd23e },
];

// ---------------------------------------------------------------- CHAPÉUS
export const HATS = [
  { id: 'none', name: 'Nenhum', cost: 0, parts: [] },
  { id: 'cap', name: 'Boné', cost: 120, parts: [
    R(11, 8, 54, 18, 9, OUTLINE), R(13, 10, 50, 14, 7, 0xe8483f),
    R(13, 20, 62, 7, 3.5, 0x9c2820),
  ] },
  { id: 'party', name: 'Festa', cost: 160, parts: [
    T(38, -4, 20, 26, 56, 26, OUTLINE), T(38, 1, 24, 24, 52, 24, 0xffd23e),
    T(38, 1, 30, 16, 44, 16, 0xe8483f), C(38, -2, 5, 0x3ddad7),
  ] },
  { id: 'top', name: 'Cartola', cost: 260, parts: [
    R(8, 20, 60, 8, 4, OUTLINE), R(20, -6, 36, 28, 4, OUTLINE),
    R(22, -4, 32, 24, 3, 0x2a2358), R(22, 12, 32, 6, 0, 0xffd23e),
  ] },
  { id: 'horns', name: 'Chifres', cost: 300, parts: [
    T(16, 24, 26, 24, 12, 0, OUTLINE), T(60, 24, 50, 24, 64, 0, OUTLINE),
    T(18, 22, 25, 22, 14, 4, 0xe8483f), T(58, 22, 51, 22, 62, 4, 0xe8483f),
  ] },
  { id: 'halo', name: 'Auréola', cost: 340, parts: [
    E(38, 6, 21, 7, 0xffd23e), E(38, 6, 15, 3.5, 0x151233),
  ] },
  { id: 'beanie', name: 'Gorro', cost: 200, parts: [
    R(12, 6, 52, 22, 11, OUTLINE), R(14, 8, 48, 18, 9, 0x3ddad7),
    R(11, 20, 54, 9, 4.5, 0xffffff), C(38, 2, 7, 0xffffff),
  ] },
  { id: 'cowboy', name: 'Caubói', cost: 380, parts: [
    E(38, 24, 34, 8, OUTLINE), E(38, 23, 31, 6, 0xb5773a),
    R(22, 2, 32, 22, 8, OUTLINE), R(24, 4, 28, 18, 7, 0xc9954d),
    R(22, 15, 32, 5, 2, 0x6b4a2e),
  ] },
  { id: 'wizard', name: 'Bruxo', cost: 480, parts: [
    E(38, 25, 30, 7, OUTLINE), E(38, 24, 27, 5, 0x4a3f8c),
    T(38, -14, 18, 25, 58, 25, OUTLINE), T(38, -9, 22, 23, 54, 23, 0x6b4aa8),
    C(30, 12, 3, 0xffd23e), C(45, 6, 2.4, 0xffd23e), C(38, 18, 2, 0xffd23e),
  ] },
  { id: 'pirate', name: 'Pirata', cost: 440, parts: [
    R(10, 12, 56, 14, 7, OUTLINE), R(12, 14, 52, 10, 5, 0x2a2358),
    E(38, 12, 26, 9, 0x1c2440), C(38, 9, 4, 0xffffff),
    C(33, 14, 2, 0xffffff), C(43, 14, 2, 0xffffff),
  ] },
  { id: 'chef', name: 'Chef', cost: 320, parts: [
    R(16, 14, 44, 14, 4, OUTLINE), R(18, 16, 40, 10, 3, 0xffffff),
    C(24, 6, 10, 0xffffff), C(38, 2, 11, 0xffffff), C(52, 6, 10, 0xffffff),
  ] },
  { id: 'flower', name: 'Florzinha', cost: 240, parts: [
    L(46, 22, 50, 8, 3, 0x3fae70),
    C(50, 4, 5, 0xff8fc4), C(56, 8, 5, 0xff8fc4), C(52, 14, 5, 0xff8fc4),
    C(44, 12, 5, 0xff8fc4), C(44, 5, 5, 0xff8fc4), C(50, 9, 3.4, 0xffd23e),
  ] },
  { id: 'crown', name: 'Coroa', cost: 800, parts: [
    T(14, 26, 26, 26, 20, 2, OUTLINE), T(30, 26, 46, 26, 38, -4, OUTLINE),
    T(50, 26, 62, 26, 56, 2, OUTLINE), R(14, 20, 48, 8, 0, OUTLINE),
    T(17, 24, 25, 24, 21, 7, 0xffd23e), T(33, 24, 45, 24, 39, 2, 0xffd23e),
    T(51, 24, 59, 24, 55, 7, 0xffd23e), R(16, 21, 44, 5, 0, 0xffd23e),
    C(39, 10, 2.6, 0xe8483f),
  ] },
];

// ---------------------------------------------------------------- CABELOS
export const HAIRS = [
  { id: 'none', name: 'Nenhum', cost: 0, parts: [] },
  { id: 'afro', name: 'Black power', cost: 200, parts: [
    C(22, 18, 12, 0x2a2016), C(38, 12, 14, 0x2a2016), C(54, 18, 12, 0x2a2016),
    C(26, 14, 5, 0x463628, 0.6),
  ] },
  { id: 'spiky', name: 'Espetado', cost: 180, parts: [
    T(16, 26, 26, 26, 18, 4, 0xf0a830), T(28, 24, 40, 24, 32, 0, 0xf0a830),
    T(40, 24, 52, 24, 46, 2, 0xf0a830), T(52, 26, 62, 26, 58, 6, 0xf0a830),
  ] },
  { id: 'long', name: 'Longo', cost: 240, parts: [
    R(8, 20, 12, 46, 6, 0x8a4b28), R(56, 20, 12, 46, 6, 0x8a4b28),
    R(12, 12, 52, 20, 10, 0x8a4b28), R(20, 10, 36, 10, 5, 0xa35c33),
  ] },
  { id: 'pony', name: 'Rabo de cavalo', cost: 260, parts: [
    R(12, 12, 52, 18, 9, 0x2a2016),
    R(60, 20, 12, 34, 6, 0x2a2016), C(66, 54, 6, 0x2a2016),
    R(58, 18, 16, 7, 3.5, 0xff8fc4),
  ] },
  { id: 'mohawk', name: 'Moicano', cost: 320, parts: [
    R(33, -2, 10, 30, 5, OUTLINE), R(34.5, 0, 7, 28, 3.5, 0x3ddad7),
    T(38, -8, 32, 4, 44, 4, 0x3ddad7),
  ] },
  { id: 'bun', name: 'Coque', cost: 220, parts: [
    C(38, 6, 9, 0x2a2016), R(12, 14, 52, 16, 8, 0x2a2016),
    R(30, 0, 16, 6, 3, 0xe8483f),
  ] },
  { id: 'curly', name: 'Cachos', cost: 280, parts: [
    C(18, 22, 8, 0x6b3a1c), C(30, 14, 9, 0x6b3a1c), C(46, 14, 9, 0x6b3a1c),
    C(58, 22, 8, 0x6b3a1c), C(38, 10, 8, 0x6b3a1c),
    C(32, 12, 3.4, 0x8a4b28, 0.7),
  ] },
  { id: 'rainbow', name: 'Arco-íris', cost: 600, parts: [
    R(12, 12, 52, 18, 9, 0xe8483f), R(12, 16, 52, 14, 7, 0xffc23e),
    R(12, 20, 52, 10, 5, 0x3ddad7), R(12, 24, 52, 6, 3, 0x9b59d0),
    T(16, 28, 24, 28, 18, 8, 0xe8483f), T(52, 28, 60, 28, 56, 8, 0x9b59d0),
  ] },
];

// ---------------------------------------------------------------- ÓCULOS
export const GLASSES = [
  { id: 'none', name: 'Nenhum', cost: 0, parts: [] },
  { id: 'round', name: 'Redondo', cost: 140, parts: [
    C(28, 42, 10, OUTLINE), C(48, 42, 10, OUTLINE),
    C(28, 42, 8, 0xbfe4ff, 0.85), C(48, 42, 8, 0xbfe4ff, 0.85),
    R(36, 40, 4, 3, 1.5, OUTLINE),
  ] },
  { id: 'square', name: 'Quadrado', cost: 140, parts: [
    R(15, 34, 22, 16, 4, OUTLINE), R(39, 34, 22, 16, 4, OUTLINE),
    R(17, 36, 18, 12, 3, 0xbfe4ff, 0.85), R(41, 36, 18, 12, 3, 0xbfe4ff, 0.85),
    R(35, 40, 6, 3, 1.5, OUTLINE),
  ] },
  { id: 'shades', name: 'Escuros', cost: 220, parts: [
    R(14, 33, 48, 17, 6, OUTLINE), R(17, 36, 18, 11, 4, 0x2a2358),
    R(41, 36, 18, 11, 4, 0x2a2358), R(19, 38, 6, 3, 1.5, 0xffffff, 0.4),
  ] },
  { id: 'starglasses', name: 'Estrela', cost: 380, parts: [
    T(28, 33, 20, 48, 36, 48, 0xffd23e), T(28, 50, 20, 36, 36, 36, 0xffd23e),
    T(48, 33, 40, 48, 56, 48, 0xff8fc4), T(48, 50, 40, 36, 56, 36, 0xff8fc4),
    R(35, 40, 6, 3, 1.5, OUTLINE),
  ] },
  { id: 'monocle', name: 'Monóculo', cost: 300, parts: [
    C(48, 42, 11, 0xffd23e), C(48, 42, 8.5, 0xbfe4ff, 0.8),
    L(48, 53, 44, 66, 2, 0xffd23e),
    C(28, 42, 8, 0xffffff), C(30, 43, 4, OUTLINE),
  ] },
  { id: 'ski', name: 'Esqui', cost: 340, parts: [
    R(12, 32, 52, 19, 9, OUTLINE), R(15, 35, 46, 13, 6, 0xff8b3d),
    R(18, 37, 14, 5, 2.5, 0xffffff, 0.45),
    R(10, 36, 56, 5, 2.5, 0x3ddad7),
  ] },
  { id: '3d', name: 'Cinema 3D', cost: 260, parts: [
    R(14, 34, 48, 15, 5, 0xffffff), R(17, 36, 18, 11, 3, 0xe8483f, 0.75),
    R(41, 36, 18, 11, 3, 0x3ddad7, 0.75),
  ] },
  { id: 'visorled', name: 'Visor LED', cost: 520, parts: [
    R(12, 33, 52, 17, 7, OUTLINE), R(15, 36, 46, 11, 5, 0x151233),
    C(24, 41, 2.4, 0x3ddad7), C(32, 41, 2.4, 0x3ddad7),
    C(44, 41, 2.4, 0xff8fc4), C(52, 41, 2.4, 0xff8fc4),
  ] },
];

// ---------------------------------------------------------------- ROSTOS
// Substituem os olhos padrão do personagem.
export const FACES = [
  { id: 'none', name: 'Normal', cost: 0, parts: null },
  { id: 'happy', name: 'Feliz', cost: 100, parts: [
    A(28, 44, 8, 4, OUTLINE), A(48, 44, 8, 4, OUTLINE),
  ] },
  { id: 'wink', name: 'Piscada', cost: 160, parts: [
    C(28, 42, 8, 0xffffff), C(30, 43, 4, OUTLINE), A(48, 44, 8, 4, OUTLINE),
  ] },
  { id: 'angry', name: 'Bravo', cost: 220, parts: [
    C(28, 42, 8, 0xffffff), C(48, 42, 8, 0xffffff),
    C(30, 43, 4, OUTLINE), C(50, 43, 4, OUTLINE),
    T(18, 29, 36, 36, 18, 36, OUTLINE), T(58, 29, 40, 36, 58, 36, OUTLINE),
  ] },
  { id: 'star', name: 'Estrelado', cost: 400, parts: [
    C(28, 42, 8, 0xffffff), C(48, 42, 8, 0xffffff),
    T(28, 35, 22, 47, 34, 47, 0xffd23e), T(28, 49, 22, 37, 34, 37, 0xffd23e),
    T(48, 35, 42, 47, 54, 47, 0xffd23e), T(48, 49, 42, 37, 54, 37, 0xffd23e),
  ] },
  { id: 'blush', name: 'Corado', cost: 180, parts: [
    A(28, 44, 8, 4, OUTLINE), A(48, 44, 8, 4, OUTLINE),
    E(19, 52, 6, 4, 0xff8fc4, 0.75), E(57, 52, 6, 4, 0xff8fc4, 0.75),
  ] },
  { id: 'sleepy', name: 'Sonolento', cost: 200, parts: [
    L(20, 42, 36, 42, 4, OUTLINE), L(40, 42, 56, 42, 4, OUTLINE),
    C(24, 48, 2, 0xbfe4ff), C(52, 48, 2, 0xbfe4ff),
  ] },
  { id: 'dizzy', name: 'Tonto', cost: 260, parts: [
    C(28, 42, 8, 0xffffff), C(48, 42, 8, 0xffffff),
    L(23, 37, 33, 47, 3, OUTLINE), L(33, 37, 23, 47, 3, OUTLINE),
    L(43, 37, 53, 47, 3, OUTLINE), L(53, 37, 43, 47, 3, OUTLINE),
  ] },
  { id: 'robot', name: 'Robô', cost: 460, parts: [
    R(16, 34, 44, 16, 4, OUTLINE), R(18, 36, 40, 12, 3, 0x151233),
    R(23, 39, 8, 6, 1, 0x3ddad7), R(45, 39, 8, 6, 1, 0x3ddad7),
    R(33, 41, 10, 2, 1, 0x3ddad7, 0.6),
  ] },
];

// ---------------------------------------------------------------- ASAS
// Ficam ATRÁS do corpo.
export const WINGS = [
  { id: 'none', name: 'Nenhuma', cost: 0, parts: [] },
  { id: 'angel', name: 'Anjo', cost: 420, parts: [
    E(8, 52, 12, 20, 0xffffff), E(68, 52, 12, 20, 0xffffff),
    E(9, 50, 8, 14, 0xe8f0ff), E(67, 50, 8, 14, 0xe8f0ff),
  ] },
  { id: 'bat', name: 'Morcego', cost: 400, parts: [
    T(14, 34, -4, 46, 14, 62, 0x4a3f8c), T(62, 34, 80, 46, 62, 62, 0x4a3f8c),
    T(12, 40, 2, 48, 12, 56, 0x6b4aa8), T(64, 40, 74, 48, 64, 56, 0x6b4aa8),
  ] },
  { id: 'fairy', name: 'Fada', cost: 480, parts: [
    E(10, 44, 11, 15, 0xbfe4ff, 0.75), E(66, 44, 11, 15, 0xbfe4ff, 0.75),
    E(12, 62, 8, 11, 0xff8fc4, 0.7), E(64, 62, 8, 11, 0xff8fc4, 0.7),
  ] },
  { id: 'beewings', name: 'Abelha', cost: 380, parts: [
    E(11, 40, 10, 14, 0xffffff, 0.7), E(65, 40, 10, 14, 0xffffff, 0.7),
    L(4, 34, 18, 46, 2, 0xffd23e), L(72, 34, 58, 46, 2, 0xffd23e),
  ] },
  { id: 'dragonwings', name: 'Dragão', cost: 700, parts: [
    T(14, 30, -6, 44, 14, 66, 0x2fb573), T(62, 30, 82, 44, 62, 66, 0x2fb573),
    T(13, 36, 2, 46, 13, 58, 0x8fe66a), T(63, 36, 74, 46, 63, 58, 0x8fe66a),
    C(-4, 44, 3, 0xffd23e), C(80, 44, 3, 0xffd23e),
  ] },
  { id: 'jet', name: 'Foguete', cost: 640, parts: [
    R(0, 44, 16, 12, 6, 0x8d93a8), R(60, 44, 16, 12, 6, 0x8d93a8),
    T(6, 58, 0, 76, 12, 76, 0xff8b3d), T(70, 58, 64, 76, 76, 76, 0xff8b3d),
    T(7, 62, 3, 72, 11, 72, 0xffd23e), T(69, 62, 65, 72, 73, 72, 0xffd23e),
  ] },
  { id: 'leaf', name: 'Folhas', cost: 360, parts: [
    E(10, 48, 10, 17, 0x3fae70), E(66, 48, 10, 17, 0x3fae70),
    L(10, 34, 10, 62, 2, 0x2a7a4a), L(66, 34, 66, 62, 2, 0x2a7a4a),
  ] },
];

// ---------------------------------------------------------------- ROUPAS
// Desenhadas sobre a barriga, abaixo do rosto.
export const OUTFITS = [
  { id: 'none', name: 'Nenhuma', cost: 0, parts: [] },
  { id: 'tie', name: 'Gravata', cost: 140, parts: [
    T(38, 58, 32, 66, 44, 66, 0xe8483f), T(38, 88, 31, 68, 45, 68, 0xe8483f),
    R(33, 55, 10, 5, 2, 0x9c2820),
  ] },
  { id: 'bowtie', name: 'Borboleta', cost: 160, parts: [
    T(38, 60, 24, 54, 24, 66, 0x9b59d0), T(38, 60, 52, 54, 52, 66, 0x9b59d0),
    C(38, 60, 4, 0x6b3fa0),
  ] },
  { id: 'scarf', name: 'Cachecol', cost: 200, parts: [
    R(14, 56, 48, 11, 5, 0xe8483f), R(44, 62, 11, 26, 5, 0xe8483f),
    R(14, 59, 48, 3, 1.5, 0xffffff, 0.35),
  ] },
  { id: 'cape', name: 'Capa', cost: 340, parts: [
    R(12, 52, 52, 44, 12, 0x9b59d0), R(16, 54, 44, 40, 10, 0xb478e8),
    R(14, 50, 48, 8, 4, 0xffd23e),
  ] },
  { id: 'armor', name: 'Armadura', cost: 520, parts: [
    R(16, 54, 44, 40, 10, 0x8d93a8), R(19, 57, 38, 34, 8, 0xa8aec2),
    R(30, 57, 16, 34, 4, 0x6f7590), C(38, 66, 5, 0xffd23e),
    R(12, 52, 14, 12, 5, 0x8d93a8), R(50, 52, 14, 12, 5, 0x8d93a8),
  ] },
  { id: 'hoodie', name: 'Moletom', cost: 300, parts: [
    R(14, 52, 48, 44, 12, 0x4a5378), R(17, 55, 42, 40, 10, 0x5f6b8a),
    R(24, 74, 28, 12, 6, 0x3a4160), L(30, 56, 34, 68, 3, 0xffffff),
    L(46, 56, 42, 68, 3, 0xffffff),
  ] },
  { id: 'vest', name: 'Colete', cost: 280, parts: [
    R(14, 54, 20, 42, 8, 0x2fb573), R(42, 54, 20, 42, 8, 0x2fb573),
    C(28, 70, 2.6, 0xffd23e), C(28, 82, 2.6, 0xffd23e),
  ] },
  { id: 'apron', name: 'Avental', cost: 240, parts: [
    R(22, 56, 32, 40, 6, 0xffffff), R(25, 70, 26, 14, 3, 0xe0e0e0),
    L(28, 56, 34, 48, 3, 0xffffff), L(48, 56, 42, 48, 3, 0xffffff),
  ] },
  { id: 'medal', name: 'Medalha', cost: 460, parts: [
    L(26, 52, 38, 70, 4, 0x3ddad7), L(50, 52, 38, 70, 4, 0x3ddad7),
    C(38, 76, 9, 0xd9a410), C(38, 76, 6.5, 0xffd23e),
    T(38, 71, 34, 80, 42, 80, 0xd9a410),
  ] },
];

// ---------------------------------------------------------------- PETS
// Companheiro flutuando ao lado; fica ATRÁS do corpo.
export const PETS = [
  { id: 'none', name: 'Nenhum', cost: 0, parts: [] },
  { id: 'bird', name: 'Passarinho', cost: 300, parts: [
    E(70, 30, 9, 4, 0x000000, 0.15),
    C(70, 22, 8, 0x3ddad7), T(78, 20, 88, 23, 78, 27, 0x2a9d9a),
    T(62, 20, 54, 23, 62, 26, 0xffd23e), C(73, 19, 2.4, 0xffffff),
    C(73.6, 19, 1.2, OUTLINE),
  ] },
  { id: 'slime', name: 'Geleca', cost: 260, parts: [
    E(70, 84, 11, 4, 0x000000, 0.2),
    E(70, 76, 11, 9, 0x8fe66a, 0.9), C(66, 74, 2, OUTLINE), C(74, 74, 2, OUTLINE),
    C(67, 71, 3, 0xffffff, 0.5),
  ] },
  { id: 'ghost', name: 'Fantasminha', cost: 380, parts: [
    C(70, 26, 9, 0xffffff, 0.8), R(61, 26, 18, 12, 3, 0xffffff, 0.8),
    C(66, 25, 2, OUTLINE), C(74, 25, 2, OUTLINE),
  ] },
  { id: 'cat', name: 'Gatinho', cost: 420, parts: [
    E(70, 88, 10, 4, 0x000000, 0.2),
    C(70, 80, 9, 0xffc23e), T(63, 74, 63, 64, 70, 72, 0xffc23e),
    T(77, 74, 77, 64, 70, 72, 0xffc23e), C(66, 79, 2, OUTLINE), C(74, 79, 2, OUTLINE),
    L(79, 84, 88, 76, 3, 0xffc23e),
  ] },
  { id: 'beepet', name: 'Abelhinha', cost: 340, parts: [
    C(70, 24, 8, 0xffd23e), R(64, 20, 12, 4, 1, OUTLINE), R(64, 26, 12, 4, 1, OUTLINE),
    E(66, 15, 6, 4, 0xffffff, 0.65), E(76, 15, 6, 4, 0xffffff, 0.65),
  ] },
  { id: 'rock', name: 'Pedrinha', cost: 220, parts: [
    E(70, 90, 11, 4, 0x000000, 0.2),
    C(70, 82, 10, 0x8d93a8), C(66, 78, 4, 0xa8aec2),
    C(66, 82, 2, OUTLINE), C(74, 82, 2, OUTLINE),
  ] },
  { id: 'starpet', name: 'Estrelinha', cost: 560, parts: [
    T(70, 12, 60, 32, 80, 32, 0xffd23e), T(70, 36, 60, 16, 80, 16, 0xffd23e),
    C(67, 23, 1.8, OUTLINE), C(73, 23, 1.8, OUTLINE),
  ] },
  { id: 'dragonpet', name: 'Dragãozinho', cost: 800, parts: [
    E(70, 88, 11, 4, 0x000000, 0.2),
    C(70, 80, 10, 0x2fb573), T(64, 72, 66, 62, 71, 71, 0x8fe66a),
    T(76, 72, 78, 63, 71, 71, 0x8fe66a),
    C(66, 79, 2.2, OUTLINE), C(74, 79, 2.2, OUTLINE),
    T(80, 76, 90, 72, 82, 82, 0x2fb573),
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
export const listOf = (slot) => (SLOTS.find(s => s.id === slot) || SLOTS[0]).list;
export const itemOf = (slot, id) => listOf(slot).find(i => i.id === id) || listOf(slot)[0];

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
