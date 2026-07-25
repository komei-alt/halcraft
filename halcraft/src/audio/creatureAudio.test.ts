import { describe, expect, it } from 'vitest';
import { CREATURE_CUE_IDS, CREATURE_EVENTS_BY_MOB, isCreatureCueSupported } from './creatureAudio';

describe('非言語モブ音カタログ', () => {
  it('全モブに待機・被弾・死亡・出現キューを持つ', () => {
    for (const [mobType, events] of Object.entries(CREATURE_EVENTS_BY_MOB)) {
      expect(events, mobType).toContain('idle');
      expect(events, mobType).toContain('hurt');
      expect(events, mobType).toContain('death');
      expect(events, mobType).toContain('spawn');
    }
  });

  it('キューIDが重複せず、話し言葉用イベントを持たない', () => {
    expect(new Set(CREATURE_CUE_IDS).size).toBe(CREATURE_CUE_IDS.length);
    expect(CREATURE_CUE_IDS.length).toBeGreaterThanOrEqual(40);
    expect(CREATURE_CUE_IDS.some((id) => /dialogue|speech|greeting|voice/i.test(id))).toBe(false);
  });

  it('ニワトリへ攻撃声を割り当てず警戒声を使う', () => {
    expect(isCreatureCueSupported('chicken', 'attack')).toBe(false);
    expect(isCreatureCueSupported('chicken', 'alert')).toBe(true);
  });
});
