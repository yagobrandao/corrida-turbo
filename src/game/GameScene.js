// Cena única de gameplay. Cada aparelho simula APENAS o próprio jogador
// contra a pista (gerada pela seed compartilhada) e renderiza os rivais como
// "ghosts" interpolados a partir dos snapshots recebidos pela rede.
import Phaser from 'phaser';
import {
  GAME_W, GAME_H, LANE_W, PLAYER_Y_FRAC, PX_PER_M,
  SPEED_START, SPEED_MAX, SPEED_RAMP_UNTIL, SPEED_ACCEL_EARLY, SPEED_ACCEL_LATE,
  JUMP_DURATION, SLIDE_DURATION, LANE_TWEEN,
  INVULN_TIME, LIVES, STATE_HZ, COIN_VALUE, SCORE_PER_M, SLOT_COLORS,
  getDifficulty,
} from '../core/config.js';
import { Track } from '../world/track.js';
import { buildTextures } from './textures.js';
import { textureKey } from './skins.js';
import { sfx } from './audio.js';

const SWIPE_MIN = 26;      // px mínimos para contar como swipe
const JUMP_HEIGHT = 105;   // px no ápice do pulo

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('run');
  }

  init(data) {
    this.seed = data.seed;
    this.isNet = !!data.isNet;
    this.hooks = data.hooks || {};
    this.mySkin = data.mySkin || 'azul';
    this.rivals = data.rivals || [];   // [{ slot, name, skin }]
    // a dificuldade vem do host e vale igual para todos na sala
    this.diff = getDifficulty(data.difficulty);
    this.speedStart = SPEED_START * this.diff.mult;
    this.speedMax = SPEED_MAX * this.diff.mult;
    this.rampUntil = SPEED_RAMP_UNTIL * this.diff.mult;
  }

  create() {
    const W = GAME_W, H = GAME_H;
    if (!this.textures.exists('shadow')) buildTextures(this);

    this.laneX = [W / 2 - LANE_W, W / 2, W / 2 + LANE_W];
    this.playerY = H * PLAYER_Y_FRAC;

    this._buildScenery();

    this.obSprites = new Map();
    this.coinSprites = new Map();

    this.ghosts = new Map();
    for (const r of this.rivals) this._makeGhost(r);

    // ---------- jogador ----------
    this.shadow = this.add.image(this.laneX[1], this.playerY + 40, 'shadow').setDepth(8);
    this.player = this.add.image(this.laneX[1], this.playerY, textureKey(this.mySkin)).setDepth(10);
    this.idleTween = this.tweens.add({
      targets: this.player, y: this.playerY - 7, duration: 320,
      yoyo: true, repeat: -1, ease: 'sine.inOut',
    });

    this._buildParticles();

    // ---------- estado da corrida ----------
    this.track = new Track(this.seed);
    this.track.ensure(0);
    this.running = false;
    this.dead = false;
    this.dist = 0;
    this.speed = this.speedStart;
    this.topSpeed = this.speedStart;
    this.lane = 1;
    this.jumpT = -1;
    this.slideT = -1;
    this.invulnT = 0;
    this.lives = LIVES;
    this.coins = 0;
    this.elapsed = 0;
    this._stateAcc = 0;
    this._hudAcc = 0;
    this._pruneAcc = 0;

    this._setupInput();
    this._syncSprites();
  }

  _buildScenery() {
    const W = GAME_W, H = GAME_H;
    const roadW = LANE_W * 3 + 30;
    const roadX = W / 2 - roadW / 2;
    this.add.rectangle(W / 2, H / 2, W, H, 0x1b2246);
    this.sideL = this.add.tileSprite(roadX / 2, H / 2, roadX, H, 'side-tile');
    this.sideR = this.add.tileSprite(W - roadX / 2, H / 2, roadX, H, 'side-tile');
    this.add.rectangle(W / 2, H / 2, roadW, H, 0x3a4166);
    this.add.rectangle(roadX + 2, H / 2, 5, H, 0xf4d35e);
    this.add.rectangle(roadX + roadW - 2, H / 2, 5, H, 0xf4d35e);
    this.dashes = [
      this.add.tileSprite(W / 2 - LANE_W / 2, H / 2, 8, H, 'dash'),
      this.add.tileSprite(W / 2 + LANE_W / 2, H / 2, 8, H, 'dash'),
    ];
    this.dashes.forEach(d => d.setAlpha(0.55));
  }

  _buildParticles() {
    this.coinBurst = this.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 160 }, scale: { start: 0.7, end: 0 },
      lifespan: 350, tint: 0xffd23e, emitting: false,
    });
    this.hitBurst = this.add.particles(0, 0, 'spark', {
      speed: { min: 80, max: 240 }, scale: { start: 0.9, end: 0 },
      lifespan: 450, tint: [0xff6b5e, 0xffffff], emitting: false,
    });
    this.speedLines = this.add.particles(0, 0, 'spark', {
      x: { min: 10, max: GAME_W - 10 }, y: -10,
      speedY: { min: 600, max: 1100 }, scaleX: 0.15, scaleY: { start: 2.4, end: 0.4 },
      alpha: { start: 0.25, end: 0 }, lifespan: 600, frequency: 80, tint: 0xffffff,
    });
    this.speedLines.stop();
  }

  _makeGhost(r) {
    const color = SLOT_COLORS[r.slot % SLOT_COLORS.length];
    const ring = this.add.image(this.laneX[1], this.playerY + 40, 'ring')
      .setTint(color).setAlpha(0.7).setDepth(5);
    const sprite = this.add.image(this.laneX[1], this.playerY, textureKey(r.skin))
      .setAlpha(0.62).setDepth(6);
    const label = this.add.text(this.laneX[1], this.playerY - 66, r.name, {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: 'bold',
      color: '#ffffff', stroke: '#1c2440', strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0.9).setDepth(6);
    const arrow = this.add.text(this.laneX[1], 118, '▲', {
      fontFamily: 'system-ui, sans-serif', fontSize: '20px',
      color: '#ffffff', stroke: '#1c2440', strokeThickness: 4,
    }).setOrigin(0.5).setVisible(false).setDepth(6);
    arrow.setTint(color);

    this.ghosts.set(r.slot, {
      slot: r.slot, name: r.name, color,
      ring, sprite, label, arrow,
      d: 0, v: this.speedStart, lane: 1, jy: 0, sl: 0, lives: LIVES, sc: 0,
      alive: true, seen: false, dispD: 0, dispX: this.laneX[1], lastAt: 0,
    });
  }

  // ------------------------------------------------------------------
  // input: swipe no touch + setas/WASD no desktop (para testes)
  // ------------------------------------------------------------------
  _setupInput() {
    let start = null;
    this.input.on('pointerdown', (p) => { start = { x: p.x, y: p.y }; });
    this.input.on('pointerup', (p) => {
      if (!start) return;
      const dx = p.x - start.x, dy = p.y - start.y;
      start = null;
      if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
      if (Math.abs(dx) > Math.abs(dy)) this._move(dx > 0 ? 1 : -1);
      else if (dy < 0) this._jump();
      else this._slide();
    });

    const k = this.input.keyboard;
    if (k) {
      k.on('keydown-LEFT', () => this._move(-1));
      k.on('keydown-RIGHT', () => this._move(1));
      k.on('keydown-UP', () => this._jump());
      k.on('keydown-DOWN', () => this._slide());
      k.on('keydown-A', () => this._move(-1));
      k.on('keydown-D', () => this._move(1));
      k.on('keydown-W', () => this._jump());
      k.on('keydown-S', () => this._slide());
      k.on('keydown-SPACE', () => this._jump());
    }
  }

  _move(dir) {
    if (!this.running || this.dead) return;
    const target = Phaser.Math.Clamp(this.lane + dir, 0, 2);
    if (target === this.lane) return;
    this.lane = target;
    sfx.lane();
    this.tweens.add({ targets: this.player, x: this.laneX[target], duration: LANE_TWEEN, ease: 'sine.out' });
    this.tweens.add({ targets: this.shadow, x: this.laneX[target], duration: LANE_TWEEN, ease: 'sine.out' });
    this.player.setAngle(dir * 10);
    this.tweens.add({ targets: this.player, angle: 0, duration: 180, delay: 60 });
  }

  _jump() {
    if (!this.running || this.dead || this.jumpT >= 0) return;
    this.slideT = -1;
    this.jumpT = 0;
    sfx.jump();
  }

  _slide() {
    if (!this.running || this.dead || this.slideT >= 0) return;
    this.jumpT = -1;
    this.slideT = 0;
    sfx.slide();
  }

  get jumpY() {
    if (this.jumpT < 0) return 0;
    return Math.sin(Math.PI * (this.jumpT / JUMP_DURATION));
  }
  get sliding() { return this.slideT >= 0; }

  // ------------------------------------------------------------------
  // API chamada pelo main.js
  // ------------------------------------------------------------------
  beginRun() {
    this.running = true;
    this.idleTween.stop();
    this.player.y = this.playerY;
  }

  freezeRun() { this.running = false; }

  // Snapshot do host: lista de estados já desempacotados.
  applySnapshot(states) {
    const now = this.time.now;
    for (const st of states) {
      const g = this.ghosts.get(st.slot);
      if (!g) continue;
      if (g.seen) {
        const dt = (now - g.lastAt) / 1000;
        if (dt > 0.01) g.v = Phaser.Math.Clamp((st.d - g.d) / dt, 0, this.speedMax + 10);
      } else {
        g.dispD = st.d;
      }
      g.d = st.d; g.lane = st.ln; g.jy = st.jy; g.sl = st.sl;
      g.lives = st.lv; g.sc = st.sc; g.lastAt = now; g.seen = true;
      if (st.dead && g.alive) this.remoteDead(st.slot);
    }
  }

  remoteDead(slot) {
    const g = this.ghosts.get(slot);
    if (!g || !g.alive) return;
    g.alive = false;
    g.sprite.setTint(0x666a80).setAlpha(0.3);
    g.ring.setAlpha(0.2);
    g.label.setText('💀 ' + g.name).setAlpha(0.5);
    g.arrow.setVisible(false);
  }

  getStats() {
    return {
      d: Math.floor(this.dist),
      sc: Math.floor(this.dist * SCORE_PER_M + this.coins * COIN_VALUE),
      co: this.coins,
      kmh: Math.round(this.topSpeed * 3.6),
    };
  }

  // Estado compacto para a rede.
  getNetState() {
    return {
      d: this.dist, ln: this.lane, jy: this.jumpY, sl: this.sliding,
      lv: this.lives, sc: this.getStats().sc, co: this.coins, dead: this.dead,
    };
  }

  // ------------------------------------------------------------------
  update(_, delta) {
    const dt = Math.min(delta / 1000, 0.05);

    if (this.running && !this.dead) {
      this.elapsed += dt;
      const accel = (this.speed < this.rampUntil ? SPEED_ACCEL_EARLY : SPEED_ACCEL_LATE) * this.diff.mult;
      this.speed = Math.min(this.speedMax, this.speed + accel * dt);
      if (this.speed > this.topSpeed) this.topSpeed = this.speed;
      this.dist += this.speed * dt;

      this._updateActions(dt);
      this._checkCollisions();
      this._collectCoins();
    }

    if (!this.running) return;

    this._scroll(dt);
    this._syncSprites();
    if (this.isNet) this._updateGhosts(dt);

    this._stateAcc += dt;
    if (this._stateAcc >= 1 / STATE_HZ) {
      this._stateAcc = 0;
      if (this.hooks.sendState) this.hooks.sendState(this.getNetState());
    }

    this._hudAcc += dt;
    if (this._hudAcc >= 0.1) {
      this._hudAcc = 0;
      this._pushHUD();
    }

    this._pruneAcc += dt;
    if (this._pruneAcc > 3) { this._pruneAcc = 0; this.track.prune(this.dist); }

    if (this.speed > this.speedStart + 6 && !this.speedLines.emitting) this.speedLines.start();
  }

  _pushHUD() {
    if (!this.hooks.updateHUD) return;
    const rivals = [];
    for (const g of this.ghosts.values()) {
      rivals.push({
        slot: g.slot, name: g.name, color: g.color,
        dist: Math.floor(g.dispD), lives: g.lives,
        alive: g.alive, delta: Math.floor(g.dispD - this.dist),
      });
    }
    rivals.sort((a, b) => b.dist - a.dist);
    this.hooks.updateHUD({
      dist: Math.floor(this.dist),
      coins: this.coins,
      lives: this.lives,
      kmh: Math.round(this.speed * 3.6),
      speedFrac: (this.speed - this.speedStart) / (this.speedMax - this.speedStart),
      rivals,
    });
  }

  _updateActions(dt) {
    if (this.invulnT > 0) {
      this.invulnT -= dt;
      this.player.setAlpha(Math.sin(this.time.now / 40) > 0 ? 0.35 : 0.9);
      if (this.invulnT <= 0) this.player.setAlpha(1);
    }

    if (this.jumpT >= 0) {
      this.jumpT += dt;
      if (this.jumpT >= JUMP_DURATION) {
        this.jumpT = -1;
        this.player.y = this.playerY;
        this.player.setScale(1);
        this.shadow.setScale(1).setAlpha(1);
      } else {
        const y = this.jumpY;
        this.player.y = this.playerY - y * JUMP_HEIGHT;
        this.player.setScale(1 + y * 0.18);
        this.shadow.setScale(1 - y * 0.45).setAlpha(1 - y * 0.5);
      }
    } else if (this.slideT >= 0) {
      this.slideT += dt;
      if (this.slideT >= SLIDE_DURATION) {
        this.slideT = -1;
        this.player.setScale(1);
        this.player.y = this.playerY;
      } else {
        this.player.setScale(1.15, 0.55);
        this.player.y = this.playerY + 20;
      }
    } else if (!this.dead) {
      this.player.y = this.playerY + Math.sin(this.time.now / 55) * 3;
    }
  }

  _checkCollisions() {
    if (this.invulnT > 0) return;
    const front = this.dist + 1.0, back = this.dist - 1.0;
    for (const o of this.track.obstacles) {
      if (o.done || o.lane !== this.lane) continue;
      if (o.d > front || o.d + o.len < back) continue;
      const safe =
        ((o.type === 'low' || o.type === 'hole') && this.jumpY > 0.3) ||
        (o.type === 'high' && this.sliding);
      if (safe) continue;
      this._takeHit(o);
      break;
    }
  }

  _takeHit(o) {
    o.done = true;
    this.lives--;
    this.invulnT = INVULN_TIME;
    this.hitBurst.emitParticleAt(this.player.x, this.player.y, 18);
    this.cameras.main.shake(180, 0.012);
    // colidir custa velocidade: dá chance de quem está atrás alcançar
    this.speed = Math.max(this.speedStart, this.speed * 0.75);
    sfx.hit();
    if (this.hooks.onHit) this.hooks.onHit(this.lives);
    if (this.lives <= 0) this._die();
  }

  _die() {
    this.dead = true;
    sfx.death();
    this.hitBurst.emitParticleAt(this.player.x, this.player.y, 40);
    this.tweens.add({
      targets: this.player, angle: 180, scale: 0.3, alpha: 0.2, duration: 700, ease: 'sine.in',
    });
    this.speedLines.stop();
    if (this.hooks.onDead) this.hooks.onDead(this.getStats());
  }

  _collectCoins() {
    for (const c of this.track.coins) {
      if (c.taken || c.lane !== this.lane) continue;
      if (Math.abs(c.d - this.dist) > 1.8) continue;
      c.taken = true;
      this.coins++;
      sfx.coin();
      const s = this.coinSprites.get(c.id);
      if (s) {
        this.coinBurst.emitParticleAt(s.x, s.y, 8);
        this.tweens.add({
          targets: s, y: s.y - 40, alpha: 0, scale: 1.6, duration: 200,
          onComplete: () => { s.destroy(); this.coinSprites.delete(c.id); },
        });
      }
    }
  }

  _scroll(dt) {
    const px = this.speed * PX_PER_M * dt;
    this.dashes.forEach(d => { d.tilePositionY -= px; });
    this.sideL.tilePositionY -= px * 0.8;
    this.sideR.tilePositionY -= px * 0.8;
  }

  _worldY(d, len = 0) {
    return this.playerY - (d - this.dist) * PX_PER_M - len * PX_PER_M / 2;
  }

  _syncSprites() {
    const viewAhead = this.dist + (GAME_H / PX_PER_M) + 20;
    const viewBehind = this.dist - 25;
    this.track.ensure(viewAhead);

    for (const o of this.track.obstacles) {
      if (o.d + o.len < viewBehind || o.d > viewAhead) {
        const s = this.obSprites.get(o.id);
        if (s) { s.destroy(); this.obSprites.delete(o.id); }
        continue;
      }
      let s = this.obSprites.get(o.id);
      if (!s) {
        s = this.add.image(this.laneX[o.lane], 0, 'ob-' + o.type);
        s.setDepth(o.type === 'high' ? 5 : 2);
        this.obSprites.set(o.id, s);
      }
      s.y = this._worldY(o.d, o.type === 'train' ? o.len * 0.8 : 0);
    }

    for (const c of this.track.coins) {
      if (c.taken) continue;
      if (c.d < viewBehind || c.d > viewAhead) {
        const s = this.coinSprites.get(c.id);
        if (s) { s.destroy(); this.coinSprites.delete(c.id); }
        continue;
      }
      let s = this.coinSprites.get(c.id);
      if (!s) {
        s = this.add.image(this.laneX[c.lane], 0, 'coin').setDepth(3);
        this.tweens.add({ targets: s, scaleX: 0.25, duration: 400, yoyo: true, repeat: -1, ease: 'sine.inOut' });
        this.coinSprites.set(c.id, s);
      }
      s.y = this._worldY(c.d);
    }
  }

  _updateGhosts(dt) {
    for (const g of this.ghosts.values()) {
      if (!g.seen) continue;

      if (g.alive) {
        // extrapola com a última velocidade conhecida e corrige suavemente
        // na direção do último estado — evita o rival "teleportando"
        const age = (this.time.now - g.lastAt) / 1000;
        const target = g.d + g.v * Math.min(age, 0.6);
        g.dispD += g.v * dt;
        g.dispD = Phaser.Math.Linear(g.dispD, target, 0.12);
      }

      const targetX = this.laneX[g.lane] ?? this.laneX[1];
      g.dispX = Phaser.Math.Linear(g.dispX, targetX, 0.25);

      let y = this.playerY - (g.dispD - this.dist) * PX_PER_M;
      const above = y < 92;
      const below = y > GAME_H - 40;
      g.arrow.setVisible(above && g.alive);
      if (above) g.arrow.setPosition(g.dispX, 104);
      y = Phaser.Math.Clamp(y, 92, GAME_H - 40);

      const jumpOff = (g.jy || 0) * JUMP_HEIGHT;
      g.sprite.setPosition(g.dispX, y - jumpOff);
      g.sprite.setScale(g.sl ? 1.15 : 1, g.sl ? 0.55 : 1);
      g.ring.setPosition(g.dispX, y + 40);
      g.label.setPosition(g.dispX, y - jumpOff - 66);

      if (g.alive) {
        const faded = above || below;
        g.sprite.setAlpha(faded ? 0.28 : 0.62);
        g.label.setAlpha(faded ? 0.35 : 0.9);
        g.ring.setAlpha(faded ? 0.25 : 0.7);
      }
    }
  }
}
