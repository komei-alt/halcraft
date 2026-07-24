// チャンク生成メイン関数
// 基本地形＋構造物配置のオーケストレータ
// バイオーム設定に基づいてブロック種を変更

import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, type BlockId } from '../../types/blocks';
import { getTerrainSample } from './heightmap';
import { placeTreesInChunk } from './structures/trees';
import { placeDecorInChunk } from './structures/decor';
import { placePlayerHouse } from './structures/house';
import { placeHeliport, chunkContainsHeliport } from './structures/heliport';
import { placeRunway, chunkContainsRunway } from './structures/runway';
import { placeVillage, chunkContainsVillage } from './structures/village';
import { placeStageLandmarks } from './structures/stageLandmarks';
import { placeDesertCinematicScenery } from './structures/desertCinematic';
import { getCurrentBiome } from './biomeConfig';
import { carveCaves } from './caves';
import { placeOres } from './ores';
import { placeDungeon } from './dungeons';
import { createEmptyChunk, finalizeChunkBounds, type ChunkData } from './types';

/**
 * チャンク座標 (cx, cz) のチャンクデータを生成する
 * バイオーム設定に基づいて地表・地中ブロックを選択
 * 石レイヤー・水面生成・洞窟カービング・鉱石配置を含む
 * 地形生成後に木を自動配置する
 */
export function generateChunk(cx: number, cz: number): ChunkData {
  const chunk = createEmptyChunk();
  const biome = getCurrentBiome();

  // バイオームのブロック種を取得
  const surfaceBlock: BlockId = biome.surfaceBlock;
  const subSurfaceBlock: BlockId = biome.subSurfaceBlock;
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    const worldX = cx * CHUNK_SIZE + lx;
    const surfaceHeights: number[] = [];
    const terrainSamples = [];

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const sample = getTerrainSample(worldX, cz * CHUNK_SIZE + lz);
      terrainSamples[lz] = sample;
      surfaceHeights[lz] = sample.height;
    }

    for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const surfaceY = surfaceHeights[lz];
        const sample = terrainSamples[lz];
        const worldZ = cz * CHUNK_SIZE + lz;
        const oasisWater = biome.id === 'desert'
          && sample.riverStrength > 0.78
          && sample.moisture > 0.58;
        const fillWater = biome.id !== 'desert' || oasisWater;

        let blockId: BlockId = BLOCK_IDS.AIR;

        if (ly === 0) {
          // 最下層は必ず岩盤
          blockId = BLOCK_IDS.BEDROCK;
        } else if (ly < surfaceY - 6) {
          // 深層は石ブロック
          blockId = biome.deepBlock;
        } else if (ly < surfaceY - 3) {
          // 石と地表の間は地中ブロック（土など）
          blockId = subSurfaceBlock;
        } else if (ly < surfaceY) {
          // 地表の数ブロック下は地中ブロック
          blockId = subSurfaceBlock;
        } else if (ly === surfaceY) {
          // 地表面はバイオームの地表ブロック
          if (fillWater && surfaceY < SEA_LEVEL) {
            // 水面以下の地表は砂に置き換え（水底・ビーチ）
            blockId = BLOCK_IDS.SAND;
          } else if (biome.peakBlock !== null && (surfaceY >= biome.peakHeight || sample.slopeHint > 0.72)) {
            // 高所（山頂など）は露出ブロックに置き換えて、岩肌・氷壁を見せる
            blockId = biome.peakBlock;
          } else {
            const shoreline = surfaceY <= SEA_LEVEL + 1;
            blockId = shoreline && biome.id === 'tropical' ? BLOCK_IDS.SAND : surfaceBlock;
          }
        } else if (fillWater && ly > surfaceY && ly <= SEA_LEVEL) {
          // 地表より上で海面以下は水で埋める
          blockId = BLOCK_IDS.WATER;
        }
        // ly > surfaceY && ly > SEA_LEVEL は AIR

        chunk[lx][ly][lz] = blockId;

        // 砂漠のオアシス周辺は、水際だけを砂のまま残して遠景から輪郭を読めるようにする。
        if (oasisWater && ly === surfaceY && Math.abs(worldX + worldZ) % 7 === 0) {
          chunk[lx][ly][lz] = BLOCK_IDS.SAND;
        }
      }
    }
  }

  // 地形生成後に洞窟をカービング
  carveCaves(chunk, cx, cz);

  // 洞窟後に鉱石を配置（石ブロックを鉱石に置き換え）
  placeOres(chunk, cx, cz);

  // 地下ダンジョンを配置
  placeDungeon(chunk, cx, cz);

  // 地形生成後に木を配置
  placeTreesInChunk(chunk, cx, cz);

  // 木の後に地表装飾（茂み・岩・枯れ木など）を撒く
  placeDecorInChunk(chunk, cx, cz);

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

  // ステージごとの目的地・防衛拠点を最後に重ねて、マップごとの差を見える化する
  placeStageLandmarks(chunk, cx, cz);

  // 砂漠決戦では、ランドマークの周囲をメサ・オアシス・街道で映画的に構成する
  placeDesertCinematicScenery(chunk, cx, cz);

  finalizeChunkBounds(chunk);

  return chunk;
}
