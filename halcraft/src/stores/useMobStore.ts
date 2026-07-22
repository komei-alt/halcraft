// モブ（敵キャラ・味方キャラ）の状態管理ストア
// ゾンビ・クモ（敵）、プロトタイプ・アイアンゴーレム（味方）、ニワトリ（中立）を管理

import { create } from 'zustand';
import type { StageEnemyTuning } from '../types/stages';
import { getStageEnemyAccent, getStageEnemyModifier, type StageEnemyRole } from '../types/stageEnemyProfiles';
import type { BlockId } from '../types/blocks';
import {
  getStageBossEncounter,
  type StageBossEncounterId,
  type StageBossSummonType,
} from '../types/stageBossEncounters';

/** モブの種類 */
export type MobType = 'zombie' | 'darwin' | 'prototype' | 'chicken' | 'spider' | 'iron_golem' | 'boss_giant';

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
  /** フレンドリーファイヤーで怒り状態（プレイヤーを攻撃する） */
  angryAtPlayer: boolean;
  /** 怒り状態の残り時間（秒） */
  angryTimer: number;
  /** ステージ敵編成による速度補正 */
  speedMultiplier?: number;
  /** ステージ敵編成による攻撃補正 */
  attackMultiplier?: number;
  /** ステージ敵編成によるXP補正 */
  xpMultiplier?: number;
  /** ステージ敵編成の追加ドロップ */
  bonusDropBlockId?: BlockId;
  /** 追加ドロップ確率 */
  bonusDropChance?: number;
  /** 敵編成ラベル */
  traitLabel?: string;
  /** 敵編成のアクセント色 */
  traitAccent?: string;
  /** マップ別ボス定義ID */
  bossEncounterId?: StageBossEncounterId;
  /** ボスが召喚する取り巻き */
  bossSummonType?: StageBossSummonType;
  /** ボス召喚の表示名 */
  bossSummonLabel?: string;
  /** ボス召喚の最短間隔 */
  bossSummonMinSeconds?: number;
  /** ボス召喚の最長間隔 */
  bossSummonMaxSeconds?: number;
}

/** モブ死亡イベント */
export interface MobDeathEvent {
  /** 死亡したモブの種類 */
  type: MobType;
  /** 死亡位置 */
  x: number;
  y: number;
  z: number;
  /** ステージ敵編成によるXP補正 */
  xpMultiplier?: number;
  /** ステージ敵編成の追加ドロップ */
  bonusDropBlockId?: BlockId;
  /** 追加ドロップ確率 */
  bonusDropChance?: number;
  /** 敵編成ラベル */
  traitLabel?: string;
  /** 敵編成のアクセント色 */
  traitAccent?: string;
  /** マップ別ボス定義ID */
  bossEncounterId?: StageBossEncounterId;
}

/** 最大同時スポーン数 */
const MAX_MOBS = 20;
/** スポーン距離（プレイヤーからの距離） — 遠くからワラワラ寄ってくる演出 */
const SPAWN_DISTANCE_MIN = 30;
const SPAWN_DISTANCE_MAX = 45;
/** 自動削除距離 */
const DESPAWN_DISTANCE = 60;
/** スポーン間隔（秒） */
const SPAWN_INTERVAL = 2.5;
/** ゾンビのHP */
const ZOMBIE_HP = 10;
/** ダーウィンのHP（夜に出る強めの敵） */
const DARWIN_HP = 24;
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
/** ダーウィンの最大同時数 */
const MAX_DARWINS = 2;
/** ダーウィンのスポーン間隔（秒） */
const DARWIN_SPAWN_INTERVAL = 18;
/** アイアンゴーレムのHP（頑丈な味方） */
const IRON_GOLEM_HP = 40;
/** ボスジャイアントのHP */
const BOSS_GIANT_HP = 500;
/** フレンドリーファイヤー後の怒り持続時間（秒） */
const ANGRY_DURATION = 30;

let nextMobId = 0;

function countHostileMobs(mobs: MobData[]): number {
  return mobs.filter((m) => !m.isAlly && m.type !== 'boss_giant').length;
}

function getSpawnDistance(tuning?: StageEnemyTuning): number {
  const min = tuning?.spawnDistanceMin ?? SPAWN_DISTANCE_MIN;
  const max = tuning?.spawnDistanceMax ?? SPAWN_DISTANCE_MAX;
  return min + Math.random() * (max - min);
}

function getEnemyRole(type: MobType): StageEnemyRole | null {
  if (type === 'zombie') return 'zombie';
  if (type === 'spider') return 'spider';
  if (type === 'darwin') return 'darwin';
  return null;
}

interface EnemySpawnData {
  hpMultiplier: number;
  mobData: Partial<MobData>;
}

function getEnemySpawnData(type: MobType, tuning?: StageEnemyTuning): EnemySpawnData {
  const role = getEnemyRole(type);
  if (!role || !tuning?.threatProfileId) {
    return {
      hpMultiplier: 1,
      mobData: {},
    };
  }

  const modifier = getStageEnemyModifier(tuning.threatProfileId, role);
  return {
    hpMultiplier: modifier.hpMultiplier,
    mobData: {
      speedMultiplier: modifier.speedMultiplier,
      attackMultiplier: modifier.attackMultiplier,
      xpMultiplier: modifier.xpMultiplier,
      bonusDropBlockId: modifier.dropBlockId,
      bonusDropChance: modifier.dropChance,
      traitLabel: modifier.roleLabel,
      traitAccent: getStageEnemyAccent(tuning.threatProfileId),
    },
  };
}

function getBossSpawnData(type: MobType, stageId?: string | null): EnemySpawnData {
  if (type !== 'boss_giant') {
    return {
      hpMultiplier: 1,
      mobData: {},
    };
  }

  const encounter = getStageBossEncounter(stageId);
  if (!encounter) {
    return {
      hpMultiplier: 1,
      mobData: {
        traitLabel: '巨大ボス',
        traitAccent: '#ff6b4a',
      },
    };
  }

  return {
    hpMultiplier: encounter.hpMultiplier,
    mobData: {
      speedMultiplier: encounter.speedMultiplier,
      attackMultiplier: encounter.attackMultiplier,
      xpMultiplier: encounter.xpMultiplier,
      traitLabel: encounter.title,
      traitAccent: encounter.accent,
      bossEncounterId: encounter.id,
      bossSummonType: encounter.summonType,
      bossSummonLabel: encounter.summonLabel,
      bossSummonMinSeconds: encounter.summonMinSeconds,
      bossSummonMaxSeconds: encounter.summonMaxSeconds,
    },
  };
}

interface MobState {
  /** 全モブ */
  mobs: MobData[];

  /** 最後のスポーン時刻 */
  lastSpawnTime: number;

  /** SPAWNERからの最後のプロトタイプスポーン時刻 */
  lastProtoSpawnTime: number;

  /** モブを追加 */
  spawnMob: (type: MobType, x: number, y: number, z: number, tuning?: StageEnemyTuning, stageId?: string | null) => void;

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
  trySpawnZombie: (playerX: number, playerZ: number, surfaceYFn: (x: number, z: number) => number, tuning?: StageEnemyTuning) => void;

  /** プロトタイプ味方モブのスポーンロジック（常時1体） */
  trySpawnPrototype: (playerX: number, playerZ: number, surfaceYFn: (x: number, z: number) => number) => void;

  /** 昼間のニワトリスポーン */
  trySpawnChicken: (playerX: number, playerZ: number, surfaceYFn: (x: number, z: number) => number) => void;

  /** 夜間のクモスポーン */
  trySpawnSpider: (playerX: number, playerZ: number, surfaceYFn: (x: number, z: number) => number, tuning?: StageEnemyTuning) => void;

  /** 夜間のダーウィンスポーン */
  trySpawnDarwin: (playerX: number, playerZ: number, surfaceYFn: (x: number, z: number) => number, tuning?: StageEnemyTuning) => void;

  /** 巨大ボスのスポーンロジック */
  trySpawnBoss: (playerX: number, playerZ: number, surfaceYFn: (x: number, z: number) => number, stageId?: string | null) => void;

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
  lastProtoSpawnTime: 0,
  _lastChickenSpawnTime: 0,
  _lastSpiderSpawnTime: 0,
  _lastDarwinSpawnTime: 0,
  _deathEvents: [] as MobDeathEvent[],

  spawnMob: (type, x, y, z, tuning, stageId) => {
    const hpMap: Record<MobType, number> = {
      zombie: ZOMBIE_HP,
      darwin: DARWIN_HP,
      prototype: PROTOTYPE_HP,
      chicken: CHICKEN_HP,
      spider: SPIDER_HP,
      iron_golem: IRON_GOLEM_HP,
      boss_giant: BOSS_GIANT_HP,
    };
    const enemySpawnData = getEnemySpawnData(type, tuning);
    const bossSpawnData = getBossSpawnData(type, stageId);
    const hp = Math.max(1, Math.round(
      (hpMap[type] ?? ZOMBIE_HP) * enemySpawnData.hpMultiplier * bossSpawnData.hpMultiplier,
    ));
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
      isAlly: type === 'prototype' || type === 'chicken' || type === 'iron_golem',
      angryAtPlayer: false,
      angryTimer: 0,
      ...enemySpawnData.mobData,
      ...bossSpawnData.mobData,
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
            newDeathEvents.push({
              type: m.type,
              x: m.x,
              y: m.y,
              z: m.z,
              xpMultiplier: m.xpMultiplier,
              bonusDropBlockId: m.bonusDropBlockId,
              bonusDropChance: m.bonusDropChance,
              traitLabel: m.traitLabel,
              traitAccent: m.traitAccent,
              bossEncounterId: m.bossEncounterId,
            });
            return null;
          }

          // フレンドリーファイヤー: 味方モブがダメージを受けたら怒り状態にする
          const shouldBeAngry = m.isAlly && m.type !== 'chicken';

          // ノックバックは「ごく弱い押し」だけ。銃撃は 0,0 を渡して速度を維持する。
          // 爆発は小さい力を渡す想定。方向を正規化し、速度上限で大幅に抑える。
          const rawKb = Math.hypot(knockbackX, knockbackZ);
          const isBoss = m.type === 'boss_giant';
          const isHeavyAlly = m.type === 'prototype' || m.type === 'iron_golem';
          // タイプ別耐性（ボスはほぼ動かない）
          const resistance = isBoss ? 0.12 : isHeavyAlly ? 0.18 : 0.35;
          // 水平ノックバック速度の上限（ブロック/秒）— 以前は 5〜7 で大きく吹き飛んでいた
          const maxKbSpeed = isBoss ? 0.55 : 1.35;

          let nextVx = m.vx;
          let nextVz = m.vz;
          // 上方向は付与しない（浮遊・後退感の主因）
          const nextVy = m.vy;
          // 被弾フラッシュ用（ノックバック無しでもはっきり見える長さ）。接近AIは止めない
          // ボスは少し長く光らせて「当たった」感を出す
          let nextHitTimer = isBoss ? 0.28 : 0.22;

          if (rawKb > 0.04) {
            const dirX = knockbackX / rawKb;
            const dirZ = knockbackZ / rawKb;
            // 入力の大きさを弱い力に写像（単位方向の銃撃を誤って強くしないよう上限を厳しく）
            const impulse = Math.min(maxKbSpeed, rawKb * 0.22) * resistance;
            if (impulse > 0.02) {
              nextVx = m.vx + dirX * impulse;
              nextVz = m.vz + dirZ * impulse;
              // 合成速度を上限でクランプ
              const speed = Math.hypot(nextVx, nextVz);
              const hardCap = maxKbSpeed + (isBoss ? 0.4 : 1.2);
              if (speed > hardCap) {
                const s = hardCap / speed;
                nextVx *= s;
                nextVz *= s;
              }
              nextHitTimer = isBoss ? 0.32 : 0.24;
            }
          }

          return {
            ...m,
            hp: newHp,
            vx: nextVx,
            vy: nextVy,
            vz: nextVz,
            // 連射でフラッシュが途切れないよう、残り時間より短くしない
            hitTimer: Math.max(m.hitTimer, nextHitTimer),
            // 味方がダメージを受けたら怒り状態に（ニワトリは除外）
            angryAtPlayer: shouldBeAngry ? true : m.angryAtPlayer,
            angryTimer: shouldBeAngry ? ANGRY_DURATION : m.angryTimer,
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

  trySpawnZombie: (playerX, playerZ, surfaceYFn, tuning) => {
    const state = get();
    if (countHostileMobs(state.mobs) >= (tuning?.maxHostileMobs ?? MAX_MOBS)) return;

    const now = performance.now() / 1000;
    if (now - state.lastSpawnTime < (tuning?.zombieIntervalSeconds ?? SPAWN_INTERVAL)) return;

    // ランダムな角度でスポーン位置を決定
    const angle = Math.random() * Math.PI * 2;
    const distance = getSpawnDistance(tuning);
    const spawnX = playerX + Math.cos(angle) * distance;
    const spawnZ = playerZ + Math.sin(angle) * distance;
    const spawnY = surfaceYFn(Math.floor(spawnX), Math.floor(spawnZ)) + 1;

    get().spawnMob('zombie', spawnX, spawnY, spawnZ, tuning);
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

  trySpawnSpider: (playerX, playerZ, surfaceYFn, tuning) => {
    const state = get();
    const spiderCount = state.mobs.filter((m) => m.type === 'spider').length;
    if (spiderCount >= (tuning?.maxSpiders ?? MAX_SPIDERS)) return;
    if (countHostileMobs(state.mobs) >= (tuning?.maxHostileMobs ?? MAX_MOBS)) return;

    const now = performance.now() / 1000;
    const lastTime = (state as MobState & { _lastSpiderSpawnTime: number })._lastSpiderSpawnTime;
    if (now - lastTime < (tuning?.spiderIntervalSeconds ?? SPAWN_INTERVAL)) return;

    const angle = Math.random() * Math.PI * 2;
    const distance = getSpawnDistance(tuning);
    const spawnX = playerX + Math.cos(angle) * distance;
    const spawnZ = playerZ + Math.sin(angle) * distance;
    const spawnY = surfaceYFn(Math.floor(spawnX), Math.floor(spawnZ)) + 1;

    get().spawnMob('spider', spawnX, spawnY, spawnZ, tuning);
    set({ _lastSpiderSpawnTime: now } as Partial<MobState>);
  },

  trySpawnDarwin: (playerX, playerZ, surfaceYFn, tuning) => {
    const state = get();
    const darwinCount = state.mobs.filter((m) => m.type === 'darwin').length;
    if (darwinCount >= (tuning?.maxDarwins ?? MAX_DARWINS)) return;
    if (countHostileMobs(state.mobs) >= (tuning?.maxHostileMobs ?? MAX_MOBS)) return;

    const now = performance.now() / 1000;
    const lastTime = (state as MobState & { _lastDarwinSpawnTime: number })._lastDarwinSpawnTime;
    if (now - lastTime < (tuning?.darwinIntervalSeconds ?? DARWIN_SPAWN_INTERVAL)) return;

    const angle = Math.random() * Math.PI * 2;
    const distance = getSpawnDistance(tuning);
    const spawnX = playerX + Math.cos(angle) * distance;
    const spawnZ = playerZ + Math.sin(angle) * distance;
    const spawnY = surfaceYFn(Math.floor(spawnX), Math.floor(spawnZ)) + 1;

    get().spawnMob('darwin', spawnX, spawnY, spawnZ, tuning);
    set({ _lastDarwinSpawnTime: now } as Partial<MobState>);
  },

  trySpawnBoss: (playerX: number, playerZ: number, surfaceYFn: (x: number, z: number) => number, stageId) => {
    const state = get();
    // 既にボスが存在する場合はスポーンしない
    const hasBoss = state.mobs.some((m) => m.type === 'boss_giant');
    if (hasBoss) return;

    // プレイヤーのやや遠くにスポーン
    const angle = Math.random() * Math.PI * 2;
    const distance = 20;
    const spawnX = playerX + Math.cos(angle) * distance;
    const spawnZ = playerZ + Math.sin(angle) * distance;
    const spawnY = surfaceYFn(Math.floor(spawnX), Math.floor(spawnZ)) + 2;

    get().spawnMob('boss_giant', spawnX, spawnY, spawnZ, undefined, stageId);
  },

  despawnFarMobs: (playerX, playerZ) => {
    set((state) => ({
      mobs: state.mobs.filter((m) => {
        // 味方モブは自動削除しない（再スポーンで対応）
        if (m.isAlly) return true;
        // ボスは距離で自動削除しない
        if (m.type === 'boss_giant') return true;
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
      angryAtPlayer: false,
      angryTimer: 0,
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
