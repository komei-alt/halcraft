import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';
import type { StageBossEncounterId } from '../../types/stageBossEncounters';
import { MOB_HITBOXES } from '../../utils/mobHitboxes';

interface BossRendererProps {
  mob: MobData;
  animTime: number;
}

type VectorTuple = readonly [number, number, number];

interface BossPart {
  position: VectorTuple;
  scale: VectorTuple;
  rotation?: VectorTuple;
}

interface BossSilhouette {
  bodyColor: string;
  armorColor: string;
  body: readonly BossPart[];
  armor: readonly BossPart[];
  branches: readonly BossPart[];
  spikes: readonly BossPart[];
  eyes: readonly BossPart[];
  corePosition: VectorTuple;
  coreScale: VectorTuple;
}

const BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const BRANCH_GEOMETRY = new THREE.CylinderGeometry(0.5, 0.62, 1, 6);
const SPIKE_GEOMETRY = new THREE.ConeGeometry(0.5, 1, 5);
const CORE_GEOMETRY = new THREE.OctahedronGeometry(1, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
// 4種すべてのローカル造形範囲を、共通のボス当たり判定（高さ4.8m）へ正規化する。
const BOSS_LOCAL_MIN_Y = -0.82;
const BOSS_LOCAL_MAX_Y = 2.7;
const BOSS_MODEL_SCALE = MOB_HITBOXES.boss_giant.height / (BOSS_LOCAL_MAX_Y - BOSS_LOCAL_MIN_Y);
const BOSS_MODEL_Y_OFFSET = -BOSS_LOCAL_MIN_Y * BOSS_MODEL_SCALE;

/**
 * 同じ基本ジオメトリをインスタンス化し、部品密度を上げてもdraw callを増やさない。
 * ボスは1体だけだが、固有シルエットを6〜7 drawで維持する。
 */
function InstancedBossParts({
  geometry,
  material,
  parts,
  castShadow = true,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  parts: readonly BossPart[];
  castShadow?: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const partObject = new THREE.Object3D();
    parts.forEach((part, index) => {
      partObject.position.set(...part.position);
      partObject.rotation.set(...(part.rotation ?? [0, 0, 0]));
      partObject.scale.set(...part.scale);
      partObject.updateMatrix();
      mesh.setMatrixAt(index, partObject.matrix);
    });
    mesh.count = parts.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.visible = parts.length > 0;
  }, [parts]);

  if (parts.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, parts.length]}
      castShadow={castShadow}
      receiveShadow
      // 初フレームの identity 行列フラッシュを防ぐ
      visible={false}
      frustumCulled={false}
    />
  );
}

const BOSS_SILHOUETTES: Record<StageBossEncounterId, BossSilhouette> = {
  forest_guardian: {
    bodyColor: '#47382f',
    armorColor: '#667348',
    body: [
      { position: [0, 0.72, 0], scale: [0.92, 1.32, 0.56] },
      { position: [0, 1.62, 0.02], scale: [0.62, 0.52, 0.54] },
      { position: [-0.25, -0.38, 0], scale: [0.34, 0.76, 0.38], rotation: [0, 0, -0.04] },
      { position: [0.25, -0.38, 0], scale: [0.34, 0.76, 0.38], rotation: [0, 0, 0.04] },
      { position: [-0.68, 0.72, 0], scale: [0.28, 1.08, 0.3], rotation: [0, 0, -0.2] },
      { position: [0.68, 0.72, 0], scale: [0.28, 1.08, 0.3], rotation: [0, 0, 0.2] },
    ],
    armor: [
      { position: [0, 0.98, 0.31], scale: [0.58, 0.54, 0.08] },
      { position: [-0.62, 1.18, 0], scale: [0.48, 0.25, 0.68], rotation: [0, 0, -0.18] },
      { position: [0.62, 1.18, 0], scale: [0.48, 0.25, 0.68], rotation: [0, 0, 0.18] },
    ],
    branches: [
      { position: [-0.25, 2.12, 0], scale: [0.13, 0.78, 0.13], rotation: [0, 0, -0.45] },
      { position: [0.25, 2.12, 0], scale: [0.13, 0.78, 0.13], rotation: [0, 0, 0.45] },
      { position: [-0.48, 2.32, 0], scale: [0.1, 0.42, 0.1], rotation: [0.2, 0, 0.9] },
      { position: [0.48, 2.32, 0], scale: [0.1, 0.42, 0.1], rotation: [-0.2, 0, -0.9] },
    ],
    spikes: [
      { position: [-0.52, 2.48, 0], scale: [0.22, 0.44, 0.22], rotation: [0, 0, -0.2] },
      { position: [0.52, 2.48, 0], scale: [0.22, 0.44, 0.22], rotation: [0, 0, 0.2] },
    ],
    eyes: [
      { position: [-0.15, 1.68, 0.29], scale: [0.11, 0.09, 0.04] },
      { position: [0.15, 1.68, 0.29], scale: [0.11, 0.09, 0.04] },
    ],
    corePosition: [0, 0.92, 0.35],
    coreScale: [0.16, 0.22, 0.12],
  },
  tropical_swarm_king: {
    bodyColor: '#31533d',
    armorColor: '#8b7340',
    body: [
      { position: [0, 0.52, -0.04], scale: [1.14, 0.92, 0.7] },
      { position: [0, 1.32, 0.18], scale: [0.7, 0.54, 0.64] },
      { position: [-0.32, -0.3, 0], scale: [0.38, 0.72, 0.42], rotation: [0, 0, -0.12] },
      { position: [0.32, -0.3, 0], scale: [0.38, 0.72, 0.42], rotation: [0, 0, 0.12] },
    ],
    armor: [
      { position: [0, 0.75, 0.38], scale: [0.72, 0.38, 0.09] },
      { position: [0, 1.52, 0.08], scale: [0.84, 0.14, 0.72], rotation: [0, 0, 0.04] },
    ],
    branches: [
      { position: [-0.72, 0.92, 0.05], scale: [0.18, 0.9, 0.18], rotation: [0.1, 0, -0.92] },
      { position: [0.72, 0.92, 0.05], scale: [0.18, 0.9, 0.18], rotation: [-0.1, 0, 0.92] },
      { position: [-0.82, 0.48, -0.02], scale: [0.15, 0.82, 0.15], rotation: [0.35, 0, -1.12] },
      { position: [0.82, 0.48, -0.02], scale: [0.15, 0.82, 0.15], rotation: [-0.35, 0, 1.12] },
      { position: [-0.72, 0.1, -0.12], scale: [0.13, 0.76, 0.13], rotation: [0.6, 0, -1.22] },
      { position: [0.72, 0.1, -0.12], scale: [0.13, 0.76, 0.13], rotation: [-0.6, 0, 1.22] },
    ],
    spikes: [
      { position: [-0.32, 1.86, 0.04], scale: [0.26, 0.58, 0.26], rotation: [0, 0, -0.36] },
      { position: [0, 1.98, 0.04], scale: [0.3, 0.68, 0.3] },
      { position: [0.32, 1.86, 0.04], scale: [0.26, 0.58, 0.26], rotation: [0, 0, 0.36] },
    ],
    eyes: [
      { position: [-0.2, 1.4, 0.51], scale: [0.09, 0.08, 0.04] },
      { position: [-0.07, 1.46, 0.51], scale: [0.08, 0.08, 0.04] },
      { position: [0.07, 1.46, 0.51], scale: [0.08, 0.08, 0.04] },
      { position: [0.2, 1.4, 0.51], scale: [0.09, 0.08, 0.04] },
    ],
    corePosition: [0, 0.74, 0.45],
    coreScale: [0.2, 0.16, 0.12],
  },
  snow_colossus: {
    bodyColor: '#5b6c82',
    armorColor: '#a8c8dc',
    body: [
      { position: [0, 0.68, 0], scale: [1.08, 1.38, 0.66] },
      { position: [0, 1.67, 0.02], scale: [0.7, 0.58, 0.62] },
      { position: [-0.3, -0.42, 0], scale: [0.42, 0.8, 0.46] },
      { position: [0.3, -0.42, 0], scale: [0.42, 0.8, 0.46] },
      { position: [-0.78, 0.62, 0], scale: [0.34, 1.18, 0.38], rotation: [0, 0, -0.12] },
      { position: [0.78, 0.62, 0], scale: [0.34, 1.18, 0.38], rotation: [0, 0, 0.12] },
    ],
    armor: [
      { position: [0, 1.02, 0.39], scale: [0.78, 0.72, 0.12] },
      { position: [-0.75, 1.2, 0], scale: [0.58, 0.38, 0.78], rotation: [0, 0, -0.16] },
      { position: [0.75, 1.2, 0], scale: [0.58, 0.38, 0.78], rotation: [0, 0, 0.16] },
      { position: [0, 1.82, -0.02], scale: [0.76, 0.18, 0.7] },
    ],
    branches: [],
    spikes: [
      { position: [-0.78, 1.64, 0], scale: [0.34, 0.82, 0.34], rotation: [0, 0, -0.28] },
      { position: [0.78, 1.64, 0], scale: [0.34, 0.82, 0.34], rotation: [0, 0, 0.28] },
      { position: [-0.28, 2.17, -0.02], scale: [0.25, 0.64, 0.25], rotation: [0, 0, -0.18] },
      { position: [0.28, 2.17, -0.02], scale: [0.25, 0.64, 0.25], rotation: [0, 0, 0.18] },
    ],
    eyes: [
      { position: [-0.17, 1.73, 0.34], scale: [0.12, 0.07, 0.04] },
      { position: [0.17, 1.73, 0.34], scale: [0.12, 0.07, 0.04] },
    ],
    corePosition: [0, 1.0, 0.46],
    coreScale: [0.2, 0.28, 0.14],
  },
  desert_warlord: {
    bodyColor: '#604536',
    armorColor: '#9a7044',
    body: [
      { position: [0, 0.72, 0], scale: [0.9, 1.34, 0.54] },
      { position: [0, 1.68, 0.02], scale: [0.62, 0.56, 0.56] },
      { position: [-0.25, -0.38, 0], scale: [0.34, 0.78, 0.38], rotation: [0, 0, -0.04] },
      { position: [0.25, -0.38, 0], scale: [0.34, 0.78, 0.38], rotation: [0, 0, 0.04] },
      { position: [-0.64, 0.68, 0], scale: [0.28, 1.06, 0.32], rotation: [0, 0, -0.18] },
      { position: [0.72, 0.58, 0.02], scale: [0.4, 1.18, 0.42], rotation: [0, 0, 0.12] },
    ],
    armor: [
      { position: [0, 1.02, 0.35], scale: [0.68, 0.62, 0.1], rotation: [0, 0, 0.06] },
      { position: [0.7, 1.25, 0], scale: [0.76, 0.4, 0.78], rotation: [0, 0, 0.2] },
      { position: [-0.56, 1.18, 0], scale: [0.38, 0.22, 0.64], rotation: [0, 0, -0.12] },
      { position: [0, 1.88, 0], scale: [0.76, 0.18, 0.68] },
    ],
    branches: [
      { position: [0.83, 0.18, 0.02], scale: [0.34, 0.6, 0.34] },
      { position: [0.83, -0.19, 0.02], scale: [0.44, 0.28, 0.44], rotation: [0, 0, Math.PI / 2] },
    ],
    spikes: [
      { position: [0, 2.27, -0.03], scale: [0.22, 0.82, 0.22] },
      { position: [0.66, 1.62, 0], scale: [0.3, 0.58, 0.3], rotation: [0, 0, 0.32] },
      { position: [0.95, 1.48, 0], scale: [0.24, 0.5, 0.24], rotation: [0, 0, 0.62] },
    ],
    eyes: [
      { position: [-0.16, 1.74, 0.31], scale: [0.11, 0.08, 0.04] },
      { position: [0.16, 1.74, 0.31], scale: [0.11, 0.08, 0.04] },
    ],
    corePosition: [0, 1.02, 0.41],
    coreScale: [0.18, 0.24, 0.12],
  },
};

export function BossRenderer({ mob, animTime }: BossRendererProps) {
  const groupRef = useRef<THREE.Group>(null);
  const targetPositionRef = useRef(new THREE.Vector3(mob.x, mob.y, mob.z));
  const targetQuaternionRef = useRef(new THREE.Quaternion());
  const encounterId = mob.bossEncounterId ?? 'forest_guardian';
  const silhouette = BOSS_SILHOUETTES[encounterId];
  const accent = mob.traitAccent ?? '#ff6b4a';
  const isDamaged = mob.hitTimer > 0;

  // 被ダメ時に Material を作り直すと InstancedMesh が再マウントされ、
  // 行列リセットで一瞬「小さな箱」になる。色だけを更新する。
  const bodyMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: silhouette.bodyColor,
    emissive: accent,
    emissiveIntensity: 0.12,
    roughness: 0.78,
    metalness: 0.16,
  }), [accent, silhouette.bodyColor]);
  const armorMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: silhouette.armorColor,
    emissive: accent,
    emissiveIntensity: 0.16,
    roughness: encounterId === 'snow_colossus' ? 0.34 : 0.58,
    metalness: encounterId === 'desert_warlord' ? 0.46 : 0.24,
  }), [accent, encounterId, silhouette.armorColor]);
  const accentMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 2.2,
    roughness: 0.3,
    metalness: 0.18,
  }), [accent]);

  useEffect(() => {
    bodyMaterial.color.set(isDamaged ? '#ff9a8e' : silhouette.bodyColor);
    bodyMaterial.emissive.set(isDamaged ? '#ff3318' : accent);
    bodyMaterial.emissiveIntensity = isDamaged ? 0.95 : 0.12;
    armorMaterial.color.set(isDamaged ? '#ffd0c4' : silhouette.armorColor);
    armorMaterial.emissive.set(isDamaged ? '#ff4422' : accent);
    armorMaterial.emissiveIntensity = isDamaged ? 1.05 : 0.16;
    accentMaterial.color.set(accent);
    accentMaterial.emissive.set(isDamaged ? '#ffffff' : accent);
    accentMaterial.emissiveIntensity = isDamaged ? 3.4 : 2.2;
  }, [
    accent,
    accentMaterial,
    armorMaterial,
    bodyMaterial,
    isDamaged,
    silhouette.armorColor,
    silhouette.bodyColor,
  ]);

  useEffect(() => () => {
    bodyMaterial.dispose();
    armorMaterial.dispose();
    accentMaterial.dispose();
  }, [accentMaterial, armorMaterial, bodyMaterial]);

  const modelGroupRef = useRef<THREE.Group>(null);
  const shockwaveRefs = useRef<(THREE.Mesh | null)[]>([null, null, null, null]);
  const hitFlashRef = useRef<THREE.Mesh>(null);
  const hitRingRef = useRef<THREE.Mesh>(null);
  const impactFlashRef = useRef<THREE.Mesh>(null);
  const dustPointsRef = useRef<THREE.Points>(null);
  const lastAttackProgress = useRef(0);
  const shockwaveLife = useRef(0);
  const hitPulse = THREE.MathUtils.clamp(mob.hitTimer / 0.42, 0, 1);

  const dustGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const n = 48;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);
  const dustMat = useMemo(() => new THREE.PointsMaterial({
    size: 0.22,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }), []);
  const dustParticles = useRef<Array<{
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    life: number; total: number;
  }>>([]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const dt = Math.min(delta, 0.05);

    targetPositionRef.current.set(mob.x, mob.y, mob.z);
    group.position.lerp(targetPositionRef.current, 0.3);
    targetQuaternionRef.current.setFromAxisAngle(Y_AXIS, mob.rotation);
    group.quaternion.slerp(targetQuaternionRef.current, 0.3);

    const speed = Math.hypot(mob.vx, mob.vz);
    const attackTimer = mob.attackTimer ?? 0;
    const isAttacking = attackTimer > 0.01;
    const atkProgress = isAttacking
      ? THREE.MathUtils.clamp(1 - attackTimer / 0.72, 0, 1)
      : 0;

    // 攻撃: 溜め後傾 → 振り下ろし前傾 → 着地
    let windupPitch = 0;
    let slamDrop = 0;
    let slamScaleY = 1;
    let slamScaleXZ = 1;
    if (isAttacking) {
      if (atkProgress < 0.4) {
        const u = atkProgress / 0.4;
        windupPitch = -0.28 * u;
        slamScaleY = 1 + 0.08 * u;
        slamScaleXZ = 1 - 0.04 * u;
      } else if (atkProgress < 0.55) {
        const u = (atkProgress - 0.4) / 0.15;
        windupPitch = THREE.MathUtils.lerp(-0.28, 0.42, u);
        slamDrop = u * 0.22;
        slamScaleY = THREE.MathUtils.lerp(1.08, 0.88, u);
        slamScaleXZ = THREE.MathUtils.lerp(0.96, 1.12, u);
      } else {
        const u = (atkProgress - 0.55) / 0.45;
        windupPitch = THREE.MathUtils.lerp(0.42, 0, u);
        slamDrop = THREE.MathUtils.lerp(0.22, 0, u);
        slamScaleY = THREE.MathUtils.lerp(0.88, 1, u);
        slamScaleXZ = THREE.MathUtils.lerp(1.12, 1, u);
      }
    }

    // 着地瞬間で衝撃波を起動（progress 0.45 付近）
    if (isAttacking && lastAttackProgress.current < 0.45 && atkProgress >= 0.45) {
      shockwaveLife.current = 0.72;
      // 砂塵パーティクルを周囲にばら撒く
      dustParticles.current = [];
      for (let i = 0; i < 48; i++) {
        const ang = (i / 48) * Math.PI * 2 + Math.random() * 0.2;
        const sp = 2.2 + Math.random() * 4.5;
        dustParticles.current.push({
          x: Math.cos(ang) * 0.4,
          y: 0.08 + Math.random() * 0.15,
          z: Math.sin(ang) * 0.4,
          vx: Math.cos(ang) * sp,
          vy: 1.2 + Math.random() * 3.2,
          vz: Math.sin(ang) * sp,
          life: 0.35 + Math.random() * 0.35,
          total: 0.35 + Math.random() * 0.35,
        });
      }
    }
    lastAttackProgress.current = isAttacking ? atkProgress : 0;

    if (shockwaveLife.current > 0) {
      shockwaveLife.current = Math.max(0, shockwaveLife.current - dt);
    }
    const sw = shockwaveLife.current;
    const swU = sw > 0 ? 1 - sw / 0.72 : 0;

    // 多層衝撃波リング
    shockwaveRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (sw <= 0) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      const delay = i * 0.08;
      const localT = THREE.MathUtils.clamp((swU - delay) / (1 - delay * 0.5), 0, 1);
      if (localT <= 0) {
        mesh.visible = false;
        return;
      }
      const radius = 0.6 + localT * (2.4 + i * 0.85);
      mesh.scale.set(radius, radius, 1);
      mat.opacity = (1 - localT) * (0.75 - i * 0.12);
      mesh.position.y = 0.04 + i * 0.03;
    });

    // 着地フラッシュ
    if (impactFlashRef.current) {
      const mat = impactFlashRef.current.material as THREE.MeshBasicMaterial;
      if (sw > 0.45) {
        const u = (sw - 0.45) / 0.27;
        impactFlashRef.current.visible = true;
        impactFlashRef.current.scale.setScalar(1.2 + (1 - u) * 2.4);
        mat.opacity = u * 0.85;
      } else {
        impactFlashRef.current.visible = false;
      }
    }

    // 砂塵更新
    const posAttr = dustGeo.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = dustGeo.getAttribute('color') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colAttr.array as Float32Array;
    let di = 0;
    for (let i = dustParticles.current.length - 1; i >= 0; i--) {
      const p = dustParticles.current[i];
      p.life -= dt;
      if (p.life <= 0) {
        dustParticles.current.splice(i, 1);
        continue;
      }
      p.vy -= 9 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.94;
      p.vz *= 0.94;
      if (di < 48) {
        const a = p.life / p.total;
        positions[di * 3] = p.x;
        positions[di * 3 + 1] = p.y;
        positions[di * 3 + 2] = p.z;
        colors[di * 3] = 1 * a;
        colors[di * 3 + 1] = (0.75 + 0.2 * a) * a;
        colors[di * 3 + 2] = 0.35 * a;
        di++;
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    dustGeo.setDrawRange(0, di);
    if (dustPointsRef.current) dustPointsRef.current.visible = di > 0;

    if (speed > 0.1 && !isAttacking) {
      group.position.y += Math.sin(animTime * 5) * 0.1;
    }

    // 被ダメフラッシュ（白熱）
    const hp = THREE.MathUtils.clamp(mob.hitTimer / 0.42, 0, 1);
    const wf = THREE.MathUtils.clamp((mob.hitTimer - 0.2) / 0.12, 0, 1);
    if (hp > 0.01) {
      bodyMaterial.emissive.setRGB(1, 0.25 + wf * 0.5, 0.12);
      bodyMaterial.emissiveIntensity = 0.35 + hp * 1.4 + wf * 1.8;
      armorMaterial.emissive.setRGB(1, 0.4 + wf * 0.4, 0.2);
      armorMaterial.emissiveIntensity = 0.4 + hp * 1.5 + wf * 1.6;
      accentMaterial.emissiveIntensity = 2.2 + hp * 2.5 + wf * 2;
    } else {
      bodyMaterial.emissive.set(accent);
      bodyMaterial.emissiveIntensity = 0.12;
      armorMaterial.emissive.set(accent);
      armorMaterial.emissiveIntensity = 0.16;
      accentMaterial.emissiveIntensity = 2.2;
    }

    const hdx = mob.hitDirX ?? 0;
    const hdz = mob.hitDirZ ?? 0;
    const localX = hdx * Math.cos(mob.rotation) - hdz * Math.sin(mob.rotation);
    const hitLean = -hp * 0.18;
    const hitRoll = localX * hp * 0.22 + Math.sin(animTime * 40) * hp * 0.08;

    if (modelGroupRef.current) {
      const squash = (1 - hp * 0.12) * slamScaleY;
      const widen = (1 + hp * 0.1) * slamScaleXZ;
      const base = BOSS_MODEL_SCALE;
      modelGroupRef.current.scale.set(base * widen, base * squash, base * widen);
      modelGroupRef.current.rotation.x = windupPitch + hitLean;
      modelGroupRef.current.rotation.z = hitRoll;
      modelGroupRef.current.position.y = BOSS_MODEL_Y_OFFSET - slamDrop - hp * 0.08;
      modelGroupRef.current.position.x = localX * hp * 0.15;
    }

    if (hitFlashRef.current) {
      const mat = hitFlashRef.current.material as THREE.MeshBasicMaterial;
      if (hp > 0.01) {
        hitFlashRef.current.visible = true;
        hitFlashRef.current.scale.setScalar(1.1 + (1 - hp) * 1.4 + wf * 0.5);
        mat.opacity = 0.18 + wf * 0.55 + hp * 0.25;
      } else {
        hitFlashRef.current.visible = false;
      }
    }
    if (hitRingRef.current) {
      const mat = hitRingRef.current.material as THREE.MeshBasicMaterial;
      if (hp > 0.01) {
        hitRingRef.current.visible = true;
        const s = 0.9 + (1 - hp) * 1.6;
        hitRingRef.current.scale.set(s, s, 1);
        mat.opacity = hp * 0.6;
      } else {
        hitRingRef.current.visible = false;
      }
    }
  });

  const auraOpacity = 0.18 + Math.sin(animTime * 3.2) * 0.05 + hitPulse * 0.35;
  const corePulse = 1 + Math.sin(animTime * 4.6) * 0.08 + hitPulse * 0.22;

  return (
    <group ref={groupRef}>
      {/* ボス着地の地面衝撃波（本体と独立して足元に表示） */}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={`sw-${i}`}
          ref={(el) => { shockwaveRefs.current[i] = el; }}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.05, 0]}
          visible={false}
        >
          <ringGeometry args={[0.85, 1.05, 56]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? accent : '#ffe08a'}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
      <mesh ref={impactFlashRef} position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <circleGeometry args={[1, 40]} />
        <meshBasicMaterial
          color="#fff6d0"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <points ref={dustPointsRef} geometry={dustGeo} material={dustMat} frustumCulled={false} visible={false} />

      <group
        ref={modelGroupRef}
        position={[0, BOSS_MODEL_Y_OFFSET, 0]}
        scale={[BOSS_MODEL_SCALE, BOSS_MODEL_SCALE, BOSS_MODEL_SCALE]}
      >
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.8, 0]}>
          <ringGeometry args={[0.92, 1.32, 44]} />
          <meshBasicMaterial
            color={accent}
            transparent
            opacity={auraOpacity}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh ref={hitRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]} visible={false}>
          <ringGeometry args={[0.55, 1.05, 36]} />
          <meshBasicMaterial
            color="#ff5533"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh ref={hitFlashRef} position={[0, 1.1, 0]} visible={false}>
          <sphereGeometry args={[0.9, 16, 12]} />
          <meshBasicMaterial
            color="#fff2e0"
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        <InstancedBossParts geometry={BOX_GEOMETRY} material={bodyMaterial} parts={silhouette.body} />
        <InstancedBossParts geometry={BOX_GEOMETRY} material={armorMaterial} parts={silhouette.armor} />
        <InstancedBossParts geometry={BRANCH_GEOMETRY} material={bodyMaterial} parts={silhouette.branches} />
        <InstancedBossParts geometry={SPIKE_GEOMETRY} material={armorMaterial} parts={silhouette.spikes} />
        <InstancedBossParts geometry={BOX_GEOMETRY} material={accentMaterial} parts={silhouette.eyes} castShadow={false} />

        <mesh
          geometry={CORE_GEOMETRY}
          material={accentMaterial}
          position={[...silhouette.corePosition]}
          scale={[
            silhouette.coreScale[0] * corePulse,
            silhouette.coreScale[1] * corePulse,
            silhouette.coreScale[2] * corePulse,
          ]}
        />
      </group>
    </group>
  );
}
