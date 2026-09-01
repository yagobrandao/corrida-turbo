// Adaptador do Tower Defense para a plataforma.
//
// Jogo 100% solo e local. As moedas PERMANENTES são as moedas da plataforma
// (ganhas no fim e gastas nas melhorias permanentes); o nível da plataforma
// destrava mapas e torres. Records e melhorias ficam num save próprio.
import TDScene from './TDScene.js';
import { getProgress, spendCoins } from '../../core/storage.js';
import { levelInfo } from '../../ui/art.js';
import { getPrefs, setSound, setMusic } from '../../core/audio.js';
import { PERMS, permCoinsFor } from './config.js';
import * as ui from '../../ui/gameui.js';
import { icon } from '../../ui/icons.js';

const KEY = 'ct-td-v1';

function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { bestWave: {}, kills: 0, bosses: 0, bestCombo: 0, perm: {}, ...JSON.parse(raw) };
  } catch (_) {}
  return { bestWave: {}, kills: 0, bosses: 0, bestCombo: 0, perm: {} };
}
function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
}

const HUD_HTML = `
  <div class="hud-me">
    <div id="td-wave" class="hud-big" style="font-size:22px">Preparação</div>
    <div class="hud-sub">
      <span id="td-lives">❤️ 10</span>
      <span id="td-coins">${icon('twoCoins')} 220</span>
      <span id="td-combo" class="dim"></span>
    </div>
  </div>`;

export function createGame(ctx) {
  const { phaser, mySlot, onFinish } = ctx;
  const save = loadSave();
  let scene = null;
  let ended = false;
  let currentMap = null;

  ui.showHUD(HUD_HTML);
  const el = {
    wave: ui.panelEl('#td-wave'), lives: ui.panelEl('#td-lives'),
    coins: ui.panelEl('#td-coins'), combo: ui.panelEl('#td-combo'),
  };

  ui.setPauseMenu({
    canPause: true,
    audio: { getPrefs, setSound, setMusic },
    onPause: () => { if (scene) scene.paused = true; },
    onResume: () => { if (scene) scene.paused = false; },
    onQuit: () => {
      // sair no meio conta como derrota na onda atual (mantém a recompensa)
      if (scene && !ended && scene.state !== 'select') {
        finishRun({
          map: currentMap, wave: Math.max(0, scene.wave || 0),
          kills: scene.kills || 0, bossKills: scene.bossKills || 0,
          bestCombo: scene.bestCombo || 0,
        });
      } else if (ctx.onQuit) ctx.onQuit();
    },
  });

  const hooks = {
    bestWave: (mapId) => save.bestWave[mapId] || 0,
    permLevel: (id) => save.perm[id] || 0,
    platformCoins: () => getProgress().coins,
    buyPerm: (id) => {
      const def = PERMS.find(p => p.id === id);
      const lv = save.perm[id] || 0;
      if (!def || lv >= def.max) return false;
      if (!spendCoins(def.cost(lv))) return false;
      save.perm[id] = lv + 1;
      writeSave(save);
      return true;
    },
    onRunStart: (mapId) => { currentMap = mapId; },
    onWaveCleared: () => {},
    updateHUD: (s) => {
      el.wave.textContent = s.wave > 0 ? `Onda ${s.wave}` : 'Preparação';
      el.lives.textContent = `❤️ ${s.lives}`;
      el.coins.innerHTML = `${icon('twoCoins')} ${s.coins}`;
      el.combo.textContent = s.combo >= 5 ? `combo ×${s.combo}` : '';
    },
    onGameOver: (stats) => finishRun(stats),
  };

  function finishRun(stats) {
    if (ended) return;
    ended = true;

    // recordes
    const prevBest = save.bestWave[stats.map] || 0;
    const newBest = stats.wave > prevBest;
    if (newBest) save.bestWave[stats.map] = stats.wave;
    save.kills += stats.kills;
    save.bosses += stats.bossKills;
    save.bestCombo = Math.max(save.bestCombo, stats.bestCombo);
    writeSave(save);

    const permCoins = permCoinsFor(stats.wave, stats.kills);
    onFinish([{
      slot: mySlot, name: 'Você',
      score: stats.wave * 100 + stats.kills,
      coins: permCoins,                       // a plataforma credita sozinha
      detail: `Onda ${stats.wave} · ${stats.kills} abates${newBest ? ' · 🏅 recorde!' : ''}`,
      sort: stats.wave,
      metrics: { wave: stats.wave, kills: stats.kills, bosses: stats.bossKills },
    }]);
  }

  const sceneKey = 'td';
  if (!phaser.scene.getScene(sceneKey)) phaser.scene.add(sceneKey, TDScene, false);
  const data = { hooks, platformLevel: levelInfo(getProgress().totalCoins).level };
  const sc = phaser.scene.getScene(sceneKey);
  if (sc.scene.isActive() || sc.scene.isPaused()) sc.scene.restart(data);
  else phaser.scene.start(sceneKey, data);

  return {
    begin() { scene = phaser.scene.getScene(sceneKey); },
    playerLeft() {},
    destroy() {
      ended = true;
      ui.setPauseMenu(null);
      ui.hideHUD();
      if (phaser.scene.isActive(sceneKey)) phaser.scene.stop(sceneKey);
    },
  };
}
