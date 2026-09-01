// Constantes globais do jogo.
export const GAME_W = 480;
export const GAME_H = 854;

export const LANES = 3;
export const LANE_W = 124;            // distância horizontal entre faixas (px)
export const PLAYER_Y_FRAC = 0.78;    // posição vertical do jogador na tela
export const PX_PER_M = 6.5;          // escala mundo->tela

// Velocidade (m/s)
export const SPEED_START = 11;
export const SPEED_MAX = 30;
export const SPEED_ACCEL = 0.10;      // m/s por segundo

// Ações
export const JUMP_DURATION = 0.62;    // s
export const SLIDE_DURATION = 0.65;   // s
export const LANE_TWEEN = 130;        // ms da troca de faixa
export const INVULN_TIME = 1.6;       // s após colisão

export const LIVES = 3;

// Rede
export const PEER_PREFIX = 'ctrb1-';  // prefixo dos IDs no PeerServer público
export const STATE_HZ = 12;           // frequência de envio de estado
export const GRACE_AFTER_DEATH = 8;   // s que o sobrevivente continua correndo

export const ROOM_CODE_LEN = 5;
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I/L

export const COIN_VALUE = 15;         // pontos por moeda
export const SCORE_PER_M = 1.2;
