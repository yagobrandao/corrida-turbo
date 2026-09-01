// Cena única de gameplay. Cada celular simula APENAS o próprio jogador
// contra a pista (gerada pela seed compartilhada) e renderiza o rival como
// um "ghost" interpolado a partir dos estados recebidos pela rede.
import Phaser from 'phaser';
import {
  GAME_W, GAME_H, LANE_W, PLAYER_Y_FRAC, PX_PER_M,
  SPEED_START, SPEED_MAX, SPEED_RAMP_UNTIL, SPEED_ACCEL_EARLY, SPEED_ACCEL_LATE,
  JUMP_DURATION, SLIDE_DURATION, LANE_TWEEN,
  INVULN_TIME, LIVES, STATE_HZ, COIN_VALUE, SCORE_PER_M,
} from '../core/config.js';
import { Track } from '../world/track.js';
import { buildTextures } from './textures.js';
import { sfx } from './audio.js';

const SWIPE_MIN = 26; // px mínimos para contar como swipe

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('run');
  }

  init(data) {
    this.seed = data.seed;
    this.isNet = !!data.isNet;
    this.hooks = data.hooks || {};
    this.oppName = data.oppName || 'Rival';
  }

  create() {
    const W = GAME_W, H = GAME_H;
    if (!this.textures.exists('runner-p1')) buildTextures(this);

    this.laneX = [W / 2 - LANE_W, W / 2, W / 2 + LANE_W];
    this.playerY = H * PLAYER_Y_FRAC;

    // ---------- cenário ----------
    const roadW = LANE_W * 3 + 30;
    const roadX = W / 2 - roadW / 2;
    this.add.rectangle(W / 2, H / 2, W, H, 0x1b2246); // fundo
    this.sideL = this.add.tileSprite(roadX / 2, H / 2, roadX, H, 'side-tile');
    this.sideR = this.add.tileSprite(W - roadX / 2, H / 2, roadX, H, 'side-tile');
    this.add.rectangle(W / 2, H / 2, roadW, H, 0x3a4166); // asfalto
    this.add.rectangle(roadX + 2, H / 2, 5, H, 0xf4d35e); // guias amarelas
    this.add.rectangle(roadX + roadW - 2, H / 2, 5, H, 0xf4d35e);
    this.dashes = [
      this.add.tileSprite(W / 2 - LANE_W / 2, H / 2, 8, H, 'dash'),
      this.add.tileSprite(W / 2 + LANE_W / 2, H / 2, 8, H, 'dash'),
    ];
    this.dashes.forEach(d => d.setAlpha(0.55));

    // ---------- sprites do mundo (obstáculos/moedas) ----------
    this.obSprites = new Map();   // id -> sprite
    this.coinSprites = new Map(); // id -> sprite

    // ---------- rival (ghost) ----------
    if (this.isNet) {
      this.oppShadow = this.add.image(this.laneX[1], this.playerY + 34, 'shadow').setAlpha(0.4);
      this.oppSprite = this.add.image(this.laneX[1], this.playerY, 'runner-p2').setAlpha(0.6);
      this.oppLabel = this.add.text(this.laneX[1], this.playerY - 62, this.oppName, {
        fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: 'bold',
        color: '#ffd0a0', stroke: '#1c2440', strokeThickness: 3,
      }).setOrigin(0.5).setAlpha(0.9);
      this.oppArrow = this.add.text(this.laneX[1], 120, '▲', {
        fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#ff8b3d',
        stroke: '#1c2440', strokeThickness: 4,
      }).setOrigin(0.5).setVisible(false);
    }

    // ---------- jogador ----------
    this.shadow = this.add.image(this.laneX[1], this.playerY + 36, 'shadow');
    this.player = this.add.image(this.laneX[1], this.playerY, 'runner-p1');
    this.idleTween = this.tweens.add({
      targets: this.player, y: this.playerY - 7, duration: 320,
      yoyo: true, repeat: -1, ease: 'sine.inOut',
    });

    // ---------- partículas ----------
    this.coinBurst = this.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 160 }, scale: { start: 0.7, end: 0 },
      lifespan: 350, tint: 0xffd23e, emitting: false,
    });
    this.hitBurst = this.add.particles(0, 0, 'spark', {
      speed: { min: 80, max: 240 }, scale: { start: 0.9, end: 0 },
      lifespan: 450, tint: [0xff6b5e, 0xffffff], emitting: false,
    });
    this.speedLines = this.add.particles(0, 0, 'spark', {
      x: { min: 10, max: W - 10 }, y: -10,
      speedY: { min: 500, max: 900 }, scaleX: 0.15, scaleY: { start: 2.2, end: 0.4 },
      alpha: { start: 0.25, end: 0 }, lifespan: 600, frequency: 90, tint: 0xffffff,
    });
    this.speedLines.stop();

    // ---------- estado da corrida ----------
    this.track = new Track(this.seed);
    this.track.ensure(0);
    this.running = false;
    this.dead = false;
    this.dist = 0;
    this.speed = SPEED_START;
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

    // estado interpolado do rival
    this.opp = {
      d: 0, v: SPEED_START, lane: 1, jy: 0, sl: 0, lives: LIVES,
      alive: true, dispD: 0, dispX: this.laneX[1], lastAt: 0, seen: false,
    };

    this._setupInput();
    this._syncSprites(); // popula o trecho inicial da pista antes do countdown
  }

  // ------------------------------------------------------------------
  // input: swipe no touch + setas/WASD no desktop (para testes)
  // ------------------------------------------------------------------
  _setupInput() {
    let start = null;
    this.input.on('pointerdown', (p) => { start = { x: p.x, y: p.y, t: p.time }; });
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
    this.tweens.add({
      targets: this.player, x: this.laneX[target],
      duration: LANE_TWEEN, ease: 'sine.out',
    });
    this.tweens.add({
      targets: this.shadow, x: this.laneX[target],
      duration: LANE_TWEEN, ease: 'sine.out',
    });
    // inclinada rápida para dar peso ao movimento
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

  // fração do pulo em [0..1] (altura normalizada)
  get jumpY() {
    if (this.jumpT < 0) return 0;
    return Math.sin(Math.PI * (this.jumpT / JUMP_DURATION));
  }
  get sliding() { return this.slideT >= 0; }

  // ------------------------------------------------------------------
  // chamadas de fora (main.js)
  // ------------------------------------------------------------------
  beginRun() {
    this.running = true;
    this.idleTween.stop();
    this.player.y = this.playerY;
  }

  applyRemoteState(st) {
    const now = this.time.now;
    const o = this.opp;
    if (o.seen) {
      const dt = (now - o.lastAt) / 1000;
      if (dt > 0.01) o.v = Phaser.Math.Clamp((st.d - o.d) / dt, 0, SPEED_MAX + 8);
    } else {
      o.dispD = st.d;
    }
    o.d = st.d; o.lane = st.ln; o.jy = st.jy; o.sl = st.sl;
    o.lives = st.lv; o.lastAt = now; o.seen = true;
  }

  remoteDead() {
    this.opp.alive = false;
    if (this.oppSprite) {
      this.oppSprite.setTint(0x666a80);
      this.oppLabel.setText('💀 ' + this.oppName);
    }
  }

  freezeRun() {
    this.running = false;
  }

  getStats() {
    return {
      d: Math.floor(this.dist),
      sc: Math.floor(this.dist * SCORE_PER_M + this.coins * COIN_VALUE),
      co: this.coins,
    };
  }

  // ------------------------------------------------------------------
  update(_, delta) {
    const dt = Math.min(delta / 1000, 0.05);

    if (this.running && !this.dead) {
      this.elapsed += dt;
      // aceleração em duas fases: rampa inicial agressiva para a corrida
      // engatar rápido, depois um crescimento lento e contínuo
      const accel = this.speed < SPEED_RAMP_UNTIL ? SPEED_ACCEL_EARLY : SPEED_ACCEL_LATE;
      this.speed = Math.min(SPEED_MAX, this.speed + accel * dt);
      this.dist += this.speed * dt;

      this._updateActions(dt);
      this._checkCollisions();
      this._collectCoins();
    }

    if (this.running) {
      this._scroll(dt);
      this._syncSprites();
      if (this.isNet) this._updateOpponent(dt);

      // envia estado ao rival em STATE_HZ
      this._stateAcc += dt;
      if (this._stateAcc >= 1 / STATE_HZ) {
        this._stateAcc = 0;
        if (this.hooks.sendState && !this.dead) {
          this.hooks.sendState({
            d: Math.round(this.dist * 10) / 10,
            ln: this.lane,
            jy: Math.round(this.jumpY * 100) / 100,
            sl: this.sliding ? 1 : 0,
            lv: this.lives,
            co: this.coins,
            sc: this.getStats().sc,
          });
        }
      }

      this._hudAcc += dt;
      if (this._hudAcc >= 0.12) {
        this._hudAcc = 0;
        if (this.hooks.updateHUD) {
          this.hooks.updateHUD({
            dist: Math.floor(this.dist),
            coins: this.coins,
            lives: this.lives,
            opp: this.isNet ? {
              dist: Math.floor(this.opp.dispD),
              lives: this.opp.lives,
              alive: this.opp.alive,
              delta: Math.floor(this.opp.dispD - this.dist),
            } : null,
          });
        }
      }

      this._pruneAcc += dt;
      if (this._pruneAcc > 3) { this._pruneAcc = 0; this.track.prune(this.dist); }

      // linhas de velocidade em alta velocidade
      if (this.speed > 19 && !this.speedLines.emitting) this.speedLines.start();
    }
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
        this.player.y = this.playerY - y * 105;
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
    } else if (this.running && !this.dead) {
      // trotezinho de corrida
      this.player.y = this.playerY + Math.sin(this.time.now / 55) * 3;
    }
  }

  _checkCollisions() {
    if (this.invulnT > 0) return;
    const front = this.dist + 1.0, back = this.dist - 1.0;
    for (const o of this.track.obstacles) {
      if (o.done || o.lane !== this.lane) continue;
      if (o.d > front || o.d + o.len < back) continue;
      // sobreposição na minha faixa: dá para escapar?
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
      if (Math.abs(c.d - this.dist) > 1.6) continue;
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
    // ponto MAIS PRÓXIMO do jogador (frente do obstáculo) fica na base do sprite
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
      if (c.taken || c.d < viewBehind || c.d > viewAhead) {
        if (!this.coinSprites.has(c.id)) continue;
        if (c.d < viewBehind || c.d > viewAhead) {
          const s = this.coinSprites.get(c.id);
          if (s) { s.destroy(); this.coinSprites.delete(c.id); }
        }
        continue;
      }
      let s = this.coinSprites.get(c.id);
      if (!s) {
        s = this.add.image(this.laneX[c.lane], 0, 'coin').setDepth(3);
        this.tweens.add({
          targets: s, scaleX: 0.25, duration: 400, yoyo: true, repeat: -1, ease: 'sine.inOut',
        });
        this.coinSprites.set(c.id, s);
      }
      s.y = this._worldY(c.d);
    }

    // jogador e ghost sempre por cima
    this.shadow.setDepth(8);
    this.player.setDepth(10);
    if (this.oppSprite) {
      this.oppShadow.setDepth(6);
      this.oppSprite.setDepth(7);
      this.oppLabel.setDepth(7);
    }
  }

  _updateOpponent(dt) {
    const o = this.opp;
    if (!o.seen) return;

    if (o.alive) {
      // extrapola a posição com a última velocidade conhecida e
      // corrige suavemente na direção do último estado recebido
      const age = (this.time.now - o.lastAt) / 1000;
      const target = o.d + o.v * Math.min(age, 0.6);
      o.dispD += o.v * dt;
      o.dispD = Phaser.Math.Linear(o.dispD, target, 0.12);
    }

    const targetX = this.laneX[o.lane] ?? this.laneX[1];
    o.dispX = Phaser.Math.Linear(o.dispX, targetX, 0.25);

    let y = this.playerY - (o.dispD - this.dist) * PX_PER_M;
    const offScreenTop = y < 90;
    const offScreenBot = y > GAME_H - 40;
    this.oppArrow.setVisible(offScreenTop && o.alive);
    if (offScreenTop) this.oppArrow.setPosition(o.dispX, 100);
    y = Phaser.Math.Clamp(y, 90, GAME_H - 40);

    const jumpOff = (o.jy || 0) * 105;
    this.oppSprite.setPosition(o.dispX, y - jumpOff);
    this.oppSprite.setScale(o.sl ? 1.15 : 1, o.sl ? 0.55 : 1);
    this.oppShadow.setPosition(o.dispX, y + 34);
    this.oppLabel.setPosition(o.dispX, y - jumpOff - 62);
    const faded = offScreenTop || offScreenBot;
    this.oppSprite.setAlpha(faded ? 0.25 : 0.6);
    this.oppLabel.setAlpha(faded ? 0.3 : 0.9);
    this.oppShadow.setAlpha(faded ? 0.1 : 0.4);
  }
}
