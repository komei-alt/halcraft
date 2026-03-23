// プロトタイプ味方モブコンポーネント
// Nomad Sculpt で作成した GLB モデルを使用

import { useRef, useMemo, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';

/** GLBモデルのパス */
const MODEL_PATH = '/models/prototype.glb';

/** ダメージ時の色 */
const DAMAGED_COLOR = new THREE.Color(0xff6666);

interface PrototypeProps {
  mob: MobData;
  animTime: number;
}

export function Prototype({ mob, animTime }: PrototypeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(MODEL_PATH);

  // モデルのクローン（複数インスタンスに対応）
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    // マテリアルのクローン（ダメージ表現で個別に変更するため）
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m) => m.clone());
        } else {
          child.material = child.material.clone();
        }
      }
    });
    return clone;
  }, [scene]);

  // 元のマテリアル色を保存
  const originalColors = useMemo(() => {
    const colors = new Map<string, THREE.Color>();
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat, i) => {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
            const key = `${child.uuid}-${i}`;
            colors.set(key, mat.color.clone());
          }
        });
      }
    });
    return colors;
  }, [clonedScene]);

  // ダメージ中判定
  const isDamaged = mob.hitTimer > 0;

  // ダメージ時に色を赤くする / 戻す
  useEffect(() => {
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat, i) => {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
            const key = `${child.uuid}-${i}`;
            if (isDamaged) {
              mat.color.copy(DAMAGED_COLOR);
            } else {
              const orig = originalColors.get(key);
              if (orig) {
                mat.color.copy(orig);
              }
            }
          }
        });
      }
    });
  }, [isDamaged, clonedScene, originalColors]);

  // アニメーション計算
  const bobHeight = Math.sin(animTime * 2) * 0.08; // 上下の浮遊感

  // モデルのバウンディングボックスからスケールを計算
  // 原モデル: Yサイズ約7.5ユニット → ゲーム内で約1.8ユニットにする
  const SCALE = 0.24;

  return (
    <group
      ref={groupRef}
      position={[mob.x, mob.y + bobHeight, mob.z]}
      rotation={[0, mob.rotation, 0]}
    >
      {/* GLB モデル */}
      <primitive
        object={clonedScene}
        scale={[SCALE, SCALE, SCALE]}
        // Nomad のモデルは Y 軸が下方向に伸びているので回転で調整
        rotation={[Math.PI, 0, 0]}
        // モデルの中心を足元に合わせるオフセット
        position={[0, 1.7, 0]}
      />

      {/* --- 味方インジケーター（名前バー + 緑のアイコン） --- */}
      <group position={[0, 3.2, 0]}>
        {/* 名前背景 */}
        <mesh>
          <planeGeometry args={[1.0, 0.15]} />
          <meshBasicMaterial color={0x000000} transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
        {/* 名前テキスト代わりのインジケーター */}
        <mesh position={[0, 0, 0.001]}>
          <planeGeometry args={[0.9, 0.1]} />
          <meshBasicMaterial color={0x44ff44} transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
        {/* ♥ ハートマーク（味方の証） */}
        <mesh position={[0.55, 0, 0.002]}>
          <planeGeometry args={[0.12, 0.12]} />
          <meshBasicMaterial color={0xff4488} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* HPバー（頭上） */}
      {mob.hp < mob.maxHp && (
        <group position={[0, 3.0, 0]}>
          {/* 背景 */}
          <mesh>
            <planeGeometry args={[0.8, 0.08]} />
            <meshBasicMaterial color={0x222222} transparent opacity={0.8} side={THREE.DoubleSide} />
          </mesh>
          {/* HP量 */}
          <mesh position={[-(0.8 - 0.8 * (mob.hp / mob.maxHp)) / 2, 0, 0.001]}>
            <planeGeometry args={[0.8 * (mob.hp / mob.maxHp), 0.06]} />
            <meshBasicMaterial color={0x44cc44} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// GLB のプリロード
useGLTF.preload(MODEL_PATH);
