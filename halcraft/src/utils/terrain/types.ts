// 地形モジュール共通型定義

import type { BlockId } from '../../types/blocks';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../types/blocks';

/** 1チャンク分のブロックデータ配列を返す */
export type ChunkData = BlockId[][][] & { maxFilledY: number }; // [x][y][z]

/**
 * 内部のZ列を Uint8Array にして、同じアクセス形式のままメモリ使用量を抑える。
 * BlockId は現在8bit以内で、既存の構造物コードも chunk[x][y][z] のまま利用できる。
 */
export function createEmptyChunk(): ChunkData {
  const chunk = Array.from({ length: CHUNK_SIZE }, () =>
    Array.from({ length: WORLD_HEIGHT }, () =>
      new Uint8Array(CHUNK_SIZE) as unknown as BlockId[],
    ),
  ) as ChunkData;
  chunk.maxFilledY = 0;
  return chunk;
}

/** 描画・索引用の上限高を一度だけ求める。 */
export function finalizeChunkBounds(chunk: ChunkData): void {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const row = chunk[x][y];
      for (let z = 0; z < CHUNK_SIZE; z++) {
        if (row[z] !== 0) {
          chunk.maxFilledY = y;
          return;
        }
      }
    }
  }
  chunk.maxFilledY = 0;
}

/**
 * Worker との受け渡し用にチャンクを1本の連続バッファへ詰める。
 * 16x64 個の小さな ArrayBuffer を structured clone するより、Safari のGC負荷を抑えられる。
 */
export function packChunkData(chunk: ChunkData): Uint8Array {
  const packed = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  let offset = 0;
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      packed.set(chunk[x][y], offset);
      offset += CHUNK_SIZE;
    }
  }
  return packed;
}

/** 転送された連続バッファを、既存の chunk[x][y][z] 形式のviewへ戻す。 */
export function unpackChunkData(packed: Uint8Array, maxFilledY: number): ChunkData {
  const expectedLength = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;
  if (packed.byteLength !== expectedLength) {
    throw new Error(`Invalid chunk buffer length: ${packed.byteLength} (expected ${expectedLength})`);
  }

  const chunk = Array.from({ length: CHUNK_SIZE }, (_, x) =>
    Array.from({ length: WORLD_HEIGHT }, (_, y) => {
      const offset = packed.byteOffset + (x * WORLD_HEIGHT + y) * CHUNK_SIZE;
      return new Uint8Array(packed.buffer, offset, CHUNK_SIZE) as unknown as BlockId[];
    }),
  ) as ChunkData;
  chunk.maxFilledY = maxFilledY;
  return chunk;
}
