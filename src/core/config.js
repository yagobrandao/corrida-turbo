// Constantes globais do jogo.
export const GAME_W = 480;
export const GAME_H = 854;

export const LANES = 3;
export const LANE_W = 124;            // distância horizontal entre faixas (px)
export const PLAYER_Y_FRAC = 0.78;    // posição vertical do jogador na tela
export const PX_PER_M = 6.5;          // escala mundo->tela

// Velocidade (m/s). 1 m/s = 3.6 km/h no marcador do HUD.
export const SPEED_START = 21;
export const SPEED_MAX = 42;
export const SPEED_RAMP_UNTIL = 30;   // até aqui a aceleração é agressiva
export const SPEED_ACCEL_EARLY = 0.50;
export const SPEED_ACCEL_LATE = 0.12;

// Ações
export const JUMP_DURATION = 0.62;    // s
export const SLIDE_DURATION = 0.65;   // s
export const LANE_TWEEN = 120;        // ms da troca de faixa
export const INVULN_TIME = 1.6;       // s após colisão

export const LIVES = 3;

// Rede
export const PEER_PREFIX = 'ctrb1-';  // prefixo dos IDs no PeerServer público
export const STATE_HZ = 12;           // frequência de envio de estado
export const GRACE_AFTER_DEATH = 8;   // s que os sobreviventes continuam correndo
export const MAX_PLAYERS = 5;         // host + 4 convidados

export const ROOM_CODE_LEN = 5;
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I/L

export const COIN_VALUE = 15;         // pontos por moeda
export const SCORE_PER_M = 1.2;

// Dificuldade: multiplica a velocidade. Como o espaçamento dos obstáculos
// (em metros) não muda, correr mais rápido encurta o tempo de reação —
// é daí que vem a dificuldade, sem precisar de pista separada.
export const DIFFICULTIES = [
  { id: 'facil',  name: 'Fácil',   emoji: '🌱', mult: 0.80, desc: 'Para aprender os gestos' },
  { id: 'normal', name: 'Normal',  emoji: '⚡', mult: 1.00, desc: 'A corrida padrão' },
  { id: 'dificil',name: 'Difícil', emoji: '🔥', mult: 1.20, desc: 'Reflexo afiado' },
  { id: 'insano', name: 'Insano',  emoji: '💀', mult: 1.45, desc: 'Quase impossível' },
];
export const DEFAULT_DIFFICULTY = 'normal';

export function getDifficulty(id) {
  return DIFFICULTIES.find(d => d.id === id) || DIFFICULTIES[1];
}

// Cor de contorno de cada slot, para diferenciar os rivais na pista
export const SLOT_COLORS = [0x39a9f4, 0xff8b3d, 0x2fb573, 0xd45de0, 0xffd23e];
export const SLOT_NAMES = ['Jogador 1', 'Jogador 2', 'Jogador 3', 'Jogador 4', 'Jogador 5'];
