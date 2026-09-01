// Orquestrador: liga UI (screens), rede (NetSession) e jogo (GameScene).
//
// O HOST é autoritativo: mantém o roster, escolhe a dificuldade, sorteia a
// seed, dá a largada, consolida o estado de todo mundo num snapshot único e
// decreta o resultado. Os convidados só mandam o próprio estado e obedecem.
import Phaser from 'phaser';
import QRCode from 'qrcode';
import GameScene from './game/GameScene.js';
import { NetSession, normalizeCode } from './net/peer.js';
import { MSG, packState, unpackState } from './net/protocol.js';
import { makeSeed } from './core/rng.js';
import {
  GAME_W, GAME_H, GRACE_AFTER_DEATH, MAX_PLAYERS, STATE_HZ,
  SLOT_NAMES, DEFAULT_DIFFICULTY, getDifficulty,
} from './core/config.js';
import { buildTextures } from './game/textures.js';
import { textureKey, resolveSkin, DEFAULT_SKIN } from './game/skins.js';
import { sfx, unlockAudio, startMusic, stopMusic, getPrefs } from './game/audio.js';
import * as store from './core/storage.js';
import * as ui from './ui/screens.js';

let game = null;
let scene = null;
let net = null;
let phase = 'menu';
let room = { code: null, qr: null, link: null };

// Sala: no host é a fonte da verdade; no convidado é um espelho do ROSTER.
let lobby = { players: new Map(), difficulty: DEFAULT_DIFFICULTY, mySlot: 0 };

// Partida em andamento.
let m = null;

function resetMatch(mode) {
  if (m) { clearTimeout(m.graceTimer); clearInterval(m.snapTimer); }
  m = {
    mode,                    // 'solo' | 'net'
    seed: 0,
    difficulty: lobby.difficulty,
    roster: [],              // [{slot, name, skin}] participantes desta corrida
    states: new Map(),       // host: slot -> último estado recebido
    finals: new Map(),       // slot -> stats finais de quem já morreu
    selfDead: false,
    ended: false,
    graceTimer: null,
    snapTimer: null,
    againVotes: new Set(),
    resultCtl: null,
  };
}

const mySlot = () => (net ? (net.role === 'host' ? 0 : lobby.mySlot) : 0);
const slotName = (slot) => SLOT_NAMES[slot] || `Jogador ${slot + 1}`;
// nome do roster quando existe; senão o rótulo genérico do slot
const nameOf = (slot) => (lobby.players.get(slot)?.name) || slotName(slot);
const myName = () => store.sanitizeName(store.getProgress().name) || slotName(mySlot());

// ------------------------------------------------------------------
// Phaser
// ------------------------------------------------------------------
let gameReady = null;
function ensureGame() {
  if (gameReady) return gameReady;
  gameReady = new Promise((resolve) => {
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-root',
      backgroundColor: '#141a33',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_W,
        height: GAME_H,
      },
      scene: [],
    });
    game.events.once('ready', () => {
      // cena mínima só para gerar as texturas uma vez — assim a vitrine de
      // personagens consegue mostrar os bonecos antes da primeira corrida
      game.scene.add('boot', {
        create() { buildTextures(this); this.scene.stop(); resolve(); },
      }, true);
      game.scene.add('run', GameScene, false);
    });
  });
  return gameReady;
}

async function launchScene(data) {
  await ensureGame();
  return new Promise((resolve) => {
    const sc = game.scene.getScene('run');
    // o listener PRECISA ser registrado antes do start/restart:
    // o create pode disparar de forma síncrona
    sc.events.once('create', () => { scene = sc; resolve(); });
    if (sc.scene.isActive() || sc.scene.isPaused()) sc.scene.restart(data);
    else game.scene.start('run', data);
  });
}

function sceneHooks() {
  return {
    sendState: (st) => hostOrClientState(st),
    updateHUD: (s) => ui.updateHUD(s),
    onHit: () => {},
    onDead: (stats) => handleLocalDeath(stats),
  };
}

// O host guarda o próprio estado junto com o dos convidados;
// o convidado manda para o host.
function hostOrClientState(st) {
  if (!net) return;
  if (net.role === 'host') m.states.set(0, st);
  else net.send({ t: MSG.STATE, ...st });
}

// ------------------------------------------------------------------
// Partida
// ------------------------------------------------------------------
async function prepareMatch({ seed, difficulty, roster }) {
  const isNet = !!(net && net.connected);
  resetMatch(isNet ? 'net' : 'solo');
  m.seed = seed;
  m.difficulty = difficulty;
  m.roster = roster || [];

  phase = 'countdown';
  ui.hideUI();

  const me = mySlot();
  const rivals = m.roster
    .filter(p => p.slot !== me)
    .map(p => ({ slot: p.slot, name: p.name, skin: p.skin }));

  const progress = store.getProgress();
  await launchScene({
    seed, isNet, difficulty,
    hooks: sceneHooks(),
    mySkin: resolveSkin(progress.skin, progress.totalCoins).id,
    mySlot: me,
    rivals,
  });

  ui.showHUD(rivals.length > 0);
  startMusic();

  if (isNet && net.role === 'host') {
    clearInterval(m.snapTimer);
    m.snapTimer = setInterval(hostSendSnapshot, 1000 / STATE_HZ);
  }

  ui.runCountdown(() => {
    phase = 'running';
    scene.beginRun();
  });
}

function hostSendSnapshot() {
  if (!net || net.role !== 'host' || m.ended) return;
  const packed = [];
  for (const [slot, st] of m.states) packed.push(packState(slot, st));
  if (!packed.length) return;
  net.broadcast({ t: MSG.SNAP, p: packed });
  // o host consome o próprio snapshot: sem isso ele transmitiria a corrida
  // para todo mundo e veria os rivais congelados na largada
  if (scene && phase === 'running') {
    scene.applySnapshot(packed.map(unpackState).filter(s => s.slot !== 0));
  }
}

function hostStartMatch() {
  const seed = makeSeed();
  const roster = rosterList().map(p => ({ slot: p.slot, name: p.name, skin: p.skin }));
  const payload = { seed, difficulty: lobby.difficulty, roster };
  net.broadcast({ t: MSG.START, ...payload });
  // compensa metade da latência média para os countdowns ficarem alinhados
  setTimeout(() => prepareMatch(payload), Math.min(net.avgRtt() / 2, 300));
}

function handleLocalDeath(stats) {
  m.selfDead = true;
  const me = mySlot();
  m.finals.set(me, stats);

  if (m.mode === 'solo') {
    setTimeout(() => finishSolo(stats), 1200);
    return;
  }

  if (net.role === 'host') {
    const st = m.states.get(0);
    if (st) m.states.set(0, { ...st, dead: true });
    hostCheckEnd();
  } else {
    net.send({ t: MSG.DEAD, ...stats });
  }
  if (!allRivalsDead()) ui.hudMessage('💀 Você caiu! Acompanhe a corrida…');
}

function allRivalsDead() {
  return m.roster.filter(p => p.slot !== mySlot()).every(p => m.finals.has(p.slot));
}

// ---- fim de partida (só o host decide) ----
function hostCheckEnd() {
  if (m.ended || !net || net.role !== 'host') return;
  const alive = m.roster.filter(p => !m.finals.has(p.slot));
  if (alive.length === 0) { hostEndMatch(); return; }
  // primeiro morto dispara a contagem: quem sobrou tem alguns segundos
  // para ampliar a vantagem antes do apito final
  if (m.finals.size > 0 && !m.graceTimer) {
    m.graceTimer = setTimeout(hostEndMatch, GRACE_AFTER_DEATH * 1000);
  }
}

function hostEndMatch() {
  if (m.ended) return;
  const rows = m.roster.map(p => {
    const fin = m.finals.get(p.slot);
    const live = m.states.get(p.slot);
    const s = fin || (live ? { d: Math.floor(live.d), sc: Math.floor(live.sc), co: live.co || 0 } : { d: 0, sc: 0, co: 0 });
    return { slot: p.slot, name: p.name || slotName(p.slot), ...s };
  }).sort((a, b) => b.d - a.d);

  // empate no topo (ou ninguém saiu do lugar) não tem vencedor
  const tied = rows.length > 1 && rows[0].d === rows[1].d;
  const win = rows.length && rows[0].d > 0 && !tied ? rows[0].slot : -1;
  net.broadcast({ t: MSG.END, rows, win });
  onMatchEnd({ rows, win });
}

function onMatchEnd({ rows, win }) {
  if (m.ended) return;
  m.ended = true;
  clearTimeout(m.graceTimer);
  clearInterval(m.snapTimer);
  if (scene) scene.freezeRun();

  const me = mySlot();
  const mine = rows.find(r => r.slot === me) || { d: 0, sc: 0, co: 0 };
  const iWon = win === me;
  const noWinner = win < 0;
  if (iWon) sfx.win(); else if (noWinner) sfx.powerup(); else sfx.lose();

  const records = store.recordRace({
    dist: mine.d, score: mine.sc, coins: mine.co,
    speed: scene ? Math.round(scene.topSpeed * 3.6) : 0,
    won: iWon,
  });

  finishMatch({
    rows: rows.map(r => ({
      slot: r.slot, name: r.name, dist: r.d, score: r.sc, coins: r.co,
      win: r.slot === win, you: r.slot === me,
    })),
    title: noWinner ? 'EMPATE!' : (rows.find(r => r.slot === win)?.name || slotName(win)).toUpperCase(),
    trophy: noWinner ? '🤝' : (iWon ? '🏆' : '🏁'),
    note: noWinner ? 'Ninguém abriu vantagem.' : (iWon ? 'Você venceu! 🎉' : 'Peça revanche!'),
    records: recordLabels(records, mine),
    earned: mine.co,
    canRematch: true,
    isHost: net && net.role === 'host',
  });
}

function finishSolo(stats) {
  const records = store.recordRace({
    dist: stats.d, score: stats.sc, coins: stats.co,
    speed: stats.kmh, won: false,
  });
  finishMatch({
    rows: [{ name: 'Você', dist: stats.d, score: stats.sc, coins: stats.co, win: false, you: false }],
    title: 'FIM DA CORRIDA',
    trophy: '🏁',
    records: recordLabels(records, stats),
    earned: stats.co,
    canRematch: true,
    solo: true,
    exitLabel: 'VOLTAR AO MENU',
  });
}

function recordLabels(records, stats) {
  const out = [];
  if (records.dist) out.push(`Novo recorde de distância: ${stats.d.toLocaleString('pt-BR')} m`);
  if (records.score) out.push(`Nova pontuação máxima: ${stats.sc.toLocaleString('pt-BR')}`);
  if (records.speed && stats.kmh) out.push(`Nova velocidade máxima: ${stats.kmh} km/h`);
  return out;
}

function finishMatch(res) {
  phase = 'result';
  stopMusic();
  setTimeout(() => {
    ui.hideHUD();
    ui.hudMessage(null);
    m.resultCtl = ui.showResult(res, {
      again: () => {
        if (res.solo) { prepareMatch(soloConfig()); return; }
        if (net.role === 'host') {
          hostStartMatch();
        } else {
          net.send({ t: MSG.AGAIN });
          ui.toast('Avisando o host…');
        }
      },
      exit: () => leaveRoom(),
    });
  }, 900);
}

// ------------------------------------------------------------------
// Roster / lobby
// ------------------------------------------------------------------
function rosterList() {
  return [...lobby.players.values()].sort((a, b) => a.slot - b.slot);
}

function hostSyncRoster() {
  const players = rosterList().map(p => ({ slot: p.slot, name: p.name, skin: p.skin, ready: p.ready }));
  // `you` muda por destinatário, então cada convidado recebe o seu
  for (const slot of net.conns.keys()) {
    net.sendTo(slot, { t: MSG.ROSTER, you: slot, players, difficulty: lobby.difficulty });
  }
  if (phase === 'lobby') renderLobby();
}

function renderLobby() {
  const me = mySlot();
  const isHost = net.role === 'host';
  ui.showLobby({
    isHost,
    code: net.code,
    qr: isHost ? room.qr : null,
    link: room.link,
    maxPlayers: MAX_PLAYERS,
    difficulty: lobby.difficulty,
    players: rosterList().map(p => ({
      ...p, isYou: p.slot === me, isHost: p.slot === 0,
    })),
  }, {
    ready: () => {
      const p = lobby.players.get(me);
      if (p) p.ready = true;
      net.send({ t: MSG.READY, v: true });
      renderLobby();
    },
    start: () => {
      if (net.conns.size === 0) { ui.toast('Espere alguém entrar na sala'); return; }
      hostStartMatch();
    },
    setDifficulty: (id) => {
      lobby.difficulty = id;
      store.setDifficulty(id);
      hostSyncRoster();
    },
    leave: () => leaveRoom(),
  });
}

function enterLobby() {
  phase = 'lobby';
  renderLobby();
  sfx.powerup();
}

// ------------------------------------------------------------------
// Rede
// ------------------------------------------------------------------
function wireNet() {
  const progress = store.getProgress();
  const mySkinId = resolveSkin(progress.skin, progress.totalCoins).id;

  net.onJoin = () => {
    // o registro real do jogador acontece no HELLO, que traz skin e apelido
    sfx.coin();
  };

  net.onLeave = (slot) => {
    const gone = nameOf(slot);
    lobby.players.delete(slot);
    m.states.delete(slot);
    if (scene && phase === 'running') scene.remoteDead(slot);
    ui.toast(`${gone} saiu`);
    if (phase === 'lobby' || phase === 'room') { hostSyncRoster(); renderLobby(); }
    else if (phase === 'running' || phase === 'countdown') {
      m.finals.set(slot, m.finals.get(slot) || lastKnown(slot));
      hostCheckEnd();
    }
  };

  net.onHostGone = () => {
    ui.toast('O host encerrou a sala');
    leaveRoom();
  };

  // ---- host ----
  net.on(MSG.HELLO, (msg, slot) => {
    // apelido vem de outro aparelho: passa pelo mesmo saneamento do local
    const nick = store.sanitizeName(msg.name) || slotName(slot);
    lobby.players.set(slot, {
      slot, name: nick,
      skin: resolveSkin(msg.skin, Infinity).id,
      ready: false,
    });
    hostSyncRoster();
    ui.toast(`${nick} entrou na sala`);
    if (phase === 'room' || phase === 'lobby') enterLobby();
  });

  net.on(MSG.READY, (msg, slot) => {
    const p = lobby.players.get(slot);
    if (p) p.ready = !!msg.v;
    hostSyncRoster();
  });

  net.on(MSG.SKIN, (msg, slot) => {
    const p = lobby.players.get(slot);
    if (p) {
      p.skin = resolveSkin(msg.skin, Infinity).id;
      if (msg.name !== undefined) p.name = store.sanitizeName(msg.name) || slotName(slot);
    }
    hostSyncRoster();
  });

  net.on(MSG.STATE, (msg, slot) => {
    m.states.set(slot, msg);
  });

  net.on(MSG.DEAD, (msg, slot) => {
    m.finals.set(slot, { d: msg.d, sc: msg.sc, co: msg.co });
    const st = m.states.get(slot);
    if (st) m.states.set(slot, { ...st, dead: true });
    if (scene) scene.remoteDead(slot);
    if (!m.selfDead) ui.hudMessage(`💀 ${nameOf(slot)} caiu!`, 2200);
    hostCheckEnd();
  });

  net.on(MSG.AGAIN, (_msg, slot) => {
    m.againVotes.add(slot);
    ui.toast(`${nameOf(slot)} quer revanche!`);
  });

  // ---- convidado ----
  net.on(MSG.ROSTER, (msg) => {
    lobby.mySlot = msg.you;
    lobby.difficulty = msg.difficulty;
    lobby.players = new Map(msg.players.map(p => [p.slot, p]));
    if (phase === 'joining' || phase === 'room') enterLobby();
    else if (phase === 'lobby') renderLobby();
  });

  net.on(MSG.START, (msg) => {
    if (net.role === 'client') prepareMatch(msg);
  });

  net.on(MSG.SNAP, (msg) => {
    if (!scene || phase !== 'running') return;
    const me = mySlot();
    scene.applySnapshot(msg.p.map(unpackState).filter(s => s.slot !== me));
  });

  net.on(MSG.END, (msg) => {
    if (net.role === 'client') onMatchEnd(msg);
  });

  net.on(MSG.FULL, () => {
    ui.toast('Essa sala já está cheia (5 jogadores)');
    cleanupNet();
    showMultiplayer();
  });

  net.on(MSG.LEAVE, (_msg, slot) => {
    if (net.role === 'host') net.dropClient(slot);
    else leaveRoom();
  });

  return mySkinId;
}

// Propaga skin/apelido para a sala. No host é uma edição direta do roster;
// no convidado vira uma mensagem para o host redistribuir.
function broadcastMyIdentity() {
  if (!net || !net.connected) return;
  const p = store.getProgress();
  const skin = resolveSkin(p.skin, p.totalCoins).id;
  const name = store.sanitizeName(p.name);
  if (net.role === 'host') {
    const me = lobby.players.get(0);
    if (me) { me.skin = skin; me.name = name || slotName(0); }
    hostSyncRoster();
  } else {
    net.send({ t: MSG.SKIN, skin, name });
  }
}

function lastKnown(slot) {
  const st = m.states.get(slot);
  return st ? { d: Math.floor(st.d), sc: Math.floor(st.sc), co: st.co || 0 } : { d: 0, sc: 0, co: 0 };
}

async function createRoom() {
  phase = 'creating';
  ui.showConnecting('Criando sala');
  net = new NetSession();
  wireNet();
  try {
    const code = await net.createRoom();
    const link = `${location.origin}${location.pathname}?room=${code}`;
    const qr = await QRCode.toDataURL(link, {
      width: 380, margin: 1,
      color: { dark: '#141a33', light: '#ffffff' },
    });
    room = { code, qr, link };

    const progress = store.getProgress();
    lobby = {
      players: new Map([[0, {
        slot: 0,
        name: store.sanitizeName(progress.name) || slotName(0),
        skin: resolveSkin(progress.skin, progress.totalCoins).id,
        ready: true,
      }]]),
      difficulty: progress.diff || DEFAULT_DIFFICULTY,
      mySlot: 0,
    };
    resetMatch('net');
    enterLobby();
  } catch (err) {
    console.error(err);
    ui.toast('Não foi possível criar a sala. Verifique sua internet.');
    cleanupNet();
    showMultiplayer();
  }
}

async function joinRoom(code) {
  phase = 'joining';
  ui.showConnecting('Conectando');
  net = new NetSession();
  const skin = wireNet();
  try {
    await net.joinRoom(code);
    resetMatch('net');
    net.send({ t: MSG.HELLO, skin, name: store.sanitizeName(store.getProgress().name) });
    // o lobby abre quando o ROSTER chegar
  } catch (err) {
    console.error(err);
    const notFound = err && err.type === 'peer-unavailable';
    ui.toast(notFound ? 'Sala não encontrada. Confira o código.' : 'Falha ao conectar. Tente de novo.');
    cleanupNet();
    phase = 'join';
    ui.showJoin(code, joinActions());
  }
}

function cleanupNet() {
  if (net) { net.destroy(); net = null; }
  room = { code: null, qr: null, link: null };
  lobby = { players: new Map(), difficulty: store.getProgress().diff, mySlot: 0 };
}

function leaveRoom() {
  if (net) net.send({ t: MSG.LEAVE });
  cleanupNet();
  if (m) { clearTimeout(m.graceTimer); clearInterval(m.snapTimer); }
  stopMusic();
  ui.hideHUD();
  ui.hudMessage(null);
  if (game && game.scene.isActive('run')) game.scene.stop('run');
  showMenu();
}

// ------------------------------------------------------------------
// Navegação
// ------------------------------------------------------------------
function soloConfig() {
  return {
    seed: makeSeed(),
    difficulty: store.getProgress().diff || DEFAULT_DIFFICULTY,
    roster: [],
  };
}

function showMenu() {
  phase = 'menu';
  ui.showMenu(store.getProgress(), {
    play: () => showMultiplayer(),
    solo: () => prepareMatch(soloConfig()),
    skins: () => showSkins(),
    setName: (v) => {
      store.setName(v);
      broadcastMyIdentity();
      showMenu();
    },
    resetProgress: () => { store.resetProgress(); showMenu(); },
  });
}

async function showSkins() {
  await ensureGame();   // as texturas precisam existir para a vitrine
  phase = 'skins';
  ui.showSkins(store.getProgress(), (id) => game.textures.getBase64(textureKey(id)), {
    pick: (id) => {
      store.setSkin(id);
      broadcastMyIdentity();
      showSkins();
    },
    back: () => showMenu(),
  });
}

function showMultiplayer() {
  phase = 'mp';
  ui.showMultiplayer({
    create: () => createRoom(),
    join: () => { phase = 'join'; ui.showJoin('', joinActions()); },
    back: () => showMenu(),
  });
}

function joinActions() {
  return {
    enter: (code) => joinRoom(normalizeCode(code)),
    back: () => showMultiplayer(),
  };
}

// ------------------------------------------------------------------
// Boot
// ------------------------------------------------------------------
function boot() {
  const unlock = () => { unlockAudio(); if (getPrefs().music) startMusic(); };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  resetMatch('solo');

  const params = new URLSearchParams(location.search);
  const inviteCode = normalizeCode(params.get('room'));
  if (inviteCode && inviteCode.length >= 4) {
    history.replaceState(null, '', location.pathname);
    joinRoom(inviteCode);
  } else {
    showMenu();
  }

  ensureGame();
}

boot();

// gancho de inspeção para desenvolvimento (não interfere no jogo)
if (import.meta.env.DEV) {
  window.__ct = () => ({
    phase, scene, game, lobby, match: m,
    net: net ? { role: net.role, code: net.code, slot: mySlot(), connected: net.connected, players: net.playerCount } : null,
    progress: store.getProgress(),
  });
}
