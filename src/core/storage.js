// Progresso persistente no localStorage.
// Tudo é opcional: se o navegador bloquear o storage (modo privado do Safari,
// por exemplo), o jogo continua funcionando com os valores padrão em memória.
const KEY = 'ct-progress-v1';

const DEFAULTS = {
  coins: 0,          // moedas acumuladas em todas as partidas (moeda de compra)
  totalCoins: 0,     // total histórico, nunca diminui — destrava as skins
  bestDist: 0,
  bestScore: 0,
  bestSpeed: 0,
  races: 0,
  wins: 0,
  skin: 'azul',
  name: '',          // apelido; vazio = usa "Jogador N" do slot
  diff: 'normal',    // última dificuldade escolhida, reaproveitada na próxima sala
  howto: {},         // por jogo: já viu as instruções?
  upgrades: {},      // power-up id -> nível (1 a 5); ausente = nível 1
};

let cache = null;

function read() {
  if (cache) return cache;
  cache = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(cache, JSON.parse(raw));
  } catch (_) {
    // storage indisponível: segue com os padrões
  }
  return cache;
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch (_) {
    // cota estourada ou storage bloqueado: ignora, o jogo não depende disso
  }
}

export function getProgress() {
  return { ...read() };
}

export function setSkin(id) {
  read().skin = id;
  write();
}

// Apelido: no máximo 12 caracteres visíveis, sem quebras nem espaços duplos.
export function sanitizeName(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 12);
}

export function setName(raw) {
  read().name = sanitizeName(raw);
  write();
}

export function setDifficulty(id) {
  read().diff = id;
  write();
}

export function markHowToSeen(gameId) {
  const p = read();
  if (!p.howto || typeof p.howto !== 'object') p.howto = {};
  p.howto[gameId] = true;
  write();
}
export function hasSeenHowTo(gameId) {
  const h = read().howto;
  return !!(h && h[gameId]);
}

// Nível de um power-up (1 = base).
export function upgradeLevel(id) {
  const u = read().upgrades;
  return (u && u[id]) || 1;
}
export function setUpgradeLevel(id, level) {
  const p = read();
  if (!p.upgrades || typeof p.upgrades !== 'object') p.upgrades = {};
  p.upgrades[id] = level;
  write();
}

// Recompensa de missão/conquista: entra nas moedas gastáveis e no total
// histórico (que é o que destrava skins e melhorias).
export function addCoins(n) {
  const p = read();
  p.coins += n;
  p.totalCoins += n;
  write();
}

export function spendCoins(n) {
  const p = read();
  if (p.coins < n) return false;
  p.coins -= n;
  write();
  return true;
}

// Registra o resultado de uma corrida e devolve o que foi recorde,
// para a tela de resultado poder comemorar.
export function recordRace({ dist, score, coins, speed, won }) {
  const p = read();
  const records = {
    dist: dist > p.bestDist,
    score: score > p.bestScore,
    speed: speed > p.bestSpeed,
  };
  p.races++;
  if (won) p.wins++;
  p.coins += coins;
  p.totalCoins += coins;
  if (records.dist) p.bestDist = dist;
  if (records.score) p.bestScore = score;
  if (records.speed) p.bestSpeed = speed;
  write();
  return records;
}

export function resetProgress() {
  cache = { ...DEFAULTS };
  write();
}
