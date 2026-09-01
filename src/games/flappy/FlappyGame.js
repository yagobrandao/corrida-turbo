// Adaptador do Flappy Duo para a plataforma.
//
// A rede aqui é mais simples que a da corrida: cada jogador manda a própria
// altura ao host a 15 Hz, o host consolida num snapshot e devolve. O placar
// é a quantidade de canos atravessados.
import FlappyScene from './FlappyScene.js';
import { STATE_HZ, slotName } from '../../core/config.js';
import { getPrefs, setSound, setMusic } from '../../core/audio.js';
import * as ui from '../../ui/gameui.js';

const M = { STATE: 1, SNAP: 2, DEAD: 3 };
const GRACE = 6;   // s que os vivos continuam depois do primeiro a cair

const pack = (slot, s) => [slot, s.y, s.vy, s.sc, s.dead ? 1 : 0];
const unpack = (a) => ({ slot: a[0], y: a[1], vy: a[2], sc: a[3], dead: !!a[4] });

const HUD_HTML = `
  <div class="hud-me">
    <div id="f-score" class="hud-big">0</div>
    <div class="hud-sub"><span class="dim">obstáculos</span></div>
  </div>`;

export function createGame(ctx) {
  const { phaser, bus, players, mySlot, isHost, seed, settings, onFinish } = ctx;

  const states = new Map();
  const finals = new Map();
  let scene = null;
  let ended = false;
  let graceTimer = null;
  let snapTimer = null;

  const rivals = players
    .filter(p => p.slot !== mySlot)
    .map(p => ({ slot: p.slot, name: p.name }));

  ui.showHUD(HUD_HTML);
  const scoreEl = ui.panelEl('#f-score');

  ui.setPauseMenu({
    canPause: !bus.online,
    audio: { getPrefs, setSound, setMusic },
    onPause: () => { if (!bus.online && scene) scene.paused = true; },
    onResume: () => { if (scene) scene.paused = false; },
    onQuit: () => ctx.onQuit && ctx.onQuit(),
  });

  const nameOf = (slot) => (players.find(p => p.slot === slot)?.name) || slotName(slot);

  const hooks = {
    updateHUD: (s) => {
      scoreEl.textContent = s.score;
      ui.updateBoard(s.rivals.map(r => ({
        slot: r.slot,
        name: r.name,
        value: r.alive ? `${r.score} obst.` : `💀 ${r.score}`,
        alive: r.alive,
      })));
    },
    sendState: (st) => {
      if (isHost) states.set(mySlot, st);
      else bus.toHost({ k: M.STATE, s: st });
    },
    onDead: (stats) => {
      finals.set(mySlot, stats);
      if (isHost) {
        const st = states.get(mySlot);
        if (st) states.set(mySlot, { ...st, dead: true });
        checkEnd();
      } else {
        bus.toHost({ k: M.DEAD, ...stats });
      }
      if (rivals.some(r => !finals.has(r.slot))) {
        ui.message('💥 Você caiu! Veja quem sobrevive…');
      } else if (!bus.online) {
        setTimeout(finish, 900);
      }
    },
  };

  const sceneKey = 'flappy';
  if (!phaser.scene.getScene(sceneKey)) phaser.scene.add(sceneKey, FlappyScene, false);
  const started = new Promise((resolve) => {
    const sc = phaser.scene.getScene(sceneKey);
    sc.events.once('create', () => { scene = sc; resolve(); });
    const data = {
      seed, hooks, rivals, mySlot,
      isNet: bus.online,
      difficulty: (settings && settings.difficulty) || 'normal',
    };
    if (sc.scene.isActive() || sc.scene.isPaused()) sc.scene.restart(data);
    else phaser.scene.start(sceneKey, data);
  });

  const unbind = bus.on((p, from) => {
    if (!p) return;
    if (p.k === M.STATE && isHost) {
      states.set(from, p.s);
    } else if (p.k === M.DEAD && isHost) {
      finals.set(from, { sc: p.sc });
      const st = states.get(from);
      if (st) states.set(from, { ...st, dead: true });
      if (scene) scene.remoteDead(from);
      if (!finals.has(mySlot)) ui.message(`💥 ${nameOf(from)} caiu!`, 2000);
      checkEnd();
    } else if (p.k === M.SNAP && !isHost) {
      if (!scene) return;
      for (const st of p.p.map(unpack)) {
        if (st.slot !== mySlot) scene.applyRemote(st);
      }
    }
  });

  if (isHost && bus.online) {
    snapTimer = setInterval(() => {
      if (ended) return;
      const packed = [];
      for (const [slot, st] of states) packed.push(pack(slot, st));
      if (!packed.length) return;
      bus.toAll({ k: M.SNAP, p: packed });
      if (scene) {
        for (const st of packed.map(unpack)) {
          if (st.slot !== mySlot) scene.applyRemote(st);
        }
      }
    }, 1000 / STATE_HZ);
  }

  function checkEnd() {
    if (ended || !isHost) return;
    const alive = players.filter(p => !finals.has(p.slot));
    if (alive.length === 0) { finish(); return; }
    if (finals.size > 0 && !graceTimer) graceTimer = setTimeout(finish, GRACE * 1000);
  }

  function finish() {
    if (ended) return;
    ended = true;
    clearTimeout(graceTimer);
    clearInterval(snapTimer);
    if (scene) scene.freezeRun();
    const rows = players.map(p => {
      const fin = finals.get(p.slot);
      const live = states.get(p.slot);
      const sc = fin ? fin.sc : (live ? live.sc : (p.slot === mySlot && scene ? scene.score : 0));
      return {
        slot: p.slot, name: p.name,
        score: sc || 0, coins: Math.round((sc || 0) / 2),
        detail: `${sc || 0} obstáculos`,
        sort: sc || 0,
        metrics: p.slot === mySlot ? { pipes: sc || 0 } : undefined,
      };
    });
    onFinish(rows);
  }

  return {
    begin() { started.then(() => scene && scene.beginRun()); },
    playerLeft(slot) {
      if (!finals.has(slot)) {
        const live = states.get(slot);
        finals.set(slot, { sc: live ? live.sc : 0 });
      }
      if (scene) scene.remoteDead(slot);
      checkEnd();
    },
    destroy() {
      ended = true;
      clearTimeout(graceTimer);
      clearInterval(snapTimer);
      unbind();
      ui.setPauseMenu(null);
      ui.hideHUD();
      if (phaser.scene.isActive(sceneKey)) phaser.scene.stop(sceneKey);
    },
  };
}
