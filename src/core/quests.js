// Missões e conquistas da plataforma.
//
// Tudo gira em torno de MÉTRICAS: no fim de cada partida o app.js entrega um
// evento normalizado, e cada missão/conquista declara qual métrica observa,
// a meta e se soma (`sum`) ou guarda o melhor de uma partida só (`best`).
// Adicionar uma missão nova é acrescentar uma linha — nada de código.
//
// As diárias são sorteadas pela DATA (mulberry32 com a data como seed), então
// o conjunto do dia é estável entre recarregamentos e some à meia-noite local.
import { mulberry32 } from './rng.js';
import { addCoins } from './storage.js';

const KEY = 'ct-quests-v1';

// ------------------------------------------------------------------
// métricas: como extrair um número do evento de fim de partida
// ------------------------------------------------------------------
// ev = { gameId, won, score, coins, players, solo, metrics: {...} }
const g = (ev, id, key) => (ev.gameId === id ? (ev.metrics?.[key] || 0) : 0);

export const METRICS = {
  matches:      () => 1,
  wins:         (ev) => (ev.won ? 1 : 0),
  coins:        (ev) => ev.coins || 0,
  score:        (ev) => ev.score || 0,
  multiMatches: (ev) => (ev.solo ? 0 : 1),
  multiWins:    (ev) => (!ev.solo && ev.won ? 1 : 0),
  fullRoom:     (ev) => (ev.players >= 4 ? 1 : 0),

  runnerMatches: (ev) => (ev.gameId === 'runner' ? 1 : 0),
  runnerDist:    (ev) => g(ev, 'runner', 'dist'),
  runnerKmh:     (ev) => g(ev, 'runner', 'kmh'),
  runnerCoins:   (ev) => g(ev, 'runner', 'coins'),

  flappyMatches: (ev) => (ev.gameId === 'flappy' ? 1 : 0),
  flappyPipes:   (ev) => g(ev, 'flappy', 'pipes'),

  bombMatches:   (ev) => (ev.gameId === 'bomb' ? 1 : 0),
  bombKills:     (ev) => g(ev, 'bomb', 'kills'),
  bombCrates:    (ev) => g(ev, 'bomb', 'crates'),

  tagMatches:    (ev) => (ev.gameId === 'tag' ? 1 : 0),
  tagCaptures:   (ev) => g(ev, 'tag', 'captures'),
  tagFlee:       (ev) => g(ev, 'tag', 'fleeTime'),

  guessMatches:  (ev) => (ev.gameId === 'guess' ? 1 : 0),
  guessCorrect:  (ev) => g(ev, 'guess', 'correct'),

  tdWave:        (ev) => g(ev, 'td', 'wave'),
  tdKills:       (ev) => g(ev, 'td', 'kills'),
  tdBosses:      (ev) => g(ev, 'td', 'bosses'),

  islandGather:  (ev) => g(ev, 'island', 'gathered'),
  islandBuilt:   (ev) => g(ev, 'island', 'built'),

  battleRound:   (ev) => g(ev, 'battle', 'round'),
  battleWon:     (ev) => g(ev, 'battle', 'won'),
  battleThree:   (ev) => g(ev, 'battle', 'threeStars'),
  battleBoss:    (ev) => g(ev, 'battle', 'boss'),
  battlePvpWon:  (ev) => g(ev, 'battle', 'pvpWon'),
};

// ------------------------------------------------------------------
// catálogo
// ------------------------------------------------------------------
// mode: 'sum' acumula entre partidas; 'best' guarda o melhor de UMA partida.
const D = (id, emoji, text, metric, goal, reward, mode = 'sum') =>
  ({ id, emoji, text, metric, goal, reward, mode });

// Sorteadas 3 por dia. Metas pequenas: dá para fechar numa sessão curta.
export const DAILY_POOL = [
  D('d_play3',    '🎮', 'Jogue 3 partidas',                'matches',      3,  60),
  D('d_win1',     '🏆', 'Vença 1 partida',                 'wins',         1,  80),
  D('d_coins80',  '🪙', 'Junte 80 moedas numa sessão',     'coins',        80, 60),
  D('d_multi2',   '👥', 'Jogue 2 partidas com amigos',     'multiMatches', 2, 100),
  D('d_run2k',    '🏃', 'Corra 2.000 m numa corrida',      'runnerDist',   2000, 90, 'best'),
  D('d_run500',   '⚡', 'Chegue a 500 km/h na corrida',    'runnerKmh',    500, 90, 'best'),
  D('d_flap20',   '🐦', 'Passe 20 canos numa rodada',      'flappyPipes',  20, 90, 'best'),
  D('d_flap50',   '🪶', 'Passe 50 canos no total',         'flappyPipes',  50, 70),
  D('d_bomb10',   '📦', 'Destrua 10 caixotes',             'bombCrates',   10, 70),
  D('d_bombkill', '💣', 'Elimine 2 jogadores no Bomb',     'bombKills',    2, 100),
  D('d_tag3',     '👹', 'Faça 3 capturas no Pega-Pega',    'tagCaptures',  3,  90),
  D('d_tagflee',  '🏃', 'Fuja por 60 segundos',            'tagFlee',      60, 70),
  D('d_guess2',   '🎯', 'Acerte 2 palavras no Adivinhe',   'guessCorrect', 2,  90),
  D('d_score1k',  '⭐', 'Faça 1.000 pontos numa partida',  'score',        1000, 80, 'best'),
  D('d_td8',      '🏰', 'Chegue à onda 8 no Torre & Cerco', 'tdWave',      8,   90, 'best'),
  D('d_bt5',      '⚔️', 'Chegue à rodada 5 no Battle Tactics', 'battleRound', 5, 90, 'best'),
  D('d_td60',     '⚔️', 'Derrote 60 inimigos defendendo',   'tdKills',     60,  70),
  D('d_isl40',    '🏝️', 'Colete 40 recursos na ilha',       'islandGather', 40, 80),
];

// Permanentes, de longo prazo. Ficam sempre visíveis.
export const GENERAL = [
  D('g_play25',   '🎮', 'Jogue 25 partidas',               'matches',      25, 200),
  D('g_play100',  '🎖️', 'Jogue 100 partidas',              'matches',     100, 500),
  D('g_win10',    '🏆', 'Vença 10 partidas',               'wins',         10, 300),
  D('g_win50',    '👑', 'Vença 50 partidas',               'wins',         50, 800),
  D('g_multi20',  '👥', 'Jogue 20 partidas com amigos',    'multiMatches', 20, 400),
  D('g_coins2k',  '🪙', 'Acumule 2.000 moedas',            'coins',      2000, 400),
  D('g_run20k',   '🏃', 'Corra 20.000 m no total',         'runnerDist', 20000, 350),
  D('g_flap300',  '🐦', 'Passe 300 canos no total',        'flappyPipes', 300, 350),
  D('g_bomb100',  '📦', 'Destrua 100 caixotes',            'bombCrates',  100, 350),
  D('g_tag30',    '👹', 'Faça 30 capturas',                'tagCaptures',  30, 350),
  D('g_guess20',  '🎯', 'Acerte 20 palavras',              'guessCorrect', 20, 400),
];

// Conquistas: marcos permanentes, com recompensa maior e sem "resgatar"
// (entram sozinhas quando batem a meta).
const A = (id, emoji, name, desc, metric, goal, reward, mode = 'sum') =>
  ({ id, emoji, name, desc, metric, goal, reward, mode });

export const ACHIEVEMENTS = [
  A('a_first',    '🌟', 'Primeira partida',   'Jogue sua primeira partida',        'matches',      1,   50),
  A('a_win1',     '🥇', 'Primeira vitória',   'Vença uma partida',                 'wins',         1,  100),
  A('a_allgames', '🎲', 'Conhece a casa',     'Jogue todos os jogos da Central',   '__allGames',   1,  400),
  A('a_run5k',    '🚀', 'Maratonista',        'Corra 5.000 m numa única corrida',  'runnerDist', 5000, 300, 'best'),
  A('a_run1000',  '💨', 'Barreira do som',    'Chegue a 1.000 km/h na corrida',    'runnerKmh',  1000, 400, 'best'),
  A('a_flap50',   '🕊️', 'Voo firme',          'Passe 50 canos numa única rodada',  'flappyPipes',  50, 350, 'best'),
  A('a_bomb5',    '💥', 'Estopim curto',      'Elimine 5 jogadores no Bomb Arena', 'bombKills',     5, 300),
  A('a_tag20',    '😈', 'Mão rápida',         'Faça 20 capturas no Pega-Pega',     'tagCaptures',  20, 300),
  A('a_guess10',  '🧠', 'Vocabulário afiado', 'Acerte 10 palavras no Adivinhe',    'guessCorrect', 10, 300),
  A('a_td15',     '🏰', 'Muralha viva',       'Chegue à onda 15 no Torre & Cerco', 'tdWave',       15, 350, 'best'),
  A('a_tdboss',   '👑', 'Caçador de golens',  'Derrote 3 chefes defendendo',       'tdBosses',      3, 300),
  A('a_isl500',   '🪓', 'Lenhador',           'Colete 500 recursos na ilha',       'islandGather', 500, 400),
  A('a_islbase',  '🏠', 'Lar, doce lar',      'Construa as 3 estruturas da ilha',  'islandBuilt',    3, 350, 'best'),
  A('a_bt3star',  '⭐', 'Lendária',           'Crie uma unidade ★★★ no Battle Tactics', 'battleThree', 1, 300, 'best'),
  A('a_btboss',   '👑', 'Quebra-pedra',       'Derrote o Ancião de Pedra',         'battleBoss',     1, 400, 'best'),
  A('a_btwins',   '⚔️', 'General',            'Vença 3 corridas do Battle Tactics', 'battleWon',      3, 500),
  A('a_btpvp',    '🤺', 'Duelista',           'Vença um amigo no Battle Tactics',  'battlePvpWon',   1, 350),
  A('a_streak3',  '🔥', 'Três dias',          'Jogue em 3 dias diferentes',        '__streak',      3, 250),
  A('a_streak7',  '📅', 'Semana cheia',       'Jogue em 7 dias diferentes',        '__streak',      7, 600),
  A('a_full4',    '🎉', 'Sala cheia',         'Jogue numa sala com 4 jogadores',   'fullRoom',      1, 300),
];

// ------------------------------------------------------------------
// persistência
// ------------------------------------------------------------------
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const EMPTY = () => ({
  daily: { date: '', ids: [], prog: {}, claimed: {} },
  general: { prog: {}, claimed: {} },
  ach: { prog: {}, done: {} },
  gamesPlayed: {},     // gameId -> true (para a conquista "jogou todos")
  days: [],            // datas distintas jogadas (para as conquistas de sequência)
});

let cache = null;

function read() {
  if (cache) return cache;
  cache = EMPTY();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(cache, JSON.parse(raw));
  } catch (_) { /* storage bloqueado: fica em memória */ }
  rollDaily();
  return cache;
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (_) {}
}

// Troca o conjunto de diárias quando vira o dia.
function rollDaily() {
  const today = todayKey();
  if (cache.daily.date === today && cache.daily.ids.length) return;
  // seed determinística a partir da data: o mesmo dia gera o mesmo trio
  const seed = [...today].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = mulberry32(seed);
  const pool = [...DAILY_POOL];
  const ids = [];
  while (ids.length < 3 && pool.length) {
    ids.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0].id);
  }
  cache.daily = { date: today, ids, prog: {}, claimed: {} };
  write();
}

// ------------------------------------------------------------------
// registro de partida
// ------------------------------------------------------------------
function bump(bucket, def, value) {
  if (!value) return;
  const cur = bucket[def.id] || 0;
  bucket[def.id] = def.mode === 'best' ? Math.max(cur, value) : cur + value;
}

// Chamado no fim de cada partida. Devolve o que ficou pronto agora, para o
// app mostrar na tela de resultado.
export function recordMatch(ev) {
  const s = read();
  rollDaily();

  // marcos que não vêm de métrica direta
  s.gamesPlayed[ev.gameId] = true;
  const today = todayKey();
  if (!s.days.includes(today)) s.days.push(today);

  const valueOf = (def) => {
    if (def.metric === '__allGames') return 0;   // avaliado abaixo
    if (def.metric === '__streak') return 0;
    const fn = METRICS[def.metric];
    return fn ? fn(ev) : 0;
  };

  for (const id of s.daily.ids) {
    const def = DAILY_POOL.find(d => d.id === id);
    if (def) bump(s.daily.prog, def, valueOf(def));
  }
  for (const def of GENERAL) bump(s.general.prog, def, valueOf(def));

  const unlocked = [];
  for (const def of ACHIEVEMENTS) {
    if (s.ach.done[def.id]) continue;
    if (def.metric === '__allGames') {
      // conta os jogos distintos já jogados contra o registro da Central
      s.ach.prog[def.id] = Object.keys(s.gamesPlayed).length >= ev.totalGames ? 1 : 0;
    } else if (def.metric === '__streak') {
      s.ach.prog[def.id] = s.days.length;
    } else {
      bump(s.ach.prog, def, valueOf(def));
    }
    if ((s.ach.prog[def.id] || 0) >= def.goal) {
      s.ach.done[def.id] = Date.now();
      addCoins(def.reward);
      unlocked.push(def);
    }
  }

  // missões prontas para resgate (o resgate em si é manual, na tela)
  const ready = [
    ...s.daily.ids.map(id => DAILY_POOL.find(d => d.id === id))
      .filter(d => d && !s.daily.claimed[d.id] && (s.daily.prog[d.id] || 0) >= d.goal),
    ...GENERAL.filter(d => !s.general.claimed[d.id] && (s.general.prog[d.id] || 0) >= d.goal),
  ];

  write();
  return { unlocked, ready };
}

// ------------------------------------------------------------------
// leitura para a UI
// ------------------------------------------------------------------
export function getQuests() {
  const s = read();
  const row = (def, prog, claimed) => ({
    ...def,
    progress: Math.min(prog[def.id] || 0, def.goal),
    done: (prog[def.id] || 0) >= def.goal,
    claimed: !!claimed[def.id],
  });
  return {
    daily: s.daily.ids.map(id => DAILY_POOL.find(d => d.id === id))
      .filter(Boolean).map(d => row(d, s.daily.prog, s.daily.claimed)),
    general: GENERAL.map(d => row(d, s.general.prog, s.general.claimed)),
    achievements: ACHIEVEMENTS.map(a => ({
      ...a,
      progress: Math.min(s.ach.prog[a.id] || 0, a.goal),
      done: !!s.ach.done[a.id],
    })),
    daysPlayed: s.days.length,
  };
}

// Quantas recompensas estão esperando resgate (para o selo na Central).
export function pendingCount() {
  const q = getQuests();
  return [...q.daily, ...q.general].filter(m => m.done && !m.claimed).length;
}

export function claim(id) {
  const s = read();
  const daily = DAILY_POOL.find(d => d.id === id);
  const gen = GENERAL.find(d => d.id === id);
  const def = daily || gen;
  if (!def) return 0;
  const bucket = daily ? s.daily : s.general;
  if (bucket.claimed[id] || (bucket.prog[id] || 0) < def.goal) return 0;
  bucket.claimed[id] = true;
  addCoins(def.reward);
  write();
  return def.reward;
}

export function resetQuests() {
  cache = EMPTY();
  rollDaily();
  write();
}
