// プロトタイプ味方モブコンポーネント
// Nomad Sculpt で作成した GLB モデルを使用

import { useRef, useMemo, useEffect } from 'react';
import { useGLTF, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';
import { computeGroundOffset } from '../../utils/autoGround';

/** GLBモデルのパス */
/** 最適化済みモデル（ポリゴン削減版）。元は prototype_original.glb にバックアップ */
const MODEL_PATH = '/models/prototype_optimized.glb';

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
  // 怒り状態判定
  const isAngry = mob.angryAtPlayer;

  /** 怒り時の色（赤みがかったオレンジ） */
  const ANGRY_TINT = useMemo(() => new THREE.Color(0xff6633), []);

  // ダメージ・怒り時に色を変更 / 戻す
  useEffect(() => {
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat, i) => {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
            const key = `${child.uuid}-${i}`;
            if (isDamaged) {
              mat.color.copy(DAMAGED_COLOR);
            } else if (isAngry) {
              mat.color.copy(ANGRY_TINT);
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
  }, [isDamaged, isAngry, clonedScene, originalColors, ANGRY_TINT]);

  // アニメーション計算
  const bobHeight = Math.sin(animTime * 2) * 0.05; // 上下の浮遊感（控えめに）

  // HPバーの色計算
  const hpRatio = mob.hp / mob.maxHp;

  // モデルのバウンディングボックスからスケールを計算
  // 原モデル: Yサイズ約7.5ユニット → ゲーム内で約3.6ユニット（2倍サイズ）
  const SCALE = 0.48;

  // 自動接地: GLBのバウンディングボックスからモデル底面をY=0に揃える
  const autoGroundY = useMemo(
    () => computeGroundOffset(scene, SCALE, MODEL_PATH),
    [scene],
  );

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
        // 自動接地によるオフセット
        position={[0, autoGroundY, 0]}
      />



      {/* HPバー（頭上・Billboard） */}
      {mob.hp < mob.maxHp && (
        <Billboard position={[0, 4.5, 0]}>
          {/* 背景 */}
          <mesh>
            <planeGeometry args={[1.0, 0.1]} />
            <meshBasicMaterial color={0x222222} transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          {/* HP量 */}
          <mesh position={[-(1.0 - 1.0 * hpRatio) / 2, 0, 0.001]}>
            <planeGeometry args={[1.0 * hpRatio, 0.08]} />
            <meshBasicMaterial
              color={hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xcccc44 : 0xcc4444}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </Billboard>
      )}
    </group>
  );
}

// GLB のプリロード
useGLTF.preload(MODEL_PATH);
