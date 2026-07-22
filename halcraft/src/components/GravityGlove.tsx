// 引力グローブ — 引き寄せ / 押し飛ばし
// 左クリック押しっぱなし: 前方コーン内の敵を引き寄せ
// 右クリック: 衝撃波で押し飛ばし

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { useMasteryStore } from '../stores/useMasteryStore';
import { useMobStore } from '../stores/useMobStore';
import { useMultiplayerStore } from '../stores/useMultiplayerStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useVehicleStore } from '../stores/useVehicleStore';
import { getMasteryBonus } from '../types/masteryPerks';
import { isDesktopGameplayInputActive } from '../utils/gameCanvas';
import { isTouchDevice } from '../utils/device';
import { spawnHitImpactEffect } from '../utils/effectTriggers';
import { getMobHitbox, getMobHitboxMaxY } from '../utils/mobHitboxes';
import { playGravityPullSound, playGravityPushSound } from '../utils/sounds';
import { consumeBreakBlock, consumePlaceBlock, mobileActions } from '../utils/touchInput';

const PULL_BASE_RANGE = 9.5;
const PULL_CONE_DOT = 0.42;
const PULL_FORCE = 11;
const PULL_TICK = 0.09;
const PUSH_COOLDOWN = 1.35;
const PUSH_RANGE = 7.5;
const PUSH_FORCE = 8.5;
const PUSH_DAMAGE = 2;
const PULL_DAMAGE_TICK = 0; // 引き寄せはダメージなし

const GLOVE_OFFSET = new THREE.Vector3(0.42, -0.38, -0.85);

export function GravityGlove() {
  const { camera } = useThree();
  const phase = useGameStore((s) => s.phase);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const isDead = usePlayerStore((s) => s.isDead);

  const rootRef = useRef<THREE.Group>(null);
  const palmGlowRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const shockRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);

  const isPulling = useRef(false);
  const pullTick = useRef(0);
  const pushCd = useRef(0);
  const pushFlash = useRef(0);
  const pullPulse = useRef(0);
  const pullStreak = useRef(0);
  const idleT = useRef(0);
  const isTouch = useRef(isTouchDevice());

  const aimDir = useRef(new THREE.Vector3());
  const offsetWorld = useRef(new THREE.Vector3());
  const tmp = useRef(new THREE.Vector3());
  const tmp2 = useRef(new THREE.Vector3());

  const particleGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(96 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(96 * 3), 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);
  const particleMat = useMemo(() => new THREE.PointsMaterial({
    size: 0.12,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }), []);
  const particles = useRef<Array<{
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    life: number; total: number;
  }>>([]);

  const accent = useMemo(() => new THREE.Color(0x9d8cff), []);
  const accentHot = useMemo(() => new THREE.Color(0xe8d6ff), []);

  const getRange = useCallback(() => {
    const level = useMasteryStore.getState().items.gravity_glove?.level ?? 1;
    const bonus = getMasteryBonus('gravity_glove', level);
    return PULL_BASE_RANGE + bonus.gravityPullRangeBonus;
  }, []);

  const getPushForce = useCallback(() => {
    const level = useMasteryStore.getState().items.gravity_glove?.level ?? 1;
    const bonus = getMasteryBonus('gravity_glove', level);
    return PUSH_FORCE * bonus.gravityPushForceMultiplier;
  }, []);

  const applyPull = useCallback(() => {
    aimDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const origin = camera.position;
    const range = getRange();
    const mobs = useMobStore.getState().mobs;
    let hitCount = 0;

    for (const mob of mobs) {
      if (mob.type === 'chicken') continue;
      const hitbox = getMobHitbox(mob.type);
      const cy = mob.y + hitbox.height * 0.5;
      tmp.current.set(mob.x - origin.x, cy - origin.y, mob.z - origin.z);
      const dist = tmp.current.length();
      if (dist < 0.4 || dist > range) continue;
      tmp2.current.copy(tmp.current).normalize();
      if (tmp2.current.dot(aimDir.current) < PULL_CONE_DOT) continue;

      // プレイヤー方向へ速度を上書き（弱い吸引）
      const pull = PULL_FORCE * (0.55 + (1 - dist / range) * 0.7);
      const nx = -tmp2.current.x;
      const nz = -tmp2.current.z;
      const resistance = mob.type === 'boss_giant' ? 0.22 : mob.isAlly ? 0.35 : 1;
      mob.vx = THREE.MathUtils.lerp(mob.vx, nx * pull * resistance, 0.45);
      mob.vz = THREE.MathUtils.lerp(mob.vz, nz * pull * resistance, 0.45);
      mob.vy = Math.min(mob.vy + 0.8 * resistance, 4);
      hitCount++;

      // 吸引パーティクル（敵位置から手元へ）
      if (particles.current.length < 90) {
        particles.current.push({
          x: mob.x,
          y: cy,
          z: mob.z,
          vx: nx * 6 + (Math.random() - 0.5),
          vy: 1 + Math.random() * 2,
          vz: nz * 6 + (Math.random() - 0.5),
          life: 0.28 + Math.random() * 0.12,
          total: 0.35,
        });
      }
    }

    if (hitCount > 0) {
      pullStreak.current += 1;
      useMasteryStore.getState().recordItemHit('gravity_glove', {
        label: '引き寄せ',
        amount: 3 + Math.min(6, hitCount),
      });
      // ストアに速度を反映
      useMobStore.setState({ mobs: [...mobs] });
    }
  }, [camera, getRange]);

  const applyPush = useCallback(() => {
    if (pushCd.current > 0) return;
    pushCd.current = PUSH_COOLDOWN;
    pushFlash.current = 1;
    pullPulse.current = 0;
    usePlayerStore.getState().triggerWeaponAction('glove');
    playGravityPushSound();

    aimDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const origin = camera.position;
    const force = getPushForce();
    const mobs = useMobStore.getState().mobs;
    let hitCount = 0;
    const multi = useMultiplayerStore.getState();

    for (const mob of mobs) {
      if (mob.type === 'chicken') continue;
      const hitbox = getMobHitbox(mob.type);
      const cy = mob.y + hitbox.height * 0.45;
      tmp.current.set(mob.x - origin.x, cy - origin.y, mob.z - origin.z);
      const dist = tmp.current.length();
      if (dist > PUSH_RANGE || dist < 0.2) continue;
      tmp2.current.copy(tmp.current).normalize();
      if (tmp2.current.dot(aimDir.current) < 0.25) continue;

      const falloff = 1 - dist / PUSH_RANGE;
      const kb = force * falloff * (mob.type === 'boss_giant' ? 0.2 : 1);
      const dmg = Math.max(1, Math.round(PUSH_DAMAGE * (0.6 + falloff * 0.8)));
      useMobStore.getState().damageMob(
        mob.id,
        dmg,
        tmp2.current.x * kb * 0.35,
        tmp2.current.z * kb * 0.35,
      );
      if (multi.connected) {
        multi.sendMobDamage(mob.id, dmg, tmp2.current.x * kb * 0.35, tmp2.current.z * kb * 0.35);
      }
      spawnHitImpactEffect(
        mob.x,
        getMobHitboxMaxY(mob.y, hitbox) - 0.3,
        mob.z,
        tmp2.current.x,
        0.2,
        tmp2.current.z,
        falloff > 0.7,
      );
      hitCount++;
    }

    // 衝撃波パーティクル
    for (let i = 0; i < 36; i++) {
      const ang = (i / 36) * Math.PI * 2;
      const side = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      const dir = aimDir.current.clone().multiplyScalar(0.6).add(side.multiplyScalar(0.55)).normalize();
      particles.current.push({
        x: origin.x + aimDir.current.x * 1.2,
        y: origin.y - 0.2,
        z: origin.z + aimDir.current.z * 1.2,
        vx: dir.x * (6 + Math.random() * 5),
        vy: 1 + Math.random() * 3,
        vz: dir.z * (6 + Math.random() * 5),
        life: 0.35 + Math.random() * 0.2,
        total: 0.45,
      });
    }

    usePlayerStore.setState((s) => ({
      cameraShake: Math.min(1, Math.max(s.cameraShake, 0.28 + hitCount * 0.03)),
    }));
    useMasteryStore.getState().recordItemUse('gravity_glove', {
      label: hitCount > 0 ? `押し飛ばし x${hitCount}` : '押し飛ばし',
      amount: 4 + hitCount * 2,
    });
    if (hitCount > 0) {
      useMasteryStore.getState().recordItemHit('gravity_glove', {
        label: '衝撃波ヒット',
        amount: 6 + hitCount * 2,
        critical: hitCount >= 3,
      });
    }
  }, [camera, getPushForce]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (usePlayerStore.getState().equippedItem !== 'gravity_glove') return;
      if (!isDesktopGameplayInputActive()) return;
      if (useGameStore.getState().phase !== 'playing') return;
      if (usePlayerStore.getState().isDead) return;
      if (useVehicleStore.getState().isInVehicle()) return;
      if (e.button === 0) {
        isPulling.current = true;
        pullTick.current = 0;
        usePlayerStore.getState().triggerWeaponAction('glove');
        useMasteryStore.getState().recordItemUse('gravity_glove', { label: '引き寄せ開始', amount: 2 });
      }
      if (e.button === 2) {
        e.preventDefault();
        applyPush();
      }
    };
    const onUp = (e: MouseEvent) => {
      if (e.button === 0) isPulling.current = false;
    };
    const onContext = (e: Event) => {
      if (usePlayerStore.getState().equippedItem === 'gravity_glove') e.preventDefault();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('contextmenu', onContext);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('contextmenu', onContext);
    };
  }, [applyPush]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    idleT.current += dt;
    pushCd.current = Math.max(0, pushCd.current - dt);
    pushFlash.current = Math.max(0, pushFlash.current - dt * 2.4);

    const visible = phase === 'playing'
      && equippedItem === 'gravity_glove'
      && !isDead
      && !useVehicleStore.getState().isInVehicle();

    if (rootRef.current) {
      rootRef.current.visible = visible;
    }
    if (!visible) {
      isPulling.current = false;
      return;
    }

    // モバイル: 連射ボタン流用で引き寄せ押しっぱなし、設置ボタンで押し
    if (isTouch.current) {
      const holdingPull = mobileActions.fireMachineGun;
      if (holdingPull && !isPulling.current) {
        isPulling.current = true;
        pullTick.current = 0;
        usePlayerStore.getState().triggerWeaponAction('glove');
        useMasteryStore.getState().recordItemUse('gravity_glove', { label: '引き寄せ開始', amount: 2 });
      }
      if (!holdingPull && isPulling.current) {
        isPulling.current = false;
      }
      if (consumePlaceBlock()) {
        applyPush();
      }
      // 誤ってブロック操作に流れないよう消費
      consumeBreakBlock();
    }

    // 手元位置
    offsetWorld.current.copy(GLOVE_OFFSET);
    offsetWorld.current.y += Math.sin(idleT.current * 2.1) * 0.015;
    if (isPulling.current) {
      offsetWorld.current.z -= 0.08;
      offsetWorld.current.y += 0.04;
    }
    if (pushFlash.current > 0) {
      offsetWorld.current.z += pushFlash.current * 0.12;
    }
    offsetWorld.current.applyQuaternion(camera.quaternion);
    if (rootRef.current) {
      rootRef.current.position.copy(camera.position).add(offsetWorld.current);
      rootRef.current.quaternion.copy(camera.quaternion);
    }

    // 引き寄せ処理
    if (isPulling.current) {
      pullPulse.current = Math.min(1, pullPulse.current + dt * 3.5);
      pullTick.current += dt;
      if (pullTick.current >= PULL_TICK) {
        pullTick.current = 0;
        applyPull();
        playGravityPullSound();
      }
    } else {
      pullPulse.current = Math.max(0, pullPulse.current - dt * 2.5);
      pullStreak.current = 0;
    }

    // 掌の光
    if (palmGlowRef.current) {
      const mat = palmGlowRef.current.material as THREE.MeshBasicMaterial;
      const p = Math.max(pullPulse.current, pushFlash.current);
      mat.color.copy(accent).lerp(accentHot, pushFlash.current);
      mat.opacity = 0.25 + p * 0.65 + Math.sin(idleT.current * 8) * 0.05;
      palmGlowRef.current.scale.setScalar(0.55 + p * 0.55 + pushFlash.current * 0.4);
    }
    if (ringRef.current) {
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      const p = pullPulse.current;
      mat.opacity = p * 0.75;
      ringRef.current.rotation.z -= dt * (2.5 + p * 6);
      ringRef.current.scale.setScalar(0.7 + p * 0.9);
      ringRef.current.visible = p > 0.05;
    }
    if (beamRef.current) {
      const mat = beamRef.current.material as THREE.MeshBasicMaterial;
      const p = pullPulse.current;
      beamRef.current.visible = p > 0.08;
      mat.opacity = p * 0.45;
      beamRef.current.scale.set(0.15 + p * 0.1, 0.15 + p * 0.1, 0.6 + p * 2.4);
      beamRef.current.position.z = -0.5 - p * 1.1;
    }
    if (shockRef.current) {
      const mat = shockRef.current.material as THREE.MeshBasicMaterial;
      const f = pushFlash.current;
      shockRef.current.visible = f > 0.02;
      mat.opacity = f * 0.85;
      const s = 0.4 + (1 - f) * 2.8;
      shockRef.current.scale.set(s, s, 1);
    }

    // パーティクル更新
    for (let i = particles.current.length - 1; i >= 0; i--) {
      const p = particles.current[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.current.splice(i, 1);
        continue;
      }
      // 引き寄せ中は手元へ曲がる
      if (isPulling.current && rootRef.current) {
        const hx = rootRef.current.position.x - p.x;
        const hy = rootRef.current.position.y - p.y;
        const hz = rootRef.current.position.z - p.z;
        p.vx += hx * 8 * dt;
        p.vy += hy * 8 * dt;
        p.vz += hz * 8 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.94;
      p.vz *= 0.94;
    }
    const posAttr = particleGeo.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = particleGeo.getAttribute('color') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colAttr.array as Float32Array;
    let pi = 0;
    for (const p of particles.current) {
      if (pi >= 96) break;
      const a = p.life / p.total;
      positions[pi * 3] = p.x;
      positions[pi * 3 + 1] = p.y;
      positions[pi * 3 + 2] = p.z;
      colors[pi * 3] = accentHot.r * a;
      colors[pi * 3 + 1] = accent.g * a;
      colors[pi * 3 + 2] = accent.b * a;
      pi++;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    particleGeo.setDrawRange(0, pi);
    if (particlesRef.current) particlesRef.current.visible = pi > 0;

    void PULL_DAMAGE_TICK;
  });

  return (
    <>
      <group ref={rootRef} visible={false}>
        {/* グローブ本体 */}
        <mesh position={[0, 0, 0]} renderOrder={40}>
          <boxGeometry args={[0.28, 0.22, 0.32]} />
          <meshStandardMaterial color="#5a4a9a" roughness={0.55} metalness={0.25} depthTest={false} />
        </mesh>
        <mesh position={[0.02, 0.02, -0.12]} renderOrder={40}>
          <sphereGeometry args={[0.14, 14, 12]} />
          <meshStandardMaterial color="#7b6ad4" roughness={0.4} metalness={0.35} depthTest={false} />
        </mesh>
        {/* 指 */}
        {[-0.08, -0.02, 0.04, 0.1].map((x, i) => (
          <mesh key={i} position={[x, 0.06, -0.22]} rotation={[0.4, 0, 0]} renderOrder={40}>
            <boxGeometry args={[0.05, 0.06, 0.14]} />
            <meshStandardMaterial color="#6a58b8" roughness={0.5} depthTest={false} />
          </mesh>
        ))}
        {/* 掌エネルギー */}
        <mesh ref={palmGlowRef} position={[0.02, 0.04, -0.2]} renderOrder={41}>
          <sphereGeometry args={[0.16, 16, 12]} />
          <meshBasicMaterial
            color={0x9d8cff}
            transparent
            opacity={0.35}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh ref={ringRef} position={[0.02, 0.04, -0.28]} rotation={[Math.PI / 2, 0, 0]} renderOrder={41} visible={false}>
          <torusGeometry args={[0.22, 0.02, 8, 36]} />
          <meshBasicMaterial
            color={0xc8b8ff}
            transparent
            opacity={0}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {/* 吸引ビーム */}
        <mesh ref={beamRef} position={[0.02, 0.04, -0.8]} renderOrder={40} visible={false}>
          <cylinderGeometry args={[0.08, 0.22, 1, 10, 1, true]} />
          <meshBasicMaterial
            color={0xa890ff}
            transparent
            opacity={0}
            depthTest={false}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {/* 押し衝撃波リング */}
        <mesh ref={shockRef} position={[0.02, 0.04, -0.55]} rotation={[0, 0, 0]} renderOrder={42} visible={false}>
          <ringGeometry args={[0.35, 0.55, 40]} />
          <meshBasicMaterial
            color={0xffe8ff}
            transparent
            opacity={0}
            depthTest={false}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
      <points ref={particlesRef} geometry={particleGeo} material={particleMat} frustumCulled={false} visible={false} />
    </>
  );
}
