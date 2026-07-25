import { describe, expect, it } from 'vitest';
import { BLOCK_IDS } from '../types/blocks';
import { FOOTSTEP_SURFACES, resolveFootstepSurface } from './footsteps';

describe('足音の接地素材判定', () => {
  it('主要ブロックを耳で区別できる素材へ割り当てる', () => {
    expect(resolveFootstepSurface(BLOCK_IDS.GRASS)).toBe('grass');
    expect(resolveFootstepSurface(BLOCK_IDS.SAND)).toBe('sand');
    expect(resolveFootstepSurface(BLOCK_IDS.SNOW)).toBe('snow');
    expect(resolveFootstepSurface(BLOCK_IDS.WOOD)).toBe('wood');
    expect(resolveFootstepSurface(BLOCK_IDS.IRON)).toBe('metal');
    expect(resolveFootstepSurface(BLOCK_IDS.GLASS)).toBe('glass');
    expect(resolveFootstepSurface(BLOCK_IDS.NETHERRACK)).toBe('nether');
  });

  it('足元を取得できない時だけバイオームで補完する', () => {
    expect(resolveFootstepSurface(BLOCK_IDS.AIR, 'snow')).toBe('snow');
    expect(resolveFootstepSurface(BLOCK_IDS.AIR, 'desert')).toBe('sand');
  });

  it('すべての表面プロファイル名が一意', () => {
    expect(new Set(FOOTSTEP_SURFACES).size).toBe(FOOTSTEP_SURFACES.length);
  });
});
