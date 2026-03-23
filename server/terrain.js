// サーバー用地形ユーティリティ
// クライアントの terrain.ts と同じ計算を行い、モブの地面高さを決定する

import { createNoise2D } from 'simplex-noise';

const WORLD_HEIGHT = 64;

// シード固定のノイズ関数（クライアントと同じシード）
const noise2D = createNoise2D(() => 0.5);

/**
 * FBM — 複数スケールのノイズを重ねて自然な地形を生成
 */
function fbm(x, z, octaves, lacunarity, persistence) {
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

  return value / maxValue;
}

/**
 * ワールド座標 (x, z) から地形の高さ(Y)を計算する
 * クライアント側と完全に同じ計算
 */
export function getTerrainHeight(worldX, worldZ) {
  const baseHeight = fbm(worldX * 0.01, worldZ * 0.01, 4, 2.0, 0.5);
  const detail = fbm(worldX * 0.05, worldZ * 0.05, 2, 2.0, 0.4);
  const height = 20 + Math.floor(baseHeight * 10 + detail * 3);
  return Math.max(1, Math.min(height, WORLD_HEIGHT - 1));
}
