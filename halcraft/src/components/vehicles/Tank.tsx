// 戦車コンポーネント
// GLB車体 + 視点方向へ回るアセット砲塔 + 搭乗プロンプト

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { TANK_CONSTANTS, useVehicleStore } from '../../stores/useVehicleStore';
import { cloneSceneWithMaterials } from './modelUtils';

const TANK_MODEL_PATH = '/models/2026-04-29/tank.glb';
const PROMPT_COLOR = '#9be7ff';
const TANK_MODEL_SCALE = 0.58;
const TANK_MODEL_YAW = -Math.PI / 2;
const TANK_MODEL_POSITION: [number, number, number] = [0, 0.42, 0];
const TANK_TURRET_PIVOT: [number, number, number] = [0.95, 1.92, -0.05];

interface TankModelParts {
  hull: THREE.Object3D;
  turret: THREE.Group;
}

function createTankModelParts(scene: THREE.Object3D): TankModelParts {
  const hullSource = scene.getObjectByName('nomad_unskew_1') ?? scene.getObjectByName('ボックス_25');
  const hull = hullSource ? cloneSceneWithMaterials(hullSource) : new THREE.Group();

  const turret = new THREE.Group();
  for (const child of scene.children) {
    if (child.name === 'nomad_unskew_1') continue;
    turret.add(cloneSceneWithMaterials(child));
  }

  return {
    hull,
    turret,
  };
}

export function Tank() {
  const tank = useVehicleStore((s) => s.tank);
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);
  const { camera } = useThree();
  const gltf = useGLTF(TANK_MODEL_PATH);
  const modelParts = useMemo(() => createTankModelParts(gltf.scene), [gltf.scene]);
  const promptRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (promptRef.current) {
      const dist = camera.position.distanceTo(new THREE.Vector3(tank.x, tank.y, tank.z));
      promptRef.current.visible =
        tank.spawned &&
        activeVehicle === null &&
        tank.seats.pilot === null &&
        dist < TANK_CONSTANTS.BOARD_DISTANCE + 2;
    }
  });

  if (!tank.spawned) return null;

  return (
    <group
      position={[tank.x, tank.y, tank.z]}
      rotation={[tank.pitch, tank.rotationY, tank.roll]}
    >
      <primitive
        object={modelParts.hull}
        scale={TANK_MODEL_SCALE}
        position={TANK_MODEL_POSITION}
        rotation={[0, TANK_MODEL_YAW, 0]}
      />

      <group position={TANK_TURRET_PIVOT} rotation={[0, tank.turretYaw, 0]}>
        <primitive
          object={modelParts.turret}
          scale={TANK_MODEL_SCALE}
          position={[
            TANK_MODEL_POSITION[0] - TANK_TURRET_PIVOT[0],
            TANK_MODEL_POSITION[1] - TANK_TURRET_PIVOT[1],
            TANK_MODEL_POSITION[2] - TANK_TURRET_PIVOT[2],
          ]}
          rotation={[0, TANK_MODEL_YAW, 0]}
        />
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
