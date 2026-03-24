// モブ死亡エフェクトコンポーネント
// ゾンビが倒された時にパーティクルが飛び散る演出
// BlockBreakEffectと同様のパターン

import { useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MobType } from '../stores/useMobStore';

/** モブタイプごとのパーティクル色 */
const MOB_COLORS: Record<MobType, THREE.Color> = {
  zombie: new THREE.Color(0x4a6741),      // ゾンビ色（暗い緑）
  prototype: new THREE.Color(0x8888cc),   // プロトタイプ色（青紫）
  chicken: new THREE.Color(0xf5f5f0),     // ニワトリ色（白）
  spider: new THREE.Color(0x2a2a2a),      // クモ色（黒）
};

/** パーティクル1個 */
interface DeathParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  color: THREE.Color;
}

/** 死亡エフェクト1件 */
interface DeathEffect {
  id: string;
  particles: DeathParticle[];
}

/** パーティクルの寿命（秒） */
const PARTICLE_LIFETIME = 1.0;
/** 1体あたりのパーティクル数 */
const PARTICLES_PER_DEATH = 20;
/** 重力 */
const PARTICLE_GRAVITY = -12;
/** 同時エフェクト上限 */
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
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
      depthWrite: false,
    });
  }, []);

  /** 死亡エフェクトを生成 */
  const spawnEffect = useCallback((mobType: MobType, x: number, y: number, z: number) => {
    const baseColor = MOB_COLORS[mobType] || MOB_COLORS.zombie;
    const particles: DeathParticle[] = [];
    const centerY = y + 0.9; // モブの中心

    for (let i = 0; i < PARTICLES_PER_DEATH; i++) {
      // 球状に飛散
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI - Math.PI / 2;
      const speed = 3 + Math.random() * 5;

      // 色にバリエーション（赤みがかった破片も混ぜる）
      const variation = new THREE.Color().copy(baseColor);
      const hsl = { h: 0, s: 0, l: 0 };
      variation.getHSL(hsl);

      // 一部パーティクルを赤く（血飛沫風）
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
        vy: Math.sin(phi) * speed + 3, // 上方向バイアス
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

  useFrame((_, delta) => {
    const effects = effectsRef.current;
    if (effects.length === 0) {
      geometry.setDrawRange(0, 0);
      return;
    }

    const dt = Math.min(delta, 0.05);

    // 期限切れエフェクトを削除
    for (let i = effects.length - 1; i >= 0; i--) {
      let allDead = true;
      for (const p of effects[i].particles) {
        if (p.life > 0) { allDead = false; break; }
      }
      if (allDead) {
        effects.splice(i, 1);
      }
    }

    // バッファ更新
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

        // 物理更新
        p.vy += PARTICLE_GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.life -= dt;

        // 空気抵抗
        p.vx *= 0.96;
        p.vz *= 0.96;

        if (idx >= maxParticles) break;

        const i3 = idx * 3;
        positions[i3] = p.x;
        positions[i3 + 1] = p.y;
        positions[i3 + 2] = p.z;

        // フェードアウト
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

  // グローバルアクセス
  MobDeathEffect.spawnEffect = spawnEffect;

  return (
    <points ref={pointsRef} geometry={geometry} material={material} />
  );
}

/** 外部からエフェクトをトリガーする静的メソッド */
MobDeathEffect.spawnEffect = (_mobType: MobType, _x: number, _y: number, _z: number) => {
  // 初期化前のフォールバック
};
