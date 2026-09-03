// Pomar Mágico — Batalha: controlador EM REDE (sala com 2 a 5 jogadores).
//
// Mesma interface de localController.js — a BattleScene não sabe se está
// local ou em rede. O HOST roda o único CompetitiveMatchManager (mesma
// classe, mesmo matchmaking, mesmo Ghost, mesmo dano) e é quem decide
// tudo; os clientes só jogam o PRÓPRIO tabuleiro e mandam o resultado
// final pro host — nunca decidem quem venceu. Ghosts e vidas seguem
// exatamente as mesmas regras testadas em manager.js.
import { CompetitiveMatchManager } from './manager.js';
import { simulateBotRound } from './botPlayer.js';
import { ROUND_BOARD, ROUND_MS, INTERMISSION_MS } from './config.js';

const M = { ROUND: 'ar:round', RESULT: 'ar:result', FINAL: 'ar:final', ATK: 'ar:atk', ATK_IN: 'ar:atkIn' };

// só aceita números finitos dentro de limites plausíveis — o host nunca
// confia cegamente no que o cliente diz que fez
function sanitizeStats(s) {
  if (!s || typeof s !== 'object') return { score: 0, bestCombo: 0, specialsUsed: 0, attacksSent: 0 };
  const num = (v, max) => (typeof v === 'number' && isFinite(v) && v >= 0 ? Math.min(v, max) : 0);
  return { score: num(s.score, 200000), bestCombo: num(s.bestCombo, 40), specialsUsed: num(s.specialsUsed, 200), attacksSent: num(s.attacksSent, 200) };
}

export function makeNetworkBattleCtl(ctx) {
  const { bus, players, mySlot, isHost, seed } = ctx;
  const myId = String(mySlot);
  const participants = players.map(p => ({ id: String(p.slot), name: p.name }));
  const mgr = isHost ? new CompetitiveMatchManager(participants, { seed, roundMs: ROUND_MS }) : null;
  let listeners = [];
  let phase = 'lobby';
  let myRound = null;                 // { round, roundMs, roundEndsAt, pairing:{a,b}, boardSeedMine, opp } — vindo do host
  let lastResults = [], ranking = [], champion = null, standings = null;
  let finalReported = false;
  const incoming = [];
  const pending = new Map();          // host: round -> { [id]: stats }

  const notify = () => listeners.slice().forEach(fn => fn());

  const unbind = bus.on((p, from) => {
    if (!p || typeof p.k !== 'string') return;
    if (p.k === M.ROUND && !isHost) { myRound = p.mine; phase = 'intro'; lastResults = []; finalReported = false; notify(); }
    else if (p.k === M.RESULT && !isHost) { lastResults = p.results; ranking = p.ranking; phase = 'result'; notify(); }
    else if (p.k === M.FINAL && !isHost) { champion = p.champion; standings = p.standings; phase = 'finished'; notify(); }
    else if (p.k === M.ATK_IN && !isHost) { incoming.push({ type: p.type, atMs: Date.now() }); }
    else if (isHost) {
      if (p.k === 'ar:stats') hostReceiveStats(from, p.round, sanitizeStats(p.stats));
      else if (p.k === M.ATK) hostRelayAttack(from, p.type);
    }
  });

  // ---------------------------------------------------------------- host
  function hostBroadcastRound(r) {
    for (const pl of players) {
      const pairing = r.pairings.find(pp => pp.a.id === String(pl.slot) || pp.b.id === String(pl.slot));
      if (!pairing) continue;   // não deveria acontecer (todo mundo ativo joga)
      const isA = pairing.a.id === String(pl.slot);
      const mine = isA ? pairing.boardSeedA : pairing.boardSeedB;
      const oppSide = isA ? pairing.b : pairing.a;
      const opp = oppSide.ghost ? { id: 'ghost:' + oppSide.sourceId, name: mgr.get(oppSide.sourceId).name, isGhost: true, hp: 100 } : { id: oppSide.id, name: mgr.get(oppSide.id).name, isGhost: false, hp: mgr.get(oppSide.id).hp };
      const payload = { round: r.round, roundMs: r.roundMs, roundEndsAt: Date.now() + r.roundMs, boardSeedMine: mine, opp };
      if (pl.slot === mySlot) { myRound = payload; }
      else bus.toSlot(pl.slot, { k: M.ROUND, mine: payload });
    }
    pending.set(r.round, {});
  }
  function hostReceiveStats(fromSlot, round, stats) {
    if (!mgr.currentPairings.length || round !== mgr.round) return;
    const bucket = pending.get(round) || {}; pending.set(round, bucket);
    bucket[String(fromSlot)] = stats;
    hostMaybeResolve();
  }
  function hostMaybeResolve() {
    const bucket = pending.get(mgr.round) || {};
    const needed = mgr.active().map(p => p.id);
    if (!needed.every(id => bucket[id])) return;
    const statsByPairing = mgr.currentPairings.map(p => {
      const s = {};
      if (!p.a.ghost) s[p.a.id] = bucket[p.a.id];
      if (!p.b.ghost) s[p.b.id] = bucket[p.b.id];
      return s;
    });
    const summary = mgr.resolveRound(statsByPairing);
    for (const pl of players) {
      const payload = { results: summary.results.map(r => ({ a: r.pairing.a.id, b: r.pairing.b.ghost ? null : r.pairing.b.id, result: r.result })), ranking: mgr.ranking().map(p => ({ id: p.id, name: p.name, hp: p.hp, eliminated: p.eliminated })) };
      if (pl.slot === mySlot) { lastResults = payload.results; ranking = payload.ranking; phase = 'result'; notify(); }
      else bus.toSlot(pl.slot, { k: M.RESULT, ...payload });
    }
    if (mgr.active().length <= 1) { const st = mgr.finishGame(); hostBroadcastFinish(st); return; }
    setTimeout(() => { const r = mgr.createRound(); if (r) { mgr.startRound(); hostBroadcastRound(r); } else hostBroadcastFinish(mgr.finishGame()); }, INTERMISSION_MS);
  }
  function hostBroadcastFinish(st) {
    for (const pl of players) { if (pl.slot === mySlot) { champion = mgr.champion; standings = st; phase = 'finished'; notify(); } else bus.toSlot(pl.slot, { k: M.FINAL, champion: mgr.champion, standings: st }); }
  }
  function hostRelayAttack(fromSlot, type) {
    const pairing = mgr.currentPairings.find(p => p.a.id === String(fromSlot) || p.b.id === String(fromSlot));
    if (!pairing) return;
    const isA = pairing.a.id === String(fromSlot);
    const oppSide = isA ? pairing.b : pairing.a;
    if (oppSide.ghost) return;
    const targetSlot = Number(oppSide.id);
    if (targetSlot === mySlot) incoming.push({ type, atMs: Date.now() });
    else bus.toSlot(targetSlot, { k: M.ATK_IN, type });
  }

  return {
    kind: 'network', myId, isHost, participants, roundMs: ROUND_MS,
    onUpdate(fn) { listeners.push(fn); return () => { listeners = listeners.filter(f => f !== fn); }; },
    beginRound() {
      if (!isHost) return;   // clientes só recebem via ROUND
      const r = mgr.createRound();
      if (!r) { hostBroadcastFinish(mgr.finishGame()); return; }
      mgr.startRound();
      hostBroadcastRound(r);
    },
    startLive() { /* o relógio já veio pronto no payload da rodada (roundEndsAt) */ },
    tick() { /* nada a fazer localmente: ataques chegam via bus, resultado é decidido pelo host */ },
    snapshot() {
      return {
        phase, round: myRound ? myRound.round : (mgr ? mgr.round : 0), roundMs: ROUND_MS,
        roundEndsAt: myRound ? myRound.roundEndsAt : 0,
        myHp: (ranking.find(p => p.id === myId) || { hp: 100 }).hp,
        myEliminated: !!(ranking.find(p => p.id === myId) || {}).eliminated,
        pairing: myRound ? { boardSeedMine: myRound.boardSeedMine, opp: myRound.opp } : null,
        ranking: ranking.length ? ranking : participants.map(p => ({ id: p.id, name: p.name, hp: 100, eliminated: false })),
        lastResults, champion, standings,
      };
    },
    reportFinal(stats) {
      if (finalReported) return; finalReported = true;
      if (isHost) hostReceiveStats(mySlot, mgr.round, sanitizeStats(stats));
      else bus.toHost({ k: 'ar:stats', round: myRound ? myRound.round : 0, stats });
    },
    sendAttack(type) {
      if (!myRound || myRound.opp.isGhost) return false;
      if (isHost) hostRelayAttack(mySlot, type); else bus.toHost({ k: M.ATK, type });
      return true;
    },
    incomingAttacks() { return incoming.splice(0, incoming.length); },
    simulateToEnd() {
      if (!isHost) return;
      let guard = 0;
      while (mgr.active().length > 1 && guard++ < 200) {
        const r = mgr.createRound(); if (!r) break;
        mgr.startRound();
        const statsByPairing = r.pairings.map((p, i) => {
          const s = {};
          for (const side of [p.a, p.b]) { if (side.ghost) continue; s[side.id] = simulateBotRound(ROUND_BOARD, r.seed + i * 131, ROUND_MS, 'medium'); }
          return s;
        });
        mgr.resolveRound(statsByPairing);
      }
      hostBroadcastFinish(mgr.finishGame());
    },
    destroy() { unbind(); },
  };
}
