// Diretório de salas públicas — SEM servidor central.
//
// O problema: para listar salas públicas alguém precisa guardar a lista, e a
// arquitetura é P2P pura. A solução é eleger um dos próprios jogadores.
//
// Existe um ID fixo e conhecido no PeerServer (HUB_ID). Quem tenta usá-lo:
//   - conseguiu registrar o ID  -> vira o HUB e passa a guardar a lista;
//   - o ID já estava ocupado    -> conecta nele como cliente.
// Como o PeerServer só deixa um peer por ID, a eleição se resolve sozinha:
// dois candidatos simultâneos viram um HUB e um cliente, sem coordenação.
//
// O HUB é voluntário e efêmero. Se ele fechar o navegador, o próximo host que
// falhar ao conectar assume o posto, e as salas se reanunciam no heartbeat
// seguinte — a lista se reconstrói em poucos segundos.
//
// Limites assumidos de propósito: se ninguém estiver com o jogo aberto, não há
// diretório e a lista aparece vazia. Salas privadas nunca passam por aqui —
// elas só existem para quem tem o código. Entrar numa sala NÃO depende do HUB:
// o código e o QR continuam funcionando mesmo com o diretório fora do ar.
import Peer from 'peerjs';
import { HUB_ID } from '../core/config.js';
import { HUB } from './protocol.js';

const ENTRY_TTL = 25000;     // sala some da lista se não der sinal de vida
const HEARTBEAT = 8000;      // host reanuncia a sala nesse intervalo
const SWEEP = 5000;

// Lista de salas conhecidas. Só tem conteúdo enquanto este aparelho é o HUB.
const store = new Map();     // code -> { room, at }
const liveRooms = () => {
  const now = Date.now();
  return [...store.values()].filter(e => now - e.at <= ENTRY_TTL).map(e => e.room);
};

// ------------------------------------------------------------------
// Lado HUB: guarda a lista em memória e responde a quem perguntar.
// ------------------------------------------------------------------
function runHub(peer) {
  // usa o MESMO store do registro local: quem banca o HUB também tem uma sala
  // para anunciar, e ela precisa aparecer na lista dos outros
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [code, e] of store) {
      if (now - e.at > ENTRY_TTL) store.delete(code);
    }
  }, SWEEP);

  peer.on('connection', (conn) => {
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === HUB.REGISTER && msg.room && msg.room.code) {
        store.set(msg.room.code, { room: msg.room, at: Date.now() });
      } else if (msg.t === HUB.UNREGISTER && msg.code) {
        store.delete(msg.code);
      } else if (msg.t === HUB.LIST) {
        try { conn.send({ t: HUB.ROOMS, rooms: liveRooms() }); } catch (_) {}
      }
    });
    // uma conexão que cai não remove a sala: o TTL cuida disso, e assim uma
    // oscilação de rede não apaga a sala de quem ainda está jogando
  });

  peer.on('close', () => clearInterval(sweeper));
  return () => clearInterval(sweeper);
}

// ------------------------------------------------------------------
// Cliente do diretório: usado tanto por quem anuncia quanto por quem lista.
// ------------------------------------------------------------------
let hubPeer = null;        // se este aparelho virou o HUB
let hubStop = null;
let claiming = null;       // promessa da tentativa de virar HUB

// Tenta assumir o posto de HUB. Resolve true se conseguiu.
function tryBecomeHub() {
  if (hubPeer) return Promise.resolve(true);
  if (claiming) return claiming;
  claiming = new Promise((resolve) => {
    const peer = new Peer(HUB_ID);
    let settled = false;
    peer.on('open', () => {
      settled = true;
      hubPeer = peer;
      hubStop = runHub(peer);
      resolve(true);
    });
    peer.on('error', (err) => {
      if (settled) return;
      settled = true;
      peer.destroy();
      // 'unavailable-id' = alguém já é o HUB, o que é o caso normal
      resolve(false);
    });
    peer.on('disconnected', () => {
      if (hubPeer === peer && !peer.destroyed) {
        try { peer.reconnect(); } catch (_) {}
      }
    });
  }).finally(() => { claiming = null; });
  return claiming;
}

// Abre uma conexão curta com o HUB e executa uma troca de mensagens.
function withHub(fn, timeoutMs = 6000) {
  return new Promise((resolve) => {
    // se este aparelho É o HUB, fala direto com a estrutura local
    const peer = new Peer();
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      try { peer.destroy(); } catch (_) {}
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);

    peer.on('open', () => {
      const conn = peer.connect(HUB_ID, { reliable: true });
      conn.on('open', () => fn(conn, (v) => { clearTimeout(timer); finish(v); }));
      conn.on('error', () => { clearTimeout(timer); finish(null); });
    });
    peer.on('error', () => { clearTimeout(timer); finish(null); });
  });
}

// ------------------------------------------------------------------
// API pública
// ------------------------------------------------------------------

// Mantém uma sala pública anunciada enquanto o objeto devolvido viver.
// `getRoom()` é relido a cada heartbeat, então mudanças (jogadores entrando,
// partida começando) aparecem na lista sem precisar reanunciar na mão.
export function announceRoom(getRoom) {
  let stopped = false;
  let conn = null;
  let peer = null;
  let timer = null;

  const connect = async () => {
    if (stopped) return;
    const mine = await tryBecomeHub();
    if (stopped) return;
    if (mine) {
      // este aparelho é o HUB: registra direto, sem passar pela rede
      pushLocal();
      return;
    }
    peer = new Peer();
    peer.on('open', () => {
      if (stopped) { try { peer.destroy(); } catch (_) {} return; }
      conn = peer.connect(HUB_ID, { reliable: true });
      conn.on('open', () => push());
      conn.on('close', () => { conn = null; });
      conn.on('error', () => { conn = null; });
    });
    peer.on('error', () => { conn = null; });
  };

  const pushLocal = () => {
    // quando somos o HUB, o registro é uma conexão consigo mesmo — em vez
    // disso alimentamos a lista pela porta dos fundos
    if (!hubPeer) return;
    const room = getRoom();
    if (!room) return;
    hubSelfRegister(room);
  };

  const push = () => {
    const room = getRoom();
    if (!room) return;
    if (hubPeer) { pushLocal(); return; }
    if (conn && conn.open) {
      try { conn.send({ t: HUB.REGISTER, room }); } catch (_) {}
    }
  };

  connect();
  timer = setInterval(() => {
    if (conn || hubPeer) push();
    else connect();
  }, HEARTBEAT);

  return {
    update: push,
    stop() {
      stopped = true;
      clearInterval(timer);
      const room = getRoom();
      if (room) {
        if (hubPeer) hubSelfUnregister(room.code);
        else if (conn && conn.open) { try { conn.send({ t: HUB.UNREGISTER, code: room.code }); } catch (_) {} }
      }
      setTimeout(() => { try { if (peer) peer.destroy(); } catch (_) {} }, 400);
    },
  };
}

// Registro local quando este aparelho é o próprio HUB.
function hubSelfRegister(room) { store.set(room.code, { room, at: Date.now() }); }
function hubSelfUnregister(code) { store.delete(code); }

// Lista as salas públicas. Devolve [] se não houver diretório no ar.
export async function listRooms() {
  // somos o HUB: a lista local já é a resposta
  if (hubPeer) return liveRooms();
  const rooms = await withHub((conn, done) => {
    conn.on('data', (msg) => {
      if (msg && msg.t === HUB.ROOMS) done(msg.rooms || []);
    });
    try { conn.send({ t: HUB.LIST }); } catch (_) { done(null); }
  });
  return rooms || [];
}

export function releaseHub() {
  if (hubStop) hubStop();
  if (hubPeer) { try { hubPeer.destroy(); } catch (_) {} }
  hubPeer = null;
  hubStop = null;
  store.clear();
}
