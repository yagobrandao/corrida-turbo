// Mensagens trocadas pelo DataChannel (JSON compacto).
// Camada de rede separada da lógica da partida: o jogo só conhece estes eventos.
//
// Topologia em estrela: todo mundo fala com o HOST, que é quem retransmite.
// O host nunca reencaminha uma mensagem crua — ele consolida o estado e envia
// um snapshot único, para o tráfego não crescer ao quadrado com 5 jogadores.
export const MSG = {
  HELLO:  'h',   // client -> host: { t, skin }        entrou, apresenta-se
  ROSTER: 'ro',  // host -> all:    { t, you, players } quem está na sala
  READY:  'r',   // client -> host: { t, v }
  SKIN:   'sk',  // client -> host: { t, skin }
  START:  's',   // host -> all:    { t, seed }
  STATE:  'st',  // client -> host: { t, d, ln, jy, sl, lv, co, sc }
  SNAP:   'sn',  // host -> all:    { t, p: [[slot,d,ln,jy,sl,lv,sc,dead]] }
  DEAD:   'dd',  // client -> host: { t, d, sc, co }
  END:    'e',   // host -> all:    { t, rows, win }
  AGAIN:  'a',   // client -> host: { t }
  LEAVE:  'l',   // qualquer um:    { t }
  FULL:   'f',   // host -> client: { t }               sala lotada
  PING:   'pi',
  PONG:   'po',
};

// Ordem dos campos no snapshot compacto (índices do array por jogador).
export const SNAP_FIELDS = ['slot', 'd', 'ln', 'jy', 'sl', 'lv', 'sc', 'dead'];

export function packState(slot, s) {
  return [
    slot,
    Math.round(s.d * 10) / 10,
    s.ln,
    Math.round(s.jy * 100) / 100,
    s.sl ? 1 : 0,
    s.lv,
    Math.round(s.sc),
    s.dead ? 1 : 0,
  ];
}

export function unpackState(arr) {
  return {
    slot: arr[0], d: arr[1], ln: arr[2], jy: arr[3],
    sl: arr[4], lv: arr[5], sc: arr[6], dead: !!arr[7],
  };
}
