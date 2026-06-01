// 地表にマップ固有の光と影のゆらぎを重ね、足元の景色を平坦に見せない軽量レイヤー

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import type { BiomeId, StageCategory } from '../types/stages';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';
import { getTerrainHeight } from '../utils/terrain/heightmap';

type GroundLightKind = 'leafDapple' | 'lagoonCaustic' | 'snowGlimmer' | 'heatRipple';

interface GroundLightConfig {
  kind: GroundLightKind;
  count: number;
  primaryColor: number;
  secondaryColor: number;
  opacity: number;
  radius: number;
  yOffset: number;
  minWidth: number;
  maxWidth: number;
  minLength: number;
  maxLength: number;
  speed: number;
  driftStrength: number;
  fadeStart: number;
  fadeEnd: number;
  blending: THREE.Blending;
}

interface GroundLightPatch {
  localX: number;
  localZ: number;
  width: number;
  length: number;
  rotation: number;
  wave: number;
  seed: number;
  tint: number;
}

const CONFIGS: Record<BiomeId, GroundLightConfig> = {
  forest: {
    kind: 'leafDapple',
    count: 64,
    primaryColor: 0x17371d,
    secondaryColor: 0xfff0a8,
    opacity: 0.18,
    radius: 32,
    yOffset: 0.055,
    minWidth: 1.2,
    maxWidth: 3.8,
    minLength: 0.42,
    maxLength: 1.35,
    speed: 0.34,
    driftStrength: 0.42,
    fadeStart: 16,
    fadeEnd: 38,
    blending: THREE.NormalBlending,
  },
  tropical: {
    kind: 'lagoonCaustic',
    count: 56,
    primaryColor: 0x7fffee,
    secondaryColor: 0xfff1aa,
    opacity: 0.16,
    radius: 34,
    yOffset: 0.075,
    minWidth: 1.5,
    maxWidth: 4.4,
    minLength: 0.12,
    maxLength: 0.36,
    speed: 0.72,
    driftStrength: 0.6,
    fadeStart: 18,
    fadeEnd: 42,
    blending: THREE.AdditiveBlending,
  },
  snow: {
    kind: 'snowGlimmer',
    count: 58,
    primaryColor: 0xf8ffff,
    secondaryColor: 0xa8d6ff,
    opacity: 0.13,
    radius: 31,
    yOffset: 0.066,
    minWidth: 1.1,
    maxWidth: 3.6,
    minLength: 0.08,
    maxLength: 0.28,
    speed: 0.38,
    driftStrength: 0.26,
    fadeStart: 16,
    fadeEnd: 40,
    blending: THREE.AdditiveBlending,
  },
  desert: {
    kind: 'heatRipple',
    count: 62,
    primaryColor: 0xffc56d,
    secondaryColor: 0x8a4e2a,
    opacity: 0.14,
    radius: 35,
    yOffset: 0.052,
    minWidth: 1.8,
    maxWidth: 5.6,
    minLength: 0.11,
    maxLength: 0.32,
    speed: 0.82,
    driftStrength: 0.86,
    fadeStart: 20,
    fadeEnd: 46,
    blending: THREE.NormalBlending,
  },
};

const TEXTURE_SIZE = 192;
const LOW_TIER_SCALE = 0.46;
const BALANCED_TIER_SCALE = 0.72;
const TOUCH_SCALE = 0.56;
const WAR_OPACITY_SCALE = 1.18;
const BUILD_OPACITY_SCALE = 0.92;
const sharedGroundGeometry = new THREE.PlaneGeometry(1, 1);
const _patchColor = new THREE.Color();

function seededUnit(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function getEffectiveCount(config: GroundLightConfig, category: StageCategory | null): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? LOW_TIER_SCALE
    : profile.tier === 'balanced'
      ? BALANCED_TIER_SCALE
      : 1;
  const touchScale = isTouchDevice() ? TOUCH_SCALE : 1;
  const categoryScale = category === 'war' ? 1.1 : 1;
  return Math.max(18, Math.round(config.count * tierScale * touchScale * categoryScale));
}

function createPatches(config: GroundLightConfig, count: number): GroundLightPatch[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = seededUnit(i, 1.7) * Math.PI * 2;
    const distance = Math.sqrt(seededUnit(i, 2.8)) * config.radius;
    return {
      localX: Math.cos(angle) * distance,
      localZ: Math.sin(angle) * distance,
      width: THREE.MathUtils.lerp(config.minWidth, config.maxWidth, seededUnit(i, 4.3)),
      length: THREE.MathUtils.lerp(config.minLength, config.maxLength, seededUnit(i, 5.9)),
      rotation: seededUnit(i, 7.1) * Math.PI * 2,
      wave: seededUnit(i, 8.4) * Math.PI * 2,
      seed: seededUnit(i, 9.6),
      tint: seededUnit(i, 11.2),
    };
  });
}

function drawSoftOval(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  rotation: number,
  intensity: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(radiusX, radiusY);
  const gradient = ctx.createRadialGradient(0, 0, 0.02, 0, 0, 1);
  gradient.addColorStop(0, `rgba(255,255,255,${0.9 * intensity})`);
  gradient.addColorStop(0.46, `rgba(255,255,255,${0.48 * intensity})`);
  gradient.addColorStop(0.84, `rgba(255,255,255,${0.12 * intensity})`);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSoftStroke(
  ctx: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  width: number,
  intensity: number,
): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = `rgba(255,255,255,${intensity})`;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nextX, nextY] = points[i + 1];
    ctx.quadraticCurveTo(x, y, (x + nextX) * 0.5, (y + nextY) * 0.5);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last[0], last[1]);
  ctx.stroke();
  ctx.restore();
}

function drawLeafDapple(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < 28; i++) {
    const x = 32 + seededUnit(i, 2.1) * 128;
    const y = 34 + seededUnit(i, 3.4) * 124;
    const width = 8 + seededUnit(i, 4.7) * 22;
    const height = 3 + seededUnit(i, 5.8) * 10;
    drawSoftOval(ctx, x, y, width, height, seededUnit(i, 6.9) * Math.PI, 0.36 + seededUnit(i, 7.2) * 0.34);
  }
  drawSoftStroke(ctx, [[22, 128], [58, 86], [100, 116], [146, 62], [174, 94]], 12, 0.16);
}

function drawLagoonCaustic(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < 9; i++) {
    const y = 34 + i * 15 + seededUnit(i, 12.4) * 5;
    drawSoftStroke(ctx, [
      [18, y],
      [48, y + 10 * Math.sin(i)],
      [88, y - 7],
      [132, y + 6],
      [174, y - 3],
    ], 5 + seededUnit(i, 13.8) * 5, 0.2 + seededUnit(i, 14.1) * 0.26);
  }
  drawSoftOval(ctx, 98, 96, 70, 22, -0.14, 0.24);
}

function drawSnowGlimmer(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < 16; i++) {
    const x = 24 + seededUnit(i, 20.5) * 144;
    const y = 32 + seededUnit(i, 21.7) * 128;
    drawSoftStroke(ctx, [[x - 24, y], [x, y - 8], [x + 26, y + 3]], 4 + seededUnit(i, 22.1) * 4, 0.18 + seededUnit(i, 22.9) * 0.22);
    drawSoftOval(ctx, x, y, 16 + seededUnit(i, 23.4) * 18, 4 + seededUnit(i, 24.8) * 6, seededUnit(i, 25.6) * Math.PI, 0.18);
  }
}

function drawHeatRipple(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < 12; i++) {
    const y = 28 + i * 12 + seededUnit(i, 30.2) * 7;
    const offset = seededUnit(i, 31.4) * 18;
    drawSoftStroke(ctx, [
      [14, y + offset * 0.08],
      [54, y - 8],
      [96, y + 7],
      [138, y - 5],
      [180, y + offset * 0.12],
    ], 7 + seededUnit(i, 32.5) * 8, 0.11 + seededUnit(i, 33.7) * 0.18);
  }
  drawSoftOval(ctx, 96, 104, 78, 26, 0.06, 0.16);
}

function createGroundAlphaTexture(kind: GroundLightKind): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  ctx.globalCompositeOperation = 'lighter';
  if (kind === 'leafDapple') {
    drawLeafDapple(ctx);
  } else if (kind === 'lagoonCaustic') {
    drawLagoonCaustic(ctx);
  } else if (kind === 'snowGlimmer') {
    drawSnowGlimmer(ctx);
  } else {
    drawHeatRipple(ctx);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function getHeightFade(cameraY: number, groundY: number, config: GroundLightConfig): number {
  const overGround = Math.max(0, cameraY - groundY);
  return 1 - THREE.MathUtils.smoothstep(overGround, config.fadeStart, config.fadeEnd);
}

function setPatchTransform(
  dummy: THREE.Object3D,
  patch: GroundLightPatch,
  config: GroundLightConfig,
  camera: THREE.Camera,
  elapsed: number,
): number {
  const cellSize = config.radius * 1.42;
  const anchorX = Math.floor(camera.position.x / cellSize) * cellSize;
  const anchorZ = Math.floor(camera.position.z / cellSize) * cellSize;
  const wave = elapsed * config.speed * (0.72 + patch.seed * 0.74) + patch.wave;
  let x = anchorX + patch.localX;
  let z = anchorZ + patch.localZ;
  let width = patch.width;
  let length = patch.length;
  let rotation = patch.rotation;

  if (config.kind === 'leafDapple') {
    x += Math.sin(wave * 0.8) * config.driftStrength;
    z += Math.cos(wave * 0.54) * config.driftStrength * 0.58;
    width *= 0.9 + Math.sin(wave * 0.7) * 0.09;
    rotation += Math.sin(wave * 0.36) * 0.18;
  } else if (config.kind === 'lagoonCaustic') {
    const shimmer = Math.max(0, Math.sin(wave * 1.6));
    x += Math.sin(wave * 0.9) * config.driftStrength;
    z += Math.cos(wave * 0.76) * config.driftStrength;
    width *= 0.78 + shimmer * 0.44;
    length *= 0.82 + shimmer * 0.36;
    rotation += Math.sin(wave * 0.58) * 0.28;
  } else if (config.kind === 'snowGlimmer') {
    const glint = Math.max(0, Math.sin(wave * 1.2 + patch.seed));
    x += Math.sin(wave * 0.38) * config.driftStrength;
    width *= 0.86 + glint * 0.28;
    length *= 0.78 + glint * 0.32;
    rotation += Math.sin(wave * 0.24) * 0.12;
  } else {
    const sweep = ((elapsed * config.speed + patch.seed * 9.0) % 1 - 0.5) * config.driftStrength * 2.8;
    x += sweep + Math.sin(wave * 0.8) * config.driftStrength;
    z += Math.cos(wave * 0.44) * config.driftStrength;
    width *= 0.92 + Math.sin(wave) * 0.14;
    length *= 0.8 + Math.abs(Math.cos(wave * 0.7)) * 0.38;
    rotation += Math.sin(wave * 0.4) * 0.1;
  }

  const groundY = getTerrainHeight(x, z) + config.yOffset;
  const distance = Math.hypot(x - camera.position.x, z - camera.position.z);
  const radiusFade = 1 - THREE.MathUtils.smoothstep(distance, config.radius * 0.68, config.radius);
  const heightFade = getHeightFade(camera.position.y, groundY, config);
  const visibleScale = Math.max(0.001, radiusFade * heightFade);

  dummy.position.set(x, groundY, z);
  dummy.rotation.set(-Math.PI / 2, 0, rotation);
  dummy.scale.set(width * visibleScale, length * visibleScale, 1);
  return visibleScale;
}

function getModeOpacityScale(category: StageCategory | null): number {
  if (category === 'war') return WAR_OPACITY_SCALE;
  if (category === 'build') return BUILD_OPACITY_SCALE;
  return 1;
}

/** 足元に、森の葉かげ・南国の水面反射・雪のきらめき・砂漠の熱ゆらぎを出す */
export function StageGroundLightFX() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const phase = useGameStore((s) => s.phase);
  const biomeId = useGameStore((s) => s.currentStage?.biome ?? null);
  const category = useGameStore((s) => s.currentStage?.category ?? null);
  useSettingsStore((s) => s.graphicsPreset);
  useSettingsStore((s) => s.resolutionScale);
  const { camera } = useThree();

  const config = biomeId ? CONFIGS[biomeId] : null;
  const patches = useMemo(() => {
    if (!config) return [];
    return createPatches(config, getEffectiveCount(config, category));
  }, [category, config]);
  const primaryColor = useMemo(() => new THREE.Color(config?.primaryColor ?? 0xffffff), [config?.primaryColor]);
  const secondaryColor = useMemo(() => new THREE.Color(config?.secondaryColor ?? 0xffffff), [config?.secondaryColor]);
  const alphaTexture = useMemo(() => (
    config ? createGroundAlphaTexture(config.kind) : null
  ), [config]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < patches.length; i++) {
      const mix = config?.kind === 'leafDapple'
        ? Math.pow(patches[i].tint, 1.7) * 0.45
        : patches[i].tint;
      _patchColor.copy(primaryColor).lerp(secondaryColor, mix);
      mesh.setColorAt(i, _patchColor);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [config?.kind, patches, primaryColor, secondaryColor]);

  useEffect(() => () => {
    alphaTexture?.dispose();
  }, [alphaTexture]);

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current || !config || phase !== 'playing') return;

    const elapsed = clock.getElapsedTime();
    const mesh = meshRef.current;
    const dummy = dummyRef.current;
    const modeScale = getModeOpacityScale(category);
    const pulse = config.kind === 'leafDapple'
      ? 0.88 + Math.sin(elapsed * 0.32) * 0.08
      : config.kind === 'heatRipple'
        ? 0.78 + Math.max(0, Math.sin(elapsed * 0.9)) * 0.22
        : 0.8 + Math.max(0, Math.sin(elapsed * 0.72)) * 0.18;

    materialRef.current.opacity = config.opacity * modeScale * pulse;
    for (let i = 0; i < patches.length; i++) {
      setPatchTransform(dummy, patches[i], config, camera, elapsed);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!config || phase !== 'playing' || !alphaTexture) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedGroundGeometry, undefined, patches.length]}
      frustumCulled={false}
      renderOrder={1}
    >
      <meshBasicMaterial
        ref={materialRef}
        vertexColors
        transparent
        opacity={config.opacity}
        alphaMap={alphaTexture}
        depthWrite={false}
        depthTest
        side={THREE.DoubleSide}
        toneMapped={false}
        blending={config.blending}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </instancedMesh>
  );
}
