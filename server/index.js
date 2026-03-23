// ============================================
// HalCraft — マルチプレイサーバー
// Express + Socket.IO
// 最大10人同時接続、ブロック変更永続化
// ============================================

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { WorldChanges } from './WorldChanges.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 設定
const PORT = process.env.PORT || 4001;
const MAX_PLAYERS = 10;
const DATA_DIR = path.join(__dirname, 'data');

// Express + Socket.IO
const app = express();
const httpServer = createServer(app);
const io = new SocketIO(httpServer, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e6,
});

// ブロック変更の永続化
const worldChanges = new WorldChanges(DATA_DIR);

// スキンカラーの候補（ランダム割り当て）
const SKIN_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#e91e63', '#00bcd4', '#8bc34a',
];

// ── API ──
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    players: connectedPlayers.size,
    maxPlayers: MAX_PLAYERS,
    uptime: process.uptime(),
  });
});

// ── プレイヤー管理 ──
const connectedPlayers = new Map();

io.on('connection', (socket) => {
  // 満員チェック
  if (connectedPlayers.size >= MAX_PLAYERS) {
    socket.emit('server:full', { message: 'サーバーが満員です（最大10人）' });
    socket.disconnect();
    return;
  }

  console.log(`[接続] ${socket.id} (${connectedPlayers.size + 1}/${MAX_PLAYERS})`);

  // プレイヤー入室
  socket.on('player:join', (data) => {
    // 名前のサニタイズ（1-8文字、HTMLタグ除去）
    const rawName = String(data.name || '').replace(/<[^>]*>/g, '').trim();
    const name = rawName.slice(0, 8) || 'ゲスト';

    // スキンカラーをランダム割り当て
    const colorIndex = Math.floor(Math.random() * SKIN_COLORS.length);

    const player = {
      id: socket.id,
      name,
      color: SKIN_COLORS[colorIndex],
      position: [8, 40, 8], // スポーン位置
      rotation: [0, 0],     // [yaw, pitch]
    };

    connectedPlayers.set(socket.id, player);

    // 既存プレイヤー一覧を送信
    socket.emit('players:list', {
      players: Array.from(connectedPlayers.values()),
      yourId: socket.id,
    });

    // 既存のブロック変更を送信
    const changes = worldChanges.getAllChanges();
    if (changes.length > 0) {
      socket.emit('world:changes', { changes });
    }

    // 他のプレイヤーに通知
    socket.broadcast.emit('player:joined', player);

    // 全員にプレイヤー数更新
    io.emit('player:count', connectedPlayers.size);

    console.log(`[参加] ${name} (${connectedPlayers.size}/${MAX_PLAYERS})`);
  });

  // プレイヤー位置更新
  socket.on('player:move', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    player.position = data.position;
    player.rotation = data.rotation;

    socket.broadcast.emit('player:moved', {
      id: socket.id,
      position: data.position,
      rotation: data.rotation,
    });
  });

  // ブロック破壊
  socket.on('block:break', (data) => {
    const { x, y, z } = data;
    worldChanges.setBlock(x, y, z, 0); // 0 = AIR
    socket.broadcast.emit('block:changed', { x, y, z, blockId: 0 });
  });

  // ブロック設置
  socket.on('block:place', (data) => {
    const { x, y, z, blockId } = data;
    worldChanges.setBlock(x, y, z, blockId);
    socket.broadcast.emit('block:changed', { x, y, z, blockId });
  });

  // ── WebRTC シグナリング（ボイスチャット用） ──

  // WebRTC オファーを特定のピアに転送
  socket.on('voice:offer', (data) => {
    const { targetId, offer } = data;
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.emit('voice:offer', { fromId: socket.id, offer });
    }
  });

  // WebRTC アンサーを特定のピアに転送
  socket.on('voice:answer', (data) => {
    const { targetId, answer } = data;
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.emit('voice:answer', { fromId: socket.id, answer });
    }
  });

  // ICE candidate を特定のピアに転送
  socket.on('voice:ice-candidate', (data) => {
    const { targetId, candidate } = data;
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.emit('voice:ice-candidate', { fromId: socket.id, candidate });
    }
  });

  // ボイスチャット参加通知（他全員に）
  socket.on('voice:joined', () => {
    socket.broadcast.emit('voice:peer-joined', { peerId: socket.id });
  });

  // ボイスチャット退出通知
  socket.on('voice:left', () => {
    socket.broadcast.emit('voice:peer-left', { peerId: socket.id });
  });

  // 発話状態の更新（名前タグのインジケーター用）
  socket.on('voice:speaking', (data) => {
    socket.broadcast.emit('voice:speaking', { id: socket.id, speaking: data.speaking });
  });

  // 切断
  socket.on('disconnect', () => {
    const player = connectedPlayers.get(socket.id);
    const name = player?.name || 'unknown';
    connectedPlayers.delete(socket.id);

    io.emit('player:left', { id: socket.id });
    io.emit('player:count', connectedPlayers.size);

    console.log(`[退出] ${name} (${connectedPlayers.size}/${MAX_PLAYERS})`);
  });
});

// ── サーバー起動 ──
worldChanges.init();

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════╗
║        HalCraft Server               ║
║   http://localhost:${PORT}               ║
║   最大プレイヤー: ${MAX_PLAYERS}人             ║
╚══════════════════════════════════════╝
  `);
});

// Graceful Shutdown
const shutdown = () => {
  console.log('\n[Server] シャットダウン中...');
  worldChanges.dispose();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
