// ============================================
// RemotePlayerWeapon — リモートプレイヤーの装備武器を描画
// equippedItem に応じて右手に武器を表示する
// builder の場合はピッケルを表示
// ============================================

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { EquippedItem } from '../stores/usePlayerStore';
import { cloneSceneWithMaterials } from './vehicles/modelUtils';

const MACHINE_GUN_MODEL_PATH = '/models/2026-05-01/machine-gun.glb';

interface RemotePlayerWeaponProps {
  equippedItem: EquippedItem;
  /** 右腕のメッシュ参照（武器をアタッチするため） */
  rightArmRef: React.RefObject<THREE.Mesh | null>;
  /** 移動中かどうか（腕振りと同期） */
  isMoving: boolean;
}

/**
 * ピッケル（ビルダーモード）用のジオメトリ定義
 * マインクラフト風のボクセルピッケルを描画
 */
function PickaxeModel() {
  return (
    <group position={[0.0, -0.35, -0.2]} rotation={[0.5, 0, 0.2]}>
      {/* 柄（木の棒） */}
      <mesh position={[0, -0.1, 0]} rotation={[0, 0, -0.1]}>
        <boxGeometry args={[0.06, 0.48, 0.06]} />
        <meshStandardMaterial color="#8B6914" roughness={0.85} />
      </mesh>
      {/* ピッケルヘッド（石の刃） */}
      <mesh position={[0, 0.14, 0]}>
        <boxGeometry args={[0.3, 0.08, 0.06]} />
        <meshStandardMaterial color="#777777" roughness={0.7} metalness={0.15} />
      </mesh>
      {/* ピッケルの先端（左） */}
      <mesh position={[-0.18, 0.17, 0]}>
        <boxGeometry args={[0.08, 0.06, 0.05]} />
        <meshStandardMaterial color="#666666" roughness={0.7} metalness={0.15} />
      </mesh>
      {/* ピッケルの先端（右） */}
      <mesh position={[0.18, 0.17, 0]}>
        <boxGeometry args={[0.08, 0.06, 0.05]} />
        <meshStandardMaterial color="#666666" roughness={0.7} metalness={0.15} />
      </mesh>
    </group>
  );
}

/**
 * ロケットランチャーの簡易モデル
 * 本来の一人称モデルを縮小してアバターに装着
 */
function RocketLauncherModel() {
  return (
    <group position={[0.05, -0.25, -0.15]} rotation={[0.3, 0, 0.1]} scale={0.55}>
      {/* メインチューブ */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.95, 12]} />
        <meshStandardMaterial color="#524b43" roughness={0.72} metalness={0.22} />
      </mesh>
      {/* 前方リング */}
      <mesh position={[0, 0, -0.48]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.05, 12]} />
        <meshStandardMaterial color="#2b2724" roughness={0.65} metalness={0.3} />
      </mesh>
      {/* 砲口 */}
      <mesh position={[0, 0, -0.55]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.05, 12]} />
        <meshStandardMaterial color="#181614" roughness={0.55} metalness={0.4} />
      </mesh>
      {/* 下部フレーム */}
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[0.18, 0.06, 0.7]} />
        <meshStandardMaterial color="#1f1f1f" roughness={0.48} metalness={0.52} />
      </mesh>
    </group>
  );
}

/**
 * 機関銃の3Dモデル
 */
function MachineGunModel() {
  const gltf = useGLTF(MACHINE_GUN_MODEL_PATH);
  const model = useMemo(() => cloneSceneWithMaterials(gltf.scene), [gltf.scene]);

  return (
    <group position={[0.02, -0.28, -0.22]} rotation={[0.3, Math.PI, 0.05]} scale={0.08}>
      <primitive object={model} />
    </group>
  );
}

/**
 * リモートプレイヤーの右手に武器を配置するコンポーネント
 * VoxelAvatar の右腕（position=[0.42, 0.85, 0]）にアタッチされる
 */
export function RemotePlayerWeapon({ equippedItem }: RemotePlayerWeaponProps) {
  const groupRef = useRef<THREE.Group>(null);

  // 右腕の位置（VoxelAvatar の origPositions.rightArm = [0.42, 0.85, 0]）に合わせる
  // 腕の下端あたり（手の位置）にオフセット
  return (
    <group ref={groupRef} position={[0.42, 0.52, 0]}>
      {equippedItem === 'builder' && <PickaxeModel />}
      {equippedItem === 'rocket_launcher' && <RocketLauncherModel />}
      {equippedItem === 'machine_gun' && <MachineGunModel />}
    </group>
  );
}

// GLBモデルのプリロード
useGLTF.preload(MACHINE_GUN_MODEL_PATH);
