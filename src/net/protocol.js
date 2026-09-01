// Tipos de mensagem trocadas pelo DataChannel (JSON compacto).
// Camada de rede separada da lógica da partida: o jogo só conhece estes eventos.
export const MSG = {
  HELLO: 'h',        // client -> host: { t, name }
  WELCOME: 'w',      // host -> client: { t, name }
  READY: 'r',        // ambos: { t, v: bool }
  PING: 'pi',        // host -> client: { t, ts }
  PONG: 'po',        // client -> host: { t, ts }
  START: 's',        // host -> client: { t, seed }
  STATE: 'st',       // ambos: { t, d, ln, jy, sl, lv, co, sc, v }
  HIT: 'x',          // ambos: { t, lv }
  DEAD: 'dd',        // ambos: { t, d, sc, co }
  END: 'e',          // host -> client: { t, win, me, you }  (win: 'host'|'client'|'tie')
  AGAIN: 'a',        // ambos: pedido de revanche { t }
  LEAVE: 'l',        // ambos: saiu da sala { t }
};
