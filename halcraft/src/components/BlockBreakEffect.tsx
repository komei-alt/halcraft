// ブロック破壊パーティクルエフェクトコンポーネント
// ブロックが壊れた時にそのブロックの色を反映した破片が飛び散る演出

import { useRef, useMemo, useCallback, useEffect, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BlockId } from '../types/blocks';
import { registerBlockBreakEffectSpawner } from '../utils/effectTriggers';
import { createSizedPointsMaterial } from '../utils/sizedPointsMaterial';
import { getBlockMaterialColorHex } from '../data/blockMaterials';
import { getPerformanceProfile } from '../utils/performance';
import { useSettingsStore } from '../stores/useSettingsStore';

/** ブロックのテクスチャから代表色を取得するキャッシュ */
const blockColorCache = new Map<number, THREE.Color>();

function getBlockColor(blockId: BlockId): THREE.Color {
  if (blockColorCache.has(blockId)) return blockColorCache.get(blockId)!;

  const color = new THREE.Color(getBlockMaterialColorHex(blockId));
  blockColorCache.set(blockId, color);
  return color;
}

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; totalLife: number; size: number;
  color: THREE.Color;
}

interface VoxelShard {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; rz: number;
  vrx: number; vry: number; vrz: number;
  life: number; totalLife: number; size: number;
  color: THREE.Color;
}

interface BreakRing {
  x: number; y: number; z: number;
  life: number; totalLife: number;
  startRadius: number;
  endRadius: number;
  color: THREE.Color;
  lift: number;
}

interface BreakEffect {
  id: string;
  particles: Particle[];
  shards: VoxelShard[];
  rings: BreakRing[];
}

const PARTICLE_LIFETIME = 0.9;
const SHARD_LIFETIME = 1.05;
const DUST_PER_BREAK = 24;
const SHARDS_PER_BREAK = 14;
const RINGS_PER_BREAK = 3;
const PARTICLE_GRAVITY = -15;
const SHARD_GRAVITY = -18;
const MAX_EFFECTS = 18;
const HORIZONTAL_RING_QUATERNION = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

let effectIdCounter = 0;

function createColorVariation(baseColor: THREE.Color, lightJitter = 0.3, saturationJitter = 0.2): THREE.Color {
  const colorVariation = new THREE.Color().copy(baseColor);
  const hsl = { h: 0, s: 0, l: 0 };
  colorVariation.getHSL(hsl);
  hsl.l = Math.max(0.1, Math.min(0.9, hsl.l + (Math.random() - 0.5) * lightJitter));
  hsl.s = Math.max(0, Math.min(1, hsl.s + (Math.random() - 0.5) * saturationJitter));
  colorVariation.setHSL(hsl.h, hsl.s, hsl.l);
  return colorVariation;
}

export function BlockBreakEffect() {
  useSettingsStore((state) => state.graphicsPreset);
  const profile = getPerformanceProfile();
  const effectsRef = useRef<BreakEffect[]>([]);
  const shardMeshRef = useRef<THREE.InstancedMesh>(null);
  const ringMeshRef = useRef<THREE.InstancedMesh>(null);
  const effectLimit = Math.max(4, Math.min(MAX_EFFECTS, Math.floor(profile.particleBudget / 42)));
  const maxParticles = effectLimit * DUST_PER_BREAK;
  const maxShards = effectLimit * SHARDS_PER_BREAK;
  const maxRings = effectLimit * RINGS_PER_BREAK;

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(maxParticles * 3);
    const colors = new Float32Array(maxParticles * 3);
    const sizes = new Float32Array(maxParticles);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('particleSize', new THREE.BufferAttribute(sizes, 1));
    geo.setDrawRange(0, 0);
    return geo;
  }, [maxParticles]);

  const shardGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const ringGeometry = useMemo(() => new THREE.RingGeometry(1, 1.14, 56), []);

  const shardMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.02,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
    depthTest: true,
  }), []);

  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), []);

  const dummyObject = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  const material = useMemo(() => createSizedPointsMaterial({
    size: 0.15,
    opacity: 0.9,
  }), []);

  useLayoutEffect(() => {
    for (const mesh of [shardMeshRef.current, ringMeshRef.current]) {
      if (!mesh) continue;
      mesh.count = 0;
      mesh.visible = false;
    }
  }, []);

  const spawnEffect = useCallback((blockId: BlockId, x: number, y: number, z: number) => {
    const baseColor = getBlockColor(blockId);
    const particles: Particle[] = [];
    const shards: VoxelShard[] = [];
    const rings: BreakRing[] = [];
    const centerX = x + 0.5;
    const centerY = y + 0.5;
    const centerZ = z + 0.5;

    for (let i = 0; i < DUST_PER_BREAK; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI - Math.PI / 2;
      const speed = 2 + Math.random() * 4;
      const totalLife = PARTICLE_LIFETIME * (0.55 + Math.random() * 0.55);

      particles.push({
        x: centerX + (Math.random() - 0.5) * 0.3,
        y: centerY + (Math.random() - 0.5) * 0.3,
        z: centerZ + (Math.random() - 0.5) * 0.3,
        vx: Math.cos(theta) * Math.cos(phi) * speed,
        vy: Math.sin(phi) * speed + 2,
        vz: Math.sin(theta) * Math.cos(phi) * speed,
        life: totalLife,
        totalLife,
        size: 0.08 + Math.random() * 0.1,
        color: createColorVariation(baseColor, 0.34, 0.24),
      });
    }

    for (let i = 0; i < SHARDS_PER_BREAK; i++) {
      const theta = Math.random() * Math.PI * 2;
      const upward = 0.45 + Math.random() * 0.95;
      const speed = 1.6 + Math.random() * 3.2;
      const totalLife = SHARD_LIFETIME * (0.68 + Math.random() * 0.52);
      shards.push({
        x: centerX + (Math.random() - 0.5) * 0.48,
        y: centerY + (Math.random() - 0.5) * 0.42,
        z: centerZ + (Math.random() - 0.5) * 0.48,
        vx: Math.cos(theta) * speed,
        vy: upward * (2.3 + Math.random() * 2.4),
        vz: Math.sin(theta) * speed,
        rx: Math.random() * Math.PI * 2,
        ry: Math.random() * Math.PI * 2,
        rz: Math.random() * Math.PI * 2,
        vrx: (Math.random() - 0.5) * 11,
        vry: (Math.random() - 0.5) * 13,
        vrz: (Math.random() - 0.5) * 11,
        life: totalLife,
        totalLife,
        size: 0.12 + Math.random() * 0.16,
        color: createColorVariation(baseColor, 0.22, 0.12),
      });
    }

    const ringBase = createColorVariation(baseColor, 0.18, 0.08).lerp(new THREE.Color(0xffffff), 0.24);
    rings.push({
      x: centerX,
      y: y + 0.04,
      z: centerZ,
      life: 0.42,
      totalLife: 0.42,
      startRadius: 0.18,
      endRadius: 1.08,
      color: ringBase,
      lift: 0.08,
    });
    rings.push({
      x: centerX,
      y: centerY,
      z: centerZ,
      life: 0.32,
      totalLife: 0.32,
      startRadius: 0.12,
      endRadius: 0.68,
      color: ringBase.clone().lerp(new THREE.Color(0xffffff), 0.16),
      lift: 0.18,
    });

    const effect: BreakEffect = {
      id: `brk_${effectIdCounter++}`,
      particles,
      shards,
      rings,
    };

    const effects = effectsRef.current;
    effects.push(effect);
    if (effects.length > effectLimit) {
      effects.splice(0, effects.length - effectLimit);
    }
  }, [effectLimit]);

  // グローバルトリガーに登録
  useEffect(() => {
    registerBlockBreakEffectSpawner(spawnEffect);
    return () => registerBlockBreakEffectSpawner(() => {});
  }, [spawnEffect]);

  useFrame((_, delta) => {
    const effects = effectsRef.current;
    if (effects.length === 0) {
      geometry.setDrawRange(0, 0);
      if (shardMeshRef.current) shardMeshRef.current.count = 0;
      if (ringMeshRef.current) ringMeshRef.current.count = 0;
      return;
    }

    const clampedDelta = Math.min(delta, 0.05);

    for (let i = effects.length - 1; i >= 0; i--) {
      let allDead = true;
      for (const p of effects[i].particles) {
        if (p.life > 0) { allDead = false; break; }
      }
      if (allDead) {
        for (const shard of effects[i].shards) {
          if (shard.life > 0) { allDead = false; break; }
        }
      }
      if (allDead) {
        for (const ring of effects[i].rings) {
          if (ring.life > 0) { allDead = false; break; }
        }
      }
      if (allDead) effects.splice(i, 1);
    }

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    const sizeAttr = geometry.getAttribute('particleSize') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colAttr.array as Float32Array;
    const sizes = sizeAttr.array as Float32Array;

    let idx = 0;
    let shardIdx = 0;
    let ringIdx = 0;

    for (const effect of effects) {
      for (const ring of effect.rings) {
        if (ring.life <= 0 || ringIdx >= maxRings || !ringMeshRef.current) continue;

        ring.life -= clampedDelta;
        const progress = 1 - Math.max(0, ring.life / ring.totalLife);
        const alpha = Math.max(0, ring.life / ring.totalLife);
        const radius = THREE.MathUtils.lerp(ring.startRadius, ring.endRadius, progress);
        dummyObject.position.set(ring.x, ring.y + ring.lift * progress, ring.z);
        dummyObject.quaternion.copy(HORIZONTAL_RING_QUATERNION);
        dummyObject.scale.setScalar(radius);
        dummyObject.updateMatrix();
        ringMeshRef.current.setMatrixAt(ringIdx, dummyObject.matrix);
        tempColor.copy(ring.color).multiplyScalar(alpha * 0.88);
        ringMeshRef.current.setColorAt(ringIdx, tempColor);
        ringIdx++;
      }

      for (const shard of effect.shards) {
        if (shard.life <= 0 || shardIdx >= maxShards) continue;

        shard.vy += SHARD_GRAVITY * clampedDelta;
        shard.x += shard.vx * clampedDelta;
        shard.y += shard.vy * clampedDelta;
        shard.z += shard.vz * clampedDelta;
        shard.rx += shard.vrx * clampedDelta;
        shard.ry += shard.vry * clampedDelta;
        shard.rz += shard.vrz * clampedDelta;
        shard.life -= clampedDelta;
        shard.vx *= 0.965;
        shard.vy *= 0.985;
        shard.vz *= 0.965;

        const alpha = Math.max(0, shard.life / shard.totalLife);
        // 色を暗くせず、スケールでフェードアウトして黒く残らないようにする
        const scale = shard.size * Math.max(0.02, alpha * alpha);
        dummyObject.position.set(shard.x, shard.y, shard.z);
        dummyObject.rotation.set(shard.rx, shard.ry, shard.rz);
        dummyObject.scale.set(scale, scale * (0.78 + alpha * 0.22), scale);
        dummyObject.updateMatrix();
        tempColor.copy(shard.color);
        if (shardMeshRef.current) {
          shardMeshRef.current.setMatrixAt(shardIdx, dummyObject.matrix);
          shardMeshRef.current.setColorAt(shardIdx, tempColor);
        }
        shardIdx++;
      }

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

        const alpha = Math.max(0, p.life / p.totalLife);
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

    if (shardMeshRef.current) {
      shardMeshRef.current.count = shardIdx;
      shardMeshRef.current.visible = shardIdx > 0;
      shardMeshRef.current.instanceMatrix.needsUpdate = true;
      if (shardMeshRef.current.instanceColor) shardMeshRef.current.instanceColor.needsUpdate = true;
    }
    if (ringMeshRef.current) {
      ringMeshRef.current.count = ringIdx;
      ringMeshRef.current.visible = ringIdx > 0;
      ringMeshRef.current.instanceMatrix.needsUpdate = true;
      if (ringMeshRef.current.instanceColor) ringMeshRef.current.instanceColor.needsUpdate = true;
    }

    material.opacity = 0.9;
  });

  return (
    <>
      <instancedMesh
        ref={ringMeshRef}
        args={[ringGeometry, ringMaterial, maxRings]}
        frustumCulled={false}
        renderOrder={3}
      />
      <instancedMesh
        ref={shardMeshRef}
        args={[shardGeometry, shardMaterial, maxShards]}
        frustumCulled={false}
      />
      <points geometry={geometry} material={material} frustumCulled={false} />
    </>
  );
}
