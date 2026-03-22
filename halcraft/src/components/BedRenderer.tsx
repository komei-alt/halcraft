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

// === マテリアル定数（再利用のためキャッシュ） ===
const woodFrameColor = new THREE.Color(0x8B6914);
const woodDarkColor = new THREE.Color(0x6B4F10);
const blanketColor = new THREE.Color(0xCC2222);
const blanketEmissive = new THREE.Color(0x220000);
const pillowColor = new THREE.Color(0xF0EDE0);
const sheetColor = new THREE.Color(0xF5F0E8);

/** 個別のベッド3Dモデル */
function BedModel({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* ===== 木製フレーム（ベースボード） ===== */}
      {/* 底板 */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[0.9, 0.12, 0.9]} />
        <meshStandardMaterial
          color={woodFrameColor}
          roughness={0.85}
        />
      </mesh>

      {/* 4本の脚 */}
      {/* 左前脚 */}
      <mesh position={[-0.38, 0.04, -0.38]}>
        <boxGeometry args={[0.1, 0.08, 0.1]} />
        <meshStandardMaterial color={woodDarkColor} roughness={0.9} />
      </mesh>
      {/* 右前脚 */}
      <mesh position={[0.38, 0.04, -0.38]}>
        <boxGeometry args={[0.1, 0.08, 0.1]} />
        <meshStandardMaterial color={woodDarkColor} roughness={0.9} />
      </mesh>
      {/* 左後脚 */}
      <mesh position={[-0.38, 0.04, 0.38]}>
        <boxGeometry args={[0.1, 0.08, 0.1]} />
        <meshStandardMaterial color={woodDarkColor} roughness={0.9} />
      </mesh>
      {/* 右後脚 */}
      <mesh position={[0.38, 0.04, 0.38]}>
        <boxGeometry args={[0.1, 0.08, 0.1]} />
        <meshStandardMaterial color={woodDarkColor} roughness={0.9} />
      </mesh>

      {/* ヘッドボード（頭側の板） */}
      <mesh position={[0, 0.32, 0.42]}>
        <boxGeometry args={[0.92, 0.38, 0.06]} />
        <meshStandardMaterial
          color={woodFrameColor}
          roughness={0.8}
        />
      </mesh>

      {/* フットボード（足元側の板・低め） */}
      <mesh position={[0, 0.24, -0.42]}>
        <boxGeometry args={[0.92, 0.22, 0.06]} />
        <meshStandardMaterial
          color={woodFrameColor}
          roughness={0.8}
        />
      </mesh>

      {/* ===== マットレス（白いシーツ） ===== */}
      <mesh position={[0, 0.2, -0.02]}>
        <boxGeometry args={[0.82, 0.1, 0.78]} />
        <meshStandardMaterial
          color={sheetColor}
          roughness={0.95}
        />
      </mesh>

      {/* ===== 赤い布団（ブランケット） ===== */}
      <mesh position={[0, 0.28, -0.1]}>
        <boxGeometry args={[0.84, 0.08, 0.6]} />
        <meshStandardMaterial
          color={blanketColor}
          roughness={0.7}
          emissive={blanketEmissive}
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* 布団の折り返し部分（少し濃い赤） */}
      <mesh position={[0, 0.29, 0.22]}>
        <boxGeometry args={[0.84, 0.04, 0.06]} />
        <meshStandardMaterial
          color={new THREE.Color(0xAA1818)}
          roughness={0.7}
        />
      </mesh>

      {/* ===== 白い枕 ===== */}
      <mesh position={[0, 0.3, 0.3]}>
        <boxGeometry args={[0.6, 0.1, 0.18]} />
        <meshStandardMaterial
          color={pillowColor}
          roughness={0.95}
        />
      </mesh>

      {/* 枕の膨らみ（少し上に凸） */}
      <mesh position={[0, 0.34, 0.3]}>
        <boxGeometry args={[0.5, 0.04, 0.14]} />
        <meshStandardMaterial
          color={pillowColor}
          roughness={0.95}
        />
      </mesh>
    </group>
  );
}
