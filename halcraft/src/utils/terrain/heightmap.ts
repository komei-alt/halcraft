// 高さマップユーティリティ
// FBMノイズから地形高さを算出・キャッシュ
// バイオーム設定に基づいて高さパラメータを変更

import { fbm } from './noise';
import { WORLD_HEIGHT } from '../../types/blocks';
import { RUNWAY_CENTER, RUNWAY_LENGTH, RUNWAY_WIDTH } from './constants';
import { getCurrentBiome } from './biomeConfig';

/** 地形高さキャッシュ（同じ座標の再計算を避ける） */
const heightCache = new Map<number, number>();
const HEIGHT_CACHE_KEY = (x: number, z: number) => x * 65537 + z;

/** バイオーム切替時にキャッシュをクリア */
export function clearHeightCache(): void {
  heightCache.clear();
}

/**
 * ワールド座標 (x, z) から地形の高さ(Y)を計算する
 * 結果は整数（ブロック単位）、キャッシュ済み
 */
export function getTerrainHeight(worldX: number, worldZ: number): number {
  const key = HEIGHT_CACHE_KEY(worldX, worldZ);
  const cached = heightCache.get(key);
  if (cached !== undefined) return cached;

  const runwayHalfLength = Math.floor(RUNWAY_LENGTH / 2) + 6;
  const runwayHalfWidth = Math.floor(RUNWAY_WIDTH / 2) + 5;
  const isRunwayZone =
    Math.abs(worldX - RUNWAY_CENTER.x) <= runwayHalfLength &&
    Math.abs(worldZ - RUNWAY_CENTER.z) <= runwayHalfWidth;

  const height = isRunwayZone
    ? calculateRawTerrainHeight(RUNWAY_CENTER.x, RUNWAY_CENTER.z)
    : calculateRawTerrainHeight(worldX, worldZ);
  const result = Math.max(1, Math.min(height, WORLD_HEIGHT - 1));
  heightCache.set(key, result);
  return result;
}

function calculateRawTerrainHeight(worldX: number, worldZ: number): number {
  const biome = getCurrentBiome();

  // 大まかな地形（丘や谷）— バイオームのノイズ周波数で調整
  const baseHeight = fbm(worldX * biome.noiseFrequency, worldZ * biome.noiseFrequency, 4, 2.0, 0.5);
  // 細かい凹凸 — バイオームのディテール周波数で調整
  const detail = fbm(worldX * biome.detailFrequency, worldZ * biome.detailFrequency, 2, 2.0, 0.4);

  // バイオームの基準高さと振幅で計算
  return biome.baseHeight + Math.floor(baseHeight * biome.heightVariation + detail * biome.detailVariation);
}
