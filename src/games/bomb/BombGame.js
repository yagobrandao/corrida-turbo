// Adaptador do Bomb Arena para a plataforma.
//
// Sincronização por EVENTOS, não por estado: posições a 15 Hz e, fora isso,
// só o que acontece (bomba, explosão, item, morte, rodada). O HOST valida
// bombas, decide as explosões, confirma itens e fecha as rodadas.
import BombScene from './BombScene.js';
import { slotName } from '../../core/config.js';
import { getPrefs, setSound, setMusic } from '../../core/audio.js';
import { getProgress } from '../../core/storage.js';
import { resolveSkin } from '../runner/skins.js';
import { BASE_RANGE, ROUND_POINTS, DROPS } from './config.js';
import * as ui from '../../ui/gameui.js';

const M = {
  POS: 1, SNAP: 2,            // posições
  PLACE: 3, BOMB: 4,          // pedido de bomba -> bomba oficial
  BOOM: 5,                    // explosão oficial
  DIED: 6, ELIM: 7,           // morte reportada -> confirmada
  TAKE: 8, TAKEN: 9,          // item pedido -> confirmado
  ROUND: 10, REND: 11,        // início e fim de rodada
};

const DROP_NAME = { fire: '🔥 Alcance +1', bomb: '💣 Bomba extra', speed: '👟 Velocidade', shield: '🛡️ Escudo' };

const HUD_HTML = `
  <div class="hud-me">
    <div id="b-round" class="hud-big" style="font-size:22px">Rodada 1</div>
    <div class="hud-sub"><span id="b-timer">⏱ 0s</span><span id="b-me"></span></div>
  </div>`;

export function createGame(ctx) {
  const { phaser, bus, players, mySlot, isHost, seed, settings, onFinish } = ctx;
  const totalRounds = parseInt((settings && settings.rounds) || '3', 10);
  const solo = players.length <= 1;

  let scene = null;
  let round = 0;
  let ended = false;
  let roundClosed = false;
  let bombSeq = 1;
  let snapTimer = null;

  const totals = new Map(players.map(p => [p.slot, 0]));
  const kills = new Map(players.map(p => [p.slot, 0]));
  const statsAll = new Map(players.map(p => [p.slot, { bombs: 0, crates: 0 }]));
  const positions = new Map();      // host: slot -> {x,y}
  const deadOrder = [];             // ordem de eliminação na rodada
  const ranges = new Map(players.map(p => [p.slot, BASE_RANGE]));  // host: alcance de cada um
  const bombOwner = new Map();      // host: bombId -> slot (para contar abates)

  const progress = getProgress();
  const mySkin = resolveSkin(progress.skin, progress.totalCoins).id;
  const roster = players.map(p => ({ ...p, skin: p.skin || mySkin }));
  const nameOf = (slot) => (players.find(p => p.slot === slot)?.name) || slotName(slot);

  // ---------------- HUD ----------------
  ui.showHUD(HUD_HTML);
  const el = { round: ui.panelEl('#b-round'), timer: ui.panelEl('#b-timer'), me: ui.panelEl('#b-me') };

  ui.setPauseMenu({
    canPause: solo,
    audio: { getPrefs, setSound, setMusic },
    onPause: () => { if (solo && scene) scene.paused = true; },
    onResume: () => { if (scene) scene.paused = false; },
    onQuit: () => ctx.onQuit && ctx.onQuit(),
  });

  function paintBoard() {
    if (!scene) return;
    ui.updateBoard(players.map(p => {
      const a = scene.actors.get(p.slot);
      return {
        slot: p.slot, name: p.name,
        value: a && a.alive ? '❤️' : '💀',
        alive: !!(a && a.alive),
      };
    }));
  }

  // ---------------- rodadas ----------------
  const sceneKey = 'bomb';
  if (!phaser.scene.getScene(sceneKey)) phaser.scene.add(sceneKey, BombScene, false);

  function launchRound(n) {
    round = n;
    roundClosed = false;
    deadOrder.length = 0;
    for (const p of players) ranges.set(p.slot, BASE_RANGE);
    el.round.textContent = `Rodada ${n}/${totalRounds}`;

    const sc = phaser.scene.getScene(sceneKey);
    sc.events.once('create', () => {
      scene = sc;
      paintBoard();
      setTimeout(() => scene && scene.beginRun(), 900);
    });
    const data = { seed, round: n, isNet: bus.online, isHost, hooks, mySlot, players: roster };
    if (sc.scene.isActive() || sc.scene.isPaused()) sc.scene.restart(data);
    else phaser.scene.start(sceneKey, data);
  }

  function hostStartRound(n) {
    bus.toAll({ k: M.ROUND, n });
    launchRound(n);
  }

  function hostCloseRound() {
    if (roundClosed || ended) return;
    roundClosed = true;
    // colocações: quem morreu por último fica melhor; vivos ficam na frente
    const alive = players.filter(p => !deadOrder.includes(p.slot)).map(p => p.slot);
    const order = [...alive, ...[...deadOrder].reverse()];   // 1º ... último
    const gains = order.map((slot, i) => [slot, ROUND_POINTS[i] || 10]);
    for (const [slot, pts] of gains) totals.set(slot, (totals.get(slot) || 0) + pts);
    const winner = alive.length === 1 ? alive[0] : -1;
    bus.toAll({ k: M.REND, order, gains, winner, totals: [...totals.entries()] });
    onRoundEnd(winner, gains);
  }

  function onRoundEnd(winner, gains) {
    roundClosed = true;
    // captura a rodada fechada AGORA: no convidado, a próxima rodada pode
    // chegar pela rede antes deste timer disparar — sem a captura, o timer
    // veria o número novo e encerraria a partida uma rodada antes da hora
    const closed = round;
    if (scene) scene.freezeRun();
    const mine = gains.find(([s]) => s === mySlot);
    if (scene) {
      scene.banner(winner === mySlot ? '🏆 VITÓRIA!' : winner >= 0 ? `${nameOf(winner)} venceu!` : 'RODADA ENCERRADA', 1600);
    }
    ui.message(mine ? `+${mine[1]} pts` : '', 1500);
    setTimeout(() => {
      if (ended || round !== closed) return;
      if (closed >= totalRounds) finish();
      else if (isHost) hostStartRound(closed + 1);
    }, 2400);
  }

  // ---------------- ganchos da cena ----------------
  const hooks = {
    sendState: (st) => {
      if (isHost) positions.set(mySlot, st);
      else bus.toHost({ k: M.POS, ...st });
    },
    onPlace: (c, r) => {
      if (isHost) hostPlace(mySlot, c, r);
      else bus.toHost({ k: M.PLACE, c, r });
    },
    onBoom: (bomb, blast) => {       // só dispara no host
      const msg = { k: M.BOOM, id: bomb.id, cells: blast.cells, destroyed: blast.destroyed };
      bus.toAll(msg);
      scene.applyBoom(msg);
      hostCheckBlastHits(bomb, blast);
    },
    onDied: () => {
      if (isHost) hostElim(mySlot);
      else bus.toHost({ k: M.DIED });
    },
    onTake: (c, r) => {
      if (isHost) hostTake(mySlot, c, r);
      else bus.toHost({ k: M.TAKE, c, r });
    },
    onSelfPickup: (type) => ui.message(DROP_NAME[type] || type, 1100),
    rangeOf: (slot) => ranges.get(slot) || BASE_RANGE,
    onClock: (clock) => {
      el.timer.textContent = `⏱ ${Math.max(0, Math.floor(clock))}s`;
      const me = scene && scene.actors.get(mySlot);
      if (me) el.me.textContent = `💣${me.maxBombs} 🔥${me.range}${me.shield ? ' 🛡️' + me.shield : ''}`;
    },
  };

  // ---------------- lógica do host ----------------
  function hostPlace(slot, c, r) {
    if (roundClosed || !scene) return;
    const a = scene.actors.get(slot);
    if (!a || !a.alive) return;
    const mine = [...scene.bombs.values()].filter(b => b.owner === slot).length;
    const cap = slot === mySlot ? a.maxBombs : 1 + countTaken(slot, 'bomb');
    if (mine >= cap || scene._bombAt(c, r)) return;
    const id = bombSeq++;
    bombOwner.set(id, slot);
    const msg = { k: M.BOMB, id, c, r, owner: slot };
    bus.toAll(msg);
    scene.applyBomb(msg);
    bumpStat(slot, 'bombs');
  }

  const takenLog = [];  // host: [{slot, type}]
  const countTaken = (slot, type) => takenLog.filter(t => t.slot === slot && t.type === type).length;

  function hostTake(slot, c, r) {
    if (roundClosed || !scene) return;
    const key = `${c},${r}`;
    const type = scene.drops.get(key);
    if (!type) return;   // já pego por outro
    takenLog.push({ slot, type });
    if (type === 'fire') ranges.set(slot, Math.min(6, (ranges.get(slot) || BASE_RANGE) + 1));
    const msg = { k: M.TAKEN, slot, c, r, type };
    bus.toAll(msg);
    scene.applyPickup(slot, c, r, type);
  }

  function hostElim(slot) {
    if (roundClosed || deadOrder.includes(slot)) return;
    deadOrder.push(slot);
    bus.toAll({ k: M.ELIM, slot });
    scene.applyElim(slot);
    if (slot !== mySlot) ui.message(`💀 ${nameOf(slot)} foi eliminado!`, 1800);
    else ui.message('💀 Você foi eliminado! Continue assistindo…', 2600);
    paintBoard();
    const alive = players.length - deadOrder.length;
    if (alive <= (players.length > 1 ? 1 : 0)) setTimeout(hostCloseRound, 700);
  }

  // abates: se a explosão de uma bomba pega alguém, o dono leva o crédito
  function hostCheckBlastHits(bomb) {
    const owner = bombOwner.get(bomb.id);
    if (owner === undefined) return;
    // os hits chegam via DIED de cada um; o crédito é dado lá com uma janela
    lastBoom = { owner, at: Date.now() };
  }
  let lastBoom = null;

  // ---------------- rede ----------------
  const unbind = bus.on((p, from) => {
    if (!p || ended) return;
    if (isHost) {
      if (p.k === M.POS) { positions.set(from, p); if (scene) scene.applyRemote(from, p); }
      else if (p.k === M.PLACE) hostPlace(from, p.c, p.r);
      else if (p.k === M.DIED) {
        if (lastBoom && Date.now() - lastBoom.at < 900 && lastBoom.owner !== from) {
          kills.set(lastBoom.owner, (kills.get(lastBoom.owner) || 0) + 1);
        }
        hostElim(from);
      }
      else if (p.k === M.TAKE) hostTake(from, p.c, p.r);
    } else {
      if (p.k === M.SNAP) { for (const [slot, st] of p.p) if (scene && slot !== mySlot) scene.applyRemote(slot, st); }
      else if (p.k === M.BOMB) scene && scene.applyBomb(p);
      else if (p.k === M.BOOM) scene && scene.applyBoom(p);
      else if (p.k === M.ELIM) {
        scene && scene.applyElim(p.slot);
        paintBoard();
        if (p.slot === mySlot) ui.message('💀 Você foi eliminado! Continue assistindo…', 2600);
        else ui.message(`💀 ${nameOf(p.slot)} foi eliminado!`, 1600);
      }
      else if (p.k === M.TAKEN) scene && scene.applyPickup(p.slot, p.c, p.r, p.type);
      else if (p.k === M.ROUND) launchRound(p.n);
      else if (p.k === M.REND) {
        for (const [s, v] of p.totals) totals.set(s, v);
        onRoundEnd(p.winner, p.gains);
      }
    }
  });

  if (isHost && bus.online) {
    snapTimer = setInterval(() => {
      if (ended || !scene) return;
      const mine = scene.getMyState();
      positions.set(mySlot, mine);
      bus.toAll({ k: M.SNAP, p: [...positions.entries()] });
    }, 1000 / 15);
  }

  // solo: a rodada fecha quando o jogador morre (lava/própria bomba)
  const soloWatch = solo ? setInterval(() => {
    if (!scene || ended || roundClosed) return;
    const me = scene.actors.get(mySlot);
    if (me && !me.alive) hostCloseRound();
  }, 300) : null;

  function bumpStat(slot, k) {
    const s = statsAll.get(slot);
    if (s) s[k]++;
  }

  function finish() {
    if (ended) return;
    ended = true;
    clearInterval(snapTimer);
    if (soloWatch) clearInterval(soloWatch);
    const rows = players.map(p => {
      const pts = totals.get(p.slot) || 0;
      const st = statsAll.get(p.slot) || { bombs: 0, crates: 0 };
      const myStats = p.slot === mySlot && scene ? scene.stats : null;
      return {
        slot: p.slot, name: p.name,
        score: pts, coins: Math.round(pts / 12),
        detail: `☠️${kills.get(p.slot) || 0} 💣${myStats ? myStats.bombs : st.bombs}`,
        sort: pts,
        metrics: p.slot === mySlot
          ? { kills: kills.get(p.slot) || 0, crates: myStats ? myStats.crates : 0, bombs: myStats ? myStats.bombs : 0 }
          : undefined,
      };
    });
    onFinish(rows);
  }

  return {
    begin() {
      if (isHost) hostStartRound(1);
      // convidados esperam o M.ROUND do host
    },
    playerLeft(slot) {
      if (isHost && !deadOrder.includes(slot)) hostElim(slot);
    },
    destroy() {
      ended = true;
      clearInterval(snapTimer);
      if (soloWatch) clearInterval(soloWatch);
      unbind();
      ui.setPauseMenu(null);
      ui.hideHUD();
      if (phaser.scene.isActive(sceneKey)) phaser.scene.stop(sceneKey);
    },
  };
}
