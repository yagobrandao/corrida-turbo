// Pega-Pega — cena de uma RODADA.
//
// Cada aparelho simula o próprio personagem; o HOST decide capturas, itens e
// o relógio da rodada (a lógica autoritativa mora no TagGame.js). A cena
// também abriga o "Robô" do treino solo: um perseguidor simples que usa o
// mesmo sistema de movimento do jogador.
import Phaser from 'phaser';
import { GAME_W, GAME_H, slotHex } from '../../core/config.js';
import { sfx } from '../../core/audio.js';
import { ensureRunnerTexture } from '../runner/textures.js';
import { generateArena, spawnPoints } from './mapgen.js';
import {
  FLEE_SPEED, TAGGER_MULT, HUNT_BOOST_STEP, SPEED_BUFF, FREEZE_MULT, POWERS,
} from './config.js';

const POWER_EMOJI = Object.fromEntries(POWERS.map(p => [p.id, p.emoji]));
export const BOT_SLOT = 9;   // slot do Robô no treino solo

export default class TagScene extends Phaser.Scene {
  constructor() { super('tag'); }

  init(data) {
    this.seed = data.seed;
    this.round = data.round || 1;
    this.isHost = !!data.isHost;
    this.hooks = data.hooks || {};
    this.mySlot = data.mySlot || 0;
    this.players = data.players || [];
    this.solo = !!data.solo;
    this.startTagger = data.tagger ?? 0;
  }

  create() {
    const arena = generateArena(this.seed, Math.max(2, this.players.length), this.round);
    this.grid = arena.grid;
    this.solidMap = arena.solid;
    this.freeCells = arena.free;
    this.theme = arena.theme;

    const { cols, rows, tile } = this.grid;
    this.ox = Math.round((GAME_W - cols * tile) / 2);
    this.oy = Math.round((GAME_H - rows * tile) / 2) + 24;

    this._buildTextures();
    this._buildBoard(arena.obstacles);

    this.running = false;
    this.paused = false;
    this.clock = 0;
    this.tagger = this.startTagger;
    this.tagImmuneUntil = 0;     // novo pegador não captura por um instante
    this.huntLevel = 0;          // anti-enrolação (vem do host)
    this.frozenUntil = 0;        // ❄️ ativo sobre o pegador
    this.speedUntil = 0;         // ⚡ do MEU personagem
    this.shieldUntil = 0;        // 🛡 do MEU personagem (o host valida de verdade)
    this.powerSprites = new Map();  // id -> { spr, c, r, type }

    // ---------- personagens ----------
    this.actors = new Map();
    const spawns = spawnPoints(this.grid);
    const roster = this.solo
      ? [...this.players, { slot: BOT_SLOT, name: 'Robô', skin: 'carvao' }]
      : this.players;
    roster.forEach((p, i) => {
      const sp = spawns[i % spawns.length];
      const x = this.cx(sp.c), y = this.cy(sp.r);
      const tex = ensureRunnerTexture(this, p.skin || 'azul', p.slot, p.cos);
      const aura = this.add.circle(x, y, tile * 0.55, 0xe8483f, 0.25)
        .setStrokeStyle(3, 0xe8483f, 0.9).setDepth(4).setVisible(false);
      const shadow = this.add.ellipse(x, y + tile * 0.34, tile * 0.62, tile * 0.2, 0x000000, 0.3).setDepth(5);
      const spr = this.add.image(x, y, tex).setScale((tile * 1.06) / 104).setDepth(6);
      const label = this.add.text(x, y - tile * 0.72, p.name, {
        fontFamily: 'system-ui, sans-serif', fontSize: '12px', fontStyle: 'bold',
        color: slotHex(p.slot), stroke: '#1c2440', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(6);
      const mark = this.add.text(x, y - tile * 0.95, '👹', { fontSize: '17px' })
        .setOrigin(0.5).setDepth(7).setVisible(false);
      this.actors.set(p.slot, {
        slot: p.slot, name: p.name, spr, label, shadow, aura, mark,
        x, y, tx: x, ty: y, shielded: false,
      });
    });
    this._applyTaggerVisual();

    this.burst = this.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 200 }, scale: { start: 0.8, end: 0 },
      lifespan: 420, emitting: false,
    }).setDepth(10);

    this._buildInput();
    this._stateAcc = 0;
    this._botDetourUntil = 0;
    this._botDetourSign = 1;
    this.stats = { captures: 0, fleeTime: 0, powers: 0 };

    this.banner(`RODADA ${this.round}`, 1100);
  }

  cx(c) { return this.ox + c * this.grid.tile + this.grid.tile / 2; }
  cy(r) { return this.oy + r * this.grid.tile + this.grid.tile / 2; }
  colAt(x) { return Math.floor((x - this.ox) / this.grid.tile); }
  rowAt(y) { return Math.floor((y - this.oy) / this.grid.tile); }

  beginRun() { this.running = true; }
  freezeRun() { this.running = false; }

  banner(text, ms = 1000) {
    const t = this.add.text(GAME_W / 2, GAME_H * 0.4, text, {
      fontFamily: 'system-ui, sans-serif', fontSize: '40px', fontStyle: 'bold',
      color: '#ffd23e', stroke: '#1c2440', strokeThickness: 8, align: 'center',
      wordWrap: { width: GAME_W - 60 },
    }).setOrigin(0.5).setDepth(30).setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'back.out' });
    this.time.delayedCall(ms, () => {
      this.tweens.add({ targets: t, alpha: 0, scale: 1.2, duration: 200, onComplete: () => t.destroy() });
    });
  }

  // ------------------------------------------------------------------
  _buildTextures() {
    const t = this.grid.tile;
    const key = (name) => `tag-${this.theme.id}-${t}-${name}`;
    this._k = key;
    if (this.textures.exists(key('wall'))) return;
    const g = this.make.graphics({ add: false });

    g.fillStyle(this.theme.wall, 1);
    g.fillRoundedRect(1, 3, t - 2, t - 4, 6);
    g.fillStyle(this.theme.wallTop, 1);
    g.fillRoundedRect(1, 1, t - 2, t - 8, 6);
    g.generateTexture(key('wall'), t, t);

    // rocha
    g.clear();
    g.fillStyle(0x1c2440, 0.25);
    g.fillEllipse(t / 2, t * 0.62, t * 0.86, t * 0.5);
    g.fillStyle(this.theme.rock, 1);
    g.fillCircle(t / 2, t * 0.46, t * 0.36);
    g.fillStyle(0xffffff, 0.22);
    g.fillCircle(t * 0.4, t * 0.36, t * 0.12);
    g.generateTexture(key('rock'), t, t);

    // árvore
    g.clear();
    g.fillStyle(0x6b4a2e, 1);
    g.fillRect(t * 0.44, t * 0.5, t * 0.12, t * 0.36);
    g.fillStyle(this.theme.tree, 1);
    g.fillCircle(t / 2, t * 0.38, t * 0.34);
    g.fillStyle(this.theme.treeTop, 1);
    g.fillCircle(t * 0.42, t * 0.3, t * 0.18);
    g.generateTexture(key('tree'), t, t);

    g.destroy();
  }

  _buildBoard(obstacles) {
    const { cols, rows, tile } = this.grid;
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x141a33);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.add.rectangle(this.cx(c), this.cy(r), tile, tile,
          (c + r) % 2 === 0 ? this.theme.floorA : this.theme.floorB).setDepth(0);
        if (this.solidMap[r][c] && (r === 0 || c === 0 || r === rows - 1 || c === cols - 1)) {
          this.add.image(this.cx(c), this.cy(r), this._k('wall')).setDepth(2);
        }
      }
    }
    for (const o of obstacles) {
      for (let rr = o.r; rr < o.r + o.h; rr++) {
        for (let cc = o.c; cc < o.c + o.w; cc++) {
          this.add.image(this.cx(cc), this.cy(rr), this._k(o.kind === 'wall' ? 'wall' : o.kind)).setDepth(2);
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // input (mesmo padrão do Bomb Arena: joystick que nasce sob o dedo)
  // ------------------------------------------------------------------
  _buildInput() {
    this.input.addPointer(2);
    this.stick = { active: false, id: -1, ox: 0, oy: 0, vx: 0, vy: 0 };
    this.stickBase = this.add.circle(0, 0, 46, 0xffffff, 0.10).setDepth(20).setVisible(false).setStrokeStyle(2, 0xffffff, 0.25);
    this.stickKnob = this.add.circle(0, 0, 22, 0xffffff, 0.22).setDepth(20).setVisible(false);

    this.input.on('pointerdown', (p) => {
      if (this.stick.active) return;
      this.stick.active = true;
      this.stick.id = p.id;
      this.stick.ox = p.x; this.stick.oy = p.y;
      this.stickBase.setPosition(p.x, p.y).setVisible(true);
      this.stickKnob.setPosition(p.x, p.y).setVisible(true);
    });
    this.input.on('pointermove', (p) => {
      if (!this.stick.active || p.id !== this.stick.id) return;
      let dx = p.x - this.stick.ox, dy = p.y - this.stick.oy;
      const len = Math.hypot(dx, dy);
      const max = 46;
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      this.stickKnob.setPosition(this.stick.ox + dx, this.stick.oy + dy);
      this.stick.vx = Math.abs(dx) > 8 ? dx / max : 0;
      this.stick.vy = Math.abs(dy) > 8 ? dy / max : 0;
    });
    const release = (p) => {
      if (!this.stick.active || p.id !== this.stick.id) return;
      this.stick.active = false;
      this.stick.vx = this.stick.vy = 0;
      this.stickBase.setVisible(false);
      this.stickKnob.setVisible(false);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    const k = this.input.keyboard;
    if (k) this.keys = k.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
  }

  _inputVector() {
    let vx = this.stick.vx, vy = this.stick.vy;
    if (this.keys) {
      if (this.keys.LEFT.isDown || this.keys.A.isDown) vx = -1;
      else if (this.keys.RIGHT.isDown || this.keys.D.isDown) vx = 1;
      if (this.keys.UP.isDown || this.keys.W.isDown) vy = -1;
      else if (this.keys.DOWN.isDown || this.keys.S.isDown) vy = 1;
    }
    const len = Math.hypot(vx, vy);
    if (len > 1) { vx /= len; vy /= len; }
    return { vx, vy };
  }

  // ------------------------------------------------------------------
  // API para o adaptador
  // ------------------------------------------------------------------
  getMyState() {
    const me = this.actors.get(this.mySlot);
    return me ? { x: Math.round(me.x), y: Math.round(me.y) } : { x: 0, y: 0 };
  }

  applyRemote(slot, st) {
    const a = this.actors.get(slot);
    if (!a || slot === this.mySlot) return;
    a.tx = st.x; a.ty = st.y;
  }

  // troca de pegador (confirmada pelo host)
  applyTagger(slot, silent = false) {
    if (this.tagger === slot) return;
    const old = this.actors.get(this.tagger);
    this.tagger = slot;
    this.tagImmuneUntil = this.clock + 1.3;
    this._applyTaggerVisual();
    const a = this.actors.get(slot);
    if (a) {
      this.burst.emitParticleAt(a.x, a.y, 16);
      if (!silent) {
        this.banner(slot === this.mySlot ? '👹 VOCÊ É O PEGADOR!' : `🔥 ${a.name} PEGOU!`, 1300);
        this.cameras.main.shake(140, 0.008);
        sfx.hit();
      }
    }
    if (old && old.slot === this.mySlot) this.stats.captures++;
  }

  _applyTaggerVisual() {
    for (const a of this.actors.values()) {
      const is = a.slot === this.tagger;
      a.aura.setVisible(is);
      a.mark.setVisible(is);
    }
  }

  // power-up nasce (host decide, todos aplicam)
  applyPowerSpawn(id, c, r, type) {
    if (this.powerSprites.has(id)) return;
    const spr = this.add.text(this.cx(c), this.cy(r), POWER_EMOJI[type] || '❔', { fontSize: '24px' })
      .setOrigin(0.5).setDepth(3).setScale(0);
    this.tweens.add({ targets: spr, scale: 1, duration: 220, ease: 'back.out' });
    this.tweens.add({ targets: spr, y: spr.y - 5, duration: 500, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this.powerSprites.set(id, { spr, c, r, type });
  }

  // item confirmado para alguém
  applyTaken(id, slot, type, dur) {
    const p = this.powerSprites.get(id);
    if (p) {
      this.tweens.add({ targets: p.spr, y: p.spr.y - 24, alpha: 0, duration: 220, onComplete: () => p.spr.destroy() });
      this.powerSprites.delete(id);
    }
    const a = this.actors.get(slot);
    if (a) this.burst.emitParticleAt(a.x, a.y, 8);
    if (slot === this.mySlot) {
      this.stats.powers++;
      sfx.powerup();
      if (type === 'speed') this.speedUntil = this.clock + dur;
      else if (type === 'shield') this.shieldUntil = this.clock + dur;
    }
    if (type === 'shield' && a) a.shielded = true;
    if (type === 'freeze') {
      this.frozenUntil = this.clock + dur;
      if (this.tagger === this.mySlot) this.banner('❄️ CONGELADO!', 900);
    }
  }

  applyShieldOff(slot) {
    const a = this.actors.get(slot);
    if (a) a.shielded = false;
  }

  applyHunt(level) { this.huntLevel = level; }

  // ------------------------------------------------------------------
  update(_, delta) {
    if (this.paused || !this.running) return;
    const dt = Math.min(delta / 1000, 0.04);
    this.clock += dt;

    this._moveSelf(dt);
    this._lerpRemotes(dt);
    if (this.solo) this._moveBot(dt);
    this._decorate();

    if (this.tagger !== this.mySlot) this.stats.fleeTime += dt;

    this._checkSelfPickup();

    this._stateAcc += dt;
    if (this._stateAcc >= 1 / 15) {
      this._stateAcc = 0;
      if (this.hooks.sendState) this.hooks.sendState(this.getMyState());
    }
    if (this.hooks.onClock) this.hooks.onClock(this.clock);
  }

  _mySpeed() {
    let v = FLEE_SPEED;
    if (this.tagger === this.mySlot) {
      v *= TAGGER_MULT * (1 + this.huntLevel * HUNT_BOOST_STEP);
      if (this.clock < this.frozenUntil) v *= FREEZE_MULT;
    }
    if (this.clock < this.speedUntil) v *= SPEED_BUFF;
    return v;
  }

  _solid(c, r) {
    if (r < 0 || c < 0 || r >= this.grid.rows || c >= this.grid.cols) return true;
    return this.solidMap[r][c];
  }

  // movimento com colisão + assistência de canto (padrão da plataforma)
  _moveActor(a, vx, vy, speed, dt) {
    const t = this.grid.tile;
    const rad = t * 0.32;
    const tryMove = (dx, dy) => {
      const nx = a.x + dx, ny = a.y + dy;
      const pts = [[nx - rad, ny], [nx + rad, ny], [nx, ny - rad], [nx, ny + rad]];
      for (const [px, py] of pts) {
        if (this._solid(this.colAt(px), this.rowAt(py))) return false;
      }
      a.x = nx; a.y = ny;
      return true;
    };
    const step = speed * dt;
    const movedX = vx !== 0 && tryMove(vx * step, 0);
    const movedY = vy !== 0 && tryMove(0, vy * step);
    if (vx !== 0 && !movedX) {
      const off = a.y - this.cy(this.rowAt(a.y));
      if (Math.abs(off) > 3) tryMove(0, Math.sign(-off) * Math.min(Math.abs(off), step));
    }
    if (vy !== 0 && !movedY) {
      const off = a.x - this.cx(this.colAt(a.x));
      if (Math.abs(off) > 3) tryMove(Math.sign(-off) * Math.min(Math.abs(off), step), 0);
    }
    if (vx !== 0) a.spr.setFlipX(vx < 0);
  }

  _moveSelf(dt) {
    const me = this.actors.get(this.mySlot);
    if (!me) return;
    const { vx, vy } = this._inputVector();
    this._moveActor(me, vx, vy, this._mySpeed(), dt);
  }

  // Robô do treino solo: persegue (ou foge, se você for o pegador).
  // Sem pathfinding: quando trava num obstáculo, contorna girando o rumo
  // 90 graus por alguns décimos — suficiente para mapas abertos como estes.
  _moveBot(dt) {
    const bot = this.actors.get(BOT_SLOT);
    const me = this.actors.get(this.mySlot);
    if (!bot || !me) return;
    const hunting = this.tagger === BOT_SLOT;
    let dx = me.x - bot.x, dy = me.y - bot.y;
    if (!hunting) { dx = -dx; dy = -dy; }
    const len = Math.hypot(dx, dy) || 1;
    let vx = dx / len, vy = dy / len;

    // desvio ativo: segue o rumo alternativo até o timer acabar
    if (this._botDetourUntil > this.clock) {
      const s = this._botDetourSign;
      [vx, vy] = [-vy * s, vx * s];
    } else {
      const wob = Math.sin(this.clock * 3.1) * 0.3;
      [vx, vy] = [vx - vy * wob, vy + vx * wob];
    }

    let speed = FLEE_SPEED * (hunting ? TAGGER_MULT * (1 + this.huntLevel * HUNT_BOOST_STEP) : 0.94);
    if (hunting && this.clock < this.frozenUntil) speed *= FREEZE_MULT;

    const px = bot.x, py = bot.y;
    this._moveActor(bot, vx, vy, speed, dt);

    // andou menos de 1/3 do esperado? está raspando em algo: liga o desvio
    const moved = Math.hypot(bot.x - px, bot.y - py);
    if (moved < speed * dt * 0.34 && this._botDetourUntil <= this.clock) {
      this._botDetourUntil = this.clock + 0.55;
      this._botDetourSign = Math.random() < 0.5 ? 1 : -1;
    }
  }

  _lerpRemotes(dt) {
    for (const a of this.actors.values()) {
      if (a.slot === this.mySlot || (this.solo && a.slot === BOT_SLOT)) continue;
      a.x = Phaser.Math.Linear(a.x, a.tx, Math.min(1, dt * 14));
      a.y = Phaser.Math.Linear(a.y, a.ty, Math.min(1, dt * 14));
    }
  }

  _decorate() {
    const t = this.grid.tile;
    for (const a of this.actors.values()) {
      a.spr.setPosition(a.x, a.y);
      a.shadow.setPosition(a.x, a.y + t * 0.34);
      a.label.setPosition(a.x, a.y - t * 0.72);
      a.mark.setPosition(a.x, a.y - t * 0.98);
      if (a.slot === this.tagger) {
        const pulse = 1 + Math.sin(this.clock * 6) * 0.08;
        a.aura.setPosition(a.x, a.y).setScale(pulse);
      }
      // escudo visível para todos
      a.spr.setTint(a.shielded ? 0xbfe8ff : 0xffffff);
    }
  }

  _checkSelfPickup() {
    const me = this.actors.get(this.mySlot);
    if (!me || !this.hooks.onTake) return;
    for (const [id, p] of this.powerSprites) {
      if (Math.hypot(me.x - p.spr.x, me.y - p.spr.y) < this.grid.tile * 0.5) {
        this.hooks.onTake(id);
        return;
      }
    }
  }
}
