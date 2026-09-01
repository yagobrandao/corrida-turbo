// Flappy Duo — física própria, visual próprio, nada copiado.
//
// Cada aparelho simula APENAS o próprio pássaro. Os canos vêm da seed
// compartilhada (todos enfrentam a mesma sequência); os rivais são ghosts
// desenhados a partir da altura que chega pela rede.
import Phaser from 'phaser';
import { GAME_W, GAME_H, slotColor } from '../../core/config.js';
import { Rng } from '../../core/rng.js';
import { sfx } from '../../core/audio.js';

// física (px/s) — pensada para tela de 854 de altura
const GRAVITY = 1650;
const FLAP_VY = -520;
const MAX_FALL = 780;

// mundo
const BIRD_X = GAME_W * 0.30;
const PIPE_W = 74;
const SPEED0 = 165;          // px/s dos canos
const SPEED_GAIN = 2.6;      // aceleração por segundo
const SPEED_MAX = 330;

const DIFF = {
  facil:   { gap0: 250, gapMin: 195, every0: 2.1 },
  normal:  { gap0: 225, gapMin: 168, every0: 1.9 },
  dificil: { gap0: 200, gapMin: 148, every0: 1.7 },
};

export default class FlappyScene extends Phaser.Scene {
  constructor() { super('flappy'); }

  init(data) {
    this.seed = data.seed;
    this.isNet = !!data.isNet;
    this.hooks = data.hooks || {};
    this.mySlot = data.mySlot || 0;
    this.rivals = data.rivals || [];
    this.tuning = DIFF[data.difficulty] || DIFF.normal;
  }

  create() {
    const W = GAME_W, H = GAME_H;
    this._buildTextures();

    // céu em degradê + colinas + chão
    this.add.rectangle(W / 2, H / 2, W, H, 0x8fd3f4);
    this.add.rectangle(W / 2, H * 0.25, W, H * 0.5, 0xa8e0fa);
    this.hillsFar = this.add.tileSprite(W / 2, H - 150, W, 140, 'fp-hills').setAlpha(0.55);
    this.hillsNear = this.add.tileSprite(W / 2, H - 105, W, 140, 'fp-hills');
    this.groundY = H - 58;
    this.ground = this.add.tileSprite(W / 2, H - 29, W, 58, 'fp-ground').setDepth(6);

    this.pipes = [];         // { x, gapY, gapH, passed, top, bot, capT, capB }
    this.rng = new Rng(this.seed);

    // ghosts dos rivais
    this.ghosts = new Map();
    for (const r of this.rivals) {
      const color = slotColor(r.slot);
      const spr = this.add.image(BIRD_X - 26 - r.slot * 6, H / 2, 'fp-bird')
        .setTint(color).setAlpha(0.5).setDepth(4);
      const label = this.add.text(spr.x, H / 2 - 34, r.name, {
        fontFamily: 'system-ui, sans-serif', fontSize: '13px', fontStyle: 'bold',
        color: '#ffffff', stroke: '#204060', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(4).setAlpha(0.85);
      this.ghosts.set(r.slot, {
        slot: r.slot, name: r.name, spr, label,
        y: H / 2, vy: 0, score: 0, alive: true, seen: false, dispY: H / 2, lastAt: 0,
      });
    }

    // meu pássaro
    this.bird = this.add.image(BIRD_X, H / 2, 'fp-bird')
      .setTint(slotColor(this.mySlot)).setDepth(5);

    this.burst = this.add.particles(0, 0, 'fp-feather', {
      speed: { min: 90, max: 260 }, scale: { start: 1, end: 0 },
      lifespan: 600, emitting: false, rotate: { min: 0, max: 360 },
    });

    // estado
    this.running = false;
    this.paused = false;
    this.dead = false;
    this.y = H / 2;
    this.vy = 0;
    this.score = 0;
    this.elapsed = 0;
    this.speed = SPEED0;
    this.nextPipeIn = 1.2;
    this._stateAcc = 0;

    this.input.on('pointerdown', () => this.flap());
    const k = this.input.keyboard;
    if (k) {
      k.on('keydown-SPACE', () => this.flap());
      k.on('keydown-UP', () => this.flap());
    }
  }

  flap() {
    if (!this.running || this.dead || this.paused) return;
    this.vy = FLAP_VY;
    sfx.jump();
    this.tweens.add({ targets: this.bird, angle: -24, duration: 90 });
  }

  beginRun() { this.running = true; }
  freezeRun() { this.running = false; }

  applyRemote(st) {
    const g = this.ghosts.get(st.slot);
    if (!g) return;
    g.y = st.y; g.vy = st.vy; g.score = st.sc;
    g.lastAt = this.time.now;
    if (!g.seen) { g.dispY = st.y; g.seen = true; }
    if (st.dead && g.alive) this.remoteDead(st.slot);
  }

  remoteDead(slot) {
    const g = this.ghosts.get(slot);
    if (!g || !g.alive) return;
    g.alive = false;
    g.spr.setTint(0x778) .setAlpha(0.25);
    g.label.setText('💀 ' + g.name).setAlpha(0.5);
  }

  getStats() { return { sc: this.score }; }
  getNetState() {
    return { y: Math.round(this.y), vy: Math.round(this.vy), sc: this.score, dead: this.dead };
  }

  update(_, delta) {
    if (this.paused || !this.running) return;
    const dt = Math.min(delta / 1000, 0.04);

    if (!this.dead) {
      this.elapsed += dt;
      this.speed = Math.min(SPEED_MAX, this.speed + SPEED_GAIN * dt);

      // física do pássaro
      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
      this.y += this.vy * dt;
      this.bird.y = this.y;
      this.bird.angle = Phaser.Math.Clamp(this.bird.angle + 90 * dt, -24, 62);

      this._spawnPipes(dt);
      this._movePipes(dt);
      this._collide();
      this._sendState(dt);
    } else {
      // morto: cai até o chão, o mundo continua para os ghosts
      if (this.y < this.groundY - 14) {
        this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
        this.y += this.vy * dt;
        this.bird.y = this.y;
        this.bird.angle += 220 * dt;
      }
      this._movePipes(dt);
    }

    // cenário
    const px = this.speed * dt;
    this.ground.tilePositionX += px;
    this.hillsNear.tilePositionX += px * 0.4;
    this.hillsFar.tilePositionX += px * 0.15;

    this._updateGhosts(dt);
    if (this.hooks.updateHUD) this.hooks.updateHUD(this._hudState());
  }

  _hudState() {
    const rivals = [...this.ghosts.values()].map(g => ({
      slot: g.slot, name: g.name, score: g.score, alive: g.alive,
    })).sort((a, b) => b.score - a.score);
    return { score: this.score, rivals };
  }

  _sendState(dt) {
    this._stateAcc += dt;
    if (this._stateAcc >= 1 / 15) {   // 15 Hz: o voo muda rápido
      this._stateAcc = 0;
      if (this.hooks.sendState) this.hooks.sendState(this.getNetState());
    }
  }

  _spawnPipes(dt) {
    this.nextPipeIn -= dt;
    if (this.nextPipeIn > 0) return;

    // dificuldade progressiva e determinística: depende só de quantos canos
    // já nasceram (mesma contagem em todos os aparelhos)
    const n = this._spawned = (this._spawned || 0) + 1;
    const t = this.tuning;
    const gapH = Math.max(t.gapMin, t.gap0 - n * 1.6);
    const margin = 90;
    const gapY = margin + this.rng.next() * (this.groundY - margin * 2 - gapH) + gapH / 2;

    const top = this.add.tileSprite(GAME_W + PIPE_W, (gapY - gapH / 2) / 2, PIPE_W, gapY - gapH / 2, 'fp-pipe').setDepth(3);
    const bot = this.add.tileSprite(GAME_W + PIPE_W, (gapY + gapH / 2 + this.groundY) / 2, PIPE_W, this.groundY - gapY - gapH / 2, 'fp-pipe').setDepth(3);
    const capT = this.add.image(GAME_W + PIPE_W, gapY - gapH / 2 - 11, 'fp-cap').setDepth(3);
    const capB = this.add.image(GAME_W + PIPE_W, gapY + gapH / 2 + 11, 'fp-cap').setDepth(3);

    this.pipes.push({ x: GAME_W + PIPE_W, gapY, gapH, passed: false, top, bot, capT, capB });

    // intervalo entre canos também encolhe aos poucos
    const every = Math.max(1.15, t.every0 - n * 0.012);
    this.nextPipeIn = every * (SPEED0 / this.speed);
  }

  _movePipes(dt) {
    const px = this.speed * dt;
    for (const p of this.pipes) {
      p.x -= px;
      p.top.x = p.bot.x = p.capT.x = p.capB.x = p.x;
      if (!p.passed && !this.dead && p.x + PIPE_W / 2 < BIRD_X - 14) {
        p.passed = true;
        this.score++;
        sfx.coin();
      }
    }
    while (this.pipes.length && this.pipes[0].x < -PIPE_W) {
      const p = this.pipes.shift();
      p.top.destroy(); p.bot.destroy(); p.capT.destroy(); p.capB.destroy();
    }
  }

  _collide() {
    // teto e chão
    if (this.y < 12) { this.y = 12; this.vy = 40; }
    if (this.y >= this.groundY - 14) { this._die(); return; }

    const bx = BIRD_X, by = this.y, r = 15;
    for (const p of this.pipes) {
      if (Math.abs(p.x - bx) > PIPE_W / 2 + r - 4) continue;
      const top = p.gapY - p.gapH / 2, bot = p.gapY + p.gapH / 2;
      if (by - r + 5 < top || by + r - 5 > bot) { this._die(); return; }
    }
  }

  _die() {
    if (this.dead) return;
    this.dead = true;
    sfx.death();
    this.burst.emitParticleAt(this.bird.x, this.bird.y, 16);
    this.cameras.main.shake(160, 0.01);
    if (this.hooks.onDead) this.hooks.onDead(this.getStats());
  }

  _updateGhosts(dt) {
    for (const g of this.ghosts.values()) {
      if (!g.seen) continue;
      if (g.alive) {
        // extrapola a queda/subida com a última velocidade conhecida
        const age = (this.time.now - g.lastAt) / 1000;
        const target = g.y + g.vy * Math.min(age, 0.4);
        g.dispY += g.vy * dt;
        g.dispY = Phaser.Math.Linear(g.dispY, target, 0.2);
        g.dispY = Phaser.Math.Clamp(g.dispY, 12, this.groundY - 10);
      }
      g.spr.y = g.dispY;
      g.label.y = g.dispY - 34;
    }
  }

  _buildTextures() {
    if (this.textures.exists('fp-bird')) return;
    const g = this.make.graphics({ add: false });

    // pássaro: corpo redondo branco (tingido pela cor do slot) + asa + bico
    g.fillStyle(0x204060, 1);
    g.fillCircle(19, 19, 17);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(19, 19, 15);
    g.fillStyle(0xe8e8e8, 1);
    g.fillEllipse(13, 22, 14, 9);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(25, 14, 6);
    g.fillStyle(0x204060, 1);
    g.fillCircle(27, 14, 3);
    g.fillStyle(0xffb23e, 1);
    g.fillTriangle(32, 18, 32, 25, 41, 21);
    g.generateTexture('fp-bird', 42, 38);

    // cano: verde com listras
    g.clear();
    g.fillStyle(0x2fa05e, 1);
    g.fillRect(0, 0, PIPE_W, 64);
    g.fillStyle(0x3dbf72, 1);
    g.fillRect(8, 0, 14, 64);
    g.fillStyle(0x1e7a44, 1);
    g.fillRect(PIPE_W - 14, 0, 14, 64);
    g.generateTexture('fp-pipe', PIPE_W, 64);

    // boca do cano
    g.clear();
    g.fillStyle(0x1e7a44, 1);
    g.fillRoundedRect(0, 0, PIPE_W + 12, 22, 6);
    g.fillStyle(0x2fa05e, 1);
    g.fillRoundedRect(2, 2, PIPE_W + 8, 18, 5);
    g.generateTexture('fp-cap', PIPE_W + 12, 22);

    // chão
    g.clear();
    g.fillStyle(0xd9b26a, 1);
    g.fillRect(0, 0, 64, 58);
    g.fillStyle(0x9bd05a, 1);
    g.fillRect(0, 0, 64, 12);
    g.fillStyle(0xc79c53, 1);
    g.fillRect(8, 24, 10, 6);
    g.fillRect(40, 38, 12, 6);
    g.generateTexture('fp-ground', 64, 58);

    // colinas
    g.clear();
    g.fillStyle(0x7ec8a9, 1);
    g.fillEllipse(40, 140, 160, 150);
    g.fillEllipse(130, 140, 190, 190);
    g.fillEllipse(230, 140, 150, 130);
    g.generateTexture('fp-hills', 280, 140);

    // pena (partícula)
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(6, 4, 12, 7);
    g.generateTexture('fp-feather', 12, 8);

    g.destroy();
  }
}
