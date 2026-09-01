// Battle Tactics — dados de balanceamento.
//
// Tudo o que é NÚMERO mora aqui: unidades, sinergias, economia, rodadas.
// O código (sim.js, economy.js, cena) só lê estas tabelas, então adicionar
// uma unidade, uma facção ou uma rodada nova é acrescentar uma linha.

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
export const BATTLE_TIME_LIMIT = 45;       // segundos; empata → decide por vida

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
  comum: { name: 'Comum',  cost: 1, pool: 14, color: 0x4a5378, text: '#b8bfd8' },
  raro:  { name: 'Raro',   cost: 2, pool: 9,  color: 0x1b6bb0, text: '#7fd0ff' },
  epico: { name: 'Épico',  cost: 3, pool: 6,  color: 0x6b3fa0, text: '#d7a9ff' },
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

// ---------------------------------------------------------------- facções e classes
export const FACTIONS = {
  bosque: { name: 'Bosque', color: 0x2fb573, hex: '#2fb573' },
  brasa:  { name: 'Brasa',  color: 0xff8b3d, hex: '#ff8b3d' },
  pedra:  { name: 'Pedra',  color: 0x8d93a8, hex: '#8d93a8' },   // só o chefe
};
export const CLASSES = {
  guerreiro: { name: 'Guerreiro', color: 0xe8483f, hex: '#e8483f' },
  atirador:  { name: 'Atirador',  color: 0x39a9f4, hex: '#39a9f4' },
  colosso:   { name: 'Colosso',   color: 0x8d93a8, hex: '#8d93a8' },  // só o chefe
};

// Sinergias: contam unidades DISTINTAS do traço em campo.
// `apply` recebe o buff acumulado da equipe e o nível atingido (1 ou 2).
export const SYNERGIES = [
  {
    id: 'bosque', kind: 'faction', name: 'Bosque', thresholds: [2, 4],
    desc: ['+15% de vida', '+30% de vida e regeneram 1,2%/s'],
    apply: (b, lv) => { b.hp += lv >= 2 ? 0.30 : 0.15; if (lv >= 2) b.regen += 0.012; },
  },
  {
    id: 'brasa', kind: 'faction', name: 'Brasa', thresholds: [2, 4],
    desc: ['+15% de dano', '+30% de dano e os ataques queimam'],
    apply: (b, lv) => { b.atk += lv >= 2 ? 0.30 : 0.15; if (lv >= 2) b.burn = true; },
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
];

// ---------------------------------------------------------------- unidades
// as: ataques por segundo · range: em células (1 = corpo a corpo) ·
// speed: células por segundo · ai: prioridade de alvo ·
// ability: { name, desc(star), kind, ...parâmetros }  — carrega com energia.
export const UNITS = {
  javali: {
    id: 'javali', name: 'Javali Escudeiro', faction: 'bosque', cls: 'guerreiro', rarity: 'comum',
    hp: 520, atk: 38, as: 0.8, range: 1, speed: 2.4, ai: 'nearest',
    ability: {
      name: 'Casca Grossa', kind: 'shield', pct: [0.30, 0.35, 0.45], dur: 4,
      desc: (s) => `Ganha um escudo de ${Math.round([0.30, 0.35, 0.45][s - 1] * 100)}% da vida por 4s.`,
    },
  },
  corca: {
    id: 'corca', name: 'Arqueira Corça', faction: 'bosque', cls: 'atirador', rarity: 'comum',
    hp: 300, atk: 44, as: 1.1, range: 3, speed: 2.2, ai: 'ranged',
    ability: {
      name: 'Flecha Tripla', kind: 'multishot', mult: [1.2, 1.3, 1.5], shots: [3, 3, 4],
      desc: (s) => `Dispara ${[3, 3, 4][s - 1]} flechas de ${Math.round([1.2, 1.3, 1.5][s - 1] * 100)}% de dano em alvos diferentes.`,
    },
  },
  duende: {
    id: 'duende', name: 'Duende de Brasa', faction: 'brasa', cls: 'atirador', rarity: 'comum',
    hp: 280, atk: 40, as: 1.0, range: 3, speed: 2.2, ai: 'ranged',
    ability: {
      name: 'Bola de Fogo', kind: 'aoe', mult: [1.6, 1.8, 2.2], radius: 1,
      desc: (s) => `Explosão de ${Math.round([1.6, 1.8, 2.2][s - 1] * 100)}% de dano no alvo e nos vizinhos.`,
    },
  },
  salamandra: {
    id: 'salamandra', name: 'Salamandra', faction: 'brasa', cls: 'guerreiro', rarity: 'raro',
    hp: 640, atk: 52, as: 0.9, range: 1, speed: 2.4, ai: 'nearest',
    ability: {
      name: 'Rugido de Brasa', kind: 'roar', mult: [1.3, 1.5, 1.9], radius: 1, burn: 3,
      desc: (s) => `${Math.round([1.3, 1.5, 1.9][s - 1] * 100)}% de dano em todos ao redor e os deixa queimando.`,
    },
  },
  urso: {
    id: 'urso', name: 'Urso Lenhador', faction: 'bosque', cls: 'guerreiro', rarity: 'raro',
    hp: 760, atk: 66, as: 0.7, range: 1, speed: 2.0, ai: 'nearest',
    ability: {
      name: 'Machadada', kind: 'cleave', mult: [2.8, 3.2, 4.0], splash: 0.5,
      desc: (s) => `Golpe de ${Math.round([2.8, 3.2, 4.0][s - 1] * 100)}% no alvo, e metade nos vizinhos dele.`,
    },
  },
  fenix: {
    id: 'fenix', name: 'Fênix', faction: 'brasa', cls: 'atirador', rarity: 'epico',
    hp: 420, atk: 70, as: 1.0, range: 3, speed: 2.6, ai: 'ranged',
    ability: {
      name: 'Rajada Solar', kind: 'snipe', mult: [3.5, 4.0, 5.0], targets: [1, 1, 2],
      desc: (s) => `${Math.round([3.5, 4.0, 5.0][s - 1] * 100)}% de dano no inimigo com menos vida${s === 3 ? ', em 2 alvos' : ''}.`,
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
  { name: 'Batedores do Bosque', units: [U('javali', 1, 2, 3), U('corca', 1, 3, 1)] },
  { name: 'Faíscas', units: [U('javali', 1, 1, 3), U('javali', 1, 4, 3), U('duende', 1, 3, 1)] },
  { name: 'Fogo Cruzado', units: [U('salamandra', 1, 2, 3), U('javali', 1, 4, 3), U('corca', 1, 3, 1)] },
  { name: 'Matilha do Urso', units: [U('urso', 1, 2, 3), U('javali', 1, 4, 3), U('corca', 1, 2, 1), U('duende', 1, 4, 1)] },
  { name: 'Chamas Gêmeas', units: [U('javali', 2, 2, 3), U('salamandra', 1, 4, 3), U('duende', 2, 3, 1), U('corca', 1, 1, 1)] },
  { name: 'Emboscada', units: [U('urso', 1, 2, 3), U('javali', 2, 4, 3), U('salamandra', 1, 0, 3), U('corca', 2, 2, 1), U('duende', 1, 4, 1)] },
  { name: 'Legião de Brasa', units: [U('salamandra', 2, 1, 3), U('salamandra', 2, 4, 3), U('duende', 2, 2, 1), U('duende', 2, 3, 1), U('fenix', 1, 5, 0)] },
  { name: 'Guarda do Bosque', units: [U('urso', 2, 2, 3), U('urso', 2, 3, 3), U('javali', 2, 0, 3), U('javali', 2, 5, 3), U('corca', 2, 1, 1), U('corca', 2, 4, 1)] },
  { name: 'Véspera', units: [U('fenix', 2, 2, 0), U('fenix', 1, 3, 0), U('salamandra', 2, 3, 3), U('urso', 2, 2, 3), U('javali', 2, 0, 3), U('duende', 2, 4, 1)] },
  // calibrado por simulação: formação forte vence sempre, típica ~70%, atrasada perde
  { name: 'O Ancião de Pedra', boss: true, units: [U('anciao', 1, 3, 2), U('javali', 2, 1, 3), U('javali', 2, 5, 3), U('corca', 2, 3, 0)] },
];
