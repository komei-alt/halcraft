import { describe, expect, it } from 'vitest';
import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT } from '../../types/blocks';
import { createEmptyChunk, packChunkData, unpackChunkData } from './types';

describe('chunk worker transfer format', () => {
  it('連続バッファへ詰めても全座標と上限高を維持する', () => {
    const chunk = createEmptyChunk();
    chunk[0][0][0] = BLOCK_IDS.BEDROCK;
    chunk[CHUNK_SIZE - 1][WORLD_HEIGHT - 1][CHUNK_SIZE - 1] = BLOCK_IDS.DIAMOND_ORE;
    chunk.maxFilledY = WORLD_HEIGHT - 1;

    const restored = unpackChunkData(packChunkData(chunk), chunk.maxFilledY);

    expect(restored[0][0][0]).toBe(BLOCK_IDS.BEDROCK);
    expect(restored[CHUNK_SIZE - 1][WORLD_HEIGHT - 1][CHUNK_SIZE - 1]).toBe(BLOCK_IDS.DIAMOND_ORE);
    expect(restored.maxFilledY).toBe(WORLD_HEIGHT - 1);
  });
});
