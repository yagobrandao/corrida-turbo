// Orquestrador da plataforma: Central de Jogos, salas, lobby e ciclo de
// partida. Os jogos em si são caixas-pretas carregadas de games/index.js.
//
// O HOST é autoritativo: mantém o roster, escolhe as opções, sorteia a seed,
// dá a largada e publica o resultado. A UI nunca fala com a rede diretamente.
import Phaser from 'phaser';
import QRCode from 'qrcode';
import { GAME_W, GAME_H, MAX_PLAYERS, slotName } from './core/config.js';
import { makeSeed } from './core/rng.js';
import { NetSession, normalizeCode } from './net/peer.js';
import { MSG } from './net/protocol.js';
import { makeBus, makeOfflineBus } from './net/bus.js';
import { announceRoom, listRooms, releaseHub } from './net/directory.js';
import { GAMES, getGame, defaultSettings } from './games/index.js';
import { resolveSkin } from './games/runner/skins.js';
import { resolveCosmetics } from './core/cosmetics.js';
import { textureKey } from './games/runner/skins.js';
import { buildTextures } from './games/runner/textures.js';
import { POWERUPS, MAX_LEVEL, upgradeCost, effectiveValue } from './games/runner/powerups.js';
import { sfx, unlockAudio, startMusic, stopMusic, getPrefs } from './core/audio.js';
import * as store from './core/storage.js';
import * as quests from './core/quests.js';
import * as ui from './ui/screens.js';
import * as gameui from './ui/gameui.js';

let phaser = null;
let net = null;
let phase = 'hub';
let hubState = { filter: 'todos', rooms: [], loadingRooms: false };
let room = null;      // { code, qr, link, gameId, visibility, maxPlayers, settings }
let lobby = { players: new Map(), mySlot: 0 };
let announcer = null; // anúncio no diretório de salas públicas
let match = null;     // { game, bus, players, ended, rows? }

const myName = () => store.sanitizeName(store.getProgress().name) || 'Jogador';
const mySlot = () => (net && net.role === 'client' ? lobby.mySlot : 0);
const nameOf = (slot) => (lobby.players.get(slot)?.name) || slotName(slot);

// ------------------------------------------------------------------
// Phaser (compartilhado por todos os jogos de canvas)
// ------------------------------------------------------------------
let phaserReady = null;
function ensurePhaser() {
  if (phaserReady) return phaserReady;
  phaserReady = new Promise((resolve) => {
    phaser = new Phaser.Game({
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
    phaser.events.once('ready', () => {
      // cena mínima só para as texturas dos personagens existirem cedo
      // (a vitrine de skins usa getBase64 delas)
      phaser.scene.add('boot', {
        create() { buildTextures(this); this.scene.stop(); resolve(); },
      }, true);
    });
  });
  return phaserReady;
}

// ------------------------------------------------------------------
// Central de Jogos
// ------------------------------------------------------------------
function showHub() {
  phase = 'hub';
  ui.showHub({
    progress: store.getProgress(),
    pendingQuests: quests.pendingCount(),
    ...hubState,
  }, hubActions());
  refreshRooms();
}

// Missões: a tela é burra, o motor está em core/quests.js
let questTab = 'daily';
function showQuestsScreen() {
  phase = 'quests';
  ui.showQuests(quests.getQuests(), questTab, {
    tab: (t) => { questTab = t; showQuestsScreen(); },
    claim: (id) => {
      const reward = quests.claim(id);
      if (reward) { sfx.coin(); ui.toast(`+${reward} moedas resgatadas!`); }
      showQuestsScreen();
    },
    back: () => showHub(),
  });
}

function hubActions() {
  return {
    filter: (cat) => { hubState.filter = cat; showHub(); },
    pickGame: (id) => showGameDetail(id),
    joinCode: (code) => joinRoom(code),
    refresh: () => refreshRooms(true),
    create: (gameId) => showCreate(gameId),
    join: () => { phase = 'join'; ui.showJoin('', joinActions()); },
    setName: (v) => {
      store.setName(v);
      broadcastIdentity();
      showHub();
    },
    quests: () => showQuestsScreen(),
    skins: () => showSkinsScreen(),
    upgrades: () => showUpgrades(),
    resetProgress: () => { store.resetProgress(); quests.resetQuests(); showHub(); },
  };
}

let refreshing = false;
async function refreshRooms(manual = false) {
  if (refreshing) return;
  refreshing = true;
  hubState.loadingRooms = true;
  if (manual) ui.showHub({ progress: store.getProgress(), ...hubState }, hubActions());
  try {
    const rooms = await listRooms();
    hubState.rooms = rooms;
  } catch (_) {
    hubState.rooms = [];
  }
  hubState.loadingRooms = false;
  refreshing = false;
  if (phase === 'hub') ui.showHub({ progress: store.getProgress(), ...hubState }, hubActions());
}

function showGameDetail(gameId) {
  phase = 'detail';
  ui.showGameDetail(gameId, {
    create: (id) => showCreate(id),
    solo: (id) => startSolo(id),
    back: () => showHub(),
  });
}

// ------------------------------------------------------------------
// Criar sala
// ------------------------------------------------------------------
let createForm = null;
function showCreate(gameId) {
  phase = 'create';
  const g = getGame(gameId || (createForm && createForm.gameId) || 'runner');
  if (!createForm || gameId) {
    createForm = {
      gameId: g.id,
      visibility: 'public',
      maxPlayers: Math.min(g.maxPlayers, MAX_PLAYERS),
      settings: defaultSettings(g),
    };
  }
  ui.showCreate(createForm, {
    change: (patch) => {
      if (patch.gameId && patch.gameId !== createForm.gameId) {
        const ng = getGame(patch.gameId);
        createForm.gameId = ng.id;
        createForm.maxPlayers = Math.min(ng.maxPlayers, MAX_PLAYERS);
        createForm.settings = defaultSettings(ng);
      }
      if (patch.visibility) createForm.visibility = patch.visibility;
      if (patch.maxPlayers) createForm.maxPlayers = patch.maxPlayers;
      if (patch.setting) createForm.settings[patch.setting[0]] = patch.setting[1];
      showCreate();
    },
    submit: () => createRoom(),
    back: () => showHub(),
  });
}

async function createRoom() {
  phase = 'creating';
  ui.showBusy('Criando sala');
  net = new NetSession();
  wireNet();
  try {
    const code = await net.createRoom();
    const g = getGame(createForm.gameId);
    net.capacity = Math.min(createForm.maxPlayers, g.maxPlayers, MAX_PLAYERS);

    const link = `${location.origin}${location.pathname}?room=${code}`;
    const qr = await QRCode.toDataURL(link, {
      width: 380, margin: 1, color: { dark: '#141a33', light: '#ffffff' },
    });
    room = { code, qr, link, ...createForm };

    const progress = store.getProgress();
    lobby = {
      players: new Map([[0, {
        slot: 0, name: myName(),
        skin: resolveSkin(progress.skin, progress.totalCoins).id,
        cos: resolveCosmetics(progress),
        ready: true,
      }]]),
      mySlot: 0,
    };

    // sala pública entra no diretório; o snapshot é relido a cada heartbeat
    if (room.visibility === 'public') {
      announcer = announceRoom(() => room && ({
        code: room.code,
        game: room.gameId,
        host: nameOf(0),
        players: lobby.players.size,
        max: room.maxPlayers,
      }));
    }
    enterLobby();
  } catch (err) {
    console.error(err);
    ui.toast('Não foi possível criar a sala. Verifique sua internet.');
    cleanupNet();
    showHub();
  }
}

// ------------------------------------------------------------------
// Entrar
// ------------------------------------------------------------------
function joinActions() {
  return {
    enter: (code) => joinRoom(normalizeCode(code)),
    back: () => showHub(),
  };
}

async function joinRoom(code) {
  phase = 'joining';
  ui.showBusy('Conectando');
  net = new NetSession();
  wireNet();
  try {
    await net.joinRoom(code);
    const progress = store.getProgress();
    net.send({
      t: MSG.HELLO,
      skin: resolveSkin(progress.skin, progress.totalCoins).id,
      cos: resolveCosmetics(progress),
      name: myName(),
    });
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

// ------------------------------------------------------------------
// Lobby
// ------------------------------------------------------------------
function enterLobby() {
  phase = 'lobby';
  renderLobby();
  sfx.powerup();
}

function renderLobby() {
  if (phase !== 'lobby' || !room) return;
  const isHost = net.role === 'host';
  ui.showLobby({
    isHost,
    code: room.code,
    qr: room.qr,
    link: room.link,
    room,
    players: [...lobby.players.values()].sort((a, b) => a.slot - b.slot).map(p => ({
      ...p, isYou: p.slot === mySlot(), isHost: p.slot === 0,
    })),
  }, {
    ready: () => {
      const p = lobby.players.get(mySlot());
      if (p) p.ready = true;
      net.send({ t: MSG.READY, v: true });
      renderLobby();
    },
    setSetting: (id, val) => {
      room.settings[id] = val;
      hostSyncRoster();
    },
    start: () => hostStartMatch(),
    leave: () => leaveRoom(),
  });
}

function hostSyncRoster() {
  if (!net || net.role !== 'host') return;
  const players = [...lobby.players.values()].map(p => ({
    slot: p.slot, name: p.name, skin: p.skin, cos: p.cos, ready: p.ready,
  }));
  const roomInfo = {
    gameId: room.gameId, visibility: room.visibility,
    maxPlayers: room.maxPlayers, settings: room.settings, code: room.code,
  };
  for (const slot of net.conns.keys()) {
    net.sendTo(slot, { t: MSG.ROSTER, you: slot, players, room: roomInfo });
  }
  if (announcer) announcer.update();
  renderLobby();
}

// ------------------------------------------------------------------
// Ciclo de partida
// ------------------------------------------------------------------
function hostStartMatch() {
  const g = getGame(room.gameId);
  if (lobby.players.size < Math.max(2, g.minPlayers)) {
    ui.toast(`Precisa de pelo menos ${Math.max(2, g.minPlayers)} jogadores`);
    return;
  }
  const seed = makeSeed();
  const players = [...lobby.players.values()]
    .sort((a, b) => a.slot - b.slot)
    .map(p => ({ slot: p.slot, name: p.name, skin: p.skin, cos: p.cos }));
  const payload = { seed, game: room.gameId, settings: room.settings, players };
  net.locked = true;   // ninguém entra no meio da partida
  net.broadcast({ t: MSG.START, ...payload });
  setTimeout(() => startMatch(payload), Math.min(net.avgRtt() / 2, 300));
}

async function startMatch({ seed, game: gameId, settings, players }) {
  const g = getGame(gameId);
  phase = 'match';
  ui.hideUI();
  stopMusic();

  // instruções na primeira vez que joga este jogo
  if (!store.hasSeenHowTo(gameId)) {
    store.markHowToSeen(gameId);
    await ui.showHowTo(gameId);
  }

  const isNet = !!(net && net.connected);
  const bus = isNet ? makeBus(net, net.role === 'host') : makeOfflineBus();
  await ensurePhaser();

  const mod = await g.load();
  const instance = mod.createGame({
    phaser, bus, players,
    mySlot: mySlot(),
    isHost: !isNet || net.role === 'host',
    seed, settings,
    ui: gameui,
    onFinish: (rows) => hostPublishResult(rows),
    onQuit: () => quitMatch(),
  });

  match = { game: instance, bus, players, gameId, ended: false };
  startMusic();
  gameui.runCountdown(() => instance.begin(), 'VALENDO!');
}

// O jogo devolve as linhas; o host publica para todos.
function hostPublishResult(rows) {
  if (!match || match.ended) return;
  const isNet = match.bus.online;
  if (isNet && net.role === 'host') net.broadcast({ t: MSG.FINISH, rows });
  onMatchEnd(rows);
}

function onMatchEnd(rows) {
  if (!match || match.ended) return;
  match.ended = true;
  const me = mySlot();
  const sorted = [...rows].sort((a, b) => (b.sort ?? b.score) - (a.sort ?? a.score));
  const top = sorted[0];
  const tied = sorted.length > 1 && (sorted[0].sort ?? sorted[0].score) === (sorted[1].sort ?? sorted[1].score);
  const winSlot = top && !tied && (top.sort ?? top.score) > 0 ? top.slot : -1;
  const mine = rows.find(r => r.slot === me) || { score: 0, coins: 0 };
  const iWon = winSlot === me;

  if (iWon) sfx.win(); else if (winSlot < 0) sfx.powerup(); else sfx.lose();

  const solo = rows.length <= 1;
  const records = store.recordRace({
    dist: 0, score: mine.score || 0, coins: mine.coins || 0, speed: 0, won: iWon,
  });

  // missões e conquistas: um evento normalizado, as regras moram em quests.js
  const quest = quests.recordMatch({
    gameId: match.gameId,
    won: iWon,
    score: mine.score || 0,
    coins: mine.coins || 0,
    players: rows.length,
    solo,
    metrics: mine.metrics || {},
    totalGames: GAMES.length,
  });

  const cleanup = () => {
    if (match && match.game) match.game.destroy();
    if (match && match.bus) match.bus.dispose();
  };

  setTimeout(() => {
    cleanup();
    stopMusic();
    phase = 'result';
    if (net) net.locked = false;
    ui.showResult({
      gameId: match.gameId,
      rows: sorted.map(r => ({
        slot: r.slot, name: r.name, score: r.score, detail: r.detail,
        win: r.slot === winSlot, you: r.slot === me,
      })),
      title: solo ? 'FIM DE JOGO' : (winSlot < 0 ? 'EMPATE!' : (rows.find(r => r.slot === winSlot)?.name || '').toUpperCase()),
      trophy: solo ? '🏁' : (winSlot < 0 ? '🤝' : '🏆'),
      note: solo ? '' : (iWon ? 'Você venceu! 🎉' : winSlot < 0 ? 'Ninguém abriu vantagem.' : 'Peça revanche!'),
      records: records.score ? [`Nova pontuação máxima: ${(mine.score || 0).toLocaleString('pt-BR')}`] : [],
      earned: mine.coins || 0,
      canRematch: true,
      isHost: !net || net.role === 'host',
      exitLabel: solo && !net ? 'VOLTAR À CENTRAL' : 'SAIR DA SALA',
    }, {
      again: () => {
        if (!net) { startSolo(match.gameId); return; }
        if (net.role === 'host') hostStartMatch();
        else { net.send({ t: MSG.AGAIN }); ui.toast('Pedido enviado ao host'); }
      },
      exit: () => leaveRoom(),
    });

    // conquistas destravadas entram sozinhas; missões prontas só avisam
    if (quest.unlocked.length) {
      setTimeout(() => ui.showRewards({ unlocked: quest.unlocked, claimedNow: [] }), 700);
    } else if (quest.ready.length) {
      ui.toast(`🎯 ${quest.ready.length} ${quest.ready.length === 1 ? 'missão pronta' : 'missões prontas'} para resgate!`);
    }
  }, 1000);
}

// Abandono no meio da partida (botão de pausa).
function quitMatch() {
  if (match && match.game) { match.game.destroy(); match.bus.dispose(); }
  match = null;
  gameui.clearStage();
  gameui.hideHUD();
  leaveRoom();
}

// Treino solo: sem sala, sem rede.
async function startSolo(gameId) {
  cleanupNet();
  const g = getGame(gameId);
  const progress = store.getProgress();
  await startMatch({
    seed: makeSeed(),
    game: gameId,
    settings: defaultSettings(g).difficulty ? { ...defaultSettings(g), difficulty: progress.diff } : defaultSettings(g),
    players: [{ slot: 0, name: myName(), skin: resolveSkin(progress.skin, progress.totalCoins).id, cos: resolveCosmetics(progress) }],
  });
}

// ------------------------------------------------------------------
// Rede: mensagens da plataforma
// ------------------------------------------------------------------
function wireNet() {
  net.onJoin = () => sfx.coin();

  net.onLeave = (slot) => {
    const who = nameOf(slot);
    lobby.players.delete(slot);
    if (phase === 'match' && match && !match.ended) {
      ui.toast(`⚠️ ${who} saiu da partida`);
      if (match.game.playerLeft) match.game.playerLeft(slot);
    } else if (phase === 'lobby') {
      ui.toast(`${who} saiu`);
      hostSyncRoster();
    }
  };

  net.onHostGone = () => {
    ui.toast('O host encerrou a sala');
    if (match && !match.ended) {
      // sem host não há juiz: encerra com o placar local conhecido
      quitMatch();
    } else {
      leaveRoom();
    }
  };

  // ---- host ----
  net.on(MSG.HELLO, (msg, slot) => {
    const nick = store.sanitizeName(msg.name) || slotName(slot);
    lobby.players.set(slot, {
      slot, name: nick,
      skin: resolveSkin(msg.skin, Infinity).id,
      cos: msg.cos || null,
      ready: false,
    });
    ui.toast(`${nick} entrou na sala`);
    hostSyncRoster();
    if (phase !== 'lobby') enterLobby();
  });

  net.on(MSG.READY, (msg, slot) => {
    const p = lobby.players.get(slot);
    if (p) p.ready = !!msg.v;
    hostSyncRoster();
  });

  net.on(MSG.IDENT, (msg, slot) => {
    const p = lobby.players.get(slot);
    if (p) {
      p.skin = resolveSkin(msg.skin, Infinity).id;
      if (msg.cos) p.cos = msg.cos;
      if (msg.name !== undefined) p.name = store.sanitizeName(msg.name) || slotName(slot);
    }
    hostSyncRoster();
  });

  net.on(MSG.AGAIN, (_msg, slot) => {
    ui.toast(`${nameOf(slot)} quer jogar de novo!`);
  });

  net.on(MSG.LEAVE, (_msg, slot) => {
    if (net.role === 'host') net.dropClient(slot);
    else leaveRoom();
  });

  // ---- convidado ----
  net.on(MSG.ROSTER, (msg) => {
    lobby.mySlot = msg.you;
    lobby.players = new Map(msg.players.map(p => [p.slot, p]));
    room = { ...(room || {}), ...msg.room, qr: null, link: null };
    if (phase === 'joining') enterLobby();
    else if (phase === 'lobby') renderLobby();
  });

  net.on(MSG.START, (msg) => {
    if (net.role === 'client') startMatch(msg);
  });

  net.on(MSG.FINISH, (msg) => {
    if (net.role === 'client') onMatchEnd(msg.rows);
  });

  net.on(MSG.FULL, () => {
    ui.toast('Essa sala já está cheia');
    cleanupNet();
    showHub();
  });

  net.on(MSG.KICKED, () => {
    ui.toast('A partida dessa sala já começou');
    cleanupNet();
    showHub();
  });
}

function broadcastIdentity() {
  if (!net || !net.connected) return;
  const p = store.getProgress();
  const skin = resolveSkin(p.skin, p.totalCoins).id;
  const cos = resolveCosmetics(p);
  if (net.role === 'host') {
    const me = lobby.players.get(0);
    if (me) { me.skin = skin; me.cos = cos; me.name = myName(); }
    hostSyncRoster();
  } else {
    net.send({ t: MSG.IDENT, skin, cos, name: store.sanitizeName(p.name) });
  }
}

function cleanupNet() {
  if (announcer) { announcer.stop(); announcer = null; }
  if (net) { net.destroy(); net = null; }
  room = null;
  lobby = { players: new Map(), mySlot: 0 };
}

function leaveRoom() {
  if (match && match.game && !match.ended) { match.game.destroy(); match.bus.dispose(); }
  match = null;
  if (net) net.send({ t: MSG.LEAVE });
  cleanupNet();
  stopMusic();
  gameui.hideHUD();
  gameui.clearStage();
  gameui.message(null);
  showHub();
}

// ------------------------------------------------------------------
// Telas auxiliares
// ------------------------------------------------------------------
let cosTab = 'skin';
async function showSkinsScreen() {
  await ensurePhaser();
  phase = 'skins';
  ui.showSkins(store.getProgress(), (id) => phaser.textures.getBase64(textureKey(id)), {
    tab: (t) => { cosTab = t; showSkinsScreen(); },
    pick: (id) => {
      store.setSkin(id);
      broadcastIdentity();
      showSkinsScreen();
    },
    equip: (slot, id) => {
      store.equipCosmetic(slot, id);
      broadcastIdentity();
      showSkinsScreen();
    },
    buy: (slot, id, cost) => {
      if (!store.buyCosmetic(id, cost)) { ui.toast('Moedas insuficientes'); return; }
      store.equipCosmetic(slot, id);
      sfx.win();
      ui.toast('Desbloqueado!');
      broadcastIdentity();
      showSkinsScreen();
    },
    back: () => showHub(),
  }, cosTab);
}

function showUpgrades() {
  phase = 'upgrades';
  ui.showUpgrades({
    progress: store.getProgress(),
    powerups: POWERUPS.map(pu => {
      const level = store.upgradeLevel(pu.id);
      return {
        ...pu, level,
        value: effectiveValue(pu, level),
        nextValue: level < MAX_LEVEL ? effectiveValue(pu, level + 1) : null,
        cost: level < MAX_LEVEL ? upgradeCost(level) : null,
      };
    }),
  }, {
    buy: (id) => {
      const level = store.upgradeLevel(id);
      if (level >= MAX_LEVEL) return;
      const cost = upgradeCost(level);
      if (!store.spendCoins(cost)) { ui.toast('Moedas insuficientes'); return; }
      store.setUpgradeLevel(id, level + 1);
      sfx.powerup();
      showUpgrades();
    },
    back: () => showHub(),
  });
}

// ------------------------------------------------------------------
// Boot
// ------------------------------------------------------------------
// iOS instalado na tela inicial: env(safe-area-inset-top) é imprevisível no
// modo standalone (às vezes 0, às vezes só popula depois do primeiro layout)
// e o HUD cola no relógio / Dynamic Island. Estratégia à prova de bala:
//   1. mede o env de verdade com um elemento-sonda;
//   2. num iOS instalado, aplica SEMPRE o piso conhecido do aparelho,
//      mesmo que o env diga menos;
//   3. remede depois que a tela assenta e a cada rotação.
function fixSafeArea() {
  const iOS = /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true
    || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);

  const measure = (prop) => {
    const probe = document.createElement('div');
    probe.style.cssText = `position:fixed;top:0;left:0;width:1px;${prop}:env(safe-area-inset-${prop === 'padding-top' ? 'top' : 'bottom'},0px);visibility:hidden;pointer-events:none;`;
    document.body.appendChild(probe);
    const v = probe.offsetHeight;   // sem conteúdo, a altura É o padding
    probe.remove();
    return v;
  };

  const apply = () => {
    let top = measure('padding-top');
    let bottom = measure('padding-bottom');
    if (iOS && standalone) {
      // o topo é reservado pelo próprio iOS (barra de status opaca);
      // só a barra de gesto de baixo precisa de piso garantido
      const tall = Math.max(screen.width, screen.height) >= 780;
      bottom = Math.max(bottom, tall ? 24 : 0);
    }
    if (top > 0) document.documentElement.style.setProperty('--safe-top', top + 'px');
    if (bottom > 0) document.documentElement.style.setProperty('--safe-bottom', bottom + 'px');
    // o iOS standalone às vezes assenta o viewport DEPOIS do primeiro layout
    // e o Phaser fica com o canvas descentralizado — força o recálculo junto
    if (phaser && phaser.scale) phaser.scale.refresh();
  };

  apply();
  setTimeout(apply, 400);            // env pode popular tarde no iOS
  setTimeout(apply, 1500);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 250));
}

function boot() {
  fixSafeArea();
  const unlock = () => { unlockAudio(); if (getPrefs().music && phase === 'match') startMusic(); };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // encerra tudo de forma limpa ao fechar a aba (o diretório usa o TTL)
  window.addEventListener('pagehide', () => {
    if (announcer) announcer.stop();
    releaseHub();
    if (net) net.destroy();
  });

  const params = new URLSearchParams(location.search);
  const inviteCode = normalizeCode(params.get('room'));
  if (inviteCode && inviteCode.length >= 4) {
    history.replaceState(null, '', location.pathname);
    joinRoom(inviteCode);
  } else {
    showHub();
  }

  ensurePhaser();
}

boot();

// gancho de inspeção para desenvolvimento (não interfere no jogo)
if (import.meta.env.DEV) {
  window.__ct = () => ({
    phase, hubState, room, lobby, match, phaser,
    scene: match && phaser ? (phaser.scene.getScene('runner') || phaser.scene.getScene('flappy')) : null,
    net: net ? { role: net.role, code: net.code, slot: mySlot(), connected: net.connected, players: net.playerCount } : null,
    progress: store.getProgress(),
  });
}
