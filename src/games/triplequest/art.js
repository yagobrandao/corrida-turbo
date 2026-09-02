// Triple Quest — arte procedural das peças (nenhum asset externo).
//
// Cada peça é um ladrilho arredondado com "cara" clara, aro na cor do
// objeto, sombra embaixo e o objeto desenhado no centro com contorno
// escuro e um brilho — o mesmo traço cartoon do resto da plataforma.
// Tudo vira textura uma vez por cena (buildTileTextures) e depois é sprite.
import { TILE_TYPES } from './config.js';

const OUTLINE = 0x1c2440;
const W = 0xffffff;
export const TEX = 64;      // textura quadrada; a peça em si ocupa ~58px

function shade(hex, amt) {
  const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
  const mix = (c) => (amt >= 0 ? Math.round(c + (255 - c) * amt) : Math.round(c * (1 + amt)));
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

// helpers com contorno
const mk = (g) => ({
  circ(x, y, r, c) { g.fillStyle(OUTLINE, 1); g.fillCircle(x, y, r + 2); g.fillStyle(c, 1); g.fillCircle(x, y, r); },
  rr(x, y, w, h, rad, c) { g.fillStyle(OUTLINE, 1); g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, rad + 1.5); g.fillStyle(c, 1); g.fillRoundedRect(x, y, w, h, rad); },
  ell(x, y, w, h, c) { g.fillStyle(OUTLINE, 1); g.fillEllipse(x, y, w + 4, h + 4); g.fillStyle(c, 1); g.fillEllipse(x, y, w, h); },
  tri(a, b, c2, d, e, f, c) { g.fillStyle(c, 1); g.fillTriangle(a, b, c2, d, e, f); },
  fill(c, a = 1) { g.fillStyle(c, a); },
  shine(x, y, r) { g.fillStyle(W, 0.55); g.fillCircle(x, y, r); },
  line(x1, y1, x2, y2, w, c) { g.lineStyle(w, c, 1); g.lineBetween(x1, y1, x2, y2); },
});

// desenhos: centro em (32, 34), caixa útil ~40×40
const ICONS = {
  potion(g, h) {
    h.rr(27, 12, 10, 8, 2, 0xb5773a); h.circ(32, 38, 14, 0xd45de0);
    h.fill(0xff8fc4, 0.9); g.fillCircle(32, 40, 9); h.shine(27, 33, 3);
    h.rr(24, 18, 16, 6, 2, 0x8d93a8);
  },
  backpack(g, h) {
    h.rr(18, 18, 28, 32, 9, 0xe8483f); h.rr(22, 32, 20, 14, 5, 0xc9302a);
    h.rr(26, 10, 12, 10, 5, 0x9c2820); h.rr(28, 34, 8, 4, 2, 0xffd23e);
  },
  icecream(g, h) {
    h.tri(20, 32, 44, 32, 32, 56, OUTLINE); h.tri(22, 32, 42, 32, 32, 52, 0xe8b968);
    h.circ(32, 26, 12, 0xff8fc4); h.circ(26, 20, 8, 0xffe58a); h.circ(38, 20, 8, 0x8fe66a);
    h.shine(28, 23, 2.5);
  },
  camera(g, h) {
    h.rr(14, 22, 36, 26, 6, 0x4a5378); h.rr(24, 15, 14, 8, 3, 0x4a5378);
    h.circ(33, 35, 9, 0x2a2358); h.circ(33, 35, 5, 0x7fd0ff); h.shine(31, 33, 1.8);
    h.rr(42, 26, 5, 4, 1, 0xe8483f);
  },
  gift(g, h) {
    h.rr(16, 26, 32, 24, 4, 0xe8483f); h.rr(14, 20, 36, 10, 3, 0xc9302a);
    h.fill(0xffd23e); g.fillRect(29, 20, 6, 30); g.fillRect(14, 23, 36, 4);
    h.circ(26, 16, 4, 0xffd23e); h.circ(38, 16, 4, 0xffd23e);
  },
  crown(g, h) {
    g.fillStyle(OUTLINE, 1); g.fillPoints([{ x: 14, y: 46 }, { x: 14, y: 22 }, { x: 24, y: 32 }, { x: 32, y: 14 }, { x: 40, y: 32 }, { x: 50, y: 22 }, { x: 50, y: 46 }], true);
    g.fillStyle(0xffd23e, 1); g.fillPoints([{ x: 17, y: 43 }, { x: 17, y: 27 }, { x: 25, y: 36 }, { x: 32, y: 20 }, { x: 39, y: 36 }, { x: 47, y: 27 }, { x: 47, y: 43 }], true);
    h.circ(32, 38, 3, 0xe8483f); h.circ(22, 40, 2, 0x3ddad7); h.circ(42, 40, 2, 0x3ddad7);
  },
  glasses(g, h) {
    h.circ(23, 34, 9, 0x2b7fd4); h.circ(41, 34, 9, 0x2b7fd4);
    h.fill(0x9fe8ff, 0.85); g.fillCircle(23, 34, 6); g.fillCircle(41, 34, 6);
    h.line(30, 33, 34, 33, 3, OUTLINE); h.shine(21, 32, 2); h.shine(39, 32, 2);
  },
  ball(g, h) {
    h.circ(32, 34, 16, 0xff8b3d); h.line(16, 34, 48, 34, 2, OUTLINE);
    g.lineStyle(2, OUTLINE, 1); g.beginPath(); g.arc(32, 34, 16, -Math.PI / 2, Math.PI / 2); g.strokePath();
    h.line(32, 18, 32, 50, 2, OUTLINE); h.shine(26, 27, 3);
  },
  clock(g, h) {
    h.circ(32, 34, 16, 0x3ddad7); h.circ(32, 34, 12, W);
    h.line(32, 34, 32, 25, 2.5, OUTLINE); h.line(32, 34, 39, 37, 2.5, OUTLINE); h.circ(32, 34, 1.5, 0xe8483f);
    h.rr(27, 13, 10, 5, 2, 0x2a9d9a);
  },
  crystal(g, h) {
    h.tri(32, 12, 16, 34, 48, 34, OUTLINE); h.tri(16, 34, 48, 34, 32, 56, OUTLINE);
    h.tri(32, 15, 19, 34, 45, 34, 0x9fe8ff); h.tri(19, 34, 45, 34, 32, 53, 0x7fd0ff);
    h.tri(32, 15, 26, 34, 32, 34, W); g.fillStyle(W, 0.6); g.fillTriangle(32, 15, 26, 34, 32, 34);
  },
  lantern(g, h) {
    h.rr(22, 18, 20, 30, 5, 0x4a5378); h.rr(26, 22, 12, 20, 3, 0xffe58a);
    h.fill(0xffc23e); g.fillCircle(32, 32, 5); h.rr(28, 12, 8, 6, 2, 0x8d93a8);
    g.lineStyle(2.5, 0x8d93a8, 1); g.beginPath(); g.arc(32, 12, 6, Math.PI, 0); g.strokePath();
  },
  cupcake(g, h) {
    h.rr(20, 32, 24, 18, 4, 0xe8b968); h.fill(0xc9954d); g.fillRect(26, 34, 3, 14); g.fillRect(35, 34, 3, 14);
    h.circ(32, 28, 11, 0xff6fb5); h.circ(25, 30, 6, 0xff8fc4); h.circ(39, 30, 6, 0xff8fc4);
    h.circ(32, 18, 3, 0xe8483f); h.shine(28, 24, 2);
  },
  plant(g, h) {
    h.rr(22, 38, 20, 14, 4, 0xb5773a); h.rr(20, 36, 24, 5, 2, 0xc9954d);
    h.line(32, 38, 32, 22, 3, 0x2a7a4a); h.ell(24, 26, 12, 8, 0x3fae70); h.ell(40, 22, 12, 8, 0x3fae70); h.ell(32, 16, 8, 10, 0x8fca5e);
  },
  apple(g, h) {
    h.circ(26, 36, 12, 0xe8483f); h.circ(38, 36, 12, 0xe8483f); h.fill(0xe8483f); g.fillRect(26, 30, 12, 16);
    h.line(32, 26, 34, 16, 3, 0x6b4a2e); h.ell(40, 18, 10, 6, 0x3fae70); h.shine(24, 30, 3);
  },
  chest(g, h) {
    h.rr(16, 30, 32, 20, 4, 0xb5773a); h.rr(16, 20, 32, 12, 5, 0xc9954d);
    h.fill(0x8d6a4c); g.fillRect(16, 30, 32, 3); h.rr(28, 28, 8, 8, 2, 0xffd23e); h.circ(32, 33, 1.5, OUTLINE);
  },
  key(g, h) {
    h.circ(24, 26, 9, 0xffd23e); h.circ(24, 26, 3.5, OUTLINE); h.line(30, 32, 46, 48, 5, OUTLINE);
    h.line(30, 32, 46, 48, 3, 0xffd23e); h.line(40, 45, 45, 40, 3, 0xffd23e); h.line(44, 49, 49, 44, 3, 0xffd23e);
  },
  compass(g, h) {
    h.circ(32, 34, 16, 0x2b7fd4); h.circ(32, 34, 12, 0xf0f4ff);
    h.tri(32, 24, 28, 34, 36, 34, 0xe8483f); h.tri(32, 44, 28, 34, 36, 34, 0x8d93a8); h.circ(32, 34, 2, OUTLINE);
  },
  book(g, h) {
    h.rr(16, 16, 32, 36, 4, 0x9b59d0); h.fill(0x6b3fa0); g.fillRect(16, 16, 7, 36);
    h.fill(0xf0f4ff); g.fillRect(27, 22, 16, 3); g.fillRect(27, 28, 16, 3); g.fillRect(27, 34, 10, 3);
  },
  bottle(g, h) {
    h.rr(27, 12, 10, 8, 2, 0x3ddad7); h.rr(23, 20, 18, 32, 7, 0x3ddad7); h.fill(0x2a9d9a); g.fillRoundedRect(26, 30, 12, 18, 4);
    h.rr(27, 10, 10, 4, 1, 0x8d93a8); h.shine(28, 26, 2);
  },
  star(g, h) {
    g.fillStyle(OUTLINE, 1);
    const pts = (r1, r2) => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5; const r = i % 2 ? r2 : r1; return { x: 32 + Math.cos(a) * r, y: 34 + Math.sin(a) * r }; });
    g.fillPoints(pts(19, 8.5), true); g.fillStyle(0xffd23e, 1); g.fillPoints(pts(16, 7), true); h.shine(27, 28, 2.5);
  },
  heart(g, h) {
    h.circ(24, 28, 10, 0xff6b9d); h.circ(40, 28, 10, 0xff6b9d); h.tri(14, 32, 50, 32, 32, 52, OUTLINE); h.tri(16, 31, 48, 31, 32, 49, 0xff6b9d);
    h.fill(0xff6b9d); g.fillRect(18, 28, 28, 6); h.shine(22, 25, 2.5);
  },
  moon(g, h) {
    h.circ(32, 34, 16, 0xffe58a); g.fillStyle(0xf7f2ff, 1); g.fillCircle(40, 30, 13); h.circ(27, 36, 2.5, 0xd9a410); h.circ(33, 44, 1.8, 0xd9a410);
  },
  mushroom(g, h) {
    h.rr(26, 34, 12, 16, 4, 0xf0e0c0); h.ell(32, 30, 32, 22, 0xe8483f);
    h.fill(W); g.fillCircle(24, 28, 3.5); g.fillCircle(38, 24, 3); g.fillCircle(40, 34, 2.5);
  },
  fish(g, h) {
    h.ell(30, 34, 28, 18, 0xff8b3d); h.tri(42, 34, 52, 26, 52, 42, 0xff8b3d); g.fillStyle(OUTLINE, 1); g.fillTriangle(44, 34, 54, 24, 54, 44); g.fillStyle(0xff8b3d, 1); g.fillTriangle(43, 34, 52, 26, 52, 42);
    h.circ(24, 32, 3, W); h.circ(25, 32, 1.5, OUTLINE); h.fill(0xffd23e, 0.9); g.fillEllipse(33, 36, 8, 10);
  },
  cloud(g, h) {
    h.circ(24, 36, 9, W); h.circ(36, 30, 12, W); h.circ(46, 38, 8, W); h.rr(18, 36, 34, 12, 6, W);
    g.fillStyle(W, 1); g.fillCircle(24, 36, 9); g.fillCircle(36, 30, 12); g.fillCircle(46, 38, 8); g.fillRoundedRect(18, 36, 34, 12, 6);
  },
  leaf(g, h) {
    h.ell(32, 34, 24, 34, 0x8fca5e); h.line(32, 18, 32, 50, 2.5, 0x2a7a4a); h.line(32, 34, 22, 26, 2, 0x2a7a4a); h.line(32, 40, 42, 32, 2, 0x2a7a4a);
  },
  diamond(g, h) {
    g.fillStyle(OUTLINE, 1); g.fillPoints([{ x: 20, y: 22 }, { x: 44, y: 22 }, { x: 52, y: 32 }, { x: 32, y: 54 }, { x: 12, y: 32 }], true);
    g.fillStyle(0x7fd0ff, 1); g.fillPoints([{ x: 22, y: 25 }, { x: 42, y: 25 }, { x: 49, y: 32 }, { x: 32, y: 51 }, { x: 15, y: 32 }], true);
    g.fillStyle(W, 0.6); g.fillTriangle(22, 25, 32, 25, 27, 32);
  },
  bell(g, h) {
    h.circ(32, 16, 4, 0xd9a410); g.fillStyle(OUTLINE, 1); g.fillPoints([{ x: 20, y: 44 }, { x: 22, y: 26 }, { x: 32, y: 16 }, { x: 42, y: 26 }, { x: 44, y: 44 }], true);
    g.fillStyle(0xffc23e, 1); g.fillPoints([{ x: 23, y: 42 }, { x: 25, y: 27 }, { x: 32, y: 19 }, { x: 39, y: 27 }, { x: 41, y: 42 }], true);
    h.rr(18, 42, 28, 5, 2, 0xd9a410); h.circ(32, 50, 3, 0xd9a410);
  },
  coin(g, h) {
    h.circ(32, 34, 16, 0xffd23e); h.circ(32, 34, 11, 0xd9a410); g.fillStyle(0xffd23e, 1); g.fillCircle(32, 34, 9);
    h.fill(0xd9a410); g.fillRect(30, 28, 4, 12); h.shine(26, 27, 2.5);
  },
  rocket(g, h) {
    h.tri(22, 44, 32, 52, 42, 44, 0xff8b3d); h.rr(24, 16, 16, 30, 7, 0xc8ceda); h.tri(24, 22, 32, 8, 40, 22, 0xe8483f);
    h.circ(32, 30, 4, 0x7fd0ff); h.tri(24, 36, 16, 46, 24, 46, 0xe8483f); h.tri(40, 36, 48, 46, 40, 46, 0xe8483f);
  },
};

// Gera 'tq-<id>' para cada tipo + texturas auxiliares. Chamar uma vez por cena.
export function buildTileTextures(scene) {
  if (scene.textures.exists('tq-' + TILE_TYPES[0].id)) return;
  const g = scene.make.graphics({ add: false });
  const h = mk(g);
  for (const t of TILE_TYPES) {
    g.clear();
    // sombra, contorno, cara, aro colorido
    g.fillStyle(0x000000, 0.22); g.fillRoundedRect(4, 6, 58, 58, 14);
    g.fillStyle(OUTLINE, 1); g.fillRoundedRect(2, 2, 58, 58, 14);
    g.fillStyle(shade(t.c, 0.55), 1); g.fillRoundedRect(4, 4, 54, 54, 12);
    g.fillStyle(0xfdf7ec, 1); g.fillRoundedRect(7, 7, 48, 48, 10);
    g.fillStyle(W, 0.5); g.fillRoundedRect(9, 9, 44, 12, 6);
    (ICONS[t.id] || ICONS.star)(g, h);
    g.generateTexture('tq-' + t.id, TEX, TEX);
  }
  // verso/peça bloqueada escura, gelo, cadeado, partículas (prefixo tq-fx-: os ids das peças também viram tq-<id>, então star/heart/chest colidiriam)
  g.clear(); g.fillStyle(0x000000, 0.55); g.fillRoundedRect(4, 4, 54, 54, 12); g.generateTexture('tq-dim', TEX, TEX);
  g.clear(); g.fillStyle(0x9fe8ff, 0.62); g.fillRoundedRect(3, 3, 56, 56, 13); g.fillStyle(W, 0.7); g.fillTriangle(10, 12, 24, 10, 14, 26); g.fillTriangle(50, 46, 40, 54, 54, 54); g.generateTexture('tq-ice', TEX, TEX);
  g.clear(); g.fillStyle(0x000000, 0.35); g.fillRoundedRect(3, 3, 56, 56, 13);
  g.fillStyle(OUTLINE, 1); g.fillRoundedRect(22, 30, 20, 16, 4); g.lineStyle(4, OUTLINE, 1); g.beginPath(); g.arc(32, 30, 7, Math.PI, 0); g.strokePath();
  g.fillStyle(0xffd23e, 1); g.fillRoundedRect(24, 32, 16, 12, 3); g.fillStyle(OUTLINE, 1); g.fillCircle(32, 37, 2); g.generateTexture('tq-lock', TEX, TEX);
  g.clear(); g.fillStyle(W, 1); g.fillCircle(5, 5, 5); g.generateTexture('tq-fx-dot', 10, 10);
  g.clear(); g.fillStyle(0xffd23e, 1);
  const pts = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5; const r = i % 2 ? 4 : 9; return { x: 10 + Math.cos(a) * r, y: 10 + Math.sin(a) * r }; });
  g.fillPoints(pts, true); g.generateTexture('tq-fx-star', 20, 20);
  g.destroy();
}
