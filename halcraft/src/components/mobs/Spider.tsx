// クモモブコンポーネント
// 低ポリゴンの節足造形を、インスタンス描画で軽量に表現する

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';

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
  const rootRef = useRef<THREE.Group>(null);
  const bodyGroupRef = useRef<THREE.Group>(null);
  const upperLegsRef = useRef<THREE.InstancedMesh>(null);
  const lowerLegsRef = useRef<THREE.InstancedMesh>(null);
  const eyesRef = useRef<THREE.InstancedMesh>(null);
  const fangsRef = useRef<THREE.InstancedMesh>(null);
  const animClock = useRef(0);
  const isDamaged = mob.hitTimer > 0;
  const hitPulse = Math.min(1, mob.hitTimer / 0.22);

  // 個体ごとのマテリアル（被ダメ時も参照を固定して InstancedMesh を再マウントしない）
  const materials = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({
      color: 0x292528, roughness: 0.78, metalness: 0.05, flatShading: true,
    }),
    head: new THREE.MeshStandardMaterial({
      color: 0x373034, roughness: 0.72, metalness: 0.06, flatShading: true,
    }),
    leg: new THREE.MeshStandardMaterial({
      color: 0x473322, roughness: 0.86, flatShading: true,
    }),
  }), []);

  useEffect(() => () => {
    materials.body.dispose();
    materials.head.dispose();
    materials.leg.dispose();
  }, [materials]);

  useLayoutEffect(() => {
    if (isDamaged) {
      materials.body.color.setHex(0xff5b50);
      materials.head.color.setHex(0xff5b50);
      materials.leg.color.setHex(0xff5b50);
      materials.body.emissive.setHex(0xaa2010);
      materials.body.emissiveIntensity = 0.75;
      materials.head.emissive.setHex(0xaa2010);
      materials.head.emissiveIntensity = 0.75;
      materials.leg.emissive.setHex(0x881808);
      materials.leg.emissiveIntensity = 0.55;
    } else {
      materials.body.color.setHex(0x292528);
      materials.head.color.setHex(0x373034);
      materials.leg.color.setHex(0x473322);
      materials.body.emissive.setHex(0x000000);
      materials.body.emissiveIntensity = 0;
      materials.head.emissive.setHex(0x000000);
      materials.head.emissiveIntensity = 0;
      materials.leg.emissive.setHex(0x000000);
      materials.leg.emissiveIntensity = 0;
    }
  }, [isDamaged, materials]);

  // 目・牙は一度だけ配置
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

  useFrame((_, delta) => {
    animClock.current += delta;
    const t = animClock.current;
    const speed = Math.hypot(mob.vx, mob.vz);
    const isMoving = speed > 0.12;
    const walkCycle = t * (isMoving ? 11 : 1.8);
    const hitTilt = isDamaged ? Math.sin(mob.hitTimer * 28) * (0.12 + hitPulse * 0.1) : 0;
    const bodyBob = isMoving ? Math.abs(Math.sin(walkCycle * 2)) * 0.035 : Math.sin(t * 2) * 0.008;

    if (rootRef.current) {
      rootRef.current.position.set(mob.x, mob.y, mob.z);
      rootRef.current.rotation.y = mob.rotation;
    }
    if (bodyGroupRef.current) {
      bodyGroupRef.current.rotation.set(hitTilt, 0, hitTilt * 0.3);
      bodyGroupRef.current.position.y = bodyBob;
    }

    const upperLegs = upperLegsRef.current;
    const lowerLegs = lowerLegsRef.current;
    if (!upperLegs || !lowerLegs) return;

    const part = new THREE.Object3D();
    const speedBoost = isMoving ? 1 : 0.35;
    LEG_DEFS.forEach((leg, index) => {
      const phase = leg.pair * (Math.PI / 2) + (leg.side < 0 ? Math.PI * 0.15 : 0);
      const gait = Math.sin(walkCycle + phase);
      const gait2 = Math.cos(walkCycle + phase);
      const lift = isMoving
        ? Math.max(0, gait) * 0.12 * speedBoost
        : Math.sin(walkCycle * 0.6 + phase) * 0.014;
      const stride = isMoving ? gait2 * 0.11 * speedBoost : gait2 * 0.012;
      const splay = (leg.pair - 1.5) * 0.18;
      const curl = isMoving ? Math.max(0, -gait) * 0.16 : 0.04;

      part.position.set(leg.side * 0.48, 0.25 + lift, leg.z + stride * 0.55);
      part.rotation.set(curl * 0.35, -leg.side * splay, -leg.side * (0.22 + gait * 0.14));
      part.scale.set(0.45, 0.065, 0.075);
      part.updateMatrix();
      upperLegs.setMatrixAt(index, part.matrix);

      part.position.set(
        leg.side * (0.82 + lift * 0.15),
        0.08 + lift * 0.45,
        leg.z + stride * 1.05,
      );
      part.rotation.set(curl * 0.65, -leg.side * splay * 1.2, -leg.side * (0.55 - gait * 0.16));
      part.scale.set(0.36, 0.052, 0.065);
      part.updateMatrix();
      lowerLegs.setMatrixAt(index, part.matrix);
    });

    upperLegs.count = LEG_DEFS.length;
    lowerLegs.count = LEG_DEFS.length;
    upperLegs.instanceMatrix.needsUpdate = true;
    lowerLegs.instanceMatrix.needsUpdate = true;
    upperLegs.visible = true;
    lowerLegs.visible = true;
  });

  // animTime 初回同期
  useEffect(() => {
    if (animClock.current < 0.001) animClock.current = animTime;
  }, [animTime]);

  const hpRatio = mob.hp / mob.maxHp;
  const hpColor = hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xcccc44 : 0xcc4444;

  return (
    <group ref={rootRef} position={[mob.x, mob.y, mob.z]} rotation={[0, mob.rotation, 0]}>
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

      <group ref={bodyGroupRef}>
        {/* 多面体の腹部と頭胸部で、低ポリのまま丸い輪郭を作る */}
        <mesh
          geometry={BODY_GEOMETRY}
          material={materials.body}
          position={[0, 0.28, -0.18]}
          scale={[0.66, 0.46, 0.74]}
          castShadow
          receiveShadow
          dispose={null}
        />
        <mesh
          geometry={BODY_GEOMETRY}
          material={materials.head}
          position={[0, 0.28, 0.29]}
          scale={[0.48, 0.38, 0.46]}
          castShadow
          receiveShadow
          dispose={null}
        />

        <instancedMesh
          ref={upperLegsRef}
          args={[LEG_GEOMETRY, materials.leg, LEG_DEFS.length]}
          castShadow
          receiveShadow
          dispose={null}
          visible={false}
          frustumCulled={false}
        />
        <instancedMesh
          ref={lowerLegsRef}
          args={[LEG_GEOMETRY, materials.leg, LEG_DEFS.length]}
          castShadow
          receiveShadow
          dispose={null}
          visible={false}
          frustumCulled={false}
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
            <meshBasicMaterial
              color={0x222222}
              transparent
              opacity={0.8}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[-(0.56 - 0.56 * hpRatio) / 2, 0, 0.001]}>
            <planeGeometry args={[0.56 * hpRatio, 0.04]} />
            <meshBasicMaterial color={hpColor} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </Billboard>
      )}
    </group>
  );
}
