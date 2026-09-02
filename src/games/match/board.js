// Pomar Mágico — tabuleiro (puro, sem Phaser).
//
// Toda a regra do match-3 mora aqui: troca, detecção de trios/quartetos/
// quintetos/T/L, criação e ativação de especiais (foguete, bomba, bomba de
// cor) e as combinações entre eles, obstáculos (gelo, caixa, corrente),
// gravidade, reposição e cascatas. Cada ação devolve uma lista de FASES
// que a cena anima em sequência; o estado só muda aqui.
//
// Justiça: o RNG é semeado por fase e a reposição é uniforme entre as
// cores da fase. Nada "decide" antes que o jogador vai perder.
import { mulberry32 } from '../../core/rng.js';
import { SCORE } from './config.js';

let nextId = 1;
const key = (r, c) => r * 32 + c;
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

export class Board {
  // level: { cols, rows, colors, moves, layout: [rows de string], objectives: [...], seedSpecials }
  constructor(level, seed = 1) {
    this.level = level;
    this.rows = level.rows; this.cols = level.cols; this.colors = level.colors;
    this.rnd = mulberry32(seed >>> 0);
    this.moves = level.moves; this.score = 0; this.over = null; this.combo = 0; this.bestCombo = 0;
    this.stats = { matches: 0, rockets: 0, bombs: 0, colorBombs: 0, specialsUsed: 0, cascadeMax: 0 };
    this.objectives = level.objectives.map(o => ({ ...o, got: 0 }));
    this.grid = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      const line = (level.layout && level.layout[r]) || '.'.repeat(this.cols);
      for (let c = 0; c < this.cols; c++) {
        const ch = line[c] || '.';
        row.push({ piece: null, ice: ch === 'i' ? 1 : ch === 'I' ? 2 : 0, box: ch === 'b' ? 1 : ch === 'B' ? 2 : 0, stone: ch === 'X' || ch === 'G', gen: ch === 'G', chain: ch === 'c', honey: ch === 'h' });
      }
      this.grid.push(row);
    }
    this.movesMade = 0;
    this._fill();
    // boosters pré-fase: especiais já no tabuleiro
    for (const s of level.seedSpecials || []) {
      const cands = this._allPieces().filter(p => !p.piece.s && !p.cell.chain);
      if (!cands.length) break;
      const pick = cands[Math.floor(this.rnd() * cands.length)];
      pick.piece.s = s === 'rocket' ? (this.rnd() < 0.5 ? 'rh' : 'rv') : s;
    }
  }

  // ---------------------------------------------------------------- utilidades
  cell(r, c) { return r >= 0 && c >= 0 && r < this.rows && c < this.cols ? this.grid[r][c] : null; }
  playable(r, c) { const x = this.cell(r, c); return x && !x.stone && !x.box; }
  pieceAt(r, c) { const x = this.cell(r, c); return x ? x.piece : null; }
  _allPieces() { const out = []; for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) { const cell = this.grid[r][c]; if (cell.piece) out.push({ r, c, cell, piece: cell.piece }); } return out; }
  _newPiece(color) { return { id: nextId++, c: color, s: null }; }
  _randColor(exclude = []) { let c; let guard = 0; do { c = Math.floor(this.rnd() * this.colors); } while (exclude.includes(c) && guard++ < 20); return c; }

  // preenchimento inicial sem trios prontos e com pelo menos uma jogada
  _fill() {
    for (let attempt = 0; attempt < 30; attempt++) {
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (!this.playable(r, c)) { cell.piece = null; continue; }
        const ex = [];
        const l1 = this.pieceAt(r, c - 1), l2 = this.pieceAt(r, c - 2), u1 = this.pieceAt(r - 1, c), u2 = this.pieceAt(r - 2, c);
        if (l1 && l2 && l1.c === l2.c) ex.push(l1.c);
        if (u1 && u2 && u1.c === u2.c) ex.push(u1.c);
        cell.piece = this._newPiece(this._randColor(ex));
      }
      if (this.findMove()) return;
    }
  }

  snapshot() {
    return this.grid.map(row => row.map(x => ({ piece: x.piece ? { ...x.piece } : null, ice: x.ice, box: x.box, stone: x.stone, chain: x.chain })));
  }

  // ---------------------------------------------------------------- jogadas possíveis
  _matchAt(r, c) {
    const p = this.pieceAt(r, c); if (!p) return false;
    let h = 1, v = 1;
    for (let i = c - 1; i >= 0 && this.pieceAt(r, i) && this.pieceAt(r, i).c === p.c; i--) h++;
    for (let i = c + 1; i < this.cols && this.pieceAt(r, i) && this.pieceAt(r, i).c === p.c; i++) h++;
    for (let i = r - 1; i >= 0 && this.pieceAt(i, c) && this.pieceAt(i, c).c === p.c; i--) v++;
    for (let i = r + 1; i < this.rows && this.pieceAt(i, c) && this.pieceAt(i, c).c === p.c; i++) v++;
    return h >= 3 || v >= 3;
  }
  _canMove(r, c) { const x = this.cell(r, c); return x && x.piece && !x.chain && !x.honey; }
  _swapValid(r1, c1, r2, c2) {
    const a = this.pieceAt(r1, c1), b = this.pieceAt(r2, c2);
    if (a.s === 'color' || b.s === 'color') return true;
    if (a.s && b.s) return true;
    this._swap(r1, c1, r2, c2);
    const ok = this._matchAt(r1, c1) || this._matchAt(r2, c2);
    this._swap(r1, c1, r2, c2);
    return ok;
  }
  findMove() {
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      if (!this._canMove(r, c)) continue;
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const r2 = r + dr, c2 = c + dc;
        if (!this._canMove(r2, c2)) continue;
        if (this._swapValid(r, c, r2, c2)) return { r1: r, c1: c, r2, c2 };
      }
    }
    return null;
  }
  _swap(r1, c1, r2, c2) { const a = this.grid[r1][c1], b = this.grid[r2][c2]; const t = a.piece; a.piece = b.piece; b.piece = t; }

  // ---------------------------------------------------------------- troca
  // Devolve { ok, phases }. Troca inválida não gasta jogada.
  trySwap(r1, c1, r2, c2) {
    if (this.over) return { ok: false, phases: [] };
    if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return { ok: false, phases: [] };
    if (!this._canMove(r1, c1) || !this._canMove(r2, c2)) return { ok: false, phases: [{ t: 'locked', r: this._canMove(r1, c1) ? r2 : r1, c: this._canMove(r1, c1) ? c2 : c1 }] };
    const ida = this.pieceAt(r1, c1).id, idb = this.pieceAt(r2, c2).id;
    if (!this._swapValid(r1, c1, r2, c2)) return { ok: false, phases: [{ t: 'swap', a: { r: r1, c: c1, id: ida }, b: { r: r2, c: c2, id: idb }, fail: true }] };
    const phases = [{ t: 'swap', a: { r: r1, c: c1, id: ida }, b: { r: r2, c: c2, id: idb } }];
    this._swap(r1, c1, r2, c2);
    this.moves--;
    const a = this.pieceAt(r1, c1), b = this.pieceAt(r2, c2);   // a agora está em (r1,c1) — era a peça de (r2,c2)
    const trig = [];
    if (a.s && b.s) trig.push({ kind: 'combo', r: r1, c: c1, a, b, r2, c2 });
    else if (a.s === 'color') trig.push({ kind: 'colorSwap', r: r1, c: c1, color: b.c });
    else if (b.s === 'color') trig.push({ kind: 'colorSwap', r: r2, c: c2, color: a.c });
    this.honeyCleared = false; this.movesMade++;
    this._resolve(phases, { r: r1, c: c1, r2, c2 }, trig);
    this._afterMove(phases);
    return { ok: true, phases };
  }

  // ---------------------------------------------------------------- boosters em jogo
  useBooster(id, r, c) {
    if (this.over) return { ok: false, phases: [] };
    const phases = [];
    if (id === 'hammer') {
      const cell = this.cell(r, c); if (!cell) return { ok: false, phases };
      if (cell.box) { cell.box--; phases.push({ t: 'clear', pieces: [], boxes: [{ r, c, left: cell.box }], ice: [], chains: [], effects: [{ kind: 'hammer', r, c }], created: [], score: 0, combo: 0 }); this._objBox(1); }
      else if (!cell.piece) return { ok: false, phases };
      else { this._resolve(phases, null, [{ kind: 'hammer', r, c }]); }
      this.stats.specialsUsed++;
      return { ok: true, phases };
    }
    if (id === 'shuffle') { this._shuffle(phases); this._resolve(phases, null, []); return { ok: true, phases }; }
    if (id === 'moves') { this.moves += 5; this.over = null; phases.push({ t: 'moves', moves: this.moves }); return { ok: true, phases }; }
    return { ok: false, phases };
  }
  addMoves(n) { this.moves += n; this.over = null; }

  // ---------------------------------------------------------------- bônus de fim de fase
  // Jogadas restantes viram especiais; depois tudo detona em cascata.
  endBonus() {
    const phases = [];
    const converted = [];
    while (this.moves > 0) {
      this.moves--;
      const cands = this._allPieces().filter(p => !p.piece.s);
      if (!cands.length) break;
      const pick = cands[Math.floor(this.rnd() * cands.length)];
      pick.piece.s = converted.length % 3 === 2 ? 'bomb' : (this.rnd() < 0.5 ? 'rh' : 'rv');
      converted.push({ r: pick.r, c: pick.c, id: pick.piece.id, s: pick.piece.s, color: pick.piece.c });
    }
    if (converted.length) phases.push({ t: 'convert', list: converted });
    let guard = 0;
    while (guard++ < 40) {
      const sp = this._allPieces().filter(p => p.piece.s);
      if (!sp.length) break;
      const pick = sp[0];
      this._resolve(phases, null, [{ kind: 'detonate', r: pick.r, c: pick.c }], true);
    }
    return phases;
  }

  // ---------------------------------------------------------------- núcleo: cascata
  _resolve(phases, swapPos, triggers, bonus = false) {
    this.combo = 0;
    let guard = 0;
    while (guard++ < 60) {
      const groups = this._findGroups();
      if (!groups.length && !triggers.length) break;
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.stats.cascadeMax = Math.max(this.stats.cascadeMax, this.combo);
      const removed = new Map();       // key -> {r,c,piece,bySpecial}
      const effects = [], created = [], boxesHit = new Set(), chainsHit = new Set(), honeyHit = new Set();
      const queue = [];                // especiais a ativar {r,c,piece}
      const mark = (r, c, bySpecial) => {
        const cell = this.cell(r, c); if (!cell) return;
        if (cell.box) { boxesHit.add(key(r, c)); return; }
        if (!cell.piece || removed.has(key(r, c))) return;
        if (cell.chain) { chainsHit.add(key(r, c)); if (!bySpecial) return; cell.chain = false; }
        if (cell.honey) { honeyHit.add(key(r, c)); if (!bySpecial) return; cell.honey = false; }
        removed.set(key(r, c), { r, c, piece: cell.piece, bySpecial });
        if (cell.piece.s) queue.push({ r, c, piece: cell.piece });
      };
      const mult = Math.min(SCORE.comboCap, this.combo);
      let gain = 0;

      // 1) grupos de match
      for (const g of groups) {
        this.stats.matches++;
        const special = g.special;
        let at = null;
        if (special) {
          at = swapPos && g.cells.some(x => (x.r === swapPos.r && x.c === swapPos.c) || (x.r === swapPos.r2 && x.c === swapPos.c2))
            ? (g.cells.find(x => x.r === swapPos.r && x.c === swapPos.c) || g.cells.find(x => x.r === swapPos.r2 && x.c === swapPos.c2))
            : g.cells[Math.floor(g.cells.length / 2)];
        }
        for (const x of g.cells) {
          if (at && x.r === at.r && x.c === at.c) continue;
          mark(x.r, x.c, false);
        }
        this._collect(g.color, g.cells.length - (at ? 1 : 0));
        for (const x of g.cells) { const cell = this.cell(x.r, x.c); if (cell.ice) { cell.ice--; this._objIce(1); effects.push({ kind: 'ice', r: x.r, c: x.c, left: cell.ice }); } }
        if (at) {
          const cell = this.cell(at.r, at.c);
          if (cell.piece.s) queue.push({ r: at.r, c: at.c, piece: cell.piece });   // já era especial: ativa
          const prev = cell.piece.id;
          cell.piece = { id: nextId++, c: g.color, s: special };
          created.push({ r: at.r, c: at.c, id: cell.piece.id, s: special, color: g.color, prev });
          gain += SCORE.create[special];
          if (special === 'bomb') this.stats.bombs++; else if (special === 'color') this.stats.colorBombs++; else this.stats.rockets++;
        }
      }
      // 2) gatilhos (trocas de especiais, martelo, detonação)
      for (const t of triggers) {
        if (t.kind === 'hammer') { effects.push({ kind: 'hammer', r: t.r, c: t.c }); mark(t.r, t.c, true); const cell = this.cell(t.r, t.c); if (cell.ice) { cell.ice--; this._objIce(1); effects.push({ kind: 'ice', r: t.r, c: t.c, left: cell.ice }); } }
        else if (t.kind === 'detonate') { const cell = this.cell(t.r, t.c); if (cell && cell.piece) { removed.set(key(t.r, t.c), { r: t.r, c: t.c, piece: cell.piece, bySpecial: true }); queue.push({ r: t.r, c: t.c, piece: cell.piece }); } }
        else if (t.kind === 'colorSwap') { this.stats.specialsUsed++; effects.push({ kind: 'color', r: t.r, c: t.c, color: t.color }); removed.set(key(t.r, t.c), { r: t.r, c: t.c, piece: this.pieceAt(t.r, t.c), bySpecial: true }); this._colorSweep(t.color, mark); }
        else if (t.kind === 'combo') this._specialCombo(t, mark, effects, removed, queue);
      }
      triggers = [];
      // 3) ativação em cadeia dos especiais removidos
      let qi = 0;
      while (qi < queue.length) {
        const q = queue[qi++];
        this.stats.specialsUsed++;
        this._activate(q, mark, effects);
      }
      if (!removed.size && !effects.length && !created.length) break;

      // 4) contabiliza: cores, gelo sob peças removidas por especiais, caixas ao lado
      for (const x of removed.values()) {
        if (x.bySpecial) { this._collect(x.piece.c, 1); const cell = this.cell(x.r, x.c); if (cell.ice) { cell.ice--; this._objIce(1); effects.push({ kind: 'ice', r: x.r, c: x.c, left: cell.ice }); } }
        for (const [dr, dc] of DIRS) { const n = this.cell(x.r + dr, x.c + dc); if (n && n.box) boxesHit.add(key(x.r + dr, x.c + dc)); }
        gain += (SCORE.piece + (x.bySpecial ? SCORE.specialPiece : 0)) * mult;
        const cellNow = this.cell(x.r, x.c);
        if (cellNow.piece && cellNow.piece.id === x.piece.id) cellNow.piece = null;
      }
      const boxes = [];
      for (const k of boxesHit) { const r = Math.floor(k / 32), c = k % 32; const cell = this.grid[r][c]; if (!cell.box) continue; cell.box--; this._objBox(1); boxes.push({ r, c, left: cell.box }); gain += 30 * mult; }
      const chains = [];
      for (const k of chainsHit) { const r = Math.floor(k / 32), c = k % 32; const cell = this.grid[r][c]; if (cell.chain) { cell.chain = false; } chains.push({ r, c }); this._objChain(1); gain += 20 * mult; }
      const honey = [];
      for (const k of honeyHit) { const r = Math.floor(k / 32), c = k % 32; const cell = this.grid[r][c]; if (cell.honey) cell.honey = false; honey.push({ r, c }); this._objHoney(1); gain += 25 * mult; this.honeyCleared = true; }
      this.score += gain;
      this._objScore();
      // um especial criado e destruído no MESMO passo nunca chega à tela:
      // sai das duas listas (a cena destruiria antes de criar e ficaria um fantasma)
      const createdIds = new Set(created.map(x => x.id));
      const piecesOut = [...removed.values()].filter(x => !createdIds.has(x.piece.id));
      const createdOut = created.filter(x => { const rm = removed.get(key(x.r, x.c)); return !(rm && rm.piece.id === x.id); });
      // ...mas a peça que ele substituiu (prev) precisa sumir da tela mesmo assim
      const piecesList = piecesOut.map(x => ({ id: x.piece.id, r: x.r, c: x.c, color: x.piece.c, s: x.piece.s, bySpecial: x.bySpecial }));
      for (const x of created) if (!createdOut.includes(x) && x.prev !== undefined) piecesList.push({ id: x.prev, r: x.r, c: x.c, color: x.color, s: null, bySpecial: true });
      phases.push({ t: 'clear', pieces: piecesList, boxes, chains, honey, ice: effects.filter(e => e.kind === 'ice'), effects: effects.filter(e => e.kind !== 'ice'), created: createdOut, score: gain, combo: this.combo, total: this.score, objectives: this.objectives.map(o => o.got) });

      // 5) gravidade + reposição
      this._gravity(phases);
      if (bonus && !this._allPieces().some(p => p.piece.s) && !this._findGroups().length) break;
    }
    // fim: objetivo, jogadas, jogada possível
    if (!bonus) {
      if (this.objectives.every(o => o.got >= o.n)) this.over = 'won';
      else if (this.moves <= 0) this.over = 'lost';
      else if (!this.findMove()) { phases.push({ t: 'noMoves' }); this._shuffle(phases); this._resolve(phases, null, []); }
    }
  }

  // depois de cada jogada: mel espalha se nenhum foi destruído; gerador
  // acorrenta uma vizinha a cada 3 jogadas
  _afterMove(phases) {
    if (this.over) return;
    const spread = [];
    const honeyCells = []; for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.grid[r][c].honey) honeyCells.push({ r, c });
    if (honeyCells.length && !this.honeyCleared) {
      const cands = [];
      for (const h of honeyCells) for (const [dr, dc] of DIRS) { const n = this.cell(h.r + dr, h.c + dc); if (n && n.piece && !n.honey && !n.chain && !n.piece.s) cands.push({ r: h.r + dr, c: h.c + dc }); }
      if (cands.length) { const p = cands[Math.floor(this.rnd() * cands.length)]; this.grid[p.r][p.c].honey = true; spread.push({ kind: 'honey', r: p.r, c: p.c }); for (const o of this.objectives) if (o.type === 'honey') o.n++; }
    }
    if (this.movesMade % 3 === 0) for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      if (!this.grid[r][c].gen) continue;
      const cands = []; for (const [dr, dc] of DIRS) { const n = this.cell(r + dr, c + dc); if (n && n.piece && !n.chain && !n.honey && !n.piece.s) cands.push({ r: r + dr, c: c + dc }); }
      if (cands.length) { const p = cands[Math.floor(this.rnd() * cands.length)]; this.grid[p.r][p.c].chain = true; spread.push({ kind: 'chain', r: p.r, c: p.c }); for (const o of this.objectives) if (o.type === 'chain') o.n++; }
    }
    if (spread.length) phases.push({ t: 'spread', list: spread });
    if (!this.findMove()) { phases.push({ t: 'noMoves' }); this._shuffle(phases); this._resolve(phases, null, []); }
  }

  _collect(color, n) { for (const o of this.objectives) if (o.type === 'collect' && o.color === color) o.got = Math.min(o.n, o.got + n); }
  _objIce(n) { for (const o of this.objectives) if (o.type === 'ice') o.got = Math.min(o.n, o.got + n); }
  _objBox(n) { for (const o of this.objectives) if (o.type === 'box') o.got = Math.min(o.n, o.got + n); }
  _objChain(n) { for (const o of this.objectives) if (o.type === 'chain') o.got = Math.min(o.n, o.got + n); }
  _objHoney(n) { for (const o of this.objectives) if (o.type === 'honey') o.got = Math.min(o.n, o.got + n); }
  _objScore() { for (const o of this.objectives) if (o.type === 'score') o.got = Math.min(o.n, this.score); }

  // grupos: linhas ≥3 (h e v) unidas por célula compartilhada
  _findGroups() {
    const runs = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols;) {
      const p = this.pieceAt(r, c); if (!p) { c++; continue; }
      let e = c; while (e + 1 < this.cols && this.pieceAt(r, e + 1) && this.pieceAt(r, e + 1).c === p.c) e++;
      if (e - c + 1 >= 3) runs.push({ dir: 'h', color: p.c, cells: Array.from({ length: e - c + 1 }, (_, i) => ({ r, c: c + i })) });
      c = e + 1;
    }
    for (let c = 0; c < this.cols; c++) for (let r = 0; r < this.rows;) {
      const p = this.pieceAt(r, c); if (!p) { r++; continue; }
      let e = r; while (e + 1 < this.rows && this.pieceAt(e + 1, c) && this.pieceAt(e + 1, c).c === p.c) e++;
      if (e - r + 1 >= 3) runs.push({ dir: 'v', color: p.c, cells: Array.from({ length: e - r + 1 }, (_, i) => ({ r: r + i, c })) });
      r = e + 1;
    }
    // união por célula compartilhada
    const groups = [];
    const used = new Array(runs.length).fill(false);
    for (let i = 0; i < runs.length; i++) {
      if (used[i]) continue;
      const g = { color: runs[i].color, runs: [runs[i]], cells: new Map() };
      used[i] = true;
      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < runs.length; j++) {
          if (used[j] || runs[j].color !== g.color) continue;
          if (runs[j].cells.some(x => g.runs.some(rn => rn.cells.some(y => y.r === x.r && y.c === x.c)))) { g.runs.push(runs[j]); used[j] = true; changed = true; }
        }
      }
      for (const rn of g.runs) for (const x of rn.cells) g.cells.set(key(x.r, x.c), x);
      const cells = [...g.cells.values()];
      const maxRun = Math.max(...g.runs.map(rn => rn.cells.length));
      let special = null;
      if (maxRun >= 5) special = 'color';
      else if (g.runs.some(rn => rn.dir === 'h') && g.runs.some(rn => rn.dir === 'v')) special = 'bomb';
      else if (maxRun === 4) special = g.runs[0].dir === 'h' ? 'rv' : 'rh';
      groups.push({ color: g.color, cells, special });
    }
    return groups;
  }

  _activate(q, mark, effects) {
    const s = q.piece.s;
    if (s === 'rh') { effects.push({ kind: 'row', r: q.r, c: q.c }); for (let c = 0; c < this.cols; c++) mark(q.r, c, true); }
    else if (s === 'rv') { effects.push({ kind: 'col', r: q.r, c: q.c }); for (let r = 0; r < this.rows; r++) mark(r, q.c, true); }
    else if (s === 'bomb') { effects.push({ kind: 'bomb', r: q.r, c: q.c, radius: 1 }); for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) mark(q.r + dr, q.c + dc, true); }
    else if (s === 'color') { const colors = this._allPieces().filter(p => !p.piece.s).map(p => p.piece.c); const color = colors.length ? colors[Math.floor(this.rnd() * colors.length)] : 0; effects.push({ kind: 'color', r: q.r, c: q.c, color }); this._colorSweep(color, mark); }
  }
  _colorSweep(color, mark) { for (const p of this._allPieces()) if (p.piece.c === color && !p.piece.s) mark(p.r, p.c, true); }

  _specialCombo(t, mark, effects, removed, queue) {
    const { a, b, r, c } = t;
    const kinds = [a.s, b.s].sort().join('+');
    const isRocket = (s) => s === 'rh' || s === 'rv';
    this.stats.specialsUsed += 2;
    const take = (rr, cc) => { const cell = this.cell(rr, cc); if (cell && cell.piece) removed.set(key(rr, cc), { r: rr, c: cc, piece: cell.piece, bySpecial: true }); };
    take(r, c); take(t.r2, t.c2);
    if (a.s === 'color' && b.s === 'color') { effects.push({ kind: 'mega', r, c }); for (const p of this._allPieces()) mark(p.r, p.c, true); return; }
    if (a.s === 'color' || b.s === 'color') {
      const other = a.s === 'color' ? b : a;
      const color = other.c;
      const conv = other.s === 'bomb' ? 'bomb' : null;
      effects.push({ kind: 'colorConvert', r, c, color, into: conv || 'rocket' });
      for (const p of this._allPieces()) if (p.piece.c === color && !p.piece.s) { p.piece.s = conv || (this.rnd() < 0.5 ? 'rh' : 'rv'); }
      for (const p of this._allPieces()) if (p.piece.c === color && p.piece.s) mark(p.r, p.c, true);
      return;
    }
    if (isRocket(a.s) && isRocket(b.s)) { effects.push({ kind: 'cross', r, c }); for (let i = 0; i < this.cols; i++) mark(r, i, true); for (let i = 0; i < this.rows; i++) mark(i, c, true); return; }
    if (a.s === 'bomb' && b.s === 'bomb') { effects.push({ kind: 'bomb', r, c, radius: 2 }); for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) mark(r + dr, c + dc, true); return; }
    // foguete + bomba: 3 linhas e 3 colunas
    effects.push({ kind: 'bigCross', r, c });
    for (let d = -1; d <= 1; d++) { for (let i = 0; i < this.cols; i++) mark(r + d, i, true); for (let i = 0; i < this.rows; i++) mark(i, c + d, true); }
    void kinds; void queue;
  }

  // gravidade coluna a coluna; caixas e pedras seguram o que está em cima
  _gravity(phases) {
    const moves = [], spawns = [];
    for (let c = 0; c < this.cols; c++) {
      let spawnCount = 0;
      for (let r = this.rows - 1; r >= 0; r--) {
        if (!this.playable(r, c) || this.grid[r][c].piece) continue;
        // procura peça acima até bater numa caixa/pedra
        let src = -1;
        for (let k = r - 1; k >= 0; k--) { const cell = this.grid[k][c]; if (cell.stone || cell.box) break; if (cell.piece) { src = k; break; } }
        if (src >= 0) {
          if (this.grid[src][c].chain || this.grid[src][c].honey) continue;   // presa não cai
          const p = this.grid[src][c].piece; this.grid[src][c].piece = null; this.grid[r][c].piece = p;
          moves.push({ id: p.id, from: { r: src, c }, to: { r, c } });
        } else {
          // só nasce se o caminho até o topo está livre
          let open = true;
          for (let k = r - 1; k >= 0; k--) { const cell = this.grid[k][c]; if (cell.box || cell.chain || cell.honey) { open = false; break; } }
          if (!open) continue;
          const p = this._newPiece(this._randColor());
          this.grid[r][c].piece = p; spawnCount++;
          spawns.push({ id: p.id, r, c, color: p.c, fromRow: -spawnCount });
        }
      }
    }
    if (moves.length || spawns.length) phases.push({ t: 'fall', moves, spawns });
  }

  _shuffle(phases) {
    const pieces = this._allPieces().filter(p => !p.cell.chain);
    for (let attempt = 0; attempt < 60; attempt++) {
      const colors = pieces.map(p => p.piece.c);
      for (let i = colors.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [colors[i], colors[j]] = [colors[j], colors[i]]; }
      pieces.forEach((p, i) => { p.piece.c = colors[i]; });
      if (this.findMove() && !this._findGroups().length) break;
    }
    phases.push({ t: 'shuffle', pieces: pieces.map(p => ({ id: p.piece.id, r: p.r, c: p.c, color: p.piece.c })) });
  }

  objectivesDone() { return this.objectives.every(o => o.got >= o.n); }
  progressPct() { let a = 0, b = 0; for (const o of this.objectives) { a += Math.min(o.got, o.n); b += o.n; } return b ? a / b : 1; }
}
