// Adaptador do Triple Quest para a plataforma (o "GameBridge").
//
// A plataforma chama createGame(ctx) e recebe { begin, destroy }. O jogo
// inteiro (menu, mapa, fases, recompensas) vive na cena; aqui ficam o HUD
// em DOM, a pausa e a conversão do que aconteceu na sessão em linhas para
// a tela de fim da plataforma — que é quem alimenta missões e conquistas.
// Moedas são creditadas na hora pelo progress.js (mesma economia da
// plataforma), então o resultado reporta coins: 0 para não creditar duas vezes.
import TQScene from './TQScene.js';
import { getPrefs, setSound, setMusic } from '../../core/audio.js';
import * as progress from './progress.js';
import * as ui from '../../ui/gameui.js';
import { icon } from '../../ui/icons.js';

const HUD_HTML = `
  <div class="hud-me">
    <div id="tq-title" class="hud-big" style="font-size:20px">Triple Quest</div>
    <div class="hud-sub">
      <span id="tq-coins">${icon('twoCoins')} 0</span>
      <span id="tq-lives">❤️ 5</span>
      <span id="tq-stars" class="dim"></span>
    </div>
  </div>`;

export function createGame(ctx) {
  const { phaser, mySlot, onFinish } = ctx;
  let scene = null;
  let ended = false;
  const session = { cleared: 0, three: 0, combo: 0, triples: 0, coins: 0 };

  ui.showHUD(HUD_HTML);
  const el = { title: ui.panelEl('#tq-title'), coins: ui.panelEl('#tq-coins'), lives: ui.panelEl('#tq-lives'), stars: ui.panelEl('#tq-stars') };

  ui.setPauseMenu({
    canPause: true,
    audio: { getPrefs, setSound, setMusic },
    onPause: () => { if (scene) scene.paused = true; },
    onResume: () => { if (scene) scene.paused = false; },
    onQuit: () => finish(),
  });

  const hooks = {
    updateHUD: (s) => {
      el.title.textContent = s.title;
      el.coins.innerHTML = `${icon('twoCoins')} ${s.coins}`;
      el.lives.textContent = `❤️ ${s.lives}/${s.livesMax}`;
      el.stars.textContent = s.sub || '';
    },
    onLevelDone: (r) => {
      session.cleared++;
      if (r.stars === 3) session.three++;
      session.combo = Math.max(session.combo, r.bestCombo);
      session.triples += r.triples;
      session.coins += r.coins;
    },
    onTriples: (n) => { session.triples += n; },
    exit: () => finish(),
  };

  function finish() {
    if (ended) return;
    ended = true;
    const s = progress.summary();
    onFinish([{
      slot: mySlot, name: 'Você',
      score: session.cleared * 100 + session.coins,
      coins: 0,
      detail: `${session.cleared} fase${session.cleared === 1 ? '' : 's'} nesta sessão · fase ${s.level} no mapa · ${s.threeStars} com 3 estrelas`,
      sort: session.cleared,
      metrics: { level: s.level - 1, levels: session.cleared, three: session.three, combo: session.combo, triples: session.triples },
    }]);
  }

  const sceneKey = 'triplequest';
  if (!phaser.scene.getScene(sceneKey)) phaser.scene.add(sceneKey, TQScene, false);
  const data = { hooks };
  const sc = phaser.scene.getScene(sceneKey);
  if (sc.scene.isActive() || sc.scene.isPaused()) sc.scene.restart(data);
  else phaser.scene.start(sceneKey, data);

  return {
    begin() { scene = phaser.scene.getScene(sceneKey); scene.begin(); },
    playerLeft() {},
    destroy() {
      ended = true;
      if (scene) scene.paused = false;
      ui.setPauseMenu(null);
      ui.hideHUD();
      phaser.scene.stop(sceneKey);
    },
  };
}
