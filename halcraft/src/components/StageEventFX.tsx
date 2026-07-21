// マップイベント発生中の視界エフェクト

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { useStageEventStore } from '../stores/useStageEventStore';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';

interface EventParticle {
  angle: number;
  radius: number;
  height: number;
  speed: number;
  phase: number;
  size: number;
}

const sharedSphereGeometry = new THREE.SphereGeometry(1, 8, 6);
const _up = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _origin = new THREE.Vector3();

function getParticleCount(): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low' ? 0.55 : profile.tier === 'balanced' ? 0.75 : 1;
  const touchScale = isTouchDevice() ? 0.68 : 1;
  return Math.max(18, Math.round(34 * tierScale * touchScale));
}

function createParticles(): EventParticle[] {
  const count = getParticleCount();
  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 16807 % 9973) / 9973;
    const seed2 = (i * 48271 % 7919) / 7919;
    const seed3 = (i * 69621 % 6151) / 6151;
    return {
      angle: seed * Math.PI * 2,
      radius: 0.45 + seed2 * 1.25,
      height: -0.25 + seed3 * 1.8,
      speed: 0.7 + seed2 * 1.4,
      phase: seed3 * Math.PI * 2,
      size: 0.034 + seed * 0.026,
    };
  });
}

function getFade(activeUntil: number, createdAt: number): number {
  const now = performance.now();
  const fadeIn = Math.min(1, (now - createdAt) / 420);
  const fadeOut = Math.min(1, Math.max(0, activeUntil - now) / 900);
  return Math.max(0, Math.min(fadeIn, fadeOut));
}

/** イベントが起きた瞬間だけ、視界前方にマップ色の粒子を流す */
export function StageEventFX() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const phase = useGameStore((s) => s.phase);
  const recentEvent = useStageEventStore((s) => s.recentEvent);
  const { camera } = useThree();
  const particles = useMemo(() => createParticles(), []);
  const color = useMemo(() => new THREE.Color(recentEvent?.accent ?? '#ffffff'), [recentEvent?.accent]);

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current || phase !== 'playing' || !recentEvent) return;

    const fade = getFade(recentEvent.activeUntil, recentEvent.createdAt);
    const mesh = meshRef.current;
    if (fade <= 0) {
      mesh.visible = false;
      return;
    }

    mesh.visible = true;
    const material = materialRef.current;
    material.color.copy(color);
    material.opacity = 0.34 * fade;

    const elapsed = clock.getElapsedTime();
    const dummy = dummyRef.current;
    camera.getWorldDirection(_forward);
    _forward.y = 0;
    if (_forward.lengthSq() < 0.001) {
      _forward.set(0, 0, -1);
    } else {
      _forward.normalize();
    }
    _right.crossVectors(_forward, _up).normalize();
    _origin.copy(camera.position).addScaledVector(_forward, 2.4);

    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const t = elapsed * particle.speed + particle.phase;
      const ring = particle.angle + elapsed * particle.speed * 0.72;
      const pulse = 1 + Math.sin(t * 1.7) * 0.16;
      const x = Math.cos(ring) * particle.radius * pulse;
      const y = particle.height + Math.sin(t) * 0.18;
      const z = Math.sin(ring) * 0.35 + Math.cos(t * 0.6) * 0.22;

      dummy.position
        .copy(_origin)
        .addScaledVector(_right, x)
        .addScaledVector(_up, y)
        .addScaledVector(_forward, z);
      dummy.scale.setScalar(particle.size * (0.85 + fade * 0.75));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!recentEvent || phase !== 'playing') return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedSphereGeometry, undefined, particles.length]}
      frustumCulled={false}
      renderOrder={5}
      visible={false}
    >
      <meshBasicMaterial
        ref={materialRef}
        color={color}
        depthTest={false}
        depthWrite={false}
        opacity={0.45}
        transparent
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}
