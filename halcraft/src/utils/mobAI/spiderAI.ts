// クモ AI
// 攻撃的な敵モブ。プレイヤーに高速で接近し攻撃。

import type { MobData } from '../../stores/useMobStore';
import {
  SPIDER_SPEED, SPIDER_STOP_RANGE, SPIDER_ATTACK_RANGE,
  SPIDER_ATTACK_DAMAGE, SPIDER_ATTACK_COOLDOWN,
  SPIDER_HEIGHT, SPIDER_RADIUS,
  applyMobGravityAndYCollision,
  type MobAIContext,
} from './constants';

/** クモ固有の状態 */
export interface SpiderState {
  attackCooldown: number;
}

/** 攻撃結果 */
export interface SpiderAttackResult {
  damage: number;
  kbDirX: number;
  kbDirZ: number;
}

/**
 * クモ1体のAI更新
 * @returns null なら削除、SpiderAttackResult なら攻撃あり
 */
export function updateSpiderAI(
  m: MobData,
  ctx: MobAIContext,
  state: SpiderState,
): { alive: boolean; attack: SpiderAttackResult | null } {
  const { dt, playerX, playerZ, playerY, checkCollision } = ctx;

  const dxS = playerX - m.x;
  const dzS = playerZ - m.z;
  const distS = Math.sqrt(dxS * dxS + dzS * dzS);

  if (distS > SPIDER_STOP_RANGE) {
    if (distS > 0.1) {
      m.rotation = Math.atan2(dxS, dzS);
    }
    if (m.hitTimer <= 0) {
      const nxS = dxS / distS;
      const nzS = dzS / distS;
      m.vx = nxS * SPIDER_SPEED;
      m.vz = nzS * SPIDER_SPEED;
    }
  } else {
    m.vx = 0;
    m.vz = 0;
    if (distS > 0.1) m.rotation = Math.atan2(dxS, dzS);
  }

  // 物理
  const { onGround: _spiderOnGround } = applyMobGravityAndYCollision(m, dt, checkCollision, SPIDER_RADIUS, SPIDER_HEIGHT);

  // X衝突
  const newXS = m.x + m.vx * dt;
  if (checkCollision(newXS, m.y, m.z, SPIDER_RADIUS, SPIDER_HEIGHT)) {
    if (m.hitTimer <= 0 && !checkCollision(newXS, m.y + 1, m.z, SPIDER_RADIUS, SPIDER_HEIGHT)) {
      m.vy = 5;
      m.x = newXS;
    } else {
      m.vx = 0;
    }
  } else {
    m.x = newXS;
  }

  // Z衝突
  const newZS = m.z + m.vz * dt;
  if (checkCollision(m.x, m.y, newZS, SPIDER_RADIUS, SPIDER_HEIGHT)) {
    if (m.hitTimer <= 0 && !checkCollision(m.x, m.y + 1, newZS, SPIDER_RADIUS, SPIDER_HEIGHT)) {
      m.vy = 5;
      m.z = newZS;
    } else {
      m.vz = 0;
    }
  } else {
    m.z = newZS;
  }

  // ノックバック減衰
  if (m.hitTimer > 0) {
    m.vx *= 0.85;
    m.vz *= 0.85;
  }

  // プレイヤー攻撃判定
  let attack: SpiderAttackResult | null = null;
  const playerDyS = m.y - playerY;
  const yCloseS = Math.abs(playerDyS) < SPIDER_HEIGHT + 0.5;
  if (distS < SPIDER_ATTACK_RANGE && yCloseS && state.attackCooldown <= 0) {
    attack = {
      damage: SPIDER_ATTACK_DAMAGE,
      kbDirX: playerX - m.x,
      kbDirZ: playerZ - m.z,
    };
    state.attackCooldown = SPIDER_ATTACK_COOLDOWN;
  }

  return { alive: m.y >= -20, attack };
}
