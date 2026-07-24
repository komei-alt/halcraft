import { afterEach, describe, expect, it } from 'vitest';
import { BIOME_CONFIGS } from '../../types/biomes';
import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT, type BlockId } from '../../types/blocks';
import { clearHeightCache, getTerrainSample, WORLD_GENERATOR_VERSION } from './heightmap';
import { setCurrentBiome } from './biomeConfig';
import { resetNoiseForBiome } from './noise';
import { generateChunk } from './chunkGenerator';
import { createEmptyChunk, finalizeChunkBounds, type ChunkData } from './types';
import { isVegetationExcluded, placeNetherFloraInChunk } from './structures/decor';
import { shouldPlaceTreeAt } from './structures/trees';
import { HELIPORT_CENTER } from './constants';

function selectBiome(id: keyof typeof BIOME_CONFIGS): void {
  setCurrentBiome(BIOME_CONFIGS[id]);
  resetNoiseForBiome();
  clearHeightCache();
}

function chunkBytes(chunk: ChunkData): Uint8Array {
  const bytes = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  let offset = 0;
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      bytes.set(chunk[x][y], offset);
      offset += CHUNK_SIZE;
    }
  }
  return bytes;
}

function countBlocks(chunk: ChunkData, ids: ReadonlySet<BlockId>): number {
  let count = 0;
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let y = 0; y <= chunk.maxFilledY; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) if (ids.has(chunk[x][y][z])) count++;
    }
  }
  return count;
}

afterEach(() => selectBiome('forest'));

describe('world-coordinate vegetation generation', () => {
  it('v3生成器は同じseedと座標で完全に同じチャンクを返す', () => {
    selectBiome('forest');
    expect(WORLD_GENERATOR_VERSION).toBe(3);
    expect(chunkBytes(generateChunk(5, 7))).toEqual(chunkBytes(generateChunk(5, 7)));
  });

  it('森林・南国・雪原・砂漠は固有の植生パレットを持つ', () => {
    expect(BIOME_CONFIGS.forest.vegetationPalette.map((entry) => entry.blockId)).toContain(BLOCK_IDS.MUSHROOM);
    expect(BIOME_CONFIGS.tropical.vegetationPalette.map((entry) => entry.blockId)).toContain(BLOCK_IDS.REED);
    expect(BIOME_CONFIGS.snow.vegetationPalette.map((entry) => entry.blockId)).toContain(BLOCK_IDS.FROST_GRASS);
    expect(BIOME_CONFIGS.desert.vegetationPalette.map((entry) => entry.blockId)).toContain(BLOCK_IDS.DEAD_BUSH);

    for (const biomeId of ['forest', 'tropical', 'snow', 'desert'] as const) {
      selectBiome(biomeId);
      const palette = new Set(BIOME_CONFIGS[biomeId].vegetationPalette.map((entry) => entry.blockId));
      let generated = 0;
      for (let cx = 5; cx <= 7; cx++) {
        for (let cz = 5; cz <= 7; cz++) generated += countBlocks(generateChunk(cx, cz), palette);
      }
      expect(generated, biomeId).toBeGreaterThan(0);
    }
  });

  it('チャンク境界近くの根元から両チャンクへ樹冠を再構築する', () => {
    selectBiome('forest');
    let root: { x: number; z: number } | null = null;
    for (let x = 64; x < 192 && !root; x++) {
      const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      if (localX > 1 && localX < CHUNK_SIZE - 2) continue;
      for (let z = 64; z < 192; z++) {
        const sample = getTerrainSample(x, z);
        if (sample.slopeHint <= 0.7 && shouldPlaceTreeAt(x, z)) {
          root = { x, z };
          break;
        }
      }
    }
    expect(root).not.toBeNull();
    if (!root) return;

    const rootCx = Math.floor(root.x / CHUNK_SIZE);
    const rootCz = Math.floor(root.z / CHUNK_SIZE);
    const localX = ((root.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const neighborCx = localX <= 1 ? rootCx - 1 : rootCx + 1;
    const rootChunk = generateChunk(rootCx, rootCz);
    const neighborChunk = generateChunk(neighborCx, rootCz);
    const flora = new Set<BlockId>([BLOCK_IDS.LEAVES, BLOCK_IDS.RAW_WOOD]);
    expect(countBlocks(rootChunk, flora)).toBeGreaterThan(0);
    expect(countBlocks(neighborChunk, flora)).toBeGreaterThan(0);
  });

  it('構造物除外とネザー露出面の発光菌生成を維持する', () => {
    expect(isVegetationExcluded(HELIPORT_CENTER.x, HELIPORT_CENTER.z)).toBe(true);
    const chunk = createEmptyChunk();
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) chunk[x][8][z] = BLOCK_IDS.NETHERRACK;
    }
    finalizeChunkBounds(chunk);
    placeNetherFloraInChunk(chunk, 12, 12);
    finalizeChunkBounds(chunk);
    expect(countBlocks(chunk, new Set([BLOCK_IDS.NETHER_FUNGUS]))).toBeGreaterThan(0);
  });
});
