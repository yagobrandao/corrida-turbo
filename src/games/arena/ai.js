// Arena Clash — IA dos bots.
//
// Um bot escreve exatamente no mesmo `input` que um jogador humano: vetor
// de movimento, mira, botão de ataque e habilidades. Toda a "inteligência"
// está em ESCOLHER o que fazer; o resto passa pela simulação normal, então
// bot não tem dano nem vida extra — a dificuldade vem de decisão, reação,
// precisão de mira e build.
import { MAP, HERO_BY_ID, ITEM_BY_ID, MINIONS } from './data.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const toward = (h, p) => { const d = dist(h, p) || 1; return { mx: (p.x - h.x) / d, my: (p.y - h.y) / d }; };

export function botThink(w, h, prof) {
  const ai = h.ai, inp = h.input;
  inp.atk = false;
  if (!h.alive) return;
  const base = MAP.bases[h.team], enemyBase = MAP.bases[1 - h.team];
  const hpPct = h.hp / h.maxHp;

  // lane fixa por classe: tanque/guerreiro no topo, atirador/suporte embaixo, mago/assassino rodam
  if (!ai.lane) ai.lane = (h.cls === 'tank' || h.cls === 'warrior') ? 'top' : (h.cls === 'ranger' || h.cls === 'support') ? 'bot' : (w.rnd() < 0.5 ? 'top' : 'bot');

  // compras
  shop(w, h, prof);

  const foes = w._enemies(h, 520, { monsters: true });
  const foeHeroes = foes.filter(f => f.e.kind === 'hero');
  const allies = w._heroes(h.team).filter(a => a.alive && a !== h && dist(a, h) < 450);
  const nearestFoeHero = foeHeroes[0] ? foeHeroes[0].e : null;
  const dangerous = foeHeroes.length > allies.length + 1 || (nearestFoeHero && nearestFoeHero.level > h.level + 2);
  const towerThreat = [...w.units.values()].find(u => u.alive && (u.kind === 'tower' || u.kind === 'core') && u.team !== h.team && dist(u, h) < u.stats.range + 30);
  const alliedMinionsNear = [...w.units.values()].some(u => u.alive && u.kind === 'minion' && u.team === h.team && dist(u, h) < 200);

  // ---- recuar
  if (hpPct < prof.retreatHp || (dangerous && hpPct < 0.7)) ai.state = 'retreat';
  else if (ai.state === 'retreat' && hpPct > 0.85) ai.state = 'lane';

  if (ai.state === 'retreat') {
    // foge de quem está perto, senão volta pra base; cura na fonte
    const away = nearestFoeHero && dist(h, nearestFoeHero) < 300 ? { x: h.x + (h.x - nearestFoeHero.x), y: h.y + (h.y - nearestFoeHero.y) } : base;
    Object.assign(inp, toward(h, away));
    // habilidade defensiva ao fugir
    for (let i = 0; i < 4; i++) { const sk = h.def.skills[i]; if (h.skillLv[i] && h.cds[i] <= 0 && (sk.kind === 'shield' || sk.kind === 'stealth' || sk.kind === 'heal' || (sk.kind === 'dash' && !sk.toTarget)) && w.rnd() < prof.skillUse) inp.cast[i] = true; }
    if (dist(h, base) < MAP.fountainRadius) { inp.mx = inp.my = 0; }
    return;
  }

  // ---- lutar: herói inimigo alcançável
  const canFight = nearestFoeHero && (!dangerous || hpPct > 0.6) && !(towerThreat && !alliedMinionsNear && hpPct < 0.9);
  if (canFight && (w.rnd() < prof.chase || dist(h, nearestFoeHero) < h.stats.range + 40)) {
    ai.state = 'fight';
    const t = nearestFoeHero;
    // mira com erro proporcional à dificuldade
    const err = (w.rnd() - 0.5) * prof.aimErr;
    const ang = Math.atan2(t.y - h.y, t.x - h.x) + err / 200;
    inp.ax = Math.cos(ang); inp.ay = Math.sin(ang);
    const d = dist(h, t) - t.r;
    const ideal = h.stats.range > 150 ? h.stats.range * 0.85 : h.stats.range * 0.6;
    if (d > ideal) Object.assign(inp, toward(h, t)); else if (d < ideal * 0.5 && h.stats.range > 150) { const a = toward(h, t); inp.mx = -a.mx; inp.my = -a.my; } else { inp.mx = 0; inp.my = 0; }
    inp.atk = true;
    useSkills(w, h, prof, t, d, foeHeroes.length);
    return;
  }

  // ---- objetivos: cristal / jungle (quando a lane está calma)
  const crystal = [...w.units.values()].find(u => u.kind === 'crystal' && u.alive);
  if (crystal && h.level >= 4 && w.rnd() < prof.objective && hpPct > 0.6) {
    ai.state = 'objective';
    return engage(w, h, prof, crystal, inp);
  }
  if ((h.cls === 'assassin' || h.cls === 'mage' || w.rnd() < prof.objective * 0.4) && hpPct > 0.5) {
    const camp = [...w.units.values()].filter(u => u.kind === 'monster' && u.alive && dist(u, h) < 420 && ((h.team === 0) === (u.camp.endsWith('B')) || w.rnd() < 0.3))
      .sort((a, b) => dist(a, h) - dist(b, h))[0];
    if (camp) { ai.state = 'jungle'; return engage(w, h, prof, camp, inp); }
  }

  // ---- lane: avança até a linha de frente; ataca minions/torre
  ai.state = 'lane';
  const path = h.team === 0 ? MAP.lanes[ai.lane] : [...MAP.lanes[ai.lane]].reverse();
  const foeMinion = foes.find(f => f.e.kind === 'minion');
  const foeTower = foes.find(f => f.e.kind === 'tower' || (f.e.kind === 'core' && f.e.vulnerable));
  if (foeMinion) return engage(w, h, prof, foeMinion.e, inp);
  if (foeTower && alliedMinionsNear && hpPct > 0.4) return engage(w, h, prof, foeTower.e, inp);
  if (foeTower && !alliedMinionsNear) {
    // espera os minions fora do alcance da torre
    const wait = { x: foeTower.e.x + (h.x - foeTower.e.x) * 1.4, y: foeTower.e.y + (h.y - foeTower.e.y) * 1.4 };
    Object.assign(inp, dist(h, foeTower.e) < foeTower.e.stats.range + 60 ? toward(h, wait) : { mx: 0, my: 0 });
    return;
  }
  // segue a lane até achar algo
  let wp = ai.wp || 1;
  if (dist(h, path[wp]) < 40) wp = Math.min(path.length - 1, wp + 1);
  ai.wp = wp;
  // não passa da última torre inimiga em pé sem minions
  Object.assign(inp, toward(h, path[wp]));
}

function engage(w, h, prof, t, inp) {
  const d = dist(h, t) - t.r;
  const ideal = h.stats.range > 150 ? h.stats.range * 0.85 : h.stats.range * 0.6;
  inp.ax = (t.x - h.x) / (dist(h, t) || 1); inp.ay = (t.y - h.y) / (dist(h, t) || 1);
  if (d > ideal) Object.assign(inp, toward(h, t)); else { inp.mx = 0; inp.my = 0; }
  inp.atk = true;
  if (t.kind === 'monster' || t.kind === 'crystal') useSkills(w, h, prof, t, d, 0);
}

function useSkills(w, h, prof, t, d, foeCount) {
  for (let i = 0; i < 4; i++) {
    const sk = h.def.skills[i];
    if (!h.skillLv[i] || h.cds[i] > 0 || h.res < sk.cost) continue;
    if (w.rnd() > prof.skillUse) continue;
    const range = sk.range || sk.dist || sk.radius || h.stats.range;
    const isUlt = i === 3;
    if (isUlt) {
      // ult: alvo com pouca vida, ou vários inimigos, ou (suporte) aliado ferido
      const tHp = t.hp / t.maxHp;
      const allyHurt = w._heroes(h.team).some(a => a.alive && a !== h && a.hp / a.maxHp < 0.5 && dist(a, h) < 300);
      if (sk.allies ? !allyHurt : !(tHp < prof.ultHp || foeCount >= 2)) continue;
    }
    if (sk.kind === 'heal' || sk.kind === 'shield') {
      const hurt = w._heroes(h.team).some(a => a.alive && a.hp / a.maxHp < 0.7 && dist(a, h) < (sk.range || 300));
      if (!hurt && !(sk.self && h.hp / h.maxHp < 0.6)) continue;
    } else if (sk.kind === 'buff' || sk.kind === 'stealth') {
      if (d > h.stats.range + 120) continue;
    } else if (sk.kind === 'dash' && !sk.toTarget && !sk.dmg) {
      continue;                       // rolamento/blink só na fuga
    } else if (d > range) continue;
    h.input.cast[i] = true;
    return;                           // uma por decisão: combos saem ao longo dos pensamentos
  }
}

function shop(w, h, prof) {
  const build = h.build; if (!build) return;
  const idx = h.ai.buildIdx;
  if (idx >= build.length) return;
  const id = build[idx];
  const it = ITEM_BY_ID[id];
  if (prof.buys === 'components' && it.from) { h.ai.buildIdx++; return; }   // fácil não junta receitas
  // preço real considerando componentes já no inventário
  let cost = it.cost;
  for (const c of it.from || []) if (h.items.includes(c)) cost -= ITEM_BY_ID[c].cost;
  if (h.gold >= cost && (h.items.length < 6 || (it.from && it.from.some(c => h.items.includes(c))))) {
    if (w.buy(h, id)) h.ai.buildIdx++;
  }
}
