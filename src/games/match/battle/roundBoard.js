// Pomar Mágico — Batalha: tabuleiro da rodada 1v1.
//
// Independente do mapa de fases da Aventura (aqui não há objetivo nem
// limite de jogadas — só tempo), mas usa exatamente as mesmas peças e
// regras do Board. Os dois lados de uma rodada recebem a mesma forma
// (cols/rows/colors) — só a seed muda — o que garante dificuldade
// equivalente sem serem tabuleiros idênticos.
export function roundBoardLevel({ cols, rows, colors }) {
  const layout = Array.from({ length: rows }, () => '.'.repeat(cols));
  // Board.js decide fim de fase por objetivos/jogadas (regras da Aventura,
  // que não se aplicam aqui — a Batalha só termina pelo relógio da rodada).
  // `objectives: []` faria `[].every(...)` virar verdadeiro por vacuidade
  // (o tabuleiro se dava por "vencido" já na primeira troca); `moves: null`
  // vira -1 no primeiro `moves--` (0 - 1), o que soaria "sem jogadas".
  // Um objetivo de pontuação inatingível e jogadas "infinitas" mantêm o
  // board.js igual ao da Aventura, sem precisar mexer nele.
  return { cols, rows, colors, moves: Infinity, objectives: [{ type: 'score', n: Number.MAX_SAFE_INTEGER, got: 0 }], layout };
}
