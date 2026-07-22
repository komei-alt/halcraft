// モブ近接攻撃のアニメ同期 VFX（味方・敵共通）
// attackTimer の進行に合わせて: 溜め光 → 斬撃アーク → 振り下ろし残光

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMobStore, type MobType } from '../stores/useMobStore';
import {
  BOSS_ATTACK_ANIM_DURATION,
  PROTOTYPE_ATTACK_ANIM_DURATION,
  SPIDER_ATTACK_ANIM_DURATION,
  ZOMBIE_ATTACK_ANIM_DURATION,
} from '../utils/mobAI/constants';
import { meleeAccentForType, meleeScaleForType } from '../utils/mobMeleeFeedback';
import {
  registerMobMeleeHitSpawner,
  type MobMeleeHitOptions,
} from '../utils/effectTriggers';

interface AttackVisual {
  mobId: string;
  type: MobType;
  x: number;
  y: number;
  z: number;
  rotation: number;
  progress: number;
  accent: THREE.Color;
  scale: number;
  handHeight: number;
}

interface HitBurst {
  id: number;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  life: number;
  totalLife: number;
  accent: THREE.Color;
  scale: number;
  style: NonNullable<MobMeleeHitOptions['style']>;
}

interface TrailSpark {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  totalLife: number;
  color: THREE.Color;
}

const MAX_ATTACKS = 8;
const MAX_BURSTS = 12;
const MAX_TRAILS = 180;
const SLASH_SEGMENTS = 14;
const UP = new THREE.Vector3(0, 1, 0);

let burstId = 0;

function smooth01(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** 攻撃 progress に対応するアーク角度（頭上 → 前方下） */
function slashAngle(progress: number): number {
  // 0.15〜0.55 で振り切り
  const u = smooth01((progress - 0.12) / 0.45);
  return THREE.MathUtils.lerp(Math.PI * 0.72, -Math.PI * 0.35, u);
}

function slashAlpha(progress: number): number {
  if (progress < 0.1) return progress / 0.1 * 0.35;
  if (progress < 0.28) return 0.35 + (progress - 0.1) / 0.18 * 0.45;
  if (progress < 0.55) return 0.95;
  if (progress < 0.85) return 0.95 * (1 - (progress - 0.55) / 0.3);
  return 0;
}

function chargeAlpha(progress: number): number {
  if (progress < 0.05) return progress / 0.05;
  if (progress < 0.32) return 1;
  if (progress < 0.48) return 1 - (progress - 0.32) / 0.16;
  return 0;
}

export function AllyMeleeAttackFX() {
  const attacksRef = useRef<AttackVisual[]>([]);
  const burstsRef = useRef<HitBurst[]>([]);
  const trailsRef = useRef<TrailSpark[]>([]);

  const groupRef = useRef<THREE.Group>(null);
  const chargeMeshRef = useRef<THREE.InstancedMesh>(null);
  const chargeOuterRef = useRef<THREE.InstancedMesh>(null);
  const slashMeshRef = useRef<THREE.InstancedMesh>(null);
  const ringMeshRef = useRef<THREE.InstancedMesh>(null);
  const flashMeshRef = useRef<THREE.InstancedMesh>(null);
  const trailPointsRef = useRef<THREE.Points>(null);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);
  const white = useMemo(() => new THREE.Color(0xffffff), []);
  const accentCache = useMemo(() => new Map<string, THREE.Color>(), []);

  function colorFor(hex: string): THREE.Color {
    let c = accentCache.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      accentCache.set(hex, c);
    }
    return c;
  }

  function durationFor(type: MobType): number {
    switch (type) {
      case 'spider':
        return SPIDER_ATTACK_ANIM_DURATION;
      case 'boss_giant':
        return BOSS_ATTACK_ANIM_DURATION;
      case 'zombie':
      case 'darwin':
        return ZOMBIE_ATTACK_ANIM_DURATION;
      default:
        return PROTOTYPE_ATTACK_ANIM_DURATION;
    }
  }

  function handHeightFor(type: MobType): number {
    switch (type) {
      case 'spider':
        return 0.45;
      case 'boss_giant':
        return 2.6;
      case 'darwin':
        return 1.9;
      default:
        return 1.55;
    }
  }

  const slashGeo = useMemo(() => new THREE.PlaneGeometry(1.35, 0.14), []);
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(0.22, 14, 12), []);
  const ringGeo = useMemo(() => new THREE.RingGeometry(0.55, 0.82, 40), []);
  const flashGeo = useMemo(() => new THREE.CircleGeometry(0.55, 28), []);

  const chargeMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  }), []);
  const chargeOuterMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  }), []);
  const slashMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  }), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  }), []);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  }), []);

  const trailGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_TRAILS * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_TRAILS * 3), 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);
  const trailMat = useMemo(() => new THREE.PointsMaterial({
    size: 0.11,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    sizeAttenuation: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  }), []);

  // ヒット瞬間の追加バースト（AI から呼ばれる）
  useEffect(() => {
    const spawn = (
      x: number,
      y: number,
      z: number,
      dirX: number,
      dirY: number,
      dirZ: number,
      options?: MobMeleeHitOptions,
    ) => {
      const style = options?.style ?? 'ally';
      const accent = new THREE.Color(options?.accent ?? '#7ec8ff');
      burstsRef.current.push({
        id: burstId++,
        x, y, z,
        dirX, dirY, dirZ,
        life: style === 'heavy' ? 0.42 : style === 'lunge' ? 0.24 : 0.28,
        totalLife: style === 'heavy' ? 0.42 : style === 'lunge' ? 0.24 : 0.28,
        accent,
        scale: options?.scale ?? 1,
        style,
      });
      if (burstsRef.current.length > MAX_BURSTS) {
        burstsRef.current.splice(0, burstsRef.current.length - MAX_BURSTS);
      }

      // ヒット瞬間の軌跡パーティクル
      const dir = new THREE.Vector3(dirX, dirY, dirZ);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      const side = new THREE.Vector3().crossVectors(dir, UP);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const up = new THREE.Vector3().crossVectors(side, dir).normalize();
      const count = style === 'heavy' ? 32 : style === 'lunge' ? 14 : 20;
      for (let i = 0; i < count; i++) {
        const spread = (Math.random() - 0.5) * 2.2;
        const lift = Math.random() * 1.4;
        const speed = 2.4 + Math.random() * 4.5;
        const vel = side.clone().multiplyScalar(spread * speed * 0.35)
          .add(up.clone().multiplyScalar((lift - 0.2) * speed * 0.4))
          .add(dir.clone().multiplyScalar(-speed * (0.2 + Math.random() * 0.5)));
        const life = 0.18 + Math.random() * 0.22;
        trailsRef.current.push({
          x: x + (Math.random() - 0.5) * 0.2,
          y: y + (Math.random() - 0.5) * 0.2,
          z: z + (Math.random() - 0.5) * 0.2,
          vx: vel.x, vy: vel.y, vz: vel.z,
          life,
          totalLife: life,
          color: accent.clone().lerp(white, Math.random() * 0.45),
        });
      }
      if (trailsRef.current.length > MAX_TRAILS) {
        trailsRef.current.splice(0, trailsRef.current.length - MAX_TRAILS);
      }
    };
    registerMobMeleeHitSpawner(spawn);
    return () => registerMobMeleeHitSpawner(() => {});
  }, [white]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const mobs = useMobStore.getState().mobs;
    const attacks: AttackVisual[] = [];

    for (const m of mobs) {
      if (
        m.type !== 'prototype'
        && m.type !== 'iron_golem'
        && m.type !== 'zombie'
        && m.type !== 'darwin'
        && m.type !== 'spider'
        && m.type !== 'boss_giant'
      ) continue;
      const attackTimer = m.attackTimer ?? 0;
      if (attackTimer <= 0.01) continue;

      const duration = durationFor(m.type);
      const progress = THREE.MathUtils.clamp(1 - attackTimer / duration, 0, 1);
      const accentHex = meleeAccentForType(m.type);
      const accent = colorFor(accentHex);
      const scale = meleeScaleForType(m.type) * (m.type === 'prototype' ? 0.95 : 1);
      const baseHand = handHeightFor(m.type);
      attacks.push({
        mobId: m.id,
        type: m.type,
        x: m.x,
        y: m.y,
        z: m.z,
        rotation: m.rotation,
        progress,
        accent,
        scale,
        handHeight: baseHand,
      });

      // スイング中に軌跡スパークを連続生成
      const sAlpha = slashAlpha(progress);
      if (sAlpha > 0.2 && trailsRef.current.length < MAX_TRAILS - 4) {
        const angle = slashAngle(progress);
        const forward = new THREE.Vector3(Math.sin(m.rotation), 0, Math.cos(m.rotation));
        const right = new THREE.Vector3(Math.cos(m.rotation), 0, -Math.sin(m.rotation));
        const handReach = 0.95 * scale;
        const handHeight = baseHand + Math.sin(angle) * (0.55 + scale * 0.25);
        const handForward = 0.35 + Math.cos(angle) * handReach * 0.55;
        const handSide = (m.type === 'spider' ? 0.1 : 0.35) + Math.sin(angle * 0.5) * 0.25;
        const px = m.x + forward.x * handForward + right.x * handSide;
        const py = m.y + handHeight;
        const pz = m.z + forward.z * handForward + right.z * handSide;
        const life = 0.12 + Math.random() * 0.1;
        trailsRef.current.push({
          x: px + (Math.random() - 0.5) * 0.12,
          y: py + (Math.random() - 0.5) * 0.12,
          z: pz + (Math.random() - 0.5) * 0.12,
          vx: (Math.random() - 0.5) * 1.2 + right.x * 0.8,
          vy: 0.4 + Math.random() * 1.5,
          vz: (Math.random() - 0.5) * 1.2 + right.z * 0.8,
          life,
          totalLife: life,
          color: accent.clone().lerp(white, 0.35 + Math.random() * 0.3),
        });
      }
    }

    attacksRef.current = attacks.slice(0, MAX_ATTACKS);

    // --- バースト寿命 ---
    for (let i = burstsRef.current.length - 1; i >= 0; i--) {
      burstsRef.current[i].life -= dt;
      if (burstsRef.current[i].life <= 0) burstsRef.current.splice(i, 1);
    }

    // --- 軌跡更新 ---
    for (let i = trailsRef.current.length - 1; i >= 0; i--) {
      const p = trailsRef.current[i];
      p.life -= dt;
      if (p.life <= 0) {
        trailsRef.current.splice(i, 1);
        continue;
      }
      p.vy -= 6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.92;
      p.vz *= 0.92;
    }

    // --- 溜め球 ---
    let chargeIdx = 0;
    for (const atk of attacksRef.current) {
      const a = chargeAlpha(atk.progress);
      if (a < 0.02 || !chargeMeshRef.current || !chargeOuterRef.current) continue;

      const forward = new THREE.Vector3(Math.sin(atk.rotation), 0, Math.cos(atk.rotation));
      const right = new THREE.Vector3(Math.cos(atk.rotation), 0, -Math.sin(atk.rotation));
      const sideBias = atk.type === 'spider' ? 0.05 : 0.55;
      const handX = atk.x + forward.x * 0.45 + right.x * sideBias;
      const handY = atk.y + atk.handHeight + 0.3 + Math.sin(atk.progress * 8) * 0.04;
      const handZ = atk.z + forward.z * 0.45 + right.z * sideBias;
      const pulse = 0.85 + Math.sin(performance.now() * 0.02) * 0.15;
      const s = (0.55 + atk.progress * 0.9) * pulse * atk.scale;

      dummy.position.set(handX, handY, handZ);
      dummy.scale.setScalar(s);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      chargeMeshRef.current.setMatrixAt(chargeIdx, dummy.matrix);
      tempColor.copy(atk.accent).lerp(white, 0.35).multiplyScalar(a);
      chargeMeshRef.current.setColorAt(chargeIdx, tempColor);

      dummy.scale.setScalar(s * 1.85);
      dummy.updateMatrix();
      chargeOuterRef.current.setMatrixAt(chargeIdx, dummy.matrix);
      tempColor.copy(atk.accent).multiplyScalar(a * 0.55);
      chargeOuterRef.current.setColorAt(chargeIdx, tempColor);
      chargeIdx++;
    }
    if (chargeMeshRef.current) {
      chargeMeshRef.current.count = chargeIdx;
      chargeMeshRef.current.instanceMatrix.needsUpdate = true;
      if (chargeMeshRef.current.instanceColor) chargeMeshRef.current.instanceColor.needsUpdate = true;
      chargeMeshRef.current.visible = chargeIdx > 0;
    }
    if (chargeOuterRef.current) {
      chargeOuterRef.current.count = chargeIdx;
      chargeOuterRef.current.instanceMatrix.needsUpdate = true;
      if (chargeOuterRef.current.instanceColor) chargeOuterRef.current.instanceColor.needsUpdate = true;
      chargeOuterRef.current.visible = chargeIdx > 0;
    }

    // --- 斬撃アーク（複数セグメントで弧） ---
    let slashIdx = 0;
    for (const atk of attacksRef.current) {
      const alpha = slashAlpha(atk.progress);
      if (alpha < 0.02 || !slashMeshRef.current) continue;

      const centerAngle = slashAngle(atk.progress);
      const forward = new THREE.Vector3(Math.sin(atk.rotation), 0, Math.cos(atk.rotation));
      const right = new THREE.Vector3(Math.cos(atk.rotation), 0, -Math.sin(atk.rotation));
      const pivot = new THREE.Vector3(
        atk.x + forward.x * 0.25 + right.x * 0.2,
        atk.y + atk.handHeight,
        atk.z + forward.z * 0.25 + right.z * 0.2,
      );

      for (let s = 0; s < SLASH_SEGMENTS && slashIdx < MAX_ATTACKS * SLASH_SEGMENTS; s++) {
        const t = s / (SLASH_SEGMENTS - 1);
        // 現在角度を中心に短い弧
        const arcSpan = 0.55 + alpha * 0.35;
        const ang = centerAngle + (t - 0.85) * arcSpan;
        const radius = (1.05 + t * 0.35) * atk.scale;
        const localX = Math.sin(ang) * radius;
        const localY = Math.cos(ang) * radius * 0.75;
        // 体の前方・右基準で配置
        const world = pivot.clone()
          .add(forward.clone().multiplyScalar(localY * 0.15 + 0.5))
          .add(right.clone().multiplyScalar(localX * 0.55 + 0.15));
        world.y = pivot.y + localY;

        const segAlpha = alpha * (0.35 + t * 0.65) * (t > 0.2 ? 1 : t / 0.2);
        const width = (0.08 + t * 0.12) * atk.scale;
        const length = (0.55 + t * 0.35) * atk.scale;

        // スラッシュ面を振りの接線方向へ
        dummy.position.copy(world);
        dummy.lookAt(
          world.x + forward.x,
          world.y,
          world.z + forward.z,
        );
        dummy.rotateZ(ang * 0.8);
        dummy.scale.set(length, width * (0.7 + alpha * 0.5), 1);
        dummy.updateMatrix();
        slashMeshRef.current.setMatrixAt(slashIdx, dummy.matrix);
        tempColor.copy(atk.accent).lerp(white, 0.25 + t * 0.4).multiplyScalar(segAlpha);
        slashMeshRef.current.setColorAt(slashIdx, tempColor);
        slashIdx++;
      }
    }
    if (slashMeshRef.current) {
      slashMeshRef.current.count = slashIdx;
      slashMeshRef.current.instanceMatrix.needsUpdate = true;
      if (slashMeshRef.current.instanceColor) slashMeshRef.current.instanceColor.needsUpdate = true;
      slashMeshRef.current.visible = slashIdx > 0;
    }

    // --- ヒットリング＆フラッシュ ---
    let ringIdx = 0;
    let flashIdx = 0;
    for (const b of burstsRef.current) {
      const u = 1 - b.life / b.totalLife;
      const fade = 1 - u;
      const dir = new THREE.Vector3(b.dirX, b.dirY, b.dirZ);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      const isHeavy = b.style === 'heavy';

      if (ringMeshRef.current && ringIdx < MAX_BURSTS * 6) {
        const r = (0.25 + u * 1.35) * b.scale;
        dummy.position.set(b.x, b.y, b.z);
        dummy.lookAt(b.x + dir.x, b.y + dir.y, b.z + dir.z);
        dummy.scale.set(r, r, 1);
        dummy.updateMatrix();
        ringMeshRef.current.setMatrixAt(ringIdx, dummy.matrix);
        tempColor.copy(b.accent).lerp(white, 0.3).multiplyScalar(fade * 0.9);
        ringMeshRef.current.setColorAt(ringIdx, tempColor);
        ringIdx++;

        // 地面リング（heavy=ボス等は多層衝撃波）
        const groundLayers = isHeavy ? 4 : 1;
        for (let g = 0; g < groundLayers && ringIdx < MAX_BURSTS * 6; g++) {
          const delay = g * 0.12;
          const gu = THREE.MathUtils.clamp((u - delay) / Math.max(0.2, 1 - delay), 0, 1);
          if (gu <= 0.001) continue;
          dummy.position.set(b.x, b.y - 0.9 + g * 0.02, b.z);
          dummy.rotation.set(-Math.PI / 2, 0, 0);
          const gr = (0.45 + gu * (1.9 + g * 0.85)) * b.scale * (isHeavy ? 1.35 : 1);
          dummy.scale.set(gr, gr, 1);
          dummy.updateMatrix();
          ringMeshRef.current.setMatrixAt(ringIdx, dummy.matrix);
          tempColor.copy(b.accent).lerp(white, g * 0.12).multiplyScalar((1 - gu) * (isHeavy ? 0.7 : 0.55));
          ringMeshRef.current.setColorAt(ringIdx, tempColor);
          ringIdx++;
        }
      }

      if (flashMeshRef.current && flashIdx < MAX_BURSTS * 2) {
        const fs = (0.35 + (1 - u) * 0.55) * b.scale * (u < 0.25 ? 1.3 : 0.7);
        dummy.position.set(b.x, b.y, b.z);
        dummy.lookAt(b.x + dir.x, b.y + dir.y, b.z + dir.z);
        dummy.scale.setScalar(fs);
        dummy.updateMatrix();
        flashMeshRef.current.setMatrixAt(flashIdx, dummy.matrix);
        tempColor.copy(white).lerp(b.accent, 0.35).multiplyScalar(fade);
        flashMeshRef.current.setColorAt(flashIdx, tempColor);
        flashIdx++;

        // 2枚目のクロスフラッシュ
        dummy.rotateZ(Math.PI * 0.5);
        dummy.scale.setScalar(fs * 0.75);
        dummy.updateMatrix();
        flashMeshRef.current.setMatrixAt(flashIdx, dummy.matrix);
        tempColor.copy(b.accent).lerp(white, 0.5).multiplyScalar(fade * 0.7);
        flashMeshRef.current.setColorAt(flashIdx, tempColor);
        flashIdx++;
      }
    }
    if (ringMeshRef.current) {
      ringMeshRef.current.count = ringIdx;
      ringMeshRef.current.instanceMatrix.needsUpdate = true;
      if (ringMeshRef.current.instanceColor) ringMeshRef.current.instanceColor.needsUpdate = true;
      ringMeshRef.current.visible = ringIdx > 0;
    }
    if (flashMeshRef.current) {
      flashMeshRef.current.count = flashIdx;
      flashMeshRef.current.instanceMatrix.needsUpdate = true;
      if (flashMeshRef.current.instanceColor) flashMeshRef.current.instanceColor.needsUpdate = true;
      flashMeshRef.current.visible = flashIdx > 0;
    }

    // --- 軌跡 Points ---
    const posAttr = trailGeo.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = trailGeo.getAttribute('color') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colAttr.array as Float32Array;
    let ti = 0;
    for (const p of trailsRef.current) {
      if (ti >= MAX_TRAILS) break;
      const a = THREE.MathUtils.clamp(p.life / p.totalLife, 0, 1);
      const i3 = ti * 3;
      positions[i3] = p.x;
      positions[i3 + 1] = p.y;
      positions[i3 + 2] = p.z;
      colors[i3] = p.color.r * a;
      colors[i3 + 1] = p.color.g * a;
      colors[i3 + 2] = p.color.b * a;
      ti++;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    trailGeo.setDrawRange(0, ti);
    if (trailPointsRef.current) {
      trailPointsRef.current.visible = ti > 0;
    }
  });

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={chargeMeshRef}
        args={[sphereGeo, chargeMat, MAX_ATTACKS]}
        frustumCulled={false}
        visible={false}
      />
      <instancedMesh
        ref={chargeOuterRef}
        args={[sphereGeo, chargeOuterMat, MAX_ATTACKS]}
        frustumCulled={false}
        visible={false}
      />
      <instancedMesh
        ref={slashMeshRef}
        args={[slashGeo, slashMat, MAX_ATTACKS * SLASH_SEGMENTS]}
        frustumCulled={false}
        visible={false}
      />
      <instancedMesh
        ref={ringMeshRef}
        args={[ringGeo, ringMat, MAX_BURSTS * 6]}
        frustumCulled={false}
        visible={false}
      />
      <instancedMesh
        ref={flashMeshRef}
        args={[flashGeo, flashMat, MAX_BURSTS * 2]}
        frustumCulled={false}
        visible={false}
      />
      <points ref={trailPointsRef} geometry={trailGeo} material={trailMat} frustumCulled={false} visible={false} />
    </group>
  );
}
