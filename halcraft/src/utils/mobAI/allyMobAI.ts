// 味方モブ（プロトタイプ / アイアンゴーレム）AI
// プレイヤーに追従し、敵モブを自動攻撃する。

import type { MobData } from '../../stores/useMobStore';
import { useMobStore } from '../../stores/useMobStore';
import { getTerrainHeight } from '../terrain';
import { playHurtSound } from '../sounds';
import {
  PROTOTYPE_SPEED, PROTOTYPE_FOLLOW_MIN, PROTOTYPE_FOLLOW_MAX,
  PROTOTYPE_DETECT_RANGE, PROTOTYPE_ATTACK_RANGE,
  PROTOTYPE_ATTACK_DAMAGE, PROTOTYPE_ATTACK_COOLDOWN,
  PROTOTYPE_HEIGHT, PROTOTYPE_RADIUS,
  PROTOTYPE_JUMP_VEL, PROTOTYPE_STUCK_TIME, PROTOTYPE_STUCK_DIST,
  applyMobGravityAndYCollision,
  type MobAIContext,
} from './constants';

/** 味方モブ固有の状態（ref で保持） */
export interface AllyMobState {
  attackCooldown: number;
  stuckTimer: number;
  lastPos: { x: number; z: number };
}

/** 味方がプレイヤーを攻撃する結果 */
export interface AllyAttackResult {
  damage: number;
  kbDirX: number;
  kbDirZ: number;
}

/**
 * 味方モブ1体のAI更新
 */
export function updateAllyMobAI(
  m: MobData,
  ctx: MobAIContext,
  state: AllyMobState,
  takeDamage: (damage: number, kbX: number, kbZ: number) => void,
): boolean {
  const { dt, playerX, playerZ, checkCollision, allMobs } = ctx;

  // --- 怒りタイマー ---
  if (m.angryAtPlayer && m.angryTimer > 0) {
    m.angryTimer -= dt;
    if (m.angryTimer <= 0) {
      m.angryAtPlayer = false;
      m.angryTimer = 0;
    }
  }

  // プレイヤーまでの距離
  const dxP = playerX - m.x;
  const dzP = playerZ - m.z;
  const distP = Math.sqrt(dxP * dxP + dzP * dzP);

  // --- スタック検出 ---
  const movedDx = m.x - state.lastPos.x;
  const movedDz = m.z - state.lastPos.z;
  const movedDist = Math.sqrt(movedDx * movedDx + movedDz * movedDz);
  const isMoving = Math.abs(m.vx) > 0.1 || Math.abs(m.vz) > 0.1;

  if (isMoving && movedDist < PROTOTYPE_STUCK_DIST * dt * 60) {
    state.stuckTimer += dt;
  } else {
    state.stuckTimer = 0;
  }
  state.lastPos.x = m.x;
  state.lastPos.z = m.z;

  // テレポート（怒り中はテレポートしない）
  if (!m.angryAtPlayer) {
    const shouldTeleport = distP > PROTOTYPE_FOLLOW_MAX || state.stuckTimer > PROTOTYPE_STUCK_TIME;
    if (shouldTeleport) {
      const angle = Math.atan2(dzP, dxP) + (Math.random() - 0.5) * 1.0;
      const tpDist = Math.min(distP, PROTOTYPE_FOLLOW_MIN);
      m.x = playerX - Math.cos(angle) * tpDist;
      m.z = playerZ - Math.sin(angle) * tpDist;
      m.y = getTerrainHeight(Math.floor(m.x), Math.floor(m.z)) + 2;
      m.vx = 0;
      m.vz = 0;
      m.vy = 0;
      state.stuckTimer = 0;
    }
  }

  // === 怒り状態: プレイヤーを攻撃するAI ===
  if (m.angryAtPlayer) {
    if (distP > 0.1) {
      m.rotation = Math.atan2(dxP, dzP);
    }

    if (distP > PROTOTYPE_ATTACK_RANGE) {
      const nx = dxP / distP;
      const nz = dzP / distP;
      const chaseSpeed = PROTOTYPE_SPEED * 1.8;
      m.vx = nx * chaseSpeed;
      m.vz = nz * chaseSpeed;
    } else {
      m.vx = 0;
      m.vz = 0;

      if (state.attackCooldown <= 0 && distP > 0.01) {
        const kbDirX = playerX - m.x;
        const kbDirZ = playerZ - m.z;
        takeDamage(PROTOTYPE_ATTACK_DAMAGE, kbDirX, kbDirZ);
        playHurtSound();
        state.attackCooldown = PROTOTYPE_ATTACK_COOLDOWN;
      }
    }
  } else {
    // === 通常状態: 敵を討伐 or プレイヤーに追従 ===
    let targetEnemy: MobData | null = null;
    let closestDist = PROTOTYPE_DETECT_RANGE;

    for (const other of allMobs) {
      if (other.isAlly || other.id === m.id) continue;
      if (other.type === 'chicken') continue;

      const odx = other.x - m.x;
      const odz = other.z - m.z;
      const oDist = Math.sqrt(odx * odx + odz * odz);

      const pdx = other.x - playerX;
      const pdz = other.z - playerZ;
      const pDist = Math.sqrt(pdx * pdx + pdz * pdz);

      const priority = oDist + Math.max(0, pDist - 5) * 0.5;

      if (oDist < PROTOTYPE_DETECT_RANGE && priority < closestDist) {
        closestDist = priority;
        targetEnemy = other;
      }
    }

    if (targetEnemy) {
      const tdx = targetEnemy.x - m.x;
      const tdz = targetEnemy.z - m.z;
      const tDist = Math.sqrt(tdx * tdx + tdz * tdz);

      if (tDist > 0.1) {
        m.rotation = Math.atan2(tdx, tdz);
      }

      if (tDist > PROTOTYPE_ATTACK_RANGE) {
        const nx = tdx / tDist;
        const nz = tdz / tDist;
        const chaseSpeed = PROTOTYPE_SPEED * 2.0;
        m.vx = nx * chaseSpeed;
        m.vz = nz * chaseSpeed;
      } else {
        m.vx = 0;
        m.vz = 0;

        if (state.attackCooldown <= 0 && tDist > 0.01) {
          const kbX = tdx / tDist;
          const kbZ = tdz / tDist;
          useMobStore.getState().damageMob(targetEnemy.id, PROTOTYPE_ATTACK_DAMAGE, kbX, kbZ);
          state.attackCooldown = PROTOTYPE_ATTACK_COOLDOWN;
        }
      }
    } else if (distP > PROTOTYPE_FOLLOW_MIN) {
      const nx = dxP / distP;
      const nz = dzP / distP;
      m.rotation = Math.atan2(dxP, dzP);
      m.vx = nx * PROTOTYPE_SPEED;
      m.vz = nz * PROTOTYPE_SPEED;
    } else {
      m.vx = 0;
      m.vz = 0;
      if (distP > 0.1) {
        m.rotation = Math.atan2(dxP, dzP);
      }
    }
  }

  // 物理
  applyMobGravityAndYCollision(m, dt, checkCollision, PROTOTYPE_RADIUS, PROTOTYPE_HEIGHT);

  // X軸衝突（2段対応）
  const newXP = m.x + m.vx * dt;
  if (checkCollision(newXP, m.y, m.z, PROTOTYPE_RADIUS, PROTOTYPE_HEIGHT)) {
    if (!checkCollision(newXP, m.y + 1, m.z, PROTOTYPE_RADIUS, PROTOTYPE_HEIGHT)) {
      m.vy = PROTOTYPE_JUMP_VEL;
      m.x = newXP;
    } else if (!checkCollision(newXP, m.y + 2, m.z, PROTOTYPE_RADIUS, PROTOTYPE_HEIGHT)) {
      m.vy = PROTOTYPE_JUMP_VEL * 1.3;
      m.x = newXP;
    } else {
      if (m.vy === 0) {
        m.vy = PROTOTYPE_JUMP_VEL;
      }
      m.vx = 0;
    }
  } else {
    m.x = newXP;
  }

  // Z軸衝突（2段対応）
  const newZP = m.z + m.vz * dt;
  if (checkCollision(m.x, m.y, newZP, PROTOTYPE_RADIUS, PROTOTYPE_HEIGHT)) {
    if (!checkCollision(m.x, m.y + 1, newZP, PROTOTYPE_RADIUS, PROTOTYPE_HEIGHT)) {
      m.vy = PROTOTYPE_JUMP_VEL;
      m.z = newZP;
    } else if (!checkCollision(m.x, m.y + 2, newZP, PROTOTYPE_RADIUS, PROTOTYPE_HEIGHT)) {
      m.vy = PROTOTYPE_JUMP_VEL * 1.3;
      m.z = newZP;
    } else {
      if (m.vy === 0) {
        m.vy = PROTOTYPE_JUMP_VEL;
      }
      m.vz = 0;
    }
  } else {
    m.z = newZP;
  }

  // 落下でリスポーン
  if (m.y < -20) {
    m.x = playerX + 3;
    m.z = playerZ + 3;
    m.y = getTerrainHeight(Math.floor(m.x), Math.floor(m.z)) + 2;
    m.vy = 0;
  }

  return true;
}
