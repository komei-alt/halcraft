// ベッドレンダラーコンポーネント
// ベッドを3Dオブジェクトとして描画する
// 木のフレーム + 赤い布団 + 白い枕

import { useMemo } from 'react';
import * as THREE from 'three';
import { BLOCK_IDS } from '../types/blocks';
import { useWorldStore } from '../stores/useWorldStore';
import { facingToYaw, inferBedFacing } from '../utils/blockFacing';

// === 共有マテリアル（全ベッドで再利用） ===
const woodFrameMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.85 });
const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x6B4F10, roughness: 0.9 });
const blanketMat = new THREE.MeshStandardMaterial({
  color: 0xCC2222, roughness: 0.7,
  emissive: new THREE.Color(0x220000), emissiveIntensity: 0.15,
});
const blanketFoldMat = new THREE.MeshStandardMaterial({ color: 0xAA1818, roughness: 0.7 });
const pillowMat = new THREE.MeshStandardMaterial({ color: 0xF0EDE0, roughness: 0.95 });
const sheetMat = new THREE.MeshStandardMaterial({ color: 0xF5F0E8, roughness: 0.95 });
const headboardMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.8 });

// === 共有ジオメトリ ===
const baseGeom = new THREE.BoxGeometry(0.9, 0.12, 0.9);
const legGeom = new THREE.BoxGeometry(0.1, 0.08, 0.1);
const headboardGeom = new THREE.BoxGeometry(0.92, 0.38, 0.06);
const footboardGeom = new THREE.BoxGeometry(0.92, 0.22, 0.06);
const mattressGeom = new THREE.BoxGeometry(0.82, 0.1, 0.78);
const blanketGeom = new THREE.BoxGeometry(0.84, 0.08, 0.6);
const blanketFoldGeom = new THREE.BoxGeometry(0.84, 0.04, 0.06);
const pillowGeom = new THREE.BoxGeometry(0.6, 0.1, 0.18);
const pillowBulgeGeom = new THREE.BoxGeometry(0.5, 0.04, 0.14);

/** ワールド内のすべてのベッドを描画 */
export function BedRenderer() {
  const blockIndexVersion = useWorldStore((s) => s.blockIndexVersion);
  const getIndexedBlockPositions = useWorldStore((s) => s.getIndexedBlockPositions);
  const getBlock = useWorldStore((s) => s.getBlock);

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
        />
      ))}
    </group>
  );
}

/** 個別のベッド3Dモデル（共有マテリアル・ジオメトリ使用） */
function BedModel({ position, yaw }: { position: [number, number, number]; yaw: number }) {
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      {/* 底板 */}
      <mesh position={[0, 0.1, 0]} geometry={baseGeom} material={woodFrameMat} />
      {/* 4本の脚 */}
      <mesh position={[-0.38, 0.04, -0.38]} geometry={legGeom} material={woodDarkMat} />
      <mesh position={[0.38, 0.04, -0.38]} geometry={legGeom} material={woodDarkMat} />
      <mesh position={[-0.38, 0.04, 0.38]} geometry={legGeom} material={woodDarkMat} />
      <mesh position={[0.38, 0.04, 0.38]} geometry={legGeom} material={woodDarkMat} />
      {/* ヘッドボード */}
      <mesh position={[0, 0.32, 0.42]} geometry={headboardGeom} material={headboardMat} />
      {/* フットボード */}
      <mesh position={[0, 0.24, -0.42]} geometry={footboardGeom} material={headboardMat} />
      {/* マットレス */}
      <mesh position={[0, 0.2, -0.02]} geometry={mattressGeom} material={sheetMat} />
      {/* 布団 */}
      <mesh position={[0, 0.28, -0.1]} geometry={blanketGeom} material={blanketMat} />
      {/* 布団の折り返し */}
      <mesh position={[0, 0.29, 0.22]} geometry={blanketFoldGeom} material={blanketFoldMat} />
      {/* 枕 */}
      <mesh position={[0, 0.3, 0.3]} geometry={pillowGeom} material={pillowMat} />
      {/* 枕の膨らみ */}
      <mesh position={[0, 0.34, 0.3]} geometry={pillowBulgeGeom} material={pillowMat} />
    </group>
  );
}
