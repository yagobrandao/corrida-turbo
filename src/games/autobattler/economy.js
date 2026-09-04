// Battle Tactics — estado de uma corrida (fora do combate).
//
// Loja, ouro, XP/nível, banco, tabuleiro, compra, venda e a fusão
// automática de três cópias. Tudo é estado puro: a cena só renderiza e
// chama os métodos. Assim um PvP futuro serializa `boardSpec()` de cada
// jogador e o combate roda igual nos dois lados.
import { mulberry32 } from '../../core/rng.js';
import {
  BENCH_SIZE, SHOP_SIZE, START_GOLD, START_HP, START_LEVEL, MAX_LEVEL,
  REROLL_COST, XP_COST, XP_PER_BUY, XP_PER_ROUND, XP_TO_NEXT, ODDS,
  RARITIES, SHOP_UNITS, UNITS, PLAYER_ROWS, TOTAL_ROUNDS,
  baseIncome, interest, streakBonus, WIN_BONUS, sellValue, unitCost,
} from './config.js';
import { ITEMS, SLOTS, SELL_VALUE } from './equipment.js';

const RARITY_ORDER = ['comum', 'raro', 'epico'];

export class Run {
  constructor(seed) {
    this.rnd = mulberry32(seed >>> 0);
    this.gold = START_GOLD;
    this.hp = START_HP;
    this.level = START_LEVEL;
    this.xp = 0;
    this.round = 1;
    this.streak = 0;            // positivo = vitórias seguidas, negativo = derrotas
    this.wins = 0;
    this.nextUid = 1;
    this.units = [];            // { uid, id, star, place: {kind:'bench', i} | {kind:'board', c, r}, equip }
    this.shop = [];             // ids (null = comprado)
    this.locked = false;
    this.pool = {};             // cópias restantes por unidade
    for (const u of SHOP_UNITS) this.pool[u.id] = RARITIES[u.rarity].pool;
    this.stats = { bought: 0, merges: 0, threeStars: 0, bossKilled: false, itemsFound: 0, itemsCombined: 0 };
    // equipamentos: nunca persistem entre partidas (ninguém entra com
    // vantagem) — inventário e pendências vivem só aqui, dentro da corrida
    this.inventory = [];          // ids de itens guardados, ainda sem dono
    this.pendingReward = null;    // { ids: [...], boss } — recompensa aberta esperando escolha
    this.rollShop();
  }

  // ------------------------------------------------------------ consultas
  get maxOnBoard() { return this.level; }
  get xpToNext() { return XP_TO_NEXT[this.level] ?? null; }
  boardUnits() { return this.units.filter(u => u.place.kind === 'board'); }
  benchUnits() { return this.units.filter(u => u.place.kind === 'bench'); }
  unitAt(c, r) { return this.units.find(u => u.place.kind === 'board' && u.place.c === c && u.place.r === r) || null; }
  benchAt(i) { return this.units.find(u => u.place.kind === 'bench' && u.place.i === i) || null; }
  freeBenchSlot() { for (let i = 0; i < BENCH_SIZE; i++) if (!this.benchAt(i)) return i; return -1; }
  byUid(uid) { return this.units.find(u => u.uid === uid) || null; }
  // quantas cópias desta unidade/estrela o jogador tem (a loja destaca "falta 1")
  copiesOf(id, star = 1) { return this.units.filter(u => u.id === id && u.star === star).length; }

  // formação para a simulação (linhas do jogador)
  boardSpec() {
    return this.boardUnits().map(u => ({ id: u.id, star: u.star, c: u.place.c, r: u.place.r, uid: u.uid, equip: u.equip }));
  }

  // ------------------------------------------------------------ loja
  rollShop() {
    const odds = ODDS[Math.min(MAX_LEVEL, this.level)] || ODDS[MAX_LEVEL];
    this.shop = [];
    for (let i = 0; i < SHOP_SIZE; i++) this.shop.push(this._rollOne(odds));
  }

  _rollOne(odds) {
    // sorteia a raridade; se o pool dela secou, desce uma
    let x = this.rnd() * 100, ri = 0;
    for (let i = 0; i < odds.length; i++) { if (x < odds[i]) { ri = i; break; } x -= odds[i]; }
    for (let tries = 0; tries < 3; tries++) {
      const rarity = RARITY_ORDER[Math.max(0, ri - tries)];
      const cands = SHOP_UNITS.filter(u => u.rarity === rarity && this.pool[u.id] > 0);
      if (cands.length) {
        // ponderado pelas cópias restantes: o que você já juntou aparece menos
        const total = cands.reduce((s, u) => s + this.pool[u.id], 0);
        let y = this.rnd() * total;
        for (const u of cands) { y -= this.pool[u.id]; if (y <= 0) return u.id; }
        return cands[cands.length - 1].id;
      }
    }
    return null;
  }

  reroll() {
    if (this.gold < REROLL_COST) return { ok: false, why: 'Sem ouro para rolar' };
    this.gold -= REROLL_COST;
    this.rollShop();
    return { ok: true };
  }

  buy(i) {
    const id = this.shop[i];
    if (!id) return { ok: false, why: '' };
    const def = UNITS[id];
    const cost = unitCost(def);
    if (this.gold < cost) return { ok: false, why: 'Ouro insuficiente' };
    // com duas cópias iguais a fusão libera a vaga na hora, então o banco
    // cheio só bloqueia quando a compra não vai fundir
    const slot = this.freeBenchSlot();
    const willMerge = this.copiesOf(id, 1) >= 2;
    if (slot < 0 && !willMerge) return { ok: false, why: 'Banco cheio' };
    this.gold -= cost;
    this.shop[i] = null;
    this.pool[id]--;
    this.stats.bought++;
    const u = { uid: this.nextUid++, id, star: 1, place: { kind: 'bench', i: slot < 0 ? 99 : slot }, equip: { weapon: null, armor: null, accessory: null } };
    this.units.push(u);
    const merged = this._tryMerge(id);
    return { ok: true, unit: u, merged };
  }

  buyXp() {
    if (this.level >= MAX_LEVEL) return { ok: false, why: 'Nível máximo' };
    if (this.gold < XP_COST) return { ok: false, why: 'Sem ouro para XP' };
    this.gold -= XP_COST;
    return { ok: true, leveled: this._gainXp(XP_PER_BUY) };
  }

  _gainXp(n) {
    let leveled = false;
    this.xp += n;
    while (this.level < MAX_LEVEL && this.xp >= XP_TO_NEXT[this.level]) {
      this.xp -= XP_TO_NEXT[this.level];
      this.level++;
      leveled = true;
    }
    if (this.level >= MAX_LEVEL) this.xp = 0;
    return leveled;
  }

  // ------------------------------------------------------------ fusão
  // Três cópias da mesma estrela viram uma de estrela maior. Repete em
  // cascata (três ★★ → ★★★). A sobrevivente fica na melhor posição:
  // em campo se alguma estava em campo, senão no primeiro banco.
  _tryMerge(id) {
    const merges = [];
    for (let star = 1; star <= 2; star++) {
      const same = this.units.filter(u => u.id === id && u.star === star);
      if (same.length < 3) break;
      same.sort((a, b) => (a.place.kind === 'board' ? 0 : 1) - (b.place.kind === 'board' ? 0 : 1) || a.uid - b.uid);
      const keep = same[0];
      const gone = same.slice(1, 3);
      // itens equipados nas cópias que somem voltam pro inventário — nunca
      // desaparecem, mesmo quando a fusão acontece sozinha (autoFill etc.)
      for (const g of gone) this._returnEquip(g);
      for (const g of gone) this.units.splice(this.units.indexOf(g), 1);
      keep.star = star + 1;
      this.stats.merges++;
      if (keep.star === 3) this.stats.threeStars++;
      merges.push({ uid: keep.uid, star: keep.star, gone: gone.map(g => g.uid) });
    }
    // um comprado "no ar" (banco cheio) que fundiu já sumiu; se sobrou, encaixa
    for (const u of this.units) if (u.place.kind === 'bench' && u.place.i === 99) u.place.i = Math.max(0, this.freeBenchSlot());
    return merges;
  }

  // ------------------------------------------------------------ posicionamento
  isPlayerCell(c, r) { return PLAYER_ROWS.includes(r) && c >= 0 && c < 6; }

  // move para uma célula do campo (troca de lugar se ocupada)
  placeOnBoard(uid, c, r) {
    const u = this.byUid(uid);
    if (!u || !this.isPlayerCell(c, r)) return { ok: false, why: '' };
    const other = this.unitAt(c, r);
    if (other && other.uid === uid) return { ok: true };
    const fromBench = u.place.kind === 'bench';
    if (fromBench && !other && this.boardUnits().length >= this.maxOnBoard) {
      return { ok: false, why: `Nível ${this.level}: só ${this.maxOnBoard} em campo. Compre XP!` };
    }
    const old = { ...u.place };
    u.place = { kind: 'board', c, r };
    if (other) other.place = old;
    return { ok: true };
  }

  moveToBench(uid, i) {
    const u = this.byUid(uid);
    if (!u) return { ok: false, why: '' };
    if (i === undefined || i < 0) i = this.freeBenchSlot();
    if (i < 0) return { ok: false, why: 'Banco cheio' };
    const other = this.benchAt(i);
    const old = { ...u.place };
    u.place = { kind: 'bench', i };
    if (other && other.uid !== uid) other.place = old;
    return { ok: true };
  }

  sell(uid) {
    const u = this.byUid(uid);
    if (!u) return { ok: false };
    const def = UNITS[u.id];
    const v = sellValue(def, u.star);
    this.gold += v;
    // as cópias voltam para o pool; os itens equipados voltam pro inventário
    this.pool[u.id] = (this.pool[u.id] || 0) + Math.pow(3, u.star - 1);
    this._returnEquip(u);
    this.units.splice(this.units.indexOf(u), 1);
    return { ok: true, gold: v };
  }

  // ------------------------------------------------------------ equipamentos
  // Nunca automático: o jogador escolhe guardar, vender ou equipar — e em
  // qual unidade. Itens nunca se perdem: vender/fundir a unidade devolve o
  // que estava equipado pro inventário.
  _returnEquip(u) {
    if (!u.equip) return;
    for (const slot of SLOTS) { const id = u.equip[slot]; if (id) { this.inventory.push(id); u.equip[slot] = null; } }
  }
  openReward(ids, boss = false) { this.pendingReward = { ids, boss }; return this.pendingReward; }
  // escolhe 1 das opções da recompensa aberta; guarda no inventário
  chooseReward(itemId) {
    if (!this.pendingReward || !this.pendingReward.ids.includes(itemId)) return { ok: false };
    this.pendingReward = null;
    this.inventory.push(itemId);
    this.stats.itemsFound++;
    return { ok: true, item: itemId };
  }
  skipReward() { this.pendingReward = null; }
  sellItem(itemId) {
    const i = this.inventory.indexOf(itemId);
    if (i < 0) return { ok: false };
    const item = ITEMS[itemId]; if (!item) return { ok: false };
    this.inventory.splice(i, 1);
    const v = SELL_VALUE[item.rarity] || 1;
    this.gold += v;
    return { ok: true, gold: v };
  }
  // Devolve os equipáveis do inventário para o item, tirando o de lá antes
  // (troca é atômica: nunca fica sem nada no slot por um instante).
  equipItem(uid, slot, itemId) {
    const u = this.byUid(uid); const item = ITEMS[itemId];
    if (!u || !item || item.slot !== slot) return { ok: false };
    const i = this.inventory.indexOf(itemId);
    if (i < 0) return { ok: false };
    this.inventory.splice(i, 1);
    const prev = u.equip[slot];
    if (prev) this.inventory.push(prev);
    u.equip[slot] = itemId;
    return { ok: true, replaced: prev };
  }
  unequipItem(uid, slot) {
    const u = this.byUid(uid);
    if (!u || !u.equip[slot]) return { ok: false };
    this.inventory.push(u.equip[slot]);
    u.equip[slot] = null;
    return { ok: true };
  }
  // duas cópias do MESMO item base viram o combinado da receita — o
  // jogador decide quando (nunca automático, igual à fusão de itens não é)
  combineItems(idA, idB, recipeId) {
    const item = ITEMS[recipeId];
    if (!item || !item.recipe) return { ok: false };
    const [ra, rb] = item.recipe;
    const has = [...this.inventory];
    const ia = has.indexOf(idA), ib = idA === idB ? has.indexOf(idB, ia + 1) : has.indexOf(idB);
    if (ia < 0 || ib < 0) return { ok: false };
    const okPair = (ITEMS[idA] && ITEMS[idA].id === ra && ITEMS[idB] && ITEMS[idB].id === rb) || (ITEMS[idA] && ITEMS[idA].id === rb && ITEMS[idB] && ITEMS[idB].id === ra);
    if (!okPair) return { ok: false };
    const idxs = [ia, ib].sort((a, b) => b - a);
    for (const idx of idxs) this.inventory.splice(idx, 1);
    this.inventory.push(recipeId);
    this.stats.itemsCombined++;
    return { ok: true, item: recipeId };
  }

  // Antes de lutar com campo vazio/incompleto, sobe do banco automaticamente
  // (frente primeiro) para o iniciante não perder uma rodada por engano.
  autoFill() {
    const order = [[2, 4], [3, 4], [1, 4], [4, 4], [0, 4], [5, 4], [2, 5], [3, 5], [1, 5], [4, 5], [0, 5], [5, 5], [2, 6], [3, 6], [1, 6], [4, 6], [0, 6], [5, 6], [2, 7], [3, 7], [1, 7], [4, 7], [0, 7], [5, 7]];
    let placed = 0;
    for (const b of this.benchUnits().sort((a, c) => c.star - a.star || unitCost(UNITS[c.id]) - unitCost(UNITS[a.id]))) {
      if (this.boardUnits().length >= this.maxOnBoard) break;
      const cell = order.find(([c, r]) => !this.unitAt(c, r));
      if (!cell) break;
      b.place = { kind: 'board', c: cell[0], r: cell[1] };
      placed++;
    }
    return placed;
  }

  // ------------------------------------------------------------ fim de rodada
  // Aplica o resultado da batalha e prepara a próxima rodada.
  endRound({ won, damage }) {
    const breakdown = { base: baseIncome(this.round), interest: interest(this.gold), streak: 0, win: 0 };
    if (won) { this.streak = this.streak > 0 ? this.streak + 1 : 1; this.wins++; breakdown.win = WIN_BONUS; }
    else { this.streak = this.streak < 0 ? this.streak - 1 : -1; this.hp = Math.max(0, this.hp - damage); }
    breakdown.streak = streakBonus(Math.abs(this.streak));
    const total = breakdown.base + breakdown.interest + breakdown.streak + breakdown.win;
    this.gold += total;
    const leveled = this._gainXp(XP_PER_ROUND);
    const finished = this.hp <= 0 || (won && this.round >= TOTAL_ROUNDS);
    if (!finished) {
      this.round++;
      if (!this.locked) this.rollShop();
      this.locked = false;
    }
    return { total, breakdown, leveled, finished, dead: this.hp <= 0 };
  }
}
