import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, resolveCreatureVolume, useSettingsStore } from './useSettingsStore';

describe('音響設定', () => {
  beforeEach(() => useSettingsStore.setState(DEFAULT_SETTINGS));

  it('立体音響と個別バスの安全な既定値を持つ', () => {
    const state = useSettingsStore.getState();
    expect(state.masterVolume).toBe(1);
    expect(state.ambienceVolume).toBeGreaterThan(0);
    expect(state.creatureVolume).toBe(1);
    expect(state.voiceChatVolume).toBe(1);
    expect(state.dynamicRange).toBe('standard');
    expect(state.spatialAudio).toBe(true);
  });

  it('音量を0から1へクランプする', () => {
    useSettingsStore.getState().setMasterVolume(2);
    useSettingsStore.getState().setCreatureVolume(-1);
    expect(useSettingsStore.getState().masterVolume).toBe(1);
    expect(useSettingsStore.getState().creatureVolume).toBe(0);
  });

  it('画質プリセットを変えても音響ミックスを保持する', () => {
    useSettingsStore.getState().setMasterVolume(0.64);
    useSettingsStore.getState().setDynamicRange('night');
    useSettingsStore.getState().setSpatialAudio(false);

    useSettingsStore.getState().applyGraphicsPreset('light');

    const state = useSettingsStore.getState();
    expect(state.masterVolume).toBe(0.64);
    expect(state.dynamicRange).toBe('night');
    expect(state.spatialAudio).toBe(false);
  });

  it('旧セリフ音量を生き物・モブ音量へ一度だけ引き継ぐ', () => {
    expect(resolveCreatureVolume(undefined, 0.36)).toBe(0.36);
    expect(resolveCreatureVolume(0.72, 0.36)).toBe(0.72);
    expect(resolveCreatureVolume(undefined, undefined)).toBe(DEFAULT_SETTINGS.creatureVolume);
  });
});
