// 地表装飾・植生ユーティリティ v2
// ワールド座標だけから配置を決め、チャンク境界・生成順序に依存しない植生を作る。

import { getTreeNoise } from '../noise';
import { getTerrainSample } from '../heightmap';
import { getCurrentBiome } from '../biomeConfig';
import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, type BlockId } from '../../../types/blocks';
import {
  AIRPLANE_SPAWN,
  HELIPORT_CENTER,
  HELIPORT_SIZE,
  PLAYER_SPAWN,
  RUNWAY_CENTER,
  RUNWAY_LENGTH,
  RUNWAY_WIDTH,
  TANK_SPAWN,
  VILLAGE_CENTER,
} from '../constants';
import { STAGE_LANDMARK_CENTER, STAGE_LANDMARK_RADIUS } from '../../../types/stageLandmarks';
import type { ChunkData } from '../types';
import type { DecorKind, VegetationPaletteEntry } from '../../../types/biomes';

/** 構造物エリアには自然物を生成しない。 */
export function isVegetationExcluded(worldX: number, worldZ: number): boolean {
  // 初期家屋と玄関前は、樹冠まで含めて視界と安全な移動空間を確保する。
  if (Math.hypot(worldX - PLAYER_SPAWN.x, worldZ - PLAYER_SPAWN.z) <= 17) return true;
  if (
    Math.abs(worldX - HELIPORT_CENTER.x) < HELIPORT_SIZE + 3
    && Math.abs(worldZ - HELIPORT_CENTER.z) < HELIPORT_SIZE + 3
  ) return true;
  const runwayHalfLength = Math.floor(RUNWAY_LENGTH / 2) + 2;
  const runwayHalfWidth = Math.floor(RUNWAY_WIDTH / 2) + 2;
  const inRunway = Math.abs(worldX - RUNWAY_CENTER.x) <= runwayHalfLength
    && Math.abs(worldZ - RUNWAY_CENTER.z) <= runwayHalfWidth;
  const inVehiclePad = (
    Math.abs(worldX - TANK_SPAWN.x) <= 7 && Math.abs(worldZ - TANK_SPAWN.z) <= 7
  ) || (
    Math.abs(worldX - AIRPLANE_SPAWN.x) <= 7 && Math.abs(worldZ - AIRPLANE_SPAWN.z) <= 6
  );
  if (inRunway || inVehiclePad) return true;
  if (Math.abs(worldX - VILLAGE_CENTER.x) < 25 && Math.abs(worldZ - VILLAGE_CENTER.z) < 25) return true;
  const landmarkDx = worldX - STAGE_LANDMARK_CENTER.x;
  const landmarkDz = worldZ - STAGE_LANDMARK_CENTER.z;
  return Math.hypot(landmarkDx, landmarkDz) <= STAGE_LANDMARK_RADIUS + 3;
}

function hashUnit(x: number, z: number, salt: number): number {
  let hash = Math.imul(x | 0, 0x45d9f3b)
    ^ Math.imul(z | 0, 0x3449f5)
    ^ Math.imul(salt | 0, 0x27d4eb2d);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

function chooseVegetation(
  palette: readonly VegetationPaletteEntry[],
  moisture: number,
  slope: number,
  nearWater: boolean,
  pick: number,
): BlockId | null {
  const eligible = palette.filter((entry) => (
    moisture >= (entry.minMoisture ?? 0)
    && moisture <= (entry.maxMoisture ?? 1)
    && slope <= (entry.maxSlope ?? 1)
    && (!entry.nearWater || nearWater)
  ));
  const totalWeight = eligible.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return null;
  let cursor = pick * totalWeight;
  for (const entry of eligible) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.blockId;
  }
  return eligible.at(-1)?.blockId ?? null;
}

function placeRock(chunk: ChunkData, kind: DecorKind, lx: number, surfaceY: number, lz: number): void {
  if (surfaceY + 1 >= WORLD_HEIGHT) return;
  if (kind === 'snowRock') {
    chunk[lx][surfaceY + 1][lz] = BLOCK_IDS.SNOW;
    return;
  }
  if (kind === 'rock') chunk[lx][surfaceY + 1][lz] = BLOCK_IDS.STONE;
}

/** 湿度・標高・傾斜・川筋・群生ノイズを使って植物と小岩を配置する。 */
export function placeDecorInChunk(chunk: ChunkData, cx: number, cz: number): void {
  const biome = getCurrentBiome();
  const clusterNoise = getTreeNoise();

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const worldX = cx * CHUNK_SIZE + lx;
      const worldZ = cz * CHUNK_SIZE + lz;
      if (isVegetationExcluded(worldX, worldZ)) continue;

      const sample = getTerrainSample(worldX, worldZ);
      const surfaceY = sample.height;
      if (surfaceY + 1 >= WORLD_HEIGHT || surfaceY < SEA_LEVEL - 1) continue;
      const surface = chunk[lx]?.[surfaceY]?.[lz];
      if (surface !== biome.surfaceBlock && surface !== BLOCK_IDS.SAND && surface !== BLOCK_IDS.SNOW) continue;
      if (chunk[lx]?.[surfaceY + 1]?.[lz] !== BLOCK_IDS.AIR) continue;

      const nearWater = sample.riverStrength > 0.52 || surfaceY <= SEA_LEVEL + 1;
      const cluster = (clusterNoise(worldX * 0.16 + 320, worldZ * 0.16 - 610) + 1) * 0.5;
      const moistureFactor = 0.5 + sample.moisture * 0.7;
      const slopeFactor = Math.max(0.08, 1 - sample.slopeHint * 1.3);
      const clusterFactor = 0.32 + cluster * 1.08;
      const vegetationChance = Math.min(0.78, biome.vegetationDensity * moistureFactor * slopeFactor * clusterFactor);
      const scatter = hashUnit(worldX, worldZ, 0x51a7);

      if (scatter < vegetationChance) {
        const blockId = chooseVegetation(
          biome.vegetationPalette,
          sample.moisture,
          sample.slopeHint,
          nearWater,
          hashUnit(worldX, worldZ, 0x7f13),
        );
        if (blockId !== null) chunk[lx][surfaceY + 1][lz] = blockId;
        continue;
      }

      if (biome.decorKinds.length === 0 || biome.decorDensity <= 0) continue;
      if (hashUnit(worldX, worldZ, 0x2ca9) >= biome.decorDensity * slopeFactor) continue;
      const decorIndex = Math.min(
        biome.decorKinds.length - 1,
        Math.floor(hashUnit(worldX, worldZ, 0x9d2f) * biome.decorKinds.length),
      );
      placeRock(chunk, biome.decorKinds[decorIndex], lx, surfaceY, lz);
    }
  }
}

/** ネザー系地表へ、深度判定される発光菌を決定的に追加する。 */
export function placeNetherFloraInChunk(chunk: ChunkData, cx: number, cz: number): void {
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const worldX = cx * CHUNK_SIZE + lx;
      const worldZ = cz * CHUNK_SIZE + lz;
      if (isVegetationExcluded(worldX, worldZ)) continue;
      for (let y = Math.min(WORLD_HEIGHT - 2, chunk.maxFilledY + 3); y >= 1; y--) {
        const blockId = chunk[lx][y][lz];
        if (blockId === BLOCK_IDS.AIR || blockId === BLOCK_IDS.LAVA) continue;
        if (
          (blockId === BLOCK_IDS.NETHERRACK || blockId === BLOCK_IDS.SOUL_SAND)
          && chunk[lx][y + 1][lz] === BLOCK_IDS.AIR
          && hashUnit(worldX, worldZ, y + 0x4e37) < 0.14
        ) {
          chunk[lx][y + 1][lz] = BLOCK_IDS.NETHER_FUNGUS;
        }
        break;
      }
    }
  }
}
