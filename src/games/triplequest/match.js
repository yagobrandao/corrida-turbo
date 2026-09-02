// Triple Quest — estado de uma partida (puro).
//
// Tabuleiro + bandeja + trios + combo + boosters. Sem Phaser: a cena chama
// os métodos e anima o que eles devolvem. `now` chega de fora (segundos)
// para o combo não depender de relógio.
import { isFree, chooseGreedy } from './generator.js';
import { COMBO_WINDOW } from './config.js';

export class Match {
  constructor(level) {
    this.level = level;
    this.tiles = level.tiles.map(t => ({ ...t, alive: true }));
    this.traySize = level.traySize;
    this.tray = [];                 // [{ id, type }]
    this.history = [];              // ids na ordem em que entraram (para desfazer)
    this.moves = 0;
    this.movesLeft = level.moves;   // null = sem limite
    this.combo = 0;
    this.bestCombo = 0;
    this.lastTripleAt = -Infinity;
    this.triples = 0;
    this.maxTray = 0;
    this.boostersUsed = 0;
    this.over = null;               // 'won' | 'lost' | null
  }

  byId(id) { return this.tiles.find(t => t.id === id); }
  alive() { return this.tiles.filter(t => t.alive); }
  free() { return this.tiles.filter(t => isFree(t, this.tiles)); }
  isFree(t) { return isFree(t, this.tiles); }
  remaining() { return this.alive().length; }

  // Toque numa peça livre: vai para a bandeja; três iguais somem.
  pick(id, now = 0) {
    if (this.over) return { ok: false };
    const t = this.byId(id);
    if (!t || !t.alive || !this.isFree(t)) return { ok: false };
    if (this.movesLeft !== null && this.movesLeft <= 0) return { ok: false };
    t.alive = false;
    this.moves++;
    if (this.movesLeft !== null) this.movesLeft--;
    // entra ao lado das iguais, como nos jogos do gênero
    let at = -1;
    for (let i = this.tray.length - 1; i >= 0; i--) if (this.tray[i].type === t.type) { at = i + 1; break; }
    if (at < 0) at = this.tray.length;
    this.tray.splice(at, 0, { id: t.id, type: t.type });
    this.history.push(t.id);
    this.maxTray = Math.max(this.maxTray, this.tray.length);

    const same = this.tray.filter(x => x.type === t.type);
    let cleared = [];
    let label = null;
    if (same.length >= 3) {
      cleared = same.slice(0, 3).map(x => x.id);
      this.tray = this.tray.filter(x => !cleared.includes(x.id));
      this.history = this.history.filter(h => !cleared.includes(h));
      this.triples++;
      this.combo = now - this.lastTripleAt <= COMBO_WINDOW ? this.combo + 1 : 1;
      this.lastTripleAt = now;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      label = this.combo;
      this._onTriple(t.type);
    }
    this._checkEnd();
    return { ok: true, tile: t, at, cleared, combo: label, over: this.over };
  }

  _onTriple(type) {
    for (const x of this.tiles) {
      if (!x.alive) continue;
      if (x.frozen > 0) x.frozen--;
      if (x.locked === type) x.locked = null;
    }
  }

  _checkEnd() {
    if (!this.alive().length && !this.tray.length) { this.over = 'won'; return; }
    if (this.tray.length >= this.traySize) { this.over = 'lost'; return; }
    if (this.movesLeft !== null && this.movesLeft <= 0 && this.alive().length) { this.over = 'lost'; return; }
    if (this.alive().length && !this.free().length) this.over = 'lost';
  }

  // ---------------------------------------------------------------- boosters
  undo() {
    if (this.over || !this.history.length) return null;
    const id = this.history.pop();
    const i = this.tray.findIndex(x => x.id === id);
    if (i < 0) return null;
    this.tray.splice(i, 1);
    const t = this.byId(id);
    t.alive = true;
    this.moves = Math.max(0, this.moves - 1);
    if (this.movesLeft !== null) this.movesLeft++;
    this.boostersUsed++;
    return t;
  }

  // redistribui os tipos entre as peças vivas (a bandeja fica como está)
  shuffle(rnd = Math.random) {
    if (this.over) return false;
    const alive = this.alive();
    const types = alive.map(t => t.type);
    for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
    alive.forEach((t, i) => { t.type = types[i]; });
    this.boostersUsed++;
    this._checkEnd();
    return true;
  }

  // peça livre que mais ajuda agora (mesma cabeça do resolvedor)
  hint() {
    const frees = this.free();
    if (!frees.length) return null;
    const trayTypes = this.tray.map(x => x.type);
    return chooseGreedy(frees, trayTypes, this.tiles);
  }

  // tira um trio inteiro do tabuleiro (prefere um tipo que já está na bandeja)
  remove() {
    if (this.over) return null;
    const alive = this.alive();
    const count = {};
    for (const t of alive) count[t.type] = (count[t.type] || 0) + 1;
    const trayTypes = new Set(this.tray.map(x => x.type));
    // se há 2 na bandeja e 1 no tabuleiro, tirar as 3 fecha o trio
    for (const type of trayTypes) {
      const inTray = this.tray.filter(x => x.type === type);
      const onBoard = alive.filter(t => t.type === type);
      if (inTray.length + onBoard.length >= 3 && onBoard.length <= 3 - inTray.length + 0) { /* cai no genérico */ }
    }
    let type = Object.keys(count).find(k => count[k] >= 3 && trayTypes.has(k)) || Object.keys(count).find(k => count[k] >= 3);
    if (!type) return null;
    const gone = alive.filter(t => t.type === type).sort((a, b) => b.layer - a.layer).slice(0, 3);
    for (const t of gone) t.alive = false;
    this.boostersUsed++;
    this.triples++;
    this._onTriple(type);
    this._checkEnd();
    return gone;
  }

  extraTray() {
    if (this.over) return false;
    this.traySize++;
    this.boostersUsed++;
    return true;
  }
}
