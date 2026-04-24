// 近接攻撃ヒット時の火花エフェクト
// ダメージポップアップとは別に、当たった場所を一瞬だけ光らせる

import { useRef, useMemo, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerHitImpactEffectSpawner } from '../utils/effectTriggers';

interface HitParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

interface HitImpact {
  id: string;
  particles: HitParticle[];
}

const MAX_IMPACTS = 12;
const PARTICLES_PER_HIT = 14;
const CRITICAL_PARTICLE_BONUS = 8;
const PARTICLE_GRAVITY = -8;
const UP = new THREE.Vector3(0, 1, 0);

let impactIdCounter = 0;

export function HitImpactEffect() {
  const impactsRef = useRef<HitImpact[]>([]);
  const pointsRef = useRef<THREE.Points>(null);
  const maxParticles = MAX_IMPACTS * (PARTICLES_PER_HIT + CRITICAL_PARTICLE_BONUS);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxParticles * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxParticles * 3), 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, [maxParticles]);

  const material = useMemo(() => new THREE.PointsMaterial({
    size: 0.11,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  const spawnImpact = useCallback((
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    isCritical: boolean,
  ) => {
    const hitDir = new THREE.Vector3(dirX, dirY, dirZ);
    if (hitDir.lengthSq() < 0.001) hitDir.set(0, 0, -1);
    hitDir.normalize();

    const tangent = new THREE.Vector3().crossVectors(hitDir, UP);
    if (tangent.lengthSq() < 0.001) tangent.set(1, 0, 0);
    tangent.normalize();
    const bitangent = new THREE.Vector3().crossVectors(hitDir, tangent).normalize();

    const particles: HitParticle[] = [];
    const count = PARTICLES_PER_HIT + (isCritical ? CRITICAL_PARTICLE_BONUS : 0);
    const baseColor = isCritical ? new THREE.Color(0xffd15c) : new THREE.Color(0xfff1b8);
    const accentColor = isCritical ? new THREE.Color(0xff4a4a) : new THREE.Color(0xff7a3d);

    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 2;
      const lift = Math.random() * 0.8;
      const burst = 2.5 + Math.random() * (isCritical ? 5.5 : 3.5);
      const side = tangent.clone().multiplyScalar(spread * burst * 0.45);
      const up = bitangent.clone().multiplyScalar((lift - 0.1) * burst * 0.5);
      const recoil = hitDir.clone().multiplyScalar(-burst * (0.35 + Math.random() * 0.35));
      const vel = side.add(up).add(recoil);

      const color = Math.random() < 0.35 ? accentColor.clone() : baseColor.clone();
      color.lerp(new THREE.Color(0xffffff), Math.random() * 0.25);

      particles.push({
        x: x + (Math.random() - 0.5) * 0.12,
        y: y + (Math.random() - 0.5) * 0.12,
        z: z + (Math.random() - 0.5) * 0.12,
        vx: vel.x,
        vy: vel.y,
        vz: vel.z,
        life: isCritical ? 0.42 + Math.random() * 0.16 : 0.28 + Math.random() * 0.14,
        maxLife: isCritical ? 0.56 : 0.38,
        size: isCritical ? 0.14 : 0.1,
        color,
      });
    }

    const impacts = impactsRef.current;
    impacts.push({ id: `hit_${impactIdCounter++}`, particles });
    if (impacts.length > MAX_IMPACTS) {
      impacts.splice(0, impacts.length - MAX_IMPACTS);
    }
  }, []);

  useEffect(() => {
    registerHitImpactEffectSpawner(spawnImpact);
    return () => registerHitImpactEffectSpawner(() => {});
  }, [spawnImpact]);

  useFrame((_, delta) => {
    const impacts = impactsRef.current;
    if (impacts.length === 0) {
      geometry.setDrawRange(0, 0);
      return;
    }

    const dt = Math.min(delta, 0.05);
    for (let i = impacts.length - 1; i >= 0; i--) {
      let allDead = true;
      for (const p of impacts[i].particles) {
        if (p.life > 0) { allDead = false; break; }
      }
      if (allDead) impacts.splice(i, 1);
    }

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colorAttr.array as Float32Array;
    let idx = 0;

    for (const impact of impacts) {
      for (const p of impact.particles) {
        if (p.life <= 0 || idx >= maxParticles) continue;

        p.vy += PARTICLE_GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx *= 0.9;
        p.vz *= 0.9;
        p.life -= dt;

        const alpha = Math.max(0, p.life / p.maxLife);
        const i3 = idx * 3;
        positions[i3] = p.x;
        positions[i3 + 1] = p.y;
        positions[i3 + 2] = p.z;
        colors[i3] = p.color.r * alpha;
        colors[i3 + 1] = p.color.g * alpha;
        colors[i3 + 2] = p.color.b * alpha;
        idx++;
      }
    }

    geometry.setDrawRange(0, idx);
    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}
