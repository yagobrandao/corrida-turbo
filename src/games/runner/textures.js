// Todas as texturas são geradas em runtime (nada de assets externos),
// com um traço cartoon consistente: cores chapadas + contorno escuro + brilho.
import { SKINS, getSkin, textureKey, slotTextureKey } from './skins.js';
import { SLOT_COLORS } from '../../core/config.js';

const OUTLINE = 0x1c2440;

// mistura uma cor com branco (amt > 0) ou preto (amt < 0)
function shade(hex, amt) {
  const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
  const mix = (c) => amt >= 0
    ? Math.round(c + (255 - c) * amt)
    : Math.round(c * (1 + amt));
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

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

// ---------- personagem ----------
// Cápsula com rosto + um adereço que dá identidade a cada skin.
const RUNNER_W = 76;
const RUNNER_H = 104;
const BODY_TOP = 26;

function drawFeature(g, skin) {
  const { feature, body, accent } = skin;
  switch (feature) {
    case 'ears':
      g.fillStyle(OUTLINE, 1);
      g.fillCircle(23, 21, 13);
      g.fillCircle(53, 21, 13);
      g.fillStyle(body, 1);
      g.fillCircle(23, 21, 10);
      g.fillCircle(53, 21, 10);
      g.fillStyle(accent, 1);
      g.fillCircle(23, 21, 5);
      g.fillCircle(53, 21, 5);
      break;
    case 'antenna':
      g.fillStyle(OUTLINE, 1);
      g.fillRect(35, 6, 6, 24);
      g.fillCircle(38, 8, 11);
      g.fillStyle(accent, 1);
      g.fillCircle(38, 8, 8);
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(35, 5, 3);
      break;
    case 'visor':
      // faixa que cobre os olhos, desenhada depois do rosto
      break;
    case 'crown':
      g.fillStyle(OUTLINE, 1);
      g.fillTriangle(14, 30, 26, 30, 20, 6);
      g.fillTriangle(30, 30, 46, 30, 38, 2);
      g.fillTriangle(50, 30, 62, 30, 56, 6);
      g.fillStyle(0xffd23e, 1);
      g.fillTriangle(17, 28, 25, 28, 21, 11);
      g.fillTriangle(33, 28, 45, 28, 39, 8);
      g.fillTriangle(51, 28, 59, 28, 55, 11);
      break;
  }
}

function drawRunner(g, skin) {
  g.clear();
  drawFeature(g, skin);

  roundRect(g, 10, BODY_TOP, 56, 74, 26, skin.body);

  // barriga
  g.fillStyle(skin.belly, 1);
  g.fillRoundedRect(20, BODY_TOP + 34, 36, 32, 16);

  if (skin.feature === 'visor') {
    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(12, BODY_TOP + 14, 52, 22, 10);
    g.fillStyle(skin.accent, 1);
    g.fillRoundedRect(15, BODY_TOP + 17, 46, 16, 8);
    g.fillStyle(0xffffff, 0.45);
    g.fillRoundedRect(19, BODY_TOP + 20, 14, 6, 3);
  } else {
    // olhos
    g.fillStyle(0xffffff, 1);
    g.fillCircle(28, BODY_TOP + 24, 9);
    g.fillCircle(48, BODY_TOP + 24, 9);
    g.fillStyle(OUTLINE, 1);
    g.fillCircle(30, BODY_TOP + 25, 4.5);
    g.fillCircle(50, BODY_TOP + 25, 4.5);
  }

  // bochechas
  g.fillStyle(0xffffff, 0.25);
  g.fillCircle(22, BODY_TOP + 34, 4);
  g.fillCircle(54, BODY_TOP + 34, 4);
}

// Gera sob demanda a versão do personagem pintada com a cor do slot.
// Devolve a chave da textura, pronta para usar.
export function ensureRunnerTexture(scene, skinId, slot) {
  const key = slotTextureKey(skinId, slot);
  if (scene.textures.exists(key)) return key;
  const color = SLOT_COLORS[slot % SLOT_COLORS.length];
  const skin = {
    ...getSkin(skinId),
    body: color,
    belly: shade(color, 0.45),
    accent: shade(color, -0.35),
  };
  const g = scene.make.graphics({ add: false });
  drawRunner(g, skin);
  g.generateTexture(key, RUNNER_W, RUNNER_H);
  g.destroy();
  return key;
}

export function buildTextures(scene) {
  const g = scene.make.graphics({ add: false });

  // um personagem por skin
  for (const skin of SKINS) {
    drawRunner(g, skin);
    g.generateTexture(textureKey(skin.id), RUNNER_W, RUNNER_H);
  }

  // ---------- sombra ----------
  g.clear();
  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(30, 10, 60, 20);
  g.generateTexture('shadow', 60, 20);

  // ---------- anel colorido sob o rival (tingido por slot) ----------
  g.clear();
  g.lineStyle(5, 0xffffff, 1);
  g.strokeEllipse(34, 12, 58, 18);
  g.generateTexture('ring', 68, 26);

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
  g.fillStyle(OUTLINE, 1);
  g.fillRect(2, 0, 10, 96);
  g.fillRect(92, 0, 10, 96);
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

  // ---------- bolha de power-up ----------
  g.clear();
  g.fillStyle(0x1c2440, 0.85);
  g.fillCircle(26, 26, 25);
  g.lineStyle(4, 0xffd23e, 1);
  g.strokeCircle(26, 26, 23);
  g.fillStyle(0xffffff, 0.18);
  g.fillCircle(18, 16, 8);
  g.generateTexture('pu-bubble', 52, 52);

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
