// Power-ups da corrida.
//
// Os itens nascem na pista de forma DETERMINÍSTICA (mesma seed = mesmos itens
// nos mesmos lugares para todos), mas o efeito é de quem pegar. Efeitos que
// atingem rivais (tiro, nevasca) viajam pela rede como um evento pequeno.
//
// `base` é a duração em segundos (ou potência, nos instantâneos).
// Cada nível de melhoria soma `perLevel`; o nível máximo é 5.
export const POWERUPS = [
  { id: 'turbo',   emoji: '⚡', name: 'Turbo',          kind: 'timed',   base: 4,  perLevel: 0.8,
    desc: 'Acelera muito e rende pontos em dobro por metro.' },
  { id: 'escudo',  emoji: '🛡️', name: 'Escudo',         kind: 'timed',   base: 6,  perLevel: 1.2,
    desc: 'A próxima batida não tira vida.' },
  { id: 'ima',     emoji: '🧲', name: 'Ímã',            kind: 'timed',   base: 6,  perLevel: 1.2,
    desc: 'Puxa as moedas das três faixas.' },
  { id: 'x2',      emoji: '✖️', name: 'Pontos x2',      kind: 'timed',   base: 8,  perLevel: 1.5,
    desc: 'Tudo vale o dobro de pontos.' },
  { id: 'fantasma',emoji: '👻', name: 'Fantasma',       kind: 'timed',   base: 3,  perLevel: 0.6,
    desc: 'Atravessa obstáculos sem bater.' },
  { id: 'tiro',    emoji: '🎯', name: 'Tiro Certeiro',  kind: 'timed',   base: 4,  perLevel: 0.8,
    desc: 'Deixa o rival mais à frente lento.' },
  { id: 'nevasca', emoji: '🧊', name: 'Nevasca',        kind: 'timed',   base: 3,  perLevel: 0.6,
    desc: 'Deixa TODOS os rivais lentos.' },
  { id: 'freio',   emoji: '🐌', name: 'Freio de Mão',   kind: 'timed',   base: 4,  perLevel: 0.8,
    desc: 'Reduz sua velocidade para atravessar trechos difíceis.' },
  { id: 'chuva',   emoji: '🪙', name: 'Chuva de Ouro',  kind: 'instant', base: 8,  perLevel: 3,
    desc: 'Ganha moedas na hora.' },
  { id: 'vida',    emoji: '❤️', name: 'Coração',        kind: 'instant', base: 1,  perLevel: 0,
    desc: 'Recupera uma vida.' },
];

export const MAX_LEVEL = 5;

// Custo em moedas para subir do nível n para n+1.
export function upgradeCost(level) {
  return [40, 90, 180, 320][level - 1] || 0;
}

export function getPowerup(id) {
  return POWERUPS.find(p => p.id === id);
}

// Valor efetivo (duração ou potência) no nível do jogador.
export function effectiveValue(pu, level) {
  return pu.base + pu.perLevel * (Math.max(1, Math.min(MAX_LEVEL, level)) - 1);
}

// Sorteio determinístico de um power-up (usado pelo track com a rng da seed).
// 'vida' é mais rara de propósito.
const WEIGHTS = POWERUPS.map(p => (p.id === 'vida' ? 0.5 : 1));
const TOTAL_W = WEIGHTS.reduce((a, b) => a + b, 0);
export function rollPowerup(rng) {
  let x = rng.next() * TOTAL_W;
  for (let i = 0; i < POWERUPS.length; i++) {
    x -= WEIGHTS[i];
    if (x <= 0) return POWERUPS[i].id;
  }
  return POWERUPS[0].id;
}
