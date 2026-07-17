// ステージごとの大きな光の層を重ね、画面全体の絵作りを引き締める軽量演出

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import type { BiomeId, StageCategory } from '../types/stages';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';

type CinematicLightKind = 'godray' | 'caustic' | 'aurora' | 'mirage';

interface CinematicLightingConfig {
  kind: CinematicLightKind;
  count: number;
  primaryColor: number;
  secondaryColor: number;
  warColor: number;
  opacity: number;
  distanceMin: number;
  distanceMax: number;
  sideSpread: number;
  heightMin: number;
  heightMax: number;
  widthMin: number;
  widthMax: number;
  heightScaleMin: number;
  heightScaleMax: number;
  driftSpeed: number;
  driftStrength: number;
  rotationBias: number;
  blending: THREE.Blending;
}

interface CinematicLightPanel {
  seed: number;
  tint: number;
  depth: number;
  side: number;
  height: number;
  width: number;
  heightScale: number;
  spin: number;
  wave: number;
}

const CONFIGS: Record<BiomeId, CinematicLightingConfig> = {
  forest: {
    kind: 'godray',
    count: 8,
    primaryColor: 0xfff4a8,
    secondaryColor: 0x8eff8f,
    warColor: 0xffd96a,
    opacity: 0.075,
    distanceMin: 18,
    distanceMax: 38,
    sideSpread: 23,
    heightMin: 7.5,
    heightMax: 19,
    widthMin: 1.6,
    widthMax: 3.6,
    heightScaleMin: 12,
    heightScaleMax: 24,
    driftSpeed: 0.08,
    driftStrength: 2.4,
    rotationBias: -0.34,
    blending: THREE.AdditiveBlending,
  },
  tropical: {
    kind: 'caustic',
    count: 13,
    primaryColor: 0xa8fff3,
    secondaryColor: 0xfff1a6,
    warColor: 0xffe58c,
    opacity: 0.18,
    distanceMin: 9,
    distanceMax: 27,
    sideSpread: 17,
    heightMin: -0.7,
    heightMax: 4.6,
    widthMin: 4.2,
    widthMax: 10.5,
    heightScaleMin: 0.7,
    heightScaleMax: 2.2,
    driftSpeed: 0.15,
    driftStrength: 3.2,
    rotationBias: 0.08,
    blending: THREE.AdditiveBlending,
  },
  snow: {
    kind: 'aurora',
    count: 8,
    primaryColor: 0x8dfff0,
    secondaryColor: 0xdcb2ff,
    warColor: 0xb7c4ff,
    opacity: 0.15,
    distanceMin: 18,
    distanceMax: 40,
    sideSpread: 21,
    heightMin: 11,
    heightMax: 23,
    widthMin: 10,
    widthMax: 23,
    heightScaleMin: 1.2,
    heightScaleMax: 3.8,
    driftSpeed: 0.055,
    driftStrength: 4.8,
    rotationBias: 0.02,
    blending: THREE.AdditiveBlending,
  },
  desert: {
    kind: 'mirage',
    count: 14,
    primaryColor: 0xffd285,
    secondaryColor: 0xff9360,
    warColor: 0xff7b42,
    opacity: 0.17,
    distanceMin: 10,
    distanceMax: 31,
    sideSpread: 22,
    heightMin: -0.25,
    heightMax: 3.2,
    widthMin: 5,
    widthMax: 13,
    heightScaleMin: 0.42,
    heightScaleMax: 1.35,
    driftSpeed: 0.2,
    driftStrength: 5.5,
    rotationBias: -0.04,
    blending: THREE.NormalBlending,
  },
};

const LOW_TIER_SCALE = 0.36;
const BALANCED_TIER_SCALE = 0.68;
const TOUCH_SCALE = 0.5;
const QUALITY_SCALE = 1.16;
const WAR_COUNT_SCALE = 1.12;
const WAR_OPACITY_SCALE = 1.06;
const TEXTURE_SIZE = 256;

const sharedPanelGeometry = new THREE.PlaneGeometry(1, 1);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _origin = new THREE.Vector3();
const _panelColor = new THREE.Color();
const _primaryColor = new THREE.Color();
const _secondaryColor = new THREE.Color();

function seededUnit(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function getQualityScale(isQuality: boolean): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? LOW_TIER_SCALE
    : profile.tier === 'balanced'
      ? BALANCED_TIER_SCALE
      : 1;
  const touchScale = isTouchDevice() ? TOUCH_SCALE : 1;
  return tierScale * touchScale * (isQuality ? QUALITY_SCALE : 1);
}

function getEffectiveCount(config: CinematicLightingConfig, category: StageCategory, isQuality: boolean): number {
  const categoryScale = category === 'war' ? WAR_COUNT_SCALE : 1;
  return Math.max(4, Math.round(config.count * getQualityScale(isQuality) * categoryScale));
}

function createPanels(config: CinematicLightingConfig, count: number): CinematicLightPanel[] {
  return Array.from({ length: count }, (_, i) => ({
    seed: seededUnit(i, 1.2),
    tint: seededUnit(i, 2.4),
    depth: THREE.MathUtils.lerp(config.distanceMin, config.distanceMax, seededUnit(i, 3.6)),
    side: config.kind === 'godray'
      ? (seededUnit(i, 4.8) < 0.5 ? -1 : 1) * config.sideSpread * (0.34 + seededUnit(i, 5.4) * 0.66)
      : (seededUnit(i, 4.8) - 0.5) * config.sideSpread * 2,
    height: THREE.MathUtils.lerp(config.heightMin, config.heightMax, seededUnit(i, 6.0)),
    width: THREE.MathUtils.lerp(config.widthMin, config.widthMax, seededUnit(i, 7.2)),
    heightScale: THREE.MathUtils.lerp(config.heightScaleMin, config.heightScaleMax, seededUnit(i, 8.4)),
    spin: (seededUnit(i, 9.6) - 0.5) * 0.58,
    wave: seededUnit(i, 10.8) * Math.PI * 2,
  }));
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
  const gradient = ctx.createRadialGradient(0, 0, 0.03, 0, 0, 1);
  gradient.addColorStop(0, `rgba(255,255,255,${0.92 * intensity})`);
  gradient.addColorStop(0.46, `rgba(255,255,255,${0.42 * intensity})`);
  gradient.addColorStop(0.82, `rgba(255,255,255,${0.12 * intensity})`);
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

function drawGodrayMask(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createLinearGradient(112, 0, 146, TEXTURE_SIZE);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.82)');
  gradient.addColorStop(0.64, 'rgba(255,255,255,0.28)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(92, 0);
  ctx.bezierCurveTo(134, 44, 156, 150, 190, TEXTURE_SIZE);
  ctx.lineTo(92, TEXTURE_SIZE);
  ctx.bezierCurveTo(106, 150, 68, 48, 92, 0);
  ctx.fill();
  drawSoftStroke(ctx, [[98, 0], [126, 64], [116, 142], [144, 256]], 32, 0.12);
}

function drawCausticMask(ctx: CanvasRenderingContext2D): void {
  drawSoftOval(ctx, 128, 128, 104, 32, -0.08, 0.35);
  for (let i = 0; i < 7; i++) {
    const y = 82 + i * 16 + (seededUnit(i, 20.4) - 0.5) * 10;
    drawSoftStroke(
      ctx,
      [
        [22, y],
        [64, y - 10 + seededUnit(i, 21.2) * 20],
        [118, y + 12 - seededUnit(i, 22.6) * 20],
        [178, y - 8 + seededUnit(i, 23.4) * 18],
        [232, y + 2],
      ],
      6 + seededUnit(i, 24.8) * 5,
      0.2 + seededUnit(i, 25.2) * 0.22,
    );
  }
}

function drawAuroraMask(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createLinearGradient(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.24, 'rgba(255,255,255,0.36)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.74)');
  gradient.addColorStop(0.76, 'rgba(255,255,255,0.24)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  drawSoftStroke(ctx, [[8, 166], [42, 72], [92, 152], [144, 58], [214, 132], [248, 86]], 22, 0.34);
  drawSoftStroke(ctx, [[0, 94], [54, 122], [96, 84], [154, 126], [206, 76], [256, 116]], 13, 0.22);
  drawSoftOval(ctx, 142, 124, 92, 18, -0.2, 0.2);
}

function drawMirageMask(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < 9; i++) {
    const y = 74 + i * 13 + (seededUnit(i, 30.1) - 0.5) * 11;
    drawSoftStroke(
      ctx,
      [
        [12, y],
        [54, y + Math.sin(i * 1.7) * 18],
        [106, y - Math.cos(i * 0.9) * 14],
        [160, y + Math.sin(i * 1.2) * 16],
        [244, y + Math.cos(i) * 10],
      ],
      7 + seededUnit(i, 30.8) * 7,
      0.13 + seededUnit(i, 31.5) * 0.18,
    );
  }
  drawSoftOval(ctx, 128, 146, 116, 24, 0.05, 0.18);
}

function createLightTexture(kind: CinematicLightKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgb(0,0,0)';
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    if (kind === 'godray') drawGodrayMask(ctx);
    if (kind === 'caustic') drawCausticMask(ctx);
    if (kind === 'aurora') drawAuroraMask(ctx);
    if (kind === 'mirage') drawMirageMask(ctx);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function setPanelTransform(
  dummy: THREE.Object3D,
  panel: CinematicLightPanel,
  config: CinematicLightingConfig,
  camera: THREE.Camera,
  elapsed: number,
  category: StageCategory,
): void {
  camera.getWorldDirection(_forward);
  if (_forward.lengthSq() < 0.001) {
    _forward.set(0, 0, -1);
  } else {
    _forward.normalize();
  }
  _right.crossVectors(_forward, _up).normalize();
  _origin.copy(camera.position).addScaledVector(_forward, panel.depth);

  const wave = elapsed * config.driftSpeed + panel.wave;
  const categoryPush = category === 'war' ? 1.18 : 1;
  const side = panel.side + Math.sin(wave * 1.6) * config.driftStrength * categoryPush;
  const height = panel.height + Math.cos(wave * 1.15) * config.driftStrength * 0.18;
  const depthBob = Math.sin(wave * 0.8 + panel.seed) * config.driftStrength * 0.34;

  dummy.position
    .copy(_origin)
    .addScaledVector(_right, side)
    .addScaledVector(_up, height)
    .addScaledVector(_forward, depthBob);

  dummy.quaternion.copy(camera.quaternion);
  const pulse = config.kind === 'aurora'
    ? 1 + Math.sin(wave * 2.2) * 0.08
    : config.kind === 'mirage'
      ? 1 + Math.sin(wave * 3.1) * 0.1
      : 1 + Math.max(0, Math.sin(wave * 1.9)) * 0.08;
  const warStretch = category === 'war' ? 1.08 : 1;
  dummy.rotateZ(config.rotationBias + panel.spin + Math.sin(wave) * 0.08);
  dummy.scale.set(panel.width * pulse * warStretch, panel.heightScale * (0.92 + pulse * 0.08), 1);
}

/** 視界の中景に、ステージ固有の大きな光と空気の層を追加する */
export function StageCinematicLightingFX() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const phase = useGameStore((s) => s.phase);
  const biomeId = useGameStore((s) => s.currentStage?.biome ?? null);
  const category = useGameStore((s) => s.currentStage?.category ?? 'build');
  const graphicsPreset = useSettingsStore((s) => s.graphicsPreset);
  const lightingQuality = useSettingsStore((s) => s.lightingQuality);
  const { camera } = useThree();
  const config = biomeId ? CONFIGS[biomeId] : null;
  const profile = getPerformanceProfile();
  const isQuality = graphicsPreset === 'quality' || lightingQuality === 'rich' || profile.tier === 'high';
  const enabled = graphicsPreset !== 'light' && profile.tier !== 'low';

  const panels = useMemo(() => {
    if (!config || !enabled) return [];
    return createPanels(config, getEffectiveCount(config, category, isQuality));
  }, [category, config, enabled, isQuality]);

  const texture = useMemo(() => {
    if (!config || !enabled) return null;
    return createLightTexture(config.kind);
  }, [config, enabled]);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  useEffect(() => {
    if (!meshRef.current || !config) return;
    _primaryColor.setHex(category === 'war' ? config.warColor : config.primaryColor);
    _secondaryColor.setHex(config.secondaryColor);
    for (let i = 0; i < panels.length; i++) {
      _panelColor.copy(_primaryColor).lerp(_secondaryColor, panels[i].tint * (category === 'war' ? 0.46 : 0.78));
      meshRef.current.setColorAt(i, _panelColor);
    }
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [category, config, panels]);

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current || !config || phase !== 'playing') return;
    const elapsed = clock.getElapsedTime();
    const material = materialRef.current;
    const categoryOpacity = category === 'war' ? WAR_OPACITY_SCALE : 1;
    const qualityOpacity = isQuality ? 1.08 : 0.9;
    const shimmer = config.kind === 'aurora'
      ? 0.82 + Math.max(0, Math.sin(elapsed * 0.42)) * 0.32
      : config.kind === 'caustic'
        ? 0.74 + Math.max(0, Math.sin(elapsed * 0.9)) * 0.26
        : 0.86 + Math.sin(elapsed * 0.22) * 0.08;
    material.opacity = config.opacity * categoryOpacity * qualityOpacity * shimmer;

    const mesh = meshRef.current;
    const dummy = dummyRef.current;
    for (let i = 0; i < panels.length; i++) {
      setPanelTransform(dummy, panels[i], config, camera, elapsed + i * 0.03, category);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!config || !texture || panels.length === 0 || phase !== 'playing' || !enabled) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedPanelGeometry, undefined, panels.length]}
      frustumCulled={false}
      renderOrder={8}
    >
      <meshBasicMaterial
        ref={materialRef}
        alphaMap={texture}
        vertexColors
        transparent
        opacity={config.opacity}
        alphaTest={0.012}
        depthWrite={false}
        depthTest
        fog
        side={THREE.DoubleSide}
        toneMapped={false}
        blending={config.blending}
      />
    </instancedMesh>
  );
}
