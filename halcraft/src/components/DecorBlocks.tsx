import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_IDS, type BlockId } from '../types/blocks';
import { useWorldStore } from '../stores/useWorldStore';
import { useFunctionalBlockStore } from '../stores/useFunctionalBlockStore';
import { facingToYaw, inferWallFacing } from '../utils/blockFacing';
import { mapGeometryToMaterialAtlas, useAtlasPbrMaterial } from '../utils/blockPbrAtlas';

function usePlacedBlockPositions(blockId: BlockId) {
  const blockIndexVersion = useWorldStore((s) => s.blockIndexVersion);
  const getIndexedBlockPositions = useWorldStore((s) => s.getIndexedBlockPositions);

  return useMemo(() => {
    // blockIndexVersion は索引更新時にこのメモを作り直すためのトリガー
    void blockIndexVersion;
    return getIndexedBlockPositions(blockId);
  }, [blockId, blockIndexVersion, getIndexedBlockPositions]);
}

const flameOuterMat = new THREE.MeshBasicMaterial({
  color: 0xff3b18,
  transparent: true,
  opacity: 0.92,
  depthWrite: false,
  depthTest: true,
  toneMapped: false,
  blending: THREE.AdditiveBlending,
});
const flameInnerMat = new THREE.MeshBasicMaterial({
  color: 0xffb21f,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  depthTest: true,
  toneMapped: false,
  blending: THREE.AdditiveBlending,
});
const flameGlowMat = new THREE.MeshBasicMaterial({
  color: 0xff8a55,
  transparent: true,
  opacity: 0.18,
  depthWrite: false,
  depthTest: true,
  toneMapped: false,
  blending: THREE.AdditiveBlending,
});

const candleGlowMat = new THREE.MeshBasicMaterial({
  color: 0xffc2a0,
  transparent: true,
  opacity: 0.16,
  depthWrite: false,
  depthTest: true,
  toneMapped: false,
  blending: THREE.AdditiveBlending,
});

const doorGeom = mapGeometryToMaterialAtlas(new THREE.BoxGeometry(0.92, 0.96, 0.08), 'wood_planks');
const doorWindowGeom = mapGeometryToMaterialAtlas(new THREE.BoxGeometry(0.24, 0.22, 0.04), 'glass');
const doorInsetGeom = mapGeometryToMaterialAtlas(new THREE.BoxGeometry(0.24, 0.22, 0.04), 'wood_planks');
const doorKnobGeom = mapGeometryToMaterialAtlas(new THREE.SphereGeometry(0.035, 10, 10), 'gold_ingot');
const ladderRailGeom = mapGeometryToMaterialAtlas(new THREE.BoxGeometry(0.08, 0.92, 0.06), 'electric');
const ladderRungGeom = mapGeometryToMaterialAtlas(new THREE.BoxGeometry(0.76, 0.06, 0.06), 'electric');
const logGeom = mapGeometryToMaterialAtlas(new THREE.BoxGeometry(0.84, 0.12, 0.18), 'oak_bark');
const emberGeom = mapGeometryToMaterialAtlas(new THREE.SphereGeometry(0.05, 8, 8), 'coal_ore');
const flameOuterGeom = new THREE.ConeGeometry(0.22, 0.42, 10);
const flameInnerGeom = new THREE.ConeGeometry(0.11, 0.26, 8);
const glowGeom = new THREE.SphereGeometry(0.34, 10, 10);
const candlePlateGeom = mapGeometryToMaterialAtlas(new THREE.CylinderGeometry(0.24, 0.28, 0.04, 16), 'iron');
const candleWaxGeom = mapGeometryToMaterialAtlas(new THREE.CylinderGeometry(0.12, 0.14, 0.34, 14), 'glowstone');
const wickGeom = mapGeometryToMaterialAtlas(new THREE.BoxGeometry(0.02, 0.08, 0.02), 'netherrack');

// 種・レバーは配置数が増えても描画回数が増えないよう、部品単位でインスタンス化する。
/** 互い違いの若葉を1メッシュにまとめた、小麦の芽の軽量ジオメトリ */
function createWheatSproutGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array([
    0, 0.03, 0, -0.22, 0.2, 0, -0.035, 0.43, 0,
    0, 0.06, 0.006, 0.22, 0.23, 0.006, 0.035, 0.47, 0.006,
    0, 0.03, 0, 0, 0.2, -0.22, 0, 0.43, -0.035,
    0.006, 0.06, 0, 0.006, 0.23, 0.22, 0.006, 0.47, 0.035,
  ]);
  const uvs = new Float32Array([
    0.5, 0, 0, 0.45, 0.5, 1,
    0.5, 0, 1, 0.45, 0.5, 1,
    0.5, 0, 0, 0.45, 0.5, 1,
    0.5, 0, 1, 0.45, 0.5, 1,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return mapGeometryToMaterialAtlas(geometry, 'grass_top');
}

const wheatSproutGeom = createWheatSproutGeometry();
const leverBaseGeom = mapGeometryToMaterialAtlas(new THREE.BoxGeometry(0.58, 0.12, 0.42), 'stone');
const leverHandleGeom = mapGeometryToMaterialAtlas(new THREE.CylinderGeometry(0.045, 0.065, 0.46, 8), 'oak_bark');
const leverKnobGeom = mapGeometryToMaterialAtlas(new THREE.SphereGeometry(0.1, 10, 7), 'tnt');

/** 小麦の種を、成長し始めた小さな若葉として描画する */
export function WheatSeedsRenderer() {
  const positions = usePlacedBlockPositions(BLOCK_IDS.WHEAT_SEEDS);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const wheatSproutMat = useAtlasPbrMaterial('grass_top', { side: THREE.DoubleSide });

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    positions.forEach((pos, index) => {
      const variation = Math.abs((pos.x * 73856093) ^ (pos.z * 19349663)) % 997;
      const unit = variation / 997;
      dummy.position.set(pos.x + 0.5, pos.y + 0.025, pos.z + 0.5);
      dummy.rotation.set(0, unit * Math.PI * 2, 0);
      dummy.scale.setScalar(0.86 + unit * 0.24);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [positions]);

  if (positions.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[wheatSproutGeom, wheatSproutMat, positions.length]}
      castShadow
      receiveShadow
    />
  );
}

/** TNT遠隔起爆用レバーを、台座・ハンドル・警告色ノブの3ドローで一括描画する */
export function LeverRenderer() {
  const positions = usePlacedBlockPositions(BLOCK_IDS.LEVER);
  const baseRef = useRef<THREE.InstancedMesh>(null);
  const handleRef = useRef<THREE.InstancedMesh>(null);
  const knobRef = useRef<THREE.InstancedMesh>(null);
  const leverBaseMat = useAtlasPbrMaterial('stone');
  const leverHandleMat = useAtlasPbrMaterial('oak_bark');
  const leverKnobMat = useAtlasPbrMaterial('tnt', { emissiveIntensity: 0.28 });

  useLayoutEffect(() => {
    const base = baseRef.current;
    const handle = handleRef.current;
    const knob = knobRef.current;
    if (!base || !handle || !knob) return;

    const dummy = new THREE.Object3D();
    const handleQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.62));
    const handleDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(handleQuaternion);

    positions.forEach((pos, index) => {
      const center = new THREE.Vector3(pos.x + 0.5, pos.y + 0.13, pos.z + 0.5);

      dummy.position.set(pos.x + 0.5, pos.y + 0.07, pos.z + 0.5);
      dummy.quaternion.identity();
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      base.setMatrixAt(index, dummy.matrix);

      dummy.position.copy(center).addScaledVector(handleDirection, 0.21);
      dummy.quaternion.copy(handleQuaternion);
      dummy.updateMatrix();
      handle.setMatrixAt(index, dummy.matrix);

      dummy.position.copy(center).addScaledVector(handleDirection, 0.46);
      dummy.quaternion.identity();
      dummy.updateMatrix();
      knob.setMatrixAt(index, dummy.matrix);
    });

    for (const mesh of [base, handle, knob]) {
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [positions]);

  if (positions.length === 0) return null;

  return (
    <group>
      <instancedMesh ref={baseRef} args={[leverBaseGeom, leverBaseMat, positions.length]} castShadow receiveShadow />
      <instancedMesh ref={handleRef} args={[leverHandleGeom, leverHandleMat, positions.length]} castShadow />
      <instancedMesh ref={knobRef} args={[leverKnobGeom, leverKnobMat, positions.length]} castShadow />
    </group>
  );
}

export function DoorRenderer() {
  const positions = usePlacedBlockPositions(BLOCK_IDS.DOOR);
  const openDoors = useFunctionalBlockStore((s) => s.openDoors);
  const getBlock = useWorldStore((s) => s.getBlock);
  const doorBodyMat = useAtlasPbrMaterial('wood_planks');
  const doorWindowMat = useAtlasPbrMaterial('glass', { transparent: true, opacity: 0.7, depthWrite: false });
  const doorInsetMat = useAtlasPbrMaterial('wood_planks');
  const knobMat = useAtlasPbrMaterial('gold_ingot');

  if (positions.length === 0) return null;

  return (
    <group>
      {positions.map((pos) => (
        <DoorModel
          key={`door-${pos.x}-${pos.y}-${pos.z}`}
          position={[pos.x + 0.5, pos.y, pos.z + 0.5]}
          yaw={facingToYaw(inferWallFacing(getBlock, pos.x, pos.y, pos.z))}
          open={Boolean(openDoors[`${pos.x},${pos.y},${pos.z}`])}
          materials={{ doorBodyMat, doorWindowMat, doorInsetMat, knobMat }}
        />
      ))}
    </group>
  );
}

function DoorModel({
  position,
  yaw,
  open,
  materials,
}: {
  position: [number, number, number];
  yaw: number;
  open: boolean;
  materials: {
    doorBodyMat: THREE.MeshStandardMaterial;
    doorWindowMat: THREE.MeshStandardMaterial;
    doorInsetMat: THREE.MeshStandardMaterial;
    knobMat: THREE.MeshStandardMaterial;
  };
}) {
  const panelRef = useRef<THREE.Group>(null);
  const { doorBodyMat, doorWindowMat, doorInsetMat, knobMat } = materials;

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
          <mesh position={[-0.25, 0.76, 0.035]} geometry={doorWindowGeom} material={doorWindowMat} />
          <mesh position={[0.25, 0.76, 0.035]} geometry={doorWindowGeom} material={doorWindowMat} />
          <mesh position={[-0.25, 0.48, 0.035]} geometry={doorWindowGeom} material={doorWindowMat} />
          <mesh position={[0.25, 0.48, 0.035]} geometry={doorWindowGeom} material={doorWindowMat} />
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
  const ladderMat = useAtlasPbrMaterial('electric', { emissiveIntensity: 0.35 });

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
  const logMat = useAtlasPbrMaterial('oak_bark');
  const coalMat = useAtlasPbrMaterial('coal_ore', { emissiveIntensity: 0.22 });

  if (positions.length === 0) return null;

  return (
    <group>
      {positions.map((pos) => (
        <CampfireModel
          key={`campfire-${pos.x}-${pos.y}-${pos.z}`}
          position={[pos.x + 0.5, pos.y, pos.z + 0.5]}
          phase={pos.x * 0.37 + pos.z * 0.53}
          logMat={logMat}
          coalMat={coalMat}
        />
      ))}
    </group>
  );
}

function CampfireModel({
  position,
  phase,
  logMat,
  coalMat,
}: {
  position: [number, number, number];
  phase: number;
  logMat: THREE.MeshStandardMaterial;
  coalMat: THREE.MeshStandardMaterial;
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
  const candlePlateMat = useAtlasPbrMaterial('iron');
  const candleWaxMat = useAtlasPbrMaterial('glowstone', { emissiveIntensity: 0.18 });
  const wickMat = useAtlasPbrMaterial('netherrack', { emissiveIntensity: 0.08 });

  if (positions.length === 0) return null;

  return (
    <group>
      {positions.map((pos) => (
        <CandleModel
          key={`candle-${pos.x}-${pos.y}-${pos.z}`}
          position={[pos.x + 0.5, pos.y, pos.z + 0.5]}
          phase={pos.x * 0.31 + pos.z * 0.29}
          candlePlateMat={candlePlateMat}
          candleWaxMat={candleWaxMat}
          wickMat={wickMat}
        />
      ))}
    </group>
  );
}

function CandleModel({
  position,
  phase,
  candlePlateMat,
  candleWaxMat,
  wickMat,
}: {
  position: [number, number, number];
  phase: number;
  candlePlateMat: THREE.MeshStandardMaterial;
  candleWaxMat: THREE.MeshStandardMaterial;
  wickMat: THREE.MeshStandardMaterial;
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
