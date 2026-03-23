// ============================================
// HalCraft — マルチプレイサーバー
// Express + Socket.IO
// 時間同期 + サーバーサイドモブAI
// ============================================

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { WorldChanges } from './WorldChanges.js';
import { getTerrainHeight } from './terrain.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 4001;
const MAX_PLAYERS = 10;
const DATA_DIR = path.join(__dirname, 'data');

const app = express();
const httpServer = createServer(app);
const io = new SocketIO(httpServer, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e6,
});

const worldChanges = new WorldChanges(DATA_DIR);

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

// ── モブ管理（サーバーサイドAI） ──
const MOB_GRAVITY = -20;
const MOB_HEIGHT = 1.8;
const ZOMBIE_SPEED = 2.5;
const ZOMBIE_STOP_RANGE = 1.0;
const ZOMBIE_ATTACK_RANGE = 1.5;
const ZOMBIE_ATTACK_DAMAGE = 2;
const ZOMBIE_ATTACK_COOLDOWN = 1.0;
const ZOMBIE_HP = 10;
const MAX_MOBS = 10;
const SPAWN_DISTANCE_MIN = 15;
const SPAWN_DISTANCE_MAX = 25;
const DESPAWN_DISTANCE = 40;
const SPAWN_INTERVAL = 5;

const PROTOTYPE_SPEED = 3.0;
const PROTOTYPE_FOLLOW_MIN = 4;
const PROTOTYPE_FOLLOW_MAX = 15;
const PROTOTYPE_DETECT_RANGE = 20;
const PROTOTYPE_ATTACK_RANGE = 2.5;
const PROTOTYPE_ATTACK_DAMAGE = 6;
const PROTOTYPE_ATTACK_COOLDOWN = 0.6;
const PROTOTYPE_HEIGHT = 3.6;
const PROTOTYPE_JUMP_VEL = 10;
const PROTOTYPE_HP = 50;

let mobs = [];
let nextMobId = 0;
let lastSpawnTime = 0;
let attackCooldowns = new Map(); // mobId -> cooldownTimer
let protoAttackCooldown = 0;
let lastMobUpdate = Date.now();
let wasNight = false;

function spawnMob(type, x, y, z) {
  const hp = type === 'prototype' ? PROTOTYPE_HP : ZOMBIE_HP;
  const mob = {
    id: `mob_${nextMobId++}`,
    type,
    x, y, z,
    hp,
    maxHp: hp,
    vx: 0, vy: 0, vz: 0,
    rotation: 0,
    hitTimer: 0,
    isAlly: type === 'prototype',
  };
  mobs.push(mob);
  return mob;
}

function getClosestPlayer(x, z) {
  let closest = null;
  let closestDist = Infinity;
  for (const [, player] of connectedPlayers) {
    const dx = player.position[0] - x;
    const dz = player.position[2] - z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < closestDist) {
      closestDist = dist;
      closest = player;
    }
  }
  return { player: closest, dist: closestDist };
}

function updateMobs() {
  const now = Date.now();
  const rawDt = (now - lastMobUpdate) / 1000;
  const dt = Math.min(rawDt, 0.05);
  lastMobUpdate = now;

  if (connectedPlayers.size === 0) return;

  updateServerTime();
  const isNight = serverGameTime >= 0.5;

  // 昼になったらゾンビ削除
  if (wasNight && !isNight) {
    mobs = mobs.filter((m) => m.isAlly);
  }
  wasNight = isNight;

  // 全プレイヤーの平均位置（スポーン基準用）
  let avgX = 0, avgZ = 0;
  for (const [, p] of connectedPlayers) {
    avgX += p.position[0];
    avgZ += p.position[2];
  }
  avgX /= connectedPlayers.size;
  avgZ /= connectedPlayers.size;

  // 夜間: ゾンビスポーン
  if (isNight && mobs.length < MAX_MOBS) {
    const nowSec = now / 1000;
    if (nowSec - lastSpawnTime > SPAWN_INTERVAL) {
      const angle = Math.random() * Math.PI * 2;
      const distance = SPAWN_DISTANCE_MIN + Math.random() * (SPAWN_DISTANCE_MAX - SPAWN_DISTANCE_MIN);
      const sx = avgX + Math.cos(angle) * distance;
      const sz = avgZ + Math.sin(angle) * distance;
      const sy = getTerrainHeight(Math.floor(sx), Math.floor(sz)) + 1;
      spawnMob('zombie', sx, sy, sz);
      lastSpawnTime = nowSec;
    }
  }

  // プロトタイプ: 常に1体
  const hasPrototype = mobs.some((m) => m.type === 'prototype');
  if (!hasPrototype && connectedPlayers.size > 0) {
    const angle = Math.random() * Math.PI * 2;
    const sx = avgX + Math.cos(angle) * 8;
    const sz = avgZ + Math.sin(angle) * 8;
    const sy = getTerrainHeight(Math.floor(sx), Math.floor(sz)) + 2;
    spawnMob('prototype', sx, sy, sz);
  }

  // 遠すぎるモブを削除（味方は除く）
  mobs = mobs.filter((m) => {
    if (m.isAlly) return true;
    const { dist } = getClosestPlayer(m.x, m.z);
    return dist < DESPAWN_DISTANCE;
  });

  // 攻撃クールダウン更新
  protoAttackCooldown = Math.max(0, protoAttackCooldown - dt);
  for (const [pid, cd] of attackCooldowns) {
    attackCooldowns.set(pid, Math.max(0, cd - dt));
  }

  // AI更新
  const updatedMobs = [];
  const playerDamages = new Map(); // playerId -> damage

  for (const mob of mobs) {
    const m = { ...mob };
    m.hitTimer = Math.max(0, m.hitTimer - dt);

    if (m.type === 'prototype') {
      // 味方AI: 最も近いプレイヤーについていく
      const { player: followTarget, dist: distP } = getClosestPlayer(m.x, m.z);
      if (!followTarget) { updatedMobs.push(m); continue; }

      const playerX = followTarget.position[0];
      const playerZ = followTarget.position[2];
      const dxP = playerX - m.x;
      const dzP = playerZ - m.z;

      // テレポート
      if (distP > PROTOTYPE_FOLLOW_MAX) {
        const tAngle = Math.atan2(dzP, dxP) + (Math.random() - 0.5);
        m.x = playerX - Math.cos(tAngle) * PROTOTYPE_FOLLOW_MIN;
        m.z = playerZ - Math.sin(tAngle) * PROTOTYPE_FOLLOW_MIN;
        m.y = getTerrainHeight(Math.floor(m.x), Math.floor(m.z)) + 2;
        m.vx = 0; m.vz = 0; m.vy = 0;
      }

      // ゾンビ索敵
      let targetZombie = null;
      let closestZDist = PROTOTYPE_DETECT_RANGE;
      for (const other of mobs) {
        if (other.type === 'zombie') {
          const odx = other.x - m.x;
          const odz = other.z - m.z;
          const oDist = Math.sqrt(odx * odx + odz * odz);
          if (oDist < closestZDist) {
            closestZDist = oDist;
            targetZombie = other;
          }
        }
      }

      if (targetZombie) {
        const tdx = targetZombie.x - m.x;
        const tdz = targetZombie.z - m.z;
        const tDist = Math.sqrt(tdx * tdx + tdz * tdz);
        if (tDist > 0.1) m.rotation = Math.atan2(tdx, tdz);
        if (tDist > PROTOTYPE_ATTACK_RANGE) {
          const nx = tdx / tDist;
          const nz = tdz / tDist;
          m.vx = nx * PROTOTYPE_SPEED * 2.0;
          m.vz = nz * PROTOTYPE_SPEED * 2.0;
        } else {
          m.vx = 0; m.vz = 0;
          if (protoAttackCooldown <= 0 && tDist > 0.01) {
            const kbX = tdx / tDist;
            const kbZ = tdz / tDist;
            targetZombie.hp -= PROTOTYPE_ATTACK_DAMAGE;
            targetZombie.vx = kbX * 8;
            targetZombie.vy = 5;
            targetZombie.vz = kbZ * 8;
            targetZombie.hitTimer = 0.3;
            protoAttackCooldown = PROTOTYPE_ATTACK_COOLDOWN;
          }
        }
      } else if (distP > PROTOTYPE_FOLLOW_MIN) {
        const nx = dxP / distP;
        const nz = dzP / distP;
        m.rotation = Math.atan2(dxP, dzP);
        m.vx = nx * PROTOTYPE_SPEED;
        m.vz = nz * PROTOTYPE_SPEED;
      } else {
        m.vx = 0; m.vz = 0;
        if (distP > 0.1) m.rotation = Math.atan2(dxP, dzP);
      }

      // 重力 + 簡易地面判定
      m.vy += MOB_GRAVITY * dt;
      if (m.vy < -30) m.vy = -30;
      m.y += m.vy * dt;
      const groundY = getTerrainHeight(Math.floor(m.x), Math.floor(m.z)) + 1;
      if (m.y <= groundY) {
        m.y = groundY;
        m.vy = 0;
      }
      m.x += m.vx * dt;
      m.z += m.vz * dt;

      // 落下リスポーン
      if (m.y < -20) {
        m.x = playerX + 3;
        m.z = playerZ + 3;
        m.y = getTerrainHeight(Math.floor(m.x), Math.floor(m.z)) + 2;
        m.vy = 0;
      }

      // 死亡チェック
      if (m.hp <= 0) continue;
      updatedMobs.push(m);
      continue;
    }

    // === ゾンビAI ===
    // 最も近いプレイヤーを追尾
    const { player: target, dist: distXZ } = getClosestPlayer(m.x, m.z);
    if (!target) { updatedMobs.push(m); continue; }

    const px = target.position[0];
    const pz = target.position[2];
    const py = target.position[1] - 1.6;
    const dx = px - m.x;
    const dz = pz - m.z;

    if (distXZ > ZOMBIE_STOP_RANGE) {
      m.rotation = Math.atan2(dx, dz);
      if (m.hitTimer <= 0) {
        const nx = dx / distXZ;
        const nz = dz / distXZ;
        m.vx = nx * ZOMBIE_SPEED;
        m.vz = nz * ZOMBIE_SPEED;
      }
    } else {
      m.vx = 0; m.vz = 0;
      if (distXZ > 0.1) m.rotation = Math.atan2(dx, dz);
    }

    // 重力 + 簡易地面判定
    m.vy += MOB_GRAVITY * dt;
    if (m.vy < -30) m.vy = -30;
    m.y += m.vy * dt;
    const groundY = getTerrainHeight(Math.floor(m.x), Math.floor(m.z)) + 1;
    if (m.y <= groundY) {
      m.y = groundY;
      m.vy = 0;
    }
    m.x += m.vx * dt;
    m.z += m.vz * dt;

    // ノックバック減衰
    if (m.hitTimer > 0) {
      m.vx *= 0.9;
      m.vz *= 0.9;
    }

    // プレイヤー攻撃判定
    const playerDy = m.y - py;
    const yClose = Math.abs(playerDy) < MOB_HEIGHT + 0.5;
    if (distXZ < ZOMBIE_ATTACK_RANGE && yClose) {
      const cd = attackCooldowns.get(target.id) || 0;
      if (cd <= 0) {
        const prevDmg = playerDamages.get(target.id) || 0;
        playerDamages.set(target.id, prevDmg + ZOMBIE_ATTACK_DAMAGE);
        attackCooldowns.set(target.id, ZOMBIE_ATTACK_COOLDOWN);
      }
    }

    if (m.y < -20) continue;
    if (m.hp <= 0) continue;
    updatedMobs.push(m);
  }

  mobs = updatedMobs;

  // プレイヤーへのダメージ通知
  for (const [playerId, damage] of playerDamages) {
    const targetSocket = io.sockets.sockets.get(playerId);
    if (targetSocket) {
      targetSocket.emit('mob:take-damage', { amount: damage });
    }
  }

  // 全クライアントにモブ状態を送信
  if (mobs.length > 0 || wasNight) {
    const syncData = mobs.map((m) => ({
      id: m.id, type: m.type,
      x: m.x, y: m.y, z: m.z,
      rotation: m.rotation,
      hp: m.hp, maxHp: m.maxHp,
      hitTimer: m.hitTimer,
      isAlly: m.isAlly,
    }));
    io.emit('mob:sync', { mobs: syncData });
  }
}

// 50ms間隔でモブAI更新 + 時間ブロードキャスト
let tickCounter = 0;
setInterval(() => {
  updateMobs();
  tickCounter++;
  if (tickCounter >= 20) { // 1秒ごと
    tickCounter = 0;
    io.emit('time:sync', {
      gameTime: serverGameTime,
      dayCount: serverDayCount,
      isNight: serverGameTime >= 0.5,
    });
  }
}, 50);

// ── API ──
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    players: connectedPlayers.size,
    maxPlayers: MAX_PLAYERS,
    mobs: mobs.length,
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

    socket.emit('players:list', {
      players: Array.from(connectedPlayers.values()),
      yourId: socket.id,
    });

    const changes = worldChanges.getAllChanges();
    if (changes.length > 0) {
      socket.emit('world:changes', { changes });
    }

    updateServerTime();
    socket.emit('time:sync', {
      gameTime: serverGameTime,
      dayCount: serverDayCount,
      isNight: serverGameTime >= 0.5,
    });

    socket.broadcast.emit('player:joined', player);
    io.emit('player:count', connectedPlayers.size);
    console.log(`[参加] ${name} (${connectedPlayers.size}/${MAX_PLAYERS})`);
  });

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

  socket.on('block:break', (data) => {
    const { x, y, z } = data;
    worldChanges.setBlock(x, y, z, 0);
    socket.broadcast.emit('block:changed', { x, y, z, blockId: 0 });
  });

  socket.on('block:place', (data) => {
    const { x, y, z, blockId } = data;
    worldChanges.setBlock(x, y, z, blockId);
    socket.broadcast.emit('block:changed', { x, y, z, blockId });
  });

  // モブへのダメージ（どのクライアントからでも受け付ける）
  socket.on('mob:damage', (data) => {
    const mob = mobs.find((m) => m.id === data.mobId);
    if (!mob) return;
    mob.hp -= data.amount;
    mob.vx = (data.knockbackX || 0) * 8;
    mob.vy = 5;
    mob.vz = (data.knockbackZ || 0) * 8;
    mob.hitTimer = 0.3;
  });

  // プレイヤーへの攻撃（PvP）
  socket.on('player:attack', (data) => {
    const { targetId, amount, knockbackX, knockbackZ } = data;
    const attacker = connectedPlayers.get(socket.id);
    const targetSocket = io.sockets.sockets.get(targetId);
    if (!attacker || !targetSocket) return;

    // 攻撃対象にダメージを通知
    targetSocket.emit('player:attacked', {
      amount,
      knockbackX,
      knockbackZ,
      attackerName: attacker.name,
    });
    console.log(`[PvP] ${attacker.name} → ${connectedPlayers.get(targetId)?.name || 'unknown'} (${amount}ダメージ)`);
  });

  // プレイヤー死亡通知（全プレイヤーにブロードキャスト）
  socket.on('player:died', () => {
    socket.broadcast.emit('player:died', { id: socket.id });
    const player = connectedPlayers.get(socket.id);
    console.log(`[死亡] ${player?.name || 'unknown'} がやられた`);
  });

  // プレイヤー復活通知（全プレイヤーにブロードキャスト）
  socket.on('player:respawned', () => {
    socket.broadcast.emit('player:respawned', { id: socket.id });
    const player = connectedPlayers.get(socket.id);
    console.log(`[復活] ${player?.name || 'unknown'} が復活`);
  });

  // ── WebRTC シグナリング ──
  socket.on('voice:offer', (data) => {
    const t = io.sockets.sockets.get(data.targetId);
    if (t) t.emit('voice:offer', { fromId: socket.id, offer: data.offer });
  });
  socket.on('voice:answer', (data) => {
    const t = io.sockets.sockets.get(data.targetId);
    if (t) t.emit('voice:answer', { fromId: socket.id, answer: data.answer });
  });
  socket.on('voice:ice-candidate', (data) => {
    const t = io.sockets.sockets.get(data.targetId);
    if (t) t.emit('voice:ice-candidate', { fromId: socket.id, candidate: data.candidate });
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

  socket.on('disconnect', () => {
    const player = connectedPlayers.get(socket.id);
    const name = player?.name || 'unknown';
    connectedPlayers.delete(socket.id);
    attackCooldowns.delete(socket.id);

    io.emit('player:left', { id: socket.id });
    io.emit('player:count', connectedPlayers.size);

    // 誰もいなくなったらモブクリア
    if (connectedPlayers.size === 0) {
      mobs = [];
    }

    console.log(`[退出] ${name} (${connectedPlayers.size}/${MAX_PLAYERS})`);
  });
});

worldChanges.init();

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════╗
║     HalCraft Server v2 (AI)          ║
║   http://localhost:${PORT}               ║
║   最大プレイヤー: ${MAX_PLAYERS}人             ║
║   モブAI: サーバーサイド              ║
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
