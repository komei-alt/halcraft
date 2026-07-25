import { describe, expect, it } from 'vitest';
import { resolveAmbientBedKey } from './ambientBeds';

describe('環境録音ベッド選択', () => {
  const base = {
    biome: 'forest' as const,
    isNight: false,
    isUnderground: false,
    isUnderwater: false,
    dimension: 'overworld' as const,
  };

  it('昼夜とバイオームを選び分ける', () => {
    expect(resolveAmbientBedKey(base)).toBe('forest.day');
    expect(resolveAmbientBedKey({ ...base, biome: 'snow', isNight: true })).toBe('snow.night');
  });

  it('水中と洞窟をバイオームより優先する', () => {
    expect(resolveAmbientBedKey({ ...base, isUnderground: true })).toBe('cave');
    expect(resolveAmbientBedKey({ ...base, isUnderground: true, isUnderwater: true })).toBe('underwater');
  });

  it('ネザーの昼夜ベッドを独立させる', () => {
    expect(resolveAmbientBedKey({ ...base, dimension: 'nether' })).toBe('nether.day');
    expect(resolveAmbientBedKey({ ...base, dimension: 'nether', isNight: true })).toBe('nether.night');
  });
});
