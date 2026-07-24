// 木配置ユーティリティ v2
// 木の根元をワールド座標で判定し、隣接チャンク側の樹冠も同じ根元から再構築する。

import { getTreeNoise } from '../noise';
import { getTerrainSample } from '../heightmap';
import { getCurrentBiome } from '../biomeConfig';
import { BLOCK_IDS, CHUNK_SIZE, SEA_LEVEL, WORLD_HEIGHT, type BlockId } from '../../../types/blocks';
import { isVegetationExcluded } from './decor';
import type { ChunkData } from '../types';

interface ChunkWriteContext {
  chunk: ChunkData;
  cx: number;
  cz: number;
}

const TREE_REACH = 3;

function setWorldBlock(
  context: ChunkWriteContext,
  worldX: number,
  y: number,
  worldZ: number,
  blockId: BlockId,
  onlyAir = false,
): void {
  if (y < 0 || y >= WORLD_HEIGHT) return;
  const lx = worldX - context.cx * CHUNK_SIZE;
  const lz = worldZ - context.cz * CHUNK_SIZE;
  if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
  if (onlyAir && context.chunk[lx][y][lz] !== BLOCK_IDS.AIR) return;
  context.chunk[lx][y][lz] = blockId;
}

/** 同じワールド座標・seedなら常に同じ木の有無を返す。 */
export function shouldPlaceTreeAt(worldX: number, worldZ: number): boolean {
  if (isVegetationExcluded(worldX, worldZ)) return false;
  const biome = getCurrentBiome();
  const tn = getTreeNoise();
  const density = tn(worldX * 0.08, worldZ * 0.08);
  const placement = tn(worldX * 0.5 + 100, worldZ * 0.5 + 100);
  const densityThreshold = 0.8 - biome.treeDensity;
  return density > densityThreshold * 0.5 && placement > 1 - biome.treeDensity;
}

function getTreeHeight(worldX: number, worldZ: number): number {
  const biome = getCurrentBiome();
  const heightNoise = getTreeNoise()(worldX * 0.7 + 200, worldZ * 0.7 + 200);
  const range = biome.treeHeight.max - biome.treeHeight.min;
  return biome.treeHeight.min + Math.floor((heightNoise + 1) * 0.5 * range);
}

function canGrowAt(worldX: number, worldZ: number): boolean {
  const biome = getCurrentBiome();
  const sample = getTerrainSample(worldX, worldZ);
  if (sample.height < SEA_LEVEL) return false;
  if (sample.slopeHint > 0.7) return false;
  if (biome.peakBlock !== null && sample.height >= biome.peakHeight) return false;
  if (biome.id === 'tropical' && sample.height <= SEA_LEVEL + 1) return false;
  return true;
}

function placeOak(
  context: ChunkWriteContext,
  worldX: number,
  surfaceY: number,
  worldZ: number,
  trunkHeight: number,
): void {
  const trunkTop = surfaceY + trunkHeight;
  if (trunkTop + 3 >= WORLD_HEIGHT) return;
  for (let y = surfaceY + 1; y <= trunkTop; y++) {
    setWorldBlock(context, worldX, y, worldZ, BLOCK_IDS.RAW_WOOD);
  }

  const branchY = Math.max(surfaceY + 2, trunkTop - 1);
  const directions = ((worldX + worldZ) & 1) === 0
    ? [[1, 0], [-1, 0]]
    : [[0, 1], [0, -1]];
  for (const [dx, dz] of directions) {
    setWorldBlock(context, worldX + dx, branchY, worldZ + dz, BLOCK_IDS.RAW_WOOD, true);
  }

  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -1; dy <= 2; dy++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 2.5) continue;
        if (dx === 0 && dz === 0 && trunkTop + dy <= trunkTop) continue;
        setWorldBlock(context, worldX + dx, trunkTop + dy, worldZ + dz, BLOCK_IDS.LEAVES, true);
      }
    }
  }
}

function placePalm(
  context: ChunkWriteContext,
  worldX: number,
  surfaceY: number,
  worldZ: number,
  trunkHeight: number,
): void {
  const trunkTop = surfaceY + trunkHeight;
  if (trunkTop + 2 >= WORLD_HEIGHT) return;
  for (let y = surfaceY + 1; y <= trunkTop; y++) {
    setWorldBlock(context, worldX, y, worldZ, BLOCK_IDS.RAW_WOOD);
  }
  const leafY = trunkTop + 1;
  const arms = [
    [0, 0], [1, 0], [2, 0], [3, 0], [-1, 0], [-2, 0], [-3, 0],
    [0, 1], [0, 2], [0, 3], [0, -1], [0, -2], [0, -3],
    [1, 1], [-1, -1], [1, -1], [-1, 1],
  ];
  for (const [dx, dz] of arms) {
    setWorldBlock(context, worldX + dx, leafY, worldZ + dz, BLOCK_IDS.LEAVES, true);
    if (Math.abs(dx) + Math.abs(dz) >= 2) {
      setWorldBlock(context, worldX + dx, leafY - 1, worldZ + dz, BLOCK_IDS.LEAVES, true);
    }
  }
  setWorldBlock(context, worldX, leafY - 1, worldZ, BLOCK_IDS.RAW_WOOD, true);
}

function placePine(
  context: ChunkWriteContext,
  worldX: number,
  surfaceY: number,
  worldZ: number,
  trunkHeight: number,
): void {
  const trunkTop = surfaceY + trunkHeight;
  if (trunkTop + 2 >= WORLD_HEIGHT) return;
  for (let y = surfaceY + 1; y <= trunkTop; y++) {
    setWorldBlock(context, worldX, y, worldZ, BLOCK_IDS.RAW_WOOD);
  }
  const layers = Math.min(trunkHeight - 1, 5);
  for (let layer = 0; layer < layers; layer++) {
    const y = trunkTop - layer;
    const radius = Math.min(layer + 1, 3);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > radius + 1 || (dx === 0 && dz === 0)) continue;
        setWorldBlock(context, worldX + dx, y, worldZ + dz, BLOCK_IDS.LEAVES, true);
      }
    }
  }
  setWorldBlock(context, worldX, trunkTop + 1, worldZ, BLOCK_IDS.LEAVES, true);
}

function placeCactus(
  context: ChunkWriteContext,
  worldX: number,
  surfaceY: number,
  worldZ: number,
  trunkHeight: number,
): void {
  const trunkTop = surfaceY + trunkHeight;
  if (trunkTop >= WORLD_HEIGHT) return;
  for (let y = surfaceY + 1; y <= trunkTop; y++) {
    setWorldBlock(context, worldX, y, worldZ, BLOCK_IDS.CACTUS);
  }
  if (trunkHeight < 3) return;
  const direction = ((worldX + worldZ) & 1) === 0 ? 1 : -1;
  const armY = surfaceY + Math.max(2, trunkHeight - 1);
  setWorldBlock(context, worldX + direction, armY, worldZ, BLOCK_IDS.CACTUS, true);
  setWorldBlock(context, worldX + direction, armY + 1, worldZ, BLOCK_IDS.CACTUS, true);
  if (trunkHeight >= 5) {
    setWorldBlock(context, worldX, armY - 1, worldZ - direction, BLOCK_IDS.CACTUS, true);
  }
}

/**
 * 根元候補をチャンク外まで走査し、現在のチャンク内へ入る枝葉だけを書き込む。
 * これにより樹冠が境界で欠けず、隣接チャンクの生成順にも依存しない。
 */
export function placeTreesInChunk(chunk: ChunkData, cx: number, cz: number): void {
  const biome = getCurrentBiome();
  const context = { chunk, cx, cz };
  const minX = cx * CHUNK_SIZE - TREE_REACH;
  const maxX = (cx + 1) * CHUNK_SIZE + TREE_REACH - 1;
  const minZ = cz * CHUNK_SIZE - TREE_REACH;
  const maxZ = (cz + 1) * CHUNK_SIZE + TREE_REACH - 1;

  for (let worldX = minX; worldX <= maxX; worldX++) {
    for (let worldZ = minZ; worldZ <= maxZ; worldZ++) {
      if (!shouldPlaceTreeAt(worldX, worldZ) || !canGrowAt(worldX, worldZ)) continue;
      const surfaceY = getTerrainSample(worldX, worldZ).height;
      const trunkHeight = getTreeHeight(worldX, worldZ);
      switch (biome.treeType) {
        case 'oak':
          placeOak(context, worldX, surfaceY, worldZ, trunkHeight);
          break;
        case 'palm':
          placePalm(context, worldX, surfaceY, worldZ, trunkHeight);
          break;
        case 'pine':
          placePine(context, worldX, surfaceY, worldZ, trunkHeight);
          break;
        case 'cactus':
          placeCactus(context, worldX, surfaceY, worldZ, trunkHeight);
          break;
      }
    }
  }
}
