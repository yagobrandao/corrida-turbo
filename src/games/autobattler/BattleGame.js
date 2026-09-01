// Adaptador do Battle Tactics para a plataforma.
//
// Dois modos com a MESMA cena e o MESMO núcleo:
//  - solo (1 jogador): rodadas contra a IA, chefe na 10.
//  - PvP (2 jogadores na sala): cada um monta o seu; ao apertar LUTAR a
//    formação vai para o host, que junta as duas e devolve. Os dois
//    aparelhos rodam a simulação determinística (sim.js) com a mesma seed
//    e chegam ao mesmo vencedor — não se troca um byte de combate.
//
// Aqui ficam: HUD (DOM), menu de pausa, guia (DOM, com rolagem), save de
// recordes, mensagens do bus e a conversão do resultado em linhas para a
// tela de fim da plataforma (que credita as moedas).
import BattleScene from './BattleScene.js';
import { getPrefs, setSound, setMusic } from '../../core/audio.js';
import {
  permCoinsFor, pvpCoinsFor, TOTAL_ROUNDS, UNITS, SHOP_UNITS, RARITIES, FACTIONS, CLASSES,
  SYNERGIES, PAIRS, STAR_MULT,
} from './config.js';
import * as ui from '../../ui/gameui.js';
import { icon } from '../../ui/icons.js';

const KEY = 'ct-battle-v1';
const M = { BOARD: 'bt:board', READY: 'bt:ready', BATTLE: 'bt:battle' };

function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { bestRound: 0, runs: 0, wins: 0, bosses: 0, threeStars: 0, pvpWins: 0, ...JSON.parse(raw) };
  } catch (_) {}
  return { bestRound: 0, runs: 0, wins: 0, bosses: 0, threeStars: 0, pvpWins: 0 };
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
  const { phaser, bus, players, mySlot, isHost, seed, onFinish } = ctx;
  const save = loadSave();
  const pvp = players.length >= 2 && bus.online;
  const opp = pvp ? players.find(p => p.slot !== mySlot) : null;
  const nameOf = (slot) => (players.find(p => p.slot === slot) || {}).name || `Jogador ${slot + 1}`;
  let scene = null;
  let ended = false;

  ui.showHUD(HUD_HTML);
  const el = {
    round: ui.panelEl('#bt-round'), hp: ui.panelEl('#bt-hp'),
    gold: ui.panelEl('#bt-gold'), lv: ui.panelEl('#bt-lv'), syn: ui.panelEl('#bt-syn'),
  };

  ui.setPauseMenu({
    canPause: !pvp,
    audio: { getPrefs, setSound, setMusic },
    onPause: () => { if (scene && !pvp) scene.paused = true; },
    onResume: () => { if (scene) scene.paused = false; },
    onQuit: () => {
      if (pvp) { if (ctx.onQuit) ctx.onQuit(); return; }
      // desistir no meio encerra a corrida na rodada atual (mantém o ganho)
      if (scene && !ended && scene.run) finishSolo(scene.summary());
      else if (ctx.onQuit) ctx.onQuit();
    },
  });

  // ---------------------------------------------------------------- PvP: bus
  // host guarda as formações da rodada; quando as duas chegam, devolve o par
  const boards = {};   // round -> { host, guest }
  const unbind = bus.on((p, from) => {
    if (!p || typeof p.k !== 'string') return;
    if (isHost) {
      if (p.k === M.BOARD) {
        const b = boards[p.round] || (boards[p.round] = {});
        b[from === 0 ? 'host' : 'guest'] = p.spec;
        bus.toAll({ k: M.READY, slot: from, round: p.round });
        if (from !== mySlot && scene) scene.pvpOppReady();
        if (b.host && b.guest) {
          bus.toAll({ k: M.BATTLE, round: p.round, boards: b });
          if (scene) scene.pvpBattle(p.round, b);
        }
      }
    } else {
      if (p.k === M.READY && p.slot !== mySlot && scene) scene.pvpOppReady();
      if (p.k === M.BATTLE && scene) scene.pvpBattle(p.round, p.boards);
    }
  });

  const hooks = {
    countdown: (cb) => ui.runCountdown(cb, 'BATALHA!'),
    submitBoard: (round, spec) => bus.toHost({ k: M.BOARD, round, spec }),
    openGuide: () => openGuide(phaser),
    updateHUD: (s) => {
      el.round.textContent = pvp ? `Rodada ${s.round}` : `Rodada ${s.round}/${TOTAL_ROUNDS}`;
      el.hp.textContent = pvp ? `❤️ ${s.hp}  ✕  ${s.oppHp} ${s.oppName}` : `❤️ ${s.hp}`;
      el.gold.innerHTML = `${icon('twoCoins')} ${s.gold}`;
      el.lv.textContent = s.xpToNext === null ? `Nv ${s.level} máx` : `Nv ${s.level} · ${s.xp}/${s.xpToNext}`;
      // no máximo 5 chips: ativas primeiro, depois as mais perto de fechar
      el.syn.innerHTML = [
        ...s.synergies.slice(0, Math.max(0, 5 - s.pairs.length)).map(x => `<span class="bt-chip ${x.level > 0 ? 'on' : ''}">${ui.esc(x.name)} ${x.count}/${x.next || x.thresholds[x.thresholds.length - 1]}</span>`),
        ...s.pairs.map(p => `<span class="bt-chip on">${ui.esc(p.name)}</span>`),
      ].join('');
    },
    onGameOver: (stats) => (pvp ? finishPvp(stats) : finishSolo(stats)),
  };

  function finishSolo(stats) {
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

    onFinish([{
      slot: mySlot, name: 'Você',
      score: cleared * 100 + stats.wins * 10 + (stats.won ? 500 : 0),
      coins: permCoinsFor(cleared, stats.won, stats.bossKilled),
      detail: `${stats.won ? 'Venceu o Ancião!' : `Rodada ${stats.round}`} · ${stats.wins} vitórias${stats.threeStars ? ` · ${stats.threeStars}× ★★★` : ''}${newBest ? ' · 🏅 recorde!' : ''}`,
      sort: cleared * 100 + stats.wins,
      metrics: { round: cleared, won: stats.won ? 1 : 0, threeStars: stats.threeStars, boss: stats.bossKilled ? 1 : 0 },
    }]);
  }

  // PvP: os dois aparelhos chegam ao mesmo estado; só o host publica
  function finishPvp(stats, leaver = -1) {
    if (ended) return;
    ended = true;
    save.runs++;
    if (stats.won) save.pvpWins++;
    save.threeStars += stats.threeStars;
    writeSave(save);
    if (!isHost) return;   // o convidado recebe FINISH do host
    const rounds = Math.max(0, stats.round - 1);
    const myHp = leaver === mySlot ? 0 : stats.hp;
    const oppHp = leaver === opp.slot ? 0 : stats.oppHp;
    const rows = [
      { slot: mySlot, hp: myHp, wins: stats.wins },
      { slot: opp.slot, hp: oppHp, wins: 0 },
    ].map(r => {
      const won = r.hp > 0 && r.hp >= (r.slot === mySlot ? oppHp : myHp) && !(myHp === oppHp);
      return {
        slot: r.slot, name: nameOf(r.slot),
        score: r.hp + rounds * 10,
        coins: pvpCoinsFor(rounds, won),
        detail: `${r.hp} ❤ · ${rounds} rodada${rounds === 1 ? '' : 's'}`,
        sort: r.hp,
        metrics: { round: rounds, pvpWon: won ? 1 : 0, threeStars: r.slot === mySlot ? stats.threeStars : 0 },
      };
    });
    onFinish(rows);
  }

  const sceneKey = 'battle';
  if (!phaser.scene.getScene(sceneKey)) phaser.scene.add(sceneKey, BattleScene, false);
  const data = {
    hooks, seed,
    mode: pvp ? 'pvp' : 'pve',
    flip: pvp && !isHost,
    oppName: opp ? opp.name : '',
    // lojas diferentes para cada lado, a partir da mesma seed da sala
    runSeed: pvp ? (seed + mySlot * 1000003) >>> 0 : seed,
  };
  const sc = phaser.scene.getScene(sceneKey);
  if (sc.scene.isActive() || sc.scene.isPaused()) sc.scene.restart(data);
  else phaser.scene.start(sceneKey, data);

  return {
    begin() { scene = phaser.scene.getScene(sceneKey); scene.begin(); },
    playerLeft(slot) {
      if (!pvp || ended) return;
      if (scene) scene.pvpOppLeft();
      // quem ficou vence por W.O.
      if (isHost && scene) finishPvp({ ...scene.summary(true), won: true }, slot);
    },
    destroy() {
      ended = true;
      unbind();
      closeGuide();
      if (scene) scene.paused = false;
      ui.setPauseMenu(null);
      ui.hideHUD();
      phaser.scene.stop(sceneKey);
    },
  };
}

// ---------------------------------------------------------------- guia (DOM)
// Unidades, sinergias e duplas com rolagem nativa. Os retratos vêm das
// texturas da própria cena, então são iguais aos bonecos em campo.
let guideEl = null;
function closeGuide() { if (guideEl) { guideEl.remove(); guideEl = null; } }

function openGuide(phaser) {
  closeGuide();
  const portrait = (id) => {
    try { return phaser.textures.getBase64('bt-' + id); } catch (_) { return ''; }
  };
  const star = (n) => '★'.repeat(n);
  const unitsHtml = SHOP_UNITS.map(u => `
    <div class="bt-u">
      <img src="${portrait(u.id)}" alt="">
      <div>
        <div class="n">${ui.esc(u.name)}</div>
        <div class="t" style="color:${RARITIES[u.rarity].text}">${RARITIES[u.rarity].name} · <span style="color:${FACTIONS[u.faction].hex}">${FACTIONS[u.faction].name}</span> · <span style="color:${CLASSES[u.cls].hex}">${CLASSES[u.cls].name}</span></div>
        <div class="s">Vida ${u.hp} · Dano ${u.atk} · ${u.as.toFixed(1).replace('.', ',')} golpes/s · Alcance ${u.range} · ${star(2)} ×${STAR_MULT[2]} · ${star(3)} ×${STAR_MULT[3]}</div>
        <div class="a"><b>${ui.esc(u.ability.name)}:</b> ${ui.esc(u.ability.desc(1))}</div>
      </div>
    </div>`).join('');
  const synHtml = SYNERGIES.map(s => `
    <div class="bt-syn-row">
      <div><span class="n" style="color:${(s.kind === 'faction' ? FACTIONS[s.id] : CLASSES[s.id]).hex}">${ui.esc(s.name)}</span><span class="k">${s.kind === 'faction' ? 'FACÇÃO' : 'CLASSE'}</span></div>
      ${s.thresholds.map((t, i) => `<div class="lv"><b>${t}</b> ${ui.esc(s.desc[i])}</div>`).join('')}
    </div>`).join('');
  const pairsHtml = PAIRS.map(p => `
    <div class="bt-pair">
      <img src="${portrait(p.a)}" alt=""><span class="plus">+</span><img src="${portrait(p.b)}" alt="">
      <div class="b"><div class="n">${ui.esc(p.name)}</div><div class="d">${ui.esc(UNITS[p.a].name)} + ${ui.esc(UNITS[p.b].name)}: ${ui.esc(p.desc)}</div></div>
    </div>`).join('');

  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal bt-guide">
      <h3>GUIA DE BATALHA</h3>
      <div class="filters">
        <button class="filter on" data-tab="units">Unidades</button>
        <button class="filter" data-tab="syn">Sinergias</button>
        <button class="filter" data-tab="pairs">Duplas</button>
      </div>
      <div class="bt-guide-list" data-panel="units">${unitsHtml}</div>
      <div class="bt-guide-list" data-panel="syn" hidden><p class="hint" style="margin:0 0 2px">Contam unidades diferentes em campo. Cópias iguais não somam.</p>${synHtml}</div>
      <div class="bt-guide-list" data-panel="pairs" hidden><p class="hint" style="margin:0 0 2px">Dois personagens específicos juntos liberam um bônus só para eles.</p>${pairsHtml}</div>
      <button class="btn ghost" data-a="close">FECHAR</button>
    </div>`;
  back.addEventListener('click', (e) => { if (e.target === back) closeGuide(); });
  back.querySelector('[data-a=close]').addEventListener('click', closeGuide);
  back.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    back.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
    back.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
  }));
  document.body.appendChild(back);
  guideEl = back;
}
