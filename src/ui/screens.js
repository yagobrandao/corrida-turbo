// Todas as telas DOM (menu, salas, lobby, skins, resultado) ficam aqui.
// A lógica de fluxo mora no main.js: este módulo só renderiza e emite ações.
import { sfx, unlockAudio, getPrefs, setSound, setMusic } from '../game/audio.js';
import { SKINS, isUnlocked } from '../game/skins.js';
import { DIFFICULTIES, getDifficulty, SLOT_COLORS } from '../core/config.js';
import { openScanner } from './qrscan.js';

const root = document.getElementById('ui-root');
const toastEl = document.getElementById('toast');
let toastTimer = null;

export function toast(msg, ms = 2600) {
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
}

export function hideUI() { root.innerHTML = ''; }

function bindBtn(node, sel, fn) {
  const b = node.querySelector(sel);
  if (b) b.addEventListener('click', () => { unlockAudio(); sfx.click(); fn(b); });
  return b;
}

const nf = (n) => Number(n || 0).toLocaleString('pt-BR');

// Apelidos chegam pela rede, escritos por outras pessoas: nunca injetar cru.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

const slotColor = (slot) => '#' + SLOT_COLORS[slot % SLOT_COLORS.length].toString(16).padStart(6, '0');

// ---------------------------------------------------------------- menu
export function showMenu(progress, actions) {
  const node = el(`
    <div class="screen">
      <div class="logo">CORRIDA<br>TURBO<small>DUELO INFINITO</small></div>
      <div class="name-tag" data-a="name">
        <span class="nt-label">você é</span>
        <b>${esc(progress.name || 'Jogador')}</b>
        <span class="nt-edit">✏️</span>
      </div>
      <div class="coin-bar">🪙 ${nf(progress.coins)}<span style="color:var(--muted);font-size:12px;font-weight:700">
        · recorde ${nf(progress.bestDist)} m</span></div>
      <button class="btn" data-a="play">JOGAR</button>
      <button class="btn ghost" data-a="solo">🏃 TREINO SOLO</button>
      <button class="btn ghost" data-a="skins">🎭 PERSONAGENS</button>
      <button class="btn ghost" data-a="howto">COMO JOGAR</button>
      <button class="btn ghost" data-a="settings">CONFIGURAÇÕES</button>
    </div>
  `);
  bindBtn(node, '[data-a=name]', () => showNameEditor(progress.name, actions.setName));
  bindBtn(node, '[data-a=play]', actions.play);
  bindBtn(node, '[data-a=solo]', actions.solo);
  bindBtn(node, '[data-a=skins]', actions.skins);
  bindBtn(node, '[data-a=howto]', showHowTo);
  bindBtn(node, '[data-a=settings]', () => showSettings(actions.resetProgress));
  show(node);
}

// ---------------------------------------------------------------- skins
// `preview(id)` devolve um data-URL da textura já gerada pelo Phaser,
// para a vitrine mostrar exatamente o boneco que vai entrar na pista.
export function showSkins(progress, preview, actions) {
  const cards = SKINS.map(s => {
    const unlocked = isUnlocked(s, progress.totalCoins);
    const sel = s.id === progress.skin;
    return `
      <div class="skin-card ${sel ? 'on' : ''} ${unlocked ? '' : 'locked'}" data-skin="${s.id}">
        <img src="${preview(s.id)}" alt="${s.name}" />
        <div class="sn">${unlocked ? s.name : '🔒'}</div>
        <div class="sc">${unlocked ? (sel ? 'em uso' : 'disponível') : '🪙 ' + nf(s.cost)}</div>
      </div>`;
  }).join('');

  const node = el(`
    <div class="screen">
      <h2>PERSONAGENS</h2>
      <div class="coin-bar">🪙 ${nf(progress.totalCoins)} <span style="color:var(--muted);font-size:12px;font-weight:700">moedas no total</span></div>
      <div class="skin-grid">${cards}</div>
      <p class="hint">Junte moedas correndo para destravar novos personagens. O total acumulado nunca diminui.</p>
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
  bindBtn(node, '[data-a=back]', actions.back);
  show(node);
}

// ---------------------------------------------------------------- multiplayer
export function showMultiplayer(actions) {
  const node = el(`
    <div class="screen">
      <h2>MULTIPLAYER</h2>
      <p class="hint">Até 5 jogadores na mesma corrida. Um cria a sala, os outros entram pelo código ou QR.</p>
      <button class="btn green" data-a="create">CRIAR SALA</button>
      <button class="btn orange" data-a="join">ENTRAR EM SALA</button>
      <button class="btn ghost" data-a="back">VOLTAR</button>
    </div>
  `);
  bindBtn(node, '[data-a=create]', actions.create);
  bindBtn(node, '[data-a=join]', actions.join);
  bindBtn(node, '[data-a=back]', actions.back);
  show(node);
}

export function showConnecting(text = 'Conectando') {
  show(el(`<div class="screen"><h2 class="waiting-dots">${text}</h2></div>`));
}

// ---------------------------------------------------------------- entrar
export function showJoin(prefill, actions) {
  const node = el(`
    <div class="screen">
      <h2>ENTRAR NA SALA</h2>
      <p class="hint">Digite o código da sala, ou aponte a câmera do celular para o QR Code do seu amigo.</p>
      <input class="code-input" maxlength="5" placeholder="•••••"
             autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false"
             inputmode="text" value="${prefill || ''}" />
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
  bindBtn(node, '[data-a=enter]', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  bindBtn(node, '[data-a=scan]', async () => {
    const code = await openScanner();
    if (!code) return;
    input.value = code;
    actions.enter(code);
  });
  bindBtn(node, '[data-a=back]', actions.back);
  show(node);
  if (!prefill) setTimeout(() => input.focus(), 100);
}

// ---------------------------------------------------------------- lobby
// Uma única tela serve host e convidado. O host vê o QR, o seletor de
// dificuldade e o botão de largada; os convidados veem o mesmo estado em
// modo leitura e só marcam PRONTO.
//
// state: { isHost, code, qr, link, maxPlayers, difficulty,
//          players: [{ slot, name, skin, ready, isYou, isHost }] }
export function showLobby(state, actions) {
  const { isHost, code, qr, players, maxPlayers, difficulty } = state;
  const diff = getDifficulty(difficulty);

  const slots = [];
  for (let i = 0; i < maxPlayers; i++) {
    const p = players.find(x => x.slot === i);
    if (!p) {
      slots.push(`
        <div class="player-slot empty">
          <div class="pdot" style="background:${slotColor(i)};opacity:.35"></div>
          <div class="pname">Vago</div>
          <div class="pstatus">aguardando</div>
        </div>`);
      continue;
    }
    const color = slotColor(i);
    slots.push(`
      <div class="player-slot connected ${p.isYou ? 'you' : ''}" style="border-color:${color}">
        <div class="pdot" style="background:${color}"></div>
        <div class="pname">${esc(p.name)}${p.isYou ? ' (você)' : ''}</div>
        <div class="pstatus ${p.ready ? 'ok' : ''}">${p.isHost ? 'HOST · ' : ''}${p.ready ? 'PRONTO' : 'esperando'}</div>
      </div>`);
  }

  const diffBlock = isHost
    ? `<div class="diff-grid">${DIFFICULTIES.map(d => `
        <div class="diff-opt ${d.id === difficulty ? 'on' : ''}" data-diff="${d.id}">
          <div class="de">${d.emoji}</div>
          <div class="dn">${d.name}</div>
          <div class="dd">${d.desc}</div>
        </div>`).join('')}</div>`
    : `<div class="diff-readonly">${diff.emoji} Dificuldade: ${diff.name}</div>`;

  const others = players.filter(p => !p.isYou);
  const allReady = others.length > 0 && others.every(p => p.ready);
  const me = players.find(p => p.isYou);

  const actionBtn = isHost
    ? `<button class="btn green" data-a="start" ${others.length ? '' : 'disabled'}>
         ${others.length ? (allReady ? 'INICIAR CORRIDA' : `INICIAR (${others.filter(p => p.ready).length}/${others.length} prontos)`) : 'AGUARDANDO JOGADORES…'}
       </button>`
    : `<button class="btn green" data-a="ready" ${me && me.ready ? 'disabled' : ''}>
         ${me && me.ready ? 'AGUARDANDO HOST…' : 'PRONTO!'}
       </button>`;

  const node = el(`
    <div class="screen">
      <h2>SALA ${code}</h2>
      ${isHost && qr ? `
        <div class="room-card">
          <div class="room-code">${code}</div>
          <img class="qr" src="${qr}" alt="QR Code da sala" />
          <span class="copy-link" data-a="copy">copiar link de convite</span>
        </div>` : '<p class="hint" style="color:var(--green);font-weight:800">✓ CONECTADO</p>'}
      <div class="players">${slots.join('')}</div>
      ${diffBlock}
      ${actionBtn}
      <button class="btn ghost" data-a="leave">SAIR DA SALA</button>
    </div>
  `);

  if (isHost) {
    node.querySelectorAll('.diff-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        unlockAudio(); sfx.click();
        actions.setDifficulty(opt.dataset.diff);
      });
    });
    bindBtn(node, '[data-a=start]', actions.start);
    bindBtn(node, '[data-a=copy]', async () => {
      try { await navigator.clipboard.writeText(state.link); toast('Link copiado! 📋'); }
      catch { toast('Código: ' + code); }
    });
  } else {
    bindBtn(node, '[data-a=ready]', actions.ready);
  }
  bindBtn(node, '[data-a=leave]', actions.leave);
  show(node);
}

// ---------------------------------------------------------------- resultado
// res: { title, trophy, rows: [{name, dist, score, coins, win, you}], note, canRematch }
export function showResult(res, actions) {
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  const rows = res.rows.map((r, i) => `
    <div class="result-row ${r.win ? 'win' : ''}" ${r.slot != null ? `style="border-left:4px solid ${slotColor(r.slot)}"` : ''}>
      <div class="rname">${medals[i] || ''} ${esc(r.name)}${r.you ? ' (você)' : ''}</div>
      <div class="rstats">
        Distância: <b>${nf(r.dist)} m</b><br>
        Pontos: <b>${nf(r.score)}</b> · 🪙 ${nf(r.coins)}
      </div>
    </div>
  `).join('');

  const records = (res.records || []).map(t => `<div class="hint" style="color:var(--gold);font-weight:800">🏅 ${t}</div>`).join('');

  const node = el(`
    <div class="screen">
      <h2>RESULTADO</h2>
      <div class="result-card">
        <div class="trophy">${res.trophy || '🏆'}</div>
        <div class="winner-name">${res.title}</div>
        ${rows}
        ${records}
        ${res.earned ? `<div class="coin-bar" style="justify-content:center">+🪙 ${nf(res.earned)} ganhas</div>` : ''}
        ${res.note ? `<p class="hint" style="max-width:none">${res.note}</p>` : ''}
      </div>
      ${res.canRematch ? '<button class="btn green" data-a="again">JOGAR NOVAMENTE</button>' : ''}
      <button class="btn ghost" data-a="exit">${res.exitLabel || 'SAIR DA SALA'}</button>
    </div>
  `);
  const againBtn = bindBtn(node, '[data-a=again]', (b) => {
    b.disabled = true;
    b.textContent = res.isHost ? 'PREPARANDO…' : 'AGUARDANDO HOST…';
    actions.again();
  });
  bindBtn(node, '[data-a=exit]', actions.exit);
  show(node);
  return { againBtn };
}

// ---------------------------------------------------------------- modais
function modal(inner) {
  const back = el(`<div class="modal-back"><div class="modal">${inner}</div></div>`);
  back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  document.body.appendChild(back);
  return back;
}

export function showNameEditor(current, onSave) {
  const m = modal(`
    <h3>SEU APELIDO</h3>
    <p class="hint" style="margin:0 auto">É o nome que os outros jogadores veem na pista.</p>
    <input class="name-input" maxlength="12" placeholder="Jogador"
           autocomplete="off" autocorrect="off" spellcheck="false" value="${esc(current || '')}" />
    <button class="btn green" data-a="save">SALVAR</button>
    <button class="btn ghost" data-a="cancel">CANCELAR</button>
  `);
  const input = m.querySelector('.name-input');
  const save = () => { onSave(input.value); m.remove(); };
  bindBtn(m, '[data-a=save]', save);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  bindBtn(m, '[data-a=cancel]', () => m.remove());
  setTimeout(() => { input.focus(); input.select(); }, 100);
}

export function showHowTo() {
  const m = modal(`
    <h3>COMO JOGAR</h3>
    <div class="howto-item"><span class="ico">👈👉</span><div><b>Deslize para os lados</b>troca de faixa</div></div>
    <div class="howto-item"><span class="ico">👆</span><div><b>Deslize para cima</b>pula barreiras baixas e buracos</div></div>
    <div class="howto-item"><span class="ico">👇</span><div><b>Deslize para baixo</b>desliza sob barreiras altas</div></div>
    <div class="howto-item"><span class="ico">🪙</span><div><b>Pegue moedas</b>viram pontos e destravam personagens</div></div>
    <div class="howto-item"><span class="ico">❤️</span><div><b>3 vidas</b>bater derruba sua velocidade</div></div>
    <button class="btn" data-a="ok">ENTENDI</button>
  `);
  bindBtn(m, '[data-a=ok]', () => m.remove());
}

export function showSettings(onReset) {
  const p = getPrefs();
  const m = modal(`
    <h3>CONFIGURAÇÕES</h3>
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
  bindBtn(m, '[data-a=reset]', (b) => {
    if (b.dataset.sure) {
      onReset && onReset();
      m.remove();
      toast('Progresso apagado');
    } else {
      b.dataset.sure = '1';
      b.textContent = 'TEM CERTEZA? TOQUE DE NOVO';
    }
  });
  bindBtn(m, '[data-a=ok]', () => m.remove());
}

// ---------------------------------------------------------------- HUD
const hud = document.getElementById('hud');
const hudDist = document.getElementById('hud-dist');
const hudCoins = document.getElementById('hud-coins');
const hudLives = document.getElementById('hud-lives');
const hudRivals = document.getElementById('hud-rivals');
const hudMsg = document.getElementById('hud-msg');
const speedoFill = document.getElementById('speedo-fill');
const speedoNum = document.getElementById('speedo-num');

function hearts(n) {
  const v = Math.max(0, n);
  return '❤️'.repeat(v) + '🖤'.repeat(Math.max(0, 3 - v));
}

export function showHUD(hasRivals) {
  hud.classList.remove('hidden');
  hudMsg.classList.add('hidden');
  hudRivals.classList.toggle('hidden', !hasRivals);
  hudRivals.innerHTML = '';
  updateHUD({ dist: 0, coins: 0, lives: 3, kmh: 0, speedFrac: 0, rivals: [] });
}

export function hideHUD() { hud.classList.add('hidden'); }

export function updateHUD(s) {
  hudDist.textContent = nf(s.dist) + ' m';
  hudCoins.textContent = '🪙 ' + s.coins;
  hudLives.textContent = hearts(s.lives);

  speedoFill.style.width = Math.max(0, Math.min(1, s.speedFrac || 0)) * 100 + '%';
  speedoNum.innerHTML = `${s.kmh || 0} <small>km/h</small>`;
  speedoNum.classList.toggle('turbo', (s.speedFrac || 0) > 0.75);

  if (!s.rivals || !s.rivals.length) return;
  // reaproveita os chips existentes; só recria se a quantidade mudou
  if (hudRivals.children.length !== s.rivals.length) {
    hudRivals.innerHTML = s.rivals.map(() =>
      '<div class="rival-chip"><div class="rn"></div><div class="rd"></div></div>').join('');
  }
  s.rivals.forEach((r, i) => {
    const chip = hudRivals.children[i];
    if (!chip) return;
    chip.style.borderLeftColor = '#' + r.color.toString(16).padStart(6, '0');
    chip.classList.toggle('dead', !r.alive);
    chip.querySelector('.rn').textContent = `${r.name} ${r.alive ? hearts(r.lives) : '💀'}`;
    const rd = chip.querySelector('.rd');
    if (!r.alive) {
      rd.textContent = nf(r.dist) + ' m';
      rd.className = 'rd';
    } else {
      rd.textContent = r.delta >= 0 ? `+${nf(r.delta)} m` : `${nf(Math.abs(r.delta))} m atrás`;
      rd.className = 'rd ' + (r.delta >= 0 ? 'ahead' : 'behind');
    }
  });
}

export function hudMessage(text, ms = 0) {
  if (!text) { hudMsg.classList.add('hidden'); return; }
  hudMsg.textContent = text;
  hudMsg.classList.remove('hidden');
  if (ms) setTimeout(() => hudMsg.classList.add('hidden'), ms);
}

// ---------------------------------------------------------------- countdown
const cdOverlay = document.getElementById('countdown');
const cdNum = document.getElementById('countdown-num');

export function runCountdown(onGo) {
  cdOverlay.classList.remove('hidden');
  const steps = ['3', '2', '1', 'CORRA!'];
  let i = 0;
  const tick = () => {
    if (i >= steps.length) { cdOverlay.classList.add('hidden'); return; }
    const last = i === steps.length - 1;
    cdNum.textContent = steps[i];
    cdNum.style.fontSize = last ? '72px' : '120px';
    cdNum.classList.remove('pop');
    void cdNum.offsetWidth; // reinicia a animação
    cdNum.classList.add('pop');
    if (last) { sfx.go(); onGo(); } else { sfx.count(); }
    i++;
    setTimeout(tick, last ? 900 : 850);
  };
  tick();
}
