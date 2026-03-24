// プロシージャル地形生成ユーティリティ
// simplex-noise を使って自然な起伏のある地形を生成する

import { createNoise2D } from 'simplex-noise';
import { BLOCK_IDS, BLOCK_DEFS, CHUNK_SIZE, WORLD_HEIGHT, type BlockId } from '../types/blocks';

// シード固定のノイズ関数を生成
const noise2D = createNoise2D(() => 0.5);
// 木の配置用の別シードノイズ（地形と異なるパターン）
const treeNoise = createNoise2D(() => 0.3);

/**
 * Fractal Brownian Motion (FBM) — 複数スケールのノイズを重ねて自然な地形を生成
 * octaves が多いほど細かい起伏が加わる
 */
function fbm(x: number, z: number, octaves: number, lacunarity: number, persistence: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2D(x * frequency, z * frequency);
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue; // -1 ~ 1 に正規化
}

/**
 * ワールド座標 (x, z) から地形の高さ(Y)を計算する
 * 結果は整数（ブロック単位）
 */
export function getTerrainHeight(worldX: number, worldZ: number): number {
  // 大まかな地形（丘や谷）
  const baseHeight = fbm(worldX * 0.01, worldZ * 0.01, 4, 2.0, 0.5);
  // 細かい凹凸
  const detail = fbm(worldX * 0.05, worldZ * 0.05, 2, 2.0, 0.4);

  // 基準の高さ（海抜）を 20 として、上下に 12 ブロック程度の高低差
  const height = 20 + Math.floor(baseHeight * 10 + detail * 3);
  return Math.max(1, Math.min(height, WORLD_HEIGHT - 1));
}

/** 1チャンク分のブロックデータ配列を返す */
export type ChunkData = BlockId[][][]; // [x][y][z]

/**
 * ワールド座標 (x, z) で木を生やすかどうかを判定
 * ノイズベースで自然な密度分布を実現
 */
function shouldPlaceTree(worldX: number, worldZ: number): boolean {
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
function placeTreesInChunk(chunk: ChunkData, cx: number, cz: number): void {
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

  return chunk;
}

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
  // 空気ブロックは描画しない
  if (blockId === BLOCK_IDS.AIR) return false;

  // 自身が透明ブロックかどうか
  const selfTransparent = isBlockTransparent(blockId);

  // 6方向のうち1つでも隣接面が見えるなら露出あり
  const neighbors = [
    [lx - 1, ly, lz],
    [lx + 1, ly, lz],
    [lx, ly - 1, lz],
    [lx, ly + 1, lz],
    [lx, ly, lz - 1],
    [lx, ly, lz + 1],
  ];

  for (const [nx, ny, nz] of neighbors) {
    // チャンク外は「空気」扱い（境界面は描画）
    if (
      nx < 0 || nx >= CHUNK_SIZE ||
      ny < 0 || ny >= WORLD_HEIGHT ||
      nz < 0 || nz >= CHUNK_SIZE
    ) {
      return true;
    }
    const neighborId = chunk[nx][ny][nz];
    // 隣接が空気なら露出
    if (neighborId === BLOCK_IDS.AIR) return true;
    // 隣接が透明ブロックで、自身が不透明なら露出（ガラス越しに見える）
    if (!selfTransparent && isBlockTransparent(neighborId)) return true;
    // 自身も透明ブロックの場合、異なる種類の透明ブロックに接していれば露出
    if (selfTransparent && neighborId !== blockId && isBlockTransparent(neighborId)) return true;
  }

  return false;
}
