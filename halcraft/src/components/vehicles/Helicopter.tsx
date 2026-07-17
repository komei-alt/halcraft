// ヘリコプターコンポーネント
// 静的部品を材質単位で結合し、低い描画負荷で説得力のある機体シルエットを作る

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import {
  ALL_SEATS,
  HELICOPTER_CONSTANTS,
  SEAT_MODEL_OFFSETS,
  useVehicleStore,
} from '../../stores/useVehicleStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { isValidSkinId } from '../../types/skins';
import { VoxelAvatar } from '../VoxelAvatar';

type Vector3Tuple = [number, number, number];

interface BoxPart {
  position: Vector3Tuple;
  size: Vector3Tuple;
  rotation?: Vector3Tuple;
}

interface CylinderPart {
  position: Vector3Tuple;
  radiusTop: number;
  radiusBottom: number;
  height: number;
  rotation?: Vector3Tuple;
  radialSegments?: number;
}

const BODY_COLOR = new THREE.Color(0xff3333);
const BODY_WHITE = new THREE.Color(0xfffaf0);
const ROTOR_COLOR = new THREE.Color(0x30343a);
const WINDOW_COLOR = new THREE.Color(0x65d8f3);
const SKID_COLOR = new THREE.Color(0x25282e);
const STRIPE_COLOR = new THREE.Color(0xffd520);
const TRIM_COLOR = new THREE.Color(0x20242b);
const ENGINE_COLOR = new THREE.Color(0x555d66);
const INTERIOR_COLOR = new THREE.Color(0x202833);
const BEACON_COLOR = new THREE.Color(0xff8536);
const ROTOR_BLUR_COLOR = new THREE.Color(0xe8eef7);
const HEADLIGHT_COLOR = new THREE.Color(0xffffcc);
const HEADLIGHT_LENS_COLOR = new THREE.Color(0xffffaa);

const HEADLIGHT_CONFIG = {
  BOARDED_INTENSITY: 5.2,
  IDLE_INTENSITY: 1.35,
  BOARDED_EMISSIVE: 2.1,
  IDLE_EMISSIVE: 0.55,
  DISTANCE: 27,
  ANGLE: Math.PI / 4.8,
  PENUMBRA: 0.48,
  DECAY: 1.7,
} as const;

const UNIT_EULER: Vector3Tuple = [0, 0, 0];

function transformGeometry(
  geometry: THREE.BufferGeometry,
  position: Vector3Tuple,
  rotation: Vector3Tuple = UNIT_EULER,
): THREE.BufferGeometry {
  geometry.rotateX(rotation[0]);
  geometry.rotateY(rotation[1]);
  geometry.rotateZ(rotation[2]);
  geometry.translate(position[0], position[1], position[2]);
  return geometry;
}

function mergeAndDispose(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  merged.computeBoundingSphere();
  return merged;
}

function createBoxGeometry(parts: BoxPart[]): THREE.BufferGeometry {
  return mergeAndDispose(parts.map((part) => transformGeometry(
    new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]),
    part.position,
    part.rotation,
  )));
}

function createCylinderGeometry(parts: CylinderPart[]): THREE.BufferGeometry {
  return mergeAndDispose(parts.map((part) => transformGeometry(
    new THREE.CylinderGeometry(
      part.radiusTop,
      part.radiusBottom,
      part.height,
      part.radialSegments ?? 8,
    ),
    part.position,
    part.rotation,
  )));
}

/** 箱の端面を絞り、ボクセル感を残したまま機首・テールに流線を作る。 */
function createTaperedBoxGeometry(
  size: Vector3Tuple,
  position: Vector3Tuple,
  rearScale: number,
  frontScale: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2], 1, 1, 4);
  const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
  const halfDepth = size[2] * 0.5;

  for (let index = 0; index < attribute.count; index++) {
    const localZ = attribute.getZ(index);
    const progress = THREE.MathUtils.clamp((localZ + halfDepth) / size[2], 0, 1);
    const scale = THREE.MathUtils.lerp(rearScale, frontScale, progress);
    attribute.setXYZ(
      index,
      attribute.getX(index) * scale + position[0],
      attribute.getY(index) * (0.76 + scale * 0.24) + position[1],
      localZ + position[2],
    );
  }

  attribute.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

const SHELL_GEOMETRY = mergeAndDispose([
  createTaperedBoxGeometry([1.62, 1.16, 1.58], [0, 0.31, 1.02], 1, 0.48),
  createTaperedBoxGeometry([0.62, 0.56, 2.52], [0, 0.42, -2.23], 0.28, 1),
  createBoxGeometry([
    { position: [0, 0.78, -0.28], size: [1.62, 0.28, 1.52] },
    { position: [0, -0.17, -0.28], size: [1.62, 0.3, 1.52] },
    { position: [0, 0.3, -1.16], size: [1.5, 1.08, 0.4] },
    { position: [0, 0.96, 0.1], size: [0.92, 0.18, 1.08] },
    { position: [0, 1.05, -3.17], size: [0.12, 1.12, 0.62] },
    { position: [0, 0.68, -3.16], size: [1.22, 0.08, 0.46] },
    { position: [-0.56, 0.84, -3.18], size: [0.08, 0.38, 0.2] },
    { position: [0.56, 0.84, -3.18], size: [0.08, 0.38, 0.2] },
  ]),
]);

const WHITE_GEOMETRY = createBoxGeometry([
  { position: [0, -0.24, 0.92], size: [1.24, 0.24, 0.88], rotation: [-0.08, 0, 0] },
  { position: [0, -0.29, -0.32], size: [1.48, 0.2, 1.38] },
]);

const STRIPE_GEOMETRY = createBoxGeometry([
  { position: [0, 0.29, 0.3], size: [1.67, 0.14, 0.38] },
  { position: [0, 0.47, -2.08], size: [0.64, 0.09, 1.22] },
]);

const WINDOW_GEOMETRY = createBoxGeometry([
  { position: [0, 0.63, 1.59], size: [1.08, 0.58, 0.055], rotation: [-0.18, 0, 0] },
  { position: [-0.805, 0.55, 0.84], size: [0.035, 0.53, 0.7] },
  { position: [0.805, 0.55, 0.84], size: [0.035, 0.53, 0.7] },
]);

const TRIM_GEOMETRY = createBoxGeometry([
  { position: [0, 0.93, 1.36], size: [1.16, 0.08, 0.38], rotation: [-0.1, 0, 0] },
  { position: [0, 0.62, 1.63], size: [0.075, 0.64, 0.07], rotation: [-0.18, 0, 0] },
  { position: [-0.55, 0.61, 1.54], size: [0.07, 0.62, 0.08], rotation: [0.18, 0, 0] },
  { position: [0.55, 0.61, 1.54], size: [0.07, 0.62, 0.08], rotation: [0.18, 0, 0] },
  { position: [-0.8, 0.32, 0.08], size: [0.07, 0.92, 0.09] },
  { position: [-0.8, 0.32, -0.77], size: [0.07, 0.92, 0.09] },
  { position: [0.8, 0.32, 0.08], size: [0.07, 0.92, 0.09] },
  { position: [0.8, 0.32, -0.77], size: [0.07, 0.92, 0.09] },
  { position: [-0.84, -0.02, -0.34], size: [0.12, 0.18, 1.18] },
  { position: [0.84, -0.02, -0.34], size: [0.12, 0.18, 1.18] },
  { position: [0, -0.34, 1.05], size: [0.4, 0.13, 0.3] },
  { position: [0, 1.2, 0], size: [0.16, 0.38, 0.16] },
  { position: [0.18, 1.29, 0.08], size: [0.05, 0.34, 0.05], rotation: [0.35, 0, -0.55] },
  { position: [-0.18, 1.29, 0.08], size: [0.05, 0.34, 0.05], rotation: [0.35, 0, 0.55] },
  { position: [0.18, 1.29, -0.08], size: [0.05, 0.34, 0.05], rotation: [-0.35, 0, -0.55] },
  { position: [-0.18, 1.29, -0.08], size: [0.05, 0.34, 0.05], rotation: [-0.35, 0, 0.55] },
  { position: [-0.35, -0.15, 1.74], size: [0.29, 0.23, 0.15] },
  { position: [0.35, -0.15, 1.74], size: [0.29, 0.23, 0.15] },
]);

const ENGINE_GEOMETRY = mergeAndDispose([
  createBoxGeometry([
    { position: [-0.42, 1.08, -0.2], size: [0.34, 0.22, 1.08] },
    { position: [0.42, 1.08, -0.2], size: [0.34, 0.22, 1.08] },
    { position: [0, 1.08, 0.48], size: [0.58, 0.15, 0.36] },
    { position: [-0.57, 1.03, -0.62], size: [0.12, 0.12, 0.42] },
    { position: [0.57, 1.03, -0.62], size: [0.12, 0.12, 0.42] },
  ]),
  createCylinderGeometry([
    { position: [-0.48, 1.06, -0.82], radiusTop: 0.05, radiusBottom: 0.075, height: 0.46, rotation: [Math.PI / 2, 0, 0] },
    { position: [0.48, 1.06, -0.82], radiusTop: 0.05, radiusBottom: 0.075, height: 0.46, rotation: [Math.PI / 2, 0, 0] },
  ]),
]);

const INTERIOR_GEOMETRY = createBoxGeometry([
  { position: [0, 0.18, 0.92], size: [0.9, 0.1, 0.44] },
  { position: [0, 0.42, 1.15], size: [0.88, 0.38, 0.12], rotation: [-0.16, 0, 0] },
  { position: [0, 0.12, 0.34], size: [0.28, 0.28, 0.62] },
  { position: [-0.47, 0.08, -0.26], size: [0.42, 0.12, 0.44] },
  { position: [0.47, 0.08, -0.26], size: [0.42, 0.12, 0.44] },
  { position: [-0.47, 0.35, -0.48], size: [0.42, 0.52, 0.1], rotation: [-0.12, 0, 0] },
  { position: [0.47, 0.35, -0.48], size: [0.42, 0.52, 0.1], rotation: [-0.12, 0, 0] },
]);

const SKID_GEOMETRY = createCylinderGeometry([
  { position: [-0.62, -0.52, 0], radiusTop: 0.045, radiusBottom: 0.045, height: 2.62, rotation: [Math.PI / 2, 0, 0] },
  { position: [0.62, -0.52, 0], radiusTop: 0.045, radiusBottom: 0.045, height: 2.62, rotation: [Math.PI / 2, 0, 0] },
  { position: [-0.62, -0.26, 0.7], radiusTop: 0.035, radiusBottom: 0.035, height: 0.55, rotation: [0, 0, -0.18] },
  { position: [-0.62, -0.26, -0.7], radiusTop: 0.035, radiusBottom: 0.035, height: 0.55, rotation: [0, 0, -0.18] },
  { position: [0.62, -0.26, 0.7], radiusTop: 0.035, radiusBottom: 0.035, height: 0.55, rotation: [0, 0, 0.18] },
  { position: [0.62, -0.26, -0.7], radiusTop: 0.035, radiusBottom: 0.035, height: 0.55, rotation: [0, 0, 0.18] },
  { position: [0, -0.27, 0.7], radiusTop: 0.03, radiusBottom: 0.03, height: 1.25, rotation: [0, 0, Math.PI / 2] },
  { position: [0, -0.27, -0.7], radiusTop: 0.03, radiusBottom: 0.03, height: 1.25, rotation: [0, 0, Math.PI / 2] },
]);

const MAIN_ROTOR_GEOMETRY = createBoxGeometry([
  { position: [0, 0, 0], size: [5, 0.055, 0.23] },
  { position: [0, 0, 0], size: [0.23, 0.055, 5] },
  { position: [0, 0, 0], size: [0.32, 0.14, 0.32] },
  { position: [0.22, 0.02, 0], size: [0.08, 0.12, 0.08], rotation: [0, 0, 0.7] },
  { position: [-0.22, 0.02, 0], size: [0.08, 0.12, 0.08], rotation: [0, 0, -0.7] },
  { position: [0, 0.02, 0.22], size: [0.08, 0.12, 0.08], rotation: [0.7, 0, 0] },
  { position: [0, 0.02, -0.22], size: [0.08, 0.12, 0.08], rotation: [-0.7, 0, 0] },
]);

const TAIL_ROTOR_GEOMETRY = createBoxGeometry([
  { position: [0, 0, 0], size: [0.08, 0.14, 0.16] },
  { position: [0, 0, 0], size: [0.05, 1.08, 0.14] },
  { position: [0, 0, 0], size: [0.05, 0.14, 1.08] },
]);

const HEADLIGHT_LENS_GEOMETRY = createBoxGeometry([
  { position: [-0.35, -0.15, 1.83], size: [0.22, 0.16, 0.035] },
  { position: [0.35, -0.15, 1.83], size: [0.22, 0.16, 0.035] },
]);

const MAIN_ROTOR_BLUR_GEOMETRY = new THREE.CircleGeometry(2.6, 24);
MAIN_ROTOR_BLUR_GEOMETRY.rotateX(-Math.PI / 2);
const TAIL_ROTOR_BLUR_GEOMETRY = new THREE.CircleGeometry(0.59, 16);
TAIL_ROTOR_BLUR_GEOMETRY.rotateY(Math.PI / 2);
const BEACON_GEOMETRY = new THREE.BoxGeometry(0.12, 0.12, 0.12);

export function Helicopter() {
  const isVisible = useVehicleStore((state) => state.helicopter.spawned && !state.helicopter.destroyed);
  const groupRef = useRef<THREE.Group>(null);
  const shellRef = useRef<THREE.Group>(null);
  const mainRotorRef = useRef<THREE.Group>(null);
  const tailRotorRef = useRef<THREE.Group>(null);
  const windowRef = useRef<THREE.Mesh>(null);
  const headlightLensRef = useRef<THREE.Mesh>(null);
  const mainRotorBlurRef = useRef<THREE.Mesh>(null);
  const tailRotorBlurRef = useRef<THREE.Mesh>(null);
  const beaconRef = useRef<THREE.Mesh>(null);
  const spotLightRef = useRef<THREE.SpotLight>(null);
  const spotLightTargetRef = useRef<THREE.Object3D>(null);

  const materials = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({
      color: BODY_COLOR,
      roughness: 0.46,
      metalness: 0.16,
      emissive: BODY_COLOR,
      emissiveIntensity: 0.08,
    }),
    white: new THREE.MeshStandardMaterial({ color: BODY_WHITE, roughness: 0.48, metalness: 0.03 }),
    stripe: new THREE.MeshStandardMaterial({
      color: STRIPE_COLOR,
      roughness: 0.38,
      emissive: STRIPE_COLOR,
      emissiveIntensity: 0.14,
    }),
    window: new THREE.MeshStandardMaterial({
      color: WINDOW_COLOR,
      roughness: 0.12,
      metalness: 0.22,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      emissive: WINDOW_COLOR,
      emissiveIntensity: 0.22,
      side: THREE.DoubleSide,
    }),
    trim: new THREE.MeshStandardMaterial({ color: TRIM_COLOR, roughness: 0.65, metalness: 0.42 }),
    engine: new THREE.MeshStandardMaterial({ color: ENGINE_COLOR, roughness: 0.34, metalness: 0.58 }),
    interior: new THREE.MeshStandardMaterial({ color: INTERIOR_COLOR, roughness: 0.76, metalness: 0.16 }),
    skid: new THREE.MeshStandardMaterial({ color: SKID_COLOR, roughness: 0.62, metalness: 0.52 }),
    rotor: new THREE.MeshStandardMaterial({ color: ROTOR_COLOR, roughness: 0.48, metalness: 0.42 }),
    lens: new THREE.MeshStandardMaterial({
      color: HEADLIGHT_LENS_COLOR,
      roughness: 0.12,
      metalness: 0.2,
      emissive: HEADLIGHT_LENS_COLOR,
      emissiveIntensity: HEADLIGHT_CONFIG.IDLE_EMISSIVE,
    }),
    beacon: new THREE.MeshStandardMaterial({
      color: BEACON_COLOR,
      roughness: 0.2,
      emissive: BEACON_COLOR,
      emissiveIntensity: 0.7,
    }),
    mainBlur: new THREE.MeshBasicMaterial({
      color: ROTOR_BLUR_COLOR,
      transparent: true,
      opacity: 0.09,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    tailBlur: new THREE.MeshBasicMaterial({
      color: ROTOR_BLUR_COLOR,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  }), []);

  useEffect(() => {
    if (spotLightRef.current && spotLightTargetRef.current) {
      spotLightRef.current.target = spotLightTargetRef.current;
    }
  }, [isVisible]);

  useFrame((_, delta) => {
    if (!isVisible || !groupRef.current) return;

    const helicopter = useVehicleStore.getState().helicopter;
    groupRef.current.position.set(helicopter.x, helicopter.y, helicopter.z);
    groupRef.current.rotation.set(helicopter.pitch, helicopter.rotationY, helicopter.roll);

    const iAmBoarded = helicopter.mySeat !== null;
    const someoneBoarded = helicopter.seats.pilot !== null
      || helicopter.seats.gunner_left !== null
      || helicopter.seats.gunner_right !== null;

    // 搭乗中は不透明な外殻を描かず、透明ソートと車内視点の遮蔽を同時に避ける。
    if (shellRef.current) shellRef.current.visible = !iAmBoarded;
    const targetWindowOpacity = iAmBoarded ? 0.18 : 0.62;
    if (windowRef.current) {
      const material = windowRef.current.material as THREE.MeshStandardMaterial;
      material.opacity = THREE.MathUtils.damp(material.opacity, targetWindowOpacity, 12, delta);
    }

    if (mainRotorRef.current) {
      mainRotorRef.current.rotation.y = someoneBoarded
        ? helicopter.rotorAngle
        : mainRotorRef.current.rotation.y + HELICOPTER_CONSTANTS.ROTOR_SPEED * 0.24 * delta;
    }
    if (tailRotorRef.current) {
      tailRotorRef.current.rotation.x = someoneBoarded
        ? helicopter.rotorAngle * 1.5
        : tailRotorRef.current.rotation.x + HELICOPTER_CONSTANTS.ROTOR_SPEED * 0.36 * delta;
    }

    const targetLight = someoneBoarded
      ? HEADLIGHT_CONFIG.BOARDED_INTENSITY
      : HEADLIGHT_CONFIG.IDLE_INTENSITY;
    if (spotLightRef.current) {
      spotLightRef.current.intensity = THREE.MathUtils.damp(
        spotLightRef.current.intensity,
        targetLight,
        10,
        delta,
      );
    }
    if (headlightLensRef.current) {
      const material = headlightLensRef.current.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = THREE.MathUtils.damp(
        material.emissiveIntensity,
        someoneBoarded ? HEADLIGHT_CONFIG.BOARDED_EMISSIVE : HEADLIGHT_CONFIG.IDLE_EMISSIVE,
        10,
        delta,
      );
    }

    if (mainRotorBlurRef.current) {
      const material = mainRotorBlurRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = THREE.MathUtils.damp(material.opacity, someoneBoarded ? 0.23 : 0.08, 10, delta);
    }
    if (tailRotorBlurRef.current) {
      const material = tailRotorBlurRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = THREE.MathUtils.damp(material.opacity, someoneBoarded ? 0.17 : 0.05, 10, delta);
    }

    if (beaconRef.current) {
      const material = beaconRef.current.material as THREE.MeshStandardMaterial;
      const pulse = 0.82 + Math.sin(performance.now() * 0.006) * 0.18;
      material.emissiveIntensity = (someoneBoarded ? 1.35 : 0.72) * pulse;
    }
  });

  if (!isVisible) return null;

  return (
    <group ref={groupRef} scale={1.3}>
      <group rotation={[0, Math.PI, 0]}>
        <group ref={shellRef}>
          <mesh geometry={SHELL_GEOMETRY} material={materials.body} castShadow receiveShadow />
          <mesh geometry={WHITE_GEOMETRY} material={materials.white} receiveShadow />
          <mesh geometry={STRIPE_GEOMETRY} material={materials.stripe} receiveShadow />
        </group>

        <mesh ref={windowRef} geometry={WINDOW_GEOMETRY} material={materials.window} />
        <mesh geometry={TRIM_GEOMETRY} material={materials.trim} castShadow receiveShadow />
        <mesh geometry={ENGINE_GEOMETRY} material={materials.engine} receiveShadow />
        <mesh geometry={INTERIOR_GEOMETRY} material={materials.interior} receiveShadow />
        <mesh geometry={SKID_GEOMETRY} material={materials.skid} receiveShadow />
        <mesh ref={headlightLensRef} geometry={HEADLIGHT_LENS_GEOMETRY} material={materials.lens} />

        <spotLight
          ref={spotLightRef}
          position={[0, -0.14, 1.86]}
          color={HEADLIGHT_COLOR}
          intensity={HEADLIGHT_CONFIG.IDLE_INTENSITY}
          distance={HEADLIGHT_CONFIG.DISTANCE}
          angle={HEADLIGHT_CONFIG.ANGLE}
          penumbra={HEADLIGHT_CONFIG.PENUMBRA}
          decay={HEADLIGHT_CONFIG.DECAY}
          castShadow={false}
        />
        <object3D ref={spotLightTargetRef} position={[0, -2.1, 9]} />

        <mesh ref={beaconRef} geometry={BEACON_GEOMETRY} material={materials.beacon} position={[0, 1.17, 0.36]} />

        <group ref={mainRotorRef} position={[0, 1.46, 0]}>
          <mesh ref={mainRotorBlurRef} geometry={MAIN_ROTOR_BLUR_GEOMETRY} material={materials.mainBlur} />
          <mesh geometry={MAIN_ROTOR_GEOMETRY} material={materials.rotor} />
        </group>

        <group ref={tailRotorRef} position={[0.17, 0.92, -3.18]}>
          <mesh ref={tailRotorBlurRef} geometry={TAIL_ROTOR_BLUR_GEOMETRY} material={materials.tailBlur} />
          <mesh geometry={TAIL_ROTOR_GEOMETRY} material={materials.rotor} />
        </group>

        <PassengerAvatars />
      </group>

      <BoardingPrompt />
    </group>
  );
}

function BoardingPrompt() {
  const passengerCount = useVehicleStore((state) => {
    const seats = state.helicopter.seats;
    return Number(seats.pilot !== null)
      + Number(seats.gunner_left !== null)
      + Number(seats.gunner_right !== null);
  });
  const mySeat = useVehicleStore((state) => state.helicopter.mySeat);

  if (passengerCount >= 3 || mySeat !== null) return null;

  return (
    <Billboard position={[0, 3.5, 0]}>
      <mesh>
        <planeGeometry args={[4.5, 1]} />
        <meshBasicMaterial color={0x000000} transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
      <Text
        position={[0, 0.12, 0.01]}
        fontSize={0.35}
        color="#ffdd00"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        🚁 [F] のる
      </Text>
      <Text
        position={[0, -0.22, 0.01]}
        fontSize={0.18}
        color="#ffffff"
        fillOpacity={0.7}
        anchorX="center"
        anchorY="middle"
      >
        {`${passengerCount}/3`}
      </Text>
    </Billboard>
  );
}

/** 搭乗者のアバターをヘリモデル内部に描画する。 */
function PassengerAvatars() {
  const seats = useVehicleStore((state) => state.helicopter.seats);
  const remotePlayers = useMultiplayerStore((state) => state.remotePlayers);
  const myId = useMultiplayerStore((state) => state.myId);

  return (
    <>
      {ALL_SEATS.map((seat) => {
        const playerId = seats[seat];
        if (playerId === null || playerId === '__local__' || playerId === myId) return null;

        const player = remotePlayers.get(playerId);
        if (!player) return null;
        const offset = SEAT_MODEL_OFFSETS[seat];

        return (
          <group key={seat} position={[offset.x, offset.y, offset.z]}>
            <VoxelAvatar
              skinId={player.skinId && isValidSkinId(player.skinId) ? player.skinId : undefined}
              color={player.color}
              isMoving={false}
              isDead={player.isDead}
              deathTime={player.deathTime}
            />
          </group>
        );
      })}
    </>
  );
}
