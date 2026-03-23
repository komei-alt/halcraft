// ============================================
// VoxelAvatar — マイクラ風ボクセルキャラクター
// BoxGeometry で構成された人型アバター
// ============================================

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface VoxelAvatarProps {
  /** スキンカラー（体・腕の色） */
  color: string;
  /** 移動中か（歩行アニメーション用） */
  isMoving: boolean;
}

export function VoxelAvatar({ color, isMoving }: VoxelAvatarProps) {
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);

  // マテリアルをメモ化
  const bodyMat = useMemo(() => new THREE.MeshLambertMaterial({ color }), [color]);
  const skinMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffcc99' }), []);
  const legMat = useMemo(() => {
    // 体の色を少し暗くして足の色にする
    const c = new THREE.Color(color);
    c.multiplyScalar(0.7);
    return new THREE.MeshLambertMaterial({ color: c });
  }, [color]);

  // ジオメトリをメモ化
  const headGeom = useMemo(() => new THREE.BoxGeometry(0.5, 0.5, 0.5), []);
  const bodyGeom = useMemo(() => new THREE.BoxGeometry(0.6, 0.8, 0.4), []);
  const armGeom = useMemo(() => new THREE.BoxGeometry(0.25, 0.7, 0.25), []);
  const legGeom = useMemo(() => new THREE.BoxGeometry(0.25, 0.6, 0.3), []);

  // 歩行アニメーション
  useFrame((_, delta) => {
    if (!leftArmRef.current || !rightArmRef.current) return;
    if (!leftLegRef.current || !rightLegRef.current) return;

    if (isMoving) {
      const t = performance.now() * 0.006;
      const swing = Math.sin(t) * 0.6;

      leftArmRef.current.rotation.x = swing;
      rightArmRef.current.rotation.x = -swing;
      leftLegRef.current.rotation.x = -swing;
      rightLegRef.current.rotation.x = swing;
    } else {
      // 静止時はゆっくり元に戻す
      const speed = delta * 5;
      leftArmRef.current.rotation.x *= (1 - speed);
      rightArmRef.current.rotation.x *= (1 - speed);
      leftLegRef.current.rotation.x *= (1 - speed);
      rightLegRef.current.rotation.x *= (1 - speed);
    }
  });

  return (
    <group>
      {/* 頭 */}
      <mesh geometry={headGeom} material={skinMat} position={[0, 1.55, 0]} castShadow />

      {/* 体 */}
      <mesh geometry={bodyGeom} material={bodyMat} position={[0, 0.9, 0]} castShadow />

      {/* 左腕 */}
      <mesh
        ref={leftArmRef}
        geometry={armGeom}
        material={bodyMat}
        position={[-0.42, 0.85, 0]}
        castShadow
      />

      {/* 右腕 */}
      <mesh
        ref={rightArmRef}
        geometry={armGeom}
        material={bodyMat}
        position={[0.42, 0.85, 0]}
        castShadow
      />

      {/* 左足 */}
      <mesh
        ref={leftLegRef}
        geometry={legGeom}
        material={legMat}
        position={[-0.15, 0.3, 0]}
        castShadow
      />

      {/* 右足 */}
      <mesh
        ref={rightLegRef}
        geometry={legGeom}
        material={legMat}
        position={[0.15, 0.3, 0]}
        castShadow
      />
    </group>
  );
}
