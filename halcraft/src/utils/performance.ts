// 実行端末に合わせた描画・生成負荷の調整

import { isTouchDevice } from './device';

export type PerformanceTier = 'low' | 'balanced' | 'high';

export interface PerformanceProfile {
  tier: PerformanceTier;
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

let cachedProfile: PerformanceProfile | null = null;

function getNavigatorMemory(): number | undefined {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return nav.deviceMemory;
}

function isMacLike(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS X/.test(navigator.userAgent);
}

export function getPerformanceProfile(): PerformanceProfile {
  if (cachedProfile) return cachedProfile;

  const touch = isTouchDevice();
  const cores = navigator.hardwareConcurrency || 8;
  const memory = getNavigatorMemory();
  const dpr = window.devicePixelRatio || 1;
  const highDpiDesktop = !touch && dpr >= 1.75;

  const tier: PerformanceTier =
    touch || cores <= 4 || (memory !== undefined && memory <= 4)
      ? 'low'
      : highDpiDesktop || cores <= 8 || isMacLike()
        ? 'balanced'
        : 'high';

  const profiles: Record<PerformanceTier, PerformanceProfile> = {
    low: {
      tier,
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
      tier,
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
      tier,
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

  cachedProfile = profiles[tier];
  return cachedProfile;
}
