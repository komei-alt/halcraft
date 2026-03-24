// モブ（敵キャラ・味方キャラ）の状態管理ストア
// ゾンビのスポーン・AI・物理、プロトタイプ味方モブを管理

import { create } from 'zustand';

/** モブの種類 */
export type MobType = 'zombie' | 'prototype' | 'chicken' | 'spider';

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

/** モブ死亡イベント */
export interface MobDeathEvent {
  /** 死亡したモブの種類 */
  type: MobType;
  /** 死亡位置 */
  x: number;
  y: number;
  z: number;
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
/** ニワトリのHP */
const CHICKEN_HP = 4;
/** ニワトリの最大同時数 */
const MAX_CHICKENS = 6;
/** ニワトリのスポーン間隔（秒） */
const CHICKEN_SPAWN_INTERVAL = 8;
/** クモのHP */
const SPIDER_HP = 8;
/** クモの最大同時数 */
const MAX_SPIDERS = 5;

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

  /** 昼間のニワトリスポーン */
  trySpawnChicken: (playerX: number, playerZ: number, surfaceYFn: (x: number, z: number) => number) => void;

  /** 夜間のクモスポーン */
  trySpawnSpider: (playerX: number, playerZ: number, surfaceYFn: (x: number, z: number) => number) => void;

  /** 遠すぎるモブを削除 */
  despawnFarMobs: (playerX: number, playerZ: number) => void;

  /** サーバーからのモブ状態同期（非オーナー画用） */
  syncFromServer: (serverMobs: Array<{
    id: string; type: string; x: number; y: number; z: number;
    rotation: number; hp: number; maxHp: number; hitTimer: number; isAlly: boolean;
  }>) => void;

  /** 蓄積された死亡イベントを取り出す（消費） */
  consumeDeathEvents: () => MobDeathEvent[];
}

export const useMobStore = create<MobState>((set, get) => ({
  mobs: [],
  lastSpawnTime: 0,
  _lastChickenSpawnTime: 0,
  _lastSpiderSpawnTime: 0,
  _deathEvents: [] as MobDeathEvent[],

  spawnMob: (type, x, y, z) => {
    const hpMap: Record<MobType, number> = {
      zombie: ZOMBIE_HP,
      prototype: PROTOTYPE_HP,
      chicken: CHICKEN_HP,
      spider: SPIDER_HP,
    };
    const hp = hpMap[type] ?? ZOMBIE_HP;
    const mob: MobData = {
      id: `mob_${nextMobId++}`,
      type,
      x, y, z,
      hp,
      maxHp: hp,
      vx: 0, vy: 0, vz: 0,
      rotation: Math.random() * Math.PI * 2,
      hitTimer: 0,
      burnTimer: 0,
      isAlly: type === 'prototype' || type === 'chicken',
    };
    set((state) => ({
      mobs: [...state.mobs, mob],
    }));
  },

  damageMob: (id, amount, knockbackX, knockbackZ) => {
    const newDeathEvents: MobDeathEvent[] = [];
    set((state) => {
      const updatedMobs = state.mobs
        .map((m) => {
          if (m.id !== id) return m;
          const newHp = m.hp - amount;
          if (newHp <= 0) {
            // 死亡イベントを記録
            newDeathEvents.push({ type: m.type, x: m.x, y: m.y, z: m.z });
            return null;
          }
          // モブタイプごとのノックバック耐性
          const kbResistance = m.type === 'prototype' ? 0.3 : 0.7 + Math.random() * 0.3;
          const kbMultiplier = kbResistance * (4 + Math.random() * 3);
          return {
            ...m,
            hp: newHp,
            vx: knockbackX * kbMultiplier,
            vy: 2 + Math.random() * 2,
            vz: knockbackZ * kbMultiplier,
            hitTimer: 0.3,
          };
        })
        .filter((m): m is MobData => m !== null);

      // 死亡イベントをstateに蓄積（正しいZustandパターン）
      const currentDeathEvents = (state as MobState & { _deathEvents: MobDeathEvent[] })._deathEvents;
      return {
        mobs: updatedMobs,
        _deathEvents: [...currentDeathEvents, ...newDeathEvents],
      };
    });
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

  trySpawnChicken: (playerX, playerZ, surfaceYFn) => {
    const state = get();
    const chickenCount = state.mobs.filter((m) => m.type === 'chicken').length;
    if (chickenCount >= MAX_CHICKENS) return;

    const now = performance.now() / 1000;
    const lastTime = (state as MobState & { _lastChickenSpawnTime: number })._lastChickenSpawnTime;
    if (now - lastTime < CHICKEN_SPAWN_INTERVAL) return;

    const angle = Math.random() * Math.PI * 2;
    const distance = SPAWN_DISTANCE_MIN + Math.random() * (SPAWN_DISTANCE_MAX - SPAWN_DISTANCE_MIN);
    const spawnX = playerX + Math.cos(angle) * distance;
    const spawnZ = playerZ + Math.sin(angle) * distance;
    const spawnY = surfaceYFn(Math.floor(spawnX), Math.floor(spawnZ)) + 1;

    get().spawnMob('chicken', spawnX, spawnY, spawnZ);
    set({ _lastChickenSpawnTime: now } as Partial<MobState>);
  },

  trySpawnSpider: (playerX, playerZ, surfaceYFn) => {
    const state = get();
    const spiderCount = state.mobs.filter((m) => m.type === 'spider').length;
    if (spiderCount >= MAX_SPIDERS) return;

    const now = performance.now() / 1000;
    const lastTime = (state as MobState & { _lastSpiderSpawnTime: number })._lastSpiderSpawnTime;
    if (now - lastTime < SPAWN_INTERVAL) return;

    const angle = Math.random() * Math.PI * 2;
    const distance = SPAWN_DISTANCE_MIN + Math.random() * (SPAWN_DISTANCE_MAX - SPAWN_DISTANCE_MIN);
    const spawnX = playerX + Math.cos(angle) * distance;
    const spawnZ = playerZ + Math.sin(angle) * distance;
    const spawnY = surfaceYFn(Math.floor(spawnX), Math.floor(spawnZ)) + 1;

    get().spawnMob('spider', spawnX, spawnY, spawnZ);
    set({ _lastSpiderSpawnTime: now } as Partial<MobState>);
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

  syncFromServer: (serverMobs) => {
    // サーバーから受信したモブ状態で全置き換え
    const newMobs: MobData[] = serverMobs.map((sm) => ({
      id: sm.id,
      type: sm.type as MobType,
      x: sm.x,
      y: sm.y,
      z: sm.z,
      hp: sm.hp,
      maxHp: sm.maxHp,
      vx: 0,
      vy: 0,
      vz: 0,
      rotation: sm.rotation,
      hitTimer: sm.hitTimer,
      burnTimer: 0,
      isAlly: sm.isAlly,
    }));
    set({ mobs: newMobs });
  },

  consumeDeathEvents: () => {
    const state = get() as MobState & { _deathEvents: MobDeathEvent[] };
    const events = [...state._deathEvents];
    if (events.length > 0) {
      set({ _deathEvents: [] } as Partial<MobState>);
    }
    return events;
  },
}));
