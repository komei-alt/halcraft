import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import type { MobData } from '../../stores/useMobStore';

interface BossRendererProps {
  mob: MobData;
  animTime: number;
}

export function BossRenderer({ mob, animTime }: BossRendererProps) {
  const group = useRef<THREE.Group>(null);

  // 巨大スケール
  const bossScale = 4.0; 

  useFrame(() => {
    if (!group.current) return;
    
    // 位置を補間してスムーズな移動
    group.current.position.lerp(new THREE.Vector3(mob.x, mob.y, mob.z), 0.3);

    // 向きを補間
    const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), mob.rotation);
    group.current.quaternion.slerp(targetQuaternion, 0.3);

    // 歩行時のボビング（巨体なのでゆっくり）
    const speed = Math.sqrt(mob.vx * mob.vx + mob.vz * mob.vz);
    if (speed > 0.1) {
      group.current.position.y += Math.sin(animTime * 5) * 0.1;
    }
  });

  const materialParameters = useMemo(
    () => ({
      color: mob.hitTimer > 0 ? '#ffcccc' : '#663333',
      roughness: 0.8,
      metalness: 0.2,
    }),
    [mob.hitTimer],
  );

  return (
    <group ref={group} scale={[bossScale, bossScale, bossScale]}>
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
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={2} />
      </mesh>
      <mesh position={[0.15, 1.5, 0.26]}>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={2} />
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
  );
}
