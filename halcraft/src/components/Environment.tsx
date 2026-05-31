// 環境コンポーネント
// 昼夜サイクルに基づく空の色、太陽光、霧を管理
// バイオーム設定から環境色を取得

import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { BIOME_CONFIGS } from '../types/biomes';
import { getPerformanceProfile } from '../utils/performance';
import { useSettingsStore } from '../stores/useSettingsStore';

/** 再利用用オブジェクト（GCプレッシャー削減） */
const _skyColor = new THREE.Color();
const _fogColor = new THREE.Color();
const _sunColor = new THREE.Color();
const _sunPosition = new THREE.Vector3();
const _skyTopColor = new THREE.Color();
const _skyHorizonColor = new THREE.Color();
const _skySunGlowColor = new THREE.Color();
const _skySunDirection = new THREE.Vector3();

/** バイオーム色キャッシュ用 */
const _daySky = new THREE.Color();
const _dayFog = new THREE.Color();
const _daySun = new THREE.Color();
const _nightSky = new THREE.Color();
const _nightFog = new THREE.Color();
const _nightSun = new THREE.Color();
const _sunsetSky = new THREE.Color();
const _sunsetFog = new THREE.Color();
const _sunsetSun = new THREE.Color();

/** 現在のバイオーム色をキャッシュ */
let cachedBiomeId: string | null = null;
let cachedFogNear = 100;
let cachedFogFar = 250;

const SKY_DOME_RADIUS = 395;
const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    vDirection = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_Position.z = gl_Position.w;
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uTopColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform float uNightMix;

  varying vec3 vDirection;

  void main() {
    vec3 direction = normalize(vDirection);
    float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
    float skyBlend = smoothstep(0.08, 0.96, height);
    vec3 sky = mix(uHorizonColor, uTopColor, skyBlend);

    float horizonGlow = exp(-abs(direction.y) * 4.0) * 0.08;
    float sunDot = max(dot(direction, normalize(uSunDirection)), 0.0);
    float sunHalo = pow(sunDot, 22.0);
    float sunCore = pow(sunDot, 420.0);
    float zenithLift = smoothstep(0.62, 1.0, height) * 0.08;

    sky += uSunColor * (horizonGlow + sunHalo * 0.28 + sunCore * 1.85);
    sky += uTopColor * zenithLift;
    sky = mix(sky, sky * 0.58 + vec3(0.014, 0.024, 0.055), uNightMix * 0.38);

    gl_FragColor = vec4(sky, 1.0);
  }
`;

interface SkyUniforms extends Record<string, THREE.IUniform<THREE.Color | THREE.Vector3 | number>> {
  uTopColor: THREE.IUniform<THREE.Color>;
  uHorizonColor: THREE.IUniform<THREE.Color>;
  uSunColor: THREE.IUniform<THREE.Color>;
  uSunDirection: THREE.IUniform<THREE.Vector3>;
  uNightMix: THREE.IUniform<number>;
}

function ensureSceneEnvironment(scene: THREE.Scene): { background: THREE.Color; fog: THREE.Fog } {
  if (!(scene.background instanceof THREE.Color)) {
    scene.background = new THREE.Color(0x87ceeb);
  }
  if (!(scene.fog instanceof THREE.Fog)) {
    scene.fog = new THREE.Fog(0x87ceeb, cachedFogNear, cachedFogFar);
  }
  return {
    background: scene.background,
    fog: scene.fog,
  };
}

function updateBiomeColors(biomeId: string): void {
  if (biomeId === cachedBiomeId) return;
  cachedBiomeId = biomeId;

  const biome = BIOME_CONFIGS[biomeId as keyof typeof BIOME_CONFIGS];
  if (!biome) return;

  _daySky.setHex(biome.daySkyColor);
  _dayFog.setHex(biome.dayFogColor);
  _daySun.setHex(biome.daySunColor);
  _nightSky.setHex(biome.nightSkyColor);
  _nightFog.setHex(biome.nightFogColor);
  _nightSun.setHex(biome.nightSunColor);
  _sunsetSky.setHex(biome.sunsetSkyColor);
  _sunsetFog.setHex(biome.sunsetFogColor);
  _sunsetSun.setHex(biome.sunsetSunColor);
  cachedFogNear = biome.fogNear;
  cachedFogFar = biome.fogFar;
}

function getNightMix(gameTime: number, dimension: string): number {
  if (dimension === 'nether') return 0.9;
  if (gameTime < 0.05) return 1;
  if (gameTime < 0.1) return 1 - ((gameTime - 0.05) / 0.05);
  if (gameTime < 0.4) return 0;
  if (gameTime < 0.55) return (gameTime - 0.4) / 0.15;
  return 1;
}

function createSkyUniforms(): SkyUniforms {
  return {
    uTopColor: { value: new THREE.Color(0x87ceeb) },
    uHorizonColor: { value: new THREE.Color(0xd8f1ff) },
    uSunColor: { value: new THREE.Color(0xfff5e0) },
    uSunDirection: { value: new THREE.Vector3(0.4, 0.8, 0.2).normalize() },
    uNightMix: { value: 0 },
  };
}

export function Environment() {
  const { camera, scene } = useThree();
  const skyRef = useRef<THREE.Mesh>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const skyUniforms = useMemo(() => createSkyUniforms(), []);
  useSettingsStore((s) => s.shadowQuality);
  const performanceProfile = getPerformanceProfile();

  const advanceTime = useGameStore((s) => s.advanceTime);

  // scene の初期設定（マウント時に一度だけ実行）
  // scene は R3F が管理する外部オブジェクトであり、副作用として初期化する必要がある
  useEffect(() => {
    ensureSceneEnvironment(scene);
  }, [scene]);

  // 毎フレーム昼夜サイクルを更新
  /* eslint-disable react-hooks/immutability */
  useFrame((_, delta) => {
    // ゲーム時間を進める
    advanceTime(delta);

    const gameState = useGameStore.getState();
    const gameTime = gameState.gameTime;

    // バイオーム色を更新
    const biomeId = gameState.currentBiome?.id ?? 'forest';
    updateBiomeColors(biomeId);
    const sceneEnvironment = ensureSceneEnvironment(scene);

    // 霧距離をバイオームに合わせる
    sceneEnvironment.fog.near = cachedFogNear;
    sceneEnvironment.fog.far = cachedFogFar;

    // 時間帯に応じた環境を計算（再利用オブジェクトで0アロケーション）
    let sunIntensity: number;
    let ambientIntensity: number;

    if (gameTime < 0.05) {
      const t = gameTime / 0.05;
      _skyColor.copy(_nightSky).lerp(_sunsetSky, t);
      _fogColor.copy(_nightFog).lerp(_sunsetFog, t);
      sunIntensity = 0.3 + t * 0.8;
      ambientIntensity = 0.15 + t * 0.3;
      _sunColor.copy(_nightSun).lerp(_daySun, t);
    } else if (gameTime < 0.1) {
      const t = (gameTime - 0.05) / 0.05;
      _skyColor.copy(_sunsetSky).lerp(_daySky, t);
      _fogColor.copy(_sunsetFog).lerp(_dayFog, t);
      sunIntensity = 1.1 + t * 0.7;
      ambientIntensity = 0.45 + t * 0.15;
      _sunColor.copy(_daySun);
    } else if (gameTime < 0.4) {
      _skyColor.copy(_daySky);
      _fogColor.copy(_dayFog);
      sunIntensity = 1.8;
      ambientIntensity = 0.6;
      _sunColor.copy(_daySun);
    } else if (gameTime < 0.5) {
      const t = (gameTime - 0.4) / 0.1;
      _skyColor.copy(_daySky).lerp(_sunsetSky, t);
      _fogColor.copy(_dayFog).lerp(_sunsetFog, t);
      sunIntensity = 1.8 - t * 1.2;
      ambientIntensity = 0.6 - t * 0.35;
      _sunColor.copy(_daySun).lerp(_sunsetSun, t);
    } else if (gameTime < 0.55) {
      const t = (gameTime - 0.5) / 0.05;
      _skyColor.copy(_sunsetSky).lerp(_nightSky, t);
      _fogColor.copy(_sunsetFog).lerp(_nightFog, t);
      sunIntensity = 0.6 - t * 0.25;
      ambientIntensity = 0.25 - t * 0.03;
      _sunColor.copy(_sunsetSun).lerp(_nightSun, t);
    } else {
      _skyColor.copy(_nightSky);
      _fogColor.copy(_nightFog);
      sunIntensity = 0.35;
      ambientIntensity = 0.22;
      _sunColor.copy(_nightSun);
    }

    // ネザーディメンション時は固定の暗赤色環境に上書き
    if (gameState.dimension === 'nether') {
      _skyColor.setHex(0x1A0000);
      _fogColor.setHex(0x330808);
      _sunColor.setHex(0xFF4400);
      sunIntensity = 0.5;
      ambientIntensity = 0.3;
    }

    // 太陽の位置を時間に連動（円弧を描く）
    const sunAngle = gameTime * Math.PI * 2;
    _sunPosition.set(
      Math.cos(sunAngle) * 60,
      Math.sin(sunAngle) * 80 + 10,
      30,
    );

    // シーンに適用
    sceneEnvironment.background.copy(_skyColor);
    sceneEnvironment.fog.color.copy(_fogColor);

    // 空ドームはカメラに追従させ、背景に立体的なグラデーションと太陽光を重ねる
    if (skyRef.current) {
      skyRef.current.position.copy(camera.position);
    }
    _skyTopColor.copy(_skyColor).multiplyScalar(gameState.dimension === 'nether' ? 0.8 : 1.08);
    _skyHorizonColor.copy(_fogColor).multiplyScalar(gameState.dimension === 'nether' ? 1.05 : 1.14);
    _skySunGlowColor.copy(_sunColor).multiplyScalar(gameState.dimension === 'nether' ? 0.65 : 0.95);
    _skySunDirection.copy(_sunPosition).normalize();
    skyUniforms.uTopColor.value.copy(_skyTopColor);
    skyUniforms.uHorizonColor.value.copy(_skyHorizonColor);
    skyUniforms.uSunColor.value.copy(_skySunGlowColor);
    skyUniforms.uSunDirection.value.copy(_skySunDirection);
    skyUniforms.uNightMix.value = getNightMix(gameTime, gameState.dimension);

    // ライト更新
    if (sunRef.current) {
      sunRef.current.position.copy(_sunPosition);
      sunRef.current.intensity = sunIntensity;
      sunRef.current.color.copy(_sunColor);
    }
    if (ambientRef.current) {
      ambientRef.current.intensity = ambientIntensity;
    }
    if (hemiRef.current) {
      hemiRef.current.intensity = Math.max(0.1, ambientIntensity * 0.7);
    }
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <>
      {/* 空ドーム（単色背景から、奥行きのある空と太陽のにじみにする） */}
      <mesh ref={skyRef} frustumCulled={false} renderOrder={-1000}>
        <sphereGeometry args={[SKY_DOME_RADIUS, 48, 24]} />
        <shaderMaterial
          uniforms={skyUniforms}
          vertexShader={SKY_VERTEX_SHADER}
          fragmentShader={SKY_FRAGMENT_SHADER}
          side={THREE.BackSide}
          depthWrite={false}
          depthTest={false}
          fog={false}
        />
      </mesh>

      {/* 環境光（全体を柔らかく照らす） */}
      <ambientLight ref={ambientRef} intensity={0.6} color={0xffffff} />

      {/* 太陽光（影を落とす主光源） */}
      <directionalLight
        ref={sunRef}
        position={[50, 80, 30]}
        intensity={1.8}
        castShadow={performanceProfile.shadowsEnabled}
        shadow-mapSize-width={performanceProfile.shadowMapSize}
        shadow-mapSize-height={performanceProfile.shadowMapSize}
        shadow-camera-far={performanceProfile.shadowCameraFar}
        shadow-camera-near={0.5}
        shadow-camera-left={-performanceProfile.shadowCameraSize}
        shadow-camera-right={performanceProfile.shadowCameraSize}
        shadow-camera-top={performanceProfile.shadowCameraSize}
        shadow-camera-bottom={-performanceProfile.shadowCameraSize}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        color={0xfff5e0}
      />

      {/* 半球ライト（空の色→地面の色の2色で自然な環境光） */}
      <hemisphereLight
        ref={hemiRef}
        args={[0x87ceeb, 0x6b8e23, 0.4]}
      />
    </>
  );
}
