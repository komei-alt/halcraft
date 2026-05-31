// 画面全体の仕上げを担うグラフィック品質レイヤー
// 色管理・ポストエフェクトを設定値に合わせて軽量に切り替える

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, HueSaturation, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, SMAAPreset, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { useSettingsStore } from '../stores/useSettingsStore';
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
  /* eslint-enable react-hooks/immutability */

  return null;
}

/** 品質設定時だけ重ねる、製品感を出す控えめなポストエフェクト */
export function GraphicsPostFX() {
  const graphicsPreset = useSettingsStore((s) => s.graphicsPreset);
  const lightingQuality = useSettingsStore((s) => s.lightingQuality);
  const shadowQuality = useSettingsStore((s) => s.shadowQuality);
  useSettingsStore((s) => s.resolutionScale);
  const profile = getPerformanceProfile();
  const isTouch = isTouchDevice();
  const isHighQuality = profile.tier === 'high' || graphicsPreset === 'quality' || lightingQuality === 'rich';
  const enabled = graphicsPreset !== 'light' && profile.tier !== 'low';

  if (!enabled) return null;

  const tuning = getQualityTuning(isHighQuality, isTouch);
  const aoEnabled = shadowQuality !== 'off';

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
        intensity={tuning.bloomIntensity}
        luminanceThreshold={tuning.bloomThreshold}
        luminanceSmoothing={0.18}
        mipmapBlur
      />
      <ToneMapping
        mode={ToneMappingMode.ACES_FILMIC}
        whitePoint={7.5}
        middleGrey={0.62}
        minLuminance={0.015}
      />
      <HueSaturation
        blendFunction={BlendFunction.NORMAL}
        hue={0}
        saturation={tuning.saturation}
      />
      <Vignette
        blendFunction={BlendFunction.NORMAL}
        offset={0.24}
        darkness={tuning.vignetteDarkness}
      />
      <SMAA preset={tuning.smaaPreset} />
    </EffectComposer>
  );
}
