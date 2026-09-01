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

// ---------- cosméticos ----------
// Mesmas coordenadas do boneco (76×104) usadas no SVG das telas, para o
// personagem ficar idêntico dentro e fora das partidas.
function drawHat(g, hat) {
  switch (hat) {
    case 'cap':
      g.fillStyle(OUTLINE, 1); g.fillRoundedRect(11, 8, 54, 18, 9);
      g.fillStyle(0xe8483f, 1); g.fillRoundedRect(13, 10, 50, 14, 7);
      g.fillStyle(0x9c2820, 1); g.fillRoundedRect(13, 20, 62, 7, 3.5);
      break;
    case 'party':
      g.fillStyle(OUTLINE, 1); g.fillTriangle(38, -4, 20, 26, 56, 26);
      g.fillStyle(0xffd23e, 1); g.fillTriangle(38, 1, 24, 24, 52, 24);
      g.fillStyle(0xe8483f, 1); g.fillTriangle(38, 1, 30, 16, 44, 16);
      g.fillStyle(0x3ddad7, 1); g.fillCircle(38, -2, 5);
      break;
    case 'top':
      g.fillStyle(OUTLINE, 1); g.fillRoundedRect(8, 20, 60, 8, 4);
      g.fillRoundedRect(20, -6, 36, 28, 4);
      g.fillStyle(0x2a2358, 1); g.fillRoundedRect(22, -4, 32, 24, 3);
      g.fillStyle(0xffd23e, 1); g.fillRect(22, 12, 32, 6);
      break;
    case 'horns':
      g.fillStyle(OUTLINE, 1);
      g.fillTriangle(16, 24, 26, 24, 12, 0);
      g.fillTriangle(60, 24, 50, 24, 64, 0);
      g.fillStyle(0xe8483f, 1);
      g.fillTriangle(18, 22, 25, 22, 14, 4);
      g.fillTriangle(58, 22, 51, 22, 62, 4);
      break;
    case 'halo':
      g.fillStyle(0xffd23e, 1); g.fillEllipse(38, 6, 42, 14);
      g.fillStyle(0x1c2440, 0); // recorte interno
      g.fillStyle(0xfff3c4, 1); g.fillEllipse(38, 6, 28, 6);
      break;
    case 'crown':
      g.fillStyle(OUTLINE, 1);
      g.fillTriangle(14, 26, 26, 26, 20, 2);
      g.fillTriangle(30, 26, 46, 26, 38, -4);
      g.fillTriangle(50, 26, 62, 26, 56, 2);
      g.fillRect(14, 20, 48, 8);
      g.fillStyle(0xffd23e, 1);
      g.fillTriangle(17, 24, 25, 24, 21, 7);
      g.fillTriangle(33, 24, 45, 24, 39, 2);
      g.fillTriangle(51, 24, 59, 24, 55, 7);
      g.fillRect(16, 21, 44, 5);
      break;
  }
}

// Devolve true se o rosto foi desenhado por completo (dispensa o padrão).
function drawFace(g, face, top) {
  const ey = top + 24;
  switch (face) {
    case 'happy':
      g.lineStyle(4, OUTLINE, 1);
      g.beginPath(); g.arc(28, ey + 2, 8, Math.PI, 0, true); g.strokePath();
      g.beginPath(); g.arc(48, ey + 2, 8, Math.PI, 0, true); g.strokePath();
      return true;
    case 'cool':
      g.fillStyle(OUTLINE, 1); g.fillRoundedRect(14, ey - 9, 48, 17, 6);
      g.fillStyle(0x2a2358, 1);
      g.fillRoundedRect(17, ey - 6, 18, 11, 4);
      g.fillRoundedRect(41, ey - 6, 18, 11, 4);
      g.fillStyle(0xffffff, 0.4); g.fillRect(19, ey - 4, 6, 3);
      return true;
    case 'angry':
      g.fillStyle(0xffffff, 1); g.fillCircle(28, ey, 8); g.fillCircle(48, ey, 8);
      g.fillStyle(OUTLINE, 1); g.fillCircle(30, ey + 1, 4); g.fillCircle(50, ey + 1, 4);
      g.fillStyle(OUTLINE, 1);
      g.fillTriangle(18, ey - 13, 36, ey - 6, 18, ey - 6);
      g.fillTriangle(58, ey - 13, 40, ey - 6, 58, ey - 6);
      return true;
    case 'wink':
      g.fillStyle(0xffffff, 1); g.fillCircle(28, ey, 8);
      g.fillStyle(OUTLINE, 1); g.fillCircle(30, ey + 1, 4);
      g.lineStyle(4, OUTLINE, 1);
      g.beginPath(); g.arc(48, ey + 2, 8, Math.PI, 0, true); g.strokePath();
      return true;
    case 'star':
      g.fillStyle(0xffffff, 1); g.fillCircle(28, ey, 8); g.fillCircle(48, ey, 8);
      g.fillStyle(0xffd23e, 1);
      for (const cx of [28, 48]) {
        g.fillTriangle(cx, ey - 7, cx - 6, ey + 5, cx + 6, ey + 5);
        g.fillTriangle(cx, ey + 7, cx - 6, ey - 5, cx + 6, ey - 5);
      }
      return true;
    default:
      return false;
  }
}

function drawRunner(g, skin, cos) {
  g.clear();
  drawFeature(g, skin);

  roundRect(g, 10, BODY_TOP, 56, 74, 26, skin.body);

  // barriga
  g.fillStyle(skin.belly, 1);
  g.fillRoundedRect(20, BODY_TOP + 34, 36, 32, 16);

  // rosto cosmético substitui o padrão quando existe
  const customFace = cos && cos.face && cos.face !== 'none'
    && drawFace(g, cos.face, BODY_TOP);

  if (customFace) {
    // já desenhado
  } else if (skin.feature === 'visor') {
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

  // o chapéu vai por último, por cima de tudo
  if (cos && cos.hat && cos.hat !== 'none') drawHat(g, cos.hat);
}

// Gera sob demanda a versão do personagem pintada com a cor do slot.
// Devolve a chave da textura, pronta para usar.
// slot = número → pinta com a cor daquele slot (salas multiplayer)
// slot = null   → mantém as cores originais da skin (treino solo)
export function ensureRunnerTexture(scene, skinId, slot, cos) {
  // a chave inclui os cosméticos: trocar de chapéu gera uma textura nova
  const key = (slot === null || slot === undefined ? textureKey(skinId) : slotTextureKey(skinId, slot))
    + (cos ? `-${cos.hat || 'none'}-${cos.face || 'none'}` : '');
  if (scene.textures.exists(key)) return key;
  const base = getSkin(skinId);
  let skin = base;
  if (slot !== null && slot !== undefined) {
    const color = SLOT_COLORS[slot % SLOT_COLORS.length];
    skin = { ...base, body: color, belly: shade(color, 0.45), accent: shade(color, -0.35) };
  }
  const g = scene.make.graphics({ add: false });
  drawRunner(g, skin, cos);
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
