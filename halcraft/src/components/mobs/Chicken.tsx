// ニワトリモブコンポーネント
// 昼間にスポーンするパッシブモブ。ボクセルスタイルの3Dモデル
// 歩き回り、プレイヤーが近づくと逃げる

import { useMemo } from 'react';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';

/** ニワトリの色定義 */
const CHICKEN_BODY_COLOR = new THREE.Color(0xf5f5f0);    // 白い体
const CHICKEN_WING_COLOR = new THREE.Color(0xe8e8dd);     // 少し暗い白（翼）
const CHICKEN_BEAK_COLOR = new THREE.Color(0xff8800);     // オレンジのくちばし
const CHICKEN_COMB_COLOR = new THREE.Color(0xdd2222);     // 赤いトサカ
const CHICKEN_WATTLE_COLOR = new THREE.Color(0xcc1111);   // 赤い肉垂
const CHICKEN_LEG_COLOR = new THREE.Color(0xddaa22);      // 黄色い脚
const CHICKEN_EYE_COLOR = new THREE.Color(0x111111);      // 黒い目
const CHICKEN_DAMAGED_COLOR = new THREE.Color(0xff6666);  // ダメージ時

interface ChickenProps {
  mob: MobData;
  animTime: number;
}

export function Chicken({ mob, animTime }: ChickenProps) {
  const isDamaged = mob.hitTimer > 0;

  // 歩行アニメーション
  const isMoving = Math.abs(mob.vx) > 0.05 || Math.abs(mob.vz) > 0.05;
  const walkCycle = isMoving ? Math.sin(animTime * 8) * 0.3 : 0;
  // 首のボビング（つつく動作）
  const headBob = isMoving
    ? Math.sin(animTime * 8) * 0.1
    : Math.sin(animTime * 2) * 0.05;
  // 翼のパタパタ
  const wingFlap = isMoving
    ? Math.sin(animTime * 12) * 0.15
    : Math.sin(animTime * 1.5) * 0.03;

  const hitTilt = isDamaged ? Math.sin(mob.hitTimer * 20) * 0.15 : 0;

  const bodyColor = isDamaged ? CHICKEN_DAMAGED_COLOR : CHICKEN_BODY_COLOR;
  const wingColor = isDamaged ? CHICKEN_DAMAGED_COLOR : CHICKEN_WING_COLOR;

  // マテリアル
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.8 }), [bodyColor]);
  const wingMat = useMemo(() => new THREE.MeshStandardMaterial({ color: wingColor, roughness: 0.8 }), [wingColor]);
  const beakMat = useMemo(() => new THREE.MeshStandardMaterial({ color: CHICKEN_BEAK_COLOR, roughness: 0.7 }), []);
  const combMat = useMemo(() => new THREE.MeshStandardMaterial({ color: CHICKEN_COMB_COLOR, roughness: 0.6 }), []);
  const wattleMat = useMemo(() => new THREE.MeshStandardMaterial({ color: CHICKEN_WATTLE_COLOR, roughness: 0.6 }), []);
  const legMat = useMemo(() => new THREE.MeshStandardMaterial({ color: CHICKEN_LEG_COLOR, roughness: 0.7 }), []);
  const eyeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: CHICKEN_EYE_COLOR, roughness: 0.9 }), []);

  // HPバー
  const hpRatio = mob.hp / mob.maxHp;
  const hpColor = hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xcccc44 : 0xcc4444;

  return (
    <group
      position={[mob.x, mob.y, mob.z]}
      rotation={[0, mob.rotation, 0]}
    >
      <group rotation={[hitTilt, 0, hitTilt * 0.5]}>
        {/* 体（丸っこい楕円） */}
        <mesh position={[0, 0.35, 0]} material={bodyMat}>
          <boxGeometry args={[0.35, 0.3, 0.45]} />
        </mesh>

        {/* 頭 */}
        <group position={[0, 0.6, 0.18]} rotation={[headBob, 0, 0]}>
          <mesh material={bodyMat}>
            <boxGeometry args={[0.2, 0.2, 0.2]} />
          </mesh>
          {/* くちばし */}
          <mesh position={[0, -0.03, 0.12]} material={beakMat}>
            <boxGeometry args={[0.08, 0.05, 0.08]} />
          </mesh>
          {/* トサカ */}
          <mesh position={[0, 0.13, 0]} material={combMat}>
            <boxGeometry args={[0.04, 0.08, 0.12]} />
          </mesh>
          {/* 肉垂（あごの下） */}
          <mesh position={[0, -0.1, 0.06]} material={wattleMat}>
            <boxGeometry args={[0.04, 0.06, 0.04]} />
          </mesh>
          {/* 目（左） */}
          <mesh position={[-0.08, 0.02, 0.08]} material={eyeMat}>
            <boxGeometry args={[0.04, 0.04, 0.04]} />
          </mesh>
          {/* 目（右） */}
          <mesh position={[0.08, 0.02, 0.08]} material={eyeMat}>
            <boxGeometry args={[0.04, 0.04, 0.04]} />
          </mesh>
        </group>

        {/* 尾羽 */}
        <mesh position={[0, 0.45, -0.25]} rotation={[-0.3, 0, 0]} material={wingMat}>
          <boxGeometry args={[0.06, 0.15, 0.08]} />
        </mesh>

        {/* 左翼 */}
        <group position={[-0.2, 0.38, 0]} rotation={[0, 0, wingFlap]}>
          <mesh position={[-0.05, 0, 0]} material={wingMat}>
            <boxGeometry args={[0.1, 0.2, 0.3]} />
          </mesh>
        </group>

        {/* 右翼 */}
        <group position={[0.2, 0.38, 0]} rotation={[0, 0, -wingFlap]}>
          <mesh position={[0.05, 0, 0]} material={wingMat}>
            <boxGeometry args={[0.1, 0.2, 0.3]} />
          </mesh>
        </group>

        {/* 左脚 */}
        <group position={[-0.08, 0.15, 0]} rotation={[walkCycle, 0, 0]}>
          <mesh position={[0, -0.08, 0]} material={legMat}>
            <boxGeometry args={[0.04, 0.15, 0.04]} />
          </mesh>
        </group>

        {/* 右脚 */}
        <group position={[0.08, 0.15, 0]} rotation={[-walkCycle, 0, 0]}>
          <mesh position={[0, -0.08, 0]} material={legMat}>
            <boxGeometry args={[0.04, 0.15, 0.04]} />
          </mesh>
        </group>
      </group>

      {/* HPバー */}
      {mob.hp < mob.maxHp && (
        <Billboard position={[0, 0.9, 0]}>
          <mesh>
            <planeGeometry args={[0.4, 0.06]} />
            <meshBasicMaterial color={0x222222} transparent opacity={0.8} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[-(0.4 - 0.4 * hpRatio) / 2, 0, 0.001]}>
            <planeGeometry args={[0.4 * hpRatio, 0.04]} />
            <meshBasicMaterial color={hpColor} side={THREE.DoubleSide} />
          </mesh>
        </Billboard>
      )}
    </group>
  );
}
