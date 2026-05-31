// 画面全体の仕上げを担うグラフィック品質レイヤー
// 色管理・ポストエフェクトを設定値に合わせて軽量に切り替える

import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, HueSaturation, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, SMAAPreset, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useGameStore } from '../stores/useGameStore';
import type { BiomeId, StageCategory } from '../types/stages';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';

interface QualityTuning {
  bloomIntensity: number;
  bloomThreshold: number;
  aoIntensity: number;
  aoRadius: number;
  vignetteDarkness: number;
  saturation: number;
  resolutionScale: number;
  smaaPreset: SMAAPreset;
  aoQuality: 'performance' | 'low' | 'medium';
  aoSamples: number;
  denoiseSamples: number;
}

interface StageLookTuning {
  bloomMultiplier: number;
  bloomThresholdOffset: number;
  saturationOffset: number;
  vignetteDarknessOffset: number;
  hue: number;
  middleGrey: number;
  whitePoint: number;
}

const DEFAULT_STAGE_LOOK: StageLookTuning = {
  bloomMultiplier: 1,
  bloomThresholdOffset: 0,
  saturationOffset: 0,
  vignetteDarknessOffset: 0,
  hue: 0,
  middleGrey: 0.62,
  whitePoint: 7.5,
};

function getQualityTuning(isHighQuality: boolean, isTouch: boolean): QualityTuning {
  if (isHighQuality && !isTouch) {
    return {
      bloomIntensity: 0.34,
      bloomThreshold: 0.74,
      aoIntensity: 1.1,
      aoRadius: 3.2,
      vignetteDarkness: 0.32,
      saturation: 0.06,
      resolutionScale: 1,
      smaaPreset: SMAAPreset.HIGH,
      aoQuality: 'medium',
      aoSamples: 12,
      denoiseSamples: 4,
    };
  }

  return {
    bloomIntensity: isTouch ? 0.18 : 0.24,
    bloomThreshold: 0.78,
    aoIntensity: isTouch ? 0.45 : 0.7,
    aoRadius: isTouch ? 1.8 : 2.4,
    vignetteDarkness: isTouch ? 0.12 : 0.2,
    saturation: isTouch ? 0.025 : 0.04,
    resolutionScale: isTouch ? 0.72 : 0.85,
    smaaPreset: isTouch ? SMAAPreset.LOW : SMAAPreset.MEDIUM,
    aoQuality: isTouch ? 'performance' : 'low',
    aoSamples: isTouch ? 5 : 8,
    denoiseSamples: isTouch ? 2 : 3,
  };
}

function getStageLookTuning(
  biomeId: BiomeId | null,
  category: StageCategory | null,
  dimension: string,
): StageLookTuning {
  if (dimension === 'nether') {
    return {
      bloomMultiplier: 1.22,
      bloomThresholdOffset: -0.05,
      saturationOffset: 0.035,
      vignetteDarknessOffset: 0.08,
      hue: 0.018,
      middleGrey: 0.56,
      whitePoint: 6.8,
    };
  }

  const biomeLook: Record<BiomeId, StageLookTuning> = {
    forest: {
      bloomMultiplier: 1.02,
      bloomThresholdOffset: -0.01,
      saturationOffset: 0.018,
      vignetteDarknessOffset: 0.018,
      hue: -0.006,
      middleGrey: 0.61,
      whitePoint: 7.6,
    },
    tropical: {
      bloomMultiplier: 1.18,
      bloomThresholdOffset: -0.04,
      saturationOffset: 0.045,
      vignetteDarknessOffset: -0.045,
      hue: 0.012,
      middleGrey: 0.66,
      whitePoint: 7.9,
    },
    snow: {
      bloomMultiplier: 1.08,
      bloomThresholdOffset: -0.03,
      saturationOffset: -0.012,
      vignetteDarknessOffset: -0.025,
      hue: -0.018,
      middleGrey: 0.68,
      whitePoint: 8.2,
    },
    desert: {
      bloomMultiplier: 1.14,
      bloomThresholdOffset: -0.02,
      saturationOffset: 0.02,
      vignetteDarknessOffset: 0.012,
      hue: 0.024,
      middleGrey: 0.64,
      whitePoint: 7.3,
    },
  };

  const base = biomeId ? biomeLook[biomeId] : DEFAULT_STAGE_LOOK;
  if (!category) return base;
  const isWar = category === 'war';

  return {
    ...base,
    bloomMultiplier: base.bloomMultiplier * (isWar ? 1.08 : 1.03),
    bloomThresholdOffset: base.bloomThresholdOffset + (isWar ? -0.018 : -0.006),
    saturationOffset: base.saturationOffset + (isWar ? 0.014 : 0.006),
    vignetteDarknessOffset: base.vignetteDarknessOffset + (isWar ? 0.045 : -0.012),
    middleGrey: base.middleGrey + (isWar ? -0.02 : 0.015),
  };
}

function getDarkSceneLift(gameTime: number, dimension: string): number {
  if (dimension === 'nether') return 0.45;
  if (gameTime < 0.35) return 0;
  if (gameTime < 0.55) {
    const t = THREE.MathUtils.clamp((gameTime - 0.35) / 0.2, 0, 1);
    return t * t * (3 - 2 * t) * 0.78;
  }
  return 1;
}

/** Three.jsレンダラー側の色空間と基本トーンを整える */
export function RendererColorPipeline() {
  const { gl } = useThree();
  const graphicsPreset = useSettingsStore((s) => s.graphicsPreset);
  const resolutionScale = useSettingsStore((s) => s.resolutionScale);
  const profile = getPerformanceProfile();
  const exposure = profile.tier === 'high' || graphicsPreset === 'quality'
    ? 1.06
    : resolutionScale === 'performance'
      ? 0.98
      : 1.02;

  // Three.jsレンダラーはR3F外部オブジェクトなので、色管理だけを副作用で同期する。
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);

  useFrame(() => {
    const gameState = useGameStore.getState();
    const stageBoost = gameState.dimension === 'overworld'
      ? gameState.currentStage?.rules.ambientIntensity ?? 1
      : 1;
    const darkLift = getDarkSceneLift(gameState.gameTime, gameState.dimension);
    const dynamicExposure = exposure
      * (1 + darkLift * 0.24)
      * (1 + Math.max(0, stageBoost - 1) * 0.08);
    gl.toneMappingExposure = THREE.MathUtils.lerp(gl.toneMappingExposure, dynamicExposure, 0.08);
  });
  /* eslint-enable react-hooks/immutability */

  return null;
}

/** 品質設定時だけ重ねる、製品感を出す控えめなポストエフェクト */
export function GraphicsPostFX() {
  const graphicsPreset = useSettingsStore((s) => s.graphicsPreset);
  const lightingQuality = useSettingsStore((s) => s.lightingQuality);
  const shadowQuality = useSettingsStore((s) => s.shadowQuality);
  useSettingsStore((s) => s.resolutionScale);
  const stageBiome = useGameStore((s) => s.currentStage?.biome ?? null);
  const stageCategory = useGameStore((s) => s.currentStage?.category ?? null);
  const dimension = useGameStore((s) => s.dimension);
  const profile = getPerformanceProfile();
  const isTouch = isTouchDevice();
  const isHighQuality = profile.tier === 'high' || graphicsPreset === 'quality' || lightingQuality === 'rich';
  const enabled = graphicsPreset !== 'light' && profile.tier !== 'low';

  if (!enabled) return null;

  const tuning = getQualityTuning(isHighQuality, isTouch);
  const stageLook = getStageLookTuning(stageBiome, stageCategory, dimension);
  const aoEnabled = shadowQuality !== 'off';
  const bloomThreshold = THREE.MathUtils.clamp(
    tuning.bloomThreshold + stageLook.bloomThresholdOffset,
    0.56,
    0.86,
  );
  const saturation = THREE.MathUtils.clamp(tuning.saturation + stageLook.saturationOffset, -0.08, 0.14);
  const vignetteDarkness = THREE.MathUtils.clamp(
    tuning.vignetteDarkness + stageLook.vignetteDarknessOffset,
    0.08,
    0.45,
  );

  return (
    <EffectComposer
      multisampling={0}
      resolutionScale={tuning.resolutionScale}
      depthBuffer={aoEnabled}
      renderPriority={1}
    >
      {aoEnabled ? (
        <N8AO
          halfRes={!isHighQuality || isTouch}
          quality={tuning.aoQuality}
          aoRadius={tuning.aoRadius}
          distanceFalloff={1.35}
          intensity={tuning.aoIntensity}
          aoSamples={tuning.aoSamples}
          denoiseSamples={tuning.denoiseSamples}
          denoiseRadius={isHighQuality ? 14 : 10}
          depthAwareUpsampling
        />
      ) : <></>}
      <Bloom
        blendFunction={BlendFunction.SCREEN}
        intensity={tuning.bloomIntensity * stageLook.bloomMultiplier}
        luminanceThreshold={bloomThreshold}
        luminanceSmoothing={0.18}
        mipmapBlur
      />
      <ToneMapping
        mode={ToneMappingMode.ACES_FILMIC}
        whitePoint={stageLook.whitePoint}
        middleGrey={stageLook.middleGrey}
        minLuminance={0.015}
      />
      <HueSaturation
        blendFunction={BlendFunction.NORMAL}
        hue={stageLook.hue}
        saturation={saturation}
      />
      <Vignette
        blendFunction={BlendFunction.NORMAL}
        offset={0.24}
        darkness={vignetteDarkness}
      />
      <SMAA preset={tuning.smaaPreset} />
    </EffectComposer>
  );
}
