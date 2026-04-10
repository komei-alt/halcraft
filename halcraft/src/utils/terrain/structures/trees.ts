// 木配置ユーティリティ
// ノイズベースで自然な密度分布の木を配置

import { treeNoise } from '../noise';
import { getTerrainHeight } from '../heightmap';
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

  // 木の密度を決めるノイズ（大きなスケール）
  const density = treeNoise(worldX * 0.08, worldZ * 0.08);
  // 細かい配置ノイズ（個別の木の位置決め）
  const placement = treeNoise(worldX * 0.5 + 100, worldZ * 0.5 + 100);

  // density > 0.1 の領域に木を集中させ、placement が高い場所にのみ配置
  // → 森っぽいクラスターと開けた草地がバランスよくできる
  return density > 0.1 && placement > 0.7;
}

/**
 * 木の幹の高さを決定（4〜6ブロック）
 */
function getTreeHeight(worldX: number, worldZ: number): number {
  const h = treeNoise(worldX * 0.7 + 200, worldZ * 0.7 + 200);
  return 4 + Math.floor((h + 1) * 1.5); // 4 ~ 6
}

/**
 * チャンクに木を配置するヘルパー
 * チャンク境界から3ブロック以上内側にのみ配置（葉のオーバーフロー防止）
 */
export function placeTreesInChunk(chunk: ChunkData, cx: number, cz: number): void {
  const MARGIN = 3; // チャンク端からの余白（葉の半径分）

  for (let lx = MARGIN; lx < CHUNK_SIZE - MARGIN; lx++) {
    for (let lz = MARGIN; lz < CHUNK_SIZE - MARGIN; lz++) {
      const worldX = cx * CHUNK_SIZE + lx;
      const worldZ = cz * CHUNK_SIZE + lz;

      if (!shouldPlaceTree(worldX, worldZ)) continue;

      // 地表を探す
      const surfaceY = getTerrainHeight(worldX, worldZ);

      // 地表が草ブロックのときだけ木を生やす
      if (chunk[lx][surfaceY]?.[lz] !== BLOCK_IDS.GRASS) continue;

      const trunkHeight = getTreeHeight(worldX, worldZ);
      const trunkTop = surfaceY + trunkHeight;

      // ワールドの高さ制限チェック
      if (trunkTop + 3 >= WORLD_HEIGHT) continue;

      // 幹を配置（RAW_WOOD）
      for (let ty = surfaceY + 1; ty <= trunkTop; ty++) {
        chunk[lx][ty][lz] = BLOCK_IDS.RAW_WOOD;
      }

      // 葉を配置（球状の冠）
      const leafCenter = trunkTop; // 葉の中心
      const leafRadius = 2;

      for (let dx = -leafRadius; dx <= leafRadius; dx++) {
        for (let dy = -1; dy <= leafRadius; dy++) {
          for (let dz = -leafRadius; dz <= leafRadius; dz++) {
            const bx = lx + dx;
            const by = leafCenter + dy;
            const bz = lz + dz;

            // チャンク・ワールド範囲チェック
            if (bx < 0 || bx >= CHUNK_SIZE) continue;
            if (by < 0 || by >= WORLD_HEIGHT) continue;
            if (bz < 0 || bz >= CHUNK_SIZE) continue;

            // 球状にする（角を丸くする）
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist > leafRadius + 0.5) continue;

            // 幹の位置には葉を置かない
            if (dx === 0 && dz === 0 && by <= trunkTop) continue;

            // 空気ブロックのみ上書き（他のブロックは壊さない）
            if (chunk[bx][by][bz] === BLOCK_IDS.AIR) {
              chunk[bx][by][bz] = BLOCK_IDS.LEAVES;
            }
          }
        }
      }
    }
  }
}
