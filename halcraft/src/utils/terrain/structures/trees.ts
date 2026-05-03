// 木配置ユーティリティ
// ノイズベースで自然な密度分布の木を配置
// バイオームに応じて木の種類と密度を変更

import { getTreeNoise } from '../noise';
import { getTerrainHeight } from '../heightmap';
import { getCurrentBiome } from '../biomeConfig';
import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT } from '../../../types/blocks';
import { HELIPORT_CENTER, HELIPORT_SIZE, VILLAGE_CENTER } from '../constants';
import type { ChunkData } from '../types';

/**
 * ワールド座標 (x, z) で木を生やすかどうかを判定
 * ノイズベースで自然な密度分布を実現
 * 構造物エリア（ヘリポート・村）では木を生やさない
 */
function shouldPlaceTree(worldX: number, worldZ: number): boolean {
  // ヘリポート周辺は木を除外
  if (
    Math.abs(worldX - HELIPORT_CENTER.x) < HELIPORT_SIZE + 3 &&
    Math.abs(worldZ - HELIPORT_CENTER.z) < HELIPORT_SIZE + 3
  ) {
    return false;
  }

  // 村エリアは木を除外（広めにとる）
  if (
    Math.abs(worldX - VILLAGE_CENTER.x) < 25 &&
    Math.abs(worldZ - VILLAGE_CENTER.z) < 25
  ) {
    return false;
  }

  const biome = getCurrentBiome();
  const tn = getTreeNoise();

  // 木の密度を決めるノイズ（大きなスケール）
  const density = tn(worldX * 0.08, worldZ * 0.08);
  // 細かい配置ノイズ（個別の木の位置決め）
  const placement = tn(worldX * 0.5 + 100, worldZ * 0.5 + 100);

  // バイオームの密度に応じてしきい値を調整
  // treeDensity が高いほど、より多くの場所で木が生成される
  const densityThreshold = 0.8 - biome.treeDensity;
  return density > densityThreshold * 0.5 && placement > (1.0 - biome.treeDensity);
}

/**
 * 木の幹の高さを決定（バイオーム設定に基づく）
 */
function getTreeHeight(worldX: number, worldZ: number): number {
  const biome = getCurrentBiome();
  const tn = getTreeNoise();
  const h = tn(worldX * 0.7 + 200, worldZ * 0.7 + 200);
  const range = biome.treeHeight.max - biome.treeHeight.min;
  return biome.treeHeight.min + Math.floor((h + 1) / 2 * range);
}

/**
 * オーク（標準の広葉樹）を配置
 */
function placeOak(chunk: ChunkData, lx: number, surfaceY: number, lz: number, trunkHeight: number): void {
  const trunkTop = surfaceY + trunkHeight;
  if (trunkTop + 3 >= WORLD_HEIGHT) return;

  // 幹
  for (let ty = surfaceY + 1; ty <= trunkTop; ty++) {
    chunk[lx][ty][lz] = BLOCK_IDS.RAW_WOOD;
  }

  // 球状の葉
  const leafCenter = trunkTop;
  const leafRadius = 2;
  for (let dx = -leafRadius; dx <= leafRadius; dx++) {
    for (let dy = -1; dy <= leafRadius; dy++) {
      for (let dz = -leafRadius; dz <= leafRadius; dz++) {
        const bx = lx + dx;
        const by = leafCenter + dy;
        const bz = lz + dz;
        if (bx < 0 || bx >= CHUNK_SIZE) continue;
        if (by < 0 || by >= WORLD_HEIGHT) continue;
        if (bz < 0 || bz >= CHUNK_SIZE) continue;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > leafRadius + 0.5) continue;
        if (dx === 0 && dz === 0 && by <= trunkTop) continue;
        if (chunk[bx][by][bz] === BLOCK_IDS.AIR) {
          chunk[bx][by][bz] = BLOCK_IDS.LEAVES;
        }
      }
    }
  }
}

/**
 * ヤシの木を配置（トロピカルバイオーム用）
 * 細い幹 + 頂上に放射状の葉
 */
function placePalm(chunk: ChunkData, lx: number, surfaceY: number, lz: number, trunkHeight: number): void {
  const trunkTop = surfaceY + trunkHeight;
  if (trunkTop + 2 >= WORLD_HEIGHT) return;

  // 幹（RAW_WOOD）
  for (let ty = surfaceY + 1; ty <= trunkTop; ty++) {
    chunk[lx][ty][lz] = BLOCK_IDS.RAW_WOOD;
  }

  // 頂上に十字の葉（ヤシの葉っぱ風）
  const leafY = trunkTop + 1;
  const arms = [
    [0, 0], [1, 0], [2, 0], [3, 0],
    [-1, 0], [-2, 0], [-3, 0],
    [0, 1], [0, 2], [0, 3],
    [0, -1], [0, -2], [0, -3],
    [1, 1], [-1, -1], [1, -1], [-1, 1],
  ];
  for (const [dx, dz] of arms) {
    const bx = lx + dx;
    const bz = lz + dz;
    if (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE) continue;
    if (leafY >= WORLD_HEIGHT) continue;
    if (chunk[bx][leafY][bz] === BLOCK_IDS.AIR) {
      chunk[bx][leafY][bz] = BLOCK_IDS.LEAVES;
    }
    // 先端は少し下がる
    const dist = Math.abs(dx) + Math.abs(dz);
    if (dist >= 2 && leafY - 1 > 0) {
      if (chunk[bx][leafY - 1][bz] === BLOCK_IDS.AIR) {
        chunk[bx][leafY - 1][bz] = BLOCK_IDS.LEAVES;
      }
    }
  }
  // 頂上にも葉
  if (chunk[lx][leafY][lz] === BLOCK_IDS.AIR) {
    chunk[lx][leafY][lz] = BLOCK_IDS.LEAVES;
  }
}

/**
 * 松の木を配置（雪バイオーム用）
 * 三角形の輪郭の葉
 */
function placePine(chunk: ChunkData, lx: number, surfaceY: number, lz: number, trunkHeight: number): void {
  const trunkTop = surfaceY + trunkHeight;
  if (trunkTop + 2 >= WORLD_HEIGHT) return;

  // 幹
  for (let ty = surfaceY + 1; ty <= trunkTop; ty++) {
    chunk[lx][ty][lz] = BLOCK_IDS.RAW_WOOD;
  }

  // 三角形の葉（下から上に向かって半径が狭くなる）
  const leafLayers = Math.min(trunkHeight - 1, 5);
  for (let layer = 0; layer < leafLayers; layer++) {
    const layerY = trunkTop - layer;
    const radius = Math.min(layer + 1, 3);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > radius + 1) continue;
        const bx = lx + dx;
        const bz = lz + dz;
        if (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE) continue;
        if (layerY < 0 || layerY >= WORLD_HEIGHT) continue;
        if (dx === 0 && dz === 0 && layerY <= trunkTop) continue;
        if (chunk[bx][layerY][bz] === BLOCK_IDS.AIR) {
          chunk[bx][layerY][bz] = BLOCK_IDS.LEAVES;
        }
      }
    }
  }
  // 頂上に葉
  if (trunkTop + 1 < WORLD_HEIGHT && chunk[lx][trunkTop + 1][lz] === BLOCK_IDS.AIR) {
    chunk[lx][trunkTop + 1][lz] = BLOCK_IDS.LEAVES;
  }
}

/**
 * サボテンを配置（砂漠バイオーム用）
 * 幹のみ、葉なし
 */
function placeCactus(chunk: ChunkData, lx: number, surfaceY: number, _lz: number, trunkHeight: number): void {
  const trunkTop = surfaceY + trunkHeight;
  if (trunkTop >= WORLD_HEIGHT) return;

  // サボテン柱（LEAVESブロックで代用 — 色的に緑で合う）
  for (let ty = surfaceY + 1; ty <= trunkTop; ty++) {
    chunk[lx][ty][_lz] = BLOCK_IDS.LEAVES;
  }
}

/**
 * チャンクに木を配置するヘルパー
 * チャンク境界から3ブロック以上内側にのみ配置（葉のオーバーフロー防止）
 * バイオームに応じた木の種類を選択
 */
export function placeTreesInChunk(chunk: ChunkData, cx: number, cz: number): void {
  const MARGIN = 3; // チャンク端からの余白（葉の半径分）
  const biome = getCurrentBiome();

  for (let lx = MARGIN; lx < CHUNK_SIZE - MARGIN; lx++) {
    for (let lz = MARGIN; lz < CHUNK_SIZE - MARGIN; lz++) {
      const worldX = cx * CHUNK_SIZE + lx;
      const worldZ = cz * CHUNK_SIZE + lz;

      if (!shouldPlaceTree(worldX, worldZ)) continue;

      // 地表を探す
      const surfaceY = getTerrainHeight(worldX, worldZ);

      // 地表がバイオームの地表ブロックのときだけ木を生やす
      const surfaceBlock = chunk[lx][surfaceY]?.[lz];
      if (surfaceBlock !== biome.surfaceBlock) continue;

      const trunkHeight = getTreeHeight(worldX, worldZ);

      // バイオームに応じた木を配置
      switch (biome.treeType) {
        case 'oak':
          placeOak(chunk, lx, surfaceY, lz, trunkHeight);
          break;
        case 'palm':
          placePalm(chunk, lx, surfaceY, lz, trunkHeight);
          break;
        case 'pine':
          placePine(chunk, lx, surfaceY, lz, trunkHeight);
          break;
        case 'cactus':
          placeCactus(chunk, lx, surfaceY, lz, trunkHeight);
          break;
      }
    }
  }
}
