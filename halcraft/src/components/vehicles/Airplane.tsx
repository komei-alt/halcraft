// 飛行機コンポーネント
// ボクセルスタイルの3D飛行機モデル + プロペラアニメーション
// プレイヤーが近づくと搭乗プロンプトを表示

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useVehicleStore, AIRPLANE_CONSTANTS } from '../../stores/useVehicleStore';

/** 飛行機の色定義（子供らしいカラフルな色） */
const BODY_COLOR = new THREE.Color(0xee4444);       // 赤い胴体
const WING_COLOR = new THREE.Color(0xdddddd);       // 白い翼
const TAIL_COLOR = new THREE.Color(0x3366cc);        // 青い尾翼
const PROPELLER_COLOR = new THREE.Color(0x444444);   // 灰色のプロペラ
const WINDOW_COLOR = new THREE.Color(0x88ccff);      // 水色の窓
const WHEEL_COLOR = new THREE.Color(0x222222);       // 黒い車輪
const ENGINE_COLOR = new THREE.Color(0xcccccc);      // エンジンカウル

export function Airplane() {
  const { camera } = useThree();
  const airplane = useVehicleStore((s) => s.airplane);
  const propellerRef = useRef<THREE.Group>(null);
  const groupRef = useRef<THREE.Group>(null);

  // マテリアルをメモ化
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: BODY_COLOR, roughness: 0.7, metalness: 0.1,
  }), []);
  const wingMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: WING_COLOR, roughness: 0.6, metalness: 0.1,
  }), []);
  const tailMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: TAIL_COLOR, roughness: 0.7, metalness: 0.1,
  }), []);
  const propMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: PROPELLER_COLOR, roughness: 0.5, metalness: 0.3,
  }), []);
  const windowMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: WINDOW_COLOR, roughness: 0.2, metalness: 0.5,
    transparent: true, opacity: 0.7,
  }), []);
  const wheelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: WHEEL_COLOR, roughness: 0.9,
  }), []);
  const engineMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: ENGINE_COLOR, roughness: 0.4, metalness: 0.5,
  }), []);

  // 近いかどうかの判定（refで管理、レンダリングに使うのでstateにもコピー）
  const isNearRef = useRef(false);

  useFrame(() => {
    if (!airplane.spawned) return;

    // プロペラのアニメーション
    if (propellerRef.current && airplane.engineOn) {
      propellerRef.current.rotation.z += AIRPLANE_CONSTANTS.PROPELLER_SPEED * 0.016;
    }

    // 搭乗可能距離チェック
    const dx = camera.position.x - airplane.x;
    const dz = camera.position.z - airplane.z;
    const dy = camera.position.y - airplane.y;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    isNearRef.current = dist < AIRPLANE_CONSTANTS.BOARD_DISTANCE && !airplane.isBoarded;
  });

  if (!airplane.spawned) return null;

  return (
    <group
      ref={groupRef}
      position={[airplane.x, airplane.y, airplane.z]}
      rotation={[airplane.pitch, airplane.rotationY, airplane.roll]}
    >
      {/* === 胴体（メイン） === */}
      <mesh position={[0, 0.3, 0]} material={bodyMat}>
        <boxGeometry args={[1.2, 1.0, 4.0]} />
      </mesh>

      {/* 胴体ノーズ（先端を細く） */}
      <mesh position={[0, 0.3, 2.3]} material={bodyMat}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
      </mesh>

      {/* エンジンカウル（cylinderをX軸回転でZ方向に向ける） */}
      <group position={[0, 0.3, 2.8]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh material={engineMat}>
          <cylinderGeometry args={[0.35, 0.4, 0.3, 8]} />
        </mesh>
      </group>

      {/* === プロペラ === */}
      <group ref={propellerRef} position={[0, 0.3, 3.0]}>
        {/* プロペラブレード1 */}
        <mesh material={propMat}>
          <boxGeometry args={[2.0, 0.15, 0.05]} />
        </mesh>
        {/* プロペラブレード2 */}
        <mesh rotation={[0, 0, Math.PI / 2]} material={propMat}>
          <boxGeometry args={[2.0, 0.15, 0.05]} />
        </mesh>
        {/* プロペラ中心 */}
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh material={propMat}>
            <cylinderGeometry args={[0.1, 0.1, 0.15, 8]} />
          </mesh>
        </group>
      </group>

      {/* === 翼（左右） === */}
      {/* 左翼 */}
      <mesh position={[-2.5, 0.1, 0]} material={wingMat}>
        <boxGeometry args={[3.8, 0.12, 1.2]} />
      </mesh>
      {/* 右翼 */}
      <mesh position={[2.5, 0.1, 0]} material={wingMat}>
        <boxGeometry args={[3.8, 0.12, 1.2]} />
      </mesh>

      {/* === 尾翼 === */}
      {/* 垂直尾翼 */}
      <mesh position={[0, 1.0, -2.1]} material={tailMat}>
        <boxGeometry args={[0.1, 1.2, 0.8]} />
      </mesh>
      {/* 水平尾翼（左右） */}
      <mesh position={[-1.0, 0.5, -2.1]} material={tailMat}>
        <boxGeometry args={[2.0, 0.1, 0.6]} />
      </mesh>
      <mesh position={[1.0, 0.5, -2.1]} material={tailMat}>
        <boxGeometry args={[2.0, 0.1, 0.6]} />
      </mesh>

      {/* 胴体テール部 */}
      <mesh position={[0, 0.4, -2.1]} material={bodyMat}>
        <boxGeometry args={[0.8, 0.6, 1.0]} />
      </mesh>

      {/* === 窓（コックピット） === */}
      <mesh position={[0, 0.7, 1.0]} material={windowMat}>
        <boxGeometry args={[0.9, 0.4, 0.8]} />
      </mesh>

      {/* === 車輪 === */}
      {/* 前輪 */}
      <group position={[0, -0.5, 1.5]}>
        <group rotation={[0, 0, Math.PI / 2]}>
          <mesh material={wheelMat}>
            <cylinderGeometry args={[0.15, 0.15, 0.1, 8]} />
          </mesh>
        </group>
        {/* 支柱 */}
        <mesh position={[0, 0.25, 0]} material={wheelMat}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
        </mesh>
      </group>

      {/* 左後輪 */}
      <group position={[-0.5, -0.5, -0.5]}>
        <group rotation={[0, 0, Math.PI / 2]}>
          <mesh material={wheelMat}>
            <cylinderGeometry args={[0.2, 0.2, 0.12, 8]} />
          </mesh>
        </group>
        <mesh position={[0, 0.25, 0]} material={wheelMat}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
        </mesh>
      </group>

      {/* 右後輪 */}
      <group position={[0.5, -0.5, -0.5]}>
        <group rotation={[0, 0, Math.PI / 2]}>
          <mesh material={wheelMat}>
            <cylinderGeometry args={[0.2, 0.2, 0.12, 8]} />
          </mesh>
        </group>
        <mesh position={[0, 0.25, 0]} material={wheelMat}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
        </mesh>
      </group>

      {/* === 搭乗プロンプト（Fキーガイド） === */}
      {!airplane.isBoarded && (
        <Billboard position={[0, 2.8, 0]}>
          {/* 背景パネル */}
          <mesh>
            <planeGeometry args={[3.0, 0.5]} />
            <meshBasicMaterial color={0x000000} transparent opacity={0.7} side={THREE.DoubleSide} />
          </mesh>
          {/* テキスト */}
          <Text
            position={[0, 0, 0.01]}
            fontSize={0.25}
            color="#ffcc00"
            anchorX="center"
            anchorY="middle"
            font={undefined}
          >
            [F] のる
          </Text>
        </Billboard>
      )}
    </group>
  );
}
