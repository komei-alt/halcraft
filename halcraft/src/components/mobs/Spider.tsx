// クモモブコンポーネント
// 低ポリゴンの節足造形を、インスタンス描画で軽量に表現する

import { useLayoutEffect, useRef } from 'react';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';

const SPIDER_BODY_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x292528,
  roughness: 0.78,
  metalness: 0.05,
  flatShading: true,
});
const SPIDER_HEAD_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x373034,
  roughness: 0.72,
  metalness: 0.06,
  flatShading: true,
});
const SPIDER_LEG_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x473322,
  roughness: 0.86,
  flatShading: true,
});
const SPIDER_DAMAGED_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xff5b50,
  emissive: 0x661510,
  emissiveIntensity: 0.45,
  roughness: 0.64,
  flatShading: true,
});
const SPIDER_EYE_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xff261f,
  emissive: 0xff1208,
  emissiveIntensity: 1.5,
  roughness: 0.28,
});
const SPIDER_FANG_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xd6c9a8,
  roughness: 0.58,
});

const BODY_GEOMETRY = new THREE.DodecahedronGeometry(0.5, 0);
const LEG_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const EYE_GEOMETRY = new THREE.OctahedronGeometry(1, 0);
const FANG_GEOMETRY = new THREE.ConeGeometry(0.5, 1, 5);

const LEG_DEFS = [
  { side: -1, pair: 0, z: 0.24 },
  { side: 1, pair: 0, z: 0.24 },
  { side: -1, pair: 1, z: 0.08 },
  { side: 1, pair: 1, z: 0.08 },
  { side: -1, pair: 2, z: -0.1 },
  { side: 1, pair: 2, z: -0.1 },
  { side: -1, pair: 3, z: -0.28 },
  { side: 1, pair: 3, z: -0.28 },
] as const;

const EYE_POSITIONS = [
  [-0.12, 0.35, 0.51, 0.052],
  [0.12, 0.35, 0.51, 0.052],
  [-0.05, 0.27, 0.535, 0.037],
  [0.05, 0.27, 0.535, 0.037],
  [-0.2, 0.33, 0.47, 0.034],
  [0.2, 0.33, 0.47, 0.034],
  [-0.18, 0.25, 0.485, 0.03],
  [0.18, 0.25, 0.485, 0.03],
] as const;

interface SpiderProps {
  mob: MobData;
  animTime: number;
}

export function Spider({ mob, animTime }: SpiderProps) {
  const upperLegsRef = useRef<THREE.InstancedMesh>(null);
  const lowerLegsRef = useRef<THREE.InstancedMesh>(null);
  const eyesRef = useRef<THREE.InstancedMesh>(null);
  const fangsRef = useRef<THREE.InstancedMesh>(null);
  const isDamaged = mob.hitTimer > 0;
  const isMoving = Math.abs(mob.vx) > 0.1 || Math.abs(mob.vz) > 0.1;
  const walkCycle = animTime * (isMoving ? 10 : 1.5);
  const hitTilt = isDamaged ? Math.sin(mob.hitTimer * 20) * 0.1 : 0;
  const bodyMaterial = isDamaged ? SPIDER_DAMAGED_MATERIAL : SPIDER_BODY_MATERIAL;
  const headMaterial = isDamaged ? SPIDER_DAMAGED_MATERIAL : SPIDER_HEAD_MATERIAL;
  const legMaterial = isDamaged ? SPIDER_DAMAGED_MATERIAL : SPIDER_LEG_MATERIAL;

  useLayoutEffect(() => {
    const upperLegs = upperLegsRef.current;
    const lowerLegs = lowerLegsRef.current;
    if (!upperLegs || !lowerLegs) return;

    const part = new THREE.Object3D();
    LEG_DEFS.forEach((leg, index) => {
      const phase = leg.pair * Math.PI * 0.5 + (leg.side < 0 ? Math.PI : 0);
      const gait = Math.sin(walkCycle + phase);
      const lift = isMoving ? Math.max(0, gait) * 0.07 : Math.sin(walkCycle + phase) * 0.012;
      const stride = isMoving ? Math.cos(walkCycle + phase) * 0.06 : 0;
      const splay = (leg.pair - 1.5) * 0.16;

      part.position.set(leg.side * 0.48, 0.25 + lift, leg.z + stride * 0.45);
      part.rotation.set(0, -leg.side * splay, -leg.side * (0.2 + gait * 0.08));
      part.scale.set(0.45, 0.065, 0.075);
      part.updateMatrix();
      upperLegs.setMatrixAt(index, part.matrix);

      part.position.set(leg.side * 0.8, 0.1 + lift * 0.3, leg.z + stride);
      part.rotation.set(0, -leg.side * splay * 1.15, -leg.side * (0.52 - gait * 0.09));
      part.scale.set(0.36, 0.052, 0.065);
      part.updateMatrix();
      lowerLegs.setMatrixAt(index, part.matrix);
    });

    upperLegs.instanceMatrix.needsUpdate = true;
    lowerLegs.instanceMatrix.needsUpdate = true;
    upperLegs.computeBoundingSphere();
    lowerLegs.computeBoundingSphere();
  }, [isMoving, walkCycle]);

  useLayoutEffect(() => {
    const eyes = eyesRef.current;
    const fangs = fangsRef.current;
    if (!eyes || !fangs) return;

    const part = new THREE.Object3D();
    EYE_POSITIONS.forEach(([x, y, z, size], index) => {
      part.position.set(x, y, z);
      part.rotation.set(0, 0, index % 2 === 0 ? -0.16 : 0.16);
      part.scale.setScalar(size);
      part.updateMatrix();
      eyes.setMatrixAt(index, part.matrix);
    });
    eyes.instanceMatrix.needsUpdate = true;
    eyes.computeBoundingSphere();

    [-1, 1].forEach((side, index) => {
      part.position.set(side * 0.105, 0.16, 0.53);
      part.rotation.set(Math.PI - 0.22, 0, side * 0.12);
      part.scale.set(0.065, 0.16, 0.065);
      part.updateMatrix();
      fangs.setMatrixAt(index, part.matrix);
    });
    fangs.instanceMatrix.needsUpdate = true;
    fangs.computeBoundingSphere();
  }, []);

  const hpRatio = mob.hp / mob.maxHp;
  const hpColor = hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xcccc44 : 0xcc4444;

  return (
    <group position={[mob.x, mob.y, mob.z]} rotation={[0, mob.rotation, 0]}>
      {mob.traitAccent && (
        <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.64, 24]} />
          <meshBasicMaterial
            color={mob.traitAccent}
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      <group rotation={[hitTilt, 0, hitTilt * 0.3]}>
        {/* 多面体の腹部と頭胸部で、低ポリのまま丸い輪郭を作る */}
        <mesh
          geometry={BODY_GEOMETRY}
          material={bodyMaterial}
          position={[0, 0.28, -0.18]}
          scale={[0.66, 0.46, 0.74]}
          castShadow
          receiveShadow
          dispose={null}
        />
        <mesh
          geometry={BODY_GEOMETRY}
          material={headMaterial}
          position={[0, 0.28, 0.29]}
          scale={[0.48, 0.38, 0.46]}
          castShadow
          receiveShadow
          dispose={null}
        />

        <instancedMesh
          ref={upperLegsRef}
          args={[LEG_GEOMETRY, legMaterial, LEG_DEFS.length]}
          castShadow
          receiveShadow
          dispose={null}
        />
        <instancedMesh
          ref={lowerLegsRef}
          args={[LEG_GEOMETRY, legMaterial, LEG_DEFS.length]}
          castShadow
          receiveShadow
          dispose={null}
        />
        <instancedMesh
          ref={eyesRef}
          args={[EYE_GEOMETRY, SPIDER_EYE_MATERIAL, EYE_POSITIONS.length]}
          dispose={null}
        />
        <instancedMesh
          ref={fangsRef}
          args={[FANG_GEOMETRY, SPIDER_FANG_MATERIAL, 2]}
          castShadow
          dispose={null}
        />
      </group>

      {mob.hp < mob.maxHp && (
        <Billboard position={[0, 0.86, 0]}>
          <mesh>
            <planeGeometry args={[0.56, 0.06]} />
            <meshBasicMaterial color={0x222222} transparent opacity={0.8} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[-(0.56 - 0.56 * hpRatio) / 2, 0, 0.001]}>
            <planeGeometry args={[0.56 * hpRatio, 0.04]} />
            <meshBasicMaterial color={hpColor} side={THREE.DoubleSide} />
          </mesh>
        </Billboard>
      )}
    </group>
  );
}
