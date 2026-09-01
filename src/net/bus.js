// Canal de rede exclusivo do jogo ativo.
//
// Existe para que nenhum jogo precise conhecer PeerJS, DataConnection ou o
// protocolo da plataforma. O jogo recebe um `bus` e só sabe mandar payloads
// para o host ou para todos; quem cuida do transporte é a NetSession.
import { MSG } from './protocol.js';

export function makeBus(net, isHost) {
  const handlers = new Set();

  // um único ponto de entrada: a plataforma desembrulha e repassa aos jogos
  const deliver = (msg, slot) => {
    for (const h of handlers) h(msg.p, slot);
  };
  if (net) net.on(MSG.GAME, deliver);

  return {
    isHost,

    // convidado -> host (no host, entrega local imediata, para o código do
    // jogo poder tratar a própria ação pelo mesmo caminho dos convidados)
    toHost(payload) {
      if (!net) return;
      if (isHost) deliver({ p: payload }, 0);
      else net.send({ t: MSG.GAME, p: payload });
    },

    // host -> todos os convidados
    toAll(payload) {
      if (net && isHost) net.broadcast({ t: MSG.GAME, p: payload });
    },

    // host -> um convidado específico
    toSlot(slot, payload) {
      if (net && isHost) net.sendTo(slot, { t: MSG.GAME, p: payload });
    },

    on(fn) {
      handlers.add(fn);
      return () => handlers.delete(fn);
    },

    dispose() {
      handlers.clear();
      if (net) net.off(MSG.GAME);
    },

    get rtt() { return net ? net.avgRtt() : 0; },
    get online() { return !!(net && net.connected); },
  };
}

// Bus mudo, para o modo treino (um jogador só, sem rede).
export function makeOfflineBus() {
  return {
    isHost: true,
    toHost() {}, toAll() {}, toSlot() {},
    on() { return () => {}; },
    dispose() {},
    rtt: 0,
    online: false,
  };
}
