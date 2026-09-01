// Ilha Survival — mundo persistente, câmera seguindo o jogador.
//
// Todo o estado do mundo mora num único objeto serializável (this.world),
// salvo pelo adaptador. Isso é de propósito: um futuro co-op só precisa
// sincronizar esse objeto e os eventos de coleta/construção — a estrutura
// já separa "estado do mundo" de "renderização".
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../../core/config.js';
import { sfx } from '../../core/audio.js';
import { ensureRunnerTexture } from '../runner/textures.js';
import { Rng } from '../../core/rng.js';
import {
  WORLD, ISLE_RX, ISLE_RY, SAND, PLAYER_SPEED, ISLAND_SEED,
  RESOURCES, ITEMS, TOOLS, toolYield, BUILDINGS,
  islandLevel, XP_SLEEP, XP_TOOL, DAY_LENGTH, NIGHT_ALPHA,
} from './config.js';

const OUTLINE = 0x1c2440;
const CX = WORLD / 2, CY = WORLD / 2;

export default class IslandScene extends Phaser.Scene {
  constructor() { super('island'); }

  init(data) {
    this.hooks = data.hooks || {};
    this.world = data.world;      // estado salvo (adaptador é o dono)
    this.skin = data.skin || 'azul';
  }

  create() {
    this.paused = false;
    this._buildTextures();
    this._buildTerrain();
    this._spawnResources();
    this._buildBuildSpots();

    // jogador
    const p = this.world.pos || { x: CX, y: CY + 120 };
    const tex = ensureRunnerTexture(this, this.skin, 0);
    this.shadow = this.add.ellipse(p.x, p.y + 16, 30, 10, 0x000000, 0.3).setDepth(20);
    this.player = this.add.image(p.x, p.y, tex).setScale(0.5).setDepth(21);

    this.cameras.main.setBounds(0, 0, WORLD, WORLD);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    // noite: véu fixo na tela + luz da fogueira
    this.nightVeil = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W + 4, GAME_H + 4, 0x0a1030, 0)
      .setScrollFactor(0).setDepth(80);
    this.fireLight = this.add.image(0, 0, 'isl-light').setDepth(81).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);

    this.burst = this.add.particles(0, 0, 'isl-spark', {
      speed: { min: 40, max: 130 }, scale: { start: 0.8, end: 0 }, lifespan: 380, emitting: false,
    }).setDepth(60);

    this._buildInput();
    this._buildActionButton();

    this.clock = this.world.clock || 0;
    this.near = null;            // recurso/estrutura mais próxima
    this._saveAcc = 0;
    this._respawnAcc = 0;
    this.sessionStart = { xp: this.world.xp, gathered: 0 };
  }

  // ================================================================
  _buildTextures() {
    if (this.textures.exists('isl-tree')) return;
    const g = this.make.graphics({ add: false });

    // árvore
    g.fillStyle(0x000000, 0.22); g.fillEllipse(30, 74, 40, 12);
    g.fillStyle(0x6b4a2e, 1); g.fillRoundedRect(25, 46, 10, 28, 4);
    g.fillStyle(0x2f8f5b, 1); g.fillCircle(30, 32, 24);
    g.fillStyle(0x3fae70, 1); g.fillCircle(20, 26, 14); g.fillCircle(41, 24, 13);
    g.fillStyle(0xffffff, 0.18); g.fillCircle(22, 20, 6);
    g.generateTexture('isl-tree', 60, 82);

    // rocha
    g.clear();
    g.fillStyle(0x000000, 0.22); g.fillEllipse(26, 40, 42, 12);
    g.fillStyle(0x8d93a8, 1); g.fillCircle(26, 26, 18);
    g.fillStyle(0xa8aec2, 1); g.fillCircle(18, 20, 9);
    g.fillStyle(0x6f7590, 1); g.fillCircle(34, 32, 8);
    g.generateTexture('isl-rock', 52, 48);

    // arbusto (fibra)
    g.clear();
    g.fillStyle(0x000000, 0.2); g.fillEllipse(22, 32, 34, 10);
    g.fillStyle(0x83bf54, 1); g.fillCircle(14, 22, 11); g.fillCircle(30, 22, 11); g.fillCircle(22, 14, 11);
    g.fillStyle(0xa5d97a, 1); g.fillCircle(18, 14, 5);
    g.generateTexture('isl-bush', 44, 38);

    // fruteira
    g.clear();
    g.fillStyle(0x000000, 0.22); g.fillEllipse(28, 66, 38, 11);
    g.fillStyle(0x6b4a2e, 1); g.fillRoundedRect(23, 42, 10, 24, 4);
    g.fillStyle(0x3fae70, 1); g.fillCircle(28, 28, 21);
    g.fillStyle(0xe8483f, 1); g.fillCircle(18, 24, 4.5); g.fillCircle(34, 20, 4.5); g.fillCircle(30, 34, 4.5);
    g.generateTexture('isl-fruit', 56, 74);

    // fogueira / abrigo / bancada
    g.clear();
    g.fillStyle(0x6b4a2e, 1);
    g.fillRoundedRect(6, 26, 26, 7, 3);
    g.fillRoundedRect(10, 20, 26, 7, 3);
    g.fillStyle(0xff8b3d, 1); g.fillTriangle(21, 2, 12, 24, 30, 24);
    g.fillStyle(0xffd23e, 1); g.fillTriangle(21, 9, 16, 23, 26, 23);
    g.generateTexture('isl-campfire', 42, 36);

    g.clear();
    g.fillStyle(0x000000, 0.22); g.fillEllipse(34, 56, 56, 13);
    g.fillStyle(0xc9a56b, 1); g.fillTriangle(34, 2, 2, 52, 66, 52);
    g.fillStyle(0xa5834e, 1); g.fillTriangle(34, 12, 12, 50, 56, 50);
    g.fillStyle(0x6b4a2e, 1); g.fillRoundedRect(26, 32, 16, 20, 5);
    g.generateTexture('isl-shelter', 68, 60);

    g.clear();
    g.fillStyle(0x000000, 0.22); g.fillEllipse(30, 40, 50, 11);
    g.fillStyle(0x8a6127, 1); g.fillRoundedRect(4, 14, 52, 10, 3);
    g.fillStyle(0x6b4a2e, 1); g.fillRect(8, 24, 8, 14); g.fillRect(44, 24, 8, 14);
    g.fillStyle(0x8d93a8, 1); g.fillRoundedRect(30, 6, 14, 10, 3);
    g.generateTexture('isl-bench', 60, 44);

    // fundação fantasma
    g.clear();
    g.lineStyle(3, 0xffffff, 0.5);
    g.strokeRoundedRect(2, 2, 52, 40, 8);
    g.generateTexture('isl-ghost', 56, 44);

    // luz radial
    g.clear();
    for (let i = 8; i >= 1; i--) {
      g.fillStyle(0xffdf9e, 0.09);
      g.fillCircle(90, 90, i * 11);
    }
    g.generateTexture('isl-light', 180, 180);

    g.clear(); g.fillStyle(0xffffff, 1); g.fillCircle(5, 5, 5); g.generateTexture('isl-spark', 10, 10);
    g.destroy();
  }

  _buildTerrain() {
    // mar
    this.add.rectangle(CX, CY, WORLD, WORLD, 0x2b7fd4).setDepth(0);
    const g = this.add.graphics().setDepth(1);
    // espuma / areia / grama em elipses concêntricas
    g.fillStyle(0xbfe4ff, 0.5); g.fillEllipse(CX, CY, (ISLE_RX + SAND + 16) * 2, (ISLE_RY + SAND + 16) * 2);
    g.fillStyle(0xe8d194, 1); g.fillEllipse(CX, CY, (ISLE_RX + SAND) * 2, (ISLE_RY + SAND) * 2);
    g.fillStyle(0x8fca5e, 1); g.fillEllipse(CX, CY, ISLE_RX * 2, ISLE_RY * 2);
    g.fillStyle(0x83bf54, 1);
    const rng = new Rng(ISLAND_SEED + 5);
    for (let i = 0; i < 40; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next());
      g.fillCircle(CX + Math.cos(a) * r * (ISLE_RX - 40), CY + Math.sin(a) * r * (ISLE_RY - 40), rng.range(14, 34));
    }
  }

  _inIsland(x, y, pad = 0) {
    const dx = (x - CX) / (ISLE_RX + SAND - 24 - pad);
    const dy = (y - CY) / (ISLE_RY + SAND - 24 - pad);
    return dx * dx + dy * dy <= 1;
  }

  _spawnResources() {
    // posições determinísticas pela seed fixa; o save só guarda o que foi
    // colhido (e quando volta), então a ilha é estável entre sessões
    const rng = new Rng(ISLAND_SEED);
    this.resources = [];
    const placed = [];
    for (const [type, def] of Object.entries(RESOURCES)) {
      for (let i = 0; i < def.count; i++) {
        let x, y, ok = false, tries = 0;
        while (!ok && tries++ < 60) {
          const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next());
          x = CX + Math.cos(a) * r * (ISLE_RX - 60);
          y = CY + Math.sin(a) * r * (ISLE_RY - 60);
          ok = Math.hypot(x - CX, y - (CY + 130)) > 130   // longe do acampamento
            && placed.every(p => Math.hypot(p.x - x, p.y - y) > 64);
        }
        placed.push({ x, y });
        const id = `${type}${i}`;
        const res = { id, type, def, x, y, charge: def.charge, spr: null, label: null };
        this.resources.push(res);
        this._renderResource(res);
      }
    }
    this._applyHarvested();
  }

  _renderResource(res) {
    if (!res.spr) {
      res.spr = this.add.image(res.x, res.y, 'isl-' + res.type).setDepth(10 + res.y / WORLD);
      res.ring = this.add.circle(res.x, res.y + 8, 34, 0xffffff, 0).setStrokeStyle(2.5, 0xffd23e, 0).setDepth(9);
    }
  }

  _applyHarvested() {
    const now = Date.now();
    for (const res of this.resources) {
      const back = this.world.harvested[res.id];
      const gone = back && back > now;
      res.depleted = !!gone;
      res.charge = gone ? 0 : res.def.charge;
      res.spr.setVisible(!gone).setAlpha(1);
      if (!gone && back) delete this.world.harvested[res.id];
    }
  }

  _buildBuildSpots() {
    // acampamento fixo ao sul do centro
    this.spots = BUILDINGS.map((b, i) => ({
      def: b,
      x: CX - 90 + i * 90,
      y: CY + 150,
      built: !!this.world.built[b.id],
      spr: null, ghost: null, label: null,
    }));
    for (const s of this.spots) this._renderSpot(s);
  }

  _renderSpot(s) {
    if (s.spr) { s.spr.destroy(); s.spr = null; }
    if (s.ghost) { s.ghost.destroy(); s.label.destroy(); s.ghost = null; }
    if (s.built) {
      s.spr = this.add.image(s.x, s.y, 'isl-' + s.def.id).setDepth(10 + s.y / WORLD);
    } else {
      s.ghost = this.add.image(s.x, s.y, 'isl-ghost').setDepth(9).setAlpha(0.6);
      s.label = this.add.text(s.x, s.y, s.def.name, {
        fontFamily: 'Fredoka, sans-serif', fontSize: '10.5px', color: '#ffffff',
      }).setOrigin(0.5).setAlpha(0.75).setDepth(9);
    }
  }

  // ================================================================
  _buildInput() {
    this.input.addPointer(2);
    this.stick = { active: false, id: -1, ox: 0, oy: 0, vx: 0, vy: 0 };
    this.stickBase = this.add.circle(0, 0, 46, 0xffffff, 0.10).setScrollFactor(0).setDepth(90).setVisible(false).setStrokeStyle(2, 0xffffff, 0.25);
    this.stickKnob = this.add.circle(0, 0, 22, 0xffffff, 0.22).setScrollFactor(0).setDepth(90).setVisible(false);

    this.input.on('pointerdown', (p) => {
      if (p.x > GAME_W * 0.62 && p.y > GAME_H * 0.6) return; // zona do botão de ação
      if (this.stick.active) return;
      this.stick.active = true; this.stick.id = p.id;
      this.stick.ox = p.x; this.stick.oy = p.y;
      this.stickBase.setPosition(p.x, p.y).setVisible(true);
      this.stickKnob.setPosition(p.x, p.y).setVisible(true);
    });
    this.input.on('pointermove', (p) => {
      if (!this.stick.active || p.id !== this.stick.id) return;
      let dx = p.x - this.stick.ox, dy = p.y - this.stick.oy;
      const len = Math.hypot(dx, dy), max = 46;
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      this.stickKnob.setPosition(this.stick.ox + dx, this.stick.oy + dy);
      this.stick.vx = Math.abs(dx) > 8 ? dx / max : 0;
      this.stick.vy = Math.abs(dy) > 8 ? dy / max : 0;
    });
    const release = (p) => {
      if (!this.stick.active || p.id !== this.stick.id) return;
      this.stick.active = false; this.stick.vx = this.stick.vy = 0;
      this.stickBase.setVisible(false); this.stickKnob.setVisible(false);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    const k = this.input.keyboard;
    if (k) {
      this.keys = k.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,E');
      k.on('keydown-SPACE', () => this._action());
      k.on('keydown-E', () => this._action());
    }
  }

  _buildActionButton() {
    const bx = GAME_W - 62, by = GAME_H - 96;
    this.actBtn = this.add.circle(bx, by, 44, 0x23a563, 0.92).setScrollFactor(0).setDepth(90)
      .setStrokeStyle(3, 0xffffff, 0.5).setInteractive().setVisible(false);
    this.actTxt = this.add.text(bx, by, '', {
      fontFamily: 'Fredoka, sans-serif', fontSize: '12px', fontStyle: '700',
      color: '#fff', align: 'center', wordWrap: { width: 76 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(91).setVisible(false);
    this.actBtn.on('pointerdown', () => this._action());
    this.actHint = this.add.text(GAME_W / 2, GAME_H - 158, '', {
      fontFamily: 'Fredoka, sans-serif', fontSize: '12.5px', color: '#ffffff',
      backgroundColor: '#151233cc', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(90).setVisible(false);
  }

  // ================================================================
  // interação contextual
  // ================================================================
  _findNear() {
    const px = this.player.x, py = this.player.y;
    let best = null, bestD = 56;
    for (const r of this.resources) {
      if (r.depleted) continue;
      const d = Math.hypot(r.x - px, (r.y + 10) - py);
      if (d < bestD) { bestD = d; best = { kind: 'res', res: r }; }
    }
    for (const s of this.spots) {
      const d = Math.hypot(s.x - px, s.y - py);
      if (d < 62) {
        if (!s.built) { if (d < bestD) { bestD = d; best = { kind: 'build', spot: s }; } }
        else if (s.def.id === 'bench') { if (d < bestD) { bestD = d; best = { kind: 'bench', spot: s }; } }
        else if (s.def.id === 'shelter' && this._isNight()) { if (d < bestD) { bestD = d; best = { kind: 'sleep', spot: s }; } }
      }
    }
    return best;
  }

  _canAfford(cost) {
    return Object.entries(cost).every(([item, n]) => (this.world.inv[item] || 0) >= n);
  }
  _pay(cost) {
    for (const [item, n] of Object.entries(cost)) this.world.inv[item] -= n;
  }
  _costText(cost) {
    return Object.entries(cost).map(([item, n]) => `${ITEMS[item].name} ${n}`).join(' · ');
  }

  _action() {
    const n = this.near;
    if (!n || this.paused) return;
    if (n.kind === 'res') this._gather(n.res);
    else if (n.kind === 'build') this._build(n.spot);
    else if (n.kind === 'bench') { if (this.hooks.openBench) this.hooks.openBench(); }
    else if (n.kind === 'sleep') this._sleep();
  }

  _gather(res) {
    const def = res.def;
    const toolLv = def.tool ? (this.world.tools[def.tool] || 1) : 1;
    const gain = def.tool ? toolYield(toolLv) : 1;
    res.charge--;
    this.world.inv[def.item] = (this.world.inv[def.item] || 0) + gain;
    this._addXp(def.xp);
    this.sessionStart.gathered += gain;
    this.burst.emitParticleAt(res.x, res.y - 10, 6);
    this.tweens.add({ targets: res.spr, angle: 6, duration: 70, yoyo: true });
    this._float(res.x, res.y - 34, `+${gain} ${ITEMS[def.item].name}`);
    sfx.coin();
    if (res.charge <= 0) {
      res.depleted = true;
      this.world.harvested[res.id] = Date.now() + def.respawn * 1000;
      this.tweens.add({ targets: res.spr, alpha: 0, scale: 0.4, duration: 240, onComplete: () => {
        res.spr.setVisible(false).setAlpha(1).setScale(1);
      } });
    }
    this._dirty();
  }

  _build(spot) {
    if (!this._canAfford(spot.def.cost)) { sfx.lose(); this._float(spot.x, spot.y - 40, 'Faltam recursos'); return; }
    const need = islandLevel(this.world.xp).lv;
    if (need < spot.def.unlock) { sfx.lose(); this._float(spot.x, spot.y - 40, `Nível ${spot.def.unlock} da ilha`); return; }
    this._pay(spot.def.cost);
    this.world.built[spot.def.id] = true;
    spot.built = true;
    this._renderSpot(spot);
    this._addXp(spot.def.xp);
    this.burst.emitParticleAt(spot.x, spot.y, 16);
    sfx.win();
    this._float(spot.x, spot.y - 44, `${spot.def.name} construída!`);
    this._dirty();
  }

  _sleep() {
    // pula para o amanhecer
    this.clock = Math.ceil(this.clock / DAY_LENGTH) * DAY_LENGTH;
    this._addXp(XP_SLEEP);
    sfx.powerup();
    this.cameras.main.fadeOut(300, 10, 16, 48);
    this.time.delayedCall(420, () => this.cameras.main.fadeIn(500));
    this._dirty();
  }

  upgradeTool(toolId) {
    const def = TOOLS[toolId];
    const lv = this.world.tools[toolId] || 1;
    if (lv >= def.max) return false;
    const cost = def.upCost[lv];
    if (!this._canAfford(cost)) return false;
    this._pay(cost);
    this.world.tools[toolId] = lv + 1;
    this._addXp(XP_TOOL);
    sfx.powerup();
    this._dirty();
    return true;
  }

  _addXp(n) {
    const before = islandLevel(this.world.xp).lv;
    this.world.xp += n;
    const after = islandLevel(this.world.xp).lv;
    if (after > before) {
      sfx.win();
      this._banner(`⭐ NÍVEL ${after} DA ILHA!`);
    }
  }

  _banner(text) {
    const t = this.add.text(GAME_W / 2, GAME_H * 0.32, text, {
      fontFamily: 'Fredoka, sans-serif', fontSize: '26px', fontStyle: '700',
      color: '#ffd23e', stroke: '#1c2440', strokeThickness: 7,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(95).setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'back.out' });
    this.time.delayedCall(1500, () => this.tweens.add({ targets: t, alpha: 0, duration: 250, onComplete: () => t.destroy() }));
  }

  _float(x, y, text) {
    const t = this.add.text(x, y, text, {
      fontFamily: 'Fredoka, sans-serif', fontSize: '12.5px', fontStyle: '700',
      color: '#ffffff', stroke: '#1c2440', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(70);
    this.tweens.add({ targets: t, y: y - 24, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  _dirty() {
    this.world.pos = { x: Math.round(this.player.x), y: Math.round(this.player.y) };
    this.world.clock = this.clock;
    if (this.hooks.save) this.hooks.save();
    if (this.hooks.updateHUD) this.hooks.updateHUD();
  }

  _isNight() {
    const f = (this.clock % DAY_LENGTH) / DAY_LENGTH;
    return f > 0.62;
  }

  // ================================================================
  update(_, delta) {
    if (this.paused) return;
    const dt = Math.min(delta / 1000, 0.05);
    this.clock += dt;

    // movimento
    let vx = this.stick.vx, vy = this.stick.vy;
    if (this.keys) {
      if (this.keys.LEFT.isDown || this.keys.A.isDown) vx = -1;
      else if (this.keys.RIGHT.isDown || this.keys.D.isDown) vx = 1;
      if (this.keys.UP.isDown || this.keys.W.isDown) vy = -1;
      else if (this.keys.DOWN.isDown || this.keys.S.isDown) vy = 1;
    }
    const len = Math.hypot(vx, vy);
    if (len > 1) { vx /= len; vy /= len; }
    if (vx || vy) {
      const nx = this.player.x + vx * PLAYER_SPEED * dt;
      const ny = this.player.y + vy * PLAYER_SPEED * dt;
      if (this._inIsland(nx, this.player.y)) this.player.x = nx;
      if (this._inIsland(this.player.x, ny)) this.player.y = ny;
      if (vx) this.player.setFlipX(vx < 0);
      this.player.setDepth(21);
    }
    this.shadow.setPosition(this.player.x, this.player.y + 16);

    // contexto de interação
    const near = this._findNear();
    const changed = JSON.stringify(near && { k: near.kind, id: near.res?.id || near.spot?.def.id })
      !== JSON.stringify(this.near && { k: this.near.kind, id: this.near.res?.id || this.near.spot?.def.id });
    this.near = near;
    if (changed || true) {
      for (const r of this.resources) r.ring.setStrokeStyle(2.5, 0xffd23e, near && near.res === r ? 0.9 : 0);
      if (!near) { this.actBtn.setVisible(false); this.actTxt.setVisible(false); this.actHint.setVisible(false); }
      else {
        this.actBtn.setVisible(true); this.actTxt.setVisible(true);
        if (near.kind === 'res') {
          const needsTool = near.res.def.tool;
          this.actTxt.setText('COLETAR');
          this.actHint.setText(`${near.res.def.name}${needsTool ? ` (${TOOLS[needsTool].name} NV ${this.world.tools[needsTool] || 1})` : ''} · restam ${near.res.charge}`).setVisible(true);
        } else if (near.kind === 'build') {
          this.actTxt.setText('CONSTRUIR');
          this.actHint.setText(`${near.spot.def.name}: ${this._costText(near.spot.def.cost)}`).setVisible(true);
        } else if (near.kind === 'bench') {
          this.actTxt.setText('BANCADA');
          this.actHint.setText('Melhore suas ferramentas').setVisible(true);
        } else if (near.kind === 'sleep') {
          this.actTxt.setText('DORMIR');
          this.actHint.setText('Pular a noite (+XP)').setVisible(true);
        }
      }
    }

    // dia/noite
    const f = (this.clock % DAY_LENGTH) / DAY_LENGTH;
    let dark = 0;
    if (f > 0.55 && f <= 0.65) dark = ((f - 0.55) / 0.10) * NIGHT_ALPHA;       // entardecer
    else if (f > 0.65 && f <= 0.92) dark = NIGHT_ALPHA;                          // noite
    else if (f > 0.92) dark = (1 - (f - 0.92) / 0.08) * NIGHT_ALPHA;             // amanhecer
    this.nightVeil.setFillStyle(f > 0.55 && f < 0.7 ? 0x3a1c4e : 0x0a1030, 1).setAlpha(dark);

    const fire = this.spots && this.spots.find(s => s.def.id === 'campfire' && s.built);
    if (fire && dark > 0.1) {
      this.fireLight.setPosition(fire.x, fire.y).setAlpha(Math.min(1, dark * 2)).setScale(1 + Math.sin(this.clock * 6) * 0.05);
    } else {
      this.fireLight.setAlpha(0);
    }

    // respawn de recursos + save periódico
    this._respawnAcc += dt;
    if (this._respawnAcc > 3) { this._respawnAcc = 0; this._applyHarvested(); }
    this._saveAcc += dt;
    if (this._saveAcc > 4) { this._saveAcc = 0; this._dirty(); }
  }
}
