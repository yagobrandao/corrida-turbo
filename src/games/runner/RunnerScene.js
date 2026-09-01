// Cena única de gameplay. Cada aparelho simula APENAS o próprio jogador
// contra a pista (gerada pela seed compartilhada) e renderiza os rivais como
// "ghosts" interpolados a partir dos snapshots recebidos pela rede.
import Phaser from 'phaser';
import { GAME_W, GAME_H, STATE_HZ, slotColor } from '../../core/config.js';
import {
  LANE_W, PLAYER_Y_FRAC, PX_PER_M,
  SPEED_START, SPEED_MAX, SPEED_RAMP_UNTIL, SPEED_ACCEL_EARLY, SPEED_ACCEL_LATE,
  VISUAL_REF_SPEED, VISUAL_COMPRESS,
  JUMP_DURATION, SLIDE_DURATION, LANE_TWEEN,
  INVULN_TIME, LIVES, COIN_VALUE, SCORE_PER_M, getDifficulty,
} from './config.js';
import { Track } from './track.js';
import { buildTextures, ensureRunnerTexture } from './textures.js';
import { textureKey } from './skins.js';
import { sfx } from '../../core/audio.js';

import { POWERUPS, rollPowerup } from './powerups.js';

const SWIPE_MIN = 26;      // px mínimos para contar como swipe
const JUMP_HEIGHT = 105;   // px no ápice do pulo
const PU_EMOJI = Object.fromEntries(POWERUPS.map(p => [p.id, p.emoji]));

export default class RunnerScene extends Phaser.Scene {
  constructor() {
    super('runner');
  }

  init(data) {
    this.seed = data.seed;
    this.isNet = !!data.isNet;
    this.hooks = data.hooks || {};
    this.mySkin = data.mySkin || 'azul';
    this.myCos = data.myCos || null;
    this.mySlot = data.mySlot || 0;
    this.rivals = data.rivals || [];   // [{ slot, name, skin }]
    // id do power-up -> valor efetivo (duração/potência) já com as melhorias
    this.puValues = data.puValues || {};
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
    // na sala, a cor vem do slot (ninguém fica igual a ninguém);
    // no treino solo vale a cor original da skin escolhida
    // na sala a cor vem do slot; no solo, slot null preserva a cor da skin
    const myTex = ensureRunnerTexture(this, this.mySkin, this.isNet ? this.mySlot : null, this.myCos);
    this.shadow = this.add.image(this.laneX[1], this.playerY + 40, 'shadow').setDepth(8);
    this.player = this.add.image(this.laneX[1], this.playerY, myTex).setDepth(10);
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

    // power-ups: efeitos ativos { puId -> segundos restantes } + extras
    this.effects = new Map();
    this.debuffT = 0;        // "lento" recebido de um rival
    this.bonusScore = 0;     // pontos extras de turbo/x2
    this.puSprites = new Map();

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
    const color = slotColor(r.slot);
    const ring = this.add.image(this.laneX[1], this.playerY + 40, 'ring')
      .setTint(color).setAlpha(0.7).setDepth(5);
    const sprite = this.add.image(this.laneX[1], this.playerY, ensureRunnerTexture(this, r.skin, r.slot, r.cos))
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
      // deslocamento fixo por slot dentro da faixa: na largada todo mundo
      // está no mesmo metro da faixa do meio e ficaria empilhado
      xOff: (r.slot - 2) * 13,
      labelOff: (r.slot % 3) * 16,
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
      sc: Math.floor(this.dist * SCORE_PER_M + this.coins * COIN_VALUE + this.bonusScore),
      co: this.coins,
      kmh: Math.round(this.topSpeed * 3.6),
    };
  }

  // ------------------------------------------------------------------
  // power-ups
  // ------------------------------------------------------------------
  _tickEffects(dt) {
    for (const [id, left] of this.effects) {
      const next = left - dt;
      if (next <= 0) this.effects.delete(id);
      else this.effects.set(id, next);
    }
    if (this.debuffT > 0) this.debuffT -= dt;
  }

  _collectPowerups() {
    const from = Math.min(this.prevDist ?? this.dist, this.dist) - 2;
    const to = this.dist + 2;
    for (const p of this.track.powerups) {
      if (p.taken || p.lane !== this.lane) continue;
      if (p.d < from || p.d > to) continue;
      p.taken = true;
      const s = this.puSprites.get(p.id);
      if (s) {
        this.coinBurst.emitParticleAt(s.bub.x, s.bub.y, 12);
        s.bub.destroy(); s.txt.destroy();
        this.puSprites.delete(p.id);
      }
      // o conteúdo da caixa é aleatório POR JOGADOR: sorteio local, fora da seed
      this.applyPowerup(rollPowerup({ next: Math.random }));
    }
  }

  applyPowerup(puId) {
    const value = this.puValues[puId] ?? 4;
    sfx.powerup();
    switch (puId) {
      case 'vida':
        this.lives = Math.min(LIVES, this.lives + 1);
        break;
      case 'chuva':
        this.coins += Math.round(value);
        break;
      case 'tiro':
      case 'nevasca':
        // quem resolve o alvo é o adaptador (ele conhece a rede)
        if (this.hooks.onOffense) this.hooks.onOffense(puId, value);
        this.effects.set(puId, 1.2); // só para aparecer no HUD por um instante
        break;
      default:
        this.effects.set(puId, value);
    }
    if (this.hooks.onPowerup) this.hooks.onPowerup(puId);
  }

  // Lentidão vinda de um rival (tiro/nevasca).
  applyDebuff(secs) {
    this.debuffT = Math.max(this.debuffT, secs);
    this.cameras.main.flash(200, 120, 180, 255);
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

    if (this.paused) return;

    if (this.running && !this.dead) {
      this.elapsed += dt;
      const accel = (this.speed < this.rampUntil ? SPEED_ACCEL_EARLY : SPEED_ACCEL_LATE) * this.diff.mult;
      this.speed = Math.min(this.speedMax, this.speed + accel * dt);
      if (this.speed > this.topSpeed) this.topSpeed = this.speed;

      this._tickEffects(dt);
      // a velocidade EFETIVA aplica turbo/freio/lentidão sem tocar na rampa
      let v = this.speed;
      if (this.effects.has('turbo')) v *= 1.5;
      if (this.effects.has('freio')) v *= 0.6;
      if (this.debuffT > 0) v *= 0.55;
      this.effSpeed = v;

      this.prevDist = this.dist;
      this.dist += v * dt;
      // turbo e x2 rendem pontos extras por metro percorrido
      if (this.effects.has('turbo') || this.effects.has('x2')) {
        this.bonusScore += v * dt * SCORE_PER_M;
      }

      this._updateActions(dt);
      this._checkCollisions();
      this._collectCoins();
      this._collectPowerups();
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
    const fx = [];
    for (const [id, left] of this.effects) {
      fx.push({ id, emoji: PU_EMOJI[id], left: Math.ceil(left) });
    }
    if (this.debuffT > 0) fx.push({ id: 'lento', emoji: '🐌', left: Math.ceil(this.debuffT), bad: true });
    const shownSpeed = this.effSpeed ?? this.speed;
    this.hooks.updateHUD({
      dist: Math.floor(this.dist),
      coins: this.coins,
      lives: this.lives,
      kmh: Math.round(shownSpeed * 3.6),
      speedFrac: (shownSpeed - this.speedStart) / (this.speedMax - this.speedStart),
      rivals,
      fx,
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
    if (this.invulnT > 0 || this.effects.has('fantasma')) return;
    // colisão VARRIDA: cobre todo o trecho percorrido neste frame. A 600 km/h
    // o personagem avança ~2.8 m por frame — um obstáculo de 2 m passaria
    // inteiro entre dois frames se a checagem fosse só pontual.
    const front = this.dist + 1.0;
    const back = Math.min(this.prevDist ?? this.dist, this.dist) - 1.0;
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
    if (this.effects.has('escudo')) {
      // o escudo absorve a batida e se desfaz
      this.effects.delete('escudo');
      this.invulnT = 0.8;
      sfx.powerup();
      this.cameras.main.flash(150, 120, 220, 160);
      return;
    }
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
    // mesma varredura das colisões: a moeda conta se o trecho percorrido
    // neste frame passou por cima dela
    // com o ímã ativo, o alcance cresce e vale para as três faixas
    const magnet = this.effects.has('ima');
    const reach = magnet ? 12 : 1.8;
    const from = Math.min(this.prevDist ?? this.dist, this.dist) - reach;
    const to = this.dist + reach;
    for (const c of this.track.coins) {
      if (c.taken || (!magnet && c.lane !== this.lane)) continue;
      if (c.d < from || c.d > to) continue;
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

  // Escala px/metro comprimida: encolhe com a velocidade para a tela seguir
  // legível a 600 km/h, mas ainda transmitir aceleração real.
  get pxm() {
    if (this.speed <= VISUAL_REF_SPEED) return PX_PER_M;
    return PX_PER_M * Math.pow(VISUAL_REF_SPEED / this.speed, VISUAL_COMPRESS);
  }

  _scroll(dt) {
    const px = (this.effSpeed ?? this.speed) * this.pxm * dt;
    this.dashes.forEach(d => { d.tilePositionY -= px; });
    this.sideL.tilePositionY -= px * 0.8;
    this.sideR.tilePositionY -= px * 0.8;
  }

  _worldY(d, len = 0) {
    return this.playerY - (d - this.dist) * this.pxm - len * this.pxm / 2;
  }

  _syncSprites() {
    const viewAhead = this.dist + (GAME_H / this.pxm) + 20;
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

    // power-ups na pista (bolha + emoji)
    for (const p of this.track.powerups) {
      if (p.taken) continue;
      if (p.d < viewBehind || p.d > viewAhead) {
        const s = this.puSprites.get(p.id);
        if (s) { s.bub.destroy(); s.txt.destroy(); this.puSprites.delete(p.id); }
        continue;
      }
      let s = this.puSprites.get(p.id);
      if (!s) {
        const bub = this.add.image(this.laneX[p.lane], 0, 'pu-bubble').setDepth(4);
        const txt = this.add.text(this.laneX[p.lane], 0, '🎁', { fontSize: '25px' })
          .setOrigin(0.5).setDepth(4);
        this.tweens.add({ targets: [bub, txt], scale: 1.12, duration: 420, yoyo: true, repeat: -1, ease: 'sine.inOut' });
        s = { bub, txt };
        this.puSprites.set(p.id, s);
      }
      const y = this._worldY(p.d);
      s.bub.y = y;
      s.txt.y = y - 1;
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

      const targetX = (this.laneX[g.lane] ?? this.laneX[1]) + g.xOff;
      g.dispX = Phaser.Math.Linear(g.dispX, targetX, 0.25);

      let y = this.playerY - (g.dispD - this.dist) * this.pxm;
      const above = y < 92;
      const below = y > GAME_H - 40;
      g.arrow.setVisible(above && g.alive);
      if (above) g.arrow.setPosition(g.dispX, 104);
      y = Phaser.Math.Clamp(y, 92, GAME_H - 40);

      const jumpOff = (g.jy || 0) * JUMP_HEIGHT;
      g.sprite.setPosition(g.dispX, y - jumpOff);
      g.sprite.setScale(g.sl ? 1.15 : 1, g.sl ? 0.55 : 1);
      g.ring.setPosition(g.dispX, y + 40);
      g.label.setPosition(g.dispX, y - jumpOff - 66 - g.labelOff);

      if (g.alive) {
        const faded = above || below;
        g.sprite.setAlpha(faded ? 0.28 : 0.62);
        g.label.setAlpha(faded ? 0.35 : 0.9);
        g.ring.setAlpha(faded ? 0.25 : 0.7);
      }
    }
  }
}
