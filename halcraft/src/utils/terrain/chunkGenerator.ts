// チャンク生成メイン関数
// 基本地形＋構造物配置のオーケストレータ
// バイオーム設定に基づいてブロック種を変更

import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, type BlockId } from '../../types/blocks';
import { getTerrainHeight } from './heightmap';
import { placeTreesInChunk } from './structures/trees';
import { placePlayerHouse } from './structures/house';
import { placeHeliport, chunkContainsHeliport } from './structures/heliport';
import { placeRunway, chunkContainsRunway } from './structures/runway';
import { placeVillage, chunkContainsVillage } from './structures/village';
import { getCurrentBiome } from './biomeConfig';
import { carveCaves } from './caves';
import { placeOres } from './ores';
import type { ChunkData } from './types';

/**
 * チャンク座標 (cx, cz) のチャンクデータを生成する
 * バイオーム設定に基づいて地表・地中ブロックを選択
 * 石レイヤー・水面生成・洞窟カービング・鉱石配置を含む
 * 地形生成後に木を自動配置する
 */
export function generateChunk(cx: number, cz: number): ChunkData {
  const chunk: ChunkData = [];
  const biome = getCurrentBiome();

  // バイオームのブロック種を取得
  const surfaceBlock: BlockId = biome.surfaceBlock;
  const subSurfaceBlock: BlockId = biome.subSurfaceBlock;
  // 砂漠は水を置かない
  const fillWater = biome.id !== 'desert';

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    chunk[lx] = [];
    const worldX = cx * CHUNK_SIZE + lx;
    const surfaceHeights: number[] = [];

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      surfaceHeights[lz] = getTerrainHeight(worldX, cz * CHUNK_SIZE + lz);
    }

    for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
      chunk[lx][ly] = [];
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const surfaceY = surfaceHeights[lz];

        let blockId: BlockId = BLOCK_IDS.AIR;

        if (ly === 0) {
          // 最下層は必ず岩盤
          blockId = BLOCK_IDS.BEDROCK;
        } else if (ly < surfaceY - 6) {
          // 深層は石ブロック
          blockId = BLOCK_IDS.STONE;
        } else if (ly < surfaceY - 3) {
          // 石と地表の間は地中ブロック（土など）
          blockId = subSurfaceBlock;
        } else if (ly < surfaceY) {
          // 地表の数ブロック下は地中ブロック
          blockId = subSurfaceBlock;
        } else if (ly === surfaceY) {
          // 地表面はバイオームの地表ブロック
          // 水面以下の地表は砂に置き換え（水底）
          if (fillWater && surfaceY < SEA_LEVEL) {
            blockId = BLOCK_IDS.SAND;
          } else {
            blockId = surfaceBlock;
          }
        } else if (fillWater && ly > surfaceY && ly <= SEA_LEVEL) {
          // 地表より上で海面以下は水で埋める
          blockId = BLOCK_IDS.WATER;
        }
        // ly > surfaceY && ly > SEA_LEVEL は AIR

        chunk[lx][ly][lz] = blockId;
      }
    }
  }

  // 地形生成後に洞窟をカービング
  carveCaves(chunk, cx, cz);

  // 洞窟後に鉱石を配置（石ブロックを鉱石に置き換え）
  placeOres(chunk, cx, cz);

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

  // 滑走路を配置
  if (chunkContainsRunway(cx, cz)) {
    placeRunway(chunk, cx, cz);
  }

  // 村を配置
  if (chunkContainsVillage(cx, cz)) {
    placeVillage(chunk, cx, cz);
  }

  return chunk;
}
