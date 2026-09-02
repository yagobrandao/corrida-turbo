// Pomar Mágico — cena da partida. Só anima o que o tabuleiro (board.js)
// decide: cada ação devolve fases e esta cena as toca em sequência.
//
// Profundidade: fundo 0 · células 5 · gelo 6 · peças 20+ · correntes 30 ·
// voando 40 · efeitos 50 · HUD 60 · textos flutuantes 70 · painéis 80+.
import { GAME_W, GAME_H } from '../../core/config.js';
import { sfx, tone, noise } from '../../core/audio.js';
import { FRUITS, SPECIALS, COMBO_LABELS, BOOSTERS, CONTINUE_COST, CONTINUE_MOVES, regionFor, levelRewards } from './config.js';
import { Board } from './board.js';
import { levelFor } from './levels.js';
import { buildMatchTextures } from './art.js';
import * as P from './progress.js';

const FONT = 'Fredoka, "Baloo 2", Arial, sans-serif';
const D = { CELL: 5, ICE: 6, PIECE: 20, CHAIN: 30, FLY: 40, FX: 50, HUD: 60, FLOAT: 70, PANEL: 80 };
const wait = (scene, ms) => new Promise(res => scene.time.delayedCall(ms, res));
const tweenP = (scene, cfg) => new Promise(res => scene.tweens.add({ ...cfg, onComplete: res }));
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const TUTORIAL = {
  swap: 'Arraste uma fruta para juntar 3 iguais!',
  cascade: 'Frutas que caem podem formar novos trios: é a cascata!',
  rocket: 'Junte 4 iguais para criar um FOGUETE. Ele limpa a linha inteira!',
  bomb: 'Um trio em T ou L cria uma BOMBA. Ela explode tudo ao redor!',
  color: 'Junte 5 em linha: a BOMBA DE COR some com todas de uma cor!',
  ice: 'Faça trios em cima do GELO para quebrá-lo.',
  box: 'CAIXAS quebram com trios ao lado delas (ou com especiais).',
  chain: 'Frutas ACORRENTADAS não se movem: inclua-as num trio para soltar.',
};

export default class M3Play extends Phaser.Scene {
  constructor() { super('m3play'); }

  init(data) {
    this.n = data.n; this.hooks = data.hooks; this.preBoosters = data.boosters || [];
    this.level = levelFor(this.n);
    this.board = new Board({ ...this.level, seedSpecials: this.preBoosters }, (this.level.seed + Date.now()) >>> 0);
    this.views = new Map(); this.cellViews = []; this.iceViews = new Map(); this.boxViews = new Map(); this.chainViews = new Map();
    this.busy = false; this.paused = false; this.sel = null; this.drag = null; this.mode = null; this.fx = []; this.ui = []; this.over = false; this.continued = false;
    this.comboPitch = 0;
  }

  create() {
    buildMatchTextures(this);
    const reg = regionFor(this.n);
    this.cameras.main.setBackgroundColor(reg.sky[1]);
    this._bg(reg);
    this._layout();
    this._drawBoard();
    this._hud();
    this._boosterBar();
    this.input.on('pointerdown', (p) => this._down(p));
    this.input.on('pointermove', (p) => this._move(p));
    this.input.on('pointerup', (p) => this._up(p));
    this.hooks.updateHUD({ title: `Fase ${this.n}`, coins: P.coins(), lives: P.lives() });
    this._intro();
  }

  // ---------------------------------------------------------------- cenário
  _bg(reg) {
    const g = this.add.graphics().setDepth(0);
    for (let i = 0; i < 40; i++) { g.fillStyle(reg.sky[0], 0.15 + (i / 40) * 0.5); g.fillRect(0, i * (GAME_H / 40), GAME_W, GAME_H / 40 + 1); }
    g.fillStyle(reg.ground, 0.9); g.fillEllipse(GAME_W / 2, GAME_H + 40, GAME_W * 1.6, 220);
    for (let i = 0; i < 4; i++) { const c = this.add.image(60 + i * 120, 22 + (i % 2) * 18, 'm3-cloud').setAlpha(0.5).setDepth(1); this.tweens.add({ targets: c, x: c.x + 30, duration: 6000 + i * 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' }); this.ui.push(c); }
    for (let i = 0; i < 6; i++) this.add.image(20 + i * 90, GAME_H - 24 - (i % 2) * 12, 'm3-tree').setScale(0.9 + (i % 3) * 0.2).setDepth(1).setAlpha(0.85);
  }

  _layout() {
    const b = this.board;
    const maxW = GAME_W - 24, maxH = GAME_H - 150 - 190;
    this.cs = Math.floor(Math.min(maxW / b.cols, maxH / b.rows, 64));
    this.ox = Math.round((GAME_W - this.cs * b.cols) / 2);
    this.oy = 156 + Math.round((maxH - this.cs * b.rows) / 2);
  }
  _x(c) { return this.ox + c * this.cs + this.cs / 2; }
  _y(r) { return this.oy + r * this.cs + this.cs / 2; }
  _cellAt(px, py) { const c = Math.floor((px - this.ox) / this.cs), r = Math.floor((py - this.oy) / this.cs); return r >= 0 && c >= 0 && r < this.board.rows && c < this.board.cols ? { r, c } : null; }
  _tex(p) { if (p.s === 'bomb') return 'm3-bomb'; if (p.s === 'color') return 'm3-color'; return `m3-p${p.c}${p.s ? '-' + p.s : ''}`; }

  _drawBoard() {
    const b = this.board, sc = this.cs / 96;
    // moldura
    const frame = this.add.graphics().setDepth(2);
    frame.fillStyle(0x141a33, 0.55); frame.fillRoundedRect(this.ox - 8, this.oy - 8, this.cs * b.cols + 16, this.cs * b.rows + 16, 16);
    frame.lineStyle(3, 0xffffff, 0.15); frame.strokeRoundedRect(this.ox - 8, this.oy - 8, this.cs * b.cols + 16, this.cs * b.rows + 16, 16);
    for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) {
      const cell = b.grid[r][c];
      if (cell.stone) continue;
      this.add.image(this._x(c), this._y(r), 'm3-cell').setScale(sc).setDepth(D.CELL);
      if (cell.ice) this.iceViews.set(r * 32 + c, this.add.image(this._x(c), this._y(r), 'm3-ice' + cell.ice).setScale(sc).setDepth(D.ICE));
      if (cell.box) this.boxViews.set(r * 32 + c, this.add.image(this._x(c), this._y(r), 'm3-box' + cell.box).setScale(sc).setDepth(D.PIECE));
      if (cell.piece) this._makePiece(cell.piece, r, c);
      if (cell.chain) this.chainViews.set(r * 32 + c, this.add.image(this._x(c), this._y(r), 'm3-chain').setScale(sc).setDepth(D.CHAIN));
    }
    // máscara para as peças que nascem acima do tabuleiro
    const mask = this.make.graphics({ add: false }); mask.fillStyle(0xffffff); mask.fillRect(this.ox - 8, this.oy - 8, this.cs * b.cols + 16, this.cs * b.rows + 16);
    this.boardMask = mask.createGeometryMask();
  }
  _makePiece(p, r, c, fromY = null) {
    const img = this.add.image(this._x(c), fromY ?? this._y(r), this._tex(p)).setScale(this.cs / 96 * 0.94).setDepth(D.PIECE + r);
    img.setMask(this.boardMask);
    img.pid = p.id;
    this.views.set(p.id, img);
    if (p.s) this._specialIdle(img);
    return img;
  }
  _specialIdle(img) { this.tweens.add({ targets: img, scale: img.scale * 1.06, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' }); }

  // ---------------------------------------------------------------- HUD
  _hud() {
    const S = (o) => { o.setDepth(D.HUD); this.ui.push(o); return o; };
    const g = S(this.add.graphics());
    g.fillStyle(0x141a33, 0.82); g.fillRoundedRect(12, 62, GAME_W - 24, 86, 16);
    this.hud = {};
    this.hud.level = S(this._text(28, 84, `FASE ${this.n}`, 18, '#ffd23e').setOrigin(0, 0.5));
    this.hud.score = S(this._text(28, 118, '0', 22, '#fff').setOrigin(0, 0.5));
    S(this._text(28, 138, 'PONTOS', 9, '#b8bfd8').setOrigin(0, 0.5));
    S(this.add.graphics()).fillStyle(0x2c3766, 1).fillRoundedRect(GAME_W - 112, 68, 100, 74, 12);
    this.hud.moves = S(this._text(GAME_W - 62, 98, String(this.board.moves), 34, '#fff'));
    S(this._text(GAME_W - 62, 130, 'JOGADAS', 10, '#b8bfd8'));
    // objetivos
    this.hud.objs = [];
    const objs = this.board.objectives;
    const x0 = GAME_W / 2 - (objs.length - 1) * 48;
    objs.forEach((o, i) => {
      const x = x0 + i * 96 - 20, y = 105;
      let icon;
      if (o.type === 'collect') icon = this.add.image(x, y, 'm3-p' + o.color).setScale(0.42);
      else if (o.type === 'ice') icon = this.add.image(x, y, 'm3-ice2').setScale(0.42);
      else if (o.type === 'box') icon = this.add.image(x, y, 'm3-box1').setScale(0.42);
      else if (o.type === 'chain') icon = this.add.image(x, y, 'm3-chain').setScale(0.42);
      else icon = this.add.image(x, y, 'm3-star').setScale(0.7);
      S(icon);
      const t = S(this._text(x + 26, y, '', 15, '#fff').setOrigin(0, 0.5));
      const chk = S(this._text(x + 26, y, '✔', 18, '#8fe66a').setOrigin(0, 0.5).setVisible(false));
      this.hud.objs.push({ o, icon, t, chk });
    });
    this.hud.combo = S(this._text(GAME_W / 2, this.oy - 26, '', 26, '#ffd23e', { stroke: '#1c2440', strokeThickness: 6 }).setAlpha(0).setDepth(D.FLOAT));
    this._refreshHud();
  }
  _text(x, y, s, size, color = '#fff', extra = {}) { return this.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', color, fontStyle: 'bold', ...extra }).setOrigin(0.5); }
  _refreshHud() {
    const b = this.board;
    this.hud.moves.setText(String(Math.max(0, b.moves))).setColor(b.moves <= 5 ? '#ff8b8b' : '#fff');
    this.hud.score.setText(fmt(b.score));
    for (const h of this.hud.objs) { const left = Math.max(0, h.o.n - h.o.got); const done = left === 0; h.t.setText(h.o.type === 'score' ? fmt(left) : String(left)).setVisible(!done); h.chk.setVisible(done); }
  }

  _boosterBar() {
    const y = GAME_H - 96;
    const list = BOOSTERS.filter(b => b.inGame);
    this.boosterBtns = [];
    list.forEach((b, i) => {
      const x = GAME_W / 2 + (i - 1) * 130;
      const c = this.add.container(x, y).setDepth(D.HUD);
      const bg = this.add.rectangle(0, 0, 112, 66, 0x2c3766, 1).setStrokeStyle(3, 0xffffff, 0.35);
      const icon = b.id === 'hammer' ? this._text(0, -10, '🔨', 22) : b.id === 'shuffle' ? this._text(0, -10, '🔀', 22) : this._text(0, -10, '+5', 22, '#8fe66a');
      const name = this._text(0, 18, b.name, 11, '#c8ceda');
      const badge = this.add.circle(46, -24, 13, 0xffd23e, 1).setStrokeStyle(2, 0x1c2440, 1);
      const cnt = this._text(46, -24, '0', 13, '#1c2440');
      c.add([bg, icon, name, badge, cnt]);
      c.setSize(112, 66).setInteractive();
      c.on('pointerdown', (p) => { p.event.stopPropagation(); this._booster(b); });
      this.boosterBtns.push({ b, c, bg, cnt, badge });
      this.ui.push(c);
    });
    this._refreshBoosters();
  }
  _refreshBoosters() {
    for (const x of this.boosterBtns) { const n = P.boosterCount(x.b.id); x.cnt.setText(n ? String(n) : '+'); x.badge.setFillStyle(n ? 0xffd23e : 0x8fe66a, 1); x.bg.setStrokeStyle(3, this.mode === x.b.id ? 0xffd23e : 0xffffff, this.mode === x.b.id ? 1 : 0.35); }
  }
  _booster(b) {
    if (this.busy || this.over) return;
    if (!P.boosterCount(b.id)) {
      if (P.coins() < b.cost) { this._toast(`Sem moedas: ${b.name} custa ${b.cost}`, '#ff8b8b'); sfx.hit(); return; }
      if (!P.buyBooster(b.id)) return;
      sfx.coin(); this._toast(`${b.name} comprado (-${b.cost})`, '#ffd23e'); this.hooks.updateHUD({ coins: P.coins() });
      this._refreshBoosters();
      return;
    }
    sfx.click();
    if (b.id === 'hammer') { this.mode = this.mode === 'hammer' ? null : 'hammer'; this._toast(this.mode ? 'Toque na fruta que quer remover' : '', '#ffd23e'); this._refreshBoosters(); return; }
    P.useBooster(b.id); this._refreshBoosters();
    const res = this.board.useBooster(b.id);
    if (b.id === 'shuffle') this._toast('EMBARALHANDO…', '#9fe8ff');
    this._run(res.phases);
  }

  // ---------------------------------------------------------------- entrada
  _down(p) {
    if (this.busy || this.over || this.paused) return;
    const cell = this._cellAt(p.x, p.y); if (!cell) { this._select(null); return; }
    const b = this.board;
    if (this.mode === 'hammer') {
      const c = b.cell(cell.r, cell.c); if (!c || (!c.piece && !c.box)) return;
      this.mode = null; P.useBooster('hammer'); this._refreshBoosters();
      const res = b.useBooster('hammer', cell.r, cell.c); sfx.hit(); this._shake(4);
      this._run(res.phases); return;
    }
    if (!b.pieceAt(cell.r, cell.c)) { this._select(null); return; }
    if (this.sel && Math.abs(this.sel.r - cell.r) + Math.abs(this.sel.c - cell.c) === 1) { const a = this.sel; this._select(null); this._swap(a.r, a.c, cell.r, cell.c); return; }
    this._select(cell);
    this.drag = { r: cell.r, c: cell.c, x: p.x, y: p.y, id: p.id };
  }
  _move(p) {
    if (!this.drag || p.id !== this.drag.id || this.busy) return;
    const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < Math.max(14, this.cs * 0.3)) return;
    const d = this.drag; this.drag = null; this._select(null);
    const r2 = d.r + (Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0), c2 = d.c + (Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0);
    this._swap(d.r, d.c, r2, c2);
  }
  _up(p) { if (this.drag && p.id === this.drag.id) this.drag = null; }
  _select(cell) {
    if (this.selView) { this.selView.destroy(); this.selView = null; }
    this.sel = cell;
    if (cell) { this.selView = this.add.image(this._x(cell.c), this._y(cell.r), 'm3-sel').setScale(this.cs / 96).setDepth(D.CHAIN + 1); this.tweens.add({ targets: this.selView, alpha: 0.5, duration: 300, yoyo: true, repeat: -1 }); }
  }

  async _swap(r1, c1, r2, c2) {
    const b = this.board;
    if (!b.cell(r2, c2) || !b.pieceAt(r2, c2)) return;
    if (this.tut) { this._tutClear(); }
    const res = b.trySwap(r1, c1, r2, c2);
    await this._run(res.phases);
  }

  // ---------------------------------------------------------------- animação das fases
  async _run(phases) {
    if (this.busy) { this.queue = (this.queue || []).concat(phases); return; }
    this.busy = true;
    try {
      for (const ph of phases) await this._phase(ph);
      while (this.queue && this.queue.length) { const q = this.queue; this.queue = []; for (const ph of q) await this._phase(ph); }
    } finally { this.busy = false; }
    this._refreshHud();
    this._refreshBoosters();
    this.comboPitch = 0;
    if (this.board.over === 'won' && !this.over) this._win();
    else if (this.board.over === 'lost' && !this.over) this._lose();
    else if (this.level.tutorial === 'swap' && !this.tutDone) this._tutorialSwap();
  }

  async _phase(ph) {
    const b = this.board, sc = this.cs / 96 * 0.94;
    if (ph.t === 'locked') { const v = this._viewAt(ph.r, ph.c); if (v) await tweenP(this, { targets: v, x: v.x + 5, duration: 40, yoyo: true, repeat: 3 }); this._toast('Está presa!', '#ff8b8b'); return; }
    if (ph.t === 'swap') {
      const va = this._viewAt(ph.a.r, ph.a.c), vb = this._viewAt(ph.b.r, ph.b.c);
      if (!va || !vb) return;
      sfx.lane();
      va.setDepth(D.FLY);
      await Promise.all([tweenP(this, { targets: va, x: this._x(ph.b.c), y: this._y(ph.b.r), duration: 130, ease: 'Sine.inOut' }), tweenP(this, { targets: vb, x: this._x(ph.a.c), y: this._y(ph.a.r), duration: 130, ease: 'Sine.inOut' })]);
      if (ph.fail) { await Promise.all([tweenP(this, { targets: va, x: this._x(ph.a.c), y: this._y(ph.a.r), duration: 130, ease: 'Sine.inOut' }), tweenP(this, { targets: vb, x: this._x(ph.b.c), y: this._y(ph.b.r), duration: 130, ease: 'Sine.inOut' })]); va.setDepth(D.PIECE + ph.a.r); return; }
      va.setDepth(D.PIECE + ph.b.r); vb.setDepth(D.PIECE + ph.a.r);
      return;
    }
    if (ph.t === 'clear') {
      this._refreshHud();
      // efeitos dos especiais primeiro (rápidos), depois as peças somem
      for (const e of ph.effects) this._effect(e);
      for (const ice of ph.ice) { const k = ice.r * 32 + ice.c; const v = this.iceViews.get(k); if (v) { if (ice.left > 0) v.setTexture('m3-ice' + ice.left); else { this.iceViews.delete(k); this.tweens.add({ targets: v, alpha: 0, scale: v.scale * 1.3, duration: 220, onComplete: () => v.destroy() }); } this._burst(this._x(ice.c), this._y(ice.r), 0x9fe8ff, 6); } }
      for (const bx of ph.boxes) { const k = bx.r * 32 + bx.c; const v = this.boxViews.get(k); if (v) { if (bx.left > 0) { v.setTexture('m3-box' + bx.left); this.tweens.add({ targets: v, x: v.x + 4, duration: 40, yoyo: true, repeat: 2 }); } else { this.boxViews.delete(k); this.tweens.add({ targets: v, alpha: 0, angle: 20, y: v.y + 20, duration: 260, onComplete: () => v.destroy() }); } this._burst(this._x(bx.c), this._y(bx.r), 0xb5773a, 6); } }
      for (const ch of ph.chains) { const k = ch.r * 32 + ch.c; const v = this.chainViews.get(k); if (v) { this.chainViews.delete(k); this.tweens.add({ targets: v, alpha: 0, scale: v.scale * 1.4, duration: 220, onComplete: () => v.destroy() }); this._burst(this._x(ch.c), this._y(ch.r), 0xc8ceda, 5); } }
      const pops = [];
      for (const p of ph.pieces) {
        const v = this.views.get(p.id); if (!v) continue;
        this.views.delete(p.id);
        this.tweens.killTweensOf(v);
        this._burst(v.x, v.y, FRUITS[p.color].c, p.bySpecial ? 4 : 6);
        pops.push(tweenP(this, { targets: v, scale: v.scale * 1.25, duration: 70, yoyo: true, hold: 0, onYoyo: () => v.setScale(v.scale) }).then(() => tweenP(this, { targets: v, scale: 0, alpha: 0.4, duration: 110, ease: 'Back.in' })).then(() => v.destroy()));
      }
      // som com tom subindo a cada cascata
      const combo = ph.combo || 1;
      const big = ph.effects.some(e => ['bomb', 'cross', 'bigCross', 'mega', 'color', 'colorConvert'].includes(e.kind));
      if (big) { noise({ dur: 0.35, vol: 0.35 }); tone({ freq: 120, dur: 0.35, type: 'sawtooth', vol: 0.25, slide: -60 }); this._shake(combo >= 3 ? 8 : 5); this._vib(30); }
      else if (ph.effects.some(e => e.kind === 'row' || e.kind === 'col')) { noise({ dur: 0.18, vol: 0.2 }); tone({ freq: 700, dur: 0.18, type: 'triangle', vol: 0.15, slide: 500 }); this._vib(15); }
      else if (ph.pieces.length) { tone({ freq: 520 + this.comboPitch * 70, dur: 0.09, type: 'square', vol: 0.14 }); tone({ freq: 780 + this.comboPitch * 90, dur: 0.12, type: 'sine', vol: 0.12, delay: 0.05 }); }
      this.comboPitch = Math.min(8, this.comboPitch + 1);
      if (ph.score) this._float(this._x(Math.floor(b.cols / 2)), this.oy - 4, `+${fmt(ph.score)}`, combo >= 3 ? '#ffd23e' : '#fff', combo >= 3 ? 24 : 18);
      if (combo >= 2) this._comboText(combo);
      if (combo >= 3) this._shake(3 + combo);
      await Promise.all(pops);
      for (const cr of ph.created) {
        const old = this.views.get(cr.prev); if (old) { this.views.delete(cr.prev); this.tweens.killTweensOf(old); old.destroy(); }
        const piece = { id: cr.id, c: cr.color, s: cr.s };
        const v = this._makePiece(piece, cr.r, cr.c); v.setScale(0);
        this._burst(v.x, v.y, 0xffffff, 10);
        tone({ freq: 900, dur: 0.2, type: 'sine', vol: 0.15, slide: 400 });
        this.tweens.add({ targets: v, scale: sc, duration: 260, ease: 'Back.out' });
        if (this.level.tutorial && ['rocket', 'bomb', 'color'].includes(this.level.tutorial) && !this.tutDone) { this.tutDone = true; this._tuca(cr.s === 'bomb' ? 'Uma BOMBA! Troque ela com qualquer fruta para explodir.' : cr.s === 'color' ? 'BOMBA DE COR! Troque com uma fruta para sumir com todas dela.' : 'Um FOGUETE! Troque ele para limpar a linha inteira.'); }
      }
      await wait(this, 40);
      return;
    }
    if (ph.t === 'fall') {
      const tw = [];
      for (const m of ph.moves) { const v = this.views.get(m.id); if (!v) continue; v.setDepth(D.PIECE + m.to.r); const dist = m.to.r - m.from.r; tw.push(tweenP(this, { targets: v, y: this._y(m.to.r), duration: 90 + dist * 55, ease: 'Bounce.out' })); }
      for (const s of ph.spawns) { const v = this._makePiece({ id: s.id, c: s.color, s: null }, s.r, s.c, this._y(s.fromRow) ); const dist = s.r - s.fromRow; tw.push(tweenP(this, { targets: v, y: this._y(s.r), duration: 90 + dist * 55, ease: 'Bounce.out' })); }
      await Promise.all(tw);
      return;
    }
    if (ph.t === 'noMoves') { this._toast('SEM JOGADAS — EMBARALHANDO…', '#9fe8ff'); await wait(this, 500); return; }
    if (ph.t === 'shuffle') {
      sfx.slide();
      const tw = [];
      for (const s of ph.pieces) { const v = this.views.get(s.id); if (!v) continue; tw.push(tweenP(this, { targets: v, scale: 0, angle: 180, duration: 180 }).then(() => { v.setTexture(this._tex({ c: s.color, s: b.pieceAt(s.r, s.c) && b.pieceAt(s.r, s.c).s })); return tweenP(this, { targets: v, scale: sc, angle: 360, duration: 220, ease: 'Back.out' }); }).then(() => v.setAngle(0))); }
      await Promise.all(tw);
      return;
    }
    if (ph.t === 'convert') {
      for (const c of ph.list) { const v = this.views.get(c.id); if (!v) continue; v.setTexture(this._tex({ c: c.color, s: c.s })); this._burst(v.x, v.y, 0xffffff, 8); this.tweens.add({ targets: v, scale: sc * 1.3, duration: 120, yoyo: true }); tone({ freq: 600 + Math.random() * 400, dur: 0.12, type: 'sine', vol: 0.12 }); await wait(this, 70); }
      await wait(this, 200);
      return;
    }
    if (ph.t === 'moves') { this._refreshHud(); this._float(GAME_W - 62, 98, '+5', '#8fe66a', 26); return; }
  }
  _viewAt(r, c) { const p = this.board.pieceAt(r, c); return p ? this.views.get(p.id) : null; }

  // ---------------------------------------------------------------- efeitos
  _effect(e) {
    const g = this.add.graphics().setDepth(D.FX);
    const x = this._x(e.c), y = this._y(e.r);
    const kill = (ms) => this.tweens.add({ targets: g, alpha: 0, duration: ms, onComplete: () => g.destroy() });
    if (e.kind === 'row' || e.kind === 'bigCross' || e.kind === 'cross') { g.fillStyle(0xffffff, 0.85); const h = e.kind === 'bigCross' ? this.cs * 3 : this.cs * 0.8; g.fillRoundedRect(this.ox, y - h / 2, this.cs * this.board.cols, h, 8); }
    if (e.kind === 'col' || e.kind === 'bigCross' || e.kind === 'cross') { g.fillStyle(0xffffff, 0.85); const w = e.kind === 'bigCross' ? this.cs * 3 : this.cs * 0.8; g.fillRoundedRect(x - w / 2, this.oy, w, this.cs * this.board.rows, 8); }
    if (e.kind === 'bomb') { const r = (e.radius + 0.5) * this.cs; g.fillStyle(0xff8b3d, 0.6); g.fillCircle(x, y, r); g.lineStyle(6, 0xffd23e, 1); g.strokeCircle(x, y, r); this._burst(x, y, 0xff8b3d, 18); }
    if (e.kind === 'color' || e.kind === 'colorConvert') { const col = FRUITS[e.color] ? FRUITS[e.color].c : 0xffffff; g.lineStyle(3, col, 0.9); for (const [id, v] of this.views) { const p = [...this.board._allPieces()].find(q => q.piece.id === id); if (p && p.piece.c === e.color) g.lineBetween(x, y, v.x, v.y); } g.fillStyle(0xffffff, 0.5); g.fillCircle(x, y, this.cs * 0.8); }
    if (e.kind === 'mega') { g.fillStyle(0xffffff, 0.9); g.fillRect(0, 0, GAME_W, GAME_H); this._shake(14); }
    if (e.kind === 'hammer') { g.lineStyle(5, 0xffd23e, 1); g.strokeCircle(x, y, this.cs * 0.6); }
    kill(e.kind === 'mega' ? 500 : 300);
  }
  _burst(x, y, color, n) {
    if (this.fx.length > 140) return;
    for (let i = 0; i < n; i++) {
      const d = this.add.image(x, y, 'm3-dot').setTint(color).setDepth(D.FX).setScale(0.3 + Math.random() * 0.5);
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 140;
      this.fx.push(d);
      this.tweens.add({ targets: d, x: x + Math.cos(a) * sp, y: y + Math.sin(a) * sp + 30, alpha: 0, scale: 0, duration: 350 + Math.random() * 250, ease: 'Quad.out', onComplete: () => { d.destroy(); this.fx = this.fx.filter(f => f !== d); } });
    }
  }
  _float(x, y, text, color, size) {
    const t = this._text(x, y, text, size, color, { stroke: '#1c2440', strokeThickness: 5 }).setDepth(D.FLOAT);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 800, ease: 'Quad.out', onComplete: () => t.destroy() });
  }
  _comboText(combo) {
    const label = COMBO_LABELS[Math.min(combo, COMBO_LABELS.length - 1)];
    const t = this.hud.combo; this.tweens.killTweensOf(t);
    t.setText(`${label}  x${combo}`).setAlpha(1).setScale(0.6).setColor(combo >= 4 ? '#ff8fc4' : '#ffd23e');
    this.tweens.add({ targets: t, scale: 1.1, duration: 160, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 700, duration: 300 });
  }
  _shake(px) { this.cameras.main.shake(140, px / 1000); }
  _vib(ms) { try { if (P.vibration() && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (_) {} }
  _toast(text, color = '#fff') {
    if (this.toastT) { this.tweens.killTweensOf(this.toastT); this.toastT.destroy(); this.toastT = null; }
    if (!text) return;
    const t = this._text(GAME_W / 2, this.oy - 30, text, 15, color, { stroke: '#1c2440', strokeThickness: 5 }).setDepth(D.FLOAT);
    this.toastT = t;
    this.tweens.add({ targets: t, alpha: 0, delay: 1400, duration: 300, onComplete: () => { if (this.toastT === t) this.toastT = null; t.destroy(); } });
  }

  // ---------------------------------------------------------------- Tuca e tutorial
  _tuca(text, ms = 3200) {
    if (this.tucaBox) { this.tweens.killTweensOf(this.tucaBox); this.tucaBox.destroy(); }
    const c = this.add.container(0, GAME_H - 200).setDepth(D.PANEL);
    const img = this.add.image(58, 0, 'm3-tuca-wave').setScale(0.75);
    const bg = this.add.graphics(); bg.fillStyle(0xffffff, 0.96); bg.fillRoundedRect(104, -44, GAME_W - 124, 76, 14); bg.fillTriangle(104, -6, 92, 0, 104, 8);
    const t = this._text(104 + (GAME_W - 124) / 2, -6, text, 13, '#1c2440', { wordWrap: { width: GAME_W - 150 }, align: 'center' });
    c.add([bg, img, t]); c.setAlpha(0);
    this.tucaBox = c;
    this.tweens.add({ targets: c, alpha: 1, y: GAME_H - 210, duration: 250 });
    this.tweens.add({ targets: img, y: -6, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: ms, duration: 300, onComplete: () => { if (this.tucaBox === c) this.tucaBox = null; c.destroy(); } });
  }
  _tutorialSwap() {
    const mv = this.board.findMove(); if (!mv) return;
    this._tutClear();
    const a = this.add.image(this._x(mv.c1), this._y(mv.r1), 'm3-sel').setScale(this.cs / 96).setDepth(D.CHAIN + 1);
    const b = this.add.image(this._x(mv.c2), this._y(mv.r2), 'm3-sel').setScale(this.cs / 96).setDepth(D.CHAIN + 1);
    const hand = this._text(this._x(mv.c1), this._y(mv.r1) - this.cs * 0.7, mv.c2 > mv.c1 ? 'ARRASTE →' : mv.r2 > mv.r1 ? 'ARRASTE ↓' : 'ARRASTE', 14, '#fff', { stroke: '#1c2440', strokeThickness: 5 }).setDepth(D.FLOAT);
    this.tweens.add({ targets: [a, b], alpha: 0.4, duration: 400, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: hand, x: this._x(mv.c2), y: this._y(mv.r2) - this.cs * 0.7, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tut = [a, b, hand];
  }
  _tutClear() { if (this.tut) { for (const o of this.tut) { this.tweens.killTweensOf(o); o.destroy(); } this.tut = null; } }

  _intro() {
    // objetivo em destaque e a Tuca com a dica da fase
    const c = this.add.container(GAME_W / 2, GAME_H / 2).setDepth(D.PANEL);
    const bg = this.add.graphics(); bg.fillStyle(0x141a33, 0.92); bg.fillRoundedRect(-170, -90, 340, 180, 20); bg.lineStyle(3, 0xffd23e, 0.8); bg.strokeRoundedRect(-170, -90, 340, 180, 20);
    c.add(bg);
    c.add(this._text(0, -60, `FASE ${this.n}`, 24, '#ffd23e'));
    c.add(this._text(0, -30, 'OBJETIVO', 12, '#b8bfd8'));
    const objs = this.board.objectives;
    objs.forEach((o, i) => {
      const y = 8 + i * 34;
      const name = o.type === 'collect' ? `${o.n} ${FRUITS[o.color].name}` : o.type === 'ice' ? `Quebre ${o.n} gelos` : o.type === 'box' ? `Quebre ${o.n} caixas` : o.type === 'chain' ? `Solte ${o.n} correntes` : `Faça ${fmt(o.n)} pontos`;
      const icon = o.type === 'collect' ? this.add.image(-60, y, 'm3-p' + o.color).setScale(0.36) : o.type === 'ice' ? this.add.image(-60, y, 'm3-ice2').setScale(0.36) : o.type === 'box' ? this.add.image(-60, y, 'm3-box1').setScale(0.36) : o.type === 'chain' ? this.add.image(-60, y, 'm3-chain').setScale(0.36) : this.add.image(-60, y, 'm3-star').setScale(0.6);
      c.add([icon, this._text(-36, y, name, 16, '#fff').setOrigin(0, 0.5)]);
    });
    c.add(this._text(0, 72, `${this.board.moves} jogadas`, 13, '#c8ceda'));
    c.setScale(0.7);
    this.busy = true;
    this.tweens.add({ targets: c, scale: 1, duration: 260, ease: 'Back.out' });
    this.tweens.add({ targets: c, alpha: 0, scale: 1.1, delay: 1500, duration: 250, onComplete: () => { c.destroy(); this.busy = false; if (this.level.tutorial === 'swap') this._tutorialSwap(); else if (this.level.tutorial && TUTORIAL[this.level.tutorial]) this._tuca(TUTORIAL[this.level.tutorial], 4000); } });
    sfx.powerup();
  }

  // ---------------------------------------------------------------- fim
  async _win() {
    this.over = true; this._select(null); this._tutClear();
    const b = this.board;
    const banner = this._text(GAME_W / 2, GAME_H / 2, 'OBJETIVO CONCLUÍDO!', 30, '#ffd23e', { stroke: '#1c2440', strokeThickness: 8 }).setDepth(D.PANEL).setScale(0.5);
    sfx.win(); this._vib([30, 30, 60]);
    await tweenP(this, { targets: banner, scale: 1, duration: 300, ease: 'Back.out' });
    await wait(this, 500);
    const left = b.moves;
    if (left > 0) banner.setText(`${left} JOGADAS VIRAM ESPECIAIS!`).setFontSize(22);
    await wait(this, 500);
    this.tweens.add({ targets: banner, alpha: 0, duration: 250, onComplete: () => banner.destroy() });
    // super cascata com as jogadas restantes
    this.busy = true;
    const phases = b.endBonus();
    for (const ph of phases) await this._phase(ph);
    this.busy = false;
    this._refreshHud();
    await wait(this, 300);
    this._result();
  }

  _stars() { const s = this.board.score; return s >= this.level.star3 ? 3 : s >= this.level.star2 ? 2 : 1; }

  _result() {
    const b = this.board, stars = this._stars();
    const rw = P.completeLevel(this.n, stars, b.score, b.stats);
    if (this.hooks.onLevelDone) this.hooks.onLevelDone({ n: this.n, stars, score: b.score, combo: b.bestCombo, specials: b.stats.specialsUsed, first: rw.first });
    this.hooks.updateHUD({ coins: P.coins(), lives: P.lives() });
    const c = this._panel(380);
    c.add(this._text(0, -160, 'FASE CONCLUÍDA!', 28, '#ffd23e'));
    const starImgs = [0, 1, 2].map(i => { const img = this.add.image(-70 + i * 70, -100, 'm3-star-off').setScale(i === 1 ? 1.5 : 1.2); c.add(img); return img; });
    c.add(this._text(0, -50, fmt(b.score), 30, '#fff'));
    c.add(this._text(0, -24, 'PONTOS', 11, '#b8bfd8'));
    c.add(this._text(0, 12, `+${rw.coins} moedas   ·   +${rw.xp} XP`, 16, '#8fe66a'));
    if (rw.keys) c.add(this._text(0, 40, `+${rw.keys} chaves da Semana do Tesouro`, 13, '#ffd23e'));
    if (rw.levelUp) c.add(this._text(0, 64, `NÍVEL ${rw.levelUp.lvl}!  +${rw.levelUp.coins} moedas${rw.levelUp.chest ? ' + baú' : ''}`, 14, '#ff8fc4'));
    if (rw.starsGained && this.n % 5 === 0) c.add(this._text(0, 88, 'Estrelas novas: construa na ILHA!', 12, '#9fe8ff'));
    this._btn(c, 0, 128, 250, 54, `PRÓXIMA  ·  FASE ${this.n + 1}`, 0x2fb573, () => this.hooks.next(this.n + 1), 17);
    this._btn(c, 0, 170, 200, 40, 'MAPA', 0x453a82, () => this.hooks.map(), 14);
    starImgs.forEach((img, i) => { if (i < stars) this.time.delayedCall(400 + i * 350, () => { img.setTexture('m3-star'); img.setScale(0); this.tweens.add({ targets: img, scale: i === 1 ? 1.5 : 1.2, duration: 300, ease: 'Back.out' }); sfx.coin(); this._burst(c.x + img.x, c.y + img.y, 0xffd23e, 10); }); });
    for (let i = 0; i < 40; i++) { const d = this.add.image(Math.random() * GAME_W, -20 - Math.random() * 200, 'm3-dot').setTint([0xe8483f, 0xffd23e, 0x3fae70, 0x2b7fd4, 0xd45de0][i % 5]).setDepth(D.PANEL + 1).setScale(0.5 + Math.random() * 0.6); this.tweens.add({ targets: d, y: GAME_H + 20, x: d.x + (Math.random() - 0.5) * 120, angle: 360, duration: 2200 + Math.random() * 1500, delay: Math.random() * 600, onComplete: () => d.destroy() }); }
  }

  _lose() {
    this.over = true; this._select(null);
    const b = this.board;
    const pct = b.progressPct();
    sfx.lose();
    const c = this._panel(340);
    const canContinue = !this.continued && pct >= 0.55;
    if (canContinue) {
      c.add(this._text(0, -130, 'QUASE LÁ!', 28, '#ffd23e'));
      const left = b.objectives.filter(o => o.got < o.n).map(o => `${o.n - o.got} ${o.type === 'collect' ? FRUITS[o.color].name : o.type === 'ice' ? 'gelos' : o.type === 'box' ? 'caixas' : o.type === 'chain' ? 'correntes' : 'pontos'}`).join(', ');
      c.add(this._text(0, -90, `Faltam apenas: ${left}`, 14, '#fff', { wordWrap: { width: 300 }, align: 'center' }));
      c.add(this._text(0, -46, `CONTINUAR COM +${CONTINUE_MOVES} JOGADAS?`, 14, '#c8ceda'));
      const hasMoves = P.boosterCount('moves') > 0;
      this._btn(c, 0, 0, 260, 54, hasMoves ? 'USAR BOOSTER +5' : `CONTINUAR  ·  ${CONTINUE_COST} moedas`, 0x2fb573, () => {
        if (hasMoves) P.useBooster('moves'); else if (!P.spend(CONTINUE_COST)) { this._toast('Moedas insuficientes', '#ff8b8b'); return; }
        this.continued = true; c.destroy(); this.over = false; b.addMoves(CONTINUE_MOVES); this._refreshHud(); this._refreshBoosters(); this.hooks.updateHUD({ coins: P.coins() }); sfx.coin(); this._float(GAME_W - 62, 98, '+5', '#8fe66a', 26);
      }, 15);
      this._btn(c, 0, 66, 200, 44, 'DESISTIR', 0x453a82, () => { c.destroy(); this._loseFinal(); }, 14);
    } else this._loseFinal(c);
  }
  _loseFinal(c = null) {
    const livesLeft = P.loseLife();
    this.hooks.updateHUD({ lives: livesLeft });
    if (!c) c = this._panel(300);
    c.add(this._text(0, -100, 'ACABARAM AS JOGADAS', 22, '#ff8b8b'));
    c.add(this._text(0, -60, `Fase ${this.n}  ·  ${fmt(this.board.score)} pontos`, 14, '#c8ceda'));
    c.add(this.add.image(-16, -14, 'm3-heart').setScale(0.9)); c.add(this._text(14, -14, `${livesLeft}`, 18, '#fff'));
    c.add(this._text(0, 14, livesLeft > 0 ? '-1 vida' : 'Sem vidas: espere ou abra um baú', 12, '#b8bfd8'));
    this._btn(c, 0, 64, 240, 54, 'TENTAR DE NOVO', 0x2fb573, () => { if (P.lives() <= 0) { this._toast('Sem vidas!', '#ff8b8b'); return; } this.hooks.next(this.n); }, 17);
    this._btn(c, 0, 118, 200, 40, 'MAPA', 0x453a82, () => this.hooks.map(), 14);
  }
  _panel(h) {
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x141a33, 0.7).setDepth(D.PANEL - 1).setInteractive();
    const c = this.add.container(GAME_W / 2, GAME_H / 2 - 20).setDepth(D.PANEL);
    const bg = this.add.graphics(); bg.fillStyle(0x1f2748, 1); bg.fillRoundedRect(-190, -h / 2 - 20, 380, h + 40, 22); bg.lineStyle(4, 0x3a4470, 1); bg.strokeRoundedRect(-190, -h / 2 - 20, 380, h + 40, 22);
    c.add(bg); c.dim = dim;
    const destroy = c.destroy.bind(c); c.destroy = () => { dim.destroy(); destroy(); };
    c.setScale(0.8); this.tweens.add({ targets: c, scale: 1, duration: 260, ease: 'Back.out' });
    return c;
  }
  _btn(c, x, y, w, h, label, color, cb, size = 16) {
    const r = this.add.rectangle(x, y, w, h, color, 1).setStrokeStyle(3, 0xffffff, 0.5).setInteractive();
    const t = this._text(x, y, label, size, '#fff');
    r.on('pointerdown', (p) => { p.event.stopPropagation(); sfx.click(); cb(); });
    c.add([r, t]);
    return r;
  }
}
