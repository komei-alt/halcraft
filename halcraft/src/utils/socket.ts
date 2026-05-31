// ============================================
// Socket.IO 接続管理
// マルチプレイサーバーとの WebSocket 接続
// ============================================

import { io, Socket } from 'socket.io-client';

/** サーバーURL（本番は Cloudflare Tunnel 経由） */
const SERVER_URL = import.meta.env.PROD
  ? 'https://halcraft-ws.rosch.jp'
  : `http://${window.location.hostname}:4001`;

/** REST API などで使うサーバーのベースURLを返す */
export function getServerUrl(): string {
  return SERVER_URL;
}

let socket: Socket | null = null;

/**
 * サーバーに接続
 */
export function connectToServer(): Socket {
  if (socket) {
    if (!socket.connected) socket.connect();
    return socket;
  }

  socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: import.meta.env.DEV ? 1800 : 1000,
    reconnectionAttempts: import.meta.env.DEV ? 3 : 10,
    timeout: import.meta.env.DEV ? 2500 : 6000,
  });

  socket.on('connect', () => {
    console.log('[Multiplayer] サーバーに接続:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Multiplayer] 切断:', reason);
  });

  // 接続エラーは useMultiplayerStore で状態表示する。ここではコンソールを汚さない。

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
