// 地表装飾ユーティリティ
// バイオームに応じて茂み・岩・枯れ木などの小さな装飾を地表に撒き、マップの密度感を上げる。
// 木と同じくノイズベースで自然に散らす。構造物エリア（ヘリポート・村）は避ける。

import { getTreeNoise } from '../noise';
import { getTerrainHeight } from '../heightmap';
import { getCurrentBiome } from '../biomeConfig';
import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL } from '../../../types/blocks';
import { HELIPORT_CENTER, HELIPORT_SIZE, VILLAGE_CENTER } from '../constants';
import type { ChunkData } from '../types';
import type { DecorKind } from '../../../types/biomes';

/** 構造物エリア（装飾を置かない） */
function inStructureZone(worldX: number, worldZ: number): boolean {
  if (
    Math.abs(worldX - HELIPORT_CENTER.x) < HELIPORT_SIZE + 3 &&
    Math.abs(worldZ - HELIPORT_CENTER.z) < HELIPORT_SIZE + 3
  ) {
    return true;
  }
  if (
    Math.abs(worldX - VILLAGE_CENTER.x) < 25 &&
    Math.abs(worldZ - VILLAGE_CENTER.z) < 25
  ) {
    return true;
  }
  return false;
}

/** 茂み（大小で輪郭を変える低い葉の塊） */
function placeBush(chunk: ChunkData, lx: number, surfaceY: number, lz: number, big: boolean): void {
  const y = surfaceY + 1;
  if (y >= WORLD_HEIGHT) return;
  chunk[lx][y][lz] = BLOCK_IDS.LEAVES;
  if (!big) return;

  const offsets = ((lx + lz) & 1) === 0
    ? [[1, 0], [0, 1]]
    : [[-1, 0], [0, -1]];
  for (const [dx, dz] of offsets) {
    const bx = lx + dx;
    const bz = lz + dz;
    if (bx > 0 && bx < CHUNK_SIZE - 1 && bz > 0 && bz < CHUNK_SIZE - 1) {
      chunk[bx][y][bz] = BLOCK_IDS.LEAVES;
    }
  }
}

/** 岩（石ブロック1〜2段） */
function placeRock(chunk: ChunkData, lx: number, surfaceY: number, lz: number, big: boolean): void {
  if (surfaceY + 1 < WORLD_HEIGHT) chunk[lx][surfaceY + 1][lz] = BLOCK_IDS.STONE;
  if (big) {
    const sideX = lx + (((lx + lz) & 1) === 0 ? 1 : -1);
    if (sideX > 0 && sideX < CHUNK_SIZE - 1 && surfaceY + 1 < WORLD_HEIGHT) {
      chunk[sideX][surfaceY + 1][lz] = BLOCK_IDS.IRON_CRACKED;
    }
    if (surfaceY + 2 < WORLD_HEIGHT) chunk[lx][surfaceY + 2][lz] = BLOCK_IDS.STONE;
  }
}

/** 雪の岩（雪塊） */
function placeSnowRock(chunk: ChunkData, lx: number, surfaceY: number, lz: number): void {
  if (surfaceY + 1 < WORLD_HEIGHT) chunk[lx][surfaceY + 1][lz] = BLOCK_IDS.SNOW;
  if (((lx + lz) & 3) === 0 && surfaceY + 1 < WORLD_HEIGHT && lx + 1 < CHUNK_SIZE) {
    chunk[lx + 1][surfaceY + 1][lz] = BLOCK_IDS.GLASS;
  }
}

/** 枯れ木（砂漠の枯れ枝） */
function placeDeadBush(chunk: ChunkData, lx: number, surfaceY: number, lz: number): void {
  if (surfaceY + 1 < WORLD_HEIGHT) chunk[lx][surfaceY + 1][lz] = BLOCK_IDS.RAW_WOOD;
  if (surfaceY + 2 < WORLD_HEIGHT) chunk[lx][surfaceY + 2][lz] = BLOCK_IDS.RAW_WOOD;
  const branchX = lx + (((lx + lz) & 1) === 0 ? 1 : -1);
  if (branchX > 0 && branchX < CHUNK_SIZE - 1 && surfaceY + 2 < WORLD_HEIGHT) {
    chunk[branchX][surfaceY + 2][lz] = BLOCK_IDS.RAW_WOOD;
  }
}

function placeDecor(chunk: ChunkData, kind: DecorKind, lx: number, surfaceY: number, lz: number, big: boolean): void {
  switch (kind) {
    case 'bush':
      placeBush(chunk, lx, surfaceY, lz, big);
      break;
    case 'rock':
      placeRock(chunk, lx, surfaceY, lz, big);
      break;
    case 'snowRock':
      placeSnowRock(chunk, lx, surfaceY, lz);
      break;
    case 'deadBush':
      placeDeadBush(chunk, lx, surfaceY, lz);
      break;
    case 'flower':
      // 専用スプラウト形状を使い、茂みとの見分けを付ける
      if (surfaceY + 1 < WORLD_HEIGHT) chunk[lx][surfaceY + 1][lz] = BLOCK_IDS.WHEAT_SEEDS;
      break;
  }
}

/**
 * チャンクに地表装飾を配置する。
 * 木と被らないよう、地表の真上が空のときだけ置く。
 */
export function placeDecorInChunk(chunk: ChunkData, cx: number, cz: number): void {
  const biome = getCurrentBiome();
  if (biome.decorKinds.length === 0 || biome.decorDensity <= 0) return;

  const tn = getTreeNoise();
  const MARGIN = 1;

  for (let lx = MARGIN; lx < CHUNK_SIZE - MARGIN; lx++) {
    for (let lz = MARGIN; lz < CHUNK_SIZE - MARGIN; lz++) {
      const worldX = cx * CHUNK_SIZE + lx;
      const worldZ = cz * CHUNK_SIZE + lz;

      if (inStructureZone(worldX, worldZ)) continue;

      // 高周波ノイズで散らす（密度はバイオーム設定）
      const scatter = (tn(worldX * 0.9 + 500, worldZ * 0.9 + 500) + 1) / 2;
      if (scatter > biome.decorDensity) continue;

      const surfaceY = getTerrainHeight(worldX, worldZ);
      // 水中・水際は置かない
      if (surfaceY < SEA_LEVEL) continue;

      // 自然な地面（地表ブロック or ビーチの砂）にのみ置く
      const surf = chunk[lx]?.[surfaceY]?.[lz];
      if (surf !== biome.surfaceBlock && surf !== BLOCK_IDS.SAND) continue;
      // 真上が空でない（木・他装飾）なら置かない
      if (chunk[lx]?.[surfaceY + 1]?.[lz] !== BLOCK_IDS.AIR) continue;

      // 装飾の種類を決定（別ノイズで散らす）
      const pick = (tn(worldX * 1.7 + 900, worldZ * 1.7 + 900) + 1) / 2;
      const idx = Math.min(biome.decorKinds.length - 1, Math.floor(pick * biome.decorKinds.length));
      const kind = biome.decorKinds[idx];
      const big = pick > 0.7;

      placeDecor(chunk, kind, lx, surfaceY, lz, big);
    }
  }
}
