// Pomar Mágico — Batalha: bot de rodada.
//
// Joga um Board de verdade, greedy, no ritmo da dificuldade — não é um
// resultado inventado: gera as mesmas fases que qualquer jogador geraria,
// então a energia e os ataques que manda também são reais e alimentam o
// perfil dele (usável depois como fonte de Ghost).
import { Board } from '../board.js';
import { listMoves } from '../levels.js';
import { mulberry32 } from '../../../core/rng.js';
import { energyFromPhase, pickAttackType, tickAttacks, receiveAttack } from './battleBoard.js';
import { BOT_BATTLE_PROFILES, ENERGY } from './config.js';
import { roundBoardLevel } from './roundBoard.js';

function bestMove(b, rnd) {
  const mv = listMoves(b); if (!mv.length) return null;
  let best = null, bestScore = -1;
  for (const m of mv) {
    b._swap(m.r1, m.c1, m.r2, m.c2);
    let s = 0;
    for (const g of b._findGroups()) { s += g.cells.length; if (g.special) s += g.special === 'color' ? 10 : g.special === 'bomb' ? 6 : 3; }
    b._swap(m.r1, m.c1, m.r2, m.c2);
    s += rnd() * 1.2;
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

// levelLike: { cols, rows, colors, layout } — o tabuleiro da rodada (sem
// limite de jogadas: a rodada acaba pelo tempo, não pelas trocas). Uma
// BotSession avança em pedaços de tempo real (tick), pra poder rodar ao
// vivo junto com o relógio da cena; simulateBotRound só a chama em loop
// pra testes/headless.
export class BotSession {
  constructor(levelLike, seed, difficulty = 'medium') {
    this.board = new Board(roundBoardLevel(levelLike), seed);
    this.rnd = mulberry32((seed + 7) >>> 0);
    this.prof = BOT_BATTLE_PROFILES[difficulty] || BOT_BATTLE_PROFILES.medium;
    this.stepMs = Math.max(220, 900 * this.prof.think);
    this.acc = 0; this.t = 0;
    this.score = 0; this.bestCombo = 0; this.specialsUsed = 0; this.attacksSent = 0;
    this.energy = 0; this.chargeLog = [];
    this.pendingIncoming = [];
  }
  receiveIncoming(type) { this.pendingIncoming.push(type); }
  tick(dtMs) {
    this.t += dtMs; this.acc += dtMs;
    const events = { phases: [], attacks: [] };
    while (this.pendingIncoming.length) receiveAttack(this.board, this.pendingIncoming.shift());
    tickAttacks(this.board, this.t);
    while (this.acc >= this.stepMs) {
      this.acc -= this.stepMs;
      const mv = bestMove(this.board, this.rnd);
      if (mv && this.rnd() < this.prof.quality) {
        const res = this.board.trySwap(mv.r1, mv.c1, mv.r2, mv.c2);
        for (const ph of res.phases) {
          events.phases.push(ph);
          if (ph.t === 'clear') {
            this.score += ph.score || 0;
            this.bestCombo = Math.max(this.bestCombo, ph.combo || 0);
            this.specialsUsed += ph.created.length;
            this.energy += energyFromPhase(ph);
            this.chargeLog.push({ special: ph.created[0] ? ph.created[0].s : null, combo: ph.combo || 0 });
            if (this.energy >= ENERGY.bar) {
              const type = pickAttackType(this.chargeLog);
              this.energy = 0; this.chargeLog = [];
              this.attacksSent++;
              events.attacks.push(type);
            }
          }
        }
      } else if (!mv) { const throwaway = []; this.board._shuffle(throwaway); }
    }
    return events;
  }
  stats() { return { score: this.score, bestCombo: this.bestCombo, specialsUsed: this.specialsUsed, attacksSent: this.attacksSent }; }
}

export function simulateBotRound(levelLike, seed, roundMs, difficulty = 'medium', onAttack = null) {
  const s = new BotSession(levelLike, seed, difficulty);
  let t = 0; const dt = 100;
  while (t < roundMs) { const ev = s.tick(dt); if (onAttack) for (const a of ev.attacks) onAttack(a, t); t += dt; }
  return s.stats();
}
