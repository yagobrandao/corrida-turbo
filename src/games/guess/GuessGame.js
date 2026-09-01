// Adivinhe — jogo de palavra secreta por proximidade semântica.
//
// Jogo 100% DOM (sem canvas). O HOST é o juiz: sorteia a palavra da rodada
// (com a rng da seed), pontua cada palpite e transmite o resultado para
// todos. Os convidados só enviam palpites.
import { Rng } from '../../core/rng.js';
import { slotHex, slotName } from '../../core/config.js';
import { sfx } from '../../core/audio.js';
import { getPrefs, setSound, setMusic } from '../../core/audio.js';
import { SECRETS, BY_WORD } from './words.js';
import { normalize, score, band } from './proximity.js';
import * as ui from '../../ui/gameui.js';

const M = { GUESS: 1, RESULT: 2, ROUND: 3, WIN: 4, TIMEOUT: 5 };

const ROUND_SECS = 120;        // sem vencedor até aqui: revela e segue
const COOLDOWN_MS = 450;       // anti-spam por jogador
const WIN_BASE = 250;

export function createGame(ctx) {
  const { bus, players, mySlot, isHost, seed, settings, onFinish } = ctx;
  const totalRounds = parseInt((settings && settings.rounds) || '3', 10);

  const totals = new Map(players.map(p => [p.slot, 0]));  // pontos acumulados
  const hits = new Map(players.map(p => [p.slot, 0]));    // palavras acertadas
  const bestProx = new Map();   // slot -> melhor proximidade na rodada
  const attempts = new Map();   // slot -> tentativas na rodada
  const lastAt = new Map();     // anti-spam (host)
  let round = 0;
  let secret = null;            // só o host guarda
  let roundStart = 0;
  let roundTimer = null;
  let ended = false;
  let acceptingGuesses = false;

  const nameOf = (slot) => (players.find(p => p.slot === slot)?.name) || slotName(slot);

  // ---------------- UI ----------------
  const stage = ui.mountStage(`
    <div class="guess-wrap">
      <div class="guess-head safe-top">
        <div class="gh-round" id="g-round">Rodada 1/${totalRounds}</div>
        <div class="gh-cat" id="g-cat">🔎 …</div>
        <div class="gh-timer" id="g-timer"></div>
      </div>
      <div class="guess-feed" id="g-feed">
        <div class="guess-tip">Digite qualquer palavra. O termômetro mostra o quanto ela é PRÓXIMA em significado da palavra secreta. 🔥 = quente, ❄️ = frio.</div>
      </div>
      <div class="guess-inputrow">
        <input id="g-input" class="guess-input" placeholder="digite uma palavra…"
               autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="send" />
        <button id="g-send" class="guess-send">➤</button>
      </div>
    </div>
  `);
  const el = {
    round: stage.querySelector('#g-round'),
    cat: stage.querySelector('#g-cat'),
    timer: stage.querySelector('#g-timer'),
    feed: stage.querySelector('#g-feed'),
    input: stage.querySelector('#g-input'),
    send: stage.querySelector('#g-send'),
  };

  // HUD só pelo botão de pausa/opções
  ui.showHUD('');
  ui.setPauseMenu({
    canPause: false,
    audio: { getPrefs, setSound, setMusic },
    onQuit: () => ctx.onQuit && ctx.onQuit(),
  });

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

  function addFeed(html, cls = '') {
    const div = document.createElement('div');
    div.className = 'guess-item ' + cls;
    div.innerHTML = html;
    el.feed.prepend(div);
    while (el.feed.children.length > 60) el.feed.lastChild.remove();
  }

  function showResult(slot, word, s) {
    const b = band(s);
    addFeed(`
      <span class="gi-name" style="color:${slotHex(slot)}">${esc(nameOf(slot))}</span>
      <span class="gi-word">${esc(word)}</span>
      <span class="gi-band ${b.cls}">${b.emoji} ${s >= 100 ? b.label : s + '%'}</span>
    `, s >= 100 ? 'hit' : '');
    if (slot === mySlot) {
      if (s >= 100) sfx.win();
      else if (s >= 85) sfx.powerup();
      else if (s >= 50) sfx.coin();
      else sfx.lane();
    }
  }

  // ---------------- ciclo de rodadas (host) ----------------
  function hostStartRound() {
    round++;
    const rng = new Rng((seed + round * 7919) >>> 0);
    secret = SECRETS[Math.floor(rng.next() * SECRETS.length)];
    bestProx.clear();
    attempts.clear();
    roundStart = Date.now();
    acceptingGuesses = true;
    const cat = BY_WORD.get(secret).cat;
    bus.toAll({ k: M.ROUND, n: round, cat });
    onRound(round, cat);
    clearTimeout(roundTimer);
    roundTimer = setTimeout(hostTimeout, ROUND_SECS * 1000);
  }

  function hostTimeout() {
    if (ended || !acceptingGuesses) return;
    acceptingGuesses = false;
    bus.toAll({ k: M.TIMEOUT, word: secret });
    onTimeout(secret);
    hostNextOrFinish();
  }

  function hostNextOrFinish() {
    setTimeout(() => {
      if (ended) return;
      if (round >= totalRounds) finish();
      else hostStartRound();
    }, 3200);
  }

  function hostHandleGuess(slot, raw) {
    if (!acceptingGuesses || ended) return;
    const now = Date.now();
    if (now - (lastAt.get(slot) || 0) < COOLDOWN_MS) return;  // anti-spam
    lastAt.set(slot, now);

    const w = normalize(raw);
    if (!w || w.length < 2 || w.length > 24) return;

    attempts.set(slot, (attempts.get(slot) || 0) + 1);
    const s = score(w, secret);
    if (s > (bestProx.get(slot) || 0)) bestProx.set(slot, Math.min(s, 90));

    bus.toAll({ k: M.RESULT, slot, w, s });
    showResult(slot, w, s);

    if (s >= 100) {
      acceptingGuesses = false;
      clearTimeout(roundTimer);
      // pontuação: base + rapidez + eficiência; os outros levam a melhor proximidade
      const secs = (now - roundStart) / 1000;
      const pts = WIN_BASE
        + Math.max(0, Math.round(130 - secs * 2))
        + Math.max(0, 120 - (attempts.get(slot) || 1) * 8);
      totals.set(slot, (totals.get(slot) || 0) + pts);
      for (const p of players) {
        if (p.slot !== slot) {
          totals.set(p.slot, (totals.get(p.slot) || 0) + (bestProx.get(p.slot) || 0));
        }
      }
      const scores = [...totals.entries()];
      bus.toAll({ k: M.WIN, slot, word: secret, pts, scores });
      onWin(slot, secret, pts, scores);
      hostNextOrFinish();
    }
  }

  // ---------------- reações locais (todos) ----------------
  function onRound(n, cat) {
    el.round.textContent = `Rodada ${n}/${totalRounds}`;
    el.cat.textContent = `🔎 Dica: ${cat.toUpperCase()}`;
    addFeed(`<span class="gi-sys">— Rodada ${n}: nova palavra secreta! —</span>`, 'sys');
    setInput(true);
  }

  function onWin(slot, word, pts, scores) {
    for (const [sl, v] of scores) totals.set(sl, v);
    hits.set(slot, (hits.get(slot) || 0) + 1);
    setInput(false);
    const mine = slot === mySlot;
    addFeed(`<span class="gi-sys">🎉 <b style="color:${slotHex(slot)}">${esc(nameOf(slot))}</b> acertou: <b>${esc(word).toUpperCase()}</b> (+${pts} pts)</span>`, 'sys win');
    ui.message(mine ? `🎉 Você acertou! ${word.toUpperCase()}` : `🎉 ${nameOf(slot)} acertou: ${word.toUpperCase()}`, 2800);
    if (mine) sfx.win(); else sfx.lose();
  }

  function onTimeout(word) {
    setInput(false);
    addFeed(`<span class="gi-sys">⌛ Tempo esgotado! A palavra era <b>${esc(word).toUpperCase()}</b></span>`, 'sys');
    ui.message(`⌛ A palavra era ${word.toUpperCase()}`, 2600);
  }

  function setInput(on) {
    el.input.disabled = !on;
    el.send.disabled = !on;
    if (on) { el.input.value = ''; }
  }

  // timer visual
  const timerTick = setInterval(() => {
    if (!acceptingGuesses || !roundStart) { el.timer.textContent = ''; return; }
    const left = Math.max(0, ROUND_SECS - (Date.now() - roundStart) / 1000);
    el.timer.textContent = `⏱ ${Math.ceil(left)}s`;
    el.timer.classList.toggle('low', left < 20);
  }, 500);

  // clientes acompanham o roundStart pelo ROUND recebido
  function clientMarkRound() { roundStart = Date.now(); acceptingGuesses = true; }

  // ---------------- envio ----------------
  let coolUntil = 0;
  function submit() {
    const raw = el.input.value;
    if (!raw.trim()) return;
    const now = Date.now();
    if (now < coolUntil) return;
    coolUntil = now + COOLDOWN_MS;
    el.input.value = '';
    el.input.focus();
    if (isHost) hostHandleGuess(mySlot, raw);
    else bus.toHost({ k: M.GUESS, w: raw });
  }
  el.send.addEventListener('click', submit);
  el.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  // ---------------- rede ----------------
  const unbind = bus.on((p, from) => {
    if (!p) return;
    if (p.k === M.GUESS && isHost) hostHandleGuess(from, p.w);
    else if (p.k === M.RESULT && !isHost) showResult(p.slot, p.w, p.s);
    else if (p.k === M.ROUND && !isHost) { round = p.n; clientMarkRound(); onRound(p.n, p.cat); }
    else if (p.k === M.WIN && !isHost) { acceptingGuesses = false; onWin(p.slot, p.word, p.pts, p.scores); }
    else if (p.k === M.TIMEOUT && !isHost) { acceptingGuesses = false; onTimeout(p.word); }
  });

  function finish() {
    if (ended) return;
    ended = true;
    clearTimeout(roundTimer);
    const rows = players.map(p => ({
      slot: p.slot, name: p.name,
      score: totals.get(p.slot) || 0,
      coins: Math.round((totals.get(p.slot) || 0) / 30),
      detail: `${totalRounds} rodadas`,
      sort: totals.get(p.slot) || 0,
      metrics: p.slot === mySlot ? { correct: hits.get(p.slot) || 0 } : undefined,
    }));
    onFinish(rows);
  }

  return {
    begin() {
      if (isHost) hostStartRound();
      // convidados só esperam o primeiro M.ROUND
    },
    playerLeft() { /* o jogo segue com quem ficou; pontos preservados */ },
    destroy() {
      ended = true;
      clearTimeout(roundTimer);
      clearInterval(timerTick);
      unbind();
      ui.setPauseMenu(null);
      ui.hideHUD();
      ui.clearStage();
    },
  };
}
