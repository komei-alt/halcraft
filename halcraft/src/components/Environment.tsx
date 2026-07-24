// 環境コンポーネント
// 昼夜サイクルに基づく空の色、太陽光、霧を管理
// バイオーム設定から環境色を取得

import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { BIOME_CONFIGS } from '../types/biomes';
import { useGraphicsRuntimeStore } from '../stores/useGraphicsRuntimeStore';
import { getPerformanceProfile } from '../utils/performance';
import { useSettingsStore, type AtmosphereQuality, type LightingQuality } from '../stores/useSettingsStore';

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
const _sunLightDirection = new THREE.Vector3();
const _moonLightDirection = new THREE.Vector3();
const _shadowAnchor = new THREE.Vector3();
const _hemiSkyColor = new THREE.Color();
const _hemiGroundColor = new THREE.Color();
const _viewFillColor = new THREE.Color();
const _viewFillDirection = new THREE.Vector3();
const _moonLightColor = new THREE.Color(0x9fb8ff);
const _nightGroundColor = new THREE.Color(0x101629);
const _ambientLightColor = new THREE.Color();
const _desertSkyBlue = new THREE.Color(0x147fc5);
const _desertHorizonGold = new THREE.Color(0xffbd72);
const _desertGroundColor = new THREE.Color(0x8a4b2f);
const _cloudDayColor = new THREE.Color(0xffd39b);
const _cloudNightColor = new THREE.Color(0x6f7698);

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
const SUN_HALO_RADIUS = 22;
const MOON_DISC_RADIUS = 10.5;
const MOON_HALO_RADIUS = 22;
const STAR_COUNT = 260;
const CLOUD_TEXTURE_WIDTH = 256;
const CLOUD_TEXTURE_HEIGHT = 128;

interface AtmosphereTuning {
  mode: 'none' | 'linear' | 'exponential';
  nearScale: number;
  farScale: number;
  targetTransmittance: number;
  ambientScale: number;
  sunScale: number;
  fillScale: number;
}

const ATMOSPHERE_TUNINGS: Record<AtmosphereQuality, AtmosphereTuning> = {
  off: {
    mode: 'none',
    nearScale: 1,
    farScale: 1,
    targetTransmittance: 1,
    ambientScale: 1,
    sunScale: 1,
    fillScale: 0.82,
  },
  simple: {
    mode: 'linear',
    nearScale: 1.2,
    farScale: 1.28,
    targetTransmittance: 0.5,
    ambientScale: 1,
    sunScale: 1,
    fillScale: 0.9,
  },
  standard: {
    mode: 'exponential',
    nearScale: 1,
    farScale: 1,
    targetTransmittance: 0.38,
    ambientScale: 1.03,
    sunScale: 0.98,
    fillScale: 1,
  },
  rich: {
    mode: 'exponential',
    nearScale: 0.86,
    farScale: 0.9,
    targetTransmittance: 0.26,
    ambientScale: 1.06,
    sunScale: 0.96,
    fillScale: 1.12,
  },
};

const LIGHTING_SCALE: Record<LightingQuality, { ambient: number; sun: number; fill: number; hemi: number }> = {
  simple: { ambient: 0.96, sun: 0.98, fill: 0.65, hemi: 0.9 },
  standard: { ambient: 1, sun: 1, fill: 1, hemi: 1 },
  rich: { ambient: 1.04, sun: 1.03, fill: 1.18, hemi: 1.1 },
};

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

function seededCloudUnit(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** 小さなテクスチャを一度だけ生成し、空シェーダーでは2回の参照だけで雲を描く */
function createCloudTexture(): THREE.Texture {
  if (typeof document === 'undefined') {
    const data = new Uint8Array([0, 0, 0, 255]);
    const fallback = new THREE.DataTexture(data, 1, 1);
    fallback.needsUpdate = true;
    return fallback;
  }

  const canvas = document.createElement('canvas');
  canvas.width = CLOUD_TEXTURE_WIDTH;
  canvas.height = CLOUD_TEXTURE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < 72; i++) {
      const x = seededCloudUnit(i, 1.7) * canvas.width;
      const y = 22 + seededCloudUnit(i, 3.1) * 78;
      const radiusX = 10 + seededCloudUnit(i, 4.9) * 30;
      const radiusY = 3.5 + seededCloudUnit(i, 6.3) * 10;
      const opacity = 0.1 + seededCloudUnit(i, 8.1) * 0.22;
      const drawOval = (drawX: number) => {
        ctx.save();
        ctx.translate(drawX, y);
        ctx.scale(radiusX, radiusY);
        const gradient = ctx.createRadialGradient(0, 0, 0.04, 0, 0, 1);
        gradient.addColorStop(0, `rgba(255,255,255,${opacity})`);
        gradient.addColorStop(0.52, `rgba(255,255,255,${opacity * 0.62})`);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };

      drawOval(x);
      if (x < radiusX) drawOval(x + canvas.width);
      if (x > canvas.width - radiusX) drawOval(x - canvas.width);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

interface BlockCloudInstance {
  position: THREE.Vector3;
  scale: THREE.Vector3;
}

/** 参考画のマイクラらしい角張った雲を、1 draw call のインスタンスで組み立てる。 */
function createBlockCloudInstances(clusterCount: number): BlockCloudInstance[] {
  const instances: BlockCloudInstance[] = [];
  for (let cluster = 0; cluster < clusterCount; cluster++) {
    // 方位を均等配分し、どの視線方向でも雲の密度が偏らないようにする。
    const angle = ((cluster + 0.5) / clusterCount) * Math.PI * 2
      + (seededCloudUnit(cluster, 10.7) - 0.5) * 0.32;
    // カメラ直上を巨大な箱で覆わず、遠景に小さな雲列として読める距離へ置く。
    const radius = 122 + seededCloudUnit(cluster, 11.9) * 118;
    const centerX = Math.cos(angle) * radius;
    const centerZ = Math.sin(angle) * radius;
    const centerY = 66 + seededCloudUnit(cluster, 13.1) * 36;
    const width = 8 + seededCloudUnit(cluster, 14.3) * 12;
    const depth = 3 + seededCloudUnit(cluster, 15.7) * 5;
    const pieces = 2 + Math.floor(seededCloudUnit(cluster, 17.1) * 3);

    for (let piece = 0; piece < pieces; piece++) {
      const centered = piece - (pieces - 1) * 0.5;
      const pieceWidth = width * (piece === 0 ? 1 : 0.58 + seededCloudUnit(cluster + piece, 18.7) * 0.24);
      instances.push({
        position: new THREE.Vector3(
          centerX + centered * width * 0.56,
          centerY + (piece % 2) * 1.25,
          centerZ + (seededCloudUnit(cluster + piece, 20.3) - 0.5) * depth * 0.9,
        ),
        scale: new THREE.Vector3(pieceWidth, 1.8 + seededCloudUnit(cluster + piece, 21.9) * 1.4, depth),
      });
    }
  }
  return instances;
}

function BlockCloudLayer() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const { camera } = useThree();
  const atmosphereQuality = useSettingsStore((state) => state.atmosphereQuality);
  const graphicsPressure = useGraphicsRuntimeStore((state) => state.pressure);
  const profile = getPerformanceProfile();
  const clusterCount = profile.tier === 'low' ? 6 : profile.tier === 'balanced' ? 12 : 18;
  const instances = useMemo(() => createBlockCloudInstances(clusterCount), [clusterCount]);

  useEffect(() => {
    if (!meshRef.current) return;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    for (let index = 0; index < instances.length; index++) {
      const instance = instances[index];
      matrix.compose(instance.position, rotation, instance.scale);
      meshRef.current.setMatrixAt(index, matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [instances]);

  useFrame(() => {
    if (!meshRef.current || !materialRef.current) return;
    const gameState = useGameStore.getState();
    const nightMix = getNightMix(gameState.gameTime, gameState.dimension);
    const pressureOpacity = graphicsPressure === 0 ? 1 : graphicsPressure === 1 ? 0.74 : 0.42;
    meshRef.current.position.set(
      Math.round(camera.position.x / 64) * 64,
      0,
      Math.round(camera.position.z / 64) * 64,
    );
    meshRef.current.visible = gameState.dimension === 'overworld' && atmosphereQuality !== 'off';
    materialRef.current.opacity = (0.8 - nightMix * 0.38) * pressureOpacity;
    materialRef.current.color.copy(_cloudDayColor).lerp(_cloudNightColor, nightMix * 0.7);
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, instances.length]}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
      renderOrder={-900}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        color={0xffc987}
        transparent
        opacity={0.8}
        depthWrite
        fog={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
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
  uniform float uTime;
  uniform float uCloudOpacity;
  uniform sampler2D uCloudMap;

  varying vec3 vDirection;

  void main() {
    vec3 direction = normalize(vDirection);
    float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
    // 青と地平線色が広範囲で灰色に混ざらないよう、遷移帯を低く狭く保つ。
    float skyBlend = smoothstep(0.30, 0.64, height);
    vec3 sky = mix(uHorizonColor, uTopColor, skyBlend);

    float horizonGlow = exp(-abs(direction.y) * 4.0) * 0.08;
    float sunDot = max(dot(direction, normalize(uSunDirection)), 0.0);
    float sunHalo = pow(sunDot, 22.0);
    float sunCore = pow(sunDot, 420.0);
    float zenithLift = smoothstep(0.62, 1.0, height) * 0.08;

    sky += uSunColor * (horizonGlow + sunHalo * 0.1 + sunCore * 0.25);
    sky += uTopColor * zenithLift;

    // 低解像度の雲マスクを二層だけ参照し、重いボリューム計算なしで奥行きを作る
    vec2 skyUv = vec2(
      atan(direction.z, direction.x) * 0.15915494 + 0.5,
      asin(clamp(direction.y, -1.0, 1.0)) * 0.31830989 + 0.5
    );
    float cloudLow = texture2D(
      uCloudMap,
      vec2(skyUv.x * 1.14 + uTime * 0.0014, skyUv.y * 1.32)
    ).r;
    float cloudHigh = texture2D(
      uCloudMap,
      vec2(skyUv.x * 2.27 - uTime * 0.0021, skyUv.y * 2.46 + 0.13)
    ).r;
    float cloudField = cloudLow * 0.74 + cloudHigh * 0.34;
    float cloudBand = smoothstep(-0.04, 0.16, direction.y)
                    * (1.0 - smoothstep(0.72, 0.96, direction.y));
    float cloudMask = smoothstep(0.24, 0.62, cloudField)
                    * cloudBand
                    * uCloudOpacity;
    vec3 cloudShade = mix(uHorizonColor * 0.82, vec3(1.0), 0.58 - uNightMix * 0.28);
    float silverLining = pow(sunDot, 8.0) * cloudMask * (1.0 - uNightMix) * 0.72;
    sky = mix(sky, cloudShade, cloudMask);
    sky += uSunColor * silverLining;
    sky = mix(sky, sky * 0.58 + vec3(0.014, 0.024, 0.055), uNightMix * 0.38);

    gl_FragColor = vec4(sky, 1.0);
  }
`;

interface SkyUniforms extends Record<string, THREE.IUniform<THREE.Color | THREE.Vector3 | THREE.Texture | number>> {
  uTopColor: THREE.IUniform<THREE.Color>;
  uHorizonColor: THREE.IUniform<THREE.Color>;
  uSunColor: THREE.IUniform<THREE.Color>;
  uSunDirection: THREE.IUniform<THREE.Vector3>;
  uNightMix: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
  uCloudOpacity: THREE.IUniform<number>;
  uCloudMap: THREE.IUniform<THREE.Texture>;
}

function ensureSceneBackground(scene: THREE.Scene): THREE.Color {
  if (!(scene.background instanceof THREE.Color)) {
    scene.background = new THREE.Color(0x87ceeb);
  }
  return scene.background;
}

function ensureLinearFog(scene: THREE.Scene): THREE.Fog {
  // FogExp2 は Fog を継承しないため、種類が違うときは作り直す
  if (!(scene.fog instanceof THREE.Fog)) {
    scene.fog = new THREE.Fog(0x87ceeb, cachedFogNear, cachedFogFar);
  }
  return scene.fog;
}

function ensureExponentialFog(scene: THREE.Scene): THREE.FogExp2 {
  if (!(scene.fog instanceof THREE.FogExp2)) {
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.0025);
  }
  return scene.fog;
}

function getAtmosphereTuning(quality: AtmosphereQuality): AtmosphereTuning {
  return ATMOSPHERE_TUNINGS[quality];
}

function getAtmosphericDensity(fogFar: number, targetTransmittance: number): number {
  const safeFar = Math.max(80, Number.isFinite(fogFar) ? fogFar : 250);
  const safeTransmittance = THREE.MathUtils.clamp(targetTransmittance, 0.08, 0.92);
  const density = Math.sqrt(-Math.log(safeTransmittance)) / safeFar;
  // density が過大だと画面全体が霧色（水色）で塗りつぶされて操作不能に見える
  return THREE.MathUtils.clamp(density, 0.0002, 0.012);
}

function applySceneAtmosphere(
  scene: THREE.Scene,
  quality: AtmosphereQuality,
  fogColor: THREE.Color,
  dimension: string,
): AtmosphereTuning {
  const base = getAtmosphereTuning(quality);
  const netherMultiplier = dimension === 'nether' ? 1.45 : 1;

  if (base.mode === 'none') {
    scene.fog = null;
    return base;
  }

  const nearBase = Number.isFinite(cachedFogNear) ? cachedFogNear : 100;
  const farBase = Number.isFinite(cachedFogFar) ? cachedFogFar : 250;
  const fogNear = Math.max(18, nearBase * base.nearScale);
  const fogFar = Math.max(fogNear + 32, farBase * base.farScale);

  if (base.mode === 'linear') {
    const fog = ensureLinearFog(scene);
    fog.color.copy(fogColor);
    fog.near = fogNear;
    // near >= far や NaN で視界が霧一色になるのを防ぐ
    fog.far = Math.max(fogNear + 24, fogFar);
    return base;
  }

  const fog = ensureExponentialFog(scene);
  fog.color.copy(fogColor);
  fog.density = getAtmosphericDensity(fogFar, base.targetTransmittance) * netherMultiplier;
  return base;
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
  // 夕方の青空と黄金色の直射光を長く保ち、日没直前から夜へ移行する。
  if (gameTime < 0.49) return 0;
  if (gameTime < 0.57) return (gameTime - 0.49) / 0.08;
  return 1;
}

function createSkyUniforms(cloudTexture: THREE.Texture): SkyUniforms {
  return {
    uTopColor: { value: new THREE.Color(0x87ceeb) },
    uHorizonColor: { value: new THREE.Color(0xd8f1ff) },
    uSunColor: { value: new THREE.Color(0xfff5e0) },
    uSunDirection: { value: new THREE.Vector3(0.4, 0.8, 0.2).normalize() },
    uNightMix: { value: 0 },
    uTime: { value: 0 },
    uCloudOpacity: { value: 0.35 },
    uCloudMap: { value: cloudTexture },
  };
}

export function Environment() {
  const { camera, gl, scene } = useThree();
  const skyRef = useRef<THREE.Mesh>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const moonLightRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const viewFillRef = useRef<THREE.DirectionalLight>(null);
  const lastShadowUpdateRef = useRef(0);
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
  const cloudTexture = useMemo(() => createCloudTexture(), []);
  const skyUniforms = useMemo(() => createSkyUniforms(cloudTexture), [cloudTexture]);
  const starGeometry = useMemo(() => createStarGeometry(), []);
  const lightTarget = useMemo(() => new THREE.Object3D(), []);
  const viewFillTarget = useMemo(() => new THREE.Object3D(), []);
  const atmosphereQuality = useSettingsStore((s) => s.atmosphereQuality);
  const lightingQuality = useSettingsStore((s) => s.lightingQuality);
  const graphicsPressure = useGraphicsRuntimeStore((s) => s.pressure);
  useSettingsStore((s) => s.shadowQuality);
  const performanceProfile = getPerformanceProfile();

  const advanceTime = useGameStore((s) => s.advanceTime);

  // scene の初期設定（マウント時に一度だけ実行）
  // scene は R3F が管理する外部オブジェクトであり、副作用として初期化する必要がある
  useEffect(() => {
    ensureSceneBackground(scene);
  }, [scene]);

  useEffect(() => () => {
    cloudTexture.dispose();
    starGeometry.dispose();
  }, [cloudTexture, starGeometry]);

  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    const previousAutoUpdate = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = previousAutoUpdate;
      gl.shadowMap.needsUpdate = true;
    };
  }, [gl]);
  /* eslint-enable react-hooks/immutability */

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
    const sceneBackground = ensureSceneBackground(scene);

    // 時間帯に応じた環境を計算（再利用オブジェクトで0アロケーション）
    let sunIntensity: number;
    let ambientIntensity: number;

    if (gameTime < 0.05) {
      const t = gameTime / 0.05;
      _skyColor.copy(_nightSky).lerp(_sunsetSky, t);
      _fogColor.copy(_nightFog).lerp(_sunsetFog, t);
      sunIntensity = 0.14 + t * 0.96;
      ambientIntensity = 0.3 + t * 0.15;
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
    } else if (gameTime < 0.49) {
      const t = (gameTime - 0.4) / 0.09;
      _skyColor.copy(_daySky).lerp(_sunsetSky, t);
      _fogColor.copy(_dayFog).lerp(_sunsetFog, t);
      sunIntensity = 1.8 - t * 0.6;
      ambientIntensity = 0.6 - t * 0.12;
      _sunColor.copy(_daySun).lerp(_sunsetSun, t);
    } else if (gameTime < 0.57) {
      const t = (gameTime - 0.49) / 0.08;
      _skyColor.copy(_sunsetSky).lerp(_nightSky, t);
      _fogColor.copy(_sunsetFog).lerp(_nightFog, t);
      sunIntensity = 1.2 - t * 1.06;
      ambientIntensity = 0.48 - t * 0.18;
      _sunColor.copy(_sunsetSun).lerp(_nightSun, t);
    } else {
      _skyColor.copy(_nightSky);
      _fogColor.copy(_nightFog);
      sunIntensity = 0.14;
      ambientIntensity = 0.3;
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
    const isCinematicDesert = gameState.dimension === 'overworld' && biomeId === 'desert';
    const atmosphereTuning = applySceneAtmosphere(scene, atmosphereQuality, _fogColor, gameState.dimension);
    const lightingScale = LIGHTING_SCALE[lightingQuality];
    ambientIntensity *= stageAmbientBoost;
    sunIntensity *= THREE.MathUtils.lerp(1, stageAmbientBoost, 0.35);
    ambientIntensity *= atmosphereTuning.ambientScale * lightingScale.ambient;
    sunIntensity *= atmosphereTuning.sunScale * lightingScale.sun;
    if (isCinematicDesert) {
      // 白い全方向光を抑え、青い影と強い夕日の色分離を作る。
      ambientIntensity *= 0.38;
      sunIntensity *= 1.38;
    }

    // 天体の向きは時間に連動し、実際の影ライトはカメラ周辺へ追従させる。
    const sunAngle = gameTime * Math.PI * 2;
    // 砂漠ではランドマーク右側の抜けへ夕日を導き、ピラミッドの輪郭と長い影を両立する。
    _skySunDirection.set(
      Math.cos(sunAngle),
      Math.sin(sunAngle) + (isCinematicDesert ? 0.08 : 0),
      0.38,
    ).normalize();

    const shadowMapSize = Math.max(1, performanceProfile.shadowMapSize);
    const shadowWorldSize = Math.max(1, performanceProfile.shadowCameraSize * 2);
    const shadowTexelSize = shadowWorldSize / shadowMapSize;
    _shadowAnchor.set(
      Math.round(camera.position.x / shadowTexelSize) * shadowTexelSize,
      camera.position.y - 4,
      Math.round(camera.position.z / shadowTexelSize) * shadowTexelSize,
    );
    lightTarget.position.copy(_shadowAnchor);
    _sunLightDirection.copy(_skySunDirection);
    _sunLightDirection.y = Math.max(0.18, _sunLightDirection.y);
    _sunLightDirection.normalize();
    _sunPosition.copy(_shadowAnchor).addScaledVector(_sunLightDirection, 92);
    _moonLightDirection.copy(_skySunDirection).multiplyScalar(-1);
    _moonLightDirection.y = Math.max(0.2, _moonLightDirection.y);
    _moonLightDirection.normalize();

    // シーンに適用
    sceneBackground.copy(_skyColor);

    // 空ドームはカメラに追従させ、背景に立体的なグラデーションと太陽光を重ねる
    if (skyRef.current) {
      skyRef.current.position.copy(camera.position);
    }
    // ACESトーンマッピング後も青空と暖色の地平線が分離して見える輝度に抑える。
    const nightMix = getNightMix(gameTime, gameState.dimension);
    if (isCinematicDesert) {
      const daylight = 1 - nightMix;
      _skyTopColor.copy(_skyColor).lerp(_desertSkyBlue, 0.64 * daylight).multiplyScalar(0.98);
      _skyHorizonColor.copy(_fogColor).lerp(_desertHorizonGold, 0.28 * daylight).multiplyScalar(1.02);
    } else {
      _skyTopColor.copy(_skyColor).multiplyScalar(gameState.dimension === 'nether' ? 0.8 : 0.92);
      _skyHorizonColor.copy(_fogColor).multiplyScalar(gameState.dimension === 'nether' ? 1.05 : 1.02);
    }
    _skySunGlowColor.copy(_sunColor).multiplyScalar(gameState.dimension === 'nether' ? 0.65 : 0.95);
    skyUniforms.uTopColor.value.copy(_skyTopColor);
    skyUniforms.uHorizonColor.value.copy(_skyHorizonColor);
    skyUniforms.uSunColor.value.copy(_skySunGlowColor);
    skyUniforms.uSunDirection.value.copy(_skySunDirection);
    skyUniforms.uNightMix.value = nightMix;
    skyUniforms.uTime.value += delta;
    const cloudBase = atmosphereQuality === 'rich'
      ? 0.62
      : atmosphereQuality === 'standard'
        ? 0.46
        : atmosphereQuality === 'simple'
          ? 0.26
          : 0;
    const pressureScale = graphicsPressure === 0 ? 1 : graphicsPressure === 1 ? 0.72 : 0.42;
    skyUniforms.uCloudOpacity.value = cloudBase * pressureScale * (1 - nightMix * 0.38);

    const shadowUpdateInterval = graphicsPressure > 0
      ? 1 / 14
      : performanceProfile.tier === 'high'
        ? 1 / 24
        : 1 / 18;
    if (
      performanceProfile.shadowsEnabled
      && graphicsPressure < 2
      && skyUniforms.uTime.value - lastShadowUpdateRef.current >= shadowUpdateInterval
    ) {
      lastShadowUpdateRef.current = skyUniforms.uTime.value;
      gl.shadowMap.needsUpdate = true;
    }

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
      sunDiscRef.current.quaternion.copy(camera.quaternion);
    }
    if (sunHaloRef.current) {
      sunHaloRef.current.position.copy(_skySunDirection).multiplyScalar(CELESTIAL_RADIUS - 1);
      sunHaloRef.current.quaternion.copy(camera.quaternion);
    }
    if (moonDiscRef.current) {
      moonDiscRef.current.position.copy(_moonPosition);
      moonDiscRef.current.quaternion.copy(camera.quaternion);
    }
    if (moonHaloRef.current) {
      moonHaloRef.current.position.copy(_moonPosition).multiplyScalar(0.998);
      moonHaloRef.current.quaternion.copy(camera.quaternion);
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
      sunHaloMaterialRef.current.opacity = sunOpacity * 0.12;
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

    // ライト更新（影の範囲をプレイヤー周辺に固定し、遠方で影が切れるのを防ぐ）
    if (sunRef.current) {
      sunRef.current.position.copy(_sunPosition);
      sunRef.current.target.position.copy(camera.position);
      sunRef.current.target.updateMatrixWorld();
      sunRef.current.intensity = sunIntensity;
      sunRef.current.color.copy(_sunColor);
    }
    if (moonLightRef.current) {
      moonLightRef.current.position.copy(_shadowAnchor).addScaledVector(_moonLightDirection, 74);
      moonLightRef.current.intensity = gameState.dimension === 'nether'
        ? 0
        : nightMix * 0.52 * lightingScale.fill * stageAmbientBoost;
      moonLightRef.current.color.copy(_moonLightColor);
    }
    if (ambientRef.current) {
      ambientRef.current.intensity = ambientIntensity;
      _ambientLightColor.copy(_skyColor).lerp(_sunColor, isCinematicDesert ? 0.12 : 0.25);
      ambientRef.current.color.copy(_ambientLightColor);
    }
    if (hemiRef.current) {
      _hemiSkyColor.copy(_skyColor).lerp(_moonLightColor, nightMix * 0.62);
      if (isCinematicDesert) {
        _hemiGroundColor.copy(_desertGroundColor).lerp(_nightGroundColor, nightMix * 0.58);
      } else {
        _hemiGroundColor.copy(_fogColor).multiplyScalar(0.32).lerp(_nightGroundColor, nightMix * 0.58);
      }
      hemiRef.current.color.copy(_hemiSkyColor);
      hemiRef.current.groundColor.copy(_hemiGroundColor);
      hemiRef.current.intensity = Math.max(0.1, ambientIntensity * 0.82 * lightingScale.hemi);
    }
    if (viewFillRef.current) {
      const playingFill = gameState.phase === 'playing' ? 1 : 0;
      const tierScale = performanceProfile.tier === 'low' ? 0.55 : performanceProfile.tier === 'balanced' ? 0.78 : 1;
      const dimensionBoost = gameState.dimension === 'nether' ? 1.22 : 1;
      camera.getWorldDirection(_viewFillDirection);
      viewFillRef.current.position.copy(camera.position).addScaledVector(_viewFillDirection, -2);
      viewFillTarget.position.copy(camera.position).addScaledVector(_viewFillDirection, 18);
      _viewFillColor.copy(_fogColor).lerp(_sunColor, 0.28).lerp(_moonLightColor, nightMix * 0.72);
      viewFillRef.current.color.copy(_viewFillColor);
      viewFillRef.current.intensity = playingFill
        * tierScale
        * dimensionBoost
        * atmosphereTuning.fillScale
        * lightingScale.fill
        * (0.12 + nightMix * 0.56);
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

      <BlockCloudLayer />

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
            side={THREE.DoubleSide}
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
            side={THREE.DoubleSide}
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

      <primitive object={lightTarget} />
      <primitive object={viewFillTarget} />

      {/* 太陽光（影を落とす主光源） */}
      <directionalLight
        ref={sunRef}
        position={[50, 80, 30]}
        intensity={1.8}
        target={lightTarget}
        castShadow={performanceProfile.shadowsEnabled && graphicsPressure < 2}
        shadow-mapSize-width={performanceProfile.shadowMapSize}
        shadow-mapSize-height={performanceProfile.shadowMapSize}
        shadow-camera-far={performanceProfile.shadowCameraFar}
        shadow-camera-near={0.5}
        shadow-camera-left={-performanceProfile.shadowCameraSize}
        shadow-camera-right={performanceProfile.shadowCameraSize}
        shadow-camera-top={performanceProfile.shadowCameraSize}
        shadow-camera-bottom={-performanceProfile.shadowCameraSize}
        shadow-bias={-0.0002}
        shadow-normalBias={0.04}
        color={0xfff5e0}
      >
        {/* target をシーンに載せて、プレイヤー追従の影カメラを安定させる */}
        <object3D attach="target" />
      </directionalLight>

      {/* 夜の輪郭を起こす、影なしの月光。追加シャドウパスは発生させない。 */}
      <directionalLight
        ref={moonLightRef}
        target={lightTarget}
        intensity={0}
        color={0x9fb8ff}
        castShadow={false}
      />

      {/* 半球ライト（空の色→地面の色の2色で自然な環境光） */}
      <hemisphereLight
        ref={hemiRef}
        args={[0x87ceeb, 0x6b8e23, 0.4]}
      />

      {/* 暗い時間帯でも前方の素材感を失わない、カメラ追従・影なしの補助光 */}
      <directionalLight
        ref={viewFillRef}
        target={viewFillTarget}
        intensity={0}
        castShadow={false}
      />
    </>
  );
}
