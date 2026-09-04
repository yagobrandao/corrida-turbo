// Battle Tactics — dados de balanceamento.
//
// Tudo o que é NÚMERO mora aqui: unidades, sinergias, duplas, economia,
// rodadas. O código (sim.js, economy.js, cena) só lê estas tabelas, então
// adicionar uma unidade, uma facção ou uma rodada nova é acrescentar uma linha.

// ---------------------------------------------------------------- tabuleiro
export const COLS = 6;
export const ROWS = 8;
export const PLAYER_ROWS = [4, 5, 6, 7];   // metade de baixo é do jogador
export const ENEMY_ROWS = [0, 1, 2, 3];
export const CELL_W = 64;
export const CELL_H = 48;

export const BENCH_SIZE = 6;
export const SHOP_SIZE = 5;

// ---------------------------------------------------------------- economia
export const START_GOLD = 4;
export const START_HP = 100;
export const REROLL_COST = 2;
export const XP_COST = 4;
export const XP_PER_BUY = 4;
export const XP_PER_ROUND = 2;
export const START_LEVEL = 2;
export const MAX_LEVEL = 8;
export const TOTAL_ROUNDS = 10;
// rodadas de loot (PvE, fora do chefe): vencer abre "escolha 1 de 3"
// equipamentos. O chefe (última rodada) sempre dá 1 de 3 LENDÁRIOS.
export const LOOT_ROUNDS = [3, 6, 8];
export const BATTLE_TIME_LIMIT = 45;       // segundos; empata → decide por vida

// PvP: tempo de preparação por rodada (quem não apertar LUTAR entra assim mesmo)
export const PVP_PREP_TIME = 45;

// XP necessário para sair de cada nível
// Só com o XP automático (2/rodada) chega ao nível 5 na rodada 8; quem
// investe ouro em XP chega ao 6 por volta da rodada 8.
export const XP_TO_NEXT = { 2: 2, 3: 4, 4: 8, 5: 12, 6: 20, 7: 32 };

// chance por raridade [comum, raro, épico] em % por nível
export const ODDS = {
  2: [100, 0, 0],
  3: [75, 25, 0],
  4: [60, 32, 8],
  5: [50, 35, 15],
  6: [42, 38, 20],
  7: [35, 38, 27],
  8: [30, 38, 32],
};

export const RARITIES = {
  comum: { name: 'Comum',  cost: 1, pool: 12, color: 0x4a5378, text: '#b8bfd8' },
  raro:  { name: 'Raro',   cost: 2, pool: 8,  color: 0x1b6bb0, text: '#7fd0ff' },
  epico: { name: 'Épico',  cost: 3, pool: 5,  color: 0x6b3fa0, text: '#d7a9ff' },
  lenda: { name: 'Lenda',  cost: 5, pool: 0,  color: 0xb8860b, text: '#ffd23e' },
};

// renda base por rodada (cresce até 5), juros e sequências
export function baseIncome(round) { return Math.min(5, 2 + round); }
export function interest(gold) { return Math.min(4, Math.floor(gold / 10)); }
export function streakBonus(streak) { return streak >= 4 ? 2 : streak >= 2 ? 1 : 0; }
export const WIN_BONUS = 1;

// vender: ★1 devolve o custo; evoluída devolve as cópias menos 1 de taxa
export function sellValue(def, star) {
  const v = RARITIES[def.rarity].cost * Math.pow(3, star - 1);
  return Math.max(1, star > 1 ? v - 1 : v);
}

// multiplicador de HP e dano por estrela
export const STAR_MULT = { 1: 1, 2: 1.8, 3: 3.2 };

// dano que o jogador sofre ao perder uma batalha
export function playerDamage(round, enemiesAlive, bossAlive) {
  return 4 + 3 * enemiesAlive + (bossAlive ? 8 : 0) + Math.floor(round / 3);
}

// moedas permanentes da plataforma no fim da partida
export function permCoinsFor(roundsCleared, won, bossKilled) {
  return roundsCleared * 10 + (bossKilled ? 40 : 0) + (won ? 50 : 0);
}
export function pvpCoinsFor(rounds, won) {
  return rounds * 6 + (won ? 80 : 20);
}

// ---------------------------------------------------------------- facções e classes
export const FACTIONS = {
  bosque: { name: 'Bosque', color: 0x2fb573, hex: '#2fb573' },
  brasa:  { name: 'Brasa',  color: 0xff8b3d, hex: '#ff8b3d' },
  geada:  { name: 'Geada',  color: 0x3ddad7, hex: '#3ddad7' },
  pedra:  { name: 'Pedra',  color: 0x8d93a8, hex: '#8d93a8' },   // só o chefe
};
export const CLASSES = {
  guerreiro: { name: 'Guerreiro', color: 0xe8483f, hex: '#e8483f' },
  atirador:  { name: 'Atirador',  color: 0x39a9f4, hex: '#39a9f4' },
  assassino: { name: 'Assassino', color: 0xd45de0, hex: '#d45de0' },
  suporte:   { name: 'Suporte',   color: 0x8fe66a, hex: '#8fe66a' },
  colosso:   { name: 'Colosso',   color: 0x8d93a8, hex: '#8d93a8' },  // só o chefe
};

// Sinergias: contam unidades DISTINTAS do traço em campo.
// `apply` recebe o buff acumulado da equipe e o nível atingido (1 ou 2).
export const SYNERGIES = [
  {
    id: 'bosque', kind: 'faction', name: 'Bosque', thresholds: [2, 4],
    desc: ['+15% de vida', '+30% de vida e todos regeneram 1,2%/s'],
    apply: (b, lv) => { b.hp += lv >= 2 ? 0.30 : 0.15; if (lv >= 2) b.regen += 0.012; },
  },
  {
    id: 'brasa', kind: 'faction', name: 'Brasa', thresholds: [2, 4],
    desc: ['+15% de dano', '+30% de dano e os ataques queimam'],
    apply: (b, lv) => { b.atk += lv >= 2 ? 0.30 : 0.15; if (lv >= 2) b.burn = true; },
  },
  {
    id: 'geada', kind: 'faction', name: 'Geada', thresholds: [2, 4],
    desc: ['ataques gelam: alvo ataca 20% mais devagar', 'gelam 40% e têm 15% de chance de congelar por 1s'],
    apply: (b, lv) => { b.chill = lv >= 2 ? 0.40 : 0.20; if (lv >= 2) b.freeze = 0.15; },
  },
  {
    id: 'guerreiro', kind: 'class', name: 'Guerreiro', thresholds: [2, 4],
    desc: ['sofrem 15% menos dano', 'sofrem 30% menos dano'],
    apply: (b, lv) => { b.armor += lv >= 2 ? 0.30 : 0.15; },
  },
  {
    id: 'atirador', kind: 'class', name: 'Atirador', thresholds: [2, 4],
    desc: ['+20% velocidade de ataque', '+40% velocidade de ataque'],
    apply: (b, lv) => { b.as += lv >= 2 ? 0.40 : 0.20; },
  },
  {
    id: 'assassino', kind: 'class', name: 'Assassino', thresholds: [2],
    desc: ['25% de chance de golpe crítico (dano dobrado)'],
    apply: (b) => { b.crit += 0.25; },
  },
  {
    id: 'suporte', kind: 'class', name: 'Suporte', thresholds: [2],
    desc: ['toda a equipe regenera 1%/s'],
    apply: (b) => { b.regen += 0.01; },
  },
];

// Duplas: dois personagens específicos juntos em campo liberam um bônus
// só para eles. `perUnit` soma nos multiplicadores daquela unidade.
export const PAIRS = [
  { a: 'javali', b: 'urso', name: 'Trincheira', desc: 'Javali e Urso sofrem 20% menos dano', perUnit: { javali: { armor: 0.2 }, urso: { armor: 0.2 } } },
  { a: 'corca', b: 'coruja', name: 'Vigília da Mata', desc: 'Corça ataca 30% mais rápido', perUnit: { corca: { as: 0.3 } } },
  { a: 'duende', b: 'salamandra', name: 'Fogueira', desc: 'Duende e Salamandra causam 20% mais dano', perUnit: { duende: { atk: 0.2 }, salamandra: { atk: 0.2 } } },
  { a: 'lebre', b: 'lince', name: 'Rastro na Neve', desc: 'Lince começa a luta com metade da energia', perUnit: { lince: { mana: 50 } } },
  { a: 'morsa', b: 'yeti', name: 'Geleira', desc: 'Morsa e Yeti ganham 25% de vida', perUnit: { morsa: { hp: 0.25 }, yeti: { hp: 0.25 } } },
  { a: 'fenix', b: 'espirito', name: 'Aurora', desc: 'Fênix ganha 40% de vida', perUnit: { fenix: { hp: 0.4 } } },
  { a: 'vespa', b: 'fenix', name: 'Enxame Solar', desc: 'Vespa causa 30% mais dano', perUnit: { vespa: { atk: 0.3 } } },
  { a: 'javali', b: 'morsa', name: 'Muralha', desc: 'Javali e Morsa ganham 15% de vida', perUnit: { javali: { hp: 0.15 }, morsa: { hp: 0.15 } } },
];

// ---------------------------------------------------------------- unidades
// as: ataques por segundo · range: em células (1 = corpo a corpo) ·
// speed: células por segundo · ai: alvo preferido ('nearest', 'ranged',
// 'assassin' = pula na retaguarda, 'support' = fica atrás) ·
// ability: { name, kind, ...parâmetros por estrela, desc(star) } — carrega
// com energia (ataques dados e golpes recebidos) e dispara sozinha.
const pct = (arr, s) => Math.round(arr[s - 1] * 100);
export const UNITS = {
  javali: {
    id: 'javali', name: 'Javali Escudeiro', faction: 'bosque', cls: 'guerreiro', rarity: 'comum',
    hp: 520, atk: 38, as: 0.8, range: 1, speed: 2.4, ai: 'nearest',
    ability: {
      name: 'Casca Grossa', kind: 'shield', pct: [0.30, 0.35, 0.45], dur: 4,
      desc: (s) => `Ganha um escudo de ${pct([0.30, 0.35, 0.45], s)}% da vida por 4s.`,
    },
  },
  corca: {
    id: 'corca', name: 'Arqueira Corça', faction: 'bosque', cls: 'atirador', rarity: 'comum',
    hp: 300, atk: 44, as: 1.1, range: 3, speed: 2.2, ai: 'ranged',
    ability: {
      name: 'Flecha Tripla', kind: 'multishot', mult: [1.2, 1.3, 1.5], shots: [3, 3, 4],
      desc: (s) => `Dispara ${[3, 3, 4][s - 1]} flechas de ${pct([1.2, 1.3, 1.5], s)}% de dano em alvos diferentes.`,
    },
  },
  duende: {
    id: 'duende', name: 'Duende de Brasa', faction: 'brasa', cls: 'atirador', rarity: 'comum',
    hp: 280, atk: 40, as: 1.0, range: 3, speed: 2.2, ai: 'ranged',
    ability: {
      name: 'Bola de Fogo', kind: 'aoe', mult: [1.6, 1.8, 2.2], radius: 1,
      desc: (s) => `Explosão de ${pct([1.6, 1.8, 2.2], s)}% de dano no alvo e nos vizinhos.`,
    },
  },
  morsa: {
    id: 'morsa', name: 'Morsa Bastião', faction: 'geada', cls: 'guerreiro', rarity: 'comum',
    hp: 600, atk: 34, as: 0.75, range: 1, speed: 1.9, ai: 'nearest',
    ability: {
      name: 'Muralha de Gelo', kind: 'freeze', stun: [1.0, 1.2, 1.5], pct: [0.15, 0.2, 0.25],
      desc: (s) => `Congela os inimigos ao redor por ${[1.0, 1.2, 1.5][s - 1].toFixed(1).replace('.', ',')}s e ganha escudo de ${pct([0.15, 0.2, 0.25], s)}%.`,
    },
  },
  lebre: {
    id: 'lebre', name: 'Lebre Gélida', faction: 'geada', cls: 'atirador', rarity: 'comum',
    hp: 270, atk: 42, as: 1.15, range: 3, speed: 2.6, ai: 'ranged',
    ability: {
      name: 'Estilhaço', kind: 'shard', mult: [1.7, 1.9, 2.3], chill: 3,
      desc: (s) => `${pct([1.7, 1.9, 2.3], s)}% de dano e o alvo ataca 40% mais devagar por 3s.`,
    },
  },
  vespa: {
    id: 'vespa', name: 'Vespa de Brasa', faction: 'brasa', cls: 'assassino', rarity: 'comum',
    hp: 260, atk: 46, as: 1.3, range: 1, speed: 3.2, ai: 'assassin',
    ability: {
      name: 'Ferroada', kind: 'sting', mult: [2.0, 2.3, 2.8], burn: 3,
      desc: (s) => `Pula na retaguarda. Ferroada: ${pct([2.0, 2.3, 2.8], s)}% de dano e deixa queimando.`,
    },
  },
  salamandra: {
    id: 'salamandra', name: 'Salamandra', faction: 'brasa', cls: 'guerreiro', rarity: 'raro',
    hp: 640, atk: 52, as: 0.9, range: 1, speed: 2.4, ai: 'nearest',
    ability: {
      name: 'Rugido de Brasa', kind: 'roar', mult: [1.3, 1.5, 1.9], radius: 1, burn: 3,
      desc: (s) => `${pct([1.3, 1.5, 1.9], s)}% de dano em todos ao redor e os deixa queimando.`,
    },
  },
  urso: {
    id: 'urso', name: 'Urso Lenhador', faction: 'bosque', cls: 'guerreiro', rarity: 'raro',
    hp: 760, atk: 66, as: 0.7, range: 1, speed: 2.0, ai: 'nearest',
    ability: {
      name: 'Machadada', kind: 'cleave', mult: [2.8, 3.2, 4.0], splash: 0.5,
      desc: (s) => `Golpe de ${pct([2.8, 3.2, 4.0], s)}% no alvo, e metade nos vizinhos dele.`,
    },
  },
  lince: {
    id: 'lince', name: 'Lince da Geada', faction: 'geada', cls: 'assassino', rarity: 'raro',
    hp: 380, atk: 72, as: 1.0, range: 1, speed: 3.0, ai: 'assassin',
    ability: {
      name: 'Golpe Fatal', kind: 'execute', mult: [2.5, 2.8, 3.4], threshold: 0.4,
      desc: (s) => `Pula na retaguarda. Golpe de ${pct([2.5, 2.8, 3.4], s)}%, dobrado se o alvo tem menos de 40% de vida.`,
    },
  },
  coruja: {
    id: 'coruja', name: 'Coruja Curandeira', faction: 'bosque', cls: 'suporte', rarity: 'raro',
    hp: 320, atk: 30, as: 0.9, range: 3, speed: 2.2, ai: 'support',
    ability: {
      name: 'Canto da Mata', kind: 'heal', pct: [0.30, 0.36, 0.48],
      desc: (s) => `Cura ${pct([0.30, 0.36, 0.48], s)}% da vida do aliado mais ferido.`,
    },
  },
  fenix: {
    id: 'fenix', name: 'Fênix', faction: 'brasa', cls: 'atirador', rarity: 'epico',
    hp: 420, atk: 70, as: 1.0, range: 3, speed: 2.6, ai: 'ranged',
    ability: {
      name: 'Rajada Solar', kind: 'snipe', mult: [3.5, 4.0, 5.0], targets: [1, 1, 2],
      desc: (s) => `${pct([3.5, 4.0, 5.0], s)}% de dano no inimigo com menos vida${s === 3 ? ', em 2 alvos' : ''}.`,
    },
  },
  yeti: {
    id: 'yeti', name: 'Yeti Ancião', faction: 'geada', cls: 'guerreiro', rarity: 'epico',
    hp: 1100, atk: 80, as: 0.65, range: 1, speed: 1.7, ai: 'nearest',
    ability: {
      name: 'Avalanche', kind: 'avalanche', mult: [1.8, 2.1, 2.6], radius: 1, stun: 1.0,
      desc: (s) => `${pct([1.8, 2.1, 2.6], s)}% de dano em todos ao redor e os atordoa por 1s.`,
    },
  },
  espirito: {
    id: 'espirito', name: 'Espírito da Mata', faction: 'bosque', cls: 'suporte', rarity: 'epico',
    hp: 380, atk: 36, as: 0.9, range: 3, speed: 2.2, ai: 'support',
    ability: {
      name: 'Florescer', kind: 'bless', pct: [0.15, 0.18, 0.25], atk: 0.2, dur: 4,
      desc: (s) => `Cura ${pct([0.15, 0.18, 0.25], s)}% da vida de todos os aliados e dá +20% de dano por 4s.`,
    },
  },
  // chefe: não aparece na loja
  anciao: {
    id: 'anciao', name: 'Ancião de Pedra', faction: 'pedra', cls: 'colosso', rarity: 'lenda', boss: true,
    hp: 9000, atk: 160, as: 0.6, range: 1, speed: 1.3, ai: 'nearest', manaPerAttack: 20,
    ability: {
      name: 'Pisão', kind: 'stomp', mult: [2.0, 2.0, 2.0], radius: 2, stun: 1.5,
      desc: () => 'Esmaga todos num raio de 2 células e os atordoa.',
    },
  },
};

export const SHOP_UNITS = Object.values(UNITS).filter(u => !u.boss);
export const unitDef = (id) => UNITS[id];
export const unitCost = (def) => RARITIES[def.rarity].cost;

// energia: 100 para lançar a habilidade
export const MANA_MAX = 100;
export const MANA_PER_ATTACK = 14;
export const MANA_PER_HIT = 6;

// ---------------------------------------------------------------- rodadas (PvE)
// Formações da metade de cima (linhas 0..3; linha 3 é a frente).
const U = (id, star, c, r) => ({ id, star, c, r });
export const ROUNDS = [
  // a arqueira vem na frente de propósito: a lição da rodada 1 é posicionar
  { name: 'Batedores do Bosque', units: [U('corca', 1, 3, 3), U('javali', 1, 2, 1)] },
  { name: 'Faíscas', units: [U('javali', 1, 1, 3), U('duende', 1, 4, 2), U('duende', 1, 3, 1)] },
  { name: 'Fogo Cruzado', units: [U('salamandra', 1, 2, 3), U('javali', 1, 4, 3), U('lebre', 1, 3, 1)] },
  { name: 'Matilha do Urso', units: [U('urso', 1, 2, 3), U('javali', 1, 4, 3), U('corca', 1, 2, 1), U('duende', 1, 4, 1)] },
  { name: 'Chamas Gêmeas', units: [U('javali', 2, 2, 3), U('salamandra', 1, 4, 3), U('duende', 2, 3, 1), U('coruja', 1, 2, 0)] },
  { name: 'Emboscada na Neve', units: [U('morsa', 1, 2, 3), U('javali', 2, 4, 3), U('vespa', 1, 0, 3), U('lebre', 2, 3, 1), U('corca', 1, 4, 1)] },
  { name: 'Legião de Brasa', units: [U('salamandra', 2, 1, 3), U('salamandra', 1, 4, 3), U('duende', 2, 2, 1), U('duende', 1, 3, 1), U('fenix', 1, 5, 0)] },
  { name: 'Guarda do Bosque', units: [U('urso', 2, 2, 3), U('urso', 1, 3, 3), U('javali', 2, 0, 3), U('morsa', 1, 5, 3), U('corca', 2, 1, 1), U('coruja', 1, 4, 0)] },
  { name: 'Véspera', units: [U('fenix', 2, 2, 0), U('lince', 2, 0, 3), U('salamandra', 2, 3, 3), U('yeti', 1, 2, 3), U('javali', 2, 5, 3), U('lebre', 2, 4, 1)] },
  // calibrado por simulação: formação forte vence sempre, típica ~70%, atrasada perde
  { name: 'O Ancião de Pedra', boss: true, units: [U('anciao', 1, 3, 2), U('javali', 2, 1, 3), U('javali', 2, 5, 3), U('corca', 2, 3, 0)] },
];

// PvP: a formação do adversário (linhas 4..7 dele) espelhada na metade de cima
export function mirrorSpec(spec) {
  return spec.map(u => ({ ...u, c: COLS - 1 - u.c, r: ROWS - 1 - u.r }));
}
