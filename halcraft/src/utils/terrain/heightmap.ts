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

/**
 * 正規化ノイズ値(-1〜1)を地形形状に応じて変形する。
 * サーバー側 (server/terrain.js) の applyShape と完全に一致させること。
 */
function applyShape(base: number, shape: string, worldX: number): number {
  switch (shape) {
    case 'plains':
      // ほぼ平坦（巨大建築・乗り物向け）
      return base * 0.35;
    case 'hills':
      // 中腹を強調した起伏の大きい丘陵
      return Math.sign(base) * Math.pow(Math.abs(base), 0.8) * 1.2;
    case 'mountains': {
      // ridgedノイズで尖った山稜と深い谷
      const ridged = 1 - Math.abs(base);
      return Math.pow(ridged, 1.3) * 2 - 0.7;
    }
    case 'dunes':
      // 方向性のある砂丘の波
      return Math.sin(worldX * 0.16 + base * 4.0) * 0.6 + base * 0.4;
    case 'islands':
      // 海面下を増やして島とラグーンを作る
      return base * 1.4 - 0.35;
    case 'rolling':
    default:
      // なだらかな丘（標準）
      return base;
  }
}

function calculateRawTerrainHeight(worldX: number, worldZ: number): number {
  const biome = getCurrentBiome();

  // 大まかな地形（丘や谷）— バイオームのノイズ周波数で調整
  const base = fbm(worldX * biome.noiseFrequency, worldZ * biome.noiseFrequency, 4, 2.0, 0.5);
  // 細かい凹凸 — バイオームのディテール周波数で調整
  const detail = fbm(worldX * biome.detailFrequency, worldZ * biome.detailFrequency, 2, 2.0, 0.4);

  // 地形形状を適用してから、バイオームの基準高さと振幅で計算
  const shaped = applyShape(base, biome.terrainShape, worldX);
  return biome.baseHeight + Math.floor(shaped * biome.heightVariation + detail * biome.detailVariation);
}
