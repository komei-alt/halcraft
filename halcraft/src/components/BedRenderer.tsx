// ベッドレンダラーコンポーネント
// ベッドを3Dオブジェクトとして描画する
// 木のフレーム + 赤い布団 + 白い枕

import { useMemo } from 'react';
import * as THREE from 'three';
import { BLOCK_IDS } from '../types/blocks';
import { useWorldStore } from '../stores/useWorldStore';
import { facingToYaw, inferBedFacing } from '../utils/blockFacing';
import { mapGeometryToMaterialAtlas, useAtlasPbrMaterial } from '../utils/blockPbrAtlas';

interface BoxPart {
  position: [number, number, number];
  size: [number, number, number];
}

/** 同じ素材の箱パーツを1ジオメトリへ結合し、形状密度と描画負荷を両立する */
function createBoxAssembly(parts: BoxPart[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (const part of parts) {
    const source = new THREE.BoxGeometry(...part.size);
    source.translate(...part.position);
    const geometry = source.toNonIndexed();
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    for (let index = 0; index < position.count; index++) {
      positions.push(position.getX(index), position.getY(index), position.getZ(index));
      normals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
      uvs.push(uv.getX(index), uv.getY(index));
    }
    geometry.dispose();
    source.dispose();
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

// === 共有ジオメトリ（素材ごとに結合し、1台5ドローに固定） ===
const woodFrameGeom = mapGeometryToMaterialAtlas(createBoxAssembly([
  { position: [0, 0.14, 0], size: [0.9, 0.1, 0.88] },
  { position: [-0.4, 0.09, -0.39], size: [0.12, 0.18, 0.12] },
  { position: [0.4, 0.09, -0.39], size: [0.12, 0.18, 0.12] },
  { position: [-0.4, 0.09, 0.39], size: [0.12, 0.18, 0.12] },
  { position: [0.4, 0.09, 0.39], size: [0.12, 0.18, 0.12] },
  { position: [-0.43, 0.23, 0], size: [0.08, 0.14, 0.82] },
  { position: [0.43, 0.23, 0], size: [0.08, 0.14, 0.82] },
  { position: [-0.4, 0.45, 0.42], size: [0.12, 0.72, 0.12] },
  { position: [0.4, 0.45, 0.42], size: [0.12, 0.72, 0.12] },
  { position: [0, 0.67, 0.42], size: [0.7, 0.1, 0.1] },
  { position: [0, 0.47, 0.42], size: [0.7, 0.08, 0.08] },
  { position: [-0.4, 0.24, -0.42], size: [0.1, 0.36, 0.1] },
  { position: [0.4, 0.24, -0.42], size: [0.1, 0.36, 0.1] },
  { position: [0, 0.36, -0.42], size: [0.7, 0.09, 0.08] },
]), 'wood_planks');
const mattressGeom = mapGeometryToMaterialAtlas(createBoxAssembly([
  { position: [0, 0.28, -0.015], size: [0.8, 0.16, 0.74] },
]), 'snow_top');
const blanketGeom = mapGeometryToMaterialAtlas(createBoxAssembly([
  { position: [0, 0.39, -0.12], size: [0.82, 0.07, 0.5] },
  { position: [-0.405, 0.32, -0.12], size: [0.055, 0.2, 0.5] },
  { position: [0.405, 0.32, -0.12], size: [0.055, 0.2, 0.5] },
]), 'terracotta');
const blanketFoldGeom = mapGeometryToMaterialAtlas(createBoxAssembly([
  { position: [0, 0.43, 0.1], size: [0.82, 0.035, 0.09] },
  { position: [0, 0.445, -0.32], size: [0.74, 0.018, 0.035] },
]), 'tnt');
const pillowGeom = new THREE.SphereGeometry(0.5, 14, 8);
pillowGeom.scale(0.62, 0.14, 0.22);
pillowGeom.translate(0, 0.43, 0.29);
mapGeometryToMaterialAtlas(pillowGeom, 'snow_top');

/** ワールド内のすべてのベッドを描画 */
export function BedRenderer() {
  const blockIndexVersion = useWorldStore((s) => s.blockIndexVersion);
  const getIndexedBlockPositions = useWorldStore((s) => s.getIndexedBlockPositions);
  const getBlock = useWorldStore((s) => s.getBlock);
  const woodFrameMat = useAtlasPbrMaterial('wood_planks');
  const sheetMat = useAtlasPbrMaterial('snow_top');
  const blanketMat = useAtlasPbrMaterial('terracotta');
  const blanketFoldMat = useAtlasPbrMaterial('tnt');
  const pillowMat = useAtlasPbrMaterial('snow_top');

  // 索引済みのベッド位置だけを取得
  const bedPositions = useMemo(() => {
    // blockIndexVersion は索引更新時にこのメモを作り直すためのトリガー
    void blockIndexVersion;
    return getIndexedBlockPositions(BLOCK_IDS.BED);
  }, [blockIndexVersion, getIndexedBlockPositions]);

  return (
    <group>
      {bedPositions.map((pos) => (
        <BedModel
          key={`bed-${pos.x}-${pos.y}-${pos.z}`}
          position={[pos.x + 0.5, pos.y, pos.z + 0.5]}
          yaw={facingToYaw(inferBedFacing(getBlock, pos.x, pos.y, pos.z))}
          materials={{ woodFrameMat, sheetMat, blanketMat, blanketFoldMat, pillowMat }}
        />
      ))}
    </group>
  );
}

/** 個別のベッド3Dモデル（共有マテリアル・ジオメトリ使用） */
function BedModel({
  position,
  yaw,
  materials,
}: {
  position: [number, number, number];
  yaw: number;
  materials: {
    woodFrameMat: THREE.MeshStandardMaterial;
    sheetMat: THREE.MeshStandardMaterial;
    blanketMat: THREE.MeshStandardMaterial;
    blanketFoldMat: THREE.MeshStandardMaterial;
    pillowMat: THREE.MeshStandardMaterial;
  };
}) {
  const { woodFrameMat, sheetMat, blanketMat, blanketFoldMat, pillowMat } = materials;
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <mesh geometry={woodFrameGeom} material={woodFrameMat} castShadow receiveShadow />
      <mesh geometry={mattressGeom} material={sheetMat} castShadow receiveShadow />
      <mesh geometry={blanketGeom} material={blanketMat} castShadow receiveShadow />
      <mesh geometry={blanketFoldGeom} material={blanketFoldMat} castShadow />
      <mesh geometry={pillowGeom} material={pillowMat} castShadow receiveShadow />
    </group>
  );
}
