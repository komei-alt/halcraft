// カメラ周辺の地表に、マップ固有の手描き風景物を軽量に配置する

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import type { BiomeId, StageCategory } from '../types/stages';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';
import { getTerrainHeight } from '../utils/terrain/heightmap';

type ScenicPropKind = 'forestSprout' | 'tropicalPalm' | 'snowCrystal' | 'desertCactus';

interface ScenicPropConfig {
  kind: ScenicPropKind;
  count: number;
  radius: number;
  yOffset: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  opacity: number;
  fadeStart: number;
  fadeEnd: number;
  sway: number;
  driftSpeed: number;
  renderOrder: number;
}

interface ScenicProp {
  localX: number;
  localZ: number;
  width: number;
  height: number;
  roll: number;
  wave: number;
  seed: number;
  viewLocked: boolean;
}

const CONFIGS: Record<BiomeId, ScenicPropConfig> = {
  forest: {
    kind: 'forestSprout',
    count: 42,
    radius: 28,
    yOffset: 0.035,
    minWidth: 0.7,
    maxWidth: 1.55,
    minHeight: 0.85,
    maxHeight: 1.9,
    opacity: 0.78,
    fadeStart: 9,
    fadeEnd: 24,
    sway: 0.1,
    driftSpeed: 0.86,
    renderOrder: 4,
  },
  tropical: {
    kind: 'tropicalPalm',
    count: 34,
    radius: 30,
    yOffset: 0.055,
    minWidth: 0.9,
    maxWidth: 1.9,
    minHeight: 0.95,
    maxHeight: 2.2,
    opacity: 0.74,
    fadeStart: 10,
    fadeEnd: 26,
    sway: 0.16,
    driftSpeed: 1.08,
    renderOrder: 4,
  },
  snow: {
    kind: 'snowCrystal',
    count: 36,
    radius: 27,
    yOffset: 0.045,
    minWidth: 0.56,
    maxWidth: 1.28,
    minHeight: 0.72,
    maxHeight: 1.72,
    opacity: 0.7,
    fadeStart: 9,
    fadeEnd: 23,
    sway: 0.06,
    driftSpeed: 0.48,
    renderOrder: 4,
  },
  desert: {
    kind: 'desertCactus',
    count: 38,
    radius: 31,
    yOffset: 0.035,
    minWidth: 0.62,
    maxWidth: 1.42,
    minHeight: 0.82,
    maxHeight: 2.05,
    opacity: 0.76,
    fadeStart: 11,
    fadeEnd: 28,
    sway: 0.08,
    driftSpeed: 0.7,
    renderOrder: 4,
  },
};

const LOW_TIER_SCALE = 0.44;
const BALANCED_TIER_SCALE = 0.68;
const TOUCH_SCALE = 0.54;
const WAR_DARKEN_SCALE = 0.84;
const BUILD_LIGHT_SCALE = 1.05;
const TEXTURE_SIZE = 256;
const sharedPropGeometry = new THREE.PlaneGeometry(1, 1);
const _propColor = new THREE.Color(0xffffff);
const _cameraForward = new THREE.Vector3();
const _cameraRight = new THREE.Vector3();

function seededUnit(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function getEffectiveCount(config: ScenicPropConfig, category: StageCategory | null): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? LOW_TIER_SCALE
    : profile.tier === 'balanced'
      ? BALANCED_TIER_SCALE
      : 1;
  const touchScale = isTouchDevice() ? TOUCH_SCALE : 1;
  const categoryScale = category === 'war' ? 1.08 : 1;
  return Math.max(12, Math.round(config.count * tierScale * touchScale * categoryScale));
}

function createProps(config: ScenicPropConfig, count: number): ScenicProp[] {
  const heroCount = Math.min(8, Math.max(3, Math.floor(count * 0.22)));
  return Array.from({ length: count }, (_, i) => {
    const viewLocked = i < heroCount;
    const row = Math.floor(i / 4);
    const side = ((i % 4) - 1.5) * (3.4 + seededUnit(i, 1.1) * 1.2);
    const forward = 5.8 + row * 3.8 + seededUnit(i, 1.4) * 2.2;
    const angle = seededUnit(i, 1.7) * Math.PI * 2;
    const distance = Math.sqrt(seededUnit(i, 2.8)) * config.radius;
    return {
      localX: viewLocked ? side : Math.cos(angle) * distance,
      localZ: viewLocked ? forward : Math.sin(angle) * distance,
      width: THREE.MathUtils.lerp(config.minWidth, config.maxWidth, seededUnit(i, 4.2)) * (viewLocked ? 1.05 : 1),
      height: THREE.MathUtils.lerp(config.minHeight, config.maxHeight, seededUnit(i, 5.9)) * (viewLocked ? 1.08 : 1),
      roll: (seededUnit(i, 7.3) - 0.5) * 0.28,
      wave: seededUnit(i, 8.8) * Math.PI * 2,
      seed: seededUnit(i, 10.4),
      viewLocked,
    };
  });
}

function colorToRgba(hex: number, alpha: number): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  fill: string,
  stroke: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -height * 0.52);
  ctx.bezierCurveTo(width * 0.58, -height * 0.22, width * 0.5, height * 0.4, 0, height * 0.52);
  ctx.bezierCurveTo(-width * 0.5, height * 0.4, -width * 0.58, -height * 0.22, 0, -height * 0.52);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = colorToRgba(0xffffc7, 0.28);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -height * 0.38);
  ctx.lineTo(0, height * 0.36);
  ctx.stroke();
  ctx.restore();
}

function drawForestSprout(ctx: CanvasRenderingContext2D, isWar: boolean): void {
  const stem = isWar ? 0x3f5d28 : 0x4f8d32;
  const leaf = isWar ? 0x79c944 : 0x8cff58;
  const leafDark = isWar ? 0x2d5d35 : 0x2f8844;
  const flower = isWar ? 0xffb064 : 0xfff174;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colorToRgba(stem, 0.72);
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(126, 218);
  ctx.quadraticCurveTo(118, 164, 132, 104);
  ctx.stroke();

  for (let i = 0; i < 9; i++) {
    const angle = -1.15 + i * 0.29;
    const x = 124 + Math.cos(angle) * (24 + seededUnit(i, 12.8) * 30);
    const y = 136 + Math.sin(angle) * (18 + seededUnit(i, 13.2) * 28);
    drawLeaf(
      ctx,
      x,
      y,
      26 + seededUnit(i, 14.4) * 18,
      52 + seededUnit(i, 15.6) * 26,
      angle + (i % 2 === 0 ? -0.48 : 0.52),
      colorToRgba(leaf, 0.74),
      colorToRgba(leafDark, 0.5),
    );
  }

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const x = 76 + seededUnit(i, 20.3) * 104;
    const y = 76 + seededUnit(i, 21.9) * 78;
    ctx.fillStyle = colorToRgba(flower, 0.48 + seededUnit(i, 22.1) * 0.28);
    ctx.beginPath();
    ctx.arc(x, y, 4 + seededUnit(i, 23.4) * 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTropicalPalm(ctx: CanvasRenderingContext2D, isWar: boolean): void {
  const trunk = isWar ? 0x7c5a35 : 0xa8753a;
  const frond = isWar ? 0x38b48a : 0x45f2b0;
  const frondLight = isWar ? 0xffd072 : 0xffef9d;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colorToRgba(trunk, 0.76);
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(122, 222);
  ctx.quadraticCurveTo(132, 168, 114, 98);
  ctx.stroke();

  ctx.strokeStyle = colorToRgba(0x5f3f27, 0.38);
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const y = 202 - i * 19;
    ctx.beginPath();
    ctx.moveTo(114, y);
    ctx.lineTo(133, y - 8);
    ctx.stroke();
  }

  for (let i = 0; i < 9; i++) {
    const angle = -2.72 + i * 0.64;
    const length = 56 + seededUnit(i, 30.4) * 34;
    ctx.strokeStyle = colorToRgba(i % 3 === 0 ? frondLight : frond, 0.62);
    ctx.lineWidth = 8 - (i % 2) * 2;
    ctx.beginPath();
    ctx.moveTo(114, 98);
    ctx.quadraticCurveTo(
      114 + Math.cos(angle) * length * 0.45,
      98 + Math.sin(angle) * length * 0.18,
      114 + Math.cos(angle) * length,
      98 + Math.sin(angle) * length * 0.72,
    );
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = colorToRgba(0x9fffee, isWar ? 0.24 : 0.36);
  ctx.beginPath();
  ctx.ellipse(152, 213, 28, 9, -0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colorToRgba(0xffefb2, 0.46);
  ctx.beginPath();
  ctx.arc(92, 218, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnowCrystal(ctx: CanvasRenderingContext2D, isWar: boolean): void {
  const ice = isWar ? 0xbcecff : 0xe8fbff;
  const blue = isWar ? 0x84b8ff : 0xa6e4ff;
  const aurora = isWar ? 0xd0a5ff : 0x8cffdf;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < 5; i++) {
    const x = 80 + i * 24 + seededUnit(i, 42.6) * 13;
    const top = 56 + seededUnit(i, 43.7) * 42;
    const bottom = 218 - seededUnit(i, 44.8) * 20;
    const width = 12 + seededUnit(i, 45.9) * 18;
    const gradient = ctx.createLinearGradient(x, top, x, bottom);
    gradient.addColorStop(0, colorToRgba(ice, 0.68));
    gradient.addColorStop(0.55, colorToRgba(blue, 0.42));
    gradient.addColorStop(1, colorToRgba(ice, 0.08));
    ctx.fillStyle = gradient;
    ctx.strokeStyle = colorToRgba(0xffffff, 0.46);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + width, bottom - 12);
    ctx.lineTo(x, bottom);
    ctx.lineTo(x - width * 0.72, bottom - 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.strokeStyle = colorToRgba(aurora, 0.36);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(42, 108);
  ctx.quadraticCurveTo(94, 82, 128, 116);
  ctx.quadraticCurveTo(164, 152, 216, 108);
  ctx.stroke();

  ctx.fillStyle = colorToRgba(0xffffff, 0.4);
  for (let i = 0; i < 11; i++) {
    const x = 48 + seededUnit(i, 50.1) * 160;
    const y = 64 + seededUnit(i, 51.4) * 136;
    ctx.beginPath();
    ctx.arc(x, y, 2 + seededUnit(i, 52.7) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawDesertCactus(ctx: CanvasRenderingContext2D, isWar: boolean): void {
  const cactus = isWar ? 0x6c7a3d : 0x7aaa46;
  const cactusLight = isWar ? 0xb89554 : 0xd5bb63;
  const sand = isWar ? 0xd58a4a : 0xffcf79;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colorToRgba(cactus, 0.8);
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.moveTo(126, 220);
  ctx.lineTo(126, 86);
  ctx.stroke();

  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(126, 146);
  ctx.quadraticCurveTo(82, 144, 88, 102);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(128, 170);
  ctx.quadraticCurveTo(178, 166, 174, 122);
  ctx.stroke();

  ctx.strokeStyle = colorToRgba(cactusLight, 0.5);
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const x = 112 + i * 7;
    ctx.beginPath();
    ctx.moveTo(x, 98);
    ctx.lineTo(x + 2, 210);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = colorToRgba(sand, 0.42);
  ctx.lineWidth = 5;
  for (let i = 0; i < 5; i++) {
    const y = 207 + i * 6;
    ctx.beginPath();
    ctx.moveTo(54 + i * 4, y);
    ctx.quadraticCurveTo(116, y - 12, 206 - i * 7, y);
    ctx.stroke();
  }

  ctx.fillStyle = colorToRgba(0xffeeaf, isWar ? 0.28 : 0.4);
  for (let i = 0; i < 7; i++) {
    const x = 68 + seededUnit(i, 60.2) * 122;
    const y = 190 + seededUnit(i, 61.8) * 34;
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + seededUnit(i, 62.4) * 8, 2 + seededUnit(i, 63.9) * 4, seededUnit(i, 64.5) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function createScenicTexture(kind: ScenicPropKind, category: StageCategory | null): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const isWar = category === 'war';
  ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  ctx.shadowColor = isWar ? 'rgba(255,128,70,0.18)' : 'rgba(255,255,210,0.18)';
  ctx.shadowBlur = isWar ? 5 : 7;

  if (kind === 'forestSprout') {
    drawForestSprout(ctx, isWar);
  } else if (kind === 'tropicalPalm') {
    drawTropicalPalm(ctx, isWar);
  } else if (kind === 'snowCrystal') {
    drawSnowCrystal(ctx, isWar);
  } else {
    drawDesertCactus(ctx, isWar);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function getHeightFade(cameraY: number, groundY: number, config: ScenicPropConfig): number {
  const overGround = Math.max(0, cameraY - groundY);
  return 1 - THREE.MathUtils.smoothstep(overGround, config.fadeStart, config.fadeEnd);
}

function setPropTransform(
  dummy: THREE.Object3D,
  prop: ScenicProp,
  config: ScenicPropConfig,
  camera: THREE.Camera,
  elapsed: number,
): number {
  const cellSize = config.radius * 1.34;
  const anchorX = Math.floor(camera.position.x / cellSize) * cellSize;
  const anchorZ = Math.floor(camera.position.z / cellSize) * cellSize;
  const wave = elapsed * config.driftSpeed * (0.55 + prop.seed * 0.8) + prop.wave;
  let x: number;
  let z: number;

  if (prop.viewLocked) {
    camera.getWorldDirection(_cameraForward);
    _cameraForward.y = 0;
    if (_cameraForward.lengthSq() < 0.001) {
      _cameraForward.set(0, 0, -1);
    } else {
      _cameraForward.normalize();
    }
    _cameraRight.set(_cameraForward.z, 0, -_cameraForward.x).normalize();
    x = camera.position.x
      + _cameraRight.x * prop.localX
      + _cameraForward.x * prop.localZ
      + Math.sin(wave * 0.52) * config.sway;
    z = camera.position.z
      + _cameraRight.z * prop.localX
      + _cameraForward.z * prop.localZ
      + Math.cos(wave * 0.45) * config.sway;
  } else {
    x = anchorX + prop.localX + Math.sin(wave * 0.52) * config.sway;
    z = anchorZ + prop.localZ + Math.cos(wave * 0.45) * config.sway;
  }

  const groundY = getTerrainHeight(x, z) + config.yOffset;
  const distance = Math.hypot(x - camera.position.x, z - camera.position.z);
  const radiusFade = 1 - THREE.MathUtils.smoothstep(distance, config.radius * 0.62, config.radius);
  const heightFade = getHeightFade(camera.position.y, groundY, config);
  const viewScale = prop.viewLocked ? 0.98 : 1;
  const visibleScale = Math.max(0.001, radiusFade * heightFade * viewScale);
  const swayScale = 1 + Math.sin(wave) * 0.025;
  const yaw = Math.atan2(camera.position.x - x, camera.position.z - z);

  dummy.position.set(x, groundY + (prop.height * visibleScale) * 0.5, z);
  dummy.rotation.set(0, yaw, 0);
  dummy.rotateZ(prop.roll + Math.sin(wave * 0.7) * 0.025);
  dummy.scale.set(prop.width * visibleScale, prop.height * visibleScale * swayScale, 1);
  return heightFade;
}

function getModeOpacityScale(category: StageCategory | null): number {
  if (category === 'war') return WAR_DARKEN_SCALE;
  if (category === 'build') return BUILD_LIGHT_SCALE;
  return 1;
}

/** 地形テーマそのものを3D空間に置く、手描き景物の近景レイヤー */
export function StageScenicPropFX() {
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

  const props = useMemo(() => {
    if (!config) return [];
    return createProps(config, getEffectiveCount(config, category));
  }, [category, config]);
  const texture = useMemo(() => (
    config ? createScenicTexture(config.kind, category) : null
  ), [category, config]);

  useEffect(() => () => {
    texture?.dispose();
  }, [texture]);

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;

    _propColor.set(category === 'war' ? 0xffd8bd : 0xffffff);
    material.color.copy(_propColor);
  }, [category]);

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current || !config || phase !== 'playing') return;

    const elapsed = clock.getElapsedTime();
    const mesh = meshRef.current;
    const dummy = dummyRef.current;
    const groundY = getTerrainHeight(camera.position.x, camera.position.z) + config.yOffset;
    const heightFade = getHeightFade(camera.position.y, groundY, config);
    const pulse = config.kind === 'snowCrystal'
      ? 0.88 + Math.max(0, Math.sin(elapsed * 0.7)) * 0.14
      : config.kind === 'tropicalPalm'
        ? 0.92 + Math.sin(elapsed * 0.42) * 0.05
        : 0.96 + Math.sin(elapsed * 0.28) * 0.04;

    materialRef.current.opacity = config.opacity * getModeOpacityScale(category) * heightFade * pulse;
    for (let i = 0; i < props.length; i++) {
      setPropTransform(dummy, props[i], config, camera, elapsed);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!config || !texture || phase !== 'playing') return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedPropGeometry, undefined, props.length]}
      frustumCulled={false}
      renderOrder={config.renderOrder}
    >
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        transparent
        opacity={config.opacity}
        alphaTest={0.035}
        depthWrite={false}
        depthTest={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
