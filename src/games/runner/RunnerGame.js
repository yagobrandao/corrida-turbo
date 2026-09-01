// Adaptador do jogo de corrida para a plataforma.
//
// Toda a lógica de rede do runner (snapshot consolidado pelo host, mortes,
// tempo de graça) mora aqui — a Central de Jogos não sabe nada disso.
import RunnerScene from './RunnerScene.js';
import { GRACE_AFTER_DEATH, DEFAULT_DIFFICULTY } from './config.js';
import { STATE_HZ, slotName } from '../../core/config.js';
import { getProgress, upgradeLevel } from '../../core/storage.js';
import { resolveSkin } from './skins.js';
import { POWERUPS, effectiveValue } from './powerups.js';
import { getPrefs, setSound, setMusic } from '../../core/audio.js';
import * as ui from '../../ui/gameui.js';

// Tipos de mensagem no canal do jogo (payloads dentro de MSG.GAME).
const M = { STATE: 1, SNAP: 2, DEAD: 3, ATTACK: 4, DEBUFF: 5 };

// Snapshot compacto: array de números em vez de objeto com chaves,
// porque isso viaja 12x por segundo para cada jogador.
const pack = (slot, s) => [
  slot, Math.round(s.d * 10) / 10, s.ln, Math.round(s.jy * 100) / 100,
  s.sl ? 1 : 0, s.lv, Math.round(s.sc), s.dead ? 1 : 0,
];
const unpack = (a) => ({
  slot: a[0], d: a[1], ln: a[2], jy: a[3], sl: a[4], lv: a[5], sc: a[6], dead: !!a[7],
});

const HUD_HTML = `
  <div class="hud-me">
    <div id="r-dist" class="hud-big">0 m</div>
    <div class="hud-sub"><span id="r-coins">🪙 0</span><span id="r-lives">❤️❤️❤️</span></div>
    <div class="speedo">
      <div class="speedo-bar"><div id="r-fill"></div></div>
      <div id="r-kmh" class="speedo-num">0 <small>km/h</small></div>
    </div>
    <div id="r-fx" class="fx-row"></div>
  </div>`;

const hearts = (n) => '❤️'.repeat(Math.max(0, n)) + '🖤'.repeat(Math.max(0, 3 - n));

export function createGame(ctx) {
  const { phaser, bus, players, mySlot, isHost, seed, settings, onFinish } = ctx;
  const difficulty = (settings && settings.difficulty) || DEFAULT_DIFFICULTY;

  const states = new Map();   // host: slot -> último estado de cada jogador
  const finals = new Map();   // slot -> stats finais de quem já morreu
  let scene = null;
  let ended = false;
  let graceTimer = null;
  let snapTimer = null;
  let unbind = null;

  const progress = getProgress();
  const rivals = players
    .filter(p => p.slot !== mySlot)
    .map(p => ({ slot: p.slot, name: p.name, skin: p.skin }));

  // ---------------- HUD ----------------
  ui.showHUD(HUD_HTML);
  const el = {
    dist: ui.panelEl('#r-dist'), coins: ui.panelEl('#r-coins'), lives: ui.panelEl('#r-lives'),
    fill: ui.panelEl('#r-fill'), kmh: ui.panelEl('#r-kmh'), fx: ui.panelEl('#r-fx'),
  };

  // valores efetivos dos power-ups deste jogador, já com as melhorias compradas
  const puValues = {};
  for (const pu of POWERUPS) puValues[pu.id] = effectiveValue(pu, upgradeLevel(pu.id));

  // botão de pausa: no solo congela de verdade; em rede só abre as opções
  ui.setPauseMenu({
    canPause: !bus.online,
    audio: { getPrefs, setSound, setMusic },
    onPause: () => { if (!bus.online && scene) scene.paused = true; },
    onResume: () => { if (scene) scene.paused = false; },
    onQuit: () => ctx.onQuit && ctx.onQuit(),
  });

  function paintHUD(s) {
    el.dist.textContent = ui.nf(s.dist) + ' m';
    el.coins.textContent = '🪙 ' + s.coins;
    el.lives.textContent = hearts(s.lives);
    el.fill.style.width = Math.max(0, Math.min(1, s.speedFrac)) * 100 + '%';
    el.kmh.innerHTML = `${s.kmh} <small>km/h</small>`;
    el.kmh.classList.toggle('turbo', s.speedFrac > 0.75);
    el.fx.innerHTML = (s.fx || []).map(f =>
      `<span class="fx-chip ${f.bad ? 'bad' : ''}">${f.emoji} ${f.left}s</span>`).join('');
    ui.updateBoard(s.rivals.map(r => ({
      slot: r.slot,
      name: `${r.name} ${r.alive ? hearts(r.lives) : '💀'}`,
      value: r.alive
        ? (r.delta >= 0 ? `+${ui.nf(r.delta)} m` : `${ui.nf(Math.abs(r.delta))} m atrás`)
        : ui.nf(r.dist) + ' m',
      tone: r.alive ? (r.delta >= 0 ? 'ahead' : 'behind') : '',
      alive: r.alive,
    })));
  }

  // ---------------- cena ----------------
  const hooks = {
    updateHUD: paintHUD,
    onHit: () => {},
    // tiro: derruba o rival vivo mais à frente; nevasca: todos os rivais.
    // O pedido vai ao host, que conhece as posições e roteia o efeito.
    onOffense: (puId, secs) => {
      if (!bus.online) return;
      bus.toHost({ k: M.ATTACK, pu: puId, s: secs });
    },
    onPowerup: (puId) => {
      const pu = POWERUPS.find(p => p.id === puId);
      if (pu) ui.message(`${pu.emoji} ${pu.name}!`, 1300);
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
        ui.message('💀 Você caiu! Acompanhe a corrida…');
      }
    },
  };

  const sceneKey = 'runner';
  if (!phaser.scene.getScene(sceneKey)) phaser.scene.add(sceneKey, RunnerScene, false);

  const started = new Promise((resolve) => {
    const sc = phaser.scene.getScene(sceneKey);
    // o listener precisa existir antes do start: o create pode ser síncrono
    sc.events.once('create', () => { scene = sc; resolve(); });
    const data = {
      seed, difficulty, hooks, rivals, mySlot, puValues,
      isNet: bus.online,
      mySkin: resolveSkin(progress.skin, progress.totalCoins).id,
    };
    if (sc.scene.isActive() || sc.scene.isPaused()) sc.scene.restart(data);
    else phaser.scene.start(sceneKey, data);
  });

  // ---------------- rede ----------------
  unbind = bus.on((p, from) => {
    if (!p) return;
    if (p.k === M.STATE && isHost) {
      states.set(from, p.s);
    } else if (p.k === M.ATTACK && isHost) {
      // host resolve o alvo: tiro pega o vivo mais à frente (que não seja o
      // atirador); nevasca pega todos menos o atirador
      const alive = players.filter(pl => pl.slot !== from && !finals.has(pl.slot));
      let targets = [];
      if (p.pu === 'tiro') {
        let best = null;
        for (const pl of alive) {
          const st = pl.slot === mySlot ? states.get(mySlot) : states.get(pl.slot);
          const d = st ? st.d : 0;
          if (!best || d > best.d) best = { slot: pl.slot, d };
        }
        if (best) targets = [best.slot];
      } else {
        targets = alive.map(pl => pl.slot);
      }
      for (const t of targets) {
        if (t === mySlot) { if (scene) scene.applyDebuff(p.s); }
        else bus.toSlot(t, { k: M.DEBUFF, s: p.s, by: from });
      }
      if (targets.length && !targets.includes(mySlot)) {
        ui.message(`${nameOf(from)} atacou! ${p.pu === 'tiro' ? '🎯' : '🧊'}`, 1600);
      }
    } else if (p.k === M.DEBUFF && !isHost) {
      if (scene) scene.applyDebuff(p.s);
      ui.message(`🐌 ${nameOf(p.by)} te deixou lento!`, 2000);
    } else if (p.k === M.DEAD && isHost) {
      finals.set(from, { d: p.d, sc: p.sc, co: p.co, kmh: p.kmh });
      const st = states.get(from);
      if (st) states.set(from, { ...st, dead: true });
      if (scene) scene.remoteDead(from);
      if (!finals.has(mySlot)) ui.message(`💀 ${nameOf(from)} caiu!`, 2200);
      checkEnd();
    } else if (p.k === M.SNAP && !isHost) {
      if (scene) scene.applySnapshot(p.p.map(unpack).filter(s => s.slot !== mySlot));
    }
  });

  const nameOf = (slot) => (players.find(p => p.slot === slot)?.name) || slotName(slot);

  if (isHost && bus.online) {
    snapTimer = setInterval(() => {
      if (ended) return;
      const packed = [];
      for (const [slot, st] of states) packed.push(pack(slot, st));
      if (!packed.length) return;
      bus.toAll({ k: M.SNAP, p: packed });
      // o host consome o próprio snapshot: sem isso ele transmitiria a corrida
      // para todo mundo e veria os rivais congelados na largada
      if (scene) scene.applySnapshot(packed.map(unpack).filter(s => s.slot !== mySlot));
    }, 1000 / STATE_HZ);
  }

  // ---------------- fim ----------------
  function checkEnd() {
    if (ended || !isHost) return;
    const alive = players.filter(p => !finals.has(p.slot));
    if (alive.length === 0) { finish(); return; }
    // o primeiro morto dispara a contagem: quem sobrou tem alguns segundos
    // para ampliar a vantagem antes do apito final
    if (finals.size > 0 && !graceTimer) {
      graceTimer = setTimeout(finish, GRACE_AFTER_DEATH * 1000);
    }
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
      const s = fin || (live
        ? { d: Math.floor(live.d), sc: Math.floor(live.sc), co: live.co || 0 }
        : { d: 0, sc: 0, co: 0 });
      return {
        slot: p.slot, name: p.name,
        score: Math.floor(s.sc), coins: s.co || 0,
        detail: `${ui.nf(Math.floor(s.d))} m`,
        sort: s.d,
      };
    });
    onFinish(rows);
  }

  // Solo: sem host remoto, o fim é a própria morte.
  if (!bus.online) {
    const solo = setInterval(() => {
      if (scene && scene.dead && !ended) { clearInterval(solo); setTimeout(finish, 1200); }
    }, 200);
    var soloTimer = solo;
  }

  return {
    // chamado pela plataforma quando o countdown termina
    begin() { started.then(() => scene && scene.beginRun()); },
    // um jogador caiu da rede: conta como eliminado
    playerLeft(slot) {
      if (!finals.has(slot)) {
        const live = states.get(slot);
        finals.set(slot, live
          ? { d: Math.floor(live.d), sc: Math.floor(live.sc), co: live.co || 0 }
          : { d: 0, sc: 0, co: 0 });
      }
      if (scene) scene.remoteDead(slot);
      checkEnd();
    },
    destroy() {
      ended = true;
      clearTimeout(graceTimer);
      clearInterval(snapTimer);
      if (typeof soloTimer !== 'undefined') clearInterval(soloTimer);
      if (unbind) unbind();
      ui.setPauseMenu(null);
      ui.hideHUD();
      if (phaser.scene.isActive(sceneKey)) phaser.scene.stop(sceneKey);
    },
  };
}
