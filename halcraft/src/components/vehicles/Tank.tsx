// 戦車コンポーネント
// GLB車体 + 視点方向へ回るアセット砲塔 + 搭乗プロンプト

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { TANK_CONSTANTS, useVehicleStore } from '../../stores/useVehicleStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { isValidSkinId } from '../../types/skins';
import { VoxelAvatar } from '../VoxelAvatar';
import { cloneSceneWithMaterials } from './modelUtils';

const TANK_MODEL_PATH = '/models/2026-04-29/tank.glb';
const PROMPT_COLOR = '#9be7ff';
const TANK_MODEL_SCALE = 0.58;
const TANK_MODEL_YAW = -Math.PI / 2;
const TANK_MODEL_POSITION: [number, number, number] = [0, 0.42, 0];
const TANK_TURRET_PIVOT: [number, number, number] = [0.95, 1.92, -0.05];
const TANK_AVATAR_POSITION: [number, number, number] = [0.2, 1.72, 0.18];
const TANK_AVATAR_SCALE = 0.82;

interface TankModelParts {
  hull: THREE.Object3D;
  turret: THREE.Group;
}

function createTankModelParts(scene: THREE.Object3D): TankModelParts {
  const hullSource = scene.getObjectByName('nomad_unskew_1') ?? scene.getObjectByName('ボックス_25');
  const hull = new THREE.Group();
  if (hullSource) hull.add(cloneSceneWithMaterials(hullSource));
  const tracks = scene.getObjectByName('円柱');
  if (tracks) hull.add(cloneSceneWithMaterials(tracks));
  const gatling = scene.getObjectByName('円柱_1');
  if (gatling) hull.add(cloneSceneWithMaterials(gatling));

  const turret = new THREE.Group();
  const turretSource = scene.getObjectByName('nomad_unskew') ?? scene.getObjectByName('円錐');
  if (turretSource) turret.add(cloneSceneWithMaterials(turretSource));

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
        <TankPassengerAvatar />
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

function TankPassengerAvatar() {
  const pilotId = useVehicleStore((s) => s.tank.seats.pilot);
  const remotePlayers = useMultiplayerStore((s) => s.remotePlayers);
  const myId = useMultiplayerStore((s) => s.myId);
  const localSkinId = usePlayerStore((s) => s.skinId);

  if (pilotId === null) return null;

  const isLocalPilot = pilotId === '__local__' || pilotId === myId;
  const remotePilot = isLocalPilot ? null : remotePlayers.get(pilotId);
  if (!isLocalPilot && !remotePilot) return null;

  const skinId = isLocalPilot
    ? localSkinId
    : remotePilot?.skinId && isValidSkinId(remotePilot.skinId)
      ? remotePilot.skinId
      : undefined;

  return (
    <group
      position={[
        TANK_AVATAR_POSITION[0] - TANK_TURRET_PIVOT[0],
        TANK_AVATAR_POSITION[1] - TANK_TURRET_PIVOT[1],
        TANK_AVATAR_POSITION[2] - TANK_TURRET_PIVOT[2],
      ]}
      rotation={[0, Math.PI, 0]}
      scale={TANK_AVATAR_SCALE}
    >
      <VoxelAvatar
        skinId={skinId}
        color={remotePilot?.color}
        isMoving={false}
        isDead={remotePilot?.isDead ?? false}
        deathTime={remotePilot?.deathTime ?? 0}
      />
    </group>
  );
}

useGLTF.preload(TANK_MODEL_PATH);
