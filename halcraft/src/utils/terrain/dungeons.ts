// ダンジョン自動生成
// 地下にスポナー部屋と戦利品チェストを配置
// チャンク座標ベースの決定的ハッシュで配置を決定

import { BLOCK_IDS, CHUNK_SIZE, type BlockId } from '../../types/blocks';
import type { ChunkData } from './types';

/** ダンジョン部屋の最小サイズ */
const ROOM_MIN = 5;
/** ダンジョン部屋の最大サイズ */
const ROOM_MAX = 9;
/** ダンジョン出現確率 (チャンクあたり) */
const DUNGEON_CHANCE = 0.06; // 6%
/** ダンジョンのY範囲 */
const DUNGEON_Y_MIN = 5;
const DUNGEON_Y_MAX = 30;

/** 決定的ハッシュ（チャンク座標→0〜1） */
function chunkHash(cx: number, cz: number, salt: number): number {
  let h = (cx * 374761393 + cz * 668265263 + salt * 1274126177) | 0;
  h = ((h ^ (h >> 13)) * 1103515245) | 0;
  h = ((h ^ (h >> 16)) * 2654435769) | 0;
  return (h & 0x7fffffff) / 0x7fffffff;
}

/** チャンクにダンジョンを配置するか判定 */
export function shouldPlaceDungeon(cx: number, cz: number): boolean {
  // スポーン地点付近はスキップ
  if (Math.abs(cx) <= 1 && Math.abs(cz) <= 1) return false;
  return chunkHash(cx, cz, 42) < DUNGEON_CHANCE;
}

/** ダンジョン構造物をチャンクに配置 */
export function placeDungeon(chunk: ChunkData, cx: number, cz: number): void {
  if (!shouldPlaceDungeon(cx, cz)) return;

  // 部屋サイズ
  const roomW = ROOM_MIN + Math.floor(chunkHash(cx, cz, 100) * (ROOM_MAX - ROOM_MIN + 1));
  const roomD = ROOM_MIN + Math.floor(chunkHash(cx, cz, 200) * (ROOM_MAX - ROOM_MIN + 1));
  const roomH = 4; // 天井高さ

  // チャンク内の配置位置
  const startX = Math.floor(chunkHash(cx, cz, 300) * Math.max(1, CHUNK_SIZE - roomW));
  const startZ = Math.floor(chunkHash(cx, cz, 400) * Math.max(1, CHUNK_SIZE - roomD));
  const roomY = DUNGEON_Y_MIN + Math.floor(chunkHash(cx, cz, 500) * (DUNGEON_Y_MAX - DUNGEON_Y_MIN));

  // 壁・床・天井の素材
  const wallBlock: BlockId = BLOCK_IDS.STONE;
  const floorBlock: BlockId = BLOCK_IDS.STONE;

  // 部屋の構築
  for (let lx = startX; lx < startX + roomW && lx < CHUNK_SIZE; lx++) {
    for (let lz = startZ; lz < startZ + roomD && lz < CHUNK_SIZE; lz++) {
      for (let dy = 0; dy < roomH; dy++) {
        const y = roomY + dy;
        if (y >= 64) continue;
        if (!chunk[lx] || !chunk[lx][y]) continue;

        const isWallX = (lx === startX || lx === startX + roomW - 1);
        const isWallZ = (lz === startZ || lz === startZ + roomD - 1);
        const isFloor = (dy === 0);
        const isCeiling = (dy === roomH - 1);

        if (isFloor) {
          chunk[lx][y][lz] = floorBlock;
        } else if (isCeiling) {
          chunk[lx][y][lz] = wallBlock;
        } else if (isWallX || isWallZ) {
          chunk[lx][y][lz] = wallBlock;
        } else {
          // 内部は空洞
          chunk[lx][y][lz] = BLOCK_IDS.AIR;
        }
      }
    }
  }

  // 中央にスポナーブロック配置
  const centerX = startX + Math.floor(roomW / 2);
  const centerZ = startZ + Math.floor(roomD / 2);
  const spawnerY = roomY + 1;
  if (
    centerX < CHUNK_SIZE && centerZ < CHUNK_SIZE &&
    chunk[centerX] && chunk[centerX][spawnerY]
  ) {
    chunk[centerX][spawnerY][centerZ] = BLOCK_IDS.SPAWNER;
  }

  // 四隅にチェスト配置（ランダムで2箇所）
  const corners = [
    [startX + 1, startZ + 1],
    [startX + roomW - 2, startZ + 1],
    [startX + 1, startZ + roomD - 2],
    [startX + roomW - 2, startZ + roomD - 2],
  ];
  const chestY = roomY + 1;
  let chestsPlaced = 0;
  for (let i = 0; i < corners.length && chestsPlaced < 2; i++) {
    if (chunkHash(cx, cz, 700 + i) < 0.5) continue;
    const [chestX, chestZ] = corners[i];
    if (
      chestX >= 0 && chestX < CHUNK_SIZE &&
      chestZ >= 0 && chestZ < CHUNK_SIZE &&
      chunk[chestX] && chunk[chestX][chestY]
    ) {
      chunk[chestX][chestY][chestZ] = BLOCK_IDS.CHEST;
      chestsPlaced++;
    }
  }

  // 松明を壁際に配置（照明）
  const torchPositions = [
    [startX + 1, startZ + Math.floor(roomD / 2)],
    [startX + roomW - 2, startZ + Math.floor(roomD / 2)],
    [startX + Math.floor(roomW / 2), startZ + 1],
    [startX + Math.floor(roomW / 2), startZ + roomD - 2],
  ];
  const torchY = roomY + 2;
  for (const [tx, tz] of torchPositions) {
    if (
      tx >= 0 && tx < CHUNK_SIZE &&
      tz >= 0 && tz < CHUNK_SIZE &&
      chunk[tx] && chunk[tx][torchY]
    ) {
      chunk[tx][torchY][tz] = BLOCK_IDS.TORCH;
    }
  }
}
