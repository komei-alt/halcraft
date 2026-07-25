import { afterEach, describe, expect, it } from 'vitest';
import { BLOCK_IDS } from '../types/blocks';
import { createEmptyChunk } from '../utils/terrain/types';
import { useWorldStore } from './useWorldStore';

describe('ワールド座標の読み取り境界', () => {
  afterEach(() => {
    useWorldStore.getState().clearChunks();
  });

  it('AIや物理から渡される小数座標をブロック座標へ正規化する', () => {
    const chunk = createEmptyChunk();
    chunk[2][7][3] = BLOCK_IDS.STONE;
    useWorldStore.setState({ chunks: new Map([['0,0', chunk]]) });

    expect(useWorldStore.getState().getBlock(2.9, 7.8, 3.1)).toBe(BLOCK_IDS.STONE);
    expect(useWorldStore.getState().readBlock(2.9, 7.8, 3.1)).toEqual({
      status: 'ready',
      blockId: BLOCK_IDS.STONE,
    });
  });

  it('負の小数座標も隣接チャンクの正しいローカル座標へ変換する', () => {
    const chunk = createEmptyChunk();
    chunk[15][4][15] = BLOCK_IDS.DIRT;
    useWorldStore.setState({ chunks: new Map([['-1,-1', chunk]]) });

    expect(useWorldStore.getState().getBlock(-0.1, 4.9, -0.1)).toBe(BLOCK_IDS.DIRT);
  });
});
