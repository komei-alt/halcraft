// アイアンゴーレム味方モブコンポーネント
// SPAWNERブロックから召喚される鉄の巨人
// マイクラ風のボクセルキャラ（鉄テクスチャ使用）
// プレイヤーを守るためにゾンビ・クモなどの敵モブを自動で攻撃する

import { useRef, useMemo, useEffect } from 'react';
import { Billboard, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';

/** ダメージ時の色 */
const DAMAGED_COLOR = new THREE.Color(0xff6666);
/** 通常の鉄色 */
const NORMAL_COLOR = new THREE.Color(0xcccccc);

/** ボディパーツの定義 */
interface BodyPart {
  /** パーツ名（デバッグ用） */
  name: string;
  /** サイズ [幅, 高さ, 奥行] */
  size: [number, number, number];
  /** 位置 [x, y, z]（足元が原点） */
  position: [number, number, number];
}

/** アイアンゴーレムのボディパーツ定義 */
const BODY_PARTS: BodyPart[] = [
  // 頭（小さめの四角い頭）
  { name: 'head', size: [0.7, 0.6, 0.7], position: [0, 2.8, 0] },
  // 胴体（大きく幅広い）
  { name: 'body', size: [1.2, 1.2, 0.7], position: [0, 1.8, 0] },
  // 左腕（長い）
  { name: 'leftArm', size: [0.4, 1.4, 0.4], position: [-0.8, 1.7, 0] },
  // 右腕（長い）
  { name: 'rightArm', size: [0.4, 1.4, 0.4], position: [0.8, 1.7, 0] },
  // 左脚
  { name: 'leftLeg', size: [0.5, 1.0, 0.5], position: [-0.3, 0.5, 0] },
  // 右脚
  { name: 'rightLeg', size: [0.5, 1.0, 0.5], position: [0.3, 0.5, 0] },
];

/** 腕のアニメーション対象インデックス */
const LEFT_ARM_INDEX = 2;
const RIGHT_ARM_INDEX = 3;
const LEFT_LEG_INDEX = 4;
const RIGHT_LEG_INDEX = 5;

interface IronGolemProps {
  mob: MobData;
  animTime: number;
}

export function IronGolem({ mob, animTime }: IronGolemProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);

  // 鉄テクスチャをロード
  const ironTexture = useTexture('/textures/blocks/iron.png');

  // テクスチャ設定（ピクセルアート風）
  useMemo(() => {
    ironTexture.magFilter = THREE.NearestFilter;
    ironTexture.minFilter = THREE.NearestFilter;
    ironTexture.wrapS = THREE.RepeatWrapping;
    ironTexture.wrapT = THREE.RepeatWrapping;
  }, [ironTexture]);

  // ダメージ中判定
  const isDamaged = mob.hitTimer > 0;

  // 歩行アニメーション計算
  const isMoving = Math.abs(mob.vx) > 0.1 || Math.abs(mob.vz) > 0.1;
  const walkSpeed = 3;
  const walkAmplitude = 0.4; // 腕の振り幅
  const walkCycle = isMoving ? Math.sin(animTime * walkSpeed) : 0;

  // ダメージ時に色を変更
  useEffect(() => {
    meshRefs.current.forEach((mesh) => {
      if (!mesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (isDamaged) {
        mat.color.copy(DAMAGED_COLOR);
      } else {
        mat.color.copy(NORMAL_COLOR);
      }
    });
  }, [isDamaged]);

  // HPバーの色計算
  const hpRatio = mob.hp / mob.maxHp;

  // 上下の浮遊感（控えめ）
  const bobHeight = isMoving ? Math.sin(animTime * 4) * 0.03 : 0;

  return (
    <group
      ref={groupRef}
      position={[mob.x, mob.y + bobHeight, mob.z]}
      rotation={[0, mob.rotation, 0]}
    >
      {/* ボディパーツ */}
      {BODY_PARTS.map((part, index) => {
        // 腕と脚のアニメーション回転を計算
        let rotationX = 0;
        if (index === LEFT_ARM_INDEX) {
          rotationX = walkCycle * walkAmplitude;
        } else if (index === RIGHT_ARM_INDEX) {
          rotationX = -walkCycle * walkAmplitude;
        } else if (index === LEFT_LEG_INDEX) {
          rotationX = -walkCycle * walkAmplitude * 0.6;
        } else if (index === RIGHT_LEG_INDEX) {
          rotationX = walkCycle * walkAmplitude * 0.6;
        }

        return (
          <mesh
            key={part.name}
            ref={(el) => { meshRefs.current[index] = el; }}
            position={part.position}
            rotation={[rotationX, 0, 0]}
          >
            <boxGeometry args={part.size} />
            <meshStandardMaterial
              map={ironTexture}
              color={NORMAL_COLOR}
              roughness={0.7}
              metalness={0.3}
            />
          </mesh>
        );
      })}

      {/* 目（赤く光る） */}
      <mesh position={[-0.15, 2.85, 0.36]}>
        <boxGeometry args={[0.12, 0.08, 0.02]} />
        <meshStandardMaterial
          color={0xff4444}
          emissive={new THREE.Color(0xff2222)}
          emissiveIntensity={2.0}
        />
      </mesh>
      <mesh position={[0.15, 2.85, 0.36]}>
        <boxGeometry args={[0.12, 0.08, 0.02]} />
        <meshStandardMaterial
          color={0xff4444}
          emissive={new THREE.Color(0xff2222)}
          emissiveIntensity={2.0}
        />
      </mesh>

      {/* 鼻（マイクラのアイアンゴーレム風） */}
      <mesh position={[0, 2.7, 0.4]}>
        <boxGeometry args={[0.15, 0.25, 0.15]} />
        <meshStandardMaterial
          map={ironTexture}
          color={0xaaaaaa}
          roughness={0.8}
        />
      </mesh>

      {/* HPバー（頭上・Billboard） */}
      {mob.hp < mob.maxHp && (
        <Billboard position={[0, 3.6, 0]}>
          {/* 背景 */}
          <mesh>
            <planeGeometry args={[1.2, 0.12]} />
            <meshBasicMaterial color={0x222222} transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          {/* HP量 */}
          <mesh position={[-(1.2 - 1.2 * hpRatio) / 2, 0, 0.001]}>
            <planeGeometry args={[1.2 * hpRatio, 0.1]} />
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
