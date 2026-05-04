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
import { computeGroundOffset } from '../../utils/autoGround';
import {
  TANK_AVATAR_POSITION,
  TANK_AVATAR_SCALE,
  TANK_GROUND_CONTACT_NODE,
  TANK_MODEL_SCALE,
  TANK_MODEL_YAW,
  TANK_TURRET_PIVOT,
} from './vehicleModelConfig';

const TANK_MODEL_PATH = '/models/2026-04-29/tank.glb';
const PROMPT_COLOR = '#9be7ff';

interface TankModelParts {
  hull: THREE.Object3D;
  turret: THREE.Group;
  groundContact: THREE.Object3D | null;
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
    groundContact: tracks ?? null,
  };
}

export function Tank() {
  const tank = useVehicleStore((s) => s.tank);
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);
  const { camera } = useThree();
  const gltf = useGLTF(TANK_MODEL_PATH);
  const modelParts = useMemo(() => createTankModelParts(gltf.scene), [gltf.scene]);
  const promptRef = useRef<THREE.Group>(null);

  // 自動接地: 戦車全体ではなくキャタピラ底面を地面に合わせる
  const autoGroundY = useMemo(
    () => computeGroundOffset(
      modelParts.groundContact ?? gltf.scene,
      TANK_MODEL_SCALE,
      `${TANK_MODEL_PATH}:${TANK_GROUND_CONTACT_NODE}`,
    ),
    [gltf.scene, modelParts.groundContact],
  );
  const modelPos: [number, number, number] = useMemo(
    () => [0, autoGroundY, 0],
    [autoGroundY],
  );

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

  if (!tank.spawned || tank.destroyed) return null;

  return (
    <group
      position={[tank.x, tank.y, tank.z]}
      rotation={[tank.pitch, tank.rotationY, tank.roll]}
    >
      <primitive
        object={modelParts.hull}
        scale={TANK_MODEL_SCALE}
        position={modelPos}
        rotation={[0, TANK_MODEL_YAW, 0]}
      />

      <group position={TANK_TURRET_PIVOT} rotation={[0, tank.turretYaw, 0]}>
        <primitive
          object={modelParts.turret}
          scale={TANK_MODEL_SCALE}
          position={[
            modelPos[0] - TANK_TURRET_PIVOT[0],
            modelPos[1] - TANK_TURRET_PIVOT[1],
            modelPos[2] - TANK_TURRET_PIVOT[2],
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
  const mySeat = useVehicleStore((s) => s.tank.mySeat);
  const pilotId = useVehicleStore((s) => s.tank.seats.pilot);
  const remotePlayers = useMultiplayerStore((s) => s.remotePlayers);
  const myId = useMultiplayerStore((s) => s.myId);
  const localSkinId = usePlayerStore((s) => s.skinId);

  if (pilotId === null) return null;

  const isLocalPilot = pilotId === '__local__' || pilotId === myId;
  if (mySeat === 'pilot' && isLocalPilot) return null;

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
