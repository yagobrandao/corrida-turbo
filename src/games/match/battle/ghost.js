// Pomar Mágico — Batalha: Ghost (puro).
//
// O Ghost NÃO é um bot aleatório nem um segundo jogador: é uma cópia
// temporária do DESEMPENHO recente do jogador original (média móvel das
// últimas rodadas reais dele), usada só para aquela rodada. O jogador
// original continua jogando a própria partida normalmente — ele nunca
// controla o Ghost, e o resultado do Ghost nunca volta a afetá-lo (isso é
// aplicado em manager.js, que nunca causa dano ao dono por causa do Ghost).
//
// O resultado do Ghost é calculado UMA VEZ, no início da rodada, a partir
// só do perfil do jogador + uma seed — nunca reagindo ao vivo ao
// desempenho de quem está jogando contra ele.
import { mulberry32 } from '../../../core/rng.js';

export function emptyProfile() {
  return { rounds: 0, avgScore: 1400, avgCombo: 2, avgSpecials: 1, avgAttacks: 1, history: [] };
}

// chame ao fim de TODA rodada real de um jogador (nunca quando ele é o Ghost)
export function updateProfile(profile, roundStats) {
  profile.history.push(roundStats);
  if (profile.history.length > 5) profile.history.shift();
  const n = profile.history.length;
  profile.rounds++;
  profile.avgScore = profile.history.reduce((a, r) => a + r.score, 0) / n;
  profile.avgCombo = profile.history.reduce((a, r) => a + r.bestCombo, 0) / n;
  profile.avgSpecials = profile.history.reduce((a, r) => a + r.specialsUsed, 0) / n;
  profile.avgAttacks = profile.history.reduce((a, r) => a + (r.attacksSent || 0), 0) / n;
  return profile;
}

// resultado determinístico (mesma seed = mesmo resultado): variação
// plausível (±18~30%) em torno da média do jogador original.
export function simulateGhost(profile, seed) {
  const rnd = mulberry32((seed >>> 0) || 1);
  const jitter = (base, spread) => Math.max(0, base * (1 + (rnd() * 2 - 1) * spread));
  return {
    score: Math.round(jitter(profile.avgScore, 0.18)),
    bestCombo: Math.max(1, Math.round(jitter(profile.avgCombo, 0.25))),
    specialsUsed: Math.max(0, Math.round(jitter(profile.avgSpecials, 0.3))),
    attacksSent: Math.max(0, Math.round(jitter(profile.avgAttacks, 0.3))),
  };
}
