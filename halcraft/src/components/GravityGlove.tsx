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

const PULL_BASE_RANGE = 10.5;
const PULL_CONE_DOT = 0.38;
const PULL_FORCE = 14;
const PULL_TICK = 0.08;
const PUSH_COOLDOWN = 1.25;
const PUSH_RANGE = 8.2;
const PUSH_FORCE = 10;
const PUSH_DAMAGE = 2;
const MAX_LINK_BEAMS = 8;

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
  const groundRingRef = useRef<THREE.Mesh>(null);
  const rangeRingRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const linkMeshRef = useRef<THREE.InstancedMesh>(null);

  const isPulling = useRef(false);
  const pullTick = useRef(0);
  const pushCd = useRef(0);
  const pushFlash = useRef(0);
  const pullPulse = useRef(0);
  const pullStreak = useRef(0);
  const idleT = useRef(0);
  const lastHudSync = useRef(0);
  const isTouch = useRef(isTouchDevice());
  const linkedTargets = useRef<Array<{ x: number; y: number; z: number }>>([]);

  const aimDir = useRef(new THREE.Vector3());
  const offsetWorld = useRef(new THREE.Vector3());
  const tmp = useRef(new THREE.Vector3());
  const tmp2 = useRef(new THREE.Vector3());
  const dummy = useMemo(() => new THREE.Object3D(), []);

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
    linkedTargets.current = [];

    for (const mob of mobs) {
      if (mob.type === 'chicken') continue;
      // 味方は怒っていない限り引き寄せない
      if (mob.isAlly && !mob.angryAtPlayer) continue;
      const hitbox = getMobHitbox(mob.type);
      const cy = mob.y + hitbox.height * 0.5;
      tmp.current.set(mob.x - origin.x, cy - origin.y, mob.z - origin.z);
      const dist = tmp.current.length();
      if (dist < 0.4 || dist > range) continue;
      tmp2.current.copy(tmp.current).normalize();
      if (tmp2.current.dot(aimDir.current) < PULL_CONE_DOT) continue;

      const pull = PULL_FORCE * (0.65 + (1 - dist / range) * 0.75);
      const nx = -tmp2.current.x;
      const nz = -tmp2.current.z;
      const resistance = mob.type === 'boss_giant' ? 0.22 : mob.isAlly ? 0.35 : 1;
      mob.vx = THREE.MathUtils.lerp(mob.vx, nx * pull * resistance, 0.55);
      mob.vz = THREE.MathUtils.lerp(mob.vz, nz * pull * resistance, 0.55);
      mob.vy = Math.min(mob.vy + 1.1 * resistance, 5);
      // 軽くひるませて「掴まれている」感
      mob.hitTimer = Math.max(mob.hitTimer, 0.08);
      hitCount++;
      if (linkedTargets.current.length < MAX_LINK_BEAMS) {
        linkedTargets.current.push({ x: mob.x, y: cy, z: mob.z });
      }

      // 吸引パーティクル（敵→手元）
      for (let k = 0; k < 2 && particles.current.length < 95; k++) {
        particles.current.push({
          x: mob.x + (Math.random() - 0.5) * 0.3,
          y: cy + (Math.random() - 0.5) * 0.4,
          z: mob.z + (Math.random() - 0.5) * 0.3,
          vx: nx * (7 + Math.random() * 4),
          vy: 0.5 + Math.random() * 2.5,
          vz: nz * (7 + Math.random() * 4),
          life: 0.32 + Math.random() * 0.14,
          total: 0.4,
        });
      }
    }

    if (hitCount > 0) {
      pullStreak.current += 1;
      useMasteryStore.getState().recordItemHit('gravity_glove', {
        label: hitCount >= 3 ? `まとめて引き寄せ x${hitCount}` : '引き寄せ',
        amount: 3 + Math.min(8, hitCount),
      });
      useMobStore.setState({ mobs: [...mobs] });
      // 軽い手応えシェイク
      usePlayerStore.setState((s) => ({
        cameraShake: Math.min(1, Math.max(s.cameraShake, 0.06 + hitCount * 0.015)),
      }));
    }
  }, [camera, getRange]);

  const applyPush = useCallback(() => {
    if (pushCd.current > 0) return;
    pushCd.current = PUSH_COOLDOWN;
    pushFlash.current = 1;
    pullPulse.current = 0;
    isPulling.current = false;
    usePlayerStore.getState().triggerWeaponAction('glove');
    playGravityPushSound();

    aimDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const origin = camera.position;
    const force = getPushForce();
    // 引き寄せ中に掴んでいた敵は押しが強め
    const focusBoost = linkedTargets.current.length > 0 ? 1.18 : 1;
    const mobs = useMobStore.getState().mobs;
    let hitCount = 0;
    const multi = useMultiplayerStore.getState();

    for (const mob of mobs) {
      if (mob.type === 'chicken') continue;
      if (mob.isAlly && !mob.angryAtPlayer) continue;
      const hitbox = getMobHitbox(mob.type);
      const cy = mob.y + hitbox.height * 0.45;
      tmp.current.set(mob.x - origin.x, cy - origin.y, mob.z - origin.z);
      const dist = tmp.current.length();
      if (dist > PUSH_RANGE || dist < 0.2) continue;
      tmp2.current.copy(tmp.current).normalize();
      if (tmp2.current.dot(aimDir.current) < 0.22) continue;

      const falloff = 1 - dist / PUSH_RANGE;
      const kb = force * falloff * focusBoost * (mob.type === 'boss_giant' ? 0.2 : 1);
      const dmg = Math.max(1, Math.round(PUSH_DAMAGE * (0.65 + falloff * 0.9) * focusBoost));
      useMobStore.getState().damageMob(
        mob.id,
        dmg,
        tmp2.current.x * kb * 0.4,
        tmp2.current.z * kb * 0.4,
      );
      if (multi.connected) {
        multi.sendMobDamage(mob.id, dmg, tmp2.current.x * kb * 0.4, tmp2.current.z * kb * 0.4);
      }
      spawnHitImpactEffect(
        mob.x,
        getMobHitboxMaxY(mob.y, hitbox) - 0.3,
        mob.z,
        tmp2.current.x,
        0.25,
        tmp2.current.z,
        falloff > 0.65,
      );
      hitCount++;
    }

    for (let i = 0; i < 48; i++) {
      const ang = (i / 48) * Math.PI * 2;
      const side = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      const dir = aimDir.current.clone().multiplyScalar(0.55).add(side.multiplyScalar(0.7)).normalize();
      particles.current.push({
        x: origin.x + aimDir.current.x * 1.1,
        y: origin.y - 0.35,
        z: origin.z + aimDir.current.z * 1.1,
        vx: dir.x * (7 + Math.random() * 6),
        vy: 1.2 + Math.random() * 4,
        vz: dir.z * (7 + Math.random() * 6),
        life: 0.4 + Math.random() * 0.22,
        total: 0.5,
      });
    }

    usePlayerStore.setState((s) => ({
      cameraShake: Math.min(1, Math.max(s.cameraShake, 0.32 + hitCount * 0.04)),
      glovePushReady: 0,
      glovePulling: false,
    }));
    useMasteryStore.getState().recordItemUse('gravity_glove', {
      label: hitCount > 0 ? `押し飛ばし x${hitCount}` : '押し飛ばし',
      amount: 4 + hitCount * 2,
    });
    if (hitCount > 0) {
      useMasteryStore.getState().recordItemHit('gravity_glove', {
        label: hitCount >= 3 ? 'まとめて押し' : '衝撃波ヒット',
        amount: 6 + hitCount * 2,
        critical: hitCount >= 3,
      });
    }
    linkedTargets.current = [];
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

    // HUD 同期（押し準備率）
    lastHudSync.current += dt;
    if (lastHudSync.current > 0.08) {
      lastHudSync.current = 0;
      const ready = 1 - pushCd.current / PUSH_COOLDOWN;
      usePlayerStore.setState({
        glovePushReady: THREE.MathUtils.clamp(ready, 0, 1),
        glovePulling: visible && isPulling.current,
      });
    }

    if (rootRef.current) {
      rootRef.current.visible = visible;
    }
    if (!visible) {
      isPulling.current = false;
      linkedTargets.current = [];
      if (linkMeshRef.current) {
        linkMeshRef.current.count = 0;
        linkMeshRef.current.visible = false;
      }
      if (rangeRingRef.current) rangeRingRef.current.visible = false;
      if (groundRingRef.current) groundRingRef.current.visible = false;
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

    // 足元の押し衝撃波（ワールド）
    if (groundRingRef.current) {
      const f = pushFlash.current;
      const mat = groundRingRef.current.material as THREE.MeshBasicMaterial;
      if (f > 0.02) {
        groundRingRef.current.visible = true;
        const feet = camera.position.clone();
        feet.y -= 1.45;
        feet.addScaledVector(aimDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize(), 0.8);
        groundRingRef.current.position.copy(feet);
        const s = 0.6 + (1 - f) * 4.2;
        groundRingRef.current.scale.set(s, s, 1);
        mat.opacity = f * 0.7;
      } else {
        groundRingRef.current.visible = false;
      }
    }

    // 引き寄せ射程リング（足元前方）
    if (rangeRingRef.current) {
      const p = pullPulse.current;
      const mat = rangeRingRef.current.material as THREE.MeshBasicMaterial;
      if (p > 0.05) {
        rangeRingRef.current.visible = true;
        aimDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        const feet = camera.position.clone();
        feet.y -= 1.5;
        feet.addScaledVector(aimDir.current, 1.2);
        rangeRingRef.current.position.copy(feet);
        const rangeScale = getRange() * 0.22 * (0.85 + p * 0.25);
        rangeRingRef.current.scale.set(rangeScale, rangeScale, 1);
        mat.opacity = 0.12 + p * 0.28;
        rangeRingRef.current.rotation.z += dt * 1.2;
      } else {
        rangeRingRef.current.visible = false;
      }
    }

    // 敵への吸引リンクビーム
    if (linkMeshRef.current) {
      const palm = rootRef.current?.position ?? camera.position;
      let count = 0;
      for (const t of linkedTargets.current) {
        if (count >= MAX_LINK_BEAMS) break;
        tmp.current.set(t.x - palm.x, t.y - palm.y, t.z - palm.z);
        const len = tmp.current.length();
        if (len < 0.1) continue;
        dummy.position.set(
          (palm.x + t.x) * 0.5,
          (palm.y + t.y) * 0.5,
          (palm.z + t.z) * 0.5,
        );
        dummy.scale.set(0.06 + pullPulse.current * 0.04, len, 0.06 + pullPulse.current * 0.04);
        dummy.lookAt(t.x, t.y, t.z);
        dummy.rotateX(Math.PI / 2);
        dummy.updateMatrix();
        linkMeshRef.current.setMatrixAt(count, dummy.matrix);
        count++;
      }
      linkMeshRef.current.count = count;
      linkMeshRef.current.instanceMatrix.needsUpdate = true;
      linkMeshRef.current.visible = count > 0 && pullPulse.current > 0.08;
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
        {[-0.08, -0.02, 0.04, 0.1].map((x, i) => (
          <mesh key={i} position={[x, 0.06, -0.22]} rotation={[0.4, 0, 0]} renderOrder={40}>
            <boxGeometry args={[0.05, 0.06, 0.14]} />
            <meshStandardMaterial color="#6a58b8" roughness={0.5} depthTest={false} />
          </mesh>
        ))}
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
      {/* 足元押し衝撃波 */}
      <mesh ref={groundRingRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.7, 1.0, 48]} />
        <meshBasicMaterial
          color={0xc8b8ff}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* 引き寄せ射程の目安 */}
      <mesh ref={rangeRingRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.85, 1.0, 48]} />
        <meshBasicMaterial
          color={0x9d8cff}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* 敵との吸引リンク */}
      <instancedMesh
        ref={linkMeshRef}
        args={[undefined, undefined, MAX_LINK_BEAMS]}
        frustumCulled={false}
        visible={false}
      >
        <cylinderGeometry args={[1, 1, 1, 6, 1, true]} />
        <meshBasicMaterial
          color={0xb8a0ff}
          transparent
          opacity={0.45}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
      <points ref={particlesRef} geometry={particleGeo} material={particleMat} frustumCulled={false} visible={false} />
    </>
  );
}
