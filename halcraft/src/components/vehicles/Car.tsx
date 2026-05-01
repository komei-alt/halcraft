// 車1コンポーネント
// 新規GLB車体 + 4人分の車内アバター + 搭乗プロンプト

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
  CAR_CONSTANTS,
  CAR_SEAT_NAMES,
  CAR_SEAT_PRIORITY,
  useVehicleStore,
  type CarSeatType,
} from '../../stores/useVehicleStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { isValidSkinId } from '../../types/skins';
import { VoxelAvatar } from '../VoxelAvatar';
import { cloneSceneWithMaterials } from './modelUtils';

const CAR_MODEL_PATH = '/models/2026-05-01/car-1.glb';
const CAR_MODEL_SCALE = 0.34;
const CAR_MODEL_POSITION: [number, number, number] = [0, 0.66, 1.92];
const CAR_MODEL_YAW = Math.PI;
const CAR_AVATAR_SCALE = 0.46;

const CAR_AVATAR_POSITIONS: Record<CarSeatType, [number, number, number]> = {
  driver: [-0.42, 0.68, -0.58],
  front_passenger: [0.42, 0.68, -0.58],
  rear_left: [-0.42, 0.68, 0.36],
  rear_right: [0.42, 0.68, 0.36],
};

export function Car() {
  const car = useVehicleStore((s) => s.car);
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);
  const { camera } = useThree();
  const gltf = useGLTF(CAR_MODEL_PATH);
  const model = useMemo(() => cloneSceneWithMaterials(gltf.scene), [gltf.scene]);
  const promptRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (promptRef.current) {
      const dist = camera.position.distanceTo(new THREE.Vector3(car.x, car.y, car.z));
      promptRef.current.visible =
        car.spawned &&
        activeVehicle === null &&
        CAR_SEAT_PRIORITY.some((seat) => car.seats[seat] === null) &&
        dist < CAR_CONSTANTS.BOARD_DISTANCE + 2;
    }
  });

  if (!car.spawned) return null;

  return (
    <group
      position={[car.x, car.y, car.z]}
      rotation={[car.pitch, car.rotationY, car.roll]}
    >
      <primitive
        object={model}
        scale={CAR_MODEL_SCALE}
        position={CAR_MODEL_POSITION}
        rotation={[0, CAR_MODEL_YAW, 0]}
      />

      {CAR_SEAT_PRIORITY.map((seat) => (
        <CarPassengerAvatar key={seat} seat={seat} />
      ))}

      {car.engineOn && (
        <>
          <pointLight position={[-0.7, 0.78, -1.95]} color="#fff3bb" intensity={0.9} distance={10} />
          <pointLight position={[0.7, 0.78, -1.95]} color="#fff3bb" intensity={0.9} distance={10} />
        </>
      )}

      <Billboard ref={promptRef} position={[0, 2.55, 0]}>
        <Text
          fontSize={0.34}
          color="#c6f7ff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.035}
          outlineColor="#10202a"
        >
          F 車1に乗る
        </Text>
      </Billboard>
    </group>
  );
}

function CarPassengerAvatar({ seat }: { seat: CarSeatType }) {
  const seatPlayerId = useVehicleStore((s) => s.car.seats[seat]);
  const remotePlayers = useMultiplayerStore((s) => s.remotePlayers);
  const myId = useMultiplayerStore((s) => s.myId);
  const localSkinId = usePlayerStore((s) => s.skinId);

  if (seatPlayerId === null) return null;

  const isLocalPlayer = seatPlayerId === '__local__' || seatPlayerId === myId;
  const remotePlayer = isLocalPlayer ? null : remotePlayers.get(seatPlayerId);
  if (!isLocalPlayer && !remotePlayer) return null;

  const skinId = isLocalPlayer
    ? localSkinId
    : remotePlayer?.skinId && isValidSkinId(remotePlayer.skinId)
      ? remotePlayer.skinId
      : undefined;

  const avatarPosition = CAR_AVATAR_POSITIONS[seat];

  return (
    <group
      position={avatarPosition}
      rotation={[0, 0, 0]}
      scale={CAR_AVATAR_SCALE}
    >
      <VoxelAvatar
        skinId={skinId}
        color={remotePlayer?.color}
        isMoving={false}
        pose="seated"
        isDead={remotePlayer?.isDead ?? false}
        deathTime={remotePlayer?.deathTime ?? 0}
      />
      <Billboard position={[0, 1.18, 0]}>
        <Text
          fontSize={0.12}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.018}
          outlineColor="#0b1117"
        >
          {CAR_SEAT_NAMES[seat]}
        </Text>
      </Billboard>
    </group>
  );
}

useGLTF.preload(CAR_MODEL_PATH);
