// ニワトリ AI
// パッシブな中立モブ。近づくと逃げる、遠いとランダム歩行。

import type { MobData } from '../../stores/useMobStore';
import {
  CHICKEN_SPEED, CHICKEN_FLEE_RANGE, CHICKEN_FLEE_SPEED,
  CHICKEN_WANDER_INTERVAL, CHICKEN_HEIGHT, CHICKEN_RADIUS,
  applyMobGravityAndYCollision,
  type MobAIContext,
} from './constants';

/** ニワトリ固有の状態（ref で保持） */
export interface ChickenState {
  wanderTimers: Map<string, number>;
  wanderDirs: Map<string, number>;
}

/**
 * ニワトリ1体のAI更新
 * @returns false なら削除
 */
export function updateChickenAI(
  m: MobData,
  ctx: MobAIContext,
  state: ChickenState,
): boolean {
  const { dt, playerX, playerZ, checkCollision, animTime } = ctx;

  const dxC = playerX - m.x;
  const dzC = playerZ - m.z;
  const distC = Math.sqrt(dxC * dxC + dzC * dzC);

  // ワンダータイマー管理
  let wanderTimer = state.wanderTimers.get(m.id) ?? 0;
  let wanderDir = state.wanderDirs.get(m.id) ?? Math.random() * Math.PI * 2;
  wanderTimer += dt;

  if (distC < CHICKEN_FLEE_RANGE) {
    // プレイヤーから逃げる
    const fleeX = -dxC;
    const fleeZ = -dzC;
    const fleeDist = Math.sqrt(fleeX * fleeX + fleeZ * fleeZ);
    if (fleeDist > 0.01) {
      m.rotation = Math.atan2(fleeX, fleeZ);
      m.vx = (fleeX / fleeDist) * CHICKEN_FLEE_SPEED;
      m.vz = (fleeZ / fleeDist) * CHICKEN_FLEE_SPEED;
    }
  } else if (wanderTimer > CHICKEN_WANDER_INTERVAL) {
    // ランダムに方向転換
    wanderDir = Math.random() * Math.PI * 2;
    wanderTimer = 0;
    state.wanderDirs.set(m.id, wanderDir);
  } else {
    // ゆっくり歩き回る
    m.rotation = wanderDir;
    m.vx = Math.sin(wanderDir) * CHICKEN_SPEED * 0.5;
    m.vz = Math.cos(wanderDir) * CHICKEN_SPEED * 0.5;
    // たまに止まる
    if (Math.sin(animTime * 0.3 + parseInt(m.id.replace('mob_', ''), 10)) > 0.3) {
      m.vx = 0;
      m.vz = 0;
    }
  }
  state.wanderTimers.set(m.id, wanderTimer);

  // 物理（共通関数使用）
  applyMobGravityAndYCollision(m, dt, checkCollision, CHICKEN_RADIUS, CHICKEN_HEIGHT);

  // X衝突（壁にぶつかったら方向転換）
  const newXC = m.x + m.vx * dt;
  if (checkCollision(newXC, m.y, m.z, CHICKEN_RADIUS, CHICKEN_HEIGHT)) {
    if (!checkCollision(newXC, m.y + 1, m.z, CHICKEN_RADIUS, CHICKEN_HEIGHT)) {
      m.vy = 4;
      m.x = newXC;
    } else {
      m.vx = 0;
      state.wanderDirs.set(m.id, wanderDir + Math.PI);
    }
  } else {
    m.x = newXC;
  }

  // Z衝突
  const newZC = m.z + m.vz * dt;
  if (checkCollision(m.x, m.y, newZC, CHICKEN_RADIUS, CHICKEN_HEIGHT)) {
    if (!checkCollision(m.x, m.y + 1, newZC, CHICKEN_RADIUS, CHICKEN_HEIGHT)) {
      m.vy = 4;
      m.z = newZC;
    } else {
      m.vz = 0;
      state.wanderDirs.set(m.id, wanderDir + Math.PI);
    }
  } else {
    m.z = newZC;
  }

  // 落下削除
  return m.y >= -20;
}
