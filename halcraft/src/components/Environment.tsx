// 環境コンポーネント
// 空（スカイカラー）、太陽光、霧を管理

import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';

export function Environment() {
  const { scene } = useThree();

  // シーン背景と霧の設定
  useEffect(() => {
    // 遠くの空の色（暗すぎない青空）
    scene.background = new THREE.Color(0x87ceeb);
    // 遠距離を霧で自然にフェードアウト
    scene.fog = new THREE.Fog(0x87ceeb, 40, 80);
  }, [scene]);

  return (
    <>
      {/* 環境光（全体を柔らかく照らす） */}
      <ambientLight intensity={0.6} color={0xffffff} />

      {/* 太陽光（影を落とす主光源） */}
      <directionalLight
        position={[50, 80, 30]}
        intensity={1.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={200}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        color={0xfff5e0}
      />

      {/* 半球ライト（空の色→地面の色の2色で自然な環境光） */}
      <hemisphereLight
        args={[0x87ceeb, 0x6b8e23, 0.4]}
      />
    </>
  );
}
