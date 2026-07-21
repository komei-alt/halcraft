import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_IDS, type BlockId } from '../types/blocks';
import { useWorldStore } from '../stores/useWorldStore';
import { useFunctionalBlockStore } from '../stores/useFunctionalBlockStore';
import { facingToYaw, inferWallFacing } from '../utils/blockFacing';

function usePlacedBlockPositions(blockId: BlockId) {
  const blockIndexVersion = useWorldStore((s) => s.blockIndexVersion);
  const getIndexedBlockPositions = useWorldStore((s) => s.getIndexedBlockPositions);

  return useMemo(() => {
    // blockIndexVersion は索引更新時にこのメモを作り直すためのトリガー
    void blockIndexVersion;
    return getIndexedBlockPositions(blockId);
  }, [blockId, blockIndexVersion, getIndexedBlockPositions]);
}

const doorBodyMat = new THREE.MeshStandardMaterial({ color: 0x7d5b33, roughness: 0.92 });
const doorWindowMat = new THREE.MeshStandardMaterial({
  color: 0xf7f5f0,
  emissive: new THREE.Color(0x554433),
  emissiveIntensity: 0.08,
  roughness: 0.4,
});
const doorInsetMat = new THREE.MeshStandardMaterial({ color: 0x644826, roughness: 0.95 });
const knobMat = new THREE.MeshStandardMaterial({ color: 0xb8843e, metalness: 0.45, roughness: 0.35 });

const ladderMat = new THREE.MeshStandardMaterial({
  color: 0x4021ff,
  emissive: new THREE.Color(0x2510aa),
  emissiveIntensity: 0.35,
  roughness: 0.42,
});

const logMat = new THREE.MeshStandardMaterial({ color: 0x8f6636, roughness: 0.9 });
const coalMat = new THREE.MeshStandardMaterial({
  color: 0x392a22,
  emissive: new THREE.Color(0x2a1108),
  emissiveIntensity: 0.22,
  roughness: 1,
});
const flameOuterMat = new THREE.MeshBasicMaterial({
  color: 0xff3b18,
  transparent: true,
  opacity: 0.92,
  depthWrite: false,
  toneMapped: false,
  blending: THREE.AdditiveBlending,
});
const flameInnerMat = new THREE.MeshBasicMaterial({
  color: 0xffb21f,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  toneMapped: false,
  blending: THREE.AdditiveBlending,
});
const flameGlowMat = new THREE.MeshBasicMaterial({
  color: 0xff8a55,
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
  toneMapped: false,
  blending: THREE.AdditiveBlending,
});

const candlePlateMat = new THREE.MeshStandardMaterial({ color: 0x2e160d, roughness: 0.9 });
const candleWaxMat = new THREE.MeshStandardMaterial({
  color: 0xcab9b1,
  emissive: new THREE.Color(0x65423a),
  emissiveIntensity: 0.12,
  roughness: 0.98,
});
const wickMat = new THREE.MeshStandardMaterial({ color: 0x2d130e, roughness: 1 });
const candleGlowMat = new THREE.MeshBasicMaterial({
  color: 0xffc2a0,
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
  toneMapped: false,
  blending: THREE.AdditiveBlending,
});

const doorGeom = new THREE.BoxGeometry(0.92, 0.96, 0.08);
const doorInsetGeom = new THREE.BoxGeometry(0.24, 0.22, 0.04);
const doorKnobGeom = new THREE.SphereGeometry(0.035, 10, 10);
const ladderRailGeom = new THREE.BoxGeometry(0.08, 0.92, 0.06);
const ladderRungGeom = new THREE.BoxGeometry(0.76, 0.06, 0.06);
const logGeom = new THREE.BoxGeometry(0.84, 0.12, 0.18);
const emberGeom = new THREE.SphereGeometry(0.05, 8, 8);
const flameOuterGeom = new THREE.ConeGeometry(0.22, 0.42, 10);
const flameInnerGeom = new THREE.ConeGeometry(0.11, 0.26, 8);
const glowGeom = new THREE.SphereGeometry(0.34, 10, 10);
const candlePlateGeom = new THREE.CylinderGeometry(0.24, 0.28, 0.04, 16);
const candleWaxGeom = new THREE.CylinderGeometry(0.12, 0.14, 0.34, 14);
const wickGeom = new THREE.BoxGeometry(0.02, 0.08, 0.02);

export function DoorRenderer() {
  const positions = usePlacedBlockPositions(BLOCK_IDS.DOOR);
  const openDoors = useFunctionalBlockStore((s) => s.openDoors);
  const getBlock = useWorldStore((s) => s.getBlock);

  if (positions.length === 0) return null;

  return (
    <group>
      {positions.map((pos) => (
        <DoorModel
          key={`door-${pos.x}-${pos.y}-${pos.z}`}
          position={[pos.x + 0.5, pos.y, pos.z + 0.5]}
          yaw={facingToYaw(inferWallFacing(getBlock, pos.x, pos.y, pos.z))}
          open={Boolean(openDoors[`${pos.x},${pos.y},${pos.z}`])}
        />
      ))}
    </group>
  );
}

function DoorModel({
  position,
  yaw,
  open,
}: {
  position: [number, number, number];
  yaw: number;
  open: boolean;
}) {
  const panelRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!panelRef.current) return;
    const targetRotation = open ? -Math.PI * 0.58 : 0;
    panelRef.current.rotation.y = THREE.MathUtils.damp(
      panelRef.current.rotation.y,
      targetRotation,
      12,
      delta,
    );
  });

  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <group ref={panelRef} position={[-0.46, 0, 0.42]}>
        <group position={[0.46, 0, 0]}>
          <mesh position={[0, 0.5, 0]} geometry={doorGeom} material={doorBodyMat} />
          <mesh position={[-0.25, 0.76, 0.035]} geometry={doorInsetGeom} material={doorWindowMat} />
          <mesh position={[0.25, 0.76, 0.035]} geometry={doorInsetGeom} material={doorWindowMat} />
          <mesh position={[-0.25, 0.48, 0.035]} geometry={doorInsetGeom} material={doorWindowMat} />
          <mesh position={[0.25, 0.48, 0.035]} geometry={doorInsetGeom} material={doorWindowMat} />
          <mesh position={[-0.25, 0.17, 0.035]} geometry={doorInsetGeom} material={doorInsetMat} />
          <mesh position={[0.25, 0.17, 0.035]} geometry={doorInsetGeom} material={doorInsetMat} />
          <mesh position={[0.32, 0.36, 0.05]} geometry={doorKnobGeom} material={knobMat} />
        </group>
      </group>
    </group>
  );
}

export function LadderRenderer() {
  const positions = usePlacedBlockPositions(BLOCK_IDS.LADDER);
  const getBlock = useWorldStore((s) => s.getBlock);

  if (positions.length === 0) return null;

  return (
    <group>
      {positions.map((pos) => (
        <group
          key={`ladder-${pos.x}-${pos.y}-${pos.z}`}
          position={[pos.x + 0.5, pos.y, pos.z + 0.5]}
          rotation={[0, facingToYaw(inferWallFacing(getBlock, pos.x, pos.y, pos.z)), 0]}
        >
          <mesh position={[-0.32, 0.5, 0.44]} geometry={ladderRailGeom} material={ladderMat} />
          <mesh position={[0.32, 0.5, 0.44]} geometry={ladderRailGeom} material={ladderMat} />
          {[0.18, 0.38, 0.58, 0.78].map((y, index) => (
            <mesh key={`rung-${index}`} position={[0, y, 0.44]} geometry={ladderRungGeom} material={ladderMat} />
          ))}
        </group>
      ))}
    </group>
  );
}

export function CampfireRenderer() {
  const positions = usePlacedBlockPositions(BLOCK_IDS.CAMPFIRE);

  if (positions.length === 0) return null;

  return (
    <group>
      {positions.map((pos) => (
        <CampfireModel
          key={`campfire-${pos.x}-${pos.y}-${pos.z}`}
          position={[pos.x + 0.5, pos.y, pos.z + 0.5]}
          phase={pos.x * 0.37 + pos.z * 0.53}
        />
      ))}
    </group>
  );
}

function CampfireModel({
  position,
  phase,
}: {
  position: [number, number, number];
  phase: number;
}) {
  const flameRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!flameRef.current) return;

    const t = clock.getElapsedTime() + phase;
    const outerScale = 1 + Math.sin(t * 7) * 0.08;
    const innerScale = 1 + Math.sin(t * 9 + 0.6) * 0.12;

    flameRef.current.position.y = 0.38 + Math.sin(t * 5) * 0.015;
    flameRef.current.children[0].scale.set(outerScale, 1 + Math.sin(t * 8) * 0.12, outerScale);
    flameRef.current.children[1].scale.set(innerScale, 1 + Math.sin(t * 10) * 0.16, innerScale);
    flameRef.current.children[2].scale.setScalar(1 + Math.sin(t * 4) * 0.06);
  });

  return (
    <group position={position}>
      <mesh position={[0, 0.08, 0.04]} rotation={[0, 0.34, 0]} geometry={logGeom} material={logMat} />
      <mesh position={[0, 0.08, -0.04]} rotation={[0, -0.42, 0]} geometry={logGeom} material={logMat} />
      <mesh position={[-0.11, 0.13, 0.02]} geometry={emberGeom} material={coalMat} />
      <mesh position={[0.1, 0.12, -0.04]} geometry={emberGeom} material={coalMat} />
      <mesh position={[0.03, 0.11, 0.08]} geometry={emberGeom} material={coalMat} />
      <group ref={flameRef} position={[0, 0.38, 0]}>
        <mesh geometry={flameOuterGeom} material={flameOuterMat} />
        <mesh position={[0, -0.03, 0]} geometry={flameInnerGeom} material={flameInnerMat} />
        <mesh position={[0, -0.05, 0]} geometry={glowGeom} material={flameGlowMat} />
      </group>
    </group>
  );
}

export function CandleRenderer() {
  const positions = usePlacedBlockPositions(BLOCK_IDS.CANDLE);

  if (positions.length === 0) return null;

  return (
    <group>
      {positions.map((pos) => (
        <CandleModel
          key={`candle-${pos.x}-${pos.y}-${pos.z}`}
          position={[pos.x + 0.5, pos.y, pos.z + 0.5]}
          phase={pos.x * 0.31 + pos.z * 0.29}
        />
      ))}
    </group>
  );
}

function CandleModel({
  position,
  phase,
}: {
  position: [number, number, number];
  phase: number;
}) {
  const flameRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!flameRef.current) return;

    const t = clock.getElapsedTime() + phase;
    const scale = 1 + Math.sin(t * 8) * 0.09;

    flameRef.current.position.y = 0.52 + Math.sin(t * 4.5) * 0.01;
    flameRef.current.children[0].scale.set(scale, 1 + Math.sin(t * 9) * 0.14, scale);
    flameRef.current.children[1].scale.set(1 + Math.sin(t * 10 + 0.4) * 0.12, 1 + Math.sin(t * 11) * 0.16, 1);
    flameRef.current.children[2].scale.setScalar(1 + Math.sin(t * 3.6) * 0.05);
  });

  return (
    <group position={position}>
      <mesh position={[0, 0.02, 0]} geometry={candlePlateGeom} material={candlePlateMat} />
      <mesh position={[0, 0.19, 0]} geometry={candleWaxGeom} material={candleWaxMat} />
      <mesh position={[0, 0.39, 0]} geometry={wickGeom} material={wickMat} />
      <group ref={flameRef} position={[0, 0.52, 0]}>
        <mesh geometry={flameInnerGeom} material={flameOuterMat} scale={[0.58, 0.75, 0.58]} />
        <mesh position={[0, -0.01, 0]} geometry={flameInnerGeom} material={flameInnerMat} scale={[0.32, 0.48, 0.32]} />
        <mesh position={[0, -0.05, 0]} geometry={glowGeom} material={candleGlowMat} scale={[0.48, 0.48, 0.48]} />
      </group>
    </group>
  );
}
