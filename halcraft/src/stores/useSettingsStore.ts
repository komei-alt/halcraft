// ユーザー設定ストア
// グラフィック品質・表示補助を localStorage に保存する

import { create } from 'zustand';
import type { DynamicRangeMode } from '../audio';

const SETTINGS_STORAGE_KEY = 'halcraft-settings';

export type GraphicsPreset = 'auto' | 'light' | 'balanced' | 'quality';
export type LightingQuality = 'simple' | 'standard' | 'rich';
export type AtmosphereQuality = 'off' | 'simple' | 'standard' | 'rich';
export type ShadowQuality = 'off' | 'low' | 'standard' | 'high';
export type ResolutionScale = 'performance' | 'balanced' | 'crisp';
export type HudDensity = 'simple' | 'detailed';

export interface SettingsSnapshot {
  graphicsPreset: GraphicsPreset;
  renderDistance: number;
  lightingQuality: LightingQuality;
  atmosphereQuality: AtmosphereQuality;
  shadowQuality: ShadowQuality;
  resolutionScale: ResolutionScale;
  waterAnimation: boolean;
  hudDensity: HudDensity;
  showControlsGuide: boolean;
  /** 全体音量 0-1 */
  masterVolume: number;
  /** BGM 音量 0-1 */
  bgmVolume: number;
  /** 環境音 音量 0-1 */
  ambienceVolume: number;
  /** 効果音 音量 0-1 */
  sfxVolume: number;
  /** キャラクター・案内音声音量 0-1 */
  dialogueVolume: number;
  /** ボイスチャット音量 0-1 */
  voiceChatVolume: number;
  audioMuted: boolean;
  dynamicRange: DynamicRangeMode;
  spatialAudio: boolean;
}

interface SettingsState extends SettingsSnapshot {
  setGraphicsPreset: (preset: GraphicsPreset) => void;
  applyGraphicsPreset: (preset: GraphicsPreset) => void;
  setRenderDistance: (distance: number) => void;
  setLightingQuality: (quality: LightingQuality) => void;
  setAtmosphereQuality: (quality: AtmosphereQuality) => void;
  setShadowQuality: (quality: ShadowQuality) => void;
  setResolutionScale: (scale: ResolutionScale) => void;
  setWaterAnimation: (enabled: boolean) => void;
  setHudDensity: (density: HudDensity) => void;
  setShowControlsGuide: (enabled: boolean) => void;
  setMasterVolume: (volume: number) => void;
  setBgmVolume: (volume: number) => void;
  setAmbienceVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
  setDialogueVolume: (volume: number) => void;
  setVoiceChatVolume: (volume: number) => void;
  setAudioMuted: (muted: boolean) => void;
  setDynamicRange: (mode: DynamicRangeMode) => void;
  setSpatialAudio: (enabled: boolean) => void;
  resetSettings: () => void;
}

export const DEFAULT_SETTINGS: SettingsSnapshot = {
  graphicsPreset: 'auto',
  renderDistance: 7,
  lightingQuality: 'standard',
  atmosphereQuality: 'standard',
  shadowQuality: 'standard',
  resolutionScale: 'balanced',
  waterAnimation: true,
  hudDensity: 'simple',
  showControlsGuide: false,
  masterVolume: 1,
  bgmVolume: 0.85,
  ambienceVolume: 0.82,
  sfxVolume: 1,
  dialogueVolume: 1,
  voiceChatVolume: 1,
  audioMuted: false,
  dynamicRange: 'standard',
  spatialAudio: true,
};

const PRESET_SETTINGS: Record<GraphicsPreset, SettingsSnapshot> = {
  auto: DEFAULT_SETTINGS,
  light: {
    ...DEFAULT_SETTINGS,
    graphicsPreset: 'light',
    renderDistance: 5,
    lightingQuality: 'simple',
    atmosphereQuality: 'off',
    shadowQuality: 'off',
    resolutionScale: 'performance',
    waterAnimation: false,
    hudDensity: 'simple',
    showControlsGuide: false,
  },
  balanced: {
    ...DEFAULT_SETTINGS,
    graphicsPreset: 'balanced',
    renderDistance: 7,
    lightingQuality: 'standard',
    atmosphereQuality: 'standard',
    shadowQuality: 'standard',
    resolutionScale: 'balanced',
    waterAnimation: true,
    hudDensity: 'simple',
    showControlsGuide: false,
  },
  quality: {
    ...DEFAULT_SETTINGS,
    graphicsPreset: 'quality',
    renderDistance: 9,
    lightingQuality: 'rich',
    atmosphereQuality: 'rich',
    shadowQuality: 'high',
    resolutionScale: 'crisp',
    waterAnimation: true,
    hudDensity: 'simple',
    showControlsGuide: false,
  },
};

function isGraphicsPreset(value: unknown): value is GraphicsPreset {
  return value === 'auto' || value === 'light' || value === 'balanced' || value === 'quality';
}

function isLightingQuality(value: unknown): value is LightingQuality {
  return value === 'simple' || value === 'standard' || value === 'rich';
}

function isAtmosphereQuality(value: unknown): value is AtmosphereQuality {
  return value === 'off' || value === 'simple' || value === 'standard' || value === 'rich';
}

function isShadowQuality(value: unknown): value is ShadowQuality {
  return value === 'off' || value === 'low' || value === 'standard' || value === 'high';
}

function isResolutionScale(value: unknown): value is ResolutionScale {
  return value === 'performance' || value === 'balanced' || value === 'crisp';
}

function isHudDensity(value: unknown): value is HudDensity {
  return value === 'simple' || value === 'detailed';
}

function isDynamicRange(value: unknown): value is DynamicRangeMode {
  return value === 'night' || value === 'standard' || value === 'wide';
}

function clampRenderDistance(value: number): number {
  return Math.max(4, Math.min(10, Math.round(value)));
}

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function pickSnapshot(state: SettingsState | SettingsSnapshot): SettingsSnapshot {
  return {
    graphicsPreset: state.graphicsPreset,
    renderDistance: state.renderDistance,
    lightingQuality: state.lightingQuality,
    atmosphereQuality: state.atmosphereQuality,
    shadowQuality: state.shadowQuality,
    resolutionScale: state.resolutionScale,
    waterAnimation: state.waterAnimation,
    hudDensity: state.hudDensity,
    showControlsGuide: state.showControlsGuide,
    masterVolume: state.masterVolume,
    bgmVolume: state.bgmVolume,
    ambienceVolume: state.ambienceVolume,
    sfxVolume: state.sfxVolume,
    dialogueVolume: state.dialogueVolume,
    voiceChatVolume: state.voiceChatVolume,
    audioMuted: state.audioMuted,
    dynamicRange: state.dynamicRange,
    spatialAudio: state.spatialAudio,
  };
}

function saveSettings(snapshot: SettingsSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // 保存できない環境でもゲームは止めない。
  }
}

function loadSettings(): SettingsSnapshot {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;

  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<Record<keyof SettingsSnapshot, unknown>>;
    return {
      graphicsPreset: isGraphicsPreset(parsed.graphicsPreset) ? parsed.graphicsPreset : DEFAULT_SETTINGS.graphicsPreset,
      renderDistance: typeof parsed.renderDistance === 'number'
        ? clampRenderDistance(parsed.renderDistance)
        : DEFAULT_SETTINGS.renderDistance,
      lightingQuality: isLightingQuality(parsed.lightingQuality)
        ? parsed.lightingQuality
        : DEFAULT_SETTINGS.lightingQuality,
      atmosphereQuality: isAtmosphereQuality(parsed.atmosphereQuality)
        ? parsed.atmosphereQuality
        : DEFAULT_SETTINGS.atmosphereQuality,
      shadowQuality: isShadowQuality(parsed.shadowQuality) ? parsed.shadowQuality : DEFAULT_SETTINGS.shadowQuality,
      resolutionScale: isResolutionScale(parsed.resolutionScale)
        ? parsed.resolutionScale
        : DEFAULT_SETTINGS.resolutionScale,
      waterAnimation: typeof parsed.waterAnimation === 'boolean'
        ? parsed.waterAnimation
        : DEFAULT_SETTINGS.waterAnimation,
      hudDensity: isHudDensity(parsed.hudDensity)
        ? parsed.hudDensity
        : DEFAULT_SETTINGS.hudDensity,
      showControlsGuide: typeof parsed.showControlsGuide === 'boolean'
        ? parsed.showControlsGuide
        : DEFAULT_SETTINGS.showControlsGuide,
      masterVolume: typeof parsed.masterVolume === 'number'
        ? clampVolume(parsed.masterVolume)
        : DEFAULT_SETTINGS.masterVolume,
      bgmVolume: typeof parsed.bgmVolume === 'number'
        ? clampVolume(parsed.bgmVolume)
        : DEFAULT_SETTINGS.bgmVolume,
      ambienceVolume: typeof parsed.ambienceVolume === 'number'
        ? clampVolume(parsed.ambienceVolume)
        : DEFAULT_SETTINGS.ambienceVolume,
      sfxVolume: typeof parsed.sfxVolume === 'number'
        ? clampVolume(parsed.sfxVolume)
        : DEFAULT_SETTINGS.sfxVolume,
      dialogueVolume: typeof parsed.dialogueVolume === 'number'
        ? clampVolume(parsed.dialogueVolume)
        : DEFAULT_SETTINGS.dialogueVolume,
      voiceChatVolume: typeof parsed.voiceChatVolume === 'number'
        ? clampVolume(parsed.voiceChatVolume)
        : DEFAULT_SETTINGS.voiceChatVolume,
      audioMuted: typeof parsed.audioMuted === 'boolean'
        ? parsed.audioMuted
        : DEFAULT_SETTINGS.audioMuted,
      dynamicRange: isDynamicRange(parsed.dynamicRange)
        ? parsed.dynamicRange
        : DEFAULT_SETTINGS.dynamicRange,
      spatialAudio: typeof parsed.spatialAudio === 'boolean'
        ? parsed.spatialAudio
        : DEFAULT_SETTINGS.spatialAudio,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const useSettingsStore = create<SettingsState>((set) => {
  const setAndSave = (partial: Partial<SettingsSnapshot>) => {
    set((state) => {
      const next = {
        ...pickSnapshot(state),
        ...partial,
      };
      saveSettings(next);
      return next;
    });
  };

  return {
    ...loadSettings(),

    setGraphicsPreset: (graphicsPreset) => setAndSave({ graphicsPreset }),
    applyGraphicsPreset: (preset) => set((state) => {
      // 音響設定は画質プリセット切替で変えない
      const next = {
        ...PRESET_SETTINGS[preset],
        masterVolume: state.masterVolume,
        bgmVolume: state.bgmVolume,
        ambienceVolume: state.ambienceVolume,
        sfxVolume: state.sfxVolume,
        dialogueVolume: state.dialogueVolume,
        voiceChatVolume: state.voiceChatVolume,
        audioMuted: state.audioMuted,
        dynamicRange: state.dynamicRange,
        spatialAudio: state.spatialAudio,
      };
      saveSettings(next);
      return next;
    }),
    setRenderDistance: (renderDistance) => setAndSave({ renderDistance: clampRenderDistance(renderDistance) }),
    setLightingQuality: (lightingQuality) => setAndSave({ lightingQuality }),
    setAtmosphereQuality: (atmosphereQuality) => setAndSave({ atmosphereQuality }),
    setShadowQuality: (shadowQuality) => setAndSave({ shadowQuality }),
    setResolutionScale: (resolutionScale) => setAndSave({ resolutionScale }),
    setWaterAnimation: (waterAnimation) => setAndSave({ waterAnimation }),
    setHudDensity: (hudDensity) => setAndSave({ hudDensity }),
    setShowControlsGuide: (showControlsGuide) => setAndSave({ showControlsGuide }),
    setMasterVolume: (masterVolume) => setAndSave({ masterVolume: clampVolume(masterVolume) }),
    setBgmVolume: (bgmVolume) => setAndSave({ bgmVolume: clampVolume(bgmVolume) }),
    setAmbienceVolume: (ambienceVolume) => setAndSave({ ambienceVolume: clampVolume(ambienceVolume) }),
    setSfxVolume: (sfxVolume) => setAndSave({ sfxVolume: clampVolume(sfxVolume) }),
    setDialogueVolume: (dialogueVolume) => setAndSave({ dialogueVolume: clampVolume(dialogueVolume) }),
    setVoiceChatVolume: (voiceChatVolume) => setAndSave({ voiceChatVolume: clampVolume(voiceChatVolume) }),
    setAudioMuted: (audioMuted) => setAndSave({ audioMuted }),
    setDynamicRange: (dynamicRange) => setAndSave({ dynamicRange }),
    setSpatialAudio: (spatialAudio) => setAndSave({ spatialAudio }),
    resetSettings: () => setAndSave(DEFAULT_SETTINGS),
  };
});
