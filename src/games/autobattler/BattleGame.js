// Adaptador do Battle Tactics para a plataforma.
//
// Jogo solo e local nesta versão. A cena cuida da corrida; aqui ficam o
// HUD (DOM), o menu de pausa, o save de recordes e a conversão do resultado
// em linhas para a tela de fim da plataforma (que credita as moedas).
//
// PvP futuro: o `ctx.bus` já chega aqui. O combate (sim.js) é determinístico
// e a formação de cada lado é serializável (Run.boardSpec()), então o
// caminho é trocar formações pelo bus e rodar a mesma simulação nos dois
// aparelhos — sem mexer na cena nem no núcleo.
import BattleScene from './BattleScene.js';
import { getPrefs, setSound, setMusic } from '../../core/audio.js';
import { permCoinsFor, TOTAL_ROUNDS } from './config.js';
import * as ui from '../../ui/gameui.js';
import { icon } from '../../ui/icons.js';

const KEY = 'ct-battle-v1';

function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { bestRound: 0, runs: 0, wins: 0, bosses: 0, threeStars: 0, ...JSON.parse(raw) };
  } catch (_) {}
  return { bestRound: 0, runs: 0, wins: 0, bosses: 0, threeStars: 0 };
}
function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
}

const HUD_HTML = `
  <div class="hud-me">
    <div id="bt-round" class="hud-big" style="font-size:20px">Rodada 1</div>
    <div class="hud-sub">
      <span id="bt-hp">❤️ 100</span>
      <span id="bt-gold">${icon('twoCoins')} 4</span>
      <span id="bt-lv">Nv 2</span>
    </div>
    <div id="bt-syn" class="bt-syn"></div>
  </div>`;

export function createGame(ctx) {
  const { phaser, mySlot, seed, onFinish } = ctx;
  const save = loadSave();
  let scene = null;
  let ended = false;

  ui.showHUD(HUD_HTML);
  const el = {
    round: ui.panelEl('#bt-round'), hp: ui.panelEl('#bt-hp'),
    gold: ui.panelEl('#bt-gold'), lv: ui.panelEl('#bt-lv'), syn: ui.panelEl('#bt-syn'),
  };

  ui.setPauseMenu({
    canPause: true,
    audio: { getPrefs, setSound, setMusic },
    onPause: () => { if (scene) scene.paused = true; },
    onResume: () => { if (scene) scene.paused = false; },
    onQuit: () => {
      // desistir no meio encerra a corrida na rodada atual (mantém o ganho)
      if (scene && !ended && scene.run) finishRun(scene.summary());
      else if (ctx.onQuit) ctx.onQuit();
    },
  });

  const hooks = {
    bestRound: () => save.bestRound,
    countdown: (cb) => ui.runCountdown(cb, 'BATALHA!'),
    updateHUD: (s) => {
      el.round.textContent = `Rodada ${s.round}/${TOTAL_ROUNDS}`;
      el.hp.textContent = `❤️ ${s.hp}`;
      el.gold.innerHTML = `${icon('twoCoins')} ${s.gold}`;
      el.lv.textContent = s.xpToNext === null ? `Nv ${s.level} máx` : `Nv ${s.level} · ${s.xp}/${s.xpToNext}`;
      el.syn.innerHTML = s.synergies.map(x =>
        `<span class="bt-chip ${x.level > 0 ? 'on' : ''}">${ui.esc(x.name)} ${x.count}/${x.next || x.thresholds[x.thresholds.length - 1]}</span>`
      ).join('');
    },
    onGameOver: (stats) => finishRun(stats),
  };

  function finishRun(stats) {
    if (ended) return;
    ended = true;
    const cleared = stats.roundsCleared;
    const newBest = cleared > save.bestRound;
    if (newBest) save.bestRound = cleared;
    save.runs++;
    if (stats.won) save.wins++;
    if (stats.bossKilled) save.bosses++;
    save.threeStars += stats.threeStars;
    writeSave(save);

    const coins = permCoinsFor(cleared, stats.won, stats.bossKilled);
    onFinish([{
      slot: mySlot, name: 'Você',
      score: cleared * 100 + stats.wins * 10 + (stats.won ? 500 : 0),
      coins,
      detail: `${stats.won ? 'Venceu o Ancião!' : `Rodada ${stats.round}`} · ${stats.wins} vitórias${stats.threeStars ? ` · ${stats.threeStars}× ★★★` : ''}${newBest ? ' · 🏅 recorde!' : ''}`,
      sort: cleared * 100 + stats.wins,
      metrics: { round: cleared, won: stats.won ? 1 : 0, threeStars: stats.threeStars, boss: stats.bossKilled ? 1 : 0 },
    }]);
  }

  const sceneKey = 'battle';
  if (!phaser.scene.getScene(sceneKey)) phaser.scene.add(sceneKey, BattleScene, false);
  const data = { hooks, seed };
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
