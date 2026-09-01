// Mensagens da PLATAFORMA (sala, lobby, ciclo de partida).
//
// Topologia em estrela: todo mundo fala com o HOST, que é quem retransmite.
// Mensagens específicas de cada jogo não entram aqui — elas viajam dentro de
// MSG.GAME e são entregues ao jogo ativo pelo net/bus.js.
export const MSG = {
  HELLO:  'h',   // client -> host: { skin, name }     entrou, apresenta-se
  ROSTER: 'ro',  // host -> client: { you, players, room }
  READY:  'r',   // client -> host: { v }
  IDENT:  'id',  // client -> host: { skin, name }     trocou skin/apelido
  START:  's',   // host -> all:    { seed, game, settings, players }
  FINISH: 'f',   // host -> all:    { rows }
  AGAIN:  'a',   // client -> host
  LEAVE:  'l',
  FULL:   'x',   // host -> client: sala lotada
  KICKED: 'k',   // host -> client: sala fechada/partida encerrada
  GAME:   'g',   // dois sentidos:  { p }  payload opaco do jogo ativo
  PING:   'pi',
  PONG:   'po',
};

// Mensagens do diretório de salas públicas (net/directory.js).
// Trafegam entre um host e o peer que estiver bancando o HUB.
export const HUB = {
  REGISTER:  'hr',   // host -> hub:     { room }   também serve de heartbeat
  UNREGISTER:'hu',   // host -> hub:     { code }
  LIST:      'hl',   // browser -> hub
  ROOMS:     'hs',   // hub -> browser:  { rooms }
};
