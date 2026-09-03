// Pomar Mágico — Batalha: curva de dano (puro, configurável).
//
// O dano cresce com a DIFERENÇA RELATIVA de score (não o score bruto —
// senão a partida ficaria mais punitiva conforme o jogo avança e os
// scores crescem) e ganha um pequeno bônus por combo/especiais do
// vencedor, sempre dentro de [min, max]. Nunca uma derrota apertada tira
// muito HP, e nunca uma goleada tira um HP absurdo.
export const DAMAGE = { min: 5, max: 25, comboBonus: 0.6, specialBonus: 0.8, comboBonusCap: 6, specialBonusCap: 4 };

export function computeDamage(winnerScore, loserScore, winnerCombo = 1, winnerSpecials = 0) {
  if (loserScore >= winnerScore) return 0;
  const gap = (winnerScore - loserScore) / Math.max(1, winnerScore);   // 0..1
  const base = DAMAGE.min + gap * (DAMAGE.max - DAMAGE.min);
  const bonus = Math.min(DAMAGE.comboBonusCap, winnerCombo * DAMAGE.comboBonus) + Math.min(DAMAGE.specialBonusCap, winnerSpecials * DAMAGE.specialBonus);
  return Math.max(DAMAGE.min, Math.min(DAMAGE.max, Math.round(base + bonus)));
}
