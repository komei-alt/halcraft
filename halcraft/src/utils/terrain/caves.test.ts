import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE } from '../../types/blocks';
import { buildCaveCeilingMap } from './caves';
import { getTerrainHeight } from './heightmap';

describe('傾斜対応の洞窟地表殻', () => {
  it('各列の洞窟上限を周囲5ブロックの最も低い地表より4段下に制限する', () => {
    const cx = 0;
    const cz = 0;
    const ceilings = buildCaveCeilingMap(cx, cz);

    expect(ceilings).toHaveLength(CHUNK_SIZE);
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        let minimumSurfaceY = Number.POSITIVE_INFINITY;
        for (let dx = -5; dx <= 5; dx++) {
          for (let dz = -5; dz <= 5; dz++) {
            minimumSurfaceY = Math.min(
              minimumSurfaceY,
              getTerrainHeight(cx * CHUNK_SIZE + lx + dx, cz * CHUNK_SIZE + lz + dz),
            );
          }
        }
        expect(ceilings[lx][lz]).toBeLessThanOrEqual(minimumSurfaceY - 4);
      }
    }
  });
});
