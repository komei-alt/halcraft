// ゾンビ AI
// 攻撃的な敵モブ。プレイヤーを追跡し、接触攻撃する。

import type { MobData } from '../../stores/useMobStore';
import {
  triggerMeleeSwingSound,
  triggerMobMeleeHitFeedback,
} from '../mobMeleeFeedback';
import {
  ZOMBIE_SPEED, ZOMBIE_STOP_RANGE, ZOMBIE_ATTACK_RANGE,
  ZOMBIE_ATTACK_DAMAGE, ZOMBIE_ATTACK_COOLDOWN,
  ZOMBIE_ATTACK_ANIM_DURATION, ZOMBIE_ATTACK_HIT_AT,
  MOB_HEIGHT, MOB_RADIUS,
  ZOMBIE_SEPARATION_RADIUS, ZOMBIE_SEPARATION_FORCE,
  ZOMBIE_FLANK_ANGLE,
  applyMobGravityAndYCollision,
  canMeleeHitPlayer,
  type MobAIContext,
} from './constants';

/** ゾンビ固有の状態 */
export interface ZombieState {
  attackCooldown: number;
  flankTimer: number;
  blockAttackCooldown?: number;
  attackElapsed: number;
  attackHitApplied: boolean;
  swingSoundPlayed: boolean;
  pendingDamage: number;
  pendingKbX: number;
  pendingKbZ: number;
  pendingIsCore: boolean;
  pendingCoreX: number;
  pendingCoreY: number;
  pendingCoreZ: number;
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

function startZombieAttack(
  m: MobData,
  state: ZombieState,
  damage: number,
  kbX: number,
  kbZ: number,
  core?: { x: number; y: number; z: number },
): void {
  state.attackCooldown = ZOMBIE_ATTACK_COOLDOWN;
  state.attackElapsed = 0;
  state.attackHitApplied = false;
  state.swingSoundPlayed = false;
  state.pendingDamage = damage;
  state.pendingKbX = kbX;
  state.pendingKbZ = kbZ;
  state.pendingIsCore = !!core;
  state.pendingCoreX = core?.x ?? 0;
  state.pendingCoreY = core?.y ?? 0;
  state.pendingCoreZ = core?.z ?? 0;
  m.attackTimer = ZOMBIE_ATTACK_ANIM_DURATION;
  m.vx = 0;
  m.vz = 0;
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

  // 既存 state 互換（古いセーブ/初期化不足対策）
  if (state.attackElapsed === undefined) state.attackElapsed = 0;
  if (state.attackHitApplied === undefined) state.attackHitApplied = false;
  if (state.swingSoundPlayed === undefined) state.swingSoundPlayed = false;
  if (state.pendingDamage === undefined) state.pendingDamage = 0;

  let targetX = playerX;
  let targetZ = playerZ;
  let targetY = playerY;
  let targetingCore = false;

  const pDist = Math.sqrt((playerX - m.x)**2 + (playerZ - m.z)**2);
  if (corePosition) {
    const cDist = Math.sqrt((corePosition.x - m.x)**2 + (corePosition.z - m.z)**2);
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
  const speedMultiplier = m.speedMultiplier ?? 1;
  const attackMultiplier = m.attackMultiplier ?? 1;
  const isAttacking = (m.attackTimer ?? 0) > 0;

  // 攻撃アニメ進行
  let attack: ZombieAttackResult | null = null;
  let blockAttack: ZombieBlockAttackResult | null = null;

  if (isAttacking) {
    state.attackElapsed += dt;
    if (!state.swingSoundPlayed && state.attackElapsed >= 0.12) {
      state.swingSoundPlayed = true;
      triggerMeleeSwingSound();
    }
    if (!state.attackHitApplied && state.attackElapsed >= ZOMBIE_ATTACK_HIT_AT) {
      state.attackHitApplied = true;
      if (state.pendingIsCore) {
        blockAttack = {
          x: state.pendingCoreX,
          y: state.pendingCoreY,
          z: state.pendingCoreZ,
          damage: state.pendingDamage,
        };
        triggerMobMeleeHitFeedback(
          m.type,
          state.pendingCoreX,
          state.pendingCoreY + 0.6,
          state.pendingCoreZ,
          Math.sin(m.rotation),
          0.2,
          Math.cos(m.rotation),
        );
      } else {
        const stillInReach = canMeleeHitPlayer(
          m.x, m.y, m.z, m.rotation,
          playerX, playerY, playerZ,
          {
            attackRange: ZOMBIE_ATTACK_RANGE * 1.15,
            attackMinY: -0.2,
            attackMaxY: MOB_HEIGHT + 0.35,
            requireFacing: true,
            facingDotMin: 0.1,
          },
        );
        if (stillInReach) {
          const hx = playerX;
          const hy = playerY + 1.1;
          const hz = playerZ;
          let dirX = hx - m.x;
          let dirZ = hz - m.z;
          let dirY = hy - (m.y + 1.1);
          const len = Math.hypot(dirX, dirY, dirZ) || 1;
          dirX /= len; dirY /= len; dirZ /= len;
          triggerMobMeleeHitFeedback(m.type, hx, hy, hz, dirX, dirY, dirZ);
          attack = {
            damage: state.pendingDamage,
            kbDirX: state.pendingKbX,
            kbDirZ: state.pendingKbZ,
          };
        }
      }
    }
  }

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

  if (isAttacking) {
    m.vx = 0;
    m.vz = 0;
    if (distXZ > 0.1) {
      m.rotation = Math.atan2(dx, dz);
    }
  } else if (distXZ > ZOMBIE_STOP_RANGE) {
    let moveAngle = Math.atan2(dx, dz);
    const mobHash = parseInt(m.id.replace('mob_', ''), 10) || 0;
    const flankDir = (mobHash % 2 === 0) ? 1 : -1;

    if (distXZ < 8 && distXZ > ZOMBIE_STOP_RANGE + 0.5) {
      const flankIntensity = Math.max(0, 1 - distXZ / 8) * ZOMBIE_FLANK_ANGLE;
      moveAngle += flankDir * flankIntensity;
    }

    m.rotation = Math.atan2(dx, dz);

    const nx = Math.sin(moveAngle);
    const nz = Math.cos(moveAngle);
    const chaseVx = (nx * ZOMBIE_SPEED * speedMultiplier) + sepX;
    const chaseVz = (nz * ZOMBIE_SPEED * speedMultiplier) + sepZ;
    if (m.hitTimer > 0) {
      m.vx = m.vx * 0.55 + chaseVx * 0.7;
      m.vz = m.vz * 0.55 + chaseVz * 0.7;
    } else {
      m.vx = chaseVx;
      m.vz = chaseVz;
    }
  } else {
    m.vx = sepX;
    m.vz = sepZ;
    if (distXZ > 0.1) {
      m.rotation = Math.atan2(dx, dz);
    }
  }

  applyMobGravityAndYCollision(m, dt, checkCollision, MOB_RADIUS, MOB_HEIGHT, ctx.getBlock);

  const newX = m.x + m.vx * dt;
  if (checkCollision(newX, m.y, m.z, MOB_RADIUS, MOB_HEIGHT)) {
    if (!checkCollision(newX, m.y + 1, m.z, MOB_RADIUS, MOB_HEIGHT)) {
      m.vy = 4;
      m.x = newX;
    } else {
      m.vx = 0;
    }
  } else {
    m.x = newX;
  }

  const newZ = m.z + m.vz * dt;
  if (checkCollision(m.x, m.y, newZ, MOB_RADIUS, MOB_HEIGHT)) {
    if (!checkCollision(m.x, m.y + 1, newZ, MOB_RADIUS, MOB_HEIGHT)) {
      m.vy = 4;
      m.z = newZ;
    } else {
      m.vz = 0;
    }
  } else {
    m.z = newZ;
  }

  // 攻撃開始判定（高さ・向きを含む）
  const canStartPlayerAttack = canMeleeHitPlayer(
    m.x, m.y, m.z, m.rotation,
    targetX, targetY, targetZ,
    {
      attackRange: ZOMBIE_ATTACK_RANGE,
      attackMinY: -0.2,
      attackMaxY: MOB_HEIGHT + 0.35,
      requireFacing: !targetingCore,
      facingDotMin: 0.15,
    },
  );

  if (!isAttacking && canStartPlayerAttack && state.attackCooldown <= 0) {
    const damage = Math.max(1, Math.round(ZOMBIE_ATTACK_DAMAGE * attackMultiplier));
    if (targetingCore && corePosition) {
      startZombieAttack(m, state, damage, 0, 0, corePosition);
    } else {
      startZombieAttack(m, state, damage, playerX - m.x, playerZ - m.z);
    }
  }

  if (!state.blockAttackCooldown) state.blockAttackCooldown = 0;
  state.blockAttackCooldown = Math.max(0, state.blockAttackCooldown - dt);

  if (
    !blockAttack
    && !isAttacking
    && distXZ > ZOMBIE_STOP_RANGE
    && Math.abs(m.vx) < 0.1
    && Math.abs(m.vz) < 0.1
    && m.hitTimer <= 0
  ) {
    const lookAngle = m.rotation;
    const bx = Math.floor(m.x + Math.sin(lookAngle) * 1.0);
    const bz = Math.floor(m.z + Math.cos(lookAngle) * 1.0);
    const by = Math.floor(m.y + 0.5);
    const byFoot = Math.floor(m.y);

    if (getBlock && state.blockAttackCooldown <= 0) {
      const blockIdObj = getBlock(bx, by, bz);
      const blockIdFoot = getBlock(bx, byFoot, bz);
      if (blockIdObj !== 0 && blockIdObj !== 7) {
        blockAttack = { x: bx, y: by, z: bz, damage: 1 };
        state.blockAttackCooldown = 1.0;
      } else if (blockIdFoot !== 0 && blockIdFoot !== 7) {
        blockAttack = { x: bx, y: byFoot, z: bz, damage: 1 };
        state.blockAttackCooldown = 1.0;
      }
    }
  }

  return { alive: m.y >= -20, attack, blockAttack };
}
