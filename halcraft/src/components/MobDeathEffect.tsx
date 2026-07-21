// モブ死亡エフェクトコンポーネント
// 敵を倒した瞬間に、粉じん・ボクセル破片・地面を走る衝撃波を出す

import { useRef, useMemo, useCallback, useEffect, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MobType } from '../stores/useMobStore';
import { registerMobDeathEffectSpawner } from '../utils/effectTriggers';

/** モブタイプごとのエフェクト色 */
const MOB_COLORS: Record<MobType, THREE.Color> = {
  zombie: new THREE.Color(0x4a6741),
  darwin: new THREE.Color(0x7c4dff),
  prototype: new THREE.Color(0x8888cc),
  chicken: new THREE.Color(0xffffff),
  spider: new THREE.Color(0x8267c8),
  iron_golem: new THREE.Color(0xd4dde4),
  boss_giant: new THREE.Color(0xff3333),
};

interface DeathDust {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  totalLife: number;
  color: THREE.Color;
}

interface DeathShard {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  angularVelocity: THREE.Vector3;
  life: number;
  totalLife: number;
  size: number;
  color: THREE.Color;
}

interface DeathWave {
  x: number; y: number; z: number;
  elapsed: number;
  delay: number;
  life: number;
  startRadius: number;
  endRadius: number;
  color: THREE.Color;
}

interface DeathEffect {
  id: string;
  dust: DeathDust[];
  shards: DeathShard[];
  waves: DeathWave[];
}

const DUST_LIFETIME = 0.86;
const SHARD_LIFETIME = 1.05;
const WAVE_LIFETIME = 0.48;
const DUST_PER_DEATH = 24;
const SHARDS_PER_DEATH = 10;
const WAVES_PER_DEATH = 2;
const BOSS_DUST_BONUS = 16;
const BOSS_SHARD_BONUS = 6;
const DUST_GRAVITY = -10;
const SHARD_GRAVITY = -14;
const MAX_EFFECTS = 8;

const shardGeometry = new THREE.BoxGeometry(1, 1, 1);
const waveGeometry = new THREE.RingGeometry(1, 1.18, 56);

let effectIdCounter = 0;

function getMobScale(mobType: MobType): number {
  if (mobType === 'boss_giant') return 1.34;
  if (mobType === 'iron_golem' || mobType === 'prototype') return 1.12;
  if (mobType === 'chicken') return 0.58;
  if (mobType === 'spider') return 0.86;
  return 1;
}

function getDustCount(mobType: MobType): number {
  return DUST_PER_DEATH + (mobType === 'boss_giant' ? BOSS_DUST_BONUS : 0);
}

function getShardCount(mobType: MobType): number {
  return SHARDS_PER_DEATH + (mobType === 'boss_giant' ? BOSS_SHARD_BONUS : 0);
}

function createColorVariation(baseColor: THREE.Color, mobType: MobType): THREE.Color {
  const color = baseColor.clone();
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);

  if (mobType === 'boss_giant' && Math.random() < 0.34) {
    return new THREE.Color(0xffc45a).lerp(new THREE.Color(0xffffff), Math.random() * 0.16);
  }
  if (mobType === 'spider' && Math.random() < 0.26) {
    return new THREE.Color(0x8b4dff).lerp(new THREE.Color(0xffffff), Math.random() * 0.14);
  }
  if (mobType === 'iron_golem' && Math.random() < 0.34) {
    return new THREE.Color(0xa7c7d8).lerp(new THREE.Color(0xffffff), Math.random() * 0.24);
  }

  hsl.s = THREE.MathUtils.clamp(hsl.s + (Math.random() - 0.5) * 0.22, 0.08, 0.95);
  hsl.l = THREE.MathUtils.clamp(hsl.l + (Math.random() - 0.5) * 0.34, 0.38, 0.86);
  color.setHSL(hsl.h, hsl.s, hsl.l);
  return color;
}

export function MobDeathEffect() {
  const effectsRef = useRef<DeathEffect[]>([]);
  const pointsRef = useRef<THREE.Points>(null);
  const shardMeshRef = useRef<THREE.InstancedMesh>(null);
  const waveMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummyObject = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);
  const shardLightColor = useMemo(() => new THREE.Color(0xffffff), []);
  const maxDust = MAX_EFFECTS * (DUST_PER_DEATH + BOSS_DUST_BONUS);
  const maxShards = MAX_EFFECTS * (SHARDS_PER_DEATH + BOSS_SHARD_BONUS);
  const maxWaves = MAX_EFFECTS * WAVES_PER_DEATH;

  const dustGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxDust * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxDust * 3), 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, [maxDust]);

  const dustMaterial = useMemo(() => new THREE.PointsMaterial({
    size: 0.16,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  }), []);

  const shardMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
    vertexColors: true,
  }), []);

  const waveMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  }), []);

  useLayoutEffect(() => {
    for (const mesh of [shardMeshRef.current, waveMeshRef.current]) {
      if (!mesh) continue;
      mesh.count = 0;
      mesh.visible = false;
    }
  }, []);

  const spawnEffect = useCallback((mobType: MobType, x: number, y: number, z: number) => {
    const baseColor = MOB_COLORS[mobType] || MOB_COLORS.zombie;
    const burstScale = getMobScale(mobType);
    const centerY = y + 0.86 * burstScale;
    const dust: DeathDust[] = [];
    const shards: DeathShard[] = [];
    const waves: DeathWave[] = [];

    for (let i = 0; i < getDustCount(mobType); i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI - Math.PI / 2;
      const speed = (3.2 + Math.random() * 5.4) * burstScale;
      const life = DUST_LIFETIME * (0.55 + Math.random() * 0.55);

      dust.push({
        x: x + (Math.random() - 0.5) * 0.38 * burstScale,
        y: centerY + (Math.random() - 0.5) * 0.64 * burstScale,
        z: z + (Math.random() - 0.5) * 0.38 * burstScale,
        vx: Math.cos(theta) * Math.cos(phi) * speed,
        vy: Math.sin(phi) * speed + 2.8 * burstScale,
        vz: Math.sin(theta) * Math.cos(phi) * speed,
        life,
        totalLife: life,
        color: createColorVariation(baseColor, mobType),
      });
    }

    for (let i = 0; i < getShardCount(mobType); i++) {
      const angle = Math.random() * Math.PI * 2;
      const lift = 2.6 + Math.random() * 4.5;
      const sideSpeed = (1.5 + Math.random() * 4.2) * burstScale;
      const life = SHARD_LIFETIME * (0.62 + Math.random() * 0.42);

      shards.push({
        position: new THREE.Vector3(
          x + (Math.random() - 0.5) * 0.42 * burstScale,
          centerY + (Math.random() - 0.5) * 0.48 * burstScale,
          z + (Math.random() - 0.5) * 0.42 * burstScale,
        ),
        velocity: new THREE.Vector3(
          Math.cos(angle) * sideSpeed,
          lift * burstScale,
          Math.sin(angle) * sideSpeed,
        ),
        rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
        angularVelocity: new THREE.Vector3(
          (Math.random() - 0.5) * 7.2,
          (Math.random() - 0.5) * 7.8,
          (Math.random() - 0.5) * 7.2,
        ),
        life,
        totalLife: life,
        size: (0.045 + Math.random() * 0.065) * burstScale,
        color: createColorVariation(baseColor, mobType),
      });
    }

    for (let i = 0; i < WAVES_PER_DEATH; i++) {
      waves.push({
        x,
        y: y + 0.08 + i * 0.03,
        z,
        elapsed: 0,
        delay: i * 0.08,
        life: WAVE_LIFETIME * (1 + i * 0.2),
        startRadius: (0.38 + i * 0.26) * burstScale,
        endRadius: (2.3 + i * 1.2) * burstScale,
        color: createColorVariation(baseColor, mobType).lerp(new THREE.Color(0xffffff), mobType === 'boss_giant' ? 0.18 : 0.28),
      });
    }

    const effects = effectsRef.current;
    effects.push({ id: `death_${effectIdCounter++}`, dust, shards, waves });
    if (effects.length > MAX_EFFECTS) {
      effects.splice(0, effects.length - MAX_EFFECTS);
    }
  }, []);

  useEffect(() => {
    registerMobDeathEffectSpawner(spawnEffect);
    return () => registerMobDeathEffectSpawner(() => {});
  }, [spawnEffect]);

  useFrame((_, delta) => {
    const effects = effectsRef.current;
    if (effects.length === 0) {
      dustGeometry.setDrawRange(0, 0);
      if (shardMeshRef.current) shardMeshRef.current.count = 0;
      if (waveMeshRef.current) waveMeshRef.current.count = 0;
      return;
    }

    const dt = Math.min(delta, 0.05);
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      const dustAlive = effect.dust.some((p) => p.life > 0);
      const shardsAlive = effect.shards.some((s) => s.life > 0);
      const wavesAlive = effect.waves.some((w) => w.elapsed < w.delay + w.life);
      if (!dustAlive && !shardsAlive && !wavesAlive) effects.splice(i, 1);
    }

    const posAttr = dustGeometry.getAttribute('position') as THREE.BufferAttribute;
    const colorAttr = dustGeometry.getAttribute('color') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colorAttr.array as Float32Array;
    let dustIndex = 0;
    let shardIndex = 0;
    let waveIndex = 0;

    for (const effect of effects) {
      for (const p of effect.dust) {
        if (p.life <= 0 || dustIndex >= maxDust) continue;

        p.vy += DUST_GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx *= 0.92;
        p.vz *= 0.92;
        p.life -= dt;

        const alpha = THREE.MathUtils.clamp(p.life / p.totalLife, 0, 1);
        const i3 = dustIndex * 3;
        positions[i3] = p.x;
        positions[i3 + 1] = p.y;
        positions[i3 + 2] = p.z;
        colors[i3] = p.color.r * alpha;
        colors[i3 + 1] = p.color.g * alpha;
        colors[i3 + 2] = p.color.b * alpha;
        dustIndex++;
      }

      for (const shard of effect.shards) {
        if (shard.life <= 0 || shardIndex >= maxShards || !shardMeshRef.current) continue;

        shard.velocity.y += SHARD_GRAVITY * dt;
        shard.position.addScaledVector(shard.velocity, dt);
        shard.velocity.x *= 0.93;
        shard.velocity.z *= 0.93;
        shard.rotation.x += shard.angularVelocity.x * dt;
        shard.rotation.y += shard.angularVelocity.y * dt;
        shard.rotation.z += shard.angularVelocity.z * dt;
        shard.life -= dt;

        const alpha = THREE.MathUtils.clamp(shard.life / shard.totalLife, 0, 1);
        const scale = shard.size * (0.65 + alpha * 0.35);
        dummyObject.position.copy(shard.position);
        dummyObject.rotation.copy(shard.rotation);
        dummyObject.scale.setScalar(scale);
        dummyObject.updateMatrix();
        shardMeshRef.current.setMatrixAt(shardIndex, dummyObject.matrix);
        tempColor.copy(shard.color).lerp(shardLightColor, 0.18).multiplyScalar(0.45 + alpha * 0.55);
        shardMeshRef.current.setColorAt(shardIndex, tempColor);
        shardIndex++;
      }

      for (const wave of effect.waves) {
        wave.elapsed += dt;
        if (wave.elapsed < wave.delay || wave.elapsed >= wave.delay + wave.life || waveIndex >= maxWaves || !waveMeshRef.current) {
          continue;
        }

        const progress = (wave.elapsed - wave.delay) / wave.life;
        const alpha = 1 - progress;
        const radius = THREE.MathUtils.lerp(wave.startRadius, wave.endRadius, progress);
        dummyObject.position.set(wave.x, wave.y, wave.z);
        dummyObject.rotation.set(-Math.PI / 2, 0, 0);
        dummyObject.scale.setScalar(radius);
        dummyObject.updateMatrix();
        waveMeshRef.current.setMatrixAt(waveIndex, dummyObject.matrix);
        tempColor.copy(wave.color).multiplyScalar(alpha);
        waveMeshRef.current.setColorAt(waveIndex, tempColor);
        waveIndex++;
      }
    }

    dustGeometry.setDrawRange(0, dustIndex);
    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;

    if (shardMeshRef.current) {
      shardMeshRef.current.count = shardIndex;
      shardMeshRef.current.visible = shardIndex > 0;
      shardMeshRef.current.instanceMatrix.needsUpdate = true;
      if (shardMeshRef.current.instanceColor) shardMeshRef.current.instanceColor.needsUpdate = true;
    }
    if (waveMeshRef.current) {
      waveMeshRef.current.count = waveIndex;
      waveMeshRef.current.visible = waveIndex > 0;
      waveMeshRef.current.instanceMatrix.needsUpdate = true;
      if (waveMeshRef.current.instanceColor) waveMeshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh
        ref={waveMeshRef}
        args={[waveGeometry, waveMaterial, maxWaves]}
        frustumCulled={false}
        renderOrder={3}
      />
      <instancedMesh
        ref={shardMeshRef}
        args={[shardGeometry, shardMaterial, maxShards]}
        frustumCulled={false}
      />
      <points ref={pointsRef} geometry={dustGeometry} material={dustMaterial} frustumCulled={false} />
    </>
  );
}
