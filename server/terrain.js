// サーバー用地形ユーティリティ
// クライアントの terrain（heightmap.ts / biomes.ts / stages.ts）と同じ計算を行い、
// モブの地面高さ・乗り物のスポーン高さをステージごとに正しく決定する。
//
// ⚠ クライアントと値が一致している必要がある。
//    地形パラメータ・applyShape・fbm を変更したら、必ず両方を同時に更新すること。
//    参照元: halcraft/src/types/biomes.ts, halcraft/src/types/stages.ts,
//            halcraft/src/utils/terrain/heightmap.ts, .../noise.ts

import { createNoise2D } from 'simplex-noise';

// クライアントの WORLD_HEIGHT（blocks.ts）と一致させる
const WORLD_HEIGHT = 128;

// 滑走路の平坦化ゾーン（クライアント heightmap.ts と一致）
const RUNWAY_CENTER = { x: 52, z: -34 };
const RUNWAY_LENGTH = 72;
const RUNWAY_WIDTH = 13;

/**
 * ステージごとに解決済みの地形設定。
 * biomes.ts の BIOME_CONFIGS に stages.ts の terrain プロファイルをマージした結果。
 * （クライアントの resolveBiomeConfig の出力と一致させる）
 */
const STAGE_TERRAIN = {
  'build-forest':   { baseHeight: 20, heightVariation: 10, detailVariation: 3, noiseFrequency: 0.01,  detailFrequency: 0.05, noiseSeed: 0.50, terrainShape: 'rolling' },
  'build-tropical': { baseHeight: 18, heightVariation: 9,  detailVariation: 2, noiseFrequency: 0.008, detailFrequency: 0.04, noiseSeed: 0.70, terrainShape: 'islands' },
  'build-snow':     { baseHeight: 22, heightVariation: 12, detailVariation: 4, noiseFrequency: 0.012, detailFrequency: 0.06, noiseSeed: 0.30, terrainShape: 'hills' },
  'build-desert':   { baseHeight: 18, heightVariation: 3,  detailVariation: 2, noiseFrequency: 0.006, detailFrequency: 0.03, noiseSeed: 0.90, terrainShape: 'plains' },
  'war-forest':     { baseHeight: 20, heightVariation: 13, detailVariation: 3, noiseFrequency: 0.01,  detailFrequency: 0.05, noiseSeed: 0.18, terrainShape: 'hills' },
  'war-tropical':   { baseHeight: 18, heightVariation: 10, detailVariation: 2, noiseFrequency: 0.008, detailFrequency: 0.04, noiseSeed: 0.62, terrainShape: 'hills' },
  'war-snow':       { baseHeight: 24, heightVariation: 16, detailVariation: 4, noiseFrequency: 0.012, detailFrequency: 0.06, noiseSeed: 0.42, terrainShape: 'mountains' },
  'war-desert':     { baseHeight: 18, heightVariation: 7,  detailVariation: 2, noiseFrequency: 0.006, detailFrequency: 0.03, noiseSeed: 0.78, terrainShape: 'dunes' },
};

const DEFAULT_STAGE = 'build-forest';

/** ステージごとのノイズ関数キャッシュ（シードが同じなら同じ地形） */
const noiseCache = new Map();

function getStageConfig(stageId) {
  return STAGE_TERRAIN[stageId] || STAGE_TERRAIN[DEFAULT_STAGE];
}

function getStageNoise(stageId) {
  const cfg = getStageConfig(stageId);
  const key = cfg.noiseSeed;
  let noise = noiseCache.get(key);
  if (!noise) {
    noise = createNoise2D(() => key);
    noiseCache.set(key, noise);
  }
  return noise;
}

/**
 * FBM — 複数スケールのノイズを重ねて自然な地形を生成（クライアントと同一）
 */
function fbm(noise2D, x, z, octaves, lacunarity, persistence) {
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
 * 正規化ノイズ値(-1〜1)を地形形状に応じて変形する（クライアント heightmap.ts と同一）
 */
function applyShape(base, shape, worldX) {
  switch (shape) {
    case 'plains':
      return base * 0.35;
    case 'hills':
      return Math.sign(base) * Math.pow(Math.abs(base), 0.8) * 1.2;
    case 'mountains': {
      const ridged = 1 - Math.abs(base);
      return Math.pow(ridged, 1.3) * 2 - 0.7;
    }
    case 'dunes':
      return Math.sin(worldX * 0.16 + base * 4.0) * 0.6 + base * 0.4;
    case 'islands':
      return base * 1.4 - 0.35;
    case 'rolling':
    default:
      return base;
  }
}

function calculateRawTerrainHeight(worldX, worldZ, stageId) {
  const cfg = getStageConfig(stageId);
  const noise2D = getStageNoise(stageId);

  const base = fbm(noise2D, worldX * cfg.noiseFrequency, worldZ * cfg.noiseFrequency, 4, 2.0, 0.5);
  const detail = fbm(noise2D, worldX * cfg.detailFrequency, worldZ * cfg.detailFrequency, 2, 2.0, 0.4);
  const shaped = applyShape(base, cfg.terrainShape, worldX);

  return cfg.baseHeight + Math.floor(shaped * cfg.heightVariation + detail * cfg.detailVariation);
}

/**
 * ワールド座標 (x, z) から地形の高さ(Y)を計算する。
 * クライアント側 heightmap.ts と完全に同じ計算（滑走路平坦化を含む）。
 * @param {number} worldX
 * @param {number} worldZ
 * @param {string} [stageId] 省略時は build-forest 相当
 */
export function getTerrainHeight(worldX, worldZ, stageId = DEFAULT_STAGE) {
  const runwayHalfLength = Math.floor(RUNWAY_LENGTH / 2) + 6;
  const runwayHalfWidth = Math.floor(RUNWAY_WIDTH / 2) + 5;
  const isRunwayZone =
    Math.abs(worldX - RUNWAY_CENTER.x) <= runwayHalfLength &&
    Math.abs(worldZ - RUNWAY_CENTER.z) <= runwayHalfWidth;

  const height = isRunwayZone
    ? calculateRawTerrainHeight(RUNWAY_CENTER.x, RUNWAY_CENTER.z, stageId)
    : calculateRawTerrainHeight(worldX, worldZ, stageId);

  return Math.max(1, Math.min(height, WORLD_HEIGHT - 1));
}
