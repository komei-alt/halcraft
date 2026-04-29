// ============================================
// マルチプレイ状態管理ストア
// リモートプレイヤーの位置・名前・色を管理
// 時間同期 + サーバーサイドモブAI
// ============================================

import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import { connectToServer, disconnectFromServer, getSocket } from '../utils/socket';
import { useWorldStore } from './useWorldStore';
import { useGameStore } from './useGameStore';
import { useMobStore } from './useMobStore';
import { usePlayerStore } from './usePlayerStore';
import {
  useVehicleStore,
  type SeatType,
  type VehicleType,
  type VehiclesSyncPayload,
} from './useVehicleStore';
import { BLOCK_IDS, type BlockId } from '../types/blocks';
import type { SkinId } from '../types/skins';
import { spawnBlockBreakEffect } from '../utils/effectTriggers';

/** リモートプレイヤーの状態 */
export interface RemotePlayer {
  id: string;
  name: string;
  color: string;
  /** スキンID（サーバー非対応時は undefined） */
  skinId?: SkinId;
  position: [number, number, number];
  rotation: [number, number]; // [yaw, pitch]
  /** 補間用の目標位置 */
  targetPosition: [number, number, number];
  targetRotation: [number, number];
  /** ボイスチャットで発話中か */
  speaking: boolean;
  /** マイクが有効か */
  micEnabled: boolean;
  /** 死亡状態 */
  isDead: boolean;
  /** 死亡開始時刻（アニメーション用、Date.now()） */
  deathTime: number;
}

interface MultiplayerState {
  /** 接続状態 */
  connected: boolean;

  /** 自分のソケットID */
  myId: string | null;

  /** 自分の名前 */
  playerName: string;

  /** リモートプレイヤー一覧 */
  remotePlayers: Map<string, RemotePlayer>;

  /** プレイヤー数 */
  playerCount: number;

  /** サーバー満員フラグ */
  serverFull: boolean;



  /** 名前を設定 */
  setPlayerName: (name: string) => void;

  /** サーバーに接続＆参加 */
  join: (name: string, stageId: string) => void;

  /** サーバーから切断 */
  leave: () => void;

  /** 自分の位置を送信 */
  sendPosition: (position: [number, number, number], rotation: [number, number]) => void;

  /** ブロック破壊を送信 */
  sendBlockBreak: (x: number, y: number, z: number) => void;

  /** ブロック設置を送信 */
  sendBlockPlace: (x: number, y: number, z: number, blockId: BlockId) => void;

  /** リモートプレイヤーの補間更新（毎フレーム） */
  interpolateRemotePlayers: (dt: number) => void;

  /** リモートプレイヤーの発話状態を更新 */
  setRemoteSpeaking: (playerId: string, speaking: boolean) => void;

  /** リモートプレイヤーのマイク状態を更新 */
  setRemoteMicStatus: (playerId: string, micEnabled: boolean) => void;

  /** モブにダメージを送信（非オーナー → オーナーへ転送） */
  sendMobDamage: (mobId: string, amount: number, knockbackX: number, knockbackZ: number) => void;

  /** プレイヤーに攻撃を送信 */
  sendPlayerAttack: (targetId: string, amount: number, knockbackX: number, knockbackZ: number) => void;

  /** ヘリコプター搭乗を送信（座席指定） */
  sendHelicopterBoard: (seat?: SeatType) => void;

  /** ヘリコプター降車を送信 */
  sendHelicopterDismount: () => void;

  /** ヘリコプター位置更新を送信 */
  sendHelicopterMove: (data: {
    x: number; y: number; z: number;
    rotationY: number; pitch: number; roll: number;
    speed: number; rotorAngle: number;
  }) => void;

  /** 共通乗り物搭乗を送信 */
  sendVehicleBoard: (type: VehicleType) => void;

  /** 共通乗り物降車を送信 */
  sendVehicleDismount: (type: VehicleType) => void;

  /** 共通乗り物位置更新を送信 */
  sendVehicleMove: (type: VehicleType, data: Record<string, number | boolean>) => void;

  /** 機関銃発射を送信 */
  sendGunFire: (pos: [number, number, number], dir: [number, number, number], side: 'left' | 'right') => void;

  /** 乗り物ガトリング発射を送信 */
  sendVehicleGunFire: (
    type: VehicleType,
    pos: [number, number, number],
    dir: [number, number, number],
    mount: 'center' | 'left' | 'right',
  ) => void;

  /** ロケット発射を送信 */
  sendRocketFire: (
    rocketId: string,
    pos: [number, number, number],
    vel: [number, number, number],
  ) => void;

  /** ロケット爆発を送信 */
  sendRocketExplode: (rocketId: string, pos: [number, number, number]) => void;

}

let lastSentPos: [number, number, number] | null = null;

export const useMultiplayerStore = create<MultiplayerState>((set, get) => ({
  connected: false,
  myId: null,
  playerName: '',
  remotePlayers: new Map(),
  playerCount: 0,
  serverFull: false,


  setPlayerName: (name) => set({ playerName: name }),

  join: (name, stageId) => {
    const socket = connectToServer();
    setupSocketListeners(socket, set, get);
    const skinId = usePlayerStore.getState().skinId;
    socket.emit('player:join', { name, skinId, stageId });
  },

  leave: () => {
    lastSentPos = null;
    disconnectFromServer();
    useGameStore.getState().setMultiplayer(false);
    set({
      connected: false,
      myId: null,
      remotePlayers: new Map(),
      playerCount: 0,
      serverFull: false,
    });
  },

  sendPosition: (position, rotation) => {
    const socket = getSocket();
    if (!socket?.connected) return;

    // 動いていない場合は送信しない
    if (lastSentPos &&
      Math.abs(position[0] - lastSentPos[0]) < 0.01 &&
      Math.abs(position[1] - lastSentPos[1]) < 0.01 &&
      Math.abs(position[2] - lastSentPos[2]) < 0.01) {
      return;
    }

    socket.emit('player:move', { position, rotation });
    lastSentPos = [...position];
  },

  sendBlockBreak: (x, y, z) => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('block:break', { x, y, z });
  },

  sendBlockPlace: (x, y, z, blockId) => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('block:place', { x, y, z, blockId });
  },

  interpolateRemotePlayers: (dt) => {
    const players = get().remotePlayers;
    if (players.size === 0) return;

    const lerpFactor = Math.min(1, dt * 10);
    let changed = false;

    for (const [, player] of players) {
      // 位置補間
      const dx = player.targetPosition[0] - player.position[0];
      const dy = player.targetPosition[1] - player.position[1];
      const dz = player.targetPosition[2] - player.position[2];

      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01 || Math.abs(dz) > 0.01) {
        player.position[0] += dx * lerpFactor;
        player.position[1] += dy * lerpFactor;
        player.position[2] += dz * lerpFactor;
        changed = true;
      }

      // 回転補間
      const dYaw = player.targetRotation[0] - player.rotation[0];
      if (Math.abs(dYaw) > 0.01) {
        // 最短回転
        const norm = ((dYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
        player.rotation[0] += norm * lerpFactor;
        changed = true;
      }
    }

    // 変更がある場合のみ新しい Map を作って再レンダリング
    if (changed) {
      set({ remotePlayers: new Map(players) });
    }
  },

  sendMobDamage: (mobId, amount, knockbackX, knockbackZ) => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('mob:damage', { mobId, amount, knockbackX, knockbackZ });
  },

  sendPlayerAttack: (targetId, amount, knockbackX, knockbackZ) => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('player:attack', { targetId, amount, knockbackX, knockbackZ });
  },

  sendHelicopterBoard: (seat?: SeatType) => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('helicopter:board', { preferredSeat: seat || undefined });
  },

  sendHelicopterDismount: () => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('helicopter:dismount');
  },

  sendHelicopterMove: (data) => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('helicopter:move', data);
  },

  sendVehicleBoard: (type) => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('vehicle:board', { type });
  },

  sendVehicleDismount: (type) => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('vehicle:dismount', { type });
  },

  sendVehicleMove: (type, data) => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('vehicle:move', { type, state: data });
  },

  sendGunFire: (pos, dir, side) => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('gun:fire', { pos, dir, side });
  },

  sendVehicleGunFire: (type, pos, dir, mount) => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('vehicle:gun-fire', { type, pos, dir, mount });
  },

  sendRocketFire: (rocketId, pos, vel) => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('rocket:fire', { rocketId, pos, vel });
  },

  sendRocketExplode: (rocketId, pos) => {
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('rocket:explode', { rocketId, pos });
  },



  setRemoteSpeaking: (playerId, speaking) => {
    const players = get().remotePlayers;
    const player = players.get(playerId);
    if (player && player.speaking !== speaking) {
      player.speaking = speaking;
      set({ remotePlayers: new Map(players) });
    }
  },

  setRemoteMicStatus: (playerId, micEnabled) => {
    const players = get().remotePlayers;
    const player = players.get(playerId);
    if (player && player.micEnabled !== micEnabled) {
      player.micEnabled = micEnabled;
      set({ remotePlayers: new Map(players) });
    }
  },
}));

/**
 * Socket.IO イベントリスナーを設定
 */
function setupSocketListeners(
  socket: Socket,
  set: (partial: Partial<MultiplayerState>) => void,
  get: () => MultiplayerState,
) {
  // 接続完了
  socket.on('connect', () => {
    set({ connected: true });
    useGameStore.getState().setMultiplayer(true);
  });

  // 切断
  socket.on('disconnect', () => {
    set({ connected: false });
    useGameStore.getState().setMultiplayer(false);
  });

  // サーバーバージョン変更検知（デプロイ後に自動リロード）
  let knownServerVersion: string | null = null;
  socket.on('server:version', (data: { version: string }) => {
    if (knownServerVersion === null) {
      // 初回接続: バージョンを記憶
      knownServerVersion = data.version;
    } else if (knownServerVersion !== data.version) {
      // バージョンが変わった → デプロイされた → UI通知
      console.log(`[Multiplayer] サーバー更新検知: ${knownServerVersion} → ${data.version}`);
      knownServerVersion = data.version;
      useGameStore.getState().showUpdateNotice();
    }
  });

  // プレイヤー一覧受信
  socket.on('players:list', (data: {
    players: Array<{ id: string; name: string; color: string; skinId?: SkinId; position: [number, number, number]; rotation: [number, number] }>;
    yourId: string;
  }) => {
    const newPlayers = new Map<string, RemotePlayer>();
    for (const p of data.players) {
      if (p.id !== data.yourId) {
        newPlayers.set(p.id, {
          ...p,
          skinId: p.skinId,
          targetPosition: [...p.position],
          targetRotation: [...p.rotation],
          speaking: false,
          micEnabled: false,
          isDead: false,
          deathTime: 0,
        });
      }
    }
    set({ myId: data.yourId, remotePlayers: newPlayers });
  });

  // 新プレイヤー参加
  socket.on('player:joined', (data: { id: string; name: string; color: string; skinId?: SkinId; position: [number, number, number]; rotation: [number, number] }) => {
    const players = new Map(get().remotePlayers);
    players.set(data.id, {
      ...data,
      skinId: data.skinId,
      targetPosition: [...data.position],
      targetRotation: [...data.rotation],
      speaking: false,
      micEnabled: false,
      isDead: false,
      deathTime: 0,
    });
    set({ remotePlayers: players });
    console.log(`[Multiplayer] ${data.name} が参加`);
  });

  // プレイヤー退出
  socket.on('player:left', (data: { id: string }) => {
    const players = new Map(get().remotePlayers);
    players.delete(data.id);
    set({ remotePlayers: players });
  });

  // プレイヤー移動
  socket.on('player:moved', (data: { id: string; position: [number, number, number]; rotation: [number, number] }) => {
    const players = get().remotePlayers;
    const player = players.get(data.id);
    if (player) {
      player.targetPosition = data.position;
      player.targetRotation = data.rotation;
    }
  });

  // ブロック変更（他プレイヤーの操作）
  socket.on('block:changed', (data: { x: number; y: number; z: number; blockId: number }) => {
    const { setBlock, breakBlock, getBlock } = useWorldStore.getState();
    if (data.blockId === 0) {
      const previousBlock = getBlock(data.x, data.y, data.z);
      if (breakBlock(data.x, data.y, data.z) && previousBlock !== BLOCK_IDS.AIR) {
        spawnBlockBreakEffect(previousBlock, data.x, data.y, data.z);
      }
    } else {
      setBlock(data.x, data.y, data.z, data.blockId as BlockId);
    }
  });

  // ワールド変更の一括適用（参加時）
  socket.on('world:changes', (data: { changes: Array<{ x: number; y: number; z: number; blockId: number }> }) => {
    const { setBlock, breakBlock } = useWorldStore.getState();
    for (const change of data.changes) {
      if (change.blockId === 0) {
        breakBlock(change.x, change.y, change.z);
      } else {
        setBlock(change.x, change.y, change.z, change.blockId as BlockId);
      }
    }
    console.log(`[Multiplayer] ${data.changes.length} 件のワールド変更を適用`);
  });

  // プレイヤー数
  socket.on('player:count', (count: number) => {
    set({ playerCount: count });
  });

  // サーバー満員
  socket.on('server:full', () => {
    set({ serverFull: true });
  });

  // ── 時間同期 ──
  socket.on('time:sync', (data: { gameTime: number; dayCount: number; isNight: boolean }) => {
    useGameStore.getState().syncTime(data.gameTime, data.dayCount, data.isNight);
  });

  // ── モブ同期（サーバーサイドAI） ──

  // サーバーからモブ状態を受信（全クライアントが受信）
  socket.on('mob:sync', (data: { mobs: Array<{
    id: string; type: string; x: number; y: number; z: number;
    rotation: number; hp: number; maxHp: number; hitTimer: number; isAlly: boolean;
  }> }) => {
    const { syncFromServer } = useMobStore.getState();
    syncFromServer(data.mobs);
  });

  // オーナーが計算した他プレイヤーへのダメージ
  socket.on('mob:take-damage', (data: { amount: number }) => {
    usePlayerStore.getState().takeDamage(data.amount);
  });

  // 他プレイヤーからの攻撃を受けた
  socket.on('player:attacked', (data: { amount: number; knockbackX: number; knockbackZ: number; attackerName: string }) => {
    usePlayerStore.getState().takeDamage(data.amount);
    console.log(`[PvP] ${data.attackerName} から ${data.amount} ダメージ！`);
  });

  // リモートプレイヤーの死亡
  socket.on('player:died', (data: { id: string }) => {
    const players = new Map(get().remotePlayers);
    const player = players.get(data.id);
    if (player && !player.isDead) {
      player.isDead = true;
      player.deathTime = Date.now();
      set({ remotePlayers: new Map(players) });
      console.log(`[Multiplayer] ${player.name} がやられた！`);
    }
  });

  // リモートプレイヤーのリスポーン
  socket.on('player:respawned', (data: { id: string }) => {
    const players = new Map(get().remotePlayers);
    const player = players.get(data.id);
    if (player) {
      player.isDead = false;
      player.deathTime = 0;
      set({ remotePlayers: new Map(players) });
      console.log(`[Multiplayer] ${player.name} が復活！`);
    }
  });

  // リモートプレイヤーのマイク状態
  socket.on('voice:mic-status', (data: { id: string; micEnabled: boolean }) => {
    get().setRemoteMicStatus(data.id, data.micEnabled);
  });

  // ── 共通乗り物同期（ヘリ / 戦車 / 飛行機） ──
  socket.on('vehicles:sync', (data: { vehicles: VehiclesSyncPayload }) => {
    useVehicleStore.getState().syncVehicles(data.vehicles, get().myId);
  });

  // ── ヘリコプター同期（3人乗り対応） ──
  socket.on('helicopter:sync', (data: {
    helicopter: {
      spawned: boolean;
      isBoarded: boolean;
      pilotId: string | null;
      pilotName: string | null;
      seats: Record<string, string | null>;
      x: number; y: number; z: number;
      rotationY: number; pitch: number; roll: number;
      speed: number; rotorAngle: number;
    };
  }) => {
    const h = data.helicopter;
    const myId = get().myId;
    const vehicleStore = useVehicleStore.getState();

    if (!h.spawned) return;

    // ヘリがまだスポーンされてなければスポーン
    if (!vehicleStore.helicopter.spawned) {
      vehicleStore.spawnHelicopter(h.x, h.y, h.z);
    }

    // 座席情報を同期
    const serverSeats = (h.seats || {}) as Record<SeatType, string | null>;
    vehicleStore.syncSeats(serverSeats);

    // 自分がどの席にいるか判定
    let mySeat: SeatType | null = null;
    for (const [seat, playerId] of Object.entries(serverSeats)) {
      if (playerId === myId) {
        mySeat = seat as SeatType;
        break;
      }
    }

    // mySeat を更新（サーバー権威）
    const currentMySeat = vehicleStore.helicopter.mySeat;
    if (mySeat !== currentMySeat) {
      vehicleStore.updateHelicopter({
        mySeat,
        isBoarded: mySeat !== null,
      });
    }

    // 自分がパイロットで操縦中なら位置更新を無視（ローカル入力で動かす）
    const isMePilot = mySeat === 'pilot';
    if (isMePilot && mySeat !== null) return;

    // 位置・回転をサーバーから反映
    const someoneBoarded = Object.values(serverSeats).some((id) => id !== null);
    vehicleStore.updateHelicopter({
      pilotId: h.pilotId,
      x: h.x,
      y: h.y,
      z: h.z,
      rotationY: h.rotationY,
      pitch: h.pitch,
      roll: h.roll,
      speed: h.speed,
      rotorAngle: h.rotorAngle,
      engineOn: someoneBoarded,
    });
  });

  // ── 機関銃発射同期 ──
  socket.on('gun:fired', (data: {
    playerId: string;
    pos: [number, number, number];
    dir: [number, number, number];
    side: 'left' | 'right';
  }) => {
    // 登録されたコールバックに通知
    for (const cb of remoteGunFireCallbacks) {
      cb(data);
    }
  });

  socket.on('vehicle:gun-fired', (data: {
    playerId: string;
    type: VehicleType;
    pos: [number, number, number];
    dir: [number, number, number];
    mount: 'center' | 'left' | 'right';
  }) => {
    for (const cb of remoteVehicleGunFireCallbacks) {
      cb(data);
    }
  });

  // ── ロケット発射・爆発同期 ──
  socket.on('rocket:fired', (data: {
    playerId: string;
    rocketId: string;
    pos: [number, number, number];
    vel: [number, number, number];
  }) => {
    for (const cb of remoteRocketFireCallbacks) {
      cb(data);
    }
  });

  socket.on('rocket:exploded', (data: {
    playerId: string;
    rocketId: string;
    pos: [number, number, number];
  }) => {
    for (const cb of remoteRocketExplodeCallbacks) {
      cb(data);
    }
  });
}

// ── リモート機関銃発射のコールバック管理 ──
export interface RemoteGunFireData {
  playerId: string;
  pos: [number, number, number];
  dir: [number, number, number];
  side: 'left' | 'right';
}

export interface RemoteVehicleGunFireData {
  playerId: string;
  type: VehicleType;
  pos: [number, number, number];
  dir: [number, number, number];
  mount: 'center' | 'left' | 'right';
}

const remoteGunFireCallbacks: Array<(data: RemoteGunFireData) => void> = [];
const remoteVehicleGunFireCallbacks: Array<(data: RemoteVehicleGunFireData) => void> = [];

/** リモートプレイヤーの機関銃発射イベントを受け取るコールバックを登録 */
export function onRemoteGunFire(cb: (data: RemoteGunFireData) => void): () => void {
  remoteGunFireCallbacks.push(cb);
  return () => {
    const idx = remoteGunFireCallbacks.indexOf(cb);
    if (idx >= 0) remoteGunFireCallbacks.splice(idx, 1);
  };
}

/** リモート乗り物のガトリング発射イベントを受け取るコールバックを登録 */
export function onRemoteVehicleGunFire(cb: (data: RemoteVehicleGunFireData) => void): () => void {
  remoteVehicleGunFireCallbacks.push(cb);
  return () => {
    const idx = remoteVehicleGunFireCallbacks.indexOf(cb);
    if (idx >= 0) remoteVehicleGunFireCallbacks.splice(idx, 1);
  };
}

// ── リモートロケット発射・爆発のコールバック管理 ──
export interface RemoteRocketFireData {
  playerId: string;
  rocketId: string;
  pos: [number, number, number];
  vel: [number, number, number];
}

export interface RemoteRocketExplodeData {
  playerId: string;
  rocketId: string;
  pos: [number, number, number];
}

const remoteRocketFireCallbacks: Array<(data: RemoteRocketFireData) => void> = [];
const remoteRocketExplodeCallbacks: Array<(data: RemoteRocketExplodeData) => void> = [];

/** リモートプレイヤーのロケット発射イベントを受け取るコールバックを登録 */
export function onRemoteRocketFire(cb: (data: RemoteRocketFireData) => void): () => void {
  remoteRocketFireCallbacks.push(cb);
  return () => {
    const idx = remoteRocketFireCallbacks.indexOf(cb);
    if (idx >= 0) remoteRocketFireCallbacks.splice(idx, 1);
  };
}

/** リモートプレイヤーのロケット爆発イベントを受け取るコールバックを登録 */
export function onRemoteRocketExplode(cb: (data: RemoteRocketExplodeData) => void): () => void {
  remoteRocketExplodeCallbacks.push(cb);
  return () => {
    const idx = remoteRocketExplodeCallbacks.indexOf(cb);
    if (idx >= 0) remoteRocketExplodeCallbacks.splice(idx, 1);
  };
}
