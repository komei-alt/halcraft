import { describe, expect, it } from 'vitest';
import { resolveBGMTrack } from './musicManager';

describe('resolveBGMTrack', () => {
  it('森林の建築ステージでは森林曲を選ぶ', () => {
    expect(resolveBGMTrack({ biome: 'forest', category: 'build' })).toBe('forest');
  });

  it('戦闘が始まるとバイオームより戦闘曲を優先する', () => {
    expect(resolveBGMTrack({ biome: 'forest', category: 'build', combatIntensity: 0.4 })).toBe('battle');
  });

  it('ボス曲を最優先する', () => {
    expect(resolveBGMTrack({ dimension: 'nether', combatIntensity: 1, bossActive: true })).toBe('boss');
  });

  it('戦闘後の保持時間中は戦闘曲を続ける', () => {
    expect(resolveBGMTrack({ biome: 'tropical', category: 'build' }, true)).toBe('battle');
  });

  it('通常の探索では探索曲を選ぶ', () => {
    expect(resolveBGMTrack({ biome: 'desert', category: 'build' })).toBe('exploration');
  });
});
