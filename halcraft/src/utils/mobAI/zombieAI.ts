// ゾンビ AI
// 攻撃的な敵モブ。プレイヤーを追跡し、接触攻撃する。

import type { MobData } from '../../stores/useMobStore';
import {
  ZOMBIE_SPEED, ZOMBIE_STOP_RANGE, ZOMBIE_ATTACK_RANGE,
  ZOMBIE_ATTACK_DAMAGE, ZOMBIE_ATTACK_COOLDOWN,
  MOB_HEIGHT, MOB_RADIUS,
  ZOMBIE_SEPARATION_RADIUS, ZOMBIE_SEPARATION_FORCE,
  ZOMBIE_FLANK_ANGLE,
  applyMobGravityAndYCollision,
  type MobAIContext,
} from './constants';

/** ゾンビ固有の状態 */
export interface ZombieState {
  attackCooldown: number;
  flankTimer: number;
  blockAttackCooldown?: number;
}

/** 攻撃結果 */
export interface ZombieAttackResult {
  damage: number;
  kbDirX: number;
  kbDirZ: number;
}

/** ブロックへの攻撃結果 */
export interface ZombieBlockAttackResult {
  x: number;
  y: number;
  z: number;
  damage: number;
}

/**
 * ゾンビ1体のAI更新
 */
export function updateZombieAI(
  m: MobData,
  ctx: MobAIContext,
  state: ZombieState,
): { alive: boolean; attack: ZombieAttackResult | null; blockAttack: ZombieBlockAttackResult | null } {
  const { dt, playerX, playerZ, playerY, checkCollision, allMobs, corePosition, getBlock } = ctx;

  let targetX = playerX;
  let targetZ = playerZ;
  let targetY = playerY;
  let targetingCore = false;

  // コアが存在し、プレイヤーより近い場合はコアを狙う
  const pDist = Math.sqrt((playerX - m.x)**2 + (playerZ - m.z)**2);
  if (corePosition) {
    const cDist = Math.sqrt((corePosition.x - m.x)**2 + (corePosition.z - m.z)**2);
    // コアの方が近い、またはプレイヤーが離れすぎている場合はコア優先
    if (cDist < pDist || pDist > 20) {
      targetX = corePosition.x;
      targetZ = corePosition.z;
      targetY = corePosition.y;
      targetingCore = true;
    }
  }

  const dx = targetX - m.x;
  const dz = targetZ - m.z;
  const distXZ = Math.sqrt(dx * dx + dz * dz);

  // ゾンビ同士の分離
  let sepX = 0;
  let sepZ = 0;
  for (const other of allMobs) {
    if (other.id === m.id || other.type !== 'zombie') continue;
    const odx = m.x - other.x;
    const odz = m.z - other.z;
    const oDist = Math.sqrt(odx * odx + odz * odz);
    if (oDist > 0.01 && oDist < ZOMBIE_SEPARATION_RADIUS) {
      const force = (ZOMBIE_SEPARATION_RADIUS - oDist) / ZOMBIE_SEPARATION_RADIUS;
      sepX += (odx / oDist) * force * ZOMBIE_SEPARATION_FORCE;
      sepZ += (odz / oDist) * force * ZOMBIE_SEPARATION_FORCE;
    }
  }

  if (distXZ > ZOMBIE_STOP_RANGE) {
    // 回り込み行動
    let moveAngle = Math.atan2(dx, dz);
    const mobHash = parseInt(m.id.replace('mob_', ''), 10) || 0;
    const flankDir = (mobHash % 2 === 0) ? 1 : -1;

    if (distXZ < 8 && distXZ > ZOMBIE_STOP_RANGE + 0.5) {
      const flankIntensity = Math.max(0, 1 - distXZ / 8) * ZOMBIE_FLANK_ANGLE;
      moveAngle += flankDir * flankIntensity;
    }

    m.rotation = Math.atan2(dx, dz);

    if (m.hitTimer <= 0) {
      const nx = Math.sin(moveAngle);
      const nz = Math.cos(moveAngle);
      m.vx = (nx * ZOMBIE_SPEED) + sepX;
      m.vz = (nz * ZOMBIE_SPEED) + sepZ;
    }
  } else {
    m.vx = sepX;
    m.vz = sepZ;
    if (distXZ > 0.1) {
      m.rotation = Math.atan2(dx, dz);
    }
  }

  // 物理
  applyMobGravityAndYCollision(m, dt, checkCollision, MOB_RADIUS, MOB_HEIGHT);

  // X衝突（ノックバック中はジャンプしない）
  const newX = m.x + m.vx * dt;
  if (checkCollision(newX, m.y, m.z, MOB_RADIUS, MOB_HEIGHT)) {
    if (m.hitTimer <= 0 && !checkCollision(newX, m.y + 1, m.z, MOB_RADIUS, MOB_HEIGHT)) {
      m.vy = 4;
      m.x = newX;
    } else {
      m.vx = 0;
    }
  } else {
    m.x = newX;
  }

  // Z衝突
  const newZ = m.z + m.vz * dt;
  if (checkCollision(m.x, m.y, newZ, MOB_RADIUS, MOB_HEIGHT)) {
    if (m.hitTimer <= 0 && !checkCollision(m.x, m.y + 1, newZ, MOB_RADIUS, MOB_HEIGHT)) {
      m.vy = 4;
      m.z = newZ;
    } else {
      m.vz = 0;
    }
  } else {
    m.z = newZ;
  }

  // ノックバック減衰
  if (m.hitTimer > 0) {
    m.vx *= 0.85;
    m.vz *= 0.85;
  }

  // 攻撃対象への距離計算
  let attack: ZombieAttackResult | null = null;
  let blockAttack: ZombieBlockAttackResult | null = null;
  const targetDy = m.y - targetY;
  const yClose = Math.abs(targetDy) < MOB_HEIGHT + 0.5;

  if (distXZ < ZOMBIE_ATTACK_RANGE && yClose && state.attackCooldown <= 0) {
    if (targetingCore && corePosition) {
      blockAttack = {
        x: corePosition.x,
        y: corePosition.y,
        z: corePosition.z,
        damage: ZOMBIE_ATTACK_DAMAGE,
      };
    } else {
      attack = {
        damage: ZOMBIE_ATTACK_DAMAGE,
        kbDirX: playerX - m.x,
        kbDirZ: playerZ - m.z,
      };
    }
    state.attackCooldown = ZOMBIE_ATTACK_COOLDOWN;
  }

  // 障害物ブロックへの攻撃判定（もし移動が詰まってかつ目の前にブロックがあれば）
  if (!state.blockAttackCooldown) state.blockAttackCooldown = 0;
  state.blockAttackCooldown = Math.max(0, state.blockAttackCooldown - dt);

  // ZOMBIEが止まってしまっている && ノックバック中ではない
  if (!blockAttack && distXZ > ZOMBIE_STOP_RANGE && Math.abs(m.vx) < 0.1 && Math.abs(m.vz) < 0.1 && m.hitTimer <= 0) {
    // 進行方向のブロックを取得
    const lookAngle = m.rotation;
    // 目の前 1.0 ブロック先の座標
    const bx = Math.floor(m.x + Math.sin(lookAngle) * 1.0);
    const bz = Math.floor(m.z + Math.cos(lookAngle) * 1.0);
    const by = Math.floor(m.y + 0.5); // 目の高さ
    const byFoot = Math.floor(m.y); // 足元

    if (getBlock && state.blockAttackCooldown <= 0) {
      // 目の高さか足元に空気以外のブロックがあれば攻撃
      const blockIdObj = getBlock(bx, by, bz);
      const blockIdFoot = getBlock(bx, byFoot, bz);
      if (blockIdObj !== 0 && blockIdObj !== 7) { // 0=AIR, 7=BEDROCK
        blockAttack = { x: bx, y: by, z: bz, damage: 1 };
        state.blockAttackCooldown = 1.0; // 1秒に1回ダメージ
      } else if (blockIdFoot !== 0 && blockIdFoot !== 7) {
        blockAttack = { x: bx, y: byFoot, z: bz, damage: 1 };
        state.blockAttackCooldown = 1.0;
      }
    }
  }

  return { alive: m.y >= -20, attack, blockAttack };
}
