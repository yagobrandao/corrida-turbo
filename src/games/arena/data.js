// Arena Clash — dados: heróis, itens, mapa, constantes de balanceamento.
//
// Tudo o que é NÚMERO mora aqui. A simulação (sim.js), os bots (ai.js) e a
// cena só leem estas tabelas. Adicionar um herói ou um item é uma entrada
// nova — a fatia vertical tem 6 heróis (um por classe) e a estrutura já
// comporta os 30.

// ---------------------------------------------------------------- mundo
export const WORLD = { w: 2800, h: 1750 };   // ~3 telas de largura em 960×540
export const TICK = 1 / 20;                 // simulação do host
export const SNAP_HZ = 10;                  // snapshots para os clientes
export const MATCH_CAP = 12 * 60;           // segundos; empate → mais vida de core

export const TEAM = { BLUE: 0, RED: 1 };
export const TEAM_NAME = ['AZUL', 'VERMELHO'];
export const TEAM_COLOR = [0x39a9f4, 0xe8483f];

// bases, caminhos das lanes (do azul para o vermelho), torres em frações do caminho
const B = { x: 228, y: 1523 }, R = { x: 2573, y: 228 };
export const MAP = {
  bases: [B, R],
  fountainRadius: 250,
  lanes: {
    top: [{ x: 333, y: 1435 }, { x: 263, y: 910 }, { x: 298, y: 298 }, { x: 910, y: 263 }, { x: 2468, y: 315 }],
    bot: [{ x: 333, y: 1435 }, { x: 980, y: 1505 }, { x: 2503, y: 1453 }, { x: 2538, y: 875 }, { x: 2468, y: 315 }],
  },
  towerFractions: [0.26, 0.44],             // do lado de cada time
  // obstáculos (círculos): árvores e pedras da jungle e dos cantos
  obstacles: [
    { x: 735, y: 753, r: 34 }, { x: 823, y: 578, r: 26 }, { x: 1120, y: 525, r: 30 }, { x: 980, y: 980, r: 38 },
    { x: 1225, y: 1225, r: 30 }, { x: 1575, y: 560, r: 30 }, { x: 1820, y: 753, r: 34 }, { x: 1978, y: 1155, r: 26 },
    { x: 1680, y: 1225, r: 30 }, { x: 2065, y: 980, r: 38 }, { x: 1400, y: 665, r: 22 }, { x: 1400, y: 1085, r: 22 },
    { x: 595, y: 1155, r: 28 }, { x: 2205, y: 595, r: 28 }, { x: 1085, y: 823, r: 20 }, { x: 1715, y: 928, r: 20 },
  ],
  // arbustos (retângulos): quem está dentro some para quem está fora
  bushes: [
    { x: 525, y: 525, w: 210, h: 123 }, { x: 2065, y: 1103, w: 210, h: 123 },
    { x: 1225, y: 315, w: 228, h: 105 }, { x: 1348, y: 1330, w: 228, h: 105 },
    { x: 455, y: 1120, w: 123, h: 210 }, { x: 2223, y: 420, w: 123, h: 210 },
    { x: 980, y: 1120, w: 158, h: 105 }, { x: 1663, y: 525, w: 158, h: 105 },
  ],
  // acampamentos da jungle: lado azul embaixo/esquerda, vermelho em cima/direita
  camps: [
    { id: 'wolfB', kind: 'small', x: 840, y: 1225 }, { id: 'wolfR', kind: 'small', x: 1960, y: 525 },
    { id: 'golemB', kind: 'medium', x: 665, y: 840 }, { id: 'golemR', kind: 'medium', x: 2135, y: 910 },
    { id: 'elderB', kind: 'big', x: 1120, y: 1365 }, { id: 'elderR', kind: 'big', x: 1680, y: 385 },
  ],
  crystal: { x: 1400, y: 875, spawnAt: 150, respawn: 150 },
};

// ---------------------------------------------------------------- combate
export const VISION = { hero: 400, tower: 340, minion: 230, core: 300 };
export const RESPAWN = (level, t) => Math.min(30, 6 + level * 1.6 + Math.floor(t / 120) * 2);
export const XP_TO_LEVEL = (lvl) => 90 + lvl * 70;   // xp para sair do nível lvl
export const MAX_LEVEL = 10;
export const GOLD_PASSIVE = 1.6;                      // por segundo
export const CRIT_DMG_BASE = 1.75;
export const KILL_GOLD = 300, ASSIST_GOLD = 140, KILL_XP = 200, ASSIST_XP = 110;
export const TOWER_GOLD = 220, TOWER_XP = 150;

export const MINIONS = {
  melee:  { hp: 330, atk: 26, armor: 6, mr: 6, range: 60, as: 0.9, ms: 235, gold: 22, xp: 34, size: 14 },
  ranged: { hp: 250, atk: 36, armor: 2, mr: 2, range: 250, as: 0.8, ms: 235, gold: 26, xp: 36, size: 12 },
  siege:  { hp: 760, atk: 62, armor: 12, mr: 12, range: 300, as: 0.7, ms: 220, gold: 48, xp: 60, size: 18 },
};
export const WAVE_EVERY = 30, FIRST_WAVE = 12;
export const waveGrowth = (n) => 1 + (n - 1) * 0.08;      // vida/dano por onda

export const TOWER = { hp: 3000, atk: 150, atkGrowthPerMin: 25, armor: 55, mr: 55, range: 290, as: 0.85, size: 30 };
export const CORE = { hp: 4600, atk: 100, armor: 60, mr: 60, range: 300, as: 0.9, size: 40 };

export const MONSTERS = {
  small:  { name: 'Lobos',  hp: 520,  atk: 32, armor: 8,  range: 60,  as: 0.9, gold: 50,  xp: 70,  size: 14, buff: null,  respawn: 70 },
  medium: { name: 'Golem',  hp: 950,  atk: 48, armor: 18, range: 70,  as: 0.8, gold: 85,  xp: 120, size: 20, buff: 'swift', respawn: 80 },
  big:    { name: 'Ancião', hp: 1700, atk: 74, armor: 24, range: 80,  as: 0.75, gold: 150, xp: 190, size: 26, buff: 'might', respawn: 110 },
};
export const CRYSTAL = { name: 'Cristal Arcano', hp: 2400, atk: 60, armor: 30, range: 220, as: 0.6, gold: 120, xp: 160, size: 30 };
export const BUFFS = {
  swift:  { name: 'Passo Ligeiro', dur: 60, ms: 0.12 },
  might:  { name: 'Vigor Ancião',  dur: 90, atk: 22, ap: 30 },
  arcane: { name: 'Bênção Arcana', dur: 60, dmg: 0.15, ms: 0.10 },
};

// ---------------------------------------------------------------- heróis
// Atributos base e crescimento por nível. `res` = mana ou energia.
// Habilidades: kind define a mecânica na simulação; valores por rank.
//   projectile: skillshot em linha (mira automática no herói inimigo mais
//     próximo, senão na direção do joystick). pierce = atravessa.
//   aoe: área em volta de si (at:'self') ou no alvo/mira (at:'target').
//   dash: avanço na direção (ou até o alvo, se toTarget) com dano no destino.
//   buff / heal / shield / taunt / stealth: como o nome diz.
// dmgType: 'phys' usa armadura/pen, 'magic' usa resistência mágica/mpen.
const H = (o) => o;
export const HEROES = [
  H({
    id: 'brakka', name: 'Brakka', title: 'Muralha de Basalto', cls: 'tank', res: 'mana',
    lore: 'Um golem de basalto acordado por um terremoto. Não conhece medo — nem cansaço.',
    color: 0x8d93a8, accent: 0x3ddad7,
    base: { hp: 740, atk: 56, ap: 0, armor: 34, mr: 30, ms: 300, range: 95, as: 0.8, res: 300, resRegen: 6 },
    grow: { hp: 98, atk: 4, armor: 3.4, mr: 2.2, as: 0.01, res: 32 },
    passive: { id: 'pele', name: 'Pele de Pedra', desc: 'A cada 8s, o próximo golpe recebido causa 45% menos dano.' },
    skills: [
      { key: 'Q', name: 'Casca de Rocha', kind: 'shield', self: true, cd: 12, cost: 50, dur: 4, amount: [120, 200, 290, 390], ratioHp: 0.1, slowAround: { radius: 170, pct: 0.3, dur: 1.5 },
        desc: 'Escudo em si e inimigos próximos ficam 30% mais lentos.' },
      { key: 'W', name: 'Tremor', kind: 'aoe', at: 'self', radius: 190, cd: 11, cost: 60, dmgType: 'magic', dmg: [110, 170, 240, 320], ratioAp: 0.5, ratioHp: 0.04, stun: 0.9,
        desc: 'Bate no chão: dano mágico e atordoa 0,9s ao redor.' },
      { key: 'E', name: 'Investida', kind: 'dash', toTarget: true, dist: 300, cd: 13, cost: 60, dmgType: 'phys', dmg: [70, 110, 160, 220], ratioAtk: 0.6, taunt: 1.3,
        desc: 'Avança até o inimigo, causa dano e o provoca por 1,3s.' },
      { key: 'R', name: 'Fortaleza', kind: 'buff', self: true, cd: 80, cost: 100, dur: 6, armor: [50, 90], mr: [50, 90], shield: [300, 520], allyRadius: 260, allyArmor: 30,
        desc: 'Vira uma fortaleza: escudo, +armadura e +resistência; aliados próximos ganham armadura.' },
    ],
  }),
  H({
    id: 'kael', name: 'Kael', title: 'Lâmina Errante', cls: 'warrior', res: 'mana',
    lore: 'Um mercenário que jurou nunca mais lutar por dinheiro. Luta pela próxima batalha.',
    color: 0xe8483f, accent: 0xffd23e,
    base: { hp: 640, atk: 66, ap: 0, armor: 27, mr: 25, ms: 315, range: 105, as: 0.95, res: 260, resRegen: 5 },
    grow: { hp: 86, atk: 5.2, armor: 2.9, mr: 1.9, as: 0.015, res: 24 },
    passive: { id: 'sede', name: 'Sede de Batalha', desc: 'A cada 3 ataques básicos, cura 6% da vida máxima.' },
    skills: [
      { key: 'Q', name: 'Golpe Cruzado', kind: 'aoe', at: 'front', radius: 150, arc: 1.4, cd: 7, cost: 40, dmgType: 'phys', dmg: [80, 130, 190, 260], ratioAtk: 0.9,
        desc: 'Corte em arco na frente: dano físico em todos.' },
      { key: 'W', name: 'Fúria', kind: 'buff', self: true, cd: 14, cost: 50, dur: 4.5, atkPct: [0.2, 0.3, 0.4, 0.5], asPct: 0.3,
        desc: '+dano e +velocidade de ataque por 4,5s.' },
      { key: 'E', name: 'Salto', kind: 'dash', dist: 260, cd: 12, cost: 55, dmgType: 'phys', dmg: [60, 100, 150, 210], ratioAtk: 0.7, radius: 110,
        desc: 'Salta na direção da mira e causa dano onde cai.' },
      { key: 'R', name: 'Julgamento', kind: 'strike', range: 160, cd: 70, cost: 100, dmgType: 'phys', dmg: [220, 380], ratioAtk: 1.8, executeBelow: 0.25,
        desc: 'Golpe brutal no alvo. Executa inimigos abaixo de 25% de vida.' },
    ],
  }),
  H({
    id: 'lyra', name: 'Lyra', title: 'Flecha do Vento', cls: 'ranger', res: 'mana',
    lore: 'Cresceu nas copas das árvores e aprendeu a atirar antes de andar.',
    color: 0x3fae70, accent: 0xffe58a,
    base: { hp: 510, atk: 56, ap: 0, armor: 18, mr: 20, ms: 322, range: 350, as: 1.0, res: 260, resRegen: 5 },
    grow: { hp: 70, atk: 4.8, armor: 2.1, mr: 1.5, as: 0.03, res: 22 },
    passive: { id: 'marca', name: 'Marca do Vento', desc: 'Ataques marcam o alvo; a 3ª marca causa dano extra e dá +velocidade.' },
    skills: [
      { key: 'Q', name: 'Flecha Perfurante', kind: 'projectile', range: 620, speed: 900, width: 26, pierce: true, cd: 8, cost: 45, dmgType: 'phys', dmg: [60, 100, 150, 210], ratioAtk: 0.7,
        desc: 'Flecha que atravessa todos os inimigos na linha.' },
      { key: 'W', name: 'Rajada', kind: 'buff', self: true, cd: 15, cost: 50, dur: 4, asPct: [0.4, 0.5, 0.6, 0.7],
        desc: 'Velocidade de ataque altíssima por 4s.' },
      { key: 'E', name: 'Rolamento', kind: 'dash', dist: 200, cd: 10, cost: 40, nextCrit: true,
        desc: 'Rola na direção da mira; o próximo ataque é crítico.' },
      { key: 'R', name: 'Chuva de Flechas', kind: 'zone', at: 'target', range: 600, radius: 170, dur: 3, tick: 0.5, cd: 75, cost: 100, dmgType: 'phys', dmg: [40, 70], ratioAtk: 0.3, slow: 0.3,
        desc: 'Chove flechas numa área por 3s: dano contínuo e lentidão.' },
    ],
  }),
  H({
    id: 'ignis', name: 'Ignis', title: 'Chama Viva', cls: 'mage', res: 'mana',
    lore: 'Não é uma pessoa que controla fogo. É o fogo que decidiu ter forma.',
    color: 0xff8b3d, accent: 0xffd23e,
    base: { hp: 560, atk: 46, ap: 40, armor: 20, mr: 27, ms: 310, range: 330, as: 0.85, res: 380, resRegen: 9 },
    grow: { hp: 72, atk: 3, ap: 8, armor: 2, mr: 1.6, as: 0.012, res: 46 },
    passive: { id: 'brasa', name: 'Brasa Viva', desc: 'Inimigos queimando recebem 12% mais dano mágico.' },
    skills: [
      { key: 'Q', name: 'Bola de Fogo', kind: 'projectile', range: 560, speed: 700, width: 30, splash: 110, cd: 6, cost: 55, dmgType: 'magic', dmg: [100, 155, 220, 295], ratioAp: 0.75, burn: 3,
        desc: 'Bola que explode no primeiro inimigo e queima ao redor.' },
      { key: 'W', name: 'Anel de Fogo', kind: 'aoe', at: 'self', radius: 200, cd: 10, cost: 70, dmgType: 'magic', dmg: [110, 170, 240, 320], ratioAp: 0.65, burn: 3,
        desc: 'Explosão de chamas ao redor de si.' },
      { key: 'E', name: 'Passo Ígneo', kind: 'dash', dist: 240, blink: true, cd: 14, cost: 50, empowerNext: 1.5,
        desc: 'Teleporte curto; a próxima Bola de Fogo causa 50% mais dano.' },
      { key: 'R', name: 'Meteoro', kind: 'zone', at: 'target', range: 620, radius: 200, delay: 0.9, cd: 80, cost: 120, dmgType: 'magic', dmg: [300, 520], ratioAp: 1.0, stun: 0.8, burn: 4,
        desc: 'Um meteoro cai após 0,9s: dano enorme, atordoa e queima.' },
    ],
  }),
  H({
    id: 'vesper', name: 'Vesper', title: 'Sombra Ligeira', cls: 'assassin', res: 'energy',
    lore: 'Ninguém sabe seu rosto. Quem viu não contou.',
    color: 0x6b3fa0, accent: 0xd45de0,
    base: { hp: 585, atk: 68, ap: 0, armor: 24, mr: 22, ms: 342, range: 115, as: 1.0, res: 100, resRegen: 14 },
    grow: { hp: 82, atk: 5.8, armor: 2.4, mr: 1.6, as: 0.02, res: 0 },
    passive: { id: 'emboscada', name: 'Emboscada', desc: 'Ataques saindo da furtividade ou pelas costas são sempre críticos.' },
    skills: [
      { key: 'Q', name: 'Adaga Sombria', kind: 'projectile', range: 520, speed: 1000, width: 22, cd: 6, cost: 30, dmgType: 'phys', dmg: [90, 145, 210, 285], ratioAtk: 0.95, markBonus: 0.4,
        desc: 'Lança uma adaga. +40% de dano em alvos marcados.' },
      { key: 'W', name: 'Manto', kind: 'stealth', self: true, cd: 18, cost: 40, dur: 4, msPct: 0.25,
        desc: 'Fica invisível por 4s e mais rápida.' },
      { key: 'E', name: 'Salto Sombrio', kind: 'dash', toTarget: true, dist: 340, cd: 11, cost: 35, dmgType: 'phys', dmg: [60, 100, 150, 210], ratioAtk: 0.7, mark: true,
        desc: 'Salta até o inimigo, causa dano e o marca.' },
      { key: 'R', name: 'Execução', kind: 'strike', range: 300, dashTo: true, cd: 60, cost: 50, dmgType: 'phys', dmg: [240, 420], ratioAtk: 1.6, missingPct: 0.25, resetOnKill: true,
        desc: 'Avança e golpeia: +25% da vida perdida do alvo. Matar zera as recargas.' },
    ],
  }),
  H({
    id: 'sera', name: 'Sera', title: 'Voz da Aurora', cls: 'support', res: 'mana',
    lore: 'Canta para curar. Quando para de cantar, é porque acabou.',
    color: 0xffe58a, accent: 0xff8fc4,
    base: { hp: 560, atk: 58, ap: 32, armor: 22, mr: 32, ms: 320, range: 340, as: 0.85, res: 400, resRegen: 10 },
    grow: { hp: 72, atk: 3.4, ap: 5, armor: 2.2, mr: 2, as: 0.01, res: 50 },
    passive: { id: 'canto', name: 'Canto Suave', desc: 'Habilidades que atingem inimigos curam aliados próximos em 3% da vida.' },
    skills: [
      { key: 'Q', name: 'Luz Curativa', kind: 'heal', range: 500, cd: 7, cost: 60, amount: [130, 200, 280, 370], ratioAp: 0.7,
        desc: 'Cura o aliado mais ferido no alcance (ou você).' },
      { key: 'W', name: 'Escudo Radiante', kind: 'shield', range: 500, cd: 10, cost: 65, dur: 3.5, amount: [110, 170, 240, 320], ratioAp: 0.6, alsoSelf: true,
        desc: 'Escudo no aliado mais ameaçado e em você.' },
      { key: 'E', name: 'Aprisionar', kind: 'projectile', range: 560, speed: 800, width: 26, cd: 11, cost: 70, dmgType: 'magic', dmg: [75, 120, 175, 240], ratioAp: 0.6, root: 1.3,
        desc: 'Feixe que prende o primeiro inimigo por 1,3s.' },
      { key: 'R', name: 'Aurora', kind: 'aoe', at: 'self', radius: 320, allies: true, cd: 85, cost: 130, heal: [220, 380], ratioAp: 0.8, msPct: 0.2, dur: 5,
        desc: 'Cura todo aliado próximo e acelera o time por 5s.' },
    ],
  }),
];
export const HERO_BY_ID = Object.fromEntries(HEROES.map(h => [h.id, h]));
export const CLASS_NAME = { tank: 'Tanque', warrior: 'Guerreiro', ranger: 'Atirador', mage: 'Mago', assassin: 'Assassino', support: 'Suporte' };

// ---------------------------------------------------------------- itens
// Componentes + itens completos (receita = componentes + ouro).
const I = (o) => o;
export const ITEMS = [
  I({ id: 'sword',   name: 'Espada Curta',    cost: 350, stats: { atk: 15 } }),
  I({ id: 'gem',     name: 'Gema Crítica',    cost: 400, stats: { crit: 0.10 } }),
  I({ id: 'boots',   name: 'Botas',           cost: 300, stats: { msPct: 0.12 } }),
  I({ id: 'tome',    name: 'Tomo Arcano',     cost: 400, stats: { ap: 25 } }),
  I({ id: 'vest',    name: 'Colete de Placas', cost: 400, stats: { armor: 20 } }),
  I({ id: 'cloak',   name: 'Manto Etéreo',    cost: 400, stats: { mr: 20 } }),
  I({ id: 'ruby',    name: 'Rubi Vital',      cost: 400, stats: { hp: 180 } }),
  I({ id: 'crystal', name: 'Cristal de Mana', cost: 300, stats: { res: 150, resRegen: 4 } }),
  I({ id: 'dagger',  name: 'Adaga Rápida',    cost: 400, stats: { asPct: 0.15 } }),
  I({ id: 'assassinblade', name: 'Lâmina do Assassino', cost: 1450, from: ['sword', 'gem'], stats: { atk: 35, crit: 0.15, pen: 12 }, tag: 'Crítico · Penetração' }),
  I({ id: 'stormbow',      name: 'Arco Tempestade',     cost: 1600, from: ['dagger', 'gem'], stats: { asPct: 0.30, crit: 0.20, critDmg: 0.25 }, tag: 'Crítico · Vel. de ataque' }),
  I({ id: 'bloodaxe',      name: 'Machado Sanguinário', cost: 1450, from: ['sword', 'ruby'], stats: { atk: 30, hp: 200, lifesteal: 0.10 }, tag: 'Sustain' }),
  I({ id: 'arcanestaff',   name: 'Cajado Arcano',       cost: 1400, from: ['tome', 'crystal'], stats: { ap: 60, res: 200, cdr: 0.10 }, tag: 'Mago · Recarga' }),
  I({ id: 'emberorb',      name: 'Orbe Abrasador',      cost: 1400, from: ['tome', 'tome'], stats: { ap: 80, mpen: 15 }, tag: 'Explosão mágica' }),
  I({ id: 'titanaegis',    name: 'Égide do Titã',       cost: 1500, from: ['vest', 'ruby'], stats: { armor: 42, hp: 360, hpRegen: 10 }, tag: 'Tanque' }),
  I({ id: 'voidmantle',    name: 'Manto do Vazio',      cost: 1500, from: ['cloak', 'ruby'], stats: { mr: 42, hp: 300, cdr: 0.10 }, tag: 'Anti-mago' }),
  I({ id: 'auroraheart',   name: 'Coração de Aurora',   cost: 1300, from: ['crystal', 'ruby'], stats: { hp: 250, healPct: 0.15, cdr: 0.10, resRegen: 8 }, tag: 'Suporte' }),
  I({ id: 'swiftboots',    name: 'Botas Velozes',       cost: 700,  from: ['boots'], stats: { msPct: 0.22 }, tag: 'Mobilidade' }),
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));
export const MAX_ITEMS = 6;

// builds sugeridas (usadas pelos bots e pela dica de compra)
export const BUILDS = {
  brakka: ['vest', 'ruby', 'titanaegis', 'boots', 'cloak', 'voidmantle', 'swiftboots'],
  kael:   ['sword', 'ruby', 'bloodaxe', 'boots', 'vest', 'titanaegis', 'swiftboots'],
  lyra:   ['dagger', 'gem', 'stormbow', 'boots', 'sword', 'assassinblade', 'swiftboots'],
  ignis:  ['tome', 'crystal', 'arcanestaff', 'boots', 'tome', 'emberorb', 'swiftboots'],
  vesper: ['sword', 'gem', 'assassinblade', 'boots', 'sword', 'bloodaxe', 'swiftboots'],
  sera:   ['crystal', 'ruby', 'auroraheart', 'boots', 'tome', 'arcanestaff', 'swiftboots'],
};

// ---------------------------------------------------------------- bots
export const BOT_PROFILES = {
  easy:   { name: 'Fácil',   think: 0.6, aimErr: 90, retreatHp: 0.25, skillUse: 0.45, ultHp: 0.3, buys: 'components', chase: 0.4, objective: 0.2 },
  medium: { name: 'Médio',   think: 0.35, aimErr: 40, retreatHp: 0.35, skillUse: 0.8, ultHp: 0.5, buys: 'build', chase: 0.7, objective: 0.6 },
  hard:   { name: 'Difícil', think: 0.2, aimErr: 12, retreatHp: 0.4, skillUse: 1.0, ultHp: 0.6, buys: 'build', chase: 0.9, objective: 0.9 },
};
export const BOT_FILL_ORDER = ['lyra', 'vesper', 'kael', 'ignis', 'brakka', 'sera'];
export const BOT_NAMES = ['Zorak', 'Milla', 'Trok', 'Nyx', 'Oda', 'Bruno', 'Kira', 'Vael', 'Pip', 'Sable'];
