// ゾンビモブコンポーネント
// ボクセルスタイルの3Dモデル、AIで歩行、プレイヤーに接触するとダメージ

import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';

/** ゾンビの色定義 */
const ZOMBIE_BODY_COLOR = new THREE.Color(0x4a6741);    // 暗い緑（腐敗した肌）
const ZOMBIE_SHIRT_COLOR = new THREE.Color(0x3a5a6a);   // 暗い青（ボロ服）
const ZOMBIE_PANTS_COLOR = new THREE.Color(0x4a3a2a);   // 暗い茶（ズボン）
const ZOMBIE_EYE_COLOR = new THREE.Color(0xff2222);      // 赤い目
const ZOMBIE_DAMAGED_COLOR = new THREE.Color(0xff4444);  // ダメージ時

interface ZombieProps {
  mob: MobData;
  /** アニメーション時間（歩行用） */
  animTime: number;
}

export function Zombie({ mob, animTime }: ZombieProps) {
  const groupRef = useRef<THREE.Group>(null);

  // ダメージ中は赤くフラッシュ
  const isDamaged = mob.hitTimer > 0;

  // 歩行アニメーション
  const walkCycle = Math.sin(animTime * 6) * 0.4;
  const armSwing = Math.sin(animTime * 6) * 0.6;

  // 体の色（ダメージ中は赤）
  const bodyColor = isDamaged ? ZOMBIE_DAMAGED_COLOR : ZOMBIE_BODY_COLOR;
  const shirtColor = isDamaged ? ZOMBIE_DAMAGED_COLOR : ZOMBIE_SHIRT_COLOR;
  const pantsColor = isDamaged ? ZOMBIE_DAMAGED_COLOR : ZOMBIE_PANTS_COLOR;

  // マテリアルをメモ化
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.9 }), [bodyColor]);
  const shirtMat = useMemo(() => new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.9 }), [shirtColor]);
  const pantsMat = useMemo(() => new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.9 }), [pantsColor]);
  const eyeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: ZOMBIE_EYE_COLOR,
    emissive: ZOMBIE_EYE_COLOR,
    emissiveIntensity: 0.8,
  }), []);

  return (
    <group
      ref={groupRef}
      position={[mob.x, mob.y, mob.z]}
      rotation={[0, mob.rotation, 0]}
    >
      {/* 体（胴体） */}
      <mesh position={[0, 0.9, 0]} material={shirtMat}>
        <boxGeometry args={[0.5, 0.6, 0.3]} />
      </mesh>

      {/* 頭 */}
      <mesh position={[0, 1.45, 0]} material={bodyMat}>
        <boxGeometry args={[0.4, 0.4, 0.4]} />
      </mesh>

      {/* 目（左） */}
      <mesh position={[-0.1, 1.48, 0.21]} material={eyeMat}>
        <boxGeometry args={[0.08, 0.06, 0.02]} />
      </mesh>

      {/* 目（右） */}
      <mesh position={[0.1, 1.48, 0.21]} material={eyeMat}>
        <boxGeometry args={[0.08, 0.06, 0.02]} />
      </mesh>

      {/* 左腕（前に伸ばす） */}
      <group position={[-0.35, 0.9, 0]} rotation={[-1.2 + armSwing * 0.3, 0, 0]}>
        <mesh position={[0, -0.2, 0.15]} material={bodyMat}>
          <boxGeometry args={[0.2, 0.5, 0.2]} />
        </mesh>
      </group>

      {/* 右腕（前に伸ばす） */}
      <group position={[0.35, 0.9, 0]} rotation={[-1.2 - armSwing * 0.3, 0, 0]}>
        <mesh position={[0, -0.2, 0.15]} material={bodyMat}>
          <boxGeometry args={[0.2, 0.5, 0.2]} />
        </mesh>
      </group>

      {/* 左脚 */}
      <group position={[-0.12, 0.55, 0]} rotation={[walkCycle, 0, 0]}>
        <mesh position={[0, -0.25, 0]} material={pantsMat}>
          <boxGeometry args={[0.22, 0.5, 0.25]} />
        </mesh>
      </group>

      {/* 右脚 */}
      <group position={[0.12, 0.55, 0]} rotation={[-walkCycle, 0, 0]}>
        <mesh position={[0, -0.25, 0]} material={pantsMat}>
          <boxGeometry args={[0.22, 0.5, 0.25]} />
        </mesh>
      </group>

      {/* HPバー（頭上） */}
      {mob.hp < mob.maxHp && (
        <group position={[0, 1.85, 0]}>
          {/* 背景 */}
          <mesh>
            <planeGeometry args={[0.6, 0.08]} />
            <meshBasicMaterial color={0x222222} transparent opacity={0.8} side={THREE.DoubleSide} />
          </mesh>
          {/* HP量 */}
          <mesh position={[-(0.6 - 0.6 * (mob.hp / mob.maxHp)) / 2, 0, 0.001]}>
            <planeGeometry args={[0.6 * (mob.hp / mob.maxHp), 0.06]} />
            <meshBasicMaterial color={0x44cc44} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  );
}
