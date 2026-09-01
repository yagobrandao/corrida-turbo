// Catálogo de personagens. Cada skin é só um conjunto de cores + um adereço,
// desenhado em runtime pelo textures.js — nenhum arquivo de imagem envolvido.
//
// `cost` é o total de moedas acumuladas (histórico) necessário para destravar.
// Como usa o total histórico, o jogador nunca perde uma skin já conquistada.
export const SKINS = [
  { id: 'azul',    name: 'Turbo',    body: 0x39a9f4, belly: 0x7fd0ff, accent: 0x1b6bb0, feature: 'none',    cost: 0 },
  { id: 'laranja', name: 'Faísca',   body: 0xff8b3d, belly: 0xffc07d, accent: 0xb8531a, feature: 'none',    cost: 0 },
  { id: 'verde',   name: 'Broto',    body: 0x2fb573, belly: 0x8fe6ba, accent: 0x177a48, feature: 'ears',    cost: 60 },
  { id: 'roxo',    name: 'Vulto',    body: 0xa06bde, belly: 0xd4b4f5, accent: 0x6b3fa0, feature: 'antenna', cost: 150 },
  { id: 'rosa',    name: 'Chiclete', body: 0xff6fae, belly: 0xffb3d4, accent: 0xc2367a, feature: 'ears',    cost: 300 },
  { id: 'ciano',   name: 'Gelo',     body: 0x3ddad7, belly: 0xa5f3f1, accent: 0x1a8b89, feature: 'visor',   cost: 500 },
  { id: 'carvao',  name: 'Sombra',   body: 0x4a5378, belly: 0x8892bd, accent: 0x272e4d, feature: 'visor',   cost: 800 },
  { id: 'ouro',    name: 'Lenda',    body: 0xffd23e, belly: 0xfff0a8, accent: 0xc79a10, feature: 'crown',   cost: 1500 },
];

export const DEFAULT_SKIN = SKINS[0].id;

export function getSkin(id) {
  return SKINS.find(s => s.id === id) || SKINS[0];
}

export function isUnlocked(skin, totalCoins) {
  return totalCoins >= skin.cost;
}

// Skin efetivamente utilizável: se a salva não está mais destravada
// (por exemplo, progresso resetado), cai para a padrão.
export function resolveSkin(id, totalCoins) {
  const s = getSkin(id);
  return isUnlocked(s, totalCoins) ? s : SKINS[0];
}

export function textureKey(id) {
  return 'runner-' + id;
}

// Numa sala, a cor do personagem vem do slot — é o que garante que dois
// jogadores nunca fiquem idênticos, mesmo escolhendo a mesma skin.
// A skin continua definindo o formato e o adereço.
export function slotTextureKey(id, slot) {
  return `runner-${id}-s${slot}`;
}
