// Proximidade semântica 100% offline.
//
// A pontuação (0-100) nasce de quatro sinais, do mais forte ao mais fraco:
//   1. palavra exata / sinônimo            -> 100 / 95-99
//   2. relação direta (um é etiqueta do outro)             -> 78-92
//   3. etiquetas compartilhadas (Jaccard ponderado)        -> 30-88
//   4. mesma categoria sem etiquetas em comum              -> 30-45
//   5. nada em comum: parecença de escrita (typo)          -> 2-25
//
// Nenhuma chamada de rede, nenhum modelo: só o banco de etiquetas.
import { BY_WORD, BY_TAG, SYNONYMS } from './words.js';

// Etiquetas muito comuns ("comida", "animal", "objeto") só dizem a categoria;
// as raras ("juba", "forno", "trilhos") é que carregam significado. A régua é
// a frequência: quantas palavras do banco usam a etiqueta.
const GENERIC_MIN = 22;
const isGeneric = (t) => (BY_TAG.get(t)?.size || 0) >= GENERIC_MIN;

// Normaliza um palpite: minúsculas, sem acento, sem espaços duplos,
// singular ingênuo (corta o "s" final de palavras longas).
export function normalize(raw) {
  let s = String(raw || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

function singular(s) {
  if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1);
  return s;
}

// Distância de Levenshtein limitada (para typos, não para semântica).
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const m = a.length, n = b.length;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

function lookup(word) {
  return BY_WORD.get(word) || BY_WORD.get(singular(word)) || null;
}

function isSynonym(guess, secret) {
  const syns = SYNONYMS[secret];
  if (!syns) return false;
  const g = singular(guess);
  return syns.some(s => normalize(s) === guess || normalize(s) === g);
}

// score(palpite_normalizado, segredo) -> 0..100
export function score(guess, secretWord) {
  const secret = BY_WORD.get(secretWord);
  if (!secret) return 0;
  const g = guess;
  if (!g) return 0;

  if (g === secret.w || singular(g) === secret.w) return 100;
  if (isSynonym(g, secret.w)) return 97;

  const entry = lookup(g);

  // relação direta: o palpite é uma etiqueta do segredo (ou vice-versa)
  const gKey = entry ? entry.w : singular(g);
  if (secret.tags.has(gKey) || secret.tags.has(g)) return 88;
  if (entry && (entry.tags.has(secret.w))) return 84;
  // o palpite é uma etiqueta que agrupa o segredo (ex.: "fruta" p/ "banana")
  if (!entry && BY_TAG.has(gKey) && BY_TAG.get(gKey).has(secret.w)) return 80;

  if (entry) {
    // separa o que é sinal forte (etiquetas específicas em comum) do que é
    // sinal fraco (mesma categoria / etiquetas genéricas)
    let specific = 0, generic = 0;
    for (const t of entry.tags) {
      if (!secret.tags.has(t)) continue;
      if (isGeneric(t)) generic++;
      else specific++;
    }
    const sameCat = entry.cat === secret.cat;

    if (specific > 0) {
      // 1 etiqueta específica: "mesmo assunto"; 3+: "praticamente vizinhas"
      const s = 48 + Math.min(3, specific) * 12 + (sameCat ? 6 : 0) + Math.min(2, generic) * 2;
      return Math.min(90, s);
    }
    if (sameCat || generic > 0) {
      // mesmo mundo, mas nada específico em comum
      return Math.min(45, 28 + generic * 4 + (sameCat ? 6 : 0));
    }
    return 12;
  }

  // palavra desconhecida: só parecença de escrita (typo do segredo?)
  const d = editDistance(g, secret.w);
  if (d <= 1) return 93;
  if (d === 2) return 70;
  if (d === 3 && secret.w.length >= 6) return 40;
  return 4;
}

// Faixa visual da pontuação.
export function band(s) {
  if (s >= 100) return { emoji: '🎯', label: 'ACERTOU!', cls: 'hit' };
  if (s >= 95) return { emoji: '🔥🔥', label: 'QUASE LÁ', cls: 'p95' };
  if (s >= 85) return { emoji: '🔥', label: 'MUITO QUENTE', cls: 'p85' };
  if (s >= 70) return { emoji: '🟠', label: 'QUENTE', cls: 'p70' };
  if (s >= 50) return { emoji: '🟡', label: 'PERTO', cls: 'p50' };
  if (s >= 30) return { emoji: '🙂', label: 'CHEGANDO', cls: 'p30' };
  if (s >= 10) return { emoji: '🥶', label: 'LONGE', cls: 'p10' };
  return { emoji: '❄️', label: 'MUITO LONGE', cls: 'p0' };
}
