// Constantes da PLATAFORMA. Nada específico de um jogo mora aqui —
// cada jogo tem seu próprio config em src/games/<jogo>/.
export const GAME_W = 480;
export const GAME_H = 854;

// Rede
export const PEER_PREFIX = 'ctrb1-';   // prefixo dos IDs no PeerServer público
export const HUB_ID = 'ctrb1-HUB-v1';  // diretório de salas públicas (ver net/directory.js)
export const MAX_PLAYERS = 4;          // teto da plataforma; cada jogo pode pedir menos
export const STATE_HZ = 12;            // frequência padrão de sincronização

export const ROOM_CODE_LEN = 5;
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I/L

// Cor de cada slot: é o que garante que dois jogadores nunca fiquem iguais.
export const SLOT_COLORS = [0x39a9f4, 0xff8b3d, 0x2fb573, 0xd45de0];
export const SLOT_HEX = SLOT_COLORS.map(c => '#' + c.toString(16).padStart(6, '0'));
export const SLOT_NAMES = ['Jogador 1', 'Jogador 2', 'Jogador 3', 'Jogador 4'];

export const slotColor = (slot) => SLOT_COLORS[slot % SLOT_COLORS.length];
export const slotHex = (slot) => SLOT_HEX[slot % SLOT_HEX.length];
export const slotName = (slot) => SLOT_NAMES[slot] || `Jogador ${slot + 1}`;
