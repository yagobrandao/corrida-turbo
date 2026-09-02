// Arena Clash — cena (renderização + controles). Não simula nada: desenha o
// último snapshot que o adaptador entrega (host ou rede) e devolve inputs.
//
// Camadas de profundidade: chão 0 · arbustos 5 · unidades 100+y/10 ·
// efeitos 400 · névoa 900 · HUD 1000 · painéis 1100.
import { WORLD, MAP, HEROES, HERO_BY_ID, CLASS_NAME, ITEMS, ITEM_BY_ID, BUILDS, TEAM_COLOR, TEAM_NAME, BOT_PROFILES, MONSTERS, BUFFS, VISION } from './data.js';
import { buildArenaTextures } from './art.js';
import { sfx } from '../../core/audio.js';

const FONT = 'Fredoka, "Baloo 2", Arial, sans-serif';
const T = (s, x, y, size, color = '#fff', extra = {}) => s.add.text(x, y, '', { fontFamily: FONT, fontSize: size + 'px', color, fontStyle: 'bold', ...extra }).setOrigin(0.5);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const vib = (ms) => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) { /* sem haptic */ } };
const STAT_LABEL = { atk: 'ATQ', ap: 'PM', armor: 'ARM', mr: 'RM', hp: 'VIDA', crit: 'CRÍT', critDmg: 'DANO CRÍT', asPct: 'VEL. ATQ', msPct: 'VEL. MOV', pen: 'PEN', mpen: 'PEN MÁG', lifesteal: 'ROUBO', cdr: 'RECARGA', res: 'MANA', resRegen: 'REGEN MANA', hpRegen: 'REGEN', healPct: 'CURA' };
const statText = (stats) => Object.entries(stats).map(([k, v]) => `+${v < 1 && v > 0 ? Math.round(v * 100) + '%' : v} ${STAT_LABEL[k] || k}`).join(' · ');

export default class ArenaScene extends Phaser.Scene {
  constructor() { super('arena'); }

  init(data) {
    this.ctl = data.ctl;             // ponte com o adaptador (ver ArenaGame.js)
    this.phase = 'select';
    this.snap = null; this.views = new Map(); this.myId = null; this.myTeam = 0;
    this.floaters = []; this.fx = []; this.ui = []; this.panel = null; this.panelKind = null;
    this.joy = { id: null, ox: 0, oy: 0, mx: 0, my: 0 };
    this.lastInput = { mx: 0, my: 0, ax: 1, ay: 0, atk: false, t: 0 };
    this.keys = {}; this.paused = false; this.fogAt = 0; this.mmAt = 0; this.aimAng = 0;
    this.shopFilter = null; this.lastMe = null;
  }

  create() {
    buildArenaTextures(this);
    const W = this.scale.width, H = this.scale.height;
    this.W = W; this.H = H;
    this.cameras.main.setBounds(0, 0, WORLD.w, WORLD.h);
    this.cameras.main.setBackgroundColor('#2f6f45');
    this.input.addPointer(3);
    this._buildWorld();
    this._buildHud();
    this._buildSelect();
    this.input.keyboard.on('keydown', (e) => this._key(e.key.toLowerCase(), true));
    this.input.keyboard.on('keyup', (e) => this._key(e.key.toLowerCase(), false));
    this.events.once('shutdown', () => { this.input.keyboard.removeAllListeners(); });
  }

  // ---------------------------------------------------------------- mundo estático
  _buildWorld() {
    const g = this.add.tileSprite(0, 0, WORLD.w, WORLD.h, 'ar-grass').setOrigin(0).setDepth(0);
    const K = WORLD.w / 1600;
    const road = this.add.graphics().setDepth(1);
    for (const lane of Object.values(MAP.lanes)) {
      road.lineStyle(96, 0x9a8a62, 1); road.beginPath(); road.moveTo(lane[0].x, lane[0].y); for (const p of lane.slice(1)) road.lineTo(p.x, p.y); road.strokePath();
      road.lineStyle(80, 0xb9a878, 1); road.beginPath(); road.moveTo(lane[0].x, lane[0].y); for (const p of lane.slice(1)) road.lineTo(p.x, p.y); road.strokePath();
    }
    // bases
    MAP.bases.forEach((b, i) => { road.fillStyle(TEAM_COLOR[i], 0.18); road.fillCircle(b.x, b.y, MAP.fountainRadius); road.lineStyle(4, TEAM_COLOR[i], 0.6); road.strokeCircle(b.x, b.y, MAP.fountainRadius); });
    // trilhas da jungle
    road.lineStyle(50, 0x6f9a55, 0.8);
    for (const [a, b] of [[{ x: 190, y: 800 }, { x: 800, y: 500 }], [{ x: 1410, y: 200 }, { x: 800, y: 500 }], [{ x: 150, y: 520 }, { x: 380, y: 480 }], [{ x: 1450, y: 500 }, { x: 1220, y: 520 }], [{ x: 560, y: 860 }, { x: 640, y: 780 }], [{ x: 1040, y: 150 }, { x: 960, y: 220 }]]) { road.beginPath(); road.moveTo(a.x * K, a.y * K); road.lineTo(b.x * K, b.y * K); road.strokePath(); }
    // acampamentos
    for (const c of MAP.camps) { road.fillStyle(0x3d5a3a, 0.5); road.fillCircle(c.x, c.y, 70); }
    road.fillStyle(0x4a3a6a, 0.55); road.fillCircle(MAP.crystal.x, MAP.crystal.y, 110);
    // arbustos
    this.bushes = MAP.bushes.map(b => this.add.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w + 24, b.h + 24, 0x2c7d46, 0.95).setDepth(5));
    for (const b of MAP.bushes) for (let i = 0; i < 4; i++) this.add.image(b.x + 12 + (b.w - 24) * ((i * 0.37) % 1), b.y + 8 + (b.h - 16) * ((i * 0.61) % 1), 'ar-tree').setScale(0.55).setAlpha(0.9).setDepth(5);
    // obstáculos
    MAP.obstacles.forEach((o, i) => this.add.image(o.x, o.y - 8, i % 3 === 2 ? 'ar-rock' : 'ar-tree').setScale(o.r / 20).setDepth(100 + o.y / 10));
    // névoa de guerra (do tamanho da câmera)
    this.fog = this.add.renderTexture(0, 0, this.W, this.H).setOrigin(0).setScrollFactor(0).setDepth(900);
    this.fogBrush = this.make.image({ key: 'ar-light', add: false });
    this.fxLayer = this.add.graphics().setDepth(400);
    this.floatLayer = this.add.graphics().setDepth(401);
  }

  // ---------------------------------------------------------------- HUD
  _buildHud() {
    const W = this.W, H = this.H;
    const S = (o) => o.setScrollFactor(0).setDepth(1000);
    this.hud = {};
    // joystick
    this.hud.joyBase = S(this.add.circle(0, 0, 58, 0xffffff, 0.12).setStrokeStyle(3, 0xffffff, 0.35)).setVisible(false);
    this.hud.joyKnob = S(this.add.circle(0, 0, 28, 0xffffff, 0.45)).setVisible(false);
    // botões de habilidade
    const mk = (x, y, r, label, i, color) => {
      const c = this.add.container(x, y).setScrollFactor(0).setDepth(1001);
      const bg = this.add.circle(0, 0, r, color, 0.85).setStrokeStyle(3, 0xffffff, 0.5);
      const cd = this.add.graphics();
      const txt = T(this, 0, 0, r * 0.7, '#fff');
      const num = T(this, 0, 0, r * 0.62, '#fff').setVisible(false);
      const plus = this.add.circle(r * 0.75, -r * 0.75, 12, 0x3fae70, 1).setStrokeStyle(2, 0xffffff, 0.8).setVisible(false);
      const plusT = T(this, r * 0.75, -r * 0.75, 18, '#fff').setText('+').setVisible(false);
      const lvDots = this.add.graphics();
      c.add([bg, cd, txt, num, plus, plusT, lvDots]);
      c.setSize(r * 2, r * 2).setInteractive();
      txt.setText(label);
      c.on('pointerdown', (p) => { p.event.stopPropagation(); this._press(i, p); });
      c.on('pointerup', () => { if (i === 'atk') this.atkHeld = false; });
      c.on('pointerout', () => { if (i === 'atk') this.atkHeld = false; });
      return { c, bg, cd, txt, num, plus, plusT, lvDots, r, color };
    };
    const bx = W - 92, by = H - 88;
    this.hud.btn = [
      mk(bx - 78, by - 40, 34, 'Q', 0, 0x4d6cff),
      mk(bx - 22, by - 108, 34, 'W', 1, 0x4d6cff),
      mk(bx - 150, by - 96, 34, 'E', 2, 0x4d6cff),
      mk(bx - 110, by - 176, 40, 'R', 3, 0xd45de0),
    ];
    this.hud.atk = mk(bx, by, 50, '⚔', 'atk', 0xe8483f);
    this.hud.atk.txt.setFontSize(40);
    // topo: tempo, placar
    this.hud.timer = S(T(this, W / 2, 16, 18, '#fff'));
    this.hud.score = S(T(this, W / 2, 38, 15, '#ffd23e'));
    this.hud.feed = S(T(this, W / 2, 62, 13, '#fff').setAlpha(0));
    this.hud.toast = S(T(this, W / 2, H * 0.3, 28, '#ffd23e', { stroke: '#1c2440', strokeThickness: 6 }).setAlpha(0).setDepth(1050));
    // barras do herói (embaixo, centro-esquerda)
    this.hud.bars = S(this.add.graphics());
    this.hud.lvl = S(T(this, 42, H - 40, 16, '#fff'));
    this.hud.gold = S(T(this, 150, H - 22, 15, '#ffd23e').setOrigin(0, 0.5));
    this.hud.kda = S(T(this, 250, H - 22, 15, '#fff').setOrigin(0, 0.5));
    this.hud.buffT = S(T(this, 150, H - 74, 12, '#8fe66a').setOrigin(0, 0.5));
    this.hud.items = [];
    for (let i = 0; i < 6; i++) { const r = this.add.rectangle(158 + i * 30, H - 50, 26, 26, 0x1c2440, 0.7).setStrokeStyle(2, 0xffffff, 0.3); const t = T(this, 158 + i * 30, H - 50, 9, '#ffe58a'); S(r); S(t); this.hud.items.push({ r, t }); }
    // botões: loja, placar, recall
    const btn = (x, y, w, label, cb, color = 0x3a3f6a) => { const r = this.add.rectangle(x, y, w, 30, color, 0.9).setStrokeStyle(2, 0xffffff, 0.4).setInteractive(); const t = T(this, x, y, 13, '#fff').setText(label); S(r); S(t); r.on('pointerdown', (p) => { p.event.stopPropagation(); sfx.click(); cb(); }); return { r, t }; };
    this.hud.shopBtn = btn(56, 20, 96, 'LOJA (B)', () => this._togglePanel('shop'), 0x8d5ac0);
    this.hud.boardBtn = btn(160, 20, 92, 'PLACAR', () => this._togglePanel('board'));
    this.hud.recallBtn = btn(W - 102, 172, 150, 'VOLTAR À BASE', () => this._recall(), 0x3a3f6a);
    // minimapa
    this.mm = { x: W - 190, y: 44, w: 176, h: 110, s: 176 / WORLD.w };
    this.hud.mmBg = S(this.add.rectangle(this.mm.x + this.mm.w / 2, this.mm.y + this.mm.h / 2, this.mm.w + 6, this.mm.h + 6, 0x141a33, 0.85).setStrokeStyle(2, 0xffffff, 0.35));
    this.hud.mm = S(this.add.graphics()).setDepth(1001);
    this.hud.mmBg.setInteractive().on('pointerdown', (p) => { p.event.stopPropagation(); });
    // morte
    this.hud.dead = this.add.container(W / 2, H / 2).setScrollFactor(0).setDepth(1040).setVisible(false);
    this.hud.dead.add([this.add.rectangle(0, 0, 320, 120, 0x141a33, 0.85).setStrokeStyle(3, 0xe8483f, 0.8), T(this, 0, -30, 26, '#e8483f').setText('VOCÊ MORREU'), T(this, 0, 8, 14, '#c8ceda').setText('RESPAWN'), T(this, 0, 36, 30, '#fff')]);
    this._setHudVisible(false);
    this.input.on('pointerdown', (p) => this._pointerDown(p));
    this.input.on('pointermove', (p) => this._pointerMove(p));
    this.input.on('pointerup', (p) => this._pointerUp(p));
  }

  _setHudVisible(v) {
    const h = this.hud;
    [h.timer, h.score, h.bars, h.lvl, h.gold, h.kda, h.buffT, h.mmBg, h.mm, h.atk.c, ...h.btn.map(b => b.c), h.shopBtn.r, h.shopBtn.t, h.boardBtn.r, h.boardBtn.t, h.recallBtn.r, h.recallBtn.t, ...h.items.flatMap(i => [i.r, i.t])].forEach(o => o.setVisible(v));
    this.fog.setVisible(v);
  }

  // ---------------------------------------------------------------- input
  _pointerDown(p) {
    if (this.phase !== 'play' || this.panel) return;
    if (p.x < this.W * 0.5 && this.joy.id === null) {
      this.joy.id = p.id; this.joy.ox = p.x; this.joy.oy = p.y; this.joy.mx = this.joy.my = 0;
      this.hud.joyBase.setPosition(p.x, p.y).setVisible(true); this.hud.joyKnob.setPosition(p.x, p.y).setVisible(true);
    }
  }
  _pointerMove(p) {
    if (p.id !== this.joy.id) return;
    let dx = p.x - this.joy.ox, dy = p.y - this.joy.oy;
    const d = Math.hypot(dx, dy), max = 58;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    this.joy.mx = dx / max; this.joy.my = dy / max;
    this.hud.joyKnob.setPosition(this.joy.ox + dx, this.joy.oy + dy);
    if (d > 8) this.aimAng = Math.atan2(dy, dx);
  }
  _pointerUp(p) {
    if (p.id === this.joy.id) { this.joy.id = null; this.joy.mx = this.joy.my = 0; this.hud.joyBase.setVisible(false); this.hud.joyKnob.setVisible(false); }
  }
  _press(i, p) {
    if (this.phase !== 'play') return;
    if (i === 'atk') { this.atkHeld = true; vib(8); return; }
    const me = this.snap && this.snap.me; if (!me) return;
    // ponto de habilidade pendente: toque no "+" sobe o nível
    if (me.points > 0 && this._canLevel(me, i)) {
      const b = this.hud.btn[i]; const lx = p.x - b.c.x, ly = p.y - b.c.y;
      if (Math.hypot(lx - b.r * 0.75, ly + b.r * 0.75) < 20) { this.ctl.input({ lvl: i }); sfx.coin(); return; }
    }
    const cast = [false, false, false, false]; cast[i] = true;
    this.ctl.input({ cast, ax: Math.cos(this.aimAng), ay: Math.sin(this.aimAng) });
    if (i === 3) vib(20);
  }
  _canLevel(me, i) { const max = i === 3 ? 2 : 4; if (me.skillLv[i] >= max) return false; if (i === 3 && ((me.skillLv[3] === 0 && me.level < 5) || (me.skillLv[3] === 1 && me.level < 9))) return false; return true; }
  _key(k, down) {
    this.keys[k] = down;
    if (!down || this.phase !== 'play') return;
    const map = { q: 0, w: 1, e: 2, r: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
    if (map[k] !== undefined) { const cast = [false, false, false, false]; cast[map[k]] = true; this.ctl.input({ cast, ax: Math.cos(this.aimAng), ay: Math.sin(this.aimAng) }); }
    if (k === 'b') this._togglePanel('shop');
    if (k === 'tab') this._togglePanel('board');
    if (k === 'escape' && this.panel) this._closePanel();
  }
  _recall() { this.ctl.input({ recall: 1 }); this._toast('Voltando à base…', 1200); }

  _sendInput() {
    let mx = this.joy.mx, my = this.joy.my;
    const k = this.keys;
    if (k.a || k.arrowleft) mx = -1; if (k.d || k.arrowright) mx = 1; if (k.w || k.arrowup) my = -1; if (k.s || k.arrowdown) my = 1;
    if (this.panel) { mx = 0; my = 0; }
    // mouse mira no desktop
    const p = this.input.activePointer;
    if (!this.joy.id && p && !p.wasTouch && this.myView) { const wp = this.cameras.main.getWorldPoint(p.x, p.y); const a = Math.atan2(wp.y - this.myView.y, wp.x - this.myView.x); if (Math.hypot(wp.x - this.myView.x, wp.y - this.myView.y) > 30) this.aimAng = a; }
    if (mx || my) this.aimAng = Math.atan2(my, mx);
    const atk = !!(this.atkHeld || k[' ']);
    const li = this.lastInput, now = this.time.now;
    if (Math.abs(li.mx - mx) > 0.02 || Math.abs(li.my - my) > 0.02 || li.atk !== atk || now - li.t > 120) {
      li.mx = mx; li.my = my; li.atk = atk; li.t = now;
      this.ctl.input({ mx, my, ax: Math.cos(this.aimAng), ay: Math.sin(this.aimAng), atk });
    }
  }

  // ---------------------------------------------------------------- seleção de herói
  _buildSelect() {
    const W = this.W, H = this.H;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(1100);
    this.sel = { c, cards: [], pick: null };
    c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x141a33, 0.96));
    c.add(T(this, W / 2, 24, 24, '#ffd23e').setText('ESCOLHA SEU HERÓI'));
    const cw = 118, ch = 176, gap = 8, x0 = 16;
    HEROES.forEach((h, i) => {
      const x = x0 + cw / 2 + i * (cw + gap), y = 140;
      const card = this.add.container(x, y);
      const bg = this.add.rectangle(0, 0, cw, ch, 0x1f2748, 1).setStrokeStyle(3, 0x3a4470, 1);
      const spr = this.add.image(0, -42, 'ar-hero-' + h.id).setScale(1.3);
      const nm = T(this, 0, 14, 16, '#fff').setText(h.name);
      const cl = T(this, 0, 32, 11, hex(h.accent)).setText(CLASS_NAME[h.cls].toUpperCase());
      const ps = T(this, 0, 62, 9, '#c8ceda', { wordWrap: { width: cw - 12 }, align: 'center' }).setText(h.passive.desc);
      card.add([bg, spr, nm, cl, ps]);
      bg.setInteractive().on('pointerdown', () => { sfx.click(); this._pickHero(h.id); });
      c.add(card);
      this.sel.cards.push({ bg, hero: h.id });
    });
    // painel inferior: jogadores + dificuldade + pronto
    this.sel.roster = T(this, 16, 250, 13, '#fff', { align: 'left', lineSpacing: 4 }).setOrigin(0, 0);
    this.sel.info = T(this, W / 2 - 40, 250, 12, '#c8ceda', { wordWrap: { width: 330 }, align: 'center' }).setOrigin(0.5, 0);
    c.add([this.sel.roster, this.sel.info]);
    this.sel.diffBtns = [];
    if (this.ctl.isHost) {
      c.add(T(this, W - 200, 246, 11, '#c8ceda').setText('DIFICULDADE DOS BOTS'));
      Object.entries(BOT_PROFILES).forEach(([id, p], i) => {
        const x = W - 300 + i * 100, y = 274;
        const r = this.add.rectangle(x, y, 92, 30, 0x3a3f6a, 1).setStrokeStyle(2, 0xffffff, 0.4).setInteractive();
        const t = T(this, x, y, 13, '#fff').setText(p.name);
        r.on('pointerdown', () => { sfx.click(); this.ctl.setDifficulty(id); });
        c.add([r, t]); this.sel.diffBtns.push({ r, id });
      });
    }
    const rb = this.add.rectangle(W - 110, H - 40, 190, 48, 0x3fae70, 1).setStrokeStyle(3, 0xffffff, 0.6).setInteractive();
    const rt = T(this, W - 110, H - 40, 20, '#fff').setText('PRONTO');
    rb.on('pointerdown', () => { if (!this.sel.pick) { this._toast('Escolha um herói primeiro', 1200); return; } sfx.go(); this.ctl.ready(); });
    c.add([rb, rt]);
    this.sel.readyBtn = rb;
    this._pickHero(HEROES[0].id);
    this.refreshSelect();
  }
  _pickHero(id) { this.sel.pick = id; this.ctl.pickHero(id); this.refreshSelect(); }

  // chamado pelo adaptador quando o lobby muda
  refreshSelect(lobby = this.ctl.lobby) {
    if (!this.sel) return;
    const taken = new Set(lobby.picks.filter(p => p.slot !== this.ctl.mySlot).map(p => p.heroId));
    for (const cd of this.sel.cards) {
      const mine = cd.hero === this.sel.pick;
      cd.bg.setStrokeStyle(3, mine ? 0xffd23e : taken.has(cd.hero) ? 0xe8483f : 0x3a4470, 1).setFillStyle(mine ? 0x2c3766 : 0x1f2748, 1);
    }
    const lines = lobby.picks.map(p => `${p.team === 0 ? '🔵' : '🔴'} ${p.name}: ${p.heroId ? HERO_BY_ID[p.heroId].name : '…'} ${p.ready ? '✔' : ''}`);
    const bots = 6 - lobby.picks.length;
    if (bots > 0) lines.push(`🤖 +${bots} bot${bots > 1 ? 's' : ''} (${(BOT_PROFILES[lobby.difficulty] || BOT_PROFILES.medium).name})`);
    this.sel.roster.setText(lines.join('\n'));
    const h = HERO_BY_ID[this.sel.pick];
    this.sel.info.setText(h ? `${h.name}, ${h.title}\n${h.lore}\n\nQ ${h.skills[0].name} · W ${h.skills[1].name} · E ${h.skills[2].name} · R ${h.skills[3].name}` : '');
    for (const b of this.sel.diffBtns) b.r.setFillStyle(b.id === lobby.difficulty ? 0x8d5ac0 : 0x3a3f6a, 1);
    const me = lobby.picks.find(p => p.slot === this.ctl.mySlot);
    if (me && me.ready) { this.sel.readyBtn.setFillStyle(0x3a3f6a, 1); }
  }

  // o adaptador avisa que a partida começou
  startMatch() {
    this.phase = 'play';
    if (this.sel) { this.sel.c.destroy(); this.sel = null; }
    this._setHudVisible(true);
    this._toast('A BATALHA COMEÇOU!', 1800);
    sfx.go();
  }

  // ---------------------------------------------------------------- update
  update(time, delta) {
    if (this.phase !== 'play' || this.paused) return;
    const dt = Math.min(0.1, delta / 1000);
    this.snap = this.ctl.snapshot();
    if (!this.snap) return;
    this._sendInput();
    this._syncViews(dt);
    this._drawEvents(this.ctl.takeEvents());
    this._drawProjectiles();
    this._updateHud();
    if (time > this.fogAt) { this.fogAt = time + 100; this._drawFog(); }
    if (time > this.mmAt) { this.mmAt = time + 200; this._drawMinimap(); }
    this._tickFloaters(dt);
    if (this.snap.over && !this.resultShown) { this.resultShown = true; this.time.delayedCall(900, () => this._showResult()); }
  }

  _syncViews(dt) {
    const seen = new Set();
    const snap = this.snap;
    for (const u of snap.units) {
      seen.add(u.id);
      let v = this.views.get(u.id);
      if (!v) { v = this._makeView(u); this.views.set(u.id, v); }
      v.data = u;
      // interpolação
      const k = v.fresh ? 1 : Math.min(1, dt * 14);
      v.fresh = false;
      if (Math.hypot(u.x - v.x, u.y - v.y) > 180) { v.x = u.x; v.y = u.y; } else { v.x += (u.x - v.x) * k; v.y += (u.y - v.y) * k; }
      v.c.setPosition(v.x, v.y).setDepth(100 + v.y / 10).setVisible(!!u.a || u.k === 'hero');
      if (u.k === 'hero' && !u.a) v.c.setVisible(false);
      if (u.k === 'hero' || u.k === 'minion' || u.k === 'monster') v.spr.setFlipX(Math.cos(u.f) < 0);
      // barra de vida
      const pct = Math.max(0, u.hp / u.mh);
      if (v.hpPct !== pct || v.st !== u.st) {
        v.hpPct = pct; v.st = u.st;
        const g = v.hp; g.clear();
        const w = v.barW, y = -v.barY;
        g.fillStyle(0x000000, 0.6); g.fillRect(-w / 2 - 1, y - 1, w + 2, 7);
        g.fillStyle(u.tm === this.myTeam ? 0x3fae70 : u.tm === -1 ? 0xd45de0 : 0xe8483f, 1); g.fillRect(-w / 2, y, w * pct, 5);
        if (u.st & 2) { g.fillStyle(0xffffff, 0.8); g.fillRect(-w / 2, y - 3, w, 2); }
      }
      if (v.lvl && v.lvlN !== u.lv) { v.lvlN = u.lv; v.lvl.setText(u.lv); }
      // estados
      const stealth = u.stl === 1;
      v.spr.setAlpha(stealth ? (u.tm === this.myTeam ? 0.45 : 0.25) : (u.st & 8) && u.tm !== this.myTeam ? 0.7 : 1);
      v.spr.setTint(u.st & 4 ? 0xff9966 : u.st & 32 ? 0x99ccff : 0xffffff);
      if (v.stun) v.stun.setVisible(!!(u.st & 1) || !!(u.st & 16));
      if (u.k === 'core' && v.ring) v.ring.setVisible(!!u.vul);
      if (u.id === snap.me?.id) { this.myView = v; this.myTeam = u.tm; }
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { v.c.destroy(); this.views.delete(id); }
    // câmera
    if (this.myView) { const cam = this.cameras.main; const tx = this.myView.x - this.W / 2, ty = this.myView.y - this.H / 2; cam.scrollX += (tx - cam.scrollX) * Math.min(1, dt * 8); cam.scrollY += (ty - cam.scrollY) * Math.min(1, dt * 8); }
    // arbustos ficam translúcidos quando estou dentro
    if (this.myView) { const me = this.myView.data; this.bushes.forEach(b => b.setAlpha((me.st & 8) ? 0.55 : 0.95)); }
  }

  _makeView(u) {
    const c = this.add.container(u.x, u.y);
    let spr, barW = 36, barY = 30, lvl = null, ring = null;
    if (u.k === 'hero') { spr = this.add.image(0, -8, 'ar-hero-' + u.h).setScale(0.85); barW = 44; barY = 46;
      const ringC = this.add.circle(0, 14, 16, TEAM_COLOR[u.tm], 0.35).setStrokeStyle(2, TEAM_COLOR[u.tm], 0.9); c.add(ringC);
      lvl = T(this, -barW / 2 - 8, -barY + 2, 10, '#fff').setText(u.lv);
      const nm = T(this, 0, -barY - 10, 10, u.tm === this.myTeam ? '#8fe66a' : '#ffb3b3', { stroke: '#1c2440', strokeThickness: 3 }).setText(u.n);
      c.add(nm);
    }
    else if (u.k === 'minion') { spr = this.add.image(0, -6, `ar-min-${u.tm}-${u.mt}`).setScale(u.mt === 'siege' ? 1.1 : 0.9); barW = 24; barY = 26; if (u.emp) spr.setTint(0xd45de0); }
    else if (u.k === 'tower') { spr = this.add.image(0, -36, 'ar-tower-' + u.tm); barW = 56; barY = 88; }
    else if (u.k === 'core') { spr = this.add.image(0, -32, 'ar-core-' + u.tm); barW = 80; barY = 92; ring = this.add.circle(0, 10, 52, 0xffd23e, 0).setStrokeStyle(4, 0xffd23e, 0.8).setVisible(false); c.add(ring); }
    else if (u.k === 'monster') { spr = this.add.image(0, -10, 'ar-mon-' + u.ck); barW = 40; barY = 40 + (u.ck === 'big' ? 14 : 0); }
    else if (u.k === 'crystal') { spr = this.add.image(0, -20, 'ar-crystal'); barW = 70; barY = 70; }
    else spr = this.add.image(0, 0, 'ar-dot');
    const hp = this.add.graphics();
    const stun = T(this, 0, -barY - 4, 14, '#ffd23e').setText('✦').setVisible(false);
    c.add([spr, hp, stun]); if (lvl) c.add(lvl);
    return { c, spr, hp, stun, lvl, ring, x: u.x, y: u.y, barW, barY, hpPct: -1, st: -1, fresh: true, data: u };
  }

  // ---------------------------------------------------------------- eventos → efeitos
  _drawEvents(evs) {
    const g = this.fxLayer;
    for (const e of evs) {
      const near = (x, y) => this.myView && Math.hypot(x - this.myView.x, y - this.myView.y) < 700;
      switch (e.t) {
        case 'dmg': { const v = this.views.get(e.id); if (!v) break; if (e.h) this._float(v.x, v.y - 40, '+' + e.a, '#8fe66a', 13); else if (e.c) { this._float(v.x, v.y - 48, 'CRÍTICO! ' + e.a, '#ff8b3d', 18); if (v === this.myView) vib(25); } else this._float(v.x + (Math.random() - 0.5) * 20, v.y - 40, e.a, e.m ? '#c9a3ff' : '#fff', 12); if (v === this.myView && !e.h) { this.dmgFlash = 0.25; } break; }
        case 'shot': { if (!near(e.x, e.y)) break; this.fx.push({ kind: 'line', x: e.x, y: e.y, tx: e.tx, ty: e.ty, c: e.c, life: e.tower ? 0.18 : 0.12, w: e.tower ? 4 : e.small ? 1.5 : 2.5 }); break; }
        case 'swing': { const v = this.views.get(e.id); if (v) this.tweens.add({ targets: v.spr, x: (e.tx - v.x) * 0.15, duration: 60, yoyo: true, onComplete: () => v.spr.setX(0) }); if (v === this.myView) sfx.hit(); break; }
        case 'aoe': { this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: e.r, c: e.c, life: e.big ? 0.5 : 0.3, arc: e.arc }); if (near(e.x, e.y)) { sfx.hit(); if (e.big) this.cameras.main.shake(180, 0.006); } break; }
        case 'zone': { this.fx.push({ kind: 'zone', x: e.x, y: e.y, r: e.r, c: e.c, life: e.dur, max: e.dur }); break; }
        case 'dash': { this.fx.push({ kind: 'line', x: e.x, y: e.y, tx: e.tx, ty: e.ty, c: e.c, life: 0.25, w: 10, fade: true }); const v = this.views.get(e.id); if (v) { v.x = e.tx; v.y = e.ty; } if (near(e.x, e.y)) sfx.jump(); break; }
        case 'strike': { const v = this.views.get(e.id); if (v) this.fx.push({ kind: 'ring', x: e.tx, y: e.ty, r: 40, c: e.c, life: 0.35 }); if (near(e.tx, e.ty)) { sfx.hit(); this.cameras.main.shake(120, 0.005); } break; }
        case 'impact': { this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 22, c: e.c, life: 0.2 }); break; }
        case 'buffed': case 'healfx': { const v = this.views.get(e.id); if (v) this.fx.push({ kind: 'aura', v, c: e.c, life: 0.7 }); break; }
        case 'stealth': { const v = this.views.get(e.id); if (v) this.fx.push({ kind: 'ring', x: v.x, y: v.y, r: 30, c: 0x6b3fa0, life: 0.3 }); break; }
        case 'cast': { if (e.id === this.myId) { if (e.ult) { sfx.powerup(); vib(30); } } break; }
        case 'nores': { if (e.id === this.myId) this._toast('Sem mana!', 700); break; }
        case 'die': { const v = this.views.get(e.id); const x = v ? v.x : e.x, y = v ? v.y : e.y; for (let i = 0; i < (e.kind === 'hero' ? 10 : 5); i++) this.fx.push({ kind: 'dot', x, y: y - 10, vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 200, c: e.kind === 'hero' ? 0xffd23e : 0xffffff, life: 0.6 }); if (e.kind === 'hero') { if (e.id === this.myId) { sfx.death(); vib([40, 40, 60]); } else if (near(x, y)) sfx.death(); } if (e.kind === 'tower' || e.kind === 'core') this.cameras.main.shake(300, 0.01); break; }
        case 'kill': { this._feed(`${e.killer} eliminou ${e.victim}`, e.team === this.myTeam ? '#8fe66a' : '#ffb3b3'); break; }
        case 'tower': { this._toast(e.team === this.myTeam ? 'TORRE INIMIGA DESTRUÍDA!' : 'Sua torre foi destruída!', 1600); if (e.team === this.myTeam) sfx.win(); else sfx.count(); vib(30); break; }
        case 'crystal': { this._toast(e.team === this.myTeam ? 'CRISTAL ARCANO: BÊNÇÃO PARA O TIME!' : 'O inimigo tomou o Cristal Arcano', 2000); sfx.powerup(); vib(40); break; }
        case 'crystalup': { this._toast('O CRISTAL ARCANO SURGIU NO CENTRO', 1800); sfx.powerup(); break; }
        case 'levelup': { const v = this.views.get(e.id); if (v) { this._float(v.x, v.y - 60, 'NÍVEL ' + e.level, '#ffd23e', 15); this.fx.push({ kind: 'aura', v, c: 0xffd23e, life: 0.8 }); } if (e.id === this.myId) sfx.powerup(); break; }
        case 'buy': { if (e.id === this.myId) { sfx.coin(); if (this.panelKind === 'shop') this._renderShop(); } break; }
        case 'respawn': { if (e.id === this.myId) { sfx.go(); this._toast('DE VOLTA À LUTA!', 900); } break; }
        case 'recall': { if (e.id === this.myId) sfx.jump(); break; }
        case 'wave': break;
        case 'win': { break; }
      }
    }
    // desenha e envelhece
    g.clear();
    const dt = this.game.loop.delta / 1000;
    for (const f of this.fx) {
      f.life -= dt;
      const a = Math.max(0, Math.min(1, f.life / (f.max || 0.3)));
      if (f.kind === 'line') { g.lineStyle(f.w, f.c, f.fade ? a : Math.min(1, a * 2)); g.lineBetween(f.x, f.y, f.tx, f.ty); }
      else if (f.kind === 'ring') { g.lineStyle(4, f.c, a); if (f.arc) { g.beginPath(); g.arc(f.x, f.y, f.r * (1.2 - a * 0.2), f.arc[0] - f.arc[1] / 2, f.arc[0] + f.arc[1] / 2); g.strokePath(); g.fillStyle(f.c, a * 0.3); g.slice(f.x, f.y, f.r, f.arc[0] - f.arc[1] / 2, f.arc[0] + f.arc[1] / 2); g.fillPath(); } else { g.strokeCircle(f.x, f.y, f.r * (1.3 - a * 0.3)); g.fillStyle(f.c, a * 0.25); g.fillCircle(f.x, f.y, f.r); } }
      else if (f.kind === 'zone') { g.fillStyle(f.c, 0.18); g.fillCircle(f.x, f.y, f.r); g.lineStyle(3, f.c, 0.7); g.strokeCircle(f.x, f.y, f.r); g.lineStyle(2, 0xffffff, 0.5); g.strokeCircle(f.x, f.y, f.r * (1 - a)); }
      else if (f.kind === 'aura') { g.lineStyle(3, f.c, a); g.strokeCircle(f.v.x, f.v.y + 10, 26 + (1 - a) * 30); }
      else if (f.kind === 'dot') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 500 * dt; g.fillStyle(f.c, a); g.fillCircle(f.x, f.y, 4); }
    }
    this.fx = this.fx.filter(f => f.life > 0);
  }

  _drawProjectiles() {
    const g = this.fxLayer;
    for (const p of this.snap.proj) { g.fillStyle(p[3], 1); g.fillCircle(p[0], p[1], p[4]); g.fillStyle(0xffffff, 0.6); g.fillCircle(p[0], p[1], p[4] * 0.45); }
  }

  _float(x, y, text, color, size) {
    if (this.floaters.length > 40) return;
    const t = T(this, x, y, size, color, { stroke: '#1c2440', strokeThickness: 4 }).setText(text).setDepth(402);
    this.floaters.push({ t, life: 0.9, vy: -45 });
  }
  _tickFloaters(dt) {
    for (const f of this.floaters) { f.life -= dt; f.t.y += f.vy * dt; f.t.setAlpha(Math.min(1, f.life * 2)); if (f.life <= 0) f.t.destroy(); }
    this.floaters = this.floaters.filter(f => f.life > 0);
    if (this.dmgFlash > 0) { this.dmgFlash -= dt; }
  }
  _toast(text, ms) {
    const t = this.hud.toast; this.tweens.killTweensOf(t);
    t.setText(text).setAlpha(1).setScale(0.8);
    this.tweens.add({ targets: t, scale: 1, duration: 150 });
    this.tweens.add({ targets: t, alpha: 0, delay: ms, duration: 300 });
  }
  _feed(text, color) {
    const t = this.hud.feed; this.tweens.killTweensOf(t);
    t.setText(text).setColor(color).setAlpha(1);
    this.tweens.add({ targets: t, alpha: 0, delay: 2500, duration: 400 });
  }

  // ---------------------------------------------------------------- névoa + minimapa
  _drawFog() {
    const cam = this.cameras.main, rt = this.fog;
    rt.clear(); rt.fill(0x0b1020, 0.5);
    const br = this.fogBrush;
    for (const v of this.views.values()) {
      const u = v.data; if (!u.a || u.tm !== this.myTeam) continue;
      const r = u.k === 'hero' ? VISION.hero : u.k === 'tower' ? VISION.tower : u.k === 'minion' ? VISION.minion : u.k === 'core' ? VISION.core : 0;
      if (!r) continue;
      const sx = v.x - cam.scrollX, sy = v.y - cam.scrollY;
      if (sx < -r || sy < -r || sx > this.W + r || sy > this.H + r) continue;
      br.setScale(r / 64 * 1.05); rt.erase(br, sx, sy);
    }
  }
  _drawMinimap() {
    const g = this.hud.mm, m = this.mm, s = m.s; g.clear();
    g.fillStyle(0x2f6f45, 1); g.fillRect(m.x, m.y, m.w, m.h);
    g.lineStyle(5, 0xb9a878, 1);
    for (const lane of Object.values(MAP.lanes)) { g.beginPath(); g.moveTo(m.x + lane[0].x * s, m.y + lane[0].y * s); for (const p of lane.slice(1)) g.lineTo(m.x + p.x * s, m.y + p.y * s); g.strokePath(); }
    for (const b of MAP.bushes) { g.fillStyle(0x2c7d46, 1); g.fillRect(m.x + b.x * s, m.y + b.y * s, b.w * s, b.h * s); }
    for (const v of this.views.values()) {
      const u = v.data; if (!u.a) continue;
      const x = m.x + u.x * s, y = m.y + u.y * s;
      if (u.k === 'tower') { g.fillStyle(TEAM_COLOR[u.tm], 1); g.fillRect(x - 3, y - 3, 6, 6); }
      else if (u.k === 'core') { g.fillStyle(TEAM_COLOR[u.tm], 1); g.fillCircle(x, y, 5); }
      else if (u.k === 'hero') { g.fillStyle(u.id === this.myId ? 0xffffff : TEAM_COLOR[u.tm], 1); g.fillCircle(x, y, u.id === this.myId ? 4 : 3.2); if (u.id === this.myId) { g.lineStyle(1.5, 0xffd23e, 1); g.strokeCircle(x, y, 5); } }
      else if (u.k === 'monster') { g.fillStyle(0xd45de0, 1); g.fillCircle(x, y, 2); }
      else if (u.k === 'crystal') { g.fillStyle(0xff8fc4, 1); g.fillCircle(x, y, 4); }
      else if (u.k === 'minion') { g.fillStyle(TEAM_COLOR[u.tm], 0.8); g.fillCircle(x, y, 1.2); }
    }
    const cam = this.cameras.main; g.lineStyle(1, 0xffffff, 0.5); g.strokeRect(m.x + cam.scrollX * s, m.y + cam.scrollY * s, this.W * s, this.H * s);
  }

  // ---------------------------------------------------------------- HUD do herói
  _updateHud() {
    const snap = this.snap, me = snap.me, h = this.hud;
    this.myId = me ? me.id : null;
    const mv = this.myView; const u = mv ? mv.data : null;
    h.timer.setText(mmss(snap.t));
    const k = [0, 0]; for (const b of snap.board) k[b.tm] += b.k;
    h.score.setText(`🔵 ${k[0]}   🏰 ${snap.towers[0]} · ${snap.towers[1]} 🏰   ${k[1]} 🔴`);
    if (!me || !u) return;
    const g = h.bars; g.clear();
    const bx = 150, by = this.H - 100, bw = 190;
    g.fillStyle(0x000000, 0.55); g.fillRoundedRect(bx - 130, by - 14, 360, 96, 10);
    g.fillStyle(0x1c2440, 1); g.fillRect(bx, by, bw, 12); g.fillStyle(this.dmgFlash > 0 ? 0xff6a5e : 0x3fae70, 1); g.fillRect(bx, by, bw * Math.max(0, u.hp / u.mh), 12);
    if (me.shield > 0) { g.fillStyle(0xffffff, 0.8); g.fillRect(bx, by - 3, bw * Math.min(1, me.shield / u.mh), 2); }
    g.fillStyle(0x1c2440, 1); g.fillRect(bx, by + 16, bw, 8); g.fillStyle(HERO_BY_ID[u.h].res === 'energy' ? 0xffd23e : 0x4d6cff, 1); g.fillRect(bx, by + 16, bw * Math.max(0, me.res / me.resMax), 8);
    g.fillStyle(0x1c2440, 1); g.fillRect(bx, by + 28, bw, 4); g.fillStyle(0xd45de0, 1); g.fillRect(bx, by + 28, bw * Math.min(1, me.xp / me.xpNext), 4);
    // retrato + nível
    g.fillStyle(0x2c3766, 1); g.fillCircle(42, this.H - 58, 36); g.lineStyle(3, TEAM_COLOR[this.myTeam], 1); g.strokeCircle(42, this.H - 58, 36);
    if (!h.portrait) { h.portrait = this.add.image(42, this.H - 62, 'ar-hero-' + u.h).setScrollFactor(0).setDepth(1001).setScale(0.9); }
    h.lvl.setText(`Nv ${me.level}`).setPosition(42, this.H - 22);
    h.gold.setText(`🪙 ${fmt(me.gold)}`);
    h.kda.setText(`${me.kills} / ${me.deaths} / ${me.assists}`);
    h.buffT.setText(me.buffs.filter(b => BUFFS[b.id]).map(b => `${BUFFS[b.id].name} ${b.left}s`).join('  ') + (me.recall ? '  ⟲ voltando…' : ''));
    me.items.forEach((id, i) => h.items[i].t.setText(ITEM_BY_ID[id].name.split(' ')[0].slice(0, 5)));
    for (let i = me.items.length; i < 6; i++) h.items[i].t.setText('');
    // botões
    for (let i = 0; i < 4; i++) {
      const b = h.btn[i], cd = me.cds[i], lv = me.skillLv[i];
      const sk = HERO_BY_ID[u.h].skills[i];
      b.cd.clear();
      const usable = lv > 0 && cd <= 0 && me.res >= sk.cost;
      b.bg.setAlpha(lv > 0 ? 1 : 0.35).setFillStyle(b.color, usable ? 0.9 : 0.55);
      if (cd > 0 && lv > 0) { b.cd.fillStyle(0x000000, 0.55); b.cd.slice(0, 0, b.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, cd / sk.cd), false); b.cd.fillPath(); b.num.setText(cd < 10 ? cd.toFixed(1) : Math.ceil(cd)).setVisible(true); b.txt.setVisible(false); }
      else { b.num.setVisible(false); b.txt.setVisible(true); }
      const can = me.points > 0 && this._canLevel(me, i);
      b.plus.setVisible(can); b.plusT.setVisible(can);
      b.lvDots.clear(); for (let d = 0; d < (i === 3 ? 2 : 4); d++) { b.lvDots.fillStyle(d < lv ? 0xffd23e : 0x000000, d < lv ? 1 : 0.4); b.lvDots.fillCircle(-12 + d * 8, b.r - 6, 2.5); }
    }
    h.atk.bg.setFillStyle(0xe8483f, this.atkHeld ? 1 : 0.85);
    // morte
    if (!u.a) { h.dead.setVisible(true); h.dead.list[3].setText(u.rs); if (this.panel) this._closePanel(); } else h.dead.setVisible(false);
    // loja: atualiza preços quando ouro muda
    if (this.panelKind === 'shop' && this.lastMe && (this.lastMe.gold !== me.gold || this.lastMe.items.length !== me.items.length)) this._renderShop();
    this.lastMe = { gold: me.gold, items: me.items };
  }

  // ---------------------------------------------------------------- painéis (loja / placar)
  _togglePanel(kind) { if (this.panelKind === kind) this._closePanel(); else { this._closePanel(); this._openPanel(kind); } }
  _closePanel() { if (this.panel) { this.panel.destroy(); this.panel = null; this.panelKind = null; } }
  _openPanel(kind) {
    if (this.phase !== 'play') return;
    this.panelKind = kind;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(1100);
    this.panel = c;
    const bg = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x141a33, 0.86).setInteractive();
    bg.on('pointerdown', () => this._closePanel());
    c.add(bg);
    const x = this.add.rectangle(this.W - 30, 24, 40, 30, 0xe8483f, 1).setInteractive(); x.on('pointerdown', (p) => { p.event.stopPropagation(); this._closePanel(); });
    c.add([x, T(this, this.W - 30, 24, 16, '#fff').setText('✕')]);
    if (kind === 'shop') this._renderShop(); else this._renderBoard();
  }

  _renderShop() {
    const c = this.panel; if (!c) return;
    if (this.shopBody) { this.shopBody.destroy(); }
    const body = this.add.container(0, 0); c.add(body); this.shopBody = body;
    const me = this.snap.me, hero = HERO_BY_ID[this.myView.data.h];
    body.add(T(this, 20, 22, 20, '#ffd23e').setOrigin(0, 0.5).setText(`LOJA  🪙 ${fmt(me.gold)}`));
    body.add(T(this, 260, 22, 12, '#c8ceda').setOrigin(0, 0.5).setText(`Itens: ${me.items.map(i => ITEM_BY_ID[i].name).join(', ') || 'nenhum'}`));
    const build = BUILDS[hero.id] || [];
    const next = build.find(id => !me.items.includes(id));
    const cw = 150, ch = 88, gap = 6, cols = 6, x0 = 16, y0 = 50;
    ITEMS.forEach((it, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = x0 + col * (cw + gap), y = y0 + row * (ch + gap);
      let cost = it.cost; const have = []; for (const f of it.from || []) { const idx = me.items.findIndex((v, k) => v === f && !have.includes(k)); if (idx >= 0) { have.push(idx); cost -= ITEM_BY_ID[f].cost; } }
      const afford = me.gold >= cost && (me.items.length - have.length < 6);
      const bg = this.add.rectangle(x + cw / 2, y + ch / 2, cw, ch, it.from ? 0x2c3766 : 0x1f2748, 1).setStrokeStyle(2, next === it.id ? 0xffd23e : afford ? 0x3fae70 : 0x3a4470, 1).setInteractive();
      bg.on('pointerdown', (p) => { p.event.stopPropagation(); if (!afford) { this._toast('Ouro insuficiente', 700); return; } this.ctl.input({ buy: it.id }); });
      body.add([bg,
        T(this, x + 6, y + 12, 12, it.from ? '#ffe58a' : '#fff').setOrigin(0, 0.5).setText(it.name),
        T(this, x + cw - 6, y + 12, 12, afford ? '#ffd23e' : '#ff8b8b').setOrigin(1, 0.5).setText(`🪙${cost}`),
        T(this, x + 6, y + 40, 9, '#c8ceda', { wordWrap: { width: cw - 12 } }).setOrigin(0, 0.5).setText(statText(it.stats)),
        T(this, x + 6, y + 70, 9, '#8fe66a').setOrigin(0, 0.5).setText(it.from ? `${it.from.map(f => ITEM_BY_ID[f].name).join(' + ')}` : it.tag || 'componente'),
      ]);
      if (next === it.id) body.add(T(this, x + cw - 8, y + ch - 10, 9, '#ffd23e').setOrigin(1, 0.5).setText('★ sugerido'));
    });
    body.add(T(this, this.W / 2, this.H - 14, 10, '#c8ceda').setText('Itens dourados juntam componentes que você já tem (o preço já desconta). Máx. 6 itens. Comprar em qualquer lugar.'));
  }

  _renderBoard() {
    const c = this.panel, snap = this.snap;
    c.add(T(this, this.W / 2, 24, 20, '#ffd23e').setText('PLACAR'));
    [0, 1].forEach(team => {
      const x0 = 20 + team * (this.W / 2), y0 = 56;
      c.add(T(this, x0, y0, 15, hex(TEAM_COLOR[team])).setOrigin(0, 0.5).setText(`TIME ${TEAM_NAME[team]}  ·  ${snap.towers[team]} torres`));
      snap.board.filter(b => b.tm === team).forEach((b, i) => {
        const y = y0 + 30 + i * 60;
        c.add(this.add.rectangle(x0 + 220, y + 12, 440, 54, 0x1f2748, 1).setStrokeStyle(2, b.id === this.myId ? 0xffd23e : 0x3a4470, 1));
        c.add(this.add.image(x0 + 30, y + 10, 'ar-hero-' + b.h).setScale(0.7));
        c.add(T(this, x0 + 62, y, 13, '#fff').setOrigin(0, 0.5).setText(`${b.n}  ·  Nv ${b.lv}`));
        c.add(T(this, x0 + 62, y + 22, 12, '#c8ceda').setOrigin(0, 0.5).setText(`${b.k} / ${b.d} / ${b.a}   dano ${fmt(b.dmg)}   ${b.it.map(i => ITEM_BY_ID[i].name.split(' ')[0]).join(', ')}`));
      });
    });
  }

  // ---------------------------------------------------------------- resultado
  _showResult() {
    this._closePanel();
    this._setHudVisible(false);
    const over = this.snap.over, won = over.winner === this.myTeam;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(1200);
    c.add(this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x141a33, 0.9));
    c.add(T(this, this.W / 2, 50, 40, won ? '#ffd23e' : '#ff8b8b').setText(won ? '🏆 VITÓRIA!' : 'DERROTA'));
    c.add(T(this, this.W / 2, 90, 16, hex(TEAM_COLOR[over.winner])).setText(`TIME ${TEAM_NAME[over.winner]} venceu em ${mmss(over.time)}`));
    const mvp = this.snap.board.find(b => b.id === over.mvp);
    if (mvp) { c.add(this.add.image(this.W / 2 - 120, 160, 'ar-hero-' + mvp.h).setScale(1.2)); c.add(T(this, this.W / 2 - 120, 205, 12, '#ffd23e').setText('MVP')); c.add(T(this, this.W / 2 - 120, 222, 14, '#fff').setText(mvp.n)); }
    const me = this.snap.board.find(b => b.id === this.myId);
    if (me) c.add(T(this, this.W / 2 + 60, 165, 16, '#fff', { align: 'center', lineSpacing: 6 }).setText(`${me.k} ABATES\n${me.d} MORTES\n${me.a} ASSISTÊNCIAS\ndano ${fmt(me.dmg)}`));
    const rw = this.ctl.rewards(won, me, mvp && mvp.id === this.myId);
    c.add(T(this, this.W / 2, 262, 14, '#8fe66a').setText(`+${rw.xp} XP de conta   +${rw.coins} moedas   +${rw.mastery} maestria de ${HERO_BY_ID[this.myView.data.h].name}`));
    const b = this.add.rectangle(this.W / 2, this.H - 40, 220, 46, 0x3fae70, 1).setStrokeStyle(3, 0xffffff, 0.6).setInteractive();
    b.on('pointerdown', () => { sfx.click(); this.ctl.finish(); });
    c.add([b, T(this, this.W / 2, this.H - 40, 18, '#fff').setText('CONTINUAR')]);
    if (won) { sfx.win(); vib([30, 30, 30, 30, 80]); } else sfx.lose();
  }
}
