// Todas as texturas são geradas em runtime (nada de assets externos),
// com um traço cartoon consistente: cores chapadas + contorno escuro + brilho.
import { SKINS, getSkin, textureKey, slotTextureKey } from './skins.js';
import { SLOT_COLORS } from '../../core/config.js';
import { drawParts } from '../../core/shapes.js';
import { backParts, frontParts, faceParts, mouthParts, bodyColor, cosKey } from '../../core/cosmetics.js';

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
//
// As coordenadas são EXATAMENTE as do charSVG (ui/art.js): quadro 76×104,
// corpo x 11..65 / y 24..96, olhos em y=42. Os cosméticos (core/cosmetics.js)
// são listas de formas nesse mesmo quadro, interpretadas pelos dois lados.
// A textura é mais larga que o quadro (margem PAD de cada lado) para caber
// pets e asas; o personagem continua no centro, então nada muda nos jogos.
const PAD = 16;
const RUNNER_W = 76 + PAD * 2;
const RUNNER_H = 104;

function drawFeature(g, skin) {
  const { feature, body, accent } = skin;
  switch (feature) {
    case 'ears':
      g.fillStyle(OUTLINE, 1); g.fillCircle(22, 16, 12); g.fillCircle(54, 16, 12);
      g.fillStyle(body, 1); g.fillCircle(22, 16, 9); g.fillCircle(54, 16, 9);
      g.fillStyle(accent, 1); g.fillCircle(22, 16, 4.5); g.fillCircle(54, 16, 4.5);
      break;
    case 'antenna':
      g.fillStyle(OUTLINE, 1); g.fillRoundedRect(35, 2, 6, 22, 3); g.fillCircle(38, 5, 9);
      g.fillStyle(accent, 1); g.fillCircle(38, 5, 6.5);
      g.fillStyle(0xffffff, 0.6); g.fillCircle(35.5, 2.5, 2.4);
      break;
    case 'crown':
      g.fillStyle(OUTLINE, 1);
      g.fillPoints([{ x: 16, y: 26 }, { x: 21, y: 8 }, { x: 28, y: 22 }, { x: 38, y: 4 }, { x: 48, y: 22 }, { x: 55, y: 8 }, { x: 60, y: 26 }], true);
      g.fillStyle(0xffd23e, 1);
      g.fillPoints([{ x: 19, y: 24 }, { x: 22.5, y: 12 }, { x: 28.5, y: 23 }, { x: 38, y: 8 }, { x: 47.5, y: 23 }, { x: 53.5, y: 12 }, { x: 57, y: 24 }], true);
      break;
  }
}

function drawRunner(g, skin, cos) {
  g.clear();
  // desloca o quadro de 76px para o centro da textura mais larga
  g.translateCanvas(PAD, 0);
  const pal = { body: skin.body, belly: skin.belly, accent: skin.accent, outline: OUTLINE };

  // asas e pet ficam atrás do corpo
  drawParts(g, backParts(cos), pal);
  drawFeature(g, skin);

  // corpo com contorno + barriga
  g.fillStyle(OUTLINE, 1); g.fillRoundedRect(9, 22, 58, 76, 27);
  g.fillStyle(skin.body, 1); g.fillRoundedRect(11, 24, 54, 72, 25);
  g.fillStyle(skin.belly, 1); g.fillRoundedRect(20, 58, 36, 32, 16);

  // rosto cosmético substitui o padrão quando existe
  const face = faceParts(cos);
  if (face) {
    drawParts(g, face, pal);
  } else if (skin.feature === 'visor') {
    g.fillStyle(OUTLINE, 1); g.fillRoundedRect(14, 34, 48, 20, 10);
    g.fillStyle(skin.accent, 1); g.fillRoundedRect(17, 37, 42, 14, 7);
    g.fillStyle(0xffffff, 0.45); g.fillRoundedRect(21, 39.5, 13, 5.5, 2.7);
  } else {
    g.fillStyle(0xffffff, 1); g.fillCircle(28, 42, 8); g.fillCircle(48, 42, 8);
    g.fillStyle(OUTLINE, 1); g.fillCircle(30, 43, 4); g.fillCircle(50, 43, 4);
  }

  // boca: a do rosto equipado, ou a padrão — todo boneco tem uma
  drawParts(g, mouthParts(cos), pal);

  // bochechas
  g.fillStyle(0xffffff, 0.25); g.fillCircle(21, 52, 4); g.fillCircle(55, 52, 4);

  // roupa, óculos, cabelo e chapéu — nesta ordem, por cima de tudo
  drawParts(g, frontParts(cos), pal);
  g.translateCanvas(-PAD, 0);
}

// Gera sob demanda a versão do personagem com a cor certa e os cosméticos.
// Devolve a chave da textura, pronta para usar.
// slot = número → pinta com a cor daquele slot (salas multiplayer)
// slot = null   → cores da skin, ou a cor cosmética escolhida (treino solo)
export function ensureRunnerTexture(scene, skinId, slot, cos) {
  const solo = slot === null || slot === undefined;
  // a chave inclui os cosméticos: trocar de chapéu gera uma textura nova
  const key = (solo ? textureKey(skinId) : slotTextureKey(skinId, slot))
    + (cos ? '-' + cosKey(cos) : '');
  if (scene.textures.exists(key)) return key;
  const base = getSkin(skinId);
  let skin = base;
  const color = solo ? bodyColor(cos) : SLOT_COLORS[slot % SLOT_COLORS.length];
  if (color !== null && color !== undefined) {
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
