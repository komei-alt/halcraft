import { describe, expect, it } from 'vitest';
import type { MobData } from '../../stores/useMobStore';
import { BLOCK_IDS } from '../../types/blocks';
import { checkAABBCollision } from '../collision';
import {
  applyMobGravityAndYCollision,
  canEntityAabbsReach,
  canMeleeHitPlayer,
  MOB_HEIGHT,
  MOB_RADIUS,
} from './constants';

function createMob(y: number, vy: number): MobData {
  return {
    id: 'test-mob',
    type: 'zombie',
    x: 0.5,
    y,
    z: 0.5,
    hp: 10,
    maxHp: 10,
    vx: 0,
    vy,
    vz: 0,
    rotation: 0,
    hitTimer: 0,
    hitDirX: 0,
    hitDirZ: 0,
    attackTimer: 0,
    burnTimer: 0,
    isAlly: false,
    angryAtPlayer: false,
    angryTimer: 0,
  };
}

describe('mob 3D physics contract', () => {
  it('1フレームで1.5ブロック落下しても1ブロック床を貫通しない', () => {
    const getBlock = (x: number, y: number, z: number) => {
      void x;
      void z;
      return y === 0 ? BLOCK_IDS.BEDROCK : BLOCK_IDS.AIR;
    };
    const checkCollision = (x: number, y: number, z: number, radius: number, height: number) =>
      checkAABBCollision(getBlock, x, y, z, radius, height);
    const mob = createMob(2, -30);

    const result = applyMobGravityAndYCollision(mob, 0.05, checkCollision, MOB_RADIUS, MOB_HEIGHT, getBlock);

    expect(result.onGround).toBe(true);
    expect(mob.y).toBeCloseTo(1.001, 3);
    expect(mob.vy).toBe(0);
  });

  it('水平位置が同じでも上下に離れた対象は近接範囲外になる', () => {
    expect(canEntityAabbsReach(
      { x: 0, y: 1, z: 0, radius: 0.3, height: 1.8 },
      { x: 0, y: 12, z: 0, radius: 0.3, height: 1.7 },
      1.5,
    )).toBe(false);
    expect(canMeleeHitPlayer(0, 1, 0, 0, 0, 12, 0, {
      attackRange: 1.5,
      attackMinY: -0.2,
      attackMaxY: 2.15,
    })).toBe(false);
  });

  it('同じ地面で隣接した対象は近接範囲内になる', () => {
    expect(canEntityAabbsReach(
      { x: 0, y: 1, z: 0, radius: 0.3, height: 1.8 },
      { x: 1.2, y: 1, z: 0, radius: 0.3, height: 1.7 },
      1.5,
    )).toBe(true);
  });
});
