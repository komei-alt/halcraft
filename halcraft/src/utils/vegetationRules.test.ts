import { describe, expect, it } from 'vitest';
import { BLOCK_IDS } from '../types/blocks';
import { resolveDecorativeDrop } from '../data/blockMaterials';
import { checkAABBCollision, getBlockCollisionBoxes, isBlockSolid } from './collision';
import { PERFORMANCE_PROFILES } from './performance';

describe('vegetation collision, drops and LOD', () => {
  it('地表植物は非衝突、サボテンは内側AABB、氷は固体', () => {
    expect(isBlockSolid(BLOCK_IDS.TALL_GRASS)).toBe(false);
    expect(isBlockSolid(BLOCK_IDS.WILDFLOWER)).toBe(false);
    expect(isBlockSolid(BLOCK_IDS.FROST_GRASS)).toBe(false);
    expect(isBlockSolid(BLOCK_IDS.CACTUS)).toBe(true);
    expect(isBlockSolid(BLOCK_IDS.ICE)).toBe(true);
    expect(getBlockCollisionBoxes(BLOCK_IDS.CACTUS)[0]).toMatchObject({
      minX: 0.12,
      maxX: 0.88,
      minZ: 0.12,
      maxZ: 0.88,
    });

    const getCactus = (x: number, y: number, z: number) => (
      x === 0 && y === 0 && z === 0 ? BLOCK_IDS.CACTUS : BLOCK_IDS.AIR
    );
    expect(checkAABBCollision(getCactus, 0.03, 0, 0.03, 0.02, 0.9)).toBe(false);
    expect(checkAABBCollision(getCactus, 0.5, 0, 0.5, 0.2, 0.9)).toBe(true);
  });

  it('装飾ドロップは座標に対して決定的で、種類別ルールを守る', () => {
    expect(resolveDecorativeDrop(BLOCK_IDS.BUSH, 1, 2, 3)).toBe(BLOCK_IDS.LEAVES);
    expect(resolveDecorativeDrop(BLOCK_IDS.DEAD_BUSH, 1, 2, 3)).toBe(BLOCK_IDS.STICK);
    expect(resolveDecorativeDrop(BLOCK_IDS.CACTUS, 1, 2, 3)).toBe(BLOCK_IDS.CACTUS);
    expect(resolveDecorativeDrop(BLOCK_IDS.REED, 1, 2, 3)).toBeNull();
    expect(resolveDecorativeDrop(BLOCK_IDS.MUSHROOM, 1, 2, 3)).toBeNull();
    const first = resolveDecorativeDrop(BLOCK_IDS.TALL_GRASS, 17, 23, -9);
    expect(resolveDecorativeDrop(BLOCK_IDS.TALL_GRASS, 17, 23, -9)).toBe(first);
  });

  it('品質設定ごとに3段/2段/単純LOD、密度、風、粒子上限を持つ', () => {
    expect(PERFORMANCE_PROFILES.high.vegetationLodDistances).toHaveLength(3);
    expect(PERFORMANCE_PROFILES.high.vegetationDensity).toBe(1);
    expect(PERFORMANCE_PROFILES.balanced.vegetationLodDistances).toHaveLength(2);
    expect(PERFORMANCE_PROFILES.balanced.vegetationDensity).toBe(0.75);
    expect(PERFORMANCE_PROFILES.low.vegetationLodDistances).toHaveLength(1);
    expect(PERFORMANCE_PROFILES.low.vegetationDensity).toBeGreaterThanOrEqual(0.55);
    expect(PERFORMANCE_PROFILES.low.vegetationDensity).toBeLessThanOrEqual(0.6);
    expect(PERFORMANCE_PROFILES.low.vegetationChunkRadius).toBe(4);
    expect(PERFORMANCE_PROFILES.low.vegetationWind).toBe(0);
    expect(PERFORMANCE_PROFILES.low.particleBudget).toBeLessThan(PERFORMANCE_PROFILES.high.particleBudget);
  });
});
