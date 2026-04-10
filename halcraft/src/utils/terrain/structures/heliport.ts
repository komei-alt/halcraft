// ヘリポート構造物生成
// 鉄ブロックの平らなパッド + 中央にHマーク + 周囲に松明

import { getTerrainHeight } from '../heightmap';
import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT } from '../../../types/blocks';
import { HELIPORT_CENTER, HELIPORT_SIZE } from '../constants';
import type { ChunkData } from '../types';

/**
 * ヘリポートを生成する
 * 鉄ブロックの平らなパッド + 中央にHマーク + 周囲に松明
 */
export function placeHeliport(chunk: ChunkData, cx: number, cz: number): void {
  const halfSize = Math.floor(HELIPORT_SIZE / 2);

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const worldX = cx * CHUNK_SIZE + lx;
      const worldZ = cz * CHUNK_SIZE + lz;

      const relX = worldX - HELIPORT_CENTER.x;
      const relZ = worldZ - HELIPORT_CENTER.z;

      // ヘリポートの範囲内か
      if (Math.abs(relX) > halfSize || Math.abs(relZ) > halfSize) continue;

      const surfaceY = getTerrainHeight(worldX, worldZ);

      // 地面をフラットにする（ヘリポートの基準高さ）
      const padY = getTerrainHeight(HELIPORT_CENTER.x, HELIPORT_CENTER.z);

      // 地面を平らにする
      for (let y = Math.min(surfaceY, padY) - 1; y <= Math.max(surfaceY, padY) + 1; y++) {
        if (y < 0 || y >= WORLD_HEIGHT) continue;
        if (y < padY) {
          chunk[lx][y][lz] = BLOCK_IDS.IRON;
        } else if (y === padY) {
          // パッドの表面
          // Hマークを描く
          const isH = 
            // H の左縦棒
            (relX === -2 && Math.abs(relZ) <= 2) ||
            // H の右縦棒
            (relX === 2 && Math.abs(relZ) <= 2) ||
            // H の横棒
            (relZ === 0 && Math.abs(relX) <= 2);
          
          if (isH) {
            chunk[lx][y][lz] = BLOCK_IDS.ELECTRIC; // 光るHマーク
          } else {
            chunk[lx][y][lz] = BLOCK_IDS.IRON;
          }
        } else {
          // 上の空間をクリア
          chunk[lx][y][lz] = BLOCK_IDS.AIR;
        }
      }

      // ヘリポートの上の木や障害物を除去
      for (let y = padY + 1; y < padY + 10; y++) {
        if (y >= 0 && y < WORLD_HEIGHT) {
          chunk[lx][y][lz] = BLOCK_IDS.AIR;
        }
      }

      // 角に松明を配置
      if (
        Math.abs(relX) === halfSize && Math.abs(relZ) === halfSize &&
        padY + 1 < WORLD_HEIGHT
      ) {
        chunk[lx][padY + 1][lz] = BLOCK_IDS.TORCH;
      }

      // 辺の中央にも松明
      if (
        ((Math.abs(relX) === halfSize && relZ === 0) ||
         (relX === 0 && Math.abs(relZ) === halfSize)) &&
        padY + 1 < WORLD_HEIGHT
      ) {
        chunk[lx][padY + 1][lz] = BLOCK_IDS.TORCH;
      }
    }
  }
}

/**
 * チャンクがヘリポートエリアに含まれるかチェック
 */
export function chunkContainsHeliport(cx: number, cz: number): boolean {
  const chunkMinX = cx * CHUNK_SIZE;
  const chunkMaxX = chunkMinX + CHUNK_SIZE;
  const chunkMinZ = cz * CHUNK_SIZE;
  const chunkMaxZ = chunkMinZ + CHUNK_SIZE;

  const halfSize = Math.floor(HELIPORT_SIZE / 2) + 1;
  return (
    chunkMaxX > HELIPORT_CENTER.x - halfSize &&
    chunkMinX < HELIPORT_CENTER.x + halfSize &&
    chunkMaxZ > HELIPORT_CENTER.z - halfSize &&
    chunkMinZ < HELIPORT_CENTER.z + halfSize
  );
}
