// 実行端末に合わせた描画・生成負荷の調整

import { isTouchDevice } from './device';
import {
  useSettingsStore,
  type GraphicsPreset,
  type LightingQuality,
  type ResolutionScale,
  type ShadowQuality,
} from '../stores/useSettingsStore';

export type PerformanceTier = 'low' | 'balanced' | 'high';

export interface PerformanceProfile {
  tier: PerformanceTier;
  shadowsEnabled: boolean;
  maxDpr: number;
  cameraFar: number;
  visibleChunkRadius: number;
  initialRenderDistance: number;
  maxChunksPerFrame: number;
  chunkGenerationBudgetMs: number;
  maxDynamicLights: number;
  lightCollectRange: number;
  shadowMapSize: number;
  shadowCameraSize: number;
  shadowCameraFar: number;
}

function getNavigatorMemory(): number | undefined {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return nav.deviceMemory;
}

function isMacLike(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent);
}

function getAutoTier(): PerformanceTier {
  const touch = isTouchDevice();
  const cores = navigator.hardwareConcurrency || 8;
  const memory = getNavigatorMemory();
  const dpr = window.devicePixelRatio || 1;
  const highDpiDesktop = !touch && dpr >= 1.75;

  return (
    touch || cores <= 4 || (memory !== undefined && memory <= 4)
      ? 'low'
      : highDpiDesktop || cores <= 8 || isMacLike()
        ? 'balanced'
        : 'high'
  );
}

function getPresetTier(preset: GraphicsPreset): PerformanceTier {
  if (preset === 'light') return 'low';
  if (preset === 'balanced') return 'balanced';
  if (preset === 'quality') return 'high';
  return getAutoTier();
}

const BASE_PROFILES: Record<PerformanceTier, PerformanceProfile> = {
  low: {
    tier: 'low',
    shadowsEnabled: true,
    maxDpr: 1.15,
    cameraFar: 220,
    visibleChunkRadius: 5,
    initialRenderDistance: 6,
    maxChunksPerFrame: 2,
    chunkGenerationBudgetMs: 2.5,
    maxDynamicLights: 6,
    lightCollectRange: 32,
    shadowMapSize: 768,
    shadowCameraSize: 36,
    shadowCameraFar: 110,
  },
  balanced: {
    tier: 'balanced',
    shadowsEnabled: true,
    maxDpr: 1.35,
    cameraFar: 320,
    visibleChunkRadius: 7,
    initialRenderDistance: 8,
    maxChunksPerFrame: 4,
    chunkGenerationBudgetMs: 4,
    maxDynamicLights: 8,
    lightCollectRange: 40,
    shadowMapSize: 1024,
    shadowCameraSize: 46,
    shadowCameraFar: 140,
  },
  high: {
    tier: 'high',
    shadowsEnabled: true,
    maxDpr: 1.6,
    cameraFar: 420,
    visibleChunkRadius: 9,
    initialRenderDistance: 10,
    maxChunksPerFrame: 6,
    chunkGenerationBudgetMs: 5.5,
    maxDynamicLights: 10,
    lightCollectRange: 46,
    shadowMapSize: 1536,
    shadowCameraSize: 56,
    shadowCameraFar: 170,
  },
};

function getMaxDpr(scale: ResolutionScale, tier: PerformanceTier): number {
  if (scale === 'performance') return 1.1;
  if (scale === 'crisp') return tier === 'high' ? 1.8 : 1.55;
  return tier === 'high' ? 1.45 : 1.35;
}

function applyLightingQuality(profile: PerformanceProfile, quality: LightingQuality): PerformanceProfile {
  if (quality === 'simple') {
    return {
      ...profile,
      maxDynamicLights: 0,
      lightCollectRange: 0,
    };
  }

  if (quality === 'rich') {
    return {
      ...profile,
      maxDynamicLights: Math.max(profile.maxDynamicLights, 12),
      lightCollectRange: Math.max(profile.lightCollectRange, 54),
    };
  }

  return profile;
}

function applyShadowQuality(profile: PerformanceProfile, quality: ShadowQuality): PerformanceProfile {
  if (quality === 'off') {
    return {
      ...profile,
      shadowsEnabled: false,
      shadowMapSize: 0,
      shadowCameraSize: 0,
      shadowCameraFar: 0,
    };
  }

  if (quality === 'low') {
    return {
      ...profile,
      shadowsEnabled: true,
      shadowMapSize: 768,
      shadowCameraSize: 36,
      shadowCameraFar: 110,
    };
  }

  if (quality === 'high') {
    return {
      ...profile,
      shadowsEnabled: true,
      shadowMapSize: 2048,
      shadowCameraSize: 64,
      shadowCameraFar: 210,
    };
  }

  return {
    ...profile,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    shadowCameraSize: 46,
    shadowCameraFar: 140,
  };
}

export function getPerformanceProfile(): PerformanceProfile {
  const settings = useSettingsStore.getState();
  const tier = getPresetTier(settings.graphicsPreset);

  let profile: PerformanceProfile = {
    ...BASE_PROFILES[tier],
    tier,
    visibleChunkRadius: settings.renderDistance,
    initialRenderDistance: Math.max(4, Math.min(settings.renderDistance + 1, 10)),
    cameraFar: Math.max(180, settings.renderDistance * 38),
    maxDpr: getMaxDpr(settings.resolutionScale, tier),
  };

  profile = applyLightingQuality(profile, settings.lightingQuality);
  profile = applyShadowQuality(profile, settings.shadowQuality);

  return profile;
}
