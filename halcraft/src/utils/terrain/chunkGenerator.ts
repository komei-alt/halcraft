// チャンク生成メイン関数
// 基本地形＋構造物配置のオーケストレータ

import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT, type BlockId } from '../../types/blocks';
import { getTerrainHeight } from './heightmap';
import { placeTreesInChunk } from './structures/trees';
import { placePlayerHouse } from './structures/house';
import { placeHeliport, chunkContainsHeliport } from './structures/heliport';
import { placeVillage, chunkContainsVillage } from './structures/village';
import type { ChunkData } from './types';

/**
 * チャンク座標 (cx, cz) のチャンクデータを生成する
 * 地表は草ブロック、その下3層は土、それより下は岩盤
 * 地形生成後に木を自動配置する
 */
export function generateChunk(cx: number, cz: number): ChunkData {
  const chunk: ChunkData = [];

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    chunk[lx] = [];
    for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
      chunk[lx][ly] = [];
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const worldX = cx * CHUNK_SIZE + lx;
        const worldZ = cz * CHUNK_SIZE + lz;
        const surfaceY = getTerrainHeight(worldX, worldZ);

        let blockId: BlockId = BLOCK_IDS.AIR;

        if (ly === 0) {
          // 最下層は必ず岩盤
          blockId = BLOCK_IDS.BEDROCK;
        } else if (ly < surfaceY - 3) {
          // 地中深くは岩盤
          blockId = BLOCK_IDS.BEDROCK;
        } else if (ly < surfaceY) {
          // 地表の数ブロック下は土
          blockId = BLOCK_IDS.DIRT;
        } else if (ly === surfaceY) {
          // 地表面は草付き土
          blockId = BLOCK_IDS.GRASS;
        }
        // ly > surfaceY は AIR

        chunk[lx][ly][lz] = blockId;
      }
    }
  }

  // 地形生成後に木を配置
  placeTreesInChunk(chunk, cx, cz);

  // スポーン地点（0,0）付近のチャンクに家を配置
  if (cx === 0 && cz === 0) {
    placePlayerHouse(chunk, 0, 0);
  }

  // ヘリポートを配置
  if (chunkContainsHeliport(cx, cz)) {
    placeHeliport(chunk, cx, cz);
  }

  // 村を配置
  if (chunkContainsVillage(cx, cz)) {
    placeVillage(chunk, cx, cz);
  }

  return chunk;
}
