// プロトタイプ味方モブコンポーネント
// Nomad Sculpt で作成した GLB モデルを使用

import { useRef, useMemo, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
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
  const hpBarRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(MODEL_PATH);
  const { camera } = useThree();

  // モデルのクローン（複数インスタンスに対応）
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    // マテリアルのクローン + depthWrite強制有効化（地面透過バグ修正）
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m) => {
            const cloned = m.clone();
            cloned.depthWrite = true;
            cloned.depthTest = true;
            cloned.transparent = false;
            return cloned;
          });
        } else {
          child.material = child.material.clone();
          child.material.depthWrite = true;
          child.material.depthTest = true;
          child.material.transparent = false;
        }
        // レンダリング順序を明示的に設定
        child.renderOrder = 0;
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
  const bobHeight = Math.sin(animTime * 2) * 0.05; // 上下の浮遊感（控えめに）

  // HPバーをカメラに向ける
  useFrame(() => {
    if (hpBarRef.current) {
      hpBarRef.current.lookAt(camera.position);
    }
  });

  // モデルのバウンディングボックスからスケールを計算
  // 原モデル: Yサイズ約7.5ユニット → ゲーム内で約3.6ユニット（2倍サイズ）
  const SCALE = 0.48;

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
        // モデルの中心を足元に合わせるオフセット（接地）
        // 原点がモデル中心にあるため、高さの半分を持ち上げる
        position={[0, 1.8, 0]}
      />



      {/* HPバー（頭上・ビルボード） */}
      {mob.hp < mob.maxHp && (
        <group ref={hpBarRef} position={[0, 3.9, 0]}>
          {/* 背景 */}
          <mesh>
            <planeGeometry args={[1.0, 0.1]} />
            <meshBasicMaterial color={0x222222} transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          {/* HP量 */}
          <mesh position={[-(1.0 - 1.0 * (mob.hp / mob.maxHp)) / 2, 0, 0.001]}>
            <planeGeometry args={[1.0 * (mob.hp / mob.maxHp), 0.08]} />
            <meshBasicMaterial
              color={mob.hp / mob.maxHp > 0.5 ? 0x44cc44 : mob.hp / mob.maxHp > 0.25 ? 0xcccc44 : 0xcc4444}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

// GLB のプリロード
useGLTF.preload(MODEL_PATH);
