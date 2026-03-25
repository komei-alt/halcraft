// 飛行機コンポーネント
// ボクセルスタイルの3D飛行機モデル + プロペラアニメーション
// プレイヤーが近づくと搭乗プロンプトを表示
// 鮮やかな色と自発光で昼夜問わず視認しやすい

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useVehicleStore, AIRPLANE_CONSTANTS } from '../../stores/useVehicleStore';

/** 飛行機の色定義（鮮やかで目立つ色） */
const BODY_COLOR = new THREE.Color(0xff3333);       // 鮮やかな赤い胴体
const WING_COLOR = new THREE.Color(0xffffff);       // 真っ白い翼
const TAIL_COLOR = new THREE.Color(0x2255ff);        // 鮮やかな青い尾翼
const PROPELLER_COLOR = new THREE.Color(0x555555);   // 灰色のプロペラ
const WINDOW_COLOR = new THREE.Color(0x66ddff);      // 明るい水色の窓
const WHEEL_COLOR = new THREE.Color(0x333333);       // 黒い車輪
const ENGINE_COLOR = new THREE.Color(0xeeeeee);      // 明るいエンジンカウル
const STRIPE_COLOR = new THREE.Color(0xffdd00);      // 黄色いストライプ（装飾）

export function Airplane() {
  const airplane = useVehicleStore((s) => s.airplane);
  const propellerRef = useRef<THREE.Group>(null);
  const groupRef = useRef<THREE.Group>(null);

  // マテリアルをメモ化（emissive付きで暗所でも目立つ）
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: BODY_COLOR, roughness: 0.5, metalness: 0.1,
    emissive: BODY_COLOR, emissiveIntensity: 0.15,
  }), []);
  const wingMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: WING_COLOR, roughness: 0.4, metalness: 0.0,
    emissive: WING_COLOR, emissiveIntensity: 0.1,
  }), []);
  const tailMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: TAIL_COLOR, roughness: 0.5, metalness: 0.1,
    emissive: TAIL_COLOR, emissiveIntensity: 0.15,
  }), []);
  const propMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: PROPELLER_COLOR, roughness: 0.5, metalness: 0.3,
  }), []);
  const windowMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: WINDOW_COLOR, roughness: 0.1, metalness: 0.5,
    transparent: true, opacity: 0.8,
    emissive: WINDOW_COLOR, emissiveIntensity: 0.3,
  }), []);
  const wheelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: WHEEL_COLOR, roughness: 0.9,
  }), []);
  const engineMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: ENGINE_COLOR, roughness: 0.3, metalness: 0.5,
  }), []);
  const stripeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: STRIPE_COLOR, roughness: 0.4,
    emissive: STRIPE_COLOR, emissiveIntensity: 0.2,
  }), []);

  useFrame(() => {
    if (!airplane.spawned) return;

    // プロペラのアニメーション（搭乗中でなくても回す = 常にエンジンON状態）
    if (propellerRef.current) {
      const speed = airplane.isBoarded
        ? AIRPLANE_CONSTANTS.PROPELLER_SPEED * 0.016
        : AIRPLANE_CONSTANTS.PROPELLER_SPEED * 0.003; // 待機中はゆっくり回る
      propellerRef.current.rotation.z += speed;
    }
  });

  if (!airplane.spawned) return null;

  // 搭乗中は機体を非表示（FPS視点で自機の内部が見えてしまうため）
  const showBody = !airplane.isBoarded;

  return (
    <group
      ref={groupRef}
      position={[airplane.x, airplane.y, airplane.z]}
      rotation={[airplane.pitch, airplane.rotationY, airplane.roll]}
      scale={1.3}
    >
      {showBody && (
        <>
          {/* === 胴体（メイン） === */}
          <mesh position={[0, 0.3, 0]} material={bodyMat}>
            <boxGeometry args={[1.2, 1.0, 4.0]} />
          </mesh>

          {/* 胴体ノーズ（先端を細く） */}
          <mesh position={[0, 0.3, 2.3]} material={bodyMat}>
            <boxGeometry args={[0.8, 0.8, 0.8]} />
          </mesh>

          {/* 黄色いストライプ（胴体装飾） */}
          <mesh position={[0, 0.3, 0.5]} material={stripeMat}>
            <boxGeometry args={[1.22, 0.2, 0.4]} />
          </mesh>
          <mesh position={[0, 0.3, -0.5]} material={stripeMat}>
            <boxGeometry args={[1.22, 0.2, 0.4]} />
          </mesh>

          {/* エンジンカウル */}
          <group position={[0, 0.3, 2.8]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh material={engineMat}>
              <cylinderGeometry args={[0.35, 0.4, 0.3, 8]} />
            </mesh>
          </group>

          {/* === 翼（左右） === */}
          <mesh position={[-2.5, 0.1, 0]} material={wingMat}>
            <boxGeometry args={[3.8, 0.15, 1.2]} />
          </mesh>
          <mesh position={[2.5, 0.1, 0]} material={wingMat}>
            <boxGeometry args={[3.8, 0.15, 1.2]} />
          </mesh>
          {/* 翼端の赤マーク（左） */}
          <mesh position={[-4.2, 0.12, 0]} material={bodyMat}>
            <boxGeometry args={[0.4, 0.16, 0.5]} />
          </mesh>
          {/* 翼端の青マーク（右） */}
          <mesh position={[4.2, 0.12, 0]} material={tailMat}>
            <boxGeometry args={[0.4, 0.16, 0.5]} />
          </mesh>

          {/* === 尾翼 === */}
          <mesh position={[0, 1.0, -2.1]} material={tailMat}>
            <boxGeometry args={[0.1, 1.2, 0.8]} />
          </mesh>
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
          {/* サイドウィンドウ */}
          <mesh position={[-0.61, 0.5, 0.3]} material={windowMat}>
            <boxGeometry args={[0.02, 0.3, 0.4]} />
          </mesh>
          <mesh position={[0.61, 0.5, 0.3]} material={windowMat}>
            <boxGeometry args={[0.02, 0.3, 0.4]} />
          </mesh>

          {/* === 車輪 === */}
          {/* 前輪 */}
          <group position={[0, -0.5, 1.5]}>
            <group rotation={[0, 0, Math.PI / 2]}>
              <mesh material={wheelMat}>
                <cylinderGeometry args={[0.15, 0.15, 0.1, 8]} />
              </mesh>
            </group>
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
        </>
      )}

      {/* === プロペラ（搭乗中も表示 = 回転が見える） === */}
      <group ref={propellerRef} position={[0, 0.3, 3.0]}>
        <mesh material={propMat}>
          <boxGeometry args={[2.0, 0.15, 0.05]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} material={propMat}>
          <boxGeometry args={[2.0, 0.15, 0.05]} />
        </mesh>
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh material={propMat}>
            <cylinderGeometry args={[0.1, 0.1, 0.15, 8]} />
          </mesh>
        </group>
      </group>

      {/* === 搭乗プロンプト（大きく目立つ表示） === */}
      {!airplane.isBoarded && (
        <Billboard position={[0, 3.5, 0]}>
          {/* 背景パネル */}
          <mesh>
            <planeGeometry args={[4.0, 0.8]} />
            <meshBasicMaterial color={0x000000} transparent opacity={0.8} side={THREE.DoubleSide} />
          </mesh>
          {/* テキスト */}
          <Text
            position={[0, 0, 0.01]}
            fontSize={0.4}
            color="#ffdd00"
            anchorX="center"
            anchorY="middle"
            font={undefined}
            outlineWidth={0.02}
            outlineColor="#000000"
          >
            ✈ [F] のる
          </Text>
        </Billboard>
      )}
    </group>
  );
}
