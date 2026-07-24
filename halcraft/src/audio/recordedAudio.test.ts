import { describe, expect, it } from 'vitest';
import { RECORDED_CUE_IDS } from './recordedAudio';

describe('録音音響カタログ', () => {
  it('キューIDが重複せず主要カテゴリを含む', () => {
    expect(new Set(RECORDED_CUE_IDS).size).toBe(RECORDED_CUE_IDS.length);
    expect(RECORDED_CUE_IDS.some((id) => id.startsWith('footstep.'))).toBe(true);
    expect(RECORDED_CUE_IDS.some((id) => id.startsWith('impact.'))).toBe(true);
    expect(RECORDED_CUE_IDS.some((id) => id.startsWith('ui.'))).toBe(true);
    expect(RECORDED_CUE_IDS.some((id) => id.startsWith('scifi.'))).toBe(true);
    expect(RECORDED_CUE_IDS.some((id) => id.startsWith('jingle.'))).toBe(true);
  });
});
