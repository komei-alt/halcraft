// ============================================
// HalCraft — マルチプレイサーバー
// Express + Socket.IO
// 時間同期 + サーバーサイドモブAI + プッシュ通知 + ステージ別管理対応
// ============================================

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import webpush from 'web-push';
import { WorldChanges } from './WorldChanges.js';
import { getTerrainHeight } from './terrain.js';
import { createErrorFingerprint, createHalcraftLogger, sanitizeRsdmPayload } from './rsdm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = fs.existsSync(path.join(__dirname, '..', 'AGENTS.md'))
  ? path.resolve(__dirname, '..')
  : __dirname;

const PORT = process.env.PORT || 4001;
const MAX_PLAYERS = 10;
const DATA_DIR = path.join(__dirname, 'data');
const rsdm = createHalcraftLogger(PROJECT_ROOT);

// サーバー起動バージョン（デプロイ検知用）
const SERVER_VERSION = Date.now().toString();

const app = express();
app.use(express.json());

// CORS（REST API用）
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function firstStackFrame(stack) {
  return String(stack || '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('at '));
}

function errorFields(error, extra = {}) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  const stack = error instanceof Error ? error.stack : undefined;
  return sanitizeRsdmPayload({
    kind: 'server_error',
    error_message: message,
    error_stack_top_frame: firstStackFrame(stack),
    error_fingerprint: createErrorFingerprint(message, stack),
    ...extra,
  });
}

function reportServerError(component, message, error, extra = {}) {
  rsdm.error(component, message, errorFields(error, extra));
}

const httpServer = createServer(app);
const io = new SocketIO(httpServer, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e6,
});
io.engine.on('connection_error', (err) => {
  reportServerError('socket.io', 'Socket.IO connection error', err, {
    kind: 'socket_connection_error',
    route: 'socket.io',
    request_context: {
      code: err.code,
      message: err.message,
      context: err.context,
    },
  });
});

const worldChanges = new WorldChanges(DATA_DIR);

// ============================================
// プッシュ通知設定
// ============================================

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BMIodx4H334etYD9e8PldzeiSnZCgUcov8DX4DNXXAyGSDu_TccUqWOo8ycnoOaO3hL_FYusMRN_4zU_OQTax6Y';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'I3gXmZ3NmOvX6FRQm5nY25QTXAivTyAWEvKdJvB50Dg';

webpush.setVapidDetails(
  'mailto:system@rosch.co.jp',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

const PUSH_SUBS_FILE = path.join(DATA_DIR, 'push-subscriptions.json');
let pushSubscriptions = [];

function loadPushSubscriptions() {
  try {
    if (fs.existsSync(PUSH_SUBS_FILE)) {
      pushSubscriptions = JSON.parse(fs.readFileSync(PUSH_SUBS_FILE, 'utf-8'));
      console.log(`[Push] ${pushSubscriptions.length} 件のサブスクリプションを読み込み`);
    }
  } catch (err) {
    console.error('[Push] サブスクリプション読み込みエラー:', err);
    pushSubscriptions = [];
  }
}

function savePushSubscriptions() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PUSH_SUBS_FILE, JSON.stringify(pushSubscriptions, null, 2));
  } catch (err) {
    console.error('[Push] サブスクリプション保存エラー:', err);
  }
}

async function sendPushToAll(payload, excludeEndpoint) {
  const targets = excludeEndpoint
    ? pushSubscriptions.filter((s) => s.endpoint !== excludeEndpoint)
    : pushSubscriptions;

  if (targets.length === 0) return;

  const staleEndpoints = [];

  await Promise.allSettled(
    targets.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          },
          JSON.stringify(payload),
        );
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleEndpoints.push(sub.endpoint);
        }
      }
    }),
  );

  if (staleEndpoints.length > 0) {
    pushSubscriptions = pushSubscriptions.filter(
      (s) => !staleEndpoints.includes(s.endpoint),
    );
    savePushSubscriptions();
    console.log(`[Push] ${staleEndpoints.length} 件の無効なサブスクリプションを削除`);
  }
}

const SKIN_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#e91e63', '#00bcd4', '#8bc34a',
];

// ============================================
// ステージ管理
// ============================================

const DAY_DURATION_SECONDS = 600;
const HELIPORT_CENTER = { x: 15, z: -12 };
const RUNWAY_CENTER = { x: 52, z: -34 };
const RUNWAY_LENGTH = 72;
const RUNWAY_WIDTH = 13;
const AIRPLANE_SPAWN = {
  x: RUNWAY_CENTER.x - Math.floor(RUNWAY_LENGTH / 2) + 8,
  z: RUNWAY_CENTER.z,
};
const TANK_SPAWN = {
  x: RUNWAY_CENTER.x - 8,
  z: RUNWAY_CENTER.z + Math.floor(RUNWAY_WIDTH / 2) + 7,
};
const SEAT_PRIORITY = ['pilot', 'gunner_left', 'gunner_right'];

// モブ定数
const MOB_GRAVITY = -20;
const MOB_HEIGHT = 1.8;
const ZOMBIE_SPEED = 2.5;
const ZOMBIE_STOP_RANGE = 1.0;
const ZOMBIE_ATTACK_RANGE = 1.5;
const ZOMBIE_ATTACK_DAMAGE = 2;
const ZOMBIE_ATTACK_COOLDOWN = 1.0;
const ZOMBIE_HP = 10;
const DARWIN_HP = 24;
const DARWIN_SPEED = 2.9;
const DARWIN_ATTACK_DAMAGE = 3;
const MAX_DARWINS = 2;
const MAX_MOBS = 20;
const SPAWN_DISTANCE_MIN = 30;
const SPAWN_DISTANCE_MAX = 45;
const DESPAWN_DISTANCE = 60;
const SPAWN_INTERVAL = 2.5;
const DARWIN_SPAWN_INTERVAL = 18;

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

function makeDefaultHeliState() {
  const x = HELIPORT_CENTER.x;
  const y = getTerrainHeight(HELIPORT_CENTER.x, HELIPORT_CENTER.z) + 2;
  const z = HELIPORT_CENTER.z;
  return {
    spawned: true,
    seats: { pilot: null, gunner_left: null, gunner_right: null },
    isBoarded: false,
    pilotId: null,
    pilotName: null,
    x,
    y,
    z,
    spawnX: x,
    spawnY: y,
    spawnZ: z,
    rotationY: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    engineOn: false,
    rotorAngle: 0,
  };
}

function makeDefaultTankState() {
  const x = TANK_SPAWN.x;
  const y = getTerrainHeight(TANK_SPAWN.x, TANK_SPAWN.z) + 1.15;
  const z = TANK_SPAWN.z;
  return {
    spawned: true,
    seats: { pilot: null },
    isBoarded: false,
    pilotId: null,
    x,
    y,
    z,
    spawnX: x,
    spawnY: y,
    spawnZ: z,
    rotationY: Math.PI / 2,
    pitch: 0,
    roll: 0,
    speed: 0,
    engineOn: false,
    turretYaw: 0,
    gunSpin: 0,
  };
}

function makeDefaultAirplaneState() {
  const x = AIRPLANE_SPAWN.x;
  const y = getTerrainHeight(AIRPLANE_SPAWN.x, AIRPLANE_SPAWN.z) + 1.8;
  const z = AIRPLANE_SPAWN.z;
  return {
    spawned: true,
    seats: { pilot: null },
    isBoarded: false,
    pilotId: null,
    x,
    y,
    z,
    spawnX: x,
    spawnY: y,
    spawnZ: z,
    rotationY: -Math.PI / 2,
    pitch: 0,
    roll: 0,
    speed: 0,
    engineOn: false,
    throttle: 0,
    airborne: false,
    propellerAngle: 0,
  };
}

function makeDefaultVehiclesState() {
  return {
    helicopter: makeDefaultHeliState(),
    tank: makeDefaultTankState(),
    airplane: makeDefaultAirplaneState(),
  };
}

class Stage {
  constructor(id) {
    this.id = id;
    this.players = new Set(); // socket.id
    this.serverGameTime = 0.0;
    this.serverDayCount = 1;
    this.lastTimeUpdate = Date.now();
    this.mobs = [];
    this.nextMobId = 0;
    this.lastSpawnTime = 0;
    this.attackCooldowns = new Map();
    this.protoAttackCooldown = 0;
    this.lastMobUpdate = Date.now();
    this.wasNight = false;
    this.lastDarwinSpawnTime = 0;
    this.vehicleStates = makeDefaultVehiclesState();
    this.helicopterState = this.vehicleStates.helicopter;
  }

  hasAnyPassenger(type = 'helicopter') {
    const vehicle = this.vehicleStates[type];
    return vehicle ? Object.values(vehicle.seats).some((id) => id !== null) : false;
  }

  syncLegacyFields() {
    this.helicopterState.pilotId = this.helicopterState.seats.pilot;
    const pilotSocketId = this.helicopterState.seats.pilot;
    const pilotPlayer = pilotSocketId ? connectedPlayers.get(pilotSocketId) : null;
    this.helicopterState.pilotName = pilotPlayer?.name || null;
    this.helicopterState.isBoarded = this.helicopterState.seats.pilot !== null;
    this.helicopterState.engineOn = this.hasAnyPassenger('helicopter');
  }

  resetHelicopterToHeliport() {
    this.vehicleStates.helicopter = makeDefaultHeliState();
    this.helicopterState = this.vehicleStates.helicopter;
  }

  removePlayerFromHelicopter(socketId) {
    let removedSeat = null;
    for (const seat of SEAT_PRIORITY) {
      if (this.helicopterState.seats[seat] === socketId) {
        this.helicopterState.seats[seat] = null;
        removedSeat = seat;
        break;
      }
    }
    if (removedSeat === null) return null;

    if (removedSeat === 'pilot') {
      this.helicopterState.speed = 0;
      if (!this.hasAnyPassenger()) {
        this.resetHelicopterToHeliport();
      } else {
        this.syncLegacyFields();
      }
    } else {
      this.syncLegacyFields();
    }
    return removedSeat;
  }

  resetSingleSeatVehicle(type) {
    if (type === 'tank') {
      this.vehicleStates.tank = makeDefaultTankState();
    } else if (type === 'airplane') {
      this.vehicleStates.airplane = makeDefaultAirplaneState();
    }
  }

  removePlayerFromVehicle(socketId, type) {
    if (type === 'helicopter') return this.removePlayerFromHelicopter(socketId);

    const vehicle = this.vehicleStates[type];
    if (!vehicle || vehicle.seats.pilot !== socketId) return null;
    this.resetSingleSeatVehicle(type);
    return 'pilot';
  }

  removePlayerFromAllVehicles(socketId) {
    const changed = [];
    for (const type of ['helicopter', 'tank', 'airplane']) {
      const removed = this.removePlayerFromVehicle(socketId, type);
      if (removed !== null) changed.push(type);
    }
    return changed;
  }

  syncVehicleLegacy(type) {
    const vehicle = this.vehicleStates[type];
    if (!vehicle) return;
    vehicle.pilotId = vehicle.seats.pilot;
    vehicle.isBoarded = vehicle.seats.pilot !== null;
    vehicle.engineOn = vehicle.seats.pilot !== null;
    if (type === 'helicopter') {
      this.helicopterState = vehicle;
      this.syncLegacyFields();
    }
  }

  updateTime() {
    const now = Date.now();
    const deltaSec = (now - this.lastTimeUpdate) / 1000;
    this.lastTimeUpdate = now;
    if (this.players.size > 0) {
      const increment = deltaSec / DAY_DURATION_SECONDS;
      this.serverGameTime += increment;
      if (this.serverGameTime >= 1.0) {
        this.serverGameTime -= 1.0;
        this.serverDayCount++;
      }
    }
  }

  spawnMob(type, x, y, z) {
    const hp = type === 'prototype' ? PROTOTYPE_HP : type === 'darwin' ? DARWIN_HP : ZOMBIE_HP;
    const mob = {
      id: `${this.id}_mob_${this.nextMobId++}`,
      type, x, y, z, hp, maxHp: hp,
      vx: 0, vy: 0, vz: 0, rotation: 0, hitTimer: 0,
      isAlly: type === 'prototype',
    };
    this.mobs.push(mob);
    return mob;
  }

  getClosestPlayer(x, z) {
    let closest = null;
    let closestDist = Infinity;
    for (const pid of this.players) {
      const player = connectedPlayers.get(pid);
      if (!player) continue;
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

  updateMobs() {
    const now = Date.now();
    const rawDt = (now - this.lastMobUpdate) / 1000;
    const dt = Math.min(rawDt, 0.05);
    this.lastMobUpdate = now;

    if (this.players.size === 0) {
      this.mobs = [];
      return;
    }

    this.updateTime();
    const isNight = this.serverGameTime >= 0.5;

    if (this.wasNight && !isNight) {
      this.mobs = this.mobs.filter((m) => m.isAlly);
    }
    this.wasNight = isNight;

    let avgX = 0, avgZ = 0;
    let validPlayers = 0;
    for (const pid of this.players) {
      const p = connectedPlayers.get(pid);
      if (p) {
        avgX += p.position[0];
        avgZ += p.position[2];
        validPlayers++;
      }
    }
    if (validPlayers > 0) {
      avgX /= validPlayers;
      avgZ /= validPlayers;
    }

    if (isNight && this.mobs.length < MAX_MOBS) {
      const nowSec = now / 1000;
      if (nowSec - this.lastSpawnTime > SPAWN_INTERVAL) {
        const angle = Math.random() * Math.PI * 2;
        const distance = SPAWN_DISTANCE_MIN + Math.random() * (SPAWN_DISTANCE_MAX - SPAWN_DISTANCE_MIN);
        const sx = avgX + Math.cos(angle) * distance;
        const sz = avgZ + Math.sin(angle) * distance;
        const sy = getTerrainHeight(Math.floor(sx), Math.floor(sz)) + 1;
        this.spawnMob('zombie', sx, sy, sz);
        this.lastSpawnTime = nowSec;
      }

      const darwinCount = this.mobs.filter((m) => m.type === 'darwin').length;
      if (darwinCount < MAX_DARWINS && nowSec - this.lastDarwinSpawnTime > DARWIN_SPAWN_INTERVAL) {
        const angle = Math.random() * Math.PI * 2;
        const distance = SPAWN_DISTANCE_MIN + 8 + Math.random() * (SPAWN_DISTANCE_MAX - SPAWN_DISTANCE_MIN);
        const sx = avgX + Math.cos(angle) * distance;
        const sz = avgZ + Math.sin(angle) * distance;
        const sy = getTerrainHeight(Math.floor(sx), Math.floor(sz)) + 1;
        this.spawnMob('darwin', sx, sy, sz);
        this.lastDarwinSpawnTime = nowSec;
      }
    }

    const hasPrototype = this.mobs.some((m) => m.type === 'prototype');
    if (!hasPrototype && validPlayers > 0) {
      const angle = Math.random() * Math.PI * 2;
      const sx = avgX + Math.cos(angle) * 8;
      const sz = avgZ + Math.sin(angle) * 8;
      const sy = getTerrainHeight(Math.floor(sx), Math.floor(sz)) + 2;
      this.spawnMob('prototype', sx, sy, sz);
    }

    this.mobs = this.mobs.filter((m) => {
      if (m.isAlly) return true;
      const { dist } = this.getClosestPlayer(m.x, m.z);
      return dist < DESPAWN_DISTANCE;
    });

    this.protoAttackCooldown = Math.max(0, this.protoAttackCooldown - dt);
    for (const [pid, cd] of this.attackCooldowns) {
      this.attackCooldowns.set(pid, Math.max(0, cd - dt));
    }

    const updatedMobs = [];
    const playerDamages = new Map();

    for (const mob of this.mobs) {
      const m = { ...mob };
      m.hitTimer = Math.max(0, m.hitTimer - dt);

      if (m.type === 'prototype') {
        const { player: followTarget, dist: distP } = this.getClosestPlayer(m.x, m.z);
        if (!followTarget) { updatedMobs.push(m); continue; }

        const playerX = followTarget.position[0];
        const playerZ = followTarget.position[2];
        const dxP = playerX - m.x;
        const dzP = playerZ - m.z;

        if (distP > PROTOTYPE_FOLLOW_MAX) {
          const tAngle = Math.atan2(dzP, dxP) + (Math.random() - 0.5);
          m.x = playerX - Math.cos(tAngle) * PROTOTYPE_FOLLOW_MIN;
          m.z = playerZ - Math.sin(tAngle) * PROTOTYPE_FOLLOW_MIN;
          m.y = getTerrainHeight(Math.floor(m.x), Math.floor(m.z)) + 2;
          m.vx = 0; m.vz = 0; m.vy = 0;
        }

        let targetZombie = null;
        let closestZDist = PROTOTYPE_DETECT_RANGE;
        for (const other of this.mobs) {
          if (!other.isAlly) {
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
            if (this.protoAttackCooldown <= 0 && tDist > 0.01) {
              const kbX = tdx / tDist;
              const kbZ = tdz / tDist;
              targetZombie.hp -= PROTOTYPE_ATTACK_DAMAGE;
              targetZombie.vx = kbX * 8;
              targetZombie.vy = 5;
              targetZombie.vz = kbZ * 8;
              targetZombie.hitTimer = 0.3;
              this.protoAttackCooldown = PROTOTYPE_ATTACK_COOLDOWN;
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

        if (m.y < -20) {
          m.x = playerX + 3;
          m.z = playerZ + 3;
          m.y = getTerrainHeight(Math.floor(m.x), Math.floor(m.z)) + 2;
          m.vy = 0;
        }

        if (m.hp <= 0) continue;
        updatedMobs.push(m);
        continue;
      }

      const { player: target, dist: distXZ } = this.getClosestPlayer(m.x, m.z);
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
          const speed = m.type === 'darwin' ? DARWIN_SPEED : ZOMBIE_SPEED;
          m.vx = nx * speed;
          m.vz = nz * speed;
        }
      } else {
        m.vx = 0; m.vz = 0;
        if (distXZ > 0.1) m.rotation = Math.atan2(dx, dz);
      }

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

      if (m.hitTimer > 0) {
        m.vx *= 0.9;
        m.vz *= 0.9;
      }

      const playerDy = m.y - py;
      const yClose = Math.abs(playerDy) < MOB_HEIGHT + 0.5;
      if (distXZ < ZOMBIE_ATTACK_RANGE && yClose) {
        const cd = this.attackCooldowns.get(target.id) || 0;
        if (cd <= 0) {
          const prevDmg = playerDamages.get(target.id) || 0;
          playerDamages.set(target.id, prevDmg + (m.type === 'darwin' ? DARWIN_ATTACK_DAMAGE : ZOMBIE_ATTACK_DAMAGE));
          this.attackCooldowns.set(target.id, ZOMBIE_ATTACK_COOLDOWN);
        }
      }

      if (m.y < -20) continue;
      if (m.hp <= 0) continue;
      updatedMobs.push(m);
    }

    this.mobs = updatedMobs;

    for (const [playerId, damage] of playerDamages) {
      const targetSocket = io.sockets.sockets.get(playerId);
      if (targetSocket) {
        targetSocket.emit('mob:take-damage', { amount: damage });
      }
    }

    if (this.mobs.length > 0 || this.wasNight) {
      const syncData = this.mobs.map((m) => ({
        id: m.id, type: m.type,
        x: m.x, y: m.y, z: m.z,
        rotation: m.rotation,
        hp: m.hp, maxHp: m.maxHp,
        hitTimer: m.hitTimer,
        isAlly: m.isAlly,
      }));
      io.to(this.id).emit('mob:sync', { mobs: syncData });
    }
  }
}

const stages = new Map();
['world-1', 'world-2', 'world-3', 'world-4', 'world-5'].forEach(id => stages.set(id, new Stage(id)));

let tickCounter = 0;
setInterval(() => {
  for (const stage of stages.values()) {
    stage.updateMobs();
  }
  tickCounter++;
  if (tickCounter >= 20) {
    tickCounter = 0;
    for (const stage of stages.values()) {
      if (stage.players.size > 0) {
        io.to(stage.id).emit('time:sync', {
          gameTime: stage.serverGameTime,
          dayCount: stage.serverDayCount,
          isNight: stage.serverGameTime >= 0.5,
        });
      }
    }
  }
}, 50);

// ============================================
// API
// ============================================

app.get('/api/health', (_req, res) => {
  const status = stages.size > 0 ? 'ok' : 'degraded';
  if (status !== 'ok') {
    rsdm.warn('health', 'HalCraft health degraded', {
      kind: 'health_check',
      route: '/api/health',
      healthUrl: 'https://halcraft-ws.rosch.jp/api/health',
      stage_count: stages.size,
    });
  }
  res.json({
    status,
    players: connectedPlayers.size,
    maxPlayers: MAX_PLAYERS,
    uptime: process.uptime(),
    pushSubscriptions: pushSubscriptions.length,
  });
});

app.get('/api/stages', (_req, res) => {
  const stageInfo = Array.from(stages.values()).map(s => ({
    id: s.id,
    playerCount: s.players.size
  }));
  res.json({ stages: stageInfo });
});

app.post('/api/telemetry/client-error', (req, res) => {
  const body = req.body || {};
  const message = String(body.message || body.errorMessage || 'Unknown client error').slice(0, 500);
  const stack = typeof body.stack === 'string' ? body.stack : undefined;
  rsdm.error('client', `Client error: ${message}`, {
    kind: 'client_error',
    route: typeof body.route === 'string' ? body.route.slice(0, 300) : undefined,
    page_url: typeof body.pageUrl === 'string' ? body.pageUrl.slice(0, 500) : undefined,
    error_message: message,
    error_stack_top_frame: firstStackFrame(stack),
    error_fingerprint: createErrorFingerprint(message, stack),
    user_agent: typeof body.userAgent === 'string' ? body.userAgent.slice(0, 300) : undefined,
    viewport: body.viewport,
    source: body.source,
  });
  res.status(202).json({ ok: true });
});

// プッシュ通知 API
app.post('/api/push/subscribe', (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'endpoint と keys (p256dh, auth) が必要です' });
  }
  const existingIdx = pushSubscriptions.findIndex((s) => s.endpoint === endpoint);
  const subscription = { endpoint, keys, createdAt: new Date().toISOString() };
  if (existingIdx >= 0) {
    pushSubscriptions[existingIdx] = subscription;
  } else {
    pushSubscriptions.push(subscription);
  }
  savePushSubscriptions();
  res.status(201).json({ ok: true });
});

app.delete('/api/push/subscribe', (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint が必要です' });
  pushSubscriptions = pushSubscriptions.filter((s) => s.endpoint !== endpoint);
  savePushSubscriptions();
  res.json({ ok: true });
});

// ============================================
// プレイヤー管理 & Socket.IO
// ============================================
const connectedPlayers = new Map();

io.on('connection', (socket) => {
  if (connectedPlayers.size >= MAX_PLAYERS) {
    socket.emit('server:full', { message: 'サーバーが満員です（最大10人）' });
    socket.disconnect();
    return;
  }

  socket.emit('server:version', { version: SERVER_VERSION });

  socket.on('error', (err) => {
    reportServerError('socket.io', 'Socket error', err, {
      kind: 'socket_error',
      route: 'socket.io',
      socket_id: socket.id,
    });
  });

  socket.on('player:join', (data) => {
    const rawName = String(data.name || '').replace(/<[^>]*>/g, '').trim();
    const name = rawName.slice(0, 8) || 'ゲスト';
    const skinId = typeof data.skinId === 'string' ? data.skinId.slice(0, 32) : undefined;
    const colorIndex = Math.floor(Math.random() * SKIN_COLORS.length);
    const stageId = data.stageId || 'world-1';

    const stage = stages.get(stageId);
    if (!stage) {
      socket.disconnect();
      return;
    }

    const player = {
      id: socket.id,
      name,
      color: SKIN_COLORS[colorIndex],
      skinId,
      position: [8, 40, 8],
      rotation: [0, 0],
      stageId,
    };

    connectedPlayers.set(socket.id, player);
    stage.players.add(socket.id);
    socket.join(stageId);

    // 同じステージにいるプレイヤーのみ取得
    const stagePlayers = Array.from(stage.players)
      .map(pid => connectedPlayers.get(pid))
      .filter(Boolean);

    socket.emit('players:list', {
      players: stagePlayers,
      yourId: socket.id,
    });

    const changes = worldChanges.getAllChanges(stageId);
    if (changes.length > 0) {
      socket.emit('world:changes', { changes });
    }

    socket.emit('time:sync', {
      gameTime: stage.serverGameTime,
      dayCount: stage.serverDayCount,
      isNight: stage.serverGameTime >= 0.5,
    });

    socket.emit('vehicles:sync', { vehicles: stage.vehicleStates });
    socket.emit('helicopter:sync', { helicopter: stage.helicopterState });

    socket.to(stageId).emit('player:joined', player);
    io.emit('player:count', connectedPlayers.size);
    console.log(`[参加] ${name} (${stageId})`);

    sendPushToAll({
      title: 'ハルクラ',
      body: `🎮 ${name} が ${stageId} に参加したよ！（${connectedPlayers.size}/${MAX_PLAYERS}人）`,
      icon: '/icon-192.png',
      url: '/',
      tag: 'player-joined',
    });
  });

  socket.on('player:move', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    player.position = data.position;
    player.rotation = data.rotation;
    socket.to(player.stageId).emit('player:moved', {
      id: socket.id,
      position: data.position,
      rotation: data.rotation,
    });
  });

  socket.on('block:break', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    const { x, y, z } = data;
    worldChanges.setBlock(player.stageId, x, y, z, 0);
    socket.to(player.stageId).emit('block:changed', { x, y, z, blockId: 0 });
  });

  socket.on('block:place', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    const { x, y, z, blockId } = data;
    worldChanges.setBlock(player.stageId, x, y, z, blockId);
    socket.to(player.stageId).emit('block:changed', { x, y, z, blockId });
  });

  socket.on('mob:damage', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    const stage = stages.get(player.stageId);
    if (!stage) return;
    const mob = stage.mobs.find((m) => m.id === data.mobId);
    if (!mob) return;
    mob.hp -= data.amount;
    mob.vx = (data.knockbackX || 0) * 8;
    mob.vy = 5;
    mob.vz = (data.knockbackZ || 0) * 8;
    mob.hitTimer = 0.3;
  });

  socket.on('player:attack', (data) => {
    const { targetId, amount, knockbackX, knockbackZ } = data;
    const attacker = connectedPlayers.get(socket.id);
    const targetSocket = io.sockets.sockets.get(targetId);
    if (!attacker || !targetSocket) return;

    targetSocket.emit('player:attacked', {
      amount,
      knockbackX,
      knockbackZ,
      attackerName: attacker.name,
    });
  });

  socket.on('helicopter:board', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    const stage = stages.get(player.stageId);
    if (!stage) return;

    const alreadySeated = Object.values(stage.helicopterState.seats).includes(socket.id);
    if (alreadySeated) return;

    const preferred = data?.preferredSeat || null;
    let assignedSeat = null;

    if (preferred && stage.helicopterState.seats[preferred] === null) {
      assignedSeat = preferred;
    } else {
      for (const seat of SEAT_PRIORITY) {
        if (stage.helicopterState.seats[seat] === null) {
          assignedSeat = seat;
          break;
        }
      }
    }

    if (assignedSeat === null) return;

    stage.helicopterState.seats[assignedSeat] = socket.id;
    stage.syncLegacyFields();
    stage.vehicleStates.helicopter = stage.helicopterState;
    io.to(player.stageId).emit('vehicles:sync', { vehicles: stage.vehicleStates });
    io.to(player.stageId).emit('helicopter:sync', { helicopter: stage.helicopterState });
  });

  socket.on('helicopter:dismount', () => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    const stage = stages.get(player.stageId);
    if (!stage) return;
    const removedSeat = stage.removePlayerFromHelicopter(socket.id);
    if (removedSeat === null) return;
    io.to(player.stageId).emit('vehicles:sync', { vehicles: stage.vehicleStates });
    io.to(player.stageId).emit('helicopter:sync', { helicopter: stage.helicopterState });
  });

  socket.on('helicopter:move', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    const stage = stages.get(player.stageId);
    if (!stage || stage.helicopterState.pilotId !== socket.id) return;
    
    stage.helicopterState.x = data.x;
    stage.helicopterState.y = data.y;
    stage.helicopterState.z = data.z;
    stage.helicopterState.rotationY = data.rotationY;
    stage.helicopterState.pitch = data.pitch;
    stage.helicopterState.roll = data.roll;
    stage.helicopterState.speed = data.speed;
    stage.helicopterState.rotorAngle = data.rotorAngle;
    stage.vehicleStates.helicopter = stage.helicopterState;
    socket.to(player.stageId).emit('vehicles:sync', { vehicles: stage.vehicleStates });
    socket.to(player.stageId).emit('helicopter:sync', { helicopter: stage.helicopterState });
  });

  socket.on('vehicle:board', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    const stage = stages.get(player.stageId);
    if (!stage) return;

    const type = data?.type;
    if (!['helicopter', 'tank', 'airplane'].includes(type)) return;
    if (stage.removePlayerFromAllVehicles(socket.id).length > 0) {
      io.to(player.stageId).emit('vehicles:sync', { vehicles: stage.vehicleStates });
    }

    if (type === 'helicopter') return;

    const vehicle = stage.vehicleStates[type];
    if (!vehicle || vehicle.seats.pilot !== null) return;
    vehicle.seats.pilot = socket.id;
    stage.syncVehicleLegacy(type);
    io.to(player.stageId).emit('vehicles:sync', { vehicles: stage.vehicleStates });
  });

  socket.on('vehicle:dismount', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    const stage = stages.get(player.stageId);
    if (!stage) return;

    const type = data?.type;
    if (!['helicopter', 'tank', 'airplane'].includes(type)) return;
    const removedSeat = stage.removePlayerFromVehicle(socket.id, type);
    if (removedSeat === null) return;
    io.to(player.stageId).emit('vehicles:sync', { vehicles: stage.vehicleStates });
    if (type === 'helicopter') {
      io.to(player.stageId).emit('helicopter:sync', { helicopter: stage.helicopterState });
    }
  });

  socket.on('vehicle:move', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    const stage = stages.get(player.stageId);
    if (!stage) return;

    const type = data?.type;
    if (!['helicopter', 'tank', 'airplane'].includes(type)) return;
    const vehicle = stage.vehicleStates[type];
    if (!vehicle || vehicle.seats.pilot !== socket.id) return;

    const state = data.state || {};
    for (const key of [
      'x', 'y', 'z', 'rotationY', 'pitch', 'roll', 'speed',
      'rotorAngle', 'turretYaw', 'gunSpin', 'throttle', 'propellerAngle',
    ]) {
      if (typeof state[key] === 'number') vehicle[key] = state[key];
    }
    if (typeof state.airborne === 'boolean') vehicle.airborne = state.airborne;

    stage.syncVehicleLegacy(type);
    socket.to(player.stageId).emit('vehicles:sync', { vehicles: stage.vehicleStates });
    if (type === 'helicopter') {
      socket.to(player.stageId).emit('helicopter:sync', { helicopter: stage.helicopterState });
    }
  });

  socket.on('vehicle:gun-fire', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    const stage = stages.get(player.stageId);
    if (!stage) return;
    const type = data?.type;
    if (!['tank', 'airplane'].includes(type)) return;
    const vehicle = stage.vehicleStates[type];
    if (!vehicle || vehicle.seats.pilot !== socket.id) return;

    socket.to(player.stageId).emit('vehicle:gun-fired', {
      playerId: socket.id,
      type,
      pos: data.pos,
      dir: data.dir,
      mount: data.mount || 'center',
    });
  });

  socket.on('gun:fire', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    socket.to(player.stageId).emit('gun:fired', {
      playerId: socket.id,
      pos: data.pos,
      dir: data.dir,
      side: data.side,
    });
  });

  socket.on('rocket:fire', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    socket.to(player.stageId).emit('rocket:fired', {
      playerId: socket.id,
      rocketId: data.rocketId,
      pos: data.pos,
      vel: data.vel,
    });
  });

  socket.on('rocket:explode', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    socket.to(player.stageId).emit('rocket:exploded', {
      playerId: socket.id,
      rocketId: data.rocketId,
      pos: data.pos,
    });
  });

  socket.on('player:died', () => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    socket.to(player.stageId).emit('player:died', { id: socket.id });
  });

  socket.on('player:respawned', () => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    socket.to(player.stageId).emit('player:respawned', { id: socket.id });
  });

  // WebRTC & VoiceChat
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
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    socket.to(player.stageId).emit('voice:peer-joined', { peerId: socket.id });
  });
  socket.on('voice:left', () => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    socket.to(player.stageId).emit('voice:peer-left', { peerId: socket.id });
  });
  socket.on('voice:speaking', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    socket.to(player.stageId).emit('voice:speaking', { id: socket.id, speaking: data.speaking });
  });
  socket.on('voice:mic-status', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    socket.to(player.stageId).emit('voice:mic-status', { id: socket.id, micEnabled: data.micEnabled });
  });

  socket.on('disconnect', () => {
    const player = connectedPlayers.get(socket.id);
    if (player) {
      const stage = stages.get(player.stageId);
      if (stage) {
        const changedVehicles = stage.removePlayerFromAllVehicles(socket.id);
        if (changedVehicles.length > 0) {
          io.to(player.stageId).emit('vehicles:sync', { vehicles: stage.vehicleStates });
        }
        if (changedVehicles.includes('helicopter')) {
          io.to(player.stageId).emit('helicopter:sync', { helicopter: stage.helicopterState });
        }
        stage.players.delete(socket.id);
        stage.attackCooldowns.delete(socket.id);
        io.to(player.stageId).emit('player:left', { id: socket.id });
      }
      connectedPlayers.delete(socket.id);
    }
    io.emit('player:count', connectedPlayers.size);
  });
});

worldChanges.init();
loadPushSubscriptions();

app.use((err, req, res, _next) => {
  reportServerError('express', 'Express request error', err, {
    kind: 'server_request_error',
    route: req.originalUrl,
    method: req.method,
  });
  res.status(500).json({ error: 'internal_server_error' });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  rsdm.event('server', 'HalCraft server started', {
    kind: 'server_lifecycle',
    route: '/api/health',
    healthUrl: 'https://halcraft-ws.rosch.jp/api/health',
    port: PORT,
    server_version: SERVER_VERSION,
  });
  console.log(`
╔══════════════════════════════════════╗
║     HalCraft Server v2 (AI)          ║
║   http://localhost:${PORT}               ║
║   最大プレイヤー: ${MAX_PLAYERS}人             ║
║   モブAI: サーバーサイド              ║
║   ステージ別管理（Roomサポート）      ║
╚══════════════════════════════════════╝
  `);
});

const shutdown = () => {
  console.log('\n[Server] シャットダウン中...');
  rsdm.event('server', 'HalCraft server shutdown', {
    kind: 'server_lifecycle',
    deploy_event: 'shutdown',
  });
  worldChanges.dispose();
  void rsdm.dispose().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (reason) => {
  reportServerError('process', 'Unhandled promise rejection', reason, {
    kind: 'unhandled_rejection',
    route: 'process',
  });
});
process.on('uncaughtException', (err) => {
  rsdm.fatal('process', 'Uncaught exception', errorFields(err, {
    kind: 'uncaught_exception',
    route: 'process',
  }));
  setTimeout(() => process.exit(1), 50);
});
