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
}

/** 攻撃結果 */
export interface ZombieAttackResult {
  damage: number;
  kbDirX: number;
  kbDirZ: number;
}

/**
 * ゾンビ1体のAI更新
 */
export function updateZombieAI(
  m: MobData,
  ctx: MobAIContext,
  state: ZombieState,
): { alive: boolean; attack: ZombieAttackResult | null } {
  const { dt, playerX, playerZ, playerY, checkCollision, allMobs } = ctx;

  const dx = playerX - m.x;
  const dz = playerZ - m.z;
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

  // プレイヤー攻撃判定
  let attack: ZombieAttackResult | null = null;
  const playerDy = m.y - playerY;
  const yClose = Math.abs(playerDy) < MOB_HEIGHT + 0.5;
  if (distXZ < ZOMBIE_ATTACK_RANGE && yClose && state.attackCooldown <= 0) {
    attack = {
      damage: ZOMBIE_ATTACK_DAMAGE,
      kbDirX: playerX - m.x,
      kbDirZ: playerZ - m.z,
    };
    state.attackCooldown = ZOMBIE_ATTACK_COOLDOWN;
  }

  return { alive: m.y >= -20, attack };
}
