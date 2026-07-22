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
  /** 近接スイング進行度 0-1 */
  meleeSwingProgress?: number;
  /** ライトセーバースイング進行度 0-1 */
  saberSwingProgress?: number;
  /** 機関銃リコイル 1=キック直後 → 0 */
  gunRecoilProgress?: number;
  /** ロケットリコイル 1=キック直後 → 0 */
  rocketRecoilProgress?: number;
  gloveActionProgress?: number;
  bombActionProgress?: number;
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
    case 'gravity_glove':
      return {
        anchor: [0.4, 1.05, -0.22],
        rotation: [0.9 + pitch * 0.35, 0, -0.1],
      };
    case 'bomb_slinger':
      return {
        anchor: [0.48, 0.82, -0.12],
        rotation: [0.2 + pitch * 0.2, 0.05, -0.2],
      };
    default:
      return {
        anchor: [0.42, 0.92, -0.18],
        rotation: [pitch * 0.35, 0, 0],
      };
  }
}

function GloveModel() {
  return (
    <group position={[0.05, 0, -0.05]} scale={0.9}>
      <mesh>
        <boxGeometry args={[0.22, 0.16, 0.26]} />
        <meshStandardMaterial color="#5a4a9a" roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.02, -0.12]}>
        <sphereGeometry args={[0.12, 10, 8]} />
        <meshStandardMaterial color="#7b6ad4" roughness={0.4} metalness={0.3} emissive="#9d8cff" emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

function BombSlingerModel() {
  return (
    <group position={[0.02, 0, -0.04]} scale={0.95}>
      <mesh>
        <boxGeometry args={[0.18, 0.14, 0.3]} />
        <meshStandardMaterial color="#5a3a2a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.06, 0.04]}>
        <sphereGeometry args={[0.09, 10, 8]} />
        <meshStandardMaterial color="#ff6a40" roughness={0.45} emissive="#ff4422" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
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
function swingOffsets(progress: number, power = 1): {
  pitch: number; roll: number; y: number; z: number; trail: number;
} {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  const smooth = (t: number) => {
    const x = THREE.MathUtils.clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  };
  if (p <= 0.01) return { pitch: 0, roll: 0, y: 0, z: 0, trail: 0 };
  if (p < 0.28) {
    const u = smooth(p / 0.28);
    return {
      pitch: -1.0 * u * power,
      roll: -0.5 * u * power,
      y: 0.12 * u,
      z: -0.06 * u,
      trail: 0.3 * u,
    };
  }
  if (p < 0.48) {
    const u = smooth((p - 0.28) / 0.2);
    return {
      pitch: THREE.MathUtils.lerp(-1.0, 1.2, u) * power,
      roll: THREE.MathUtils.lerp(-0.5, 0.75, u) * power,
      y: THREE.MathUtils.lerp(0.12, -0.1, u),
      z: THREE.MathUtils.lerp(-0.06, 0.16, u),
      trail: THREE.MathUtils.lerp(0.3, 1, u),
    };
  }
  if (p < 0.7) {
    const u = smooth((p - 0.48) / 0.22);
    return {
      pitch: THREE.MathUtils.lerp(1.2, 0.85, u) * power,
      roll: THREE.MathUtils.lerp(0.75, 0.4, u) * power,
      y: THREE.MathUtils.lerp(-0.1, -0.04, u),
      z: THREE.MathUtils.lerp(0.16, 0.08, u),
      trail: THREE.MathUtils.lerp(1, 0.45, u),
    };
  }
  const u = smooth((p - 0.7) / 0.3);
  return {
    pitch: THREE.MathUtils.lerp(0.85, 0, u) * power,
    roll: THREE.MathUtils.lerp(0.4, 0, u) * power,
    y: THREE.MathUtils.lerp(-0.04, 0, u),
    z: THREE.MathUtils.lerp(0.08, 0, u),
    trail: THREE.MathUtils.lerp(0.45, 0, u),
  };
}

export function RemotePlayerWeapon({
  equippedItem,
  isMoving,
  viewPitch,
  meleeSwingProgress = 0,
  saberSwingProgress = 0,
  gunRecoilProgress = 0,
  rocketRecoilProgress = 0,
  gloveActionProgress = 0,
  bombActionProgress = 0,
}: RemotePlayerWeaponProps) {
  const groupRef = useRef<THREE.Group>(null);
  const trailRef = useRef<THREE.Mesh>(null);
  const muzzleFlashRef = useRef<THREE.Mesh>(null);
  const clampedPitch = THREE.MathUtils.clamp(viewPitch, -MAX_REMOTE_AIM_PITCH, MAX_REMOTE_AIM_PITCH);
  const pose = getRemoteWeaponPose(equippedItem, clampedPitch);

  useFrame(() => {
    if (!groupRef.current) return;
    const activeSwing = Math.max(meleeSwingProgress, saberSwingProgress);
    const bob = isMoving && activeSwing < 0.01 && gunRecoilProgress < 0.05 && rocketRecoilProgress < 0.05
      ? Math.sin(performance.now() * 0.008) * 0.025
      : 0;

    let swingPitch = 0;
    let swingRoll = 0;
    let swingY = 0;
    let swingZ = 0;
    let trailAmt = 0;

    if (equippedItem === 'builder' && meleeSwingProgress > 0.01) {
      const s = swingOffsets(meleeSwingProgress, 1);
      swingPitch = s.pitch;
      swingRoll = s.roll;
      swingY = s.y;
      swingZ = s.z;
      trailAmt = s.trail;
    } else if (equippedItem === 'lightsaber' && saberSwingProgress > 0.01) {
      const s = swingOffsets(saberSwingProgress, 1.25);
      swingPitch = s.pitch;
      swingRoll = s.roll;
      swingY = s.y;
      swingZ = s.z;
      trailAmt = s.trail;
    } else if (equippedItem === 'machine_gun' && gunRecoilProgress > 0.02) {
      const kick = gunRecoilProgress * gunRecoilProgress;
      swingPitch = -kick * 0.22;
      swingY = kick * 0.03;
      swingZ = kick * 0.14;
      trailAmt = kick * 0.6;
    } else if (equippedItem === 'rocket_launcher' && rocketRecoilProgress > 0.02) {
      const kick = rocketRecoilProgress * rocketRecoilProgress;
      swingPitch = -kick * 0.55;
      swingY = kick * 0.06;
      swingZ = kick * 0.28;
      trailAmt = kick * 0.85;
    } else if (equippedItem === 'gravity_glove' && gloveActionProgress > 0.05) {
      const g = gloveActionProgress;
      swingPitch = g * 0.35;
      swingZ = -g * 0.12;
      trailAmt = g * 0.7;
    } else if (equippedItem === 'bomb_slinger' && bombActionProgress > 0.01) {
      const s = swingOffsets(bombActionProgress, 0.9);
      swingPitch = s.pitch;
      swingRoll = s.roll;
      swingY = s.y;
      swingZ = s.z;
      trailAmt = s.trail * 0.5;
    }

    groupRef.current.position.set(
      pose.anchor[0] + swingZ * 0.2,
      pose.anchor[1] + bob + swingY,
      pose.anchor[2] + swingZ,
    );
    groupRef.current.rotation.set(
      pose.rotation[0] + swingPitch,
      pose.rotation[1],
      pose.rotation[2] + swingRoll,
    );

    if (trailRef.current) {
      const mat = trailRef.current.material as THREE.MeshBasicMaterial;
      if (trailAmt > 0.05 && (equippedItem === 'builder' || equippedItem === 'lightsaber')) {
        trailRef.current.visible = true;
        mat.opacity = trailAmt * (equippedItem === 'lightsaber' ? 0.9 : 0.75);
        mat.color.set(equippedItem === 'lightsaber' ? '#66ffcc' : '#88d8ff');
        trailRef.current.scale.setScalar(0.7 + trailAmt * 0.7);
        trailRef.current.rotation.z = -0.6 + swingRoll;
      } else {
        trailRef.current.visible = false;
      }
    }

    if (muzzleFlashRef.current) {
      const mat = muzzleFlashRef.current.material as THREE.MeshBasicMaterial;
      const flash = equippedItem === 'machine_gun'
        ? gunRecoilProgress
        : equippedItem === 'rocket_launcher'
          ? rocketRecoilProgress
          : equippedItem === 'gravity_glove'
            ? gloveActionProgress
            : 0;
      if (flash > 0.08) {
        muzzleFlashRef.current.visible = true;
        mat.opacity = flash * (equippedItem === 'rocket_launcher' ? 0.95 : 0.8);
        const s = equippedItem === 'rocket_launcher'
          ? 0.35 + flash * 0.55
          : 0.18 + flash * 0.28;
        muzzleFlashRef.current.scale.setScalar(s);
      } else {
        muzzleFlashRef.current.visible = false;
      }
    }
  });

  return (
    <group ref={groupRef} position={pose.anchor} rotation={pose.rotation}>
      {equippedItem === 'builder' && (
        <>
          <PickaxeModel />
          <mesh ref={trailRef} position={[0.05, 0.2, -0.05]} visible={false}>
            <torusGeometry args={[0.28, 0.014, 6, 28, Math.PI * 1.1]} />
            <meshBasicMaterial
              color="#88d8ff"
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
            />
          </mesh>
        </>
      )}
      {equippedItem === 'rocket_launcher' && (
        <>
          <RocketLauncherModel />
          <mesh ref={muzzleFlashRef} position={[0.02, 0.02, -0.72]} visible={false}>
            <sphereGeometry args={[0.5, 12, 10]} />
            <meshBasicMaterial
              color="#ff9a40"
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </>
      )}
      {equippedItem === 'machine_gun' && (
        <>
          <MachineGunModel />
          <mesh ref={muzzleFlashRef} position={[0.02, 0.0, -0.55]} visible={false}>
            <sphereGeometry args={[0.35, 10, 8]} />
            <meshBasicMaterial
              color="#ffd080"
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </>
      )}
      {equippedItem === 'lightsaber' && (
        <>
          <LightsaberModel />
          <mesh ref={trailRef} position={[0.02, 0.35, -0.1]} visible={false}>
            <torusGeometry args={[0.42, 0.016, 6, 32, Math.PI * 1.2]} />
            <meshBasicMaterial
              color="#66ffcc"
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
            />
          </mesh>
        </>
      )}
      {equippedItem === 'gravity_glove' && (
        <>
          <GloveModel />
          <mesh ref={muzzleFlashRef} position={[0.05, 0.02, -0.28]} visible={false}>
            <sphereGeometry args={[0.2, 10, 8]} />
            <meshBasicMaterial
              color="#c8b8ff"
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </>
      )}
      {equippedItem === 'bomb_slinger' && <BombSlingerModel />}
    </group>
  );
}

// GLBモデルのプリロード
useGLTF.preload(MACHINE_GUN_MODEL_PATH);
