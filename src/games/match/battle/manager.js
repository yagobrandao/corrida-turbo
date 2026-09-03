// Pomar Mágico — Batalha: CompetitiveMatchManager (puro, autoritativo).
//
// Não conhece Phaser nem rede. É a ÚNICA fonte de verdade da partida —
// quem chama isso decide como mostrar e (no modo em sala) como distribuir
// as mensagens; aqui só existe o estado real: rodada, pareamentos, HP,
// eliminações, ranking. Roda inteiro no host quando há sala; roda local
// quando é treino contra bot.
import * as MM from '../../../core/pairing.js';
import * as G from './ghost.js';
import { computeDamage } from './damage.js';
import { START_HP, ROUND_MS } from './config.js';

export { START_HP };

export class CompetitiveMatchManager {
  // players: [{ id, name, isBot, difficulty }] — 2 a 5
  constructor(players, { seed = 1, roundMs = ROUND_MS } = {}) {
    if (players.length < 2) throw new Error('Batalha precisa de pelo menos 2 jogadores');
    this.roundMs = roundMs;
    this.seedBase = seed >>> 0;
    this.round = 0;
    this.state = 'lobby';              // lobby | round | intermission | finished
    this.players = new Map(players.map(p => [p.id, {
      id: p.id, name: p.name, isBot: !!p.isBot, difficulty: p.difficulty || 'medium',
      hp: START_HP, eliminated: false, eliminatedRound: null,
      wins: 0, losses: 0, totalScore: 0, bestCombo: 0, specialsUsed: 0, damageDealt: 0, ghostRoundsFought: 0,
    }]));
    this.history = {};
    this.profiles = {};
    for (const p of players) { this.history[p.id] = MM.emptyHistory(); this.profiles[p.id] = G.emptyProfile(); }
    this.currentPairings = [];
    this.champion = null;
    this.standings = null;
    this.log = [];
  }

  active() { return [...this.players.values()].filter(p => !p.eliminated); }
  get(id) { return this.players.get(id); }
  ranking() {
    const alive = this.active().sort((a, b) => b.hp - a.hp || b.totalScore - a.totalScore);
    const gone = [...this.players.values()].filter(p => p.eliminated).sort((a, b) => b.eliminatedRound - a.eliminatedRound);
    return [...alive, ...gone];
  }

  // ------------------------------------------------------------ rodada
  createRound() {
    if (this.state === 'finished') return null;
    if (this.active().length <= 1) { this.finishGame(); return null; }
    this.round++;
    const seed = (this.seedBase + this.round * 104729) >>> 0;
    const activeSlim = this.active().map(p => ({ id: p.id, hp: p.hp }));
    const { pairings, ghostSourceId } = MM.generatePairings(activeSlim, this.history, seed);
    MM.markGhostRotation(this.history, this.active(), ghostSourceId);
    for (const p of pairings) MM.recordPairing(this.history, p);
    this.currentPairings = pairings.map((p, i) => this.createGhost(p, (seed + i * 9781) >>> 0));
    this.state = 'round';
    this.log.push({ t: 'round', round: this.round, pairings: this.currentPairings.map(p => ({ a: p.a.id, b: p.b.ghost ? 'ghost:' + p.b.sourceId : p.b.id })) });
    return { round: this.round, seed, roundMs: this.roundMs, pairings: this.currentPairings };
  }

  // resolve o resultado do Ghost já na criação da rodada — nunca reage ao
  // vivo ao desempenho de quem está do outro lado (evita vantagem injusta)
  createGhost(pairing, seed) {
    const out = { ...pairing, boardSeedA: seed, boardSeedB: (seed + 1) >>> 0, resolved: false };
    if (pairing.b.ghost) out.ghostResult = G.simulateGhost(this.profiles[pairing.b.sourceId], seed);
    return out;
  }

  startRound() { if (this.state === 'round') this.log.push({ t: 'start', round: this.round }); return this.currentPairings; }

  // stats: { score, bestCombo, specialsUsed, attacksSent } — desempenho REAL
  // de um participante (nunca do Ghost, que já tem o resultado pronto)
  calculateResult(pairingIndex, statsByPlayer) {
    const pairing = this.currentPairings[pairingIndex];
    if (!pairing || pairing.resolved) return pairing ? pairing.result : null;
    const blank = { score: 0, bestCombo: 0, specialsUsed: 0, attacksSent: 0 };
    const sideA = { id: pairing.a.id, isGhost: false, stats: statsByPlayer[pairing.a.id] || blank };
    const sideB = pairing.b.ghost
      ? { id: null, isGhost: true, sourceId: pairing.b.sourceId, stats: pairing.ghostResult }
      : { id: pairing.b.id, isGhost: false, stats: statsByPlayer[pairing.b.id] || blank };
    if (!sideA.isGhost) G.updateProfile(this.profiles[sideA.id], sideA.stats);
    if (!sideB.isGhost) G.updateProfile(this.profiles[sideB.id], sideB.stats);
    let result;
    if (sideA.stats.score === sideB.stats.score) result = { tie: true, winnerSide: null, loserSide: null, damage: 0 };
    else {
      const winnerSide = sideA.stats.score > sideB.stats.score ? sideA : sideB;
      const loserSide = winnerSide === sideA ? sideB : sideA;
      // um Ghost perdendo nunca gera dano (não existe "dono" pra levar o dano);
      // um Ghost VENCENDO gera dano normal no jogador real do outro lado
      const damage = loserSide.isGhost ? 0 : computeDamage(winnerSide.stats.score, loserSide.stats.score, winnerSide.stats.bestCombo, winnerSide.stats.specialsUsed);
      result = { tie: false, winnerSide, loserSide, damage };
    }
    pairing.result = result;
    return result;
  }

  applyDamage(pairing, result) {
    if (pairing.resolved) return;
    pairing.resolved = true;
    if (pairing.b.ghost) { const p = this.players.get(pairing.a.id); if (p) p.ghostRoundsFought++; }
    if (result.tie || !result.loserSide) return;
    const loser = result.loserSide.isGhost ? null : this.players.get(result.loserSide.id);
    const winner = result.winnerSide.isGhost ? null : this.players.get(result.winnerSide.id);
    if (winner) { winner.wins++; winner.totalScore += result.winnerSide.stats.score; winner.bestCombo = Math.max(winner.bestCombo, result.winnerSide.stats.bestCombo); winner.specialsUsed += result.winnerSide.stats.specialsUsed; }
    if (loser) {
      loser.losses++; loser.totalScore += result.loserSide.stats.score;
      if (result.damage > 0) {
        if (winner) winner.damageDealt += result.damage;
        loser.hp = Math.max(0, loser.hp - result.damage);
        if (loser.hp <= 0) this.eliminatePlayer(loser.id);
      }
    }
  }

  eliminatePlayer(id) {
    const p = this.players.get(id);
    if (!p || p.eliminated) return;
    p.eliminated = true; p.eliminatedRound = this.round; p.hp = 0;
    this.log.push({ t: 'eliminated', round: this.round, id });
  }

  // resolve TODA a rodada de uma vez: calcula + aplica dano em cada
  // pareamento. statsByPairing[i] = { [playerId]: stats }. Devolve o
  // resumo pra tela de "rodada concluída".
  resolveRound(statsByPairing) {
    const results = this.currentPairings.map((pairing, i) => {
      const result = this.calculateResult(i, statsByPairing[i] || {});
      this.applyDamage(pairing, result);
      return { pairing, result };
    });
    this.state = 'intermission';
    const willFinish = this.active().length <= 1;
    return { round: this.round, results, ranking: this.ranking(), willFinish };
  }

  createNextRound() {
    if (this.active().length <= 1) return this.finishGame();
    return this.createRound();
  }

  finishGame() {
    if (this.state === 'finished') return this.standings;
    this.state = 'finished';
    const standings = this.ranking();
    this.champion = standings[0] ? standings[0].id : null;
    this.standings = standings;
    this.log.push({ t: 'finish', champion: this.champion });
    return standings;
  }
}
