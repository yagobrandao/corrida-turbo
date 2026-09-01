// Todas as telas DOM (menu, salas, lobby, resultado) ficam aqui.
// A lógica de fluxo mora no main.js: este módulo só renderiza e emite ações.
import { sfx, unlockAudio, getPrefs, setSound, setMusic } from '../game/audio.js';

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

// ---------------------------------------------------------------- menu
export function showMenu(actions) {
  const node = el(`
    <div class="screen">
      <div class="logo">CORRIDA<br>TURBO<small>DUELO INFINITO</small></div>
      <button class="btn" data-a="play">JOGAR</button>
      <button class="btn ghost" data-a="solo">🏃 TREINO SOLO</button>
      <button class="btn ghost" data-a="howto">COMO JOGAR</button>
      <button class="btn ghost" data-a="settings">CONFIGURAÇÕES</button>
    </div>
  `);
  bindBtn(node, '[data-a=play]', actions.play);
  bindBtn(node, '[data-a=solo]', actions.solo);
  bindBtn(node, '[data-a=howto]', showHowTo);
  bindBtn(node, '[data-a=settings]', showSettings);
  show(node);
}

// ---------------------------------------------------------------- multiplayer
export function showMultiplayer(actions) {
  const node = el(`
    <div class="screen">
      <h2>MULTIPLAYER</h2>
      <p class="hint">Cada jogador abre o jogo no próprio celular. Um cria a sala, o outro entra.</p>
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
  show(el(`
    <div class="screen">
      <h2 class="waiting-dots">${text}</h2>
    </div>
  `));
}

// ---------------------------------------------------------------- sala criada
export function showRoom(code, qrDataUrl, link, actions) {
  const node = el(`
    <div class="screen">
      <h2>SUA SALA</h2>
      <div class="room-card">
        <div class="room-code">${code}</div>
        <img class="qr" src="${qrDataUrl}" alt="QR Code da sala" />
        <span class="copy-link" data-a="copy">copiar link de convite</span>
      </div>
      <p class="hint">Compartilhe este código com seu amigo, ou peça para ele apontar a câmera para o QR Code.</p>
      <div class="players">
        <div class="player-slot you">
          <div class="avatar">🏃</div>
          <div class="pname">Jogador 1</div>
          <div class="pstatus ok">VOCÊ (HOST)</div>
        </div>
        <div class="player-slot">
          <div class="avatar">👤</div>
          <div class="pname">Jogador 2</div>
          <div class="pstatus waiting-dots">Aguardando</div>
        </div>
      </div>
      <button class="btn ghost" data-a="cancel">CANCELAR</button>
    </div>
  `);
  bindBtn(node, '[data-a=cancel]', actions.cancel);
  bindBtn(node, '[data-a=copy]', async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copiado! 📋');
    } catch {
      toast('Código: ' + code);
    }
  });
  show(node);
}

// ---------------------------------------------------------------- entrar
export function showJoin(prefill, actions) {
  const node = el(`
    <div class="screen">
      <h2>ENTRAR NA SALA</h2>
      <p class="hint">Digite o código da sala do seu amigo, ou aponte a câmera do celular para o QR Code dele.</p>
      <input class="code-input" maxlength="5" placeholder="•••••"
             autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false"
             inputmode="text" value="${prefill || ''}" />
      <button class="btn green" data-a="enter">ENTRAR</button>
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
  bindBtn(node, '[data-a=back]', actions.back);
  show(node);
  if (!prefill) setTimeout(() => input.focus(), 100);
}

// ---------------------------------------------------------------- lobby
export function showLobby({ isHost, code, selfReady, oppReady }, actions) {
  const me = isHost ? 'Jogador 1' : 'Jogador 2';
  const other = isHost ? 'Jogador 2' : 'Jogador 1';
  const status = (ready) => ready
    ? '<div class="pstatus ok">✓ PRONTO</div>'
    : '<div class="pstatus">aguardando</div>';
  const node = el(`
    <div class="screen">
      <h2>SALA ${code}</h2>
      <p class="hint" style="color:var(--green);font-weight:800">✓ CONECTADO</p>
      <div class="players">
        <div class="player-slot you connected">
          <div class="avatar">🏃</div>
          <div class="pname">${me}</div>
          <div class="pstatus ok">VOCÊ${isHost ? ' (HOST)' : ''}</div>
          ${status(selfReady)}
        </div>
        <div class="player-slot connected">
          <div class="avatar">🏃‍♂️</div>
          <div class="pname">${other}</div>
          <div class="pstatus ok">${isHost ? '' : 'HOST'}&nbsp;</div>
          ${status(oppReady)}
        </div>
      </div>
      <button class="btn green" data-a="ready" ${selfReady ? 'disabled' : ''}>
        ${selfReady ? 'AGUARDANDO RIVAL…' : 'PRONTO!'}
      </button>
      <button class="btn ghost" data-a="leave">SAIR DA SALA</button>
    </div>
  `);
  bindBtn(node, '[data-a=ready]', actions.ready);
  bindBtn(node, '[data-a=leave]', actions.leave);
  show(node);
}

// ---------------------------------------------------------------- resultado
// res: { title, rows: [{name, dist, score, coins, win, you}], note }
export function showResult(res, actions) {
  const rows = res.rows.map(r => `
    <div class="result-row ${r.win ? 'win' : ''}">
      <div class="rname">${r.win ? '🏆 ' : ''}${r.name}${r.you ? ' (você)' : ''}</div>
      <div class="rstats">
        Distância: <b>${r.dist.toLocaleString('pt-BR')} m</b><br>
        Pontos: <b>${r.score.toLocaleString('pt-BR')}</b> · 🪙 ${r.coins}
      </div>
    </div>
  `).join('');
  const node = el(`
    <div class="screen">
      <h2>RESULTADO</h2>
      <div class="result-card">
        <div class="trophy">${res.trophy || '🏆'}</div>
        <div class="winner-name">${res.title}</div>
        ${rows}
        ${res.note ? `<p class="hint" style="max-width:none">${res.note}</p>` : ''}
      </div>
      ${res.canRematch ? '<button class="btn green" data-a="again">JOGAR NOVAMENTE</button>' : ''}
      <button class="btn ghost" data-a="exit">${res.exitLabel || 'SAIR DA SALA'}</button>
    </div>
  `);
  const againBtn = bindBtn(node, '[data-a=again]', (b) => {
    b.disabled = true;
    b.textContent = 'AGUARDANDO RIVAL…';
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

export function showHowTo() {
  const m = modal(`
    <h3>COMO JOGAR</h3>
    <div class="howto-item"><span class="ico">👈👉</span><div><b>Deslize para os lados</b>troca de faixa</div></div>
    <div class="howto-item"><span class="ico">👆</span><div><b>Deslize para cima</b>pula barreiras baixas e buracos</div></div>
    <div class="howto-item"><span class="ico">👇</span><div><b>Deslize para baixo</b>desliza sob barreiras altas</div></div>
    <div class="howto-item"><span class="ico">🪙</span><div><b>Pegue moedas</b>valem pontos extras</div></div>
    <div class="howto-item"><span class="ico">❤️</span><div><b>3 vidas</b>sobreviva mais que seu rival!</div></div>
    <button class="btn" data-a="ok">ENTENDI</button>
  `);
  bindBtn(m, '[data-a=ok]', () => m.remove());
}

export function showSettings() {
  const p = getPrefs();
  const m = modal(`
    <h3>CONFIGURAÇÕES</h3>
    <div class="row"><span>🔊 Som</span><div class="toggle ${p.sound ? 'on' : ''}" data-a="sound"></div></div>
    <div class="row"><span>🎵 Música</span><div class="toggle ${p.music ? 'on' : ''}" data-a="music"></div></div>
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
  bindBtn(m, '[data-a=ok]', () => m.remove());
}

// ---------------------------------------------------------------- HUD
const hud = document.getElementById('hud');
const hudDist = document.getElementById('hud-dist');
const hudCoins = document.getElementById('hud-coins');
const hudLives = document.getElementById('hud-lives');
const hudOpp = document.getElementById('hud-opp');
const hudOppName = document.getElementById('hud-opp-name');
const hudOppDelta = document.getElementById('hud-opp-delta');
const hudOppLives = document.getElementById('hud-opp-lives');
const hudMsg = document.getElementById('hud-msg');

function hearts(n) {
  const v = Math.max(0, n);
  return '❤️'.repeat(v) + '🖤'.repeat(Math.max(0, 3 - v));
}

export function showHUD(oppName) {
  hud.classList.remove('hidden');
  hudMsg.classList.add('hidden');
  if (oppName) {
    hudOpp.classList.remove('hidden');
    hudOppName.textContent = oppName;
  } else {
    hudOpp.classList.add('hidden');
  }
  updateHUD({ dist: 0, coins: 0, lives: 3, opp: oppName ? { delta: 0, lives: 3, alive: true } : null });
}

export function hideHUD() {
  hud.classList.add('hidden');
}

export function updateHUD(s) {
  hudDist.textContent = s.dist.toLocaleString('pt-BR') + ' m';
  hudCoins.textContent = '🪙 ' + s.coins;
  hudLives.textContent = hearts(s.lives);
  if (s.opp) {
    if (!s.opp.alive) {
      hudOppDelta.textContent = '💀';
      hudOppLives.textContent = hearts(0);
    } else {
      const d = s.opp.delta;
      hudOppDelta.textContent = d >= 0 ? `+${d} m à frente` : `${Math.abs(d)} m atrás`;
      hudOppDelta.style.color = d >= 0 ? 'var(--red)' : 'var(--green)';
      hudOppLives.textContent = hearts(s.opp.lives);
    }
  }
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
    if (i >= steps.length) {
      cdOverlay.classList.add('hidden');
      return;
    }
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
