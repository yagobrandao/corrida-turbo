// Adaptador do Pega-Pega para a plataforma.
//
// O HOST é o juiz: detecta capturas (com tolerância generosa), decide onde
// nascem os power-ups, controla o relógio, o anti-enrolação e os pontos.
// Clientes só mandam posição (15 Hz) e pedidos de item. Isso garante que
// nunca existem dois pegadores nem captura dupla: só o host promove.
import TagScene, { BOT_SLOT } from './TagScene.js';
import { slotName } from '../../core/config.js';
import { getPrefs, setSound, setMusic } from '../../core/audio.js';
import { getProgress } from '../../core/storage.js';
import { resolveSkin } from '../runner/skins.js';
import {
  ROUND_TIME, CATCH_DIST, SWAP_IMMUNITY, POWERS, POWER_EVERY,
  HUNT_BOOST_EVERY, HUNT_BOOST_MAX,
  PTS_FLEE_PER_S, PTS_CAPTURE, PTS_SURVIVOR, PTS_NEVER_CAUGHT, PTS_HUNTER_BONUS,
} from './config.js';
import * as ui from '../../ui/gameui.js';

const M = {
  POS: 1, SNAP: 2,
  TAG: 3,            // host -> all: novo pegador { slot, by }
  SPAWNP: 4,         // host -> all: power-up nasceu
  TAKE: 5, TAKEN: 6, // pedido -> confirmado
  SOFF: 7,           // escudo consumido/expirado
  HUNT: 8,           // nível do fôlego do pegador
  ROUND: 9, REND: 10,
};

const POWER_TOTAL = POWERS.reduce((a, p) => a + p.weight, 0);

const HUD_HTML = `
  <div class="hud-me">
    <div id="t-timer" class="hud-big" style="font-size:26px">01:30</div>
    <div class="hud-sub"><span id="t-round">Rodada 1</span><span id="t-who"></span></div>
  </div>`;

export function createGame(ctx) {
  const { phaser, bus, players, mySlot, isHost, seed, settings, onFinish } = ctx;
  const totalRounds = parseInt((settings && settings.rounds) || '3', 10);
  const solo = players.length <= 1;

  let scene = null;
  let round = 0;
  let ended = false;
  let roundClosed = false;
  let tagger = 0;
  let taggerSince = 0;         // clock em que o pegador atual assumiu
  let immuneUntil = 0;
  let huntLevel = 0;
  let lastCatchAt = 0;
  let powerSeq = 1;
  let snapTimer = null;
  let judgeTimer = null;
  let scoreTimer = null;
  let powerTimer = null;

  const totals = new Map(players.map(p => [p.slot, 0]));
  const captures = new Map(players.map(p => [p.slot, 0]));
  const fleeSecs = new Map(players.map(p => [p.slot, 0]));
  const positions = new Map();
  const gone = new Set();
  const usedStarters = new Set();
  const shieldOf = new Map();    // host: slot -> expira em (clock)
  let roundCaptures = new Map();
  let caughtThisRound = new Set();
  let clock = 0;

  const progress = getProgress();
  const mySkin = resolveSkin(progress.skin, progress.totalCoins).id;
  const roster = players.map(p => ({ ...p, skin: p.skin || mySkin }));
  const nameOf = (slot) => slot === BOT_SLOT ? 'Robô'
    : (players.find(p => p.slot === slot)?.name) || slotName(slot);

  // ---------------- HUD ----------------
  ui.showHUD(HUD_HTML);
  const el = { timer: ui.panelEl('#t-timer'), round: ui.panelEl('#t-round'), who: ui.panelEl('#t-who') };

  ui.setPauseMenu({
    canPause: solo,
    audio: { getPrefs, setSound, setMusic },
    onPause: () => { if (solo && scene) scene.paused = true; },
    onResume: () => { if (scene) scene.paused = false; },
    onQuit: () => ctx.onQuit && ctx.onQuit(),
  });

  function paintBoard() {
    const rows = players.map(p => ({
      slot: p.slot, name: p.name,
      value: (p.slot === tagger ? '👹 ' : '🏃 ') + (totals.get(p.slot) || 0) + ' pts',
      alive: !gone.has(p.slot),
    }));
    if (solo) rows.push({ slot: 3, name: 'Robô', value: tagger === BOT_SLOT ? '👹' : '🏃', alive: true });
    ui.updateBoard(rows);
    el.who.textContent = `👹 ${nameOf(tagger)}`;
  }

  // ---------------- rodadas ----------------
  const sceneKey = 'tag';
  if (!phaser.scene.getScene(sceneKey)) phaser.scene.add(sceneKey, TagScene, false);

  function pickStarter() {
    // balanceado: sorteia entre quem ainda não abriu rodada como pegador
    const pool = solo
      ? [mySlot, BOT_SLOT]
      : players.map(p => p.slot).filter(s => !gone.has(s) && !usedStarters.has(s));
    const all = solo ? pool : (pool.length ? pool : players.map(p => p.slot).filter(s => !gone.has(s)));
    const chosen = all[Math.floor(Math.random() * all.length)];
    usedStarters.add(chosen);
    return chosen;
  }

  function launchRound(n, startTagger) {
    round = n;
    roundClosed = false;
    tagger = startTagger;
    taggerSince = 0;
    immuneUntil = 0;
    huntLevel = 0;
    lastCatchAt = 0;
    clock = 0;
    shieldOf.clear();
    roundCaptures = new Map();
    caughtThisRound = new Set();
    el.round.textContent = `Rodada ${n}/${totalRounds}`;

    const sc = phaser.scene.getScene(sceneKey);
    sc.events.once('create', () => {
      scene = sc;
      paintBoard();
      setTimeout(() => {
        if (scene) {
          scene.banner(startTagger === mySlot ? '👹 VOCÊ COMEÇA PEGANDO!' : `👹 ${nameOf(startTagger)} PEGA!`, 1400);
          scene.beginRun();
        }
      }, 900);
    });
    const data = { seed, round: n, isHost, hooks, mySlot, players: roster, solo, tagger: startTagger };
    if (sc.scene.isActive() || sc.scene.isPaused()) sc.scene.restart(data);
    else phaser.scene.start(sceneKey, data);
  }

  function hostStartRound(n) {
    const starter = pickStarter();
    bus.toAll({ k: M.ROUND, n, tagger: starter });
    launchRound(n, starter);
  }

  function hostCloseRound() {
    if (roundClosed || ended) return;
    roundClosed = true;
    // bônus de fim de rodada
    const gains = [];
    for (const p of players) {
      if (gone.has(p.slot)) continue;
      let bonus = 0;
      if (p.slot !== tagger) bonus += PTS_SURVIVOR;
      if (!caughtThisRound.has(p.slot) && p.slot !== tagger) bonus += PTS_NEVER_CAUGHT;
      if ((roundCaptures.get(p.slot) || 0) >= 3) bonus += PTS_HUNTER_BONUS;
      if (bonus) totals.set(p.slot, (totals.get(p.slot) || 0) + bonus);
      gains.push([p.slot, bonus]);
    }
    bus.toAll({ k: M.REND, gains, totals: [...totals.entries()] });
    onRoundEnd(gains);
  }

  function onRoundEnd(gains) {
    roundClosed = true;
    const closed = round;   // captura AGORA: a próxima rodada pode chegar antes do timer
    if (scene) { scene.freezeRun(); scene.banner('🏁 FIM DA RODADA!', 1600); }
    const mine = gains.find(([s]) => s === mySlot);
    if (mine && mine[1]) ui.message(`Bônus: +${mine[1]} pts`, 1600);
    paintBoard();
    setTimeout(() => {
      if (ended || round !== closed) return;
      if (closed >= totalRounds) finish();
      else if (isHost) hostStartRound(closed + 1);
    }, 2600);
  }

  // ---------------- ganchos da cena ----------------
  const hooks = {
    sendState: (st) => {
      positions.set(mySlot, st);
      if (!isHost) bus.toHost({ k: M.POS, ...st });
    },
    onTake: (id) => {
      if (isHost) hostTake(mySlot, id);
      else bus.toHost({ k: M.TAKE, id });
    },
    onClock: (c) => {
      clock = c;
      const left = Math.max(0, ROUND_TIME - c);
      const mm = String(Math.floor(left / 60)).padStart(2, '0');
      const ss = String(Math.floor(left % 60)).padStart(2, '0');
      el.timer.textContent = `${mm}:${ss}`;
      el.timer.style.color = left <= 10 ? 'var(--red)' : '';
      if (isHost && left <= 0) hostCloseRound();
      if (isHost) hostJudge();
    },
  };

  // ---------------- autoridade do host ----------------
  function posOf(slot) {
    if (slot === mySlot || (solo && slot === BOT_SLOT)) {
      const a = scene && scene.actors.get(slot);
      return a ? { x: a.x, y: a.y } : null;
    }
    return positions.get(slot) || null;
  }

  function candidates() {
    const list = players.map(p => p.slot).filter(s => !gone.has(s));
    if (solo) list.push(BOT_SLOT);
    return list;
  }

  // juiz de capturas: roda no ritmo do frame do host
  function hostJudge() {
    if (roundClosed || !scene || clock < immuneUntil) return;
    const tp = posOf(tagger);
    if (!tp) return;
    for (const slot of candidates()) {
      if (slot === tagger) continue;
      const p = posOf(slot);
      if (!p) continue;
      if (Math.hypot(tp.x - p.x, tp.y - p.y) > CATCH_DIST) continue;

      // escudo bloqueia UMA captura
      if ((shieldOf.get(slot) || 0) > clock) {
        shieldOf.set(slot, 0);
        bus.toAll({ k: M.SOFF, slot });
        if (scene) scene.applyShieldOff(slot);
        immuneUntil = clock + 0.8;   // respiro para o escudado escapar
        continue;
      }
      hostCapture(tagger, slot);
      break;
    }

    // anti-enrolação: pegador sem capturar ganha fôlego
    const lvl = Math.min(HUNT_BOOST_MAX, Math.floor((clock - lastCatchAt) / HUNT_BOOST_EVERY));
    if (lvl !== huntLevel) {
      huntLevel = lvl;
      bus.toAll({ k: M.HUNT, level: lvl });
      if (scene) scene.applyHunt(lvl);
      if (lvl > 0 && tagger === mySlot) ui.message('🔥 Você está mais rápido!', 1200);
    }
  }

  function hostCapture(by, victim) {
    if (by !== BOT_SLOT) {
      captures.set(by, (captures.get(by) || 0) + 1);
      roundCaptures.set(by, (roundCaptures.get(by) || 0) + 1);
      totals.set(by, (totals.get(by) || 0) + PTS_CAPTURE);
    }
    caughtThisRound.add(victim);
    tagger = victim;
    taggerSince = clock;
    immuneUntil = clock + SWAP_IMMUNITY;
    lastCatchAt = clock;
    huntLevel = 0;
    bus.toAll({ k: M.TAG, slot: victim, by });
    if (scene) { scene.applyTagger(victim); scene.applyHunt(0); }
    paintBoard();
  }

  function hostTake(slot, id) {
    if (roundClosed || !scene) return;
    const p = scene.powerSprites.get(id);
    if (!p) return;   // já pego
    const info = POWERS.find(x => x.id === p.type);
    if (p.type === 'shield') shieldOf.set(slot, clock + info.dur);
    const msg = { k: M.TAKEN, id, slot, type: p.type, dur: info.dur };
    bus.toAll(msg);
    scene.applyTaken(id, slot, p.type, info.dur);
  }

  function hostSpawnPower() {
    if (roundClosed || !scene || scene.powerSprites.size >= 3) return;
    const cell = scene.freeCells[Math.floor(Math.random() * scene.freeCells.length)];
    if (!cell) return;
    let x = Math.random() * POWER_TOTAL;
    let type = POWERS[0].id;
    for (const pw of POWERS) { x -= pw.weight; if (x <= 0) { type = pw.id; break; } }
    const id = powerSeq++;
    bus.toAll({ k: M.SPAWNP, id, c: cell.c, r: cell.r, type });
    scene.applyPowerSpawn(id, cell.c, cell.r, type);
  }

  // pontos por sobrevivência (1 Hz, só host)
  function hostScoreTick() {
    if (roundClosed || ended) return;
    for (const slot of candidates()) {
      if (slot === tagger || slot === BOT_SLOT) continue;
      totals.set(slot, (totals.get(slot) || 0) + PTS_FLEE_PER_S);
      fleeSecs.set(slot, (fleeSecs.get(slot) || 0) + 1);
    }
    // escudo que expirou sem ser usado: apaga o brilho em todo mundo
    for (const [slot, until] of shieldOf) {
      if (until > 0 && until <= clock) {
        shieldOf.set(slot, 0);
        bus.toAll({ k: M.SOFF, slot });
        if (scene) scene.applyShieldOff(slot);
      }
    }
    paintBoard();
  }

  // ---------------- rede ----------------
  const unbind = bus.on((p, from) => {
    if (!p || ended) return;
    if (isHost) {
      if (p.k === M.POS) { positions.set(from, p); if (scene) scene.applyRemote(from, p); }
      else if (p.k === M.TAKE) hostTake(from, p.id);
    } else {
      if (p.k === M.SNAP) { for (const [slot, st] of p.p) if (scene && slot !== mySlot) scene.applyRemote(slot, st); }
      else if (p.k === M.TAG) {
        tagger = p.slot;
        if (scene) scene.applyTagger(p.slot);
        paintBoard();
      }
      else if (p.k === M.SPAWNP) scene && scene.applyPowerSpawn(p.id, p.c, p.r, p.type);
      else if (p.k === M.TAKEN) scene && scene.applyTaken(p.id, p.slot, p.type, p.dur);
      else if (p.k === M.SOFF) scene && scene.applyShieldOff(p.slot);
      else if (p.k === M.HUNT) scene && scene.applyHunt(p.level);
      else if (p.k === M.ROUND) launchRound(p.n, p.tagger);
      else if (p.k === M.REND) {
        for (const [s, v] of p.totals) totals.set(s, v);
        onRoundEnd(p.gains);
      }
    }
  });

  if (isHost && bus.online) {
    snapTimer = setInterval(() => {
      if (ended || !scene) return;
      positions.set(mySlot, scene.getMyState());
      bus.toAll({ k: M.SNAP, p: [...positions.entries()] });
    }, 1000 / 15);
  }
  if (isHost) {
    scoreTimer = setInterval(hostScoreTick, 1000);
    powerTimer = setInterval(hostSpawnPower, POWER_EVERY * 1000);
  }

  function finish() {
    if (ended) return;
    ended = true;
    clearInterval(snapTimer);
    clearInterval(scoreTimer);
    clearInterval(powerTimer);
    clearInterval(judgeTimer);
    const rows = players.map(p => {
      const pts = totals.get(p.slot) || 0;
      return {
        slot: p.slot, name: p.name,
        score: pts, coins: Math.round(pts / 40),
        detail: `👹${captures.get(p.slot) || 0} · 🏃${fleeSecs.get(p.slot) || 0}s`,
        sort: pts,
      };
    });
    onFinish(rows);
  }

  return {
    begin() {
      if (isHost) hostStartRound(1);
      // convidados esperam o M.ROUND
    },
    playerLeft(slot) {
      gone.add(slot);
      positions.delete(slot);
      ui.message(`⚠️ ${nameOf(slot)} saiu da partida`, 2200);
      if (!isHost) return;
      const left = candidates();
      // o pegador caiu: promove outro na hora
      if (tagger === slot && left.length) {
        const next = left[Math.floor(Math.random() * left.length)];
        hostCapture(BOT_SLOT, next);   // BOT_SLOT como "ninguém": sem ponto de captura
      }
      // sobrou 1: encerra a rodada (a plataforma cuida do W.O. se todos saírem)
      if (left.length <= 1 && !solo) hostCloseRound();
    },
    destroy() {
      ended = true;
      clearInterval(snapTimer);
      clearInterval(scoreTimer);
      clearInterval(powerTimer);
      clearInterval(judgeTimer);
      unbind();
      ui.setPauseMenu(null);
      ui.hideHUD();
      if (phaser.scene.isActive(sceneKey)) phaser.scene.stop(sceneKey);
    },
  };
}
