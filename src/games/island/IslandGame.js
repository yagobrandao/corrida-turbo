// Adaptador da Ilha Survival.
//
// O mundo é persistente: um único objeto `world` salvo no localStorage.
// "Sair" não é derrota — fecha a sessão, converte o XP ganho em moedas da
// plataforma e mostra o resumo. Na próxima visita a ilha está como ficou.
import IslandScene from './IslandScene.js';
import { getProgress } from '../../core/storage.js';
import { getPrefs, setSound, setMusic } from '../../core/audio.js';
import { resolveSkin } from '../runner/skins.js';
import { ITEMS, TOOLS, islandLevel, coinsForSession } from './config.js';
import * as ui from '../../ui/gameui.js';
import { icon } from '../../ui/icons.js';

const KEY = 'ct-island-v1';

function loadWorld() {
  const base = {
    inv: { wood: 0, stone: 0, fiber: 0, fruit: 0 },
    tools: { axe: 1, pick: 1 },
    built: {},
    harvested: {},
    xp: 0,
    clock: 30,          // começa de manhã
    pos: null,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...base, ...s, inv: { ...base.inv, ...s.inv }, tools: { ...base.tools, ...s.tools } };
    }
  } catch (_) {}
  return base;
}

const HUD_HTML = `
  <div class="hud-me">
    <div id="isl-lv" class="hud-big" style="font-size:19px">Ilha NV 1</div>
    <div class="hud-sub" style="font-size:13px;gap:9px">
      <span id="isl-wood">0</span><span id="isl-stone">0</span><span id="isl-fiber">0</span><span id="isl-fruit">0</span>
    </div>
    <div class="speedo" style="width:110px"><div class="speedo-bar"><div id="isl-xp" style="height:100%;width:0%;border-radius:4px;background:linear-gradient(90deg,#43d68c,#ffd23e)"></div></div></div>
  </div>`;

export function createGame(ctx) {
  const { phaser, mySlot, onFinish } = ctx;
  const world = loadWorld();
  let scene = null;
  let ended = false;

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(world)); } catch (_) {} };

  ui.showHUD(HUD_HTML);
  const el = {
    lv: ui.panelEl('#isl-lv'), xp: ui.panelEl('#isl-xp'),
    wood: ui.panelEl('#isl-wood'), stone: ui.panelEl('#isl-stone'),
    fiber: ui.panelEl('#isl-fiber'), fruit: ui.panelEl('#isl-fruit'),
  };
  const paintHUD = () => {
    const L = islandLevel(world.xp);
    el.lv.textContent = `Ilha NV ${L.lv}`;
    el.xp.style.width = L.pct + '%';
    el.wood.textContent = `🪵${world.inv.wood}`;
    el.stone.textContent = `🪨${world.inv.stone}`;
    el.fiber.textContent = `🌿${world.inv.fiber}`;
    el.fruit.textContent = `🍎${world.inv.fruit}`;
  };
  paintHUD();

  // bancada: painel DOM simples com as melhorias de ferramenta
  function openBench() {
    if (scene) scene.paused = true;
    const back = document.createElement('div');
    back.className = 'modal-back';
    const rows = Object.entries(TOOLS).map(([id, t]) => {
      const lv = world.tools[id] || 1;
      const maxed = lv >= t.max;
      const cost = maxed ? null : t.upCost[lv];
      const costText = cost ? Object.entries(cost).map(([i, n]) => `${ITEMS[i].name} ${n}`).join(' · ') : '';
      return `
        <div class="row" style="text-align:left">
          <span><b>${t.name} NV ${lv}</b><br><small style="color:var(--muted)">${maxed ? 'Nível máximo' : costText}</small></span>
          ${maxed ? '<span style="color:var(--gold);font-weight:700">MÁX</span>'
                  : `<button class="q-claim" data-tool="${id}" style="animation:none">SUBIR</button>`}
        </div>`;
    }).join('');
    back.innerHTML = `
      <div class="modal">
        <h3>${icon('wrench')} BANCADA</h3>
        <p class="hint" style="margin:0 auto">Ferramenta melhor = mais recursos por golpe.</p>
        ${rows}
        <button class="btn" data-a="close">FECHAR</button>
      </div>`;
    const close = () => { back.remove(); if (scene) scene.paused = false; paintHUD(); };
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    back.querySelector('[data-a=close]').addEventListener('click', close);
    back.querySelectorAll('[data-tool]').forEach(b => {
      b.addEventListener('click', () => {
        if (scene && scene.upgradeTool(b.dataset.tool)) { close(); openBench(); }
      });
    });
    document.body.appendChild(back);
  }

  ui.setPauseMenu({
    canPause: true,
    audio: { getPrefs, setSound, setMusic },
    onPause: () => { if (scene) scene.paused = true; },
    onResume: () => { if (scene) scene.paused = false; },
    onQuit: () => finishSession(),
  });

  function finishSession() {
    if (ended) return;
    ended = true;
    if (scene) scene._dirty();
    save();
    const xpGained = Math.max(0, world.xp - (scene ? scene.sessionStart.xp : world.xp));
    const gathered = scene ? scene.sessionStart.gathered : 0;
    const L = islandLevel(world.xp);
    onFinish([{
      slot: mySlot, name: 'Você',
      score: world.xp,
      coins: coinsForSession(xpGained),
      detail: `Ilha NV ${L.lv} · ${gathered} recursos na sessão`,
      sort: world.xp,
      metrics: { gathered, xpGained, built: Object.keys(world.built).length },
    }]);
  }

  const hooks = {
    save,
    updateHUD: paintHUD,
    openBench,
  };

  const progress = getProgress();
  const sceneKey = 'island';
  if (!phaser.scene.getScene(sceneKey)) phaser.scene.add(sceneKey, IslandScene, false);
  const data = { hooks, world, skin: resolveSkin(progress.skin, progress.totalCoins).id };
  const sc = phaser.scene.getScene(sceneKey);
  if (sc.scene.isActive() || sc.scene.isPaused()) sc.scene.restart(data);
  else phaser.scene.start(sceneKey, data);

  return {
    begin() { scene = phaser.scene.getScene(sceneKey); },
    playerLeft() {},
    destroy() {
      ended = true;
      save();
      ui.setPauseMenu(null);
      ui.hideHUD();
      if (phaser.scene.isActive(sceneKey)) phaser.scene.stop(sceneKey);
    },
  };
}
