// Arena Clash — simulação autoritativa (roda só no host).
//
// Pura: não conhece Phaser nem rede. Recebe inputs por slot, avança em
// passos fixos (TICK) e produz snapshots por time (o que aquele time enxerga)
// mais uma lista de eventos para a cena animar. Bots vivem em ai.js e só
// escrevem no mesmo `input` que um jogador humano escreveria.
//
// Unidades: hero, minion, tower, core, monster, crystal. Tudo é círculo.
import { mulberry32 } from '../../core/rng.js';
import {
  WORLD, TICK, MAP, VISION, RESPAWN, XP_TO_LEVEL, MAX_LEVEL, GOLD_PASSIVE, CRIT_DMG_BASE,
  KILL_GOLD, ASSIST_GOLD, KILL_XP, ASSIST_XP, TOWER_GOLD, TOWER_XP,
  MINIONS, WAVE_EVERY, FIRST_WAVE, waveGrowth, TOWER, CORE, MONSTERS, CRYSTAL, BUFFS,
  HEROES, HERO_BY_ID, ITEM_BY_ID, MAX_ITEMS, BUILDS, BOT_PROFILES, BOT_NAMES, BOT_FILL_ORDER, MATCH_CAP,
} from './data.js';
import { botThink } from './ai.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerpPath = (path, f) => {
  // ponto na fração f (0..1) de uma polilinha
  const segs = []; let total = 0;
  for (let i = 0; i < path.length - 1; i++) { const d = dist(path[i], path[i + 1]); segs.push(d); total += d; }
  let acc = f * total;
  for (let i = 0; i < segs.length; i++) {
    if (acc <= segs[i]) { const t = segs[i] ? acc / segs[i] : 0; return { x: path[i].x + (path[i + 1].x - path[i].x) * t, y: path[i].y + (path[i + 1].y - path[i].y) * t }; }
    acc -= segs[i];
  }
  return { ...path[path.length - 1] };
};
const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export class World {
  // players: [{ slot, name, heroId, team }] — humanos. Bots completam 3v3.
  constructor({ seed = 1, players = [], difficulty = 'medium' }) {
    this.rnd = mulberry32(seed >>> 0);
    this.time = 0; this.tick = 0; this.over = null; this.wave = 0;
    this.units = new Map(); this.nextId = 1;
    this.projectiles = []; this.zones = []; this.events = [];
    this.difficulty = difficulty;
    this.profile = BOT_PROFILES[difficulty] || BOT_PROFILES.medium;
    this.visible = [new Set(), new Set()];
    this.crystalNextAt = MAP.crystal.spawnAt;
    this.stats = { towers: [0, 0] };

    // estruturas
    for (const team of [0, 1]) {
      const base = MAP.bases[team];
      this._add({ kind: 'core', team, x: base.x, y: base.y, r: CORE.size, hp: CORE.hp, maxHp: CORE.hp, name: 'Core',
        stats: { atk: CORE.atk, armor: CORE.armor, mr: CORE.mr, range: CORE.range, as: CORE.as }, atkCd: 0 });
      for (const lane of ['top', 'bot']) {
        const path = team === 0 ? MAP.lanes[lane] : [...MAP.lanes[lane]].reverse();
        MAP.towerFractions.forEach((f, i) => {
          const p = lerpPath(path, f);
          this._add({ kind: 'tower', team, lane, tier: i, x: p.x, y: p.y, r: TOWER.size, hp: TOWER.hp, maxHp: TOWER.hp, name: `Torre ${lane === 'top' ? 'Topo' : 'Baixo'} ${i + 1}`,
            stats: { atk: TOWER.atk, armor: TOWER.armor, mr: TOWER.mr, range: TOWER.range, as: TOWER.as }, atkCd: 0, aggroHero: null });
        });
      }
    }
    for (const c of MAP.camps) this._spawnMonster(c);

    // heróis: humanos + bots
    // bots completam os times alternando entre os lados, na ordem BOT_FILL_ORDER
    // (forte → fraco), para nenhum lado ficar só com os heróis mais fracos.
    const used = new Set(players.map(p => p.heroId));
    const pool = BOT_FILL_ORDER.filter(id => !used.has(id)).map(id => HERO_BY_ID[id]);
    const rosters = [players.filter(p => p.team === 0), players.filter(p => p.team === 1)];
    let nameIdx = 0, side = rosters[0].length <= rosters[1].length ? 0 : 1;
    while (rosters[0].length < 3 || rosters[1].length < 3) {
      if (rosters[side].length >= 3) { side = 1 - side; continue; }
      const pick = pool.shift() || HEROES[(nameIdx + side) % HEROES.length];
      rosters[side].push({ slot: null, name: BOT_NAMES[nameIdx++ % BOT_NAMES.length] + ' (bot)', heroId: pick.id, team: side, bot: true });
      side = 1 - side;
    }
    rosters.forEach(r => r.forEach((p, i) => this._addHero(p, i)));
  }

  _add(u) { u.id = this.nextId++; u.alive = true; u.facing = 0; u.buffs = []; u.stun = 0; u.root = 0; u.slow = { pct: 0, until: 0 }; u.burn = null; u.shield = 0; u.shieldUntil = 0; u.hidden = false; this.units.set(u.id, u); return u; }

  _addHero(p, idx) {
    const def = HERO_BY_ID[p.heroId] || HEROES[0];
    const base = MAP.bases[p.team];
    const ang = (idx - 1) * 0.6 + (p.team === 0 ? -Math.PI / 4 : Math.PI * 3 / 4);
    const h = this._add({
      kind: 'hero', team: p.team, slot: p.slot ?? null, bot: !!p.bot, name: p.name, def, heroId: def.id, cls: def.cls,
      x: base.x + Math.cos(ang) * 60, y: base.y + Math.sin(ang) * 60, r: 18,
      level: 1, xp: 0, gold: 500, items: [], skillLv: [1, 0, 0, 0], points: 0, cds: [0, 0, 0, 0],
      kills: 0, deaths: 0, assists: 0, dmg: 0, dmgTaken: 0, healed: 0, objectives: 0,
      input: { mx: 0, my: 0, ax: 1, ay: 0, atk: false, cast: [false, false, false, false] },
      atkCd: 0, target: null, focusHero: false, assistLog: [], lastHit: 0,
      pas: { count: 0, ready: 0, nextCrit: false, empower: 0, stealth: 0 },
      respawnAt: 0, recall: 0,
      ai: p.bot ? { lane: null, state: 'lane', next: this.rnd() * 0.5, buildIdx: 0, target: null } : null,
      build: BUILDS[def.id] || [],
    });
    this._recompute(h);
    h.hp = h.maxHp; h.res = h.stats.resMax;
    h.facing = p.team === 0 ? -Math.PI / 4 : Math.PI * 3 / 4;
    return h;
  }

  _spawnMonster(c) {
    const m = MONSTERS[c.kind];
    const u = this._add({ kind: 'monster', team: -1, camp: c.id, campKind: c.kind, x: c.x, y: c.y, home: { x: c.x, y: c.y }, r: m.size, hp: m.hp, maxHp: m.hp, name: m.name,
      stats: { atk: m.atk, armor: m.armor, mr: m.armor, range: m.range, as: m.as, ms: 220 }, atkCd: 0, aggro: null, respawnAt: 0 });
    return u;
  }

  // ---------------------------------------------------------------- stats
  _recompute(h) {
    const d = h.def, L = h.level - 1;
    const s = {
      hp: d.base.hp + d.grow.hp * L, atk: d.base.atk + d.grow.atk * L, ap: d.base.ap + (d.grow.ap || 0) * L,
      armor: d.base.armor + d.grow.armor * L, mr: d.base.mr + d.grow.mr * L, ms: d.base.ms, range: d.base.range,
      as: d.base.as + d.grow.as * L, crit: 0, critDmg: CRIT_DMG_BASE, pen: 0, mpen: 0, lifesteal: 0, cdr: 0,
      hpRegen: 4 + L * 0.6, resMax: d.base.res + d.grow.res * L, resRegen: d.base.resRegen + L * 0.4, healPct: 0, msPct: 0, asPct: 0, atkPct: 0, dmgPct: 0,
    };
    for (const id of h.items) {
      const it = ITEM_BY_ID[id]; if (!it) continue;
      for (const [k, v] of Object.entries(it.stats)) { if (k === 'res') s.resMax += v; else s[k] = (s[k] || 0) + v; }
    }
    for (const b of h.buffs) for (const [k, v] of Object.entries(b.mods || {})) s[k] = (s[k] || 0) + v;
    s.atk *= 1 + s.atkPct; s.ms *= 1 + Math.min(0.6, s.msPct); s.as *= 1 + s.asPct;
    s.cdr = Math.min(0.4, s.cdr);
    const prevMax = h.maxHp || s.hp;
    h.stats = s; h.maxHp = Math.round(s.hp);
    if (h.hp !== undefined && h.maxHp > prevMax) h.hp += h.maxHp - prevMax;
  }

  _addBuff(u, buff) {
    u.buffs = u.buffs.filter(b => b.id !== buff.id);
    u.buffs.push({ ...buff, until: this.time + buff.dur });
    if (u.kind === 'hero') this._recompute(u);
  }

  // ---------------------------------------------------------------- inputs
  applyInput(slot, inp) {
    const h = [...this.units.values()].find(u => u.kind === 'hero' && u.slot === slot);
    if (!h) return;
    if (inp.mx !== undefined) { h.input.mx = clamp(inp.mx, -1, 1); h.input.my = clamp(inp.my, -1, 1); }
    if (inp.ax !== undefined) { h.input.ax = inp.ax; h.input.ay = inp.ay; }
    if (inp.atk !== undefined) h.input.atk = !!inp.atk;
    if (inp.cast) for (let i = 0; i < 4; i++) if (inp.cast[i]) h.input.cast[i] = true;
    if (inp.buy) this.buy(h, inp.buy);
    if (inp.lvl !== undefined) this.levelSkill(h, inp.lvl);
    if (inp.recall) h.recall = 1;
  }

  buy(h, itemId) {
    const it = ITEM_BY_ID[itemId]; if (!it || !h.alive) return false;
    // receita: componentes já possuídos abatem o preço
    let cost = it.cost; const consume = [];
    for (const c of it.from || []) {
      const i = h.items.findIndex((x, k) => x === c && !consume.includes(k));
      if (i >= 0) { consume.push(i); cost -= ITEM_BY_ID[c].cost; }
    }
    if (h.gold < cost) return false;
    if (h.items.length - consume.length >= MAX_ITEMS) return false;
    h.gold -= cost;
    h.items = h.items.filter((_, k) => !consume.includes(k));
    h.items.push(itemId);
    this._recompute(h);
    this.events.push({ t: 'buy', id: h.id, item: itemId });
    return true;
  }

  levelSkill(h, i) {
    if (h.points <= 0) return false;
    const max = i === 3 ? 2 : 4;
    if (h.skillLv[i] >= max) return false;
    if (i === 3 && ((h.skillLv[3] === 0 && h.level < 5) || (h.skillLv[3] === 1 && h.level < 9))) return false;
    h.skillLv[i]++; h.points--;
    return true;
  }

  // ---------------------------------------------------------------- loop
  step() {
    if (this.over) return;
    const dt = TICK;
    this.time += dt; this.tick++;

    // ondas de minions
    if (this.time >= FIRST_WAVE + this.wave * WAVE_EVERY) { this.wave++; this._spawnWave(this.wave); }
    // cristal
    if (this.crystalNextAt && this.time >= this.crystalNextAt) { this._spawnCrystal(); this.crystalNextAt = 0; }

    for (const u of this.units.values()) {
      if (!u.alive) { if (u.kind === 'hero' && this.time >= u.respawnAt) this._respawn(u); if (u.kind === 'monster' && u.respawnAt && this.time >= u.respawnAt) this._reviveMonster(u); continue; }
      this._tickStatus(u, dt);
      if (u.kind === 'hero') this._tickHero(u, dt);
      else if (u.kind === 'minion') this._tickMinion(u, dt);
      else if (u.kind === 'tower' || u.kind === 'core') this._tickTower(u, dt);
      else if (u.kind === 'monster' || u.kind === 'crystal') this._tickMonster(u, dt);
    }
    this._tickProjectiles(dt);
    this._tickZones(dt);
    if (this.tick % 4 === 0) this._computeVision();
    if (this.time >= MATCH_CAP) this._finish(this._coreHp(0) >= this._coreHp(1) ? 0 : 1);
  }

  _coreHp(team) { for (const u of this.units.values()) if (u.kind === 'core' && u.team === team) return u.hp; return 0; }

  _tickStatus(u, dt) {
    if (u.stun > 0) u.stun -= dt;
    if (u.root > 0) u.root -= dt;
    if (u.shield > 0 && this.time > u.shieldUntil) u.shield = 0;
    if (u.burn && this.time > u.burn.until) u.burn = null;
    if (u.burn && this.tick % 10 === 0) this._damage(u.burn.src, u, u.burn.dps * 0.5, 'magic', { dot: true });
    if (u.buffs.length) {
      const before = u.buffs.length;
      u.buffs = u.buffs.filter(b => this.time < b.until);
      if (u.buffs.length !== before && u.kind === 'hero') this._recompute(u);
    }
    // arbusto
    u.hidden = MAP.bushes.some(b => inRect(u, b));
  }

  // ---------------------------------------------------------------- herói
  _tickHero(h, dt) {
    const s = h.stats;
    // regeneração; na fonte é rápida
    const base = MAP.bases[h.team];
    const atFountain = dist(h, base) < MAP.fountainRadius;
    h.hp = Math.min(h.maxHp, h.hp + (atFountain ? h.maxHp * 0.09 : s.hpRegen) * dt);
    h.res = Math.min(s.resMax, h.res + (atFountain ? s.resMax * 0.12 : s.resRegen) * dt);
    h.gold += GOLD_PASSIVE * dt;
    h.pas.ready = Math.max(0, h.pas.ready - dt);
    if (h.pas.stealth > 0) h.pas.stealth -= dt;
    for (let i = 0; i < 4; i++) if (h.cds[i] > 0) h.cds[i] -= dt;
    if (h.recall > 0) { h.recall += dt; if (h.recall > 4) { h.x = base.x; h.y = base.y; h.recall = 0; this.events.push({ t: 'recall', id: h.id }); } }

    // bots pensam
    if (h.ai) { h.ai.next -= dt; if (h.ai.next <= 0) { h.ai.next = this.profile.think * (0.8 + this.rnd() * 0.4); botThink(this, h, this.profile); } }

    // ponto de habilidade parado há muito tempo: aplica sozinho
    if (h.points > 0 && !h.ai) { h.pas.idlePts = (h.pas.idlePts || 0) + dt; if (h.pas.idlePts > 12) { this._autoLevel(h); h.pas.idlePts = 0; } }
    else h.pas.idlePts = 0;
    if (h.ai && h.points > 0) this._autoLevel(h);

    // movimento
    const inp = h.input;
    const moving = (inp.mx || inp.my) && h.stun <= 0 && h.root <= 0;
    if (moving) {
      const len = Math.hypot(inp.mx, inp.my) || 1;
      const slow = this.time < h.slow.until ? 1 - h.slow.pct : 1;
      const spd = s.ms * slow * (h.pas.stealth > 0 ? 1 + (h.def.skills[1].msPct || 0) : 1);
      this._move(h, (inp.mx / len) * spd * dt, (inp.my / len) * spd * dt);
      h.facing = Math.atan2(inp.my, inp.mx);
      h.recall = 0;
    }
    if (inp.ax || inp.ay) h.aim = Math.atan2(inp.ay, inp.ax);

    // habilidades (edge)
    for (let i = 0; i < 4; i++) if (inp.cast[i]) { inp.cast[i] = false; this._cast(h, i); }

    // ataque básico
    h.atkCd -= dt;
    if (h.stun <= 0 && h.atkCd <= 0) {
      const t = this._pickAttackTarget(h, inp.atk);
      if (t && (inp.atk || !moving)) {
        h.atkCd = 1 / s.as;
        h.facing = Math.atan2(t.y - h.y, t.x - h.x);
        this._basicAttack(h, t);
      }
    }
  }

  _autoLevel(h) {
    // R quando puder; senão a skill principal da classe (índice 0), depois as outras
    const order = h.def.cls === 'support' ? [0, 1, 2] : h.def.cls === 'tank' ? [1, 0, 2] : [0, 2, 1];
    if (this.levelSkill(h, 3)) return;
    for (const i of order) if (this.levelSkill(h, i)) return;
  }

  _move(u, dx, dy) {
    u.x = clamp(u.x + dx, 20, WORLD.w - 20); u.y = clamp(u.y + dy, 20, WORLD.h - 20);
    for (const o of MAP.obstacles) {
      const d = Math.hypot(u.x - o.x, u.y - o.y), min = o.r + u.r * 0.6;
      if (d < min && d > 0) { u.x += (u.x - o.x) / d * (min - d); u.y += (u.y - o.y) / d * (min - d); }
    }
    // não entra na fonte inimiga
    const eb = MAP.bases[1 - u.team];
    if (u.team >= 0 && eb) { const d = dist(u, eb); if (d < MAP.fountainRadius - 20) { u.x = eb.x + (u.x - eb.x) / d * (MAP.fountainRadius - 20); u.y = eb.y + (u.y - eb.y) / d * (MAP.fountainRadius - 20); } }
  }

  _canSee(viewer, u) {
    if (u.team === viewer.team) return true;
    if (u.kind === 'hero' && u.pas && u.pas.stealth > 0 && dist(viewer, u) > 110) return false;
    if (u.hidden && !viewer.hidden && dist(viewer, u) > 70) return false;
    return true;
  }

  _enemies(u, range, opts = {}) {
    const out = [];
    for (const e of this.units.values()) {
      if (!e.alive || e === u) continue;
      if (e.team === u.team) continue;
      if (e.team === -1 && !opts.monsters) continue;
      if (opts.kinds && !opts.kinds.includes(e.kind)) continue;
      const d = dist(u, e) - e.r;
      if (d > range) continue;
      if (u.kind === 'hero' && !this._canSee(u, e)) continue;
      out.push({ e, d });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  _pickAttackTarget(h, pressed) {
    const s = h.stats;
    const cands = this._enemies(h, s.range, { monsters: true });
    if (!cands.length) return null;
    // provocado: obrigado a atacar quem provocou
    if (h.taunt && this.time < h.taunt.until && h.taunt.by.alive && dist(h, h.taunt.by) - h.taunt.by.r <= s.range) return h.taunt.by;
    const heroes = cands.filter(c => c.e.kind === 'hero');
    if (pressed && heroes.length) return heroes.sort((a, b) => a.e.hp / a.e.maxHp - b.e.hp / b.e.maxHp)[0].e;
    // sem apertar: prioriza herói com pouca vida, senão o mais fraco em alcance
    const low = heroes.find(c => c.e.hp / c.e.maxHp < 0.35);
    if (low) return low.e;
    const minions = cands.filter(c => c.e.kind === 'minion' || c.e.kind === 'monster');
    if (minions.length) return minions.sort((a, b) => a.e.hp - b.e.hp)[0].e;
    if (heroes.length) return heroes[0].e;
    return cands[0].e;
  }

  _basicAttack(h, t) {
    const s = h.stats;
    let crit = this.rnd() < s.crit;
    if (h.pas.nextCrit) { crit = true; h.pas.nextCrit = false; }
    // Vesper: saindo da furtividade / pelas costas
    if (h.heroId === 'vesper') {
      const behind = t.kind === 'hero' && Math.cos(t.facing - Math.atan2(h.y - t.y, h.x - t.x)) < -0.3;
      if (h.pas.stealth > 0 || behind) crit = true;
      h.pas.stealth = 0;
    }
    let amt = s.atk;
    // Lyra: marcas
    if (h.heroId === 'lyra' && t.kind !== 'tower' && t.kind !== 'core') {
      t.marks = t.marks || {}; t.marks[h.id] = (t.marks[h.id] || 0) + 1;
      if (t.marks[h.id] >= 3) { t.marks[h.id] = 0; amt += 40 + h.level * 12; this._addBuff(h, { id: 'vento', dur: 2, mods: { msPct: 0.2 } }); }
    }
    if (s.range > 150) this.events.push({ t: 'shot', x: h.x, y: h.y, tx: t.x, ty: t.y, team: h.team, c: h.def.accent });
    else this.events.push({ t: 'swing', id: h.id, tx: t.x, ty: t.y });
    const dealt = this._damage(h, t, amt, 'phys', { crit, basic: true });
    if (s.lifesteal) h.hp = Math.min(h.maxHp, h.hp + dealt * s.lifesteal);
    // Kael: a cada 3 ataques cura
    if (h.heroId === 'kael') { h.pas.count++; if (h.pas.count >= 3) { h.pas.count = 0; this._heal(h, h, h.maxHp * 0.06); } }
  }

  // ---------------------------------------------------------------- dano
  _damage(src, dst, amount, type, opts = {}) {
    if (!dst.alive || amount <= 0) return 0;
    const ss = src && src.stats ? src.stats : {};
    const ds = dst.stats || {};
    let amt = amount;
    if (opts.crit) amt *= ss.critDmg || CRIT_DMG_BASE;
    if (src && src.kind === 'hero') {
      amt *= 1 + (ss.dmgPct || 0);
      for (const b of src.buffs) if (b.dmg) amt *= 1 + b.dmg;
      if (src.heroId === 'ignis' && type === 'magic' && dst.burn) amt *= 1.12;
    }
    if (type === 'phys') amt *= 100 / (100 + Math.max(0, (ds.armor || 0) - (ss.pen || 0)));
    else if (type === 'magic') amt *= 100 / (100 + Math.max(0, (ds.mr || 0) - (ss.mpen || 0)));
    // Brakka: pele de pedra
    if (dst.kind === 'hero' && dst.heroId === 'brakka' && dst.pas.ready <= 0 && !opts.dot) { amt *= 0.55; dst.pas.ready = 8; }
    if (dst.shield > 0) { const ab = Math.min(dst.shield, amt); dst.shield -= ab; amt -= ab; }
    amt = Math.round(amt);
    dst.hp -= amt;
    if (src && src.kind === 'hero') { src.dmg += amt; }
    if (dst.kind === 'hero') { dst.dmgTaken += amt; if (src && src.kind === 'hero') dst.assistLog.push({ by: src.id, t: this.time }); dst.recall = 0; }
    // monstros reagem a quem bateu
    if (dst.kind === 'monster' || dst.kind === 'crystal') dst.aggro = src;
    // torre defende herói aliado atacado
    if (dst.kind === 'hero' && src && src.kind === 'hero' && !opts.dot) {
      for (const tw of this.units.values()) if (tw.alive && tw.kind === 'tower' && tw.team === dst.team && dist(tw, src) - src.r < tw.stats.range) tw.aggroHero = src;
    }
    if (!opts.dot || amt >= 8) this.events.push({ t: 'dmg', id: dst.id, a: amt, c: !!opts.crit, m: type === 'magic' });
    if (dst.hp <= 0) this._kill(src, dst);
    return amt;
  }

  _heal(src, dst, amount) {
    if (!dst.alive) return 0;
    const pct = src && src.stats ? src.stats.healPct || 0 : 0;
    const h = Math.round(Math.min(dst.maxHp - dst.hp, amount * (1 + pct)));
    if (h <= 0) return 0;
    dst.hp += h;
    if (src && src.kind === 'hero') src.healed += h;
    this.events.push({ t: 'dmg', id: dst.id, a: h, h: true });
    return h;
  }

  _kill(src, dst) {
    dst.alive = false; dst.hp = 0;
    const killer = src && src.kind === 'hero' ? src : null;
    this.events.push({ t: 'die', id: dst.id, x: dst.x, y: dst.y, kind: dst.kind, team: dst.team, by: killer ? killer.id : null });
    if (dst.kind === 'hero') {
      dst.deaths++;
      dst.respawnAt = this.time + RESPAWN(dst.level, this.time);
      const assisters = new Set(dst.assistLog.filter(a => this.time - a.t < 8).map(a => a.by));
      if (killer) { killer.kills++; this._reward(killer, KILL_GOLD + dst.level * 10, KILL_XP + dst.level * 15); assisters.delete(killer.id); if (killer.heroId === 'vesper' && killer.pas.resetCds) { killer.cds = [0, 0, 0, 0]; killer.pas.resetCds = false; } }
      for (const id of assisters) { const a = this.units.get(id); if (a && a.alive !== undefined && a.team !== dst.team) { a.assists++; this._reward(a, ASSIST_GOLD, ASSIST_XP); } }
      dst.assistLog = []; dst.buffs = []; dst.shield = 0; dst.burn = null; this._recompute(dst);
      this.events.push({ t: 'kill', killer: killer ? killer.name : (src ? src.name : 'Torre'), victim: dst.name, team: killer ? killer.team : 1 - dst.team });
    } else if (dst.kind === 'minion') {
      if (killer) this._shareReward(killer, dst.gold, dst.xp, 520);
      else this._shareReward(null, 0, dst.xp, 520, dst, 1 - dst.team);
      this.units.delete(dst.id);
    } else if (dst.kind === 'monster') {
      const m = MONSTERS[dst.campKind];
      dst.respawnAt = this.time + m.respawn;
      if (killer) { this._shareReward(killer, m.gold, m.xp, 520); killer.objectives++; if (m.buff) this._giveBuff(killer, m.buff); }
    } else if (dst.kind === 'crystal') {
      if (killer) {
        for (const h of this._heroes(killer.team)) { h.gold += CRYSTAL.gold; this._xp(h, CRYSTAL.xp); this._giveBuff(h, 'arcane'); }
        killer.objectives += 3;
        this.events.push({ t: 'crystal', team: killer.team });
        this.crystalNextAt = this.time + MAP.crystal.respawn;
      }
    } else if (dst.kind === 'tower') {
      const team = 1 - dst.team;
      this.stats.towers[team]++;
      for (const h of this._heroes(team)) { h.gold += TOWER_GOLD; this._xp(h, TOWER_XP); }
      if (killer) killer.objectives += 2;
      this.events.push({ t: 'tower', team, lane: dst.lane });
    } else if (dst.kind === 'core') {
      this._finish(1 - dst.team);
    }
  }

  _giveBuff(h, id) { const b = BUFFS[id]; if (!b) return; this._addBuff(h, { id, name: b.name, dur: b.dur, mods: { msPct: b.ms || 0, atk: b.atk || 0, ap: b.ap || 0 }, dmg: b.dmg || 0 }); }
  _heroes(team) { return [...this.units.values()].filter(u => u.kind === 'hero' && u.team === team); }

  _reward(h, gold, xp) { h.gold += gold; this._xp(h, xp); }
  _shareReward(killer, gold, xp, radius, at = null, team = null) {
    const center = at || killer; const tm = team ?? killer.team;
    if (killer) killer.gold += gold;
    for (const h of this._heroes(tm)) {
      if (!h.alive) continue;
      const d = dist(h, center);
      if (h === killer) this._xp(h, xp);
      else if (d < radius) { this._xp(h, xp * 0.6); if (killer) h.gold += gold * 0.35; }
    }
  }
  _xp(h, n) {
    if (h.level >= MAX_LEVEL) return;
    h.xp += n;
    while (h.level < MAX_LEVEL && h.xp >= XP_TO_LEVEL(h.level)) {
      h.xp -= XP_TO_LEVEL(h.level); h.level++; h.points++;
      const before = h.maxHp; this._recompute(h); h.hp += h.maxHp - before; h.res = Math.min(h.stats.resMax, h.res + 40);
      this.events.push({ t: 'levelup', id: h.id, level: h.level });
    }
  }

  _respawn(h) {
    const base = MAP.bases[h.team];
    h.alive = true; h.x = base.x; h.y = base.y; h.hp = h.maxHp; h.res = h.stats.resMax; h.stun = 0; h.root = 0; h.target = null; h.recall = 0;
    h.input.mx = h.input.my = 0; h.input.atk = false;
    this.events.push({ t: 'respawn', id: h.id });
  }
  _reviveMonster(u) { u.alive = true; u.hp = u.maxHp; u.x = u.home.x; u.y = u.home.y; u.aggro = null; u.respawnAt = 0; }

  _finish(team) {
    if (this.over) return;
    this.over = { winner: team, time: this.time, mvp: this._mvp() };
    this.events.push({ t: 'win', team });
  }
  _mvp() {
    let best = null, bestS = -1;
    for (const h of this._heroes(0).concat(this._heroes(1))) {
      const s = h.kills * 3 + h.assists * 1.5 - h.deaths * 1 + h.dmg / 400 + h.dmgTaken / 900 + h.healed / 300 + h.objectives * 2;
      if (s > bestS) { bestS = s; best = h; }
    }
    return best ? best.id : null;
  }

  // ---------------------------------------------------------------- habilidades
  _cast(h, i) {
    const sk = h.def.skills[i], rank = h.skillLv[i];
    if (!sk || rank <= 0 || h.cds[i] > 0 || h.stun > 0) return false;
    if (h.res < sk.cost) { this.events.push({ t: 'nores', id: h.id }); return false; }
    const R = (arr) => (Array.isArray(arr) ? arr[Math.min(rank, arr.length) - 1] : arr);
    const s = h.stats;
    const pow = (skd) => R(skd.dmg || skd.amount || 0) + (skd.ratioAtk || 0) * s.atk + (skd.ratioAp || 0) * s.ap + (skd.ratioHp || 0) * h.maxHp;
    // alvo automático: herói inimigo visível mais próximo dentro do alcance, senão qualquer inimigo
    const range = sk.range || sk.dist || sk.radius || s.range;
    const foes = this._enemies(h, range + 40, { monsters: true });
    const foeHero = foes.find(f => f.e.kind === 'hero');
    const target = (foeHero || foes[0] || {}).e || null;
    let aim = h.aim !== undefined ? h.aim : h.facing;
    if (target && (sk.kind !== 'dash' || sk.toTarget)) aim = Math.atan2(target.y - h.y, target.x - h.x);
    if (target && sk.kind === 'projectile' && !sk.toTarget) aim = Math.atan2(target.y - h.y, target.x - h.x);
    const dmgType = sk.dmgType || 'magic';
    let ok = true;

    switch (sk.kind) {
      case 'projectile': {
        let mult = 1;
        if (h.heroId === 'ignis' && i === 0 && h.pas.empower > 0) { mult = h.pas.empower; h.pas.empower = 0; }
        this.projectiles.push({ x: h.x, y: h.y, vx: Math.cos(aim) * sk.speed, vy: Math.sin(aim) * sk.speed, left: sk.range, team: h.team, src: h, sk, rank, dmg: pow(sk) * mult, dmgType, hit: new Set(), r: sk.width / 2 });
        break;
      }
      case 'aoe': {
        const cx = sk.at === 'target' && target ? target.x : h.x, cy = sk.at === 'target' && target ? target.y : h.y;
        if (sk.allies) {
          for (const a of this._heroes(h.team)) if (a.alive && dist(a, h) <= sk.radius) { this._heal(h, a, R(sk.heal) + (sk.ratioAp || 0) * s.ap); this._addBuff(a, { id: 'aurora', dur: sk.dur, mods: { msPct: sk.msPct } }); }
        } else {
          let hitAny = false;
          for (const f of this._enemies(h, sk.radius + 200, { monsters: true })) {
            const e = f.e;
            if (sk.at === 'front') { const a = Math.atan2(e.y - h.y, e.x - h.x); let da = Math.abs(a - aim); da = Math.min(da, Math.PI * 2 - da); if (da > sk.arc / 2 || dist(h, e) - e.r > sk.radius) continue; }
            else if (Math.hypot(e.x - cx, e.y - cy) - e.r > sk.radius) continue;
            hitAny = true;
            this._damage(h, e, pow(sk), dmgType, { skill: true });
            if (sk.stun) e.stun = Math.max(e.stun, sk.stun);
            if (sk.burn) e.burn = { dps: 12 + s.ap * 0.1 + h.level * 2, until: this.time + sk.burn, src: h };
          }
          if (hitAny) this._seraPassive(h);
        }
        this.events.push({ t: 'aoe', x: cx, y: cy, r: sk.radius, c: h.def.accent, arc: sk.at === 'front' ? [aim, sk.arc] : null });
        break;
      }
      case 'dash': {
        let d = sk.dist, ang = aim;
        if (sk.toTarget) { if (!target) { ok = false; break; } d = Math.min(sk.dist, dist(h, target) - target.r - h.r * 0.5); ang = Math.atan2(target.y - h.y, target.x - h.x); }
        const nx = h.x + Math.cos(ang) * d, ny = h.y + Math.sin(ang) * d;
        this.events.push({ t: 'dash', id: h.id, x: h.x, y: h.y, tx: nx, ty: ny, blink: !!sk.blink, c: h.def.accent });
        h.x = nx; h.y = ny; this._move(h, 0, 0); h.facing = ang;
        if (sk.dmg) {
          const rad = sk.radius || 90;
          for (const f of this._enemies(h, rad, { monsters: true })) { this._damage(h, f.e, pow(sk), dmgType, { skill: true }); if (sk.taunt) f.e.taunt = { by: h, until: this.time + sk.taunt }; if (sk.mark) { f.e.marks = f.e.marks || {}; f.e.marks[h.id] = 3; } }
        }
        if (sk.nextCrit) h.pas.nextCrit = true;
        if (sk.empowerNext) h.pas.empower = sk.empowerNext;
        break;
      }
      case 'strike': {
        const t = foeHero ? foeHero.e : target;
        if (!t) { ok = false; break; }
        if (sk.dashTo) { const ang = Math.atan2(t.y - h.y, t.x - h.x); const d = Math.max(0, dist(h, t) - t.r - h.r); this.events.push({ t: 'dash', id: h.id, x: h.x, y: h.y, tx: h.x + Math.cos(ang) * d, ty: h.y + Math.sin(ang) * d, c: h.def.accent }); h.x += Math.cos(ang) * d; h.y += Math.sin(ang) * d; }
        let amt = pow(sk);
        if (sk.missingPct) amt += (t.maxHp - t.hp) * sk.missingPct;
        if (sk.executeBelow && t.kind === 'hero' && t.hp / t.maxHp < sk.executeBelow) amt = t.hp + 1;
        if (sk.resetOnKill) h.pas.resetCds = true;
        this.events.push({ t: 'strike', id: h.id, tx: t.x, ty: t.y, c: h.def.accent });
        this._damage(h, t, amt, dmgType, { skill: true, crit: sk.executeBelow ? true : false });
        h.pas.resetCds = false;
        break;
      }
      case 'zone': {
        const cx = target ? target.x : h.x + Math.cos(aim) * Math.min(sk.range, 300), cy = target ? target.y : h.y + Math.sin(aim) * Math.min(sk.range, 300);
        this.zones.push({ x: cx, y: cy, r: sk.radius, src: h, sk, rank, dmg: pow(sk), dmgType, until: this.time + (sk.delay || sk.dur), tick: sk.tick || 0, acc: 0, delay: sk.delay || 0, c: h.def.accent });
        this.events.push({ t: 'zone', x: cx, y: cy, r: sk.radius, dur: sk.delay || sk.dur, c: h.def.accent });
        break;
      }
      case 'buff': {
        const mods = {};
        if (sk.atkPct) mods.atkPct = R(sk.atkPct); if (sk.asPct) mods.asPct = R(sk.asPct);
        if (sk.armor) mods.armor = R(sk.armor); if (sk.mr) mods.mr = R(sk.mr);
        this._addBuff(h, { id: sk.name, dur: sk.dur, mods });
        if (sk.shield) { h.shield = R(sk.shield); h.shieldUntil = this.time + sk.dur; }
        if (sk.allyRadius) for (const a of this._heroes(h.team)) if (a !== h && a.alive && dist(a, h) <= sk.allyRadius) this._addBuff(a, { id: 'fortaleza', dur: sk.dur, mods: { armor: sk.allyArmor } });
        this.events.push({ t: 'buffed', id: h.id, c: h.def.accent });
        break;
      }
      case 'shield': {
        const amount = pow(sk);
        if (sk.self) {
          h.shield = amount; h.shieldUntil = this.time + sk.dur;
          if (sk.slowAround) for (const f of this._enemies(h, sk.slowAround.radius, { monsters: true })) f.e.slow = { pct: sk.slowAround.pct, until: this.time + sk.slowAround.dur };
        } else {
          const allies = this._heroes(h.team).filter(a => a.alive && dist(a, h) <= sk.range);
          const t = allies.filter(a => a !== h).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] || h;
          t.shield = amount; t.shieldUntil = this.time + sk.dur;
          if (sk.alsoSelf && t !== h) { h.shield = amount * 0.6; h.shieldUntil = this.time + sk.dur; }
          this.events.push({ t: 'buffed', id: t.id, c: h.def.accent });
        }
        this.events.push({ t: 'buffed', id: h.id, c: h.def.accent });
        break;
      }
      case 'heal': {
        const allies = this._heroes(h.team).filter(a => a.alive && dist(a, h) <= sk.range);
        const t = allies.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] || h;
        this._heal(h, t, pow(sk));
        this.events.push({ t: 'healfx', id: t.id, c: h.def.accent });
        break;
      }
      case 'stealth': {
        h.pas.stealth = sk.dur;
        this.events.push({ t: 'stealth', id: h.id });
        break;
      }
    }
    if (!ok) return false;
    h.res -= sk.cost;
    h.cds[i] = sk.cd * (1 - s.cdr) * (i === 3 && rank === 2 ? 0.85 : 1);
    this.events.push({ t: 'cast', id: h.id, i, name: sk.name, ult: i === 3 });
    return true;
  }

  _seraPassive(h) {
    if (h.heroId !== 'sera') return;
    for (const a of this._heroes(h.team)) if (a.alive && dist(a, h) <= 400) this._heal(h, a, a.maxHp * 0.03);
  }

  _tickProjectiles(dt) {
    for (const p of this.projectiles) {
      const stepLen = Math.hypot(p.vx, p.vy) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.left -= stepLen;
      for (const u of this.units.values()) {
        if (!u.alive || u.team === p.team || p.hit.has(u.id)) continue;
        if (u.team === -1 && u.kind !== 'crystal') continue;
        if (Math.hypot(u.x - p.x, u.y - p.y) > u.r + p.r) continue;
        p.hit.add(u.id);
        const sk = p.sk, h = p.src;
        let amt = p.dmg;
        if (sk.markBonus && u.marks && u.marks[h.id] >= 3) { amt *= 1 + sk.markBonus; u.marks[h.id] = 0; }
        if (sk.splash) {
          this.events.push({ t: 'aoe', x: p.x, y: p.y, r: sk.splash, c: h.def.accent });
          for (const f of this._enemies(h, 2000, { monsters: true })) if (Math.hypot(f.e.x - p.x, f.e.y - p.y) - f.e.r <= sk.splash) { this._damage(h, f.e, amt, p.dmgType, { skill: true }); if (sk.burn) f.e.burn = { dps: 12 + h.stats.ap * 0.1 + h.level * 2, until: this.time + sk.burn, src: h }; }
        } else {
          this._damage(h, u, amt, p.dmgType, { skill: true });
          if (sk.burn) u.burn = { dps: 12 + h.stats.ap * 0.1 + h.level * 2, until: this.time + sk.burn, src: h };
          if (sk.root) { u.root = Math.max(u.root, sk.root); u.stun = Math.max(u.stun, 0); }
        }
        this._seraPassive(h);
        this.events.push({ t: 'impact', x: p.x, y: p.y, c: h.def.accent });
        if (!sk.pierce) { p.left = 0; break; }
      }
    }
    this.projectiles = this.projectiles.filter(p => p.left > 0);
  }

  _tickZones(dt) {
    for (const z of this.zones) {
      if (z.delay > 0) { z.delay -= dt; if (z.delay > 0) continue; z.until = this.time; z.acc = 1; }
      z.acc += dt;
      if (z.acc >= (z.tick || 1)) {
        z.acc = 0;
        const sk = z.sk, h = z.src;
        for (const f of this._enemies(h, 2000, { monsters: true })) {
          if (Math.hypot(f.e.x - z.x, f.e.y - z.y) - f.e.r > z.r) continue;
          this._damage(h, f.e, z.dmg, z.dmgType, { skill: true });
          if (sk.slow) f.e.slow = { pct: sk.slow, until: this.time + 1 };
          if (sk.stun) f.e.stun = Math.max(f.e.stun, sk.stun);
          if (sk.burn) f.e.burn = { dps: 14 + h.stats.ap * 0.12, until: this.time + sk.burn, src: h };
        }
        if (!sk.tick) { this.events.push({ t: 'aoe', x: z.x, y: z.y, r: z.r, c: z.c, big: true }); z.until = 0; }
      }
    }
    this.zones = this.zones.filter(z => z.delay > 0 || this.time < z.until);
  }

  // ---------------------------------------------------------------- minions
  _spawnWave(n) {
    const g = waveGrowth(n);
    const arcane = [0, 1].map(team => this._heroes(team).some(h => h.buffs.some(b => b.id === 'arcane')));
    for (const team of [0, 1]) for (const lane of ['top', 'bot']) {
      const path = team === 0 ? MAP.lanes[lane] : [...MAP.lanes[lane]].reverse();
      const comp = ['melee', 'melee', 'melee', 'ranged', 'ranged'];
      if (n % 3 === 0) comp.push('siege');
      comp.forEach((type, i) => {
        const m = MINIONS[type];
        const mult = arcane[team] ? 1.35 : 1;
        this._add({ kind: 'minion', mtype: type, team, lane, path, wp: 1, x: path[0].x + (this.rnd() - 0.5) * 30, y: path[0].y + (this.rnd() - 0.5) * 30 - i * 14, r: m.size,
          hp: Math.round(m.hp * g * mult), maxHp: Math.round(m.hp * g * mult), name: 'Minion',
          stats: { atk: m.atk * g * mult, armor: m.armor, mr: m.mr, range: m.range, as: m.as, ms: m.ms }, atkCd: 0.3 * i, gold: m.gold, xp: m.xp, empowered: arcane[team] });
      });
    }
    this.events.push({ t: 'wave', n });
  }

  _tickMinion(u, dt) {
    if (u.stun > 0) return;
    // alvo: o inimigo mais próximo em raio de aggro (heróis só se perto)
    const foes = this._enemies(u, 260, { kinds: ['minion', 'hero', 'tower', 'core'] });
    let t = foes.find(f => f.e.kind === 'minion') || foes.find(f => f.e.kind === 'tower' || f.e.kind === 'core') || foes.find(f => f.e.kind === 'hero' && f.d < 160);
    if (t && foes.find(f => f.e.kind === 'hero' && f.d < 60)) t = foes.find(f => f.e.kind === 'hero');
    if (t) {
      const e = t.e;
      if (t.d <= u.stats.range) {
        u.atkCd -= dt;
        if (u.atkCd <= 0) { u.atkCd = 1 / u.stats.as; u.facing = Math.atan2(e.y - u.y, e.x - u.x); if (u.stats.range > 100) this.events.push({ t: 'shot', x: u.x, y: u.y, tx: e.x, ty: e.y, team: u.team, c: 0xffffff, small: true }); this._damage(u, e, u.stats.atk, 'phys'); }
      } else this._walkTo(u, e, dt);
      return;
    }
    // segue a lane
    const wp = u.path[u.wp];
    if (!wp) return;
    if (dist(u, wp) < 24) { u.wp = Math.min(u.path.length - 1, u.wp + 1); }
    this._walkTo(u, wp, dt);
  }

  _walkTo(u, p, dt) {
    const d = dist(u, p); if (d < 1) return;
    const slow = this.time < u.slow.until ? 1 - u.slow.pct : 1;
    const spd = u.stats.ms * slow * dt;
    u.x += (p.x - u.x) / d * spd; u.y += (p.y - u.y) / d * spd; u.facing = Math.atan2(p.y - u.y, p.x - u.x);
  }

  // ---------------------------------------------------------------- torres
  _tickTower(u, dt) {
    u.atkCd -= dt;
    if (u.kind === 'core') {
      // o core só fica vulnerável quando as duas torres de uma lane caíram
      const lanesOpen = ['top', 'bot'].filter(l => ![...this.units.values()].some(t => t.kind === 'tower' && t.team === u.team && t.lane === l && t.alive));
      u.vulnerable = lanesOpen.length > 0;
    }
    if (u.atkCd > 0) return;
    const foes = this._enemies(u, u.stats.range, { kinds: ['minion', 'hero'] });
    if (!foes.length) { u.aggroHero = null; return; }
    let t = null;
    if (u.aggroHero && u.aggroHero.alive && dist(u, u.aggroHero) - u.aggroHero.r <= u.stats.range) t = u.aggroHero;
    else { u.aggroHero = null; t = (foes.find(f => f.e.kind === 'minion') || foes[0]).e; }
    u.atkCd = 1 / u.stats.as;
    const atk = u.kind === 'tower' ? u.stats.atk + TOWER.atkGrowthPerMin * Math.min(10, this.time / 60) : u.stats.atk;
    this.events.push({ t: 'shot', x: u.x, y: u.y - 30, tx: t.x, ty: t.y, team: u.team, c: 0xffd23e, tower: true });
    this._damage(u, t, atk, 'phys');
  }

  // ---------------------------------------------------------------- jungle / cristal
  _spawnCrystal() {
    const c = MAP.crystal;
    this._add({ kind: 'crystal', team: -1, x: c.x, y: c.y, home: { x: c.x, y: c.y }, r: CRYSTAL.size, hp: CRYSTAL.hp, maxHp: CRYSTAL.hp, name: CRYSTAL.name,
      stats: { atk: CRYSTAL.atk, armor: CRYSTAL.armor, mr: CRYSTAL.armor, range: CRYSTAL.range, as: CRYSTAL.as, ms: 0 }, atkCd: 0, aggro: null, respawnAt: 0 });
    this.events.push({ t: 'crystalup' });
  }

  _tickMonster(u, dt) {
    u.atkCd -= dt;
    const leash = dist(u, u.home);
    if (u.aggro && (!u.aggro.alive || leash > 320 || dist(u, u.aggro) > 380)) { u.aggro = null; }
    if (!u.aggro) {
      if (leash > 4) { this._walkTo(u, u.home, dt); u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.1 * dt); }
      return;
    }
    const t = u.aggro;
    if (dist(u, t) - t.r <= u.stats.range) {
      if (u.atkCd <= 0) { u.atkCd = 1 / u.stats.as; u.facing = Math.atan2(t.y - u.y, t.x - u.x); this._damage(u, t, u.stats.atk, u.kind === 'crystal' ? 'magic' : 'phys'); if (u.kind === 'crystal') this.events.push({ t: 'shot', x: u.x, y: u.y, tx: t.x, ty: t.y, team: -1, c: 0xd45de0 }); }
    } else if (u.stats.ms) this._walkTo(u, t, dt);
  }

  // ---------------------------------------------------------------- visão
  _computeVision() {
    for (const team of [0, 1]) {
      const vis = new Set();
      const sources = [];
      for (const u of this.units.values()) {
        if (!u.alive || u.team !== team) continue;
        const r = u.kind === 'hero' ? VISION.hero : u.kind === 'tower' ? VISION.tower : u.kind === 'minion' ? VISION.minion : u.kind === 'core' ? VISION.core : 0;
        if (r) sources.push({ u, r });
      }
      for (const e of this.units.values()) {
        if (!e.alive || e.team === team) continue;
        for (const s of sources) {
          const d = dist(s.u, e);
          if (d > s.r) continue;
          if (e.kind === 'hero' && e.pas.stealth > 0 && d > 110) continue;
          if (e.hidden && !s.u.hidden && d > 70) continue;
          vis.add(e.id); break;
        }
      }
      this.visible[team] = vis;
    }
  }

  // ---------------------------------------------------------------- snapshot
  // O que o time `team` enxerga. `slot` = herói do destinatário (detalhes).
  snapshotFor(team, slot) {
    const units = [];
    const vis = this.visible[team];
    for (const u of this.units.values()) {
      const known = u.team === team || u.kind === 'tower' || u.kind === 'core' || vis.has(u.id) || (!u.alive && u.kind === 'hero');
      if (!known) continue;
      const rec = {
        id: u.id, k: u.kind, tm: u.team, x: Math.round(u.x), y: Math.round(u.y), hp: Math.round(u.hp), mh: u.maxHp, a: u.alive ? 1 : 0, f: Math.round(u.facing * 100) / 100,
        st: (u.stun > 0 ? 1 : 0) | (u.shield > 0 ? 2 : 0) | (u.burn ? 4 : 0) | (u.hidden ? 8 : 0) | (u.root > 0 ? 16 : 0) | (this.time < u.slow.until ? 32 : 0),
      };
      if (u.kind === 'hero') { rec.h = u.heroId; rec.lv = u.level; rec.n = u.name; rec.sl = u.slot; rec.stl = u.pas.stealth > 0 ? 1 : 0; rec.rs = u.alive ? 0 : Math.max(0, Math.ceil(u.respawnAt - this.time)); rec.bf = u.buffs.filter(b => BUFFS[b.id]).map(b => b.id); }
      if (u.kind === 'minion') { rec.mt = u.mtype; rec.emp = u.empowered ? 1 : 0; }
      if (u.kind === 'monster') rec.ck = u.campKind;
      if (u.kind === 'core') rec.vul = u.vulnerable ? 1 : 0;
      if (u.kind === 'tower') rec.ln = u.lane;
      units.push(rec);
    }
    const me = slot !== undefined ? [...this.units.values()].find(u => u.kind === 'hero' && u.slot === slot) : null;
    const mine = me ? {
      id: me.id, res: Math.round(me.res), resMax: Math.round(me.stats.resMax), gold: Math.floor(me.gold), xp: Math.round(me.xp), xpNext: XP_TO_LEVEL(me.level), level: me.level, points: me.points,
      cds: me.cds.map(c => Math.max(0, Math.round(c * 10) / 10)), skillLv: me.skillLv, items: me.items, kills: me.kills, deaths: me.deaths, assists: me.assists,
      stats: { atk: Math.round(me.stats.atk), ap: Math.round(me.stats.ap), armor: Math.round(me.stats.armor), mr: Math.round(me.stats.mr), ms: Math.round(me.stats.ms), as: Math.round(me.stats.as * 100) / 100, crit: Math.round(me.stats.crit * 100), critDmg: Math.round(me.stats.critDmg * 100), cdr: Math.round(me.stats.cdr * 100) },
      buffs: me.buffs.map(b => ({ id: b.id, left: Math.round(b.until - this.time) })), shield: Math.round(me.shield), recall: me.recall,
    } : null;
    const board = this._heroes(0).concat(this._heroes(1)).map(h => ({ id: h.id, n: h.name, h: h.heroId, tm: h.team, lv: h.level, k: h.kills, d: h.deaths, a: h.assists, it: h.items, sl: h.slot, dmg: h.dmg }));
    return { t: Math.round(this.time * 10) / 10, w: this.wave, units, me: mine, board, towers: this.stats.towers, over: this.over, crystalAt: this.crystalNextAt, proj: this.projectiles.map(p => [Math.round(p.x), Math.round(p.y), p.team, p.src.def.accent, p.r]), zones: this.zones.map(z => [Math.round(z.x), Math.round(z.y), z.r, z.c]) };
  }

  drainEvents() { const ev = this.events; this.events = []; return ev; }
}
