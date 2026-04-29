// 戦車コンポーネント
// GLB車体 + 視点方向へ回るボクセル砲塔 + 搭乗プロンプト

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { TANK_CONSTANTS, useVehicleStore } from '../../stores/useVehicleStore';
import { cloneSceneWithMaterials } from './modelUtils';

const TANK_MODEL_PATH = '/models/2026-04-29/tank.glb';
const PROMPT_COLOR = '#9be7ff';

export function Tank() {
  const tank = useVehicleStore((s) => s.tank);
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);
  const { camera } = useThree();
  const gltf = useGLTF(TANK_MODEL_PATH);
  const model = useMemo(() => cloneSceneWithMaterials(gltf.scene), [gltf.scene]);
  const promptRef = useRef<THREE.Group>(null);
  const gunSpinRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (promptRef.current) {
      const dist = camera.position.distanceTo(new THREE.Vector3(tank.x, tank.y, tank.z));
      promptRef.current.visible =
        tank.spawned &&
        activeVehicle === null &&
        tank.seats.pilot === null &&
        dist < TANK_CONSTANTS.BOARD_DISTANCE + 2;
    }

    if (gunSpinRef.current) {
      const spinSpeed = tank.engineOn ? 10 + Math.abs(tank.speed) * 1.6 : 0;
      gunSpinRef.current.rotation.z += spinSpeed * delta;
    }
  });

  if (!tank.spawned) return null;

  return (
    <group
      position={[tank.x, tank.y, tank.z]}
      rotation={[tank.pitch, tank.rotationY, tank.roll]}
    >
      <primitive
        object={model}
        scale={0.58}
        position={[0, 0.42, 0]}
        rotation={[0, Math.PI, 0]}
      />

      <group position={[0, 1.88, 0]} rotation={[0, tank.turretYaw, 0]}>
        <mesh castShadow receiveShadow position={[0, 0, 0]}>
          <boxGeometry args={[1.55, 0.42, 1.25]} />
          <meshStandardMaterial color="#385058" roughness={0.7} metalness={0.25} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0.04, -1.45]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.12, 0.16, 2.25, 12]} />
          <meshStandardMaterial color="#263238" roughness={0.5} metalness={0.4} />
        </mesh>
        <group ref={gunSpinRef} position={[0.62, 0.03, -0.95]}>
          {[-0.09, 0, 0.09].map((x) => (
            <mesh key={x} castShadow position={[x, 0, -0.45]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.035, 0.035, 0.95, 8]} />
              <meshStandardMaterial color="#1f1f1f" roughness={0.45} metalness={0.55} />
            </mesh>
          ))}
        </group>
      </group>

      {tank.engineOn && (
        <pointLight position={[0, 2.3, -1.4]} color="#ffd27a" intensity={0.9} distance={12} />
      )}

      <Billboard ref={promptRef} position={[0, 3.2, 0]}>
        <Text
          fontSize={0.34}
          color={PROMPT_COLOR}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.035}
          outlineColor="#101820"
        >
          F 戦車に乗る
        </Text>
      </Billboard>
    </group>
  );
}

useGLTF.preload(TANK_MODEL_PATH);
