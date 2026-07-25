// モブAI 共通定数・型
// 全モブ種別で共有される物理定数とインターフェース

import type { MobData } from '../../stores/useMobStore';
import type { StageEnemyTuning } from '../../types/stages';
import { getAABBCollisionTop, type GetBlockFn } from '../collision';

// ─── 共通物理定数 ──────────────────────────────────────

/** 重力加速度 */
export const MOB_GRAVITY = -20;
/** 1回の衝突判定で進める最大距離。1ブロック床の飛び越しを防ぐ。 */
export const MOB_PHYSICS_MAX_STEP = 0.25;

// ─── ゾンビ定数 ──────────────────────────────────────

export const ZOMBIE_SPEED = 2.5;
export const ZOMBIE_STOP_RANGE = 1.0;
export const ZOMBIE_ATTACK_RANGE = 1.5;
export const ZOMBIE_ATTACK_DAMAGE = 2;
export const ZOMBIE_ATTACK_COOLDOWN = 1.05;
/** ゾンビ／ダーウィン攻撃モーション長 */
export const ZOMBIE_ATTACK_ANIM_DURATION = 0.48;
/** ゾンビ攻撃ヒットタイミング（開始からの秒） */
export const ZOMBIE_ATTACK_HIT_AT = 0.2;
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
export const SPIDER_ATTACK_COOLDOWN = 0.85;
export const SPIDER_ATTACK_ANIM_DURATION = 0.4;
export const SPIDER_ATTACK_HIT_AT = 0.15;
export const SPIDER_HEIGHT = 0.6;
export const SPIDER_RADIUS = 0.4;

// ─── 味方モブ（プロトタイプ／アイアンゴーレム）定数 ──────────────

export const PROTOTYPE_SPEED = 3.0;
export const PROTOTYPE_FOLLOW_MIN = 4;
export const PROTOTYPE_FOLLOW_MAX = 15;
export const PROTOTYPE_DETECT_RANGE = 20;
export const PROTOTYPE_ATTACK_RANGE = 2.5;
export const PROTOTYPE_ATTACK_DAMAGE = 2;
export const PROTOTYPE_ATTACK_COOLDOWN = 0.75;
/** 攻撃モーション全体の長さ（秒）。クールダウンより短くする */
export const PROTOTYPE_ATTACK_ANIM_DURATION = 0.52;
/** 振り下ろしヒットのタイミング（アニメ開始からの秒） */
export const PROTOTYPE_ATTACK_HIT_AT = 0.22;
export const PROTOTYPE_HEIGHT = 3.6;
export const PROTOTYPE_RADIUS = 0.45;
export const PROTOTYPE_JUMP_VEL = 10;
export const PROTOTYPE_STUCK_TIME = 2.0;
export const PROTOTYPE_STUCK_DIST = 0.5;

// ─── ボス近接（AI本体にもあるが VFX 共有用） ──────────────
export const BOSS_ATTACK_ANIM_DURATION = 0.72;
export const BOSS_ATTACK_HIT_AT = 0.32;

/** プレイヤー胴体の高さ（足元〜頭）。近接ヒットの縦判定に使う */
export const PLAYER_BODY_HEIGHT = 1.7;
export const PLAYER_BODY_RADIUS = 0.3;

export interface EntityAabb {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

function axisGap(minA: number, maxA: number, minB: number, maxB: number): number {
  if (maxA < minB) return minB - maxA;
  if (maxB < minA) return minA - maxB;
  return 0;
}

/** 中心間のXZ距離ではなく、両AABB間の最短3D距離を返す。 */
export function getAabbGapDistance(a: EntityAabb, b: EntityAabb): number {
  return Math.hypot(
    axisGap(a.minX, a.maxX, b.minX, b.maxX),
    axisGap(a.minY, a.maxY, b.minY, b.maxY),
    axisGap(a.minZ, a.maxZ, b.minZ, b.maxZ),
  );
}

/** 足元Y基準の2エンティティが、指定した3D間合いに入っているか。 */
export function canEntityAabbsReach(
  attacker: { x: number; y: number; z: number; radius: number; height: number },
  target: { x: number; y: number; z: number; radius: number; height: number },
  reach: number,
): boolean {
  return getAabbGapDistance(
    {
      minX: attacker.x - attacker.radius,
      maxX: attacker.x + attacker.radius,
      minY: attacker.y,
      maxY: attacker.y + attacker.height,
      minZ: attacker.z - attacker.radius,
      maxZ: attacker.z + attacker.radius,
    },
    {
      minX: target.x - target.radius,
      maxX: target.x + target.radius,
      minY: target.y,
      maxY: target.y + target.height,
      minZ: target.z - target.radius,
      maxZ: target.z + target.radius,
    },
  ) <= reach;
}

/**
 * 近接攻撃がプレイヤーに届くか（水平距離・高さ・任意で正面方向）。
 * 振り始めだけでなくヒットフレームでも再判定し、崖上や背後への不正ヒットを防ぐ。
 */
export function canMeleeHitPlayer(
  mobX: number,
  mobY: number,
  mobZ: number,
  mobRotation: number,
  playerX: number,
  playerY: number,
  playerZ: number,
  options: {
    attackRange: number;
    /** モブ足元基準の攻撃下限 */
    attackMinY: number;
    /** モブ足元基準の攻撃上限 */
    attackMaxY: number;
    requireFacing?: boolean;
    /** 正面ドット積の下限（1=真前, 0=真横, 既定 0.2 ≒ 約78°） */
    facingDotMin?: number;
  },
): boolean {
  const dx = playerX - mobX;
  const dz = playerZ - mobZ;
  const distXZ = Math.hypot(dx, dz);
  const attackAabb: EntityAabb = {
    minX: mobX,
    maxX: mobX,
    minY: mobY + options.attackMinY,
    maxY: mobY + options.attackMaxY,
    minZ: mobZ,
    maxZ: mobZ,
  };
  const playerAabb: EntityAabb = {
    minX: playerX - PLAYER_BODY_RADIUS,
    maxX: playerX + PLAYER_BODY_RADIUS,
    minY: playerY,
    maxY: playerY + PLAYER_BODY_HEIGHT,
    minZ: playerZ - PLAYER_BODY_RADIUS,
    maxZ: playerZ + PLAYER_BODY_RADIUS,
  };
  if (getAabbGapDistance(attackAabb, playerAabb) > options.attackRange) return false;

  if (options.requireFacing && distXZ > 0.12) {
    const forwardX = Math.sin(mobRotation);
    const forwardZ = Math.cos(mobRotation);
    const dot = (dx * forwardX + dz * forwardZ) / distXZ;
    if (dot < (options.facingDotMin ?? 0.2)) return false;
  }

  return true;
}

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
  getBlock?: GetBlockFn;
  /** 現在ステージの敵チューニング */
  enemyTuning?: StageEnemyTuning;
}

/**
 * モブの重力・Y衝突を適用する共通関数
 * getBlock がある場合は上面スナップで空中浮きを防ぐ
 */
export function applyMobGravityAndYCollision(
  m: MobData,
  dt: number,
  checkCollision: CollisionCheckFn,
  radius: number,
  height: number,
  getBlock?: GetBlockFn,
): { onGround: boolean } {
  let onGround = m.vy === 0 && checkCollision(m.x, m.y - 0.12, m.z, radius, height);
  if (!onGround) {
    m.vy += MOB_GRAVITY * dt;
    if (m.vy < -30) m.vy = -30;
  }

  const displacement = m.vy * dt;
  const steps = Math.max(1, Math.ceil(Math.abs(displacement) / MOB_PHYSICS_MAX_STEP));
  const stepY = displacement / steps;
  for (let step = 0; step < steps; step++) {
    const newY = m.y + stepY;
    if (checkCollision(m.x, newY, m.z, radius, height)) {
      if (m.vy <= 0) {
        if (getBlock) {
          const top = getAABBCollisionTop(getBlock, m.x, newY, m.z, radius, height);
          m.y = top !== null ? top + 0.001 : Math.floor(newY) + 1.001;
        } else {
          m.y = Math.floor(newY) + 1.001;
        }
      }
      m.vy = 0;
      onGround = true;
      break;
    }
    m.y = newY;
    onGround = false;
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
  const displacement = m.vx * dt;
  const steps = Math.max(1, Math.ceil(Math.abs(displacement) / MOB_PHYSICS_MAX_STEP));
  const stepX = displacement / steps;
  for (let step = 0; step < steps; step++) {
    const newX = m.x + stepX;
    if (checkCollision(newX, m.y, m.z, radius, height)) {
      if (allowStepUp && !checkCollision(newX, m.y + 1, m.z, radius, height)) {
        m.vy = stepJumpVel;
        m.x = newX;
      } else {
        m.vx = 0;
      }
      break;
    } else {
      m.x = newX;
    }
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
  const displacement = m.vz * dt;
  const steps = Math.max(1, Math.ceil(Math.abs(displacement) / MOB_PHYSICS_MAX_STEP));
  const stepZ = displacement / steps;
  for (let step = 0; step < steps; step++) {
    const newZ = m.z + stepZ;
    if (checkCollision(m.x, m.y, newZ, radius, height)) {
      if (allowStepUp && !checkCollision(m.x, m.y + 1, newZ, radius, height)) {
        m.vy = stepJumpVel;
        m.z = newZ;
      } else {
        m.vz = 0;
      }
      break;
    } else {
      m.z = newZ;
    }
  }
}
