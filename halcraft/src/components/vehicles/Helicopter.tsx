// ヘリコプターコンポーネント
// ボクセルスタイルの3Dヘリコプターモデル + ローターアニメーション
// プレイヤーが近づくと搭乗プロンプトを表示
// 鮮やかな色と自発光で昼夜問わず視認しやすい

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useVehicleStore, HELICOPTER_CONSTANTS } from '../../stores/useVehicleStore';

/** ヘリコプターの色定義（鮮やかで目立つ色） */
const BODY_COLOR = new THREE.Color(0xff3333);       // 鮮やかな赤い胴体
const BODY_WHITE = new THREE.Color(0xffffff);        // 白い下部
const TAIL_COLOR = new THREE.Color(0xcc2222);        // 暗い赤のテールブーム
const ROTOR_COLOR = new THREE.Color(0x444444);       // 灰色のローター
const WINDOW_COLOR = new THREE.Color(0x66ddff);      // 明るい水色の窓
const SKID_COLOR = new THREE.Color(0x333333);        // 黒いスキッド
const STRIPE_COLOR = new THREE.Color(0xffdd00);      // 黄色いストライプ

export function Helicopter() {
  const helicopter = useVehicleStore((s) => s.helicopter);
  const mainRotorRef = useRef<THREE.Group>(null);
  const tailRotorRef = useRef<THREE.Group>(null);
  const groupRef = useRef<THREE.Group>(null);

  // マテリアルをメモ化（emissive付きで暗所でも目立つ）
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: BODY_COLOR, roughness: 0.5, metalness: 0.1,
    emissive: BODY_COLOR, emissiveIntensity: 0.15,
  }), []);
  const bodyWhiteMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: BODY_WHITE, roughness: 0.4, metalness: 0.0,
    emissive: BODY_WHITE, emissiveIntensity: 0.1,
  }), []);
  const tailMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: TAIL_COLOR, roughness: 0.5, metalness: 0.1,
    emissive: TAIL_COLOR, emissiveIntensity: 0.1,
  }), []);
  const rotorMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: ROTOR_COLOR, roughness: 0.5, metalness: 0.3,
  }), []);
  const windowMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: WINDOW_COLOR, roughness: 0.1, metalness: 0.5,
    transparent: true, opacity: 0.8,
    emissive: WINDOW_COLOR, emissiveIntensity: 0.3,
  }), []);
  const skidMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: SKID_COLOR, roughness: 0.9,
  }), []);
  const stripeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: STRIPE_COLOR, roughness: 0.4,
    emissive: STRIPE_COLOR, emissiveIntensity: 0.2,
  }), []);

  useFrame(() => {
    if (!helicopter.spawned) return;

    // メインローターのアニメーション
    if (mainRotorRef.current) {
      if (helicopter.isBoarded) {
        // 搭乗中: ストアの rotorAngle を直接反映（入力速度に連動）
        mainRotorRef.current.rotation.y = helicopter.rotorAngle;
      } else {
        // 待機中: ゆっくりアイドル回転
        mainRotorRef.current.rotation.y += HELICOPTER_CONSTANTS.ROTOR_SPEED * 0.004;
      }
    }

    // テールローターのアニメーション（メインより速く回る）
    if (tailRotorRef.current) {
      if (helicopter.isBoarded) {
        tailRotorRef.current.rotation.x = helicopter.rotorAngle * 1.5;
      } else {
        tailRotorRef.current.rotation.x += HELICOPTER_CONSTANTS.ROTOR_SPEED * 0.006;
      }
    }
  });

  if (!helicopter.spawned) return null;

  // コックピット窓のみ搭乗中は非表示（視界を遮らないため）
  const showCockpitWindow = !helicopter.isBoarded;

  return (
    <group
      ref={groupRef}
      position={[helicopter.x, helicopter.y, helicopter.z]}
      rotation={[helicopter.pitch, helicopter.rotationY, helicopter.roll]}
      scale={1.3}
    >
      {/* === 胴体（メイン） === */}
      <mesh position={[0, 0.3, 0]} material={bodyMat}>
        <boxGeometry args={[1.6, 1.2, 2.8]} />
      </mesh>

      {/* 胴体下部（白） */}
      <mesh position={[0, -0.2, 0]} material={bodyWhiteMat}>
        <boxGeometry args={[1.5, 0.3, 2.6]} />
      </mesh>

      {/* ノーズ（前部を丸みをつけて） */}
      <mesh position={[0, 0.2, 1.5]} material={bodyMat}>
        <boxGeometry args={[1.3, 1.0, 0.6]} />
      </mesh>

      {/* 黄色いストライプ（胴体装飾） */}
      <mesh position={[0, 0.3, 0.3]} material={stripeMat}>
        <boxGeometry args={[1.62, 0.15, 0.3]} />
      </mesh>

      {/* === テールブーム === */}
      <mesh position={[0, 0.4, -2.2]} material={tailMat}>
        <boxGeometry args={[0.5, 0.5, 2.0]} />
      </mesh>

      {/* テールフィン（垂直） */}
      <mesh position={[0, 1.0, -3.0]} material={tailMat}>
        <boxGeometry args={[0.1, 1.0, 0.6]} />
      </mesh>

      {/* テールフィン（水平） */}
      <mesh position={[0, 0.65, -3.0]} material={tailMat}>
        <boxGeometry args={[1.2, 0.08, 0.4]} />
      </mesh>

      {/* === コックピット窓 === */}
      {showCockpitWindow && (
        <>
          {/* フロントウィンドウ（大きく斜め） */}
          <mesh position={[0, 0.6, 1.6]} material={windowMat}>
            <boxGeometry args={[1.2, 0.6, 0.4]} />
          </mesh>
          {/* サイドウィンドウ左 */}
          <mesh position={[-0.81, 0.5, 0.5]} material={windowMat}>
            <boxGeometry args={[0.02, 0.5, 1.0]} />
          </mesh>
          {/* サイドウィンドウ右 */}
          <mesh position={[0.81, 0.5, 0.5]} material={windowMat}>
            <boxGeometry args={[0.02, 0.5, 1.0]} />
          </mesh>
        </>
      )}

      {/* === ルーフ（ローター取り付け部） === */}
      <mesh position={[0, 0.95, 0]} material={bodyMat}>
        <boxGeometry args={[0.8, 0.15, 1.0]} />
      </mesh>

      {/* ローターマスト */}
      <mesh position={[0, 1.2, 0]} material={skidMat}>
        <boxGeometry args={[0.15, 0.4, 0.15]} />
      </mesh>

      {/* === メインローター（上部で回転） === */}
      <group ref={mainRotorRef} position={[0, 1.45, 0]}>
        {/* ローターブレード × 4 */}
        <mesh material={rotorMat}>
          <boxGeometry args={[5.0, 0.06, 0.25]} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]} material={rotorMat}>
          <boxGeometry args={[5.0, 0.06, 0.25]} />
        </mesh>
        {/* ローターハブ */}
        <mesh material={rotorMat}>
          <boxGeometry args={[0.3, 0.12, 0.3]} />
        </mesh>
      </group>

      {/* === テールローター === */}
      <group ref={tailRotorRef} position={[0.15, 0.9, -3.0]}>
        <mesh material={rotorMat}>
          <boxGeometry args={[0.05, 1.0, 0.15]} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={rotorMat}>
          <boxGeometry args={[0.05, 1.0, 0.15]} />
        </mesh>
      </group>

      {/* === スキッド（着陸脚） === */}
      {/* 左スキッド */}
      <group position={[-0.6, -0.5, 0]}>
        {/* 横棒 */}
        <mesh material={skidMat}>
          <boxGeometry args={[0.08, 0.08, 2.4]} />
        </mesh>
        {/* 前の支柱 */}
        <mesh position={[0, 0.25, 0.7]} material={skidMat}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
        </mesh>
        {/* 後の支柱 */}
        <mesh position={[0, 0.25, -0.7]} material={skidMat}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
        </mesh>
      </group>
      {/* 右スキッド */}
      <group position={[0.6, -0.5, 0]}>
        <mesh material={skidMat}>
          <boxGeometry args={[0.08, 0.08, 2.4]} />
        </mesh>
        <mesh position={[0, 0.25, 0.7]} material={skidMat}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
        </mesh>
        <mesh position={[0, 0.25, -0.7]} material={skidMat}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
        </mesh>
      </group>

      {/* === 搭乗プロンプト === */}
      {!helicopter.isBoarded && (
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
            🚁 [F] のる
          </Text>
        </Billboard>
      )}
    </group>
  );
}
