// プレイヤーの家 構造物生成
// スポーン地点付近に生成される木と鉄ブロックの家

import { getTerrainHeight } from '../heightmap';
import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT } from '../../../types/blocks';
import type { ChunkData } from '../types';

/**
 * スポーン地点付近にプレイヤーの家を生成する
 * 木と鉄ブロックで構成、中にベッドと松明あり
 * サイズ: 7x7（外壁含む）、高さ4ブロック + 切妻屋根
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
      for (let y = floorY; y < floorY + WALL_HEIGHT + 6; y++) {
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

  // 壁 — 鉄の壁面を木の柱と梁で分節し、箱を積んだだけに見えない外観にする
  for (let h = 0; h < WALL_HEIGHT; h++) {
    const y = fy + h;
    if (y >= WORLD_HEIGHT) continue;

    for (let x = hx; x < hx + WIDTH; x++) {
      if (x >= 0 && x < CHUNK_SIZE) {
        // 前壁（z = hz）
        if (hz >= 0 && hz < CHUNK_SIZE) {
          const isPost = x === hx || x === hx + WIDTH - 1;
          chunk[x][y][hz] = isPost ? BLOCK_IDS.RAW_WOOD : BLOCK_IDS.IRON;
        }
        // 後壁（z = hz + DEPTH - 1）
        const backZ = hz + DEPTH - 1;
        if (backZ >= 0 && backZ < CHUNK_SIZE) {
          const isPost = x === hx || x === hx + WIDTH - 1;
          chunk[x][y][backZ] = isPost ? BLOCK_IDS.RAW_WOOD : BLOCK_IDS.IRON;
        }
      }
    }
    for (let z = hz; z < hz + DEPTH; z++) {
      if (z >= 0 && z < CHUNK_SIZE) {
        // 左壁（x = hx）
        if (hx >= 0 && hx < CHUNK_SIZE) {
          const isPost = z === hz || z === hz + DEPTH - 1;
          chunk[hx][y][z] = isPost ? BLOCK_IDS.RAW_WOOD : BLOCK_IDS.IRON;
        }
        // 右壁（x = hx + WIDTH - 1）
        const rightX = hx + WIDTH - 1;
        if (rightX >= 0 && rightX < CHUNK_SIZE) {
          const isPost = z === hz || z === hz + DEPTH - 1;
          chunk[rightX][y][z] = isPost ? BLOCK_IDS.RAW_WOOD : BLOCK_IDS.IRON;
        }
      }
    }
  }

  // 軒下の横梁。壁面の輪郭を締め、屋根の重さを受ける構造を見せる
  const beamY = fy + WALL_HEIGHT - 1;
  for (let x = hx; x < hx + WIDTH; x++) {
    if (x >= 0 && x < CHUNK_SIZE) {
      chunk[x][beamY][hz] = BLOCK_IDS.WOOD;
      chunk[x][beamY][hz + DEPTH - 1] = BLOCK_IDS.WOOD;
    }
  }
  for (let z = hz; z < hz + DEPTH; z++) {
    if (z >= 0 && z < CHUNK_SIZE) {
      chunk[hx][beamY][z] = BLOCK_IDS.WOOD;
      chunk[hx + WIDTH - 1][beamY][z] = BLOCK_IDS.WOOD;
    }
  }

  // ドア穴（前壁の中央、高さ2ブロック分を空ける）
  const doorX = hx + Math.floor(WIDTH / 2);
  if (doorX >= 0 && doorX < CHUNK_SIZE && hz >= 0 && hz < CHUNK_SIZE) {
    if (fy < WORLD_HEIGHT) chunk[doorX][fy][hz] = BLOCK_IDS.DOOR;
    if (fy + 1 < WORLD_HEIGHT) chunk[doorX][fy + 1][hz] = BLOCK_IDS.AIR;
  }

  // 窓（ガラス）— 左右は縦長、背面は横に2枚並べる
  const windowZ = hz + Math.floor(DEPTH / 2);
  const windowY = fy + 1;
  if (windowY < WORLD_HEIGHT && windowZ >= 0 && windowZ < CHUNK_SIZE) {
    // 左壁の窓
    if (hx >= 0 && hx < CHUNK_SIZE) {
      chunk[hx][windowY][windowZ] = BLOCK_IDS.GLASS;
      if (windowY + 1 < beamY) chunk[hx][windowY + 1][windowZ] = BLOCK_IDS.GLASS;
    }
    // 右壁の窓
    const rightX = hx + WIDTH - 1;
    if (rightX >= 0 && rightX < CHUNK_SIZE) {
      chunk[rightX][windowY][windowZ] = BLOCK_IDS.GLASS;
      if (windowY + 1 < beamY) chunk[rightX][windowY + 1][windowZ] = BLOCK_IDS.GLASS;
    }
  }
  // 後壁の窓
  const backZ = hz + DEPTH - 1;
  const backWindowX = hx + Math.floor(WIDTH / 2);
  if (windowY < WORLD_HEIGHT && backZ >= 0 && backZ < CHUNK_SIZE) {
    for (const x of [backWindowX - 1, backWindowX + 1]) {
      if (x >= 0 && x < CHUNK_SIZE) chunk[x][windowY][backZ] = BLOCK_IDS.GLASS;
    }
  }

  // 切妻屋根。屋根面だけを積み、内部は吹き抜けとして残す
  const roofY = fy + WALL_HEIGHT;
  for (let slope = 0; slope <= Math.floor(WIDTH / 2); slope++) {
    const y = roofY + slope;
    if (y >= WORLD_HEIGHT) continue;
    const leftX = hx + slope;
    const rightX = hx + WIDTH - 1 - slope;
    for (let z = hz - 1; z <= hz + DEPTH; z++) {
      if (z < 0 || z >= CHUNK_SIZE) continue;
      if (leftX >= 0 && leftX < CHUNK_SIZE) chunk[leftX][y][z] = BLOCK_IDS.WOOD;
      if (rightX >= 0 && rightX < CHUNK_SIZE) chunk[rightX][y][z] = BLOCK_IDS.WOOD;
    }
  }

  // 前後の妻壁と中央の小窓
  for (const z of [hz, hz + DEPTH - 1]) {
    for (let level = 0; level < Math.floor(WIDTH / 2); level++) {
      const inset = level + 1;
      const y = roofY + level;
      for (let x = hx + inset; x <= hx + WIDTH - 1 - inset; x++) {
        if (x < 0 || x >= CHUNK_SIZE || y >= WORLD_HEIGHT) continue;
        const isAtticWindow = level === 1 && x === hx + Math.floor(WIDTH / 2);
        chunk[x][y][z] = isAtticWindow ? BLOCK_IDS.GLASS : BLOCK_IDS.IRON;
      }
    }
  }

  // 石造りの煙突。屋根を突き抜ける高さで遠景のシルエットも豊かにする
  const chimneyX = hx + 1;
  const chimneyZ = hz + DEPTH - 2;
  for (let y = roofY; y <= roofY + 4 && y < WORLD_HEIGHT; y++) {
    chunk[chimneyX][y][chimneyZ] = y === roofY + 4 ? BLOCK_IDS.FURNACE : BLOCK_IDS.STONE;
  }

  // 玄関ポーチと庇
  for (const x of [doorX - 1, doorX, doorX + 1]) {
    if (x >= 0 && x < CHUNK_SIZE && hz - 1 >= 0) {
      chunk[x][floorY][hz - 1] = BLOCK_IDS.WOOD;
      chunk[x][fy + 2][hz - 1] = BLOCK_IDS.WOOD;
    }
  }
  if (hz - 1 >= 0) {
    chunk[doorX - 1][fy][hz - 1] = BLOCK_IDS.RAW_WOOD;
    chunk[doorX + 1][fy][hz - 1] = BLOCK_IDS.RAW_WOOD;
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

  const candleX = hx + WIDTH - 4;
  const candleZ = hz + DEPTH - 3;
  if (fy < WORLD_HEIGHT && candleX >= 0 && candleX < CHUNK_SIZE && candleZ >= 0 && candleZ < CHUNK_SIZE) {
    chunk[candleX][fy][candleZ] = BLOCK_IDS.CANDLE;
  }

  const ladderX = hx + 1;
  const ladderZ = hz + DEPTH - 2;
  if (fy < WORLD_HEIGHT && ladderX >= 0 && ladderX < CHUNK_SIZE && ladderZ >= 0 && ladderZ < CHUNK_SIZE) {
    chunk[ladderX][fy][ladderZ] = BLOCK_IDS.LADDER;
  }
}
