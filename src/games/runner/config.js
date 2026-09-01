// Constantes do jogo de corrida.
export const LANES = 3;
export const LANE_W = 124;            // distância horizontal entre faixas (px)
export const PLAYER_Y_FRAC = 0.78;    // posição vertical do jogador na tela
export const PX_PER_M = 6.5;          // escala mundo->tela

// Velocidade (m/s). 1 m/s = 3.6 km/h no marcador do HUD.
// O teto é 600 km/h de verdade: o espaçamento dos obstáculos cresce junto
// com a velocidade esperada (ver track.js), então o tempo de reação se
// mantém — o que muda é a sensação de velocidade.
export const SPEED_START = 21;     //  76 km/h
export const SPEED_MAX = 167;      // 600 km/h
export const SPEED_RAMP_UNTIL = 42;
export const SPEED_ACCEL_EARLY = 1.6;  // rampa inicial: engrena em ~15s
export const SPEED_ACCEL_LATE = 1.1;   // depois sobe ~4 km/h por segundo

// Compressão visual: em vez de rolar a tela proporcionalmente à velocidade
// (a 600 km/h seria um borrão de 1000 px por frame), a escala px/metro
// encolhe suavemente com a raiz da velocidade. A tela continua acelerando
// de forma perceptível, mas o jogo permanece legível e jogável.
export const VISUAL_REF_SPEED = 30;    // m/s onde a escala é a nominal
export const VISUAL_COMPRESS = 0.45;   // expoente da compressão

// Ações
export const JUMP_DURATION = 0.62;    // s
export const SLIDE_DURATION = 0.65;   // s
export const LANE_TWEEN = 120;        // ms da troca de faixa
export const INVULN_TIME = 1.6;       // s após colisão

export const LIVES = 3;
export const GRACE_AFTER_DEATH = 8;   // s que os sobreviventes continuam correndo

export const COIN_VALUE = 15;         // pontos por moeda
export const SCORE_PER_M = 1.2;

// Dificuldade: multiplica a velocidade. Como o espaçamento dos obstáculos
// (em metros) não muda, correr mais rápido encurta o tempo de reação —
// é daí que vem a dificuldade, sem precisar de pista separada.
export const DIFFICULTIES = [
  { id: 'facil',   name: 'Fácil',   emoji: '🌱', mult: 0.80, desc: 'Para aprender os gestos' },
  { id: 'normal',  name: 'Normal',  emoji: '⚡', mult: 1.00, desc: 'A corrida padrão' },
  { id: 'dificil', name: 'Difícil', emoji: '🔥', mult: 1.20, desc: 'Reflexo afiado' },
  { id: 'insano',  name: 'Insano',  emoji: '💀', mult: 1.45, desc: 'Quase impossível' },
];
export const DEFAULT_DIFFICULTY = 'normal';

export function getDifficulty(id) {
  return DIFFICULTIES.find(d => d.id === id) || DIFFICULTIES[1];
}
