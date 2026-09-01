// Bomb Arena — cena de uma RODADA.
//
// A cena é a simulação. No HOST ela é autoritativa: os pavios contam aqui e
// cada explosão vira um evento transmitido. Nos convidados ela só anima —
// bombas e explosões chegam prontas pela rede (applyBomb/applyBoom).
// Movimento é local em todos (cada um simula o próprio boneco); morte e
// coleta de item são detectadas localmente e confirmadas pelo host.
import Phaser from 'phaser';
import { GAME_W, GAME_H, slotColor, slotHex } from '../../core/config.js';
import { sfx } from '../../core/audio.js';
import { ensureRunnerTexture } from '../runner/textures.js';
import { generateArena, spawnPoints, ringCells, CELL } from './mapgen.js';
import {
  PLAYER_SPEED, SPEED_STEP, BOMB_FUSE, CHAIN_FUSE, BLAST_TIME,
  BASE_RANGE, BASE_BOMBS, ROUND_TIME, SHRINK_EVERY, DROPS,
} from './config.js';

const DROP_EMOJI = Object.fromEntries(DROPS.map(d => [d.id, d.emoji]));

export default class BombScene extends Phaser.Scene {
  constructor() { super('bomb'); }

  init(data) {
    this.seed = data.seed;
    this.round = data.round || 1;
    this.isNet = !!data.isNet;
    this.isHost = !!data.isHost;
    this.hooks = data.hooks || {};
    this.mySlot = data.mySlot || 0;
    this.players = data.players || [];   // [{slot, name, skin}]
  }

  create() {
    const arena = generateArena(this.seed, this.players.length, this.round);
    this.grid = arena.grid;
    this.cells = arena.cells;
    this.drops = arena.drops;       // "c,r" -> tipo (decidido pela seed)
    this.theme = arena.theme;

    const { cols, rows, tile } = this.grid;
    this.ox = Math.round((GAME_W - cols * tile) / 2);
    this.oy = Math.round((GAME_H - rows * tile) / 2) + 24;

    this._buildTextures();
    this._buildBoard();

    // estado
    this.running = false;
    this.paused = false;
    this.clock = 0;
    this.bombs = new Map();        // id -> { id, c, r, owner, fuse, spr, txt, solidFor:Set }
    this.blasts = [];              // { cellsSet, until }
    this.dropSprites = new Map();  // "c,r" -> txt
    this.hazard = new Set();       // "c,r" de lava
    this.hazardRing = -1;

    // jogadores
    this.actors = new Map();
    const spawns = spawnPoints(this.grid);
    this.players.forEach((p, i) => {
      const sp = spawns[i % spawns.length];
      const x = this.cx(sp.c), y = this.cy(sp.r);
      const tex = ensureRunnerTexture(this, p.skin || 'azul', p.slot, p.cos);
      const shadow = this.add.ellipse(x, y + tile * 0.34, tile * 0.62, tile * 0.2, 0x000000, 0.3).setDepth(5);
      const spr = this.add.image(x, y, tex).setScale((tile * 1.06) / 104).setDepth(6);
      const label = this.add.text(x, y - tile * 0.68, p.name, {
        fontFamily: 'system-ui, sans-serif', fontSize: '12px', fontStyle: 'bold',
        color: slotHex(p.slot), stroke: '#1c2440', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(6);
      if (p.slot !== this.mySlot) { spr.setAlpha(0.92); }
      this.actors.set(p.slot, {
        slot: p.slot, name: p.name, spr, label, shadow,
        x, y, tx: x, ty: y,        // tx/ty: alvo de interpolação dos remotos
        alive: true,
        // atributos (só usados de verdade no próprio jogador)
        range: BASE_RANGE, maxBombs: BASE_BOMBS, speed: PLAYER_SPEED, shield: 0,
      });
    });

    // stats locais desta rodada
    this.stats = { bombs: 0, crates: 0 };

    this._buildInput();
    this._stateAcc = 0;

    // banner da rodada
    this.banner(`RODADA ${this.round}`, 1100);
  }

  cx(c) { return this.ox + c * this.grid.tile + this.grid.tile / 2; }
  cy(r) { return this.oy + r * this.grid.tile + this.grid.tile / 2; }
  colAt(x) { return Math.floor((x - this.ox) / this.grid.tile); }
  rowAt(y) { return Math.floor((y - this.oy) / this.grid.tile); }

  beginRun() { this.running = true; }
  freezeRun() { this.running = false; }

  banner(text, ms = 1000) {
    const t = this.add.text(GAME_W / 2, GAME_H * 0.42, text, {
      fontFamily: 'system-ui, sans-serif', fontSize: '44px', fontStyle: 'bold',
      color: '#ffd23e', stroke: '#1c2440', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(30).setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'back.out' });
    this.time.delayedCall(ms, () => {
      this.tweens.add({ targets: t, alpha: 0, scale: 1.25, duration: 220, onComplete: () => t.destroy() });
    });
  }

  // ------------------------------------------------------------------
  // tabuleiro e texturas
  // ------------------------------------------------------------------
  _buildTextures() {
    const t = this.grid.tile;
    const key = (name) => `ba-${this.theme.id}-${t}-${name}`;
    this._k = key;
    if (this.textures.exists(key('wall'))) return;
    const g = this.make.graphics({ add: false });

    // parede com "tampa" iluminada
    g.fillStyle(this.theme.wall, 1);
    g.fillRoundedRect(1, 3, t - 2, t - 4, 6);
    g.fillStyle(this.theme.wallTop, 1);
    g.fillRoundedRect(1, 1, t - 2, t - 8, 6);
    g.generateTexture(key('wall'), t, t);

    // caixote
    g.clear();
    g.fillStyle(this.theme.crateEdge, 1);
    g.fillRoundedRect(2, 2, t - 4, t - 4, 5);
    g.fillStyle(this.theme.crate, 1);
    g.fillRoundedRect(4, 4, t - 8, t - 8, 4);
    g.lineStyle(3, this.theme.crateEdge, 1);
    g.lineBetween(4, t / 2, t - 4, t / 2);
    g.lineBetween(t / 2, 4, t / 2, t - 4);
    g.generateTexture(key('crate'), t, t);

    // bomba
    g.clear();
    g.fillStyle(0x1c2440, 1);
    g.fillCircle(t / 2, t / 2 + 2, t * 0.34);
    g.fillStyle(0x39426f, 1);
    g.fillCircle(t / 2 - 4, t / 2 - 3, t * 0.12);
    g.fillStyle(0xd9a410, 1);
    g.fillRect(t / 2 - 2, t * 0.08, 4, t * 0.14);
    g.generateTexture(key('bomb'), t, t);

    // fogo da explosão
    g.clear();
    g.fillStyle(0xff8b3d, 1);
    g.fillRoundedRect(2, 2, t - 4, t - 4, 8);
    g.fillStyle(0xffd23e, 1);
    g.fillRoundedRect(t * 0.2, t * 0.2, t * 0.6, t * 0.6, 6);
    g.fillStyle(0xfff3c4, 1);
    g.fillCircle(t / 2, t / 2, t * 0.16);
    g.generateTexture(key('blast'), t, t);

    // lava
    g.clear();
    g.fillStyle(this.theme.hazard, 1);
    g.fillRect(0, 0, t, t);
    g.fillStyle(0xffffff, 0.14);
    g.fillCircle(t * 0.3, t * 0.35, t * 0.13);
    g.fillCircle(t * 0.7, t * 0.65, t * 0.1);
    g.generateTexture(key('hazard'), t, t);

    g.destroy();
  }

  _buildBoard() {
    const { cols, rows, tile } = this.grid;
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x141a33);
    // piso xadrez
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.add.rectangle(this.cx(c), this.cy(r), tile, tile,
          (c + r) % 2 === 0 ? this.theme.floorA : this.theme.floorB).setDepth(0);
      }
    }
    // paredes e caixotes
    this.crateSprites = new Map();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.cells[r][c] === CELL.WALL) {
          this.add.image(this.cx(c), this.cy(r), this._k('wall')).setDepth(2);
        } else if (this.cells[r][c] === CELL.CRATE) {
          this.crateSprites.set(`${c},${r}`, this.add.image(this.cx(c), this.cy(r), this._k('crate')).setDepth(2));
        }
      }
    }
    this.burst = this.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 200 }, scale: { start: 0.8, end: 0 },
      lifespan: 420, emitting: false,
    }).setDepth(10);
  }

  // ------------------------------------------------------------------
  // input: joystick virtual + botão de bomba + teclado
  // ------------------------------------------------------------------
  _buildInput() {
    this.input.addPointer(2);
    this.stick = { active: false, id: -1, ox: 0, oy: 0, vx: 0, vy: 0 };

    const t = this.grid.tile;
    // visual do joystick (aparece onde o dedo pousa)
    this.stickBase = this.add.circle(0, 0, 46, 0xffffff, 0.10).setDepth(20).setVisible(false).setStrokeStyle(2, 0xffffff, 0.25);
    this.stickKnob = this.add.circle(0, 0, 22, 0xffffff, 0.22).setDepth(20).setVisible(false);

    // botão de bomba fixo à direita
    const bx = GAME_W - 64, by = GAME_H - 88;
    this.bombBtn = this.add.circle(bx, by, 42, 0x1c2440, 0.5).setDepth(20)
      .setStrokeStyle(3, 0xffd23e, 0.8).setInteractive();
    this.add.text(bx, by, '💣', { fontSize: '30px' }).setOrigin(0.5).setDepth(21);
    this.bombBtn.on('pointerdown', () => this._tryPlace());

    this.input.on('pointerdown', (p) => {
      if (p.x > GAME_W * 0.62 && p.y > GAME_H * 0.6) return; // zona do botão
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
      // zona morta pequena para o dedo parado não "vazar" movimento
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
    if (k) {
      this.keys = k.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE');
      k.on('keydown-SPACE', () => this._tryPlace());
    }
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
  // bombas
  // ------------------------------------------------------------------
  _tryPlace() {
    const me = this.actors.get(this.mySlot);
    if (!this.running || this.paused || !me || !me.alive) return;
    const c = this.colAt(me.x), r = this.rowAt(me.y);
    if (this._bombAt(c, r)) return;
    const mine = [...this.bombs.values()].filter(b => b.owner === this.mySlot).length;
    if (mine >= me.maxBombs) return;
    if (this.hooks.onPlace) this.hooks.onPlace(c, r);
  }

  _bombAt(c, r) {
    for (const b of this.bombs.values()) if (b.c === c && b.r === r) return b;
    return null;
  }

  // Chega do host (ou local no host): bomba oficial na arena.
  applyBomb({ id, c, r, owner, fuse }) {
    if (this.bombs.has(id)) return;
    const spr = this.add.image(this.cx(c), this.cy(r), this._k('bomb')).setDepth(3);
    this.tweens.add({ targets: spr, scale: 1.12, duration: 300, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    // a bomba só vira parede para quem sair de cima dela (escapa da própria).
    // O teste é pelo CORPO inteiro, não pelo centro: senão o jogador trava
    // montado na divisa da célula, com a borda ainda dentro da bomba.
    const rad = this.grid.tile * 0.34;
    const solidFor = new Set();
    for (const a of this.actors.values()) {
      if (this._circleOnTile(a.x, a.y, rad, c, r)) continue;
      solidFor.add(a.slot);
    }
    this.bombs.set(id, { id, c, r, owner, fuse: fuse ?? BOMB_FUSE, spr, solidFor });
    if (owner === this.mySlot) this.stats.bombs++;
    sfx.lane();
  }

  // HOST: calcula as células da explosão e o que ela destrói.
  computeBlast(bomb) {
    const me = this.actors.get(bomb.owner);
    const range = bomb.owner === this.mySlot
      ? (me ? me.range : BASE_RANGE)
      : (this.hooks.rangeOf ? this.hooks.rangeOf(bomb.owner) : BASE_RANGE);
    const cells = [{ c: bomb.c, r: bomb.r }];
    const destroyed = [];
    const chained = [];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let i = 1; i <= range; i++) {
        const c = bomb.c + dc * i, r = bomb.r + dr * i;
        if (r < 0 || c < 0 || r >= this.grid.rows || c >= this.grid.cols) break;
        const cell = this.cells[r][c];
        if (cell === CELL.WALL) break;
        cells.push({ c, r });
        if (cell === CELL.CRATE) { destroyed.push({ c, r }); break; } // fogo para no caixote
        const other = this._bombAt(c, r);
        if (other && other.id !== bomb.id) chained.push(other.id);
      }
    }
    return { cells, destroyed, chained };
  }

  // Todos: aplica uma explosão oficial.
  applyBoom({ id, cells, destroyed }) {
    const bomb = this.bombs.get(id);
    if (bomb) {
      bomb.spr.destroy();
      this.bombs.delete(id);
    }
    // fogo
    const set = new Set(cells.map(({ c, r }) => `${c},${r}`));
    this.blasts.push({ set, until: this.clock + BLAST_TIME });
    for (const { c, r } of cells) {
      const f = this.add.image(this.cx(c), this.cy(r), this._k('blast')).setDepth(4).setScale(0.4);
      this.tweens.add({ targets: f, scale: 1, duration: 90 });
      this.tweens.add({ targets: f, alpha: 0, delay: BLAST_TIME * 1000 - 140, duration: 140, onComplete: () => f.destroy() });
    }
    // caixotes
    for (const { c, r } of destroyed) {
      this.cells[r][c] = CELL.FLOOR;
      const key = `${c},${r}`;
      const spr = this.crateSprites.get(key);
      if (spr) {
        this.burst.emitParticleAt(spr.x, spr.y, 8);
        this.tweens.add({ targets: spr, scale: 0.2, alpha: 0, angle: 40, duration: 180, onComplete: () => spr.destroy() });
        this.crateSprites.delete(key);
      }
      this.stats.crates++;
      // revela o item decidido pela seed — igual em todos os aparelhos
      const dropType = this.drops.get(key);
      if (dropType) {
        const t = this.add.text(this.cx(c), this.cy(r), DROP_EMOJI[dropType], { fontSize: '22px' })
          .setOrigin(0.5).setDepth(3).setScale(0);
        this.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'back.out' });
        this.dropSprites.set(key, t);
      }
    }
    // chain no HOST: acelera o pavio das bombas alcançadas
    if (this.isHost) {
      for (const { c, r } of cells) {
        const other = this._bombAt(c, r);
        if (other && other.fuse > CHAIN_FUSE) other.fuse = CHAIN_FUSE;
      }
    }
    this.cameras.main.shake(120, 0.008);
    sfx.hit();
  }

  // Todos: item foi pego por alguém (confirmado pelo host).
  applyPickup(slot, c, r, type) {
    const key = `${c},${r}`;
    this.drops.delete(key);
    const spr = this.dropSprites.get(key);
    if (spr) {
      this.tweens.add({ targets: spr, y: spr.y - 22, alpha: 0, duration: 220, onComplete: () => spr.destroy() });
      this.dropSprites.delete(key);
    }
    const a = this.actors.get(slot);
    if (!a) return;
    if (slot === this.mySlot) {
      if (type === 'fire') a.range = Math.min(6, a.range + 1);
      else if (type === 'bomb') a.maxBombs = Math.min(5, a.maxBombs + 1);
      else if (type === 'speed') a.speed = Math.min(PLAYER_SPEED + SPEED_STEP * 3, a.speed + SPEED_STEP);
      else if (type === 'shield') a.shield++;
      sfx.powerup();
      if (this.hooks.onSelfPickup) this.hooks.onSelfPickup(type, a);
    }
  }

  // Todos: jogador eliminado (confirmado pelo host).
  applyElim(slot) {
    const a = this.actors.get(slot);
    if (!a || !a.alive) return;
    a.alive = false;
    this.burst.emitParticleAt(a.x, a.y, 18);
    this.tweens.add({ targets: [a.spr, a.shadow], alpha: 0, scale: 0.2, angle: 180, duration: 450 });
    a.label.setText('💀 ' + a.name).setAlpha(0.6);
    this.cameras.main.shake(160, 0.01);
    sfx.death();
  }

  applyRemote(slot, st) {
    const a = this.actors.get(slot);
    if (!a || slot === this.mySlot) return;
    a.tx = st.x; a.ty = st.y;
  }

  aliveCount() { return [...this.actors.values()].filter(a => a.alive).length; }

  getMyState() {
    const me = this.actors.get(this.mySlot);
    return me ? { x: Math.round(me.x), y: Math.round(me.y) } : { x: 0, y: 0 };
  }

  // ------------------------------------------------------------------
  update(_, delta) {
    if (this.paused || !this.running) return;
    const dt = Math.min(delta / 1000, 0.04);
    this.clock += dt;

    this._moveSelf(dt);
    this._lerpRemotes(dt);
    this._tickBombs(dt);
    this._tickBlasts();
    this._tickHazard();
    this._checkSelfDanger();
    this._checkSelfPickup();

    this._stateAcc += dt;
    if (this._stateAcc >= 1 / 15) {
      this._stateAcc = 0;
      if (this.hooks.sendState) this.hooks.sendState(this.getMyState());
    }
    if (this.hooks.onClock) this.hooks.onClock(this.clock);
  }

  // o círculo do personagem encosta na célula (c, r)?
  _circleOnTile(x, y, rad, c, r) {
    const t = this.grid.tile;
    const x0 = this.ox + c * t, y0 = this.oy + r * t;
    const nx = Math.max(x0, Math.min(x, x0 + t));
    const ny = Math.max(y0, Math.min(y, y0 + t));
    return (x - nx) * (x - nx) + (y - ny) * (y - ny) < rad * rad;
  }

  _solid(c, r, slot) {
    if (r < 0 || c < 0 || r >= this.grid.rows || c >= this.grid.cols) return true;
    const cell = this.cells[r][c];
    if (cell === CELL.WALL || cell === CELL.CRATE) return true;
    const b = this._bombAt(c, r);
    if (b && b.solidFor.has(slot)) return true;
    return false;
  }

  _moveSelf(dt) {
    const me = this.actors.get(this.mySlot);
    if (!me || !me.alive) return;
    const { vx, vy } = this._inputVector();
    const t = this.grid.tile;
    const rad = t * 0.34;

    // a bomba embaixo do jogador vira sólida quando o CORPO INTEIRO sai de
    // cima dela — só o centro cruzar a divisa não basta
    for (const b of this.bombs.values()) {
      if (!b.solidFor.has(this.mySlot)) {
        if (!this._circleOnTile(me.x, me.y, rad, b.c, b.r)) b.solidFor.add(this.mySlot);
      }
    }

    const tryMove = (dx, dy) => {
      const nx = me.x + dx, ny = me.y + dy;
      // 4 pontos de amostra do círculo
      const pts = [[nx - rad, ny], [nx + rad, ny], [nx, ny - rad], [nx, ny + rad]];
      for (const [px, py] of pts) {
        if (this._solid(this.colAt(px), this.rowAt(py), this.mySlot)) return false;
      }
      me.x = nx; me.y = ny;
      return true;
    };

    const step = me.speed * dt;
    const movedX = vx !== 0 && tryMove(vx * step, 0);
    const movedY = vy !== 0 && tryMove(0, vy * step);

    // assistência de canto: se travou no eixo, desliza para o centro da célula
    // vizinha livre — evita "prender" o dedo em quinas no celular
    if (vx !== 0 && !movedX) {
      const targetR = this.rowAt(me.y);
      const off = me.y - this.cy(targetR);
      const dir = Math.sign(-off);
      if (Math.abs(off) > 3) tryMove(0, dir * Math.min(Math.abs(off), step));
    }
    if (vy !== 0 && !movedY) {
      const targetC = this.colAt(me.x);
      const off = me.x - this.cx(targetC);
      const dir = Math.sign(-off);
      if (Math.abs(off) > 3) tryMove(dir * Math.min(Math.abs(off), step), 0);
    }

    me.spr.setPosition(me.x, me.y);
    me.shadow.setPosition(me.x, me.y + t * 0.34);
    me.label.setPosition(me.x, me.y - t * 0.68);
    if (vx !== 0) me.spr.setFlipX(vx < 0);
  }

  _lerpRemotes(dt) {
    const t = this.grid.tile;
    for (const a of this.actors.values()) {
      if (a.slot === this.mySlot || !a.alive) continue;
      a.x = Phaser.Math.Linear(a.x, a.tx, Math.min(1, dt * 14));
      a.y = Phaser.Math.Linear(a.y, a.ty, Math.min(1, dt * 14));
      a.spr.setPosition(a.x, a.y);
      a.shadow.setPosition(a.x, a.y + t * 0.34);
      a.label.setPosition(a.x, a.y - t * 0.68);
    }
  }

  _tickBombs(dt) {
    for (const b of this.bombs.values()) {
      b.fuse -= dt;
      // piscar acelerando perto do fim
      const urgency = Math.max(0, 1 - b.fuse / BOMB_FUSE);
      b.spr.setTint(Math.sin(this.clock * (6 + urgency * 22)) > 0 ? 0xffffff : 0xff8b6b);
      if (b.fuse <= 0 && this.isHost) {
        b.fuse = 999; // trava para não disparar duas vezes
        if (this.hooks.onBoom) this.hooks.onBoom(b, this.computeBlast(b));
      }
    }
  }

  _tickBlasts() {
    this.blasts = this.blasts.filter(bl => bl.until > this.clock);
  }

  // Fim de rodada se arrastando: a arena fecha em anéis de lava.
  _tickHazard() {
    if (this.clock < ROUND_TIME) return;
    const ring = Math.floor((this.clock - ROUND_TIME) / SHRINK_EVERY);
    if (ring <= this.hazardRing) return;
    this.hazardRing = ring;
    if (ring === 0) { this.banner('☠️ A ARENA VAI FECHAR!', 1400); sfx.count(); }
    for (const { c, r } of ringCells(this.grid, ring)) {
      const key = `${c},${r}`;
      if (this.hazard.has(key)) continue;
      this.hazard.add(key);
      // lava engole caixotes e itens
      if (this.cells[r][c] === CELL.CRATE) {
        this.cells[r][c] = CELL.FLOOR;
        const spr = this.crateSprites.get(key);
        if (spr) { spr.destroy(); this.crateSprites.delete(key); }
      }
      const d = this.dropSprites.get(key);
      if (d) { d.destroy(); this.dropSprites.delete(key); this.drops.delete(key); }
      const img = this.add.image(this.cx(c), this.cy(r), this._k('hazard')).setDepth(1).setAlpha(0);
      this.tweens.add({ targets: img, alpha: 1, duration: 500 });
    }
  }

  _checkSelfDanger() {
    const me = this.actors.get(this.mySlot);
    if (!me || !me.alive) return;
    const key = `${this.colAt(me.x)},${this.rowAt(me.y)}`;
    const inBlast = this.blasts.some(bl => bl.set.has(key));
    const inHazard = this.hazard.has(key);
    if (!inBlast && !inHazard) return;

    if (inBlast && me.shield > 0) {
      // o escudo absorve UMA explosão (com um instante de imunidade)
      me.shield--;
      this.blasts = this.blasts.filter(bl => !bl.set.has(key));
      this.banner('🛡️', 500);
      sfx.powerup();
      return;
    }
    if (this.hooks.onDied) this.hooks.onDied();
  }

  _checkSelfPickup() {
    const me = this.actors.get(this.mySlot);
    if (!me || !me.alive) return;
    const key = `${this.colAt(me.x)},${this.rowAt(me.y)}`;
    if (this.dropSprites.has(key) && this.hooks.onTake) {
      this.hooks.onTake(this.colAt(me.x), this.rowAt(me.y));
    }
  }
}
