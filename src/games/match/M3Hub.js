// Pomar Mágico — hub: menu, mapa ilustrado, Ilha do Pomar (metaprogressão),
// diário (login, roda, missões, evento, baús), coleção e perfil.
import { GAME_W, GAME_H } from '../../core/config.js';
import { sfx } from '../../core/audio.js';
import { FRUITS, BOOSTERS, REGIONS, regionFor, ISLAND, DAILY_LOGIN, WHEEL, CHESTS, COLLECTION, EVENT, LIVES_MAX, xpToNext } from './config.js';
import { levelFor } from './levels.js';
import { buildMatchTextures } from './art.js';
import * as P from './progress.js';

const FONT = 'Fredoka, "Baloo 2", Arial, sans-serif';
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const MAP_LEVELS = 90;

export default class M3Hub extends Phaser.Scene {
  constructor() { super('m3hub'); }
  init(data) { this.hooks = data.hooks; this.screen = data.screen || 'menu'; this.ui = []; this.fx = []; this.paused = false; }

  create() {
    buildMatchTextures(this);
    this.bgG = this.add.graphics().setDepth(0);
    this.bgDeco = [];
    this._show(this.screen);
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this._tickHud() });
  }
  _tickHud() { if (this.livesText) { const l = P.lives(), n = P.nextLifeIn(); this.livesText.setText(l >= LIVES_MAX ? 'vidas cheias' : `próxima vida em ${mmss(n)}`); } this.hooks.updateHUD({ coins: P.coins(), lives: P.lives() }); }

  _clear() { for (const o of this.ui) { this.tweens.killTweensOf(o); o.destroy(); } this.ui = []; for (const o of this.fx) { this.tweens.killTweensOf(o); o.destroy(); } this.fx = []; if (this._scrollOff) { this._scrollOff(); this._scrollOff = null; } }
  _show(screen, arg) {
    this._clear(); this.screen = screen;
    this.hooks.updateHUD({ title: 'Pomar Mágico', coins: P.coins(), lives: P.lives() });
    ({ menu: () => this._menu(), map: () => this._map(arg), island: () => this._island(), daily: () => this._daily(), collection: () => this._collection(), profile: () => this._profile() })[screen]();
  }
  _sky(reg, groundY = GAME_H - 120) {
    const g = this.bgG; g.clear();
    for (let i = 0; i < 40; i++) { g.fillStyle(reg.sky[0], 0.12 + (i / 40) * 0.55); g.fillRect(0, i * (GAME_H / 40), GAME_W, GAME_H / 40 + 1); }
    g.fillStyle(reg.ground, 1); g.fillEllipse(GAME_W / 2, groundY + 140, GAME_W * 1.7, 300);
    for (const d of this.bgDeco) d.destroy(); this.bgDeco = [];
    for (let i = 0; i < 3; i++) { const c = this.add.image(70 + i * 160, 50 + (i % 2) * 50, 'm3-cloud').setAlpha(0.5).setDepth(1); this.tweens.add({ targets: c, x: c.x + 24, duration: 5000 + i * 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' }); this.bgDeco.push(c); }
  }
  _text(x, y, s, size, color = '#fff', extra = {}) { const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', color, fontStyle: 'bold', ...extra }).setOrigin(0.5).setDepth(10); this.ui.push(t); return t; }
  _btn(x, y, w, h, label, color, cb, size = 18, depth = 10) {
    const r = this.add.rectangle(x, y, w, h, color, 1).setStrokeStyle(3, 0xffffff, 0.5).setDepth(depth).setInteractive();
    const t = this._text(x, y, label, size).setDepth(depth + 1);
    r.on('pointerdown', (p) => { if (this.dragging) return; p.event.stopPropagation(); sfx.click(); this.tweens.add({ targets: [r, t], scale: 0.94, duration: 60, yoyo: true }); cb(); });
    this.ui.push(r); return r;
  }
  _back(cb = () => this._show('menu')) { this._btn(60, 34, 96, 40, '← VOLTAR', 0x453a82, cb, 13, 20); }
  _toast(text, color = '#fff') {
    const t = this._text(GAME_W / 2, GAME_H - 160, text, 15, color, { stroke: '#1c2440', strokeThickness: 5 }).setDepth(90);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, delay: 1200, duration: 400, onComplete: () => t.destroy() });
  }
  _burst(x, y, color, n = 12) { for (let i = 0; i < n; i++) { const d = this.add.image(x, y, 'm3-dot').setTint(color).setDepth(60).setScale(0.4 + Math.random() * 0.5); const a = Math.random() * 6.28, sp = 60 + Math.random() * 120; this.fx.push(d); this.tweens.add({ targets: d, x: x + Math.cos(a) * sp, y: y + Math.sin(a) * sp, alpha: 0, duration: 500, onComplete: () => { d.destroy(); this.fx = this.fx.filter(f => f !== d); } }); } }
  _tuca(x, y, scale = 1) { const img = this.add.image(x, y, 'm3-tuca').setScale(scale).setDepth(12); this.ui.push(img); this.tweens.add({ targets: img, y: y - 8, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' }); this.time.addEvent({ delay: 2600, loop: true, callback: () => { if (!img.active) return; img.setTexture('m3-tuca-blink'); this.time.delayedCall(140, () => { if (img.active) img.setTexture('m3-tuca'); }); } }); return img; }

  // ---------------------------------------------------------------- menu
  _menu() {
    const s = P.summary(); const reg = regionFor(s.level);
    this._sky(reg);
    const title = this._text(GAME_W / 2, 150, 'POMAR', 60, '#ffd23e', { stroke: '#1c2440', strokeThickness: 10 });
    const title2 = this._text(GAME_W / 2, 210, 'MÁGICO', 48, '#ff8fc4', { stroke: '#1c2440', strokeThickness: 9 });
    this.tweens.add({ targets: [title, title2], y: '-=6', duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this._text(GAME_W / 2, 250, 'junte 3 frutas iguais', 14, '#fff');
    // frutas decorativas flutuando
    for (let i = 0; i < 6; i++) { const f = this.add.image(40 + i * 80, 70 + (i % 2) * 300 + (i % 3) * 30, 'm3-p' + i).setScale(0.5).setDepth(5).setAngle(-15 + i * 6); this.ui.push(f); this.tweens.add({ targets: f, y: f.y - 14, angle: f.angle + 10, duration: 1600 + i * 200, yoyo: true, repeat: -1, ease: 'Sine.inOut' }); }
    this._tuca(90, 372, 0.9);
    const y0 = 320;
    this._btn(GAME_W / 2 + 40, y0, 250, 58, `JOGAR  ·  FASE ${s.level}`, 0x2fb573, () => this._levelPopup(s.level), 19);
    this._btn(GAME_W / 2 + 40, y0 + 68, 250, 50, 'MAPA', 0x2b7fd4, () => this._show('map'), 16);
    this._btn(GAME_W / 2 + 40, y0 + 126, 250, 50, `ILHA  ·  ★ ${P.starsAvailable()}`, 0xff8b3d, () => this._show('island'), 16);
    const badge = P.loginState().claimable || P.missionsClaimable() || P.wheelAvailable() || P.eventState().canClaim;
    this._btn(GAME_W / 2 + 40, y0 + 184, 250, 50, 'DIÁRIO' + (badge ? '  •' : ''), badge ? 0xd45de0 : 0x8d5ac0, () => this._show('daily'), 16);
    this._btn(GAME_W / 2 - 90, y0 + 242, 160, 44, `COLEÇÃO ${s.cards}/${COLLECTION.length}`, 0x453a82, () => this._show('collection'), 13);
    this._btn(GAME_W / 2 + 90, y0 + 242, 160, 44, `PERFIL  ·  Nv ${s.lvl}`, 0x453a82, () => this._show('profile'), 13);
    this._btn(GAME_W / 2 - 90, y0 + 296, 160, 44, '⚔️ BATALHA', 0xe8483f, () => this._battleMenu(), 13);
    this._btn(GAME_W / 2 + 90, y0 + 296, 160, 44, '🤖 VS BOT', 0x2b7fd4, () => this._vsBotSetup(), 13);
    // vidas
    const ly = GAME_H - 150;
    for (let i = 0; i < LIVES_MAX; i++) { const h = this.add.image(GAME_W / 2 - 60 + i * 30, ly, 'm3-heart').setScale(0.7).setDepth(10).setAlpha(i < s.lives ? 1 : 0.25); this.ui.push(h); }
    this.livesText = this._text(GAME_W / 2, ly + 26, '', 11, '#fff'); this._tickHud();
    if (s.streak) this._text(GAME_W / 2, ly + 46, `🔥 ${s.streak} dia${s.streak > 1 ? 's' : ''} seguidos`, 12, '#ffd23e');
  }

  // ---------------------------------------------------------------- batalha
  _battleMenu() {
    if (this.hooks.battleRoom && this.hooks.canBattleRoom && this.hooks.canBattleRoom()) { this.hooks.battleRoom(); return; }
    this._toast('Crie uma sala com 2 a 5 jogadores na Central de Jogos para desafiar amigos. Sozinho, tente VS BOT!', '#ff8b8b');
  }
  _vsBotSetup() {
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x141a33, 0.85).setDepth(80).setInteractive(); this.ui.push(dim);
    const c = this.add.container(GAME_W / 2, GAME_H / 2 - 20).setDepth(81); this.ui.push(c);
    const bg = this.add.graphics(); bg.fillStyle(0x1f2748, 1); bg.fillRoundedRect(-170, -220, 340, 440, 22); bg.lineStyle(4, 0x2b7fd4, 0.8); bg.strokeRoundedRect(-170, -220, 340, 440, 22); c.add(bg);
    const T = (x, y, s, size, color = '#fff', extra = {}) => { const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', color, fontStyle: 'bold', ...extra }).setOrigin(0.5); c.add(t); return t; };
    T(0, -190, 'VS BOT', 26, '#2b7fd4');
    T(0, -160, 'treino local: você + bots, sem precisar de sala', 11, '#b8bfd8', { wordWrap: { width: 300 }, align: 'center' });
    T(0, -120, 'QUANTOS PARTICIPANTES', 12, '#b8bfd8');
    let n = 3;
    const nText = T(0, -80, String(n), 32, '#ffd23e');
    const dec = this.add.rectangle(-90, -80, 44, 44, 0x2c3766, 1).setStrokeStyle(2, 0xffffff, 0.4).setInteractive(); c.add(dec);
    const inc = this.add.rectangle(90, -80, 44, 44, 0x2c3766, 1).setStrokeStyle(2, 0xffffff, 0.4).setInteractive(); c.add(inc);
    T(-90, -80, '-', 24); T(90, -80, '+', 24);
    dec.on('pointerdown', (p) => { p.event.stopPropagation(); if (n > 2) { n--; nText.setText(String(n)); } });
    inc.on('pointerdown', (p) => { p.event.stopPropagation(); if (n < 5) { n++; nText.setText(String(n)); } });
    T(0, -30, `você + ${n - 1} bot${n - 1 > 1 ? 's' : ''}`, 12, '#8fe66a');
    T(0, 4, 'DIFICULDADE DOS BOTS', 12, '#b8bfd8');
    let diff = 'medium';
    const diffBtns = [];
    ['easy', 'medium', 'hard'].forEach((d, i) => {
      const x = -90 + i * 90;
      const r = this.add.rectangle(x, 34, 80, 32, d === diff ? 0x2b7fd4 : 0x2c3766, 1).setStrokeStyle(2, 0xffffff, 0.4).setInteractive(); c.add(r);
      const label = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' }[d];
      T(x, 34, label, 11);
      r.on('pointerdown', (p) => { p.event.stopPropagation(); diff = d; for (const b of diffBtns) b.setFillStyle(b.dv === diff ? 0x2b7fd4 : 0x2c3766, 1); });
      r.dv = d; diffBtns.push(r);
    });
    T(0, 76, 'a barra de energia carrega com trios/cascatas; ao encher, toque em ⚡ pra atacar o adversário', 10, '#c8ceda', { wordWrap: { width: 280 }, align: 'center' });
    const start = this.add.rectangle(0, 150, 240, 54, 0xe8483f, 1).setStrokeStyle(3, 0xffffff, 0.5).setInteractive(); c.add(start);
    T(0, 150, 'COMEÇAR', 18);
    start.on('pointerdown', (p) => { p.event.stopPropagation(); sfx.go(); this.hooks.battleVsBot({ participants: n, difficulty: diff }); });
    const close = this.add.rectangle(0, 190, 160, 36, 0x453a82, 1).setStrokeStyle(2, 0xffffff, 0.3).setInteractive(); c.add(close);
    T(0, 190, 'CANCELAR', 12);
    close.on('pointerdown', (p) => { p.event.stopPropagation(); dim.destroy(); c.destroy(); });
    dim.on('pointerdown', () => { dim.destroy(); c.destroy(); });
  }

  // ---------------------------------------------------------------- mapa
  _map(focus) {
    const s = P.summary();
    const cur = s.level;
    const reg = regionFor(cur); this._sky(reg, GAME_H);
    const nodeY = (n) => 120 * n;
    const nodeX = (n) => GAME_W / 2 + Math.sin(n * 0.9) * 150;
    const total = Math.max(MAP_LEVELS, cur + 10);
    const contentH = nodeY(total) + 200;
    const c = this.add.container(0, 0).setDepth(5); this.ui.push(c);
    const path = this.add.graphics();
    // faixas das regiões
    for (const r of REGIONS) { const y0 = nodeY(r.from) - 60, y1 = nodeY(Math.min(total, r.to)) + 60; if (y0 > contentH) break; path.fillStyle(r.ground, 0.25); path.fillRect(0, y0, GAME_W, y1 - y0); }
    for (let n = 1; n < total; n++) { path.lineStyle(14, 0x1c2440, 0.35); path.lineBetween(nodeX(n), nodeY(n), nodeX(n + 1), nodeY(n + 1)); path.lineStyle(8, 0xffe58a, 0.9); path.lineBetween(nodeX(n), nodeY(n), nodeX(n + 1), nodeY(n + 1)); }
    c.add(path);
    for (const r of REGIONS) { if (nodeY(r.from) > contentH) break; const t = this.add.text(GAME_W / 2, nodeY(r.from) - 64, r.name.toUpperCase(), { fontFamily: FONT, fontSize: '16px', color: '#fff', fontStyle: 'bold', stroke: '#1c2440', strokeThickness: 5 }).setOrigin(0.5); c.add(t); }
    for (let n = 1; n <= total; n++) {
      const x = nodeX(n), y = nodeY(n), st = s.level > n ? (P.load().stars[n] || 0) : 0;
      const locked = n > cur;
      const img = this.add.image(x, y, locked ? 'm3-node-lock' : 'm3-node').setScale(n === cur ? 1.15 : 1);
      c.add(img);
      if (!locked) { const t = this.add.text(x, y, String(n), { fontFamily: FONT, fontSize: '18px', color: '#1c2440', fontStyle: 'bold' }).setOrigin(0.5); c.add(t); img.setInteractive().on('pointerdown', () => { if (this.dragging) return; sfx.click(); this._levelPopup(n); }); }
      if (st) for (let i = 0; i < 3; i++) c.add(this.add.image(x - 16 + i * 16, y + 34, i < st ? 'm3-star' : 'm3-star-off').setScale(0.36));
      if (n % 5 === 0) { const ch = this.add.image(x + (Math.sin(n) > 0 ? -60 : 60), y - 10, n % 15 === 0 ? 'm3-chest-epic' : 'm3-chest-rare').setScale(0.5).setAlpha(locked ? 0.5 : 0.9); c.add(ch); }
      if (n % 3 === 1) c.add(this.add.image(x + (Math.sin(n * 1.7) > 0 ? 130 : -130), y + 30, 'm3-tree').setScale(0.8).setAlpha(0.8));
      if (n === cur) { const disc = this.add.circle(x, y, 34, 0xffd23e, 0.35); c.add(disc); c.sendToBack(disc); c.moveAbove(disc, path); this.tweens.add({ targets: disc, scale: 1.3, alpha: 0, duration: 1000, repeat: -1 }); const tuca = this.add.image(x + 46, y - 40, 'm3-tuca').setScale(0.55); c.add(tuca); this.tweens.add({ targets: tuca, y: tuca.y - 6, duration: 800, yoyo: true, repeat: -1 }); }
    }
    // rolagem (arrasto) — começa na fase atual
    const minY = -(contentH - GAME_H), maxY = 0;
    c.y = Phaser.Math.Clamp(-(nodeY(focus || cur) - GAME_H * 0.55), minY, maxY);
    let start = null;
    const onDown = (p) => { start = { y: p.y, cy: c.y }; this.dragging = false; };
    const onMove = (p) => { if (!start || !p.isDown) return; const dy = p.y - start.y; if (Math.abs(dy) > 8) this.dragging = true; c.y = Phaser.Math.Clamp(start.cy + dy, minY, maxY); };
    const onUp = () => { start = null; this.time.delayedCall(50, () => { this.dragging = false; }); };
    this.input.on('pointerdown', onDown); this.input.on('pointermove', onMove); this.input.on('pointerup', onUp);
    this._scrollOff = () => { this.input.off('pointerdown', onDown); this.input.off('pointermove', onMove); this.input.off('pointerup', onUp); };
    this._back();
    this._btn(GAME_W - 70, 34, 116, 40, `ILHA ★ ${P.starsAvailable()}`, 0xff8b3d, () => this._show('island'), 13, 20);
  }

  _levelPopup(n) {
    const lv = levelFor(n);
    const rec = P.load().stars[n] || 0;
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x141a33, 0.7).setDepth(80).setInteractive(); this.ui.push(dim);
    dim.on('pointerdown', () => { dim.destroy(); c.destroy(); });
    const c = this.add.container(GAME_W / 2, GAME_H / 2 - 30).setDepth(81); this.ui.push(c);
    const bg = this.add.graphics(); bg.fillStyle(0x1f2748, 1); bg.fillRoundedRect(-190, -230, 380, 460, 22); bg.lineStyle(4, 0xffd23e, 0.8); bg.strokeRoundedRect(-190, -230, 380, 460, 22); c.add(bg);
    const T = (x, y, s, size, color = '#fff', extra = {}) => { const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', color, fontStyle: 'bold', ...extra }).setOrigin(0.5); c.add(t); return t; };
    T(0, -200, `FASE ${n}`, 28, '#ffd23e');
    T(0, -172, regionFor(n).name, 12, '#b8bfd8');
    for (let i = 0; i < 3; i++) c.add(this.add.image(-40 + i * 40, -140, i < rec ? 'm3-star' : 'm3-star-off').setScale(0.7));
    T(0, -104, 'OBJETIVO', 11, '#b8bfd8');
    lv.objectives.forEach((o, i) => {
      const y = -76 + i * 34;
      const name = o.type === 'collect' ? `${o.n} ${FRUITS[o.color].name}` : o.type === 'ice' ? `Quebre ${o.n} gelos` : o.type === 'box' ? `Quebre ${o.n} caixas` : o.type === 'chain' ? `Solte ${o.n} correntes` : o.type === 'honey' ? `Limpe ${o.n} méis` : `Faça ${fmt(o.n)} pontos`;
      const icon = o.type === 'collect' ? this.add.image(-60, y, 'm3-p' + o.color).setScale(0.34) : o.type === 'ice' ? this.add.image(-60, y, 'm3-ice2').setScale(0.34) : o.type === 'box' ? this.add.image(-60, y, 'm3-box1').setScale(0.34) : o.type === 'chain' ? this.add.image(-60, y, 'm3-chain').setScale(0.34) : o.type === 'honey' ? this.add.image(-60, y, 'm3-honey').setScale(0.34) : this.add.image(-60, y, 'm3-star').setScale(0.6);
      c.add(icon); T(-36, y, name, 16).setOrigin(0, 0.5);
    });
    T(0, 34, `${lv.moves} jogadas`, 13, '#c8ceda');
    // boosters pré-fase
    T(0, 62, 'COMEÇAR COM', 11, '#b8bfd8');
    const chosen = new Set();
    const pre = BOOSTERS.filter(b => b.pre);
    pre.forEach((b, i) => {
      const x = -100 + i * 100, y = 104;
      const r = this.add.rectangle(x, y, 90, 56, 0x2c3766, 1).setStrokeStyle(3, 0xffffff, 0.35).setInteractive(); c.add(r);
      const icon = this.add.image(x, y - 8, b.id === 'rocket' ? 'm3-p0-rh' : b.id === 'bomb' ? 'm3-bomb' : 'm3-color').setScale(0.3); c.add(icon);
      const cnt = T(x + 34, y - 20, String(P.boosterCount(b.id)), 12, '#ffd23e');
      T(x, y + 18, b.name, 9, '#c8ceda');
      r.on('pointerdown', (p) => { p.event.stopPropagation(); sfx.click(); if (chosen.has(b.id)) { chosen.delete(b.id); r.setStrokeStyle(3, 0xffffff, 0.35); return; } if (!P.boosterCount(b.id)) { if (P.buyBooster(b.id)) { sfx.coin(); cnt.setText(String(P.boosterCount(b.id))); this.hooks.updateHUD({ coins: P.coins() }); } else { this._toast(`${b.name}: ${b.cost} moedas`, '#ff8b8b'); return; } } chosen.add(b.id); r.setStrokeStyle(3, 0xffd23e, 1); });
    });
    const lives = P.lives();
    const play = this.add.rectangle(0, 176, 260, 56, lives ? 0x2fb573 : 0x4a5378, 1).setStrokeStyle(3, 0xffffff, 0.5).setInteractive(); c.add(play);
    T(0, 176, lives ? 'JOGAR' : `SEM VIDAS  ·  ${mmss(P.nextLifeIn())}`, lives ? 20 : 14);
    play.on('pointerdown', (p) => {
      p.event.stopPropagation(); sfx.go();
      if (!P.lives()) { if (P.buyLife(150)) { sfx.coin(); this._toast('+1 vida (-150 moedas)', '#8fe66a'); this.hooks.updateHUD({ coins: P.coins(), lives: P.lives() }); } else this._toast('Sem vidas: compre por 150 moedas ou espere', '#ff8b8b'); return; }
      const bo = [...chosen]; for (const id of bo) P.useBooster(id);
      this.hooks.play(n, bo);
    });
    c.setScale(0.8); this.tweens.add({ targets: c, scale: 1, duration: 240, ease: 'Back.out' });
  }

  // ---------------------------------------------------------------- ilha
  _island() {
    const s = P.load();
    this._sky(REGIONS[0], GAME_H);
    const g = this.add.graphics().setDepth(2); this.ui.push(g);
    g.fillStyle(0x2b7fd4, 0.7); g.fillRect(0, 140, GAME_W, GAME_H - 140);
    g.fillStyle(0x3fae70, 1); g.fillEllipse(GAME_W / 2, 480, 420, 520); g.fillStyle(0x8fe66a, 0.5); g.fillEllipse(GAME_W / 2 - 40, 400, 220, 200);
    g.fillStyle(0xffe58a, 1); g.fillEllipse(GAME_W / 2 + 120, 640, 160, 70);
    this._text(GAME_W / 2, 90, 'ILHA DO POMAR', 30, '#ffd23e', { stroke: '#1c2440', strokeThickness: 8 });
    const avail = P.starsAvailable();
    this._text(GAME_W / 2, 124, `★ ${avail} estrelas para construir  ·  ${s.island.built.length}/${ISLAND.length} construídos`, 12, '#fff');
    ISLAND.forEach(b => {
      const x = 60 + b.x * (GAME_W - 120), y = 180 + b.y * 560;
      const built = s.island.built.includes(b.id);
      const img = this.add.image(x, y, 'm3-b-' + b.id + (built ? '' : '-ghost')).setScale(1.3).setDepth(5 + b.y * 10).setInteractive(); this.ui.push(img);
      const lbl = this._text(x, y + 46, built ? b.name : `${b.name}  ★${b.cost}`, 11, built ? '#fff' : avail >= b.cost ? '#ffd23e' : '#c8ceda', { stroke: '#1c2440', strokeThickness: 4 });
      if (!built && avail >= b.cost) this.tweens.add({ targets: img, scale: 1.4, duration: 600, yoyo: true, repeat: -1 });
      img.on('pointerdown', () => {
        if (built) { this._toast(b.name, '#fff'); return; }
        const r = P.islandBuild(b.id);
        if (!r) { sfx.hit(); this._toast(`Precisa de ★${b.cost} (você tem ${P.starsAvailable()})`, '#ff8b8b'); return; }
        sfx.win(); this.tweens.killTweensOf(img);
        img.setTexture('m3-b-' + b.id).setScale(0); this.tweens.add({ targets: img, scale: 1.3, duration: 400, ease: 'Back.out' });
        this._burst(x, y, 0xffd23e, 20); lbl.setText(b.name).setColor('#fff');
        this._toast(`${b.name} construído!  +${b.coins} moedas${r.cardGot ? '  +carta ' + r.cardGot.name : ''}${b.unlocks ? '  ·  Praia do Coco liberada!' : ''}`, '#8fe66a');
        this.hooks.updateHUD({ coins: P.coins() });
        this.time.delayedCall(900, () => this._show('island'));
      });
    });
    this._tuca(GAME_W - 70, GAME_H - 110, 0.8);
    this._back();
  }

  // ---------------------------------------------------------------- diário
  _daily() {
    this._sky(REGIONS[3], GAME_H);
    const c = this.add.container(0, 0).setDepth(5); this.ui.push(c);
    const T = (x, y, s, size, color = '#fff', extra = {}) => { const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', color, fontStyle: 'bold', ...extra }).setOrigin(0.5); c.add(t); return t; };
    const box = (y, h, title) => { const g = this.add.graphics(); g.fillStyle(0x141a33, 0.7); g.fillRoundedRect(14, y, GAME_W - 28, h, 16); c.add(g); T(GAME_W / 2, y + 18, title, 14, '#ffd23e'); };
    const B = (x, y, w, h, label, color, cb, size = 13) => { const r = this.add.rectangle(x, y, w, h, color, 1).setStrokeStyle(2, 0xffffff, 0.5).setInteractive(); const t = T(x, y, label, size); c.add(r); c.moveBelow(r, t); r.on('pointerdown', (p) => { if (this.dragging) return; p.event.stopPropagation(); sfx.click(); cb(); }); return r; };
    let y = 70;
    // login
    const st = P.loginState(); const login = P.load().login;
    box(y, 130, `RECOMPENSA DIÁRIA   🔥 ${login.streak} dia${login.streak === 1 ? '' : 's'}`);
    DAILY_LOGIN.forEach((rw, i) => {
      const x = 44 + i * 65, yy = y + 66;
      const claimed = st.claimable ? i < st.day : i < login.day;
      const isToday = st.claimable && i === st.day;
      const r = this.add.rectangle(x, yy, 56, 60, claimed ? 0x2fb573 : isToday ? 0xd45de0 : 0x2c3766, 1).setStrokeStyle(2, isToday ? 0xffd23e : 0xffffff, isToday ? 1 : 0.3); c.add(r);
      T(x, yy - 18, `DIA ${i + 1}`, 9, '#c8ceda');
      const icon = rw.coins ? this.add.image(x, yy + 4, 'm3-coin').setScale(0.5) : rw.chest ? this.add.image(x, yy + 6, 'm3-chest-' + rw.chest).setScale(0.32) : this.add.image(x, yy + 4, rw.booster === 'rocket' ? 'm3-p0-rh' : 'm3-bomb').setScale(0.24); c.add(icon);
      T(x, yy + 22, rw.coins ? String(rw.coins) : rw.chest ? 'baú' : 'booster', 8, '#fff');
      if (claimed) T(x + 18, yy - 20, '✔', 12, '#8fe66a');
      if (isToday) this.tweens.add({ targets: r, scaleX: 1.06, scaleY: 1.06, duration: 500, yoyo: true, repeat: -1 });
    });
    if (st.claimable) B(GAME_W / 2, y + 112, 160, 28, 'RECEBER', 0x2fb573, () => { const r = P.claimLogin(); if (!r) return; sfx.win(); this._burst(GAME_W / 2, y + 66, 0xffd23e, 20); this._toast(`Dia ${r.day + 1}: ${r.coins ? '+' + r.coins + ' moedas' : r.chest ? CHESTS[r.chest].name : 'booster ' + r.booster}`, '#8fe66a'); this.hooks.updateHUD({ coins: P.coins() }); this.time.delayedCall(700, () => this._show('daily')); });
    else T(GAME_W / 2, y + 112, 'volte amanhã para o próximo dia', 10, '#b8bfd8');
    y += 144;
    // roda
    box(y, 130, 'RODA DA SORTE');
    const wx = 90, wy = y + 76;
    const wheel = this.add.graphics(); c.add(wheel);
    const drawWheel = (ang) => { wheel.clear(); WHEEL.forEach((w, i) => { wheel.fillStyle([0xe8483f, 0xffd23e, 0x3fae70, 0x2b7fd4, 0xd45de0, 0xff8b3d, 0x9fe8ff, 0xff8fc4][i], 1); wheel.slice(wx, wy, 44, ang + i * Math.PI / 4, ang + (i + 1) * Math.PI / 4, false); wheel.fillPath(); }); wheel.fillStyle(0x1c2440, 1); wheel.fillCircle(wx, wy, 8); wheel.fillStyle(0xffffff, 1); wheel.fillTriangle(wx + 40, wy - 8, wx + 40, wy + 8, wx + 52, wy); };
    drawWheel(0);
    T(268, y + 50, WHEEL.map(w => w.coins ? `${w.coins} moedas` : w.lives ? '+1 vida' : w.chest ? 'baú raro' : w.booster).join('  ·  '), 9, '#c8ceda', { wordWrap: { width: 200 }, align: 'center' });
    if (P.wheelAvailable()) B(300, y + 96, 150, 32, 'GIRAR', 0xd45de0, () => {
      const r = P.spinWheel(); if (!r) return;
      const target = Math.PI * 2 * 4 + (Math.PI * 2 - (r.index + 0.5) * Math.PI / 4);
      const obj = { a: 0 }; sfx.slide();
      this.tweens.add({ targets: obj, a: target, duration: 2600, ease: 'Cubic.out', onUpdate: () => drawWheel(obj.a), onComplete: () => { sfx.win(); const w = r.reward; this._toast(`Você ganhou: ${w.coins ? w.coins + ' moedas' : w.lives ? '+1 vida' : w.chest ? CHESTS[w.chest].name : 'booster ' + w.booster}`, '#8fe66a'); this._burst(wx, wy, 0xffd23e, 16); this.hooks.updateHUD({ coins: P.coins(), lives: P.lives() }); this.time.delayedCall(1000, () => this._show('daily')); } });
    });
    else T(300, y + 96, 'volte amanhã para girar', 10, '#b8bfd8');
    y += 144;
    // missões
    const m = P.missions();
    const all = [...m.daily.list.map(x => ({ ...x, kind: 'HOJE' })), ...m.weekly.list.map(x => ({ ...x, kind: 'SEMANA' }))];
    box(y, 30 + all.length * 44, 'MISSÕES');
    all.forEach((x, i) => {
      const yy = y + 48 + i * 44;
      T(28, yy - 8, `${x.kind}  ·  ${x.text.replace('{n}', x.n)}`, 12, x.claimed ? '#8fe66a' : '#fff').setOrigin(0, 0.5);
      const bar = this.add.graphics(); c.add(bar); bar.fillStyle(0x2c3766, 1); bar.fillRoundedRect(28, yy + 4, 260, 10, 5); bar.fillStyle(x.claimed ? 0x3fae70 : 0xffd23e, 1); bar.fillRoundedRect(28, yy + 4, 260 * Math.min(1, x.got / x.n), 10, 5);
      T(300, yy + 9, `${Math.min(x.got, x.n)}/${x.n}`, 10, '#c8ceda').setOrigin(0, 0.5);
      if (x.claimed) T(GAME_W - 60, yy, '✔', 18, '#8fe66a');
      else if (x.got >= x.n) B(GAME_W - 66, yy, 96, 30, 'RECEBER', 0x2fb573, () => { const r = P.claimMission(x.id); if (r) { sfx.coin(); this._toast(`+${r.coins ? r.coins + ' moedas' : CHESTS[r.chest].name}`, '#8fe66a'); this.hooks.updateHUD({ coins: P.coins() }); this._show('daily'); } }, 11);
      else T(GAME_W - 60, yy, x.coins ? `${x.coins} 🪙` : 'baú', 10, '#ffd23e');
    });
    y += 44 + all.length * 44;
    // evento
    const ev = P.eventState();
    box(y, 96, `${EVENT.name.toUpperCase()}  ·  ${ev.daysLeft} dia${ev.daysLeft === 1 ? '' : 's'}`);
    c.add(this.add.image(40, y + 60, 'm3-key').setScale(0.9));
    const eb = this.add.graphics(); c.add(eb); eb.fillStyle(0x2c3766, 1); eb.fillRoundedRect(64, y + 52, 240, 16, 8); eb.fillStyle(0xffd23e, 1); eb.fillRoundedRect(64, y + 52, 240 * Math.min(1, ev.keys / ev.goal), 16, 8);
    T(184, y + 60, `${ev.keys} / ${ev.goal} chaves`, 11, '#1c2440');
    T(184, y + 82, 'cada fase vencida dá 2 a 4 chaves; 20 abrem um baú épico', 9, '#b8bfd8');
    if (ev.canClaim) B(GAME_W - 76, y + 60, 110, 32, 'ABRIR BAÚ', 0x2fb573, () => { P.claimEvent(); sfx.win(); this._toast('Baú épico recebido!', '#8fe66a'); this._show('daily'); }, 12);
    else c.add(this.add.image(GAME_W - 76, y + 60, 'm3-chest-epic').setScale(0.5).setAlpha(0.7));
    y += 110;
    // baús
    const chests = P.load().chests;
    box(y, 120, 'SEUS BAÚS');
    Object.keys(CHESTS).forEach((k, i) => {
      const x = 60 + i * 120, yy = y + 66;
      const img = this.add.image(x, yy, 'm3-chest-' + k).setScale(0.6).setAlpha(chests[k] ? 1 : 0.35).setInteractive(); c.add(img);
      T(x, yy + 34, `${CHESTS[k].name.replace('Baú ', '')}  ×${chests[k]}`, 9, chests[k] ? '#ffd23e' : '#8a90aa');
      if (chests[k]) { this.tweens.add({ targets: img, angle: 4, duration: 300, yoyo: true, repeat: -1 }); img.on('pointerdown', () => { if (this.dragging) return; this._openChest(k); }); }
    });
    y += 134;
    this._scroll(c, y + 40);
    this._back();
  }

  _openChest(kind) {
    const r = P.openChest(kind); if (!r) return;
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x141a33, 0.85).setDepth(85).setInteractive(); this.ui.push(dim);
    const img = this.add.image(GAME_W / 2, GAME_H / 2 - 40, 'm3-chest-' + kind).setScale(1.6).setDepth(86); this.ui.push(img);
    sfx.slide();
    this.tweens.add({ targets: img, angle: -8, duration: 90, yoyo: true, repeat: 5, onComplete: () => {
      sfx.win(); this._burst(img.x, img.y - 30, CHESTS[kind].color, 30); this.tweens.add({ targets: img, scaleY: 1.3, y: img.y + 20, duration: 200, yoyo: true });
      const lines = [`+${r.coins} moedas`, ...r.boosters.map(b => `+1 ${BOOSTERS.find(x => x.id === b).name}`), r.lives ? `+${r.lives} vida${r.lives > 1 ? 's' : ''}` : null, r.card ? `CARTA: ${r.card.name}` : null, r.collectionDone ? 'COLEÇÃO COMPLETA! +baú lendário' : null].filter(Boolean);
      lines.forEach((l, i) => { const t = this._text(GAME_W / 2, GAME_H / 2 + 60 + i * 30, l, 18, i === lines.length - 1 && r.card ? '#ff8fc4' : '#8fe66a').setDepth(87).setAlpha(0); this.tweens.add({ targets: t, alpha: 1, y: t.y - 10, delay: 200 + i * 250, duration: 300 }); });
      this.hooks.updateHUD({ coins: P.coins(), lives: P.lives() });
      this._btn(GAME_W / 2, GAME_H - 120, 200, 48, 'ÓTIMO!', 0x2fb573, () => this._show('daily'), 16, 88);
    } });
  }

  _scroll(c, contentH) {
    const minY = Math.min(0, -(contentH - GAME_H + 20)), maxY = 0;
    let start = null;
    const onDown = (p) => { start = { y: p.y, cy: c.y }; this.dragging = false; };
    const onMove = (p) => { if (!start || !p.isDown) return; const dy = p.y - start.y; if (Math.abs(dy) > 8) this.dragging = true; c.y = Phaser.Math.Clamp(start.cy + dy, minY, maxY); };
    const onUp = () => { start = null; this.time.delayedCall(50, () => { this.dragging = false; }); };
    this.input.on('pointerdown', onDown); this.input.on('pointermove', onMove); this.input.on('pointerup', onUp);
    this._scrollOff = () => { this.input.off('pointerdown', onDown); this.input.off('pointermove', onMove); this.input.off('pointerup', onUp); };
  }

  // ---------------------------------------------------------------- coleção
  _collection() {
    const s = P.load();
    this._sky(REGIONS[1], GAME_H);
    this._text(GAME_W / 2, 90, 'COLEÇÃO POMAR', 30, '#ffd23e', { stroke: '#1c2440', strokeThickness: 8 });
    this._text(GAME_W / 2, 124, `${s.cards.length} / ${COLLECTION.length} cartas  ·  complete e ganhe um baú lendário`, 12, '#fff');
    COLLECTION.forEach((card, i) => {
      const x = 80 + (i % 3) * 160, y = 200 + Math.floor(i / 3) * 150;
      const owned = s.cards.includes(card.id);
      const r = this.add.rectangle(x, y, 130, 126, owned ? 0x2c3766 : 0x1c2440, 1).setStrokeStyle(3, owned ? 0xffd23e : 0x3a4470, 1).setDepth(5); this.ui.push(r);
      if (owned) { const key = card.fruit >= 0 ? 'm3-p' + card.fruit : card.fruit === -1 ? 'm3-tuca' : card.fruit === -2 ? 'm3-b-farol' : card.fruit === -3 ? 'm3-b-moinho' : card.fruit === -4 ? 'm3-b-ponte' : card.fruit === -5 ? 'm3-b-pomar' : 'm3-cloud'; const img = this.add.image(x, y - 16, key).setScale(card.fruit >= 0 ? 0.7 : card.fruit === -1 ? 0.5 : 1.1).setDepth(6); this.ui.push(img); }
      else this._text(x, y - 16, '?', 40, '#3a4470');
      this._text(x, y + 42, owned ? card.name : '???', 11, owned ? '#fff' : '#8a90aa');
    });
    this._back();
  }

  // ---------------------------------------------------------------- perfil
  _profile() {
    const s = P.summary(); const st = s.stats;
    this._sky(REGIONS[2], GAME_H);
    this._text(GAME_W / 2, 90, 'PERFIL', 30, '#ffd23e', { stroke: '#1c2440', strokeThickness: 8 });
    const g = this.add.graphics().setDepth(4); this.ui.push(g);
    g.fillStyle(0x141a33, 0.7); g.fillRoundedRect(24, 130, GAME_W - 48, 120, 16);
    this._text(GAME_W / 2, 156, `NÍVEL ${s.lvl}`, 22, '#fff');
    g.fillStyle(0x2c3766, 1); g.fillRoundedRect(60, 184, GAME_W - 120, 16, 8); g.fillStyle(0xd45de0, 1); g.fillRoundedRect(60, 184, (GAME_W - 120) * Math.min(1, s.xp / s.xpNext), 16, 8);
    this._text(GAME_W / 2, 192, `${s.xp} / ${s.xpNext} XP`, 11, '#fff');
    this._text(GAME_W / 2, 226, 'suba de nível para ganhar moedas, boosters e baús', 10, '#b8bfd8');
    const rows = [['Fases concluídas', s.cleared], ['Fases com 3 estrelas', s.threeStars], ['Estrelas no total', s.stars], ['Combinações', st.matches], ['Maior cascata', 'x' + st.bestCombo], ['Foguetes criados', st.rockets], ['Bombas criadas', st.bombs], ['Bombas de cor', st.colorBombs], ['Especiais usados', st.specials], ['Dias seguidos', s.streak], ['Cartas', `${s.cards}/${COLLECTION.length}`], ['Construções na ilha', `${s.built}/${ISLAND.length}`]];
    g.fillStyle(0x141a33, 0.7); g.fillRoundedRect(24, 268, GAME_W - 48, 30 + rows.length * 30, 16);
    rows.forEach(([k, v], i) => { const y = 292 + i * 30; this._text(44, y, k, 13, '#c8ceda').setOrigin(0, 0.5); this._text(GAME_W - 44, y, String(v), 15, '#fff').setOrigin(1, 0.5); });
    const vy = 300 + rows.length * 30 + 40;
    const vib = P.vibration();
    this._btn(GAME_W / 2, vy, 260, 44, `VIBRAÇÃO: ${vib ? 'LIGADA' : 'DESLIGADA'}`, vib ? 0x2fb573 : 0x4a5378, () => { P.setVibration(!vib); this._show('profile'); }, 14);
    this._text(GAME_W / 2, vy + 40, 'som e música ficam no botão de pausa', 10, '#b8bfd8');
    this._back();
  }
}
