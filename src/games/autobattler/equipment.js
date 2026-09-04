// Battle Tactics — equipamentos: armas, armaduras, acessórios.
//
// Cada unidade tem 3 slots (weapon/armor/accessory). Um item NUNCA é dado
// direto para um personagem: vem de uma recompensa, e o jogador decide se
// guarda, vende ou equipa — e em quem. Reaproveita as raridades que já
// existem em config.js (comum/raro/épico/lenda — "lenda" já existia lá,
// sem uso até agora: perfeita pra recompensa de chefe).
//
// Os itens são temporários da partida — nunca entram no save permanente
// do jogador, então ninguém começa uma corrida com vantagem.
export const SLOTS = ['weapon', 'armor', 'accessory'];
export const SLOT_NAME = { weapon: 'Arma', armor: 'Armadura', accessory: 'Acessório' };
export const SELL_VALUE = { comum: 2, raro: 4, epico: 6, lenda: 10 };

const I = (o) => o;
export const ITEMS = {
  // ---------------------------------------------------------------- armas (comum)
  espada_ferro:    I({ id: 'espada_ferro', name: 'Espada de Ferro', slot: 'weapon', rarity: 'comum', tag: 'Dano', stats: { atkPct: 0.18 } }),
  machado_grande:  I({ id: 'machado_grande', name: 'Machado Grande', slot: 'weapon', rarity: 'comum', tag: 'Dano', stats: { atkPct: 0.13, asPct: 0.10 } }),
  arco_rapido:     I({ id: 'arco_rapido', name: 'Arco Rápido', slot: 'weapon', rarity: 'comum', tag: 'Vel. de ataque', stats: { asPct: 0.22 } }),
  adaga_gema:      I({ id: 'adaga_gema', name: 'Adaga de Gema', slot: 'weapon', rarity: 'comum', tag: 'Crítico', stats: { critPct: 0.16 } }),
  cajado_bruto:    I({ id: 'cajado_bruto', name: 'Cajado Bruto', slot: 'weapon', rarity: 'comum', tag: 'Dano', stats: { atkPct: 0.10, hpPct: 0.08 } }),
  // ---------------------------------------------------------------- armaduras (comum)
  armadura_ferro:  I({ id: 'armadura_ferro', name: 'Armadura de Ferro', slot: 'armor', rarity: 'comum', tag: 'Defesa', stats: { armorFlat: 0.12 } }),
  couraca_guarda:  I({ id: 'couraca_guarda', name: 'Couraça da Guarda', slot: 'armor', rarity: 'comum', tag: 'Tanque', stats: { hpPct: 0.20, armorFlat: 0.05 } }),
  manto_leve:      I({ id: 'manto_leve', name: 'Manto Leve', slot: 'armor', rarity: 'comum', tag: 'Vel. de ataque', stats: { asPct: 0.14, armorFlat: 0.04 } }),
  escama_gelo:     I({ id: 'escama_gelo', name: 'Escama de Gelo', slot: 'armor', rarity: 'comum', tag: 'Defesa', stats: { armorFlat: 0.08, hpPct: 0.08 } }),
  cota_espinhos:   I({ id: 'cota_espinhos', name: 'Cota de Espinhos', slot: 'armor', rarity: 'comum', tag: 'Tanque', stats: { hpPct: 0.14, atkPct: 0.06 } }),
  // ---------------------------------------------------------------- acessórios (comum)
  anel_critico:    I({ id: 'anel_critico', name: 'Anel Crítico', slot: 'accessory', rarity: 'comum', tag: 'Crítico', stats: { critPct: 0.18 } }),
  amuleto_vampiro: I({ id: 'amuleto_vampiro', name: 'Amuleto Vampírico', slot: 'accessory', rarity: 'comum', tag: 'Sustain', stats: { lifesteal: 0.14 } }),
  talisma_forca:   I({ id: 'talisma_forca', name: 'Talismã da Força', slot: 'accessory', rarity: 'comum', tag: 'Dano', stats: { atkPct: 0.14 } }),
  coracao_ferreo:  I({ id: 'coracao_ferreo', name: 'Coração Férreo', slot: 'accessory', rarity: 'comum', tag: 'Tanque', stats: { hpPct: 0.22 } }),
  penas_vento:     I({ id: 'penas_vento', name: 'Penas do Vento', slot: 'accessory', rarity: 'comum', tag: 'Vel. de ataque', stats: { asPct: 0.16 } }),
  // ---------------------------------------------------------------- combinados (raro) — 2 comuns viram 1
  lamina_sangue:   I({ id: 'lamina_sangue', name: 'Lâmina de Sangue', slot: 'weapon', rarity: 'raro', tag: 'Sustain', stats: { atkPct: 0.22, lifesteal: 0.12 }, recipe: ['espada_ferro', 'amuleto_vampiro'] }),
  adaga_assassina: I({ id: 'adaga_assassina', name: 'Adaga Assassina', slot: 'weapon', rarity: 'raro', tag: 'Crítico', stats: { atkPct: 0.14, critPct: 0.20 }, passive: 'critDmg', desc: 'Acertos críticos causam 30% de dano extra.', recipe: ['adaga_gema', 'anel_critico'] }),
  machado_fera:    I({ id: 'machado_fera', name: 'Machado da Fera', slot: 'weapon', rarity: 'raro', tag: 'Dano', stats: { atkPct: 0.20, asPct: 0.14 }, recipe: ['machado_grande', 'talisma_forca'] }),
  escudo_guardiao: I({ id: 'escudo_guardiao', name: 'Escudo Guardião', slot: 'armor', rarity: 'raro', tag: 'Tanque', stats: { hpPct: 0.26, armorFlat: 0.10 }, passive: 'shieldLowHp', desc: 'Abaixo de 30% de vida, ganha um escudo (uma vez por luta).', recipe: ['armadura_ferro', 'couraca_guarda'] }),
  placa_geada:     I({ id: 'placa_geada', name: 'Placa da Geada', slot: 'armor', rarity: 'raro', tag: 'Defesa', stats: { armorFlat: 0.16, hpPct: 0.14 }, recipe: ['escama_gelo', 'cota_espinhos'] }),
  botas_relampago: I({ id: 'botas_relampago', name: 'Botas Relâmpago', slot: 'accessory', rarity: 'raro', tag: 'Vel. de ataque', stats: { asPct: 0.24, critPct: 0.10 }, recipe: ['penas_vento', 'anel_critico'] }),
  coracao_dracone:  I({ id: 'coracao_dracone', name: 'Coração Draconiano', slot: 'accessory', rarity: 'raro', tag: 'Sustain', stats: { hpPct: 0.20, lifesteal: 0.10 }, recipe: ['coracao_ferreo', 'amuleto_vampiro'] }),
  // ---------------------------------------------------------------- lendário (só recompensa de chefe)
  lamina_dragao:     I({ id: 'lamina_dragao', name: 'Lâmina do Dragão', slot: 'weapon', rarity: 'lenda', tag: 'Dano', stats: { atkPct: 0.34, critPct: 0.16 }, passive: 'critDmg', desc: 'Acertos críticos causam 30% de dano extra.' }),
  armadura_dragao:   I({ id: 'armadura_dragao', name: 'Armadura do Dragão', slot: 'armor', rarity: 'lenda', tag: 'Tanque', stats: { hpPct: 0.40, armorFlat: 0.16 }, passive: 'shieldLowHp', desc: 'Abaixo de 30% de vida, ganha um escudo (uma vez por luta).' }),
  amuleto_ancestral: I({ id: 'amuleto_ancestral', name: 'Amuleto Ancestral', slot: 'accessory', rarity: 'lenda', tag: 'Sustain', stats: { atkPct: 0.18, lifesteal: 0.20 }, desc: 'Rouba muita vida em cada golpe.' }),
};
export const ITEM_LIST = Object.values(ITEMS);
export const COMBINABLE = ITEM_LIST.filter(i => i.recipe);
export const itemsOfRarity = (rarity, slot) => ITEM_LIST.filter(i => i.rarity === rarity && (!slot || i.slot === slot) && rarity !== 'lenda');

// soma os bônus dos 3 slots de uma unidade — devolve zero se não tiver nada
// equipado, então specs sem `.equip` (todo inimigo de PvE) ficam idênticos
// ao que já eram antes desse sistema existir.
export function equipBonus(equip) {
  const b = { atk: 0, hp: 0, as: 0, armor: 0, crit: 0, lifesteal: 0, critDmgBonus: 0, shieldPct: 0 };
  if (!equip) return b;
  for (const slot of SLOTS) {
    const it = ITEMS[equip[slot]]; if (!it) continue;
    const s = it.stats || {};
    b.atk += s.atkPct || 0; b.hp += s.hpPct || 0; b.as += s.asPct || 0;
    b.armor += s.armorFlat || 0; b.crit += s.critPct || 0; b.lifesteal += s.lifesteal || 0;
    if (it.passive === 'critDmg') b.critDmgBonus += 0.3;
    if (it.passive === 'shieldLowHp') b.shieldPct = Math.max(b.shieldPct, 0.25);
  }
  return b;
}

// sorteia N itens sem repetir slot+raridade idênticos, evitando repetir os
// últimos oferecidos — a raridade cresce com a rodada (loot rounds tardias
// dão itens melhores; sorteia raro puxando pro nível/estado do exército)
export function rollRewards(rnd, n, { round = 1, level = 2, boardSize = 0 } = {}) {
  const rareChance = Math.min(0.7, 0.15 + round * 0.045 + Math.max(0, level - 2) * 0.03 + boardSize * 0.01);
  const out = [];
  const used = new Set();
  let guard = 0;
  while (out.length < n && guard++ < 60) {
    const rarity = rnd() < rareChance ? 'raro' : 'comum';
    const pool = itemsOfRarity(rarity).filter(i => !used.has(i.id));
    if (!pool.length) continue;
    const pick = pool[Math.floor(rnd() * pool.length)];
    used.add(pick.id);
    out.push(pick.id);
  }
  return out;
}
export function rollBossReward(rnd) {
  const pool = ITEM_LIST.filter(i => i.rarity === 'lenda');
  const shuffled = [...pool].sort(() => rnd() - 0.5);
  return shuffled.slice(0, 3).map(i => i.id);
}

// pra qual classe cada item "conversa" melhor (usado só como dica visual —
// nunca impede equipar em outra unidade; liberdade de build é o objetivo)
export const CLASS_FIT = {
  guerreiro: ['armorFlat', 'hpPct'],
  atirador: ['critPct', 'asPct'],
  assassino: ['critPct', 'atkPct'],
  suporte: ['manaPct', 'hpPct'],
};
export function fitsClass(item, cls) {
  const keys = CLASS_FIT[cls] || [];
  return Object.keys(item.stats || {}).some(k => keys.includes(k));
}
