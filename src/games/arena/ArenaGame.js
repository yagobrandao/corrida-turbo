// Arena Clash — adaptador para a plataforma.
//
// Responsabilidades: lobby de heróis (picks/pronto/dificuldade), o loop
// autoritativo no host (World.step a 20 Hz), snapshots por time para cada
// cliente a 10 Hz, inputs cliente→host, orientação paisagem (gira o Phaser
// compartilhado para 960×540 e devolve 480×854 ao sair), progressão
// permanente (maestria, K/D/A) e as linhas de resultado da plataforma.
import ArenaScene from './ArenaScene.js';
import { World } from './sim.js';
import { HEROES, HERO_BY_ID, TICK, SNAP_HZ, BOT_PROFILES } from './data.js';
import { getPrefs, setSound, setMusic } from '../../core/audio.js';
import { GAME_W, GAME_H } from '../../core/config.js';
import * as store from '../../core/storage.js';
import * as ui from '../../ui/gameui.js';

const LAND_W = 960, LAND_H = 540;
const SAVE = 'ct-arena-v1';
const M = { LOBBY: 'ar:lobby', PICK: 'ar:pick', READY: 'ar:ready', START: 'ar:start', IN: 'ar:in', SNAP: 'ar:snap', EV: 'ar:ev' };

// ---- progressão fora da partida (maestria por herói, estatísticas)
export function loadProgress() { try { return JSON.parse(localStorage.getItem(SAVE)) || { matches: 0, wins: 0, k: 0, d: 0, a: 0, mvp: 0, mastery: {}, xp: 0 }; } catch (e) { return { matches: 0, wins: 0, k: 0, d: 0, a: 0, mvp: 0, mastery: {}, xp: 0 }; } }
function saveProgress(p) { try { localStorage.setItem(SAVE, JSON.stringify(p)); } catch (e) { /* sem storage */ } }
export const masteryLevel = (xp) => 1 + Math.floor(Math.sqrt(xp / 300));

// a plataforma reaproveita a dificuldade global do perfil ('normal', 'hard'…); traduz para os perfis dos bots
const normDiff = (d) => BOT_PROFILES[d] ? d : ({ normal: 'medium', facil: 'easy', dificil: 'hard', insane: 'hard' }[d] || 'medium');

export function createGame(ctx) {
  const { phaser, bus, players, mySlot, isHost, seed, settings, onFinish } = ctx;
  let world = null, scene = null, ended = false, acc = 0, snapAcc = 0, lastSnap = null, pendingEv = [], loopEv = null;
  const lobby = { picks: players.map((p, i) => ({ slot: p.slot, name: p.name, heroId: null, ready: false, team: i % 2 })), difficulty: normDiff(settings && settings.difficulty), started: false };
  const myTeam = () => (lobby.picks.find(p => p.slot === mySlot) || { team: 0 }).team;

  // ---- paisagem
  const gate = document.createElement('div');
  gate.className = 'ar-gate hidden';
  document.body.classList.add('landscape-game');
  gate.innerHTML = '<div class="ar-gate-phone"></div><div class="ar-gate-txt">Gire seu dispositivo para jogar</div><div class="ar-gate-sub">Arena Clash é jogado na horizontal</div>';
  document.body.appendChild(gate);
  const checkOrient = () => {
    const portrait = window.innerHeight > window.innerWidth;
    gate.classList.toggle('hidden', !portrait);
    if (scene) scene.paused = portrait && !bus.online;
    // o ScaleManager nem sempre reage à troca de orientação: força o recálculo
    phaser.scale.refresh(); setTimeout(() => phaser.scale.refresh(), 350);
  };
  window.addEventListener('resize', checkOrient);
  phaser.scale.setGameSize(LAND_W, LAND_H);
  phaser.scale.refresh();
  checkOrient();

  ui.showHUD('');
  ui.setPauseMenu({ canPause: false, audio: { getPrefs, setSound, setMusic }, onQuit: () => finish(true) });

  // ---- rede
  const unbind = bus.on((p, from) => {
    if (!p || typeof p.k !== 'string') return;
    if (isHost) {
      if (p.k === M.PICK) { const e = lobby.picks.find(x => x.slot === from); if (e && !lobby.started) { e.heroId = HERO_BY_ID[p.heroId] ? p.heroId : e.heroId; syncLobby(); } }
      else if (p.k === M.READY) { const e = lobby.picks.find(x => x.slot === from); if (e) { e.ready = true; syncLobby(); maybeStart(); } }
      else if (p.k === M.IN && world) world.applyInput(from, sanitize(p.i));
    } else {
      if (p.k === M.LOBBY) { Object.assign(lobby, p.lobby); if (scene) scene.refreshSelect(lobby); }
      else if (p.k === M.START) { Object.assign(lobby, p.lobby); lobby.started = true; if (scene) scene.startMatch(); }
      else if (p.k === M.SNAP) { lastSnap = p.s; }
      else if (p.k === M.EV) { pendingEv.push(...p.e); }
    }
  });
  // nunca confiar em números vindos do cliente além do que o input permite
  const sanitize = (i) => {
    if (!i || typeof i !== 'object') return {};
    const o = {};
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
    if ('mx' in i) { o.mx = Math.max(-1, Math.min(1, num(i.mx))); o.my = Math.max(-1, Math.min(1, num(i.my))); }
    if ('ax' in i) { o.ax = Math.max(-1, Math.min(1, num(i.ax))); o.ay = Math.max(-1, Math.min(1, num(i.ay))); }
    if ('atk' in i) o.atk = !!i.atk;
    if (Array.isArray(i.cast)) o.cast = i.cast.slice(0, 4).map(Boolean);
    if (typeof i.buy === 'string') o.buy = i.buy;
    if (typeof i.lvl === 'number' && i.lvl >= 0 && i.lvl < 4) o.lvl = i.lvl | 0;
    if (i.recall) o.recall = 1;
    return o;
  };
  const syncLobby = () => { if (bus.online) bus.toAll({ k: M.LOBBY, lobby }); if (scene) scene.refreshSelect(lobby); };

  let autoStartAt = 0;
  function maybeStart() {
    if (!isHost || lobby.started) return;
    const all = lobby.picks.every(p => p.ready && p.heroId);
    if (all || (autoStartAt && Date.now() > autoStartAt)) startMatch();
  }
  function startMatch() {
    lobby.started = true;
    for (const p of lobby.picks) if (!p.heroId) p.heroId = HEROES[0].id;
    world = new World({ seed, players: lobby.picks.map(p => ({ slot: p.slot, name: p.name, heroId: p.heroId, team: p.team })), difficulty: lobby.difficulty });
    if (bus.online) bus.toAll({ k: M.START, lobby });
    if (scene) scene.startMatch();
  }

  // ---- ponte com a cena
  const ctl = {
    isHost, mySlot, lobby,
    pickHero(id) { const e = lobby.picks.find(x => x.slot === mySlot); if (e) e.heroId = id; if (isHost) syncLobby(); else bus.toHost({ k: M.PICK, heroId: id }); },
    ready() { const e = lobby.picks.find(x => x.slot === mySlot); if (e) e.ready = true; if (isHost) { syncLobby(); maybeStart(); } else bus.toHost({ k: M.READY }); },
    setDifficulty(d) { if (!isHost || !BOT_PROFILES[d]) return; lobby.difficulty = d; syncLobby(); },
    input(i) { if (isHost) { if (world) world.applyInput(mySlot, i); } else bus.toHost({ k: M.IN, i }); },
    snapshot() { if (isHost) return world ? world.snapshotFor(myTeam(), mySlot) : null; return lastSnap; },
    takeEvents() { const e = pendingEv; pendingEv = []; return e; },
    rewards(won, me, mvp) {
      if (ctl._rw) return ctl._rw;
      const xp = (won ? 120 : 60) + (me ? me.k * 8 + me.a * 4 : 0) + (mvp ? 40 : 0);
      const coins = (won ? 90 : 40) + (me ? me.k * 5 + me.a * 2 : 0) + (mvp ? 30 : 0);
      const mastery = (won ? 150 : 80) + (me ? me.k * 10 + me.a * 5 : 0);
      const heroId = me ? me.h : HEROES[0].id;
      const p = loadProgress();
      p.matches++; if (won) p.wins++; if (mvp) p.mvp++; p.xp += xp;
      if (me) { p.k += me.k; p.d += me.d; p.a += me.a; }
      p.mastery[heroId] = (p.mastery[heroId] || 0) + mastery;
      saveProgress(p);
      ctl._rw = { xp, coins, mastery, heroId, won, me, mvp };
      return ctl._rw;
    },
    finish() { finish(false); },
    world: () => world,            // só para testes/depuração no host
  };

  // ---- loop do host (20 Hz fixo, snapshots a 10 Hz)
  function hostLoop(delta) {
    if (!world || world.over && world._sentOver) return;
    acc += delta / 1000;
    let steps = 0;
    while (acc >= TICK && steps < 5) { world.step(); acc -= TICK; steps++; }
    const ev = world.drainEvents();
    pendingEv.push(...ev);
    if (bus.online) {
      if (ev.length) bus.toAll({ k: M.EV, e: ev });
      snapAcc += delta / 1000;
      if (snapAcc >= 1 / SNAP_HZ || world.over) {
        snapAcc = 0;
        for (const p of lobby.picks) if (p.slot !== mySlot) bus.toSlot(p.slot, { k: M.SNAP, s: world.snapshotFor(p.team, p.slot) });
      }
    }
    if (world.over) world._sentOver = true;
  }

  function finish(quit) {
    if (ended) return;
    ended = true;
    const snap = ctl.snapshot();
    const meB = snap ? snap.board.find(b => b.sl === mySlot) : null;
    const won = !!(snap && snap.over && snap.over.winner === myTeam());
    const rw = ctl._rw || (snap && snap.over ? ctl.rewards(won, meB, snap.over.mvp === (meB && meB.id)) : { xp: 0, coins: 0, mastery: 0 });
    const rows = [];
    const roster = snap ? snap.board.filter(b => b.sl !== null && b.sl !== undefined) : lobby.picks.map(p => ({ sl: p.slot, n: p.name, k: 0, d: 0, a: 0, tm: p.team, h: p.heroId }));
    for (const b of roster) {
      const w = !!(snap && snap.over && snap.over.winner === b.tm);
      rows.push({
        slot: b.sl, name: b.sl === mySlot ? 'Você' : b.n,
        score: (w ? 1000 : 0) + b.k * 30 + b.a * 10,
        coins: b.sl === mySlot ? rw.coins : (w ? 90 : 40),
        detail: `${HERO_BY_ID[b.h] ? HERO_BY_ID[b.h].name : ''} · ${b.k}/${b.d}/${b.a} · ${w ? 'vitória' : quit && !snap?.over ? 'abandonou' : 'derrota'}`,
        sort: (w ? 1000 : 0) + b.k * 30 + b.a * 10,
        metrics: { matches: 1, won: w ? 1 : 0, kills: b.k, assists: b.a, mvp: snap && snap.over && snap.over.mvp === b.id ? 1 : 0 },
      });
    }
    if (!isHost && bus.online) { /* o host publica; o cliente que abandona só sai */ if (ctx.onQuit && quit) { ctx.onQuit(); return; } }
    onFinish(rows);
  }

  // ---- cena
  const key = 'arena';
  if (!phaser.scene.getScene(key)) phaser.scene.add(key, ArenaScene, false);
  const sc = phaser.scene.getScene(key);
  const data = { ctl };
  if (sc.scene.isActive() || sc.scene.isPaused()) sc.scene.restart(data); else phaser.scene.start(key, data);
  scene = sc;
  const onStep = (t, delta) => { if (isHost) hostLoop(delta); };
  phaser.events.on('step', onStep);

  return {
    begin() {
      // a plataforma já fez o 3-2-1; a partida em si só começa quando todos escolherem
      autoStartAt = Date.now() + 45000;
      if (isHost) loopEv = setInterval(maybeStart, 1000);
      syncLobby();
    },
    playerLeft(slot) {
      if (!isHost) return;
      if (!lobby.started) { lobby.picks = lobby.picks.filter(p => p.slot !== slot); syncLobby(); maybeStart(); return; }
      // vira bot: ninguém fica parado no meio da arena
      if (world) for (const u of world.units.values()) if (u.kind === 'hero' && u.slot === slot) { u.slot = null; u.bot = true; u.name = u.name + ' (bot)'; u.ai = { lane: null, state: 'lane', next: 0.2, buildIdx: u.items.length, target: null }; }
    },
    destroy() {
      phaser.events.off('step', onStep);
      if (loopEv) clearInterval(loopEv);
      unbind();
      window.removeEventListener('resize', checkOrient);
      gate.remove();
      document.body.classList.remove('landscape-game');
      ui.setPauseMenu(null); ui.hideHUD();
      try { if (sc.scene.isActive()) sc.scene.stop(); } catch (e) { /* já parou */ }
      phaser.scale.setGameSize(GAME_W, GAME_H);
      phaser.scale.refresh();
    },
  };
}
