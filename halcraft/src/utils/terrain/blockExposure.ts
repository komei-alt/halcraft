// ブロック露出判定ユーティリティ
// 描画最適化: 露出面のみレンダリングするための判定

import { BLOCK_IDS, BLOCK_DEFS, CHUNK_SIZE, WORLD_HEIGHT, type BlockId } from '../../types/blocks';
import type { ChunkData } from './types';

/**
 * 隣接ブロックが「透過的」かどうかを判定するヘルパー
 * 空気・透明ブロック・非標準形状・流体を透過扱いにする
 */
export function isBlockTransparent(blockId: BlockId): boolean {
  if (blockId === BLOCK_IDS.AIR) return true;
  const def = BLOCK_DEFS[blockId];
  if (!def) return true;
  // 透明・非標準形状・流体は透過扱い（溶岩隣の地形面を落とさない）
  return def.transparent || !!def.nonStandard || !!def.isLiquid;
}

/** 6方向のオフセット（配列生成を避けるため定数化） */
const NEIGHBOR_OFFSETS = [
  [-1, 0, 0], [1, 0, 0],
  [0, -1, 0], [0, 1, 0],
  [0, 0, -1], [0, 0, 1],
] as const;

export interface BlockExposureLookup {
  chunkX: number;
  chunkZ: number;
  /** ワールド座標のブロック取得。未ロードチャンクは AIR として扱う */
  getWorldBlock: (x: number, y: number, z: number) => BlockId;
}

function isNeighborExposing(
  selfTransparent: boolean,
  selfBlockId: BlockId,
  neighborId: BlockId,
): boolean {
  if (neighborId === BLOCK_IDS.AIR) return true;
  if (!selfTransparent && isBlockTransparent(neighborId)) return true;
  if (selfTransparent && neighborId !== selfBlockId && isBlockTransparent(neighborId)) return true;
  return false;
}

/**
 * チャンク内の特定ブロックの隣接面が露出しているかチェック
 * 露出面のみレンダリングして描画負荷を下げるための関数
 */
export function isBlockExposed(
  chunk: ChunkData,
  lx: number,
  ly: number,
  lz: number,
  lookup?: BlockExposureLookup,
): boolean {
  const blockId = chunk[lx][ly][lz];
  if (blockId === BLOCK_IDS.AIR) return false;

  const selfTransparent = isBlockTransparent(blockId);

  for (let i = 0; i < 6; i++) {
    const [dx, dy, dz] = NEIGHBOR_OFFSETS[i];
    const nx = lx + dx;
    const ny = ly + dy;
    const nz = lz + dz;

    // ワールド上下端は常に露出
    if (ny < 0 || ny >= WORLD_HEIGHT) {
      return true;
    }

    // チャンク外は隣接チャンクを参照し、共面の内部面描画（継ぎ目チラつき）を防ぐ
    if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) {
      if (!lookup) {
        return true;
      }
      const wx = lookup.chunkX * CHUNK_SIZE + nx;
      const wz = lookup.chunkZ * CHUNK_SIZE + nz;
      const neighborId = lookup.getWorldBlock(wx, ny, wz);
      if (isNeighborExposing(selfTransparent, blockId, neighborId)) {
        return true;
      }
      continue;
    }

    const neighborId = chunk[nx][ny][nz];
    if (isNeighborExposing(selfTransparent, blockId, neighborId)) {
      return true;
    }
  }

  return false;
}
