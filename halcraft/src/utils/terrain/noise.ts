// ノイズ関数ユーティリティ
// FBM (Fractal Brownian Motion) を提供
// バイオームごとにシード値を変更して異なる地形を生成

import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { getCurrentBiome } from './biomeConfig';

/** 現在のバイオームシード値 */
let currentSeed = 0.5;

/** メイン地形用ノイズ */
let noise2D: NoiseFunction2D = createNoise2D(() => 0.5);

/** 木の配置用ノイズ（地形と異なるパターン） */
let treeNoise: NoiseFunction2D = createNoise2D(() => 0.3);

/** バイオームに合わせてノイズ関数を再生成 */
export function resetNoiseForBiome(): void {
  const biome = getCurrentBiome();
  if (biome.noiseSeed === currentSeed) return;
  currentSeed = biome.noiseSeed;
  noise2D = createNoise2D(() => currentSeed);
  treeNoise = createNoise2D(() => currentSeed + 0.2);
}

/** 地形用ノイズを取得 */
export function getTerrainNoise(): NoiseFunction2D {
  return noise2D;
}

/** 木配置用ノイズを取得 */
export function getTreeNoise(): NoiseFunction2D {
  return treeNoise;
}

/**
 * Fractal Brownian Motion (FBM) — 複数スケールのノイズを重ねて自然な地形を生成
 * octaves が多いほど細かい起伏が加わる
 */
export function fbm(x: number, z: number, octaves: number, lacunarity: number, persistence: number): number {
  const n = noise2D;
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * n(x * frequency, z * frequency);
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue; // -1 ~ 1 に正規化
}
