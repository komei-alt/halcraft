// ユーザー設定ストア
// グラフィック品質・表示補助を localStorage に保存する

import { create } from 'zustand';

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
};

const PRESET_SETTINGS: Record<GraphicsPreset, SettingsSnapshot> = {
  auto: DEFAULT_SETTINGS,
  light: {
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

function clampRenderDistance(value: number): number {
  return Math.max(4, Math.min(10, Math.round(value)));
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
    applyGraphicsPreset: (preset) => setAndSave(PRESET_SETTINGS[preset]),
    setRenderDistance: (renderDistance) => setAndSave({ renderDistance: clampRenderDistance(renderDistance) }),
    setLightingQuality: (lightingQuality) => setAndSave({ lightingQuality }),
    setAtmosphereQuality: (atmosphereQuality) => setAndSave({ atmosphereQuality }),
    setShadowQuality: (shadowQuality) => setAndSave({ shadowQuality }),
    setResolutionScale: (resolutionScale) => setAndSave({ resolutionScale }),
    setWaterAnimation: (waterAnimation) => setAndSave({ waterAnimation }),
    setHudDensity: (hudDensity) => setAndSave({ hudDensity }),
    setShowControlsGuide: (showControlsGuide) => setAndSave({ showControlsGuide }),
    resetSettings: () => setAndSave(DEFAULT_SETTINGS),
  };
});
