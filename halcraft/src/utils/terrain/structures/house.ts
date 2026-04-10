// プレイヤーの家 構造物生成
// スポーン地点付近に生成される木と鉄ブロックの家

import { getTerrainHeight } from '../heightmap';
import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT } from '../../../types/blocks';
import type { ChunkData } from '../types';

/**
 * スポーン地点付近にプレイヤーの家を生成する
 * 木と鉄ブロックで構成、中にベッドと松明あり
 * サイズ: 7x5x7（外壁含む）、高さ4ブロック + 屋根
 */
export function placePlayerHouse(chunk: ChunkData, _cx: number, _cz: number): void {
  // 家の左下角のローカル座標（チャンク内）
  const hx = 4;  // チャンク内X位置
  const hz = 4;  // チャンク内Z位置
  const WIDTH = 7;
  const DEPTH = 7;
  const WALL_HEIGHT = 4;

  // 家の床の高さ = 建設位置の地表高さ
  const centerX = hx + Math.floor(WIDTH / 2);
  const centerZ = hz + Math.floor(DEPTH / 2);
  const worldCenterX = _cx * CHUNK_SIZE + centerX;
  const worldCenterZ = _cz * CHUNK_SIZE + centerZ;
  const floorY = getTerrainHeight(worldCenterX, worldCenterZ);

  // 地面をならす（家の範囲内）+ 土台を埋める
  for (let x = hx; x < hx + WIDTH; x++) {
    for (let z = hz; z < hz + DEPTH; z++) {
      if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue;
      // 地面より下を土で埋める
      for (let y = floorY - 2; y < floorY; y++) {
        if (y >= 0 && y < WORLD_HEIGHT) {
          chunk[x][y][z] = BLOCK_IDS.DIRT;
        }
      }
      // 家の内部の空間を確保（地表より上をクリア）
      for (let y = floorY; y < floorY + WALL_HEIGHT + 2; y++) {
        if (y >= 0 && y < WORLD_HEIGHT) {
          chunk[x][y][z] = BLOCK_IDS.AIR;
        }
      }
    }
  }

  // 床（木ブロック）
  for (let x = hx; x < hx + WIDTH; x++) {
    for (let z = hz; z < hz + DEPTH; z++) {
      if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue;
      if (floorY >= 0 && floorY < WORLD_HEIGHT) {
        chunk[x][floorY][z] = BLOCK_IDS.WOOD;
      }
    }
  }

  const fy = floorY + 1; // 壁の開始Y

  // 壁（鉄ブロック）— 4辺
  for (let h = 0; h < WALL_HEIGHT; h++) {
    const y = fy + h;
    if (y >= WORLD_HEIGHT) continue;

    for (let x = hx; x < hx + WIDTH; x++) {
      if (x >= 0 && x < CHUNK_SIZE) {
        // 前壁（z = hz）
        if (hz >= 0 && hz < CHUNK_SIZE) {
          chunk[x][y][hz] = BLOCK_IDS.IRON;
        }
        // 後壁（z = hz + DEPTH - 1）
        const backZ = hz + DEPTH - 1;
        if (backZ >= 0 && backZ < CHUNK_SIZE) {
          chunk[x][y][backZ] = BLOCK_IDS.IRON;
        }
      }
    }
    for (let z = hz; z < hz + DEPTH; z++) {
      if (z >= 0 && z < CHUNK_SIZE) {
        // 左壁（x = hx）
        if (hx >= 0 && hx < CHUNK_SIZE) {
          chunk[hx][y][z] = BLOCK_IDS.IRON;
        }
        // 右壁（x = hx + WIDTH - 1）
        const rightX = hx + WIDTH - 1;
        if (rightX >= 0 && rightX < CHUNK_SIZE) {
          chunk[rightX][y][z] = BLOCK_IDS.IRON;
        }
      }
    }
  }

  // ドア穴（前壁の中央、高さ2ブロック分を空ける）
  const doorX = hx + Math.floor(WIDTH / 2);
  if (doorX >= 0 && doorX < CHUNK_SIZE && hz >= 0 && hz < CHUNK_SIZE) {
    if (fy < WORLD_HEIGHT) chunk[doorX][fy][hz] = BLOCK_IDS.AIR;
    if (fy + 1 < WORLD_HEIGHT) chunk[doorX][fy + 1][hz] = BLOCK_IDS.AIR;
  }

  // 窓（ガラス）— 左右の壁の中央に1つずつ
  const windowZ = hz + Math.floor(DEPTH / 2);
  const windowY = fy + 1;
  if (windowY < WORLD_HEIGHT && windowZ >= 0 && windowZ < CHUNK_SIZE) {
    // 左壁の窓
    if (hx >= 0 && hx < CHUNK_SIZE) {
      chunk[hx][windowY][windowZ] = BLOCK_IDS.GLASS;
    }
    // 右壁の窓
    const rightX = hx + WIDTH - 1;
    if (rightX >= 0 && rightX < CHUNK_SIZE) {
      chunk[rightX][windowY][windowZ] = BLOCK_IDS.GLASS;
    }
  }
  // 後壁の窓
  const backZ = hz + DEPTH - 1;
  const backWindowX = hx + Math.floor(WIDTH / 2);
  if (windowY < WORLD_HEIGHT && backZ >= 0 && backZ < CHUNK_SIZE && backWindowX >= 0 && backWindowX < CHUNK_SIZE) {
    chunk[backWindowX][windowY][backZ] = BLOCK_IDS.GLASS;
  }

  // 屋根（木ブロック）
  const roofY = fy + WALL_HEIGHT;
  if (roofY < WORLD_HEIGHT) {
    for (let x = hx; x < hx + WIDTH; x++) {
      for (let z = hz; z < hz + DEPTH; z++) {
        if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
          chunk[x][roofY][z] = BLOCK_IDS.WOOD;
        }
      }
    }
  }

  // 松明（家の中、角に2本）
  const torchY = fy + 1;
  if (torchY < WORLD_HEIGHT) {
    const t1x = hx + 1;
    const t1z = hz + 1;
    if (t1x >= 0 && t1x < CHUNK_SIZE && t1z >= 0 && t1z < CHUNK_SIZE) {
      chunk[t1x][torchY][t1z] = BLOCK_IDS.TORCH;
    }
    const t2x = hx + WIDTH - 2;
    const t2z = hz + DEPTH - 2;
    if (t2x >= 0 && t2x < CHUNK_SIZE && t2z >= 0 && t2z < CHUNK_SIZE) {
      chunk[t2x][torchY][t2z] = BLOCK_IDS.TORCH;
    }
  }

  // ベッド（家の奥の方）
  const bedX = hx + WIDTH - 3;
  const bedZ = hz + DEPTH - 2;
  if (fy < WORLD_HEIGHT && bedX >= 0 && bedX < CHUNK_SIZE && bedZ >= 0 && bedZ < CHUNK_SIZE) {
    chunk[bedX][fy][bedZ] = BLOCK_IDS.BED;
  }
}
