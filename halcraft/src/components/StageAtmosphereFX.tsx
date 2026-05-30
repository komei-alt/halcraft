// ステージ別の空気感を出す軽量パーティクル演出

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import type { BiomeId } from '../types/stages';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';

type MotionKind = 'flutter' | 'sparkle' | 'snow' | 'dust';

interface AtmosphereConfig {
  count: number;
  color: number;
  opacity: number;
  size: number;
  radius: number;
  heightMin: number;
  heightMax: number;
  speed: number;
  verticalSpeed: number;
  driftStrength: number;
  motion: MotionKind;
}

interface AtmosphereParticle {
  seed: number;
  angle: number;
  radius: number;
  height: number;
  speed: number;
  size: number;
  wave: number;
}

const CONFIGS: Record<BiomeId, AtmosphereConfig> = {
  forest: {
    count: 54,
    color: 0xb7ff72,
    opacity: 0.46,
    size: 0.075,
    radius: 20,
    heightMin: 1.6,
    heightMax: 7.5,
    speed: 0.18,
    verticalSpeed: 0.12,
    driftStrength: 1.4,
    motion: 'flutter',
  },
  tropical: {
    count: 48,
    color: 0x65fff2,
    opacity: 0.38,
    size: 0.065,
    radius: 22,
    heightMin: 1.1,
    heightMax: 5.8,
    speed: 0.22,
    verticalSpeed: 0.18,
    driftStrength: 1.8,
    motion: 'sparkle',
  },
  snow: {
    count: 76,
    color: 0xf4fbff,
    opacity: 0.6,
    size: 0.055,
    radius: 24,
    heightMin: 2.2,
    heightMax: 12,
    speed: 0.09,
    verticalSpeed: 0.62,
    driftStrength: 1.1,
    motion: 'snow',
  },
  desert: {
    count: 58,
    color: 0xffcc77,
    opacity: 0.34,
    size: 0.07,
    radius: 25,
    heightMin: 0.9,
    heightMax: 4.8,
    speed: 0.28,
    verticalSpeed: 0.05,
    driftStrength: 2.6,
    motion: 'dust',
  },
};

const LOW_TIER_SCALE = 0.55;
const BALANCED_TIER_SCALE = 0.78;
const TOUCH_SCALE = 0.62;
const _motionOffset = new THREE.Vector3();

function getEffectiveCount(config: AtmosphereConfig): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? LOW_TIER_SCALE
    : profile.tier === 'balanced'
      ? BALANCED_TIER_SCALE
      : 1;
  const touchScale = isTouchDevice() ? TOUCH_SCALE : 1;
  return Math.max(22, Math.round(config.count * tierScale * touchScale));
}

function createParticles(config: AtmosphereConfig, count: number): AtmosphereParticle[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 16807 % 9973) / 9973;
    const seed2 = (i * 48271 % 7919) / 7919;
    const seed3 = (i * 69621 % 6151) / 6151;
    return {
      seed,
      angle: seed * Math.PI * 2,
      radius: config.radius * (0.22 + seed2 * 0.78),
      height: config.heightMin + seed3 * (config.heightMax - config.heightMin),
      speed: config.speed * (0.65 + seed2 * 0.7),
      size: config.size * (0.65 + seed3 * 0.8),
      wave: seed3 * Math.PI * 2,
    };
  });
}

function setMotionOffset(
  target: THREE.Vector3,
  config: AtmosphereConfig,
  particle: AtmosphereParticle,
  elapsed: number,
): void {
  const wind = elapsed * particle.speed + particle.wave;
  const sway = Math.sin(wind * 1.7) * config.driftStrength;
  const bob = Math.cos(wind * 1.3) * 0.35;

  if (config.motion === 'snow') {
    const fall = ((elapsed * config.verticalSpeed + particle.seed * 18) % 14) - 7;
    target.set(
      Math.sin(wind) * config.driftStrength,
      -fall,
      Math.cos(wind * 0.8) * config.driftStrength * 0.6,
    );
    return;
  }

  if (config.motion === 'dust') {
    target.set(
      sway + Math.sin(elapsed * 0.35 + particle.seed * 6) * 1.8,
      bob * 0.45,
      Math.cos(wind) * config.driftStrength * 0.5,
    );
    return;
  }

  if (config.motion === 'sparkle') {
    target.set(
      sway * 0.75,
      Math.sin(wind * 2.4) * config.verticalSpeed,
      Math.cos(wind * 1.9) * config.driftStrength * 0.55,
    );
    return;
  }

  target.set(
    sway * 0.85,
    Math.sin(wind * 2) * config.verticalSpeed + bob,
    Math.cos(wind) * config.driftStrength * 0.45,
  );
}

const sharedSphereGeometry = new THREE.SphereGeometry(1, 8, 6);

/** 選んだマップの気候を、プレイ中の視界に薄く重ねる */
export function StageAtmosphereFX() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const phase = useGameStore((s) => s.phase);
  const biomeId = useGameStore((s) => s.currentStage?.biome ?? null);
  const { camera } = useThree();

  const config = biomeId ? CONFIGS[biomeId] : null;
  const particles = useMemo(() => {
    if (!config) return [];
    return createParticles(config, getEffectiveCount(config));
  }, [config]);

  useFrame(({ clock }) => {
    if (!meshRef.current || !config || phase !== 'playing') return;

    const elapsed = clock.getElapsedTime();
    const mesh = meshRef.current;
    const dummy = dummyRef.current;

    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const orbit = particle.angle + elapsed * particle.speed * 0.28;
      const baseX = Math.cos(orbit) * particle.radius;
      const baseZ = Math.sin(orbit) * particle.radius;
      setMotionOffset(_motionOffset, config, particle, elapsed);
      const scale = particle.size * (config.motion === 'sparkle'
        ? 0.75 + Math.max(0, Math.sin(elapsed * 5 + particle.wave)) * 0.65
        : 1);

      dummy.position.set(
        camera.position.x + baseX + _motionOffset.x,
        camera.position.y + particle.height + _motionOffset.y,
        camera.position.z + baseZ + _motionOffset.z,
      );
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!config || phase !== 'playing') return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedSphereGeometry, undefined, particles.length]}
      frustumCulled={false}
      renderOrder={2}
    >
      <meshBasicMaterial
        color={config.color}
        depthWrite={false}
        opacity={config.opacity}
        transparent
        toneMapped={false}
      />
    </instancedMesh>
  );
}
