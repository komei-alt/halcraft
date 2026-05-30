// ブロックを使った瞬間の小さな光エフェクト
// 特殊ブロックの役割が、画面内でも手応えとして伝わるようにする

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerBlockUseEffectSpawner } from '../utils/effectTriggers';
import type { BlockUseFeedbackKind } from '../utils/blockUseFeedback';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  totalLife: number;
  color: THREE.Color;
}

interface UseEffectBurst {
  id: string;
  kind: BlockUseFeedbackKind;
  particles: Particle[];
}

const MAX_EFFECTS = 18;
const PARTICLES_PER_EFFECT = 22;
const MAX_PARTICLES = MAX_EFFECTS * PARTICLES_PER_EFFECT;
const BASE_LIFETIME = 0.78;

let effectSequence = 0;

function getParticleCount(kind: BlockUseFeedbackKind): number {
  if (kind === 'explosive' || kind === 'summon') return 28;
  if (kind === 'condition' || kind === 'defense') return 24;
  return PARTICLES_PER_EFFECT;
}

function getVelocity(kind: BlockUseFeedbackKind, index: number, count: number): THREE.Vector3 {
  const angle = (index / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.25;
  const radiusSpeed = kind === 'explosive'
    ? 4.2 + Math.random() * 2.4
    : kind === 'rail'
      ? 2.8 + Math.random() * 1.4
      : kind === 'liquid'
        ? 1.1 + Math.random() * 0.9
        : 1.8 + Math.random() * 1.5;

  if (kind === 'summon') {
    return new THREE.Vector3(
      Math.cos(angle) * 1.4,
      2.8 + Math.random() * 2.1,
      Math.sin(angle) * 1.4,
    );
  }

  if (kind === 'rail') {
    return new THREE.Vector3(
      Math.cos(angle) * radiusSpeed,
      0.25 + Math.random() * 0.55,
      Math.sin(angle) * 0.45,
    );
  }

  if (kind === 'liquid') {
    return new THREE.Vector3(
      Math.cos(angle) * radiusSpeed,
      0.35 + Math.random() * 0.75,
      Math.sin(angle) * radiusSpeed,
    );
  }

  return new THREE.Vector3(
    Math.cos(angle) * radiusSpeed,
    kind === 'explosive' ? 1.2 + Math.random() * 2.8 : 1.6 + Math.random() * 1.8,
    Math.sin(angle) * radiusSpeed,
  );
}

function tintParticle(base: THREE.Color, kind: BlockUseFeedbackKind, index: number): THREE.Color {
  const color = base.clone();
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const brightBoost = kind === 'light' || kind === 'condition' ? 0.22 : 0.14;
  hsl.l = Math.max(0.18, Math.min(0.92, hsl.l + brightBoost + (Math.random() - 0.5) * 0.18));
  hsl.s = Math.max(0.35, Math.min(1, hsl.s + (Math.random() - 0.5) * 0.16));
  color.setHSL(hsl.h, hsl.s, hsl.l);
  if (kind === 'explosive' && index % 3 === 0) color.set('#ffe082');
  if (kind === 'liquid' && index % 4 === 0) color.set('#d8f7ff');
  return color;
}

export function BlockUseEffect() {
  const effectsRef = useRef<UseEffectBurst[]>([]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);

  const material = useMemo(() => new THREE.PointsMaterial({
    size: 0.16,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    sizeAttenuation: true,
    depthWrite: false,
  }), []);

  const spawnEffect = useCallback((
    kind: BlockUseFeedbackKind,
    x: number,
    y: number,
    z: number,
    accent: string,
  ) => {
    const centerX = x + 0.5;
    const centerY = y + 0.75;
    const centerZ = z + 0.5;
    const baseColor = new THREE.Color(accent);
    const count = getParticleCount(kind);
    const particles: Particle[] = [];

    for (let i = 0; i < count; i++) {
      const velocity = getVelocity(kind, i, count);
      const totalLife = BASE_LIFETIME * (0.72 + Math.random() * 0.46);
      particles.push({
        x: centerX + (Math.random() - 0.5) * 0.28,
        y: centerY + (Math.random() - 0.5) * 0.24,
        z: centerZ + (Math.random() - 0.5) * 0.28,
        vx: velocity.x,
        vy: velocity.y,
        vz: velocity.z,
        life: totalLife,
        totalLife,
        color: tintParticle(baseColor, kind, i),
      });
    }

    const effects = effectsRef.current;
    effects.push({ id: `use_${effectSequence++}`, kind, particles });
    if (effects.length > MAX_EFFECTS) {
      effects.splice(0, effects.length - MAX_EFFECTS);
    }
  }, []);

  useEffect(() => {
    registerBlockUseEffectSpawner(spawnEffect);
    return () => registerBlockUseEffectSpawner(() => {});
  }, [spawnEffect]);

  useFrame((_, delta) => {
    const effects = effectsRef.current;
    if (effects.length === 0) {
      geometry.setDrawRange(0, 0);
      return;
    }

    const dt = Math.min(delta, 0.05);
    for (let i = effects.length - 1; i >= 0; i--) {
      if (effects[i].particles.every((particle) => particle.life <= 0)) {
        effects.splice(i, 1);
      }
    }

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colorAttr.array as Float32Array;
    let particleIndex = 0;

    for (const effect of effects) {
      const gravity = effect.kind === 'liquid' ? -3.2 : effect.kind === 'explosive' ? -4.5 : -1.2;
      const drag = effect.kind === 'rail' ? 0.93 : 0.96;
      for (const particle of effect.particles) {
        if (particle.life <= 0 || particleIndex >= MAX_PARTICLES) continue;
        particle.vy += gravity * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.z += particle.vz * dt;
        particle.vx *= drag;
        particle.vz *= drag;
        particle.life -= dt;

        const alpha = Math.max(0, particle.life / particle.totalLife);
        const i3 = particleIndex * 3;
        positions[i3] = particle.x;
        positions[i3 + 1] = particle.y;
        positions[i3 + 2] = particle.z;
        colors[i3] = particle.color.r * alpha;
        colors[i3 + 1] = particle.color.g * alpha;
        colors[i3 + 2] = particle.color.b * alpha;
        particleIndex++;
      }
    }

    geometry.setDrawRange(0, particleIndex);
    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  });

  return <points geometry={geometry} material={material} />;
}
