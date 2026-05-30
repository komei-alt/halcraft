// モードフロー発動時に、建築/戦争で違う粒子バーストを視界へ出す

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { useModeFlowStore } from '../stores/useModeFlowStore';
import type { StageCategory } from '../types/stages';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';

interface ModeFlowFxConfig {
  count: number;
  opacity: number;
  distance: number;
  radius: number;
  height: number;
  size: number;
  speed: number;
}

interface ModeFlowParticle {
  seed: number;
  angle: number;
  radius: number;
  height: number;
  speed: number;
  phase: number;
  size: number;
}

const CONFIGS: Record<StageCategory, ModeFlowFxConfig> = {
  build: {
    count: 46,
    opacity: 0.56,
    distance: 2.45,
    radius: 1.1,
    height: 1.85,
    size: 0.06,
    speed: 1.12,
  },
  war: {
    count: 54,
    opacity: 0.62,
    distance: 2.75,
    radius: 0.95,
    height: 1.35,
    size: 0.066,
    speed: 1.65,
  },
};

const LOW_TIER_SCALE = 0.58;
const BALANCED_TIER_SCALE = 0.78;
const TOUCH_SCALE = 0.68;
const FX_DURATION_MS = 1500;

const sharedSphereGeometry = new THREE.SphereGeometry(1, 8, 6);
const _up = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _origin = new THREE.Vector3();

function getEffectiveCount(config: ModeFlowFxConfig): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? LOW_TIER_SCALE
    : profile.tier === 'balanced'
      ? BALANCED_TIER_SCALE
      : 1;
  const touchScale = isTouchDevice() ? TOUCH_SCALE : 1;
  return Math.max(18, Math.round(config.count * tierScale * touchScale));
}

function createParticles(config: ModeFlowFxConfig, count: number): ModeFlowParticle[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 16807 % 9973) / 9973;
    const seed2 = (i * 48271 % 7919) / 7919;
    const seed3 = (i * 69621 % 6151) / 6151;
    return {
      seed,
      angle: seed * Math.PI * 2,
      radius: config.radius * (0.35 + seed2 * 0.9),
      height: config.height * (0.18 + seed3 * 0.82),
      speed: config.speed * (0.72 + seed2 * 0.78),
      phase: seed3 * Math.PI * 2,
      size: config.size * (0.68 + seed * 0.8),
    };
  });
}

function getFxFade(createdAt: number): number {
  const age = performance.now() - createdAt;
  const fadeIn = Math.min(1, age / 180);
  const fadeOut = Math.min(1, Math.max(0, FX_DURATION_MS - age) / 620);
  return Math.max(0, Math.min(fadeIn, fadeOut));
}

/** モード発動の「いま乗った」感を、カメラ前方の短い反応で見せる */
export function StageModeFlowFX() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const phase = useGameStore((s) => s.phase);
  const activation = useModeFlowStore((s) => s.recentActivation);
  const { camera } = useThree();
  const config = activation ? CONFIGS[activation.category] : null;
  const particles = useMemo(() => {
    const baseConfig = config ?? CONFIGS.build;
    return createParticles(baseConfig, getEffectiveCount(baseConfig));
  }, [config]);
  const color = useMemo(() => new THREE.Color(activation?.accent ?? '#ffffff'), [activation?.accent]);

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current || phase !== 'playing' || !activation || !config) return;

    const fade = getFxFade(activation.createdAt);
    const mesh = meshRef.current;
    if (fade <= 0) {
      mesh.visible = false;
      return;
    }

    mesh.visible = true;
    const elapsed = clock.getElapsedTime();
    const rankScale = 1 + Math.max(0, activation.flowRank - 1) * 0.22;
    const burst = Math.max(0, 1 - (performance.now() - activation.createdAt) / 720);
    const material = materialRef.current;
    material.color.copy(color);
    material.opacity = Math.min(0.82, config.opacity * fade * rankScale);

    camera.getWorldDirection(_forward);
    _forward.y = 0;
    if (_forward.lengthSq() < 0.001) {
      _forward.set(0, 0, -1);
    } else {
      _forward.normalize();
    }
    _right.crossVectors(_forward, _up).normalize();
    _origin.copy(camera.position).addScaledVector(_forward, config.distance);

    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const t = elapsed * particle.speed + particle.phase;
      const ring = particle.angle + elapsed * particle.speed * (activation.category === 'build' ? 0.9 : 1.45);
      let x = 0;
      let y = 0;
      let z = 0;

      if (activation.category === 'build') {
        const lift = ((elapsed * 0.95 + particle.seed * config.height) % config.height) - config.height * 0.32;
        x = Math.cos(ring) * particle.radius * (0.7 + burst * 0.5);
        y = lift + Math.sin(t * 1.5) * 0.16 + burst * 0.24;
        z = Math.sin(ring) * 0.32;
      } else {
        const streak = 0.4 + burst * (0.85 + particle.seed * 0.6);
        x = Math.cos(ring) * particle.radius * (0.45 + burst * 0.55);
        y = Math.sin(ring) * config.height * 0.32 + 0.22 + Math.sin(t) * 0.1;
        z = streak + Math.sin(t * 1.2) * 0.28;
      }

      dummyRef.current.position
        .copy(_origin)
        .addScaledVector(_right, x)
        .addScaledVector(_up, y)
        .addScaledVector(_forward, z);
      dummyRef.current.scale.setScalar(particle.size * (0.92 + burst * 0.9) * rankScale);
      dummyRef.current.updateMatrix();
      mesh.setMatrixAt(i, dummyRef.current.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!activation || !config || phase !== 'playing') return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedSphereGeometry, undefined, particles.length]}
      frustumCulled={false}
      renderOrder={6}
    >
      <meshBasicMaterial
        ref={materialRef}
        color={color}
        depthTest={false}
        depthWrite={false}
        opacity={config.opacity}
        transparent
        toneMapped={false}
      />
    </instancedMesh>
  );
}
