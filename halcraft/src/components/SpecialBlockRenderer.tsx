// 立方体では輪郭が伝わらない階段・ポータルを、配置数に依存しないInstancedMeshで描画する

import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useWorldStore } from '../stores/useWorldStore';
import { BLOCK_IDS, type BlockId } from '../types/blocks';
import { mapGeometryToMaterialAtlas, useAtlasPbrMaterial } from '../utils/blockPbrAtlas';

function usePlacedBlockPositions(blockId: BlockId) {
  const blockIndexVersion = useWorldStore((state) => state.blockIndexVersion);
  const getIndexedBlockPositions = useWorldStore((state) => state.getIndexedBlockPositions);

  return useMemo(() => {
    void blockIndexVersion;
    return getIndexedBlockPositions(blockId);
  }, [blockId, blockIndexVersion, getIndexedBlockPositions]);
}

const stairLowerGeometry = mapGeometryToMaterialAtlas(
  new THREE.BoxGeometry(0.96, 0.48, 0.96),
  'wood_planks',
);
const stairUpperGeometry = mapGeometryToMaterialAtlas(
  new THREE.BoxGeometry(0.96, 0.48, 0.48),
  'wood_planks',
);

const portalFrameGeometry = mapGeometryToMaterialAtlas(
  new THREE.BoxGeometry(0.94, 0.94, 0.16),
  'netherrack',
);
const portalSurfaceGeometry = mapGeometryToMaterialAtlas(
  new THREE.PlaneGeometry(0.74, 0.74, 1, 1),
  'nether_portal',
);
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
  const stairMaterial = useAtlasPbrMaterial('wood_planks');

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
      <instancedMesh ref={lowerRef} args={[stairLowerGeometry, stairMaterial, positions.length]} castShadow receiveShadow />
      <instancedMesh ref={upperRef} args={[stairUpperGeometry, stairMaterial, positions.length]} castShadow receiveShadow />
    </group>
  );
}

/** ネザーポータル。暗い構造枠と発光面を分離し、薄いゲートとして見せる */
export function NetherPortalRenderer() {
  const positions = usePlacedBlockPositions(BLOCK_IDS.NETHER_PORTAL);
  const frameRef = useRef<THREE.InstancedMesh>(null);
  const surfaceRef = useRef<THREE.InstancedMesh>(null);
  const portalFrameMaterial = useAtlasPbrMaterial('netherrack', { emissiveIntensity: 0.2 });
  const portalSurfaceMaterial = useAtlasPbrMaterial('nether_portal', {
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    emissiveIntensity: 1.2,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

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
    const material = surfaceRef.current?.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      // R3Fのフレームループ内で、共有ポータル面の明滅だけを更新する。
      // eslint-disable-next-line react-hooks/immutability
      material.opacity = 0.62 + Math.sin(clock.elapsedTime * 2.4) * 0.08;
    }
  });

  if (positions.length === 0) return null;

  return (
    <group>
      <instancedMesh ref={frameRef} args={[portalFrameGeometry, portalFrameMaterial, positions.length]} castShadow />
      <instancedMesh ref={surfaceRef} args={[portalSurfaceGeometry, portalSurfaceMaterial, positions.length]} />
    </group>
  );
}
