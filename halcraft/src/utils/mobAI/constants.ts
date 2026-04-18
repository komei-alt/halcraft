// モブAI 共通定数・型
// 全モブ種別で共有される物理定数とインターフェース

import type { MobData } from '../../stores/useMobStore';

// ─── 共通物理定数 ──────────────────────────────────────

/** 重力加速度 */
export const MOB_GRAVITY = -20;

// ─── ゾンビ定数 ──────────────────────────────────────

export const ZOMBIE_SPEED = 2.5;
export const ZOMBIE_STOP_RANGE = 1.0;
export const ZOMBIE_ATTACK_RANGE = 1.5;
export const ZOMBIE_ATTACK_DAMAGE = 2;
export const ZOMBIE_ATTACK_COOLDOWN = 1.0;
export const MOB_HEIGHT = 1.8;
export const MOB_RADIUS = 0.3;
export const ZOMBIE_SEPARATION_RADIUS = 1.2;
export const ZOMBIE_SEPARATION_FORCE = 2.0;
export const ZOMBIE_FLANK_CHANCE = 0.3;
export const ZOMBIE_FLANK_ANGLE = Math.PI * 0.4;

// ─── ニワトリ定数 ──────────────────────────────────────

export const CHICKEN_SPEED = 1.5;
export const CHICKEN_FLEE_RANGE = 5;
export const CHICKEN_FLEE_SPEED = 3.0;
export const CHICKEN_WANDER_INTERVAL = 3;
export const CHICKEN_HEIGHT = 0.6;
export const CHICKEN_RADIUS = 0.2;

// ─── クモ定数 ──────────────────────────────────────

export const SPIDER_SPEED = 3.5;
export const SPIDER_STOP_RANGE = 0.8;
export const SPIDER_ATTACK_RANGE = 1.3;
export const SPIDER_ATTACK_DAMAGE = 3;
export const SPIDER_ATTACK_COOLDOWN = 0.8;
export const SPIDER_HEIGHT = 0.6;
export const SPIDER_RADIUS = 0.4;

// ─── 味方モブ（プロトタイプ／アイアンゴーレム）定数 ──────────────

export const PROTOTYPE_SPEED = 3.0;
export const PROTOTYPE_FOLLOW_MIN = 4;
export const PROTOTYPE_FOLLOW_MAX = 15;
export const PROTOTYPE_DETECT_RANGE = 20;
export const PROTOTYPE_ATTACK_RANGE = 2.5;
export const PROTOTYPE_ATTACK_DAMAGE = 2;
export const PROTOTYPE_ATTACK_COOLDOWN = 0.6;
export const PROTOTYPE_HEIGHT = 3.6;
export const PROTOTYPE_RADIUS = 0.45;
export const PROTOTYPE_JUMP_VEL = 10;
export const PROTOTYPE_STUCK_TIME = 2.0;
export const PROTOTYPE_STUCK_DIST = 0.5;

// ─── 共通インターフェース ──────────────────────────────

/** 衝突判定コールバック */
export type CollisionCheckFn = (px: number, py: number, pz: number, radius: number, height: number) => boolean;

/** モブAI更新用コンテキスト */
export interface MobAIContext {
  /** フレームのdt（クランプ済み） */
  dt: number;
  /** プレイヤーX座標 */
  playerX: number;
  /** プレイヤーZ座標 */
  playerZ: number;
  /** プレイヤーY座標（足元） */
  playerY: number;
  /** 衝突判定関数 */
  checkCollision: CollisionCheckFn;
  /** アニメーション時間（累積） */
  animTime: number;
  /** 全モブリスト（分離計算等に使用） */
  allMobs: MobData[];
  /** 防衛用コアの位置（あれば） */
  corePosition?: { x: number; y: number; z: number } | null;
  /** ブロック取得関数 */
  getBlock?: (x: number, y: number, z: number) => number;
}

/**
 * モブの重力・Y衝突を適用する共通関数
 */
export function applyMobGravityAndYCollision(
  m: MobData,
  dt: number,
  checkCollision: CollisionCheckFn,
  radius: number,
  height: number,
): { onGround: boolean } {
  const onGround = m.vy === 0 && checkCollision(m.x, m.y - 0.1, m.z, radius, height);
  if (!onGround) {
    m.vy += MOB_GRAVITY * dt;
    if (m.vy < -30) m.vy = -30;
  }

  const newY = m.y + m.vy * dt;
  if (checkCollision(m.x, newY, m.z, radius, height)) {
    if (m.vy < 0) m.y = Math.floor(newY) + 1.001;
    m.vy = 0;
  } else {
    m.y = newY;
  }

  return { onGround };
}

/**
 * モブのX軸衝突を適用する共通関数（段差対応付き）
 */
export function applyMobXCollision(
  m: MobData,
  dt: number,
  checkCollision: CollisionCheckFn,
  radius: number,
  height: number,
  stepJumpVel: number = 4,
  allowStepUp: boolean = true,
): void {
  const newX = m.x + m.vx * dt;
  if (checkCollision(newX, m.y, m.z, radius, height)) {
    if (allowStepUp && !checkCollision(newX, m.y + 1, m.z, radius, height)) {
      m.vy = stepJumpVel;
      m.x = newX;
    } else {
      m.vx = 0;
    }
  } else {
    m.x = newX;
  }
}

/**
 * モブのZ軸衝突を適用する共通関数（段差対応付き）
 */
export function applyMobZCollision(
  m: MobData,
  dt: number,
  checkCollision: CollisionCheckFn,
  radius: number,
  height: number,
  stepJumpVel: number = 4,
  allowStepUp: boolean = true,
): void {
  const newZ = m.z + m.vz * dt;
  if (checkCollision(m.x, m.y, newZ, radius, height)) {
    if (allowStepUp && !checkCollision(m.x, m.y + 1, newZ, radius, height)) {
      m.vy = stepJumpVel;
      m.z = newZ;
    } else {
      m.vz = 0;
    }
  } else {
    m.z = newZ;
  }
}
