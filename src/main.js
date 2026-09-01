// Orquestrador: liga UI (screens), rede (NetSession) e jogo (GameScene).
// O HOST é autoritativo: sorteia a seed, decide início, fim e resultado.
import Phaser from 'phaser';
import QRCode from 'qrcode';
import GameScene from './game/GameScene.js';
import { NetSession, normalizeCode } from './net/peer.js';
import { MSG } from './net/protocol.js';
import { makeSeed } from './core/rng.js';
import { GAME_W, GAME_H, GRACE_AFTER_DEATH } from './core/config.js';
import { sfx, unlockAudio, startMusic, stopMusic, getPrefs } from './game/audio.js';
import * as ui from './ui/screens.js';

let game = null;          // Phaser.Game (criado sob demanda)
let scene = null;         // instância da GameScene
let net = null;           // NetSession ativa (null = offline)
let phase = 'menu';
let room = { code: null, qr: null, link: null };

// estado da partida atual
let m = null;
function resetMatch(mode) {
  if (m && m.graceTimer) clearTimeout(m.graceTimer);
  m = {
    mode,                       // 'solo' | 'net'
    selfReady: false, oppReady: false,
    selfDead: false, oppDead: false,
    selfStats: null, oppStats: null,
    oppLast: { d: 0, sc: 0, co: 0 },
    ended: false, graceTimer: null,
    selfAgain: false, oppAgain: false,
    resultCtl: null,
  };
}

const myName = () => (net && net.role === 'client' ? 'Jogador 2' : 'Jogador 1');
const oppName = () => (net && net.role === 'client' ? 'Jogador 1' : 'Jogador 2');

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
      game.scene.add('run', GameScene, false);
      resolve();
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
    if (sc.scene.isActive() || sc.scene.isPaused()) {
      sc.scene.restart(data);
    } else {
      game.scene.start('run', data);
    }
  });
}

// hooks que a cena chama de volta
function sceneHooks() {
  return {
    sendState: (st) => { if (net) net.send({ t: MSG.STATE, ...st }); },
    updateHUD: (s) => ui.updateHUD(s),
    onHit: (lives) => { if (net) net.send({ t: MSG.HIT, lv: lives }); },
    onDead: (stats) => handleLocalDeath(stats),
  };
}

// ------------------------------------------------------------------
// Fluxo de partida
// ------------------------------------------------------------------
async function prepareMatch(seed) {
  const isNet = !!(net && net.connected);
  resetMatch(isNet ? 'net' : 'solo');
  phase = 'countdown';
  ui.hideUI();
  await launchScene({ seed, isNet, hooks: sceneHooks(), oppName: oppName() });
  ui.showHUD(isNet ? oppName() : null);
  startMusic();
  ui.runCountdown(() => {
    phase = 'running';
    scene.beginRun();
  });
}

function hostStartMatch() {
  const seed = makeSeed();
  net.send({ t: MSG.START, seed });
  // compensa metade da latência para os dois countdowns ficarem alinhados
  setTimeout(() => prepareMatch(seed), Math.min(net.rtt / 2, 300));
}

function handleLocalDeath(stats) {
  m.selfDead = true;
  m.selfStats = stats;

  if (m.mode === 'solo') {
    setTimeout(() => finishMatch({
      win: null,
      rows: [{ name: 'Você', ...toRow(stats), win: false, you: false }],
      title: 'FIM DA CORRIDA',
      trophy: '🏁',
      canRematch: false,
      solo: true,
      exitLabel: 'VOLTAR AO MENU',
    }), 1200);
    return;
  }

  net.send({ t: MSG.DEAD, ...stats });
  if (!m.oppDead) ui.hudMessage('💀 Você caiu! Acompanhe seu rival…');
  if (net.role === 'host') hostCheckEnd();
}

function hostCheckEnd() {
  if (m.ended) return;
  if (m.selfDead && m.oppDead) { hostEndMatch(); return; }
  if ((m.selfDead || m.oppDead) && !m.graceTimer) {
    // o sobrevivente ganha alguns segundos para ampliar (ou virar) o placar
    m.graceTimer = setTimeout(hostEndMatch, GRACE_AFTER_DEATH * 1000);
  }
}

function hostEndMatch() {
  if (m.ended) return;
  const h = m.selfDead ? m.selfStats : scene.getStats();
  const c = m.oppDead ? m.oppStats : m.oppLast;
  const win = h.d > c.d ? 'host' : c.d > h.d ? 'client' : 'tie';
  net.send({ t: MSG.END, win, h, c });
  onMatchEnd({ win, h, c });
}

function toRow(s) {
  return { dist: Math.floor(s.d || 0), score: Math.floor(s.sc || 0), coins: s.co || 0 };
}

function onMatchEnd({ win, h, c }) {
  if (m.ended) return;
  m.ended = true;
  clearTimeout(m.graceTimer);
  if (scene) scene.freezeRun();

  const iAmHost = net.role === 'host';
  const iWon = win === (iAmHost ? 'host' : 'client');
  const tie = win === 'tie';
  if (tie) sfx.powerup(); else if (iWon) sfx.win(); else sfx.lose();

  const rows = [
    { name: 'Jogador 1', ...toRow(h), win: win === 'host', you: iAmHost },
    { name: 'Jogador 2', ...toRow(c), win: win === 'client', you: !iAmHost },
  ].sort((a, b) => b.dist - a.dist);

  finishMatch({
    rows,
    title: tie ? 'EMPATE!' : (win === 'host' ? 'JOGADOR 1' : 'JOGADOR 2'),
    trophy: tie ? '🤝' : '🏆',
    note: iWon ? 'Você venceu! 🎉' : tie ? '' : 'Quase! Peça revanche.',
    canRematch: true,
  });
}

function finishMatch(res) {
  phase = 'result';
  stopMusic();
  setTimeout(() => {
    ui.hideHUD();
    ui.hudMessage(null);
    m.resultCtl = ui.showResult(res, {
      again: () => {
        if (res.solo) return;
        m.selfAgain = true;
        net.send({ t: MSG.AGAIN });
        hostMaybeRematch();
      },
      exit: () => leaveRoom(),
    });
    if (res.solo) {
      // no solo, "sair da sala" é só voltar ao menu — e revanche é imediata
      m.resultCtl = null;
    }
  }, 900);
}

function hostMaybeRematch() {
  if (net && net.role === 'host' && m.selfAgain && m.oppAgain) hostStartMatch();
}

function opponentGone() {
  const wasPhase = phase;
  if (wasPhase === 'running' || wasPhase === 'countdown') {
    // W.O.: quem ficou vence
    if (!m.ended) {
      const iAmHost = net.role === 'host';
      const my = m.selfDead ? m.selfStats : (scene ? scene.getStats() : { d: 0, sc: 0, co: 0 });
      const theirs = m.oppDead ? m.oppStats : m.oppLast;
      onMatchEnd({
        win: iAmHost ? 'host' : 'client',
        h: iAmHost ? my : theirs,
        c: iAmHost ? theirs : my,
      });
      ui.toast('O rival desconectou 📵');
    }
    return;
  }
  if (wasPhase === 'result') {
    ui.toast('O rival saiu da sala');
    if (m && m.resultCtl && m.resultCtl.againBtn) {
      m.resultCtl.againBtn.disabled = true;
      m.resultCtl.againBtn.textContent = 'RIVAL SAIU';
    }
    return;
  }
  // lobby / aguardando
  if (net && net.role === 'host') {
    ui.toast('Jogador 2 desconectou');
    showRoomScreen(); // volta a aguardar com o mesmo código
  } else {
    ui.toast('A sala foi encerrada');
    leaveRoom();
  }
}

// ------------------------------------------------------------------
// Rede: criação/entrada de sala e mensagens
// ------------------------------------------------------------------
function wireNet() {
  net.onPeerConnected = () => {
    if (net.role === 'client') net.send({ t: MSG.HELLO, name: 'Jogador 2' });
  };
  net.onPeerLeft = () => opponentGone();

  net.on(MSG.HELLO, () => {           // host: jogador 2 chegou
    net.send({ t: MSG.WELCOME, name: 'Jogador 1' });
    enterLobby();
  });
  net.on(MSG.WELCOME, () => enterLobby());  // client: host confirmou

  net.on(MSG.READY, (msg) => {
    m.oppReady = !!msg.v;
    if (phase === 'lobby') renderLobby();
    if (net.role === 'host' && m.selfReady && m.oppReady) hostStartMatch();
  });

  net.on(MSG.START, (msg) => {        // client: host deu a largada
    if (net.role === 'client') prepareMatch(msg.seed);
  });

  net.on(MSG.STATE, (msg) => {
    m.oppLast = { d: msg.d, sc: msg.sc, co: msg.co };
    if (scene && phase === 'running') scene.applyRemoteState(msg);
  });

  net.on(MSG.DEAD, (msg) => {
    m.oppDead = true;
    m.oppStats = { d: msg.d, sc: msg.sc, co: msg.co };
    if (scene) scene.remoteDead();
    if (!m.selfDead) ui.hudMessage(`💀 ${oppName()} caiu! Continue!`, 2600);
    if (net.role === 'host') hostCheckEnd();
  });

  net.on(MSG.END, (msg) => {          // client: host decretou o fim
    if (net.role === 'client') onMatchEnd(msg);
  });

  net.on(MSG.AGAIN, () => {
    m.oppAgain = true;
    if (!m.selfAgain) ui.toast(`${oppName()} quer revanche!`);
    hostMaybeRematch();
  });

  net.on(MSG.LEAVE, () => opponentGone());
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
    resetMatch('net');
    showRoomScreen();
  } catch (err) {
    console.error(err);
    ui.toast('Não foi possível criar a sala. Verifique sua internet.');
    cleanupNet();
    showMultiplayer();
  }
}

function showRoomScreen() {
  phase = 'room';
  resetMatch('net');
  ui.showRoom(room.code, room.qr, room.link, {
    cancel: () => leaveRoom(),
  });
}

async function joinRoom(code) {
  phase = 'joining';
  ui.showConnecting('Conectando');
  net = new NetSession();
  wireNet();
  try {
    await net.joinRoom(code);
    resetMatch('net');
    // o HELLO sai no onPeerConnected; o lobby abre quando chega o WELCOME
  } catch (err) {
    console.error(err);
    const notFound = err && err.type === 'peer-unavailable';
    ui.toast(notFound ? 'Sala não encontrada. Confira o código.' : 'Falha ao conectar. Tente de novo.');
    cleanupNet();
    ui.showJoin(code, joinActions());
    phase = 'join';
  }
}

function enterLobby() {
  phase = 'lobby';
  m.selfReady = false;
  m.oppReady = false;
  renderLobby();
  sfx.powerup();
}

function renderLobby() {
  ui.showLobby({
    isHost: net.role === 'host',
    code: net.code,
    selfReady: m.selfReady,
    oppReady: m.oppReady,
  }, {
    ready: () => {
      m.selfReady = true;
      net.send({ t: MSG.READY, v: true });
      renderLobby();
      if (net.role === 'host' && m.oppReady) hostStartMatch();
    },
    leave: () => leaveRoom(),
  });
}

function cleanupNet() {
  if (net) { net.destroy(); net = null; }
  room = { code: null, qr: null, link: null };
}

function leaveRoom() {
  if (net) net.send({ t: MSG.LEAVE });
  cleanupNet();
  if (m && m.graceTimer) clearTimeout(m.graceTimer);
  stopMusic();
  ui.hideHUD();
  ui.hudMessage(null);
  if (game && game.scene.isActive('run')) game.scene.stop('run');
  showMenu();
}

// ------------------------------------------------------------------
// Navegação
// ------------------------------------------------------------------
function showMenu() {
  phase = 'menu';
  ui.showMenu({
    play: () => showMultiplayer(),
    solo: () => prepareMatch(makeSeed()),
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
  // desbloqueia o áudio no primeiro gesto (regra de autoplay do Safari/Chrome)
  const unlock = () => { unlockAudio(); if (getPrefs().music) startMusic(); };
  document.addEventListener('pointerdown', unlock, { once: true });
  // impede pinch-zoom no iOS
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  resetMatch('solo');

  // link de convite (?room=XXXXX) — vindo do QR Code ou compartilhado
  const params = new URLSearchParams(location.search);
  const inviteCode = normalizeCode(params.get('room'));
  if (inviteCode && inviteCode.length >= 4) {
    history.replaceState(null, '', location.pathname); // evita re-entrar num refresh
    joinRoom(inviteCode);
  } else {
    showMenu();
  }

  // pré-aquece o Phaser em segundo plano para a 1ª partida abrir instantânea
  ensureGame();
}

boot();

// gancho de inspeção para desenvolvimento (não interfere no jogo)
if (import.meta.env.DEV) {
  window.__ct = () => ({ phase, scene, game, net: net ? { role: net.role, code: net.code, connected: net.connected, rtt: net.rtt } : null, match: m });
}
