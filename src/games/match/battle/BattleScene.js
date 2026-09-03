// Pomar Mágico — Batalha: cena da rodada 1v1 + orquestração do modo
// (introdução do confronto, resultado, ranking, eliminação, campeão).
//
// Não fala com CompetitiveMatchManager diretamente — só com `ctl`
// (localController.js ou networkController.js), que expõe a mesma
// interface nos dois modos: snapshot(), beginRound(), startLive(), tick(),
// reportFinal(stats), sendAttack(type), incomingAttacks(), onUpdate(fn).
//
// O foco fica no MEU tabuleiro (grande, no centro) — o adversário aparece
// como uma faixa compacta (avatar, HP, score, combo), nunca ocupando
// metade da tela. A interação do tabuleiro (arrastar, animar por id,
// settle) é a mesma lógica já testada em M3Play.js, adaptada aqui sem
// tocar no arquivo da Aventura.
import { GAME_W, GAME_H } from '../../../core/config.js';
import { sfx, tone, noise } from '../../../core/audio.js';
import { FRUITS } from '../config.js';
import { Board } from '../board.js';
import { buildMatchTextures } from '../art.js';
import { roundBoardLevel } from './roundBoard.js';
import { ROUND_BOARD, ATTACKS, ENERGY } from './config.js';
import { energyFromPhase, pickAttackType, receiveAttack, tickAttacks } from './battleBoard.js';

const FONT = 'Fredoka, "Baloo 2", Arial, sans-serif';
const D = { CELL: 5, PIECE: 20, FLY: 40, FX: 50, FOG: 55, HUD: 60, FLOAT: 70, PANEL: 80 };
const wait = (scene, ms) => new Promise(res => scene.time.delayedCall(ms, res));
const tweenP = (scene, cfg) => new Promise(res => scene.tweens.add({ ...cfg, onComplete: res }));
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const ATK_LABEL = { garbage: '🪨 Pedra', ice: '🧊 Gelo', shuffle: '🔀 Embaralhar', lock: '🔒 Trava', cloud: '☁️ Nuvem' };

export default class BattleScene extends Phaser.Scene {
  constructor() { super('m3battle'); }

  init(data) { this.ctl = data.ctl; this.phase = 'boot'; this.fx = []; this.ui = []; }

  create() {
    buildMatchTextures(this);
    this.unsub = this.ctl.onUpdate(() => this._onCtlUpdate());
    this._goIntro();
  }

  shutdown() { if (this.unsub) this.unsub(); }

  // ---------------------------------------------------------------- fluxo geral
  _clearUI() { for (const o of this.ui) { this.tweens.killTweensOf(o); o.destroy(); } this.ui = []; }
  _text(x, y, s, size, color = '#fff', extra = {}) { const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', color, fontStyle: 'bold', ...extra }).setOrigin(0.5); return t; }
  _btn(x, y, w, h, label, color, cb, size = 16, depth = D.PANEL) {
    const r = this.add.rectangle(x, y, w, h, color, 1).setStrokeStyle(3, 0xffffff, 0.5).setDepth(depth).setInteractive();
    const t = this._text(x, y, label, size).setDepth(depth + 1);
    r.on('pointerdown', (p) => { p.event.stopPropagation(); sfx.click(); cb(); });
    return [r, t];
  }
  // fase 'intro' é dirigida por evento: no modo em rede, a rodada chega
  // depois via bus (o host que decide), então não dá pra ler o snapshot
  // logo após chamar beginRound() como no modo local.
  _onCtlUpdate() {
    if (this.phase === 'intro' && this._waitingForRound) { const snap = this.ctl.snapshot(); if (snap.pairing) { this._waitingForRound = false; this._renderIntro(snap); } }
  }

  _goIntro() {
    this.phase = 'intro'; this._clearUI(); this._stopLiveTimers();
    let snap = this.ctl.snapshot();
    if (snap.phase === 'eliminated') return this._goEliminated();
    if (snap.phase === 'finished') return this._goChampion();
    if (this.ctl.isHost) this.ctl.beginRound();
    snap = this.ctl.snapshot();
    this.cameras.main.setBackgroundColor('#1b2350');
    this.ui.push(this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x141a33, 1).setDepth(0));
    if (!snap.pairing) { this._waitingForRound = true; this.ui.push(this._text(GAME_W / 2, GAME_H / 2, 'aguardando o próximo confronto…', 15, '#c8ceda').setDepth(5)); return; }
    this._renderIntro(snap);
  }
  _renderIntro(snap) {
    const title = this._text(GAME_W / 2, 90, `RODADA ${snap.round}`, 24, '#ffd23e').setDepth(5); this.ui.push(title);
    const you = this._text(GAME_W / 2, GAME_H / 2 - 60, 'VOCÊ', 30, '#8fe66a').setDepth(5); this.ui.push(you);
    const vs = this._text(GAME_W / 2, GAME_H / 2, 'VS', 22, '#c8ceda').setDepth(5); this.ui.push(vs);
    const opp = snap.pairing.opp;
    const oppLabel = opp.isGhost ? `👻 GHOST DE ${opp.name.toUpperCase()}` : opp.name.toUpperCase();
    const oc = opp.isGhost ? '#d45de0' : '#ff8b8b';
    const oppT = this._text(GAME_W / 2, GAME_H / 2 + 60, oppLabel, opp.isGhost ? 20 : 26, oc).setDepth(5); this.ui.push(oppT);
    if (opp.isGhost) { const sub = this._text(GAME_W / 2, GAME_H / 2 + 92, 'uma cópia do desempenho recente — não é ' + opp.name + ' jogando ao vivo', 11, '#c9a3ff', { wordWrap: { width: 320 }, align: 'center' }).setDepth(5); this.ui.push(sub); }
    sfx.powerup();
    this.tweens.add({ targets: [you, vs, oppT], alpha: { from: 0, to: 1 }, y: '-=6', duration: 300 });
    this.time.delayedCall(1600, () => this._goLive());
  }

  // ---------------------------------------------------------------- rodada ao vivo
  _goLive() {
    this.phase = 'live'; this._clearUI();
    const snap = this.ctl.snapshot();
    this.myEnergy = 0; this.chargeLog = []; this.pendingIncoming = [];
    this.level = roundBoardLevel(ROUND_BOARD);
    this.board = new Board(this.level, snap.pairing.boardSeedMine >>> 0);
    this.views = new Map(); this.busy = false; this.sel = null; this.drag = null; this.roundClock = 0;
    this.cameras.main.setBackgroundColor('#173a2e');
    this._bg();
    this._layout();
    this._drawBoard();
    this._hud();
    this.ctl.startLive();
    this.roundEndsAt = this.ctl.snapshot().roundEndsAt;
    this.input.on('pointerdown', this._pdBound = (p) => this._down(p));
    this.input.on('pointermove', this._pmBound = (p) => this._move(p));
    this.input.on('pointerup', this._puBound = (p) => this._up(p));
    this._liveEvent = this.time.addEvent({ delay: 16, loop: true, callback: () => this._liveTick() });
  }
  _stopLiveTimers() {
    if (this._liveEvent) { this._liveEvent.remove(); this._liveEvent = null; }
    if (this._pdBound) { this.input.off('pointerdown', this._pdBound); this.input.off('pointermove', this._pmBound); this.input.off('pointerup', this._puBound); this._pdBound = null; }
  }
  _bg() {
    const g = this.add.graphics().setDepth(0); this.ui.push(g);
    for (let i = 0; i < 30; i++) { g.fillStyle(0x2f8f5b, 0.1 + (i / 30) * 0.35); g.fillRect(0, i * (GAME_H / 30), GAME_W, GAME_H / 30 + 1); }
  }
  _layout() {
    const b = this.board;
    const top = 168, bottom = 150;
    this.cs = Math.floor(Math.min((GAME_W - 24) / b.cols, (GAME_H - top - bottom) / b.rows, 58));
    this.ox = Math.round((GAME_W - this.cs * b.cols) / 2);
    this.oy = top + Math.round((GAME_H - top - bottom - this.cs * b.rows) / 2);
  }
  _x(c) { return this.ox + c * this.cs + this.cs / 2; }
  _y(r) { return this.oy + r * this.cs + this.cs / 2; }
  _cellAt(px, py) { const c = Math.floor((px - this.ox) / this.cs), r = Math.floor((py - this.oy) / this.cs); return r >= 0 && c >= 0 && r < this.board.rows && c < this.board.cols ? { r, c } : null; }
  _tex(p) { if (p.s === 'bomb') return 'm3-bomb'; if (p.s === 'color') return 'm3-color'; return `m3-p${p.c}${p.s ? '-' + p.s : ''}`; }
  _viewAt(r, c) { const p = this.board.pieceAt(r, c); return p ? this.views.get(p.id) : null; }

  _drawBoard() {
    const b = this.board, sc = this.cs / 96;
    const frame = this.add.graphics().setDepth(2); this.ui.push(frame);
    frame.fillStyle(0x141a33, 0.55); frame.fillRoundedRect(this.ox - 8, this.oy - 8, this.cs * b.cols + 16, this.cs * b.rows + 16, 16);
    frame.lineStyle(3, 0xffffff, 0.15); frame.strokeRoundedRect(this.ox - 8, this.oy - 8, this.cs * b.cols + 16, this.cs * b.rows + 16, 16);
    for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) {
      const cell = this.add.image(this._x(c), this._y(r), 'm3-cell').setScale(sc).setDepth(D.CELL); this.ui.push(cell);
      const p = b.grid[r][c].piece; if (p) this._makePiece(p, r, c);
    }
    const mask = this.make.graphics({ add: false }); mask.fillStyle(0xffffff); mask.fillRect(this.ox - 8, this.oy - 8, this.cs * b.cols + 16, this.cs * b.rows + 16);
    this.boardMask = mask.createGeometryMask();
  }
  _makePiece(p, r, c, fromY = null) {
    const img = this.add.image(this._x(c), fromY ?? this._y(r), this._tex(p)).setScale(this.cs / 96 * 0.94).setDepth(D.PIECE + r);
    img.setMask(this.boardMask); img.pid = p.id;
    this.views.set(p.id, img);
    if (p.s) this._specialIdle(img);
    return img;
  }
  _specialIdle(img) { this.tweens.add({ targets: img, scale: img.scale * 1.06, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' }); }

  // ---------------------------------------------------------------- HUD (própria + adversário + energia)
  _hud() {
    const S = (o) => { o.setDepth(D.HUD); this.ui.push(o); return o; };
    // adversário: faixa fina no topo
    const g = S(this.add.graphics());
    g.fillStyle(0x141a33, 0.85); g.fillRoundedRect(12, 8, GAME_W - 24, 54, 14);
    this.oppPortrait = S(this.add.circle(38, 35, 20, 0x2c3766, 1).setStrokeStyle(2, 0xff8b8b, 1));
    this.oppGhostTag = S(this._text(38, 35, '👻', 18).setVisible(false));
    this.oppName = S(this._text(66, 20, '', 13, '#fff').setOrigin(0, 0.5));
    this.oppHpBar = S(this.add.graphics());
    this.oppScore = S(this._text(GAME_W - 20, 20, '', 13, '#ffd23e').setOrigin(1, 0.5));
    this.oppCombo = S(this._text(GAME_W - 20, 40, '', 11, '#c8ceda').setOrigin(1, 0.5));
    // relógio central
    this.timerText = S(this._text(GAME_W / 2, 92, '', 26, '#fff', { stroke: '#1c2440', strokeThickness: 5 }));
    this.roundLabel = S(this._text(GAME_W / 2, 118, `Rodada ${this.ctl.snapshot().round}`, 11, '#b8bfd8'));
    // meu HUD: HP + score, embaixo do tabuleiro
    const g2 = S(this.add.graphics());
    g2.fillStyle(0x141a33, 0.85); g2.fillRoundedRect(12, GAME_H - 142, GAME_W - 24, 40, 12);
    this.myHpBar = S(this.add.graphics());
    this.myHpText = S(this._text(GAME_W - 24, GAME_H - 122, '', 13, '#fff').setOrigin(1, 0.5));
    this.myScoreText = S(this._text(GAME_W / 2, GAME_H - 122, '', 14, '#ffd23e'));
    // barra de energia + botão de ataque
    const ey = GAME_H - 88;
    const eg = S(this.add.graphics());
    eg.fillStyle(0x2c3766, 1); eg.fillRoundedRect(20, ey, GAME_W - 130, 22, 11);
    this.energyBar = S(this.add.graphics());
    this.energyLabel = S(this._text(20 + (GAME_W - 130) / 2, ey + 11, '', 12, '#fff'));
    const fireBg = this.add.rectangle(GAME_W - 60, ey + 11, 80, 40, 0x8d5ac0, 1).setStrokeStyle(3, 0xffffff, 0.5).setInteractive().setDepth(D.HUD);
    this.fireIcon = this._text(GAME_W - 60, ey + 11, '⚡', 20).setDepth(D.HUD + 1);
    fireBg.on('pointerdown', (p) => { p.event.stopPropagation(); this._fireAttack(); });
    this.fireBg = fireBg; this.ui.push(fireBg, this.fireIcon);
    // aviso de ataque chegando
    this.warnText = S(this._text(GAME_W / 2, this.oy - 22, '', 15, '#ff8b8b', { stroke: '#1c2440', strokeThickness: 4 }).setAlpha(0));
    this._refreshHud();
  }
  _refreshHud() {
    const snap = this.ctl.snapshot();
    const opp = snap.pairing ? snap.pairing.opp : null;
    if (opp) {
      this.oppName.setText((opp.isGhost ? 'GHOST DE ' : '') + opp.name.toUpperCase());
      this.oppGhostTag.setVisible(opp.isGhost);
      this.oppPortrait.setAlpha(opp.isGhost ? 0.45 : 1).setStrokeStyle(2, opp.isGhost ? 0xd45de0 : 0xff8b8b, 1);
      this.oppHpBar.clear(); this.oppHpBar.fillStyle(0x2c3766, 1); this.oppHpBar.fillRoundedRect(66, 30, GAME_W - 160, 10, 5);
      this.oppHpBar.fillStyle(0xe8483f, 1); this.oppHpBar.fillRoundedRect(66, 30, (GAME_W - 160) * Math.max(0, opp.hp / 100), 10, 5);
      this.oppScore.setText(fmt(opp.score || 0));
      this.oppCombo.setText(opp.combo > 1 ? `combo x${opp.combo}` : '');
    }
    const me = { hp: snap.myHp };
    this.myHpBar.clear(); this.myHpBar.fillStyle(0x2c3766, 1); this.myHpBar.fillRoundedRect(20, GAME_H - 132, GAME_W - 130, 14, 7);
    this.myHpBar.fillStyle(0x3fae70, 1); this.myHpBar.fillRoundedRect(20, GAME_H - 132, (GAME_W - 130) * Math.max(0, me.hp / 100), 14, 7);
    this.myHpText.setText(`❤️ ${me.hp}`);
    this.myScoreText.setText(fmt(this.board ? this.board.score : 0));
    this.energyBar.clear(); this.energyBar.fillStyle(0xffd23e, 1); this.energyBar.fillRoundedRect(20, GAME_H - 88, (GAME_W - 130) * Math.min(1, this.myEnergy / ENERGY.bar), 22, 11);
    const ready = this.myEnergy >= ENERGY.bar;
    this.energyLabel.setText(ready ? 'PRONTO — toque em ⚡' : `energia ${Math.round(this.myEnergy)}/${ENERGY.bar}`);
    this.fireBg.setFillStyle(ready ? 0xd45de0 : 0x4a5378, 1);
  }

  // ---------------------------------------------------------------- relógio + bots + ataques recebidos
  _liveTick() {
    if (this.phase !== 'live') return;
    const now = Date.now();
    const left = Math.max(0, (this.roundEndsAt - now) / 1000);
    this.timerText.setText(mmss(left)).setColor(left <= 10 ? '#ff8b8b' : '#fff');
    if (this.roundClockLast === undefined) this.roundClockLast = now;
    const dt = now - this.roundClockLast; this.roundClockLast = now;
    this.roundClock += dt;
    tickAttacks(this.board, this.roundClock);
    this.ctl.tick(dt);
    for (const inc of this.ctl.incomingAttacks()) this._telegraphIncoming(inc.type);
    this._refreshHud();
    if (left <= 0 && this.phase === 'live') this._endRound();
  }
  _telegraphIncoming(type) {
    const def = ATTACKS[type];
    this.warnText.setText(`⚠️ ${ATK_LABEL[type]} chegando!`).setAlpha(1);
    sfx.hit();
    this.tweens.add({ targets: this.warnText, alpha: 0.3, duration: 200, yoyo: true, repeat: 3 });
    this.time.delayedCall(def.telegraphMs, () => { if (this.phase === 'live') this._applyIncoming(type); });
  }
  _applyIncoming(type) {
    const res = receiveAttack(this.board, type);
    if (!res) return;
    sfx.hit(); noise({ dur: 0.2, vol: 0.2 });
    this.cameras.main.shake(150, 0.006);
    this.warnText.setAlpha(0);
    for (const cell of res.cells) {
      const gfx = this.add.image(this._x(cell.c), this._y(cell.r), type === 'garbage' ? 'm3-box1' : type === 'ice' ? 'm3-ice1' : type === 'lock' ? 'm3-chain' : 'm3-dot').setScale(this.cs / 96).setDepth(D.FX).setTint(type === 'cloud' ? 0x9fe8ff : 0xffffff);
      if (type === 'garbage' || type === 'ice' || type === 'lock') { const v = this._viewAt(cell.r, cell.c); if (v) { this.tweens.killTweensOf(v); v.setVisible(type !== 'garbage'); } }
      if (type === 'cloud') { gfx.setAlpha(0.75); this.time.delayedCall(ATTACKS.cloud.durationMs, () => gfx.destroy()); }
      else if (type === 'shuffle') { const v = this._viewAt(cell.r, cell.c); if (v) v.setTexture(this._tex(this.board.pieceAt(cell.r, cell.c))); gfx.destroy(); }
      else this.time.delayedCall(type === 'ice' ? 200 : 4000, () => gfx.destroy());
    }
    this._settle();
  }
  _fireAttack() {
    if (this.myEnergy < ENERGY.bar || this.busy) return;
    const type = pickAttackType(this.chargeLog);
    const ok = this.ctl.sendAttack(type);
    this.myEnergy = 0; this.chargeLog = [];
    if (ok) { sfx.powerup(); this._float(GAME_W - 60, GAME_H - 88, ATK_LABEL[type] + ' enviado!', '#ffd23e', 13); }
    else this._float(GAME_W - 60, GAME_H - 88, 'sem alvo (ghost)', '#c8ceda', 12);
    this._refreshHud();
  }

  // ---------------------------------------------------------------- entrada (arrastar/soltar — mesma lógica testada em M3Play)
  _down(p) {
    if (this.busy || this.phase !== 'live') return;
    const cell = this._cellAt(p.x, p.y); if (!cell) { this._select(null); return; }
    const b = this.board;
    if (!b.pieceAt(cell.r, cell.c)) { this._select(null); return; }
    if (this.sel && Math.abs(this.sel.r - cell.r) + Math.abs(this.sel.c - cell.c) === 1) { const a = this.sel; this._select(null); this._swap(a.r, a.c, cell.r, cell.c); return; }
    this.drag = null; this._settle();
    const v = this._viewAt(cell.r, cell.c);
    if (v) { this.tweens.killTweensOf(v); v.setDepth(D.FLY); }
    this.drag = { r: cell.r, c: cell.c, x: p.x, y: p.y, id: p.id, v, nb: null };
    this._select(cell);
  }
  _move(p) {
    const d = this.drag; if (!d || p.id !== d.id || this.busy) return;
    const dx = p.x - d.x, dy = p.y - d.y;
    const horiz = Math.abs(dx) >= Math.abs(dy);
    const dir = horiz ? [0, Math.sign(dx)] : [Math.sign(dy), 0];
    const amt = Math.min(this.cs * 0.55, Math.abs(horiz ? dx : dy));
    if (amt < 3) return;
    const r2 = d.r + dir[0], c2 = d.c + dir[1];
    const nbView = this._viewAt(r2, c2);
    if (d.nb && d.nb !== nbView) { this.tweens.add({ targets: d.nb, x: this._x(d.nbc), y: this._y(d.nbr), duration: 90 }); d.nb = null; }
    if (nbView) { d.nb = nbView; d.nbr = r2; d.nbc = c2; this.tweens.killTweensOf(nbView); }
    d.amt = amt; d.r2 = r2; d.c2 = c2;
    if (d.v) { d.v.x = this._x(d.c) + dir[1] * amt; d.v.y = this._y(d.r) + dir[0] * amt; d.v.setScale(this.cs / 96 * 1.05); }
    if (d.nb) { d.nb.x = this._x(c2) - dir[1] * amt * 0.6; d.nb.y = this._y(r2) - dir[0] * amt * 0.6; }
    if (amt >= this.cs * 0.55 && Math.abs(horiz ? dx : dy) >= this.cs) this._commitDrag(d);
  }
  _commitDrag(d) { this.drag = null; this._select(null); if (d.v) d.v.setScale(this.cs / 96 * 0.94); this._swap(d.r, d.c, d.r2, d.c2); }
  _up(p) {
    const d = this.drag; if (!d || p.id !== d.id) return;
    this.drag = null;
    if (d.amt >= this.cs * 0.3 && d.r2 !== undefined && !this.busy) { this._commitDrag(d); return; }
    if (d.v) { this.tweens.killTweensOf(d.v); this.tweens.add({ targets: d.v, x: this._x(d.c), y: this._y(d.r), scale: this.cs / 96 * 0.94, duration: 140, ease: 'Back.out', onComplete: () => d.v.setDepth(D.PIECE + d.r) }); }
    if (d.nb) { this.tweens.killTweensOf(d.nb); this.tweens.add({ targets: d.nb, x: this._x(d.nbc), y: this._y(d.nbr), duration: 140, ease: 'Back.out' }); }
  }
  _select(cell) {
    if (this.selView) { this.selView.destroy(); this.selView = null; }
    this.sel = cell;
    if (cell) { this.selView = this.add.image(this._x(cell.c), this._y(cell.r), 'm3-sel').setScale(this.cs / 96).setDepth(D.PIECE + 30); this.tweens.add({ targets: this.selView, alpha: 0.5, duration: 300, yoyo: true, repeat: -1 }); }
  }
  async _swap(r1, c1, r2, c2) {
    const b = this.board; if (!b.cell(r2, c2) || !b.pieceAt(r2, c2)) return;
    const res = b.trySwap(r1, c1, r2, c2);
    await this._run(res.phases);
  }
  async _run(phases) {
    if (this.busy) { this.queue = (this.queue || []).concat(phases); return; }
    this.busy = true;
    try { for (const ph of phases) await this._phase(ph); while (this.queue && this.queue.length) { const q = this.queue; this.queue = []; for (const ph of q) await this._phase(ph); } }
    finally { this.busy = false; }
    this._settle(); this._refreshHud();
  }
  async _phase(ph) {
    const b = this.board, sc = this.cs / 96 * 0.94;
    if (ph.t === 'swap') {
      const va = this.views.get(ph.a.id), vb = this.views.get(ph.b.id);
      if (!va || !vb) return;
      sfx.lane(); this.tweens.killTweensOf(va); this.tweens.killTweensOf(vb); va.setDepth(D.FLY);
      await Promise.all([tweenP(this, { targets: va, x: this._x(ph.b.c), y: this._y(ph.b.r), scale: sc * 1.08, duration: 200, ease: 'Quad.out' }), tweenP(this, { targets: vb, x: this._x(ph.a.c), y: this._y(ph.a.r), duration: 200, ease: 'Quad.out' })]);
      if (ph.fail) { sfx.hit(); await Promise.all([tweenP(this, { targets: va, x: this._x(ph.a.c), y: this._y(ph.a.r), scale: sc, duration: 220, ease: 'Back.out' }), tweenP(this, { targets: vb, x: this._x(ph.b.c), y: this._y(ph.b.r), duration: 220, ease: 'Back.out' })]); va.setDepth(D.PIECE + ph.a.r); return; }
      va.setScale(sc); va.setDepth(D.PIECE + ph.b.r); vb.setDepth(D.PIECE + ph.a.r);
      return;
    }
    if (ph.t === 'locked') { const v = this._viewAt(ph.r, ph.c); if (v) await tweenP(this, { targets: v, x: v.x + 5, duration: 40, yoyo: true, repeat: 3 }); return; }
    if (ph.t === 'clear') {
      this.myEnergy = Math.min(ENERGY.bar, this.myEnergy + energyFromPhase(ph));
      if (ph.combo > 0) this.chargeLog.push({ special: ph.created[0] ? ph.created[0].s : null, combo: ph.combo });
      for (const bx of ph.boxes || []) { const v = this._viewAt(bx.r, bx.c); }
      const pops = [];
      for (const pc of ph.pieces) { const v = this.views.get(pc.id); if (!v) continue; this.views.delete(pc.id); this.tweens.killTweensOf(v); this._burst(v.x, v.y, FRUITS[pc.color].c, 6); pops.push(tweenP(this, { targets: v, scale: 0, alpha: 0.4, duration: 140, ease: 'Back.in' }).then(() => v.destroy())); }
      if (ph.pieces.length) tone({ freq: 520, dur: 0.09, type: 'square', vol: 0.13 });
      await Promise.all(pops);
      for (const cr of ph.created) { const v = this._makePiece({ id: cr.id, c: cr.color, s: cr.s }, cr.r, cr.c); v.setScale(0); this.tweens.add({ targets: v, scale: sc, duration: 240, ease: 'Back.out' }); }
      await wait(this, 30);
      return;
    }
    if (ph.t === 'fall') {
      const tw = [];
      const drop = (v, toY, dist) => { this.tweens.killTweensOf(v); v.setScale(this.cs / 96 * 0.94); return tweenP(this, { targets: v, y: toY, duration: 130 + Math.sqrt(dist) * 90, ease: 'Quad.in' }); };
      for (const m of ph.moves) { const v = this.views.get(m.id); if (!v) continue; v.setDepth(D.PIECE + m.to.r); tw.push(drop(v, this._y(m.to.r), m.to.r - m.from.r)); }
      for (const s2 of ph.spawns) { const v = this._makePiece({ id: s2.id, c: s2.color, s: null }, s2.r, s2.c, this._y(s2.fromRow)); tw.push(drop(v, this._y(s2.r), s2.r - s2.fromRow)); }
      await Promise.all(tw);
      return;
    }
    if (ph.t === 'noMoves') { this._float(GAME_W / 2, this.oy - 10, 'sem jogadas — embaralhando', '#9fe8ff', 12); await wait(this, 300); return; }
    if (ph.t === 'shuffle') {
      const tw = [];
      for (const s2 of ph.pieces) { const v = this.views.get(s2.id); if (!v) continue; this.tweens.killTweensOf(v); tw.push(tweenP(this, { targets: v, scale: 0, duration: 150 }).then(() => { v.setTexture(this._tex({ c: s2.color, s: b.pieceAt(s2.r, s2.c) && b.pieceAt(s2.r, s2.c).s })); return tweenP(this, { targets: v, scale: sc, duration: 180, ease: 'Back.out' }); })); }
      await Promise.all(tw);
      return;
    }
  }
  _settle() {
    if (this.busy || this.drag || !this.board) return;
    const b = this.board, sc = this.cs / 96 * 0.94, alive = new Set();
    for (const p of b._allPieces()) {
      alive.add(p.piece.id);
      let v = this.views.get(p.piece.id);
      if (!v) v = this._makePiece(p.piece, p.r, p.c);
      this.tweens.killTweensOf(v);
      v.setPosition(this._x(p.c), this._y(p.r)).setScale(sc).setAngle(0).setAlpha(1).setDepth(D.PIECE + p.r).setVisible(true);
      const tex = this._tex(p.piece); if (v.texture.key !== tex) v.setTexture(tex);
      if (p.piece.s) this._specialIdle(v);
    }
    for (const [id, v] of this.views) if (!alive.has(id)) { this.tweens.killTweensOf(v); v.destroy(); this.views.delete(id); }
  }
  _burst(x, y, color, n) {
    if (this.fx.length > 100) return;
    for (let i = 0; i < n; i++) { const d = this.add.image(x, y, 'm3-dot').setTint(color).setDepth(D.FX).setScale(0.4); const a = Math.random() * 6.28, sp = 60 + Math.random() * 100; this.fx.push(d); this.tweens.add({ targets: d, x: x + Math.cos(a) * sp, y: y + Math.sin(a) * sp, alpha: 0, duration: 380, onComplete: () => { d.destroy(); this.fx = this.fx.filter(f => f !== d); } }); }
  }
  _float(x, y, text, color, size) { const t = this._text(x, y, text, size, color, { stroke: '#1c2440', strokeThickness: 4 }).setDepth(D.FLOAT); this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 700, onComplete: () => t.destroy() }); }

  // ---------------------------------------------------------------- fim de rodada
  _endRound() {
    if (this.phase !== 'live') return;
    this.phase = 'result'; this._stopLiveTimers();
    this.input.off('pointerdown', this._pdBound); this.input.off('pointermove', this._pmBound); this.input.off('pointerup', this._puBound);
    const stats = { score: this.board.score, bestCombo: this.board.bestCombo, specialsUsed: this.board.stats.specialsUsed, attacksSent: 0 };
    this.ctl.reportFinal(stats);
    this._showResult(stats);
  }
  _showResult(myStats) {
    const snap = this.ctl.snapshot();
    const pairing = (snap.lastResults || []).find(p => p.a === this.ctl.myId || p.b === this.ctl.myId);
    const result = pairing ? pairing.result : null;
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x141a33, 0.85).setDepth(D.PANEL - 1).setInteractive(); this.ui.push(dim);
    const c = this.add.container(GAME_W / 2, GAME_H / 2 - 10).setDepth(D.PANEL); this.ui.push(c);
    const bg = this.add.graphics(); bg.fillStyle(0x1f2748, 1); bg.fillRoundedRect(-170, -180, 340, 360, 22); bg.lineStyle(4, 0x3a4470, 1); bg.strokeRoundedRect(-170, -180, 340, 360, 22); c.add(bg);
    const T = (x, y, s, size, color = '#fff', extra = {}) => { const t = this._text(x, y, s, size, color, extra); c.add(t); return t; };
    let won = false, tie = false, dmg = 0;
    if (result) { tie = result.tie; won = !tie && ((result.winnerSide.id === this.ctl.myId) || (result.winnerSide.isGhost === false && !tie && result.winnerSide.id === this.ctl.myId)); dmg = result.damage || 0; }
    T(0, -150, tie ? 'EMPATE' : won ? 'VOCÊ VENCEU!' : 'VOCÊ PERDEU', 24, tie ? '#c8ceda' : won ? '#8fe66a' : '#ff8b8b');
    T(0, -100, `SEU SCORE: ${fmt(myStats.score)}`, 16, '#fff');
    const oppScore = pairing && pairing.result ? (pairing.result.winnerSide.id === this.ctl.myId || (pairing.result.winnerSide.isGhost) ? pairing.result.loserSide.stats.score : pairing.result.winnerSide.stats.score) : (snap.pairing ? snap.pairing.opp.score : 0);
    T(0, -72, `ADVERSÁRIO: ${fmt(oppScore)}`, 14, '#c8ceda');
    if (!won && !tie && dmg > 0) T(0, -30, `-${dmg} HP`, 28, '#ff8b8b');
    else if (won && dmg > 0) T(0, -30, `+${dmg} de dano causado`, 16, '#8fe66a');
    T(0, 20, `❤️ você: ${mgrHpText(snap.myHp)}`, 14, '#fff');
    // classificação
    T(0, 60, 'CLASSIFICAÇÃO', 11, '#b8bfd8');
    snap.ranking.slice(0, 5).forEach((p, i) => { const y = 84 + i * 22; T(-140, y, `${i + 1}. ${p.eliminated ? '💀 ' : ''}${p.id === this.ctl.myId ? 'Você' : p.name}`, 12, p.eliminated ? '#8a90aa' : (p.id === this.ctl.myId ? '#ffd23e' : '#fff')).setOrigin(0, 0.5); T(140, y, `❤️ ${p.hp}`, 12, '#fff').setOrigin(1, 0.5); });
    sfx[tie ? 'click' : won ? 'win' : 'lose']();
    if (snap.myEliminated) { this._btn(GAME_W / 2, GAME_H / 2 + 210, 240, 50, 'VOCÊ FOI ELIMINADO', 0x8d5ac0, () => this._goEliminated(), 15); return; }
    let n = 5;
    const cd = T(0, 190, `próxima rodada em ${n}...`, 13, '#c8ceda');
    const timer = this.time.addEvent({ delay: 1000, repeat: 4, callback: () => { n--; if (n > 0) cd.setText(`próxima rodada em ${n}...`); } });
    this.time.delayedCall(5000, () => this._goIntro());
    this._btn(GAME_W / 2, GAME_H / 2 + 175, 200, 44, 'CONTINUAR AGORA', 0x2fb573, () => { timer.remove(); this.time.removeAllEvents(); this._goIntro(); }, 14);
  }

  // ---------------------------------------------------------------- eliminação / campeão
  _goEliminated() {
    this.phase = 'eliminated'; this._clearUI(); this._stopLiveTimers();
    this.cameras.main.setBackgroundColor('#1b2350');
    this._text(GAME_W / 2, GAME_H / 2 - 60, 'ELIMINADO', 32, '#ff8b8b').setDepth(5);
    this._text(GAME_W / 2, GAME_H / 2 - 20, 'você pode assistir o resto da partida', 13, '#c8ceda').setDepth(5);
    sfx.lose();
    this._btn(GAME_W / 2, GAME_H / 2 + 40, 260, 54, 'VER O RESTANTE', 0x8d5ac0, () => { this.ctl.simulateToEnd(); this._goChampion(); }, 16);
    this._btn(GAME_W / 2, GAME_H / 2 + 104, 200, 44, 'SAIR', 0x453a82, () => this.ctl.exit ? this.ctl.exit() : null, 14);
  }
  _goChampion() {
    this.phase = 'champion'; this._clearUI(); this._stopLiveTimers();
    const snap = this.ctl.snapshot();
    this.cameras.main.setBackgroundColor('#1b2350');
    this._text(GAME_W / 2, 90, '🏆 CAMPEÃO', 30, '#ffd23e').setDepth(5);
    const champ = snap.standings ? snap.standings[0] : null;
    this._text(GAME_W / 2, 140, champ ? (champ.id === this.ctl.myId ? 'VOCÊ!' : champ.name.toUpperCase()) : '???', 26, '#8fe66a').setDepth(5);
    (snap.standings || []).forEach((p, i) => {
      const y = 200 + i * 46;
      this._text(60, y, `${i + 1}º`, 16, i === 0 ? '#ffd23e' : '#c8ceda').setDepth(5).setOrigin(0, 0.5);
      this._text(110, y, p.id === this.ctl.myId ? 'Você' : p.name, 15, '#fff').setDepth(5).setOrigin(0, 0.5);
      this._text(GAME_W - 30, y, `❤️ ${p.hp}`, 13, '#fff').setDepth(5).setOrigin(1, 0.5);
    });
    sfx.win();
    for (let i = 0; i < 40; i++) { const d = this.add.image(Math.random() * GAME_W, -20, 'm3-dot').setTint([0xe8483f, 0xffd23e, 0x3fae70, 0x2b7fd4, 0xd45de0][i % 5]).setDepth(D.PANEL).setScale(0.6); this.tweens.add({ targets: d, y: GAME_H + 20, x: d.x + (Math.random() - 0.5) * 100, duration: 2000 + Math.random() * 1200, delay: Math.random() * 500, onComplete: () => d.destroy() }); }
    this._btn(GAME_W / 2, GAME_H - 60, 220, 50, 'SAIR', 0x2fb573, () => this.ctl.exit ? this.ctl.exit() : null, 16);
  }

  _lastAdded() { const c = this.children.list; return c[c.length - 1]; }
}
function mgrHpText(hp) { return `${hp}/100`; }
