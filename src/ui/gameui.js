// HUD compartilhado entre os jogos.
//
// Cada jogo monta o próprio painel (o que ele mostra é problema dele), mas o
// placar de rivais, o countdown e o balão de aviso são iguais em todos —
// então moram aqui, e não duplicados em cada jogo.
import { slotHex } from '../core/config.js';
import { sfx } from '../core/audio.js';

const hud = document.getElementById('hud');
const panel = document.getElementById('hud-panel');
const board = document.getElementById('hud-board');
const pauseBtn = document.getElementById('hud-pause');
const msg = document.getElementById('hud-msg');

// Menu de pausa dentro da partida. Em rede o jogo NÃO congela (os outros
// continuam correndo) — o menu serve para som/música e para abandonar.
// No solo, quem registra onPause/onResume de verdade congela a cena.
let pauseCtl = null;
export function setPauseMenu(ctl) { pauseCtl = ctl; }

pauseBtn.addEventListener('click', () => {
  if (!pauseCtl) return;
  sfx.click();
  if (pauseCtl.onPause) pauseCtl.onPause();
  const { getPrefs, setSound, setMusic } = pauseCtl.audio;
  const p = getPrefs();
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal">
      <h3>${pauseCtl.canPause ? '⏸ PAUSA' : '⚙️ OPÇÕES'}</h3>
      ${pauseCtl.canPause ? '' : '<p class="hint" style="margin:0 auto">A partida continua rolando para os outros.</p>'}
      <div class="row"><span>🔊 Som</span><div class="toggle ${p.sound ? 'on' : ''}" data-a="sound"></div></div>
      <div class="row"><span>🎵 Música</span><div class="toggle ${p.music ? 'on' : ''}" data-a="music"></div></div>
      <button class="btn green" data-a="resume">${pauseCtl.canPause ? 'CONTINUAR' : 'VOLTAR AO JOGO'}</button>
      <button class="btn ghost" data-a="quit">ABANDONAR PARTIDA</button>
    </div>`;
  const close = () => {
    back.remove();
    if (pauseCtl && pauseCtl.onResume) pauseCtl.onResume();
  };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.querySelector('[data-a=sound]').addEventListener('click', (e) => {
    const on = !e.target.classList.contains('on');
    e.target.classList.toggle('on', on);
    setSound(on);
    if (on) sfx.click();
  });
  back.querySelector('[data-a=music]').addEventListener('click', (e) => {
    const on = !e.target.classList.contains('on');
    e.target.classList.toggle('on', on);
    setMusic(on);
  });
  back.querySelector('[data-a=resume]').addEventListener('click', close);
  back.querySelector('[data-a=quit]').addEventListener('click', () => {
    back.remove();
    if (pauseCtl && pauseCtl.onQuit) pauseCtl.onQuit();
  });
  document.body.appendChild(back);
});
const cdOverlay = document.getElementById('countdown');
const cdNum = document.getElementById('countdown-num');

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
// Apelidos chegam pela rede, escritos por outras pessoas: nunca injetar cru.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
export const nf = (n) => Number(n || 0).toLocaleString('pt-BR');

export function showHUD(panelHtml = '') {
  hud.classList.remove('hidden');
  msg.classList.add('hidden');
  panel.innerHTML = panelHtml;
  board.innerHTML = '';
}

export function hideHUD() {
  hud.classList.add('hidden');
  panel.innerHTML = '';
  board.innerHTML = '';
  msg.classList.add('hidden');
}

// Acesso direto aos elementos que o jogo criou no próprio painel.
export const panelEl = (sel) => panel.querySelector(sel);

// Placar lateral: [{ slot, name, value, sub, alive }]
export function updateBoard(rows) {
  if (!rows || !rows.length) { board.innerHTML = ''; return; }
  if (board.children.length !== rows.length) {
    board.innerHTML = rows.map(() =>
      '<div class="rival-chip"><div class="rn"></div><div class="rd"></div></div>').join('');
  }
  rows.forEach((r, i) => {
    const chip = board.children[i];
    if (!chip) return;
    chip.style.borderLeftColor = slotHex(r.slot);
    chip.classList.toggle('dead', r.alive === false);
    chip.querySelector('.rn').textContent = r.name;
    const rd = chip.querySelector('.rd');
    rd.textContent = r.value;
    rd.className = 'rd' + (r.tone ? ' ' + r.tone : '');
  });
}

export function message(text, ms = 0) {
  if (!text) { msg.classList.add('hidden'); return; }
  msg.textContent = text;
  msg.classList.remove('hidden');
  if (ms) setTimeout(() => msg.classList.add('hidden'), ms);
}

// Countdown 3-2-1-JÁ. `onGo` dispara junto com o último passo.
export function runCountdown(onGo, goLabel = 'VALENDO!') {
  cdOverlay.classList.remove('hidden');
  const steps = ['3', '2', '1', goLabel];
  let i = 0;
  const tick = () => {
    if (i >= steps.length) { cdOverlay.classList.add('hidden'); return; }
    const last = i === steps.length - 1;
    cdNum.textContent = steps[i];
    cdNum.style.fontSize = last ? '68px' : '120px';
    cdNum.classList.remove('pop');
    void cdNum.offsetWidth; // reinicia a animação
    cdNum.classList.add('pop');
    if (last) { sfx.go(); onGo(); } else { sfx.count(); }
    i++;
    setTimeout(tick, last ? 900 : 850);
  };
  tick();
}

// Camada DOM para jogos que não usam canvas (o Adivinhe, por exemplo).
const stage = document.getElementById('game-dom');
export function mountStage(html) {
  stage.innerHTML = html;
  stage.classList.remove('hidden');
  return stage;
}
export function clearStage() {
  stage.innerHTML = '';
  stage.classList.add('hidden');
}
