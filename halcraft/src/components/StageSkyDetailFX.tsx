// マップごとの上空・中景に、雲や熱気などの大きな空気の層を足す軽量レイヤー

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import type { BiomeId, StageCategory } from '../types/stages';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';

type SkyDetailKind = 'leafCanopy' | 'tradeCloud' | 'auroraCloud' | 'heatHaze';

interface SkyDetailConfig {
  kind: SkyDetailKind;
  count: number;
  primaryColor: number;
  secondaryColor: number;
  opacity: number;
  radius: number;
  height: number;
  verticalSpread: number;
  minWidth: number;
  maxWidth: number;
  minLength: number;
  maxLength: number;
  driftSpeed: number;
  driftStrength: number;
  rotationSpeed: number;
  blending: THREE.Blending;
}

interface SkyDetailPanel {
  seed: number;
  tint: number;
  angle: number;
  radius: number;
  heightOffset: number;
  width: number;
  length: number;
  spin: number;
  wave: number;
}

const SKY_CONFIGS: Record<BiomeId, SkyDetailConfig> = {
  forest: {
    kind: 'leafCanopy',
    count: 18,
    primaryColor: 0xc7ff73,
    secondaryColor: 0x6edf76,
    opacity: 0.21,
    radius: 34,
    height: 12.5,
    verticalSpread: 4.8,
    minWidth: 7.5,
    maxWidth: 14,
    minLength: 1.4,
    maxLength: 3.2,
    driftSpeed: 0.12,
    driftStrength: 2.2,
    rotationSpeed: 0.08,
    blending: THREE.AdditiveBlending,
  },
  tropical: {
    kind: 'tradeCloud',
    count: 20,
    primaryColor: 0xf9fff1,
    secondaryColor: 0x8efff0,
    opacity: 0.3,
    radius: 42,
    height: 13.5,
    verticalSpread: 5.5,
    minWidth: 8,
    maxWidth: 17,
    minLength: 2.4,
    maxLength: 5.2,
    driftSpeed: 0.16,
    driftStrength: 3,
    rotationSpeed: 0.06,
    blending: THREE.NormalBlending,
  },
  snow: {
    kind: 'auroraCloud',
    count: 14,
    primaryColor: 0xc8fbff,
    secondaryColor: 0xd8a4ff,
    opacity: 0.2,
    radius: 38,
    height: 17.5,
    verticalSpread: 6.8,
    minWidth: 10,
    maxWidth: 19,
    minLength: 1.1,
    maxLength: 2.8,
    driftSpeed: 0.07,
    driftStrength: 4.4,
    rotationSpeed: 0.035,
    blending: THREE.AdditiveBlending,
  },
  desert: {
    kind: 'heatHaze',
    count: 22,
    primaryColor: 0xffd28a,
    secondaryColor: 0xff8f58,
    opacity: 0.17,
    radius: 36,
    height: 7.5,
    verticalSpread: 3.4,
    minWidth: 7,
    maxWidth: 16,
    minLength: 0.75,
    maxLength: 1.9,
    driftSpeed: 0.2,
    driftStrength: 4.8,
    rotationSpeed: 0.05,
    blending: THREE.NormalBlending,
  },
};

const LOW_TIER_SCALE = 0.48;
const BALANCED_TIER_SCALE = 0.72;
const TOUCH_SCALE = 0.55;
const WAR_COUNT_SCALE = 1.12;
const WAR_MOTION_SCALE = 1.28;

const sharedPanelGeometry = new THREE.PlaneGeometry(1, 1);
const _right = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _detailColor = new THREE.Color();

function seededUnit(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function getEffectiveCount(config: SkyDetailConfig, category: StageCategory | null): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? LOW_TIER_SCALE
    : profile.tier === 'balanced'
      ? BALANCED_TIER_SCALE
      : 1;
  const touchScale = isTouchDevice() ? TOUCH_SCALE : 1;
  const categoryScale = category === 'war' ? WAR_COUNT_SCALE : 1;
  return Math.max(8, Math.round(config.count * tierScale * touchScale * categoryScale));
}

function createSkyPanels(config: SkyDetailConfig, count: number): SkyDetailPanel[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = seededUnit(i, 1.1) * Math.PI * 2;
    return {
      seed: seededUnit(i, 2.2),
      tint: seededUnit(i, 3.3),
      angle,
      radius: config.radius * (0.42 + seededUnit(i, 4.4) * 0.72),
      heightOffset: (seededUnit(i, 5.5) - 0.5) * config.verticalSpread,
      width: THREE.MathUtils.lerp(config.minWidth, config.maxWidth, seededUnit(i, 6.6)),
      length: THREE.MathUtils.lerp(config.minLength, config.maxLength, seededUnit(i, 7.7)),
      spin: seededUnit(i, 8.8) * Math.PI * 2,
      wave: seededUnit(i, 9.9) * Math.PI * 2,
    };
  });
}

function getPanelOpacity(config: SkyDetailConfig, category: StageCategory | null, elapsed: number): number {
  const categoryBoost = category === 'war' ? 1.12 : 1;
  const pulse = config.kind === 'auroraCloud'
    ? 0.78 + Math.max(0, Math.sin(elapsed * 0.38)) * 0.32
    : config.kind === 'heatHaze'
      ? 0.74 + Math.max(0, Math.sin(elapsed * 0.7)) * 0.22
      : 0.88 + Math.sin(elapsed * 0.16) * 0.08;
  return config.opacity * categoryBoost * pulse;
}

function tunePanelMotion(
  config: SkyDetailConfig,
  panel: SkyDetailPanel,
  elapsed: number,
  category: StageCategory | null,
): { x: number; y: number; z: number; width: number; length: number; rotation: number } {
  const warMotion = category === 'war' ? WAR_MOTION_SCALE : 1;
  const orbit = panel.angle + elapsed * config.driftSpeed * 0.025 * warMotion;
  const wave = elapsed * config.driftSpeed * (0.7 + panel.seed * 0.8) + panel.wave;
  let x = Math.cos(orbit) * panel.radius;
  let z = Math.sin(orbit) * panel.radius;
  let y = config.height + panel.heightOffset;
  let width = panel.width;
  let length = panel.length;
  let rotation = panel.spin + elapsed * config.rotationSpeed * (0.4 + panel.seed);

  if (config.kind === 'leafCanopy') {
    x += Math.sin(wave * 1.2) * config.driftStrength;
    z += Math.cos(wave * 0.82) * config.driftStrength * 0.54;
    y += Math.sin(wave * 0.7) * 0.45;
    width *= 0.88 + Math.sin(wave * 0.52) * 0.08;
    rotation += Math.sin(wave * 0.62) * 0.16;
  } else if (config.kind === 'tradeCloud') {
    x += ((elapsed * config.driftSpeed + panel.seed * 13) % 1 - 0.5) * config.driftStrength * 2.2;
    z += Math.cos(wave * 0.52) * config.driftStrength * 0.5;
    y += Math.sin(wave * 0.4) * 0.35;
    width *= 0.92 + Math.sin(wave * 0.25) * 0.06;
    length *= 0.9 + Math.max(0, Math.sin(wave * 0.3)) * 0.12;
  } else if (config.kind === 'auroraCloud') {
    const lane = Math.sin(panel.angle * 2.0) * 3.5;
    x += lane + Math.sin(wave * 0.4) * config.driftStrength;
    z += Math.cos(wave * 0.32) * config.driftStrength * 0.64;
    y += Math.sin(wave * 0.36) * 0.9;
    width *= 0.88 + Math.max(0, Math.sin(wave * 0.25)) * 0.2;
    length *= 0.82 + Math.max(0, Math.sin(wave * 0.33 + panel.seed)) * 0.18;
    rotation = Math.sin(wave * 0.22) * 0.16;
  } else {
    const sweep = ((elapsed * config.driftSpeed + panel.seed * 9) % 1 - 0.5) * config.driftStrength * 3.8;
    x += sweep;
    z += Math.cos(wave * 0.44) * config.driftStrength;
    y += Math.sin(wave * 0.82) * 0.36;
    width *= 0.9 + Math.sin(wave * 0.55) * 0.14;
    length *= 0.82 + Math.abs(Math.cos(wave * 0.74)) * 0.32;
    rotation = Math.sin(wave * 0.5) * 0.1;
  }

  return { x, y, z, width, length, rotation };
}

/** 画面の上側と中景に、マップ固有の大きな空気感を重ねる */
export function StageSkyDetailFX() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const phase = useGameStore((s) => s.phase);
  const biomeId = useGameStore((s) => s.currentStage?.biome ?? null);
  const category = useGameStore((s) => s.currentStage?.category ?? null);
  const { camera } = useThree();
  const config = biomeId ? SKY_CONFIGS[biomeId] : null;

  const panels = useMemo(() => {
    if (!config) return [];
    return createSkyPanels(config, getEffectiveCount(config, category));
  }, [category, config]);

  const primaryColor = useMemo(() => new THREE.Color(config?.primaryColor ?? 0xffffff), [config?.primaryColor]);
  const secondaryColor = useMemo(() => new THREE.Color(config?.secondaryColor ?? 0xffffff), [config?.secondaryColor]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < panels.length; i++) {
      _detailColor.copy(primaryColor).lerp(secondaryColor, panels[i].tint);
      mesh.setColorAt(i, _detailColor);
    }

    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [panels, primaryColor, secondaryColor]);

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current || !config || phase !== 'playing') return;

    const elapsed = clock.getElapsedTime();
    const mesh = meshRef.current;
    const dummy = dummyRef.current;

    camera.getWorldDirection(_forward);
    _forward.y *= 0.12;
    if (_forward.lengthSq() < 0.001) {
      _forward.set(0, 0, -1);
    } else {
      _forward.normalize();
    }
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);

    materialRef.current.opacity = getPanelOpacity(config, category, elapsed);

    for (let i = 0; i < panels.length; i++) {
      const transform = tunePanelMotion(config, panels[i], elapsed, category);
      dummy.position
        .copy(camera.position)
        .addScaledVector(_right, transform.x)
        .addScaledVector(_forward, transform.z);
      dummy.position.y += transform.y;
      dummy.quaternion.copy(camera.quaternion);
      dummy.rotateZ(transform.rotation);
      dummy.scale.set(transform.width, transform.length, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!config || phase !== 'playing') return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedPanelGeometry, undefined, panels.length]}
      frustumCulled={false}
      renderOrder={-6}
    >
      <meshBasicMaterial
        ref={materialRef}
        vertexColors
        transparent
        opacity={config.opacity}
        depthTest={false}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
        blending={config.blending}
      />
    </instancedMesh>
  );
}
