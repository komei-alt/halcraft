// 地表近くに、マップごとの小さな質感を足す軽量グラフィックレイヤー

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import type { BiomeId } from '../types/stages';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';
import { getTerrainHeight } from '../utils/terrain/heightmap';

type SurfaceDetailKind = 'grass' | 'glint' | 'snowShard' | 'sandPebble';

interface SurfaceDetailConfig {
  kind: SurfaceDetailKind;
  count: number;
  primaryColor: number;
  secondaryColor: number;
  opacity: number;
  radius: number;
  yOffset: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  windSpeed: number;
  sway: number;
  fadeStart: number;
  fadeEnd: number;
}

interface SurfaceDetail {
  localX: number;
  localZ: number;
  width: number;
  height: number;
  rotation: number;
  wave: number;
  tint: number;
}

const CONFIGS: Record<BiomeId, SurfaceDetailConfig> = {
  forest: {
    kind: 'grass',
    count: 86,
    primaryColor: 0x5ee35f,
    secondaryColor: 0xd4ff75,
    opacity: 0.48,
    radius: 24,
    yOffset: 0.045,
    minWidth: 0.07,
    maxWidth: 0.16,
    minHeight: 0.36,
    maxHeight: 0.86,
    windSpeed: 1.05,
    sway: 0.18,
    fadeStart: 8,
    fadeEnd: 18,
  },
  tropical: {
    kind: 'glint',
    count: 72,
    primaryColor: 0x72fff2,
    secondaryColor: 0xffee9b,
    opacity: 0.42,
    radius: 25,
    yOffset: 0.085,
    minWidth: 0.07,
    maxWidth: 0.2,
    minHeight: 0.08,
    maxHeight: 0.24,
    windSpeed: 1.36,
    sway: 0.28,
    fadeStart: 9,
    fadeEnd: 20,
  },
  snow: {
    kind: 'snowShard',
    count: 78,
    primaryColor: 0xf8fdff,
    secondaryColor: 0x9fcfff,
    opacity: 0.54,
    radius: 23,
    yOffset: 0.06,
    minWidth: 0.05,
    maxWidth: 0.13,
    minHeight: 0.12,
    maxHeight: 0.34,
    windSpeed: 0.62,
    sway: 0.12,
    fadeStart: 8,
    fadeEnd: 18,
  },
  desert: {
    kind: 'sandPebble',
    count: 76,
    primaryColor: 0xf3c36d,
    secondaryColor: 0xff8f56,
    opacity: 0.38,
    radius: 25,
    yOffset: 0.04,
    minWidth: 0.08,
    maxWidth: 0.24,
    minHeight: 0.025,
    maxHeight: 0.07,
    windSpeed: 0.74,
    sway: 0.22,
    fadeStart: 10,
    fadeEnd: 22,
  },
};

const LOW_TIER_SCALE = 0.48;
const BALANCED_TIER_SCALE = 0.72;
const TOUCH_SCALE = 0.58;
const _detailColor = new THREE.Color();

function createTaperedPlaneGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      -0.5, 0, 0,
      0.5, 0, 0,
      0.16, 1, 0,
      -0.16, 1, 0,
    ], 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

const sharedSurfaceGeometry = createTaperedPlaneGeometry();

function seededUnit(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function getEffectiveCount(config: SurfaceDetailConfig): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? LOW_TIER_SCALE
    : profile.tier === 'balanced'
      ? BALANCED_TIER_SCALE
      : 1;
  const touchScale = isTouchDevice() ? TOUCH_SCALE : 1;
  return Math.max(20, Math.round(config.count * tierScale * touchScale));
}

function createSurfaceDetails(config: SurfaceDetailConfig, count: number): SurfaceDetail[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = seededUnit(i, 1.3) * Math.PI * 2;
    const distance = Math.sqrt(seededUnit(i, 2.9)) * config.radius;
    const widthT = seededUnit(i, 4.1);
    const heightT = seededUnit(i, 5.7);
    return {
      localX: Math.cos(angle) * distance,
      localZ: Math.sin(angle) * distance,
      width: THREE.MathUtils.lerp(config.minWidth, config.maxWidth, widthT),
      height: THREE.MathUtils.lerp(config.minHeight, config.maxHeight, heightT),
      rotation: seededUnit(i, 7.4) * Math.PI * 2,
      wave: seededUnit(i, 9.2) * Math.PI * 2,
      tint: seededUnit(i, 11.6),
    };
  });
}

function getHeightFade(cameraY: number, groundY: number, config: SurfaceDetailConfig): number {
  const overGround = Math.max(0, cameraY - groundY);
  return 1 - THREE.MathUtils.smoothstep(overGround, config.fadeStart, config.fadeEnd);
}

function setDetailTransform(
  dummy: THREE.Object3D,
  detail: SurfaceDetail,
  config: SurfaceDetailConfig,
  camera: THREE.Camera,
  elapsed: number,
): void {
  const cellSize = config.radius * 1.25;
  const anchorX = Math.floor(camera.position.x / cellSize) * cellSize;
  const anchorZ = Math.floor(camera.position.z / cellSize) * cellSize;
  const wind = elapsed * config.windSpeed + detail.wave;
  const x = anchorX + detail.localX + Math.sin(wind * 0.7) * config.sway;
  const z = anchorZ + detail.localZ + Math.cos(wind * 0.54) * config.sway;
  const groundY = getTerrainHeight(x, z) + config.yOffset;
  const distanceFromCamera = Math.hypot(x - camera.position.x, z - camera.position.z);
  const radiusFade = 1 - THREE.MathUtils.smoothstep(distanceFromCamera, config.radius * 0.78, config.radius);
  const heightFade = getHeightFade(camera.position.y, groundY, config);
  const visibleScale = Math.max(0.001, radiusFade * heightFade);

  dummy.position.set(x, groundY, z);

  if (config.kind === 'sandPebble') {
    const shimmer = 0.8 + Math.max(0, Math.sin(wind * 1.45)) * 0.24;
    dummy.rotation.set(-Math.PI / 2, 0, detail.rotation + Math.sin(wind * 0.28) * 0.08);
    dummy.scale.set(detail.width * shimmer * visibleScale, detail.height * visibleScale, 1);
    return;
  }

  if (config.kind === 'glint') {
    dummy.quaternion.copy(camera.quaternion);
    dummy.rotateZ(detail.rotation + elapsed * (0.5 + detail.tint));
    dummy.scale.set(detail.width * (0.8 + Math.max(0, Math.sin(wind * 2.2)) * 0.62) * visibleScale, detail.height * visibleScale, 1);
    return;
  }

  const swayX = Math.sin(wind) * config.sway;
  const swayZ = Math.cos(wind * 0.72) * config.sway * 0.42;
  dummy.rotation.set(swayX, detail.rotation, swayZ);
  dummy.scale.set(detail.width * visibleScale, detail.height * visibleScale, 1);
}

/** プレイ中の足元に、地形テーマに合う小さな質感を重ねる */
export function StageSurfaceDetailFX() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const phase = useGameStore((s) => s.phase);
  const biomeId = useGameStore((s) => s.currentStage?.biome ?? null);
  const { camera } = useThree();

  const config = biomeId ? CONFIGS[biomeId] : null;
  const details = useMemo(() => {
    if (!config) return [];
    return createSurfaceDetails(config, getEffectiveCount(config));
  }, [config]);
  const primaryColor = useMemo(() => new THREE.Color(config?.primaryColor ?? 0xffffff), [config?.primaryColor]);
  const secondaryColor = useMemo(() => new THREE.Color(config?.secondaryColor ?? 0xffffff), [config?.secondaryColor]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < details.length; i++) {
      _detailColor.copy(primaryColor).lerp(secondaryColor, details[i].tint);
      mesh.setColorAt(i, _detailColor);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [details, primaryColor, secondaryColor]);

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current || !config || phase !== 'playing') return;
    const elapsed = clock.getElapsedTime();
    const mesh = meshRef.current;
    const dummy = dummyRef.current;
    const cameraGroundY = getTerrainHeight(camera.position.x, camera.position.z) + config.yOffset;
    const heightFade = getHeightFade(camera.position.y, cameraGroundY, config);
    const pulse = config.kind === 'glint' || config.kind === 'snowShard'
      ? 0.86 + Math.max(0, Math.sin(elapsed * 1.3)) * 0.16
      : 1;

    materialRef.current.opacity = config.opacity * heightFade * pulse;
    for (let i = 0; i < details.length; i++) {
      setDetailTransform(dummy, details[i], config, camera, elapsed);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    // 初回行列反映前の原点フラッシュを防ぐ
    mesh.visible = true;
  });

  if (!config || phase !== 'playing') return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedSurfaceGeometry, undefined, details.length]}
      frustumCulled={false}
      renderOrder={config.kind === 'glint' ? 5 : 0}
      visible={false}
    >
      <meshBasicMaterial
        ref={materialRef}
        vertexColors
        transparent
        opacity={config.opacity}
        depthWrite={false}
        depthTest
        side={THREE.DoubleSide}
        toneMapped={false}
        blending={config.kind === 'sandPebble' ? THREE.NormalBlending : THREE.AdditiveBlending}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
    </instancedMesh>
  );
}
