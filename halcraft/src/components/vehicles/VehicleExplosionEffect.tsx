// 乗り物爆発エフェクトコンポーネント
// 乗り物が破壊された時の超派手な爆発演出
// 火花・金属破片・黒煙・衝撃波リングの4層パーティクル

import { useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VehicleType } from '../../stores/useVehicleStore';
import { registerVehicleExplosionSpawner } from '../../utils/effectTriggers';

/** 乗り物タイプごとの爆発色 */
const EXPLOSION_COLORS: Record<VehicleType, { fire: THREE.Color; metal: THREE.Color; smoke: THREE.Color }> = {
  helicopter: {
    fire: new THREE.Color(0xff4400),
    metal: new THREE.Color(0xcc3333),
    smoke: new THREE.Color(0x222222),
  },
  tank: {
    fire: new THREE.Color(0xff6600),
    metal: new THREE.Color(0x556655),
    smoke: new THREE.Color(0x1a1a1a),
  },
  airplane: {
    fire: new THREE.Color(0xffaa00),
    metal: new THREE.Color(0xaaaacc),
    smoke: new THREE.Color(0x333333),
  },
  car: {
    fire: new THREE.Color(0xff5500),
    metal: new THREE.Color(0x444444),
    smoke: new THREE.Color(0x282828),
  },
};

interface ExplosionParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  size: number;
  color: THREE.Color;
  /** パーティクル種類: fire=火花, metal=金属片, smoke=煙 */
  kind: 'fire' | 'metal' | 'smoke';
}

interface FireballState {
  id: string;
  cx: number; cy: number; cz: number;
  shockwaveProgress: number;
  fireballLife: number;
}

interface ExplosionEffectInternal {
  id: string;
  particles: ExplosionParticle[];
  shockwaveProgress: number;
  cx: number; cy: number; cz: number;
  fireballLife: number;
}

const FIRE_PARTICLES = 40;
const METAL_PARTICLES = 25;
const SMOKE_PARTICLES = 30;
const TOTAL_PARTICLES = FIRE_PARTICLES + METAL_PARTICLES + SMOKE_PARTICLES;
const PARTICLE_GRAVITY = -10;
const MAX_EFFECTS = 4;
const FIREBALL_DURATION = 0.8;
const SHOCKWAVE_DURATION = 0.6;

let effectIdCounter = 0;

export function VehicleExplosionEffect() {
  const effectsRef = useRef<ExplosionEffectInternal[]>([]);
  const pointsRef = useRef<THREE.Points>(null);
  const maxParticles = MAX_EFFECTS * TOTAL_PARTICLES;

  // 衝撃波リング + 火球を表示するための React state
  const [fireballs, setFireballs] = useState<FireballState[]>([]);

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
      size: 0.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  const spawnEffect = useCallback((type: VehicleType, x: number, y: number, z: number) => {
    const colors = EXPLOSION_COLORS[type];
    const particles: ExplosionParticle[] = [];
    const centerY = y + 1.2;

    // 火花パーティクル（明るく速い）
    for (let i = 0; i < FIRE_PARTICLES; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.8 - Math.PI * 0.1;
      const speed = 8 + Math.random() * 14;

      const variation = new THREE.Color().copy(colors.fire);
      const hsl = { h: 0, s: 0, l: 0 };
      variation.getHSL(hsl);
      hsl.l = Math.max(0.3, Math.min(0.9, hsl.l + (Math.random() - 0.3) * 0.5));
      hsl.h += (Math.random() - 0.5) * 0.08;
      variation.setHSL(hsl.h, hsl.s, hsl.l);

      particles.push({
        x: x + (Math.random() - 0.5) * 1.0,
        y: centerY + (Math.random() - 0.5) * 0.8,
        z: z + (Math.random() - 0.5) * 1.0,
        vx: Math.cos(theta) * Math.cos(phi) * speed,
        vy: Math.sin(phi) * speed + 6,
        vz: Math.sin(theta) * Math.cos(phi) * speed,
        life: 0.6 + Math.random() * 0.8,
        maxLife: 1.4,
        size: 0.15 + Math.random() * 0.3,
        color: variation,
        kind: 'fire',
      });
    }

    // 金属破片パーティクル（重くてゴロゴロ）
    for (let i = 0; i < METAL_PARTICLES; i++) {
      const theta = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 10;

      const variation = new THREE.Color().copy(colors.metal);
      const hsl = { h: 0, s: 0, l: 0 };
      variation.getHSL(hsl);
      hsl.l = Math.max(0.15, Math.min(0.7, hsl.l + (Math.random() - 0.5) * 0.4));
      variation.setHSL(hsl.h, hsl.s * 0.5, hsl.l);

      particles.push({
        x: x + (Math.random() - 0.5) * 0.6,
        y: centerY + (Math.random() - 0.3) * 0.6,
        z: z + (Math.random() - 0.5) * 0.6,
        vx: Math.cos(theta) * speed,
        vy: 3 + Math.random() * 8,
        vz: Math.sin(theta) * speed,
        life: 1.0 + Math.random() * 1.0,
        maxLife: 2.0,
        size: 0.2 + Math.random() * 0.25,
        color: variation,
        kind: 'metal',
      });
    }

    // 黒煙パーティクル（ゆっくり上昇）
    for (let i = 0; i < SMOKE_PARTICLES; i++) {
      const theta = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;

      const variation = new THREE.Color().copy(colors.smoke);
      const hsl = { h: 0, s: 0, l: 0 };
      variation.getHSL(hsl);
      hsl.l = Math.max(0.05, Math.min(0.3, hsl.l + (Math.random() - 0.5) * 0.15));
      variation.setHSL(hsl.h, 0, hsl.l);

      particles.push({
        x: x + (Math.random() - 0.5) * 2.0,
        y: centerY + Math.random() * 1.5,
        z: z + (Math.random() - 0.5) * 2.0,
        vx: Math.cos(theta) * speed * 0.3,
        vy: 3 + Math.random() * 5,
        vz: Math.sin(theta) * speed * 0.3,
        life: 1.5 + Math.random() * 1.5,
        maxLife: 3.0,
        size: 0.4 + Math.random() * 0.5,
        color: variation,
        kind: 'smoke',
      });
    }

    const id = `vex_${effectIdCounter++}`;
    const effect: ExplosionEffectInternal = {
      id,
      particles,
      shockwaveProgress: 0,
      cx: x,
      cy: centerY,
      cz: z,
      fireballLife: FIREBALL_DURATION,
    };

    const effects = effectsRef.current;
    effects.push(effect);
    if (effects.length > MAX_EFFECTS) {
      effects.splice(0, effects.length - MAX_EFFECTS);
    }

    // 衝撃波 + 火球の React state を更新（JSX 再レンダー）
    setFireballs((prev) => {
      const next = [...prev, { id, cx: x, cy: centerY, cz: z, shockwaveProgress: 0, fireballLife: FIREBALL_DURATION }];
      return next.slice(-MAX_EFFECTS);
    });
  }, []);

  // グローバルトリガーに登録
  useEffect(() => {
    registerVehicleExplosionSpawner(spawnEffect);
    return () => registerVehicleExplosionSpawner(() => {});
  }, [spawnEffect]);

  useFrame((_, delta) => {
    const effects = effectsRef.current;
    if (effects.length === 0 && fireballs.length === 0) {
      geometry.setDrawRange(0, 0);
      return;
    }

    const dt = Math.min(delta, 0.05);

    // エフェクトの生死判定
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.shockwaveProgress += dt / SHOCKWAVE_DURATION;
      effect.fireballLife -= dt;

      let allDead = effect.fireballLife <= -1.0; // 火球消滅後も少し待つ
      if (!allDead) {
        allDead = true;
        for (const p of effect.particles) {
          if (p.life > 0) { allDead = false; break; }
        }
      }
      if (allDead) effects.splice(i, 1);
    }

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    const sizeAttr = geometry.getAttribute('size') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colAttr.array as Float32Array;
    const sizeArr = sizeAttr.array as Float32Array;

    let idx = 0;

    for (const effect of effects) {
      for (const p of effect.particles) {
        if (p.life <= 0) continue;

        // 種類ごとの物理
        if (p.kind === 'fire') {
          p.vy += PARTICLE_GRAVITY * dt * 0.3; // 火花は軽い
          p.vx *= 0.97;
          p.vz *= 0.97;
        } else if (p.kind === 'metal') {
          p.vy += PARTICLE_GRAVITY * dt; // 金属は重い
          p.vx *= 0.99;
          p.vz *= 0.99;
        } else {
          p.vy += 2 * dt; // 煙は上昇
          p.vx *= 0.94;
          p.vz *= 0.94;
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.life -= dt;

        if (idx >= maxParticles) break;

        const i3 = idx * 3;
        positions[i3] = p.x;
        positions[i3 + 1] = p.y;
        positions[i3 + 2] = p.z;

        const alpha = Math.max(0, p.life / p.maxLife);
        const fadeIn = p.kind === 'smoke' ? Math.min(1, (p.maxLife - p.life) * 3) : 1;

        if (p.kind === 'fire') {
          // 火花はフェードアウト時に赤→暗赤に
          colors[i3] = p.color.r * alpha * 1.5;
          colors[i3 + 1] = p.color.g * alpha * alpha;
          colors[i3 + 2] = p.color.b * alpha * alpha * 0.3;
        } else {
          colors[i3] = p.color.r * alpha * fadeIn;
          colors[i3 + 1] = p.color.g * alpha * fadeIn;
          colors[i3 + 2] = p.color.b * alpha * fadeIn;
        }

        sizeArr[idx] = p.size * (p.kind === 'smoke' ? (0.8 + (1 - alpha) * 1.5) : (0.3 + alpha * 0.7));
        idx++;
      }
    }

    geometry.setDrawRange(0, idx);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;

    // 衝撃波 + 火球の React state 更新
    let fbChanged = false;
    for (const fb of fireballs) {
      fb.shockwaveProgress += dt / SHOCKWAVE_DURATION;
      fb.fireballLife -= dt;
      fbChanged = true;
    }
    if (fbChanged) {
      setFireballs((prev) => prev.filter((fb) => fb.shockwaveProgress < 1.5 || fb.fireballLife > -0.3));
    }
  });

  return (
    <group>
      <points ref={pointsRef} geometry={geometry} material={material} />

      {/* 衝撃波リング + 火球 */}
      {fireballs.map((fb) => (
        <group key={fb.id}>
          {/* 衝撃波リング */}
          {fb.shockwaveProgress < 1 && (
            <mesh
              position={[fb.cx, fb.cy, fb.cz]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <ringGeometry
                args={[
                  Math.max(0.1, fb.shockwaveProgress * 12),
                  fb.shockwaveProgress * 12 + 0.8,
                  32,
                ]}
              />
              <meshBasicMaterial
                color="#ffaa33"
                transparent
                opacity={Math.max(0, (1 - fb.shockwaveProgress) * 0.4)}
                side={THREE.DoubleSide}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          )}

          {/* 中心の火球 */}
          {fb.fireballLife > 0 && (
            <>
              <mesh position={[fb.cx, fb.cy, fb.cz]}>
                <sphereGeometry args={[2.5 * (1 - fb.fireballLife / FIREBALL_DURATION * 0.3), 16, 12]} />
                <meshBasicMaterial
                  color="#ff6600"
                  transparent
                  opacity={Math.max(0, fb.fireballLife / FIREBALL_DURATION * 0.6)}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
              <pointLight
                position={[fb.cx, fb.cy + 1, fb.cz]}
                color="#ff5500"
                intensity={Math.max(0, fb.fireballLife / FIREBALL_DURATION * 8)}
                distance={25}
              />
            </>
          )}
        </group>
      ))}
    </group>
  );
}
