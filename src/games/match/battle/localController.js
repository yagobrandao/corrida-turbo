// Pomar Mágico — Batalha: controlador LOCAL (modo VS BOT).
//
// Tudo roda no próprio cliente, sem rede: o humano joga o próprio
// tabuleiro na cena; os bots são simulados aqui (BotSession), avançando
// em tempo real junto com o relógio da rodada. A cena nunca fala
// diretamente com CompetitiveMatchManager — só com este `ctl`, que é a
// mesma interface do controlador em rede (networkController.js), então
// BattleScene funciona igual nos dois modos.
import { CompetitiveMatchManager } from './manager.js';
import { BotSession, simulateBotRound } from './botPlayer.js';
import { ROUND_BOARD, ROUND_MS } from './config.js';

export function makeLocalBattleCtl({ humanId = 'you', humanName = 'Você', bots }, seed = Date.now() >>> 0) {
  const participants = [{ id: humanId, name: humanName, isBot: false }, ...bots.map(b => ({ id: b.id, name: b.name, isBot: true, difficulty: b.difficulty }))];
  const mgr = new CompetitiveMatchManager(participants, { seed, roundMs: ROUND_MS });
  const botSessions = new Map();       // id -> BotSession, só durante a rodada em que o bot participa
  const targets = new Map();           // id -> id que ele enfrenta nesta rodada (null = ghost)
  let listeners = [];
  let myPairingIndex = -1;
  let phase = 'lobby';                 // lobby | intro | live | result | eliminated | finished
  let roundEndsAt = 0;
  let finalReported = false;
  const incoming = [];

  const notify = () => listeners.slice().forEach(fn => fn());
  const findPairingOf = (id) => mgr.currentPairings.find(p => p.a.id === id || (p.b.id && p.b.id === id));

  function beginRound() {
    if (!mgr.active().some(p => p.id === humanId)) { phase = 'eliminated'; notify(); return; }
    const r = mgr.createRound();
    if (!r) { phase = 'finished'; notify(); return; }
    mgr.startRound();
    botSessions.clear(); targets.clear();
    r.pairings.forEach((p, i) => {
      const seedA = r.seed + i * 131, seedB = r.seed + i * 131 + 1;
      if (!p.a.ghost && p.a.id !== humanId) { const part = participants.find(x => x.id === p.a.id); botSessions.set(p.a.id, new BotSession(ROUND_BOARD, seedA, part.difficulty)); }
      if (!p.b.ghost && p.b.id !== humanId) { const part = participants.find(x => x.id === p.b.id); botSessions.set(p.b.id, new BotSession(ROUND_BOARD, seedB, part.difficulty)); }
      if (!p.a.ghost) targets.set(p.a.id, p.b.ghost ? null : p.b.id);
      if (!p.b.ghost) targets.set(p.b.id, p.a.id);
    });
    myPairingIndex = r.pairings.indexOf(findPairingOf(humanId));
    finalReported = false;
    phase = 'intro';
    notify();
  }
  function startLive() { phase = 'live'; roundEndsAt = Date.now() + mgr.roundMs; notify(); }

  function tick(dtMs) {
    if (phase !== 'live') return;
    for (const [id, sess] of botSessions) {
      const ev = sess.tick(dtMs);
      for (const type of ev.attacks) {
        const targetId = targets.get(id);
        if (!targetId) continue;                     // alvo é ghost: ataque não tem quem receber
        if (targetId === humanId) incoming.push({ type, atMs: Date.now() });
        else { const t = botSessions.get(targetId); if (t) t.receiveIncoming(type); }
      }
    }
    if (Date.now() >= roundEndsAt) endRound();
  }

  function endRound(myStats) {
    if (phase !== 'live') return null;
    phase = 'result';
    const statsByPairing = mgr.currentPairings.map((p) => {
      const s = {};
      for (const side of [p.a, p.b]) {
        if (side.ghost) continue;
        if (side.id === humanId) s[side.id] = myStats || { score: 0, bestCombo: 0, specialsUsed: 0, attacksSent: 0 };
        else { const sess = botSessions.get(side.id); s[side.id] = sess ? sess.stats() : { score: 0, bestCombo: 0, specialsUsed: 0, attacksSent: 0 }; }
      }
      return s;
    });
    const summary = mgr.resolveRound(statsByPairing);
    notify();
    return summary;
  }

  function opponentInfo() {
    const pairing = mgr.currentPairings[myPairingIndex];
    if (!pairing) return null;
    const isA = pairing.a.id === humanId;
    const mySeed = isA ? pairing.boardSeedA : pairing.boardSeedB;
    const oppSide = isA ? pairing.b : pairing.a;
    if (oppSide.ghost) {
      const src = mgr.get(oppSide.sourceId);
      return { mySeed, opp: { id: 'ghost:' + oppSide.sourceId, name: src.name, isGhost: true, isBot: false, hp: 100, score: 0, combo: 0 } };
    }
    const p = mgr.get(oppSide.id), sess = botSessions.get(oppSide.id);
    return { mySeed, opp: { id: p.id, name: p.name, isGhost: false, isBot: p.isBot, hp: p.hp, score: sess ? sess.score : 0, combo: sess ? sess.bestCombo : 0 } };
  }

  return {
    kind: 'local', myId: humanId, isHost: true, participants, roundMs: mgr.roundMs,
    onUpdate(fn) { listeners.push(fn); return () => { listeners = listeners.filter(f => f !== fn); }; },
    beginRound, startLive, tick,
    goNext() {
      const active = mgr.active();
      if (active.length <= 1) { mgr.finishGame(); phase = 'finished'; notify(); return; }
      if (!active.some(p => p.id === humanId)) { phase = 'eliminated'; notify(); return; }
      beginRound();
    },
    snapshot() {
      const me = mgr.get(humanId);
      const oi = phase === 'lobby' || phase === 'finished' || phase === 'eliminated' ? null : opponentInfo();
      return {
        phase, round: mgr.round, roundMs: mgr.roundMs, roundEndsAt,
        myHp: me.hp, myEliminated: me.eliminated,
        pairing: oi ? { boardSeedMine: oi.mySeed, opp: oi.opp } : null,
        ranking: mgr.ranking().map(p => ({ id: p.id, name: p.name, hp: p.hp, eliminated: p.eliminated, isBot: p.isBot })),
        lastResults: (mgr.currentPairings || []).map(p => ({ a: p.a.id, b: p.b.ghost ? ('👻 ' + mgr.get(p.b.sourceId).name) : p.b.id, result: p.result })),
        champion: mgr.champion, standings: mgr.standings,
      };
    },
    reportFinal(stats) { if (finalReported) return null; finalReported = true; return endRound(stats); },
    sendAttack(type) {
      const targetId = targets.get(humanId);
      if (!targetId) return false;
      const sess = botSessions.get(targetId);
      if (sess) sess.receiveIncoming(type);
      return true;
    },
    incomingAttacks() { return incoming.splice(0, incoming.length); },
    // depois de eliminado: resolve o resto da partida de uma vez (só sobra
    // bot contra bot — não faz sentido ficar animando um tabuleiro que
    // ninguém está jogando de verdade) e devolve a classificação final.
    simulateToEnd() {
      let guard = 0;
      while (mgr.active().length > 1 && guard++ < 200) {
        const r = mgr.createRound(); if (!r) break;
        mgr.startRound();
        const statsByPairing = r.pairings.map((p, i) => {
          const s = {};
          for (const side of [p.a, p.b]) {
            if (side.ghost) continue;
            const part = participants.find(x => x.id === side.id);
            s[side.id] = simulateBotRound(ROUND_BOARD, r.seed + i * 131 + (side === p.a ? 0 : 1), mgr.roundMs, part.difficulty);
          }
          return s;
        });
        mgr.resolveRound(statsByPairing);
      }
      mgr.finishGame();
      phase = 'finished';
      notify();
      return mgr.standings;
    },
  };

}
