// Tower Defense — cena única com três estados:
//   'select' → escolha de mapa + melhorias permanentes
//   'prep'   → contagem entre ondas (com INICIAR AGORA)
//   'wave'   → inimigos na pista
// Tudo é solo e local; o adaptador (TDGame.js) cuida de save e recompensas.
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../../core/config.js';
import { sfx } from '../../core/audio.js';
import {
  COLS, ROWS, TILE, MAPS, TOWERS, ENEMIES, BRANCHES, PERMS,
  START_COINS, BASE_LIVES, PREP_TIME, EARLY_BONUS, SELL_RATIO, SLOW_TIME,
  TOWER_DOWN_TIME,
  waveSpec, hpMult, rewardMult, speedMult, atkMult, wavePerfectBonus,
  COMBO_MILESTONES, comboBonus,
} from './config.js';

const OUTLINE = 0x1c2440;

export default class TDScene extends Phaser.Scene {
  constructor() { super('td'); }

  init(data) {
    this.hooks = data.hooks || {};
    this.platformLevel = data.platformLevel || 1;
  }

  create() {
    this.ox = Math.round((GAME_W - COLS * TILE) / 2);
    this.oy = 118;
    this.state = 'select';
    this.speedMult = 1;
    // a cena é reaproveitada entre partidas: sair pelo menu de pausa deixa
    // este flag ligado, e sem zerar aqui a próxima partida abre congelada
    this.paused = false;
    this.now = 0;
    this._buildTextures();
    this._showSelect();
  }

  // ================================================================
  // texturas procedurais
  // ================================================================
  _buildTextures() {
    if (this.textures.exists('td-base')) return;
    const g = this.make.graphics({ add: false });

    // base (castelinho)
    g.fillStyle(OUTLINE, 1); g.fillRoundedRect(2, 12, 44, 34, 6);
    g.fillStyle(0xd9c9a3, 1); g.fillRoundedRect(4, 14, 40, 30, 5);
    g.fillStyle(0xb5a582, 1);
    for (const x of [4, 20, 36]) g.fillRect(x, 6, 8, 12);
    g.fillStyle(0xe8483f, 1); g.fillTriangle(24, 0, 18, 10, 30, 10);
    g.fillStyle(0x6b4a2e, 1); g.fillRoundedRect(19, 28, 10, 16, 4);
    g.generateTexture('td-base', 48, 48);

    // torres: silhuetas distintas por tipo
    for (const t of TOWERS) {
      g.clear();
      g.fillStyle(0x000000, 0.25); g.fillEllipse(22, 40, 34, 10);
      g.fillStyle(OUTLINE, 1); g.fillRoundedRect(8, 16, 28, 24, 6);
      g.fillStyle(t.dark, 1); g.fillRoundedRect(10, 18, 24, 20, 5);
      g.fillStyle(t.color, 1);
      if (t.id === 'archer') {          // seteira alta
        g.fillRoundedRect(14, 4, 16, 20, 4);
        g.fillStyle(0xffffff, 0.4); g.fillRect(19, 8, 6, 3);
      } else if (t.id === 'mage') {     // orbe
        g.fillCircle(22, 12, 10);
        g.fillStyle(0xffffff, 0.5); g.fillCircle(19, 9, 3.4);
      } else if (t.id === 'ice') {      // cristal
        g.fillTriangle(22, 0, 12, 18, 32, 18);
        g.fillStyle(0xffffff, 0.45); g.fillTriangle(22, 4, 18, 14, 24, 14);
      } else {                          // cano do canhão
        g.fillRoundedRect(16, 2, 12, 22, 5);
        g.fillStyle(OUTLINE, 1); g.fillCircle(22, 4, 5);
      }
      g.generateTexture('td-t-' + t.id, 44, 46);
    }

    // inimigos
    for (const [id, e] of Object.entries(ENEMIES)) {
      g.clear();
      const s = e.size;
      g.fillStyle(0x000000, 0.25); g.fillEllipse(s + 2, s * 2 + 2, s * 1.7, s * 0.5);
      g.fillStyle(OUTLINE, 1);
      if (id === 'tank') g.fillRoundedRect(2, 2, s * 2, s * 2, 7);
      else if (id === 'fast') g.fillTriangle(s + 2, 0, 0, s * 2, s * 2 + 4, s * 2);
      else g.fillCircle(s + 2, s + 2, s);
      g.fillStyle(e.color, 1);
      if (id === 'tank') g.fillRoundedRect(4, 4, s * 2 - 4, s * 2 - 4, 6);
      else if (id === 'fast') g.fillTriangle(s + 2, 3, 3, s * 2 - 1, s * 2 + 1, s * 2 - 1);
      else g.fillCircle(s + 2, s + 2, s - 2);
      // olhos
      g.fillStyle(0xffffff, 1);
      g.fillCircle(s - 2, s, 4); g.fillCircle(s + 6, s, 4);
      g.fillStyle(OUTLINE, 1);
      g.fillCircle(s - 1, s + 1, 2); g.fillCircle(s + 7, s + 1, 2);
      if (e.boss) { g.fillStyle(0xffd23e, 1); g.fillTriangle(s - 8, 2, s - 2, 8, s - 14, 8); g.fillTriangle(s + 12, 2, s + 18, 8, s + 6, 8); g.fillTriangle(s + 2, 0, s + 8, 8, s - 4, 8); }
      g.generateTexture('td-e-' + id, s * 2 + 6, s * 2 + 6);
    }

    // projéteis
    g.clear(); g.fillStyle(0xffffff, 1); g.fillCircle(4, 4, 4); g.generateTexture('td-p', 8, 8);
    g.destroy();
  }

  // ================================================================
  // helpers de UI em canvas (alvos grandes para dedo)
  // ================================================================
  _btn(x, y, w, h, label, color, cb, group) {
    // depth 61/62: ACIMA do fundo do painel (60), senão o painel cobre o
    // botão e ainda engole o toque — era o que travava melhorar/vender
    const r = this.add.rectangle(x, y, w, h, color, 1).setStrokeStyle(2.5, OUTLINE).setDepth(61).setInteractive();
    r.on('pointerdown', () => { sfx.click(); cb(); });
    const t = this.add.text(x, y, label, {
      fontFamily: 'Fredoka, sans-serif', fontSize: '15px', fontStyle: '600',
      color: '#fff', align: 'center', wordWrap: { width: w - 10 },
    }).setOrigin(0.5).setDepth(62);
    if (group) { group.push(r, t); }
    return { r, t };
  }

  _clearGroup(group) { for (const o of group) o.destroy(); group.length = 0; }

  // ================================================================
  // seleção de mapa + melhorias permanentes
  // ================================================================
  _showSelect() {
    this.state = 'select';
    this.selectUI = [];
    const G = this.selectUI;
    G.push(this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x151233).setDepth(40));
    G.push(this.add.text(GAME_W / 2, 96, 'ESCOLHA O MAPA', {
      fontFamily: 'Fredoka, sans-serif', fontSize: '24px', fontStyle: '700', color: '#ffd23e',
    }).setOrigin(0.5).setDepth(50));

    MAPS.forEach((m, i) => {
      const y = 170 + i * 92;
      const locked = this.platformLevel < m.unlock;
      const best = this.hooks.bestWave ? this.hooks.bestWave(m.id) : 0;
      const card = this.add.rectangle(GAME_W / 2, y, 330, 78, locked ? 0x241f45 : 0x2a2358, 1)
        .setStrokeStyle(2.5, locked ? 0x39325e : m.path).setDepth(50);
      G.push(card);
      G.push(this.add.rectangle(GAME_W / 2 - 128, y, 52, 52, m.grassA).setStrokeStyle(2, OUTLINE).setDepth(51));
      G.push(this.add.rectangle(GAME_W / 2 - 128, y, 30, 14, m.path).setDepth(52));
      G.push(this.add.text(GAME_W / 2 - 90, y - 16, m.name, {
        fontFamily: 'Fredoka, sans-serif', fontSize: '18px', fontStyle: '700', color: locked ? '#7a72a8' : '#fff',
      }).setDepth(51));
      G.push(this.add.text(GAME_W / 2 - 90, y + 8, locked ? `Desbloqueia no nível ${m.unlock}` : (best ? `Melhor onda: ${best}` : 'Nunca jogado'), {
        fontFamily: 'Fredoka, sans-serif', fontSize: '12.5px', color: '#a99fd6',
      }).setDepth(51));
      if (!locked) {
        card.setInteractive();
        card.on('pointerdown', () => { sfx.go(); this._startRun(m); });
        G.push(this.add.text(GAME_W / 2 + 132, y, '▶', { fontSize: '22px', color: '#43d68c' }).setOrigin(0.5).setDepth(51));
      } else {
        G.push(this.add.text(GAME_W / 2 + 132, y, '🔒', { fontSize: '19px' }).setOrigin(0.5).setDepth(51));
      }
    });

    // melhorias permanentes
    G.push(this.add.text(GAME_W / 2, 470, 'MELHORIAS PERMANENTES', {
      fontFamily: 'Fredoka, sans-serif', fontSize: '15px', fontStyle: '700', color: '#a99fd6',
    }).setOrigin(0.5).setDepth(50));
    this._drawPerms();
  }

  _drawPerms() {
    if (this.permUI) this._clearGroup(this.permUI);
    this.permUI = [];
    const G = this.permUI;
    const coins = this.hooks.platformCoins ? this.hooks.platformCoins() : 0;
    G.push(this.add.text(GAME_W / 2, 494, `Você tem ${coins} moedas da plataforma`, {
      fontFamily: 'Fredoka, sans-serif', fontSize: '12.5px', color: '#ffd23e',
    }).setOrigin(0.5).setDepth(50));

    PERMS.forEach((p, i) => {
      const y = 540 + i * 66;
      const lv = this.hooks.permLevel ? this.hooks.permLevel(p.id) : 0;
      const maxed = lv >= p.max;
      const cost = maxed ? 0 : p.cost(lv);
      G.push(this.add.rectangle(GAME_W / 2, y, 330, 56, 0x2a2358).setStrokeStyle(2, 0x453a82).setDepth(50));
      G.push(this.add.text(GAME_W / 2 - 150, y - 12, `${p.name}  •  NV ${lv}/${p.max}`, {
        fontFamily: 'Fredoka, sans-serif', fontSize: '14px', fontStyle: '700', color: '#fff',
      }).setDepth(51));
      G.push(this.add.text(GAME_W / 2 - 150, y + 8, p.desc, {
        fontFamily: 'Fredoka, sans-serif', fontSize: '11.5px', color: '#a99fd6',
      }).setDepth(51));
      if (maxed) {
        G.push(this.add.text(GAME_W / 2 + 122, y, 'MÁX', {
          fontFamily: 'Fredoka, sans-serif', fontSize: '14px', fontStyle: '700', color: '#ffd23e',
        }).setOrigin(0.5).setDepth(51));
      } else {
        this._btn(GAME_W / 2 + 118, y, 84, 40, `${cost}`, coins >= cost ? 0x23a563 : 0x39325e, () => {
          if (this.hooks.buyPerm && this.hooks.buyPerm(p.id)) { sfx.powerup(); this._drawPerms(); }
          else sfx.lose();
        }, G);
      }
    });
  }

  // ================================================================
  // início da corrida
  // ================================================================
  _startRun(mapDef) {
    this._clearGroup(this.selectUI);
    if (this.permUI) this._clearGroup(this.permUI);
    this.map = mapDef;
    if (this.hooks.onRunStart) this.hooks.onRunStart(mapDef.id);

    const perm = (id) => (this.hooks.permLevel ? this.hooks.permLevel(id) : 0);
    const pdef = (id) => PERMS.find(p => p.id === id);
    this.mods = {
      dmg: 1 + perm('dano') * pdef('dano').per,
      income: 1 + perm('renda') * pdef('renda').per,
      lives: BASE_LIVES + perm('vida') * pdef('vida').per,
    };

    this.coins = START_COINS;
    this.lives = this.mods.lives;
    this.wave = 0;
    this.kills = 0;
    this.bossKills = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.nextMilestone = 0;
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.prepLeft = 0;
    this.selectedTile = null;
    this.selectedTower = null;
    this.dead = false;

    this._buildBoard();
    this._buildControls();
    this._enterPrep();
  }

  // geometria do caminho
  _pathGeometry() {
    const pts = this.map.waypoints.map(([c, r]) => ({
      x: this.ox + c * TILE + TILE / 2,
      y: this.oy + r * TILE + TILE / 2,
    }));
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      segs.push({ a: pts[i], b: pts[i + 1], len, start: total });
      total += len;
    }
    this.pathSegs = segs;
    this.pathTotal = total;
    // células ocupadas pelo caminho (para bloquear construção)
    this.pathCells = new Set();
    for (const s of segs) {
      const steps = Math.ceil(s.len / (TILE / 2));
      for (let i = 0; i <= steps; i++) {
        const x = s.a.x + (s.b.x - s.a.x) * (i / steps);
        const y = s.a.y + (s.b.y - s.a.y) * (i / steps);
        this.pathCells.add(`${Math.floor((x - this.ox) / TILE)},${Math.floor((y - this.oy) / TILE)}`);
      }
    }
  }

  _posAt(d) {
    for (const s of this.pathSegs) {
      if (d <= s.start + s.len) {
        const f = (d - s.start) / s.len;
        return { x: s.a.x + (s.b.x - s.a.x) * f, y: s.a.y + (s.b.y - s.a.y) * f };
      }
    }
    const last = this.pathSegs[this.pathSegs.length - 1];
    return { x: last.b.x, y: last.b.y };
  }

  _buildBoard() {
    const m = this.map;
    this.boardUI = [];
    const G = this.boardUI;
    G.push(this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x151233).setDepth(0));
    this._pathGeometry();

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const onPath = this.pathCells.has(`${c},${r}`);
        const rect = this.add.rectangle(
          this.ox + c * TILE + TILE / 2, this.oy + r * TILE + TILE / 2, TILE, TILE,
          onPath ? m.path : ((c + r) % 2 === 0 ? m.grassA : m.grassB),
        ).setDepth(1);
        G.push(rect);
        if (!onPath) {
          rect.setInteractive();
          rect.on('pointerdown', () => this._tapTile(c, r));
        }
      }
    }
    // base + seta de entrada
    const end = this.map.waypoints[this.map.waypoints.length - 1];
    G.push(this.add.image(this.ox + end[0] * TILE + TILE / 2, this.oy + end[1] * TILE + TILE / 2, 'td-base').setDepth(4));
    const st = this._posAt(2);
    G.push(this.add.text(st.x, st.y, '▶', { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5).setAlpha(0.8).setDepth(3));

    this.rangeCircle = this.add.circle(0, 0, 10, 0xffffff, 0.12).setStrokeStyle(2, 0xffffff, 0.4).setVisible(false).setDepth(5);
    this.marker = this.add.rectangle(0, 0, TILE, TILE, 0xffffff, 0.2).setStrokeStyle(2.5, 0xffd23e).setVisible(false).setDepth(5);

    this.burst = this.add.particles(0, 0, 'td-p', {
      speed: { min: 40, max: 150 }, scale: { start: 0.9, end: 0 }, lifespan: 340, emitting: false,
    }).setDepth(20);
    this.dmgPool = [];
  }

  _buildControls() {
    // velocidade x1/x2 (canto inferior direito, fora da grade)
    this.speedBtn = this._btn(GAME_W - 52, this.oy - 34, 64, 38, 'x1', 0x2a2358, () => {
      this.speedMult = this.speedMult === 1 ? 2 : 1;
      this.speedBtn.t.setText('x' + this.speedMult);
    });
  }

  // ================================================================
  // ondas
  // ================================================================
  _enterPrep() {
    this.state = 'prep';
    this.prepLeft = this.wave === 0 ? PREP_TIME + 4 : PREP_TIME;
    this._roundLeaked = false;
    const next = waveSpec(this.wave + 1);
    const counts = {};
    for (const s of next) counts[s.type] = (counts[s.type] || 0) + 1;
    const preview = Object.entries(counts).map(([t, n]) => `${ENEMIES[t].name} ×${n}`).join('   ');

    this.prepUI = [];
    this.prepUI.push(this.add.text(GAME_W / 2, this.oy + ROWS * TILE + 26,
      `Próxima onda: ${preview}`, {
        fontFamily: 'Fredoka, sans-serif', fontSize: '13px', color: '#a99fd6',
        align: 'center', wordWrap: { width: GAME_W - 40 },
      }).setOrigin(0.5).setDepth(50));
    this.prepText = this.add.text(GAME_W / 2, this.oy + ROWS * TILE + 58, '', {
      fontFamily: 'Fredoka, sans-serif', fontSize: '17px', fontStyle: '700', color: '#ffd23e',
    }).setOrigin(0.5).setDepth(50);
    this.prepUI.push(this.prepText);
    this.startBtn = this._btn(GAME_W / 2, this.oy + ROWS * TILE + 96, 220, 44, 'INICIAR AGORA', 0x23a563, () => this._launchWave(true), this.prepUI);
    // se a onda acabou com um painel aberto, a barra nasce escondida
    if (this._panelOpen()) this._setPrepVisible(false);
    if (this.hooks.updateHUD) this._pushHUD();
  }

  _launchWave(early) {
    if (this.state !== 'prep') return;
    if (early && this.prepLeft > 0) {
      const bonus = Math.floor(this.prepLeft * EARLY_BONUS);
      if (bonus > 0) { this.coins += bonus; this._float(GAME_W / 2, this.oy - 10, `+${bonus}`, '#ffd23e'); }
    }
    this._clearGroup(this.prepUI);
    this.wave++;
    this.state = 'wave';
    this.spawnQueue = waveSpec(this.wave);
    this.spawnTimer = 0.4;
    sfx.count();
    this._pushHUD();
  }

  _spawnEnemy(type) {
    const def = ENEMIES[type];
    const hp = Math.round(def.hp * hpMult(this.wave));
    const spr = this.add.image(0, 0, 'td-e-' + type).setDepth(10);
    const bar = this.add.rectangle(0, 0, def.size * 2, 4.5, 0x43d68c).setDepth(11);
    const barBg = this.add.rectangle(0, 0, def.size * 2, 4.5, 0x000000, 0.55).setDepth(10.5);
    this.enemies.push({
      type, def, hp, max: hp, t: 0, slowUntil: 0,
      phase: 0, ethereal: false, atkCd: 0,
      spr, bar, barBg,
    });
  }

  // ================================================================
  // construção / torres
  // ================================================================
  _tapTile(c, r) {
    if (this.state === 'select' || this.dead) return;
    const existing = this.towers.find(t => t.c === c && t.r === r);
    this._closePanels();
    if (existing) { this._openTowerPanel(existing); return; }
    this.selectedTile = { c, r };
    this.marker.setPosition(this.ox + c * TILE + TILE / 2, this.oy + r * TILE + TILE / 2).setVisible(true);
    this._openBuildPanel();
  }

  // A barra de preparação vive no mesmo rodapé dos painéis. Em vez de
  // empilhar camadas, ela some enquanto um painel está aberto.
  _setPrepVisible(v) {
    if (!this.prepUI) return;
    for (const o of this.prepUI) {
      if (o.setVisible) o.setVisible(v);
      if (o.input) o.input.enabled = v;
    }
  }

  _panelOpen() { return !!(this.panelUI && this.panelUI.length); }

  _panelBase(h) {
    const y = GAME_H - h / 2 - 8;
    const top = y - h / 2;
    this.panelUI = this.panelUI || [];
    this.panelUI.push(this.add.rectangle(GAME_W / 2, y, GAME_W - 16, h, 0x2a2358, 0.97)
      .setStrokeStyle(2.5, 0x453a82).setDepth(60).setInteractive());

    // fechar explícito: sem isso não dá para voltar ao INICIAR AGORA
    const cx = GAME_W - 26, cy = top + 15;
    const c = this.add.circle(cx, cy, 15, 0x453a82).setDepth(63).setInteractive();
    c.on('pointerdown', () => { sfx.click(); this._closePanels(); });
    const ct = this.add.text(cx, cy, '✕', {
      fontFamily: 'Fredoka, sans-serif', fontSize: '15px', fontStyle: '700', color: '#fff',
    }).setOrigin(0.5).setDepth(64);
    this.panelUI.push(c, ct);

    this._setPrepVisible(false);
    return top;
  }

  _closePanels() {
    if (this.panelUI) this._clearGroup(this.panelUI);
    this.panelUI = [];
    this.marker.setVisible(false);
    this.rangeCircle.setVisible(false);
    this.selectedTile = null;
    this.selectedTower = null;
    if (this.state === 'prep') this._setPrepVisible(true);
  }

  _openBuildPanel() {
    const top = this._panelBase(120);
    const G = this.panelUI;
    G.push(this.add.text(GAME_W / 2, top + 16, 'CONSTRUIR', {
      fontFamily: 'Fredoka, sans-serif', fontSize: '13px', fontStyle: '700', color: '#a99fd6',
    }).setOrigin(0.5).setDepth(61));
    TOWERS.forEach((t, i) => {
      const x = 56 + i * 94;
      const locked = this.platformLevel < t.unlock;
      const afford = this.coins >= t.cost;
      const card = this.add.rectangle(x, top + 70, 86, 78, locked ? 0x241f45 : (afford ? 0x352c6e : 0x2a2450))
        .setStrokeStyle(2, locked ? 0x39325e : t.color).setDepth(61);
      G.push(card);
      if (locked) {
        G.push(this.add.text(x, top + 56, '🔒', { fontSize: '18px' }).setOrigin(0.5).setDepth(62));
        G.push(this.add.text(x, top + 84, `nível ${t.unlock}`, {
          fontFamily: 'Fredoka, sans-serif', fontSize: '10.5px', color: '#7a72a8',
        }).setOrigin(0.5).setDepth(62));
      } else {
        G.push(this.add.image(x, top + 52, 'td-t-' + t.id).setScale(0.8).setDepth(62));
        G.push(this.add.text(x, top + 80, t.name, {
          fontFamily: 'Fredoka, sans-serif', fontSize: '11px', fontStyle: '600', color: '#fff',
        }).setOrigin(0.5).setDepth(62));
        G.push(this.add.text(x, top + 95, `${t.cost}`, {
          fontFamily: 'Fredoka, sans-serif', fontSize: '11.5px', fontStyle: '700',
          color: afford ? '#ffd23e' : '#e8483f',
        }).setOrigin(0.5).setDepth(62));
        card.setInteractive();
        card.on('pointerdown', () => this._build(t));
      }
    });
  }

  _build(def) {
    if (!this.selectedTile || this.coins < def.cost) { sfx.lose(); return; }
    const { c, r } = this.selectedTile;
    this.coins -= def.cost;
    const x = this.ox + c * TILE + TILE / 2, y = this.oy + r * TILE + TILE / 2;
    const spr = this.add.image(x, y, 'td-t-' + def.id).setDepth(6).setScale(0.2);
    this.tweens.add({ targets: spr, scale: 1, duration: 220, ease: 'back.out' });
    const lvText = this.add.text(x + 15, y + 14, '1', {
      fontFamily: 'Fredoka, sans-serif', fontSize: '11px', fontStyle: '700', color: '#ffd23e',
      stroke: '#1c2440', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(7);
    const hpBg = this.add.rectangle(x, y + 20, 32, 4, 0x000000, 0.6).setDepth(7).setVisible(false);
    const hpBar = this.add.rectangle(x - 16, y + 20, 32, 4, 0x43d68c).setOrigin(0, 0.5).setDepth(7.1).setVisible(false);
    this.towers.push({
      def, c, r, x, y, lv: 1, branch: null, cd: 0, invested: def.cost,
      hp: def.hp[0], maxHp: def.hp[0], downUntil: 0,
      spr, lvText, hpBg, hpBar,
    });
    this.burst.emitParticleAt(x, y, 8);
    sfx.powerup();
    this._closePanels();
    this._pushHUD();
  }

  _towerStats(tw) {
    const i = tw.lv - 1;
    const b = tw.branch ? BRANCHES.find(x => x.id === tw.branch) : null;
    return {
      dmg: tw.def.dmg[i] * this.mods.dmg * (b ? b.dmgMult : 1),
      range: tw.def.range[i],
      rate: tw.def.rate[i] * (b ? b.rateMult : 1),
    };
  }

  _openTowerPanel(tw) {
    this.selectedTower = tw;
    const st = this._towerStats(tw);
    this.rangeCircle.setPosition(tw.x, tw.y).setRadius(st.range).setVisible(true);
    const needBranch = tw.lv >= 3 && !tw.branch;
    const top = this._panelBase(needBranch ? 130 : 108);
    const G = this.panelUI;
    G.push(this.add.text(20, top + 16, `${tw.def.name}  NV ${tw.lv}`, {
      fontFamily: 'Fredoka, sans-serif', fontSize: '16px', fontStyle: '700', color: '#fff',
    }).setDepth(61));
    G.push(this.add.text(20, top + 40, `Dano ${Math.round(st.dmg)} · Alcance ${Math.round(st.range)} · ${st.rate.toFixed(2)}s`, {
      fontFamily: 'Fredoka, sans-serif', fontSize: '12px', color: '#a99fd6',
    }).setDepth(61));

    if (needBranch) {
      G.push(this.add.text(20, top + 62, 'Escolha uma especialização:', {
        fontFamily: 'Fredoka, sans-serif', fontSize: '12px', color: '#ffd23e',
      }).setDepth(61));
      BRANCHES.forEach((b, i) => {
        this._btn(110 + i * 180, top + 98, 168, 44, `${b.name}\n${b.desc}`, 0x352c6e, () => {
          tw.branch = b.id;
          sfx.powerup();
          this._closePanels();
        }, G);
      });
      return;
    }

    const canUp = tw.lv < 5;
    const upCost = canUp ? tw.def.upCost[tw.lv] : 0;
    if (canUp) {
      this._btn(GAME_W - 170, top + 78, 150, 46,
        `MELHORAR  ${upCost}`, this.coins >= upCost ? 0x23a563 : 0x39325e, () => {
          if (this.coins < upCost) { sfx.lose(); return; }
          this.coins -= upCost;
          tw.invested += upCost;
          tw.lv++;
          // melhorar reforça a estrutura e a repara de imediato
          tw.maxHp = tw.def.hp[tw.lv - 1];
          tw.hp = tw.maxHp;
          tw.downUntil = 0;
          tw.lvText.setText(String(tw.lv));
          this.burst.emitParticleAt(tw.x, tw.y, 10);
          sfx.powerup();
          this._closePanels();
          this._openTowerPanel(tw);
          this._pushHUD();
        }, G);
    } else {
      G.push(this.add.text(GAME_W - 170, top + 78, 'NÍVEL MÁXIMO', {
        fontFamily: 'Fredoka, sans-serif', fontSize: '13px', fontStyle: '700', color: '#ffd23e',
      }).setOrigin(0.5).setDepth(61));
    }
    const sellVal = Math.floor(tw.invested * SELL_RATIO);
    this._btn(84, top + 78, 130, 46, `VENDER  ${sellVal}`, 0x9c2820, () => {
      this.coins += sellVal;
      tw.spr.destroy(); tw.lvText.destroy(); tw.hpBg.destroy(); tw.hpBar.destroy();
      this.towers = this.towers.filter(t => t !== tw);
      this._closePanels();
      this._pushHUD();
    }, G);
  }

  // ================================================================
  // combate
  // ================================================================
  // ---- torres sob ataque ----
  _towerNearest(x, y, range) {
    let best = null, bestD = range;
    for (const tw of this.towers) {
      if (tw.downUntil > this.now) continue;
      const d = Math.hypot(tw.x - x, tw.y - y);
      if (d <= bestD) { bestD = d; best = tw; }
    }
    return best;
  }

  _hitTower(tw, dmg) {
    tw.hp -= dmg;
    this._float(tw.x, tw.y - 22, `-${Math.round(dmg)}`, '#ff6b5e');
    tw.hpBg.setVisible(true); tw.hpBar.setVisible(true);
    tw.hpBar.width = Math.max(0, 32 * (tw.hp / tw.maxHp));
    if (tw.hp <= 0) {
      tw.hp = 0;
      tw.downUntil = this.now + TOWER_DOWN_TIME;
      tw.spr.setTint(0x555a70).setAlpha(0.45);
      this.burst.emitParticleAt(tw.x, tw.y, 14);
      this.cameras.main.shake(150, 0.006);
      sfx.hit();
    }
  }

  _damage(en, amount, splash, slow) {
    amount *= 1 - (en.def.armor || 0);   // blindagem absorve parte do golpe
    en.hp -= amount;
    this._float(en.spr.x, en.spr.y - 18, String(Math.round(amount)), '#ffffff');
    if (slow) en.slowUntil = Math.max(en.slowUntil, this.now + SLOW_TIME);
    if (splash) {
      for (const other of this.enemies) {
        if (other === en || other.hp <= 0) continue;
        const d = Math.hypot(other.spr.x - en.spr.x, other.spr.y - en.spr.y);
        if (d <= splash) {
          other.hp -= amount * 0.55;
          if (slow) other.slowUntil = Math.max(other.slowUntil, this.now + SLOW_TIME);
        }
      }
      this.burst.emitParticleAt(en.spr.x, en.spr.y, 12);
    }
  }

  _killEnemy(en) {
    const gain = Math.round(en.def.reward * rewardMult(this.wave) * this.mods.income);
    this.coins += gain;
    this.kills++;
    if (en.def.boss) this.bossKills++;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const ms = COMBO_MILESTONES[this.nextMilestone];
    if (ms && this.combo >= ms) {
      const bonus = comboBonus(ms);
      this.coins += bonus;
      this.nextMilestone++;
      this._float(GAME_W / 2, this.oy + 40, `COMBO ×${ms}  +${bonus}`, '#ff8b3d');
      sfx.win();
    }
    this._float(en.spr.x, en.spr.y, `+${gain}`, '#ffd23e');
    this.burst.emitParticleAt(en.spr.x, en.spr.y, en.def.boss ? 26 : 8);
    sfx.coin();
    this._removeEnemy(en);
  }

  _leakEnemy(en) {
    this.lives -= en.def.lives;
    this.combo = 0;
    this.nextMilestone = 0;
    this._roundLeaked = true;
    this.cameras.main.shake(140, 0.008);
    sfx.hit();
    this._removeEnemy(en);
    if (this.lives <= 0 && !this.dead) this._gameOver();
  }

  _removeEnemy(en) {
    en.spr.destroy(); en.bar.destroy(); en.barBg.destroy();
    this.enemies = this.enemies.filter(e => e !== en);
    this._pushHUD();
  }

  _float(x, y, text, color) {
    let t = this.dmgPool.find(d => !d.active);
    if (!t) {
      t = this.add.text(0, 0, '', {
        fontFamily: 'Fredoka, sans-serif', fontSize: '13px', fontStyle: '700',
        stroke: '#1c2440', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(30);
      this.dmgPool.push(t);
    }
    t.setText(text).setColor(color).setPosition(x, y).setAlpha(1).setActive(true).setVisible(true);
    this.tweens.add({
      targets: t, y: y - 26, alpha: 0, duration: 700,
      onComplete: () => { t.setActive(false).setVisible(false); },
    });
  }

  _gameOver() {
    this.dead = true;
    this.state = 'over';
    this._closePanels();
    sfx.death();
    if (this.hooks.onGameOver) {
      this.hooks.onGameOver({
        map: this.map.id, wave: this.wave, kills: this.kills,
        bossKills: this.bossKills, bestCombo: this.bestCombo,
      });
    }
  }

  _pushHUD() {
    if (this.hooks.updateHUD) {
      this.hooks.updateHUD({
        wave: this.wave, lives: Math.max(0, this.lives),
        coins: this.coins, combo: this.combo,
      });
    }
  }

  // ================================================================
  update(_, delta) {
    if (this.state === 'select' || this.state === 'over' || this.paused) return;
    const dt = Math.min(delta / 1000, 0.05) * this.speedMult;
    this.now = (this.now || 0) + dt;

    if (this.state === 'prep') {
      this.prepLeft -= dt;
      if (this.prepText && this.prepText.active) this.prepText.setText(`Próxima onda em ${Math.ceil(this.prepLeft)}s`);
      if (this.prepLeft <= 0) this._launchWave(false);
      return;
    }

    // spawns
    if (this.spawnQueue.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const s = this.spawnQueue.shift();
        this._spawnEnemy(s.type);
        this.spawnTimer = s.gap;
      }
    }

    // inimigos
    for (const en of [...this.enemies]) {
      // fantasma: alterna entre sólido e etéreo
      if (en.def.phasing) {
        en.phase += dt;
        en.ethereal = (en.phase % 3.7) > 2.6;
        en.spr.setAlpha(en.ethereal ? 0.3 : 1);
      }

      // sapadores e chefes param para derrubar a torre mais próxima
      let attacking = false;
      if (en.def.atk) {
        const here = this._posAt(en.t);
        const tw = this._towerNearest(here.x, here.y, en.def.atkRange);
        if (tw) {
          attacking = true;
          en.atkCd -= dt;
          if (en.atkCd <= 0) {
            en.atkCd = en.def.atkRate;
            this._hitTower(tw, en.def.atk * atkMult(this.wave));
            const flash = this.add.image(tw.x, tw.y, 'td-p').setTint(0xff8b3d).setDepth(16).setScale(2);
            this.tweens.add({ targets: flash, alpha: 0, scale: 0.5, duration: 220, onComplete: () => flash.destroy() });
          }
        }
      }

      let spd = en.def.speed * speedMult(this.wave);
      if (this.now < en.slowUntil) spd *= 0.58;
      if (!attacking) en.t += spd * dt;

      if (en.t >= this.pathTotal) { this._leakEnemy(en); continue; }
      const p = this._posAt(en.t);
      en.spr.setPosition(p.x, p.y);
      en.barBg.setPosition(p.x, p.y - en.def.size - 8);
      en.bar.setPosition(p.x - (en.def.size) * (1 - en.hp / en.max), p.y - en.def.size - 8);
      en.bar.width = Math.max(0, en.def.size * 2 * (en.hp / en.max));
      if (en.hp <= 0) this._killEnemy(en);
    }

    // torres
    for (const tw of this.towers) {
      // derrubada: não atira e mostra a contagem para voltar
      if (tw.downUntil > this.now) {
        tw.lvText.setText(Math.ceil(tw.downUntil - this.now) + 's');
        continue;
      }
      if (tw.hp <= 0) {
        // acabou de se reerguer
        tw.hp = tw.maxHp;
        tw.spr.clearTint().setAlpha(1);
        tw.lvText.setText(String(tw.lv));
        tw.hpBg.setVisible(false); tw.hpBar.setVisible(false);
        this.burst.emitParticleAt(tw.x, tw.y, 8);
      }
      // reparo lento fora de combate
      if (tw.hp < tw.maxHp) {
        tw.hp = Math.min(tw.maxHp, tw.hp + tw.maxHp * 0.06 * dt);
        tw.hpBar.width = 32 * (tw.hp / tw.maxHp);
        if (tw.hp >= tw.maxHp) { tw.hpBg.setVisible(false); tw.hpBar.setVisible(false); }
      }

      tw.cd -= dt;
      if (tw.cd > 0) continue;
      const st = this._towerStats(tw);
      let best = null;
      for (const en of this.enemies) {
        if (en.hp <= 0 || en.ethereal) continue;
        const d = Math.hypot(en.spr.x - tw.x, en.spr.y - tw.y);
        if (d <= st.range && (!best || en.t > best.t)) best = en;
      }
      if (!best) continue;
      tw.cd = st.rate;
      const spr = this.add.image(tw.x, tw.y - 14, 'td-p').setDepth(15).setTint(tw.def.color);
      this.projectiles.push({ spr, target: best, dmg: st.dmg, splash: tw.def.splash, slow: tw.def.slow > 0 });
      sfx.lane();
    }

    // projéteis
    for (const pr of [...this.projectiles]) {
      if (!pr.target || pr.target.hp <= 0 || !pr.target.spr.active) {
        pr.spr.destroy();
        this.projectiles = this.projectiles.filter(p => p !== pr);
        continue;
      }
      const tx = pr.target.spr.x, ty = pr.target.spr.y;
      const d = Math.hypot(tx - pr.spr.x, ty - pr.spr.y);
      const step = 460 * dt;
      if (d <= step) {
        this._damage(pr.target, pr.dmg, pr.splash, pr.slow);
        if (pr.target.hp <= 0) this._killEnemy(pr.target);
        pr.spr.destroy();
        this.projectiles = this.projectiles.filter(p => p !== pr);
      } else {
        pr.spr.x += (tx - pr.spr.x) / d * step;
        pr.spr.y += (ty - pr.spr.y) / d * step;
      }
    }

    // fim da onda
    if (this.state === 'wave' && !this.spawnQueue.length && this.enemies.length === 0 && !this.dead) {
      if (!this._roundLeaked) {
        const bonus = Math.round(wavePerfectBonus(this.wave) * this.mods.income);
        this.coins += bonus;
        this._float(GAME_W / 2, this.oy + 40, `Onda perfeita! +${bonus}`, '#43d68c');
      }
      if (this.hooks.onWaveCleared) this.hooks.onWaveCleared(this.wave);
      this._enterPrep();
    }
  }
}
