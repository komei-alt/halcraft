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
  PROTOTYPE_ATTACK_ANIM_DURATION, PROTOTYPE_ATTACK_HIT_AT,
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
  /** 攻撃開始からの経過（秒）。ヒットフレーム判定用 */
  attackElapsed: number;
  /** 今の攻撃でダメージを既に与えたか */
  attackHitApplied: boolean;
  /** 攻撃対象（プレイヤー or 敵 id） */
  attackTarget: 'player' | string | null;
  /** プレイヤー攻撃時のノックバック方向 */
  pendingKbX: number;
  pendingKbZ: number;
}

function startAttack(
  m: MobData,
  state: AllyMobState,
  target: 'player' | string,
  kbX = 0,
  kbZ = 0,
): void {
  state.attackCooldown = PROTOTYPE_ATTACK_COOLDOWN;
  state.attackElapsed = 0;
  state.attackHitApplied = false;
  state.attackTarget = target;
  state.pendingKbX = kbX;
  state.pendingKbZ = kbZ;
  m.attackTimer = PROTOTYPE_ATTACK_ANIM_DURATION;
  // 攻撃中は足を止める
  m.vx = 0;
  m.vz = 0;
}

/**
 * 攻撃モーション中のヒットフレームでダメージを確定する
 */
function resolveAttackHit(
  state: AllyMobState,
  takeDamage: (damage: number, kbX: number, kbZ: number) => boolean,
): void {
  if (state.attackHitApplied) return;
  if (state.attackElapsed < PROTOTYPE_ATTACK_HIT_AT) return;
  state.attackHitApplied = true;

  if (state.attackTarget === 'player') {
    if (takeDamage(PROTOTYPE_ATTACK_DAMAGE, state.pendingKbX, state.pendingKbZ)) {
      playHurtSound();
    }
    return;
  }

  if (typeof state.attackTarget === 'string') {
    useMobStore.getState().damageMob(
      state.attackTarget,
      PROTOTYPE_ATTACK_DAMAGE,
      state.pendingKbX,
      state.pendingKbZ,
    );
  }
}

/**
 * 味方モブ1体のAI更新
 */
export function updateAllyMobAI(
  m: MobData,
  ctx: MobAIContext,
  state: AllyMobState,
  takeDamage: (damage: number, kbX: number, kbZ: number) => boolean,
): boolean {
  const { dt, playerX, playerZ, checkCollision, allMobs } = ctx;

  // 攻撃アニメ進行（ヒットフレーム解決）
  if (m.attackTimer > 0) {
    state.attackElapsed += dt;
    resolveAttackHit(state, takeDamage);
  } else if (state.attackTarget !== null) {
    // アニメ終了で状態クリア
    state.attackTarget = null;
    state.attackElapsed = 0;
    state.attackHitApplied = false;
  }

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

  // テレポート（怒り中・攻撃中はテレポートしない）
  if (!m.angryAtPlayer && m.attackTimer <= 0) {
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

  // 攻撃モーション中は移動AIをスキップ（向きは維持）
  const isAttacking = m.attackTimer > 0;

  // === 怒り状態: プレイヤーを攻撃するAI ===
  if (m.angryAtPlayer) {
    if (distP > 0.1) {
      m.rotation = Math.atan2(dxP, dzP);
    }

    if (!isAttacking) {
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
          startAttack(m, state, 'player', playerX - m.x, playerZ - m.z);
        }
      }
    } else {
      m.vx = 0;
      m.vz = 0;
    }
  } else if (!isAttacking) {
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
          // 味方近接も弱い押しだけ
          const kbX = (tdx / tDist) * 0.35;
          const kbZ = (tdz / tDist) * 0.35;
          startAttack(m, state, targetEnemy.id, kbX, kbZ);
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
  } else {
    // 攻撃中は停止
    m.vx = 0;
    m.vz = 0;
  }

  // 物理
  applyMobGravityAndYCollision(m, dt, checkCollision, PROTOTYPE_RADIUS, PROTOTYPE_HEIGHT, ctx.getBlock);

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
