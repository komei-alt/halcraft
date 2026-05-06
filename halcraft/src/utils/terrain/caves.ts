// 洞窟生成アルゴリズム
// 3Dノイズで自然なワーム型洞窟を生成する
// Minecraft の洞窟形状に近いアルゴリズム（Perlin Worm + Cheese Cave のハイブリッド）

import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL } from '../../types/blocks';
import type { ChunkData } from './types';

/** 洞窟ノイズ生成器（シード固定でワールド全体で一貫した洞窟） */
let caveNoise3D: NoiseFunction3D | null = null;
let spaghettiNoise3D: NoiseFunction3D | null = null;
let cheeseNoise3D: NoiseFunction3D | null = null;

/** 洞窟ノイズを初期化（ワールド生成時に1回だけ呼ぶ） */
export function initCaveNoise(): void {
  // 固定シードでリプロダクション可能な洞窟を生成
  const seededRandom = mulberry32(12345);
  caveNoise3D = createNoise3D(seededRandom);
  spaghettiNoise3D = createNoise3D(mulberry32(67890));
  cheeseNoise3D = createNoise3D(mulberry32(11111));
}

/** 簡易シード付き乱数生成器 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 洞窟のカービング — チャンク内の固体ブロックを空気に置き換える
 *
 * 2種類の洞窟を組み合わせ:
 * 1. スパゲッティ洞窟: 細長いトンネル（従来のMinecraft洞窟）
 * 2. チーズ洞窟: 大きな空洞（1.18以降のMinecraft洞窟）
 *
 * @param chunk 生成済みのチャンクデータ（in-place で変更）
 * @param cx チャンクX座標
 * @param cz チャンクZ座標
 */
export function carveCaves(chunk: ChunkData, cx: number, cz: number): void {
  if (!caveNoise3D || !spaghettiNoise3D || !cheeseNoise3D) {
    initCaveNoise();
  }
  const noise = caveNoise3D!;
  const spaghetti = spaghettiNoise3D!;
  const cheese = cheeseNoise3D!;

  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    const worldX = baseX + lx;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const worldZ = baseZ + lz;
      for (let ly = 1; ly < WORLD_HEIGHT - 1; ly++) {
        // 岩盤は削らない
        if (ly <= 1) continue;
        // 海面以上は洞窟を掘らない（水面が壊れる）
        if (ly >= SEA_LEVEL) continue;

        const block = chunk[lx][ly][lz];
        // 空気、水、液体は既に空洞なのでスキップ
        if (block === BLOCK_IDS.AIR || block === BLOCK_IDS.WATER || block === BLOCK_IDS.LAVA) continue;

        // --- スパゲッティ洞窟（細いトンネル） ---
        const spaghettiFreq = 0.04;
        const s1 = spaghetti(worldX * spaghettiFreq, ly * spaghettiFreq * 1.5, worldZ * spaghettiFreq);
        const s2 = noise(worldX * spaghettiFreq * 0.7, ly * spaghettiFreq * 1.2, worldZ * spaghettiFreq * 0.7);
        const spaghettiValue = s1 * s1 + s2 * s2;
        const spaghettiThreshold = 0.015; // 小さいほど細い洞窟

        // --- チーズ洞窟（大きな空洞） ---
        const cheeseFreq = 0.02;
        const cheeseValue = cheese(worldX * cheeseFreq, ly * cheeseFreq * 0.8, worldZ * cheeseFreq);
        // 深さに応じてチーズ洞窟の閾値を調整（深いほど大きい空洞ができやすい）
        const depthFactor = Math.max(0, 1 - ly / (SEA_LEVEL * 0.8));
        const cheeseThreshold = 0.55 + depthFactor * 0.15;

        const isCave = spaghettiValue < spaghettiThreshold || cheeseValue > cheeseThreshold;

        if (isCave) {
          // 洞窟の最深部（y < 8）では溶岩を配置
          if (ly <= 6) {
            chunk[lx][ly][lz] = BLOCK_IDS.LAVA;
          } else {
            chunk[lx][ly][lz] = BLOCK_IDS.AIR;
          }
        }
      }
    }
  }
}
