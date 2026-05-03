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
const MAX_REMOTE_AIM_PITCH = Math.PI / 3;

interface RemotePlayerWeaponProps {
  equippedItem: EquippedItem;
  /** 移動中かどうか（腕振りと同期） */
  isMoving: boolean;
  /** プレイヤー視点の上下角度 */
  viewPitch: number;
}

interface RemoteWeaponPose {
  anchor: [number, number, number];
  rotation: [number, number, number];
}

function getRemoteWeaponPose(equippedItem: EquippedItem, pitch: number): RemoteWeaponPose {
  switch (equippedItem) {
    case 'builder':
      return {
        anchor: [0.51, 0.68, -0.13],
        rotation: [0.08 + pitch * 0.12, 0, 0],
      };
    case 'rocket_launcher':
      return {
        anchor: [0.42, 1.43, -0.1],
        rotation: [pitch * 0.6, -0.03, 0],
      };
    case 'machine_gun':
      return {
        anchor: [0.34, 1.08, -0.34],
        rotation: [pitch * 0.72, -0.02, 0],
      };
    default:
      return {
        anchor: [0.42, 0.92, -0.18],
        rotation: [pitch * 0.35, 0, 0],
      };
  }
}

/**
 * ピッケル（ビルダーモード）用のジオメトリ定義
 * マインクラフト風のボクセルピッケルを描画
 */
function PickaxeModel() {
  return (
    <group position={[0.08, 0, -0.04]} rotation={[0.12, 0.16, -1.08]}>
      {/* 柄（木の棒）: 原点付近が握り位置 */}
      <mesh position={[0, -0.02, 0]}>
        <boxGeometry args={[0.07, 0.78, 0.07]} />
        <meshStandardMaterial color="#8B6914" roughness={0.85} />
      </mesh>
      <mesh position={[0, -0.18, 0]}>
        <boxGeometry args={[0.095, 0.18, 0.095]} />
        <meshStandardMaterial color="#6f4b18" roughness={0.88} />
      </mesh>
      {/* ピッケルヘッド（石の刃） */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[0.46, 0.09, 0.08]} />
        <meshStandardMaterial color="#777777" roughness={0.7} metalness={0.15} />
      </mesh>
      {/* ピッケルの先端（左） */}
      <mesh position={[-0.29, 0.33, 0]}>
        <boxGeometry args={[0.11, 0.07, 0.065]} />
        <meshStandardMaterial color="#666666" roughness={0.7} metalness={0.15} />
      </mesh>
      {/* ピッケルの先端（右） */}
      <mesh position={[0.29, 0.33, 0]}>
        <boxGeometry args={[0.11, 0.07, 0.065]} />
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
    <group position={[0.02, 0, -0.2]} rotation={[0.01, -0.04, -0.04]} scale={0.7}>
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
      {/* 肩当て */}
      <mesh position={[0, -0.01, 0.5]} rotation={[0.05, 0, 0]}>
        <boxGeometry args={[0.22, 0.2, 0.12]} />
        <meshStandardMaterial color="#3b302b" roughness={0.84} metalness={0.12} />
      </mesh>
      {/* トリガーグリップ */}
      <mesh position={[-0.02, -0.19, -0.18]} rotation={[-0.44, 0, 0]}>
        <boxGeometry args={[0.09, 0.24, 0.1]} />
        <meshStandardMaterial color="#2c2420" roughness={0.82} metalness={0.08} />
      </mesh>
      {/* 前方グリップ */}
      <mesh position={[0, -0.17, -0.43]} rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[0.075, 0.2, 0.1]} />
        <meshStandardMaterial color="#352a24" roughness={0.82} metalness={0.1} />
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
    <group position={[0.02, -0.02, -0.26]} rotation={[0.02, Math.PI - 0.04, -0.02]} scale={0.105}>
      <primitive object={model} />
    </group>
  );
}

/**
 * リモートプレイヤーの右手に武器を配置するコンポーネント
 * VoxelAvatar の右腕（position=[0.42, 0.85, 0]）にアタッチされる
 */
export function RemotePlayerWeapon({ equippedItem, isMoving, viewPitch }: RemotePlayerWeaponProps) {
  const groupRef = useRef<THREE.Group>(null);
  const clampedPitch = THREE.MathUtils.clamp(viewPitch, -MAX_REMOTE_AIM_PITCH, MAX_REMOTE_AIM_PITCH);
  const pose = getRemoteWeaponPose(equippedItem, clampedPitch);

  useFrame(() => {
    if (!groupRef.current) return;
    const bob = isMoving ? Math.sin(performance.now() * 0.008) * 0.025 : 0;
    groupRef.current.position.y = pose.anchor[1] + bob;
  });

  return (
    <group ref={groupRef} position={pose.anchor} rotation={pose.rotation}>
      {equippedItem === 'builder' && <PickaxeModel />}
      {equippedItem === 'rocket_launcher' && <RocketLauncherModel />}
      {equippedItem === 'machine_gun' && <MachineGunModel />}
    </group>
  );
}

// GLBモデルのプリロード
useGLTF.preload(MACHINE_GUN_MODEL_PATH);
