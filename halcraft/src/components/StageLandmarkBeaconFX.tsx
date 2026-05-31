// ステージランドマークの場所を遠目にも分かるようにする軽量ビーコン

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import {
  STAGE_LANDMARK_CENTER,
  STAGE_LANDMARK_RADIUS,
  STAGE_LANDMARK_WORLD_CENTER,
} from '../types/stageLandmarks';
import { getTerrainHeight } from '../utils/terrain/heightmap';

export function StageLandmarkBeaconFX() {
  const groupRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const stageId = stage?.id ?? null;

  const landmarkY = useMemo(() => {
    if (!stageId) return 0;
    return getTerrainHeight(STAGE_LANDMARK_CENTER.x, STAGE_LANDMARK_CENTER.z) + 1.12;
  }, [stageId]);

  useFrame(({ clock }) => {
    if (phase !== 'playing' || !groupRef.current) return;

    const elapsed = clock.getElapsedTime();
    groupRef.current.rotation.y = elapsed * (stage?.category === 'war' ? 0.55 : 0.34);

    if (pulseRef.current) {
      const pulse = 1 + Math.sin(elapsed * 2.2) * 0.08;
      pulseRef.current.scale.set(pulse, pulse, pulse);
    }

    if (coreRef.current) {
      const glow = 1 + Math.max(0, Math.sin(elapsed * 3.4)) * 0.2;
      coreRef.current.scale.setScalar(glow);
    }
  });

  if (!stage || phase !== 'playing') return null;

  const accent = stage.color;
  const isWar = stage.category === 'war';
  const y = landmarkY;

  return (
    <group
      ref={groupRef}
      position={[STAGE_LANDMARK_WORLD_CENTER.x, y, STAGE_LANDMARK_WORLD_CENTER.z]}
      renderOrder={3}
    >
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[STAGE_LANDMARK_RADIUS * 0.52, 0.075, 8, 72]} />
        <meshBasicMaterial color={accent} transparent opacity={0.28} depthWrite={false} />
      </mesh>

      <mesh ref={pulseRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[STAGE_LANDMARK_RADIUS * 0.28, 0.06, 8, 64]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.36} depthWrite={false} />
      </mesh>

      <mesh position={[0, isWar ? 2.8 : 2.35, 0]}>
        <cylinderGeometry args={[0.12, 0.12, isWar ? 5.2 : 4.2, 8]} />
        <meshBasicMaterial color={accent} transparent opacity={isWar ? 0.2 : 0.16} depthWrite={false} />
      </mesh>

      <mesh ref={coreRef} position={[0, isWar ? 5.55 : 4.7, 0]}>
        {isWar ? <octahedronGeometry args={[0.62, 0]} /> : <sphereGeometry args={[0.54, 16, 10]} />}
        <meshBasicMaterial color={accent} transparent opacity={0.82} depthWrite={false} />
      </mesh>

      <mesh position={[0, isWar ? 5.55 : 4.7, 0]}>
        {isWar ? <octahedronGeometry args={[1.08, 0]} /> : <sphereGeometry args={[0.94, 16, 10]} />}
        <meshBasicMaterial color={accent} transparent opacity={0.18} depthWrite={false} />
      </mesh>

      {isWar ? (
        <mesh position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[3.2, 3.45, 4]} />
          <meshBasicMaterial color="#ff6d4a" transparent opacity={0.34} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ) : (
        <mesh position={[0, 3.8, 0]} rotation={[0, Math.PI / 4, 0]}>
          <boxGeometry args={[2.8, 0.08, 2.8]} />
          <meshBasicMaterial color="#fff6b0" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
