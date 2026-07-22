// 巨大ボス AI
// 圧倒的な力で迫る巨大な敵。
// 地形を破壊し、取り巻きを召喚する。

import type { MobData } from '../../stores/useMobStore';
import { useMobStore } from '../../stores/useMobStore';
import { spawnBlockUseEffect } from '../effectTriggers';
import {
  triggerMeleeSwingSound,
  triggerMobMeleeHitFeedback,
} from '../mobMeleeFeedback';
import { playBossSummonSound } from '../sounds';
import {
  applyMobGravityAndYCollision,
  BOSS_ATTACK_ANIM_DURATION,
  BOSS_ATTACK_HIT_AT,
  type MobAIContext,
} from './constants';

const BOSS_SPEED = 1.5;
const BOSS_STOP_RANGE = 2.0;
const BOSS_ATTACK_RANGE = 2.5;
const BOSS_ATTACK_DAMAGE = 5;
const BOSS_ATTACK_COOLDOWN = 2.0;
const BOSS_HEIGHT = 4.8;
const BOSS_RADIUS = 1.2;

export interface BossState {
  attackCooldown: number;
  summonCooldown: number;
  attackElapsed: number;
  attackHitApplied: boolean;
  swingSoundPlayed: boolean;
  pendingDamage: number;
  pendingKbX: number;
  pendingKbZ: number;
}

export interface BossAttackResult {
  damage: number;
  kbDirX: number;
  kbDirZ: number;
}

/**
 * 巨大ボスのAI更新
 */
export function updateBossAI(
  m: MobData,
  ctx: MobAIContext,
  state: BossState,
  breakBlock: (x: number, y: number, z: number) => boolean,
): { alive: boolean; attack: BossAttackResult | null } {
  const { dt, playerX, playerZ, playerY, checkCollision } = ctx;

  if (state.attackElapsed === undefined) state.attackElapsed = 0;
  if (state.attackHitApplied === undefined) state.attackHitApplied = false;
  if (state.swingSoundPlayed === undefined) state.swingSoundPlayed = false;
  if (state.pendingDamage === undefined) state.pendingDamage = 0;

  const dx = playerX - m.x;
  const dz = playerZ - m.z;
  const distXZ = Math.sqrt(dx * dx + dz * dz);
  const speed = BOSS_SPEED * (m.speedMultiplier ?? 1);
  const isAttacking = (m.attackTimer ?? 0) > 0;

  let attack: BossAttackResult | null = null;

  if (isAttacking) {
    state.attackElapsed += dt;
    if (!state.swingSoundPlayed && state.attackElapsed >= 0.18) {
      state.swingSoundPlayed = true;
      triggerMeleeSwingSound();
    }
    if (!state.attackHitApplied && state.attackElapsed >= BOSS_ATTACK_HIT_AT) {
      state.attackHitApplied = true;
      const hx = playerX;
      const hy = playerY + 1.2;
      const hz = playerZ;
      let dirX = hx - m.x;
      let dirZ = hz - m.z;
      let dirY = hy - (m.y + 2.0);
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
    if (distXZ > 0.1) {
      m.rotation = Math.atan2(dx, dz);
    }
  } else if (distXZ > BOSS_STOP_RANGE) {
    m.rotation = Math.atan2(dx, dz);
    const nx = Math.sin(m.rotation);
    const nz = Math.cos(m.rotation);
    const chaseVx = nx * speed;
    const chaseVz = nz * speed;
    if (m.hitTimer > 0) {
      m.vx = m.vx * 0.25 + chaseVx * 0.9;
      m.vz = m.vz * 0.25 + chaseVz * 0.9;
    } else {
      m.vx = chaseVx;
      m.vz = chaseVz;
    }
  } else {
    m.vx = 0;
    m.vz = 0;
    if (distXZ > 0.1) {
      m.rotation = Math.atan2(dx, dz);
    }
  }

  applyMobGravityAndYCollision(m, dt, checkCollision, BOSS_RADIUS, BOSS_HEIGHT, ctx.getBlock);

  const newX = m.x + m.vx * dt;
  if (checkCollision(newX, m.y + 0.5, m.z, BOSS_RADIUS, BOSS_HEIGHT)) {
    const bx = Math.floor(newX + Math.sign(m.vx) * BOSS_RADIUS);
    const by = Math.floor(m.y + 1);
    const bz = Math.floor(m.z);
    breakBlock(bx, by, bz);
    breakBlock(bx, by + 1, bz);
  }
  m.x = newX;

  const newZ = m.z + m.vz * dt;
  if (checkCollision(m.x, m.y + 0.5, newZ, BOSS_RADIUS, BOSS_HEIGHT)) {
    const bx = Math.floor(m.x);
    const by = Math.floor(m.y + 1);
    const bz = Math.floor(newZ + Math.sign(m.vz) * BOSS_RADIUS);
    breakBlock(bx, by, bz);
    breakBlock(bx, by + 1, bz);
  }
  m.z = newZ;

  const playerDy = m.y - playerY;
  const yClose = Math.abs(playerDy) < BOSS_HEIGHT + 0.5;

  if (!isAttacking && distXZ < BOSS_ATTACK_RANGE && yClose && state.attackCooldown <= 0) {
    state.attackCooldown = BOSS_ATTACK_COOLDOWN;
    state.attackElapsed = 0;
    state.attackHitApplied = false;
    state.swingSoundPlayed = false;
    state.pendingDamage = Math.max(1, Math.round(BOSS_ATTACK_DAMAGE * (m.attackMultiplier ?? 1)));
    state.pendingKbX = playerX - m.x;
    state.pendingKbZ = playerZ - m.z;
    m.attackTimer = BOSS_ATTACK_ANIM_DURATION;
    m.vx = 0;
    m.vz = 0;
  }

  if (!state.summonCooldown) state.summonCooldown = 0;
  state.summonCooldown -= dt;

  const hpRatio = m.hp / m.maxHp;
  if (state.summonCooldown <= 0) {
    const sx = m.x + Math.sin(m.rotation) * 2;
    const sz = m.z + Math.cos(m.rotation) * 2;
    useMobStore.getState().spawnMob(m.bossSummonType ?? 'spider', sx, m.y + 2, sz, ctx.enemyTuning);
    spawnBlockUseEffect('summon', Math.floor(sx), Math.floor(m.y), Math.floor(sz), m.traitAccent ?? '#ffdd66');
    playBossSummonSound(Math.sqrt((ctx.playerX - sx) ** 2 + (ctx.playerZ - sz) ** 2));

    const minSeconds = m.bossSummonMinSeconds ?? 5;
    const maxSeconds = m.bossSummonMaxSeconds ?? 20;
    state.summonCooldown = minSeconds + hpRatio * Math.max(0, maxSeconds - minSeconds);
  }

  return { alive: m.y >= -20, attack };
}
