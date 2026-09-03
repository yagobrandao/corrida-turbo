// Battle Tactics — sala PvP com 2 a 5 jogadores (puro: sem Phaser, sem bus
// de verdade — devolve decisões que o adaptador, BattleGame.js, executa).
//
// O JOGO NÃO MUDA. Cada dupla joga o duelo 1 contra 1 exatamente como já
// existia (várias rodadas de loja+batalha até alguém zerar o HP ou passar
// da última rodada) — sim.js, economy.js e BattleScene.js continuam
// intactos. A única coisa nova é COMO as duplas são formadas quando a
// sala tem mais de 2 pessoas:
//   - par → todo mundo enfrenta um jogador real, sem Ghost.
//   - ímpar → um jogador sobra; ele enfrenta um GHOST de outro jogador
//     real ativo — uma CÓPIA da formação mais recente que esse jogador
//     já montou (não uma simulação estatística, não um bot: é o
//     "snapshot" literal do que ele tem em campo agora). Esse jogador
//     continua jogando normalmente seu próprio duelo contra outra
//     pessoa; o resultado do confronto com o Ghost nunca o afeta.
import { generatePairings, emptyHistory } from '../../core/pairing.js';

// Pareamento único (a sala não repete rodadas de pareamento — cada dupla
// já disputa seu duelo completo de várias rodadas internas sozinha), mas
// reaproveita o mesmo algoritmo de custo mínimo (evita HP desbalanceado,
// nunca ninguém contra o próprio Ghost).
export function pairRoom(players, seed) {
  const active = players.map(p => ({ id: String(p.slot), hp: 100 }));
  const history = {};
  for (const p of active) history[p.id] = emptyHistory();
  const { pairings } = generatePairings(active, history, seed);
  // cada pareamento ganha um "papel" fixo (a = quem manda o board como
  // 'host' da dupla, b = 'guest') independente de quem é o host da SALA
  return pairings.map(p => ({
    aSlot: Number(p.a.id),
    bSlot: p.b.ghost ? null : Number(p.b.id),
    ghostSourceSlot: p.b.ghost ? Number(p.b.sourceId) : null,
  }));
}

export function findMyPairing(pairings, mySlot) {
  return pairings.find(p => p.aSlot === mySlot || p.bSlot === mySlot) || null;
}
export function myRoleIn(pairing, mySlot) { return pairing.aSlot === mySlot ? 'host' : 'guest'; }
export function oppSlotIn(pairing, mySlot) { return pairing.aSlot === mySlot ? pairing.bSlot : pairing.aSlot; }

// ---------------------------------------------------------------- roteamento no host da sala
// Gerencia, do lado do host da SALA (não confundir com o papel 'host' de
// uma dupla): a última formação conhecida de cada jogador, e quando um
// pareamento tem board suficiente pros dois lados pra mandar a batalha.
export class PvpRoomHost {
  constructor(players, seed) {
    this.pairings = pairRoom(players, seed);
    this.lastSpec = {};          // slot -> spec mais recente já enviado (inclui fonte de Ghost mesmo após ela terminar)
    this.roundBucket = {};       // round -> { slot: spec } (só a rodada atual, pra duplas reais)
    this.doneStats = {};         // slot real -> stats finais (pra fechar a sala inteira)
  }
  pairingOf(slot) { return findMyPairing(this.pairings, slot); }

  // devolve os efeitos a aplicar: notificações de "pronto" e/ou batalhas prontas
  submitBoard(fromSlot, round, spec) {
    this.lastSpec[fromSlot] = spec;
    this.roundBucket[round] = this.roundBucket[round] || {};
    this.roundBucket[round][fromSlot] = spec;
    const effects = [];
    const pairing = this.pairingOf(fromSlot);
    if (!pairing) return effects;
    if (pairing.ghostSourceSlot !== null) {
      // ímpar: só o lado real (aSlot) realmente joga; resolve assim que ele manda
      if (fromSlot !== pairing.aSlot) return effects;
      const ghostSpec = this.lastSpec[pairing.ghostSourceSlot];
      if (!ghostSpec) return effects;   // a fonte ainda nem jogou a própria primeira formação
      effects.push({ t: 'battle', round, toSlot: pairing.aSlot, boards: { host: spec, guest: ghostSpec } });
      return effects;
    }
    // dupla real: avisa o outro lado que a formação chegou
    const otherSlot = fromSlot === pairing.aSlot ? pairing.bSlot : pairing.aSlot;
    effects.push({ t: 'ready', toSlot: otherSlot, fromSlot, round });
    const bucket = this.roundBucket[round];
    const aSpec = bucket[pairing.aSlot], bSpec = bucket[pairing.bSlot];
    if (aSpec && bSpec) {
      const boards = { host: aSpec, guest: bSpec };
      effects.push({ t: 'battle', round, toSlot: pairing.aSlot, boards });
      effects.push({ t: 'battle', round, toSlot: pairing.bSlot, boards });
    }
    return effects;
  }

  // um jogador real terminou seu próprio duelo (venceu, perdeu ou foi W.O.)
  reportDone(slot, stats) {
    this.doneStats[slot] = stats;
    const realSlots = new Set();
    for (const p of this.pairings) { realSlots.add(p.aSlot); if (p.bSlot !== null) realSlots.add(p.bSlot); }
    return [...realSlots].every(s => this.doneStats[s]);
  }
  buildFinalRows(nameOf) {
    const rows = [];
    for (const p of this.pairings) {
      if (p.bSlot === null) {
        const s = this.doneStats[p.aSlot];
        if (s) rows.push({ slot: p.aSlot, name: nameOf(p.aSlot), hp: s.hp, wins: s.wins, threeStars: s.threeStars, round: s.round, won: s.won });
        continue;
      }
      const sa = this.doneStats[p.aSlot], sb = this.doneStats[p.bSlot];
      if (!sa || !sb) continue;
      rows.push({ slot: p.aSlot, name: nameOf(p.aSlot), hp: sa.hp, wins: sa.wins, threeStars: sa.threeStars, round: sa.round, won: sa.won });
      rows.push({ slot: p.bSlot, name: nameOf(p.bSlot), hp: sb.hp, wins: sb.wins, threeStars: sb.threeStars, round: sb.round, won: sb.won });
    }
    return rows;
  }
}
