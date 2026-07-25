// 画面全体の仕上げを担うグラフィック品質レイヤー
// 色管理・ポストエフェクトを設定値に合わせて軽量に切り替える

import { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  N8AO,
  SMAA,
  ToneMapping,
} from '@react-three/postprocessing';
import { BlendFunction, SMAAPreset, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import {
  GRAPHICS_PRESSURE_DPR_SCALE,
  useGraphicsRuntimeStore,
} from '../stores/useGraphicsRuntimeStore';
import { useSettingsStore, type GraphicsPreset, type ResolutionScale } from '../stores/useSettingsStore';
import { useGameStore } from '../stores/useGameStore';
import type { BiomeId, StageCategory } from '../types/stages';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile, type PerformanceTier } from '../utils/performance';

interface QualityTuning {
  bloomIntensity: number;
  bloomThreshold: number;
  aoIntensity: number;
  aoRadius: number;
  saturation: number;
  contrast: number;
  bloomLevels: number;
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
  contrastOffset: number;
  hue: number;
}

const DEFAULT_STAGE_LOOK: StageLookTuning = {
  bloomMultiplier: 1,
  bloomThresholdOffset: 0,
  saturationOffset: 0,
  contrastOffset: 0,
  hue: 0,
};

interface ReflectionRig {
  texture: THREE.Texture;
  dispose: () => void;
}

const CANVAS_RESOLUTION_SYNC_INTERVAL_MS = 300;

function getComposerResolutionScale(
  isHighQuality: boolean,
  isTouch: boolean,
  resolutionScale: ResolutionScale,
): number {
  if (isHighQuality && !isTouch) return 1;
  if (resolutionScale === 'crisp') return isTouch ? 0.92 : 1;
  if (resolutionScale === 'performance') return isTouch ? 0.58 : 0.72;
  return isTouch ? 0.78 : 0.88;
}

function isGraphicsPostFxEnabled(graphicsPreset: GraphicsPreset, tier: PerformanceTier): boolean {
  return graphicsPreset !== 'light' && tier !== 'low';
}

function getQualityTuning(
  isHighQuality: boolean,
  isTouch: boolean,
  resolutionScale: ResolutionScale,
): QualityTuning {
  if (isHighQuality && !isTouch) {
    return {
      bloomIntensity: 0.34,
      bloomThreshold: 0.74,
      aoIntensity: 0.88,
      aoRadius: 2.8,
      saturation: 0.06,
      contrast: 0.036,
      bloomLevels: 6,
      resolutionScale: getComposerResolutionScale(isHighQuality, isTouch, resolutionScale),
      smaaPreset: SMAAPreset.HIGH,
      aoQuality: 'medium',
      aoSamples: 12,
      denoiseSamples: 4,
    };
  }

  return {
    bloomIntensity: isTouch ? 0.18 : 0.24,
    bloomThreshold: 0.78,
    aoIntensity: isTouch ? 0.42 : 0.62,
    aoRadius: isTouch ? 1.8 : 2.4,
    saturation: isTouch ? 0.025 : 0.04,
    contrast: isTouch ? 0.012 : 0.022,
    bloomLevels: 4,
    resolutionScale: getComposerResolutionScale(isHighQuality, isTouch, resolutionScale),
    smaaPreset: isTouch ? SMAAPreset.LOW : SMAAPreset.MEDIUM,
    aoQuality: isTouch ? 'performance' : 'low',
    aoSamples: isTouch ? 4 : 6,
    denoiseSamples: 2,
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
      contrastOffset: 0.014,
      hue: 0.018,
    };
  }

  const biomeLook: Record<BiomeId, StageLookTuning> = {
    forest: {
      bloomMultiplier: 1.02,
      bloomThresholdOffset: -0.01,
      saturationOffset: 0.018,
      contrastOffset: 0.006,
      hue: -0.006,
    },
    tropical: {
      bloomMultiplier: 1.18,
      bloomThresholdOffset: -0.04,
      saturationOffset: 0.045,
      contrastOffset: 0.004,
      hue: 0.012,
    },
    snow: {
      bloomMultiplier: 1.08,
      bloomThresholdOffset: -0.03,
      saturationOffset: -0.012,
      contrastOffset: -0.006,
      hue: -0.018,
    },
    desert: {
      bloomMultiplier: 1.2,
      bloomThresholdOffset: -0.035,
      saturationOffset: 0.075,
      contrastOffset: 0.028,
      hue: 0.01,
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
    contrastOffset: base.contrastOffset + (isWar ? 0.012 : 0.004),
  };
}

function createReflectionRig(gl: THREE.WebGLRenderer): ReflectionRig {
  const pmrem = new THREE.PMREMGenerator(gl);
  const rigScene = new THREE.Scene();
  const objects: THREE.Object3D[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const skyGeometry = new THREE.SphereGeometry(12, 48, 24);
  const skyMaterial = new THREE.MeshBasicMaterial({
    color: 0xb8dfff,
    side: THREE.BackSide,
  });
  geometries.push(skyGeometry);
  materials.push(skyMaterial);
  objects.push(new THREE.Mesh(skyGeometry, skyMaterial));

  const panelGeometry = new THREE.PlaneGeometry(6, 6);
  geometries.push(panelGeometry);

  const createPanel = (
    color: number,
    position: THREE.Vector3,
    scale: [number, number, number],
  ): THREE.Mesh => {
    const material = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(panelGeometry, material);
    mesh.position.copy(position);
    mesh.scale.set(...scale);
    mesh.lookAt(0, 0.5, 0);
    materials.push(material);
    return mesh;
  };

  objects.push(
    createPanel(0xfff0b8, new THREE.Vector3(-4.5, 4.2, -3.6), [1.1, 0.78, 1]),
    createPanel(0x8fc8ff, new THREE.Vector3(4.8, 3.1, 3.8), [0.86, 0.62, 1]),
    createPanel(0x82ffd7, new THREE.Vector3(0.2, 1.3, -5.4), [0.68, 0.44, 1]),
    createPanel(0x3e2a1c, new THREE.Vector3(0, -2.2, 0), [2.8, 0.72, 1]),
  );

  rigScene.add(...objects);
  const target = pmrem.fromScene(rigScene, 0.04);

  objects.forEach((object) => rigScene.remove(object));

  return {
    texture: target.texture,
    dispose: () => {
      target.dispose();
      pmrem.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
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

/** 設定変更や復帰後も、WebGLの内部解像度を表示サイズへ戻してぼやけを防ぐ */
export function CanvasResolutionPipeline() {
  const { gl, camera, setDpr, setSize } = useThree();
  const lastSyncTime = useRef(0);
  const pressure = useGraphicsRuntimeStore((s) => s.pressure);

  const syncCanvasResolution = useCallback(() => {
    if (typeof window === 'undefined') return;

    const canvas = gl.domElement;
    const parent = canvas.parentElement;
    const width = Math.max(1, Math.round(canvas.clientWidth || parent?.clientWidth || window.innerWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight || parent?.clientHeight || window.innerHeight));
    const profile = getPerformanceProfile();
    const targetDpr = Math.max(
      0.75,
      Math.min(
        window.devicePixelRatio || 1,
        profile.maxDpr * GRAPHICS_PRESSURE_DPR_SCALE[pressure],
      ),
    );
    const targetBufferWidth = Math.max(1, Math.round(width * targetDpr));
    const targetBufferHeight = Math.max(1, Math.round(height * targetDpr));
    const currentDpr = gl.getPixelRatio();
    const needsResize =
      Math.abs(canvas.width - targetBufferWidth) > 1 ||
      Math.abs(canvas.height - targetBufferHeight) > 1 ||
      Math.abs(currentDpr - targetDpr) > 0.01;

    if (!needsResize) return;

    // Three.jsとR3Fの両方にサイズを渡し、レイキャストと描画解像度をそろえる。

    setDpr(targetDpr);
    setSize(width, height);
    gl.setPixelRatio(targetDpr);
    gl.setSize(width, height, false);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

  }, [camera, gl, pressure, setDpr, setSize]);

  useEffect(() => {
    syncCanvasResolution();
    window.addEventListener('resize', syncCanvasResolution);
    window.addEventListener('orientationchange', syncCanvasResolution);
    return () => {
      window.removeEventListener('resize', syncCanvasResolution);
      window.removeEventListener('orientationchange', syncCanvasResolution);
    };
  }, [syncCanvasResolution]);

  useFrame(() => {
    const now = performance.now();
    if (now - lastSyncTime.current < CANVAS_RESOLUTION_SYNC_INTERVAL_MS) return;
    lastSyncTime.current = now;
    syncCanvasResolution();
  });

  return null;
}

/** Three.jsレンダラー側の色空間と基本トーンを整える */
export function RendererColorPipeline() {
  const { gl } = useThree();
  const graphicsPreset = useSettingsStore((s) => s.graphicsPreset);
  const resolutionScale = useSettingsStore((s) => s.resolutionScale);
  const profile = getPerformanceProfile();
  const postFxEnabled = isGraphicsPostFxEnabled(graphicsPreset, profile.tier);
  const exposure = profile.tier === 'high' || graphicsPreset === 'quality'
    ? 1.06
    : resolutionScale === 'performance'
      ? 0.98
      : 1.02;

  // Three.jsレンダラーはR3F外部オブジェクトなので、色管理だけを副作用で同期する。

  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace;
    // ポストFXの ToneMapping と二重適用すると色が潰れる／白っぽくなるため切り替える
    gl.toneMapping = postFxEnabled ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
  }, [gl, exposure, postFxEnabled]);

  useFrame(() => {
    // ポストFX有効時は EffectComposer 側の ToneMapping が露出を担う
    if (postFxEnabled) {
      gl.toneMappingExposure = 1;
      return;
    }

    const gameState = useGameStore.getState();
    const stageBoost = gameState.dimension === 'overworld'
      ? gameState.currentStage?.rules.ambientIntensity ?? 1
      : 1;
    const darkLift = getDarkSceneLift(gameState.gameTime, gameState.dimension);
    const dynamicExposure = exposure
      * (1 + darkLift * 0.34)
      * (1 + Math.max(0, stageBoost - 1) * 0.08);
    gl.toneMappingExposure = THREE.MathUtils.lerp(gl.toneMappingExposure, dynamicExposure, 0.08);
  });


  return null;
}

/** 金属・ガラス・宝石が環境光を拾うための、軽量な反射用ライティング */
export function SceneReflectionPipeline() {
  const { gl, scene } = useThree();
  const graphicsPreset = useSettingsStore((s) => s.graphicsPreset);
  const lightingQuality = useSettingsStore((s) => s.lightingQuality);
  const resolutionScale = useSettingsStore((s) => s.resolutionScale);
  const profile = getPerformanceProfile();
  const enabled = graphicsPreset !== 'light' && lightingQuality !== 'simple' && profile.tier !== 'low';


  useEffect(() => {
    if (!enabled) return undefined;

    const previousEnvironment = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    const previousRotationY = scene.environmentRotation.y;
    const rig = createReflectionRig(gl);

    scene.environment = rig.texture;
    scene.environmentIntensity = profile.tier === 'high' || lightingQuality === 'rich' ? 0.82 : 0.58;

    return () => {
      if (scene.environment === rig.texture) {
        scene.environment = previousEnvironment;
        scene.environmentIntensity = previousIntensity;
        scene.environmentRotation.y = previousRotationY;
      }
      rig.dispose();
    };
  }, [enabled, gl, lightingQuality, profile.tier, scene]);

  useFrame(() => {
    if (!enabled || !scene.environment) return;

    const gameState = useGameStore.getState();
    const darkLift = getDarkSceneLift(gameState.gameTime, gameState.dimension);
    const stageBoost = gameState.dimension === 'overworld'
      ? gameState.currentStage?.rules.ambientIntensity ?? 1
      : 1;
    const crispBoost = resolutionScale === 'crisp' ? 0.08 : 0;
    const targetIntensity = (profile.tier === 'high' || lightingQuality === 'rich' ? 0.8 : 0.56)
      + crispBoost
      + darkLift * 0.12
      + Math.max(0, stageBoost - 1) * 0.08;

    scene.environmentIntensity = THREE.MathUtils.lerp(scene.environmentIntensity, targetIntensity, 0.055);
    scene.environmentRotation.y = gameState.gameTime * Math.PI * 2 * 0.08;
  });


  return null;
}

/** 品質設定時だけ重ねる、製品感を出す控えめなポストエフェクト */
export function GraphicsPostFX() {
  const graphicsPreset = useSettingsStore((s) => s.graphicsPreset);
  const lightingQuality = useSettingsStore((s) => s.lightingQuality);
  const shadowQuality = useSettingsStore((s) => s.shadowQuality);
  const stageBiome = useGameStore((s) => s.currentStage?.biome ?? null);
  const stageCategory = useGameStore((s) => s.currentStage?.category ?? null);
  const dimension = useGameStore((s) => s.dimension);
  const pressure = useGraphicsRuntimeStore((s) => s.pressure);
  const resolutionScale = useSettingsStore((s) => s.resolutionScale);
  const profile = getPerformanceProfile();
  const isTouch = isTouchDevice();
  const isHighQuality = pressure === 0
    && (profile.tier === 'high' || graphicsPreset === 'quality' || lightingQuality === 'rich');
  const enabled = isGraphicsPostFxEnabled(graphicsPreset, profile.tier);

  if (!enabled) return null;

  const tuning = getQualityTuning(isHighQuality, isTouch, resolutionScale);
  const stageLook = getStageLookTuning(stageBiome, stageCategory, dimension);
  const aoEnabled = shadowQuality !== 'off' && pressure < 2;
  const bloomThreshold = THREE.MathUtils.clamp(
    tuning.bloomThreshold + stageLook.bloomThresholdOffset,
    0.56,
    0.86,
  );
  const saturation = THREE.MathUtils.clamp(tuning.saturation + stageLook.saturationOffset, -0.08, 0.14);
  const contrast = THREE.MathUtils.clamp(tuning.contrast + stageLook.contrastOffset, 0, 0.075);

  return (
    <EffectComposer
      multisampling={0}
      resolutionScale={tuning.resolutionScale}
      depthBuffer={aoEnabled}
      renderPriority={1}
    >
      {aoEnabled ? (
        <N8AO
          halfRes={pressure > 0 || !isHighQuality || isTouch}
          quality={pressure > 0 ? 'performance' : tuning.aoQuality}
          aoRadius={tuning.aoRadius}
          distanceFalloff={1.35}
          intensity={tuning.aoIntensity}
          aoSamples={pressure > 0 ? Math.min(5, tuning.aoSamples) : tuning.aoSamples}
          denoiseSamples={pressure > 0 ? Math.min(2, tuning.denoiseSamples) : tuning.denoiseSamples}
          denoiseRadius={isHighQuality ? 14 : 10}
          depthAwareUpsampling
        />
      ) : <></>}
      <Bloom
        blendFunction={BlendFunction.SCREEN}
        intensity={tuning.bloomIntensity * stageLook.bloomMultiplier * 0.62}
        luminanceThreshold={bloomThreshold}
        luminanceSmoothing={0.18}
        levels={pressure > 0 ? Math.min(4, tuning.bloomLevels) : tuning.bloomLevels}
        mipmapBlur
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <HueSaturation
        blendFunction={BlendFunction.NORMAL}
        hue={stageLook.hue}
        saturation={saturation}
      />
      <BrightnessContrast
        blendFunction={BlendFunction.NORMAL}
        brightness={dimension === 'nether' ? -0.006 : 0.002}
        contrast={contrast}
      />
      <SMAA preset={pressure > 0 ? SMAAPreset.LOW : tuning.smaaPreset} />
    </EffectComposer>
  );
}
