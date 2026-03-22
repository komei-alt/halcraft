// モブ（敵キャラ・味方キャラ）の状態管理ストア
// ゾンビのスポーン・AI・物理、プロトタイプ味方モブを管理

import { create } from 'zustand';

/** モブの種類 */
export type MobType = 'zombie' | 'prototype';

/** モブのデータ */
export interface MobData {
  id: string;
  type: MobType;
  /** ワールド座標 */
  x: number;
  y: number;
  z: number;
  /** HP */
  hp: number;
  maxHp: number;
  /** 速度 */
  vx: number;
  vy: number;
  vz: number;
  /** 向き（Y軸回転角度） */
  rotation: number;
  /** ダメージ受けたフレーム（ノックバック用） */
  hitTimer: number;
  /** 消滅タイマー（夜明けで燃える演出用） */
  burnTimer: number;
  /** 味方フラグ */
  isAlly: boolean;
}

/** 最大同時スポーン数 */
const MAX_MOBS = 10;
/** スポーン距離（プレイヤーからの距離） */
const SPAWN_DISTANCE_MIN = 15;
const SPAWN_DISTANCE_MAX = 25;
/** 自動削除距離 */
const DESPAWN_DISTANCE = 40;
/** スポーン間隔（秒） */
const SPAWN_INTERVAL = 5;
/** ゾンビのHP */
const ZOMBIE_HP = 10;
/** プロトタイプのHP（味方は頑丈） */
const PROTOTYPE_HP = 50;
/** プロトタイプの追従距離（スポーン位置） */
const PROTOTYPE_FOLLOW_DISTANCE = 8;

let nextMobId = 0;

interface MobState {
  /** 全モブ */
  mobs: MobData[];

  /** 最後のスポーン時刻 */
  lastSpawnTime: number;

  /** モブを追加 */
  spawnMob: (type: MobType, x: number, y: number, z: number) => void;

  /** モブにダメージ */
  damageMob: (id: string, amount: number, knockbackX: number, knockbackZ: number) => void;

  /** モブを削除 */
  removeMob: (id: string) => void;

  /** 全モブを削除（夜明け） */
  clearAllMobs: () => void;

  /** モブの位置を更新 */
  updateMob: (id: string, updates: Partial<MobData>) => void;

  /** モブの一括更新（パフォーマンス用） */
  setMobs: (mobs: MobData[]) => void;

  /** 夜のスポーンロジック */
  trySpawnZombie: (playerX: number, playerZ: number, surfaceYFn: (x: number, z: number) => number) => void;

  /** プロトタイプ味方モブのスポーンロジック（常時1体） */
  trySpawnPrototype: (playerX: number, playerZ: number, surfaceYFn: (x: number, z: number) => number) => void;

  /** 遠すぎるモブを削除 */
  despawnFarMobs: (playerX: number, playerZ: number) => void;
}

export const useMobStore = create<MobState>((set, get) => ({
  mobs: [],
  lastSpawnTime: 0,

  spawnMob: (type, x, y, z) => {
    const hp = type === 'prototype' ? PROTOTYPE_HP : ZOMBIE_HP;
    const mob: MobData = {
      id: `mob_${nextMobId++}`,
      type,
      x, y, z,
      hp,
      maxHp: hp,
      vx: 0, vy: 0, vz: 0,
      rotation: 0,
      hitTimer: 0,
      burnTimer: 0,
      isAlly: type === 'prototype',
    };
    set((state) => ({
      mobs: [...state.mobs, mob],
    }));
  },

  damageMob: (id, amount, knockbackX, knockbackZ) => {
    set((state) => ({
      mobs: state.mobs
        .map((m) => {
          if (m.id !== id) return m;
          const newHp = m.hp - amount;
          if (newHp <= 0) return null;
          return {
            ...m,
            hp: newHp,
            vx: knockbackX * 8,
            vy: 5,
            vz: knockbackZ * 8,
            hitTimer: 0.3,
          };
        })
        .filter((m): m is MobData => m !== null),
    }));
  },

  removeMob: (id) => {
    set((state) => ({
      mobs: state.mobs.filter((m) => m.id !== id),
    }));
  },

  clearAllMobs: () => {
    set({ mobs: [] });
  },

  updateMob: (id, updates) => {
    set((state) => ({
      mobs: state.mobs.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    }));
  },

  setMobs: (mobs) => {
    set({ mobs });
  },

  trySpawnZombie: (playerX, playerZ, surfaceYFn) => {
    const state = get();
    if (state.mobs.length >= MAX_MOBS) return;

    const now = performance.now() / 1000;
    if (now - state.lastSpawnTime < SPAWN_INTERVAL) return;

    // ランダムな角度でスポーン位置を決定
    const angle = Math.random() * Math.PI * 2;
    const distance = SPAWN_DISTANCE_MIN + Math.random() * (SPAWN_DISTANCE_MAX - SPAWN_DISTANCE_MIN);
    const spawnX = playerX + Math.cos(angle) * distance;
    const spawnZ = playerZ + Math.sin(angle) * distance;
    const spawnY = surfaceYFn(Math.floor(spawnX), Math.floor(spawnZ)) + 1;

    get().spawnMob('zombie', spawnX, spawnY, spawnZ);
    set({ lastSpawnTime: now });
  },

  trySpawnPrototype: (playerX, playerZ, surfaceYFn) => {
    const state = get();
    // 既にプロトタイプが存在する場合はスポーンしない
    const hasPrototype = state.mobs.some((m) => m.type === 'prototype');
    if (hasPrototype) return;

    // プレイヤーの近くにスポーン
    const angle = Math.random() * Math.PI * 2;
    const spawnX = playerX + Math.cos(angle) * PROTOTYPE_FOLLOW_DISTANCE;
    const spawnZ = playerZ + Math.sin(angle) * PROTOTYPE_FOLLOW_DISTANCE;
    const spawnY = surfaceYFn(Math.floor(spawnX), Math.floor(spawnZ)) + 2;

    get().spawnMob('prototype', spawnX, spawnY, spawnZ);
  },

  despawnFarMobs: (playerX, playerZ) => {
    set((state) => ({
      mobs: state.mobs.filter((m) => {
        // 味方モブは自動削除しない（再スポーンで対応）
        if (m.isAlly) return true;
        const dx = m.x - playerX;
        const dz = m.z - playerZ;
        return Math.sqrt(dx * dx + dz * dz) < DESPAWN_DISTANCE;
      }),
    }));
  },
}));
