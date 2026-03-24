// クモモブコンポーネント
// 夜間にスポーンする敵モブ。ゾンビより速く、体高が低い
// ボクセルスタイルの8本脚クモ

import { useMemo } from 'react';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';

/** クモの色定義 */
const SPIDER_BODY_COLOR = new THREE.Color(0x2a2a2a);     // 暗い黒（体）
const SPIDER_HEAD_COLOR = new THREE.Color(0x333333);      // 少し明るい黒（頭）
const SPIDER_LEG_COLOR = new THREE.Color(0x3a2a1a);       // 暗い茶（脚）
const SPIDER_EYE_COLOR = new THREE.Color(0xff0000);       // 赤い目
const SPIDER_DAMAGED_COLOR = new THREE.Color(0xff4444);   // ダメージ時

interface SpiderProps {
  mob: MobData;
  animTime: number;
}

export function Spider({ mob, animTime }: SpiderProps) {
  const isDamaged = mob.hitTimer > 0;

  // 歩行アニメーション（クモは脚が速く動く）
  const isMoving = Math.abs(mob.vx) > 0.1 || Math.abs(mob.vz) > 0.1;
  const walkCycle = isMoving ? animTime * 10 : animTime * 1.5;

  // 脚のアニメーション（4対の脚が交互に動く）
  const leg1 = Math.sin(walkCycle) * 0.3;
  const leg2 = Math.sin(walkCycle + Math.PI * 0.5) * 0.3;
  const leg3 = Math.sin(walkCycle + Math.PI) * 0.3;
  const leg4 = Math.sin(walkCycle + Math.PI * 1.5) * 0.3;

  const hitTilt = isDamaged ? Math.sin(mob.hitTimer * 20) * 0.1 : 0;

  const bodyColor = isDamaged ? SPIDER_DAMAGED_COLOR : SPIDER_BODY_COLOR;
  const headColor = isDamaged ? SPIDER_DAMAGED_COLOR : SPIDER_HEAD_COLOR;
  const legColor = isDamaged ? SPIDER_DAMAGED_COLOR : SPIDER_LEG_COLOR;

  // マテリアル
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7 }), [bodyColor]);
  const headMat = useMemo(() => new THREE.MeshStandardMaterial({ color: headColor, roughness: 0.7 }), [headColor]);
  const legMat = useMemo(() => new THREE.MeshStandardMaterial({ color: legColor, roughness: 0.8 }), [legColor]);
  const eyeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: SPIDER_EYE_COLOR,
    emissive: SPIDER_EYE_COLOR,
    emissiveIntensity: 0.8,
  }), []);

  // HPバー
  const hpRatio = mob.hp / mob.maxHp;
  const hpColor = hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xcccc44 : 0xcc4444;

  // 脚を生成するヘルパー
  const renderLeg = (side: number, zOffset: number, swing: number) => {
    const xDir = side > 0 ? 1 : -1;
    return (
      <group position={[xDir * 0.3, 0.2, zOffset]}>
        {/* 上脚（体から横に出る） */}
        <group rotation={[swing * 0.5, 0, xDir * (-0.8 + swing * 0.2)]}>
          <mesh position={[xDir * 0.15, 0.05, 0]} material={legMat}>
            <boxGeometry args={[0.3, 0.06, 0.06]} />
          </mesh>
          {/* 下脚（地面に向かう） */}
          <group position={[xDir * 0.3, 0, 0]} rotation={[0, 0, xDir * (1.2 + swing * 0.15)]}>
            <mesh position={[xDir * 0.12, -0.05, 0]} material={legMat}>
              <boxGeometry args={[0.25, 0.05, 0.05]} />
            </mesh>
          </group>
        </group>
      </group>
    );
  };

  return (
    <group
      position={[mob.x, mob.y, mob.z]}
      rotation={[0, mob.rotation, 0]}
    >
      <group rotation={[hitTilt, 0, hitTilt * 0.3]}>
        {/* 腹部（大きい後方の体） */}
        <mesh position={[0, 0.25, -0.15]} material={bodyMat}>
          <boxGeometry args={[0.5, 0.35, 0.5]} />
        </mesh>

        {/* 頭部（小さい前方） */}
        <mesh position={[0, 0.25, 0.25]} material={headMat}>
          <boxGeometry args={[0.35, 0.3, 0.3]} />
        </mesh>

        {/* 目（4対の赤い目 — 2列×2） */}
        {/* 上段 */}
        <mesh position={[-0.08, 0.32, 0.41]} material={eyeMat}>
          <boxGeometry args={[0.06, 0.06, 0.02]} />
        </mesh>
        <mesh position={[0.08, 0.32, 0.41]} material={eyeMat}>
          <boxGeometry args={[0.06, 0.06, 0.02]} />
        </mesh>
        {/* 下段 */}
        <mesh position={[-0.06, 0.24, 0.41]} material={eyeMat}>
          <boxGeometry args={[0.04, 0.04, 0.02]} />
        </mesh>
        <mesh position={[0.06, 0.24, 0.41]} material={eyeMat}>
          <boxGeometry args={[0.04, 0.04, 0.02]} />
        </mesh>

        {/* 8本の脚（左右4対） */}
        {/* 前脚（第1対） */}
        {renderLeg(1, 0.15, leg1)}
        {renderLeg(-1, 0.15, leg1)}
        {/* 第2対 */}
        {renderLeg(1, 0.0, leg2)}
        {renderLeg(-1, 0.0, leg2)}
        {/* 第3対 */}
        {renderLeg(1, -0.15, leg3)}
        {renderLeg(-1, -0.15, leg3)}
        {/* 後脚（第4対） */}
        {renderLeg(1, -0.3, leg4)}
        {renderLeg(-1, -0.3, leg4)}
      </group>

      {/* HPバー */}
      {mob.hp < mob.maxHp && (
        <Billboard position={[0, 0.7, 0]}>
          <mesh>
            <planeGeometry args={[0.5, 0.06]} />
            <meshBasicMaterial color={0x222222} transparent opacity={0.8} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[-(0.5 - 0.5 * hpRatio) / 2, 0, 0.001]}>
            <planeGeometry args={[0.5 * hpRatio, 0.04]} />
            <meshBasicMaterial color={hpColor} side={THREE.DoubleSide} />
          </mesh>
        </Billboard>
      )}
    </group>
  );
}
