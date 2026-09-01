// Todas as texturas são geradas em runtime (nada de assets externos),
// com um traço cartoon consistente: cores chapadas + contorno escuro + brilho.
const OUTLINE = 0x1c2440;

function roundRect(g, x, y, w, h, r, fill, line = OUTLINE) {
  g.fillStyle(line, 1);
  g.fillRoundedRect(x - 3, y - 3, w + 6, h + 6, r + 3);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x, y, w, h, r);
}

function shine(g, x, y, w, h, r) {
  g.fillStyle(0xffffff, 0.22);
  g.fillRoundedRect(x + 5, y + 4, w - 10, Math.max(6, h * 0.22), r * 0.7);
}

export function buildTextures(scene) {
  const g = scene.make.graphics({ add: false });

  // ---------- personagens (corpo cápsula + rosto) ----------
  const makeRunner = (key, body, belly) => {
    g.clear();
    roundRect(g, 8, 6, 56, 74, 26, body);
    // barriga
    g.fillStyle(belly, 1);
    g.fillRoundedRect(18, 40, 36, 32, 16);
    // olhos
    g.fillStyle(0xffffff, 1);
    g.fillCircle(26, 30, 9);
    g.fillCircle(46, 30, 9);
    g.fillStyle(0x1c2440, 1);
    g.fillCircle(28, 31, 4.5);
    g.fillCircle(48, 31, 4.5);
    // bochechas
    g.fillStyle(0xffffff, 0.25);
    g.fillCircle(20, 40, 4);
    g.fillCircle(52, 40, 4);
    g.generateTexture(key, 72, 86);
  };
  makeRunner('runner-p1', 0x39a9f4, 0x7fd0ff);   // azul (você)
  makeRunner('runner-p2', 0xff8b3d, 0xffc07d);   // laranja (rival)

  // ---------- sombra ----------
  g.clear();
  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(30, 10, 60, 20);
  g.generateTexture('shadow', 60, 20);

  // ---------- barreira baixa (pular) ----------
  g.clear();
  roundRect(g, 4, 10, 96, 30, 8, 0xe8483f);
  g.fillStyle(0xffffff, 1);
  for (let i = 0; i < 3; i++) g.fillRect(14 + i * 32, 14, 16, 22);
  g.fillStyle(OUTLINE, 1);
  g.fillRect(10, 40, 8, 14);
  g.fillRect(86, 40, 8, 14);
  g.generateTexture('ob-low', 104, 56);

  // ---------- barreira alta (deslizar por baixo) ----------
  g.clear();
  // postes
  g.fillStyle(OUTLINE, 1);
  g.fillRect(2, 0, 10, 96);
  g.fillRect(92, 0, 10, 96);
  // placa suspensa
  roundRect(g, 0, 4, 104, 40, 8, 0xf4b63a);
  g.fillStyle(OUTLINE, 0.85);
  for (let i = 0; i < 4; i++) g.fillTriangle(8 + i * 26, 40, 20 + i * 26, 40, 14 + i * 26, 16);
  g.generateTexture('ob-high', 104, 96);

  // ---------- caixote/bloco ----------
  g.clear();
  roundRect(g, 4, 4, 96, 76, 10, 0xa06bde);
  shine(g, 4, 4, 96, 76, 10);
  g.fillStyle(0x7c4bb8, 1);
  g.fillRoundedRect(24, 30, 56, 34, 8);
  g.generateTexture('ob-block', 104, 86);

  // ---------- trem ----------
  g.clear();
  roundRect(g, 4, 6, 100, 240, 18, 0x2fb573);
  shine(g, 4, 6, 100, 60, 14);
  // janelas
  g.fillStyle(0xbfeaff, 1);
  for (let i = 0; i < 4; i++) g.fillRoundedRect(22, 34 + i * 52, 64, 30, 8);
  g.fillStyle(0x1c2440, 0.5);
  g.fillRoundedRect(14, 228, 80, 10, 5);
  g.generateTexture('ob-train', 108, 252);

  // ---------- buraco ----------
  g.clear();
  g.fillStyle(0x10142a, 1);
  g.fillEllipse(52, 26, 100, 48);
  g.fillStyle(0x000000, 0.9);
  g.fillEllipse(52, 26, 84, 36);
  g.fillStyle(0xf4b63a, 1);
  g.fillTriangle(8, 6, 24, 6, 16, 16);
  g.fillTriangle(80, 46, 96, 46, 88, 56);
  g.generateTexture('ob-hole', 104, 56);

  // ---------- moeda ----------
  g.clear();
  g.fillStyle(0xb8860b, 1);
  g.fillCircle(19, 19, 18);
  g.fillStyle(0xffd23e, 1);
  g.fillCircle(18, 18, 16);
  g.fillStyle(0xffea90, 1);
  g.fillCircle(14, 13, 6);
  g.fillStyle(0xd9a410, 1);
  g.fillCircle(18, 18, 9);
  g.fillStyle(0xffd23e, 1);
  g.fillCircle(17, 17, 7);
  g.generateTexture('coin', 38, 38);

  // ---------- partículas ----------
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillCircle(6, 6, 6);
  g.generateTexture('spark', 12, 12);

  // ---------- traço da divisória de faixa (tile) ----------
  g.clear();
  g.fillStyle(0xffffff, 0.75);
  g.fillRoundedRect(0, 0, 8, 34, 4);
  g.generateTexture('dash', 8, 64); // 34px de traço + 30px de vão

  // ---------- lateral da pista (tile de "cidade") ----------
  g.clear();
  g.fillStyle(0x232b52, 1);
  g.fillRect(0, 0, 90, 160);
  g.fillStyle(0x2c3564, 1);
  g.fillRect(8, 10, 60, 60);
  g.fillRect(20, 90, 55, 55);
  g.fillStyle(0xf4d35e, 0.5);
  g.fillRect(16, 20, 10, 10);
  g.fillRect(36, 20, 10, 10);
  g.fillRect(16, 40, 10, 10);
  g.fillRect(30, 100, 10, 10);
  g.fillRect(50, 100, 10, 10);
  g.fillRect(30, 120, 10, 10);
  g.generateTexture('side-tile', 90, 160);

  g.destroy();
}
