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
import { getPrefs, setSound, setMusic } from '../../core/audio.js';
import * as P from './progress.js';
import * as ui from '../../ui/gameui.js';
import { icon } from '../../ui/icons.js';

const HUD_HTML = `
  <div class="hud-me">
    <div id="m3-title" class="hud-big" style="font-size:20px">Pomar Mágico</div>
    <div class="hud-sub">
      <span id="m3-coins">${icon('twoCoins')} 0</span>
      <span id="m3-lives">❤️ 5</span>
    </div>
  </div>`;

export function createGame(ctx) {
  const { phaser, mySlot, onFinish } = ctx;
  let ended = false;
  const session = { cleared: 0, stars: 0, combo: 0, specials: 0, coins: 0, best: 0 };

  ui.showHUD(HUD_HTML);
  const el = { title: ui.panelEl('#m3-title'), coins: ui.panelEl('#m3-coins'), lives: ui.panelEl('#m3-lives') };
  const active = () => ['m3play', 'm3hub'].map(k => phaser.scene.getScene(k)).find(s => s && s.scene.isActive());

  ui.setPauseMenu({
    canPause: true,
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
  const hubHooks = { updateHUD, play: (n, boosters) => startPlay(n, boosters), exit: () => finish() };
  const playHooks = {
    updateHUD,
    onLevelDone: (r) => { session.cleared++; session.stars += r.stars; session.combo = Math.max(session.combo, r.combo); session.specials += r.specials; session.best = Math.max(session.best, r.n); },
    next: (n) => { if (P.lives() <= 0) { startHub('map'); return; } startPlay(n, []); },
    map: () => startHub('map'),
  };

  for (const [key, Cls] of [['m3hub', M3Hub], ['m3play', M3Play]]) if (!phaser.scene.getScene(key)) phaser.scene.add(key, Cls, false);
  function startHub(screen) { const play = phaser.scene.getScene('m3play'); if (play.scene.isActive()) play.scene.stop(); const hub = phaser.scene.getScene('m3hub'); const data = { hooks: hubHooks, screen }; if (hub.scene.isActive() || hub.scene.isPaused()) hub.scene.restart(data); else phaser.scene.start('m3hub', data); }
  function startPlay(n, boosters) { const hub = phaser.scene.getScene('m3hub'); if (hub.scene.isActive()) hub.scene.stop(); const play = phaser.scene.getScene('m3play'); const data = { n, boosters, hooks: playHooks }; if (play.scene.isActive() || play.scene.isPaused()) play.scene.restart(data); else phaser.scene.start('m3play', data); }

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

  return {
    begin() { startHub('menu'); },
    destroy() {
      ui.setPauseMenu(null); ui.hideHUD();
      for (const k of ['m3play', 'm3hub']) { const sc = phaser.scene.getScene(k); try { if (sc && sc.scene.isActive()) sc.scene.stop(); } catch (_) {} }
    },
  };
}
