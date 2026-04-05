// モブ死亡エフェクトコンポーネント
// ゾンビが倒された時にパーティクルが飛び散る演出

import { useRef, useMemo, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MobType } from '../stores/useMobStore';
import { registerMobDeathEffectSpawner } from '../utils/effectTriggers';

/** モブタイプごとのパーティクル色 */
const MOB_COLORS: Record<MobType, THREE.Color> = {
  zombie: new THREE.Color(0x4a6741),
  prototype: new THREE.Color(0x8888cc),
  chicken: new THREE.Color(0xf5f5f0),
  spider: new THREE.Color(0x2a2a2a),
  iron_golem: new THREE.Color(0xaaaaaa),
};

interface DeathParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; size: number;
  color: THREE.Color;
}

interface DeathEffect {
  id: string;
  particles: DeathParticle[];
}

const PARTICLE_LIFETIME = 1.0;
const PARTICLES_PER_DEATH = 20;
const PARTICLE_GRAVITY = -12;
const MAX_EFFECTS = 8;

let effectIdCounter = 0;

export function MobDeathEffect() {
  const effectsRef = useRef<DeathEffect[]>([]);
  const pointsRef = useRef<THREE.Points>(null);
  const maxParticles = MAX_EFFECTS * PARTICLES_PER_DEATH;

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(maxParticles * 3);
    const colors = new Float32Array(maxParticles * 3);
    const sizes = new Float32Array(maxParticles);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setDrawRange(0, 0);
    return geo;
  }, [maxParticles]);

  const material = useMemo(() => {
    return new THREE.PointsMaterial({
      size: 0.2, vertexColors: true, transparent: true,
      opacity: 0.95, sizeAttenuation: true, depthWrite: false,
    });
  }, []);

  const spawnEffect = useCallback((mobType: MobType, x: number, y: number, z: number) => {
    const baseColor = MOB_COLORS[mobType] || MOB_COLORS.zombie;
    const particles: DeathParticle[] = [];
    const centerY = y + 0.9;

    for (let i = 0; i < PARTICLES_PER_DEATH; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI - Math.PI / 2;
      const speed = 3 + Math.random() * 5;

      const variation = new THREE.Color().copy(baseColor);
      const hsl = { h: 0, s: 0, l: 0 };
      variation.getHSL(hsl);

      if (Math.random() < 0.3) {
        variation.setHSL(0, 0.7, 0.3 + Math.random() * 0.2);
      } else {
        hsl.l = Math.max(0.1, Math.min(0.8, hsl.l + (Math.random() - 0.5) * 0.4));
        variation.setHSL(hsl.h, hsl.s, hsl.l);
      }

      particles.push({
        x: x + (Math.random() - 0.5) * 0.4,
        y: centerY + (Math.random() - 0.5) * 0.6,
        z: z + (Math.random() - 0.5) * 0.4,
        vx: Math.cos(theta) * Math.cos(phi) * speed,
        vy: Math.sin(phi) * speed + 3,
        vz: Math.sin(theta) * Math.cos(phi) * speed,
        life: PARTICLE_LIFETIME * (0.5 + Math.random() * 0.5),
        size: 0.1 + Math.random() * 0.15,
        color: variation,
      });
    }

    const effect: DeathEffect = {
      id: `death_${effectIdCounter++}`,
      particles,
    };

    const effects = effectsRef.current;
    effects.push(effect);
    if (effects.length > MAX_EFFECTS) {
      effects.splice(0, effects.length - MAX_EFFECTS);
    }
  }, []);

  // グローバルトリガーに登録
  useEffect(() => {
    registerMobDeathEffectSpawner(spawnEffect);
    return () => registerMobDeathEffectSpawner(() => {});
  }, [spawnEffect]);

  useFrame((_, delta) => {
    const effects = effectsRef.current;
    if (effects.length === 0) {
      geometry.setDrawRange(0, 0);
      return;
    }

    const dt = Math.min(delta, 0.05);

    for (let i = effects.length - 1; i >= 0; i--) {
      let allDead = true;
      for (const p of effects[i].particles) {
        if (p.life > 0) { allDead = false; break; }
      }
      if (allDead) effects.splice(i, 1);
    }

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    const sizeAttr = geometry.getAttribute('size') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colAttr.array as Float32Array;
    const sizes = sizeAttr.array as Float32Array;

    let idx = 0;

    for (const effect of effects) {
      for (const p of effect.particles) {
        if (p.life <= 0) continue;
        p.vy += PARTICLE_GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.life -= dt;
        p.vx *= 0.96;
        p.vz *= 0.96;

        if (idx >= maxParticles) break;

        const i3 = idx * 3;
        positions[i3] = p.x;
        positions[i3 + 1] = p.y;
        positions[i3 + 2] = p.z;

        const alpha = Math.max(0, p.life / PARTICLE_LIFETIME);
        colors[i3] = p.color.r * alpha;
        colors[i3 + 1] = p.color.g * alpha;
        colors[i3 + 2] = p.color.b * alpha;

        sizes[idx] = p.size * (0.5 + alpha * 0.5);
        idx++;
      }
    }

    geometry.setDrawRange(0, idx);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry} material={material} />
  );
}
