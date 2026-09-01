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
export function showHub(state, actions) {
  const { progress, rooms, loadingRooms, filter } = state;

  const cards = gamesByCategory(filter).map(g => `
    <div class="game-card" data-game="${g.id}" style="--accent:${g.accent}">
      <div class="gc-emoji">${g.emoji}</div>
      <div class="gc-body">
        <div class="gc-name">${esc(g.name)}</div>
        <div class="gc-tag">${esc(g.tagline)}</div>
        <div class="gc-meta">👥 ${g.minPlayers === g.maxPlayers ? g.maxPlayers : `${g.minPlayers}–${g.maxPlayers}`} jogadores</div>
      </div>
      <div class="gc-go">▶</div>
    </div>`).join('');

  const roomRows = rooms.length ? rooms.map(r => {
    const g = getGame(r.game);
    const full = r.players >= r.max;
    return `
      <div class="room-row ${full ? 'full' : ''}" data-code="${esc(r.code)}">
        <div class="rr-emoji">${g.emoji}</div>
        <div class="rr-body">
          <div class="rr-game">${esc(g.name)}</div>
          <div class="rr-host">👤 ${esc(r.host)}</div>
        </div>
        <div class="rr-side">
          <div class="rr-count ${full ? 'cheia' : ''}">👥 ${r.players}/${r.max}</div>
          <button class="rr-btn" ${full ? 'disabled' : ''}>${full ? 'CHEIA' : 'ENTRAR'}</button>
        </div>
      </div>`;
  }).join('') : `
      <div class="empty-rooms">
        ${loadingRooms ? '<span class="waiting-dots">Procurando salas</span>'
                       : 'Nenhuma sala pública aberta agora.<br><small>Crie a sua ou entre por código.</small>'}
      </div>`;

  const node = el(`
    <div class="screen hub">
      <div class="hub-top">
        <div class="logo-sm">🎮 PARTY HUB</div>
        <div class="name-tag" data-a="name">
          <b>${esc(progress.name || 'Jogador')}</b><span class="nt-edit">✏️</span>
        </div>
      </div>

      <div class="section-title">JOGOS</div>
      <div class="filters">
        ${CATEGORIES.map(c => `<button class="filter ${c.id === filter ? 'on' : ''}" data-cat="${c.id}">${c.name}</button>`).join('')}
      </div>
      <div class="game-list">${cards}</div>

      <div class="section-title row-between">
        <span>SALAS PÚBLICAS</span>
        <button class="mini-btn" data-a="refresh">↻</button>
      </div>
      <div class="room-list">${roomRows}</div>

      <button class="btn green" data-a="create">CRIAR SALA</button>
      <button class="btn orange" data-a="join">ENTRAR COM CÓDIGO</button>
      <div class="hub-foot">
        <button class="mini-link" data-a="skins">🎭 Personagens</button>
        <button class="mini-link" data-a="upgrades">🧪 Melhorias</button>
        <button class="mini-link" data-a="settings">⚙️ Ajustes</button>
      </div>
    </div>
  `);

  bindAll(node, '.filter', (b) => actions.filter(b.dataset.cat));
  bindAll(node, '.game-card', (c) => actions.pickGame(c.dataset.game));
  bindAll(node, '.room-row:not(.full)', (r) => actions.joinCode(r.dataset.code));
  bind(node, '[data-a=refresh]', actions.refresh);
  bind(node, '[data-a=create]', () => actions.create(null));
  bind(node, '[data-a=join]', actions.join);
  bind(node, '[data-a=name]', () => showNameEditor(progress.name, actions.setName));
  bind(node, '[data-a=skins]', actions.skins);
  bind(node, '[data-a=upgrades]', actions.upgrades);
  bind(node, '[data-a=settings]', () => showSettings(actions.resetProgress));
  show(node);
}

// ================================================================ MELHORIAS
// state: { progress, powerups: [{id,emoji,name,desc,kind,level,value,nextValue,cost}] }
export function showUpgrades(state, actions) {
  const { progress, powerups } = state;
  const fmt = (pu, v) => pu.kind === 'timed' ? `${v.toFixed(1)}s` : `${Math.round(v)}${pu.id === 'vida' ? ' vida' : ''}`;
  const cards = powerups.map(pu => `
    <div class="up-card">
      <div class="up-emoji">${pu.emoji}</div>
      <div class="up-body">
        <div class="up-name">${esc(pu.name)} <span class="up-lv">nv ${pu.level}</span></div>
        <div class="up-desc">${esc(pu.desc)}</div>
        <div class="up-val">${fmt(pu, pu.value)}${pu.nextValue !== null && pu.nextValue !== pu.value ? ` → <b>${fmt(pu, pu.nextValue)}</b>` : ''}</div>
      </div>
      ${pu.cost !== null
        ? `<button class="up-buy ${progress.coins >= pu.cost ? '' : 'poor'}" data-pu="${pu.id}">🪙 ${nf(pu.cost)}</button>`
        : '<div class="up-max">MÁX</div>'}
    </div>`).join('');

  const node = el(`
    <div class="screen">
      <h2>MELHORIAS</h2>
      <div class="coin-bar">🪙 ${nf(progress.coins)} <span class="dim">para gastar</span></div>
      <p class="hint">Os itens aparecem na pista durante a corrida. Melhore cada um para ele durar mais (ou render mais) quando você pegar.</p>
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
      <div class="detail-hero" style="--accent:${g.accent}">
        <div class="dh-emoji">${g.emoji}</div>
        <h2>${esc(g.name)}</h2>
        <p class="hint">${esc(g.description)}</p>
        <div class="gc-meta">👥 ${g.minPlayers === g.maxPlayers ? g.maxPlayers : `${g.minPlayers}–${g.maxPlayers}`} jogadores</div>
      </div>
      <button class="btn green" data-a="create">CRIAR SALA</button>
      ${g.minPlayers <= 1 ? '<button class="btn ghost" data-a="solo">🏃 TREINAR SOZINHO</button>' : ''}
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
      <h2>CRIAR SALA</h2>

      <div class="form-block">
        <div class="form-label">Jogo</div>
        <div class="game-picker">
          ${GAMES.map(x => `
            <button class="gp ${x.id === form.gameId ? 'on' : ''}" data-game="${x.id}" style="--accent:${x.accent}">
              <span class="gp-e">${x.emoji}</span><span class="gp-n">${esc(x.name)}</span>
            </button>`).join('')}
        </div>
      </div>

      <div class="form-block">
        <div class="form-label">Tipo de sala</div>
        <div class="chip-row">
          <button class="chip ${form.visibility === 'public' ? 'on' : ''}" data-vis="public">
            <span class="ch-e">🌎</span><span class="ch-l">Pública</span>
          </button>
          <button class="chip ${form.visibility === 'private' ? 'on' : ''}" data-vis="private">
            <span class="ch-e">🔒</span><span class="ch-l">Privada</span>
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

      <button class="btn green" data-a="go">CRIAR SALA</button>
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
        <div class="pslot empty">
          <div class="pdot" style="background:${slotHex(i)};opacity:.3"></div>
          <div class="pname">Vago</div>
          <div class="pstat">aguardando</div>
        </div>`);
      continue;
    }
    slots.push(`
      <div class="pslot ${p.isYou ? 'you' : ''}" style="border-color:${slotHex(i)}">
        <div class="pdot" style="background:${slotHex(i)}"></div>
        <div class="pname">${p.isHost ? '👑 ' : ''}${esc(p.name)}${p.isYou ? ' (você)' : ''}</div>
        <div class="pstat ${p.ready ? 'ok' : ''}">${p.ready ? '✓ PRONTO' : 'esperando'}</div>
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
      <div class="lobby-head" style="--accent:${g.accent}">
        <span class="lh-emoji">${g.emoji}</span>
        <h2>${esc(g.name)}</h2>
        <div class="lh-tag">${room.visibility === 'public' ? '🌎 Sala pública' : '🔒 Sala privada'}</div>
      </div>

      <div class="room-card">
        <div class="room-code">${esc(code)}</div>
        ${qr ? `<img class="qr" src="${qr}" alt="QR Code da sala" />` : ''}
        <span class="copy-link" data-a="copy">copiar link de convite</span>
      </div>

      <div class="pgrid">${slots}</div>
      <div class="pcount">${players.length}/${room.maxPlayers}</div>

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
  const g = getGame(res.gameId);
  const medals = ['🥇', '🥈', '🥉', '4️⃣'];
  const rows = res.rows.map((r, i) => `
    <div class="result-row ${r.win ? 'win' : ''}" style="border-left:4px solid ${slotHex(r.slot)}">
      <div class="rname">${medals[i] || ''} ${esc(r.name)}${r.you ? ' (você)' : ''}</div>
      <div class="rstats">${esc(r.detail || '')}<br><b>${nf(r.score)}</b> pts</div>
    </div>`).join('');

  const records = (res.records || [])
    .map(t => `<div class="record-line">🏅 ${esc(t)}</div>`).join('');

  const node = el(`
    <div class="screen">
      <h2>RESULTADO</h2>
      <div class="result-card">
        <div class="trophy">${res.trophy || '🏆'}</div>
        <div class="winner-name">${esc(res.title)}</div>
        ${rows}
        ${records}
        ${res.earned ? `<div class="coin-bar" style="justify-content:center">+🪙 ${nf(res.earned)}</div>` : ''}
        ${res.note ? `<p class="hint" style="max-width:none">${esc(res.note)}</p>` : ''}
      </div>
      ${res.canRematch ? `<button class="btn green" data-a="again">${res.isHost ? 'JOGAR NOVAMENTE' : 'QUERO REVANCHE'}</button>` : ''}
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

// ================================================================ PERSONAGENS
export function showSkins(progress, preview, actions) {
  const cards = SKINS.map(s => {
    const unlocked = isUnlocked(s, progress.totalCoins);
    const sel = s.id === progress.skin;
    return `
      <div class="skin-card ${sel ? 'on' : ''} ${unlocked ? '' : 'locked'}" data-skin="${s.id}">
        <img src="${preview(s.id)}" alt="${esc(s.name)}" />
        <div class="sn">${unlocked ? esc(s.name) : '🔒'}</div>
        <div class="sc">${unlocked ? (sel ? 'em uso' : 'disponível') : '🪙 ' + nf(s.cost)}</div>
      </div>`;
  }).join('');

  const node = el(`
    <div class="screen">
      <h2>PERSONAGENS</h2>
      <div class="coin-bar">🪙 ${nf(progress.totalCoins)} <span class="dim">acumuladas</span></div>
      <div class="skin-grid">${cards}</div>
      <p class="hint">Nas salas, a cor vem da sua posição — o personagem define o formato. Junte moedas correndo para destravar novos.</p>
      <button class="btn ghost" data-a="back">VOLTAR</button>
    </div>
  `);
  node.querySelectorAll('.skin-card').forEach(card => {
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
