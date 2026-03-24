// ベッドレンダラーコンポーネント
// ベッドを3Dオブジェクトとして描画する
// 木のフレーム + 赤い布団 + 白い枕

import { useMemo } from 'react';
import * as THREE from 'three';
import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT } from '../types/blocks';
import { useWorldStore } from '../stores/useWorldStore';

interface BedPosition {
  x: number;
  y: number;
  z: number;
}

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
  const chunks = useWorldStore((s) => s.chunks);
  const chunkVersions = useWorldStore((s) => s.chunkVersions);

  // 全チャンクからベッドの位置を収集
  const bedPositions = useMemo(() => {
    const positions: BedPosition[] = [];

    chunks.forEach((chunkData, key) => {
      const [cx, cz] = key.split(',').map(Number);

      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            if (chunkData[lx][ly][lz] === BLOCK_IDS.BED) {
              positions.push({
                x: cx * CHUNK_SIZE + lx,
                y: ly,
                z: cz * CHUNK_SIZE + lz,
              });
            }
          }
        }
      }
    });

    return positions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunks, chunkVersions]);

  return (
    <group>
      {bedPositions.map((pos) => (
        <BedModel
          key={`bed-${pos.x}-${pos.y}-${pos.z}`}
          position={[pos.x + 0.5, pos.y, pos.z + 0.5]}
        />
      ))}
    </group>
  );
}

/** 個別のベッド3Dモデル（共有マテリアル・ジオメトリ使用） */
function BedModel({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
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
