// 飛行機コンポーネント
// GLB機体 + ライト + 搭乗プロンプト
// グループ原点 = 地面上面。モデル底面は autoGround で Y=0 に揃える。

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { AIRPLANE_CONSTANTS, useVehicleStore } from '../../stores/useVehicleStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { isValidSkinId } from '../../types/skins';
import { VoxelAvatar } from '../VoxelAvatar';
import { cloneSceneWithMaterials } from './modelUtils';
import { computeGroundOffset } from '../../utils/autoGround';
import {
  AIRPLANE_AVATAR_POSITION,
  AIRPLANE_AVATAR_SCALE,
  AIRPLANE_MODEL_SCALE,
  AIRPLANE_MODEL_XZ_OFFSET,
  AIRPLANE_MODEL_YAW,
} from './vehicleModelConfig';

const AIRPLANE_MODEL_PATH = '/models/2026-04-29/airplane.glb';

export function Airplane() {
  const airplane = useVehicleStore((s) => s.airplane);
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);
  const { camera } = useThree();
  const gltf = useGLTF(AIRPLANE_MODEL_PATH);
  const model = useMemo(() => cloneSceneWithMaterials(gltf.scene), [gltf.scene]);
  const promptRef = useRef<THREE.Group>(null);

  // 自動接地: モデル底面をグループ原点 Y=0（=地面）に揃える
  const modelPos: [number, number, number] = useMemo(
    () => [
      AIRPLANE_MODEL_XZ_OFFSET[0],
      computeGroundOffset(gltf.scene, AIRPLANE_MODEL_SCALE, AIRPLANE_MODEL_PATH),
      AIRPLANE_MODEL_XZ_OFFSET[1],
    ],
    [gltf.scene],
  );

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

  if (!airplane.spawned || airplane.destroyed) return null;

  return (
    <group
      position={[airplane.x, airplane.y, airplane.z]}
      rotation={[airplane.pitch, airplane.rotationY, airplane.roll]}
    >
      <primitive
        object={model}
        scale={AIRPLANE_MODEL_SCALE}
        position={modelPos}
        rotation={[0, AIRPLANE_MODEL_YAW, 0]}
      />
      <AirplanePassengerAvatar />

      {airplane.engineOn && (
        <pointLight position={[0, 1.8, -4.2]} color="#fff4c8" intensity={1.4} distance={26} />
      )}

      <Billboard ref={promptRef} position={[0, 4.2, 0]}>
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

function AirplanePassengerAvatar() {
  const mySeat = useVehicleStore((s) => s.airplane.mySeat);
  const pilotId = useVehicleStore((s) => s.airplane.seats.pilot);
  const remotePlayers = useMultiplayerStore((s) => s.remotePlayers);
  const myId = useMultiplayerStore((s) => s.myId);
  const localSkinId = usePlayerStore((s) => s.skinId);

  if (pilotId === null) return null;

  const isLocalPilot = pilotId === '__local__' || pilotId === myId;
  // ローカル操縦者は三人称カメラなので、車内アバターを重ねない
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
      position={AIRPLANE_AVATAR_POSITION}
      rotation={[0, Math.PI, 0]}
      scale={AIRPLANE_AVATAR_SCALE}
    >
      <VoxelAvatar
        skinId={skinId}
        color={remotePilot?.color}
        isMoving={false}
        pose="seated"
        isDead={remotePilot?.isDead ?? false}
        deathTime={remotePilot?.deathTime ?? 0}
      />
    </group>
  );
}

useGLTF.preload(AIRPLANE_MODEL_PATH);
