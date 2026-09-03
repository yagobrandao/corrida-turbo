// Pomar Mágico — Batalha: MatchmakingRoundManager (puro).
//
// Toda rodada, todo jogador ATIVO joga uma partida real: contra outro
// jogador ativo, ou — quando a quantidade é ímpar — contra o Ghost de um
// jogador ativo (nunca contra o próprio Ghost). Ninguém fica de fora.
//
// O pareamento é uma combinação perfeita de custo mínimo, não um shuffle:
// cada par possível de participantes tem um custo (quanto maior, menos
// desejável); o algoritmo escolhe o conjunto de pares com o menor custo
// total. Prioridades, da mais forte pra mais fraca:
//   1. evitar adversário repetido (peso alto por vez que já se enfrentaram,
//      peso extra se foi o adversário da rodada IMEDIATAMENTE anterior)
//   2. distribuir quem empresta o Ghost igualmente (na escolha da fonte,
//      não no custo do par — é uma decisão separada, ver pickGhostSource)
//   3. variar quem enfrenta o Ghost (peso leve)
//   4. equilibrar HP entre os dois lados (peso mínimo, só desempate)
import { mulberry32 } from '../../../core/rng.js';

const W_REPEAT = 100;
const W_CONSEC = 300;
const W_VS_GHOST = 15;
const W_HP_BALANCE = 1;

export function emptyHistory() {
  return { opponents: {}, lastOpponent: null, ghostRounds: 0, timesVsGhost: 0, wasGhostSourceLastRound: false };
}

// quem empresta o Ghost nesta rodada (só quando a quantidade ativa é ímpar).
// Prioridade: menos vezes já emprestou > não foi quem emprestou na rodada
// passada > sorteio determinístico (seed) só pra desempatar de vez.
export function pickGhostSource(active, history, rnd) {
  const cands = active.map(p => ({ p, h: history[p.id] || emptyHistory() }));
  cands.sort((x, y) => {
    if (x.h.ghostRounds !== y.h.ghostRounds) return x.h.ghostRounds - y.h.ghostRounds;
    if (x.h.wasGhostSourceLastRound !== y.h.wasGhostSourceLastRound) return x.h.wasGhostSourceLastRound ? 1 : -1;
    return rnd() - 0.5;
  });
  return cands[0].p;
}

function pairCost(a, b, history, avgHp) {
  // proibido: um jogador nunca enfrenta o próprio Ghost
  if ((a.ghostSourceId && a.ghostSourceId === b.id) || (b.ghostSourceId && b.ghostSourceId === a.id)) return Infinity;
  if (!a.isGhost && !b.isGhost) {
    const ha = history[a.id] || emptyHistory();
    const times = ha.opponents[b.id] || 0;
    let cost = times * W_REPEAT;
    if (ha.lastOpponent === b.id) cost += W_CONSEC;
    cost += W_HP_BALANCE * Math.abs((a.hp ?? avgHp) - (b.hp ?? avgHp));
    return cost;
  }
  // um dos dois é o nó-fantasma: custo é sobre o lado real (variar quem pega ghost)
  const real = a.isGhost ? b : a;
  const hr = history[real.id] || emptyHistory();
  return hr.timesVsGhost * W_VS_GHOST;
}

// combinação perfeita de custo mínimo por busca exaustiva. Só há poucos nós
// (até 6 numa sala de 5 + 1 ghost), então força bruta é instantânea e exata
// — nada de "escolher o primeiro que serve".
function minCostMatching(nodes, cost) {
  if (!nodes.length) return { pairs: [], total: 0 };
  const [first, ...rest] = nodes;
  let best = null;
  for (let i = 0; i < rest.length; i++) {
    const partner = rest[i];
    const c = cost(first, partner);
    const remaining = rest.filter((_, j) => j !== i);
    const sub = minCostMatching(remaining, cost);
    const total = c + sub.total;
    if (!best || total < best.total) best = { pairs: [[first, partner], ...sub.pairs], total };
  }
  return best;
}

// active: [{ id, hp }]. history: { [id]: entrada de emptyHistory() }.
// devolve { pairings: [{ a:{id}, b:{id} | {ghost:true, sourceId} }], ghostSourceId }
export function generatePairings(active, history, seed) {
  if (active.length < 2) return { pairings: [], ghostSourceId: null };
  const rnd = mulberry32((seed >>> 0) || 1);
  const avgHp = active.reduce((s, p) => s + p.hp, 0) / active.length;
  let ghostSourceId = null;
  const nodes = active.map(p => ({ id: p.id, hp: p.hp, isGhost: false, ghostSourceId: p.id }));
  if (active.length % 2 === 1) {
    ghostSourceId = pickGhostSource(active, history, rnd).id;
    nodes.push({ id: 'ghost:' + ghostSourceId, isGhost: true, ghostSourceId, ghostSourceOf: ghostSourceId });
  }
  const { pairs } = minCostMatching(nodes, (a, b) => pairCost(a, b, history, avgHp));
  const pairings = pairs.map(([x, y]) => {
    const ghostNode = x.isGhost ? x : (y.isGhost ? y : null);
    if (ghostNode) { const real = ghostNode === x ? y : x; return { a: { id: real.id }, b: { ghost: true, sourceId: ghostNode.ghostSourceOf } }; }
    return { a: { id: x.id }, b: { id: y.id } };
  });
  return { pairings, ghostSourceId };
}

// atualiza os contadores DEPOIS que o pareamento da rodada foi decidido
// (chame uma vez por rodada, antes de calcular resultados)
export function markGhostRotation(history, active, ghostSourceId) {
  for (const p of active) { const h = history[p.id] = history[p.id] || emptyHistory(); h.wasGhostSourceLastRound = p.id === ghostSourceId; }
  if (ghostSourceId) history[ghostSourceId].ghostRounds++;
}
export function recordPairing(history, pairing) {
  const a = pairing.a, b = pairing.b;
  history[a.id] = history[a.id] || emptyHistory();
  if (b.ghost) {
    history[a.id].timesVsGhost++;
    history[a.id].lastOpponent = 'ghost:' + b.sourceId;
  } else {
    history[b.id] = history[b.id] || emptyHistory();
    history[a.id].opponents[b.id] = (history[a.id].opponents[b.id] || 0) + 1;
    history[b.id].opponents[a.id] = (history[b.id].opponents[a.id] || 0) + 1;
    history[a.id].lastOpponent = b.id;
    history[b.id].lastOpponent = a.id;
  }
}
