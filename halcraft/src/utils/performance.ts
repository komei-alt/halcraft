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
export type MaterialDetail = 'base' | 'pbr';

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
  /** ワールド生成量に対する植生表示率 */
  vegetationDensity: number;
  /** 植生LODの切替距離（m）。Highのみ3段階。 */
  vegetationLodDistances: readonly number[];
  /** カメラから何チャンク先まで植生を描くか */
  vegetationChunkRadius: number;
  /** 近景の風揺れ強度 */
  vegetationWind: number;
  vegetationShadows: boolean;
  particleBudget: number;
  materialDetail: MaterialDetail;
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

export const PERFORMANCE_PROFILES: Readonly<Record<PerformanceTier, PerformanceProfile>> = {
  low: {
    tier: 'low',
    shadowsEnabled: false,
    maxDpr: 1,
    cameraFar: 220,
    visibleChunkRadius: 5,
    initialRenderDistance: 5,
    maxChunksPerFrame: 1,
    chunkGenerationBudgetMs: 2,
    maxDynamicLights: 6,
    lightCollectRange: 32,
    shadowMapSize: 0,
    shadowCameraSize: 0,
    shadowCameraFar: 0,
    vegetationDensity: 0.58,
    vegetationLodDistances: [44],
    vegetationChunkRadius: 4,
    vegetationWind: 0,
    vegetationShadows: false,
    particleBudget: 220,
    materialDetail: 'base',
  },
  balanced: {
    tier: 'balanced',
    shadowsEnabled: true,
    // Retina画面で全画面ポストFXを二重に高解像度化しない。SMAAと組み合わせて輪郭を保つ。
    maxDpr: 1.2,
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
    vegetationDensity: 0.75,
    vegetationLodDistances: [32, 80],
    vegetationChunkRadius: 6,
    vegetationWind: 0.55,
    vegetationShadows: true,
    particleBudget: 520,
    materialDetail: 'pbr',
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
    vegetationDensity: 1,
    vegetationLodDistances: [36, 92, 150],
    vegetationChunkRadius: 9,
    vegetationWind: 1,
    vegetationShadows: true,
    particleBudget: 900,
    materialDetail: 'pbr',
  },
};

function getMaxDpr(scale: ResolutionScale, tier: PerformanceTier): number {
  if (scale === 'performance') return 1;
  if (scale === 'crisp') {
    if (tier === 'high') return 1.8;
    if (tier === 'balanced') return 1.4;
    return 1.25;
  }
  if (tier === 'high') return 1.45;
  if (tier === 'balanced') return 1.2;
  return 1.15;
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

  return profile;
}

export function getPerformanceProfile(): PerformanceProfile {
  const settings = useSettingsStore.getState();
  const tier = getPresetTier(settings.graphicsPreset);
  const baseProfile = PERFORMANCE_PROFILES[tier];
  const effectiveRenderDistance = settings.graphicsPreset === 'auto'
    ? Math.min(settings.renderDistance, baseProfile.visibleChunkRadius)
    : settings.renderDistance;

  let profile: PerformanceProfile = {
    ...baseProfile,
    tier,
    visibleChunkRadius: effectiveRenderDistance,
    initialRenderDistance: Math.max(4, Math.min(effectiveRenderDistance + (tier === 'low' ? 0 : 1), 10)),
    cameraFar: Math.max(160, effectiveRenderDistance * 38),
    maxDpr: getMaxDpr(settings.resolutionScale, tier),
  };

  profile = applyLightingQuality(profile, settings.lightingQuality);
  profile = applyShadowQuality(profile, settings.shadowQuality);

  return profile;
}
