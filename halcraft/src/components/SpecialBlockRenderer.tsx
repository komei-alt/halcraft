// 立方体では輪郭が伝わらない階段・ポータルを、配置数に依存しないInstancedMeshで描画する

import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useWorldStore } from '../stores/useWorldStore';
import { BLOCK_IDS, type BlockId } from '../types/blocks';

function usePlacedBlockPositions(blockId: BlockId) {
  const blockIndexVersion = useWorldStore((state) => state.blockIndexVersion);
  const getIndexedBlockPositions = useWorldStore((state) => state.getIndexedBlockPositions);

  return useMemo(() => {
    void blockIndexVersion;
    return getIndexedBlockPositions(blockId);
  }, [blockId, blockIndexVersion, getIndexedBlockPositions]);
}

const stairLowerGeometry = new THREE.BoxGeometry(0.96, 0.48, 0.96);
const stairUpperGeometry = new THREE.BoxGeometry(0.96, 0.48, 0.48);
const stairLowerMaterial = new THREE.MeshStandardMaterial({ color: 0x9a6b3a, roughness: 0.9 });
const stairUpperMaterial = new THREE.MeshStandardMaterial({ color: 0xb2824d, roughness: 0.86 });

const portalFrameGeometry = new THREE.BoxGeometry(0.94, 0.94, 0.16);
const portalSurfaceGeometry = new THREE.PlaneGeometry(0.74, 0.74, 1, 1);
const portalFrameMaterial = new THREE.MeshStandardMaterial({
  color: 0x21162e,
  emissive: new THREE.Color(0x3b1268),
  emissiveIntensity: 0.38,
  metalness: 0.18,
  roughness: 0.7,
});
const portalSurfaceMaterial = new THREE.MeshBasicMaterial({
  color: 0xb95cff,
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
  // 壁越しにポータルが光って見えるのを防ぐ
  depthTest: true,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});
const instanceDummy = new THREE.Object3D();

function setInstanceTransform(
  mesh: THREE.InstancedMesh | null,
  index: number,
  position: readonly [number, number, number],
  rotationY = 0,
): void {
  if (!mesh) return;
  instanceDummy.position.set(position[0], position[1], position[2]);
  instanceDummy.rotation.set(0, rotationY, 0);
  instanceDummy.scale.set(1, 1, 1);
  instanceDummy.updateMatrix();
  mesh.setMatrixAt(index, instanceDummy.matrix);
}

/** 木製階段。下段と上段の2 drawだけで全配置を描画する */
export function StairsRenderer() {
  const positions = usePlacedBlockPositions(BLOCK_IDS.STAIRS);
  const lowerRef = useRef<THREE.InstancedMesh>(null);
  const upperRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    positions.forEach((position, index) => {
      setInstanceTransform(lowerRef.current, index, [position.x + 0.5, position.y + 0.24, position.z + 0.5]);
      setInstanceTransform(upperRef.current, index, [position.x + 0.5, position.y + 0.72, position.z + 0.74]);
    });
    for (const mesh of [lowerRef.current, upperRef.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [positions]);

  if (positions.length === 0) return null;

  return (
    <group>
      <instancedMesh ref={lowerRef} args={[stairLowerGeometry, stairLowerMaterial, positions.length]} castShadow receiveShadow />
      <instancedMesh ref={upperRef} args={[stairUpperGeometry, stairUpperMaterial, positions.length]} castShadow receiveShadow />
    </group>
  );
}

/** ネザーポータル。暗い構造枠と発光面を分離し、薄いゲートとして見せる */
export function NetherPortalRenderer() {
  const positions = usePlacedBlockPositions(BLOCK_IDS.NETHER_PORTAL);
  const frameRef = useRef<THREE.InstancedMesh>(null);
  const surfaceRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    positions.forEach((position, index) => {
      setInstanceTransform(frameRef.current, index, [position.x + 0.5, position.y + 0.5, position.z + 0.5]);
      setInstanceTransform(surfaceRef.current, index, [position.x + 0.5, position.y + 0.5, position.z + 0.59]);
    });
    for (const mesh of [frameRef.current, surfaceRef.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [positions]);

  useFrame(({ clock }) => {
    portalSurfaceMaterial.opacity = 0.62 + Math.sin(clock.elapsedTime * 2.4) * 0.08;
  });

  if (positions.length === 0) return null;

  return (
    <group>
      <instancedMesh ref={frameRef} args={[portalFrameGeometry, portalFrameMaterial, positions.length]} castShadow />
      <instancedMesh ref={surfaceRef} args={[portalSurfaceGeometry, portalSurfaceMaterial, positions.length]} />
    </group>
  );
}
