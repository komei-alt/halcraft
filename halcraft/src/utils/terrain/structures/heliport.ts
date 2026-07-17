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
      const absX = Math.abs(relX);
      const absZ = Math.abs(relZ);

      // 角を落とした八角形にして、単なる鉄の正方形から着陸施設らしい輪郭へ
      const inPad = absX <= halfSize && absZ <= halfSize && absX + absZ <= halfSize + 2;
      if (!inPad) continue;

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
          
          const radialDistance = Math.sqrt(relX * relX + relZ * relZ);
          const isLandingRing = radialDistance >= 3.45 && radialDistance <= 4.2;
          const isRim = absX === halfSize || absZ === halfSize || absX + absZ === halfSize + 2;

          if (isH || isLandingRing) {
            chunk[lx][y][lz] = BLOCK_IDS.ELECTRIC; // 光るHマーク
          } else if (isRim) {
            chunk[lx][y][lz] = BLOCK_IDS.IRON_CRACKED;
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

      // 八角形の頂点と各方位に埋め込み誘導灯を配置
      if (
        (((absX === halfSize && absZ === 2) || (absZ === halfSize && absX === 2)) ||
         (absX === halfSize && relZ === 0) ||
         (relX === 0 && absZ === halfSize)) &&
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
