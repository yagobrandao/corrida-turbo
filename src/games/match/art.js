// Pomar Mágico — arte procedural: frutas (6 silhuetas), especiais,
// obstáculos, células, partículas, a Tuca (guia), construções da ilha,
// cenário. Mesmo traço da plataforma: contorno escuro, cor chapada, brilho.
import { FRUITS, ISLAND } from './config.js';

const OUT = 0x1c2440;
const W = 0xffffff;

export function buildMatchTextures(scene) {
  if (scene.textures.exists('m3-p0')) return;
  const g = scene.make.graphics({ add: false });
  const done = (k, w, h = w) => { g.generateTexture(k, w, h); g.clear(); };
  const shade = (c, a) => { const r = (c >> 16) & 255, gg = (c >> 8) & 255, b = c & 255; const m = (v) => a >= 0 ? Math.round(v + (255 - v) * a) : Math.round(v * (1 + a)); return (m(r) << 16) | (m(gg) << 8) | m(b); };
  const S = 96, cx = 48, cy = 48;
  const gloss = (x, y, rx, ry) => { g.fillStyle(W, 0.55); g.fillEllipse(x, y, rx, ry); g.fillStyle(W, 0.9); g.fillEllipse(x - rx * 0.15, y - ry * 0.15, rx * 0.35, ry * 0.35); };
  const shadow = () => { g.fillStyle(0x000000, 0.22); g.fillEllipse(cx, 84, 56, 14); };

  // ---- frutas
  const fruit = {
    cone(c, c2) { // morango
      shadow();
      g.fillStyle(OUT, 1); g.fillTriangle(cx - 30, 30, cx + 30, 30, cx, 86); g.fillCircle(cx - 16, 34, 16); g.fillCircle(cx + 16, 34, 16); g.fillCircle(cx, 30, 18);
      g.fillStyle(c, 1); g.fillTriangle(cx - 26, 32, cx + 26, 32, cx, 80); g.fillCircle(cx - 14, 36, 13); g.fillCircle(cx + 14, 36, 13); g.fillCircle(cx, 32, 15);
      g.fillStyle(0x3fae70, 1); g.fillTriangle(cx - 22, 26, cx - 4, 16, cx - 2, 30); g.fillTriangle(cx + 22, 26, cx + 4, 16, cx + 2, 30); g.fillTriangle(cx - 6, 24, cx + 6, 24, cx, 10);
      g.fillStyle(c2, 0.9); for (const [x, y] of [[36, 44], [52, 50], [44, 62], [58, 42], [40, 34]]) g.fillEllipse(x, y, 4, 6);
      gloss(38, 40, 14, 9);
    },
    crescent(c, c2) { // banana
      shadow();
      g.lineStyle(30, OUT, 1); g.beginPath(); g.arc(cx, 28, 34, 0.3, Math.PI - 0.3); g.strokePath();
      g.lineStyle(22, c, 1); g.beginPath(); g.arc(cx, 28, 34, 0.3, Math.PI - 0.3); g.strokePath();
      g.fillStyle(OUT, 1); g.fillCircle(cx - 32, 40, 8); g.fillCircle(cx + 32, 40, 8); g.fillStyle(0x6b4a2e, 1); g.fillCircle(cx - 32, 40, 5); g.fillCircle(cx + 32, 40, 5);
      g.lineStyle(4, shade(c, -0.25), 1); g.beginPath(); g.arc(cx, 28, 40, 0.5, Math.PI - 0.5); g.strokePath();
      g.lineStyle(5, c2, 0.8); g.beginPath(); g.arc(cx, 28, 30, 0.6, 1.4); g.strokePath();
    },
    cluster(c, c2) { // uva
      shadow();
      const pts = [[cx, 76], [cx - 14, 62], [cx + 14, 62], [cx - 26, 46], [cx, 48], [cx + 26, 46], [cx - 14, 32], [cx + 14, 32]];
      g.fillStyle(OUT, 1); for (const [x, y] of pts) g.fillCircle(x, y, 14);
      g.fillStyle(c, 1); for (const [x, y] of pts) g.fillCircle(x, y, 11);
      g.fillStyle(c2, 0.7); for (const [x, y] of pts) g.fillCircle(x - 3, y - 3, 4);
      g.fillStyle(0x6b4a2e, 1); g.fillRect(cx - 3, 12, 6, 16); g.fillStyle(0x3fae70, 1); g.fillEllipse(cx + 12, 18, 20, 10);
    },
    round(c, c2) { // maçã
      shadow();
      g.fillStyle(OUT, 1); g.fillCircle(cx - 10, 52, 30); g.fillCircle(cx + 10, 52, 30);
      g.fillStyle(c, 1); g.fillCircle(cx - 10, 52, 27); g.fillCircle(cx + 10, 52, 27);
      g.fillStyle(shade(c, -0.2), 1); g.fillEllipse(cx, 30, 14, 8);
      g.fillStyle(0x6b4a2e, 1); g.fillRect(cx - 3, 14, 6, 16); g.fillStyle(0x8fe66a, 1); g.fillEllipse(cx + 14, 20, 22, 11); g.lineStyle(2, 0x3fae70, 1); g.lineBetween(cx + 4, 22, cx + 24, 18);
      g.fillStyle(c2, 0.6); g.fillEllipse(cx - 12, 44, 16, 22); gloss(cx - 14, 40, 10, 8);
    },
    wedge(c, c2) { // laranja (gomo)
      shadow();
      g.fillStyle(OUT, 1); g.slice(cx, 70, 46, Math.PI, 2 * Math.PI, false); g.fillPath();
      g.fillStyle(c, 1); g.slice(cx, 70, 42, Math.PI, 2 * Math.PI, false); g.fillPath();
      g.fillStyle(c2, 1); g.slice(cx, 70, 34, Math.PI, 2 * Math.PI, false); g.fillPath();
      g.fillStyle(c, 0.85); for (let i = 0; i < 5; i++) { const a0 = Math.PI + i * Math.PI / 5 + 0.06, a1 = Math.PI + (i + 1) * Math.PI / 5 - 0.06; g.slice(cx, 70, 30, a0, a1, false); g.fillPath(); }
      g.fillStyle(W, 0.5); g.fillEllipse(cx - 14, 52, 10, 6);
    },
    berry(c, c2) { // mirtilo sextavado com coroa
      shadow();
      const hex = (r, col) => { g.fillStyle(col, 1); g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; const x = cx + Math.cos(a) * r, y = cy + 6 + Math.sin(a) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); g.fillPath(); };
      hex(36, OUT); hex(32, c);
      g.fillStyle(shade(c, -0.25), 1); g.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; const x = cx + Math.cos(a) * 12, y = cy - 6 + Math.sin(a) * 8; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); g.fillPath();
      g.fillStyle(c2, 0.7); g.fillEllipse(cx - 10, cy + 12, 14, 18); gloss(cx - 12, cy + 4, 9, 7);
    },
  };
  FRUITS.forEach((f, i) => { fruit[f.shape](f.c, f.c2); done('m3-p' + i, S); });

  // ---- especiais: foguete (faixa com setas), bomba, bomba de cor
  FRUITS.forEach((f, i) => {
    for (const dir of ['rh', 'rv']) {
      fruit[f.shape](f.c, f.c2);
      g.fillStyle(W, 0.85);
      if (dir === 'rh') { g.fillRoundedRect(8, 42, 80, 14, 6); g.fillStyle(OUT, 1); g.fillTriangle(14, 49, 26, 42, 26, 56); g.fillTriangle(82, 49, 70, 42, 70, 56); }
      else { g.fillRoundedRect(41, 8, 14, 80, 6); g.fillStyle(OUT, 1); g.fillTriangle(48, 14, 41, 26, 55, 26); g.fillTriangle(48, 82, 41, 70, 55, 70); }
      done(`m3-p${i}-${dir}`, S);
    }
  });
  shadow(); g.fillStyle(OUT, 1); g.fillCircle(cx, cy + 6, 34); g.fillStyle(0x2c3766, 1); g.fillCircle(cx, cy + 6, 30);
  g.fillStyle(0xe8483f, 1); g.fillCircle(cx, cy + 6, 12); g.fillStyle(0xffd23e, 1); g.fillCircle(cx, cy + 6, 6);
  g.lineStyle(4, OUT, 1); g.lineBetween(cx + 14, 22, cx + 26, 8); g.fillStyle(0xff8b3d, 1); g.fillCircle(cx + 27, 7, 6); g.fillStyle(0xffd23e, 1); g.fillCircle(cx + 27, 7, 3);
  g.fillStyle(W, 0.5); g.fillEllipse(cx - 12, cy - 6, 14, 10);
  done('m3-bomb', S);
  shadow(); g.fillStyle(OUT, 1); g.fillCircle(cx, cy, 36);
  const rain = [0xe8483f, 0xff8b3d, 0xffd23e, 0x3fae70, 0x2b7fd4, 0x8d5ac0];
  rain.forEach((col, i) => { g.fillStyle(col, 1); g.slice(cx, cy, 32, i * Math.PI / 3, (i + 1) * Math.PI / 3, false); g.fillPath(); });
  g.fillStyle(W, 1); g.fillCircle(cx, cy, 12); g.fillStyle(0xffd23e, 1); g.fillCircle(cx, cy, 6); gloss(cx - 12, cy - 12, 14, 10);
  done('m3-color', S);

  // ---- obstáculos
  for (const n of [1, 2]) { g.fillStyle(0x9fe8ff, n === 2 ? 0.85 : 0.6); g.fillRoundedRect(4, 4, 88, 88, 14); g.lineStyle(3, W, 0.8); g.strokeRoundedRect(6, 6, 84, 84, 13); g.lineStyle(2, W, 0.7); g.lineBetween(20, 30, 44, 50); g.lineBetween(44, 50, 36, 74); if (n === 2) { g.lineBetween(60, 20, 70, 46); g.lineBetween(70, 46, 56, 62); } done('m3-ice' + n, S); }
  for (const n of [1, 2]) { g.fillStyle(OUT, 1); g.fillRoundedRect(6, 6, 84, 84, 8); g.fillStyle(n === 2 ? 0x8a5a2a : 0xb5773a, 1); g.fillRoundedRect(10, 10, 76, 76, 6); g.lineStyle(4, shade(n === 2 ? 0x8a5a2a : 0xb5773a, -0.3), 1); g.lineBetween(10, 48, 86, 48); g.lineBetween(48, 10, 48, 86); g.lineBetween(14, 14, 82, 82); g.lineStyle(3, 0xffe58a, 0.5); g.lineBetween(14, 14, 82, 14); if (n === 2) { g.fillStyle(0x6f7590, 1); for (const [x, y] of [[18, 18], [78, 18], [18, 78], [78, 78]]) g.fillCircle(x, y, 4); } done('m3-box' + n, S); }
  g.lineStyle(7, OUT, 1); for (let i = 0; i < 4; i++) { g.strokeEllipse(20 + i * 18, 48, 16, 10); } g.lineStyle(4, 0xc8ceda, 1); for (let i = 0; i < 4; i++) g.strokeEllipse(20 + i * 18, 48, 16, 10); g.fillStyle(OUT, 1); g.fillRect(2, 44, 6, 8); g.fillRect(88, 44, 6, 8); done('m3-chain', S);
  g.fillStyle(0x000000, 0.18); g.fillRoundedRect(3, 3, 90, 90, 12); done('m3-cell', S);
  g.fillStyle(0xffd23e, 0.35); g.fillRoundedRect(0, 0, 96, 96, 14); g.lineStyle(5, 0xffd23e, 1); g.strokeRoundedRect(3, 3, 90, 90, 13); done('m3-sel', S);

  // ---- partículas / ícones
  g.fillStyle(W, 1); g.fillCircle(6, 6, 6); done('m3-dot', 12);
  g.fillStyle(W, 1); g.fillCircle(32, 32, 32); done('m3-glow', 64);
  const star = (x, y, r, col) => { g.fillStyle(col, 1); g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.45 : r; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (i) g.lineTo(px, py); else g.moveTo(px, py); } g.closePath(); g.fillPath(); };
  star(24, 24, 22, OUT); star(24, 24, 18, 0xffd23e); g.fillStyle(W, 0.6); g.fillCircle(18, 16, 4); done('m3-star', 48);
  star(24, 24, 22, OUT); star(24, 24, 18, 0x3a4470); done('m3-star-off', 48);
  g.fillStyle(OUT, 1); g.fillCircle(20, 20, 18); g.fillStyle(0xffd23e, 1); g.fillCircle(20, 20, 15); g.fillStyle(0xffb300, 1); g.fillCircle(20, 20, 10); g.fillStyle(0xffe58a, 1); g.fillRect(17, 12, 6, 16); done('m3-coin', 40);
  g.fillStyle(OUT, 1); g.fillCircle(14, 16, 12); g.fillCircle(26, 16, 12); g.fillTriangle(3, 20, 37, 20, 20, 38); g.fillStyle(0xe8483f, 1); g.fillCircle(14, 16, 9); g.fillCircle(26, 16, 9); g.fillTriangle(6, 20, 34, 20, 20, 34); g.fillStyle(W, 0.5); g.fillCircle(12, 13, 3); done('m3-heart', 40);
  g.fillStyle(OUT, 1); g.fillCircle(20, 14, 10); g.fillRoundedRect(8, 14, 24, 22, 6); g.fillStyle(0xffd23e, 1); g.fillCircle(20, 14, 7); g.fillRoundedRect(11, 16, 18, 18, 5); g.fillStyle(OUT, 1); g.fillCircle(20, 14, 3); g.fillRect(19, 24, 3, 8); done('m3-key', 40);
  // baús
  for (const [id, col] of [['common', 0xb5773a], ['rare', 0x2b7fd4], ['epic', 0x8d5ac0], ['legendary', 0xffd23e]]) {
    g.fillStyle(0x000000, 0.25); g.fillEllipse(48, 84, 70, 14);
    g.fillStyle(OUT, 1); g.fillRoundedRect(10, 40, 76, 44, 8); g.fillRoundedRect(10, 22, 76, 30, 12);
    g.fillStyle(col, 1); g.fillRoundedRect(14, 44, 68, 36, 6); g.fillStyle(shade(col, 0.2), 1); g.fillRoundedRect(14, 26, 68, 24, 10);
    g.fillStyle(OUT, 1); g.fillRect(14, 48, 68, 5); g.fillStyle(0xffe58a, 1); g.fillRoundedRect(40, 44, 16, 16, 4); g.fillStyle(OUT, 1); g.fillCircle(48, 51, 3);
    done('m3-chest-' + id, S);
  }

  // ---- a Tuca (tucana guia): 2 quadros (normal, piscando) + acenando
  const tuca = (blink, wave) => {
    g.fillStyle(0x000000, 0.2); g.fillEllipse(64, 118, 70, 14);
    // corpo
    g.fillStyle(OUT, 1); g.fillEllipse(60, 80, 62, 70); g.fillStyle(0x2c3766, 1); g.fillEllipse(60, 80, 56, 64);
    g.fillStyle(0xffe58a, 1); g.fillEllipse(58, 88, 34, 44);
    // asa
    g.fillStyle(OUT, 1); g.fillEllipse(wave ? 94 : 86, wave ? 60 : 84, 26, 40); g.fillStyle(0x2c3766, 1); g.fillEllipse(wave ? 94 : 86, wave ? 60 : 84, 20, 34);
    // cabeça
    g.fillStyle(OUT, 1); g.fillCircle(56, 40, 30); g.fillStyle(0x2c3766, 1); g.fillCircle(56, 40, 27);
    g.fillStyle(0xffe58a, 1); g.fillEllipse(48, 44, 30, 26);
    // bico grande
    g.fillStyle(OUT, 1); g.fillEllipse(20, 44, 52, 26); g.fillStyle(0xff8b3d, 1); g.fillEllipse(22, 43, 46, 20); g.fillStyle(0xe8483f, 1); g.fillEllipse(8, 46, 16, 10); g.fillStyle(OUT, 1); g.fillRect(0, 44, 44, 2);
    // olho
    if (blink) { g.lineStyle(3, OUT, 1); g.lineBetween(52, 34, 64, 34); }
    else { g.fillStyle(W, 1); g.fillCircle(58, 34, 9); g.fillStyle(OUT, 1); g.fillCircle(60, 35, 5); g.fillStyle(W, 1); g.fillCircle(62, 33, 2); }
    // pés
    g.fillStyle(0xff8b3d, 1); g.fillRect(46, 108, 10, 8); g.fillRect(64, 108, 10, 8);
  };
  tuca(false, false); done('m3-tuca', 128); tuca(true, false); done('m3-tuca-blink', 128); tuca(false, true); done('m3-tuca-wave', 128);

  // ---- ilha: construções (64×64), com versão "fantasma"
  const B = {
    casa() { g.fillStyle(0xffe58a, 1); g.fillRect(14, 30, 36, 26); g.fillStyle(0xe8483f, 1); g.fillTriangle(8, 32, 56, 32, 32, 8); g.fillStyle(0x6b4a2e, 1); g.fillRect(28, 40, 10, 16); g.fillStyle(0x9fe8ff, 1); g.fillRect(16, 36, 8, 8); },
    pomar() { for (const x of [16, 32, 48]) { g.fillStyle(0x6b4a2e, 1); g.fillRect(x - 2, 36, 4, 16); g.fillStyle(0x3fae70, 1); g.fillCircle(x, 30, 12); g.fillStyle(0xe8483f, 1); g.fillCircle(x - 4, 28, 3); g.fillCircle(x + 5, 33, 3); } },
    poco() { g.fillStyle(0x8d93a8, 1); g.fillRect(16, 34, 32, 20); g.fillStyle(0x6b4a2e, 1); g.fillRect(18, 16, 4, 20); g.fillRect(42, 16, 4, 20); g.fillStyle(0xe8483f, 1); g.fillTriangle(12, 18, 52, 18, 32, 6); g.fillStyle(0x2b7fd4, 1); g.fillEllipse(32, 36, 22, 8); },
    ponte() { g.fillStyle(0x2b7fd4, 1); g.fillRect(4, 40, 56, 14); g.fillStyle(0xb5773a, 1); g.fillRect(6, 28, 52, 10); g.lineStyle(3, 0x6b4a2e, 1); g.beginPath(); g.arc(32, 44, 24, Math.PI, 2 * Math.PI); g.strokePath(); for (const x of [10, 22, 34, 46, 54]) g.lineBetween(x, 18, x, 28); g.lineBetween(8, 18, 56, 18); },
    moinho() { g.fillStyle(0xffe58a, 1); g.fillTriangle(18, 56, 46, 56, 32, 20); g.fillStyle(0x6b4a2e, 1); for (const a of [0, 1, 2, 3]) { const ang = a * Math.PI / 2 + 0.4; g.fillRect(0, 0, 0, 0); g.lineStyle(5, 0x6b4a2e, 1); g.lineBetween(32, 26, 32 + Math.cos(ang) * 22, 26 + Math.sin(ang) * 22); } g.fillStyle(0xe8483f, 1); g.fillCircle(32, 26, 4); },
    praca() { g.fillStyle(0x8d93a8, 1); g.fillEllipse(32, 46, 48, 18); g.fillStyle(0x2b7fd4, 1); g.fillEllipse(32, 44, 30, 10); g.fillStyle(0xc8ceda, 1); g.fillRect(29, 20, 6, 24); g.fillEllipse(32, 20, 16, 6); g.fillStyle(0x9fe8ff, 0.8); g.fillCircle(32, 14, 4); },
    farol() { g.fillStyle(W, 1); g.fillRect(24, 22, 16, 34); g.fillStyle(0xe8483f, 1); g.fillRect(24, 30, 16, 6); g.fillRect(24, 44, 16, 6); g.fillStyle(0xffd23e, 1); g.fillRect(22, 12, 20, 10); g.fillStyle(0xe8483f, 1); g.fillTriangle(20, 12, 44, 12, 32, 4); g.fillStyle(0xffe58a, 0.5); g.fillTriangle(42, 14, 62, 6, 62, 24); },
    barco() { g.fillStyle(0x2b7fd4, 1); g.fillRect(4, 48, 56, 8); g.fillStyle(0xb5773a, 1); g.fillTriangle(6, 36, 58, 36, 48, 50); g.fillRect(6, 36, 52, 6); g.fillStyle(0x6b4a2e, 1); g.fillRect(30, 8, 4, 30); g.fillStyle(W, 1); g.fillTriangle(34, 10, 34, 34, 54, 34); g.fillStyle(0xe8483f, 1); g.fillTriangle(30, 10, 30, 30, 12, 30); },
  };
  for (const b of ISLAND) {
    g.fillStyle(0x000000, 0.2); g.fillEllipse(32, 58, 48, 10); B[b.id](); done('m3-b-' + b.id, 64);
    g.lineStyle(3, W, 0.6); g.strokeRoundedRect(10, 10, 44, 44, 8); g.fillStyle(W, 0.12); g.fillRoundedRect(10, 10, 44, 44, 8); g.fillStyle(W, 0.7); g.fillRect(30, 20, 4, 24); g.fillRect(20, 30, 24, 4); done('m3-b-' + b.id + '-ghost', 64);
  }

  // ---- cenário
  g.fillStyle(0x3fae70, 1); g.fillCircle(24, 22, 20); g.fillStyle(0x2f8f5b, 1); g.fillCircle(17, 27, 12); g.fillStyle(0x8fe66a, 0.6); g.fillCircle(31, 14, 7); g.fillStyle(0x6b4a2e, 1); g.fillRect(21, 36, 6, 12); done('m3-tree', 48);
  g.fillStyle(W, 0.92); g.fillCircle(20, 24, 14); g.fillCircle(36, 18, 18); g.fillCircle(54, 24, 14); g.fillRect(20, 24, 34, 14); done('m3-cloud', 72, 40);
  g.fillStyle(OUT, 1); g.fillCircle(28, 28, 26); g.fillStyle(0xffe58a, 1); g.fillCircle(28, 28, 22); done('m3-node', 56);
  g.fillStyle(OUT, 1); g.fillCircle(28, 28, 26); g.fillStyle(0x4a5378, 1); g.fillCircle(28, 28, 22); g.fillStyle(OUT, 1); g.fillRoundedRect(20, 26, 16, 14, 3); g.lineStyle(4, OUT, 1); g.beginPath(); g.arc(28, 26, 6, Math.PI, 2 * Math.PI); g.strokePath(); done('m3-node-lock', 56);
  g.destroy();
}
