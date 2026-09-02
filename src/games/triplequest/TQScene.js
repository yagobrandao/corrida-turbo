// Triple Quest — cena Phaser: menu, mapa, fase, vitória/derrota, perfil, diário.
//
// Só renderização e toque. A fase vem do gerador (generator.js), o estado
// da partida de match.js e o progresso de progress.js. Tudo é desenhado
// procedural: nada de assets externos.
//
// Layout (portrait 480×854, HUD em DOM cobre ~100px no topo):
//   fase: tabuleiro em y 110..640 · bandeja em y≈690 · boosters em y≈790
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../../core/config.js';
import { sfx } from '../../core/audio.js';
import { TYPE_BY_ID, TILE_TYPES, BOOSTERS, COMBO_LABELS, DAILY, starsFor, levelRewards, chestFor, CHESTS, LIVES_MAX } from './config.js';
import { buildTileTextures, TEX } from './art.js';
import { generateLevel, dailyLevel } from './generator.js';
import { Match } from './match.js';
import * as P from './progress.js';

const FONT = 'Fredoka, sans-serif';
const OUTLINE = 0x1c2440;
const BOARD = { x: 20, y: 108, w: GAME_W - 40, h: 520 };
const TRAY_Y = 690;
const BOOST_Y = 792;

// Orçamento de profundidade (z-order). O bug de "peça que não sai" e de
// peças fantasmas por cima de botões vinha daqui: a profundidade de uma
// peça no tabuleiro somava a camada (0..4) × 40 + a linha (até ~20), o que
// passava de 190 — acima de QUALQUER botão, painel ou peça voando para a
// bandeja. Uma peça em camada alta ficava por cima de tudo, inclusive da
// peça que estava voando por cima dela, dando a impressão de que sumiu ou
// travou. Agora cada faixa tem um teto baixo e as camadas ficam sempre
// abaixo de qualquer coisa em movimento ou UI.
const D = {
  BOARD: 10,      // + camada (0..4) → 10..14; nunca passa da faixa da UI
  UI: 20, TRAY: 26,         // bandeja parada, boosters, textos do topo
  FLYING: 45,     // peça em voo até a bandeja — sempre visível por cima do tabuleiro
  FX: 50,         // brilhos, partículas, anel de dica
  TOAST: 58,
};   // TRAY fica acima dos slots da bandeja (22)

export default class TQScene extends Phaser.Scene {
  constructor() { super('triplequest'); }

  init(data) { this.hooks = data.hooks || {}; }

  create() {
    this.paused = false;
    this.state = 'boot';
    this.match = null;
    this.views = new Map();
    this.ui = [];          // objetos da tela atual (destruídos ao trocar)
    this.overlay = [];     // painéis por cima (vitória, derrota, perfil...)
    this.mapScroll = 0;
    // efeitos soltos (confete, faixa de "nível X", toasts) que se destroem
    // sozinhos com um tween atrasado — se a tela troca antes disso, ficam
    // caindo por cima da tela nova. Rastreados aqui só pra serem mortos
    // junto quando qualquer _show*() troca de tela.
    this.fx = [];
    buildTileTextures(this);
    this._buildUiTextures();
    this._bg();
  }

  begin() { this._showMenu(); }

  // ================================================================
  // infra visual
  // ================================================================
  _bg() {
    // céu em faixas + colinas + nuvens; fica embaixo de tudo, para sempre
    const N = 12, top = [0x1b, 0x22, 0x46], bot = [0x3f, 0x4f, 0xa8];
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1), c = ((top[0] + (bot[0] - top[0]) * k) << 16) | ((top[1] + (bot[1] - top[1]) * k) << 8) | (top[2] + (bot[2] - top[2]) * k);
      this.add.rectangle(GAME_W / 2, (i + 0.5) * GAME_H / N, GAME_W, GAME_H / N + 2, c).setDepth(-10);
    }
    this.add.ellipse(80, GAME_H - 40, 420, 260, 0x2a7a4a).setDepth(-9);
    this.add.ellipse(420, GAME_H - 20, 420, 220, 0x3fae70).setDepth(-9);
    this.add.ellipse(240, GAME_H + 40, 700, 240, 0x8fca5e).setDepth(-8);
    for (const [x, y, s] of [[70, 150, 1], [380, 110, 0.8], [250, 230, 0.6], [440, 300, 0.5]]) {
      const c = this.add.container(x, y, [
        this.add.circle(-18 * s, 0, 14 * s, 0xffffff, 0.18), this.add.circle(0, -8 * s, 18 * s, 0xffffff, 0.18),
        this.add.circle(20 * s, 0, 13 * s, 0xffffff, 0.18), this.add.rectangle(0, 4 * s, 56 * s, 12 * s, 0xffffff, 0.18),
      ]).setDepth(-9);
      this.tweens.add({ targets: c, x: x + 30, duration: 9000 + s * 4000, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
    for (let i = 0; i < 26; i++) {
      const st = this.add.circle(Math.random() * GAME_W, Math.random() * 380, 1 + Math.random() * 1.5, 0xffffff, 0.5).setDepth(-9);
      this.tweens.add({ targets: st, alpha: 0.15, duration: 1200 + Math.random() * 2200, yoyo: true, repeat: -1 });
    }
  }

  _buildUiTextures() {
    if (this.textures.exists('tq-b-undo')) return;
    const g = this.make.graphics({ add: false });
    const W = 0xffffff;
    const done = (k) => { g.generateTexture(k, 40, 40); g.clear(); };
    // desfazer: seta curva
    g.lineStyle(5, W, 1); g.beginPath(); g.arc(22, 20, 10, -Math.PI * 0.9, Math.PI * 0.6); g.strokePath(); g.fillStyle(W, 1); g.fillTriangle(6, 14, 16, 8, 16, 22); done('tq-b-undo');
    // embaralhar: duas setas cruzadas
    g.lineStyle(4, W, 1); g.lineBetween(6, 12, 34, 28); g.lineBetween(6, 28, 34, 12); g.fillStyle(W, 1); g.fillTriangle(34, 28, 26, 30, 32, 20); g.fillTriangle(34, 12, 26, 10, 32, 20); done('tq-b-shuffle');
    // dica: lâmpada
    g.fillStyle(W, 1); g.fillCircle(20, 16, 11); g.fillRect(14, 24, 12, 8); g.fillStyle(0x1c2440, 1); g.fillRect(15, 29, 10, 2); done('tq-b-hint');
    // remover: X grosso
    g.lineStyle(6, W, 1); g.lineBetween(10, 10, 30, 30); g.lineBetween(30, 10, 10, 30); done('tq-b-remove');
    // bandeja +1: bandeja com mais
    g.fillStyle(W, 1); g.fillRoundedRect(6, 22, 28, 10, 4); g.fillRect(18, 6, 4, 14); g.fillRect(13, 11, 14, 4); done('tq-b-tray');
    // coração (vidas), baú, cadeado do mapa
    g.fillStyle(0xff6b9d, 1); g.fillCircle(14, 14, 9); g.fillCircle(26, 14, 9); g.fillTriangle(5, 18, 35, 18, 20, 34); done('tq-ui-heart');
    g.fillStyle(OUTLINE, 1); g.fillRoundedRect(4, 12, 32, 22, 4); g.fillStyle(0xb5773a, 1); g.fillRoundedRect(6, 14, 28, 18, 3); g.fillStyle(0xc9954d, 1); g.fillRoundedRect(6, 8, 28, 10, 4); g.fillStyle(0xffd23e, 1); g.fillRoundedRect(17, 18, 6, 6, 1.5); done('tq-ui-chest');
    g.fillStyle(0x8d93a8, 1); g.fillRoundedRect(10, 18, 20, 16, 3); g.lineStyle(4, 0x8d93a8, 1); g.beginPath(); g.arc(20, 18, 7, Math.PI, 0); g.strokePath(); done('tq-locked');
    g.destroy();
  }

  _text(x, y, txt, size, color = '#fff', style = '700', origin = 0.5) {
    return this.add.text(x, y, txt, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: style, color, align: 'center', stroke: '#1c2440', strokeThickness: size >= 30 ? 6 : 0 }).setOrigin(origin);
  }
  _btn(x, y, w, h, label, color, cb, size = 17, group = this.ui) {
    // botões de painel (overlay) ficam acima dos botões de tela
    const base = group === this.ui ? 40 : 70;
    const sh = this.add.rectangle(x, y + 4, w, h, 0x000000, 0.28).setDepth(base);
    const r = this.add.rectangle(x, y, w, h, color, 1).setStrokeStyle(3, OUTLINE).setDepth(base + 1).setInteractive({ useHandCursor: true });
    const hi = this.add.rectangle(x, y - h / 2 + 7, w - 14, 8, 0xffffff, 0.22).setDepth(base + 2);
    const t = this._text(x, y, label, size).setDepth(base + 3);
    r.on('pointerdown', () => { if (r.getData('off')) return; sfx.click(); this.tweens.add({ targets: [r, t, hi], scaleX: 0.95, scaleY: 0.95, duration: 70, yoyo: true }); cb(); });
    group.push(sh, r, hi, t);
    return { r, t, setOff: (off) => { r.setData('off', off); [r, t, hi].forEach(o => o.setAlpha(off ? 0.45 : 1)); } };
  }
  // Mata qualquer tween em andamento ANTES de destruir — sem isso, um tween
  // com repeat:-1 (a decoração do menu, o pulso da fase atual no mapa...)
  // continua tentando mexer num objeto já destruído, e o Phaser não limpa
  // isso sozinho. Era a causa real das "peças fantasmas" boiando na tela.
  _clear(group) {
    for (const o of group) { this.tweens.killTweensOf(o); o.destroy(); }
    group.length = 0;
  }
  _closeOverlay() { this._clear(this.overlay); }

  _toast(text, color = '#fff', y = 660) {
    const t = this._text(GAME_W / 2, y, text, 16, color).setDepth(90);
    t.setStyle({ backgroundColor: '#1c2440', padding: { x: 12, y: 6 } });
    this.fx.push(t);
    this.tweens.add({ targets: t, y: y - 18, alpha: 0, delay: 900, duration: 500, onComplete: () => { t.destroy(); const i = this.fx.indexOf(t); if (i >= 0) this.fx.splice(i, 1); } });
  }
  _hud(title, sub = '') {
    if (!this.hooks.updateHUD) return;
    const s = P.summary();
    this.hooks.updateHUD({ title, sub, coins: s.coins.toLocaleString('pt-BR'), lives: s.lives, livesMax: s.livesMax });
  }
  _sparks(x, y, color, n = 8, spd = 70, tex = 'tq-fx-dot') {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const d = this.add.image(x, y, tex).setTint(color).setScale(0.5 + Math.random() * 0.6).setDepth(80);
      this.tweens.add({ targets: d, x: x + Math.cos(a) * spd, y: y + Math.sin(a) * spd - 20, alpha: 0, scale: 0.1, angle: 180, duration: 500, onComplete: () => d.destroy() });
    }
  }
  _confetti(n = 40) {
    const colors = [0xe8483f, 0xffd23e, 0x3ddad7, 0x8fe66a, 0xff8fc4, 0x9b59d0];
    for (let i = 0; i < n; i++) {
      const p = this.add.rectangle(Math.random() * GAME_W, -20 - Math.random() * 200, 8, 12, colors[i % colors.length]).setDepth(95).setAngle(Math.random() * 360);
      this.fx.push(p);
      this.tweens.add({ targets: p, y: GAME_H + 40, x: p.x + (Math.random() * 120 - 60), angle: p.angle + 540, duration: 1800 + Math.random() * 1400, ease: 'quad.in', onComplete: () => { p.destroy(); const i2 = this.fx.indexOf(p); if (i2 >= 0) this.fx.splice(i2, 1); } });
    }
  }

  // ================================================================
  // MENU
  // ================================================================
  _showMenu() {
    this._clear(this.fx); this._clear(this.ui); this._closeOverlay(); this._clearBoard();
    this.state = 'menu';
    const s = P.summary();
    this._hud('Triple Quest');
    // peças decorativas flutuando
    const deco = ['star', 'gift', 'icecream', 'crystal', 'apple', 'rocket', 'heart', 'cupcake'];
    deco.forEach((id, i) => {
      const x = 40 + (i % 4) * 130 + (i > 3 ? 40 : 0), y = 150 + Math.floor(i / 4) * 460 + (i % 2) * 40;
      const im = this.add.image(x, y, 'tq-' + id).setScale(0.9).setAngle(-12 + i * 5).setAlpha(0.95);
      this.ui.push(im);
      this.tweens.add({ targets: im, y: y - 14, angle: im.angle + 6, duration: 2200 + i * 300, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    });
    this.ui.push(this._text(GAME_W / 2, 250, 'TRIPLE', 64, '#ffd23e').setDepth(5));
    this.ui.push(this._text(GAME_W / 2, 316, 'QUEST', 64, '#ff8fc4').setDepth(5));
    this.ui.push(this._text(GAME_W / 2, 366, 'junte três iguais', 18, '#dfe6ff', '600').setDepth(5));
    const lv = s.level;
    this._btn(GAME_W / 2, 450, 300, 66, `JOGAR  ·  FASE ${lv}`, 0x2fb573, () => this._startLevel(lv), 22);
    this._btn(GAME_W / 2, 528, 300, 56, 'MAPA', 0x2b7fd4, () => this._showMap(), 19);
    this._btn(GAME_W / 2, 596, 300, 56, 'PERFIL', 0x9b59d0, () => this._showProfile(), 19);
    const d = P.dailyState();
    this._btn(GAME_W / 2, 664, 300, 56, d.done ? 'DESAFIO DO DIA  ✓' : 'DESAFIO DO DIA', d.done ? 0x4a5378 : 0xff8b3d, () => this._startDaily(), 19);
    // vidas
    for (let i = 0; i < LIVES_MAX; i++) this.ui.push(this.add.image(GAME_W / 2 - 60 + i * 30, 730, 'tq-ui-heart').setScale(0.7).setAlpha(i < s.lives ? 1 : 0.25).setDepth(5));
    const wait = P.nextLifeIn();
    this.ui.push(this._text(GAME_W / 2, 760, s.lives >= LIVES_MAX ? 'vidas cheias' : `próxima vida em ${Math.ceil(wait / 60000)} min`, 13, '#b8bfd8', '600').setDepth(5));
  }

  // ================================================================
  // MAPA
  // ================================================================
  _showMap() {
    this._clear(this.fx); this._clear(this.ui); this._closeOverlay(); this._clearBoard();
    this.state = 'map';
    const s = P.summary();
    this._hud('Mapa', `fase ${s.level}`);
    const total = s.level + 24;
    const STEP = 92;
    const yOf = (n) => 700 - (n - 1) * STEP;             // fase 1 embaixo
    const xOf = (n) => GAME_W / 2 + Math.sin(n * 0.9) * 120;
    const world = this.add.container(0, 0);
    this.ui.push(world);
    // decoração: árvores e arbustos ao longo
    for (let n = 1; n <= total; n++) {
      const y = yOf(n);
      for (const side of [-1, 1]) {
        if ((n * 3 + side) % 4 !== 0) continue;
        const x = GAME_W / 2 + side * (200 + (n % 3) * 12);
        const tree = this.add.container(x, y + 20, [
          this.add.rectangle(0, 14, 8, 22, 0x6b4a2e), this.add.triangle(0, -6, 0, 0, 30, 40, 60, 0, 0x2f8f5b).setOrigin(0.5, 0.6),
          this.add.triangle(0, -20, 0, 0, 24, 32, 48, 0, 0x3fae70).setOrigin(0.5, 0.6),
        ]);
        world.add(tree);
      }
    }
    // caminho pontilhado
    for (let n = 1; n < total; n++) {
      const x1 = xOf(n), y1 = yOf(n), x2 = xOf(n + 1), y2 = yOf(n + 1);
      for (let k = 1; k < 5; k++) {
        const t = k / 5;
        world.add(this.add.circle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 4, 0xffffff, n < s.level ? 0.7 : 0.25));
      }
    }
    // nós
    for (let n = 1; n <= total; n++) {
      const x = xOf(n), y = yOf(n);
      const done = n < s.level, cur = n === s.level;
      const color = done ? 0x2fb573 : cur ? 0xffd23e : 0x4a5378;
      const node = this.add.container(x, y);
      node.add(this.add.circle(0, 5, 27, 0x000000, 0.3));
      const disc = this.add.circle(0, 0, 27, color).setStrokeStyle(4, OUTLINE);
      node.add(disc);
      node.add(this._text(0, 0, String(n), 20, done || cur ? '#1c2440' : '#b8bfd8'));
      if (done) {
        const st = s.stars[n] || 1;
        for (let i = 0; i < 3; i++) node.add(this.add.image(-16 + i * 16, 32, 'tq-fx-star').setScale(0.7).setAlpha(i < st ? 1 : 0.25));
      } else if (!cur) node.add(this.add.image(24, -24, 'tq-locked').setScale(0.6));
      if (chestFor(n) && !done) node.add(this.add.image(-30, -24, 'tq-ui-chest').setScale(0.8));
      // `disc` é filho de `world` (que está em this.ui), mas o tween aponta
      // pra ele diretamente — sem estar em this.ui também, _clear() não
      // mataria esse tween em loop ao sair do mapa
      if (cur) { this.tweens.add({ targets: disc, scaleX: 1.12, scaleY: 1.12, duration: 600, yoyo: true, repeat: -1, ease: 'sine.inOut' }); this.ui.push(disc); }
      if (done || cur) {
        disc.setInteractive({ useHandCursor: true });
        disc.on('pointerup', (p) => { if (Math.abs(p.downY - p.upY) < 10) { sfx.click(); this._startLevel(n); } });
      }
      world.add(node);
    }
    // troféu no topo
    world.add(this._text(xOf(total + 1), yOf(total + 1), '...', 30, '#ffd23e'));
    // rolagem: arrasto vertical
    // as fases sobem (y diminui): world.y = 0 mostra a fase 1 embaixo, e o
    // máximo traz a última fase gerada para perto do topo
    const minY = 0, maxY = Math.max(0, 140 - yOf(total));
    world.y = Phaser.Math.Clamp(430 - yOf(s.level), minY, maxY);
    if (this._mapMove) this.input.off('pointermove', this._mapMove);
    this._mapMove = (p) => {
      if (this.state !== 'map' || !p.isDown) return;
      world.y = Phaser.Math.Clamp(world.y + (p.y - p.prevPosition.y), minY, maxY);
    };
    this.input.on('pointermove', this._mapMove);
    // painel fixo com botão
    const fixed = [];
    this._btn(GAME_W / 2, GAME_H - 46, 220, 52, 'MENU', 0x453a82, () => this._showMenu(), 17, fixed);
    fixed.forEach(o => o.setScrollFactor(0));
    this.ui.push(...fixed);
  }

  // ================================================================
  // PERFIL
  // ================================================================
  _showProfile() {
    const s = P.summary();
    this._openPanel(430, (top, G) => {
      G.push(this._text(GAME_W / 2, top + 30, 'SEU PERFIL', 24, '#ffd23e').setDepth(72));
      G.push(this._text(GAME_W / 2, top + 66, `NÍVEL ${s.lvl}`, 20).setDepth(72));
      const pct = s.xp / s.xpNext;
      G.push(this.add.rectangle(GAME_W / 2, top + 92, 300, 14, 0x151233).setDepth(72));
      G.push(this.add.rectangle(GAME_W / 2 - 150 + 150 * pct, top + 92, 300 * pct, 14, 0x3ddad7).setDepth(73));
      G.push(this._text(GAME_W / 2, top + 112, `${s.xp} / ${s.xpNext} XP`, 12, '#b8bfd8', '600').setDepth(72));
      const rows = [
        ['Fases concluídas', s.cleared], ['Estrelas', Object.values(s.stars).reduce((a, b) => a + b, 0)],
        ['Fases com 3 estrelas', s.threeStars], ['Moedas', s.coins.toLocaleString('pt-BR')],
        ['Melhor combo', s.bestCombo ? `x${s.bestCombo}` : '—'], ['Trios formados', s.triples],
      ];
      rows.forEach(([k, v], i) => {
        const y = top + 142 + i * 34;
        G.push(this._text(40, y, k, 15, '#b8bfd8', '600').setOrigin(0, 0.5).setDepth(72));
        G.push(this._text(GAME_W - 40, y, String(v), 16, '#fff', '700').setOrigin(1, 0.5).setDepth(72));
      });
      G.push(this._text(GAME_W / 2, top + 352, 'Conquistas e missões ficam em DESAFIOS, na Central.', 12, '#7f86a8', '600').setDepth(72));
      this._btn(GAME_W / 2, top + 395, 220, 48, 'FECHAR', 0x453a82, () => this._closeOverlay(), 16, G);
    });
  }

  _openPanel(h, fill) {
    this._closeOverlay();
    const G = this.overlay;
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.55).setDepth(64).setInteractive();
    G.push(dim);
    const y = GAME_H / 2, top = y - h / 2;
    G.push(this.add.rectangle(GAME_W / 2, y + 6, GAME_W - 40, h, 0x000000, 0.35).setDepth(65));
    G.push(this.add.rectangle(GAME_W / 2, y, GAME_W - 40, h, 0x2a2358, 1).setStrokeStyle(3, 0x453a82).setDepth(66));
    fill(top, G);
    return top;
  }

  // ================================================================
  // FASE
  // ================================================================
  _startLevel(n) {
    if (P.lives() <= 0) { this._toast(`Sem vidas — próxima em ${Math.ceil(P.nextLifeIn() / 60000)} min`, '#ff6b5e', 720); return; }
    this._play(generateLevel(n), { kind: 'level', n });
  }
  _startDaily() {
    const d = P.dailyState();
    if (d.done) { this._toast('Você já venceu o desafio de hoje. Volte amanhã!', '#ffd23e', 720); return; }
    if (P.lives() <= 0) { this._toast('Sem vidas', '#ff6b5e', 720); return; }
    this._play(dailyLevel(P.todayKey(), DAILY.movesBuffer), { kind: 'daily' });
  }

  _play(level, meta) {
    this._clear(this.fx); this._clear(this.ui); this._closeOverlay(); this._clearBoard();
    this.state = 'play';
    this.meta = meta;
    this.level = level;
    this.match = new Match(level);
    this.busy = false;
    this._hud(meta.kind === 'daily' ? 'Desafio do dia' : `Fase ${meta.n}`, meta.kind === 'daily' ? `${level.moves} jogadas` : level.shape);

    // escala para caber no tabuleiro
    const xs = level.tiles.map(t => t.gx), ys = level.tiles.map(t => t.gy);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const wU = maxX - minX + 2, hU = maxY - minY + 2;     // em meias peças
    this.T = Math.min(66, (BOARD.w / wU) * 2, (BOARD.h / hU) * 2);
    this.ox = BOARD.x + (BOARD.w - wU * this.T / 2) / 2 - minX * this.T / 2 + this.T / 2;
    this.oy = BOARD.y + (BOARD.h - hU * this.T / 2) / 2 - minY * this.T / 2 + this.T / 2;

    // faixa de topo: fase e botão de voltar
    this._btn(GAME_W - 58, 92, 92, 34, 'MAPA', 0x453a82, () => this._leaveLevel(), 13);
    this.movesText = this._text(GAME_W / 2, 92, '', 15, '#ffd23e').setDepth(5); this.ui.push(this.movesText);
    this.leftText = this._text(58, 92, '', 13, '#b8bfd8', '600').setDepth(5); this.ui.push(this.leftText);

    for (const t of this.match.tiles) this._makeTile(t);
    this._buildTray();
    this._buildBoosters();
    this._refreshBoard();
    // entrada animada
    let i = 0;
    for (const v of this.views.values()) { v.setScale(0); this.tweens.add({ targets: v, scale: 1, duration: 260, delay: (i++ % 24) * 14, ease: 'back.out' }); }
  }

  _leaveLevel() {
    if (this.state !== 'play') return;
    this._showMap();
  }

  _tileXY(t) { return { x: this.ox + t.gx * this.T / 2, y: this.oy + t.gy * this.T / 2 }; }

  _makeTile(t) {
    const { x, y } = this._tileXY(t);
    const scale = this.T / TEX;
    const im = this.add.image(0, 0, 'tq-' + t.type);
    const dim = this.add.image(0, 0, 'tq-dim').setVisible(false);
    const ice = this.add.image(0, 0, 'tq-ice').setVisible(false);
    const lock = this.add.image(0, 0, 'tq-lock').setVisible(false);
    const lockKey = this.add.image(10, 10, 'tq-fx-star').setScale(0.4).setVisible(false);
    const c = this.add.container(x, y, [im, dim, ice, lock, lockKey]).setScale(scale);
    c.setSize(TEX - 6, TEX - 6);
    c.setDepth(D.BOARD + t.layer);
    Object.assign(c, { tile: t, im, dim, ice, lock, lockKey, baseScale: scale });
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => this._tap(t));
    this.views.set(t.id, c);
    return c;
  }

  _clearBoard() {
    // uma peça pode estar no meio do voo até a bandeja (tween pendente) —
    // mata o tween antes de destruir, senão ele sobrevive apontando para
    // um objeto morto
    for (const v of this.views.values()) { this.tweens.killTweensOf(v); v.destroy(); }
    this.views.clear();
    if (this.trayUI) { this._clear(this.trayUI); this.trayUI = null; }
    if (this.boostUI) { this._clear(this.boostUI); this.boostUI = null; }
    this.match = null;
  }

  // estado visual de cada peça: livre, tampada, gelo, cadeado
  _refreshBoard() {
    const m = this.match;
    for (const t of m.tiles) {
      const v = this.views.get(t.id);
      if (!v || !t.alive) continue;
      const free = m.isFree(t);
      v.im.setTexture('tq-' + t.type);
      v.dim.setVisible(!free && !t.frozen && !t.locked);
      v.ice.setVisible(t.frozen > 0);
      v.lock.setVisible(!!t.locked);
      if (t.locked) v.lockKey.setVisible(true).setTexture('tq-' + t.locked).setScale(0.32).setPosition(14, 14); else v.lockKey.setVisible(false);
      v.setAlpha(free ? 1 : 0.92);
    }
    const left = m.remaining();
    this.leftText.setText(`${left} peça${left === 1 ? '' : 's'}`);
    this.movesText.setText(m.movesLeft !== null ? `${m.movesLeft} jogadas` : (m.combo >= 2 ? `combo x${m.combo}` : ''));
  }

  // ---------------------------------------------------------------- bandeja
  _buildTray() {
    this.trayUI = this.trayUI || [];
    this._clear(this.trayUI);
    const n = this.match.traySize;
    const slot = Math.min(56, (GAME_W - 60) / n);
    this.slotW = slot;
    const w = slot * n + 16;
    this.trayUI.push(this.add.rectangle(GAME_W / 2, TRAY_Y + 6, w, 76, 0x000000, 0.3).setDepth(20));
    this.trayUI.push(this.add.rectangle(GAME_W / 2, TRAY_Y, w, 76, 0x2a2358, 1).setStrokeStyle(3, 0x453a82).setDepth(21));
    for (let i = 0; i < n; i++) {
      this.trayUI.push(this.add.rectangle(this._slotX(i), TRAY_Y, slot - 6, 60, 0x151233, 1).setStrokeStyle(2, 0x3a3170).setDepth(22));
    }
  }
  _slotX(i) { const n = this.match.traySize; return GAME_W / 2 - (n - 1) * this.slotW / 2 + i * this.slotW; }

  _layoutTray(animate = true) {
    const m = this.match;
    const scale = (this.slotW - 10) / TEX;
    m.tray.forEach((x, i) => {
      const v = this.views.get(x.id);
      if (!v) return;
      v.setDepth(D.TRAY);
      if (animate) this.tweens.add({ targets: v, x: this._slotX(i), y: TRAY_Y, scale, duration: 180, ease: 'quad.out' });
      else v.setPosition(this._slotX(i), TRAY_Y).setScale(scale);
    });
  }

  // ---------------------------------------------------------------- toque
  _tap(t) {
    if (this.state !== 'play' || this.busy || this.paused) return;
    const m = this.match;
    if (!t.alive) return;
    if (!m.isFree(t)) {
      const v = this.views.get(t.id);
      this.tweens.add({ targets: v, x: v.x + 4, duration: 40, yoyo: true, repeat: 2 });
      if (t.frozen) this._toast('Congelada: forme trios para derreter', '#9fe8ff');
      else if (t.locked) this._toast(`Trancada: forme um trio de ${TYPE_BY_ID[t.locked].name}`, '#ffd23e');
      return;
    }
    const res = m.pick(t.id, this.time.now / 1000);
    if (!res.ok) return;
    sfx.click();
    const v = this.views.get(t.id);
    v.disableInteractive();
    v.setDepth(D.FLYING);
    // levanta, cresce e voa para a bandeja
    this.tweens.add({ targets: v, y: v.y - 14, scale: v.baseScale * 1.15, duration: 90, yoyo: false, onComplete: () => {
      this._layoutTray(true);
      this.tweens.add({ targets: v, x: this._slotX(res.at), y: TRAY_Y, scale: (this.slotW - 10) / TEX, duration: 220, ease: 'quad.inOut', onComplete: () => {
        v.setDepth(D.TRAY);
        if (res.cleared.length) this._fxTriple(res);
        else this._afterMove();
      } });
    } });
    this._refreshBoard();
    if (this.hintRing) { this.hintRing.destroy(); this.hintRing = null; }
  }

  _fxTriple(res) {
    this.busy = true;
    const views = res.cleared.map(id => this.views.get(id)).filter(Boolean);
    const cx = views.reduce((s, v) => s + v.x, 0) / views.length;
    sfx.powerup();
    for (const v of views) {
      v.setDepth(D.FLYING);
      this.tweens.add({ targets: v, scale: v.scale * 1.35, duration: 110, yoyo: true });
      this.tweens.add({ targets: v, alpha: 0, scale: 0.1, x: cx, delay: 170, duration: 220, ease: 'back.in', onComplete: () => { v.destroy(); this.views.delete(v.tile.id); } });
    }
    this.time.delayedCall(180, () => {
      const type = TYPE_BY_ID[views[0].tile.type];
      this._sparks(cx, TRAY_Y, type.c, 10, 80);
      this._sparks(cx, TRAY_Y, 0xffd23e, 6, 60, 'tq-fx-star');
    });
    const combo = res.combo || 1;
    if (combo >= 2) {
      const label = COMBO_LABELS[Math.min(combo, COMBO_LABELS.length - 1)] + (combo >= 5 ? ` x${combo}` : '');
      const t = this._text(GAME_W / 2, 600, label, 34, ['#ffd23e', '#ff8fc4', '#3ddad7', '#8fe66a'][combo % 4]).setDepth(85).setScale(0.4);
      this.fx.push(t);
      this.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'back.out' });
      this.tweens.add({ targets: t, y: 560, alpha: 0, delay: 500, duration: 500, onComplete: () => { t.destroy(); const i = this.fx.indexOf(t); if (i >= 0) this.fx.splice(i, 1); } });
      sfx.coin();
    }
    this.time.delayedCall(420, () => { this.busy = false; this._layoutTray(true); this._afterMove(); });
  }

  _afterMove() {
    if (!this.match) return;
    this._refreshBoard();
    if (this.match.over === 'won') this._win();
    else if (this.match.over === 'lost') this._lose();
  }

  // ---------------------------------------------------------------- boosters
  _buildBoosters() {
    this.boostUI = this.boostUI || [];
    this._clear(this.boostUI);
    const s = P.summary();
    const n = BOOSTERS.length, w = 78;
    this.boostBtns = {};
    BOOSTERS.forEach((b, i) => {
      const x = GAME_W / 2 - (n - 1) * w / 2 + i * w, y = BOOST_Y;
      const count = s.boosters[b.id] || 0;
      const sh = this.add.rectangle(x, y + 4, 62, 62, 0x000000, 0.3).setDepth(20);
      const bg = this.add.rectangle(x, y, 62, 62, count > 0 ? 0x2b7fd4 : 0x4a5378, 1).setStrokeStyle(3, OUTLINE).setDepth(21).setInteractive({ useHandCursor: true });
      const ic = this.add.image(x, y - 4, 'tq-b-' + b.id).setScale(0.85).setDepth(22);
      const badge = this.add.circle(x + 24, y - 24, 12, count > 0 ? 0xffd23e : 0xe8483f).setStrokeStyle(2, OUTLINE).setDepth(23);
      const num = this._text(x + 24, y - 24, count > 0 ? String(count) : '+', 13, '#1c2440').setDepth(24);
      const name = this._text(x, y + 22, b.name, 9, '#dfe6ff', '600').setDepth(22);
      bg.on('pointerdown', () => this._useBooster(b));
      this.boostUI.push(sh, bg, ic, badge, num, name);
      this.boostBtns[b.id] = { bg, badge, num };
    });
  }
  _refreshBoosters() {
    const s = P.summary();
    for (const b of BOOSTERS) {
      const c = s.boosters[b.id] || 0, u = this.boostBtns[b.id];
      if (!u) continue;
      u.bg.setFillStyle(c > 0 ? 0x2b7fd4 : 0x4a5378, 1); u.badge.setFillStyle(c > 0 ? 0xffd23e : 0xe8483f, 1); u.num.setText(c > 0 ? String(c) : '+');
    }
  }

  _useBooster(b) {
    if (this.state !== 'play' || this.busy) return;
    const s = P.summary();
    if ((s.boosters[b.id] || 0) <= 0) { this._offerBooster(b); return; }
    if (!this._applyBooster(b.id)) return;
    P.useBooster(b.id);
    sfx.jump();
    this._refreshBoosters();
    this._hud(this.meta.kind === 'daily' ? 'Desafio do dia' : `Fase ${this.meta.n}`);
  }

  _offerBooster(b) {
    this._openPanel(230, (top, G) => {
      G.push(this.add.image(GAME_W / 2, top + 44, 'tq-b-' + b.id).setDepth(72));
      G.push(this._text(GAME_W / 2, top + 84, b.name.toUpperCase(), 20, '#ffd23e').setDepth(72));
      G.push(this._text(GAME_W / 2, top + 112, b.desc, 13, '#b8bfd8', '600').setDepth(72));
      const can = P.coins() >= b.cost;
      const btn = this._btn(GAME_W / 2 - 70, top + 178, 170, 48, `COMPRAR  ${b.cost}`, can ? 0x2fb573 : 0x4a5378, () => {
        if (!P.buyBooster(b.id)) { this._toast('Moedas insuficientes', '#ff6b5e'); return; }
        sfx.coin(); this._closeOverlay(); this._refreshBoosters(); this._hud(`Fase ${this.meta.n}`); this._useBooster(b);
      }, 15, G);
      btn.setOff(!can);
      G.push(this.add.circle(GAME_W / 2 - 24, top + 178, 6, 0xffd23e).setStrokeStyle(1.5, 0xb8860b).setDepth(74));
      this._btn(GAME_W / 2 + 110, top + 178, 130, 48, 'FECHAR', 0x453a82, () => this._closeOverlay(), 15, G);
    });
  }

  _applyBooster(id) {
    const m = this.match;
    switch (id) {
      case 'undo': {
        const t = m.undo();
        if (!t) { this._toast('Nada para desfazer'); return false; }
        const v = this.views.get(t.id);
        const { x, y } = this._tileXY(t);
        this.tweens.add({ targets: v, x, y, scale: v.baseScale, duration: 240, ease: 'quad.inOut', onComplete: () => { v.setDepth(D.BOARD + t.layer); v.setInteractive({ useHandCursor: true }); this._refreshBoard(); } });
        this._layoutTray(true);
        return true;
      }
      case 'shuffle': {
        m.shuffle();
        for (const t of m.alive()) {
          const v = this.views.get(t.id);
          this.tweens.add({ targets: v, scale: 0, angle: 180, duration: 160, yoyo: true, onYoyo: () => v.im.setTexture('tq-' + t.type), onComplete: () => v.setAngle(0) });
        }
        this.time.delayedCall(340, () => this._afterMove());
        return true;
      }
      case 'hint': {
        const t = m.hint();
        if (!t) { this._toast('Nenhuma peça livre'); return false; }
        const v = this.views.get(t.id);
        if (this.hintRing) this.hintRing.destroy();
        this.hintRing = this.add.rectangle(v.x, v.y, this.T + 8, this.T + 8, 0xffd23e, 0).setStrokeStyle(4, 0xffd23e).setDepth(50);
        this.tweens.add({ targets: this.hintRing, scaleX: 1.12, scaleY: 1.12, alpha: 0.4, duration: 400, yoyo: true, repeat: 4, onComplete: () => { if (this.hintRing) { this.hintRing.destroy(); this.hintRing = null; } } });
        return true;
      }
      case 'remove': {
        const gone = m.remove();
        if (!gone) { this._toast('Não há trio inteiro no tabuleiro'); return false; }
        for (const t of gone) {
          const v = this.views.get(t.id);
          this._sparks(v.x, v.y, TYPE_BY_ID[t.type].c, 6, 40);
          this.tweens.add({ targets: v, scale: 0, alpha: 0, duration: 220, onComplete: () => { v.destroy(); this.views.delete(t.id); } });
        }
        this.time.delayedCall(260, () => this._afterMove());
        return true;
      }
      case 'tray': {
        m.extraTray();
        this._buildTray();
        this._layoutTray(true);
        this._toast('Bandeja +1 nesta fase', '#3ddad7');
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- fim de fase
  _win() {
    this.state = 'won';
    this.busy = false;
    // toques rápidos em sequência perto do fim podem fechar vários trios
    // quase juntos: o match já está "ganho" (dado é síncrono) antes de
    // TODAS as animações de voo terminarem. Sem isso, a peça que ainda
    // estava no ar ficava presa — visível, com o tween nunca completando,
    // porque a partida seguia em frente sem ela.
    for (const v of this.views.values()) { this.tweens.killTweensOf(v); v.destroy(); }
    this.views.clear();
    const m = this.match, meta = this.meta;
    sfx.win();
    this._confetti(46);
    if (meta.kind === 'daily') {
      P.completeDaily(m.moves);
      P.earnCoins(DAILY.coins); P.grantBooster(DAILY.booster);
      if (this.hooks.onLevelDone) this.hooks.onLevelDone({ stars: 3, bestCombo: m.bestCombo, triples: m.triples, coins: DAILY.coins });
      this._openPanel(300, (top, G) => {
        G.push(this._text(GAME_W / 2, top + 40, 'DESAFIO VENCIDO!', 26, '#ffd23e').setDepth(72));
        G.push(this._text(GAME_W / 2, top + 84, `${m.moves} jogadas`, 16, '#b8bfd8', '600').setDepth(72));
        G.push(this._text(GAME_W / 2, top + 130, `+${DAILY.coins} moedas  ·  +1 ${BOOSTERS.find(b => b.id === DAILY.booster).name}`, 17, '#fff').setDepth(72));
        G.push(this._text(GAME_W / 2, top + 170, 'Amanhã tem outro.', 13, '#7f86a8', '600').setDepth(72));
        this._btn(GAME_W / 2, top + 240, 240, 54, 'MENU', 0x2fb573, () => this._showMenu(), 18, G);
      });
      this._hud('Desafio do dia');
      return;
    }
    const stars = starsFor(m.maxTray, this.level.traySize, m.boostersUsed);
    const rewards = levelRewards(meta.n, stars, m.bestCombo);
    const r = P.completeLevel(meta.n, stars, rewards, m.bestCombo, m.triples);
    const chest = chestFor(meta.n) ? P.openChest(chestFor(meta.n)) : null;
    if (this.hooks.onLevelDone) this.hooks.onLevelDone({ stars, bestCombo: m.bestCombo, triples: m.triples, coins: rewards.coins + (chest ? chest.coins : 0) });
    this._hud(`Fase ${meta.n}`);

    this._openPanel(chest ? 470 : 400, (top, G) => {
      G.push(this._text(GAME_W / 2, top + 40, 'FASE CONCLUÍDA!', 28, '#ffd23e').setDepth(72));
      for (let i = 0; i < 3; i++) {
        const st = this.add.image(GAME_W / 2 - 60 + i * 60, top + 100, 'tq-fx-star').setScale(0).setAlpha(i < stars ? 1 : 0.22).setDepth(73);
        G.push(st);
        this.tweens.add({ targets: st, scale: i < stars ? 2.4 : 2, delay: 250 + i * 220, duration: 320, ease: 'back.out', onStart: () => { if (i < stars) sfx.coin(); } });
      }
      const lines = [[`+${rewards.coins} moedas`, '#ffd23e'], [`+${rewards.xp} XP`, '#3ddad7']];
      if (m.bestCombo >= 2) lines.push([`melhor combo x${m.bestCombo}`, '#ff8fc4']);
      lines.forEach(([txt, c], i) => G.push(this._text(GAME_W / 2, top + 150 + i * 28, txt, 17, c).setDepth(72)));
      let y = top + 150 + lines.length * 28 + 10;
      if (chest) {
        G.push(this.add.image(GAME_W / 2 - 100, y + 14, 'tq-ui-chest').setScale(1.3).setDepth(72));
        G.push(this._text(GAME_W / 2 + 20, y + 4, chest.name.toUpperCase(), 15, '#ffd23e').setDepth(72));
        G.push(this._text(GAME_W / 2 + 20, y + 26, `+${chest.coins} moedas · ${chest.got.map(id => BOOSTERS.find(b => b.id === id).name).join(', ')}${chest.lives ? ' · +1 vida' : ''}`, 11, '#b8bfd8', '600').setDepth(72));
        y += 60;
      }
      this._btn(GAME_W / 2, top + (chest ? 400 : 330), 260, 56, `PRÓXIMA  ·  FASE ${meta.n + 1}`, 0x2fb573, () => this._startLevel(meta.n + 1), 18, G);
      this._btn(GAME_W / 2, top + (chest ? 400 : 330) + 62, 200, 44, 'MAPA', 0x453a82, () => this._showMap(), 15, G);
    });
    if (r.levelUps.length) this.time.delayedCall(900, () => this._fxLevelUp(r.levelUps[r.levelUps.length - 1]));
  }

  _fxLevelUp(lvl) {
    P.earnCoins(100); P.grantBooster('hint');
    this._confetti(30);
    sfx.win();
    const t = this._text(GAME_W / 2, 200, `NÍVEL ${lvl}!`, 44, '#ffd23e').setDepth(96).setScale(0.3);
    const s = this._text(GAME_W / 2, 250, '+100 moedas · +1 Dica', 16, '#fff').setDepth(96).setAlpha(0);
    this.fx.push(t, s);
    this.tweens.add({ targets: t, scale: 1, duration: 400, ease: 'back.out' });
    this.tweens.add({ targets: s, alpha: 1, delay: 300, duration: 300 });
    this.tweens.add({ targets: [t, s], alpha: 0, delay: 2200, duration: 500, onComplete: () => { t.destroy(); s.destroy(); this.fx = this.fx.filter(o => o !== t && o !== s); } });
    this._hud(this.meta.kind === 'daily' ? 'Desafio do dia' : `Fase ${this.meta.n}`);
  }

  _lose() {
    this.state = 'lost';
    this.busy = false;
    for (const v of this.views.values()) { this.tweens.killTweensOf(v); v.destroy(); }
    this.views.clear();
    const m = this.match;
    sfx.lose();
    const lives = P.loseLife();
    this._hud(this.meta.kind === 'daily' ? 'Desafio do dia' : `Fase ${this.meta.n}`);
    const why = m.movesLeft === 0 ? 'ACABARAM AS JOGADAS' : m.tray.length >= m.traySize ? 'BANDEJA CHEIA!' : 'SEM PEÇAS LIVRES';
    this._openPanel(300, (top, G) => {
      G.push(this._text(GAME_W / 2, top + 40, why, 24, '#ff6b5e').setDepth(72));
      G.push(this._text(GAME_W / 2, top + 84, `${m.remaining()} peças sobraram`, 15, '#b8bfd8', '600').setDepth(72));
      for (let i = 0; i < LIVES_MAX; i++) G.push(this.add.image(GAME_W / 2 - 60 + i * 30, top + 128, 'tq-ui-heart').setScale(0.7).setAlpha(i < lives ? 1 : 0.25).setDepth(72));
      G.push(this._text(GAME_W / 2, top + 156, lives > 0 ? 'perdeu 1 vida' : `sem vidas — próxima em ${Math.ceil(P.nextLifeIn() / 60000)} min`, 12, '#7f86a8', '600').setDepth(72));
      const again = this._btn(GAME_W / 2, top + 210, 240, 54, 'TENTAR DE NOVO', 0x2fb573, () => (this.meta.kind === 'daily' ? this._startDaily() : this._startLevel(this.meta.n)), 17, G);
      again.setOff(lives <= 0);
      this._btn(GAME_W / 2, top + 268, 200, 44, this.meta.kind === 'daily' ? 'MENU' : 'MAPA', 0x453a82, () => (this.meta.kind === 'daily' ? this._showMenu() : this._showMap()), 15, G);
    });
  }
}
