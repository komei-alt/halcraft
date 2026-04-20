// 村構造物生成
// 複数の家、道、街灯で構成される村

import { getTerrainHeight } from '../heightmap';
import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT } from '../../../types/blocks';
import { VILLAGE_CENTER, VILLAGE_HOUSES } from '../constants';
import type { ChunkData } from '../types';

/**
 * 村の建物1棟を配置する
 * 壁: 木ブロック、 床/屋根: 木ブロック、 窓: ガラス、 松明付き
 */
function placeVillageHouse(
  chunk: ChunkData,
  cx: number, cz: number,
  centerWorldX: number, centerWorldZ: number,
  width: number, depth: number, wallHeight: number,
): void {
  const startWX = centerWorldX - Math.floor(width / 2);
  const startWZ = centerWorldZ - Math.floor(depth / 2);

  // 建物の基準高さ
  const floorY = getTerrainHeight(centerWorldX, centerWorldZ);

  for (let wx = startWX; wx < startWX + width; wx++) {
    for (let wz = startWZ; wz < startWZ + depth; wz++) {
      // チャンク内のローカル座標
      const lx = wx - cx * CHUNK_SIZE;
      const lz = wz - cz * CHUNK_SIZE;

      // チャンク範囲外はスキップ
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;

      const relX = wx - startWX;
      const relZ = wz - startWZ;
      const isEdgeX = relX === 0 || relX === width - 1;
      const isEdgeZ = relZ === 0 || relZ === depth - 1;
      const isEdge = isEdgeX || isEdgeZ;
      const isDoor = relX === Math.floor(width / 2) && relZ === 0;

      // 地面を整地
      for (let y = floorY - 2; y <= floorY + wallHeight + 1; y++) {
        if (y < 0 || y >= WORLD_HEIGHT) continue;
        if (y < floorY) {
          chunk[lx][y][lz] = BLOCK_IDS.DIRT;
        } else if (y === floorY) {
          chunk[lx][y][lz] = BLOCK_IDS.WOOD; // 床
        } else if (y <= floorY + wallHeight) {
          if (isEdge) {
            // ドア穴
            if (isDoor && y <= floorY + 2) {
              chunk[lx][y][lz] = y === floorY + 1 ? BLOCK_IDS.DOOR : BLOCK_IDS.AIR;
            }
            // 窓（壁の辺中央、高さ2段目、角ブロックは除外）
            else if (
              y === floorY + 2 &&
              !(isEdgeX && isEdgeZ) && // 角には窓を置かない
              ((isEdgeX && relZ === Math.floor(depth / 2)) ||
               (isEdgeZ && relX === Math.floor(width / 2)))
            ) {
              chunk[lx][y][lz] = BLOCK_IDS.GLASS;
            } else {
              chunk[lx][y][lz] = BLOCK_IDS.WOOD; // 壁
            }
          } else {
            chunk[lx][y][lz] = BLOCK_IDS.AIR; // 内部空間
          }
        } else if (y === floorY + wallHeight + 1) {
          chunk[lx][y][lz] = BLOCK_IDS.WOOD; // 屋根
        } else {
          chunk[lx][y][lz] = BLOCK_IDS.AIR;
        }
      }

      // 上の木や障害物を除去
      for (let y = floorY + wallHeight + 2; y < floorY + wallHeight + 8; y++) {
        if (y >= 0 && y < WORLD_HEIGHT) {
          chunk[lx][y][lz] = BLOCK_IDS.AIR;
        }
      }
    }
  }

  // 松明を配置（建物内の角）
  const torchPositions = [
    { wx: startWX + 1, wz: startWZ + 1 },
    { wx: startWX + width - 2, wz: startWZ + depth - 2 },
  ];
  for (const tp of torchPositions) {
    const lx = tp.wx - cx * CHUNK_SIZE;
    const lz = tp.wz - cz * CHUNK_SIZE;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
      const ty = floorY + 1;
      if (ty < WORLD_HEIGHT) {
        chunk[lx][ty][lz] = BLOCK_IDS.TORCH;
      }
    }
  }

  const candleWX = startWX + width - 2;
  const candleWZ = startWZ + depth - 2;
  const candleLX = candleWX - cx * CHUNK_SIZE;
  const candleLZ = candleWZ - cz * CHUNK_SIZE;
  if (candleLX >= 0 && candleLX < CHUNK_SIZE && candleLZ >= 0 && candleLZ < CHUNK_SIZE) {
    const candleY = floorY + 1;
    if (candleY < WORLD_HEIGHT) {
      chunk[candleLX][candleY][candleLZ] = BLOCK_IDS.CANDLE;
    }
  }
}

/**
 * 村の道（芝→土の小道）を生成
 */
function placeVillagePaths(chunk: ChunkData, cx: number, cz: number): void {
  // 村の中心から各家への道
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const worldX = cx * CHUNK_SIZE + lx;
      const worldZ = cz * CHUNK_SIZE + lz;

      const relX = worldX - VILLAGE_CENTER.x;
      const relZ = worldZ - VILLAGE_CENTER.z;

      // 村の範囲外はスキップ
      if (Math.abs(relX) > 22 || Math.abs(relZ) > 22) continue;

      // 道のパターン: 十字路 + 中心広場
      const isPath =
        // 中心の広場（3x3）
        (Math.abs(relX) <= 1 && Math.abs(relZ) <= 1) ||
        // 南北の道
        (Math.abs(relX) <= 1 && Math.abs(relZ) <= 18) ||
        // 東西の道
        (Math.abs(relZ) <= 1 && Math.abs(relX) <= 16);

      if (isPath) {
        const surfaceY = getTerrainHeight(worldX, worldZ);
        if (surfaceY >= 0 && surfaceY < WORLD_HEIGHT) {
          chunk[lx][surfaceY][lz] = BLOCK_IDS.DIRT;
          // 道の上の木を除去
          for (let y = surfaceY + 1; y < surfaceY + 8; y++) {
            if (y < WORLD_HEIGHT) {
              chunk[lx][y][lz] = BLOCK_IDS.AIR;
            }
          }
        }
      }
    }
  }
}

/**
 * 村全体を配置するヘルパー
 */
export function placeVillage(chunk: ChunkData, cx: number, cz: number): void {
  // 道を配置
  placeVillagePaths(chunk, cx, cz);

  // 各家を配置
  for (const house of VILLAGE_HOUSES) {
    placeVillageHouse(
      chunk, cx, cz,
      VILLAGE_CENTER.x + house.dx,
      VILLAGE_CENTER.z + house.dz,
      house.w, house.d, house.h,
    );
  }

  // 村の中心に焚き火と松明街灯を配置
  const centerLX = VILLAGE_CENTER.x - cx * CHUNK_SIZE;
  const centerLZ = VILLAGE_CENTER.z - cz * CHUNK_SIZE;
  if (centerLX >= 0 && centerLX < CHUNK_SIZE && centerLZ >= 0 && centerLZ < CHUNK_SIZE) {
    const surfaceY = getTerrainHeight(VILLAGE_CENTER.x, VILLAGE_CENTER.z);
    if (surfaceY + 1 < WORLD_HEIGHT) {
      chunk[centerLX][surfaceY + 1][centerLZ] = BLOCK_IDS.CAMPFIRE;
    }
    // 街灯（木の幹 + 松明）
    for (let h = 1; h <= 3; h++) {
      if (surfaceY + h < WORLD_HEIGHT) {
        if (h !== 1) {
          chunk[centerLX][surfaceY + h][centerLZ] = BLOCK_IDS.RAW_WOOD;
        }
      }
    }
    if (surfaceY + 4 < WORLD_HEIGHT) {
      chunk[centerLX][surfaceY + 4][centerLZ] = BLOCK_IDS.TORCH;
    }
  }
}

/**
 * チャンクが村エリアに含まれるかチェック
 */
export function chunkContainsVillage(cx: number, cz: number): boolean {
  const chunkMinX = cx * CHUNK_SIZE;
  const chunkMaxX = chunkMinX + CHUNK_SIZE;
  const chunkMinZ = cz * CHUNK_SIZE;
  const chunkMaxZ = chunkMinZ + CHUNK_SIZE;

  return (
    chunkMaxX > VILLAGE_CENTER.x - 25 &&
    chunkMinX < VILLAGE_CENTER.x + 25 &&
    chunkMaxZ > VILLAGE_CENTER.z - 25 &&
    chunkMinZ < VILLAGE_CENTER.z + 25
  );
}
