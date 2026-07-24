import { describe, expect, it } from 'vitest';
import { BLOCK_IDS } from '../types/blocks';
import { getBlockAudioMaterial } from './blockAudioMaterial';

describe('ブロック材質別サウンド', () => {
  it('代表ブロックを正しい録音ファミリーへ割り当てる', () => {
    expect(getBlockAudioMaterial(BLOCK_IDS.WOOD)).toBe('wood');
    expect(getBlockAudioMaterial(BLOCK_IDS.IRON)).toBe('metal');
    expect(getBlockAudioMaterial(BLOCK_IDS.GLASS)).toBe('glass');
    expect(getBlockAudioMaterial(BLOCK_IDS.SAND)).toBe('soft');
    expect(getBlockAudioMaterial(BLOCK_IDS.STONE)).toBe('stone');
  });
});
