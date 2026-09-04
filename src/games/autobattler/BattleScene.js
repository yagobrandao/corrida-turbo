// Battle Tactics — cena Phaser.
//
// Só renderização e toque. O estado da corrida vive em economy.js (Run) e o
// combate em sim.js; a cena desenha o que eles dizem e traduz gestos em
// chamadas. Estados: 'prep' (loja/posicionamento) → ['waiting' no PvP] →
// 'countdown' → 'battle' → 'after' → 'prep' ... → 'over'.
//
// Modos: 'pve' (rodadas contra a IA, chefe na 10) e 'pvp' (1v1: cada um
// monta o seu, o adaptador troca as formações e os dois aparelhos rodam a
// mesma simulação). No PvP a simulação é canônica com o HOST embaixo; o
// convidado desenha tudo espelhado (`flip`) para se ver embaixo também.
//
// Layout (portrait 480×854): HUD em DOM no topo · tabuleiro 6×8 · banco ·
// loja com 5 cartas · botões. Durante a batalha o banco/loja somem e entra
// o painel da rodada.
import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../../core/config.js';
import { sfx } from '../../core/audio.js';
import {
  COLS, ROWS, CELL_W, CELL_H, PLAYER_ROWS, BENCH_SIZE, SHOP_SIZE,
  UNITS, RARITIES, FACTIONS, CLASSES, ROUNDS, TOTAL_ROUNDS, PVP_PREP_TIME, LOOT_ROUNDS,
  REROLL_COST, XP_COST, XP_PER_BUY, MANA_MAX, MAX_LEVEL, START_HP,
  unitCost, sellValue, playerDamage, mirrorSpec,
} from './config.js';
import { Run } from './economy.js';
import { createBattle, step, drainEvents, teamSynergies, STEP } from './sim.js';
import { ITEMS, SLOTS, SLOT_NAME, SELL_VALUE, rollRewards, rollBossReward, equipBonus } from './equipment.js';

const OUTLINE = 0x1c2440;
const OX = Math.round((GAME_W - COLS * CELL_W) / 2);
const OY = 124;
const BOARD_BOTTOM = OY + ROWS * CELL_H;
const LABEL_Y = BOARD_BOTTOM + 11;
const BENCH_Y = 560;
const SHOP_TOP = 604, SHOP_H = 118, CARD_W = 72, CARD_GAP = 5;
const SHOP_Y = SHOP_TOP + SHOP_H / 2;
const BTN_Y = 770;
const FONT = 'Fredoka, sans-serif';
const TEAM_COLOR = [0x39a9f4, 0xe8483f];
const SHOT_COLOR = { arrow: 0xf0e0c0, fire: 0xff8b3d, sun: 0xffd23e, ice: 0x9fe8ff, leaf: 0x8fe66a, hit: 0xffffff };
const BLAST_COLOR = { fire: 0xff8b3d, leaf: 0x8fe66a, stone: 0xa8aec2, ice: 0x9fe8ff };

const cellX = (c) => OX + c * CELL_W + CELL_W / 2;
const cellY = (r) => OY + r * CELL_H + CELL_H / 2;
const benchX = (i) => OX + i * CELL_W + CELL_W / 2;
const cardX = (i) => 50 + i * (CARD_W + CARD_GAP) + CARD_W / 2;

export default class BattleScene extends Phaser.Scene {
  constructor() { super('battle'); }

  init(data) {
    this.hooks = data.hooks || {};
    this.seed = data.seed >>> 0;
    this.mode = data.mode || 'pve';
    this.flip = !!data.flip;          // convidado do PvP: vê o tabuleiro espelhado
    this.oppName = data.oppName || 'Adversário';
    this.runSeed = data.runSeed !== undefined ? data.runSeed >>> 0 : this.seed;
  }

  create() {
    // a cena é reaproveitada: zera tudo o que persiste entre partidas
    this.paused = false;
    this.state = 'boot';
    this.speedMult = 1;
    this.run = new Run(this.runSeed);
    this.views = new Map();          // 'p'+uid (corrida), 'e'+i (prévia) ou uid (luta) → container
    this.battle = null;
    this.acc = 0;
    this.selected = null;
    this.dragging = null;
    this.panelUI = [];
    this.lastHitSfx = 0;
    this.oppHp = START_HP;
    this.oppSpec = null;             // PvP: última formação vista do adversário (já espelhada)
    this.oppReady = false;
    this.prepLeft = 0;
    this.input.dragDistanceThreshold = 10;

    this._buildTextures();
    this._buildBoard();
    this._buildPrepUI();
    this._buildBattleUI();
    this._setPrepVisible(false);
    this._setBattleVisible(false);
  }

  // chamado pela plataforma depois do 3-2-1 inicial
  begin() { this._enterPrep(true); }

  // resumo para o adaptador (fim de jogo ou abandono)
  summary(won = false) {
    const r = this.run;
    return {
      round: r.round,
      roundsCleared: won ? TOTAL_ROUNDS : r.round - 1,
      wins: r.wins, won,
      hp: r.hp, oppHp: this.oppHp,
      bossKilled: r.stats.bossKilled,
      threeStars: r.stats.threeStars,
    };
  }

  // posição de tela de uma célula canônica (espelhada para o convidado)
  dx(c) { return cellX(this.flip ? COLS - 1 - c : c); }
  dy(r) { return cellY(this.flip ? ROWS - 1 - r : r); }

  // ================================================================
  // texturas procedurais das unidades (cartoon: contorno + cores chapadas)
  // ================================================================
  _buildTextures() {
    if (this.textures.exists('bt-yeti')) return;
    const g = this.make.graphics({ add: false });
    const oc = (x, y, r, c) => { g.fillStyle(OUTLINE, 1); g.fillCircle(x, y, r + 2.5); g.fillStyle(c, 1); g.fillCircle(x, y, r); };
    const orr = (x, y, w, h, rad, c) => { g.fillStyle(OUTLINE, 1); g.fillRoundedRect(x - 2.5, y - 2.5, w + 5, h + 5, rad + 2); g.fillStyle(c, 1); g.fillRoundedRect(x, y, w, h, rad); };
    const oe = (x, y, w, h, c) => { g.fillStyle(OUTLINE, 1); g.fillEllipse(x, y, w + 5, h + 5); g.fillStyle(c, 1); g.fillEllipse(x, y, w, h); };
    const eyes = (x1, x2, y, r = 4.5, look = 0) => {
      g.fillStyle(0xffffff, 1); g.fillCircle(x1, y, r); g.fillCircle(x2, y, r);
      g.fillStyle(OUTLINE, 1); g.fillCircle(x1 + 1 + look, y + 1, r * 0.5); g.fillCircle(x2 + 1 + look, y + 1, r * 0.5);
    };
    const done = (key, s = 64) => { g.generateTexture(key, s, s); g.clear(); };

    // Javali Escudeiro
    g.fillStyle(0x6b4a2e, 1); g.fillTriangle(14, 22, 22, 10, 26, 24); g.fillTriangle(50, 22, 42, 10, 38, 24);
    oe(32, 38, 42, 34, 0x8a5a3c);
    g.fillStyle(0x6b4a2e, 1); g.fillEllipse(32, 30, 30, 10);
    orr(21, 42, 22, 13, 6, 0x6b4a2e);
    g.fillStyle(OUTLINE, 1); g.fillCircle(28, 48, 1.8); g.fillCircle(36, 48, 1.8);
    g.fillStyle(0xffffff, 1); g.fillTriangle(20, 54, 24, 44, 27, 54); g.fillTriangle(44, 54, 40, 44, 37, 54);
    eyes(25, 40, 34, 4.5);
    oc(11, 40, 9, 0xb5773a); g.fillStyle(0x8a5a3c, 1); g.fillCircle(11, 40, 4);
    done('bt-javali');

    // Arqueira Corça
    g.lineStyle(3.5, 0x6b4a2e, 1);
    g.lineBetween(24, 20, 18, 6); g.lineBetween(18, 10, 12, 6); g.lineBetween(20, 14, 14, 15);
    g.lineBetween(40, 20, 46, 6); g.lineBetween(46, 10, 52, 6); g.lineBetween(44, 14, 50, 15);
    orr(17, 32, 30, 28, 12, 0xd9a06b);
    g.fillStyle(0xf0e0c0, 1); g.fillEllipse(32, 48, 18, 14);
    oc(32, 24, 13, 0xd9a06b);
    g.fillStyle(0xf0e0c0, 1); g.fillEllipse(32, 30, 12, 8);
    g.fillStyle(OUTLINE, 1); g.fillCircle(32, 31, 1.8);
    eyes(26, 38, 21, 4);
    g.lineStyle(3, 0x6b4a2e, 1); g.beginPath(); g.arc(50, 40, 13, -Math.PI / 2, Math.PI / 2); g.strokePath();
    g.lineStyle(1.5, 0xf0e0c0, 1); g.lineBetween(50, 27, 50, 53);
    done('bt-corca');

    // Duende de Brasa
    g.fillStyle(0xff8b3d, 1); g.fillTriangle(32, 2, 22, 22, 42, 22);
    g.fillStyle(0xffd23e, 1); g.fillTriangle(32, 9, 26, 22, 38, 22);
    g.fillStyle(OUTLINE, 1); g.fillTriangle(8, 26, 20, 22, 18, 34); g.fillTriangle(56, 26, 44, 22, 46, 34);
    g.fillStyle(0xe8483f, 1); g.fillTriangle(11, 27, 20, 24, 19, 32); g.fillTriangle(53, 27, 44, 24, 45, 32);
    oc(32, 38, 17, 0xe8483f);
    g.fillStyle(0xc9302a, 1); g.fillEllipse(32, 46, 18, 12);
    eyes(25, 39, 34, 4.5, 1);
    g.fillStyle(0xffffff, 1); g.fillTriangle(27, 46, 30, 46, 28.5, 50); g.fillTriangle(34, 46, 37, 46, 35.5, 50);
    done('bt-duende');

    // Morsa Bastião
    oe(32, 40, 44, 34, 0x5f6b8a);
    g.fillStyle(0x7d89a8, 1); g.fillEllipse(32, 48, 30, 16);
    g.fillStyle(0x5f6b8a, 1); g.fillEllipse(10, 50, 14, 8); g.fillEllipse(54, 50, 14, 8);
    oc(32, 28, 13, 0x6f7b9c);
    g.fillStyle(0x9aa6c4, 1); g.fillEllipse(32, 34, 18, 10);
    g.fillStyle(0xffffff, 1); g.fillTriangle(26, 36, 30, 36, 27, 52); g.fillTriangle(38, 36, 34, 36, 37, 52);
    g.fillStyle(OUTLINE, 1); g.fillCircle(32, 30, 2);
    eyes(26, 38, 24, 3.8);
    g.fillStyle(0x9fe8ff, 0.9); g.fillTriangle(8, 30, 14, 14, 18, 30); g.fillTriangle(46, 30, 50, 14, 56, 30);
    done('bt-morsa');

    // Lebre Gélida
    orr(24, 2, 7, 24, 3.5, 0xdfeeff); orr(33, 2, 7, 24, 3.5, 0xdfeeff);
    g.fillStyle(0xff8fc4, 0.7); g.fillRoundedRect(26, 6, 3, 16, 1.5); g.fillRoundedRect(35, 6, 3, 16, 1.5);
    orr(16, 32, 32, 28, 13, 0xdfeeff);
    g.fillStyle(0xffffff, 1); g.fillEllipse(32, 48, 16, 12);
    oc(32, 27, 12, 0xdfeeff);
    g.fillStyle(0xff8fc4, 1); g.fillEllipse(32, 32, 5, 3.5);
    eyes(27, 37, 25, 3.6, 1);
    g.fillStyle(0x9fe8ff, 1); g.fillTriangle(50, 44, 58, 36, 60, 48); g.fillTriangle(54, 34, 60, 28, 62, 38);
    done('bt-lebre');

    // Vespa de Brasa
    g.fillStyle(0xffffff, 0.6); g.fillEllipse(18, 24, 22, 12); g.fillEllipse(46, 24, 22, 12);
    g.fillStyle(0xffd23e, 0.5); g.fillEllipse(18, 24, 14, 7); g.fillEllipse(46, 24, 14, 7);
    oe(32, 40, 30, 26, 0xffd23e);
    g.fillStyle(OUTLINE, 1); g.fillRect(20, 36, 24, 4); g.fillRect(21, 44, 22, 4);
    g.fillStyle(0xe8483f, 1); g.fillTriangle(32, 62, 27, 52, 37, 52);
    oc(32, 24, 10, 0xe8483f);
    g.lineStyle(2, OUTLINE, 1); g.lineBetween(28, 16, 24, 8); g.lineBetween(36, 16, 40, 8);
    eyes(28, 36, 23, 3.4, 1);
    done('bt-vespa');

    // Salamandra
    g.lineStyle(6, OUTLINE, 1); g.beginPath(); g.arc(14, 44, 12, Math.PI * 0.2, Math.PI * 1.3); g.strokePath();
    g.lineStyle(3.5, 0xff8b3d, 1); g.beginPath(); g.arc(14, 44, 12, Math.PI * 0.2, Math.PI * 1.3); g.strokePath();
    orr(14, 34, 34, 22, 10, 0xff8b3d);
    g.fillStyle(0xffd23e, 1); g.fillRoundedRect(18, 46, 26, 7, 3);
    g.fillStyle(0xe8483f, 1); g.fillCircle(24, 40, 2.5); g.fillCircle(34, 38, 2.5);
    oc(46, 34, 12, 0xff8b3d);
    g.fillStyle(0xe8483f, 1); g.fillTriangle(40, 22, 44, 14, 48, 23); g.fillTriangle(48, 21, 53, 15, 56, 24);
    eyes(43, 52, 31, 3.8, 1);
    g.fillStyle(OUTLINE, 1); g.fillRect(50, 40, 8, 2);
    done('bt-salamandra');

    // Urso Lenhador
    g.lineStyle(5, 0xb5773a, 1); g.lineBetween(54, 14, 46, 52);
    g.fillStyle(OUTLINE, 1); g.fillTriangle(44, 4, 62, 8, 56, 24);
    g.fillStyle(0xa8aec2, 1); g.fillTriangle(47, 7, 59, 10, 55, 21);
    oc(18, 20, 8, 0x6b4a2e); oc(46, 20, 8, 0x6b4a2e);
    orr(12, 16, 40, 44, 16, 0x6b4a2e);
    g.fillStyle(0xe8483f, 1); g.fillRoundedRect(18, 40, 28, 18, 6);
    g.fillStyle(0x9c2820, 1); g.fillRect(24, 40, 3, 18); g.fillRect(36, 40, 3, 18); g.fillRect(18, 48, 28, 3);
    g.fillStyle(0xa07a52, 1); g.fillEllipse(32, 32, 20, 13);
    g.fillStyle(OUTLINE, 1); g.fillEllipse(32, 29, 8, 5);
    eyes(25, 39, 23, 4);
    done('bt-urso');

    // Lince da Geada
    g.fillStyle(OUTLINE, 1); g.fillTriangle(16, 24, 22, 6, 30, 22); g.fillTriangle(48, 24, 42, 6, 34, 22);
    g.fillStyle(0xbfd4e8, 1); g.fillTriangle(18, 23, 22, 10, 28, 22); g.fillTriangle(46, 23, 42, 10, 36, 22);
    g.fillStyle(OUTLINE, 1); g.fillCircle(22, 8, 2); g.fillCircle(42, 8, 2);
    orr(14, 34, 36, 26, 12, 0xbfd4e8);
    g.fillStyle(0x8fa4bf, 1); g.fillCircle(22, 44, 3); g.fillCircle(40, 50, 3); g.fillCircle(32, 40, 2.5);
    oc(32, 26, 13, 0xbfd4e8);
    g.fillStyle(0xffffff, 1); g.fillEllipse(32, 32, 14, 9);
    g.fillStyle(0xff8fc4, 1); g.fillTriangle(32, 34, 29, 30, 35, 30);
    eyes(26, 38, 24, 3.8, 1);
    g.fillStyle(0xffd23e, 1); g.fillCircle(27, 25, 1.3); g.fillCircle(39, 25, 1.3);
    done('bt-lince');

    // Coruja Curandeira
    oe(32, 40, 34, 34, 0x8a6a4c);
    g.fillStyle(0xd9c3a3, 1); g.fillEllipse(32, 46, 22, 20);
    g.fillStyle(0x6b4a2e, 1); g.fillEllipse(14, 42, 10, 22); g.fillEllipse(50, 42, 10, 22);
    oc(32, 24, 14, 0x8a6a4c);
    g.fillStyle(0xd9c3a3, 1); g.fillCircle(25, 24, 7); g.fillCircle(39, 24, 7);
    g.fillStyle(0xffd23e, 1); g.fillCircle(25, 24, 4.5); g.fillCircle(39, 24, 4.5);
    g.fillStyle(OUTLINE, 1); g.fillCircle(26, 24, 2.2); g.fillCircle(40, 24, 2.2);
    g.fillStyle(0xff8b3d, 1); g.fillTriangle(32, 28, 29, 33, 35, 33);
    g.fillStyle(OUTLINE, 1); g.fillTriangle(20, 12, 24, 4, 27, 13); g.fillTriangle(44, 12, 40, 4, 37, 13);
    g.fillStyle(0x8fe66a, 1); g.fillCircle(48, 12, 5); g.fillCircle(53, 8, 3.4);
    done('bt-coruja');

    // Fênix
    g.fillStyle(OUTLINE, 1); g.fillTriangle(2, 26, 26, 38, 18, 54); g.fillTriangle(62, 26, 38, 38, 46, 54);
    g.fillStyle(0xff8b3d, 1); g.fillTriangle(5, 28, 25, 38, 19, 51); g.fillTriangle(59, 28, 39, 38, 45, 51);
    g.fillStyle(0xe8483f, 1); g.fillTriangle(9, 30, 24, 39, 20, 47); g.fillTriangle(55, 30, 40, 39, 44, 47);
    g.fillStyle(0xff8b3d, 1); g.fillTriangle(26, 12, 22, 2, 30, 8); g.fillTriangle(32, 10, 32, 0, 38, 8); g.fillTriangle(38, 12, 42, 2, 34, 8);
    oe(32, 42, 28, 32, 0xffd23e);
    g.fillStyle(0xffe58a, 1); g.fillEllipse(32, 48, 16, 16);
    oc(32, 24, 11, 0xffd23e);
    g.fillStyle(0xff8b3d, 1); g.fillTriangle(32, 26, 32, 33, 42, 30);
    eyes(27, 36, 22, 3.6, 1);
    g.lineStyle(3, 0xe8483f, 1); g.lineBetween(26, 56, 20, 63); g.lineBetween(38, 56, 44, 63);
    done('bt-fenix');

    // Yeti Ancião
    orr(4, 26, 16, 30, 7, 0xe8f0ff); orr(44, 26, 16, 30, 7, 0xe8f0ff);
    orr(12, 10, 40, 50, 16, 0xe8f0ff);
    g.fillStyle(0xbfd4e8, 1); g.fillEllipse(32, 46, 22, 20);
    g.fillStyle(0x7d89a8, 1); g.fillEllipse(32, 26, 22, 16);
    eyes(26, 38, 24, 3.6);
    g.fillStyle(OUTLINE, 1); g.fillRoundedRect(26, 32, 12, 3, 1.5);
    g.fillStyle(0xffffff, 1); g.fillTriangle(27, 35, 30, 35, 28.5, 39); g.fillTriangle(34, 35, 37, 35, 35.5, 39);
    g.fillStyle(0x9fe8ff, 0.9); g.fillTriangle(22, 8, 26, 0, 30, 9); g.fillTriangle(34, 8, 38, 0, 42, 9);
    done('bt-yeti');

    // Espírito da Mata
    g.fillStyle(0x8fe66a, 0.35); g.fillCircle(32, 34, 26);
    g.fillStyle(0x3fae70, 1); g.fillTriangle(32, 58, 22, 40, 42, 40);
    oe(32, 32, 30, 34, 0x8fe66a);
    g.fillStyle(0xcaffb0, 1); g.fillEllipse(32, 40, 16, 14);
    g.fillStyle(0x3fae70, 1); g.fillEllipse(20, 14, 12, 8); g.fillEllipse(44, 14, 12, 8); g.fillCircle(32, 8, 5);
    g.fillStyle(OUTLINE, 1); g.fillEllipse(26, 30, 5, 7); g.fillEllipse(38, 30, 5, 7);
    g.fillStyle(0xffffff, 0.9); g.fillCircle(25, 28, 1.5); g.fillCircle(37, 28, 1.5);
    g.fillStyle(0xffd23e, 1); g.fillCircle(10, 26, 2.4); g.fillCircle(54, 22, 2); g.fillCircle(50, 46, 2.2);
    done('bt-espirito');

    // Ancião de Pedra (chefe)
    orr(6, 30, 20, 34, 8, 0x8d93a8); orr(62, 30, 20, 34, 8, 0x8d93a8);
    orr(16, 12, 56, 64, 16, 0x8d93a8);
    g.fillStyle(0x6f7590, 1);
    g.fillRect(28, 20, 3, 14); g.fillRect(31, 34, 8, 3); g.fillRect(52, 44, 3, 18); g.fillRect(44, 62, 10, 3);
    g.fillStyle(0x3fae70, 1); g.fillEllipse(24, 16, 16, 9); g.fillEllipse(64, 20, 14, 8); g.fillCircle(70, 30, 4);
    g.fillStyle(0x1c2440, 1); g.fillEllipse(34, 40, 10, 9); g.fillEllipse(54, 40, 10, 9);
    g.fillStyle(0x3ddad7, 1); g.fillCircle(34, 40, 3.5); g.fillCircle(54, 40, 3.5);
    g.fillStyle(0xffffff, 0.8); g.fillCircle(33, 39, 1.3); g.fillCircle(53, 39, 1.3);
    g.fillStyle(OUTLINE, 1); g.fillRoundedRect(36, 54, 16, 4, 2);
    done('bt-anciao', 88);

    // projétil e faísca
    g.fillStyle(0xffffff, 1); g.fillCircle(5, 5, 5); g.generateTexture('bt-dot', 10, 10);
    g.destroy();
  }

  // ================================================================
  // tabuleiro
  // ================================================================
  _buildBoard() {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x151233).setDepth(0);
    this.add.rectangle(GAME_W / 2, OY + ROWS * CELL_H / 2, COLS * CELL_W + 10, ROWS * CELL_H + 10, 0x2a2358).setDepth(1)
      .setStrokeStyle(3, 0x453a82);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const mine = PLAYER_ROWS.includes(r);
      const shade = (c + r) % 2 === 0 ? 0.10 : 0.16;
      this.add.rectangle(cellX(c), cellY(r), CELL_W - 2, CELL_H - 2, mine ? 0x39a9f4 : 0xe8483f, shade).setDepth(2);
    }
    this.add.rectangle(GAME_W / 2, OY + 4 * CELL_H, COLS * CELL_W, 3, 0xffd23e, 0.5).setDepth(3);
    this.hover = this.add.rectangle(0, 0, CELL_W - 2, CELL_H - 2, 0xffd23e, 0.35).setDepth(4).setVisible(false)
      .setStrokeStyle(2.5, 0xffd23e);
    this.roundLabel = this.add.text(GAME_W / 2, LABEL_Y, '', {
      fontFamily: FONT, fontSize: '13px', fontStyle: '600', color: '#b8bfd8',
    }).setOrigin(0.5).setDepth(5);

    // toque numa célula do jogador com unidade selecionada = mover
    this.input.on('pointerup', (p) => {
      if (this.state !== 'prep' || this.dragging || !this.selected) return;
      const cell = this._cellAt(p.x, p.y);
      if (!cell || !this.run.isPlayerCell(cell.c, cell.r)) return;
      if (this._justTapped) return;
      const res = this.run.placeOnBoard(this.selected, cell.c, cell.r);
      if (!res.ok) { if (res.why) this._toast(res.why); return; }
      sfx.lane();
      this._closePanels();
      this._refreshPrep();
    });
  }

  _cellAt(x, y) {
    const c = Math.floor((x - OX) / CELL_W), r = Math.floor((y - OY) / CELL_H);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return { c, r };
  }
  _benchAt(x, y) {
    if (Math.abs(y - BENCH_Y) > 32) return -1;
    const i = Math.floor((x - OX) / CELL_W);
    return i >= 0 && i < BENCH_SIZE ? i : -1;
  }

  // ================================================================
  // UI de preparação
  // ================================================================
  _btn(x, y, w, h, label, color, cb, group, size = 15) {
    const r = this.add.rectangle(x, y, w, h, color, 1).setStrokeStyle(2.5, OUTLINE).setDepth(61).setInteractive();
    r.on('pointerdown', () => { if (!r.getData('off')) { sfx.click(); cb(); } });
    const t = this.add.text(x, y, label, {
      fontFamily: FONT, fontSize: `${size}px`, fontStyle: '700', color: '#fff', align: 'center',
    }).setOrigin(0.5).setDepth(62);
    if (group) group.push(r, t);
    return { r, t, setOff(off) { r.setData('off', off); r.setAlpha(off ? 0.45 : 1); t.setAlpha(off ? 0.5 : 1); } };
  }

  _buildPrepUI() {
    this.prepUI = [];
    const G = this.prepUI;
    G.push(this.add.text(OX, BENCH_Y - 40, 'BANCO', { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: '#7f86a8' }).setDepth(5));
    for (let i = 0; i < BENCH_SIZE; i++) {
      G.push(this.add.rectangle(benchX(i), BENCH_Y, CELL_W - 6, 56, 0x2a2358, 1).setStrokeStyle(2, 0x453a82).setDepth(5));
    }
    this.shopBg = this.add.rectangle(GAME_W / 2, SHOP_Y, GAME_W - 16, SHOP_H + 12, 0x1b1740, 1).setDepth(5);
    G.push(this.shopBg);
    this.sellZone = this.add.rectangle(GAME_W / 2, SHOP_Y, GAME_W - 16, SHOP_H + 12, 0xe8483f, 0.9).setDepth(58).setVisible(false);
    this.sellText = this.add.text(GAME_W / 2, SHOP_Y, '', { fontFamily: FONT, fontSize: '20px', fontStyle: '700', color: '#fff' })
      .setOrigin(0.5).setDepth(59).setVisible(false);
    this.cards = [];
    for (let i = 0; i < SHOP_SIZE; i++) this.cards.push(this._makeCard(i));

    this.rerollBtn = this._btn(104, BTN_Y, 108, 52, `ROLAR  ${REROLL_COST}`, 0x453a82, () => this._reroll(), G, 14);
    this.xpBtn = this._btn(218, BTN_Y, 100, 52, `+${XP_PER_BUY} XP  ${XP_COST}`, 0x1b6bb0, () => this._buyXp(), G, 14);
    this.fightBtn = this._btn(374, BTN_Y, 196, 56, 'LUTAR', 0x2fb573, () => this._fight(), G, 20);
    this._coin(148, BTN_Y, G); this._coin(254, BTN_Y, G);

    // guia (unidades, sinergias, duplas) — vive no DOM, o adaptador abre
    this.guideBtn = this._btn(GAME_W - 70, BENCH_Y - 40, 84, 26, 'GUIA', 0x453a82, () => {
      if (this.hooks.openGuide) this.hooks.openGuide();
    }, null, 12);
    this.guideBtn.r.setDepth(6); this.guideBtn.t.setDepth(7);
  }

  _coin(x, y, group, r = 6) {
    const c = this.add.circle(x, y, r, 0xffd23e).setStrokeStyle(1.5, 0xb8860b).setDepth(63);
    if (group) group.push(c);
    return c;
  }

  _makeCard(i) {
    const x = cardX(i), y = SHOP_Y;
    const bg = this.add.rectangle(x, y, CARD_W, SHOP_H, 0x2a2358, 1).setStrokeStyle(2, 0x453a82).setDepth(6).setInteractive();
    bg.on('pointerdown', () => this._buy(i));
    const sprite = this.add.image(x, y - 26, 'bt-javali').setScale(0.68).setDepth(7);
    const name = this.add.text(x, y + 14, '', { fontFamily: FONT, fontSize: '9.5px', fontStyle: '700', color: '#fff', align: 'center', wordWrap: { width: CARD_W - 6 } })
      .setOrigin(0.5, 0).setDepth(7);
    const traits = this.add.text(x, y + 36, '', { fontFamily: FONT, fontSize: '8px', fontStyle: '600', color: '#b8bfd8', align: 'center' })
      .setOrigin(0.5, 0).setDepth(7);
    const coin = this.add.circle(x - 8, y + 52, 5, 0xffd23e).setStrokeStyle(1.2, 0xb8860b).setDepth(7);
    const cost = this.add.text(x + 4, y + 52, '', { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: '#ffd23e' }).setOrigin(0.5).setDepth(7);
    const badge = this.add.text(x + CARD_W / 2 - 4, y - SHOP_H / 2 + 4, '', { fontFamily: FONT, fontSize: '9px', fontStyle: '700', color: '#ffd23e', backgroundColor: '#1c2440', padding: { x: 3, y: 1 } })
      .setOrigin(1, 0).setDepth(8).setVisible(false);
    const card = { bg, sprite, name, traits, coin, cost, badge };
    this.prepUI.push(bg, sprite, name, traits, coin, cost, badge);
    return card;
  }

  _refreshShop() {
    for (let i = 0; i < SHOP_SIZE; i++) {
      const card = this.cards[i];
      const id = this.run.shop[i];
      if (!id) {
        card.bg.setFillStyle(0x1b1740, 1).setStrokeStyle(2, 0x2a2358);
        card.sprite.setVisible(false); card.name.setText(''); card.traits.setText('');
        card.coin.setVisible(false); card.cost.setText(''); card.badge.setText('').setVisible(false);
        continue;
      }
      const def = UNITS[id];
      const rar = RARITIES[def.rarity];
      const copies = this.run.copiesOf(id, 1);
      const almost = copies === 2;
      const canPay = this.run.gold >= unitCost(def);
      card.bg.setFillStyle(rar.color, canPay ? 0.85 : 0.35).setStrokeStyle(almost ? 3 : 2, almost ? 0xffd23e : 0x453a82);
      card.sprite.setTexture('bt-' + id).setVisible(true).setAlpha(canPay ? 1 : 0.5);
      card.name.setText(def.name);
      card.traits.setText(`${FACTIONS[def.faction].name} · ${CLASSES[def.cls].name}`);
      card.coin.setVisible(true);
      card.cost.setText(String(unitCost(def)));
      card.badge.setText(copies > 0 ? `${copies}/3` : '').setVisible(copies > 0);
    }
    this.rerollBtn.setOff(this.run.gold < REROLL_COST);
    this.xpBtn.setOff(this.run.gold < XP_COST || this.run.level >= MAX_LEVEL);
  }

  _setPrepVisible(v) {
    for (const o of this.prepUI) o.setVisible(v);
    for (const c of this.cards) if (!v) c.badge.setVisible(false);
    if (v) this._refreshShop();
  }

  // ================================================================
  // UI de batalha / espera
  // ================================================================
  _buildBattleUI() {
    this.battleUI = [];
    const G = this.battleUI;
    G.push(this.add.rectangle(GAME_W / 2, 690, GAME_W - 16, 150, 0x1b1740, 1).setDepth(5));
    this.battleTitle = this.add.text(GAME_W / 2, 650, '', { fontFamily: FONT, fontSize: '22px', fontStyle: '700', color: '#ffd23e' }).setOrigin(0.5).setDepth(6);
    this.battleInfo = this.add.text(GAME_W / 2, 684, '', { fontFamily: FONT, fontSize: '15px', fontStyle: '600', color: '#b8bfd8' }).setOrigin(0.5).setDepth(6);
    G.push(this.battleTitle, this.battleInfo);
    this.speedBtn = this._btn(GAME_W / 2, 730, 140, 42, 'VELOCIDADE 1×', 0x453a82, () => {
      this.speedMult = this.speedMult === 1 ? 2 : 1;
      this.speedBtn.t.setText(`VELOCIDADE ${this.speedMult}×`);
    }, G, 13);
  }

  _setBattleVisible(v) { for (const o of this.battleUI) o.setVisible(v); }

  // ================================================================
  // unidades (views)
  // ================================================================
  _makeView(defId, star, team, x, y) {
    const def = UNITS[defId];
    const scale = def.boss ? 1 : 0.86;
    const shadow = this.add.ellipse(0, 20, 40, 12, 0x000000, 0.3);
    const ring = this.add.ellipse(0, 20, 46, 16).setStrokeStyle(2.5, TEAM_COLOR[team], 0.9);
    const sprite = this.add.image(0, 0, 'bt-' + defId).setScale(scale);
    const kids = [shadow, ring, sprite];
    const stars = [];
    for (let i = 0; i < star; i++) {
      const s = this.add.star((i - (star - 1) / 2) * 11, -30, 5, 2.6, 5.5, 0xffd23e).setStrokeStyle(1, 0xb8860b);
      stars.push(s); kids.push(s);
    }
    const hpBg = this.add.rectangle(0, 28, 44, 5, 0x1c2440).setVisible(false);
    const hpBar = this.add.rectangle(-22, 28, 44, 5, team === 0 ? 0x8fe66a : 0xff6b5e).setOrigin(0, 0.5).setVisible(false);
    const manaBar = this.add.rectangle(-22, 33, 0, 3, 0x3ddad7).setOrigin(0, 0.5).setVisible(false);
    const shieldFx = this.add.circle(0, 2, 26, 0x7fd0ff, 0.35).setStrokeStyle(2, 0xbfe4ff, 0.8).setVisible(false);
    kids.push(hpBg, hpBar, manaBar, shieldFx);
    const ct = this.add.container(x, y, kids).setDepth(10);
    ct.setSize(56, 56);
    Object.assign(ct, { sprite, ring, stars, hpBg, hpBar, manaBar, shieldFx, defId, star, team });
    return ct;
  }

  _clearViews() {
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
  }

  // recria as views do estado da corrida (jogador) + prévia do inimigo
  _refreshPrep() {
    this._clearViews();
    for (const u of this.run.units) {
      const onBoard = u.place.kind === 'board';
      const x = onBoard ? cellX(u.place.c) : benchX(u.place.i);
      const y = onBoard ? cellY(u.place.r) : BENCH_Y;
      const v = this._makeView(u.id, u.star, 0, x, y);
      v.setDepth(onBoard ? 10 + u.place.r : 10);
      v.uid = u.uid;
      this._makeDraggable(v);
      this.views.set('p' + u.uid, v);
      // selo discreto: quantos itens essa unidade tem equipados
      const equipped = SLOTS.filter(s => u.equip && u.equip[s]).length;
      if (equipped > 0) {
        const badge = this.add.text(x + 20, y - 26, '⚙'.repeat(Math.min(3, equipped)), { fontSize: '11px', color: '#ffd23e' }).setOrigin(0.5).setDepth(v.depth + 1);
        this.views.set('peq' + u.uid, badge);
      }
    }
    // prévia de quem vem: a formação da rodada (PvE) ou a última do adversário (PvP)
    const preview = this.mode === 'pve' ? ROUNDS[this.run.round - 1].units : (this.oppSpec || []);
    preview.forEach((e, i) => {
      const v = this._makeView(e.id, e.star, 1, cellX(e.c), cellY(e.r));
      v.setAlpha(0.88).setDepth(10 + e.r);
      v.setInteractive();
      v.on('pointerup', () => { if (!this.dragging) this._openInfo(e.id, e.star, null); });
      this.views.set('e' + i, v);
    });
    this._updateRoundLabel();
    this._refreshShop();
    this._hud();
  }

  _updateRoundLabel() {
    if (this.mode === 'pve') {
      const spec = ROUNDS[this.run.round - 1];
      this.roundLabel.setText(`${spec.boss ? 'CHEFE' : 'PRÓXIMO'}: ${spec.name} · ${spec.units.length} inimigo${spec.units.length > 1 ? 's' : ''}`);
      this.roundLabel.setColor(spec.boss ? '#ffd23e' : '#b8bfd8');
    } else {
      const secs = Math.max(0, Math.ceil(this.prepLeft));
      const who = this.oppReady ? `${this.oppName} está pronto` : (this.oppSpec ? `${this.oppName}: última formação` : `${this.oppName} monta o dele`);
      this.roundLabel.setText(`${who} · ${secs}s`);
      this.roundLabel.setColor(this.oppReady ? '#8fe66a' : (secs <= 10 ? '#ff6b5e' : '#b8bfd8'));
    }
  }

  _makeDraggable(v) {
    v.setInteractive({ draggable: true });
    v.on('pointerdown', () => { v._dragged = false; });
    v.on('dragstart', () => {
      if (this.state !== 'prep') return;
      v._dragged = true;
      this.dragging = v;
      v.setDepth(50);
      v.sprite.setScale(v.sprite.scale * 1.15);
      this._closePanels();
      const u = this.run.byUid(v.uid);
      this.sellText.setText(`SOLTE AQUI PARA VENDER  +${sellValue(UNITS[u.id], u.star)}`);
      this.sellZone.setVisible(true); this.sellText.setVisible(true);
    });
    v.on('drag', (p, x, y) => {
      if (this.dragging !== v) return;
      v.setPosition(x, y);
      const cell = this._cellAt(p.x, p.y);
      if (cell && this.run.isPlayerCell(cell.c, cell.r)) this.hover.setPosition(cellX(cell.c), cellY(cell.r)).setVisible(true);
      else this.hover.setVisible(false);
      this.sellZone.setFillStyle(0xe8483f, p.y > SHOP_TOP - 8 ? 1 : 0.7);
    });
    v.on('dragend', (p) => {
      if (this.dragging !== v) return;
      this.dragging = null;
      this.hover.setVisible(false);
      this.sellZone.setVisible(false); this.sellText.setVisible(false);
      const cell = this._cellAt(p.x, p.y);
      const bench = this._benchAt(p.x, p.y);
      let res = null;
      if (p.y > SHOP_TOP - 8) {
        res = this.run.sell(v.uid);
        if (res.ok) { sfx.coin(); this._toast(`Vendido por ${res.gold}`); }
      } else if (cell && this.run.isPlayerCell(cell.c, cell.r)) {
        res = this.run.placeOnBoard(v.uid, cell.c, cell.r);
        if (res.ok) sfx.lane();
      } else if (bench >= 0) {
        res = this.run.moveToBench(v.uid, bench);
        if (res.ok) sfx.lane();
      }
      if (res && !res.ok && res.why) this._toast(res.why);
      this._refreshPrep();
    });
    v.on('pointerup', () => {
      if (v._dragged || this.state !== 'prep') return;
      this._justTapped = true;
      this.time.delayedCall(0, () => { this._justTapped = false; });
      const u = this.run.byUid(v.uid);
      if (!u) return;
      this._select(v.uid);
      this._openInfo(u.id, u.star, u.uid);
    });
  }

  _select(uid) {
    this.selected = uid;
    for (const v of this.views.values()) if (v.uid !== undefined) v.ring.setStrokeStyle(2.5, v.uid === uid ? 0xffd23e : TEAM_COLOR[0], 0.95);
  }

  // ================================================================
  // ações da preparação
  // ================================================================
  _buy(i) {
    if (this.state !== 'prep') return;
    const res = this.run.buy(i);
    if (!res.ok) { if (res.why) this._toast(res.why); return; }
    sfx.coin();
    this._refreshPrep();
    if (res.merged && res.merged.length) {
      const last = res.merged[res.merged.length - 1];
      const v = this.views.get('p' + last.uid);
      if (v) this._fxMerge(v, last.star);
    } else {
      const v = this.views.get('p' + res.unit.uid);
      if (v) { v.setScale(0.3); this.tweens.add({ targets: v, scale: 1, duration: 260, ease: 'back.out' }); }
    }
  }

  _reroll() {
    if (this.state !== 'prep') return;
    const res = this.run.reroll();
    if (!res.ok) { this._toast(res.why); return; }
    this._refreshShop(); this._hud();
    for (const c of this.cards) { c.sprite.setScale(0.4); this.tweens.add({ targets: c.sprite, scale: 0.68, duration: 200, ease: 'back.out' }); }
  }

  _buyXp() {
    if (this.state !== 'prep') return;
    const res = this.run.buyXp();
    if (!res.ok) { this._toast(res.why); return; }
    sfx.powerup();
    if (res.leveled) this._fxLevel();
    this._refreshShop(); this._hud();
  }

  _sellSelected(uid) {
    const res = this.run.sell(uid);
    if (!res.ok) return;
    sfx.coin();
    this._toast(`Vendido por ${res.gold}`);
    this._closePanels();
    this._refreshPrep();
  }

  _fight(auto = false) {
    if (this.state !== 'prep') return;
    if (!this.run.boardUnits().length) {
      const placed = this.run.autoFill();
      if (!placed && !auto) { this._toast('Compre uma unidade e arraste para o campo'); return; }
      if (placed) this._toast(`${placed} unidade${placed > 1 ? 's' : ''} subiram do banco`);
      this._refreshPrep();
    }
    this._closePanels();
    this._setPrepVisible(false);
    if (this.mode === 'pvp') {
      // manda a formação e espera o adversário; o adaptador chama pvpBattle()
      this.state = 'waiting';
      this.roundLabel.setText(this.oppReady ? 'Começando…' : `Aguardando ${this.oppName}…`).setColor('#ffd23e');
      this.battleTitle.setText(`RODADA ${this.run.round}`);
      this.battleInfo.setText(this.oppReady ? 'Os dois prontos!' : 'Sua formação foi enviada');
      this.speedBtn.r.setVisible(false); this.speedBtn.t.setVisible(false);
      for (const o of this.battleUI) if (o !== this.speedBtn.r && o !== this.speedBtn.t) o.setVisible(true);
      if (this.hooks.submitBoard) this.hooks.submitBoard(this.run.round, this.run.boardSpec());
      return;
    }
    this.state = 'countdown';
    if (this.hooks.countdown) this.hooks.countdown(() => this._startBattle(this.run.boardSpec(), ROUNDS[this.run.round - 1].units.map(u => ({ ...u }))));
    else this._startBattle(this.run.boardSpec(), ROUNDS[this.run.round - 1].units.map(u => ({ ...u })));
  }

  // ---------------------------------------------------------------- PvP (chamados pelo adaptador)
  pvpOppReady() {
    this.oppReady = true;
    if (this.state === 'prep') this._updateRoundLabel();
    if (this.state === 'waiting') { this.roundLabel.setText('Começando…'); this.battleInfo.setText('Os dois prontos!'); }
  }

  // boards = { host: spec (linhas 4..7 do host), guest: spec (linhas 4..7 do convidado) }
  pvpBattle(round, boards) {
    if (round !== this.run.round) return;
    this.pendingBattle = boards;
    this._maybeStartPvp();
  }

  _maybeStartPvp() {
    if (!this.pendingBattle) return;
    if (this.state === 'prep') { this._fight(true); }
    if (this.state !== 'waiting') return;
    const boards = this.pendingBattle;
    this.pendingBattle = null;
    // canônico: host embaixo (equipe 0), convidado espelhado em cima (equipe 1)
    const teamA = boards.host.map(u => ({ ...u }));
    const teamB = mirrorSpec(boards.guest);
    // a formação do adversário vira a prévia da próxima rodada
    this.oppSpec = mirrorSpec(this.flip ? boards.host : boards.guest);
    this.state = 'countdown';
    this.speedBtn.r.setVisible(true); this.speedBtn.t.setVisible(true);
    if (this.hooks.countdown) this.hooks.countdown(() => this._startBattle(teamA, teamB));
    else this._startBattle(teamA, teamB);
  }

  pvpOppLeft() {
    this._toast(`${this.oppName} saiu da partida`, '#ff6b5e');
  }

  // ================================================================
  // painel de informações (toque numa unidade)
  // ================================================================
  _openInfo(defId, star, uid) {
    this._closePanels(true);
    const def = UNITS[defId];
    const showEquip = uid !== null && this.state === 'prep';
    const h = showEquip ? 340 : 236;
    const top = this._panelBase(h);
    const P = this.panelUI;
    const mult = { 1: 1, 2: 1.8, 3: 3.2 }[star];
    const T = (x, y, txt, size, color, style = '600', origin = 0) =>
      P.push(this.add.text(x, y, txt, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: style, color, wordWrap: { width: GAME_W - 60 } }).setOrigin(origin, 0).setDepth(62));
    const view = this._makeView(defId, star, uid !== null ? 0 : 1, 52, top + 44);
    view.setDepth(62); P.push(view);
    T(92, top + 12, def.name.toUpperCase(), 18, '#fff', '700');
    for (let i = 0; i < star; i++) P.push(this.add.star(96 + i * 14, top + 42, 5, 3, 6, 0xffd23e).setDepth(62));
    T(92 + star * 14 + 4, top + 34, `${RARITIES[def.rarity].name}`, 12, RARITIES[def.rarity].text);
    T(92, top + 54, `${FACTIONS[def.faction].name}  ·  ${CLASSES[def.cls].name}`, 13, '#b8bfd8');
    const eq = uid !== null ? this.run.byUid(uid).equip : null;
    const eqBonus = eq ? equipBonus(eq) : null;
    const dispHp = Math.round(def.hp * mult * (1 + (eqBonus ? eqBonus.hp : 0)));
    const dispAtk = Math.round(def.atk * mult * (1 + (eqBonus ? eqBonus.atk : 0)));
    T(20, top + 84, `Vida ${dispHp}   ·   Dano ${dispAtk}   ·   ${def.as.toFixed(1).replace('.', ',')} golpes/s   ·   Alcance ${def.range}`, 12.5, eqBonus && (eqBonus.hp || eqBonus.atk) ? '#8fe66a' : '#e8ecff');
    T(20, top + 108, def.ability.name.toUpperCase(), 13, '#ffd23e', '700');
    T(20, top + 126, def.ability.desc(star), 12.5, '#b8bfd8');
    if (showEquip) {
      T(20, top + 172, 'EQUIPAMENTO', 12, '#b8bfd8', '700');
      SLOTS.forEach((slot, i) => {
        const x = 60 + i * 108, y = top + 220;
        const itemId = eq[slot];
        const box = this.add.rectangle(x, y, 92, 60, itemId ? 0x2a3a66 : 0x1c2440, 1).setStrokeStyle(2, itemId ? RARITIES[ITEMS[itemId].rarity].color : 0x453a82).setDepth(62).setInteractive();
        P.push(box);
        P.push(this.add.text(x, y - 14, this._iconFor(slot), { fontSize: '18px' }).setOrigin(0.5).setDepth(63));
        P.push(this.add.text(x, y + 12, itemId ? ITEMS[itemId].name : SLOT_NAME[slot], { fontFamily: FONT, fontSize: '9px', fontStyle: '700', color: itemId ? '#fff' : '#7f86a8', align: 'center', wordWrap: { width: 84 } }).setOrigin(0.5).setDepth(63));
        box.on('pointerdown', () => {
          sfx.click();
          if (itemId) this._showSlotMenu(uid, slot, itemId);
          else this._showInventoryForSlot(uid, slot);
        });
      });
      const u = this.run.byUid(uid);
      const v = sellValue(def, u.star);
      this._btn(120, top + h - 34, 190, 46, `VENDER  +${v}`, 0xe8483f, () => this._sellSelected(uid), P, 15);
      this._btn(GAME_W / 2 + 90, top + h - 34, 150, 46, 'FECHAR', 0x453a82, () => this._closePanels(), P, 15);
    } else {
      this._btn(GAME_W / 2, top + h - 34, 200, 46, 'FECHAR', 0x453a82, () => this._closePanels(), P, 15);
    }
  }

  // toque num slot ocupado: trocar (abre o inventário) ou remover
  _showSlotMenu(uid, slot, itemId) {
    this._closePanels(true);
    for (const o of this.prepUI) o.setVisible(false);
    const P = this.panelUI;
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0b0f24, 0.85).setDepth(58).setInteractive(); P.push(dim);
    P.push(this.add.text(GAME_W / 2, 200, ITEMS[itemId].name, { fontFamily: FONT, fontSize: '18px', fontStyle: '700', color: '#fff' }).setOrigin(0.5).setDepth(61));
    this._btn(GAME_W / 2, 260, 240, 46, 'TROCAR', 0x2fb573, () => this._showInventoryForSlot(uid, slot), P, 15);
    this._btn(GAME_W / 2, 314, 240, 46, 'REMOVER (volta pro inventário)', 0x453a82, () => { this.run.unequipItem(uid, slot); this._closePanels(); this._refreshPrep(); }, P, 12.5);
    this._btn(GAME_W / 2, 368, 200, 40, 'CANCELAR', 0x453a82, () => this._closePanels(), P, 13);
  }

  // itens do inventário que cabem naquele slot, pra equipar numa unidade
  _showInventoryForSlot(uid, slot) {
    this._closePanels(true);
    for (const o of this.prepUI) o.setVisible(false);
    const P = this.panelUI;
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0b0f24, 0.9).setDepth(58).setInteractive(); P.push(dim);
    P.push(this.add.text(GAME_W / 2, 66, `INVENTÁRIO · ${SLOT_NAME[slot].toUpperCase()}`, { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: '#fff' }).setOrigin(0.5).setDepth(61));
    const opts = this.run.inventory.filter(id => ITEMS[id] && ITEMS[id].slot === slot);
    if (!opts.length) P.push(this.add.text(GAME_W / 2, 130, 'Nenhum item desse tipo guardado.\nGanhe mais em rodadas de recompensa.', { fontFamily: FONT, fontSize: '13px', color: '#7f86a8', align: 'center' }).setOrigin(0.5, 0).setDepth(61));
    opts.forEach((id, i) => {
      const it = ITEMS[id];
      const y = 110 + i * 70;
      if (y > GAME_H - 70) return;
      const row = this.add.rectangle(GAME_W / 2, y, GAME_W - 40, 58, 0x1c2440, 1).setStrokeStyle(2, RARITIES[it.rarity].color).setDepth(60).setInteractive(); P.push(row);
      P.push(this.add.text(46, y, this._iconFor(it.slot), { fontSize: '20px' }).setOrigin(0.5).setDepth(61));
      P.push(this.add.text(80, y - 12, it.name, { fontFamily: FONT, fontSize: '13px', fontStyle: '700', color: '#fff' }).setOrigin(0, 0.5).setDepth(61));
      P.push(this.add.text(80, y + 10, Object.entries(it.stats || {}).map(([k, v]) => this._statLabel(k, v)).join(' · '), { fontFamily: FONT, fontSize: '10px', color: '#8fe66a' }).setOrigin(0, 0.5).setDepth(61));
      row.on('pointerdown', () => { sfx.click(); const res = this.run.equipItem(uid, slot, id); if (res.ok) { this._toast(res.replaced ? `Trocado por ${it.name}` : `${it.name} equipado`, '#8fe66a'); this._closePanels(); this._refreshPrep(); } });
    });
    this._btn(GAME_W / 2, GAME_H - 46, 200, 44, 'CANCELAR', 0x453a82, () => this._closePanels(), P, 14);
  }

  _panelBase(h) {
    const y = GAME_H - h / 2 - 8;
    const top = y - h / 2;
    this.panelUI = this.panelUI || [];
    this.panelUI.push(this.add.rectangle(GAME_W / 2, y, GAME_W - 16, h, 0x2a2358, 0.98)
      .setStrokeStyle(2.5, 0x453a82).setDepth(60).setInteractive());
    const cx = GAME_W - 26, cy = top + 15;
    const c = this.add.circle(cx, cy, 15, 0x453a82).setDepth(63).setInteractive();
    c.on('pointerdown', () => { sfx.click(); this._closePanels(); });
    const ct = this.add.text(cx, cy, '✕', { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: '#fff' }).setOrigin(0.5).setDepth(64);
    this.panelUI.push(c, ct);
    if (this.state === 'prep') for (const o of this.prepUI) o.setVisible(false);
    return top;
  }

  _closePanels(keepSelection = false) {
    for (const o of this.panelUI) o.destroy();
    this.panelUI = [];
    if (!keepSelection) { this.selected = null; this._select(null); }
    if (this.state === 'prep') this._setPrepVisible(true);
  }

  // ================================================================
  // equipamentos: recompensa (escolha 1 de 3) → equipar/guardar/vender
  // ================================================================
  _itemIcon(itemId) {
    const it = ITEMS[itemId];
    return { '⚔️': 'weapon', '🛡️': 'armor', '💍': 'accessory' }[it.slot] || '⚔️';
  }
  _iconFor(slot) { return slot === 'weapon' ? '⚔️' : slot === 'armor' ? '🛡️' : '💍'; }

  _showReward() {
    this._closePanels(true);
    const rw = this.run.pendingReward; if (!rw) return;
    for (const o of this.prepUI) o.setVisible(false);
    const P = this.panelUI;
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0b0f24, 0.88).setDepth(58).setInteractive(); P.push(dim);
    const title = rw.boss ? '👑 RECOMPENSA DO CHEFE!' : '🎁 RODADA CONCLUÍDA!';
    P.push(this.add.text(GAME_W / 2, 96, title, { fontFamily: FONT, fontSize: '19px', fontStyle: '700', color: rw.boss ? '#ffd23e' : '#fff' }).setOrigin(0.5).setDepth(61));
    P.push(this.add.text(GAME_W / 2, 122, 'Escolha 1 equipamento', { fontFamily: FONT, fontSize: '13px', color: '#b8bfd8' }).setOrigin(0.5).setDepth(61));
    const cw = 108, gap = 10, x0 = GAME_W / 2 - (cw * 3 + gap * 2) / 2 + cw / 2;
    rw.ids.forEach((id, i) => {
      const it = ITEMS[id];
      const x = x0 + i * (cw + gap), y = 250;
      const rar = RARITIES[it.rarity];
      const card = this.add.rectangle(x, y, cw, 224, 0x1c2440, 1).setStrokeStyle(3, rar.color).setDepth(60).setInteractive(); P.push(card);
      P.push(this.add.text(x, y - 96, this._iconFor(it.slot), { fontSize: '30px' }).setOrigin(0.5).setDepth(61));
      P.push(this.add.text(x, y - 62, it.name, { fontFamily: FONT, fontSize: '12.5px', fontStyle: '700', color: '#fff', align: 'center', wordWrap: { width: cw - 12 } }).setOrigin(0.5, 0).setDepth(61));
      P.push(this.add.text(x, y - 24, rar.name.toUpperCase(), { fontFamily: FONT, fontSize: '10.5px', fontStyle: '700', color: rar.text }).setOrigin(0.5).setDepth(61));
      const statTxt = Object.entries(it.stats || {}).map(([k, v]) => this._statLabel(k, v)).join('\n');
      P.push(this.add.text(x, y - 6, statTxt, { fontFamily: FONT, fontSize: '11px', color: '#8fe66a', align: 'center', lineSpacing: 3 }).setOrigin(0.5, 0).setDepth(61));
      if (it.desc) P.push(this.add.text(x, y + 60, it.desc, { fontFamily: FONT, fontSize: '9.5px', color: '#b8bfd8', align: 'center', wordWrap: { width: cw - 10 } }).setOrigin(0.5, 0).setDepth(61));
      card.on('pointerdown', () => { sfx.click(); this.run.chooseReward(id); this._showItemDecision(id); });
    });
  }
  _statLabel(key, v) {
    const pct = (n) => Math.round(n * 100) + '%';
    const map = { atkPct: `+${pct(v)} Dano`, hpPct: `+${pct(v)} Vida`, asPct: `+${pct(v)} Vel. ataque`, armorFlat: `+${pct(v)} Armadura`, critPct: `+${pct(v)} Crítico`, lifesteal: `+${pct(v)} Roubo de vida` };
    return map[key] || key;
  }

  // depois de escolher 1 de 3: fica no inventário — decide equipar, guardar ou vender
  _showItemDecision(itemId) {
    this._closePanels(true);
    const it = ITEMS[itemId]; if (!it) return;
    for (const o of this.prepUI) o.setVisible(false);
    const P = this.panelUI;
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0b0f24, 0.88).setDepth(58).setInteractive(); P.push(dim);
    const rar = RARITIES[it.rarity];
    P.push(this.add.text(GAME_W / 2, 140, this._iconFor(it.slot), { fontSize: '52px' }).setOrigin(0.5).setDepth(61));
    P.push(this.add.text(GAME_W / 2, 210, it.name, { fontFamily: FONT, fontSize: '20px', fontStyle: '700', color: '#fff' }).setOrigin(0.5).setDepth(61));
    P.push(this.add.text(GAME_W / 2, 236, `${rar.name.toUpperCase()} · ${SLOT_NAME[it.slot]}`, { fontFamily: FONT, fontSize: '12px', fontStyle: '700', color: rar.text }).setOrigin(0.5).setDepth(61));
    const statTxt = Object.entries(it.stats || {}).map(([k, v]) => this._statLabel(k, v)).join('   ·   ');
    P.push(this.add.text(GAME_W / 2, 268, statTxt, { fontFamily: FONT, fontSize: '13px', color: '#8fe66a' }).setOrigin(0.5).setDepth(61));
    if (it.desc) P.push(this.add.text(GAME_W / 2, 292, it.desc, { fontFamily: FONT, fontSize: '11.5px', color: '#b8bfd8', align: 'center', wordWrap: { width: GAME_W - 80 } }).setOrigin(0.5, 0).setDepth(61));
    this._btn(GAME_W / 2, 380, 260, 50, 'EQUIPAR', 0x2fb573, () => this._showUnitPicker(itemId), P, 16);
    this._btn(GAME_W / 2, 440, 260, 44, 'GUARDAR NO INVENTÁRIO', 0x453a82, () => this._closePanels(), P, 14);
    this._btn(GAME_W / 2, 494, 260, 44, `VENDER  +${SELL_VALUE[it.rarity]} ouro`, 0xe8483f, () => { this.run.sellItem(itemId); sfx.coin(); this._toast(`Vendido por ${SELL_VALUE[it.rarity]}`, '#ffd23e'); this._closePanels(); this._hud(); }, P, 14);
  }

  // escolhe em qual unidade (banco ou campo) equipar o item recém-obtido
  _showUnitPicker(itemId) {
    this._closePanels(true);
    const it = ITEMS[itemId]; if (!it || !this.run.inventory.includes(itemId)) { this._closePanels(); return; }
    for (const o of this.prepUI) o.setVisible(false);
    const P = this.panelUI;
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0b0f24, 0.9).setDepth(58).setInteractive(); P.push(dim);
    P.push(this.add.text(GAME_W / 2, 70, `EQUIPAR: ${it.name.toUpperCase()}`, { fontFamily: FONT, fontSize: '16px', fontStyle: '700', color: '#fff' }).setOrigin(0.5).setDepth(61));
    P.push(this.add.text(GAME_W / 2, 94, `${SLOT_NAME[it.slot]} · toque numa unidade`, { fontFamily: FONT, fontSize: '12px', color: '#b8bfd8' }).setOrigin(0.5).setDepth(61));
    const units = [...this.run.units].sort((a, b) => (a.place.kind === 'board' ? 0 : 1) - (b.place.kind === 'board' ? 0 : 1));
    const rowH = 62, y0 = 130;
    units.forEach((u, i) => {
      const def = UNITS[u.id];
      const y = y0 + i * rowH;
      if (y > GAME_H - 60) return;
      const row = this.add.rectangle(GAME_W / 2, y, GAME_W - 40, rowH - 8, 0x1c2440, 1).setStrokeStyle(2, 0x453a82).setDepth(60).setInteractive(); P.push(row);
      P.push(this.add.image(50, y, 'bt-' + u.id).setScale(0.55).setDepth(61));
      P.push(this.add.text(84, y - 12, `${def.name}  ${'★'.repeat(u.star)}`, { fontFamily: FONT, fontSize: '13px', fontStyle: '700', color: '#fff' }).setOrigin(0, 0.5).setDepth(61));
      const current = u.equip[it.slot];
      const where = u.place.kind === 'board' ? 'em campo' : 'no banco';
      P.push(this.add.text(84, y + 10, current ? `troca: ${ITEMS[current].name}` : `${SLOT_NAME[it.slot]} vazio · ${where}`, { fontFamily: FONT, fontSize: '10.5px', color: current ? '#ffd23e' : '#7f86a8' }).setOrigin(0, 0.5).setDepth(61));
      row.on('pointerdown', () => {
        sfx.click();
        const res = this.run.equipItem(u.uid, it.slot, itemId);
        if (!res.ok) return;
        this._toast(res.replaced ? `${it.name} equipado (trocou ${ITEMS[res.replaced].name})` : `${it.name} equipado em ${def.name}`, '#8fe66a');
        this._closePanels();
        this._refreshPrep();
      });
    });
    this._btn(GAME_W / 2, Math.min(GAME_H - 34, y0 + units.length * rowH + 20), 200, 44, 'CANCELAR', 0x453a82, () => { this._closePanels(); }, P, 14);
  }

  // ================================================================
  // efeitos
  // ================================================================
  _toast(text, color = '#fff') {
    if (this.toastObj) this.toastObj.destroy();
    const t = this.add.text(GAME_W / 2, OY + 4 * CELL_H, text, {
      fontFamily: FONT, fontSize: '15px', fontStyle: '700', color, backgroundColor: '#1c2440', padding: { x: 12, y: 7 },
    }).setOrigin(0.5).setDepth(80);
    this.toastObj = t;
    this.tweens.add({ targets: t, y: t.y - 16, alpha: 0, delay: 1000, duration: 500, onComplete: () => { if (this.toastObj === t) this.toastObj = null; t.destroy(); } });
  }

  _float(x, y, text, color, size = 14) {
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: '700', color, stroke: '#1c2440', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 800, ease: 'quad.out', onComplete: () => t.destroy() });
  }

  _ring(x, y, color, r0, r1, dur = 380) {
    const c = this.add.circle(x, y, r0).setStrokeStyle(3, color, 0.9).setDepth(35);
    this.tweens.add({ targets: c, radius: r1, alpha: 0, duration: dur, ease: 'quad.out', onUpdate: () => c.setRadius(c.radius), onComplete: () => c.destroy() });
  }

  _sparks(x, y, color, n = 6, spd = 60) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const d = this.add.image(x, y, 'bt-dot').setTint(color).setScale(0.5 + Math.random() * 0.4).setDepth(36);
      this.tweens.add({ targets: d, x: x + Math.cos(a) * spd, y: y + Math.sin(a) * spd - 10, alpha: 0, scale: 0.1, duration: 420, onComplete: () => d.destroy() });
    }
  }

  _fxMerge(v, star) {
    sfx.powerup();
    v.setScale(0.6);
    this.tweens.add({ targets: v, scale: 1, duration: 420, ease: 'back.out' });
    this._ring(v.x, v.y, 0xffd23e, 10, 60, 520);
    this._sparks(v.x, v.y - 10, 0xffd23e, 10, 70);
    this._float(v.x, v.y - 40, star === 3 ? '★★★ LENDÁRIA!' : '★★ EVOLUIU!', '#ffd23e', 16);
    this._toast(star === 3 ? 'Três estrelas! Uma unidade lendária.' : 'Três iguais viraram uma mais forte!', '#ffd23e');
  }

  _fxLevel() {
    this._toast(`Nível ${this.run.level}! Até ${this.run.maxOnBoard} em campo`, '#7fd0ff');
    this._ring(GAME_W / 2, OY + 6 * CELL_H, 0x7fd0ff, 20, 120, 600);
  }

  _hud() {
    if (!this.hooks.updateHUD) return;
    const r = this.run;
    const syn = teamSynergies(r.boardSpec());
    this.hooks.updateHUD({
      round: r.round, hp: r.hp, gold: r.gold, level: r.level, xp: r.xp, xpToNext: r.xpToNext,
      synergies: syn.list, pairs: syn.pairs,
      oppHp: this.oppHp, oppName: this.oppName, pvp: this.mode === 'pvp',
    });
  }

  // ================================================================
  // ciclo: preparação → batalha → resultado
  // ================================================================
  _enterPrep(first = false) {
    this.state = 'prep';
    this.oppReady = false;
    this.prepLeft = PVP_PREP_TIME;
    this._setBattleVisible(false);
    this._setPrepVisible(true);
    this._refreshPrep();
    if (first) this._toast(this.mode === 'pvp' ? `1 contra 1 com ${this.oppName}. Monte e aperte LUTAR` : 'Compre na loja e arraste para o campo', '#ffd23e');
    // uma batalha pode ter chegado enquanto a animação anterior rodava
    if (this.pendingBattle) this._maybeStartPvp();
  }

  _startBattle(teamA, teamB) {
    this.state = 'battle';
    this.acc = 0;
    this._clearViews();
    this.battle = createBattle(teamA, teamB, (this.seed + this.run.round * 7919) >>> 0);
    for (const f of this.battle.units) {
      const v = this._makeView(f.id, f.star, this._sideOf(f.team), this.dx(f.c), this.dy(f.r));
      v.setDepth(10 + (this.flip ? ROWS - 1 - f.r : f.r));
      v.hpBg.setVisible(true); v.hpBar.setVisible(true); v.manaBar.setVisible(true);
      v.sprite.setFlipX(this._sideOf(f.team) === 1);
      this.views.set(f.uid, v);
    }
    if (this.mode === 'pve') {
      const spec = ROUNDS[this.run.round - 1];
      this.roundLabel.setText(`${spec.boss ? 'CHEFE' : 'RODADA ' + this.run.round}: ${spec.name}`).setColor('#b8bfd8');
      this.battleTitle.setText(spec.boss ? 'O CHEFE CHEGOU' : `RODADA ${this.run.round}`);
    } else {
      this.roundLabel.setText(`Você  ✕  ${this.oppName}`).setColor('#b8bfd8');
      this.battleTitle.setText(`RODADA ${this.run.round}`);
    }
    this._setBattleVisible(true);
    this._ring(GAME_W / 2, OY + 4 * CELL_H, 0xffd23e, 10, 200, 500);
  }

  // lado visual: 0 = meu (embaixo), 1 = deles (em cima)
  _sideOf(team) { return this.flip ? 1 - team : team; }
  _myTeam() { return this.flip ? 1 : 0; }

  _endBattle(winner) {
    this.state = 'after';
    const me = this._myTeam();
    const won = winner === me;
    const draw = winner < 0;
    const enemiesAlive = this.battle.units.filter(u => u.team !== me && u.alive);
    const myAlive = this.battle.units.filter(u => u.team === me && u.alive);
    const bossAlive = enemiesAlive.some(u => u.def.boss);
    if (this.mode === 'pve') {
      const spec = ROUNDS[this.run.round - 1];
      if (spec.boss && !bossAlive) this.run.stats.bossKilled = true;
    }
    const damage = won || draw ? 0 : playerDamage(this.run.round, enemiesAlive.length, bossAlive);
    const oppDamage = won ? playerDamage(this.run.round, myAlive.length, false) : 0;

    if (won) sfx.win(); else if (draw) sfx.powerup(); else sfx.lose();
    const msg = draw ? 'EMPATE' : won ? 'VITÓRIA!' : `DERROTA  −${damage} ❤`;
    const t = this.add.text(GAME_W / 2, OY + 4 * CELL_H, msg, {
      fontFamily: FONT, fontSize: '40px', fontStyle: '700', color: won ? '#8fe66a' : draw ? '#ffd23e' : '#ff6b5e', stroke: '#1c2440', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(70).setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 380, ease: 'back.out' });
    if (won) this._sparks(GAME_W / 2, OY + 4 * CELL_H, 0xffd23e, 14, 120);

    this.time.delayedCall(1500, () => {
      t.destroy();
      const playedRound = this.run.round, playedBoss = this.mode === 'pve' && ROUNDS[playedRound - 1] && ROUNDS[playedRound - 1].boss;
      const res = this.run.endRound({ won, damage });
      if (this.mode === 'pvp') this.oppHp = Math.max(0, this.oppHp - oppDamage);
      // Só a Aventura solo tem loot/chefe por enquanto (o PvP já tem seu
      // próprio equilíbrio 1x1; equipamento fica pra uma passada futura lá).
      if (this.mode === 'pve' && won) {
        if (playedBoss) this.run.openReward(rollBossReward(this.run.rnd), true);
        else if (LOOT_ROUNDS.includes(playedRound)) this.run.openReward(rollRewards(this.run.rnd, 3, { round: playedRound, level: this.run.level, boardSize: this.run.boardUnits().length }), false);
      }
      const b = res.breakdown;
      const parts = [`${b.base} base`];
      if (b.interest) parts.push(`${b.interest} juros`);
      if (b.streak) parts.push(`${b.streak} sequência`);
      if (b.win) parts.push(`${b.win} vitória`);
      this._hud();

      let finished = res.finished, wonRun = !res.dead;
      if (this.mode === 'pvp') {
        // PvP: acaba quando alguém zera ou depois da rodada 10 (mais vida vence)
        const lastRound = this.run.round > TOTAL_ROUNDS || (res.finished && !res.dead);
        finished = res.dead || this.oppHp <= 0 || lastRound;
        wonRun = this.oppHp <= 0 ? true : res.dead ? false : this.run.hp > this.oppHp;
      }
      if (finished) {
        this.state = 'over';
        this._setBattleVisible(false);
        this._clearViews();
        this.time.delayedCall(400, () => { if (this.hooks.onGameOver) this.hooks.onGameOver(this.summary(wonRun)); });
        return;
      }
      this._enterPrep();
      this._toast(`+${res.total} ouro  (${parts.join(' + ')})`, '#ffd23e');
      if (res.leveled) this.time.delayedCall(1300, () => this._fxLevel());
      if (this.run.pendingReward) this.time.delayedCall(res.leveled ? 1700 : 900, () => this._showReward());
    });
  }

  // ================================================================
  // loop
  // ================================================================
  update(_, delta) {
    if (this.paused) return;
    // PvP: relógio da preparação (quem não apertar LUTAR entra assim mesmo)
    if (this.mode === 'pvp' && this.state === 'prep') {
      this.prepLeft -= delta / 1000;
      if (Math.floor(this.prepLeft * 2) !== this._lastTick) { this._lastTick = Math.floor(this.prepLeft * 2); this._updateRoundLabel(); }
      if (this.prepLeft <= 0) this._fight(true);
      return;
    }
    if (this.state !== 'battle' || !this.battle) return;
    const dt = Math.min(delta / 1000, 0.05) * this.speedMult;
    this.acc += dt;
    let guard = 0;
    while (this.acc >= STEP && !this.battle.over && guard++ < 8) {
      step(this.battle);
      this.acc -= STEP;
      for (const ev of drainEvents(this.battle)) this._onEvent(ev);
    }
    this._renderBattle();
    if (this.battle.over && this.state === 'battle') this._endBattle(this.battle.winner);
  }

  _renderBattle() {
    const b = this.battle;
    const alive = [0, 0];
    for (const f of b.units) {
      const v = this.views.get(f.uid);
      if (!v || !f.alive) continue;
      alive[this._sideOf(f.team)]++;
      v.hpBar.width = 44 * Math.max(0, f.hp / f.maxHp);
      v.manaBar.width = 44 * Math.min(1, f.mana / MANA_MAX);
      v.shieldFx.setVisible(f.shield > 0);
      if (f.burn > 0) v.sprite.setTint(0xffa060);
      else if (f.stun > 0) v.sprite.setTint(0x9fe8ff);
      else if (f.slowT > 0) v.sprite.setTint(0xc8dcf0);
      else if (!v._flash) v.sprite.clearTint();
    }
    this.battleInfo.setText(`${alive[0]} ✕ ${alive[1]}   ·   ${Math.max(0, Math.ceil(45 - b.t))}s`);
  }

  _onEvent(ev) {
    const v = ev.uid ? this.views.get(ev.uid) : null;
    switch (ev.t) {
      case 'move': {
        if (!v) break;
        const nx = this.dx(ev.c), ny = this.dy(ev.r);
        if (nx !== v.x) v.sprite.setFlipX(nx < v.x);
        this.tweens.add({ targets: v, x: nx, y: ny, duration: Math.max(80, ev.dur * 1000 / this.speedMult), ease: 'sine.inOut' });
        v.setDepth(10 + (this.flip ? ROWS - 1 - ev.r : ev.r));
        break;
      }
      case 'leap': {
        if (!v) break;
        const nx = this.dx(ev.c), ny = this.dy(ev.r);
        this._sparks(v.x, v.y, 0xd45de0, 6, 30);
        this.tweens.add({ targets: v, x: nx, y: ny, duration: 220, ease: 'quad.out', onComplete: () => this._ring(nx, ny, 0xd45de0, 8, 34, 300) });
        v.setDepth(10 + (this.flip ? ROWS - 1 - ev.r : ev.r));
        break;
      }
      case 'attack': {
        const to = this.views.get(ev.to);
        if (!v || !to) break;
        if (ev.ranged) this._shot(v, to, 'hit');
        else {
          const dx = to.x - v.x, dy = to.y - v.y, d = Math.hypot(dx, dy) || 1;
          this.tweens.add({ targets: v.sprite, x: dx / d * 12, y: dy / d * 12, duration: 90, yoyo: true, ease: 'quad.out' });
        }
        const now = this.time.now;
        if (now - this.lastHitSfx > 140) { this.lastHitSfx = now; sfx.lane(); }
        break;
      }
      case 'shot': {
        const from = this.views.get(ev.from), to = this.views.get(ev.to);
        if (from && to) this._shot(from, to, ev.kind);
        break;
      }
      case 'hit': {
        if (!v) break;
        v._flash = true;
        v.sprite.setTintFill(0xffffff);
        this.time.delayedCall(70, () => { v._flash = false; if (v.active) v.sprite.clearTint(); });
        if (ev.tag === 'skill') this._float(v.x + (Math.random() * 16 - 8), v.y - 24, `−${ev.dmg}`, '#ffd23e', 15);
        else if (ev.tag === 'crit') this._float(v.x + (Math.random() * 16 - 8), v.y - 24, `−${ev.dmg}!`, '#ff6b9d', 16);
        else if (ev.tag === 'burn') this._float(v.x, v.y - 20, `−${ev.dmg}`, '#ff8b3d', 11);
        break;
      }
      case 'heal': {
        if (!v) break;
        this._sparks(v.x, v.y - 6, 0x8fe66a, 5, 28);
        this._float(v.x, v.y - 26, `+${ev.amount}`, '#8fe66a', 13);
        break;
      }
      case 'cast': {
        if (!v) break;
        const f = this.battle.units.find(u => u.uid === ev.uid);
        const color = f ? FACTIONS[f.def.faction].color : 0xffd23e;
        this._ring(v.x, v.y + 6, color, 14, 52, 420);
        this._float(v.x, v.y - 46, ev.name, '#fff', 13);
        this.tweens.add({ targets: v.sprite, scale: v.sprite.scale * 1.25, duration: 120, yoyo: true });
        sfx.jump();
        break;
      }
      case 'blast': {
        const color = BLAST_COLOR[ev.color] || 0xffffff;
        const x = this.dx(ev.c), y = this.dy(ev.r);
        this._ring(x, y, color, 10, 30 + ev.radius * 40, 450);
        this._sparks(x, y, color, 8, 40 + ev.radius * 30);
        break;
      }
      case 'die': {
        if (!v) break;
        this._sparks(v.x, v.y, 0x9aa3c7, 6, 40);
        this.tweens.add({ targets: v, alpha: 0, scale: 0.5, y: v.y - 12, duration: 380, onComplete: () => { v.destroy(); this.views.delete(ev.uid); } });
        const now = this.time.now;
        if (now - this.lastHitSfx > 100) { this.lastHitSfx = now; sfx.hit(); }
        break;
      }
      case 'end':
        break;
    }
  }

  _shot(from, to, kind) {
    const d = this.add.image(from.x, from.y - 6, 'bt-dot').setTint(SHOT_COLOR[kind] || 0xffffff)
      .setScale(kind === 'hit' ? 0.7 : 1.2).setDepth(34);
    this.tweens.add({ targets: d, x: to.x, y: to.y - 4, duration: 160 / this.speedMult, onComplete: () => {
      d.destroy();
      if (kind !== 'hit') this._sparks(to.x, to.y - 4, SHOT_COLOR[kind], 5, 26);
    } });
  }
}
