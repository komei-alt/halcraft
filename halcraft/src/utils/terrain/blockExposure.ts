// ブロック露出判定ユーティリティ
// 描画最適化: 露出面のみレンダリングするための判定

import { BLOCK_IDS, BLOCK_DEFS, CHUNK_SIZE, WORLD_HEIGHT, type BlockId } from '../../types/blocks';
import type { ChunkData } from './types';

/**
 * 隣接ブロックが「透過的」かどうかを判定するヘルパー
 * 空気・透明ブロック・非標準形状ブロック（松明等）を透過扱いにする
 */
function isBlockTransparent(blockId: BlockId): boolean {
  if (blockId === BLOCK_IDS.AIR) return true;
  const def = BLOCK_DEFS[blockId];
  if (!def) return true;
  // 透明ブロック（ガラス等）や非標準形状（松明等）は透過扱い
  return def.transparent || !!def.nonStandard;
}

/** 6方向のオフセット（配列生成を避けるため定数化） */
const NEIGHBOR_OFFSETS = [
  [-1, 0, 0], [1, 0, 0],
  [0, -1, 0], [0, 1, 0],
  [0, 0, -1], [0, 0, 1],
] as const;

/**
 * チャンク内の特定ブロックの隣接面が露出しているかチェック
 * 露出面のみレンダリングして描画負荷を下げるための関数
 */
export function isBlockExposed(
  chunk: ChunkData,
  lx: number,
  ly: number,
  lz: number,
): boolean {
  const blockId = chunk[lx][ly][lz];
  if (blockId === BLOCK_IDS.AIR) return false;

  const selfTransparent = isBlockTransparent(blockId);

  for (let i = 0; i < 6; i++) {
    const [dx, dy, dz] = NEIGHBOR_OFFSETS[i];
    const nx = lx + dx;
    const ny = ly + dy;
    const nz = lz + dz;

    // チャンク外は「空気」扱い（境界面は描画）
    if (nx < 0 || nx >= CHUNK_SIZE || ny < 0 || ny >= WORLD_HEIGHT || nz < 0 || nz >= CHUNK_SIZE) {
      return true;
    }
    const neighborId = chunk[nx][ny][nz];
    if (neighborId === BLOCK_IDS.AIR) return true;
    if (!selfTransparent && isBlockTransparent(neighborId)) return true;
    if (selfTransparent && neighborId !== blockId && isBlockTransparent(neighborId)) return true;
  }

  return false;
}
