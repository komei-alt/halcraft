// ハルクラ地形ノイズ v2
// 固定値を乱数源にしていた旧実装を廃止し、バイオームシードから独立したノイズ場を生成する。

import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { getCurrentBiome } from './biomeConfig';

export type TerrainNoiseChannel =
  | 'continental'
  | 'erosion'
  | 'ridge'
  | 'detail'
  | 'warpX'
  | 'warpZ'
  | 'river'
  | 'vegetation';

interface NoiseSuite {
  key: string;
  channels: Record<TerrainNoiseChannel, NoiseFunction2D>;
}

const CHANNEL_SALTS: Record<TerrainNoiseChannel, number> = {
  continental: 0x2f6e2b1,
  erosion: 0x6c8e9cf,
  ridge: 0x44d62d7,
  detail: 0x7a31b89,
  warpX: 0x19c43a5,
  warpZ: 0x51b2e73,
  river: 0x3d71f91,
  vegetation: 0x8a53c17,
};

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 高速で再現可能な32bit乱数。simplex-noise の permutation 生成専用。 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function getBiomeNoiseKey(): string {
  const biome = getCurrentBiome();
  return `${biome.id}:${biome.noiseSeed.toFixed(8)}`;
}

function createSuite(): NoiseSuite {
  const key = getBiomeNoiseKey();
  const baseSeed = hashString(key);
  const channels = {} as Record<TerrainNoiseChannel, NoiseFunction2D>;

  for (const channel of Object.keys(CHANNEL_SALTS) as TerrainNoiseChannel[]) {
    channels[channel] = createNoise2D(mulberry32(baseSeed ^ CHANNEL_SALTS[channel]));
  }

  return { key, channels };
}

let activeSuite = createSuite();

function getSuite(): NoiseSuite {
  const key = getBiomeNoiseKey();
  if (activeSuite.key !== key) activeSuite = createSuite();
  return activeSuite;
}

/** バイオーム切替時に全ノイズ場を再構築する。 */
export function resetNoiseForBiome(): void {
  activeSuite = createSuite();
}

export function getNoiseField(channel: TerrainNoiseChannel): NoiseFunction2D {
  return getSuite().channels[channel];
}

/** 互換API: 大地形ノイズ。 */
export function getTerrainNoise(): NoiseFunction2D {
  return getNoiseField('continental');
}

/** 互換API: 木・装飾配置用ノイズ。 */
export function getTreeNoise(): NoiseFunction2D {
  return getNoiseField('vegetation');
}

export function fbmChannel(
  channel: TerrainNoiseChannel,
  x: number,
  z: number,
  octaves: number,
  lacunarity: number,
  persistence: number,
): number {
  const noise = getNoiseField(channel);
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let octave = 0; octave < octaves; octave++) {
    value += amplitude * noise(x * frequency, z * frequency);
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return maxValue > 0 ? value / maxValue : 0;
}

/** 互換API: 大地形チャンネルのFBM。 */
export function fbm(
  x: number,
  z: number,
  octaves: number,
  lacunarity: number,
  persistence: number,
): number {
  return fbmChannel('continental', x, z, octaves, lacunarity, persistence);
}
