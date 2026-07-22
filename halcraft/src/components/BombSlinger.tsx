// ボムスリンガー — 粘着ボム投擲＆遠隔起爆
// 左クリック: 投擲（壁・床・敵に吸着）
// 右クリック: 設置中ボムを一斉起爆

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { useMasteryStore } from '../stores/useMasteryStore';
import { useMobStore } from '../stores/useMobStore';
import { useMultiplayerStore } from '../stores/useMultiplayerStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useVehicleStore } from '../stores/useVehicleStore';
import { useWorldStore } from '../stores/useWorldStore';
import { getMasteryBonus } from '../types/masteryPerks';
import { isDesktopGameplayInputActive } from '../utils/gameCanvas';
import { isTouchDevice } from '../utils/device';
import { spawnCombatExplosion, spawnDamagePopup, spawnHitImpactEffect } from '../utils/effectTriggers';
import { getMobHitbox, getMobHitboxMaxY } from '../utils/mobHitboxes';
import {
  playBombStickSound,
  playBombThrowSound,
  playBombTickSound,
  playRocketExplosionSound,
} from '../utils/sounds';
import { consumeBreakBlock, consumePlaceBlock } from '../utils/touchInput';

const THROW_COOLDOWN = 0.4;
const BOMB_FUSE = 5.2;
const BOMB_SPEED = 19;
const BOMB_GRAVITY = -18;
const BLAST_RADIUS = 3.6;
const BLAST_DAMAGE = 5;
const BASE_MAX_BOMBS = 3;
const TRAJ_POINTS = 14;
const HOLDER_OFFSET = new THREE.Vector3(0.38, -0.42, -0.95);

interface StickyBomb {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  fuse: number;
  stuck: boolean;
  /** 吸着したモブ（追従） */
  stuckMobId: string | null;
  stuckOffset: THREE.Vector3;
  blink: number;
}

let nextBombId = 1;

export function BombSlinger() {
  const { camera } = useThree();
  const phase = useGameStore((s) => s.phase);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const isDead = usePlayerStore((s) => s.isDead);

  const rootRef = useRef<THREE.Group>(null);
  const chamberGlowRef = useRef<THREE.Mesh>(null);
  const ammoDotsRef = useRef<(THREE.Mesh | null)[]>([]);
  const trajRef = useRef<THREE.Points>(null);
  const bombsRef = useRef<StickyBomb[]>([]);
  const [, setBombVersion] = useState(0);
  const throwCd = useRef(0);
  const throwKick = useRef(0);
  const idleT = useRef(0);
  const lastHudSync = useRef(0);
  const isTouch = useRef(isTouchDevice());
  const lastTickSecond = useRef(new Map<number, number>());
  const stickFlash = useRef(new Map<number, number>());

  const aimDir = useRef(new THREE.Vector3());
  const offsetWorld = useRef(new THREE.Vector3());
  const trajGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAJ_POINTS * 3), 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);
  const trajMat = useMemo(() => new THREE.PointsMaterial({
    color: 0xffaa66,
    size: 0.1,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }), []);

  const accent = useMemo(() => new THREE.Color(0xff8a6a), []);
  const accentHot = useMemo(() => new THREE.Color(0xffe0a0), []);

  const getMaxBombs = useCallback(() => {
    const level = useMasteryStore.getState().items.bomb_slinger?.level ?? 1;
    const bonus = getMasteryBonus('bomb_slinger', level);
    return BASE_MAX_BOMBS + bonus.bombMaxCountBonus;
  }, []);

  const getBlastMult = useCallback(() => {
    const level = useMasteryStore.getState().items.bomb_slinger?.level ?? 1;
    return getMasteryBonus('bomb_slinger', level).bombBlastMultiplier;
  }, []);

  const detonateBomb = useCallback((bomb: StickyBomb) => {
    const mult = getBlastMult();
    const radius = BLAST_RADIUS * (0.9 + mult * 0.1);
    const damage = Math.max(1, Math.round(BLAST_DAMAGE * mult));
    spawnCombatExplosion(bomb.x, bomb.y, bomb.z, {
      style: 'bomb',
      scale: 0.72 * mult,
      intensity: 0.85 * mult,
      accent: '#ff7a40',
    });
    playRocketExplosionSound(
      camera.position.distanceTo(new THREE.Vector3(bomb.x, bomb.y, bomb.z)),
    );

    const mobs = useMobStore.getState().mobs;
    const multi = useMultiplayerStore.getState();
    let hits = 0;
    for (const mob of mobs) {
      if (mob.type === 'chicken') continue;
      const hitbox = getMobHitbox(mob.type);
      const cy = mob.y + hitbox.height * 0.4;
      const dx = mob.x - bomb.x;
      const dy = cy - bomb.y;
      const dz = mob.z - bomb.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > radius) continue;
      const falloff = 1 - dist / radius;
      const dmg = Math.max(1, Math.round(damage * (0.45 + falloff * 0.7)));
      const kb = 0.55 * falloff * (mob.type === 'boss_giant' ? 0.25 : 1);
      const nx = dist > 0.01 ? dx / dist : 0;
      const nz = dist > 0.01 ? dz / dist : 0;
      useMobStore.getState().damageMob(mob.id, dmg, nx * kb, nz * kb);
      if (multi.connected) multi.sendMobDamage(mob.id, dmg, nx * kb, nz * kb);
      spawnDamagePopup(dmg, mob.x, getMobHitboxMaxY(mob.y, hitbox) - 0.8, mob.z, falloff > 0.75);
      spawnHitImpactEffect(mob.x, cy, mob.z, nx, 0.35, nz, falloff > 0.75);
      hits++;
    }

    usePlayerStore.setState((s) => ({
      cameraShake: Math.min(1, Math.max(s.cameraShake, 0.22 + hits * 0.04)),
    }));
    if (hits > 0) {
      useMasteryStore.getState().recordItemHit('bomb_slinger', {
        label: hits >= 3 ? 'まとめて爆破' : 'ボムヒット',
        amount: 5 + hits * 3,
        critical: hits >= 3,
      });
    }
  }, [camera, getBlastMult]);

  const detonateAll = useCallback(() => {
    const bombs = [...bombsRef.current];
    if (bombs.length === 0) {
      // 空振りフィードバック
      usePlayerStore.setState((s) => ({
        cameraShake: Math.min(1, Math.max(s.cameraShake, 0.06)),
      }));
      return;
    }
    const count = bombs.length;
    bombsRef.current = [];
    lastTickSecond.current.clear();
    stickFlash.current.clear();
    setBombVersion((v) => v + 1);
    usePlayerStore.getState().triggerWeaponAction('bomb');
    // 連鎖爆発（見やすさのためわずかにずらす）
    bombs.forEach((b, i) => {
      window.setTimeout(() => detonateBomb(b), i * 70);
    });
    useMasteryStore.getState().recordItemUse('bomb_slinger', {
      label: `一斉起爆 x${count}`,
      amount: 6 + count * 3,
    });
    useMasteryStore.getState().recordItemHit('bomb_slinger', {
      label: count >= 3 ? '連鎖起爆' : '同時起爆',
      amount: 8 + count * 2,
      critical: count >= 3,
    });
    usePlayerStore.setState({ bombArmedCount: 0 });
  }, [detonateBomb]);

  const throwBomb = useCallback(() => {
    if (throwCd.current > 0) return;
    const max = getMaxBombs();
    if (bombsRef.current.length >= max) {
      // 満杯時: 最古を派手に爆発させて枠を空ける
      const oldest = bombsRef.current.shift();
      if (oldest) {
        detonateBomb(oldest);
        stickFlash.current.delete(oldest.id);
      }
    }

    throwCd.current = THROW_COOLDOWN;
    throwKick.current = 1;
    aimDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const start = camera.position.clone().addScaledVector(aimDir.current, 0.95);
    start.y -= 0.12;

    const bomb: StickyBomb = {
      id: nextBombId++,
      x: start.x,
      y: start.y,
      z: start.z,
      vx: aimDir.current.x * BOMB_SPEED,
      vy: aimDir.current.y * BOMB_SPEED + 2.5,
      vz: aimDir.current.z * BOMB_SPEED,
      age: 0,
      fuse: BOMB_FUSE,
      stuck: false,
      stuckMobId: null,
      stuckOffset: new THREE.Vector3(),
      blink: 0,
    };
    bombsRef.current.push(bomb);
    setBombVersion((v) => v + 1);
    playBombThrowSound();
    usePlayerStore.getState().triggerWeaponAction('bomb');
    useMasteryStore.getState().recordItemUse('bomb_slinger', { label: 'ボム投擲', amount: 3 });
    usePlayerStore.setState({
      bombArmedCount: bombsRef.current.length,
      bombMaxCount: max,
      cameraShake: Math.min(1, Math.max(usePlayerStore.getState().cameraShake, 0.1)),
    });
  }, [camera, detonateBomb, getMaxBombs]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (usePlayerStore.getState().equippedItem !== 'bomb_slinger') return;
      if (!isDesktopGameplayInputActive()) return;
      if (useGameStore.getState().phase !== 'playing') return;
      if (usePlayerStore.getState().isDead) return;
      if (useVehicleStore.getState().isInVehicle()) return;
      if (e.button === 0) throwBomb();
      if (e.button === 2) {
        e.preventDefault();
        detonateAll();
      }
    };
    const onContext = (e: Event) => {
      if (usePlayerStore.getState().equippedItem === 'bomb_slinger') e.preventDefault();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('contextmenu', onContext);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('contextmenu', onContext);
    };
  }, [detonateAll, throwBomb]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    idleT.current += dt;
    throwCd.current = Math.max(0, throwCd.current - dt);
    throwKick.current = Math.max(0, throwKick.current - dt * 4.5);

    const visible = phase === 'playing'
      && equippedItem === 'bomb_slinger'
      && !isDead
      && !useVehicleStore.getState().isInVehicle();

    if (rootRef.current) rootRef.current.visible = visible;

    if (visible) {
      if (isTouch.current) {
        if (consumeBreakBlock()) throwBomb();
        if (consumePlaceBlock()) detonateAll();
      }

      offsetWorld.current.copy(HOLDER_OFFSET);
      offsetWorld.current.y += Math.sin(idleT.current * 1.8) * 0.012;
      offsetWorld.current.z += throwKick.current * 0.1;
      offsetWorld.current.applyQuaternion(camera.quaternion);
      if (rootRef.current) {
        rootRef.current.position.copy(camera.position).add(offsetWorld.current);
        rootRef.current.quaternion.copy(camera.quaternion);
        rootRef.current.rotation.x -= throwKick.current * 0.55;
      }
      const max = getMaxBombs();
      const count = bombsRef.current.length;
      if (chamberGlowRef.current) {
        const mat = chamberGlowRef.current.material as THREE.MeshBasicMaterial;
        const full = count >= max;
        mat.color.copy(full ? accentHot : accent);
        mat.opacity = 0.28 + count * 0.14 + throwKick.current * 0.35;
        chamberGlowRef.current.scale.setScalar(0.52 + count * 0.1);
      }
      // 弾薬ドット（手元）
      for (let i = 0; i < 5; i++) {
        const dot = ammoDotsRef.current[i];
        if (!dot) continue;
        const active = i < max;
        const filled = i < count;
        dot.visible = active;
        if (!active) continue;
        const mat = dot.material as THREE.MeshBasicMaterial;
        mat.color.set(filled ? 0xff7744 : 0x443322);
        mat.opacity = filled ? 0.95 : 0.35;
        dot.scale.setScalar(filled ? 1.1 : 0.75);
      }

      // 投擲軌道プレビュー
      if (trajRef.current) {
        aimDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        let px = camera.position.x + aimDir.current.x * 0.95;
        let py = camera.position.y + aimDir.current.y * 0.95 - 0.12;
        let pz = camera.position.z + aimDir.current.z * 0.95;
        let vx = aimDir.current.x * BOMB_SPEED;
        let vy = aimDir.current.y * BOMB_SPEED + 2.5;
        let vz = aimDir.current.z * BOMB_SPEED;
        const posAttr = trajGeo.getAttribute('position') as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const step = 0.07;
        let drawn = 0;
        for (let i = 0; i < TRAJ_POINTS; i++) {
          arr[i * 3] = px;
          arr[i * 3 + 1] = py;
          arr[i * 3 + 2] = pz;
          drawn++;
          vy += BOMB_GRAVITY * step;
          px += vx * step;
          py += vy * step;
          pz += vz * step;
          const block = useWorldStore.getState().getBlock(Math.floor(px), Math.floor(py), Math.floor(pz));
          if (block !== 0 && block !== 7) break;
        }
        posAttr.needsUpdate = true;
        trajGeo.setDrawRange(0, drawn);
        trajRef.current.visible = throwCd.current < 0.15;
        trajMat.opacity = 0.35 + (1 - throwCd.current / THROW_COOLDOWN) * 0.4;
      }

      lastHudSync.current += dt;
      if (lastHudSync.current > 0.1) {
        lastHudSync.current = 0;
        usePlayerStore.setState({
          bombArmedCount: count,
          bombMaxCount: max,
        });
      }
    } else if (trajRef.current) {
      trajRef.current.visible = false;
    }

    // ボム物理
    const getBlock = useWorldStore.getState().getBlock;
    const mobs = useMobStore.getState().mobs;
    let changed = false;
    for (let i = bombsRef.current.length - 1; i >= 0; i--) {
      const b = bombsRef.current[i];
      b.age += dt;
      b.fuse -= dt;
      b.blink += dt;

      // モブ吸着追従
      if (b.stuck && b.stuckMobId) {
        const mob = mobs.find((m) => m.id === b.stuckMobId);
        if (mob) {
          b.x = mob.x + b.stuckOffset.x;
          b.y = mob.y + b.stuckOffset.y;
          b.z = mob.z + b.stuckOffset.z;
        } else {
          b.stuckMobId = null;
        }
      }

      if (!b.stuck) {
        b.vy += BOMB_GRAVITY * dt;
        const nx = b.x + b.vx * dt;
        const ny = b.y + b.vy * dt;
        const nz = b.z + b.vz * dt;

        // ブロック衝突
        const bx = Math.floor(nx);
        const by = Math.floor(ny);
        const bz = Math.floor(nz);
        const block = getBlock(bx, by, bz);
        if (block !== 0 && block !== 7) {
          b.stuck = true;
          b.vx = 0;
          b.vy = 0;
          b.vz = 0;
          b.x = nx;
          b.y = ny;
          b.z = nz;
          playBombStickSound();
          stickFlash.current.set(b.id, 1);
          changed = true;
        } else {
          // モブ吸着
          let stuckMob = false;
          for (const mob of mobs) {
            if (mob.type === 'chicken') continue;
            const hitbox = getMobHitbox(mob.type);
            const dx = nx - mob.x;
            const dy = ny - (mob.y + hitbox.height * 0.4);
            const dz = nz - mob.z;
            const r = hitbox.radius + 0.25;
            if (dx * dx + dz * dz < r * r && Math.abs(dy) < hitbox.height * 0.6) {
              b.stuck = true;
              b.stuckMobId = mob.id;
              b.stuckOffset.set(dx, dy + hitbox.height * 0.4, dz);
              b.vx = 0;
              b.vy = 0;
              b.vz = 0;
              b.x = nx;
              b.y = ny;
              b.z = nz;
              playBombStickSound();
              stickFlash.current.set(b.id, 1);
              stuckMob = true;
              changed = true;
              break;
            }
          }
          if (!stuckMob) {
            b.x = nx;
            b.y = ny;
            b.z = nz;
          }
        }
      }

      // ティック音（残り秒が変わるたび）
      const secLeft = Math.ceil(b.fuse);
      const prev = lastTickSecond.current.get(b.id);
      if (prev !== secLeft && b.fuse < 3.5 && b.fuse > 0) {
        lastTickSecond.current.set(b.id, secLeft);
        playBombTickSound();
      }

      // 吸着フラッシュ減衰
      const sf = stickFlash.current.get(b.id);
      if (sf !== undefined) {
        const next = sf - dt * 2.8;
        if (next <= 0) stickFlash.current.delete(b.id);
        else stickFlash.current.set(b.id, next);
      }

      if (b.fuse <= 0 || b.y < -30) {
        if (b.fuse <= 0) detonateBomb(b);
        bombsRef.current.splice(i, 1);
        lastTickSecond.current.delete(b.id);
        stickFlash.current.delete(b.id);
        changed = true;
      }
    }
    if (changed) {
      setBombVersion((v) => v + 1);
      usePlayerStore.setState({
        bombArmedCount: bombsRef.current.length,
        bombMaxCount: getMaxBombs(),
      });
    }
  });

  const bombs = bombsRef.current;

  return (
    <>
      <group ref={rootRef} visible={false}>
        <mesh position={[0, 0, 0]} renderOrder={40}>
          <boxGeometry args={[0.22, 0.18, 0.38]} />
          <meshStandardMaterial color="#5a3a2a" roughness={0.7} depthTest={false} />
        </mesh>
        <mesh position={[0, 0.02, -0.18]} rotation={[Math.PI / 2, 0, 0]} renderOrder={40}>
          <cylinderGeometry args={[0.1, 0.12, 0.28, 10]} />
          <meshStandardMaterial color="#3d2a20" roughness={0.65} metalness={0.2} depthTest={false} />
        </mesh>
        <mesh position={[0.0, 0.08, 0.05]} renderOrder={40}>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color="#ff6a40" roughness={0.45} depthTest={false} />
        </mesh>
        <mesh ref={chamberGlowRef} position={[0, 0.08, 0.05]} renderOrder={41}>
          <sphereGeometry args={[0.14, 12, 10]} />
          <meshBasicMaterial
            color={0xff8a6a}
            transparent
            opacity={0.35}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {/* 弾薬スロット（最大5） */}
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={i}
            ref={(el) => { ammoDotsRef.current[i] = el; }}
            position={[-0.12 + i * 0.06, -0.12, 0.08]}
            renderOrder={42}
            visible={false}
          >
            <sphereGeometry args={[0.025, 8, 6]} />
            <meshBasicMaterial
              color={0xff7744}
              transparent
              opacity={0.9}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>

      {/* 投擲軌道プレビュー */}
      <points ref={trajRef} geometry={trajGeo} material={trajMat} frustumCulled={false} visible={false} />

      {/* ワールド上のボム */}
      {bombs.map((b) => {
        const urgent = b.fuse < 1.5;
        const fuseRatio = THREE.MathUtils.clamp(b.fuse / BOMB_FUSE, 0, 1);
        const blink = urgent ? 0.55 + Math.sin(b.blink * 22) * 0.45 : 0.7 + Math.sin(b.blink * 6) * 0.3;
        const stick = stickFlash.current.get(b.id) ?? 0;
        return (
          <group key={b.id} position={[b.x, b.y, b.z]}>
            <mesh castShadow scale={1 + stick * 0.35}>
              <sphereGeometry args={[0.22, 14, 12]} />
              <meshStandardMaterial
                color={urgent ? '#ff4422' : '#2a2a2a'}
                emissive={urgent ? '#ff2200' : stick > 0 ? '#ffaa44' : '#ff6622'}
                emissiveIntensity={blink * (urgent ? 1.5 : 0.55) + stick * 1.2}
                roughness={0.55}
              />
            </mesh>
            <mesh position={[0, 0.18, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.12, 6]} />
              <meshStandardMaterial color="#c4a060" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.28, 0]}>
              <sphereGeometry args={[0.06, 8, 6]} />
              <meshBasicMaterial
                color={urgent ? '#ffff66' : '#ffaa44'}
                transparent
                opacity={0.4 + blink * 0.5}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            {/* 導火線の残り時間リング */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <ringGeometry args={[0.32, 0.4, 32]} />
              <meshBasicMaterial
                color={urgent ? '#ff3311' : '#ff8844'}
                transparent
                opacity={0.2 + (1 - fuseRatio) * 0.55}
                side={THREE.DoubleSide}
                depthWrite={false}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            {/* 導火線プログレス（内円が縮む） */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} scale={[fuseRatio, fuseRatio, 1]}>
              <ringGeometry args={[0.18, 0.28, 28]} />
              <meshBasicMaterial
                color="#ffe080"
                transparent
                opacity={0.35 + blink * 0.25}
                side={THREE.DoubleSide}
                depthWrite={false}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
              <ringGeometry args={[0.28, 0.42, 24]} />
              <meshBasicMaterial
                color={urgent ? '#ff5533' : '#ff8844'}
                transparent
                opacity={0.25 + blink * 0.35 + stick * 0.4}
                side={THREE.DoubleSide}
                depthWrite={false}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            {/* 吸着瞬間のフラッシュ */}
            {stick > 0.02 && (
              <mesh scale={0.5 + (1 - stick) * 1.8}>
                <sphereGeometry args={[0.3, 12, 10]} />
                <meshBasicMaterial
                  color="#fff0c0"
                  transparent
                  opacity={stick * 0.7}
                  depthWrite={false}
                  toneMapped={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}
