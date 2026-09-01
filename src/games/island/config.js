// Constantes da Ilha Survival.
export const WORLD = 1360;          // mundo quadrado (px); a câmera segue o jogador
export const ISLE_RX = 560;         // raios da ilha (elipse)
export const ISLE_RY = 480;
export const SAND = 70;             // faixa de areia além da grama

export const PLAYER_SPEED = 150;

// Recursos espalhados pela seed FIXA — a ilha é a mesma para sempre.
export const ISLAND_SEED = 771260;

// tipo: { carga (batidas), respawn (s), tool (ferramenta exigida), xp }
export const RESOURCES = {
  tree:  { name: 'Árvore',  item: 'wood',  charge: 4, respawn: 100, tool: 'axe',  xp: 2, count: 26 },
  rock:  { name: 'Rocha',   item: 'stone', charge: 4, respawn: 130, tool: 'pick', xp: 2, count: 18 },
  bush:  { name: 'Arbusto', item: 'fiber', charge: 2, respawn: 70,  tool: null,   xp: 1, count: 16 },
  fruit: { name: 'Fruteira', item: 'fruit', charge: 3, respawn: 90, tool: null,   xp: 1, count: 10 },
};

export const ITEMS = {
  wood:  { name: 'Madeira' },
  stone: { name: 'Pedra' },
  fiber: { name: 'Fibra' },
  fruit: { name: 'Fruta' },
};

// Ferramentas: nível → recursos por batida. Melhoradas na bancada.
export const TOOLS = {
  axe:  { name: 'Machado',  upCost: [null, { wood: 12, stone: 6 }, { wood: 30, stone: 16, fiber: 10 }], max: 3 },
  pick: { name: 'Picareta', upCost: [null, { wood: 10, stone: 8 }, { wood: 24, stone: 20, fiber: 10 }], max: 3 },
};
export const toolYield = (lv) => lv;   // lv 1 = 1 por batida, lv 2 = 2...

// Construções: locais fixos perto do acampamento. `unlock` = nível da ilha.
export const BUILDINGS = [
  { id: 'campfire', name: 'Fogueira', unlock: 1, cost: { wood: 8, stone: 4 },             xp: 25, desc: 'Ilumina a noite' },
  { id: 'shelter',  name: 'Abrigo',   unlock: 2, cost: { wood: 30, stone: 10, fiber: 15 }, xp: 40, desc: 'Durma para pular a noite' },
  { id: 'bench',    name: 'Bancada',  unlock: 3, cost: { wood: 30, stone: 20, fiber: 10 }, xp: 40, desc: 'Melhora suas ferramentas' },
];

// XP e níveis da ilha (progressão própria do jogo).
export const XP_LEVELS = [0, 40, 110, 220, 380, 600, 900, 1300, 1800, 2500];
export function islandLevel(xp) {
  let lv = 1;
  for (let i = 1; i < XP_LEVELS.length; i++) if (xp >= XP_LEVELS[i]) lv = i + 1;
  const cur = XP_LEVELS[lv - 1] ?? 0;
  const next = XP_LEVELS[lv] ?? (cur + 1000);
  return { lv, cur, next, pct: Math.min(100, Math.round(((xp - cur) / (next - cur)) * 100)) };
}

export const XP_SLEEP = 10;
export const XP_TOOL = 15;

// Ciclo dia/noite (segundos por ciclo completo).
export const DAY_LENGTH = 200;
// fases: [início do ciclo em fração, alpha do escurecimento]
export const NIGHT_ALPHA = 0.55;

// Conversão de sessão → moedas da plataforma (por XP ganho na sessão).
export const coinsForSession = (xpGained) => Math.round(xpGained / 4);
