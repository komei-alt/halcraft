// 巨大ボス AI
// 圧倒的な力で迫る巨大な敵。
// 地形を破壊し、取り巻きを召喚する。

import type { MobData } from '../../stores/useMobStore';
import { useMobStore } from '../../stores/useMobStore';
import { spawnBlockUseEffect } from '../effectTriggers';
import { playBossSummonSound } from '../sounds';
import {
  applyMobGravityAndYCollision,
  type MobAIContext,
} from './constants';

const BOSS_SPEED = 1.5; // 少し遅い
const BOSS_STOP_RANGE = 2.0;
const BOSS_ATTACK_RANGE = 2.5;
const BOSS_ATTACK_DAMAGE = 5;
const BOSS_ATTACK_COOLDOWN = 2.0;
const BOSS_HEIGHT = 4.8;
const BOSS_RADIUS = 1.2;

export interface BossState {
  attackCooldown: number;
  summonCooldown: number;
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

  const dx = playerX - m.x;
  const dz = playerZ - m.z;
  const distXZ = Math.sqrt(dx * dx + dz * dz);
  const speed = BOSS_SPEED * (m.speedMultiplier ?? 1);

  // プレイヤーに向かって移動
  if (distXZ > BOSS_STOP_RANGE) {
    m.rotation = Math.atan2(dx, dz);
    if (m.hitTimer <= 0) {
      const nx = Math.sin(m.rotation);
      const nz = Math.cos(m.rotation);
      m.vx = nx * speed;
      m.vz = nz * speed;
    }
  } else {
    m.vx = 0;
    m.vz = 0;
    if (distXZ > 0.1) {
      m.rotation = Math.atan2(dx, dz);
    }
  }

  // ノックバック減衰
  if (m.hitTimer > 0) {
    m.vx *= 0.5; // ボスはノックバックに強い
    m.vz *= 0.5;
  }

  // 物理更新
  applyMobGravityAndYCollision(m, dt, checkCollision, BOSS_RADIUS, BOSS_HEIGHT, ctx.getBlock);

  // 移動による地形破壊（足元のブロックを強制破壊）
  // XY方向に進もうとしたときに段差があれば壊して進む
  const newX = m.x + m.vx * dt;
  if (checkCollision(newX, m.y + 0.5, m.z, BOSS_RADIUS, BOSS_HEIGHT)) {
    // 進行方向のブロックを破壊してみる
    const bx = Math.floor(newX + Math.sign(m.vx) * BOSS_RADIUS);
    const by = Math.floor(m.y + 1);
    const bz = Math.floor(m.z);
    breakBlock(bx, by, bz);
    breakBlock(bx, by + 1, bz); // 大きいため2段壊す
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


  // 攻撃判定
  let attack: BossAttackResult | null = null;
  const playerDy = m.y - playerY;
  const yClose = Math.abs(playerDy) < BOSS_HEIGHT + 0.5;

  if (distXZ < BOSS_ATTACK_RANGE && yClose && state.attackCooldown <= 0) {
    attack = {
      damage: Math.max(1, Math.round(BOSS_ATTACK_DAMAGE * (m.attackMultiplier ?? 1))),
      kbDirX: playerX - m.x,
      kbDirZ: playerZ - m.z,
    };
    state.attackCooldown = BOSS_ATTACK_COOLDOWN;
  }

  // 取り巻きの召喚
  if (!state.summonCooldown) state.summonCooldown = 0;
  state.summonCooldown -= dt;

  // HPが減っているほど召喚頻度アップ (20秒〜5秒間隔)
  const hpRatio = m.hp / m.maxHp;
  if (state.summonCooldown <= 0) {
    // 目の前にマップ別の取り巻きを召喚
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
