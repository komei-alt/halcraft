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
const _moonPosition = new THREE.Vector3();
const _starfieldRotation = new THREE.Euler();
const _sunDiscColor = new THREE.Color();
const _sunDiscLiftColor = new THREE.Color(0xffffff);

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
const CELESTIAL_RADIUS = 365;
const SUN_DISC_RADIUS = 13.5;
const SUN_HALO_RADIUS = 31;
const MOON_DISC_RADIUS = 10.5;
const MOON_HALO_RADIUS = 22;
const STAR_COUNT = 190;

function smoothRange(min: number, max: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function createStarGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const seedA = ((i * 16807) % 9973) / 9973;
    const seedB = ((i * 48271) % 7919) / 7919;
    const seedC = ((i * 69621) % 6151) / 6151;
    const theta = seedA * Math.PI * 2;
    const y = 0.18 + seedB * 0.8;
    const radius = Math.sqrt(Math.max(0, 1 - y * y)) * (0.78 + seedC * 0.2);
    const off = i * 3;
    positions[off] = Math.cos(theta) * radius * CELESTIAL_RADIUS;
    positions[off + 1] = y * CELESTIAL_RADIUS;
    positions[off + 2] = Math.sin(theta) * radius * CELESTIAL_RADIUS;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

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
  const viewFillRef = useRef<THREE.PointLight>(null);
  const celestialGroupRef = useRef<THREE.Group>(null);
  const sunDiscRef = useRef<THREE.Mesh>(null);
  const sunHaloRef = useRef<THREE.Mesh>(null);
  const moonDiscRef = useRef<THREE.Mesh>(null);
  const moonHaloRef = useRef<THREE.Mesh>(null);
  const starfieldRef = useRef<THREE.Points>(null);
  const sunDiscMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const sunHaloMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const moonDiscMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const moonHaloMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const starMaterialRef = useRef<THREE.PointsMaterial>(null);
  const skyUniforms = useMemo(() => createSkyUniforms(), []);
  const starGeometry = useMemo(() => createStarGeometry(), []);
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

    const stageAmbientBoost = gameState.dimension === 'overworld'
      ? gameState.currentStage?.rules.ambientIntensity ?? 1
      : 1;
    ambientIntensity *= stageAmbientBoost;
    sunIntensity *= THREE.MathUtils.lerp(1, stageAmbientBoost, 0.35);

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
    const nightMix = getNightMix(gameTime, gameState.dimension);
    skyUniforms.uTopColor.value.copy(_skyTopColor);
    skyUniforms.uHorizonColor.value.copy(_skyHorizonColor);
    skyUniforms.uSunColor.value.copy(_skySunGlowColor);
    skyUniforms.uSunDirection.value.copy(_skySunDirection);
    skyUniforms.uNightMix.value = nightMix;

    // 視界の奥に、昼は太陽・夜は月と星が見える天体レイヤーを重ねる
    if (celestialGroupRef.current) {
      celestialGroupRef.current.position.copy(camera.position);
      celestialGroupRef.current.visible = gameState.dimension !== 'nether';
    }
    const sunAltitude = smoothRange(-0.08, 0.22, _skySunDirection.y);
    const sunOpacity = gameState.dimension === 'nether' ? 0 : THREE.MathUtils.clamp(sunAltitude * (1 - nightMix * 0.75), 0, 1);
    _moonPosition.copy(_skySunDirection).multiplyScalar(-CELESTIAL_RADIUS);
    const moonAltitude = smoothRange(0.04, 0.28, _moonPosition.y / CELESTIAL_RADIUS);
    const moonOpacity = gameState.dimension === 'nether' ? 0 : THREE.MathUtils.clamp(nightMix * moonAltitude, 0, 0.92);
    const starOpacity = gameState.dimension === 'nether' ? 0 : THREE.MathUtils.clamp(nightMix * 0.72, 0, 0.72);

    if (sunDiscRef.current) {
      sunDiscRef.current.position.copy(_skySunDirection).multiplyScalar(CELESTIAL_RADIUS);
      sunDiscRef.current.lookAt(camera.position);
    }
    if (sunHaloRef.current) {
      sunHaloRef.current.position.copy(_skySunDirection).multiplyScalar(CELESTIAL_RADIUS - 1);
      sunHaloRef.current.lookAt(camera.position);
    }
    if (moonDiscRef.current) {
      moonDiscRef.current.position.copy(_moonPosition);
      moonDiscRef.current.lookAt(camera.position);
    }
    if (moonHaloRef.current) {
      moonHaloRef.current.position.copy(_moonPosition).multiplyScalar(0.998);
      moonHaloRef.current.lookAt(camera.position);
    }
    if (starfieldRef.current) {
      _starfieldRotation.set(0, gameTime * Math.PI * 2 * 0.08, 0);
      starfieldRef.current.rotation.copy(_starfieldRotation);
    }
    if (sunDiscMaterialRef.current) {
      sunDiscMaterialRef.current.opacity = sunOpacity;
      _sunDiscColor.copy(_sunColor).lerp(_sunDiscLiftColor, 0.18);
      sunDiscMaterialRef.current.color.copy(_sunDiscColor);
    }
    if (sunHaloMaterialRef.current) {
      sunHaloMaterialRef.current.opacity = sunOpacity * 0.35;
      sunHaloMaterialRef.current.color.copy(_sunColor);
    }
    if (moonDiscMaterialRef.current) {
      moonDiscMaterialRef.current.opacity = moonOpacity;
    }
    if (moonHaloMaterialRef.current) {
      moonHaloMaterialRef.current.opacity = moonOpacity * 0.32;
    }
    if (starMaterialRef.current) {
      starMaterialRef.current.opacity = starOpacity;
    }

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
    if (viewFillRef.current) {
      const playingFill = gameState.phase === 'playing' ? 1 : 0;
      const tierScale = performanceProfile.tier === 'low' ? 0.55 : performanceProfile.tier === 'balanced' ? 0.78 : 1;
      const dimensionBoost = gameState.dimension === 'nether' ? 1.22 : 1;
      viewFillRef.current.position.copy(camera.position);
      viewFillRef.current.color.copy(_fogColor).lerp(_sunColor, 0.38);
      viewFillRef.current.intensity = playingFill * tierScale * dimensionBoost * (0.12 + nightMix * 0.48);
      viewFillRef.current.distance = 18 + nightMix * 10;
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

      <group ref={celestialGroupRef} frustumCulled={false}>
        <points ref={starfieldRef} geometry={starGeometry} renderOrder={-960} frustumCulled={false}>
          <pointsMaterial
            ref={starMaterialRef}
            color={0xfff2c7}
            size={2.1}
            sizeAttenuation={false}
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            fog={false}
            toneMapped={false}
          />
        </points>
        <mesh ref={sunHaloRef} renderOrder={-950} frustumCulled={false}>
          <circleGeometry args={[SUN_HALO_RADIUS, 48]} />
          <meshBasicMaterial
            ref={sunHaloMaterialRef}
            color={0xffe0a0}
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            fog={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh ref={sunDiscRef} renderOrder={-949} frustumCulled={false}>
          <circleGeometry args={[SUN_DISC_RADIUS, 48]} />
          <meshBasicMaterial
            ref={sunDiscMaterialRef}
            color={0xfff0c0}
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            fog={false}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={moonHaloRef} renderOrder={-948} frustumCulled={false}>
          <circleGeometry args={[MOON_HALO_RADIUS, 40]} />
          <meshBasicMaterial
            ref={moonHaloMaterialRef}
            color={0x90b4ff}
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            fog={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh ref={moonDiscRef} renderOrder={-947} frustumCulled={false}>
          <circleGeometry args={[MOON_DISC_RADIUS, 40]} />
          <meshBasicMaterial
            ref={moonDiscMaterialRef}
            color={0xdce6ff}
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            fog={false}
            toneMapped={false}
          />
        </mesh>
      </group>

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

      {/* 暗い時間帯でも足元と前方の素材感を失わない、影を落とさない補助光 */}
      <pointLight
        ref={viewFillRef}
        intensity={0}
        distance={22}
        decay={2}
        castShadow={false}
      />
    </>
  );
}
