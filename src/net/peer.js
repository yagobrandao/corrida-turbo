// Camada de conexão P2P via WebRTC (PeerJS), em topologia estrela.
// O PeerServer público gratuito é usado APENAS para o signaling inicial;
// depois de conectado, todo o tráfego é direto entre os aparelhos.
//
// O HOST ocupa o slot 0 e mantém uma conexão com cada convidado (slots 1..N).
// Os convidados só conhecem o host — quem quiser falar com outro convidado
// passa por ele. Isso mantém N conexões em vez de N², que é o que permite
// chegar a 5 jogadores num celular sem derreter a bateria.
import Peer from 'peerjs';
import { MSG } from './protocol.js';
import { PEER_PREFIX, ROOM_ALPHABET, ROOM_CODE_LEN, MAX_PLAYERS } from '../core/config.js';

function randomCode() {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LEN; i++) {
    s += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return s;
}

export function normalizeCode(raw) {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LEN);
}

export class NetSession {
  constructor() {
    this.peer = null;
    this.role = null;        // 'host' | 'client'
    this.code = null;
    this.slot = null;        // meu slot (host = 0)
    this.conns = new Map();  // host: slot -> DataConnection
    this.hostConn = null;    // client: conexão única com o host
    this.rtt = new Map();    // slot -> ms
    this.handlers = {};
    this.onJoin = null;      // (slot) => void        host
    this.onLeave = null;     // (slot) => void        host
    this.onHostGone = null;  // () => void            client
    this._pingTimer = null;
    this._closed = false;
  }

  on(type, fn) { this.handlers[type] = fn; }

  get connected() {
    return this.role === 'host'
      ? this.conns.size > 0
      : !!(this.hostConn && this.hostConn.open);
  }

  get playerCount() {
    return this.role === 'host' ? this.conns.size + 1 : null;
  }

  // Slots ocupados, incluindo o host. Só faz sentido no host.
  occupiedSlots() {
    return [0, ...this.conns.keys()].sort((a, b) => a - b);
  }

  avgRtt() {
    if (!this.rtt.size) return 60;
    let sum = 0;
    for (const v of this.rtt.values()) sum += v;
    return sum / this.rtt.size;
  }

  // ---------------- envio ----------------

  // client -> host, ou host -> todos (conveniência)
  send(obj) {
    if (this.role === 'client') {
      this._safeSend(this.hostConn, obj);
    } else {
      this.broadcast(obj);
    }
  }

  broadcast(obj, exceptSlot = null) {
    for (const [slot, conn] of this.conns) {
      if (slot === exceptSlot) continue;
      this._safeSend(conn, obj);
    }
  }

  sendTo(slot, obj) {
    this._safeSend(this.conns.get(slot), obj);
  }

  _safeSend(conn, obj) {
    if (conn && conn.open) {
      try { conn.send(obj); } catch (_) { /* conexão caiu no meio do envio */ }
    }
  }

  // ---------------- HOST ----------------
  createRoom() {
    return new Promise((resolve, reject) => {
      const tryCreate = (attempt) => {
        const code = randomCode();
        const peer = new Peer(PEER_PREFIX + code);
        let settled = false;

        peer.on('open', () => {
          settled = true;
          this.peer = peer;
          this.role = 'host';
          this.slot = 0;
          this.code = code;
          this._listenIncoming();
          this._startPinging();
          resolve(code);
        });
        peer.on('error', (err) => {
          if (!settled && err.type === 'unavailable-id' && attempt < 5) {
            peer.destroy();
            tryCreate(attempt + 1); // código em uso, sorteia outro
          } else if (!settled) {
            settled = true;
            peer.destroy();
            reject(err);
          } else {
            console.warn('[net] peer error:', err.type || err);
          }
        });
      };
      tryCreate(0);
    });
  }

  _freeSlot() {
    for (let s = 1; s < MAX_PLAYERS; s++) {
      if (!this.conns.has(s)) return s;
    }
    return null;
  }

  _listenIncoming() {
    this.peer.on('connection', (conn) => {
      const slot = this._freeSlot();
      if (slot === null) {
        conn.on('open', () => { conn.send({ t: MSG.FULL }); setTimeout(() => conn.close(), 300); });
        return;
      }
      this.conns.set(slot, conn);
      this._bindConn(conn, slot);
    });
    this.peer.on('disconnected', () => {
      // Perdeu o signaling server. As conexões P2P já abertas continuam vivas;
      // reconecta só para conseguir aceitar novos jogadores.
      if (!this._closed && this.peer && !this.peer.destroyed) {
        try { this.peer.reconnect(); } catch (_) {}
      }
    });
  }

  // ---------------- CLIENT ----------------
  joinRoom(code) {
    return new Promise((resolve, reject) => {
      const peer = new Peer();
      let settled = false;
      const fail = (err) => { if (!settled) { settled = true; peer.destroy(); reject(err); } };

      peer.on('open', () => {
        const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
        const timeout = setTimeout(() => fail(new Error('timeout')), 12000);
        conn.on('open', () => {
          clearTimeout(timeout);
          settled = true;
          this.peer = peer;
          this.role = 'client';
          this.code = code;
          this.hostConn = conn;
          this._bindConn(conn, 0, true);
          resolve();
        });
        conn.on('error', (e) => { clearTimeout(timeout); fail(e); });
      });
      peer.on('error', (err) => fail(err));
    });
  }

  // ---------------- comum ----------------
  _bindConn(conn, slot, alreadyOpen = false) {
    const onOpen = () => {
      if (this.role === 'host' && this.onJoin) this.onJoin(slot);
    };

    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;

      // ping/pong é resolvido aqui dentro, nunca chega no jogo
      if (msg.t === MSG.PING) { this._safeSend(conn, { t: MSG.PONG, ts: msg.ts }); return; }
      if (msg.t === MSG.PONG) {
        const prev = this.rtt.get(slot) ?? 60;
        this.rtt.set(slot, prev * 0.7 + (performance.now() - msg.ts) * 0.3);
        return;
      }

      const fn = this.handlers[msg.t];
      // o host precisa saber de quem veio a mensagem
      if (fn) fn(msg, slot);
    });

    conn.on('close', () => this._connGone(slot));
    conn.on('error', () => this._connGone(slot));
    if (alreadyOpen) onOpen(); else conn.on('open', onOpen);
  }

  _connGone(slot) {
    if (this._closed) return;
    if (this.role === 'host') {
      if (!this.conns.has(slot)) return;
      this.conns.delete(slot);
      this.rtt.delete(slot);
      if (this.onLeave) this.onLeave(slot);
    } else {
      this.hostConn = null;
      if (this.onHostGone) this.onHostGone();
    }
  }

  _startPinging() {
    clearInterval(this._pingTimer);
    this._pingTimer = setInterval(() => {
      this.broadcast({ t: MSG.PING, ts: performance.now() });
    }, 2500);
  }

  // Fecha só a conexão de um convidado (host expulsando/limpando).
  dropClient(slot) {
    const conn = this.conns.get(slot);
    if (conn) { try { conn.close(); } catch (_) {} }
    this.conns.delete(slot);
    this.rtt.delete(slot);
  }

  destroy() {
    this._closed = true;
    clearInterval(this._pingTimer);
    for (const conn of this.conns.values()) {
      try { conn.close(); } catch (_) {}
    }
    if (this.hostConn) { try { this.hostConn.close(); } catch (_) {} }
    try { if (this.peer) this.peer.destroy(); } catch (_) {}
    this.conns.clear();
    this.rtt.clear();
    this.hostConn = null;
    this.peer = null;
    this.role = null;
    this.slot = null;
    this.code = null;
    this.handlers = {};
  }
}
