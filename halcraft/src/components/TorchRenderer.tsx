// 松明レンダラーコンポーネント
// 松明をデザイン通りに3Dで描画する
// 茶色の棒 + 灰色の受け部分 + オレンジの炎（パーティクル風）

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT } from '../types/blocks';
import { useWorldStore } from '../stores/useWorldStore';

interface TorchPosition {
  x: number;
  y: number;
  z: number;
}

// 共有マテリアル（全松明で再利用）
const stickMaterial = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.9 });
const holderMaterial = new THREE.MeshStandardMaterial({
  color: 0x444444, roughness: 0.7,
  emissive: new THREE.Color(0x331100), emissiveIntensity: 0.3,
});
const flameMaterial = new THREE.MeshStandardMaterial({
  color: 0xff6600, emissive: new THREE.Color(0xff4400), emissiveIntensity: 2.0,
  transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
});
const innerFlameMaterial = new THREE.MeshStandardMaterial({
  color: 0xffaa00, emissive: new THREE.Color(0xffcc22), emissiveIntensity: 3.0,
  transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false,
});
const glowMaterial = new THREE.MeshBasicMaterial({
  color: 0xff8844, transparent: true, opacity: 0.15,
  side: THREE.DoubleSide, depthWrite: false,
});

// 共有ジオメトリ
const stickGeom = new THREE.BoxGeometry(0.12, 0.6, 0.12);
const holderGeom = new THREE.BoxGeometry(0.16, 0.08, 0.16);
const flameGeom = new THREE.ConeGeometry(0.10, 0.28, 6);
const innerFlameGeom = new THREE.ConeGeometry(0.06, 0.20, 5);
const glowGeom = new THREE.SphereGeometry(0.18, 8, 8);

/** ワールド内のすべての松明を描画 */
export function TorchRenderer() {
  const chunks = useWorldStore((s) => s.chunks);
  const chunkVersions = useWorldStore((s) => s.chunkVersions);

  // 全チャンクから松明の位置を収集
  const torchPositions = useMemo(() => {
    const positions: TorchPosition[] = [];

    chunks.forEach((chunkData, key) => {
      const [cx, cz] = key.split(',').map(Number);

      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            if (chunkData[lx][ly][lz] === BLOCK_IDS.TORCH) {
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
      {torchPositions.map((pos) => (
        <TorchModel
          key={`torch-${pos.x}-${pos.y}-${pos.z}`}
          position={[pos.x + 0.5, pos.y, pos.z + 0.5]}
        />
      ))}
    </group>
  );
}

/** 個別の松明3Dモデル（共有マテリアル・ジオメトリ使用） */
function TorchModel({ position }: { position: [number, number, number] }) {
  const flameRef = useRef<THREE.Mesh>(null);
  const flameRef2 = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const timeOffsetRef = useRef<number | null>(null);

  // 炎のアニメーション
  useFrame(({ clock }) => {
    if (timeOffsetRef.current === null) {
      timeOffsetRef.current = Math.random() * Math.PI * 2;
    }
    const t = clock.getElapsedTime() + timeOffsetRef.current;

    if (flameRef.current) {
      flameRef.current.position.x = Math.sin(t * 6) * 0.02;
      flameRef.current.position.z = Math.cos(t * 8) * 0.02;
      const scale = 1 + Math.sin(t * 10) * 0.15;
      flameRef.current.scale.set(scale, scale * 1.1, scale);
    }
    if (flameRef2.current) {
      flameRef2.current.position.x = Math.sin(t * 7 + 1) * 0.03;
      flameRef2.current.position.z = Math.cos(t * 9 + 2) * 0.03;
      const scale2 = 0.8 + Math.sin(t * 12 + 1) * 0.2;
      flameRef2.current.scale.set(scale2, scale2 * 1.2, scale2);
    }
    if (glowRef.current) {
      const glowScale = 1 + Math.sin(t * 7) * 0.1;
      glowRef.current.scale.set(glowScale, glowScale, glowScale);
    }
  });

  return (
    <group position={position}>
      {/* 棒の部分 */}
      <mesh position={[0, 0.3, 0]} geometry={stickGeom} material={stickMaterial} />
      {/* 受け部分 */}
      <mesh position={[0, 0.58, 0]} geometry={holderGeom} material={holderMaterial} />
      {/* メインの炎 */}
      <mesh ref={flameRef} position={[0, 0.75, 0]} geometry={flameGeom} material={flameMaterial} />
      {/* 内側の炎 */}
      <mesh ref={flameRef2} position={[0, 0.72, 0]} geometry={innerFlameGeom} material={innerFlameMaterial} />
      {/* グロー */}
      <mesh ref={glowRef} position={[0, 0.72, 0]} geometry={glowGeom} material={glowMaterial} />
    </group>
  );
}
