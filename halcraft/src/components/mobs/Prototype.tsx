// プロトタイプ味方モブコンポーネント
// ジョーカー帽子＋蜘蛛のボディを持つ味方キャラクター
// プレイヤーより大きいサイズ、雲のような足でふわふわ歩く

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';

/** プロトタイプの色定義 */
// ジョーカー帽子の色
const HAT_BLUE = new THREE.Color(0x1a1a8f);      // 濃い青（帽子中央）
const HAT_RED = new THREE.Color(0x8b1a1a);        // 濃い赤（帽子左）
const HAT_YELLOW = new THREE.Color(0xdaa520);     // 金色（帽子右）
const HAT_BALL = new THREE.Color(0xffd700);       // 帽子先端のボール

// 顔の色
const SKULL_COLOR = new THREE.Color(0xe8e0d0);    // スカルの白（少しクリーム）
const EYE_GOLD = new THREE.Color(0xb8860b);       // 金色の目
const EYE_BLACK = new THREE.Color(0x111111);      // 黒い目
const TEETH_COLOR = new THREE.Color(0xf5e6c8);    // 歯の色

// ボディの色
const SHIRT_COLOR = new THREE.Color(0x4a6e8a);    // 青いシャツ
const COLLAR_COLOR = new THREE.Color(0x111111);   // 黒い蝶ネクタイ
const COLLAR_RED = new THREE.Color(0xcc2222);     // 蝶ネクタイの赤アクセント

// 蜘蛛ボディ
const SPIDER_BODY = new THREE.Color(0x8b4513);    // 蜘蛛の腹部（茶色）
const SPIDER_GLOW = new THREE.Color(0xdaa520);    // 光る腹部
const SPIDER_DARK = new THREE.Color(0x222222);    // 蜘蛛の暗い部分
const SKELETON_COLOR = new THREE.Color(0x808080); // 骨格パターン

// 脚の色
const LEG_COLOR = new THREE.Color(0x1a1a1a);      // 黒い蜘蛛脚
const PINK_ACCENT = new THREE.Color(0xffaacc);    // ピンクの装飾
const BLUE_ACCENT = new THREE.Color(0x3366ff);    // 青の装飾
const YELLOW_ACCENT = new THREE.Color(0xffcc00);  // 黄色の装飾

// 味方のダメージ色
const DAMAGED_COLOR = new THREE.Color(0xff6666);

interface PrototypeProps {
  mob: MobData;
  animTime: number;
}

export function Prototype({ mob, animTime }: PrototypeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  // ダメージ中判定
  const isDamaged = mob.hitTimer > 0;

  // アニメーション計算
  const bobHeight = Math.sin(animTime * 2) * 0.08;       // 上下の浮遊感
  const bodySwing = Math.sin(animTime * 1.5) * 0.03;     // 体の微揺れ
  const hatJiggle = Math.sin(animTime * 2.5) * 0.05;     // 帽子の揺れ
  const glowPulse = 0.5 + Math.sin(animTime * 3) * 0.3;  // 腹部の発光パルス

  // 各脚のアニメーション（8本の脚、位相をずらして波のように動く）
  const legPhases = useMemo(() => [0, 0.8, 1.6, 2.4, 0.4, 1.2, 2.0, 2.8], []);

  // 腹部の発光アニメーション
  useFrame(() => {
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = glowPulse;
    }
  });

  // === マテリアル ===
  const hatBlueMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: isDamaged ? DAMAGED_COLOR : HAT_BLUE, roughness: 0.6, metalness: 0.1,
  }), [isDamaged]);
  const hatRedMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: isDamaged ? DAMAGED_COLOR : HAT_RED, roughness: 0.6, metalness: 0.1,
  }), [isDamaged]);
  const hatYellowMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: isDamaged ? DAMAGED_COLOR : HAT_YELLOW, roughness: 0.6, metalness: 0.1,
  }), [isDamaged]);
  const hatBallMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: HAT_BALL, roughness: 0.3, metalness: 0.3,
    emissive: HAT_BALL, emissiveIntensity: 0.3,
  }), []);

  const skullMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: isDamaged ? DAMAGED_COLOR : SKULL_COLOR, roughness: 0.7,
  }), [isDamaged]);
  const eyeGoldMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: EYE_GOLD, emissive: EYE_GOLD, emissiveIntensity: 0.5,
  }), []);
  const eyeBlackMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: EYE_BLACK, roughness: 1.0,
  }), []);
  const teethMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: TEETH_COLOR, roughness: 0.5,
  }), []);

  const shirtMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: isDamaged ? DAMAGED_COLOR : SHIRT_COLOR, roughness: 0.8,
  }), [isDamaged]);
  const collarMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: COLLAR_COLOR, roughness: 0.9,
  }), []);
  const collarRedMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: COLLAR_RED, roughness: 0.7, emissive: COLLAR_RED, emissiveIntensity: 0.2,
  }), []);

  const spiderBodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: isDamaged ? DAMAGED_COLOR : SPIDER_BODY, roughness: 0.7, metalness: 0.1,
  }), [isDamaged]);
  const spiderGlowMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: SPIDER_GLOW, emissive: SPIDER_GLOW, emissiveIntensity: glowPulse,
    roughness: 0.4, metalness: 0.2, transparent: true, opacity: 0.9,
  }), [glowPulse]);
  const spiderDarkMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: SPIDER_DARK, roughness: 0.9,
  }), []);
  const skeletonMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: SKELETON_COLOR, roughness: 0.8, metalness: 0.2,
  }), []);

  const legMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: isDamaged ? DAMAGED_COLOR : LEG_COLOR, roughness: 0.9,
  }), [isDamaged]);
  const pinkMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: PINK_ACCENT, roughness: 0.6, emissive: PINK_ACCENT, emissiveIntensity: 0.2,
  }), []);
  const blueMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: BLUE_ACCENT, roughness: 0.6, emissive: BLUE_ACCENT, emissiveIntensity: 0.2,
  }), []);
  const yellowMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: YELLOW_ACCENT, roughness: 0.6, emissive: YELLOW_ACCENT, emissiveIntensity: 0.2,
  }), []);

  // 細い腕のマテリアル（蜘蛛の手のようなワイヤー型の腕）
  const armWireMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: SKELETON_COLOR, roughness: 0.6, metalness: 0.3,
  }), []);
  const jointMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x111111), roughness: 0.8,
  }), []);

  // スケール: プレイヤーと同程度（視界を遮らないサイズ）
  const SCALE = 0.7;

  return (
    <group
      ref={groupRef}
      position={[mob.x, mob.y + bobHeight, mob.z]}
      rotation={[0, mob.rotation, 0]}
      scale={[SCALE, SCALE, SCALE]}
    >
      {/* ============================================= */}
      {/* 上半身 — ジョーカー部分 */}
      {/* ============================================= */}

      {/* --- 頭（スカル） --- */}
      <mesh position={[0, 2.2 + hatJiggle * 0.5, 0]} material={skullMat}>
        <sphereGeometry args={[0.35, 12, 12]} />
      </mesh>

      {/* 左目（金色） */}
      <mesh position={[-0.12, 2.25 + hatJiggle * 0.5, 0.3]} material={eyeGoldMat}>
        <sphereGeometry args={[0.09, 8, 8]} />
      </mesh>
      {/* 左目の瞳 */}
      <mesh position={[-0.12, 2.25 + hatJiggle * 0.5, 0.37]} material={eyeBlackMat}>
        <sphereGeometry args={[0.04, 6, 6]} />
      </mesh>

      {/* 右目（黒） */}
      <mesh position={[0.12, 2.25 + hatJiggle * 0.5, 0.3]} material={eyeBlackMat}>
        <sphereGeometry args={[0.09, 8, 8]} />
      </mesh>

      {/* 歯（ニヤリとした笑顔） */}
      <group position={[0, 2.08 + hatJiggle * 0.5, 0.28]}>
        {/* 歯を横一列に並べる */}
        {[-0.14, -0.1, -0.06, -0.02, 0.02, 0.06, 0.1, 0.14].map((tx, i) => (
          <mesh key={`tooth-${i}`} position={[tx, 0, 0]} material={teethMat}>
            <boxGeometry args={[0.035, 0.05, 0.04]} />
          </mesh>
        ))}
      </group>

      {/* --- ジョーカー帽子（三又） --- */}
      <group position={[0, 2.55 + hatJiggle, 0]}>
        {/* 帽子ベース（頭の上のリング） */}
        <mesh material={hatBlueMat}>
          <cylinderGeometry args={[0.35, 0.38, 0.08, 12]} />
        </mesh>

        {/* 中央の青い帽子角 */}
        <group rotation={[0, 0, hatJiggle * 2]}>
          <mesh position={[0, 0.35, 0]} material={hatBlueMat}>
            <coneGeometry args={[0.15, 0.7, 8]} />
          </mesh>
          {/* 先端のボール */}
          <mesh position={[0, 0.73, 0]} material={hatBallMat}>
            <sphereGeometry args={[0.06, 8, 8]} />
          </mesh>
        </group>

        {/* 左の赤い帽子角 */}
        <group rotation={[0, 0, 0.6 + hatJiggle * 1.5]}>
          <mesh position={[-0.15, 0.25, 0]} material={hatRedMat} rotation={[0, 0, 0.3]}>
            <coneGeometry args={[0.12, 0.55, 8]} />
          </mesh>
          <mesh position={[-0.35, 0.5, 0]} material={hatBallMat}>
            <sphereGeometry args={[0.05, 8, 8]} />
          </mesh>
        </group>

        {/* 右の黄色い帽子角 */}
        <group rotation={[0, 0, -0.6 - hatJiggle * 1.5]}>
          <mesh position={[0.15, 0.25, 0]} material={hatYellowMat} rotation={[0, 0, -0.3]}>
            <coneGeometry args={[0.12, 0.55, 8]} />
          </mesh>
          <mesh position={[0.35, 0.5, 0]} material={hatBallMat}>
            <sphereGeometry args={[0.05, 8, 8]} />
          </mesh>
        </group>
      </group>

      {/* --- 首周り（襟・蝶ネクタイ） --- */}
      <mesh position={[0, 1.92, 0.05]} material={collarMat}>
        <boxGeometry args={[0.4, 0.15, 0.15]} />
      </mesh>
      {/* 蝶ネクタイの赤い三角 */}
      <mesh position={[0, 1.92, 0.15]} material={collarRedMat}>
        <coneGeometry args={[0.06, 0.1, 4]} />
      </mesh>

      {/* --- 胴体（細い上半身） --- */}
      <mesh position={[0, 1.7, 0]} material={shirtMat}>
        <boxGeometry args={[0.35, 0.35, 0.25]} />
      </mesh>

      {/* --- 細いウエスト（上半身と蜘蛛ボディの接続部） --- */}
      <mesh position={[0, 1.45, 0]} material={shirtMat}>
        <cylinderGeometry args={[0.08, 0.15, 0.2, 8]} />
      </mesh>

      {/* --- 蜘蛛のような腕（左右） --- */}
      {/* 左腕 */}
      <group position={[-0.25, 1.75, 0]} rotation={[0, 0, 0.3 + bodySwing]}>
        {/* 上腕 */}
        <mesh position={[-0.15, -0.05, 0]} material={armWireMat} rotation={[0, 0, 0.5]}>
          <cylinderGeometry args={[0.025, 0.025, 0.35, 6]} />
        </mesh>
        {/* 肘関節 */}
        <mesh position={[-0.3, -0.1, 0]} material={jointMat}>
          <sphereGeometry args={[0.04, 6, 6]} />
        </mesh>
        {/* 前腕 */}
        <mesh position={[-0.42, -0.18, 0]} material={armWireMat} rotation={[0, 0, 0.8]}>
          <cylinderGeometry args={[0.02, 0.02, 0.3, 6]} />
        </mesh>
        {/* 手関節 */}
        <mesh position={[-0.52, -0.28, 0]} material={jointMat}>
          <sphereGeometry args={[0.035, 6, 6]} />
        </mesh>
        {/* 蜘蛛の手（指を放射状に） */}
        {[0, 1, 2, 3, 4].map((fi) => {
          const fa = ((fi / 5) * Math.PI - Math.PI * 0.4);
          return (
            <mesh key={`lf-${fi}`} position={[
              -0.52 + Math.cos(fa) * 0.12,
              -0.28 + Math.sin(fa) * 0.08,
              (fi - 2) * 0.03,
            ]} material={armWireMat} rotation={[0, 0, fa]}>
              <cylinderGeometry args={[0.01, 0.008, 0.12, 4]} />
            </mesh>
          );
        })}
      </group>

      {/* 右腕 */}
      <group position={[0.25, 1.75, 0]} rotation={[0, 0, -0.3 - bodySwing]}>
        <mesh position={[0.15, -0.05, 0]} material={armWireMat} rotation={[0, 0, -0.5]}>
          <cylinderGeometry args={[0.025, 0.025, 0.35, 6]} />
        </mesh>
        <mesh position={[0.3, -0.1, 0]} material={jointMat}>
          <sphereGeometry args={[0.04, 6, 6]} />
        </mesh>
        <mesh position={[0.42, -0.18, 0]} material={armWireMat} rotation={[0, 0, -0.8]}>
          <cylinderGeometry args={[0.02, 0.02, 0.3, 6]} />
        </mesh>
        <mesh position={[0.52, -0.28, 0]} material={jointMat}>
          <sphereGeometry args={[0.035, 6, 6]} />
        </mesh>
        {[0, 1, 2, 3, 4].map((fi) => {
          const fa = -((fi / 5) * Math.PI - Math.PI * 0.4);
          return (
            <mesh key={`rf-${fi}`} position={[
              0.52 + Math.cos(fa) * 0.12,
              -0.28 + Math.sin(fa) * 0.08,
              (fi - 2) * 0.03,
            ]} material={armWireMat} rotation={[0, 0, fa]}>
              <cylinderGeometry args={[0.01, 0.008, 0.12, 4]} />
            </mesh>
          );
        })}
      </group>

      {/* ============================================= */}
      {/* 下半身 — 蜘蛛ボディ部分 */}
      {/* ============================================= */}

      {/* --- メインボディ（蜘蛛の腹部） --- */}
      <group position={[0, 1.1, 0]}>
        {/* 外殻（暗い部分） */}
        <mesh material={spiderBodyMat}>
          <sphereGeometry args={[0.5, 12, 10]} />
        </mesh>

        {/* 光る中心部分 */}
        <mesh ref={glowRef} material={spiderGlowMat} scale={[0.85, 0.8, 0.85]}>
          <sphereGeometry args={[0.5, 12, 10]} />
        </mesh>

        {/* 骨格パターン（縦のライン） */}
        {[-0.08, -0.03, 0.03, 0.08].map((bx, i) => (
          <mesh key={`bone-${i}`} position={[bx, 0.05, 0.42]} material={skeletonMat}>
            <boxGeometry args={[0.03, 0.3, 0.03]} />
          </mesh>
        ))}
        {/* 骨格横のライン */}
        {[-0.1, 0, 0.1].map((by, i) => (
          <mesh key={`boneh-${i}`} position={[0, by + 0.05, 0.42]} material={skeletonMat}>
            <boxGeometry args={[0.22, 0.025, 0.03]} />
          </mesh>
        ))}
      </group>

      {/* --- 蜘蛛の脚（8本、360度放射状配置） --- */}
      {/* 脚の原点を蜘蛛腹部の中心に配置 */}
      <group position={[0, 1.1, 0]}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const phase = legPhases[i];
          const legAnim = Math.sin(animTime * 3 + phase) * 0.15;

          // 45度間隔で放射配置（前方向を避けて左右・後ろに偏る蜘蛛配置）
          // 前右45°、右90°、後右135°、後180°、後左225°、左270°、前左315°、前0°
          const radialAngle = (i * Math.PI * 2) / 8 + Math.PI / 8; // 22.5度オフセット

          // 脚のパラメータ
          const upperLen = 0.7;    // 上肢の長さ（外斜め上に伸びる）
          const lowerLen = 1.0;    // 下肢の長さ（関節から地面へ）
          const upperAngle = 0.5;  // 上肢の持ち上げ角度（水平=0、上向き=正）

          // 脚の付け根位置を腹部表面（半径0.45の球面上）に配置
          const attachX = Math.sin(radialAngle) * 0.45;
          const attachZ = Math.cos(radialAngle) * 0.45;

          return (
            <group key={`leg-${i}`} position={[attachX, 0, attachZ]} rotation={[0, radialAngle, 0]}>
              {/* 上肢：外側斜め上に伸びる */}
              <group rotation={[legAnim * 0.4, 0, upperAngle + legAnim]}>
                <mesh position={[upperLen / 2, 0, 0]} material={legMat}>
                  <boxGeometry args={[upperLen, 0.08, 0.08]} />
                </mesh>
                {/* 肘関節 */}
                <mesh position={[upperLen, 0, 0]} material={jointMat}>
                  <sphereGeometry args={[0.06, 6, 6]} />
                </mesh>
                {/* 下肢：関節から地面に向かって垂直に降りる */}
                <group position={[upperLen, 0, 0]} rotation={[0, 0, -(Math.PI / 2 + upperAngle + 0.3 + legAnim * 0.5)]}>
                  <mesh position={[0, -lowerLen / 2, 0]} material={legMat}>
                    <boxGeometry args={[0.06, lowerLen, 0.06]} />
                  </mesh>
                  {/* 足先（接地パッド） */}
                  <mesh position={[0, -lowerLen + 0.03, 0]} material={spiderDarkMat}>
                    <boxGeometry args={[0.12, 0.04, 0.12]} />
                  </mesh>
                </group>
              </group>
            </group>
          );
        })}
      </group>

      {/* --- 下部のカラフルな装飾 --- */}
      <group position={[0, 0.65, 0.1]}>
        {/* ピンクの装飾 */}
        <mesh position={[-0.1, 0, 0.1]} material={pinkMat}>
          <boxGeometry args={[0.15, 0.2, 0.1]} />
        </mesh>
        {/* 青の装飾 */}
        <mesh position={[0.1, 0, 0.1]} material={blueMat}>
          <boxGeometry args={[0.15, 0.2, 0.1]} />
        </mesh>
        {/* 黄色の装飾 */}
        <mesh position={[0, -0.15, 0.1]} material={yellowMat}>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
        </mesh>
        {/* ピンクのカーブ */}
        <mesh position={[0, 0.08, 0.15]} material={pinkMat}>
          <cylinderGeometry args={[0.15, 0.12, 0.05, 12]} />
        </mesh>
      </group>

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

      {/* ポイントライト（腹部の発光） */}
      <pointLight
        position={[0, 1.1, 0]}
        color={0xdaa520}
        intensity={glowPulse * 2}
        distance={8}
      />
    </group>
  );
}
