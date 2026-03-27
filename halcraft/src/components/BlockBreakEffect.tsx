// ブロック破壊パーティクルエフェクトコンポーネント
// ブロックが壊れた時にそのブロックの色を反映した破片が飛び散る演出

import { useRef, useMemo, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_DEFS, type BlockId } from '../types/blocks';
import { registerBlockBreakEffectSpawner } from '../utils/effectTriggers';

/** ブロックのテクスチャから代表色を取得するキャッシュ */
const blockColorCache = new Map<number, THREE.Color>();

function getBlockColor(blockId: BlockId): THREE.Color {
  if (blockColorCache.has(blockId)) return blockColorCache.get(blockId)!;

  const def = BLOCK_DEFS[blockId];
  if (!def) {
    const fallback = new THREE.Color(0x888888);
    blockColorCache.set(blockId, fallback);
    return fallback;
  }

  if (def.emissiveColor) {
    blockColorCache.set(blockId, def.emissiveColor.clone());
    return def.emissiveColor.clone();
  }

  const colorMap: Record<string, number> = {
    'grass.png': 0x5a8f29, 'grass_top.png': 0x5a8f29, 'grass_side.png': 0x6b7a54,
    'dirt.png': 0x8b6914, 'wood.png': 0x9c7a4a, 'iron.png': 0xb0b0b0,
    'iron_cracked.png': 0x909090, 'iron_mossy.png': 0x7a9a7a, 'bedrock.png': 0x555555,
    'raw_wood.png': 0x7a5a3a, 'glass.png': 0xaaddff, 'enchant.png': 0x6633cc,
    'electric.png': 0x00ddff, 'spawner.png': 0xff4422, 'stairs.png': 0x9c7a4a,
    'torch.png': 0xff8833, 'bed.png': 0xcc4444,
  };

  const texName = def.faceTextures?.top || def.texture;
  const hex = colorMap[texName] ?? 0x888888;
  const color = new THREE.Color(hex);
  blockColorCache.set(blockId, color);
  return color;
}

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; size: number;
  color: THREE.Color;
}

interface BreakEffect {
  id: string;
  particles: Particle[];
  startTime: number;
}

const PARTICLE_LIFETIME = 0.8;
const PARTICLES_PER_BREAK = 12;
const PARTICLE_GRAVITY = -15;
const MAX_EFFECTS = 16;

let effectIdCounter = 0;

export function BlockBreakEffect() {
  const effectsRef = useRef<BreakEffect[]>([]);
  const pointsRef = useRef<THREE.Points>(null);
  const maxParticles = MAX_EFFECTS * PARTICLES_PER_BREAK;

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
      size: 0.15, vertexColors: true, transparent: true,
      opacity: 0.9, sizeAttenuation: true, depthWrite: false,
    });
  }, []);

  const spawnEffect = useCallback((blockId: BlockId, x: number, y: number, z: number) => {
    const baseColor = getBlockColor(blockId);
    const particles: Particle[] = [];
    const centerX = x + 0.5;
    const centerY = y + 0.5;
    const centerZ = z + 0.5;

    for (let i = 0; i < PARTICLES_PER_BREAK; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI - Math.PI / 2;
      const speed = 2 + Math.random() * 4;

      const colorVariation = new THREE.Color().copy(baseColor);
      const hsl = { h: 0, s: 0, l: 0 };
      colorVariation.getHSL(hsl);
      hsl.l = Math.max(0.1, Math.min(0.9, hsl.l + (Math.random() - 0.5) * 0.3));
      hsl.s = Math.max(0, Math.min(1, hsl.s + (Math.random() - 0.5) * 0.2));
      colorVariation.setHSL(hsl.h, hsl.s, hsl.l);

      particles.push({
        x: centerX + (Math.random() - 0.5) * 0.3,
        y: centerY + (Math.random() - 0.5) * 0.3,
        z: centerZ + (Math.random() - 0.5) * 0.3,
        vx: Math.cos(theta) * Math.cos(phi) * speed,
        vy: Math.sin(phi) * speed + 2,
        vz: Math.sin(theta) * Math.cos(phi) * speed,
        life: PARTICLE_LIFETIME * (0.6 + Math.random() * 0.4),
        size: 0.08 + Math.random() * 0.12,
        color: colorVariation,
      });
    }

    const effect: BreakEffect = {
      id: `brk_${effectIdCounter++}`,
      particles,
      startTime: performance.now(),
    };

    const effects = effectsRef.current;
    effects.push(effect);
    if (effects.length > MAX_EFFECTS) {
      effects.splice(0, effects.length - MAX_EFFECTS);
    }
  }, []);

  // グローバルトリガーに登録
  useEffect(() => {
    registerBlockBreakEffectSpawner(spawnEffect);
    return () => registerBlockBreakEffectSpawner(() => {});
  }, [spawnEffect]);

  useFrame((_, delta) => {
    const effects = effectsRef.current;
    if (effects.length === 0) {
      geometry.setDrawRange(0, 0);
      return;
    }

    const clampedDelta = Math.min(delta, 0.05);

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
        p.vy += PARTICLE_GRAVITY * clampedDelta;
        p.x += p.vx * clampedDelta;
        p.y += p.vy * clampedDelta;
        p.z += p.vz * clampedDelta;
        p.life -= clampedDelta;
        p.vx *= 0.97;
        p.vz *= 0.97;

        if (idx >= maxParticles) break;

        const i3 = idx * 3;
        positions[i3] = p.x;
        positions[i3 + 1] = p.y;
        positions[i3 + 2] = p.z;

        const alpha = Math.max(0, p.life / PARTICLE_LIFETIME);
        colors[i3] = p.color.r * alpha;
        colors[i3 + 1] = p.color.g * alpha;
        colors[i3 + 2] = p.color.b * alpha;

        sizes[idx] = p.size * alpha;
        idx++;
      }
    }

    geometry.setDrawRange(0, idx);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;

    material.opacity = 0.9;
  });

  return (
    <points ref={pointsRef} geometry={geometry} material={material} />
  );
}
