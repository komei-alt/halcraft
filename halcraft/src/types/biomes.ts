// バイオーム定義
// 各バイオームの地形パラメータ、ブロック種、環境色を管理

import { BLOCK_IDS, type BlockId } from './blocks';
import type { BiomeId } from './stages';

/** 木の種類 */
export type TreeType = 'oak' | 'palm' | 'pine' | 'cactus';

/** バイオーム設定 */
export interface BiomeConfig {
  id: BiomeId;
  name: string;

  // 地形パラメータ
  /** 基準高さ */
  baseHeight: number;
  /** 高低差の振幅 */
  heightVariation: number;
  /** 細かい凹凸の振幅 */
  detailVariation: number;
  /** ノイズ周波数（大地形） */
  noiseFrequency: number;
  /** ノイズ周波数（細かい凹凸） */
  detailFrequency: number;
  /** ノイズシード値 */
  noiseSeed: number;

  // ブロックマッピング
  /** 地表ブロック */
  surfaceBlock: BlockId;
  /** 地表下ブロック */
  subSurfaceBlock: BlockId;
  /** 深層ブロック */
  deepBlock: BlockId;
  /** 面別テクスチャを使うか（草ブロック系） */
  useFaceTextures: boolean;

  // 植生
  /** 木の種類 */
  treeType: TreeType;
  /** 木の密度（0.0 ~ 1.0） */
  treeDensity: number;
  /** 木の高さ範囲 */
  treeHeight: { min: number; max: number };

  // 環境色 (hex)
  /** 昼間の空色 */
  daySkyColor: number;
  /** 昼間の霧色 */
  dayFogColor: number;
  /** 太陽光色 */
  daySunColor: number;
  /** 夜の空色 */
  nightSkyColor: number;
  /** 夜の霧色 */
  nightFogColor: number;
  /** 夜の光色 */
  nightSunColor: number;
  /** 夕焼けの空色 */
  sunsetSkyColor: number;
  /** 夕焼けの霧色 */
  sunsetFogColor: number;
  /** 夕焼けの光色 */
  sunsetSunColor: number;
  /** 霧の開始距離 */
  fogNear: number;
  /** 霧の終了距離 */
  fogFar: number;
}

/** バイオーム定義テーブル */
export const BIOME_CONFIGS: Record<BiomeId, BiomeConfig> = {
  forest: {
    id: 'forest',
    name: '森',
    baseHeight: 20,
    heightVariation: 10,
    detailVariation: 3,
    noiseFrequency: 0.01,
    detailFrequency: 0.05,
    noiseSeed: 0.5,
    surfaceBlock: BLOCK_IDS.GRASS,
    subSurfaceBlock: BLOCK_IDS.DIRT,
    deepBlock: BLOCK_IDS.BEDROCK,
    useFaceTextures: true,
    treeType: 'oak',
    treeDensity: 0.4,
    treeHeight: { min: 4, max: 7 },
    // 現在の色を維持（青空）
    daySkyColor: 0x87ceeb,
    dayFogColor: 0x87ceeb,
    daySunColor: 0xfff5e0,
    nightSkyColor: 0x141430,
    nightFogColor: 0x141430,
    nightSunColor: 0x4466aa,
    sunsetSkyColor: 0xff7733,
    sunsetFogColor: 0xff6622,
    sunsetSunColor: 0xff6622,
    fogNear: 140,
    fogFar: 350,
  },

  tropical: {
    id: 'tropical',
    name: 'トロピカル',
    baseHeight: 18,
    heightVariation: 8,
    detailVariation: 2,
    noiseFrequency: 0.008,
    detailFrequency: 0.04,
    noiseSeed: 0.7,
    surfaceBlock: BLOCK_IDS.GRASS,
    subSurfaceBlock: BLOCK_IDS.DIRT,
    deepBlock: BLOCK_IDS.BEDROCK,
    useFaceTextures: true,
    treeType: 'palm',
    treeDensity: 0.3,
    treeHeight: { min: 6, max: 10 },
    // 鮮やかで明るい空
    daySkyColor: 0x5bc5f0,
    dayFogColor: 0x5bc5f0,
    daySunColor: 0xfffbe0,
    nightSkyColor: 0x0a1840,
    nightFogColor: 0x0a1840,
    nightSunColor: 0x3355aa,
    sunsetSkyColor: 0xff5522,
    sunsetFogColor: 0xff4400,
    sunsetSunColor: 0xff5522,
    fogNear: 160,
    fogFar: 380,
  },

  snow: {
    id: 'snow',
    name: '雪原',
    baseHeight: 22,
    heightVariation: 12,
    detailVariation: 4,
    noiseFrequency: 0.012,
    detailFrequency: 0.06,
    noiseSeed: 0.3,
    surfaceBlock: BLOCK_IDS.SNOW,
    subSurfaceBlock: BLOCK_IDS.DIRT,
    deepBlock: BLOCK_IDS.BEDROCK,
    useFaceTextures: true,
    treeType: 'pine',
    treeDensity: 0.25,
    treeHeight: { min: 5, max: 9 },
    // 白っぽい空、霧が近い
    daySkyColor: 0xc8dde8,
    dayFogColor: 0xc8dde8,
    daySunColor: 0xeef0ff,
    nightSkyColor: 0x101830,
    nightFogColor: 0x101830,
    nightSunColor: 0x4466bb,
    sunsetSkyColor: 0xcc7755,
    sunsetFogColor: 0xbb6644,
    sunsetSunColor: 0xcc7755,
    fogNear: 100,
    fogFar: 280,
  },

  desert: {
    id: 'desert',
    name: '砂漠',
    baseHeight: 18,
    heightVariation: 5,
    detailVariation: 2,
    noiseFrequency: 0.006,
    detailFrequency: 0.03,
    noiseSeed: 0.9,
    surfaceBlock: BLOCK_IDS.SAND,
    subSurfaceBlock: BLOCK_IDS.SAND,
    deepBlock: BLOCK_IDS.BEDROCK,
    useFaceTextures: false,
    treeType: 'cactus',
    treeDensity: 0.08,
    treeHeight: { min: 2, max: 5 },
    // オレンジがかった明るい空
    daySkyColor: 0xd4b896,
    dayFogColor: 0xd4b896,
    daySunColor: 0xffe8c0,
    nightSkyColor: 0x18102a,
    nightFogColor: 0x18102a,
    nightSunColor: 0x445588,
    sunsetSkyColor: 0xe06622,
    sunsetFogColor: 0xcc5511,
    sunsetSunColor: 0xe06622,
    fogNear: 170,
    fogFar: 400,
  },
};

/** バイオームIDからBiomeConfigを取得 */
export function getBiomeConfig(biomeId: BiomeId): BiomeConfig {
  return BIOME_CONFIGS[biomeId];
}
