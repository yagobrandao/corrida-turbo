// Arena Clash — arte procedural: heróis, minions, torres, monstros, chão.
// Mesmo traço cartoon da plataforma (contorno escuro, cores chapadas,
// brilho). Tudo vira textura uma vez por cena.
import { HEROES, MONSTERS } from './data.js';

const OUTLINE = 0x1c2440;
const W = 0xffffff;

export function buildArenaTextures(scene) {
  if (scene.textures.exists('ar-hero-brakka')) return;
  const g = scene.make.graphics({ add: false });
  const oc = (x, y, r, c) => { g.fillStyle(OUTLINE, 1); g.fillCircle(x, y, r + 2.5); g.fillStyle(c, 1); g.fillCircle(x, y, r); };
  const orr = (x, y, w, h, rad, c) => { g.fillStyle(OUTLINE, 1); g.fillRoundedRect(x - 2.5, y - 2.5, w + 5, h + 5, rad + 2); g.fillStyle(c, 1); g.fillRoundedRect(x, y, w, h, rad); };
  const eyes = (x1, x2, y, r = 3.4) => { g.fillStyle(W, 1); g.fillCircle(x1, y, r); g.fillCircle(x2, y, r); g.fillStyle(OUTLINE, 1); g.fillCircle(x1 + 1, y + 0.5, r * 0.5); g.fillCircle(x2 + 1, y + 0.5, r * 0.5); };
  const done = (k, s = 64) => { g.generateTexture(k, s, s); g.clear(); };
  const shade = (c, a) => { const r = (c >> 16) & 255, gg = (c >> 8) & 255, b = c & 255; const m = (v) => a >= 0 ? Math.round(v + (255 - v) * a) : Math.round(v * (1 + a)); return (m(r) << 16) | (m(gg) << 8) | m(b); };

  // ---- heróis (64×64, olhando para a direita)
  const H = {
    brakka(h) { // golem largo, ombros de pedra
      orr(12, 20, 40, 36, 12, h.color); orr(6, 24, 14, 18, 6, shade(h.color, -0.2)); orr(44, 24, 14, 18, 6, shade(h.color, -0.2));
      g.fillStyle(shade(h.color, -0.35), 1); g.fillRect(20, 30, 4, 12); g.fillRect(34, 36, 4, 10);
      oc(32, 18, 12, h.color); g.fillStyle(h.accent, 1); g.fillCircle(29, 17, 3); g.fillCircle(37, 17, 3);
    },
    kael(h) { // guerreiro com espadão
      g.lineStyle(6, OUTLINE, 1); g.lineBetween(44, 52, 58, 10); g.lineStyle(3.5, 0xc8ceda, 1); g.lineBetween(44, 52, 58, 10);
      g.fillStyle(h.accent, 1); g.fillRect(40, 44, 10, 5);
      orr(18, 24, 26, 30, 9, h.color); g.fillStyle(shade(h.color, -0.3), 1); g.fillRect(18, 38, 26, 6);
      oc(31, 18, 11, 0xf0c9a0); g.fillStyle(0x4a2e1a, 1); g.fillEllipse(31, 11, 22, 10); eyes(28, 36, 19, 3);
    },
    lyra(h) { // arqueira com arco
      g.lineStyle(3.5, 0x6b4a2e, 1); g.beginPath(); g.arc(48, 30, 16, -Math.PI * 0.55, Math.PI * 0.55); g.strokePath(); g.lineStyle(1.5, 0xf0e0c0, 1); g.lineBetween(48, 14, 48, 46);
      orr(18, 26, 24, 28, 9, h.color); g.fillStyle(h.accent, 1); g.fillRect(24, 30, 12, 4);
      oc(30, 18, 10, 0xf0c9a0); g.fillStyle(0x8fca5e, 1); g.fillTriangle(22, 12, 30, 2, 40, 12); eyes(27, 34, 19, 2.8);
    },
    ignis(h) { // chama viva
      g.fillStyle(0xe8483f, 1); g.fillTriangle(22, 40, 32, 4, 42, 40); g.fillStyle(h.color, 1); g.fillTriangle(25, 40, 32, 12, 39, 40); g.fillStyle(h.accent, 1); g.fillTriangle(28, 40, 32, 22, 36, 40);
      orr(18, 34, 28, 22, 10, h.color); g.fillStyle(h.accent, 1); g.fillEllipse(32, 44, 14, 8);
      g.fillStyle(W, 1); g.fillCircle(27, 30, 3.2); g.fillCircle(37, 30, 3.2); g.fillStyle(OUTLINE, 1); g.fillCircle(28, 30, 1.6); g.fillCircle(38, 30, 1.6);
    },
    vesper(h) { // assassina encapuzada, duas adagas
      g.lineStyle(4, OUTLINE, 1); g.lineBetween(10, 44, 4, 30); g.lineBetween(54, 44, 60, 30); g.lineStyle(2.2, 0xc8ceda, 1); g.lineBetween(10, 44, 4, 30); g.lineBetween(54, 44, 60, 30);
      orr(18, 26, 26, 30, 9, h.color); g.fillStyle(h.accent, 1); g.fillRect(28, 32, 6, 14);
      oc(31, 18, 11, h.color); g.fillStyle(shade(h.color, -0.4), 1); g.fillEllipse(31, 22, 18, 8);
      g.fillStyle(h.accent, 1); g.fillCircle(28, 18, 2.4); g.fillCircle(35, 18, 2.4);
    },
    sera(h) { // suporte com auréola/luz
      g.fillStyle(h.accent, 0.35); g.fillCircle(32, 30, 26);
      orr(19, 26, 26, 30, 10, h.color); g.fillStyle(W, 1); g.fillEllipse(32, 42, 14, 10);
      oc(32, 18, 11, 0xf0c9a0); g.fillStyle(0xffd23e, 1); g.fillEllipse(32, 8, 22, 5); g.fillStyle(0xffe58a, 1); g.fillEllipse(32, 8, 16, 3);
      eyes(29, 36, 19, 2.8);
    },
  };
  for (const h of HEROES) { (H[h.id] || H.kael)(h); done('ar-hero-' + h.id); }

  // ---- minions (40×40)
  const minion = (c, type) => {
    g.fillStyle(0x000000, 0.25); g.fillEllipse(20, 34, 24, 8);
    if (type === 'siege') { orr(8, 10, 24, 24, 5, c); g.fillStyle(OUTLINE, 1); g.fillRect(14, 4, 12, 6); }
    else { oc(20, 22, 11, c); }
    if (type === 'ranged') { g.lineStyle(2.5, 0x6b4a2e, 1); g.beginPath(); g.arc(31, 20, 8, -1.3, 1.3); g.strokePath(); }
    if (type === 'melee') { g.lineStyle(3, 0xc8ceda, 1); g.lineBetween(28, 26, 36, 12); }
    g.fillStyle(W, 1); g.fillCircle(17, 20, 3); g.fillCircle(24, 20, 3); g.fillStyle(OUTLINE, 1); g.fillCircle(18, 20, 1.5); g.fillCircle(25, 20, 1.5);
  };
  for (const [t, c] of [[0, 0x39a9f4], [1, 0xe8483f]]) for (const type of ['melee', 'ranged', 'siege']) { minion(c, type); done(`ar-min-${t}-${type}`, 40); }

  // ---- torre (72×96) e core (100×100)
  const tower = (c) => {
    g.fillStyle(0x000000, 0.25); g.fillEllipse(36, 88, 60, 16);
    orr(18, 34, 36, 52, 6, 0x8d93a8); g.fillStyle(0x6f7590, 1); g.fillRect(22, 44, 28, 4); g.fillRect(22, 64, 28, 4);
    orr(12, 22, 48, 16, 4, 0xa8aec2); for (const x of [14, 26, 38, 50]) { g.fillStyle(0xa8aec2, 1); g.fillRect(x, 12, 8, 12); }
    g.fillStyle(c, 1); g.fillCircle(36, 30, 7); g.fillStyle(W, 0.7); g.fillCircle(34, 28, 2.5);
    g.fillStyle(c, 1); g.fillRect(30, 50, 12, 20);
  };
  tower(0x39a9f4); g.generateTexture('ar-tower-0', 72, 96); g.clear();
  tower(0xe8483f); g.generateTexture('ar-tower-1', 72, 96); g.clear();
  const core = (c) => {
    g.fillStyle(0x000000, 0.3); g.fillEllipse(50, 88, 90, 22);
    orr(18, 62, 64, 22, 8, 0x8d93a8); g.fillStyle(0x6f7590, 1); g.fillRect(24, 70, 52, 4);
    g.fillStyle(OUTLINE, 1); g.fillTriangle(50, 4, 22, 40, 78, 40); g.fillTriangle(22, 40, 78, 40, 50, 68);
    g.fillStyle(c, 1); g.fillTriangle(50, 9, 26, 40, 74, 40); g.fillTriangle(26, 40, 74, 40, 50, 63);
    g.fillStyle(W, 0.55); g.fillTriangle(50, 12, 32, 38, 50, 38);
  };
  core(0x39a9f4); g.generateTexture('ar-core-0', 100, 100); g.clear();
  core(0xe8483f); g.generateTexture('ar-core-1', 100, 100); g.clear();

  // ---- monstros
  const mon = {
    small() { g.fillStyle(0x000000, 0.25); g.fillEllipse(24, 40, 30, 8); oc(24, 26, 13, 0x7d89a8); g.fillStyle(OUTLINE, 1); g.fillTriangle(14, 18, 18, 6, 22, 18); g.fillTriangle(34, 18, 30, 6, 26, 18); g.fillStyle(0xe8483f, 1); g.fillCircle(19, 25, 2.5); g.fillCircle(29, 25, 2.5); g.fillStyle(W, 1); g.fillTriangle(20, 32, 23, 32, 21.5, 37); g.fillTriangle(26, 32, 29, 32, 27.5, 37); },
    medium() { g.fillStyle(0x000000, 0.25); g.fillEllipse(30, 52, 44, 12); orr(12, 16, 36, 34, 10, 0x8d93a8); orr(4, 22, 12, 22, 5, 0x8d93a8); orr(44, 22, 12, 22, 5, 0x8d93a8); g.fillStyle(0x3fae70, 1); g.fillEllipse(24, 18, 14, 7); g.fillStyle(0x3ddad7, 1); g.fillCircle(24, 30, 3); g.fillCircle(36, 30, 3); },
    big() { g.fillStyle(0x000000, 0.3); g.fillEllipse(36, 66, 60, 14); orr(10, 18, 52, 46, 14, 0x6b3fa0); orr(16, 6, 40, 22, 10, 0x8d5ac0); g.fillStyle(0xffd23e, 1); g.fillCircle(28, 17, 4); g.fillCircle(44, 17, 4); g.fillStyle(OUTLINE, 1); g.fillCircle(29, 17, 2); g.fillCircle(45, 17, 2); g.fillStyle(0xd45de0, 1); g.fillTriangle(20, 6, 26, -2, 30, 8); g.fillTriangle(52, 6, 46, -2, 42, 8); },
  };
  mon.small(); g.generateTexture('ar-mon-small', 48, 48); g.clear();
  mon.medium(); g.generateTexture('ar-mon-medium', 60, 60); g.clear();
  mon.big(); g.generateTexture('ar-mon-big', 72, 72); g.clear();
  // cristal arcano
  g.fillStyle(0x000000, 0.3); g.fillEllipse(40, 74, 60, 14);
  g.fillStyle(OUTLINE, 1); g.fillTriangle(40, 2, 14, 40, 66, 40); g.fillTriangle(14, 40, 66, 40, 40, 72);
  g.fillStyle(0xd45de0, 1); g.fillTriangle(40, 7, 18, 40, 62, 40); g.fillTriangle(18, 40, 62, 40, 40, 67);
  g.fillStyle(0xff8fc4, 0.7); g.fillTriangle(40, 10, 24, 38, 40, 38); g.fillStyle(W, 0.5); g.fillTriangle(40, 12, 30, 30, 40, 30);
  g.generateTexture('ar-crystal', 80, 80); g.clear();

  // ---- cenário
  g.fillStyle(0x3fae70, 1); g.fillCircle(24, 22, 20); g.fillStyle(0x2f8f5b, 1); g.fillCircle(18, 26, 12); g.fillStyle(0x8fe66a, 0.6); g.fillCircle(30, 14, 7); g.fillStyle(0x6b4a2e, 1); g.fillRect(21, 36, 6, 10); g.generateTexture('ar-tree', 48, 48); g.clear();
  g.fillStyle(0x000000, 0.2); g.fillEllipse(22, 34, 36, 10); oc(22, 22, 16, 0x8d93a8); g.fillStyle(0xa8aec2, 1); g.fillCircle(17, 17, 6); g.generateTexture('ar-rock', 44, 44); g.clear();
  g.fillStyle(W, 1); g.fillCircle(6, 6, 6); g.generateTexture('ar-dot', 12, 12); g.clear();
  g.fillStyle(W, 1); g.fillCircle(64, 64, 64); g.generateTexture('ar-light', 128, 128); g.clear();
  // chão: grama com pontinhos
  g.fillStyle(0x4f9a5a, 1); g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 70; i++) { g.fillStyle(i % 2 ? 0x5aa865 : 0x47904f, 1); g.fillRect((i * 37) % 128, (i * 53) % 128, 3, 2); }
  g.generateTexture('ar-grass', 128, 128); g.clear();
  g.destroy();
}
