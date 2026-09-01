// Telas da Central de Jogos.
//
// Este módulo NÃO conhece a lógica interna de nenhum jogo — ele lê os
// manifestos em games/index.js e renderiza. Adicionar um jogo novo não exige
// tocar em nada aqui.
import { sfx, unlockAudio, getPrefs, setSound, setMusic } from '../core/audio.js';
import { GAMES, CATEGORIES, getGame, gamesByCategory } from '../games/index.js';
import { MAX_PLAYERS, slotHex, slotName } from '../core/config.js';
import { SKINS, isUnlocked } from '../games/runner/skins.js';
import { openScanner } from './qrscan.js';
import { charSVG, gameArt, levelInfo } from './art.js';
import { SLOT_COLORS } from '../core/config.js';
import { icon } from './icons.js';
import { SLOTS, listOf, ownsCosmetic, resolveCosmetics } from '../core/cosmetics.js';

const root = document.getElementById('ui-root');
const toastEl = document.getElementById('toast');
let toastTimer = null;

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
// Apelidos e nomes de sala chegam pela rede: nunca injetar cru no HTML.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
const nf = (n) => Number(n || 0).toLocaleString('pt-BR');

export function toast(msg, ms = 2800) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function show(node) {
  root.innerHTML = '';
  root.appendChild(node);
  root.scrollTop = 0;
}

export function hideUI() { root.innerHTML = ''; }

function bind(node, sel, fn) {
  const b = node.querySelector(sel);
  if (b) b.addEventListener('click', () => { unlockAudio(); sfx.click(); fn(b); });
  return b;
}
function bindAll(node, sel, fn) {
  node.querySelectorAll(sel).forEach(e =>
    e.addEventListener('click', () => { unlockAudio(); sfx.click(); fn(e); }));
}

// ================================================================ CENTRAL
// state: { progress, rooms, loadingRooms, filter }
// decoração de céu compartilhada pelas telas do hub
function sceneDeco() {
  return `
    <div class="scene-stars"></div>
    <div class="scene-clouds">
      <div class="cloud" style="top:9%;animation-duration:52s;animation-delay:-12s"></div>
      <div class="cloud" style="top:20%;animation-duration:74s;animation-delay:-40s;transform:scale(.7)"></div>
      <div class="cloud" style="top:5%;animation-duration:63s;animation-delay:-30s;transform:scale(.55)"></div>
    </div>`;
}

function roomRowsHtml(rooms, loadingRooms) {
  return rooms.length ? rooms.map(r => {
    const g = getGame(r.game);
    const full = r.players >= r.max;
    return `
      <div class="room-row ${full ? 'full' : ''}" data-code="${esc(r.code)}" style="border-left-color:${g.accent}">
        <div class="rr-thumb">${gameArt(g)}</div>
        <div class="rr-body">
          <div class="rr-game">${esc(g.name)}</div>
          <div class="rr-host">${icon('character')} ${esc(r.host)}</div>
        </div>
        <div class="rr-side">
          <div class="rr-count ${full ? 'cheia' : ''}">${full ? '⛔' : '🟢'} ${r.players}/${r.max}</div>
          <button class="rr-btn" ${full ? 'disabled' : ''}>${full ? 'CHEIA' : 'ENTRAR'}</button>
        </div>
      </div>`;
  }).join('') : `
      <div class="empty-rooms">
        ${loadingRooms ? '<span class="waiting-dots">Procurando partidas</span>'
                       : 'Nenhuma partida aberta agora.<br><small>Toque em JOGAR e crie a sua!</small>'}
      </div>`;
}

const playersLabel = (g) => `${g.minPlayers === g.maxPlayers ? g.maxPlayers : `${g.minPlayers}–${g.maxPlayers}`} jogadores`;

function gameCardHtml(g) {
  return `
    <div class="gcard" data-game="${g.id}">
      ${gameArt(g)}
      <div class="gcard-body">
        <div class="gcard-name">${esc(g.name)}</div>
        <div class="gcard-meta">${playersLabel(g)} · ${esc(g.tagline)}</div>
      </div>
    </div>`;
}

function bottomNav(active, pending) {
  return `
    <div class="bottom-nav">
      <button class="nav-item ${active === 'hub' ? 'on' : ''}" data-nav="hub"><span class="ni">${icon('house')}</span>HUB</button>
      <button class="nav-item ${active === 'games' ? 'on' : ''}" data-nav="games"><span class="ni">${icon('gamepad')}</span>JOGOS</button>
      <button class="nav-item" data-nav="char"><span class="ni">${icon('character')}</span>VOCÊ</button>
      <button class="nav-item" data-nav="quests"><span class="ni">${icon('trophy')}</span>DESAFIOS${pending ? `<span class="badge">${pending}</span>` : ''}</button>
    </div>`;
}

// aba local do hub (sobrevive aos re-render de refreshRooms)
let hubView = 'home';

export function showHub(state, actions) {
  const { progress, rooms, loadingRooms } = state;
  const lv = levelInfo(progress.totalCoins);
  const skinId = progress.skin || 'azul';
  const cos = resolveCosmetics(progress);

  const homeView = `
    <div class="hero-stage">
      <div class="hero-title">PARTY HUB</div>
      <div class="hero-sub">DUELOS ENTRE AMIGOS</div>
      <div class="hero-char" data-a="char">${charSVG(skinId, { size: 118, cos })}</div>
      <div class="hero-podium"></div>
    </div>

    <button class="btn-mega" data-a="play">${icon('flame')} JOGAR</button>

    <div class="section-title"><span>JOGOS</span><button class="mini-btn" data-nav="games">ver todos</button></div>
    <div class="game-strip">${GAMES.map(gameCardHtml).join('')}</div>

    <div class="section-title"><span>PARTIDAS ABERTAS</span><button class="mini-btn" data-a="refresh">${icon('cycle')}</button></div>
    <div class="room-list">${roomRowsHtml(rooms, loadingRooms)}</div>`;

  const gamesView = `
    <div class="hero-title" style="font-size:24px;margin-top:4px">ESCOLHA UM JOGO</div>
    <div class="game-grid">${GAMES.map(gameCardHtml).join('')}</div>
    <div class="section-title"><span>PARTIDAS ABERTAS</span><button class="mini-btn" data-a="refresh">${icon('cycle')}</button></div>
    <div class="room-list">${roomRowsHtml(rooms, loadingRooms)}</div>
    <button class="btn ghost" data-a="upgrades" style="margin-top:4px">${icon('wrench')} OFICINA DE MELHORIAS</button>`;

  const node = el(`
    <div class="screen hub">
      ${sceneDeco()}
      <div class="hub-hud">
        <button class="player-pill" data-a="name">
          <span class="pp-avatar">${charSVG(skinId, { size: 30, blink: false, cos })}</span>
          <span class="pp-body">
            <span class="pp-name">${esc(progress.name || 'Jogador')} ✏️</span>
            <span class="pp-lv"><span class="pp-lv-num">Nv ${lv.level}</span><span class="xp-bar"><span class="xp-fill" style="width:${lv.pct}%"></span></span></span>
          </span>
        </button>
        <div class="coin-pill">${icon('twoCoins')} ${nf(progress.coins)}</div>
        <button class="icon-btn" data-a="settings">${icon('cog')}</button>
      </div>

      ${hubView === 'games' ? gamesView : homeView}
      ${bottomNav(hubView === 'games' ? 'games' : 'hub', state.pendingQuests)}
    </div>
  `);

  bindAll(node, '.gcard', (c) => actions.pickGame(c.dataset.game));
  bindAll(node, '.room-row:not(.full)', (r) => actions.joinCode(r.dataset.code));
  bindAll(node, '[data-a=refresh]', actions.refresh);
  bindAll(node, '[data-nav]', (b) => {
    const nav = b.dataset.nav;
    if (nav === 'hub') { hubView = 'home'; showHub(state, actions); }
    else if (nav === 'games') { hubView = 'games'; showHub(state, actions); }
    else if (nav === 'char') actions.skins();
    else if (nav === 'quests') actions.quests();
  });
  bind(node, '[data-a=play]', () => showPlaySheet(state, actions));
  bind(node, '[data-a=char]', actions.skins);
  bind(node, '[data-a=name]', () => showNameEditor(progress.name, actions.setName));
  bind(node, '[data-a=upgrades]', actions.upgrades);
  bind(node, '[data-a=settings]', () => showSettings(actions.resetProgress));
  show(node);
}

// folha de opções do botão JOGAR
function showPlaySheet(state, actions) {
  const back = el(`
    <div class="sheet-back">
      <div class="sheet">
        <div class="sheet-grip"></div>
        <h3>${icon('gamepad')} BORA JOGAR</h3>
        <button class="sheet-opt" data-a="create">
          <span class="so-ico" style="color:#ffd23e">${icon('sparkles')}</span>
          <span><span class="so-t">Criar partida</span><br><span class="so-s">Você escolhe o jogo e chama os amigos</span></span>
        </button>
        <button class="sheet-opt" data-a="rooms">
          <span class="so-ico" style="color:#4db6ff">${icon('earthAfricaEurope')}</span>
          <span><span class="so-t">Partidas abertas</span><br><span class="so-s">${state.rooms.length ? state.rooms.length + ' sala(s) esperando gente' : 'Ver a lista de salas públicas'}</span></span>
        </button>
        <button class="sheet-opt" data-a="code">
          <span class="so-ico" style="color:#ffd23e">${icon('key')}</span>
          <span><span class="so-t">Entrar com código</span><br><span class="so-s">Seu amigo te passou um código de 5 letras</span></span>
        </button>
        <button class="sheet-opt" data-a="scan">
          <span class="so-ico" style="color:#43d68c">${icon('photoCamera')}</span>
          <span><span class="so-t">Escanear QR Code</span><br><span class="so-s">Aponte a câmera para o convite</span></span>
        </button>
      </div>
    </div>`);
  back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  bind(back, '[data-a=create]', () => { back.remove(); actions.create(null); });
  bind(back, '[data-a=rooms]', () => {
    back.remove();
    const list = document.querySelector('.room-list');
    if (list) list.scrollIntoView({ behavior: 'smooth', block: 'center' });
    actions.refresh();
  });
  bind(back, '[data-a=code]', () => { back.remove(); actions.join(); });
  bind(back, '[data-a=scan]', async () => {
    back.remove();
    const code = await openScanner();
    if (code) actions.joinCode(code);
  });
  document.body.appendChild(back);
}

// ================================================================ MELHORIAS
// state: { progress, powerups: [{id,emoji,name,desc,kind,level,value,nextValue,cost}] }
export function showUpgrades(state, actions) {
  const { progress, powerups } = state;
  const fmt = (pu, v) => pu.kind === 'timed' ? `${v.toFixed(1)}s` : `${Math.round(v)}${pu.id === 'vida' ? ' vida' : ''}`;
  const pips = (level) => `
    <div class="up-pips">${[1, 2, 3, 4, 5].map(i => `<span class="up-pip ${i <= level ? 'on' : ''}"></span>`).join('')}</div>`;
  const cards = powerups.map(pu => `
    <div class="up-card">
      <div class="up-emoji">${pu.emoji}</div>
      <div class="up-body">
        <div class="up-name">${esc(pu.name)} <span class="up-lv">NV ${pu.level}</span></div>
        <div class="up-desc">${esc(pu.desc)}</div>
        <div class="up-val">${fmt(pu, pu.value)}${pu.nextValue !== null && pu.nextValue !== pu.value ? ` → <b>${fmt(pu, pu.nextValue)}</b>` : ''}</div>
        ${pips(pu.level)}
      </div>
      ${pu.cost !== null
        ? `<button class="up-buy ${progress.coins >= pu.cost ? '' : 'poor'}" data-pu="${pu.id}">${icon('twoCoins')} ${nf(pu.cost)}</button>`
        : '<div class="up-max">MÁX</div>'}
    </div>`).join('');

  const node = el(`
    <div class="screen">
      ${sceneDeco()}
      <h2>${icon('wrench')} OFICINA</h2>
      <div class="coin-bar">${icon('twoCoins')} ${nf(progress.coins)} <span class="dim">para gastar</span></div>
      <p class="hint">Os itens aparecem na pista durante a corrida. Melhore cada um para render mais quando você pegar.</p>
      <div class="up-list">${cards}</div>
      <button class="btn ghost" data-a="back">VOLTAR</button>
    </div>
  `);
  bindAll(node, '.up-buy', (b) => actions.buy(b.dataset.pu));
  bind(node, '[data-a=back]', actions.back);
  show(node);
}

// ================================================================ DETALHE DO JOGO
export function showGameDetail(gameId, actions) {
  const g = getGame(gameId);
  const node = el(`
    <div class="screen">
      ${sceneDeco()}
      <div class="detail-hero">
        ${gameArt(g)}
        <div class="dh-body">
          <h2>${esc(g.name)}</h2>
          <p class="hint">${esc(g.description)}</p>
          <div class="gc-meta">${playersLabel(g)} jogadores</div>
        </div>
      </div>
      ${g.soloOnly
        ? '<button class="btn-mega" data-a="solo" style="font-size:19px">JOGAR</button>'
        : `<button class="btn green" data-a="create">${icon('sparkles')} CRIAR PARTIDA</button>
           ${g.minPlayers <= 1 ? '<button class="btn ghost" data-a="solo">TREINAR SOZINHO</button>' : ''}`}
      <button class="btn ghost" data-a="back">VOLTAR</button>
    </div>
  `);
  bind(node, '[data-a=create]', () => actions.create(gameId));
  bind(node, '[data-a=solo]', () => actions.solo(gameId));
  bind(node, '[data-a=back]', actions.back);
  show(node);
}

// ================================================================ CRIAR SALA
// form: { gameId, visibility, maxPlayers, settings }
export function showCreate(form, actions) {
  const g = getGame(form.gameId);
  const min = Math.max(2, g.minPlayers);
  const cap = Math.min(g.maxPlayers, MAX_PLAYERS);
  const counts = [];
  for (let n = min; n <= cap; n++) counts.push(n);

  const settingsBlocks = (g.settings || []).map(s => `
    <div class="form-block">
      <div class="form-label">${esc(s.label)}</div>
      <div class="chip-row">
        ${s.choices.map(c => `
          <button class="chip ${form.settings[s.id] === c.id ? 'on' : ''}" data-set="${s.id}" data-val="${c.id}">
            <span class="ch-e">${c.emoji}</span><span class="ch-l">${esc(c.label)}</span>
          </button>`).join('')}
      </div>
      <div class="form-note">${esc((s.choices.find(c => c.id === form.settings[s.id]) || {}).desc || '')}</div>
    </div>`).join('');

  const node = el(`
    <div class="screen">
      ${sceneDeco()}
      <h2>${icon('gamepad')} NOVA PARTIDA</h2>

      <div class="form-block">
        <div class="form-label">ESCOLHA SEU JOGO</div>
        <div class="game-picker">
          ${GAMES.filter(x => !x.soloOnly).map(x => `
            <button class="gp ${x.id === form.gameId ? 'on' : ''}" data-game="${x.id}">
              ${gameArt(x)}
              <span class="gp-n">${esc(x.name)}</span>
            </button>`).join('')}
        </div>
      </div>

      <div class="form-block">
        <div class="form-label">Tipo de sala</div>
        <div class="chip-row">
          <button class="chip ${form.visibility === 'public' ? 'on' : ''}" data-vis="public">
            <span class="ch-e" style="color:#4db6ff">${icon('earthAfricaEurope')}</span><span class="ch-l">Pública</span>
          </button>
          <button class="chip ${form.visibility === 'private' ? 'on' : ''}" data-vis="private">
            <span class="ch-e" style="color:#ffd23e">${icon('padlock')}</span><span class="ch-l">Privada</span>
          </button>
        </div>
        <div class="form-note">${form.visibility === 'public'
          ? 'Aparece na lista para qualquer pessoa entrar.'
          : 'Só entra quem tiver o código ou o QR Code.'}</div>
      </div>

      <div class="form-block">
        <div class="form-label">Jogadores</div>
        <div class="chip-row">
          ${counts.map(n => `<button class="chip ${form.maxPlayers === n ? 'on' : ''}" data-count="${n}"><span class="ch-l">${n}</span></button>`).join('')}
        </div>
        ${min === cap ? `<div class="form-note">${esc(g.name)} é para ${cap} jogadores.</div>` : ''}
      </div>

      ${settingsBlocks}

      <button class="btn-mega" data-a="go" style="font-size:19px">${icon('sparkles')} CRIAR PARTIDA</button>
      <button class="btn ghost" data-a="back">VOLTAR</button>
    </div>
  `);

  bindAll(node, '.gp', (b) => actions.change({ gameId: b.dataset.game }));
  bindAll(node, '[data-vis]', (b) => actions.change({ visibility: b.dataset.vis }));
  bindAll(node, '[data-count]', (b) => actions.change({ maxPlayers: +b.dataset.count }));
  bindAll(node, '[data-set]', (b) => actions.change({ setting: [b.dataset.set, b.dataset.val] }));
  bind(node, '[data-a=go]', actions.submit);
  bind(node, '[data-a=back]', actions.back);
  show(node);
}

// ================================================================ ENTRAR
export function showJoin(prefill, actions) {
  const node = el(`
    <div class="screen">
      <h2>ENTRAR NA SALA</h2>
      <p class="hint">Digite o código da sala, ou aponte a câmera para o QR Code do seu amigo.</p>
      <input class="code-input" maxlength="5" placeholder="•••••"
             autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false"
             inputmode="text" value="${esc(prefill || '')}" />
      <button class="btn green" data-a="enter">ENTRAR</button>
      <button class="btn orange" data-a="scan">📷 ESCANEAR QR</button>
      <button class="btn ghost" data-a="back">VOLTAR</button>
    </div>
  `);
  const input = node.querySelector('.code-input');
  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  const submit = () => {
    const code = input.value.trim();
    if (code.length < 4) { toast('Código muito curto'); return; }
    actions.enter(code);
  };
  bind(node, '[data-a=enter]', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  bind(node, '[data-a=scan]', async () => {
    const code = await openScanner();
    if (!code) return;
    input.value = code;
    actions.enter(code);
  });
  bind(node, '[data-a=back]', actions.back);
  show(node);
  if (!prefill) setTimeout(() => input.focus(), 120);
}

export function showBusy(text = 'Conectando') {
  show(el(`<div class="screen"><h2 class="waiting-dots">${esc(text)}</h2></div>`));
}

// ================================================================ LOBBY
// state: { isHost, code, qr, link, room:{gameId,visibility,maxPlayers,settings}, players }
export function showLobby(state, actions) {
  const { isHost, code, qr, room, players } = state;
  const g = getGame(room.gameId);

  const slots = [];
  for (let i = 0; i < room.maxPlayers; i++) {
    const p = players.find(x => x.slot === i);
    if (!p) {
      slots.push(`
        <div class="stage-slot empty">
          <div class="stage-ghost">?</div>
          <div class="stage-name" style="color:var(--muted)">Vago</div>
          <div class="stage-stat">aguardando</div>
        </div>`);
      continue;
    }
    // o boneco já aparece na COR que o jogador terá dentro da partida
    slots.push(`
      <div class="stage-slot" style="animation-delay:${i * 0.08}s">
        <div class="stage-char" style="animation-delay:${i * 0.4}s">${charSVG(p.skin || 'azul', { size: 62, tint: SLOT_COLORS[i % SLOT_COLORS.length], cos: p.cos })}</div>
        <div class="stage-name" style="color:${slotHex(i)}">${p.isHost ? icon('crown', 'gi-gold') + ' ' : ''}${esc(p.name)}${p.isYou ? ' ' + icon('roundStar', 'gi-gold') : ''}</div>
        <div class="stage-stat ${p.ready ? 'ok' : ''}">${p.ready ? icon('checkMark') + ' PRONTO' : 'esperando…'}</div>
      </div>`);
  }

  const settingsView = (g.settings || []).map(s => {
    const cur = s.choices.find(c => c.id === room.settings[s.id]) || s.choices[0];
    if (!isHost) return `<div class="set-readonly">${cur.emoji} ${esc(s.label)}: <b>${esc(cur.label)}</b></div>`;
    return `
      <div class="form-block">
        <div class="form-label">${esc(s.label)}</div>
        <div class="chip-row">
          ${s.choices.map(c => `
            <button class="chip ${room.settings[s.id] === c.id ? 'on' : ''}" data-set="${s.id}" data-val="${c.id}">
              <span class="ch-e">${c.emoji}</span><span class="ch-l">${esc(c.label)}</span>
            </button>`).join('')}
        </div>
      </div>`;
  }).join('');

  const others = players.filter(p => !p.isYou);
  const readyCount = others.filter(p => p.ready).length;
  const me = players.find(p => p.isYou);
  const enough = players.length >= Math.max(2, g.minPlayers);

  const action = isHost
    ? `<button class="btn green" data-a="start" ${enough ? '' : 'disabled'}>
         ${!enough ? `PRECISA DE ${Math.max(2, g.minPlayers)} JOGADORES`
                   : (readyCount === others.length ? 'INICIAR PARTIDA' : `INICIAR (${readyCount}/${others.length} prontos)`)}
       </button>`
    : `<button class="btn green" data-a="ready" ${me && me.ready ? 'disabled' : ''}>
         ${me && me.ready ? 'AGUARDANDO HOST…' : 'PRONTO!'}
       </button>`;

  const node = el(`
    <div class="screen">
      ${sceneDeco()}
      <div class="lobby-head">
        <div class="lh-art">${gameArt(g)}</div>
        <h2>${esc(g.name)}</h2>
        <div class="lh-tag">${room.visibility === 'public' ? icon('earthAfricaEurope') + ' Sala pública' : icon('padlock') + ' Sala privada'} · ${players.length}/${room.maxPlayers}</div>
      </div>

      <div class="stage">${slots}</div>

      <div class="room-card">
        <div class="room-code">${esc(code)}</div>
        ${qr ? `<img class="qr" src="${qr}" alt="QR Code da sala" />` : ''}
        <span class="copy-link" data-a="copy">copiar link de convite</span>
      </div>

      ${settingsView}
      ${action}
      <button class="btn ghost" data-a="leave">SAIR DA SALA</button>
    </div>
  `);

  if (isHost) {
    bindAll(node, '[data-set]', (b) => actions.setSetting(b.dataset.set, b.dataset.val));
    bind(node, '[data-a=start]', actions.start);
  } else {
    bind(node, '[data-a=ready]', actions.ready);
  }
  bind(node, '[data-a=copy]', async () => {
    try { await navigator.clipboard.writeText(state.link); toast('Link copiado! 📋'); }
    catch { toast('Código: ' + code); }
  });
  bind(node, '[data-a=leave]', actions.leave);
  show(node);
}

// ================================================================ RESULTADO
// res: { gameId, rows:[{slot,name,score,detail,win,you}], note, canRematch, isHost }
export function showResult(res, actions) {
  const medals = ['🥇', '🥈', '🥉', '4️⃣'];
  const rows = res.rows.map((r, i) => `
    <div class="result-row ${r.win ? 'win' : ''}" style="border-left:4px solid ${slotHex(r.slot)}">
      <div class="rname">${medals[i] || ''} ${esc(r.name)}${r.you ? ' (você)' : ''}</div>
      <div class="rstats">${esc(r.detail || '')}<br><b>${nf(r.score)}</b> pts</div>
    </div>`).join('');

  // pódio com os bonecos dos 3 primeiros (2º | 1º | 3º), só em partida com gente
  const top = res.rows.slice(0, 3);
  const podium = top.length > 1 ? `
    <div class="podium">
      ${[top[1], top[0], top[2]].filter(Boolean).map((r) => {
        const place = res.rows.indexOf(r) + 1;
        return `
          <div class="pod-col pod-${place}">
            <div class="stage-char">${charSVG('azul', { size: place === 1 ? 62 : 48, tint: SLOT_COLORS[r.slot % SLOT_COLORS.length] })}</div>
            <div class="pod-name" style="color:${slotHex(r.slot)}">${esc(r.name)}</div>
            <div class="pod-block">${medals[place - 1] || place + 'º'}</div>
          </div>`;
      }).join('')}
    </div>` : '';

  const records = (res.records || [])
    .map(t => `<div class="record-line">🏅 ${esc(t)}</div>`).join('');

  const node = el(`
    <div class="screen">
      ${sceneDeco()}
      <div class="winner-name" style="font-size:26px">${res.trophy || '🏆'} ${esc(res.title)}</div>
      ${podium}
      <div class="result-card">
        ${rows}
        ${records}
        ${res.earned ? `<div class="coin-bar" style="justify-content:center">+${icon('twoCoins')} ${nf(res.earned)}</div>` : ''}
        ${res.note ? `<p class="hint" style="max-width:none">${esc(res.note)}</p>` : ''}
      </div>
      ${res.canRematch ? `<button class="btn-mega" data-a="again" style="font-size:19px">${res.isHost ? '🔄 JOGAR NOVAMENTE' : '🔄 QUERO REVANCHE'}</button>` : ''}
      <button class="btn ghost" data-a="exit">${esc(res.exitLabel || 'SAIR DA SALA')}</button>
    </div>
  `);
  const againBtn = bind(node, '[data-a=again]', (b) => {
    if (!res.isHost) { b.disabled = true; b.textContent = 'AGUARDANDO HOST…'; }
    actions.again();
  });
  bind(node, '[data-a=exit]', actions.exit);
  show(node);
  return { againBtn };
}

// ================================================================ MISSÕES
// tab: 'daily' | 'general' | 'ach'
export function showQuests(q, tab, actions) {
  const bar = (p, goal) => `
    <div class="q-bar"><div class="q-fill" style="width:${Math.min(100, (p / goal) * 100)}%"></div></div>`;

  const missionRow = (m) => `
    <div class="q-row ${m.done ? 'done' : ''}">
      <div class="q-emoji">${m.emoji}</div>
      <div class="q-body">
        <div class="q-text">${esc(m.text)}</div>
        ${bar(m.progress, m.goal)}
        <div class="q-sub">${nf(m.progress)} / ${nf(m.goal)}</div>
      </div>
      ${m.claimed
        ? `<div class="q-ok">${icon('checkMark')}</div>`
        : m.done
          ? `<button class="q-claim" data-claim="${m.id}">${icon('twoCoins')} ${m.reward}</button>`
          : `<div class="q-prize">${icon('twoCoins')} ${m.reward}</div>`}
    </div>`;

  const achRow = (a) => `
    <div class="q-row ${a.done ? 'done' : 'locked'}">
      <div class="q-emoji">${a.done ? a.emoji : '🔒'}</div>
      <div class="q-body">
        <div class="q-text">${esc(a.name)}</div>
        <div class="q-sub">${esc(a.desc)}</div>
        ${a.done ? '' : bar(a.progress, a.goal)}
      </div>
      ${a.done ? `<div class="q-ok">${icon('checkMark')}</div>` : `<div class="q-prize">${icon('twoCoins')} ${a.reward}</div>`}
    </div>`;

  const lists = {
    daily: q.daily.length ? q.daily.map(missionRow).join('') : '<div class="empty-rooms">Sem missões hoje.</div>',
    general: q.general.map(missionRow).join(''),
    ach: q.achievements.map(achRow).join(''),
  };
  const doneAch = q.achievements.filter(a => a.done).length;

  const node = el(`
    <div class="screen hub" style="padding-bottom:calc(24px + var(--safe-bottom))">
      ${sceneDeco()}
      <h2>${icon('trophy', 'gi-gold')} DESAFIOS</h2>
      <div class="q-stats">
        <span>${icon('medal')} ${doneAch}/${q.achievements.length} conquistas</span>
        <span>${icon('archeryTarget')} ${q.daysPlayed} ${q.daysPlayed === 1 ? 'dia' : 'dias'}</span>
      </div>
      <div class="filters">
        <button class="filter ${tab === 'daily' ? 'on' : ''}" data-tab="daily">${icon('flame')} Diários</button>
        <button class="filter ${tab === 'general' ? 'on' : ''}" data-tab="general">${icon('roundStar')} Gerais</button>
        <button class="filter ${tab === 'ach' ? 'on' : ''}" data-tab="ach">${icon('medal')} Conquistas</button>
      </div>
      ${tab === 'daily' ? '<p class="hint">Trocam todo dia à meia-noite.</p>' : ''}
      <div class="q-list">${lists[tab]}</div>
      <button class="btn ghost" data-a="back">VOLTAR</button>
    </div>
  `);

  bindAll(node, '[data-tab]', (b) => actions.tab(b.dataset.tab));
  bindAll(node, '[data-claim]', (b) => actions.claim(b.dataset.claim));
  bind(node, '[data-a=back]', actions.back);
  show(node);
}

// Celebração no fim da partida.
export function showRewards({ unlocked, claimedNow }, onClose) {
  const items = [
    ...unlocked.map(a => `
      <div class="rw-row">
        <div class="rw-emoji">${a.emoji}</div>
        <div><b>${esc(a.name)}</b><div class="q-sub">Conquista desbloqueada · ${icon('twoCoins', 'gi-gold')} ${a.reward}</div></div>
      </div>`),
    ...claimedNow.map(m => `
      <div class="rw-row">
        <div class="rw-emoji">${m.emoji}</div>
        <div><b>${esc(m.text)}</b><div class="q-sub">Missão concluída · ${icon('twoCoins', 'gi-gold')} ${m.reward}</div></div>
      </div>`),
  ].join('');
  const m = modal(`<h3>🎉 RECOMPENSAS</h3>${items}<button class="btn green" data-a="ok">MARAVILHA</button>`);
  bind(m, '[data-a=ok]', () => { m.remove(); onClose && onClose(); });
}

// ================================================================ PERSONAGENS
// Vitrine do personagem: aba "Personagem" (skins, destravadas por moedas
// acumuladas) + uma aba por categoria de cosmético (compradas com moedas).
// Cada card mostra o SEU boneco já vestindo a peça, para dar para imaginar.
export function showSkins(progress, preview, actions, tab = 'skin') {
  const current = SKINS.find(s => s.id === progress.skin) || SKINS[0];
  const cos = resolveCosmetics(progress);
  const owned = progress.owned || [];

  const skinCards = SKINS.map(s => {
    const unlocked = isUnlocked(s, progress.totalCoins);
    const sel = s.id === progress.skin;
    return `
      <div class="skin-card ${sel ? 'on' : ''} ${unlocked ? '' : 'locked'}" data-skin="${s.id}">
        ${charSVG(s.id, { size: 42, blink: false, cos })}
        <div class="sn">${unlocked ? esc(s.name) : icon('padlock')}</div>
        <div class="sc">${unlocked ? (sel ? 'em uso' : 'disponível') : icon('twoCoins', 'gi-gold') + ' ' + nf(s.cost)}</div>
      </div>`;
  }).join('');

  const cosCards = tab === 'skin' ? '' : listOf(tab).map(it => {
    const has = ownsCosmetic(it, owned);
    const sel = cos[tab] === it.id;
    return `
      <div class="skin-card ${sel ? 'on' : ''} ${has ? '' : 'locked'}" data-cos="${it.id}" data-slot="${tab}">
        ${charSVG(progress.skin, { size: 42, blink: false, cos: { ...cos, [tab]: it.id } })}
        <div class="sn">${esc(it.name)}</div>
        <div class="sc">${has ? (sel ? 'em uso' : 'disponível') : icon('twoCoins', 'gi-gold') + ' ' + nf(it.cost)}</div>
      </div>`;
  }).join('');

  const hint = tab === 'skin'
    ? 'Nas salas, a cor vem da sua posição — o personagem define o formato.'
    : tab === 'color'
      ? 'Vale no treino solo. Nas salas cada um fica com a cor da sua posição.'
      : 'O que você equipar aparece em todos os jogos.';

  // Layout em três faixas: cabeçalho fixo, grade que rola sozinha, botão fixo.
  // Assim a rolagem fica contida na grade em vez de arrastar a tela inteira.
  const node = el(`
    <div class="screen fixed">
      ${sceneDeco()}
      <div class="fixed-top char-hero">
        <div class="hero-char">${charSVG(progress.skin, { size: 112, cos })}</div>
        <div class="hero-podium"></div>
        <h2>${esc(current.name).toUpperCase()}</h2>
        <div class="coin-bar">${icon('twoCoins')} ${nf(progress.coins)} <span class="dim">moedas</span></div>
      </div>
      <div class="tab-strip">
        <button class="filter ${tab === 'skin' ? 'on' : ''}" data-ctab="skin">Personagem</button>
        ${SLOTS.map(s => `<button class="filter ${tab === s.id ? 'on' : ''}" data-ctab="${s.id}">${s.name}</button>`).join('')}
      </div>
      <div class="scroll-area">
        <div class="skin-grid">${tab === 'skin' ? skinCards : cosCards}</div>
        <p class="hint">${hint}</p>
      </div>
      <div class="fixed-bottom">
        <button class="btn ghost" data-a="back">VOLTAR</button>
      </div>
    </div>
  `);
  bindAll(node, '[data-ctab]', (b) => actions.tab(b.dataset.ctab));
  // a aba ativa fica visível mesmo com a faixa rolando na horizontal
  const active = node.querySelector('.tab-strip .on');
  if (active) requestAnimationFrame(() => active.scrollIntoView({ inline: 'center', block: 'nearest' }));

  node.querySelectorAll('[data-skin]').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.skin;
      const skin = SKINS.find(s => s.id === id);
      unlockAudio();
      if (!isUnlocked(skin, progress.totalCoins)) {
        toast(`Faltam ${nf(skin.cost - progress.totalCoins)} moedas para ${skin.name}`);
        return;
      }
      sfx.powerup();
      actions.pick(id);
    });
  });
  node.querySelectorAll('[data-cos]').forEach(card => {
    card.addEventListener('click', () => {
      const slot = card.dataset.slot;
      const item = listOf(slot).find(x => x.id === card.dataset.cos);
      unlockAudio();
      if (ownsCosmetic(item, owned)) { sfx.powerup(); actions.equip(slot, item.id); return; }
      if (progress.coins < item.cost) {
        toast(`Faltam ${nf(item.cost - progress.coins)} moedas para ${item.name}`);
        return;
      }
      actions.buy(slot, item.id, item.cost);
    });
  });
  bind(node, '[data-a=back]', actions.back);
  show(node);
}

// ================================================================ MODAIS
function modal(inner) {
  const back = el(`<div class="modal-back"><div class="modal">${inner}</div></div>`);
  back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  document.body.appendChild(back);
  return back;
}

export function showNameEditor(current, onSave) {
  const m = modal(`
    <h3>SEU APELIDO</h3>
    <p class="hint" style="margin:0 auto">É o nome que os outros jogadores veem.</p>
    <input class="name-input" maxlength="12" placeholder="Jogador"
           autocomplete="off" autocorrect="off" spellcheck="false" value="${esc(current || '')}" />
    <button class="btn green" data-a="save">SALVAR</button>
    <button class="btn ghost" data-a="cancel">CANCELAR</button>
  `);
  const input = m.querySelector('.name-input');
  const save = () => { onSave(input.value); m.remove(); };
  bind(m, '[data-a=save]', save);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  bind(m, '[data-a=cancel]', () => m.remove());
  setTimeout(() => { input.focus(); input.select(); }, 120);
}

// Instruções específicas de cada jogo, mostradas antes da primeira partida.
const HOWTO = {
  runner: [
    ['👈👉', 'Deslize para os lados', 'troca de faixa'],
    ['👆', 'Deslize para cima', 'pula barreiras e buracos'],
    ['👇', 'Deslize para baixo', 'desliza sob obstáculos altos'],
    ['❤️', '3 vidas', 'bater derruba sua velocidade'],
  ],
  flappy: [
    ['👆', 'Toque na tela', 'bate as asas e sobe'],
    ['🫳', 'Sem tocar', 'você cai — ache o ritmo'],
    ['🟩', 'Atravesse os canos', 'cada um vale um ponto'],
    ['💥', 'Uma batida', 'e sua rodada acaba'],
  ],
  bomb: [
    ['🕹️', 'Arraste na esquerda', 'joystick para andar'],
    ['💣', 'Botão da direita', 'planta uma bomba'],
    ['💥', 'Explosão em cruz', 'quebra caixotes e elimina rivais'],
    ['🎁', 'Caixotes escondem itens', 'alcance, bombas, velocidade, escudo'],
    ['☠️', 'Rodada demorando?', 'a arena fecha em lava'],
  ],
  tag: [
    ['🕹️', 'Arraste em qualquer lugar', 'joystick para correr'],
    ['👹', 'Um jogador pega', 'aura vermelha e 👹 na cabeça'],
    ['🤝', 'Encostou, trocou', 'quem for pego vira o pegador'],
    ['⚡🛡️❄️', 'Pegue os itens', 'velocidade, escudo e congelar'],
    ['⏱️', '90 segundos', 'fuja, capture e some pontos'],
  ],
  td: [
    ['👆', 'Toque num espaço livre', 'abre o menu de construção'],
    ['🏹', 'Cada torre tem um papel', 'arqueiro, mago, gelo e canhão'],
    ['⬆️', 'Toque numa torre', 'melhora, especializa ou vende'],
    ['⏱️', 'Entre as ondas', 'prepare-se ou toque em INICIAR AGORA'],
    ['❤️', 'Inimigo que passa tira vida', 'zerou, acabou — vale a melhor onda'],
  ],
  island: [
    ['🕹️', 'Arraste para andar', 'joystick em qualquer lugar da tela'],
    ['🌳', 'Aproxime-se e toque em COLETAR', 'madeira, pedra, fibra e fruta'],
    ['🏗️', 'Construa no acampamento', 'fogueira, abrigo e bancada'],
    ['🔨', 'Na bancada', 'melhore machado e picareta'],
    ['💾', 'Tudo fica salvo', 'a ilha continua de onde você parou'],
  ],
  guess: [
    ['⌨️', 'Digite uma palavra', 'qualquer palpite vale'],
    ['🌡️', 'O jogo diz o quanto', 'você chegou perto do significado'],
    ['🔥', 'Quente', 'significa que a ideia é parecida'],
    ['🎯', 'Quem acertar primeiro', 'leva mais pontos'],
  ],
};

export function showHowTo(gameId) {
  const g = getGame(gameId);
  const items = (HOWTO[gameId] || []).map(([ico, t, s]) =>
    `<div class="howto-item"><span class="ico">${ico}</span><div><b>${t}</b>${s}</div></div>`).join('');
  const m = modal(`
    <h3>${g.emoji} ${esc(g.name)}</h3>
    ${items}
    <button class="btn" data-a="ok">ENTENDI</button>
  `);
  return new Promise((resolve) => {
    bind(m, '[data-a=ok]', () => { m.remove(); resolve(); });
  });
}

export function showSettings(onReset) {
  const p = getPrefs();
  const m = modal(`
    <h3>AJUSTES</h3>
    <div class="row"><span>🔊 Som</span><div class="toggle ${p.sound ? 'on' : ''}" data-a="sound"></div></div>
    <div class="row"><span>🎵 Música</span><div class="toggle ${p.music ? 'on' : ''}" data-a="music"></div></div>
    <button class="btn ghost" data-a="reset">APAGAR PROGRESSO</button>
    <button class="btn" data-a="ok">FECHAR</button>
  `);
  m.querySelector('[data-a=sound]').addEventListener('click', (e) => {
    const on = !e.target.classList.contains('on');
    e.target.classList.toggle('on', on);
    setSound(on);
    if (on) sfx.click();
  });
  m.querySelector('[data-a=music]').addEventListener('click', (e) => {
    const on = !e.target.classList.contains('on');
    e.target.classList.toggle('on', on);
    setMusic(on);
  });
  bind(m, '[data-a=reset]', (b) => {
    if (b.dataset.sure) { onReset && onReset(); m.remove(); toast('Progresso apagado'); }
    else { b.dataset.sure = '1'; b.textContent = 'TEM CERTEZA? TOQUE DE NOVO'; }
  });
  bind(m, '[data-a=ok]', () => m.remove());
}

// Aviso ao host quando alguém cai no meio da partida.
export function askContinue(who, onContinue, onEnd) {
  const m = modal(`
    <h3>⚠️ ${esc(who)} SAIU</h3>
    <p class="hint" style="margin:0 auto">A partida pode seguir com quem ficou.</p>
    <button class="btn green" data-a="go">CONTINUAR</button>
    <button class="btn ghost" data-a="end">ENCERRAR PARTIDA</button>
  `);
  bind(m, '[data-a=go]', () => { m.remove(); onContinue && onContinue(); });
  bind(m, '[data-a=end]', () => { m.remove(); onEnd && onEnd(); });
  return m;
}
