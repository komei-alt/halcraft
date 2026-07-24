// バイオーム定義
// 各バイオームの地形パラメータ、ブロック種、環境色を管理

import { BLOCK_IDS, type BlockId } from './blocks';
import type { BiomeId, StageTerrainProfile } from './stages';

/** 木の種類 */
export type TreeType = 'oak' | 'palm' | 'pine' | 'cactus';

/**
 * 地形の基本形状
 * - plains: ほぼ平坦（開けた地形、巨大建築・乗り物向き）
 * - rolling: なだらかな丘
 * - hills: 起伏の大きい丘陵（高低差あり）
 * - mountains: ridgedノイズによる険しい山と谷
 * - dunes: 方向性のある砂丘の波
 * - islands: 海に浮かぶ島とラグーン
 */
export type TerrainShape = 'plains' | 'rolling' | 'hills' | 'mountains' | 'dunes' | 'islands';

/** 地表に撒く装飾の種類 */
export type DecorKind = 'bush' | 'rock' | 'flower' | 'snowRock' | 'deadBush';

/** ワールド座標ベースで決定的に生成する植生パレット要素 */
export interface VegetationPaletteEntry {
  blockId: BlockId;
  weight: number;
  minMoisture?: number;
  maxMoisture?: number;
  maxSlope?: number;
  nearWater?: boolean;
}

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
  /** 地形の基本形状 */
  terrainShape: TerrainShape;
  /** 高所に露出させるブロック（山頂の石・雪など）。null なら露出なし */
  peakBlock: BlockId | null;
  /** peakBlock が露出し始める高さ */
  peakHeight: number;
  /** 地表に撒く装飾の種類（複数可） */
  decorKinds: DecorKind[];
  /** 装飾の密度（0.0 ~ 1.0） */
  decorDensity: number;

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
  /** バイオーム固有の地表植物 */
  vegetationPalette: readonly VegetationPaletteEntry[];
  /** 地表植物の生成密度（描画品質による間引き前） */
  vegetationDensity: number;

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
    terrainShape: 'rolling',
    peakBlock: BLOCK_IDS.STONE,
    peakHeight: 30,
    decorKinds: ['rock'],
    decorDensity: 0.035,
    surfaceBlock: BLOCK_IDS.GRASS,
    subSurfaceBlock: BLOCK_IDS.DIRT,
    deepBlock: BLOCK_IDS.STONE,
    useFaceTextures: true,
    treeType: 'oak',
    treeDensity: 0.4,
    treeHeight: { min: 4, max: 7 },
    vegetationPalette: [
      { blockId: BLOCK_IDS.TALL_GRASS, weight: 5, minMoisture: 0.22, maxSlope: 0.62 },
      { blockId: BLOCK_IDS.WILDFLOWER, weight: 1.35, minMoisture: 0.3, maxSlope: 0.48 },
      { blockId: BLOCK_IDS.BUSH, weight: 1.1, minMoisture: 0.34, maxSlope: 0.54 },
      { blockId: BLOCK_IDS.MUSHROOM, weight: 0.6, minMoisture: 0.56, maxSlope: 0.42 },
      { blockId: BLOCK_IDS.REED, weight: 0.9, minMoisture: 0.58, maxSlope: 0.3, nearWater: true },
    ],
    vegetationDensity: 0.34,
    // 現在の色を維持（青空）
    daySkyColor: 0x6eb6f0,
    dayFogColor: 0xb8d6c4,
    daySunColor: 0xfff6e6,
    nightSkyColor: 0x12142e,
    nightFogColor: 0x161830,
    nightSunColor: 0x4a72b8,
    sunsetSkyColor: 0x6f8fc4,
    sunsetFogColor: 0xf4a078,
    sunsetSunColor: 0xffb57a,
    fogNear: 120,
    fogFar: 380,
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
    terrainShape: 'islands',
    peakBlock: null,
    peakHeight: 99,
    decorKinds: ['rock'],
    decorDensity: 0.025,
    surfaceBlock: BLOCK_IDS.GRASS,
    subSurfaceBlock: BLOCK_IDS.DIRT,
    deepBlock: BLOCK_IDS.STONE,
    useFaceTextures: true,
    treeType: 'palm',
    treeDensity: 0.3,
    treeHeight: { min: 6, max: 10 },
    vegetationPalette: [
      { blockId: BLOCK_IDS.TALL_GRASS, weight: 4, minMoisture: 0.28, maxSlope: 0.56 },
      { blockId: BLOCK_IDS.WILDFLOWER, weight: 2.2, minMoisture: 0.38, maxSlope: 0.46 },
      { blockId: BLOCK_IDS.BUSH, weight: 1.6, minMoisture: 0.42, maxSlope: 0.5 },
      { blockId: BLOCK_IDS.REED, weight: 1.6, minMoisture: 0.55, maxSlope: 0.28, nearWater: true },
      { blockId: BLOCK_IDS.MUSHROOM, weight: 0.55, minMoisture: 0.68, maxSlope: 0.4 },
    ],
    vegetationDensity: 0.4,
    // 鮮やかで明るい空
    daySkyColor: 0x48b8ea,
    dayFogColor: 0x9ee0d8,
    daySunColor: 0xfffce8,
    nightSkyColor: 0x081640,
    nightFogColor: 0x0a1a42,
    nightSunColor: 0x3a62b8,
    sunsetSkyColor: 0x5f7fc0,
    sunsetFogColor: 0xff9c78,
    sunsetSunColor: 0xffb680,
    fogNear: 140,
    fogFar: 400,
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
    terrainShape: 'hills',
    peakBlock: BLOCK_IDS.STONE,
    peakHeight: 34,
    decorKinds: ['snowRock', 'rock'],
    decorDensity: 0.035,
    surfaceBlock: BLOCK_IDS.SNOW,
    subSurfaceBlock: BLOCK_IDS.DIRT,
    deepBlock: BLOCK_IDS.STONE,
    useFaceTextures: true,
    treeType: 'pine',
    treeDensity: 0.25,
    treeHeight: { min: 5, max: 9 },
    vegetationPalette: [
      { blockId: BLOCK_IDS.FROST_GRASS, weight: 4.2, minMoisture: 0.18, maxSlope: 0.56 },
      { blockId: BLOCK_IDS.BUSH, weight: 0.45, minMoisture: 0.42, maxSlope: 0.4 },
    ],
    vegetationDensity: 0.2,
    // 白っぽい空、霧が近い
    daySkyColor: 0x88b4d8,
    dayFogColor: 0xdceaf2,
    daySunColor: 0xf0f2ff,
    nightSkyColor: 0x0e162e,
    nightFogColor: 0x101830,
    nightSunColor: 0x4a70c0,
    sunsetSkyColor: 0x7a8fc0,
    sunsetFogColor: 0xe0aa8c,
    sunsetSunColor: 0xffc8a0,
    fogNear: 90,
    fogFar: 300,
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
    terrainShape: 'dunes',
    peakBlock: null,
    peakHeight: 99,
    decorKinds: [],
    decorDensity: 0,
    surfaceBlock: BLOCK_IDS.SAND,
    subSurfaceBlock: BLOCK_IDS.SAND,
    deepBlock: BLOCK_IDS.STONE,
    useFaceTextures: false,
    treeType: 'cactus',
    treeDensity: 0.22,
    treeHeight: { min: 2, max: 5 },
    vegetationPalette: [
      { blockId: BLOCK_IDS.DEAD_BUSH, weight: 4.4, maxMoisture: 0.64, maxSlope: 0.52 },
      { blockId: BLOCK_IDS.REED, weight: 0.8, minMoisture: 0.6, maxSlope: 0.24, nearWater: true },
    ],
    vegetationDensity: 0.1,
    // オレンジがかった明るい空
    daySkyColor: 0x238fce,
    dayFogColor: 0xf0b66f,
    daySunColor: 0xffe0a2,
    nightSkyColor: 0x16102a,
    nightFogColor: 0x18122c,
    nightSunColor: 0x4a5e98,
    sunsetSkyColor: 0x248fca,
    sunsetFogColor: 0xf38a48,
    sunsetSunColor: 0xffb657,
    fogNear: 180,
    fogFar: 520,
  },
};

/** バイオームIDからBiomeConfigを取得 */
export function getBiomeConfig(biomeId: BiomeId): BiomeConfig {
  return BIOME_CONFIGS[biomeId];
}

/**
 * ステージの地形プロファイルでベースバイオームを上書きした実効設定を返す。
 * 同じバイオームでもステージごとにシード・形状・起伏を変えて別マップにする。
 */
export function resolveBiomeConfig(biomeId: BiomeId, terrain?: StageTerrainProfile): BiomeConfig {
  const base = BIOME_CONFIGS[biomeId];
  if (!terrain) return base;
  return {
    ...base,
    noiseSeed: terrain.noiseSeed ?? base.noiseSeed,
    terrainShape: terrain.terrainShape ?? base.terrainShape,
    baseHeight: terrain.baseHeight ?? base.baseHeight,
    heightVariation: terrain.heightVariation ?? base.heightVariation,
    detailVariation: terrain.detailVariation ?? base.detailVariation,
    noiseFrequency: terrain.noiseFrequency ?? base.noiseFrequency,
    treeDensity: terrain.treeDensity ?? base.treeDensity,
    decorDensity: terrain.decorDensity ?? base.decorDensity,
  };
}
