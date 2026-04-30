// 飛行機コンポーネント
// GLB機体 + ライト + 搭乗プロンプト

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { AIRPLANE_CONSTANTS, useVehicleStore } from '../../stores/useVehicleStore';
import { cloneSceneWithMaterials } from './modelUtils';

const AIRPLANE_MODEL_PATH = '/models/2026-04-29/airplane.glb';

export function Airplane() {
  const airplane = useVehicleStore((s) => s.airplane);
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);
  const { camera } = useThree();
  const gltf = useGLTF(AIRPLANE_MODEL_PATH);
  const model = useMemo(() => cloneSceneWithMaterials(gltf.scene), [gltf.scene]);
  const promptRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (promptRef.current) {
      const dist = camera.position.distanceTo(new THREE.Vector3(airplane.x, airplane.y, airplane.z));
      promptRef.current.visible =
        airplane.spawned &&
        activeVehicle === null &&
        airplane.seats.pilot === null &&
        dist < AIRPLANE_CONSTANTS.BOARD_DISTANCE + 2;
    }
  });

  if (!airplane.spawned) return null;

  return (
    <group
      position={[airplane.x, airplane.y, airplane.z]}
      rotation={[airplane.pitch, airplane.rotationY, airplane.roll]}
    >
      <primitive
        object={model}
        scale={0.105}
        position={[0, 1.0, 0]}
        rotation={[0, Math.PI, 0]}
      />

      {airplane.engineOn && (
        <pointLight position={[0, 1.8, -4.2]} color="#fff4c8" intensity={1.4} distance={26} />
      )}

      <Billboard ref={promptRef} position={[0, 5.4, 0]}>
        <Text
          fontSize={0.38}
          color="#fff0a6"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.04}
          outlineColor="#121212"
        >
          F 飛行機に乗る
        </Text>
      </Billboard>
    </group>
  );
}

useGLTF.preload(AIRPLANE_MODEL_PATH);
