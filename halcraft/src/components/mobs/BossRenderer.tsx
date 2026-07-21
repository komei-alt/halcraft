import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import type { MobData } from '../../stores/useMobStore';

interface BossRendererProps {
  mob: MobData;
  animTime: number;
}

const _bossPos = new THREE.Vector3();
const _bossQuat = new THREE.Quaternion();
const _bossYAxis = new THREE.Vector3(0, 1, 0);

export function BossRenderer({ mob, animTime }: BossRendererProps) {
  const group = useRef<THREE.Group>(null);

  // 巨大スケール
  const bossScale = 4.0;
  const accent = mob.traitAccent ?? '#ff6b4a';

  useFrame(() => {
    if (!group.current) return;

    // 位置を補間してスムーズな移動
    _bossPos.set(mob.x, mob.y, mob.z);
    group.current.position.lerp(_bossPos, 0.3);

    // 向きを補間
    _bossQuat.setFromAxisAngle(_bossYAxis, mob.rotation);
    group.current.quaternion.slerp(_bossQuat, 0.3);

    // 歩行時のボビング（巨体なのでゆっくり）
    const speed = Math.sqrt(mob.vx * mob.vx + mob.vz * mob.vz);
    if (speed > 0.1) {
      group.current.position.y += Math.sin(animTime * 5) * 0.1;
    }
  });

  const materialParameters = useMemo(
    () => ({
      color: mob.hitTimer > 0 ? '#ffcccc' : '#4a3437',
      emissive: accent,
      emissiveIntensity: mob.hitTimer > 0 ? 0.55 : 0.18,
      roughness: 0.8,
      metalness: 0.2,
    }),
    [accent, mob.hitTimer],
  );
  const auraOpacity = 0.18 + Math.sin(animTime * 3.2) * 0.05;

  return (
    <group
      ref={group}
      position={[mob.x, mob.y, mob.z]}
      rotation={[0, mob.rotation, 0]}
    >
      {/* 足元オーラはスケール外に置き、足底（local y=-0.6）付近へ合わせる */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -bossScale * 0.6 + 0.05, 0]}
        scale={[bossScale * 1.15, bossScale * 1.15, 1]}
      >
        <ringGeometry args={[0.82, 1.2, 52]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={auraOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>

      <group scale={[bossScale, bossScale, bossScale]}>
        {/* 胴体 */}
        <RoundedBox args={[0.8, 1.2, 0.4]} position={[0, 0.6, 0]} radius={0.05} smoothness={4}>
          <meshStandardMaterial {...materialParameters} />
        </RoundedBox>

        {/* 頭（少し大きめ） */}
        <RoundedBox args={[0.5, 0.5, 0.5]} position={[0, 1.45, 0]} radius={0.05} smoothness={4}>
          <meshStandardMaterial {...materialParameters} />
        </RoundedBox>

        {/* 目（赤く光る） */}
        <mesh position={[-0.15, 1.5, 0.26]}>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2.4} />
        </mesh>
        <mesh position={[0.15, 1.5, 0.26]}>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2.4} />
        </mesh>

        {/* 胸のコア */}
        <mesh position={[0, 0.82, 0.24]}>
          <octahedronGeometry args={[0.13, 0]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.6} roughness={0.45} />
        </mesh>

        {/* 腕 */}
        <RoundedBox args={[0.2, 0.8, 0.3]} position={[-0.6, 0.8, 0]} radius={0.05} smoothness={4}>
          <meshStandardMaterial {...materialParameters} />
        </RoundedBox>
        <RoundedBox args={[0.2, 0.8, 0.3]} position={[0.6, 0.8, 0]} radius={0.05} smoothness={4}>
          <meshStandardMaterial {...materialParameters} />
        </RoundedBox>

        {/* 足 */}
        <RoundedBox args={[0.3, 0.6, 0.3]} position={[-0.2, -0.3, 0]} radius={0.05} smoothness={4}>
          <meshStandardMaterial {...materialParameters} />
        </RoundedBox>
        <RoundedBox args={[0.3, 0.6, 0.3]} position={[0.2, -0.3, 0]} radius={0.05} smoothness={4}>
          <meshStandardMaterial {...materialParameters} />
        </RoundedBox>
      </group>
    </group>
  );
}
