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

/** 地形高さキャッシュ（同じ座標の再計算を避ける） */
const heightCache = new Map<number, number>();
const HEIGHT_CACHE_KEY = (x: number, z: number) => x * 65537 + z;

/**
 * ワールド座標 (x, z) から地形の高さ(Y)を計算する
 * 結果は整数（ブロック単位）、キャッシュ済み
 */
export function getTerrainHeight(worldX: number, worldZ: number): number {
  const key = HEIGHT_CACHE_KEY(worldX, worldZ);
  const cached = heightCache.get(key);
  if (cached !== undefined) return cached;

  // 大まかな地形（丘や谷）
  const baseHeight = fbm(worldX * 0.01, worldZ * 0.01, 4, 2.0, 0.5);
  // 細かい凹凸
  const detail = fbm(worldX * 0.05, worldZ * 0.05, 2, 2.0, 0.4);

  // 基準の高さ（海抜）を 20 として、上下に 12 ブロック程度の高低差
  const height = 20 + Math.floor(baseHeight * 10 + detail * 3);
  const result = Math.max(1, Math.min(height, WORLD_HEIGHT - 1));
  heightCache.set(key, result);
  return result;
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
 * スポーン地点付近にプレイヤーの家を生成する
 * 木と鉄ブロックで構成、中にベッドと松明あり
 * サイズ: 7x5x7（外壁含む）、高さ4ブロック + 屋根
 */
function placePlayerHouse(chunk: ChunkData, _cx: number, _cz: number): void {
  // 家の左下角のローカル座標（チャンク内）
  const hx = 4;  // チャンク内X位置
  const hz = 4;  // チャンク内Z位置
  const WIDTH = 7;
  const DEPTH = 7;
  const WALL_HEIGHT = 4;

  // 家の床の高さ = 建設位置の地表高さ
  const centerX = hx + Math.floor(WIDTH / 2);
  const centerZ = hz + Math.floor(DEPTH / 2);
  const worldCenterX = _cx * CHUNK_SIZE + centerX;
  const worldCenterZ = _cz * CHUNK_SIZE + centerZ;
  const floorY = getTerrainHeight(worldCenterX, worldCenterZ);

  // 地面をならす（家の範囲内）+ 土台を埋める
  for (let x = hx; x < hx + WIDTH; x++) {
    for (let z = hz; z < hz + DEPTH; z++) {
      if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue;
      // 地面より下を土で埋める
      for (let y = floorY - 2; y < floorY; y++) {
        if (y >= 0 && y < WORLD_HEIGHT) {
          chunk[x][y][z] = BLOCK_IDS.DIRT;
        }
      }
      // 家の内部の空間を確保（地表より上をクリア）
      for (let y = floorY; y < floorY + WALL_HEIGHT + 2; y++) {
        if (y >= 0 && y < WORLD_HEIGHT) {
          chunk[x][y][z] = BLOCK_IDS.AIR;
        }
      }
    }
  }

  // 床（木ブロック）
  for (let x = hx; x < hx + WIDTH; x++) {
    for (let z = hz; z < hz + DEPTH; z++) {
      if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue;
      if (floorY >= 0 && floorY < WORLD_HEIGHT) {
        chunk[x][floorY][z] = BLOCK_IDS.WOOD;
      }
    }
  }

  const fy = floorY + 1; // 壁の開始Y

  // 壁（鉄ブロック）— 4辺
  for (let h = 0; h < WALL_HEIGHT; h++) {
    const y = fy + h;
    if (y >= WORLD_HEIGHT) continue;

    for (let x = hx; x < hx + WIDTH; x++) {
      if (x >= 0 && x < CHUNK_SIZE) {
        // 前壁（z = hz）
        if (hz >= 0 && hz < CHUNK_SIZE) {
          chunk[x][y][hz] = BLOCK_IDS.IRON;
        }
        // 後壁（z = hz + DEPTH - 1）
        const backZ = hz + DEPTH - 1;
        if (backZ >= 0 && backZ < CHUNK_SIZE) {
          chunk[x][y][backZ] = BLOCK_IDS.IRON;
        }
      }
    }
    for (let z = hz; z < hz + DEPTH; z++) {
      if (z >= 0 && z < CHUNK_SIZE) {
        // 左壁（x = hx）
        if (hx >= 0 && hx < CHUNK_SIZE) {
          chunk[hx][y][z] = BLOCK_IDS.IRON;
        }
        // 右壁（x = hx + WIDTH - 1）
        const rightX = hx + WIDTH - 1;
        if (rightX >= 0 && rightX < CHUNK_SIZE) {
          chunk[rightX][y][z] = BLOCK_IDS.IRON;
        }
      }
    }
  }

  // ドア穴（前壁の中央、高さ2ブロック分を空ける）
  const doorX = hx + Math.floor(WIDTH / 2);
  if (doorX >= 0 && doorX < CHUNK_SIZE && hz >= 0 && hz < CHUNK_SIZE) {
    if (fy < WORLD_HEIGHT) chunk[doorX][fy][hz] = BLOCK_IDS.AIR;
    if (fy + 1 < WORLD_HEIGHT) chunk[doorX][fy + 1][hz] = BLOCK_IDS.AIR;
  }

  // 窓（ガラス）— 左右の壁の中央に1つずつ
  const windowZ = hz + Math.floor(DEPTH / 2);
  const windowY = fy + 1;
  if (windowY < WORLD_HEIGHT && windowZ >= 0 && windowZ < CHUNK_SIZE) {
    // 左壁の窓
    if (hx >= 0 && hx < CHUNK_SIZE) {
      chunk[hx][windowY][windowZ] = BLOCK_IDS.GLASS;
    }
    // 右壁の窓
    const rightX = hx + WIDTH - 1;
    if (rightX >= 0 && rightX < CHUNK_SIZE) {
      chunk[rightX][windowY][windowZ] = BLOCK_IDS.GLASS;
    }
  }
  // 後壁の窓
  const backZ = hz + DEPTH - 1;
  const backWindowX = hx + Math.floor(WIDTH / 2);
  if (windowY < WORLD_HEIGHT && backZ >= 0 && backZ < CHUNK_SIZE && backWindowX >= 0 && backWindowX < CHUNK_SIZE) {
    chunk[backWindowX][windowY][backZ] = BLOCK_IDS.GLASS;
  }

  // 屋根（木ブロック）
  const roofY = fy + WALL_HEIGHT;
  if (roofY < WORLD_HEIGHT) {
    for (let x = hx; x < hx + WIDTH; x++) {
      for (let z = hz; z < hz + DEPTH; z++) {
        if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
          chunk[x][roofY][z] = BLOCK_IDS.WOOD;
        }
      }
    }
  }

  // 松明（家の中、角に2本）
  const torchY = fy + 1;
  if (torchY < WORLD_HEIGHT) {
    const t1x = hx + 1;
    const t1z = hz + 1;
    if (t1x >= 0 && t1x < CHUNK_SIZE && t1z >= 0 && t1z < CHUNK_SIZE) {
      chunk[t1x][torchY][t1z] = BLOCK_IDS.TORCH;
    }
    const t2x = hx + WIDTH - 2;
    const t2z = hz + DEPTH - 2;
    if (t2x >= 0 && t2x < CHUNK_SIZE && t2z >= 0 && t2z < CHUNK_SIZE) {
      chunk[t2x][torchY][t2z] = BLOCK_IDS.TORCH;
    }
  }

  // ベッド（家の奥の方）
  const bedX = hx + WIDTH - 3;
  const bedZ = hz + DEPTH - 2;
  if (fy < WORLD_HEIGHT && bedX >= 0 && bedX < CHUNK_SIZE && bedZ >= 0 && bedZ < CHUNK_SIZE) {
    chunk[bedX][fy][bedZ] = BLOCK_IDS.BED;
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

  // スポーン地点（0,0）付近のチャンクに家を配置
  if (cx === 0 && cz === 0) {
    placePlayerHouse(chunk, 0, 0);
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

/** 6方向のオフセット（配列生成を避けるため定数化） */
const NEIGHBOR_OFFSETS = [
  [-1, 0, 0], [1, 0, 0],
  [0, -1, 0], [0, 1, 0],
  [0, 0, -1], [0, 0, 1],
] as const;

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
  if (blockId === BLOCK_IDS.AIR) return false;

  const selfTransparent = isBlockTransparent(blockId);

  for (let i = 0; i < 6; i++) {
    const [dx, dy, dz] = NEIGHBOR_OFFSETS[i];
    const nx = lx + dx;
    const ny = ly + dy;
    const nz = lz + dz;

    // チャンク外は「空気」扱い（境界面は描画）
    if (nx < 0 || nx >= CHUNK_SIZE || ny < 0 || ny >= WORLD_HEIGHT || nz < 0 || nz >= CHUNK_SIZE) {
      return true;
    }
    const neighborId = chunk[nx][ny][nz];
    if (neighborId === BLOCK_IDS.AIR) return true;
    if (!selfTransparent && isBlockTransparent(neighborId)) return true;
    if (selfTransparent && neighborId !== blockId && isBlockTransparent(neighborId)) return true;
  }

  return false;
}
