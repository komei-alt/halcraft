// ============================================
// Socket.IO 接続管理
// マルチプレイサーバーとの WebSocket 接続
// ============================================

import { io, Socket } from 'socket.io-client';

/** サーバーURL（本番は Cloudflare Tunnel 経由） */
const SERVER_URL = import.meta.env.PROD
  ? 'https://halcraft-ws.rosch.jp'
  : `http://${window.location.hostname}:4001`;

let socket: Socket | null = null;

/**
 * サーバーに接続
 */
export function connectToServer(): Socket {
  if (socket?.connected) return socket;

  socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => {
    console.log('[Multiplayer] サーバーに接続:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Multiplayer] 切断:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[Multiplayer] 接続エラー:', err.message);
  });

  return socket;
}

/**
 * 現在のソケットを取得（未接続ならnull）
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * サーバーから切断
 */
export function disconnectFromServer(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
