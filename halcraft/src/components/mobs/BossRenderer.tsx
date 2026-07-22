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
  const hitPulse = THREE.MathUtils.clamp(mob.hitTimer / 0.28, 0, 1);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    targetPositionRef.current.set(mob.x, mob.y, mob.z);
    group.position.lerp(targetPositionRef.current, 0.3);
    targetQuaternionRef.current.setFromAxisAngle(Y_AXIS, mob.rotation);
    group.quaternion.slerp(targetQuaternionRef.current, 0.3);

    const speed = Math.hypot(mob.vx, mob.vz);
    if (speed > 0.1) {
      group.position.y += Math.sin(animTime * 5) * 0.1;
    }

    // 被ダメ時はスケールで一瞬ひるむ（マテリアル再生成なし・箱化バグ回避）
    if (modelGroupRef.current) {
      const squash = 1 - hitPulse * 0.08;
      const widen = 1 + hitPulse * 0.07;
      const base = BOSS_MODEL_SCALE;
      modelGroupRef.current.scale.set(base * widen, base * squash, base * widen);
    }
  });

  const auraOpacity = 0.18 + Math.sin(animTime * 3.2) * 0.05 + hitPulse * 0.35;
  const corePulse = 1 + Math.sin(animTime * 4.6) * 0.08 + hitPulse * 0.22;

  return (
    <group ref={groupRef}>
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
        {hitPulse > 0.02 && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
            <ringGeometry args={[0.55, 1.05 + hitPulse * 0.9, 36]} />
            <meshBasicMaterial
              color="#ff5533"
              transparent
              opacity={hitPulse * 0.55}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        )}

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
