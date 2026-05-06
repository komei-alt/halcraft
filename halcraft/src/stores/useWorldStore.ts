// ワールドの状態管理ストア
// 全チャンク・ブロックの読み書き、ブロックの破壊・設置を管理
// 段階的チャンク生成でメインスレッドのブロックを防止

import { create } from 'zustand';
import { BLOCK_DEFS, BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT, type BlockId } from '../types/blocks';
import { generateChunk } from '../utils/terrain/chunkGenerator';
import type { ChunkData } from '../utils/terrain/types';

/** チャンクキーの生成 */
const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

/** 1フレームあたりに必ず生成するチャンク数 */
const MIN_CHUNKS_PER_FRAME = 2;

/** 1フレームあたりに生成するチャンク数の上限 */
const MAX_CHUNKS_PER_FRAME = 12;

/** 1フレーム内でチャンク生成に使う最大時間（高性能機では余力を使う） */
const CHUNK_GENERATION_BUDGET_MS = 7;

/** 初期ロード時の即座生成半径（足元付近を確実に表示） */
const IMMEDIATE_RADIUS = 3;

export interface IndexedBlockPosition {
  x: number;
  y: number;
  z: number;
  blockId: BlockId;
}

type ChunkBlockIndex = Map<BlockId, IndexedBlockPosition[]>;

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function getAdaptiveChunkLimit(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 8 : 8;
  return Math.max(MIN_CHUNKS_PER_FRAME, Math.min(MAX_CHUNKS_PER_FRAME, Math.floor(cores / 2)));
}

function shouldIndexBlock(blockId: BlockId): boolean {
  if (blockId === BLOCK_IDS.AIR) return false;
  const def = BLOCK_DEFS[blockId];
  return Boolean(def?.nonStandard || def?.lightColor || def?.isLiquid);
}

function buildChunkBlockIndex(chunk: ChunkData, cx: number, cz: number): ChunkBlockIndex {
  const index: ChunkBlockIndex = new Map();
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const blockId = chunk[lx][ly][lz];
        if (!shouldIndexBlock(blockId)) continue;

        const positions = index.get(blockId) ?? [];
        positions.push({
          x: baseX + lx,
          y: ly,
          z: baseZ + lz,
          blockId,
        });
        index.set(blockId, positions);
      }
    }
  }

  return index;
}

interface WorldState {
  /** チャンクデータ（キー: "cx,cz"） */
  chunks: Map<string, ChunkData>;

  /** チャンク更新のバージョン管理（再描画トリガー） */
  chunkVersions: Map<string, number>;

  /** 特殊ブロック・光源ブロックのチャンク別インデックス */
  chunkBlockIndexes: Map<string, ChunkBlockIndex>;

  /** ブロックインデックス更新のバージョン */
  blockIndexVersion: number;

  /** 段階的生成用の待機キュー */
  chunkGenQueue: Array<[number, number]>;

  /** 初期チャンク生成中フラグ */
  isInitialLoading: boolean;

  /** 初期チャンクを生成（足元を即座に、残りはキューへ） */
  initChunks: (renderDistance: number) => void;

  /** キューからチャンクを段階的に生成（毎フレーム呼ばれる） */
  processChunkQueue: () => void;

  /** カメラ周辺の未生成チャンクを動的に生成 */
  ensureChunksAround: (camCx: number, camCz: number, radius: number) => void;

  /** チャンクを取得（生成済みのみ） */
  getChunk: (cx: number, cz: number) => ChunkData | undefined;

  /** 指定ブロックの配置位置をインデックスから取得 */
  getIndexedBlockPositions: (blockId: BlockId) => IndexedBlockPosition[];

  /** 光源ブロックの配置位置をインデックスから取得 */
  getIndexedLightBlockPositions: () => IndexedBlockPosition[];

  /** ワールド座標でブロックを取得 */
  getBlock: (x: number, y: number, z: number) => BlockId;

  /** ワールド座標でブロックを設置 */
  setBlock: (x: number, y: number, z: number, blockId: BlockId) => void;

  /** ワールド座標でブロックを破壊（空気に置き換え） */
  breakBlock: (x: number, y: number, z: number) => boolean;
  /** 全チャンクを削除（ステージ切替時） */
  clearChunks: () => void;
}

export const useWorldStore = create<WorldState>((set, get) => ({
  chunks: new Map(),
  chunkVersions: new Map(),
  chunkBlockIndexes: new Map(),
  blockIndexVersion: 0,
  chunkGenQueue: [],
  isInitialLoading: false,

  clearChunks: () => {
    set({
      chunks: new Map(),
      chunkVersions: new Map(),
      chunkBlockIndexes: new Map(),
      blockIndexVersion: get().blockIndexVersion + 1,
      chunkGenQueue: [],
      isInitialLoading: false,
    });
  },

  initChunks: (renderDistance) => {
    const newChunks = new Map<string, ChunkData>();
    const newVersions = new Map<string, number>();
    const newIndexes = new Map<string, ChunkBlockIndex>();

    // Phase 1: 足元の小範囲を即座に生成（プレイヤーが落ちないようにする）
    for (let cx = -IMMEDIATE_RADIUS; cx <= IMMEDIATE_RADIUS; cx++) {
      for (let cz = -IMMEDIATE_RADIUS; cz <= IMMEDIATE_RADIUS; cz++) {
        const key = chunkKey(cx, cz);
        const chunk = generateChunk(cx, cz);
        newChunks.set(key, chunk);
        newVersions.set(key, 0);
        newIndexes.set(key, buildChunkBlockIndex(chunk, cx, cz));
      }
    }

    // Phase 2: 残りをキューに追加（距離順ソート）
    const queue: Array<{ cx: number; cz: number; dist: number }> = [];
    for (let cx = -renderDistance; cx <= renderDistance; cx++) {
      for (let cz = -renderDistance; cz <= renderDistance; cz++) {
        // 既に生成済みの即座生成範囲はスキップ
        if (Math.abs(cx) <= IMMEDIATE_RADIUS && Math.abs(cz) <= IMMEDIATE_RADIUS) continue;
        const dist = Math.max(Math.abs(cx), Math.abs(cz)); // チェビシェフ距離
        queue.push({ cx, cz, dist });
      }
    }
    // 近い順にソート
    queue.sort((a, b) => a.dist - b.dist);
    const sortedQueue: Array<[number, number]> = queue.map(q => [q.cx, q.cz]);

    set({
      chunks: newChunks,
      chunkVersions: newVersions,
      chunkBlockIndexes: newIndexes,
      blockIndexVersion: get().blockIndexVersion + 1,
      chunkGenQueue: sortedQueue,
      isInitialLoading: sortedQueue.length > 0,
    });
  },

  processChunkQueue: () => {
    const { chunks, chunkVersions, chunkBlockIndexes, chunkGenQueue } = get();
    if (chunkGenQueue.length === 0) {
      // キューが空になったらローディング完了
      if (get().isInitialLoading) {
        set({ isInitialLoading: false });
      }
      return;
    }

    // 1フレームで処理する数を、CPUの余力とフレーム予算に合わせて調整
    const chunkLimit = Math.min(getAdaptiveChunkLimit(), chunkGenQueue.length);
    const startedAt = nowMs();
    const newChunks = new Map(chunks);
    const newVersions = new Map(chunkVersions);
    const newIndexes = new Map(chunkBlockIndexes);
    let processed = 0;
    let generated = 0;

    while (processed < chunkGenQueue.length) {
      if (
        generated >= MIN_CHUNKS_PER_FRAME &&
        (generated >= chunkLimit || nowMs() - startedAt >= CHUNK_GENERATION_BUDGET_MS)
      ) {
        break;
      }

      const [cx, cz] = chunkGenQueue[processed];
      processed++;
      const key = chunkKey(cx, cz);
      if (!newChunks.has(key)) {
        const chunk = generateChunk(cx, cz);
        newChunks.set(key, chunk);
        newVersions.set(key, 0);
        newIndexes.set(key, buildChunkBlockIndex(chunk, cx, cz));
        generated++;
      }
    }

    const remaining = chunkGenQueue.slice(processed);

    set((state) => ({
      chunks: generated > 0 ? newChunks : chunks,
      chunkVersions: generated > 0 ? newVersions : chunkVersions,
      chunkBlockIndexes: generated > 0 ? newIndexes : chunkBlockIndexes,
      blockIndexVersion: generated > 0 ? state.blockIndexVersion + 1 : state.blockIndexVersion,
      chunkGenQueue: remaining,
      isInitialLoading: remaining.length > 0,
    }));
  },

  ensureChunksAround: (camCx, camCz, radius) => {
    const { chunks, chunkGenQueue } = get();
    const queuedKeys = new Set(chunkGenQueue.map(([cx, cz]) => chunkKey(cx, cz)));
    const additions: Array<[number, number]> = [];

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const cx = camCx + dx;
        const cz = camCz + dz;
        const key = chunkKey(cx, cz);
        if (chunks.has(key) || queuedKeys.has(key)) continue;
        queuedKeys.add(key);
        additions.push([cx, cz]);
      }
    }

    if (additions.length === 0) return;

    const mergedQueue: Array<[number, number]> = [
      ...chunkGenQueue,
      ...additions,
    ].sort((a, b) => {
      const da = Math.max(Math.abs(a[0] - camCx), Math.abs(a[1] - camCz));
      const db = Math.max(Math.abs(b[0] - camCx), Math.abs(b[1] - camCz));
      return da - db;
    });

    set({
      chunkGenQueue: mergedQueue,
      isInitialLoading: true,
    });
  },

  getChunk: (cx, cz) => {
    return get().chunks.get(chunkKey(cx, cz));
  },

  getIndexedBlockPositions: (blockId) => {
    const positions: IndexedBlockPosition[] = [];
    for (const chunkIndex of get().chunkBlockIndexes.values()) {
      const indexedPositions = chunkIndex.get(blockId);
      if (indexedPositions) positions.push(...indexedPositions);
    }
    return positions;
  },

  getIndexedLightBlockPositions: () => {
    const positions: IndexedBlockPosition[] = [];
    for (const chunkIndex of get().chunkBlockIndexes.values()) {
      for (const [blockId, indexedPositions] of chunkIndex.entries()) {
        if (!BLOCK_DEFS[blockId]?.lightColor) continue;
        positions.push(...indexedPositions);
      }
    }
    return positions;
  },

  getBlock: (x, y, z) => {
    if (y < 0 || y >= WORLD_HEIGHT) return BLOCK_IDS.AIR;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    const chunk = get().chunks.get(chunkKey(cx, cz));
    if (!chunk) return BLOCK_IDS.AIR;
    return chunk[lx][y][lz];
  },

  setBlock: (x, y, z, blockId) => {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const key = chunkKey(cx, cz);

    const chunk = get().chunks.get(key);
    if (!chunk) return;

    // チャンクデータを直接変更（パフォーマンスのため）
    chunk[lx][y][lz] = blockId;

    // バージョンをインクリメントして再描画を促す
    set((state) => {
      const newVersions = new Map(state.chunkVersions);
      newVersions.set(key, (newVersions.get(key) ?? 0) + 1);
      const newIndexes = new Map(state.chunkBlockIndexes);
      newIndexes.set(key, buildChunkBlockIndex(chunk, cx, cz));
      return {
        chunkVersions: newVersions,
        chunkBlockIndexes: newIndexes,
        blockIndexVersion: state.blockIndexVersion + 1,
      };
    });
  },

  breakBlock: (x, y, z) => {
    const block = get().getBlock(x, y, z);
    const blockDef = BLOCK_DEFS[block];
    if (block === BLOCK_IDS.AIR || blockDef?.unbreakable) return false;
    get().setBlock(x, y, z, BLOCK_IDS.AIR);
    return true;
  },
}));
