// Battle Tactics — simulação de combate.
//
// PURA e DETERMINÍSTICA: não conhece Phaser, DOM nem relógio. Recebe duas
// equipes e uma seed, avança em passos fixos (STEP) e devolve eventos para a
// cena animar. Mesmas entradas → mesmo resultado em qualquer aparelho, que é
// o que permite o PvP futuro: cada lado manda sua formação, os dois rodam a
// mesma simulação e chegam ao mesmo vencedor sem trocar um byte de combate.
//
// Movimento é por células (uma unidade por célula), o que evita empilhamento
// e mantém tudo inteiro/estável. O alcance usa distância de Chebyshev
// (diagonais contam como 1), então "corpo a corpo" ataca as 8 vizinhas.
import { mulberry32 } from '../../core/rng.js';
import {
  COLS, ROWS, UNITS, STAR_MULT, SYNERGIES, BATTLE_TIME_LIMIT,
  MANA_MAX, MANA_PER_ATTACK, MANA_PER_HIT,
} from './config.js';

export const STEP = 1 / 30;
const RETARGET_EVERY = 0.8;
const BURN_TICK = 0.5;

// ---------------------------------------------------------------- sinergias
// Conta unidades DISTINTAS por traço e devolve os buffs acumulados da equipe
// mais a lista para a UI (progresso, nível ativo, descrição).
export function teamSynergies(units) {
  const counts = {};
  const seen = new Set();
  for (const u of units) {
    const def = UNITS[u.id];
    if (!def || seen.has(def.id)) continue;
    seen.add(def.id);
    counts[def.faction] = (counts[def.faction] || 0) + 1;
    counts[def.cls] = (counts[def.cls] || 0) + 1;
  }
  const buffs = { hp: 0, atk: 0, as: 0, armor: 0, regen: 0, burn: false };
  const list = [];
  for (const s of SYNERGIES) {
    const n = counts[s.id] || 0;
    let lv = 0;
    for (let i = 0; i < s.thresholds.length; i++) if (n >= s.thresholds[i]) lv = i + 1;
    if (lv > 0) s.apply(buffs, lv);
    const next = s.thresholds.find(t => t > n) || null;
    if (n > 0) list.push({ id: s.id, name: s.name, kind: s.kind, count: n, level: lv, next, thresholds: s.thresholds, desc: lv > 0 ? s.desc[lv - 1] : s.desc[0] });
  }
  // ativas primeiro, depois as mais perto de fechar
  list.sort((a, b) => (b.level - a.level) || (b.count - a.count));
  return { buffs, list };
}

// ---------------------------------------------------------------- montagem
function makeFighter(spec, team, buffs, idx) {
  const def = UNITS[spec.id];
  const m = STAR_MULT[spec.star] || 1;
  const maxHp = Math.round(def.hp * m * (1 + buffs.hp));
  return {
    uid: `${team}-${idx}`,
    ref: spec.uid || null,        // id da unidade na corrida (para a cena achar o sprite)
    id: def.id, def, team, star: spec.star,
    c: spec.c, r: spec.r,
    hp: maxHp, maxHp,
    atk: def.atk * m * (1 + buffs.atk),
    as: def.as * (1 + buffs.as),
    armor: Math.min(0.7, buffs.armor + (def.armor || 0)),
    regen: buffs.regen,
    burnOnHit: buffs.burn,
    range: def.range, speed: def.speed,
    mana: 0, manaPerAttack: def.manaPerAttack || MANA_PER_ATTACK,
    shield: 0, shieldT: 0,
    burn: 0, burnDps: 0, burnAcc: 0,
    stun: 0,
    cd: 0.3 + (idx % 3) * 0.1,   // desencontra os primeiros golpes
    moveT: 0,
    target: null, retargetT: 0,
    alive: true,
    kills: 0, dmgDealt: 0,
  };
}

// teams: [{ units: [{ id, star, c, r, uid? }] }, { ... }]
// Equipe 0 = de baixo (jogador), equipe 1 = de cima.
export function createBattle(teamA, teamB, seed) {
  const rnd = mulberry32(seed >>> 0);
  const synA = teamSynergies(teamA);
  const synB = teamSynergies(teamB);
  const units = [
    ...teamA.map((u, i) => makeFighter(u, 0, synA.buffs, i)),
    ...teamB.map((u, i) => makeFighter(u, 1, synB.buffs, i)),
  ];
  const grid = new Array(COLS * ROWS).fill(null);
  for (const u of units) grid[u.r * COLS + u.c] = u;
  return {
    units, grid, rnd, t: 0, over: false, winner: -1, reason: '',
    events: [],
    syn: [synA.list, synB.list],
  };
}

// ---------------------------------------------------------------- utilidades
const cheb = (a, b) => Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r));
const inBounds = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
const alive = (b, team) => b.units.filter(u => u.alive && u.team === team);
const enemiesOf = (b, u) => alive(b, 1 - u.team);

function pickTarget(b, u) {
  const foes = enemiesOf(b, u);
  if (!foes.length) return null;
  let best = null, bestKey = Infinity;
  for (const f of foes) {
    const d = cheb(u, f);
    // atiradores preferem quem já está no alcance (não andam à toa)
    let key = d;
    if (u.def.ai === 'ranged' && d <= u.range) key = d - 100;
    if (key < bestKey) { bestKey = key; best = f; }
  }
  return best;
}

function lowestHpEnemy(b, u, exclude) {
  let best = null;
  for (const f of enemiesOf(b, u)) {
    if (exclude && exclude.has(f)) continue;
    if (!best || f.hp < best.hp) best = f;
  }
  return best;
}

function neighborsOf(b, center, radius, team) {
  return b.units.filter(x => x.alive && x !== center && x.team === team && cheb(x, center) <= radius);
}

// Passo em direção ao alvo: entre as 8 vizinhas livres, a que mais aproxima.
function stepToward(b, u, target) {
  let best = null, bestD = cheb(u, target), bestE = Infinity;
  for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
    if (!dc && !dr) continue;
    const c = u.c + dc, r = u.r + dr;
    if (!inBounds(c, r) || b.grid[r * COLS + c]) continue;
    const d = Math.max(Math.abs(c - target.c), Math.abs(r - target.r));
    const e = (c - target.c) ** 2 + (r - target.r) ** 2;
    if (d < bestD || (d === bestD && e < bestE)) { best = { c, r }; bestD = d; bestE = e; }
  }
  if (!best) return false;
  b.grid[u.r * COLS + u.c] = null;
  u.c = best.c; u.r = best.r;
  b.grid[u.r * COLS + u.c] = u;
  b.events.push({ t: 'move', uid: u.uid, c: u.c, r: u.r, dur: 1 / u.speed });
  return true;
}

// ---------------------------------------------------------------- dano
function dealDamage(b, from, to, amount, tag) {
  if (!to.alive) return 0;
  // ±10% pela seed: tira o "fio da navalha" de confrontos idênticos sem
  // perder o determinismo (mesma seed, mesma sequência)
  let dmg = amount * (1 - to.armor) * (tag === 'burn' ? 1 : 0.9 + b.rnd() * 0.2);
  if (to.shield > 0) {
    const absorbed = Math.min(to.shield, dmg);
    to.shield -= absorbed; dmg -= absorbed;
  }
  dmg = Math.round(dmg);
  to.hp -= dmg;
  to.mana = Math.min(MANA_MAX, to.mana + MANA_PER_HIT);
  if (from) from.dmgDealt += dmg;
  if (from && from.burnOnHit && tag !== 'burn') applyBurn(to, to.maxHp * 0.03 / 3, 3);
  b.events.push({ t: 'hit', uid: to.uid, from: from ? from.uid : null, dmg, tag: tag || 'hit' });
  if (to.hp <= 0) kill(b, to, from);
  return dmg;
}

function applyBurn(u, dps, dur) {
  u.burn = Math.max(u.burn, dur);
  u.burnDps = Math.max(u.burnDps, dps);
}

function kill(b, u, by) {
  u.alive = false; u.hp = 0;
  b.grid[u.r * COLS + u.c] = null;
  if (by) by.kills++;
  b.events.push({ t: 'die', uid: u.uid, by: by ? by.uid : null });
  for (const o of b.units) if (o.target === u) o.target = null;
}

// ---------------------------------------------------------------- habilidades
function cast(b, u) {
  const a = u.def.ability;
  const s = u.star - 1;
  u.mana = 0;
  b.events.push({ t: 'cast', uid: u.uid, name: a.name, kind: a.kind });
  switch (a.kind) {
    case 'shield':
      u.shield = Math.round(u.maxHp * a.pct[s]);
      u.shieldT = a.dur;
      break;
    case 'multishot': {
      const used = new Set();
      for (let i = 0; i < a.shots[s]; i++) {
        // alvo mais próximo ainda não atingido; repete o último se faltar gente
        let best = null, bestD = Infinity;
        for (const f of enemiesOf(b, u)) {
          if (used.has(f)) continue;
          const d = cheb(u, f);
          if (d < bestD) { bestD = d; best = f; }
        }
        if (!best) best = u.target && u.target.alive ? u.target : null;
        if (!best) break;
        used.add(best);
        b.events.push({ t: 'shot', from: u.uid, to: best.uid, kind: 'arrow' });
        dealDamage(b, u, best, u.atk * a.mult[s], 'skill');
      }
      break;
    }
    case 'aoe': {
      const tgt = u.target && u.target.alive ? u.target : pickTarget(b, u);
      if (!tgt) break;
      b.events.push({ t: 'shot', from: u.uid, to: tgt.uid, kind: 'fire' });
      b.events.push({ t: 'blast', c: tgt.c, r: tgt.r, radius: a.radius, color: 'fire' });
      const victims = [tgt, ...neighborsOf(b, tgt, a.radius, tgt.team)];
      for (const v of victims) dealDamage(b, u, v, u.atk * a.mult[s], 'skill');
      break;
    }
    case 'roar': {
      b.events.push({ t: 'blast', c: u.c, r: u.r, radius: a.radius, color: 'fire' });
      for (const v of neighborsOf(b, u, a.radius, 1 - u.team)) {
        dealDamage(b, u, v, u.atk * a.mult[s], 'skill');
        if (v.alive) applyBurn(v, v.maxHp * 0.04 / a.burn, a.burn);
      }
      break;
    }
    case 'cleave': {
      const tgt = u.target && u.target.alive ? u.target : pickTarget(b, u);
      if (!tgt) break;
      b.events.push({ t: 'blast', c: tgt.c, r: tgt.r, radius: 1, color: 'leaf' });
      dealDamage(b, u, tgt, u.atk * a.mult[s], 'skill');
      for (const v of neighborsOf(b, tgt, 1, tgt.team)) dealDamage(b, u, v, u.atk * a.mult[s] * a.splash, 'skill');
      break;
    }
    case 'snipe': {
      const hit = new Set();
      for (let i = 0; i < a.targets[s]; i++) {
        const v = lowestHpEnemy(b, u, hit);
        if (!v) break;
        hit.add(v);
        b.events.push({ t: 'shot', from: u.uid, to: v.uid, kind: 'sun' });
        dealDamage(b, u, v, u.atk * a.mult[s], 'skill');
      }
      break;
    }
    case 'stomp': {
      b.events.push({ t: 'blast', c: u.c, r: u.r, radius: a.radius, color: 'stone' });
      for (const v of neighborsOf(b, u, a.radius, 1 - u.team)) {
        dealDamage(b, u, v, u.atk * a.mult[s], 'skill');
        if (v.alive) v.stun = Math.max(v.stun, a.stun);
      }
      break;
    }
  }
}

// ---------------------------------------------------------------- passo
export function step(b) {
  if (b.over) return;
  const dt = STEP;
  b.t += dt;

  for (const u of b.units) {
    if (!u.alive) continue;

    // efeitos contínuos
    if (u.shieldT > 0) { u.shieldT -= dt; if (u.shieldT <= 0) u.shield = 0; }
    if (u.burn > 0) {
      u.burn -= dt; u.burnAcc += dt;
      if (u.burnAcc >= BURN_TICK) { u.burnAcc -= BURN_TICK; dealDamage(b, null, u, u.burnDps * BURN_TICK, 'burn'); if (!u.alive) continue; }
      if (u.burn <= 0) u.burnDps = 0;
    }
    if (u.regen > 0 && u.hp < u.maxHp) {
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * u.regen * dt);
    }
    if (u.stun > 0) { u.stun -= dt; continue; }

    // habilidade pronta
    if (u.mana >= MANA_MAX && enemiesOf(b, u).length) { cast(b, u); continue; }

    // alvo
    u.retargetT -= dt;
    if (!u.target || !u.target.alive || u.retargetT <= 0) {
      const t = pickTarget(b, u);
      // só troca se o atual sumiu ou o novo está claramente mais perto
      if (!u.target || !u.target.alive || (t && cheb(u, t) < cheb(u, u.target) && cheb(u, u.target) > u.range)) u.target = t;
      u.retargetT = RETARGET_EVERY;
    }
    if (!u.target) continue;

    u.cd -= dt;
    if (cheb(u, u.target) <= u.range) {
      if (u.cd <= 0) {
        u.cd = 1 / u.as;
        u.mana = Math.min(MANA_MAX, u.mana + u.manaPerAttack);
        b.events.push({ t: 'attack', uid: u.uid, to: u.target.uid, ranged: u.range > 1 });
        dealDamage(b, u, u.target, u.atk, 'hit');
      }
    } else {
      u.moveT -= dt;
      if (u.moveT <= 0) {
        if (stepToward(b, u, u.target)) u.moveT = 1 / u.speed;
        else u.moveT = 0.25;   // bloqueado: tenta de novo em breve
      }
    }
  }

  // fim
  const a = alive(b, 0).length, e = alive(b, 1).length;
  if (!a || !e) {
    b.over = true;
    b.winner = a ? 0 : e ? 1 : -1;
    b.reason = 'wipe';
  } else if (b.t >= BATTLE_TIME_LIMIT) {
    b.over = true;
    const ratio = (team) => alive(b, team).reduce((s, u) => s + u.hp / u.maxHp, 0);
    b.winner = ratio(0) > ratio(1) ? 0 : 1;
    b.reason = 'timeout';
  }
  if (b.over) b.events.push({ t: 'end', winner: b.winner, reason: b.reason });
}

// Roda a batalha inteira de uma vez (balanceamento, PvP sem animação, testes).
export function runToEnd(teamA, teamB, seed) {
  const b = createBattle(teamA, teamB, seed);
  let guard = 0;
  while (!b.over && guard++ < 100000) { step(b); b.events.length = 0; }
  return b;
}

// Coleta e limpa os eventos acumulados desde a última chamada.
export function drainEvents(b) {
  const ev = b.events;
  b.events = [];
  return ev;
}
