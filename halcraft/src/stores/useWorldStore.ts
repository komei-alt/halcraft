// ワールドの状態管理ストア
// 全チャンク・ブロックの読み書き、ブロックの破壊・設置を管理
// 段階的チャンク生成でメインスレッドのブロックを防止

import { create } from 'zustand';
import { BLOCK_DEFS, BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT, type BlockId } from '../types/blocks';
import { generateChunk } from '../utils/terrain/chunkGenerator';
import type { ChunkData } from '../utils/terrain/types';
import { getPerformanceProfile } from '../utils/performance';

/** チャンクキーの生成 */
const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

/** ワールド座標キーの生成 */
const blockKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** 1フレームあたりに必ず生成するチャンク数 */
const MIN_CHUNKS_PER_FRAME = 1;

/** 初期ロード時の即座生成半径（足元付近を確実に表示） */
const IMMEDIATE_RADIUS = 2;

/** 1フレームで処理する流体更新の上限 */
const MAX_FLUID_UPDATES_PER_FRAME = 96;

/** 水が横方向へ広がれる最大距離 */
const WATER_MAX_FLOW_LEVEL = 5;

/** 溶岩が横方向へ広がれる最大距離（プレイヤー設置分のみ。世界生成溶岩は静止） */
const LAVA_MAX_FLOW_LEVEL = 1;

interface FluidUpdateTarget {
  x: number;
  y: number;
  z: number;
}

const HORIZONTAL_FLUID_DIRECTIONS = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, 0, -1],
  [0, 0, 1],
] as const;

const FLUID_NEIGHBOR_DIRECTIONS = [
  [0, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  ...HORIZONTAL_FLUID_DIRECTIONS,
] as const;

const fluidLevels = new Map<string, number>();
const fluidUpdateQueue: FluidUpdateTarget[] = [];
const queuedFluidUpdates = new Set<string>();

function isLiquidBlock(blockId: BlockId): blockId is typeof BLOCK_IDS.WATER | typeof BLOCK_IDS.LAVA {
  return blockId === BLOCK_IDS.WATER || blockId === BLOCK_IDS.LAVA;
}

function getMaxFluidLevel(blockId: BlockId): number {
  return blockId === BLOCK_IDS.LAVA ? LAVA_MAX_FLOW_LEVEL : WATER_MAX_FLOW_LEVEL;
}

function queueFluidUpdate(x: number, y: number, z: number): void {
  if (y < 0 || y >= WORLD_HEIGHT) return;
  const key = blockKey(x, y, z);
  if (queuedFluidUpdates.has(key)) return;
  queuedFluidUpdates.add(key);
  fluidUpdateQueue.push({ x, y, z });
}

function queueFluidNeighborhood(x: number, y: number, z: number): void {
  for (const [dx, dy, dz] of FLUID_NEIGHBOR_DIRECTIONS) {
    queueFluidUpdate(x + dx, y + dy, z + dz);
  }
}

function clearFluidSimulation(): void {
  fluidLevels.clear();
  fluidUpdateQueue.length = 0;
  queuedFluidUpdates.clear();
}

function getChunkCoords(x: number, z: number) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cz = Math.floor(z / CHUNK_SIZE);
  const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return { cx, cz, lx, lz, key: chunkKey(cx, cz) };
}

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
  const profileLimit = getPerformanceProfile().maxChunksPerFrame;
  return Math.max(MIN_CHUNKS_PER_FRAME, Math.min(profileLimit, Math.floor(cores / 2)));
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
    for (let ly = 0; ly <= Math.min(WORLD_HEIGHT - 1, chunk.maxFilledY); ly++) {
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

  /** 水・溶岩の流体更新を処理（毎フレーム呼ばれる） */
  processFluidSimulation: () => void;

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
    clearFluidSimulation();
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
    clearFluidSimulation();
    const newChunks = new Map<string, ChunkData>();
    const newVersions = new Map<string, number>();
    const newIndexes = new Map<string, ChunkBlockIndex>();

    // Phase 1: 足元の小範囲を即座に生成（プレイヤーが落ちないようにする）
    for (let cx = -IMMEDIATE_RADIUS; cx <= IMMEDIATE_RADIUS; cx++) {
      for (let cz = -IMMEDIATE_RADIUS; cz <= IMMEDIATE_RADIUS; cz++) {
        if (cx * cx + cz * cz > (IMMEDIATE_RADIUS + 0.35) ** 2) continue;
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
        const distanceSquared = cx * cx + cz * cz;
        if (distanceSquared > (renderDistance + 0.35) ** 2) continue;
        // 既に生成済みの即座生成範囲はスキップ
        if (distanceSquared <= (IMMEDIATE_RADIUS + 0.35) ** 2) continue;
        const dist = Math.sqrt(distanceSquared);
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
        (generated >= chunkLimit || nowMs() - startedAt >= getPerformanceProfile().chunkGenerationBudgetMs)
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

  processFluidSimulation: () => {
    if (fluidUpdateQueue.length === 0) return;

    // チャンク配列は in-place 更新。Map 全体のコピーは毎フレームの GC 圧になるため避ける。
    const { chunks } = get();
    const affectedChunkKeys = new Set<string>();

    const readBlock = (x: number, y: number, z: number): BlockId | undefined => {
      if (y < 0 || y >= WORLD_HEIGHT) return undefined;
      const { key, lx, lz } = getChunkCoords(x, z);
      const chunk = chunks.get(key);
      if (!chunk) return undefined;
      return chunk[lx][y][lz];
    };

    const getFluidLevelEntry = (x: number, y: number, z: number): number | undefined => {
      return fluidLevels.get(blockKey(x, y, z));
    };

    const writeBlock = (x: number, y: number, z: number, blockId: BlockId, fluidLevel = 0): boolean => {
      if (y < 0 || y >= WORLD_HEIGHT) return false;
      const { cx, cz, key, lx, lz } = getChunkCoords(x, z);
      const chunk = chunks.get(key);
      if (!chunk) return false;

      const positionKey = blockKey(x, y, z);
      const previousBlock = chunk[lx][y][lz];
      const previousLevel = fluidLevels.get(positionKey);
      if (
        previousBlock === blockId
        && (
          !isLiquidBlock(blockId)
          || (previousLevel !== undefined && previousLevel === fluidLevel)
        )
      ) {
        return false;
      }

      chunk[lx][y][lz] = blockId;
      if (isLiquidBlock(blockId)) {
        fluidLevels.set(positionKey, fluidLevel);
      } else {
        fluidLevels.delete(positionKey);
      }

      affectedChunkKeys.add(chunkKey(cx, cz));
      queueFluidNeighborhood(x, y, z);
      return true;
    };

    const writeFluid = (x: number, y: number, z: number, fluidBlock: BlockId, fluidLevel: number): boolean => {
      const targetBlock = readBlock(x, y, z);
      if (targetBlock === undefined) return false;

      if (targetBlock === fluidBlock) {
        const existing = getFluidLevelEntry(x, y, z);
        // 静止溶岩（登録なし）は上書きしない
        if (existing === undefined) return false;
        if (existing <= fluidLevel) return false;
        return writeBlock(x, y, z, fluidBlock, fluidLevel);
      }

      // 水と溶岩がぶつかったときだけ石化（静止溶岩を侵食しない）
      if (isLiquidBlock(targetBlock)) {
        if (targetBlock === BLOCK_IDS.LAVA && getFluidLevelEntry(x, y, z) === undefined) {
          return false;
        }
        return writeBlock(x, y, z, BLOCK_IDS.STONE);
      }

      // 空気にしか流れない（地面ブロックをマグマで置換しない）
      if (targetBlock !== BLOCK_IDS.AIR) return false;
      return writeBlock(x, y, z, fluidBlock, fluidLevel);
    };

    const hasFluidSupport = (x: number, y: number, z: number, fluidBlock: BlockId, fluidLevel: number): boolean => {
      if (readBlock(x, y + 1, z) === fluidBlock) return true;
      for (const [dx, , dz] of HORIZONTAL_FLUID_DIRECTIONS) {
        const nx = x + dx;
        const nz = z + dz;
        if (readBlock(nx, y, nz) !== fluidBlock) continue;
        const neighborLevel = getFluidLevelEntry(nx, y, nz);
        // 登録済みのより強い流れ、または静止溶岩（世界生成）に隣接していれば維持
        if (neighborLevel === undefined || neighborLevel < fluidLevel) {
          return true;
        }
      }
      return false;
    };

    let changed = false;
    let processed = 0;

    while (processed < MAX_FLUID_UPDATES_PER_FRAME && fluidUpdateQueue.length > 0) {
      const target = fluidUpdateQueue.shift()!;
      queuedFluidUpdates.delete(blockKey(target.x, target.y, target.z));
      processed++;

      const currentBlock = readBlock(target.x, target.y, target.z);
      if (currentBlock === undefined || !isLiquidBlock(currentBlock)) continue;

      const levelEntry = getFluidLevelEntry(target.x, target.y, target.z);
      // 世界生成の溶岩は fluidLevels 未登録 = 静止。掘っても無限に地面へ広がらない。
      if (currentBlock === BLOCK_IDS.LAVA && levelEntry === undefined) {
        continue;
      }

      const currentLevel = levelEntry ?? 0;
      if (currentLevel > 0 && !hasFluidSupport(target.x, target.y, target.z, currentBlock, currentLevel)) {
        changed = writeBlock(target.x, target.y, target.z, BLOCK_IDS.AIR) || changed;
        continue;
      }

      const belowY = target.y - 1;
      if (belowY >= 0) {
        const belowBlock = readBlock(target.x, belowY, target.z);
        if (belowBlock === BLOCK_IDS.AIR) {
          // 落下した流れは必ず fluidLevels 付きで置く（静止ソース化を防ぐ）
          changed = writeFluid(target.x, belowY, target.z, currentBlock, Math.max(1, currentLevel)) || changed;
          continue;
        }
        if (belowBlock !== undefined && isLiquidBlock(belowBlock) && belowBlock !== currentBlock) {
          // 静止溶岩は石化しない
          if (!(belowBlock === BLOCK_IDS.LAVA && getFluidLevelEntry(target.x, belowY, target.z) === undefined)) {
            changed = writeBlock(target.x, belowY, target.z, BLOCK_IDS.STONE) || changed;
          }
          continue;
        }
      }

      const maxFluidLevel = getMaxFluidLevel(currentBlock);
      if (currentLevel >= maxFluidLevel) continue;

      for (const [dx, , dz] of HORIZONTAL_FLUID_DIRECTIONS) {
        const nx = target.x + dx;
        const nz = target.z + dz;
        changed = writeFluid(nx, target.y, nz, currentBlock, currentLevel + 1) || changed;
      }
    }

    if (!changed) return;

    set((state) => {
      const newVersions = new Map(state.chunkVersions);
      const newIndexes = new Map(state.chunkBlockIndexes);

      for (const key of affectedChunkKeys) {
        const [cx, cz] = key.split(',').map(Number);
        const chunk = chunks.get(key);
        if (!chunk) continue;
        newVersions.set(key, (newVersions.get(key) ?? 0) + 1);
        newIndexes.set(key, buildChunkBlockIndex(chunk, cx, cz));
      }

      return {
        chunkVersions: newVersions,
        chunkBlockIndexes: newIndexes,
        blockIndexVersion: state.blockIndexVersion + 1,
      };
    });
  },

  ensureChunksAround: (camCx, camCz, radius) => {
    const { chunks, chunkGenQueue } = get();
    const queuedKeys = new Set(chunkGenQueue.map(([cx, cz]) => chunkKey(cx, cz)));
    const additions: Array<[number, number]> = [];

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > (radius + 0.35) ** 2) continue;
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
      const da = Math.hypot(a[0] - camCx, a[1] - camCz);
      const db = Math.hypot(b[0] - camCx, b[1] - camCz);
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
    const { key, lx, lz } = getChunkCoords(x, z);
    const chunk = get().chunks.get(key);
    if (!chunk) return BLOCK_IDS.AIR;
    return chunk[lx][y][lz];
  },

  setBlock: (x, y, z, blockId) => {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const { cx, cz, key, lx, lz } = getChunkCoords(x, z);

    const chunk = get().chunks.get(key);
    if (!chunk) return;

    // チャンクデータを直接変更（パフォーマンスのため）
    chunk[lx][y][lz] = blockId;
    if (blockId !== BLOCK_IDS.AIR && y > chunk.maxFilledY) {
      chunk.maxFilledY = y;
    }
    if (isLiquidBlock(blockId)) {
      fluidLevels.set(blockKey(x, y, z), 0);
    } else {
      fluidLevels.delete(blockKey(x, y, z));
    }
    queueFluidNeighborhood(x, y, z);

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
