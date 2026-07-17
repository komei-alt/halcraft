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

const PICKAXE_HANDLE_GEOMETRY = new THREE.BoxGeometry(0.075, 0.78, 0.075);
const PICKAXE_GRIP_GEOMETRY = new THREE.BoxGeometry(0.1, 0.2, 0.1);
const PICKAXE_HEAD_GEOMETRY = new THREE.BoxGeometry(0.42, 0.1, 0.09);
const PICKAXE_POINT_GEOMETRY = new THREE.ConeGeometry(0.065, 0.24, 4);
const PICKAXE_SOCKET_GEOMETRY = new THREE.CylinderGeometry(0.07, 0.075, 0.14, 6);
const PICKAXE_WOOD_MATERIAL = new THREE.MeshStandardMaterial({ color: '#8b621e', roughness: 0.86 });
const PICKAXE_GRIP_MATERIAL = new THREE.MeshStandardMaterial({ color: '#5f3d16', roughness: 0.9 });
const PICKAXE_METAL_MATERIAL = new THREE.MeshStandardMaterial({ color: '#77818a', roughness: 0.5, metalness: 0.38 });

const ROCKET_TUBE_GEOMETRY = new THREE.CylinderGeometry(0.1, 0.12, 0.95, 12, 1, true);
const ROCKET_INNER_GEOMETRY = new THREE.CylinderGeometry(0.078, 0.078, 0.08, 12, 1, true);
const ROCKET_RING_GEOMETRY = new THREE.TorusGeometry(0.12, 0.022, 6, 12);
const ROCKET_REAR_GEOMETRY = new THREE.ConeGeometry(0.16, 0.22, 10, 1, true);
const ROCKET_FRAME_GEOMETRY = new THREE.BoxGeometry(0.18, 0.06, 0.7);
const ROCKET_STOCK_GEOMETRY = new THREE.BoxGeometry(0.22, 0.2, 0.12);
const ROCKET_GRIP_GEOMETRY = new THREE.BoxGeometry(0.09, 0.24, 0.1);
const ROCKET_BODY_MATERIAL = new THREE.MeshStandardMaterial({ color: '#565047', roughness: 0.68, metalness: 0.28 });
const ROCKET_DARK_MATERIAL = new THREE.MeshStandardMaterial({ color: '#211f1e', roughness: 0.5, metalness: 0.48 });
const ROCKET_GRIP_MATERIAL = new THREE.MeshStandardMaterial({ color: '#372a23', roughness: 0.86, metalness: 0.06 });

const SABER_HILT_GEOMETRY = new THREE.CylinderGeometry(0.045, 0.04, 0.38, 8);
const SABER_GRIP_GEOMETRY = new THREE.CylinderGeometry(0.052, 0.052, 0.2, 8);
const SABER_RING_GEOMETRY = new THREE.TorusGeometry(0.055, 0.009, 6, 12);
const SABER_BLADE_GEOMETRY = new THREE.CylinderGeometry(0.022, 0.018, 1.15, 8);
const SABER_GLOW_GEOMETRY = new THREE.CylinderGeometry(0.058, 0.045, 1.15, 8);
const SABER_METAL_MATERIAL = new THREE.MeshStandardMaterial({ color: '#9da5ad', roughness: 0.3, metalness: 0.78 });
const SABER_GRIP_MATERIAL = new THREE.MeshStandardMaterial({ color: '#30343a', roughness: 0.62, metalness: 0.42 });
const SABER_CORE_MATERIAL = new THREE.MeshBasicMaterial({ color: '#efffff', toneMapped: false });
const SABER_GLOW_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#55ddff',
  transparent: true,
  opacity: 0.38,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});

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
    case 'lightsaber':
      return {
        anchor: [0.34, 1.02, -0.28],
        rotation: [-0.42 + pitch * 0.64, 0, -0.14],
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
      <mesh geometry={PICKAXE_HANDLE_GEOMETRY} material={PICKAXE_WOOD_MATERIAL} position={[0, -0.02, 0]} dispose={null} />
      <mesh geometry={PICKAXE_GRIP_GEOMETRY} material={PICKAXE_GRIP_MATERIAL} position={[0, -0.18, 0]} dispose={null} />
      <mesh geometry={PICKAXE_HEAD_GEOMETRY} material={PICKAXE_METAL_MATERIAL} position={[0, 0.35, 0]} dispose={null} />
      {/* 四角錐の刃先で、遠目にもピッケルらしい湾曲輪郭を作る */}
      <mesh
        geometry={PICKAXE_POINT_GEOMETRY}
        material={PICKAXE_METAL_MATERIAL}
        position={[-0.31, 0.33, 0]}
        rotation={[0, 0, Math.PI / 2]}
        dispose={null}
      />
      <mesh
        geometry={PICKAXE_POINT_GEOMETRY}
        material={PICKAXE_METAL_MATERIAL}
        position={[0.31, 0.33, 0]}
        rotation={[0, 0, -Math.PI / 2]}
        dispose={null}
      />
      <mesh geometry={PICKAXE_SOCKET_GEOMETRY} material={PICKAXE_GRIP_MATERIAL} position={[0, 0.3, 0]} dispose={null} />
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
      <mesh geometry={ROCKET_TUBE_GEOMETRY} material={ROCKET_BODY_MATERIAL} rotation={[Math.PI / 2, 0, 0]} dispose={null} />
      <mesh geometry={ROCKET_RING_GEOMETRY} material={ROCKET_DARK_MATERIAL} position={[0, 0, -0.48]} dispose={null} />
      <mesh
        geometry={ROCKET_INNER_GEOMETRY}
        material={ROCKET_DARK_MATERIAL}
        position={[0, 0, -0.53]}
        rotation={[Math.PI / 2, 0, 0]}
        dispose={null}
      />
      {/* 後部を開いた排気フレアにし、前後を一目で判別できるようにする */}
      <mesh
        geometry={ROCKET_REAR_GEOMETRY}
        material={ROCKET_DARK_MATERIAL}
        position={[0, 0, 0.52]}
        rotation={[-Math.PI / 2, 0, 0]}
        dispose={null}
      />
      {/* 下部フレーム */}
      <mesh geometry={ROCKET_FRAME_GEOMETRY} material={ROCKET_DARK_MATERIAL} position={[0, -0.06, 0]} dispose={null} />
      {/* 肩当て */}
      <mesh geometry={ROCKET_STOCK_GEOMETRY} material={ROCKET_GRIP_MATERIAL} position={[0, -0.01, 0.5]} rotation={[0.05, 0, 0]} dispose={null} />
      {/* トリガーグリップ */}
      <mesh geometry={ROCKET_GRIP_GEOMETRY} material={ROCKET_GRIP_MATERIAL} position={[-0.02, -0.19, -0.18]} rotation={[-0.44, 0, 0]} dispose={null} />
      {/* 前方グリップ */}
      <mesh geometry={ROCKET_GRIP_GEOMETRY} material={ROCKET_GRIP_MATERIAL} position={[0, -0.17, -0.43]} scale={[0.84, 0.84, 1]} rotation={[-0.2, 0, 0]} dispose={null} />
    </group>
  );
}

/** 第三者視点用の軽量ライトセイバー。光源と軌跡は持たず5drawに固定する。 */
function LightsaberModel() {
  return (
    <group position={[0.02, 0, -0.18]}>
      <mesh geometry={SABER_HILT_GEOMETRY} material={SABER_METAL_MATERIAL} rotation={[Math.PI / 2, 0, 0]} dispose={null} />
      <mesh geometry={SABER_GRIP_GEOMETRY} material={SABER_GRIP_MATERIAL} position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]} dispose={null} />
      <mesh geometry={SABER_RING_GEOMETRY} material={SABER_METAL_MATERIAL} position={[0, 0, -0.22]} dispose={null} />
      <mesh geometry={SABER_BLADE_GEOMETRY} material={SABER_CORE_MATERIAL} position={[0, 0, -0.79]} rotation={[Math.PI / 2, 0, 0]} dispose={null} />
      <mesh geometry={SABER_GLOW_GEOMETRY} material={SABER_GLOW_MATERIAL} position={[0, 0, -0.79]} rotation={[Math.PI / 2, 0, 0]} dispose={null} />
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
      {equippedItem === 'lightsaber' && <LightsaberModel />}
    </group>
  );
}

// GLBモデルのプリロード
useGLTF.preload(MACHINE_GUN_MODEL_PATH);
