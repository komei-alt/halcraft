// 視界の手前を横切るマップ別の空気粒子。
// 遠景だけでなく、プレイヤーの目の前にも森・南国・雪・砂漠の差を出す。

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import type { BiomeId, StageCategory } from '../types/stages';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';

type ForegroundWeatherKind = 'leaf' | 'spray' | 'snow' | 'sand';

interface ForegroundWeatherConfig {
  kind: ForegroundWeatherKind;
  count: number;
  buildColor: number;
  warColor: number;
  secondaryColor: number;
  opacity: number;
  sideSpread: number;
  depthMin: number;
  depthMax: number;
  heightMin: number;
  heightMax: number;
  widthMin: number;
  widthMax: number;
  lengthMin: number;
  lengthMax: number;
  speed: number;
  drift: number;
  spin: number;
  blending: THREE.Blending;
}

interface ForegroundParticle {
  seed: number;
  tint: number;
  side: number;
  depth: number;
  height: number;
  width: number;
  length: number;
  speed: number;
  drift: number;
  spin: number;
  phase: number;
}

const CONFIGS: Record<BiomeId, ForegroundWeatherConfig> = {
  forest: {
    kind: 'leaf',
    count: 26,
    buildColor: 0xd9ff7a,
    warColor: 0xffdf6c,
    secondaryColor: 0x55e66d,
    opacity: 0.16,
    sideSpread: 8.4,
    depthMin: 3.5,
    depthMax: 13.5,
    heightMin: -0.8,
    heightMax: 5.4,
    widthMin: 0.13,
    widthMax: 0.28,
    lengthMin: 0.32,
    lengthMax: 0.72,
    speed: 0.24,
    drift: 0.95,
    spin: 1.15,
    blending: THREE.NormalBlending,
  },
  tropical: {
    kind: 'spray',
    count: 28,
    buildColor: 0x9dfff2,
    warColor: 0xffef9a,
    secondaryColor: 0xffffff,
    opacity: 0.2,
    sideSpread: 8.8,
    depthMin: 3.2,
    depthMax: 14,
    heightMin: -0.55,
    heightMax: 4.8,
    widthMin: 0.06,
    widthMax: 0.16,
    lengthMin: 0.32,
    lengthMax: 0.86,
    speed: 0.34,
    drift: 1.25,
    spin: 1.7,
    blending: THREE.AdditiveBlending,
  },
  snow: {
    kind: 'snow',
    count: 42,
    buildColor: 0xf9feff,
    warColor: 0xcec2ff,
    secondaryColor: 0x9fe8ff,
    opacity: 0.3,
    sideSpread: 8.2,
    depthMin: 3.4,
    depthMax: 14.8,
    heightMin: -0.4,
    heightMax: 7.8,
    widthMin: 0.08,
    widthMax: 0.18,
    lengthMin: 0.2,
    lengthMax: 0.42,
    speed: 0.42,
    drift: 1.05,
    spin: 0.65,
    blending: THREE.AdditiveBlending,
  },
  desert: {
    kind: 'sand',
    count: 38,
    buildColor: 0xffdc91,
    warColor: 0xff8f56,
    secondaryColor: 0xfff0ba,
    opacity: 0.24,
    sideSpread: 10.5,
    depthMin: 3.6,
    depthMax: 15.5,
    heightMin: -0.35,
    heightMax: 3.7,
    widthMin: 0.08,
    widthMax: 0.18,
    lengthMin: 0.55,
    lengthMax: 1.15,
    speed: 0.58,
    drift: 2.2,
    spin: 0.32,
    blending: THREE.NormalBlending,
  },
};

const LOW_TIER_SCALE = 0.42;
const BALANCED_TIER_SCALE = 0.7;
const TOUCH_SCALE = 0.55;
const WAR_COUNT_SCALE = 1.18;
const WAR_SPEED_SCALE = 1.38;
const WAR_STRETCH_SCALE = 1.22;
const TEXTURE_SIZE = 96;

const sharedPlaneGeometry = new THREE.PlaneGeometry(1, 1);
const _right = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _particleColor = new THREE.Color();

function seededUnit(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function getEffectiveCount(config: ForegroundWeatherConfig, category: StageCategory): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? LOW_TIER_SCALE
    : profile.tier === 'balanced'
      ? BALANCED_TIER_SCALE
      : 1;
  const touchScale = isTouchDevice() ? TOUCH_SCALE : 1;
  const categoryScale = category === 'war' ? WAR_COUNT_SCALE : 1;
  return Math.max(10, Math.round(config.count * tierScale * touchScale * categoryScale));
}

function createParticles(config: ForegroundWeatherConfig, category: StageCategory): ForegroundParticle[] {
  const count = getEffectiveCount(config, category);
  return Array.from({ length: count }, (_, i) => ({
    seed: seededUnit(i, 1.1),
    tint: seededUnit(i, 2.2),
    side: (seededUnit(i, 3.3) - 0.5) * config.sideSpread * 2,
    depth: THREE.MathUtils.lerp(config.depthMin, config.depthMax, seededUnit(i, 4.4)),
    height: THREE.MathUtils.lerp(config.heightMin, config.heightMax, seededUnit(i, 5.5)),
    width: THREE.MathUtils.lerp(config.widthMin, config.widthMax, seededUnit(i, 6.6)),
    length: THREE.MathUtils.lerp(config.lengthMin, config.lengthMax, seededUnit(i, 7.7)),
    speed: config.speed * (0.72 + seededUnit(i, 8.8) * 0.72),
    drift: config.drift * (0.72 + seededUnit(i, 9.9) * 0.68),
    spin: (seededUnit(i, 10.1) - 0.5) * config.spin * 2,
    phase: seededUnit(i, 11.2) * Math.PI * 2,
  }));
}

function drawLeafMask(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(TEXTURE_SIZE * 0.5, TEXTURE_SIZE * 0.5);
  ctx.rotate(-0.35);
  ctx.scale(0.42, 0.9);
  const gradient = ctx.createRadialGradient(0, 0, 2, 0, 0, 42);
  gradient.addColorStop(0, 'rgba(255,255,255,0.94)');
  gradient.addColorStop(0.58, 'rgba(255,255,255,0.64)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, 38, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(30, 57);
  ctx.quadraticCurveTo(48, 43, 66, 36);
  ctx.stroke();
}

function drawSprayMask(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createRadialGradient(48, 48, 2, 48, 48, 44);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.28, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  ctx.strokeStyle = 'rgba(255,255,255,0.76)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(48, 17);
  ctx.lineTo(48, 79);
  ctx.moveTo(20, 48);
  ctx.lineTo(76, 48);
  ctx.moveTo(31, 31);
  ctx.lineTo(65, 65);
  ctx.moveTo(65, 31);
  ctx.lineTo(31, 65);
  ctx.stroke();
}

function drawSnowMask(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI;
    const x = Math.cos(angle) * 31;
    const y = Math.sin(angle) * 31;
    ctx.beginPath();
    ctx.moveTo(48 - x, 48 - y);
    ctx.lineTo(48 + x, 48 + y);
    ctx.stroke();
  }

  const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 38);
  gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
}

function drawSandMask(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(TEXTURE_SIZE * 0.5, TEXTURE_SIZE * 0.5);
  ctx.rotate(-0.15);
  const gradient = ctx.createLinearGradient(-42, 0, 42, 0);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.32, 'rgba(255,255,255,0.28)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.88)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = gradient;
  ctx.lineCap = 'round';
  ctx.lineWidth = 15;
  ctx.beginPath();
  ctx.moveTo(-34, 2);
  ctx.quadraticCurveTo(-6, -8, 34, 0);
  ctx.stroke();
  ctx.restore();
}

function createParticleTexture(kind: ForegroundWeatherKind): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  if (kind === 'leaf') drawLeafMask(ctx);
  else if (kind === 'spray') drawSprayMask(ctx);
  else if (kind === 'snow') drawSnowMask(ctx);
  else drawSandMask(ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function getCategoryOpacity(category: StageCategory): number {
  return category === 'war' ? 1.08 : 0.78;
}

export function StageForegroundWeatherFX() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const { camera } = useThree();

  const config = stage ? CONFIGS[stage.biome] : null;
  const category = stage?.category ?? 'build';
  const particles = useMemo(
    () => (config ? createParticles(config, category) : []),
    [category, config],
  );
  const texture = useMemo(
    () => (config ? createParticleTexture(config.kind) : null),
    [config],
  );
  const primaryColor = useMemo(
    () => new THREE.Color(config ? (category === 'war' ? config.warColor : config.buildColor) : 0xffffff),
    [category, config],
  );
  const secondaryColor = useMemo(
    () => new THREE.Color(config?.secondaryColor ?? 0xffffff),
    [config?.secondaryColor],
  );

  useEffect(() => () => {
    texture?.dispose();
  }, [texture]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < particles.length; i++) {
      _particleColor.copy(primaryColor).lerp(secondaryColor, particles[i].tint);
      mesh.setColorAt(i, _particleColor);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [particles, primaryColor, secondaryColor]);

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current || !config || phase !== 'playing') return;

    const elapsed = clock.getElapsedTime();
    const mesh = meshRef.current;
    const dummy = dummyRef.current;
    const categorySpeed = category === 'war' ? WAR_SPEED_SCALE : 1;
    const categoryStretch = category === 'war' ? WAR_STRETCH_SCALE : 1;
    const pulse = 0.86 + Math.max(0, Math.sin(elapsed * (config.kind === 'snow' ? 0.65 : 1.05))) * 0.18;

    materialRef.current.opacity = config.opacity * getCategoryOpacity(category) * pulse;

    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _forward.y *= config.kind === 'snow' ? 0.08 : 0.18;
    if (_forward.lengthSq() > 0.001) _forward.normalize();

    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const travel = (elapsed * particle.speed * categorySpeed + particle.seed * 13) % 1;
      const wave = elapsed * (0.9 + particle.seed) + particle.phase;
      let side = particle.side + Math.sin(wave * 0.72) * particle.drift;
      let height = particle.height;
      let depth = particle.depth;
      let width = particle.width;
      let length = particle.length * categoryStretch;
      let rotationZ = particle.spin * elapsed + particle.phase;

      if (config.kind === 'snow') {
        const fallRange = config.heightMax - config.heightMin + 2.8;
        height = config.heightMax - travel * fallRange + Math.sin(wave * 0.78) * 0.28;
        side += Math.sin(wave * 0.48) * particle.drift;
        rotationZ = particle.phase + Math.sin(wave * 0.34) * 0.55;
      } else if (config.kind === 'sand') {
        side += (travel - 0.5) * config.drift * 2.1;
        height += Math.sin(wave * 0.54) * 0.5;
        depth += Math.cos(wave * 0.36) * 0.8;
        width *= 0.85 + Math.max(0, Math.sin(wave * 1.2)) * 0.22;
        length *= 1.22;
        rotationZ = Math.PI * 0.5 + Math.sin(wave * 0.5) * 0.22;
      } else if (config.kind === 'spray') {
        const shimmer = Math.max(0, Math.sin(wave * 1.8));
        height += shimmer * 0.72;
        side += Math.sin(wave * 1.1) * particle.drift * 0.58;
        width *= 0.82 + shimmer * 0.72;
        length *= 0.8 + shimmer * 0.9;
        rotationZ = particle.phase + elapsed * particle.spin * 1.4;
      } else {
        const flutter = Math.sin(wave * 1.35);
        height -= travel * 1.2;
        side += flutter * particle.drift * 0.82;
        rotationZ = particle.phase + elapsed * particle.spin + flutter * 0.9;
      }

      dummy.position
        .copy(camera.position)
        .addScaledVector(_right, side)
        .addScaledVector(_forward, depth);
      dummy.position.y += height;
      dummy.quaternion.copy(camera.quaternion);
      dummy.rotateZ(rotationZ);
      dummy.scale.set(width, length, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!config || !texture || phase !== 'playing') return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedPlaneGeometry, undefined, particles.length]}
      frustumCulled={false}
      renderOrder={7}
    >
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        vertexColors
        transparent
        opacity={config.opacity}
        depthWrite={false}
        depthTest={false}
        side={THREE.DoubleSide}
        toneMapped={false}
        blending={config.blending}
        alphaTest={0.035}
      />
    </instancedMesh>
  );
}
