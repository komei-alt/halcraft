// ワールドの状態管理ストア
// 全チャンク・ブロックの読み書き、ブロックの破壊・設置を管理

import { create } from 'zustand';
import { BLOCK_DEFS, BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT, type BlockId } from '../types/blocks';
import { generateChunk } from '../utils/terrain/chunkGenerator';
import type { ChunkData } from '../utils/terrain/types';

/** チャンクキーの生成 */
const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

interface WorldState {
  /** チャンクデータ（キー: "cx,cz"） */
  chunks: Map<string, ChunkData>;

  /** チャンク更新のバージョン管理（再描画トリガー） */
  chunkVersions: Map<string, number>;

  /** 初期チャンクを一括生成 */
  initChunks: (renderDistance: number) => void;

  /** カメラ周辺の未生成チャンクを動的に生成 */
  ensureChunksAround: (camCx: number, camCz: number, radius: number) => void;

  /** チャンクを取得（生成済みのみ） */
  getChunk: (cx: number, cz: number) => ChunkData | undefined;

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

  clearChunks: () => {
    set({ chunks: new Map(), chunkVersions: new Map() });
  },

  initChunks: (renderDistance) => {
    const newChunks = new Map<string, ChunkData>();
    const newVersions = new Map<string, number>();

    for (let cx = -renderDistance; cx <= renderDistance; cx++) {
      for (let cz = -renderDistance; cz <= renderDistance; cz++) {
        const key = chunkKey(cx, cz);
        newChunks.set(key, generateChunk(cx, cz));
        newVersions.set(key, 0);
      }
    }

    set({ chunks: newChunks, chunkVersions: newVersions });
  },

  ensureChunksAround: (camCx, camCz, radius) => {
    const { chunks, chunkVersions } = get();
    let hasNew = false;
    let newChunks: Map<string, ChunkData> | null = null;
    let newVersions: Map<string, number> | null = null;

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const cx = camCx + dx;
        const cz = camCz + dz;
        const key = chunkKey(cx, cz);
        if (!chunks.has(key)) {
          if (!newChunks) {
            newChunks = new Map(chunks);
            newVersions = new Map(chunkVersions);
          }
          newChunks.set(key, generateChunk(cx, cz));
          newVersions!.set(key, 0);
          hasNew = true;
        }
      }
    }

    if (hasNew && newChunks && newVersions) {
      set({ chunks: newChunks, chunkVersions: newVersions });
    }
  },

  getChunk: (cx, cz) => {
    return get().chunks.get(chunkKey(cx, cz));
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
      return { chunkVersions: newVersions };
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
