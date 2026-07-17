// 村構造物生成
// 複数の家、道、街灯で構成される村

import { getTerrainHeight } from '../heightmap';
import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT, type BlockId } from '../../../types/blocks';
import { VILLAGE_CENTER, VILLAGE_HOUSES } from '../constants';
import type { ChunkData } from '../types';

function setVillageBlock(
  chunk: ChunkData,
  cx: number,
  cz: number,
  wx: number,
  y: number,
  wz: number,
  blockId: BlockId,
): void {
  const lx = wx - cx * CHUNK_SIZE;
  const lz = wz - cz * CHUNK_SIZE;
  if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
  if (y < 0 || y >= WORLD_HEIGHT) return;
  chunk[lx][y][lz] = blockId;
}

/**
 * 村の建物1棟を配置する
 * 壁: 木ブロック、 床/屋根: 木ブロック、 窓: ガラス、 松明付き
 */
function placeVillageHouse(
  chunk: ChunkData,
  cx: number, cz: number,
  centerWorldX: number, centerWorldZ: number,
  width: number, depth: number, wallHeight: number,
  variant: number,
): void {
  const startWX = centerWorldX - Math.floor(width / 2);
  const startWZ = centerWorldZ - Math.floor(depth / 2);

  // 建物の基準高さ
  const floorY = getTerrainHeight(centerWorldX, centerWorldZ);
  const wallPalette: readonly BlockId[] = [BLOCK_IDS.WOOD, BLOCK_IDS.IRON_MOSSY, BLOCK_IDS.STONE];
  const roofPalette: readonly BlockId[] = [BLOCK_IDS.WOOD, BLOCK_IDS.IRON_CRACKED, BLOCK_IDS.RAW_WOOD];
  const wallBlock = wallPalette[variant % wallPalette.length];
  const roofBlock = roofPalette[variant % roofPalette.length];

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
              const isCornerPost = isEdgeX && isEdgeZ;
              const isTopBeam = y === floorY + wallHeight;
              chunk[lx][y][lz] = isCornerPost || isTopBeam ? BLOCK_IDS.RAW_WOOD : wallBlock;
            }
          } else {
            chunk[lx][y][lz] = BLOCK_IDS.AIR; // 内部空間
          }
        } else if (y === floorY + wallHeight + 1) {
          chunk[lx][y][lz] = BLOCK_IDS.AIR;
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

  // 切妻屋根。全棟を寸法違いの箱にせず、屋根勾配と軒で街並みの輪郭を作る
  const roofBaseY = floorY + wallHeight + 1;
  const halfRoof = Math.floor(width / 2);
  for (let slope = 0; slope <= halfRoof; slope++) {
    const leftWX = startWX + slope;
    const rightWX = startWX + width - 1 - slope;
    const y = roofBaseY + slope;
    for (let wz = startWZ - 1; wz <= startWZ + depth; wz++) {
      setVillageBlock(chunk, cx, cz, leftWX, y, wz, roofBlock);
      setVillageBlock(chunk, cx, cz, rightWX, y, wz, roofBlock);
    }
  }

  // 妻壁は壁材で塞ぎ、中央に小さな明かり取りを設ける
  for (const wz of [startWZ, startWZ + depth - 1]) {
    for (let level = 0; level < halfRoof; level++) {
      const inset = level + 1;
      for (let wx = startWX + inset; wx <= startWX + width - 1 - inset; wx++) {
        const atticWindow = width >= 6 && level === 1 && wx === centerWorldX;
        setVillageBlock(
          chunk,
          cx,
          cz,
          wx,
          roofBaseY + level,
          wz,
          atticWindow ? BLOCK_IDS.GLASS : wallBlock,
        );
      }
    }
  }

  // 玄関ポーチ、支柱、庇。建物ごとに庇材を変えて反復感を抑える
  const doorWX = startWX + Math.floor(width / 2);
  for (let wx = doorWX - 1; wx <= doorWX + 1; wx++) {
    setVillageBlock(chunk, cx, cz, wx, floorY, startWZ - 1, BLOCK_IDS.WOOD);
    setVillageBlock(chunk, cx, cz, wx, floorY + 3, startWZ - 1, roofBlock);
  }
  setVillageBlock(chunk, cx, cz, doorWX - 1, floorY + 1, startWZ - 1, BLOCK_IDS.RAW_WOOD);
  setVillageBlock(chunk, cx, cz, doorWX + 1, floorY + 1, startWZ - 1, BLOCK_IDS.RAW_WOOD);

  // 大きな家には煙突、小屋には荷箱を付け、用途の違いを形で見せる
  if (width >= 6) {
    const chimneyWX = startWX + 1;
    const chimneyWZ = startWZ + depth - 2;
    for (let y = roofBaseY; y <= roofBaseY + halfRoof + 1; y++) {
      setVillageBlock(chunk, cx, cz, chimneyWX, y, chimneyWZ, y === roofBaseY + halfRoof + 1 ? BLOCK_IDS.FURNACE : BLOCK_IDS.STONE);
    }
  } else {
    setVillageBlock(chunk, cx, cz, startWX + width - 2, floorY + 1, startWZ + depth - 2, BLOCK_IDS.CHEST);
  }

  // 入口脇の植栽。専用スプラウトRendererで軽量に描画される
  setVillageBlock(chunk, cx, cz, doorWX - 2, floorY + 1, startWZ - 1, BLOCK_IDS.WHEAT_SEEDS);
  setVillageBlock(chunk, cx, cz, doorWX + 2, floorY + 1, startWZ - 1, BLOCK_IDS.WHEAT_SEEDS);

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
  VILLAGE_HOUSES.forEach((house, index) => {
    placeVillageHouse(
      chunk, cx, cz,
      VILLAGE_CENTER.x + house.dx,
      VILLAGE_CENTER.z + house.dz,
      house.w, house.d, house.h,
      index,
    );
  });

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
