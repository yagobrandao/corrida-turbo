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
import { pairRoom, findMyPairing, myRoleIn, oppSlotIn, PvpRoomHost } from './pvpRoom.js';
import * as ui from '../../ui/gameui.js';
import { icon } from '../../ui/icons.js';

const KEY = 'ct-battle-v1';
const M = { BOARD: 'bt:board', READY: 'bt:ready', BATTLE: 'bt:battle', DONE: 'bt:done', FINISH: 'bt:finish' };

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
  const nameOf = (slot) => (players.find(p => p.slot === slot) || {}).name || `Jogador ${slot + 1}`;
  let scene = null;
  let ended = false;

  // ---------------------------------------------------------------- sala (2-5 jogadores)
  // Todo mundo calcula o MESMO pareamento sozinho — é determinístico a
  // partir de (players, seed), que já chegam iguais em todo aparelho, sem
  // precisar de mais uma mensagem. Sobrando um (sala com 3 ou 5), ele
  // enfrenta um Ghost: uma cópia da formação mais recente de outro
  // jogador real e ativo, nunca uma simulação — e nunca afeta o dono.
  const pairings = pvp ? pairRoom(players, seed) : [];
  const myPairing = pvp ? findMyPairing(pairings, mySlot) : null;
  const isGhostMatch = !!(myPairing && myPairing.ghostSourceSlot !== null);
  const opp = myPairing
    ? (isGhostMatch
      ? { slot: null, name: 'Ghost de ' + nameOf(myPairing.ghostSourceSlot), isGhost: true }
      : players.find(p => p.slot === oppSlotIn(myPairing, mySlot)))
    : null;
  const myFlip = myPairing && !isGhostMatch && myRoleIn(myPairing, mySlot) === 'guest';

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
  // o host DA SALA (não confundir com o "host" de uma dupla — cada dupla
  // tem seu próprio papel host/guest, ver pvpRoom.js) enxerga a submissão
  // de formação de TODO mundo e roteia cada dupla pro par certo. Um
  // "toSlot" endereçado a mim mesmo não passa pela rede — chamo a cena
  // direto (mesmo padrão do resto da plataforma).
  const roomHost = isHost && pvp ? new PvpRoomHost(players, seed) : null;
  const deliver = (toSlot, apply) => { if (toSlot === mySlot) apply(); else return false; return true; };
  const unbind = bus.on((p, from) => {
    if (!p || typeof p.k !== 'string') return;
    if (isHost) {
      if (p.k === M.BOARD && roomHost) {
        for (const eff of roomHost.submitBoard(from, p.round, p.spec)) {
          if (eff.t === 'ready') { if (!deliver(eff.toSlot, () => { if (scene) scene.pvpOppReady(); })) bus.toSlot(eff.toSlot, { k: M.READY, slot: eff.fromSlot, round: eff.round }); }
          else if (eff.t === 'battle') { if (!deliver(eff.toSlot, () => { if (scene) scene.pvpBattle(eff.round, eff.boards); })) bus.toSlot(eff.toSlot, { k: M.BATTLE, round: eff.round, boards: eff.boards }); }
        }
      } else if (p.k === M.DONE && roomHost) {
        const allDone = roomHost.reportDone(from, p.stats);
        if (allDone) { const rows = roomHost.buildFinalRows(nameOf); bus.toAll({ k: M.FINISH, rows }); finishPvpRoom(rows); }
      }
    } else {
      if (p.k === M.READY && p.slot !== mySlot && scene) scene.pvpOppReady();
      if (p.k === M.BATTLE && scene) scene.pvpBattle(p.round, p.boards);
      if (p.k === M.FINISH) finishPvpRoom(p.rows);
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
    onGameOver: (stats) => (pvp ? finishMyDuel(stats) : finishSolo(stats)),
  };
  let myDuelDone = false;

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

  // Meu próprio duelo (1 contra 1, contra um jogador real ou um Ghost)
  // terminou. Isso NÃO fecha a partida da sala inteira — com 3-5 jogadores
  // há outras duplas ainda jogando. Reporto pro host DA SALA (ou resolvo
  // direto se eu mesmo for o host); só quando TODO MUNDO real já terminou
  // o próprio duelo é que a sessão da plataforma acaba de vez, com uma
  // linha de resultado por jogador real (o Ghost nunca gera linha).
  function finishMyDuel(stats, leaver = -1) {
    if (myDuelDone) return;
    myDuelDone = true;
    save.runs++;
    if (stats.won) save.pvpWins++;
    save.threeStars += stats.threeStars;
    writeSave(save);
    const myHp = leaver === mySlot ? 0 : stats.hp;
    const oppHp = (opp && leaver === opp.slot) ? 0 : stats.oppHp;
    const rounds = Math.max(0, stats.round - 1);
    const won = myHp > 0 && myHp >= oppHp && !(myHp === oppHp);
    const payload = { hp: myHp, oppHp, wins: stats.wins, threeStars: stats.threeStars, round: rounds, won };
    if (isHost && roomHost) {
      const allDone = roomHost.reportDone(mySlot, payload);
      if (allDone) { const rows = roomHost.buildFinalRows(nameOf); bus.toAll({ k: M.FINISH, rows }); finishPvpRoom(rows); }
    } else {
      bus.toHost({ k: M.DONE, stats: payload });
    }
  }

  // fecha a sessão da plataforma inteira, com uma linha por jogador real
  function finishPvpRoom(rows) {
    if (ended) return;
    ended = true;
    onFinish(rows.map(r => ({
      slot: r.slot, name: r.name,
      score: r.hp + r.round * 10,
      coins: pvpCoinsFor(r.round, r.won),
      detail: `${r.hp} ❤ · ${r.round} rodada${r.round === 1 ? '' : 's'}`,
      sort: r.hp,
      metrics: { round: r.round, pvpWon: r.won ? 1 : 0, threeStars: r.slot === mySlot ? r.threeStars : 0 },
    })));
  }

  const sceneKey = 'battle';
  if (!phaser.scene.getScene(sceneKey)) phaser.scene.add(sceneKey, BattleScene, false);
  const data = {
    hooks, seed,
    mode: pvp ? 'pvp' : 'pve',
    flip: myFlip,
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
      if (!pvp || myDuelDone || isGhostMatch) return;   // ghost: a fonte sair não afeta quem enfrenta a cópia congelada
      if (!opp || slot !== opp.slot) return;            // não é o MEU par — outra dupla resolve por conta própria
      if (scene) scene.pvpOppLeft();
      // quem ficou vence por W.O.
      if (scene) finishMyDuel({ ...scene.summary(true), won: true }, slot);
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
