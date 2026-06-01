// ステージ特性が発動した時の、視界に近い軽量エフェクト

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { useStageConditionStore } from '../stores/useStageConditionStore';
import { getStageCondition, type StageConditionEffect } from '../types/stageConditions';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';

type ConditionFxKind = StageConditionEffect['kind'];

interface ConditionFxConfig {
  count: number;
  opacity: number;
  radius: number;
  height: number;
  distance: number;
  speed: number;
  size: number;
}

interface ConditionFxParticle {
  seed: number;
  angle: number;
  radius: number;
  height: number;
  speed: number;
  phase: number;
  size: number;
}

const CONFIGS: Record<ConditionFxKind, ConditionFxConfig> = {
  resource: {
    count: 36,
    opacity: 0.32,
    radius: 0.95,
    height: 2.3,
    distance: 3.25,
    speed: 1.12,
    size: 0.034,
  },
  regen: {
    count: 30,
    opacity: 0.3,
    radius: 1.15,
    height: 1.55,
    distance: 3.05,
    speed: 0.88,
    size: 0.036,
  },
  rocket_ready: {
    count: 42,
    opacity: 0.36,
    radius: 0.82,
    height: 1.7,
    distance: 3.5,
    speed: 1.85,
    size: 0.042,
  },
};

const LOW_TIER_SCALE = 0.58;
const BALANCED_TIER_SCALE = 0.78;
const TOUCH_SCALE = 0.72;

const sharedSphereGeometry = new THREE.SphereGeometry(1, 8, 6);
const _up = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _origin = new THREE.Vector3();

function getEffectiveCount(config: ConditionFxConfig): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? LOW_TIER_SCALE
    : profile.tier === 'balanced'
      ? BALANCED_TIER_SCALE
      : 1;
  const touchScale = isTouchDevice() ? TOUCH_SCALE : 1;
  return Math.max(16, Math.round(config.count * tierScale * touchScale));
}

function createParticles(config: ConditionFxConfig, count: number): ConditionFxParticle[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 16807 % 9973) / 9973;
    const seed2 = (i * 48271 % 7919) / 7919;
    const seed3 = (i * 69621 % 6151) / 6151;
    return {
      seed,
      angle: seed * Math.PI * 2,
      radius: config.radius * (0.45 + seed2 * 0.85),
      height: config.height * (0.25 + seed3 * 0.75),
      speed: config.speed * (0.72 + seed2 * 0.62),
      phase: seed3 * Math.PI * 2,
      size: config.size * (0.7 + seed * 0.75),
    };
  });
}

function getActiveProgress(activeUntil: number): number {
  const remainingMs = activeUntil - performance.now();
  return Math.max(0, Math.min(1, remainingMs / 900));
}

/** マップ特性の発動中だけ、視界の近くに短い光の反応を出す */
export function StageConditionFX() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const phase = useGameStore((s) => s.phase);
  const stageId = useGameStore((s) => s.currentStage?.id ?? null);
  const activeUntil = useStageConditionStore((s) => s.activeUntil);
  const activeChain = useStageConditionStore((s) => s.activeChain);
  const recentActivation = useStageConditionStore((s) => s.recentActivation);
  const { camera } = useThree();

  const condition = getStageCondition(stageId);
  const config = condition ? CONFIGS[condition.effect.kind] : null;
  const color = useMemo(() => new THREE.Color(condition?.accent ?? '#ffffff'), [condition?.accent]);
  const particles = useMemo(() => {
    if (!config) return [];
    return createParticles(config, getEffectiveCount(config));
  }, [config]);

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current || !condition || !config || phase !== 'playing') return;

    const now = performance.now();
    const remainingMs = activeUntil - now;
    const mesh = meshRef.current;
    if (remainingMs <= 0) {
      mesh.visible = false;
      return;
    }

    mesh.visible = true;
    const material = materialRef.current;
    const dummy = dummyRef.current;
    const elapsed = clock.getElapsedTime();
    const fade = getActiveProgress(activeUntil);
    const activationAge = recentActivation?.conditionId === condition.id
      ? Math.max(0, now - recentActivation.createdAt)
      : 9999;
    const burst = Math.max(0, 1 - activationAge / 900);
    const chain = Math.max(1, Math.min(9, activeChain));
    const chainGlow = 1 + Math.min(0.85, (chain - 1) * 0.12);
    const chainMotion = 1 + Math.min(0.7, (chain - 1) * 0.08);
    material.opacity = Math.min(
      0.62,
      config.opacity * fade * chainGlow * (0.76 + Math.sin(elapsed * 7) * 0.1 + burst * (0.42 + chain * 0.035)),
    );

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
      let x = 0;
      let y = 0;
      let forwardOffset = 0;
      let scale = particle.size;

      if (condition.effect.kind === 'resource') {
        const lift = ((elapsed * 0.82 + particle.seed * config.height) % config.height) - config.height * 0.42;
        const swirl = particle.angle + elapsed * particle.speed * 1.15 * chainMotion;
        x = Math.cos(swirl) * particle.radius * (0.65 + burst * (0.45 + chain * 0.04));
        y = lift + Math.sin(t * 1.8 * chainMotion) * (0.12 + chain * 0.006);
        forwardOffset = Math.sin(swirl) * (0.28 + chain * 0.018);
        scale *= (0.9 + burst * (0.8 + chain * 0.08)) * chainGlow;
      } else if (condition.effect.kind === 'regen') {
        const orbit = particle.angle + elapsed * particle.speed * 0.75 * chainMotion;
        x = Math.cos(orbit) * particle.radius * (1 + (chain - 1) * 0.025);
        y = Math.sin(orbit) * config.height * 0.36 + 0.45 + Math.sin(t * 1.4 * chainMotion) * (0.12 + chain * 0.005);
        forwardOffset = Math.cos(t * 0.7) * (0.22 + chain * 0.012);
        scale *= (0.92 + Math.max(0, Math.sin(t * 1.5)) * (0.48 + chain * 0.04)) * chainGlow;
      } else {
        const ring = particle.angle + elapsed * particle.speed * chainMotion;
        const blast = 1 + burst * (1.5 + particle.seed * 0.8 + chain * 0.12);
        x = Math.cos(ring) * particle.radius * blast;
        y = Math.sin(ring) * config.height * 0.42 * blast;
        forwardOffset = 0.25 + burst * (0.55 + particle.seed * 0.6 + chain * 0.055);
        scale *= (1.05 + burst * (1.05 + chain * 0.08)) * chainGlow;
      }

      dummy.position
        .copy(_origin)
        .addScaledVector(_right, x)
        .addScaledVector(_up, y)
        .addScaledVector(_forward, forwardOffset);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!condition || !config || phase !== 'playing' || activeUntil <= 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedSphereGeometry, undefined, particles.length]}
      frustumCulled={false}
      renderOrder={4}
    >
      <meshBasicMaterial
        ref={materialRef}
        color={color}
        depthTest={false}
        depthWrite={false}
        opacity={config.opacity}
        transparent
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}
