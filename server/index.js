// ============================================
// HalCraft — マルチプレイサーバー
// Express + Socket.IO
// 最大10人同時接続、ブロック変更永続化
// 時間同期 + 全モブ同期（味方+敵）
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

// ── 時間同期 ──
const DAY_DURATION_SECONDS = 600;
let serverGameTime = 0.0;
let serverDayCount = 1;
let lastTimeUpdate = Date.now();

function updateServerTime() {
  const now = Date.now();
  const deltaSec = (now - lastTimeUpdate) / 1000;
  lastTimeUpdate = now;

  const increment = deltaSec / DAY_DURATION_SECONDS;
  serverGameTime += increment;
  if (serverGameTime >= 1.0) {
    serverGameTime -= 1.0;
    serverDayCount++;
  }
}

// 50ms間隔で時間更新、1秒ごとにブロードキャスト
let timeTickCounter = 0;
setInterval(() => {
  updateServerTime();
  timeTickCounter++;
  if (timeTickCounter >= 20) {
    timeTickCounter = 0;
    io.emit('time:sync', {
      gameTime: serverGameTime,
      dayCount: serverDayCount,
      isNight: serverGameTime >= 0.5,
    });
  }
}, 50);

// ── モブ同期 ──
// オーナー方式: 最古参プレイヤーが全モブのAI/物理を計算
// 他クライアントはオーナーが送信する位置を受信して表示のみ
let mobOwnerId = null;

function getMobOwner() {
  if (connectedPlayers.size === 0) return null;
  return connectedPlayers.keys().next().value;
}

function assignMobOwner() {
  const newOwner = getMobOwner();
  if (newOwner === mobOwnerId) return; // 変化なし

  mobOwnerId = newOwner;
  if (!mobOwnerId) return;

  const ownerSocket = io.sockets.sockets.get(mobOwnerId);
  if (ownerSocket) {
    ownerSocket.emit('mob:you-are-owner');
    console.log(`[モブ同期] オーナー変更: ${mobOwnerId}`);
  }

  // 他のクライアントにはオーナーでないことを通知
  for (const [id] of connectedPlayers) {
    if (id !== mobOwnerId) {
      const s = io.sockets.sockets.get(id);
      if (s) s.emit('mob:not-owner');
    }
  }
}

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
  if (connectedPlayers.size >= MAX_PLAYERS) {
    socket.emit('server:full', { message: 'サーバーが満員です（最大10人）' });
    socket.disconnect();
    return;
  }

  console.log(`[接続] ${socket.id} (${connectedPlayers.size + 1}/${MAX_PLAYERS})`);

  // プレイヤー入室
  socket.on('player:join', (data) => {
    const rawName = String(data.name || '').replace(/<[^>]*>/g, '').trim();
    const name = rawName.slice(0, 8) || 'ゲスト';
    const colorIndex = Math.floor(Math.random() * SKIN_COLORS.length);

    const player = {
      id: socket.id,
      name,
      color: SKIN_COLORS[colorIndex],
      position: [8, 40, 8],
      rotation: [0, 0],
    };

    connectedPlayers.set(socket.id, player);

    // 既存プレイヤー一覧を送信
    socket.emit('players:list', {
      players: Array.from(connectedPlayers.values()),
      yourId: socket.id,
    });

    // ブロック変更を送信
    const changes = worldChanges.getAllChanges();
    if (changes.length > 0) {
      socket.emit('world:changes', { changes });
    }

    // 時間同期
    updateServerTime();
    socket.emit('time:sync', {
      gameTime: serverGameTime,
      dayCount: serverDayCount,
      isNight: serverGameTime >= 0.5,
    });

    // 他プレイヤーに通知
    socket.broadcast.emit('player:joined', player);
    io.emit('player:count', connectedPlayers.size);

    // モブオーナー割り当て
    assignMobOwner();

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
    worldChanges.setBlock(x, y, z, 0);
    socket.broadcast.emit('block:changed', { x, y, z, blockId: 0 });
  });

  // ブロック設置
  socket.on('block:place', (data) => {
    const { x, y, z, blockId } = data;
    worldChanges.setBlock(x, y, z, blockId);
    socket.broadcast.emit('block:changed', { x, y, z, blockId });
  });

  // ── モブ同期 ──

  // オーナーが全モブの状態を一括送信（100ms間隔想定）
  socket.on('mob:sync', (data) => {
    // オーナーからのみ受け付ける
    if (socket.id !== mobOwnerId) return;
    // 全モブの状態を他のクライアントにブロードキャスト
    // data.mobs: [{ id, type, x, y, z, rotation, hp, maxHp, hitTimer, isAlly, vx, vy, vz }]
    socket.broadcast.emit('mob:sync', { mobs: data.mobs });
  });

  // 非オーナーがモブにダメージを与えた場合、オーナーに通知
  socket.on('mob:damage', (data) => {
    if (!mobOwnerId || socket.id === mobOwnerId) return;
    const ownerSocket = io.sockets.sockets.get(mobOwnerId);
    if (ownerSocket) {
      ownerSocket.emit('mob:damage', {
        mobId: data.mobId,
        amount: data.amount,
        knockbackX: data.knockbackX,
        knockbackZ: data.knockbackZ,
        attackerId: socket.id,
      });
    }
  });

  // 非オーナーのプレイヤーがゾンビに攻撃された（ダメージ判定はオーナーが行う）
  // オーナーが他プレイヤーへのダメージを通知
  socket.on('mob:player-damage', (data) => {
    if (socket.id !== mobOwnerId) return;
    const targetSocket = io.sockets.sockets.get(data.targetPlayerId);
    if (targetSocket) {
      targetSocket.emit('mob:take-damage', {
        amount: data.amount,
      });
    }
  });

  // ── WebRTC シグナリング ──

  socket.on('voice:offer', (data) => {
    const targetSocket = io.sockets.sockets.get(data.targetId);
    if (targetSocket) {
      targetSocket.emit('voice:offer', { fromId: socket.id, offer: data.offer });
    }
  });

  socket.on('voice:answer', (data) => {
    const targetSocket = io.sockets.sockets.get(data.targetId);
    if (targetSocket) {
      targetSocket.emit('voice:answer', { fromId: socket.id, answer: data.answer });
    }
  });

  socket.on('voice:ice-candidate', (data) => {
    const targetSocket = io.sockets.sockets.get(data.targetId);
    if (targetSocket) {
      targetSocket.emit('voice:ice-candidate', { fromId: socket.id, candidate: data.candidate });
    }
  });

  socket.on('voice:joined', () => {
    socket.broadcast.emit('voice:peer-joined', { peerId: socket.id });
  });

  socket.on('voice:left', () => {
    socket.broadcast.emit('voice:peer-left', { peerId: socket.id });
  });

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

    // オーナーが切断 → 再割り当て
    if (socket.id === mobOwnerId) {
      mobOwnerId = null;
      if (connectedPlayers.size > 0) {
        assignMobOwner();
      }
    }

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

const shutdown = () => {
  console.log('\n[Server] シャットダウン中...');
  worldChanges.dispose();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
