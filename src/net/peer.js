// Camada de conexão P2P via WebRTC (PeerJS).
// O PeerServer público gratuito é usado APENAS para o signaling inicial;
// depois de conectado, todo o tráfego é direto entre os dois celulares.
import Peer from 'peerjs';
import { PEER_PREFIX, ROOM_ALPHABET, ROOM_CODE_LEN } from '../core/config.js';

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

// Envolve o Peer + DataConnection e expõe uma API de eventos simples.
export class NetSession {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.role = null;      // 'host' | 'client'
    this.code = null;
    this.handlers = {};    // { tipo de msg: fn }
    this.onPeerConnected = null;
    this.onPeerLeft = null;
    this.rtt = 60;         // estimativa de latência ida-e-volta (ms)
    this._pingTimer = null;
    this._closed = false;
  }

  on(type, fn) { this.handlers[type] = fn; }

  send(obj) {
    if (this.conn && this.conn.open) {
      try { this.conn.send(obj); } catch (_) { /* conexão caiu no meio do envio */ }
    }
  }

  get connected() { return !!(this.conn && this.conn.open); }

  // ---------- HOST ----------
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
          this.code = code;
          this._listenIncoming();
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
            this._handlePeerError(err);
          }
        });
      };
      tryCreate(0);
    });
  }

  _listenIncoming() {
    this.peer.on('connection', (conn) => {
      if (this.conn && this.conn.open) {
        // Sala cheia (arquitetura pronta p/ 3-4 jogadores no futuro: aqui viraria uma lista)
        conn.on('open', () => { conn.send({ t: 'full' }); conn.close(); });
        return;
      }
      this._bindConn(conn);
    });
    this.peer.on('disconnected', () => {
      // Perdeu o signaling server: irrelevante se o P2P já está aberto,
      // mas tenta reconectar para aceitar futuros jogadores.
      if (!this._closed && this.peer && !this.peer.destroyed) {
        try { this.peer.reconnect(); } catch (_) {}
      }
    });
  }

  // ---------- CLIENT ----------
  joinRoom(code) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(); // id aleatório
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
          this._bindConn(conn, true);
          resolve();
        });
        conn.on('error', (e) => { clearTimeout(timeout); fail(e); });
      });
      peer.on('error', (err) => fail(err));
    });
  }

  _bindConn(conn, alreadyOpen = false) {
    this.conn = conn;
    const onOpen = () => {
      if (this.role === 'host') this._startPinging();
      if (this.onPeerConnected) this.onPeerConnected();
    };
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      // ping/pong interno para estimar latência
      if (msg.t === 'pi') { this.send({ t: 'po', ts: msg.ts }); return; }
      if (msg.t === 'po') {
        this.rtt = this.rtt * 0.7 + (performance.now() - msg.ts) * 0.3;
        return;
      }
      const fn = this.handlers[msg.t];
      if (fn) fn(msg);
    });
    conn.on('close', () => this._peerGone());
    conn.on('error', () => this._peerGone());
    if (alreadyOpen) onOpen(); else conn.on('open', onOpen);
  }

  _startPinging() {
    clearInterval(this._pingTimer);
    this._pingTimer = setInterval(() => {
      this.send({ t: 'pi', ts: performance.now() });
    }, 2000);
  }

  _peerGone() {
    clearInterval(this._pingTimer);
    if (this.conn) { this.conn = null; }
    if (!this._closed && this.onPeerLeft) this.onPeerLeft();
  }

  _handlePeerError(err) {
    // Erros pós-conexão; a queda da conexão em si dispara _peerGone via 'close'.
    console.warn('[net] peer error:', err.type || err);
  }

  destroy() {
    this._closed = true;
    clearInterval(this._pingTimer);
    try { if (this.conn) this.conn.close(); } catch (_) {}
    try { if (this.peer) this.peer.destroy(); } catch (_) {}
    this.conn = null;
    this.peer = null;
    this.role = null;
    this.code = null;
    this.handlers = {};
  }
}
