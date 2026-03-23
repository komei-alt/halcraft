// プロシージャル地形生成ユーティリティ
// simplex-noise を使って自然な起伏のある地形を生成する

import { createNoise2D } from 'simplex-noise';
import { BLOCK_IDS, BLOCK_DEFS, CHUNK_SIZE, WORLD_HEIGHT, type BlockId } from '../types/blocks';

// シード固定のノイズ関数を生成
const noise2D = createNoise2D(() => 0.5);

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
 * チャンク座標 (cx, cz) のチャンクデータを生成する
 * 地表は草ブロック、その下3層は土、それより下は岩盤
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
