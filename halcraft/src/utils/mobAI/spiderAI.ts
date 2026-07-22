// クモ AI
// 攻撃的な敵モブ。プレイヤーに高速で接近し攻撃。

import type { MobData } from '../../stores/useMobStore';
import {
  triggerMeleeSwingSound,
  triggerMobMeleeHitFeedback,
} from '../mobMeleeFeedback';
import {
  SPIDER_SPEED, SPIDER_STOP_RANGE, SPIDER_ATTACK_RANGE,
  SPIDER_ATTACK_DAMAGE, SPIDER_ATTACK_COOLDOWN,
  SPIDER_ATTACK_ANIM_DURATION, SPIDER_ATTACK_HIT_AT,
  SPIDER_HEIGHT, SPIDER_RADIUS,
  applyMobGravityAndYCollision,
  type MobAIContext,
} from './constants';

/** クモ固有の状態 */
export interface SpiderState {
  attackCooldown: number;
  attackElapsed: number;
  attackHitApplied: boolean;
  swingSoundPlayed: boolean;
  pendingDamage: number;
  pendingKbX: number;
  pendingKbZ: number;
}

/** 攻撃結果 */
export interface SpiderAttackResult {
  damage: number;
  kbDirX: number;
  kbDirZ: number;
}

/**
 * クモ1体のAI更新
 */
export function updateSpiderAI(
  m: MobData,
  ctx: MobAIContext,
  state: SpiderState,
): { alive: boolean; attack: SpiderAttackResult | null } {
  const { dt, playerX, playerZ, playerY, checkCollision } = ctx;

  if (state.attackElapsed === undefined) state.attackElapsed = 0;
  if (state.attackHitApplied === undefined) state.attackHitApplied = false;
  if (state.swingSoundPlayed === undefined) state.swingSoundPlayed = false;
  if (state.pendingDamage === undefined) state.pendingDamage = 0;

  const dxS = playerX - m.x;
  const dzS = playerZ - m.z;
  const distS = Math.sqrt(dxS * dxS + dzS * dzS);
  const speedMultiplier = m.speedMultiplier ?? 1;
  const attackMultiplier = m.attackMultiplier ?? 1;
  const isAttacking = (m.attackTimer ?? 0) > 0;

  let attack: SpiderAttackResult | null = null;

  if (isAttacking) {
    state.attackElapsed += dt;
    if (!state.swingSoundPlayed && state.attackElapsed >= 0.08) {
      state.swingSoundPlayed = true;
      triggerMeleeSwingSound();
    }
    if (!state.attackHitApplied && state.attackElapsed >= SPIDER_ATTACK_HIT_AT) {
      state.attackHitApplied = true;
      const hx = playerX;
      const hy = playerY + 0.9;
      const hz = playerZ;
      let dirX = hx - m.x;
      let dirZ = hz - m.z;
      let dirY = hy - (m.y + 0.4);
      const len = Math.hypot(dirX, dirY, dirZ) || 1;
      dirX /= len; dirY /= len; dirZ /= len;
      triggerMobMeleeHitFeedback(m.type, hx, hy, hz, dirX, dirY, dirZ);
      attack = {
        damage: state.pendingDamage,
        kbDirX: state.pendingKbX,
        kbDirZ: state.pendingKbZ,
      };
    }
    m.vx = 0;
    m.vz = 0;
    if (distS > 0.1) m.rotation = Math.atan2(dxS, dzS);
  } else if (distS > SPIDER_STOP_RANGE) {
    if (distS > 0.1) {
      m.rotation = Math.atan2(dxS, dzS);
    }
    const nxS = dxS / distS;
    const nzS = dzS / distS;
    const chaseVx = nxS * SPIDER_SPEED * speedMultiplier;
    const chaseVz = nzS * SPIDER_SPEED * speedMultiplier;
    if (m.hitTimer > 0) {
      m.vx = m.vx * 0.5 + chaseVx * 0.75;
      m.vz = m.vz * 0.5 + chaseVz * 0.75;
    } else {
      m.vx = chaseVx;
      m.vz = chaseVz;
    }
  } else {
    m.vx = 0;
    m.vz = 0;
    if (distS > 0.1) m.rotation = Math.atan2(dxS, dzS);
  }

  applyMobGravityAndYCollision(m, dt, checkCollision, SPIDER_RADIUS, SPIDER_HEIGHT, ctx.getBlock);

  const newXS = m.x + m.vx * dt;
  if (checkCollision(newXS, m.y, m.z, SPIDER_RADIUS, SPIDER_HEIGHT)) {
    if (!checkCollision(newXS, m.y + 1, m.z, SPIDER_RADIUS, SPIDER_HEIGHT)) {
      m.vy = 5;
      m.x = newXS;
    } else {
      m.vx = 0;
    }
  } else {
    m.x = newXS;
  }

  const newZS = m.z + m.vz * dt;
  if (checkCollision(m.x, m.y, newZS, SPIDER_RADIUS, SPIDER_HEIGHT)) {
    if (!checkCollision(m.x, m.y + 1, newZS, SPIDER_RADIUS, SPIDER_HEIGHT)) {
      m.vy = 5;
      m.z = newZS;
    } else {
      m.vz = 0;
    }
  } else {
    m.z = newZS;
  }

  const playerDyS = m.y - playerY;
  const yCloseS = Math.abs(playerDyS) < SPIDER_HEIGHT + 0.5;
  if (!isAttacking && distS < SPIDER_ATTACK_RANGE && yCloseS && state.attackCooldown <= 0) {
    state.attackCooldown = SPIDER_ATTACK_COOLDOWN;
    state.attackElapsed = 0;
    state.attackHitApplied = false;
    state.swingSoundPlayed = false;
    state.pendingDamage = Math.max(1, Math.round(SPIDER_ATTACK_DAMAGE * attackMultiplier));
    state.pendingKbX = playerX - m.x;
    state.pendingKbZ = playerZ - m.z;
    m.attackTimer = SPIDER_ATTACK_ANIM_DURATION;
    m.vx = 0;
    m.vz = 0;
  }

  return { alive: m.y >= -20, attack };
}
