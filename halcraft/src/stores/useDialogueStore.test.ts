import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDialogueStore } from './useDialogueStore';

describe('会話キュー', () => {
  afterEach(() => {
    useDialogueStore.getState().dismiss();
    vi.useRealTimers();
  });

  it('開始ガイドを優先し、割り込まれた味方台詞を後から再生する', () => {
    vi.useFakeTimers();
    const dialogue = useDialogueStore.getState();

    dialogue.announce('prototype.greeting');
    expect(useDialogueStore.getState().active?.id).toBe('prototype.greeting');

    dialogue.announce('system.stage_start');
    expect(useDialogueStore.getState().active?.id).toBe('system.stage_start');

    vi.advanceTimersByTime(4200);
    expect(useDialogueStore.getState().active?.id).toBe('prototype.greeting');
  });
});
