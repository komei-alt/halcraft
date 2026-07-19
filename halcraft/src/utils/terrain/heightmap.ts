// ハルクラ・ワールドジェネレーター v2
// 大陸度・侵食・稜線・領域ワープを合成し、ステージごとの物語が読める地形を生成する。

import { WORLD_HEIGHT } from '../../types/blocks';
import type { TerrainShape } from '../../types/biomes';
import { RUNWAY_CENTER, RUNWAY_LENGTH, RUNWAY_WIDTH } from './constants';
import { getCurrentBiome } from './biomeConfig';
import { fbmChannel, getNoiseField } from './noise';

export const WORLD_GENERATOR_VERSION = 2;

export interface TerrainSample {
  height: number;
  slopeHint: number;
  moisture: number;
  riverStrength: number;
  terrace: number;
}

const sampleCache = new Map<string, TerrainSample>();
const MAX_SAMPLE_CACHE_SIZE = 180_000;
let plateauCacheKey = '';
let cachedRunwayHeight = 16;
let cachedSpawnHeight = 16;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function getCacheKey(x: number, z: number): string {
  return `${Math.floor(x)},${Math.floor(z)}`;
}

/** バイオーム切替時に地形サンプルを破棄する。 */
export function clearHeightCache(): void {
  sampleCache.clear();
  plateauCacheKey = '';
}

function getPlateauHeights(): { runwayHeight: number; spawnHeight: number } {
  const biome = getCurrentBiome();
  const key = `${biome.id}:${biome.noiseSeed}`;
  if (key !== plateauCacheKey) {
    plateauCacheKey = key;
    cachedRunwayHeight = calculateRawSample(RUNWAY_CENTER.x, RUNWAY_CENTER.z).height;
    cachedSpawnHeight = calculateRawSample(7, 7).height;
  }
  return { runwayHeight: cachedRunwayHeight, spawnHeight: cachedSpawnHeight };
}

function shapeTerrain(
  shape: TerrainShape,
  continental: number,
  erosion: number,
  ridge: number,
  detail: number,
  worldX: number,
  worldZ: number,
): number {
  switch (shape) {
    case 'plains': {
      const broadRise = continental * 0.24;
      const dryChannels = Math.max(0, 0.32 - Math.abs(detail)) * 0.32;
      return broadRise + detail * 0.13 - dryChannels;
    }
    case 'hills':
      return continental * 0.72 + ridge * (0.68 - erosion * 0.24) + detail * 0.22 - 0.18;
    case 'mountains':
      return continental * 0.38 + Math.pow(ridge, 1.32) * (1.55 - erosion * 0.38) + detail * 0.18 - 0.5;
    case 'dunes': {
      const duneWave = Math.sin(worldX * 0.105 + worldZ * 0.032 + detail * 2.8);
      const crossWave = Math.sin(worldX * 0.027 - worldZ * 0.076 + continental * 2.1);
      return duneWave * 0.46 + crossWave * 0.18 + continental * 0.3 - erosion * 0.08;
    }
    case 'islands': {
      const islandShelf = continental * 1.24 - 0.28;
      const volcanicCrown = Math.max(0, ridge - 0.46) * 0.9;
      return islandShelf + volcanicCrown + detail * 0.14;
    }
    case 'rolling':
    default:
      return continental * 0.68 + ridge * 0.24 - erosion * 0.14 + detail * 0.2;
  }
}

function calculateRawSample(worldX: number, worldZ: number): TerrainSample {
  const biome = getCurrentBiome();
  const frequency = biome.noiseFrequency;

  // 低周波の領域ワープで、ノイズの等高線らしい単調さを消す。
  const warpFrequency = Math.max(0.0012, frequency * 0.42);
  const warpStrength = 18 + biome.heightVariation * 1.35;
  const warpedX = worldX + fbmChannel('warpX', worldX * warpFrequency, worldZ * warpFrequency, 3, 2.03, 0.52) * warpStrength;
  const warpedZ = worldZ + fbmChannel('warpZ', worldX * warpFrequency, worldZ * warpFrequency, 3, 2.07, 0.5) * warpStrength;

  const continental = fbmChannel('continental', warpedX * frequency, warpedZ * frequency, 5, 1.96, 0.52);
  const erosionRaw = fbmChannel('erosion', warpedX * frequency * 1.55, warpedZ * frequency * 1.55, 4, 2.08, 0.5);
  const erosion = erosionRaw * 0.5 + 0.5;
  const ridgeNoise = fbmChannel('ridge', warpedX * frequency * 1.28, warpedZ * frequency * 1.28, 4, 2.02, 0.53);
  const ridge = Math.pow(1 - Math.abs(ridgeNoise), 1.72);
  const detail = fbmChannel('detail', warpedX * biome.detailFrequency, warpedZ * biome.detailFrequency, 3, 2.14, 0.44);
  const riverNoise = Math.abs(getNoiseField('river')(warpedX * frequency * 0.72, warpedZ * frequency * 0.72));
  const riverStrength = 1 - smoothstep(0.025, 0.115, riverNoise);
  const moistureNoise = getNoiseField('vegetation')(worldX * 0.006 + 41.7, worldZ * 0.006 - 18.3);
  const moisture = Math.max(0, Math.min(1, moistureNoise * 0.5 + 0.5 + riverStrength * 0.3));

  let shaped = shapeTerrain(
    biome.terrainShape,
    continental,
    erosion,
    ridge,
    detail,
    worldX,
    worldZ,
  );

  // 川筋は森林・雪原では浅い谷、南国ではラグーン、砂漠ではまれなオアシスになる。
  const riverGate = getNoiseField('river')(worldX * 0.0021 - 90, worldZ * 0.0021 + 120);
  const riverDepth = biome.id === 'tropical'
    ? riverStrength * 0.72
    : biome.id === 'desert' && riverGate > 0.2
      ? riverStrength * 0.62
      : riverStrength * 0.22;
  shaped -= riverDepth;

  const continuousHeight = biome.baseHeight
    + shaped * biome.heightVariation
    + detail * biome.detailVariation;

  // 段差を完全な等間隔にせず、緩斜面と読みやすい段丘を混ぜる。
  const terraceMix = smoothstep(0.46, 0.84, ridge) * (1 - erosion * 0.44);
  const terraceHeight = Math.round(continuousHeight / 2) * 2;
  const terraced = continuousHeight * (1 - terraceMix * 0.34) + terraceHeight * terraceMix * 0.34;

  return {
    height: Math.max(1, Math.min(WORLD_HEIGHT - 12, Math.round(terraced))),
    slopeHint: Math.max(0, Math.min(1, ridge * (1 - erosion * 0.42))),
    moisture,
    riverStrength,
    terrace: terraceMix,
  };
}

function distanceOutsideBox(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  halfWidth: number,
  halfDepth: number,
): number {
  const dx = Math.max(0, Math.abs(x - centerX) - halfWidth);
  const dz = Math.max(0, Math.abs(z - centerZ) - halfDepth);
  return Math.hypot(dx, dz);
}

function applyConstructionPlateaus(worldX: number, worldZ: number, sample: TerrainSample): TerrainSample {
  const runwayHalfLength = Math.floor(RUNWAY_LENGTH / 2) + 6;
  const runwayHalfWidth = Math.floor(RUNWAY_WIDTH / 2) + 5;
  const runwayDistance = distanceOutsideBox(
    worldX,
    worldZ,
    RUNWAY_CENTER.x,
    RUNWAY_CENTER.z,
    runwayHalfLength,
    runwayHalfWidth,
  );
  const runwayBlend = 1 - smoothstep(0, 8, runwayDistance);

  const spawnDistance = Math.hypot(worldX - 7, worldZ - 7);
  const spawnBlend = 1 - smoothstep(8, 18, spawnDistance);

  if (runwayBlend <= 0 && spawnBlend <= 0) return sample;

  const { runwayHeight, spawnHeight } = getPlateauHeights();
  let height = sample.height;
  height = Math.round(height * (1 - runwayBlend) + runwayHeight * runwayBlend);
  height = Math.round(height * (1 - spawnBlend) + spawnHeight * spawnBlend);
  return {
    ...sample,
    height,
    slopeHint: sample.slopeHint * (1 - Math.max(runwayBlend, spawnBlend) * 0.9),
  };
}

/** ワールド座標の地形情報を一度だけ計算して共有する。 */
export function getTerrainSample(worldX: number, worldZ: number): TerrainSample {
  const x = Math.floor(worldX);
  const z = Math.floor(worldZ);
  const key = getCacheKey(x, z);
  const cached = sampleCache.get(key);
  if (cached) return cached;

  if (sampleCache.size >= MAX_SAMPLE_CACHE_SIZE) sampleCache.clear();
  const sample = applyConstructionPlateaus(x, z, calculateRawSample(x, z));
  sampleCache.set(key, sample);
  return sample;
}

/** 互換API: ワールド座標からブロック単位の地表高を返す。 */
export function getTerrainHeight(worldX: number, worldZ: number): number {
  return getTerrainSample(worldX, worldZ).height;
}
