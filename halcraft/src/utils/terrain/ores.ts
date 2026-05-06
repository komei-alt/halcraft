// 鉱石の地下分布ロジック
// Minecraft 風に深さに応じて鉱石を配置する
// 石炭: 浅層〜中層、鉄: 中層、金: 深層、ダイヤ: 最深層

import { BLOCK_IDS, CHUNK_SIZE, SEA_LEVEL } from '../../types/blocks';
import type { ChunkData } from './types';

/** 鉱石分布パラメータ */
interface OreConfig {
  blockId: number;
  /** 配置可能な最小Y座標 */
  minY: number;
  /** 配置可能な最大Y座標 */
  maxY: number;
  /** 1チャンクあたりの鉱脈数（期待値） */
  veinsPerChunk: number;
  /** 1鉱脈あたりのブロック数 */
  veinSize: number;
}

const ORE_CONFIGS: OreConfig[] = [
  { blockId: BLOCK_IDS.COAL_ORE, minY: 5, maxY: SEA_LEVEL - 2, veinsPerChunk: 12, veinSize: 6 },
  { blockId: BLOCK_IDS.IRON_ORE, minY: 3, maxY: SEA_LEVEL - 6, veinsPerChunk: 8, veinSize: 4 },
  { blockId: BLOCK_IDS.GOLD_ORE, minY: 2, maxY: 14, veinsPerChunk: 3, veinSize: 3 },
  { blockId: BLOCK_IDS.DIAMOND_ORE, minY: 2, maxY: 10, veinsPerChunk: 1, veinSize: 2 },
];

/** 簡易ハッシュ乱数（チャンク座標ベースでリプロダクション可能） */
function chunkRandom(cx: number, cz: number, seed: number): () => number {
  let hash = (cx * 73856093) ^ (cz * 19349663) ^ (seed * 83492791);
  return () => {
    hash = ((hash << 13) ^ hash) | 0;
    hash = (hash * 1597334677) | 0;
    return ((hash >>> 0) / 4294967296);
  };
}

/**
 * チャンク内の石ブロックを鉱石に置き換える
 * 洞窟カービング後に呼び出す（洞窟内に鉱石が露出する可能性あり）
 */
export function placeOres(chunk: ChunkData, cx: number, cz: number): void {
  for (const ore of ORE_CONFIGS) {
    const rand = chunkRandom(cx, cz, ore.blockId);
    const veinCount = Math.floor(ore.veinsPerChunk * (0.7 + rand() * 0.6));

    for (let v = 0; v < veinCount; v++) {
      // 鉱脈の中心を決定
      const startX = Math.floor(rand() * CHUNK_SIZE);
      const startY = Math.floor(ore.minY + rand() * (ore.maxY - ore.minY));
      const startZ = Math.floor(rand() * CHUNK_SIZE);

      // 鉱脈を球状に広げる
      for (let i = 0; i < ore.veinSize; i++) {
        const ox = startX + Math.floor((rand() - 0.5) * 3);
        const oy = startY + Math.floor((rand() - 0.5) * 3);
        const oz = startZ + Math.floor((rand() - 0.5) * 3);

        // チャンク境界チェック
        if (ox < 0 || ox >= CHUNK_SIZE || oz < 0 || oz >= CHUNK_SIZE) continue;
        if (oy < ore.minY || oy >= ore.maxY) continue;

        // 石ブロックのみ置き換え
        if (chunk[ox]?.[oy]?.[oz] === BLOCK_IDS.STONE) {
          chunk[ox][oy][oz] = ore.blockId as (typeof BLOCK_IDS)[keyof typeof BLOCK_IDS];
        }
      }
    }
  }
}
