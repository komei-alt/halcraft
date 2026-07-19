// ステージ固有ランドマーク生成
// 各マップに「選んだ理由」が見える起点を作る

import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT, type BlockId } from '../../../types/blocks';
import type { BiomeId, StageDefinition } from '../../../types/stages';
import { STAGE_LANDMARK_CENTER, STAGE_LANDMARK_RADIUS } from '../../../types/stageLandmarks';
import { getTerrainHeight } from '../heightmap';
import { getCurrentTerrainStage } from '../stageConfig';
import type { ChunkData } from '../types';

function biomeFloorBlock(biome: BiomeId): BlockId {
  switch (biome) {
    case 'snow':
      return BLOCK_IDS.SNOW;
    case 'desert':
      return BLOCK_IDS.SAND;
    case 'tropical':
      return BLOCK_IDS.WOOD;
    case 'forest':
    default:
      return BLOCK_IDS.GRASS;
  }
}

function biomeAccentBlock(biome: BiomeId): BlockId {
  switch (biome) {
    case 'snow':
      return BLOCK_IDS.GLASS;
    case 'desert':
      return BLOCK_IDS.SAND;
    case 'tropical':
      return BLOCK_IDS.WATER;
    case 'forest':
    default:
      return BLOCK_IDS.LEAVES;
  }
}

function worldToLocal(wx: number, wz: number, cx: number, cz: number): { lx: number; lz: number } | null {
  const lx = wx - cx * CHUNK_SIZE;
  const lz = wz - cz * CHUNK_SIZE;
  if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return null;
  return { lx, lz };
}

function setWorldBlock(
  chunk: ChunkData,
  cx: number,
  cz: number,
  wx: number,
  y: number,
  wz: number,
  blockId: BlockId,
): void {
  if (y < 0 || y >= WORLD_HEIGHT) return;
  const local = worldToLocal(wx, wz, cx, cz);
  if (!local) return;
  chunk[local.lx][y][local.lz] = blockId;
}

function prepareLandmarkSite(chunk: ChunkData, cx: number, cz: number, stage: StageDefinition): number {
  const baseY = getTerrainHeight(STAGE_LANDMARK_CENTER.x, STAGE_LANDMARK_CENTER.z);
  const floorBlock = biomeFloorBlock(stage.biome);

  for (let wx = STAGE_LANDMARK_CENTER.x - STAGE_LANDMARK_RADIUS; wx <= STAGE_LANDMARK_CENTER.x + STAGE_LANDMARK_RADIUS; wx++) {
    for (let wz = STAGE_LANDMARK_CENTER.z - STAGE_LANDMARK_RADIUS; wz <= STAGE_LANDMARK_CENTER.z + STAGE_LANDMARK_RADIUS; wz++) {
      const local = worldToLocal(wx, wz, cx, cz);
      if (!local) continue;

      const dx = wx - STAGE_LANDMARK_CENTER.x;
      const dz = wz - STAGE_LANDMARK_CENTER.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > STAGE_LANDMARK_RADIUS) continue;

      const terrainY = getTerrainHeight(wx, wz);
      for (let y = Math.max(1, baseY - 4); y < baseY; y++) {
        chunk[local.lx][y][local.lz] = floorBlock;
      }

      const isOuterRing = dist > STAGE_LANDMARK_RADIUS - 2;
      chunk[local.lx][baseY][local.lz] = isOuterRing ? BLOCK_IDS.STONE : floorBlock;

      const clearTop = Math.min(WORLD_HEIGHT - 1, Math.max(terrainY + 8, baseY + 8));
      for (let y = baseY + 1; y <= clearTop; y++) {
        chunk[local.lx][y][local.lz] = BLOCK_IDS.AIR;
      }
    }
  }

  return baseY;
}

function placeColumn(
  chunk: ChunkData,
  cx: number,
  cz: number,
  wx: number,
  baseY: number,
  wz: number,
  height: number,
  blockId: BlockId,
): void {
  for (let h = 1; h <= height; h++) {
    setWorldBlock(chunk, cx, cz, wx, baseY + h, wz, blockId);
  }
}

function placeHorizontalLine(
  chunk: ChunkData,
  cx: number,
  cz: number,
  startX: number,
  startZ: number,
  dx: number,
  dz: number,
  length: number,
  y: number,
  blockId: BlockId,
): void {
  for (let i = 0; i < length; i++) {
    setWorldBlock(chunk, cx, cz, startX + dx * i, y, startZ + dz * i, blockId);
  }
}

function placeBuildLandmark(chunk: ChunkData, cx: number, cz: number, stage: StageDefinition, baseY: number): void {
  const accent = biomeAccentBlock(stage.biome);
  const center = STAGE_LANDMARK_CENTER;

  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      if (Math.abs(dx) === 4 || Math.abs(dz) === 4) {
        setWorldBlock(chunk, cx, cz, center.x + dx, baseY + 1, center.z + dz, BLOCK_IDS.TORCH);
      }
    }
  }

  setWorldBlock(chunk, cx, cz, center.x, baseY + 1, center.z, BLOCK_IDS.CAMPFIRE);
  setWorldBlock(chunk, cx, cz, center.x + 2, baseY + 1, center.z, BLOCK_IDS.CANDLE);
  setWorldBlock(chunk, cx, cz, center.x - 2, baseY + 1, center.z, BLOCK_IDS.CANDLE);

  const towerBlock = stage.biome === 'desert' ? BLOCK_IDS.SAND : stage.biome === 'snow' ? BLOCK_IDS.GLASS : BLOCK_IDS.WOOD;
  const corners = [
    { x: center.x - 7, z: center.z - 7 },
    { x: center.x + 7, z: center.z - 7 },
    { x: center.x - 7, z: center.z + 7 },
    { x: center.x + 7, z: center.z + 7 },
  ];

  for (const corner of corners) {
    placeColumn(chunk, cx, cz, corner.x, baseY, corner.z, 4, towerBlock);
    setWorldBlock(chunk, cx, cz, corner.x, baseY + 5, corner.z, BLOCK_IDS.GLOWSTONE);
  }

  if (stage.biome === 'tropical') {
    for (let i = -6; i <= 6; i++) {
      setWorldBlock(chunk, cx, cz, center.x + i, baseY + 1, center.z - 6, BLOCK_IDS.WATER);
      setWorldBlock(chunk, cx, cz, center.x + i, baseY + 1, center.z + 6, BLOCK_IDS.WATER);
      if (i % 2 === 0) {
        setWorldBlock(chunk, cx, cz, center.x + i, baseY + 2, center.z - 4, BLOCK_IDS.GLASS);
        setWorldBlock(chunk, cx, cz, center.x + i, baseY + 2, center.z + 4, BLOCK_IDS.GLASS);
      }
    }
    placeColumn(chunk, cx, cz, center.x - 3, baseY, center.z, 3, BLOCK_IDS.RAW_WOOD);
    setWorldBlock(chunk, cx, cz, center.x - 3, baseY + 4, center.z, BLOCK_IDS.LEAVES);
    setWorldBlock(chunk, cx, cz, center.x + 3, baseY + 2, center.z, BLOCK_IDS.GLOWSTONE);
  } else if (stage.biome === 'desert') {
    for (let h = 1; h <= 4; h++) {
      const radius = 5 - h;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) + Math.abs(dz) <= radius + 1) {
            setWorldBlock(chunk, cx, cz, center.x + dx, baseY + h, center.z + dz, accent);
          }
        }
      }
    }
    setWorldBlock(chunk, cx, cz, center.x, baseY + 5, center.z, BLOCK_IDS.GLOWSTONE);
    for (const pos of [
      { x: center.x - 6, z: center.z },
      { x: center.x + 6, z: center.z },
      { x: center.x, z: center.z - 6 },
      { x: center.x, z: center.z + 6 },
    ]) {
      placeColumn(chunk, cx, cz, pos.x, baseY, pos.z, 3, BLOCK_IDS.SAND);
      setWorldBlock(chunk, cx, cz, pos.x, baseY + 4, pos.z, BLOCK_IDS.CANDLE);
    }
  } else if (stage.biome === 'snow') {
    for (let h = 1; h <= 7; h++) {
      setWorldBlock(chunk, cx, cz, center.x, baseY + h, center.z, h % 2 === 0 ? BLOCK_IDS.GLASS : BLOCK_IDS.SNOW);
    }
    setWorldBlock(chunk, cx, cz, center.x, baseY + 8, center.z, BLOCK_IDS.GLOWSTONE);
    for (const pos of [
      { x: center.x - 3, z: center.z },
      { x: center.x + 3, z: center.z },
      { x: center.x, z: center.z - 3 },
      { x: center.x, z: center.z + 3 },
    ]) {
      placeColumn(chunk, cx, cz, pos.x, baseY, pos.z, 4, BLOCK_IDS.GLASS);
      setWorldBlock(chunk, cx, cz, pos.x, baseY + 5, pos.z, BLOCK_IDS.SNOW);
    }
  } else {
    for (let i = -5; i <= 5; i++) {
      setWorldBlock(chunk, cx, cz, center.x + i, baseY + 1, center.z - 5, BLOCK_IDS.LEAVES);
      setWorldBlock(chunk, cx, cz, center.x - 5, baseY + 1, center.z + i, BLOCK_IDS.LEAVES);
    }
    placeColumn(chunk, cx, cz, center.x - 4, baseY, center.z - 3, 5, BLOCK_IDS.RAW_WOOD);
    placeColumn(chunk, cx, cz, center.x + 4, baseY, center.z - 3, 5, BLOCK_IDS.RAW_WOOD);
    placeHorizontalLine(chunk, cx, cz, center.x - 4, center.z - 3, 1, 0, 9, baseY + 6, BLOCK_IDS.WOOD);
    placeHorizontalLine(chunk, cx, cz, center.x - 3, center.z - 4, 1, 0, 7, baseY + 7, BLOCK_IDS.LEAVES);
    setWorldBlock(chunk, cx, cz, center.x, baseY + 6, center.z - 2, BLOCK_IDS.GLOWSTONE);
  }
}

function placeWarLandmark(chunk: ChunkData, cx: number, cz: number, stage: StageDefinition, baseY: number): void {
  const center = STAGE_LANDMARK_CENTER;
  const wallBlock = stage.biome === 'snow' ? BLOCK_IDS.SNOW : stage.biome === 'desert' ? BLOCK_IDS.SAND : BLOCK_IDS.IRON_MOSSY;

  for (let dx = -8; dx <= 8; dx++) {
    for (let dz = -8; dz <= 8; dz++) {
      const ring = Math.abs(dx) === 8 || Math.abs(dz) === 8;
      const lane = Math.abs(dx) <= 1 || Math.abs(dz) <= 1;
      if (ring) {
        setWorldBlock(chunk, cx, cz, center.x + dx, baseY + 1, center.z + dz, wallBlock);
      } else if (lane) {
        setWorldBlock(chunk, cx, cz, center.x + dx, baseY, center.z + dz, BLOCK_IDS.IRON_CRACKED);
      }
    }
  }

  setWorldBlock(chunk, cx, cz, center.x, baseY + 1, center.z, BLOCK_IDS.CORE);
  setWorldBlock(chunk, cx, cz, center.x, baseY + 2, center.z, BLOCK_IDS.ELECTRIC);

  const spawners = [
    { x: center.x, z: center.z - 10 },
    { x: center.x + 10, z: center.z },
    { x: center.x, z: center.z + 10 },
    { x: center.x - 10, z: center.z },
  ];
  for (const pos of spawners) {
    setWorldBlock(chunk, cx, cz, pos.x, baseY + 1, pos.z, BLOCK_IDS.SPAWNER);
    setWorldBlock(chunk, cx, cz, pos.x, baseY + 2, pos.z, BLOCK_IDS.TORCH);
  }

  const turrets = [
    { x: center.x - 6, z: center.z - 6 },
    { x: center.x + 6, z: center.z - 6 },
    { x: center.x - 6, z: center.z + 6 },
    { x: center.x + 6, z: center.z + 6 },
  ];
  for (const pos of turrets) {
    setWorldBlock(chunk, cx, cz, pos.x, baseY + 1, pos.z, BLOCK_IDS.TURRET);
  }

  if (stage.biome === 'desert') {
    // 遠景から目的地として読める段状ピラミッド。北面には3ブロック幅の入口を残す。
    for (let h = 1; h <= 6; h++) {
      const radius = 8 - h;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const onTerraceEdge = Math.abs(dx) === radius || Math.abs(dz) === radius;
          if (!onTerraceEdge) continue;
          const entrance = dz === -radius && Math.abs(dx) <= 1 && h <= 3;
          if (entrance) continue;
          const accentStep = h === 2 && (Math.abs(dx) + Math.abs(dz)) % 5 === 0;
          setWorldBlock(
            chunk,
            cx,
            cz,
            center.x + dx,
            baseY + h,
            center.z + dz,
            accentStep ? BLOCK_IDS.IRON_CRACKED : BLOCK_IDS.SAND,
          );
        }
      }
    }
    setWorldBlock(chunk, cx, cz, center.x, baseY + 7, center.z, BLOCK_IDS.GLOWSTONE);
    for (const pos of [
      { x: center.x - 4, z: center.z },
      { x: center.x + 4, z: center.z },
      { x: center.x, z: center.z - 4 },
      { x: center.x, z: center.z + 4 },
    ]) {
      setWorldBlock(chunk, cx, cz, pos.x, baseY + 1, pos.z, BLOCK_IDS.LAVA);
      setWorldBlock(chunk, cx, cz, pos.x, baseY + 2, pos.z, BLOCK_IDS.NETHERRACK);
    }
  }

  if (stage.biome === 'tropical') {
    for (let i = -9; i <= 9; i++) {
      setWorldBlock(chunk, cx, cz, center.x + i, baseY + 1, center.z - 9, BLOCK_IDS.WATER);
      setWorldBlock(chunk, cx, cz, center.x + i, baseY + 1, center.z + 9, BLOCK_IDS.WATER);
      if (i % 3 === 0) {
        setWorldBlock(chunk, cx, cz, center.x + i, baseY + 2, center.z - 7, BLOCK_IDS.GLASS);
        setWorldBlock(chunk, cx, cz, center.x + i, baseY + 2, center.z + 7, BLOCK_IDS.GLASS);
      }
    }
    placeColumn(chunk, cx, cz, center.x, baseY, center.z - 4, 4, BLOCK_IDS.ELECTRIC);
    setWorldBlock(chunk, cx, cz, center.x, baseY + 5, center.z - 4, BLOCK_IDS.GLOWSTONE);
  }

  if (stage.biome === 'forest') {
    for (const pos of [
      { x: center.x - 8, z: center.z },
      { x: center.x + 8, z: center.z },
      { x: center.x, z: center.z - 8 },
      { x: center.x, z: center.z + 8 },
    ]) {
      placeColumn(chunk, cx, cz, pos.x, baseY, pos.z, 3, BLOCK_IDS.IRON_MOSSY);
      setWorldBlock(chunk, cx, cz, pos.x, baseY + 4, pos.z, BLOCK_IDS.LEAVES);
    }
    placeHorizontalLine(chunk, cx, cz, center.x - 4, center.z, 1, 0, 9, baseY + 2, BLOCK_IDS.IRON_CRACKED);
  }

  if (stage.biome === 'snow') {
    for (const pos of [
      { x: center.x - 5, z: center.z },
      { x: center.x + 5, z: center.z },
      { x: center.x, z: center.z - 5 },
      { x: center.x, z: center.z + 5 },
    ]) {
      placeColumn(chunk, cx, cz, pos.x, baseY, pos.z, 4, BLOCK_IDS.SNOW);
      setWorldBlock(chunk, cx, cz, pos.x, baseY + 5, pos.z, BLOCK_IDS.GLASS);
    }
    setWorldBlock(chunk, cx, cz, center.x, baseY + 3, center.z, BLOCK_IDS.ELECTRIC);
  }
}

function placeDesertWarSpawnRift(chunk: ChunkData, cx: number, cz: number, stage: StageDefinition): void {
  if (stage.id !== 'war-desert') return;

  // 開始地点の少し前方に、遠距離火力マップらしい危険地形を見せる。
  for (let wx = 2; wx <= 14; wx++) {
    const centerZ = 3 + Math.round(Math.sin((wx - 2) * 0.65) * 1.4);
    for (let dz = -1; dz <= 1; dz++) {
      const wz = centerZ + dz;
      const local = worldToLocal(wx, wz, cx, cz);
      if (!local) continue;

      const surfaceY = getTerrainHeight(wx, wz);
      const isLavaCore = dz === 0 || (wx % 5 === 0 && Math.abs(dz) === 1);
      setWorldBlock(chunk, cx, cz, wx, surfaceY - 1, wz, BLOCK_IDS.STONE);
      setWorldBlock(chunk, cx, cz, wx, surfaceY, wz, isLavaCore ? BLOCK_IDS.LAVA : BLOCK_IDS.NETHERRACK);
      for (let y = surfaceY + 1; y <= Math.min(WORLD_HEIGHT - 1, surfaceY + 4); y++) {
        setWorldBlock(chunk, cx, cz, wx, y, wz, BLOCK_IDS.AIR);
      }
    }
  }

  for (const glow of [
    { x: 3, z: 1 },
    { x: 13, z: 5 },
  ]) {
    const y = getTerrainHeight(glow.x, glow.z);
    setWorldBlock(chunk, cx, cz, glow.x, y, glow.z, BLOCK_IDS.GLOWSTONE);
  }
}

/** 現在のステージに応じたランドマークを配置する */
export function placeStageLandmarks(chunk: ChunkData, cx: number, cz: number): void {
  const stage = getCurrentTerrainStage();
  if (!stage) return;

  placeDesertWarSpawnRift(chunk, cx, cz, stage);

  const chunkMinX = cx * CHUNK_SIZE;
  const chunkMaxX = chunkMinX + CHUNK_SIZE;
  const chunkMinZ = cz * CHUNK_SIZE;
  const chunkMaxZ = chunkMinZ + CHUNK_SIZE;
  if (
    chunkMaxX < STAGE_LANDMARK_CENTER.x - STAGE_LANDMARK_RADIUS ||
    chunkMinX > STAGE_LANDMARK_CENTER.x + STAGE_LANDMARK_RADIUS ||
    chunkMaxZ < STAGE_LANDMARK_CENTER.z - STAGE_LANDMARK_RADIUS ||
    chunkMinZ > STAGE_LANDMARK_CENTER.z + STAGE_LANDMARK_RADIUS
  ) {
    return;
  }

  const baseY = prepareLandmarkSite(chunk, cx, cz, stage);
  if (stage.category === 'build') {
    placeBuildLandmark(chunk, cx, cz, stage, baseY);
  } else {
    placeWarLandmark(chunk, cx, cz, stage, baseY);
  }
}
