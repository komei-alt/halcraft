// ノイズ関数ユーティリティ
// FBM (Fractal Brownian Motion) を提供

import { createNoise2D } from 'simplex-noise';

/** メイン地形用ノイズ（シード固定） */
export const noise2D = createNoise2D(() => 0.5);

/** 木の配置用ノイズ（地形と異なるパターン） */
export const treeNoise = createNoise2D(() => 0.3);

/**
 * Fractal Brownian Motion (FBM) — 複数スケールのノイズを重ねて自然な地形を生成
 * octaves が多いほど細かい起伏が加わる
 */
export function fbm(x: number, z: number, octaves: number, lacunarity: number, persistence: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2D(x * frequency, z * frequency);
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue; // -1 ~ 1 に正規化
}
