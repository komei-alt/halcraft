// アイテム熟練イベントを、手元側の光バーストとして返す軽量3Dエフェクト

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { MASTERY_DEFS, useMasteryStore, type MasteryEvent } from '../stores/useMasteryStore';
import type { EquippedItem } from '../stores/usePlayerStore';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';

interface ItemPulseParticle {
  seed: number;
  angle: number;
  radius: number;
  speed: number;
  size: number;
  lifetime: number;
  birth: number;
  depth: number;
  lift: number;
  spin: number;
}

interface ItemPulseTone {
  color: number;
  secondary: number;
  offsetX: number;
  offsetY: number;
  baseScale: number;
}

const ITEM_TONES: Record<EquippedItem, ItemPulseTone> = {
  builder: {
    color: 0x9bdcff,
    secondary: 0xffffff,
    offsetX: -0.2,
    offsetY: -0.34,
    baseScale: 1,
  },
  rocket_launcher: {
    color: 0xffbd6a,
    secondary: 0xff6d4c,
    offsetX: 0.52,
    offsetY: -0.44,
    baseScale: 1.14,
  },
  machine_gun: {
    color: 0xffe28a,
    secondary: 0xffffff,
    offsetX: 0.44,
    offsetY: -0.32,
    baseScale: 1.04,
  },
  lightsaber: {
    color: 0xc8b0ff,
    secondary: 0x84f8ff,
    offsetX: 0.5,
    offsetY: -0.2,
    baseScale: 1.1,
  },
  gravity_glove: {
    color: 0x9d8cff,
    secondary: 0xe8d6ff,
    offsetX: 0.46,
    offsetY: -0.28,
    baseScale: 1.08,
  },
  bomb_slinger: {
    color: 0xff8a6a,
    secondary: 0xffe0a0,
    offsetX: 0.48,
    offsetY: -0.36,
    baseScale: 1.06,
  },
};

const MAX_PARTICLES = 36;
const LOW_TIER_SCALE = 0.55;
const BALANCED_TIER_SCALE = 0.74;
const TOUCH_SCALE = 0.64;
const sharedPulseGeometry = new THREE.PlaneGeometry(1, 1);
const _dummy = new THREE.Object3D();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _base = new THREE.Vector3();
const _particleColor = new THREE.Color();

function getRuntimeSeconds(): number {
  if (typeof performance !== 'undefined') return performance.now() / 1000;
  return Date.now() / 1000;
}

function seededUnit(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function getEventStrength(event: MasteryEvent): number {
  if (event.techniqueTierUnlocked) return 1.28;
  if (event.leveledUp) return 1.18;
  if (event.techniqueRecordUpdated) return 1.12;
  if (event.critical) return 1.04;
  return event.streak >= 3 ? 0.95 : 0.74;
}

function getParticleCount(event: MasteryEvent): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? LOW_TIER_SCALE
    : profile.tier === 'balanced'
      ? BALANCED_TIER_SCALE
      : 1;
  const touchScale = isTouchDevice() ? TOUCH_SCALE : 1;
  const base = event.techniqueTierUnlocked
    ? 34
    : event.leveledUp
      ? 30
      : event.techniqueRecordUpdated
        ? 27
        : event.streak >= 3
          ? 22
          : 14;
  return Math.max(8, Math.min(MAX_PARTICLES, Math.round(base * tierScale * touchScale)));
}

function createParticles(event: MasteryEvent, now: number): ItemPulseParticle[] {
  const strength = getEventStrength(event);
  const count = getParticleCount(event);
  return Array.from({ length: count }, (_, i) => ({
    seed: seededUnit(i, event.id * 0.17 + 1.1),
    angle: seededUnit(i, event.id * 0.21 + 2.3) * Math.PI * 2,
    radius: THREE.MathUtils.lerp(0.08, 0.36, seededUnit(i, event.id * 0.33 + 3.2)) * strength,
    speed: THREE.MathUtils.lerp(0.58, 1.35, seededUnit(i, event.id * 0.42 + 4.4)) * strength,
    size: THREE.MathUtils.lerp(0.035, 0.095, seededUnit(i, event.id * 0.53 + 5.5)) * strength,
    lifetime: THREE.MathUtils.lerp(0.62, 1.08, seededUnit(i, event.id * 0.64 + 6.7)),
    birth: now + seededUnit(i, event.id * 0.75 + 7.8) * 0.08,
    depth: THREE.MathUtils.lerp(-0.08, 0.18, seededUnit(i, event.id * 0.86 + 8.9)),
    lift: THREE.MathUtils.lerp(-0.08, 0.24, seededUnit(i, event.id * 0.97 + 9.6)) * strength,
    spin: seededUnit(i, event.id * 1.08 + 10.5) * Math.PI * 2,
  }));
}

function setHiddenInstances(mesh: THREE.InstancedMesh, startIndex: number): void {
  for (let i = startIndex; i < MAX_PARTICLES; i++) {
    _dummy.position.set(0, -999, 0);
    _dummy.scale.setScalar(0.001);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
  }
}

/** 熟練XP・技記録・レベルアップを、装備ごとの色で手元に返す */
export function ItemMasteryPulseFX() {
  const phase = useGameStore((s) => s.phase);
  const recentEvent = useMasteryStore((s) => s.recentEvent);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const particlesRef = useRef<ItemPulseParticle[]>([]);
  const activeItemRef = useRef<EquippedItem>('builder');
  const lastEventIdRef = useRef<number | null>(null);
  const { camera } = useThree();

  const fallbackColor = useMemo(() => new THREE.Color(MASTERY_DEFS.builder.accent), []);

  useEffect(() => {
    if (!recentEvent || phase !== 'playing') return;
    if (lastEventIdRef.current === recentEvent.id) return;

    lastEventIdRef.current = recentEvent.id;
    activeItemRef.current = recentEvent.item;
    particlesRef.current = createParticles(recentEvent, getRuntimeSeconds());

    const tone = ITEM_TONES[recentEvent.item];
    materialRef.current?.color.setHex(tone.color);
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const mix = i / Math.max(1, MAX_PARTICLES - 1);
      _particleColor.setHex(tone.color).lerp(new THREE.Color(tone.secondary), mix * 0.82);
      mesh.setColorAt(i, _particleColor);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [phase, recentEvent, fallbackColor]);

  useFrame(() => {
    if (!meshRef.current || !materialRef.current || phase !== 'playing') return;

    const mesh = meshRef.current;
    const material = materialRef.current;
    const particles = particlesRef.current;
    const elapsed = getRuntimeSeconds();
    const tone = ITEM_TONES[activeItemRef.current];
    let visibleCount = 0;
    let strongestFade = 0;

    camera.getWorldDirection(_forward);
    if (_forward.lengthSq() < 0.001) _forward.set(0, 0, -1);
    _forward.normalize();
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    _base
      .copy(camera.position)
      .addScaledVector(_forward, 1.35)
      .addScaledVector(_right, tone.offsetX)
      .addScaledVector(_up, tone.offsetY);

    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const age = elapsed - particle.birth;
      if (age < 0 || age > particle.lifetime) {
        continue;
      }

      const progress = age / particle.lifetime;
      const easeOut = 1 - (1 - progress) * (1 - progress);
      const fade = 1 - THREE.MathUtils.smoothstep(progress, 0.56, 1);
      const orbit = particle.angle + elapsed * (0.7 + particle.seed);
      const spread = particle.radius + particle.speed * easeOut * 0.42;
      const x = Math.cos(orbit) * spread;
      const y = Math.sin(orbit) * spread * 0.64 + particle.lift * easeOut;

      _dummy.position
        .copy(_base)
        .addScaledVector(_right, x)
        .addScaledVector(_up, y)
        .addScaledVector(_forward, particle.depth + easeOut * 0.22);
      _dummy.quaternion.copy(camera.quaternion);
      _dummy.rotateZ(particle.spin + elapsed * (1.4 + particle.seed * 2.2));
      const scale = particle.size * (0.72 + easeOut * 1.1) * fade * tone.baseScale;
      _dummy.scale.set(scale, scale * (0.58 + particle.seed * 0.42), 1);
      _dummy.updateMatrix();
      mesh.setMatrixAt(visibleCount, _dummy.matrix);
      visibleCount += 1;
      strongestFade = Math.max(strongestFade, fade);
    }

    setHiddenInstances(mesh, visibleCount);
    mesh.instanceMatrix.needsUpdate = true;
    material.opacity = 0.68 * strongestFade;

    if (visibleCount === 0 && particles.length > 0) {
      particlesRef.current = [];
    }
  });

  if (phase !== 'playing') return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedPulseGeometry, undefined, MAX_PARTICLES]}
      frustumCulled={false}
      renderOrder={180}
    >
      <meshBasicMaterial
        ref={materialRef}
        color={fallbackColor}
        vertexColors
        transparent
        opacity={0}
        depthTest={false}
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
