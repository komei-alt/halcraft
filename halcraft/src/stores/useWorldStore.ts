// ワールドの状態管理ストア
// 全チャンク・ブロックの読み書き、ブロックの破壊・設置を管理
// 段階的チャンク生成でメインスレッドのブロックを防止

import { create } from 'zustand';
import { BLOCK_DEFS, BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT, type BlockId } from '../types/blocks';
import { generateChunk } from '../utils/terrain/chunkGenerator';
import { getCurrentBiome } from '../utils/terrain/biomeConfig';
import { getCurrentTerrainStage } from '../utils/terrain/stageConfig';
import { unpackChunkData, type ChunkData } from '../utils/terrain/types';
import type { ChunkWorkerRequest, ChunkWorkerResponse } from '../utils/terrain/chunkWorker';
import { getPerformanceProfile } from '../utils/performance';

/** チャンクキーの生成 */
const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

/** ワールド座標キーの生成 */
const blockKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

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

interface ChunkWorkerSlot {
  worker: Worker;
  busy: boolean;
  job: { cx: number; cz: number } | null;
}

const completedChunkResults: ChunkWorkerResponse[] = [];
const failedChunkJobs: Array<[number, number]> = [];
const inFlightChunkKeys = new Set<string>();
const chunkEditOverrides = new Map<string, Map<number, BlockId>>();
let chunkWorkerSlots: ChunkWorkerSlot[] = [];
let chunkGeneration = 0;
let nextChunkJobId = 1;
let chunkWorkersDisabled = false;

function resetChunkScheduler(): void {
  chunkGeneration++;
  for (const slot of chunkWorkerSlots) slot.worker.terminate();
  chunkWorkerSlots = [];
  completedChunkResults.length = 0;
  failedChunkJobs.length = 0;
  inFlightChunkKeys.clear();
  chunkWorkersDisabled = false;
}

function blockOffset(lx: number, y: number, lz: number): number {
  return (lx * WORLD_HEIGHT + y) * CHUNK_SIZE + lz;
}

function recordChunkEdit(key: string, lx: number, y: number, lz: number, blockId: BlockId): void {
  const edits = chunkEditOverrides.get(key) ?? new Map<number, BlockId>();
  edits.set(blockOffset(lx, y, lz), blockId);
  chunkEditOverrides.set(key, edits);
}

function applyChunkEdits(key: string, chunk: ChunkData): void {
  const edits = chunkEditOverrides.get(key);
  if (!edits) return;
  for (const [offset, blockId] of edits) {
    const lx = Math.floor(offset / (WORLD_HEIGHT * CHUNK_SIZE));
    const remainder = offset % (WORLD_HEIGHT * CHUNK_SIZE);
    const y = Math.floor(remainder / CHUNK_SIZE);
    const lz = remainder % CHUNK_SIZE;
    chunk[lx][y][lz] = blockId;
    if (blockId !== BLOCK_IDS.AIR && y > chunk.maxFilledY) chunk.maxFilledY = y;
  }
}

function disableChunkWorkers(): void {
  chunkWorkersDisabled = true;
  for (const slot of chunkWorkerSlots) {
    if (slot.job) failedChunkJobs.push([slot.job.cx, slot.job.cz]);
    slot.worker.terminate();
  }
  chunkWorkerSlots = [];
  inFlightChunkKeys.clear();
}

function ensureChunkWorkerPool(): void {
  if (chunkWorkersDisabled || typeof Worker === 'undefined' || chunkWorkerSlots.length > 0) return;
  const workerCount = getPerformanceProfile().tier === 'low' ? 1 : 2;

  try {
    for (let index = 0; index < workerCount; index++) {
      const worker = new Worker(new URL('../utils/terrain/chunkWorker.ts', import.meta.url), { type: 'module' });
      const slot: ChunkWorkerSlot = { worker, busy: false, job: null };
      worker.onmessage = (event: MessageEvent<ChunkWorkerResponse>) => {
        const result = event.data;
        inFlightChunkKeys.delete(chunkKey(result.cx, result.cz));
        slot.busy = false;
        slot.job = null;
        completedChunkResults.push(result);
      };
      worker.onerror = () => disableChunkWorkers();
      chunkWorkerSlots.push(slot);
    }
  } catch {
    disableChunkWorkers();
  }
}

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
  // 物理・AIは連続座標を扱うため、ワールド境界で必ずブロック座標へ正規化する。
  // 小数を配列添字へ流すと undefined 参照になり、描画ループ全体が停止する。
  const blockX = Math.floor(x);
  const blockZ = Math.floor(z);
  const cx = Math.floor(blockX / CHUNK_SIZE);
  const cz = Math.floor(blockZ / CHUNK_SIZE);
  const lx = ((blockX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const lz = ((blockZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return { blockX, blockZ, cx, cz, lx, lz, key: chunkKey(cx, cz) };
}

export interface IndexedBlockPosition {
  x: number;
  y: number;
  z: number;
  blockId: BlockId;
}

/** 未生成チャンクと空気を混同しないワールド読み取り結果。 */
export type BlockRead =
  | { status: 'ready'; blockId: BlockId }
  | { status: 'unloaded' }
  | { status: 'outside' };

type ChunkBlockIndex = Map<BlockId, IndexedBlockPosition[]>;

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

  /** Worker が最後に生成したチャンクの処理時間 */
  lastChunkGenerationMs: number;

  /** Worker が生成したチャンクの最大処理時間 */
  maxChunkGenerationMs: number;

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

  /** 未生成・範囲外を区別してブロックを取得 */
  readBlock: (x: number, y: number, z: number) => BlockRead;

  /** 物理判定用。未生成領域は安全境界として岩盤を返す */
  getCollisionBlock: (x: number, y: number, z: number) => BlockId;

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
  lastChunkGenerationMs: 0,
  maxChunkGenerationMs: 0,

  clearChunks: () => {
    clearFluidSimulation();
    resetChunkScheduler();
    chunkEditOverrides.clear();
    set({
      chunks: new Map(),
      chunkVersions: new Map(),
      chunkBlockIndexes: new Map(),
      blockIndexVersion: get().blockIndexVersion + 1,
      chunkGenQueue: [],
      isInitialLoading: false,
      lastChunkGenerationMs: 0,
      maxChunkGenerationMs: 0,
    });
  },

  initChunks: (renderDistance) => {
    clearFluidSimulation();
    resetChunkScheduler();
    const queue: Array<{ cx: number; cz: number; dist: number }> = [];
    for (let cx = -renderDistance; cx <= renderDistance; cx++) {
      for (let cz = -renderDistance; cz <= renderDistance; cz++) {
        const distanceSquared = cx * cx + cz * cz;
        if (distanceSquared > (renderDistance + 0.35) ** 2) continue;
        const dist = Math.sqrt(distanceSquared);
        queue.push({ cx, cz, dist });
      }
    }
    // 近い順にソート
    queue.sort((a, b) => a.dist - b.dist);
    const sortedQueue: Array<[number, number]> = queue.map(q => [q.cx, q.cz]);

    set({
      chunks: new Map(),
      chunkVersions: new Map(),
      chunkBlockIndexes: new Map(),
      blockIndexVersion: get().blockIndexVersion + 1,
      chunkGenQueue: sortedQueue,
      isInitialLoading: sortedQueue.length > 0,
      lastChunkGenerationMs: 0,
      maxChunkGenerationMs: 0,
    });
  },

  processChunkQueue: () => {
    const { chunks, chunkVersions, chunkBlockIndexes } = get();
    while (completedChunkResults.length > 0 && completedChunkResults[0].generation !== chunkGeneration) {
      completedChunkResults.shift();
    }

    // React/Three側のメッシュ生成が一度に連鎖しないよう、公開は1フレーム1チャンクに制限する。
    const completed = completedChunkResults.shift();
    if (completed) {
      const key = chunkKey(completed.cx, completed.cz);
      if (!chunks.has(key)) {
        const chunk = unpackChunkData(new Uint8Array(completed.buffer), completed.maxFilledY);
        applyChunkEdits(key, chunk);
        chunks.set(key, chunk);
        chunkVersions.set(key, 0);
        chunkBlockIndexes.set(key, buildChunkBlockIndex(chunk, completed.cx, completed.cz));
      }
      set((state) => ({
        blockIndexVersion: state.blockIndexVersion + 1,
        lastChunkGenerationMs: completed.durationMs,
        maxChunkGenerationMs: Math.max(state.maxChunkGenerationMs, completed.durationMs),
      }));
    }

    if (failedChunkJobs.length > 0) {
      const retry = failedChunkJobs.splice(0, failedChunkJobs.length);
      set({ chunkGenQueue: [...retry, ...get().chunkGenQueue] });
    }

    ensureChunkWorkerPool();
    const currentQueue = get().chunkGenQueue;
    if (!chunkWorkersDisabled && chunkWorkerSlots.length > 0) {
      let consumed = 0;
      for (const slot of chunkWorkerSlots) {
        if (slot.busy) continue;
        while (consumed < currentQueue.length) {
          const [cx, cz] = currentQueue[consumed++];
          const key = chunkKey(cx, cz);
          if (chunks.has(key) || inFlightChunkKeys.has(key)) continue;
          const request: ChunkWorkerRequest = {
            jobId: nextChunkJobId++,
            generation: chunkGeneration,
            cx,
            cz,
            biome: getCurrentBiome(),
            stage: getCurrentTerrainStage(),
          };
          slot.busy = true;
          slot.job = { cx, cz };
          inFlightChunkKeys.add(key);
          slot.worker.postMessage(request);
          break;
        }
      }
      if (consumed > 0) set({ chunkGenQueue: currentQueue.slice(consumed) });
    } else if (currentQueue.length > 0) {
      // テスト/SSRまたはWorker初期化失敗時の互換経路。ブラウザ本番では通らない。
      const [cx, cz] = currentQueue[0];
      const key = chunkKey(cx, cz);
      if (!chunks.has(key)) {
        const startedAt = performance.now();
        const chunk = generateChunk(cx, cz);
        applyChunkEdits(key, chunk);
        chunks.set(key, chunk);
        chunkVersions.set(key, 0);
        chunkBlockIndexes.set(key, buildChunkBlockIndex(chunk, cx, cz));
        const durationMs = performance.now() - startedAt;
        set((state) => ({
          blockIndexVersion: state.blockIndexVersion + 1,
          lastChunkGenerationMs: durationMs,
          maxChunkGenerationMs: Math.max(state.maxChunkGenerationMs, durationMs),
        }));
      }
      set({ chunkGenQueue: currentQueue.slice(1) });
    }

    const loading = get().chunkGenQueue.length > 0
      || inFlightChunkKeys.size > 0
      || completedChunkResults.some((result) => result.generation === chunkGeneration);
    if (get().isInitialLoading !== loading) set({ isInitialLoading: loading });
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
      recordChunkEdit(key, lx, y, lz, blockId);
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
    const { chunks, chunkVersions, chunkBlockIndexes, chunkGenQueue } = get();
    const retainRadius = radius + 3;
    let evicted = false;
    for (const key of chunks.keys()) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.hypot(cx - camCx, cz - camCz) <= retainRadius) continue;
      chunks.delete(key);
      chunkVersions.delete(key);
      chunkBlockIndexes.delete(key);
      evicted = true;
    }

    const retainedQueue = chunkGenQueue.filter(([cx, cz]) =>
      Math.hypot(cx - camCx, cz - camCz) <= retainRadius,
    );
    const queuedKeys = new Set(retainedQueue.map(([cx, cz]) => chunkKey(cx, cz)));
    const additions: Array<[number, number]> = [];

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz > (radius + 0.35) ** 2) continue;
        const cx = camCx + dx;
        const cz = camCz + dz;
        const key = chunkKey(cx, cz);
        if (chunks.has(key) || queuedKeys.has(key) || inFlightChunkKeys.has(key)) continue;
        queuedKeys.add(key);
        additions.push([cx, cz]);
      }
    }

    if (additions.length === 0) {
      if (evicted || retainedQueue.length !== chunkGenQueue.length) {
        set((state) => ({
          chunkGenQueue: retainedQueue,
          blockIndexVersion: evicted ? state.blockIndexVersion + 1 : state.blockIndexVersion,
        }));
      }
      return;
    }

    const mergedQueue: Array<[number, number]> = [
      ...retainedQueue,
      ...additions,
    ].sort((a, b) => {
      const da = Math.hypot(a[0] - camCx, a[1] - camCz);
      const db = Math.hypot(b[0] - camCx, b[1] - camCz);
      return da - db;
    });

    set((state) => ({
      chunkGenQueue: mergedQueue,
      isInitialLoading: true,
      blockIndexVersion: evicted ? state.blockIndexVersion + 1 : state.blockIndexVersion,
    }));
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
    const blockY = Math.floor(y);
    if (blockY < 0 || blockY >= WORLD_HEIGHT) return BLOCK_IDS.AIR;
    const { key, lx, lz } = getChunkCoords(x, z);
    const chunk = get().chunks.get(key);
    if (!chunk) return BLOCK_IDS.AIR;
    return chunk[lx][blockY][lz];
  },

  readBlock: (x, y, z) => {
    const blockY = Math.floor(y);
    if (blockY < 0 || blockY >= WORLD_HEIGHT) return { status: 'outside' };
    const { key, lx, lz } = getChunkCoords(x, z);
    const chunk = get().chunks.get(key);
    if (!chunk) return { status: 'unloaded' };
    return { status: 'ready', blockId: chunk[lx][blockY][lz] };
  },

  getCollisionBlock: (x, y, z) => {
    if (y >= WORLD_HEIGHT) return BLOCK_IDS.AIR;
    if (y < 0) return BLOCK_IDS.BEDROCK;
    const result = get().readBlock(x, y, z);
    return result.status === 'ready' ? result.blockId : BLOCK_IDS.BEDROCK;
  },

  setBlock: (x, y, z, blockId) => {
    const blockY = Math.floor(y);
    if (blockY < 0 || blockY >= WORLD_HEIGHT) return;
    const { blockX, blockZ, cx, cz, key, lx, lz } = getChunkCoords(x, z);

    const chunk = get().chunks.get(key);
    if (!chunk) return;

    // チャンクデータを直接変更（パフォーマンスのため）
    chunk[lx][blockY][lz] = blockId;
    recordChunkEdit(key, lx, blockY, lz, blockId);
    if (blockId !== BLOCK_IDS.AIR && blockY > chunk.maxFilledY) {
      chunk.maxFilledY = blockY;
    }
    if (isLiquidBlock(blockId)) {
      fluidLevels.set(blockKey(blockX, blockY, blockZ), 0);
    } else {
      fluidLevels.delete(blockKey(blockX, blockY, blockZ));
    }
    queueFluidNeighborhood(blockX, blockY, blockZ);

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
