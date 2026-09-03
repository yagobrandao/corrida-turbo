// Adaptador do Pomar Mágico para a plataforma (o "GameBridge").
//
// createGame(ctx) devolve { begin, destroy }. O jogo inteiro (hub, mapa,
// ilha, fases) vive em duas cenas; aqui ficam o HUD em DOM, a pausa, a
// troca entre cenas e a conversão da sessão em linhas para a tela de fim
// da plataforma — que alimenta missões e conquistas dela. Moedas são
// creditadas na hora por progress.js (mesma economia), então o resultado
// reporta coins: 0 para não creditar duas vezes.
import M3Hub from './M3Hub.js';
import M3Play from './M3Play.js';
import BattleScene from './battle/BattleScene.js';
import { makeLocalBattleCtl } from './battle/localController.js';
import { makeNetworkBattleCtl } from './battle/networkController.js';
import { getPrefs, setSound, setMusic } from '../../core/audio.js';
import * as P from './progress.js';
import * as ui from '../../ui/gameui.js';
import { icon } from '../../ui/icons.js';

const BOT_NAMES = ['Zeca', 'Mimi', 'Toco', 'Nina', 'Bibi'];

const HUD_HTML = `
  <div class="hud-me">
    <div id="m3-title" class="hud-big" style="font-size:20px">Pomar Mágico</div>
    <div class="hud-sub">
      <span id="m3-coins">${icon('twoCoins')} 0</span>
      <span id="m3-lives">❤️ 5</span>
    </div>
  </div>`;

export function createGame(ctx) {
  const { phaser, bus, players, mySlot, isHost, seed, onFinish } = ctx;
  let ended = false;
  const session = { cleared: 0, stars: 0, combo: 0, specials: 0, coins: 0, best: 0 };
  const isNetRoom = !!(bus && bus.online && players && players.length >= 2);
  let netCtl = null;

  ui.showHUD(HUD_HTML);
  const el = { title: ui.panelEl('#m3-title'), coins: ui.panelEl('#m3-coins'), lives: ui.panelEl('#m3-lives') };
  const active = () => ['m3play', 'm3hub', 'm3battle'].map(k => phaser.scene.getScene(k)).find(s => s && s.scene.isActive());

  ui.setPauseMenu({
    canPause: !isNetRoom,
    audio: { getPrefs, setSound, setMusic },
    onPause: () => { const s = active(); if (s) s.paused = true; },
    onResume: () => { const s = active(); if (s) s.paused = false; },
    onQuit: () => finish(),
  });

  const updateHUD = (s) => {
    if (s.title) el.title.textContent = s.title;
    if (s.coins !== undefined) el.coins.innerHTML = `${icon('twoCoins')} ${ui.nf(s.coins)}`;
    if (s.lives !== undefined) el.lives.textContent = `❤️ ${s.lives}/5`;
  };
  const hubHooks = {
    updateHUD, play: (n, boosters) => startPlay(n, boosters), exit: () => finish(),
    canBattleRoom: () => isNetRoom,
    battleRoom: () => startBattleRoom(),
    battleVsBot: (cfg) => startBattleVsBot(cfg),
  };
  const playHooks = {
    updateHUD,
    onLevelDone: (r) => { session.cleared++; session.stars += r.stars; session.combo = Math.max(session.combo, r.combo); session.specials += r.specials; session.best = Math.max(session.best, r.n); },
    next: (n) => { if (P.lives() <= 0) { startHub('map'); return; } startPlay(n, []); },
    map: () => startHub('map'),
  };

  for (const [key, Cls] of [['m3hub', M3Hub], ['m3play', M3Play], ['m3battle', BattleScene]]) if (!phaser.scene.getScene(key)) phaser.scene.add(key, Cls, false);
  function stopAll() { for (const k of ['m3play', 'm3hub', 'm3battle']) { const sc = phaser.scene.getScene(k); if (sc.scene.isActive()) sc.scene.stop(); } }
  function startHub(screen) { stopAll(); const hub = phaser.scene.getScene('m3hub'); const data = { hooks: hubHooks, screen }; if (hub.scene.isPaused()) hub.scene.restart(data); else phaser.scene.start('m3hub', data); }
  function startPlay(n, boosters) { stopAll(); const play = phaser.scene.getScene('m3play'); const data = { n, boosters, hooks: playHooks }; if (play.scene.isPaused()) play.scene.restart(data); else phaser.scene.start('m3play', data); }
  function startBattleScene(ctl) { stopAll(); const sc = phaser.scene.getScene('m3battle'); const data = { ctl }; if (sc.scene.isPaused()) sc.scene.restart(data); else phaser.scene.start('m3battle', data); }

  function startBattleVsBot({ participants, difficulty }) {
    const bots = [];
    for (let i = 0; i < participants - 1; i++) bots.push({ id: 'bot' + i, name: BOT_NAMES[i % BOT_NAMES.length] + (i >= BOT_NAMES.length ? String(i) : ''), difficulty });
    const ctl = makeLocalBattleCtl({ humanId: 'you', humanName: 'Você', bots }, ((seed || Date.now()) ^ (mySlot * 7919)) >>> 0);
    ctl.exit = () => finishBattle(ctl.snapshot(), 'you');
    startBattleScene(ctl);
  }
  function startBattleRoom() {
    netCtl = makeNetworkBattleCtl(ctx);
    netCtl.exit = () => finishBattle(netCtl.snapshot(), String(mySlot));
    startBattleScene(netCtl);
  }
  // Batalha em rede: quem criou a sala já escolheu 2-5 jogadores; a
  // partida entra direto (o lobby/ready já aconteceu na Central de Jogos).
  const autoStartBattle = isNetRoom;

  function finish() {
    if (ended) return;
    ended = true;
    const s = P.summary();
    onFinish([{
      slot: mySlot, name: 'Você',
      score: session.cleared * 100 + session.stars * 50,
      coins: 0,
      detail: `${session.cleared} fase${session.cleared === 1 ? '' : 's'} nesta sessão · fase ${s.level} no mapa · ${s.stars} estrelas`,
      sort: session.cleared,
      metrics: { level: s.level - 1, levels: session.cleared, stars: session.stars, combo: session.combo, specials: session.specials },
    }]);
  }

  // fim de uma Batalha: uma linha por participante com placar/HP no final,
  // igual ao resto da plataforma (a Batalha em rede publica pra todos —
  // cada cliente calcula a mesma classificação a partir do que o host mandou)
  function finishBattle(snap, myId) {
    if (ended) return;
    ended = true;
    const standings = snap.standings || snap.ranking || [];
    const rows = standings.map((p, i) => ({
      slot: p.id === myId ? mySlot : (isNaN(Number(p.id)) ? null : Number(p.id)),
      name: p.id === myId ? 'Você' : p.name,
      score: Math.max(0, 1000 - i * 180),
      coins: 0,
      detail: `Batalha · ${i === 0 ? 'campeão' : (i + 1) + 'º lugar'} de ${standings.length} · ❤️ ${p.hp}`,
      sort: Math.max(0, 1000 - i * 180),
      metrics: { battlePlayed: 1, battleWon: i === 0 ? 1 : 0 },
    })).filter(r => r.slot !== null || r.name === 'Você');
    onFinish(rows);
  }

  return {
    begin() { if (autoStartBattle) startBattleRoom(); else startHub('menu'); },
    playerLeft(slot) { /* sala em Batalha: o CompetitiveMatchManager já cobre ausência de jogadores via Ghost nas próximas rodadas */ },
    destroy() {
      ui.setPauseMenu(null); ui.hideHUD();
      if (netCtl && netCtl.destroy) netCtl.destroy();
      for (const k of ['m3play', 'm3hub', 'm3battle']) { const sc = phaser.scene.getScene(k); try { if (sc && sc.scene.isActive()) sc.scene.stop(); } catch (_) {} }
    },
  };
}
