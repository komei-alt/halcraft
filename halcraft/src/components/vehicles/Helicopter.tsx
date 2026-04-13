// ヘリコプターコンポーネント
// ボクセルスタイルの3Dヘリコプターモデル + ローターアニメーション
// プレイヤーが近づくと搭乗プロンプトを表示
// 鮮やかな色と自発光で昼夜問わず視認しやすい
// ヘッドライト搭載: ノーズ下部に2灯のSpotLight + 発光ハウジング
// 搭乗時は胴体が半透明ガラス化し、機内から外が見える
// 搭乗者のアバターをヘリモデル内部に直接描画

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useVehicleStore, HELICOPTER_CONSTANTS, SEAT_MODEL_OFFSETS, ALL_SEATS } from '../../stores/useVehicleStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { VoxelAvatar } from '../VoxelAvatar';
import { isValidSkinId } from '../../types/skins';


/** ヘリコプターの色定義（鮮やかで目立つ色） */
const BODY_COLOR = new THREE.Color(0xff3333);       // 鮮やかな赤い胴体
const BODY_WHITE = new THREE.Color(0xffffff);        // 白い下部
const TAIL_COLOR = new THREE.Color(0xcc2222);        // 暗い赤のテールブーム
const ROTOR_COLOR = new THREE.Color(0x444444);       // 灰色のローター
const WINDOW_COLOR = new THREE.Color(0x66ddff);      // 明るい水色の窓
const SKID_COLOR = new THREE.Color(0x333333);        // 黒いスキッド
const STRIPE_COLOR = new THREE.Color(0xffdd00);      // 黄色いストライプ

/** ヘッドライトの色定義 */
const HEADLIGHT_COLOR = new THREE.Color(0xffffcc);       // 暖かい白色光
const HEADLIGHT_HOUSING_COLOR = new THREE.Color(0xdddddd); // ライトハウジング（シルバー）
const HEADLIGHT_LENS_COLOR = new THREE.Color(0xffffaa);    // レンズ（暖かい黄白色）

/** ヘッドライト設定 */
const HEADLIGHT_CONFIG = {
  /** 搭乗時の光量 */
  BOARDED_INTENSITY: 5,
  /** 待機時の光量 */
  IDLE_INTENSITY: 1.5,
  /** 搭乗時のレンズ発光強度 */
  BOARDED_EMISSIVE: 2.0,
  /** 待機時のレンズ発光強度 */
  IDLE_EMISSIVE: 0.5,
  /** 照射距離 */
  DISTANCE: 25,
  /** 照射角度（ラジアン） */
  ANGLE: Math.PI / 5,
  /** 半影のソフトさ（0=くっきり, 1=ぼんやり） */
  PENUMBRA: 0.4,
  /** 光の減衰 */
  DECAY: 1.5,
} as const;

/** 搭乗時の胴体透過度（0=完全透明, 1=完全不透明） */
const BOARDED_BODY_OPACITY = 0.15;
/** 搭乗時の窓透過度 */
const BOARDED_WINDOW_OPACITY = 0.3;

export function Helicopter() {
  const helicopter = useVehicleStore((s) => s.helicopter);
  const mainRotorRef = useRef<THREE.Group>(null);
  const tailRotorRef = useRef<THREE.Group>(null);
  const groupRef = useRef<THREE.Group>(null);

  // ヘッドライトの参照
  const spotLightLeftRef = useRef<THREE.SpotLight>(null);
  const spotLightRightRef = useRef<THREE.SpotLight>(null);
  const spotLightTargetLeftRef = useRef<THREE.Object3D>(null);
  const spotLightTargetRightRef = useRef<THREE.Object3D>(null);
  const lensLeftRef = useRef<THREE.Mesh>(null);
  const lensRightRef = useRef<THREE.Mesh>(null);

  // マテリアルをメモ化（emissive付きで暗所でも目立つ）
  // 搭乗時に半透明化するため transparent=true
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: BODY_COLOR, roughness: 0.5, metalness: 0.1,
    emissive: BODY_COLOR, emissiveIntensity: 0.15,
    transparent: true, opacity: 1.0,
  }), []);
  const bodyWhiteMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: BODY_WHITE, roughness: 0.4, metalness: 0.0,
    emissive: BODY_WHITE, emissiveIntensity: 0.1,
    transparent: true, opacity: 1.0,
  }), []);
  const tailMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: TAIL_COLOR, roughness: 0.5, metalness: 0.1,
    emissive: TAIL_COLOR, emissiveIntensity: 0.1,
    transparent: true, opacity: 1.0,
  }), []);
  const rotorMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: ROTOR_COLOR, roughness: 0.5, metalness: 0.3,
  }), []);
  const windowMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: WINDOW_COLOR, roughness: 0.1, metalness: 0.5,
    transparent: true, opacity: 0.8,
    emissive: WINDOW_COLOR, emissiveIntensity: 0.3,
    side: THREE.DoubleSide,
  }), []);
  const skidMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: SKID_COLOR, roughness: 0.9,
  }), []);
  const stripeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: STRIPE_COLOR, roughness: 0.4,
    emissive: STRIPE_COLOR, emissiveIntensity: 0.2,
    transparent: true, opacity: 1.0,
  }), []);

  // ヘッドライト用マテリアル
  const housingMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: HEADLIGHT_HOUSING_COLOR, roughness: 0.3, metalness: 0.6,
  }), []);
  const lensMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: HEADLIGHT_LENS_COLOR, roughness: 0.1, metalness: 0.2,
    emissive: HEADLIGHT_LENS_COLOR, emissiveIntensity: HEADLIGHT_CONFIG.IDLE_EMISSIVE,
    transparent: true, opacity: 0.95,
  }), []);

  useFrame(() => {
    if (!helicopter.spawned) return;

    // 自分が搭乗中か
    const iAmBoarded = helicopter.mySeat !== null;
    // 誰かが搭乗中か（自分 or 他プレイヤー）
    const someoneBoarded = Object.values(helicopter.seats).some((id) => id !== null);

    // --- 胴体の半透明化（自分搭乗時のみ） ---
    const targetBodyOpacity = iAmBoarded ? BOARDED_BODY_OPACITY : 1.0;
    const targetWindowOpacity = iAmBoarded ? BOARDED_WINDOW_OPACITY : 0.8;
    const lerpSpeed = 0.15;

    // 胴体マテリアルのopacityをスムーズ補間
    bodyMat.opacity += (targetBodyOpacity - bodyMat.opacity) * lerpSpeed;
    bodyWhiteMat.opacity += (targetBodyOpacity - bodyWhiteMat.opacity) * lerpSpeed;
    tailMat.opacity += (targetBodyOpacity - tailMat.opacity) * lerpSpeed;
    stripeMat.opacity += (targetBodyOpacity - stripeMat.opacity) * lerpSpeed;
    windowMat.opacity += (targetWindowOpacity - windowMat.opacity) * lerpSpeed;

    // 搭乗時は裏面も描画（内側から見るため）
    const targetSide = iAmBoarded ? THREE.DoubleSide : THREE.FrontSide;
    bodyMat.side = targetSide;
    bodyWhiteMat.side = targetSide;
    tailMat.side = targetSide;

    // メインローターのアニメーション
    if (mainRotorRef.current) {
      if (someoneBoarded) {
        // 搭乗中: ストアの rotorAngle を直接反映（サーバー同期 or ローカル入力）
        mainRotorRef.current.rotation.y = helicopter.rotorAngle;
      } else {
        // 待機中: ゆっくりアイドル回転
        mainRotorRef.current.rotation.y += HELICOPTER_CONSTANTS.ROTOR_SPEED * 0.004;
      }
    }

    // テールローターのアニメーション（メインより速く回る）
    if (tailRotorRef.current) {
      if (someoneBoarded) {
        tailRotorRef.current.rotation.x = helicopter.rotorAngle * 1.5;
      } else {
        tailRotorRef.current.rotation.x += HELICOPTER_CONSTANTS.ROTOR_SPEED * 0.006;
      }
    }

    // ヘッドライトの強度を搭乗状態に応じて変更
    const targetIntensity = someoneBoarded
      ? HEADLIGHT_CONFIG.BOARDED_INTENSITY
      : HEADLIGHT_CONFIG.IDLE_INTENSITY;
    const targetEmissive = someoneBoarded
      ? HEADLIGHT_CONFIG.BOARDED_EMISSIVE
      : HEADLIGHT_CONFIG.IDLE_EMISSIVE;

    // SpotLight の強度をスムーズに補間
    if (spotLightLeftRef.current) {
      spotLightLeftRef.current.intensity += (targetIntensity - spotLightLeftRef.current.intensity) * 0.1;
    }
    if (spotLightRightRef.current) {
      spotLightRightRef.current.intensity += (targetIntensity - spotLightRightRef.current.intensity) * 0.1;
    }

    // レンズの発光強度をスムーズに補間
    if (lensLeftRef.current) {
      const mat = lensLeftRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * 0.1;
    }
    if (lensRightRef.current) {
      const mat = lensRightRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * 0.1;
    }

    // SpotLight のターゲットを設定
    if (spotLightLeftRef.current && spotLightTargetLeftRef.current) {
      spotLightLeftRef.current.target = spotLightTargetLeftRef.current;
    }
    if (spotLightRightRef.current && spotLightTargetRightRef.current) {
      spotLightRightRef.current.target = spotLightTargetRightRef.current;
    }
  });

  if (!helicopter.spawned) return null;

  return (
    <group
      ref={groupRef}
      position={[helicopter.x, helicopter.y, helicopter.z]}
      rotation={[helicopter.pitch, helicopter.rotationY, helicopter.roll]}
      scale={1.3}
    >
      {/* モデルを180度回転: ノーズが-Z（Three.js前方）を向くように */}
      <group rotation={[0, Math.PI, 0]}>
      {/* === 胴体（ドア開口部付き — ガンナー席のサイドが開いている） === */}
      {/* 胴体前部（コックピット周辺 z: 0.2〜1.4） */}
      <mesh position={[0, 0.3, 0.8]} material={bodyMat}>
        <boxGeometry args={[1.6, 1.2, 1.2]} />
      </mesh>
      {/* 胴体後部（テールブーム接続部 z: -1.0〜-1.4） */}
      <mesh position={[0, 0.3, -1.2]} material={bodyMat}>
        <boxGeometry args={[1.6, 1.2, 0.4]} />
      </mesh>
      {/* 胴体中央上部（ドア開口部の上 — 屋根として繋ぐ） */}
      <mesh position={[0, 0.75, -0.3]} material={bodyMat}>
        <boxGeometry args={[1.6, 0.3, 1.4]} />
      </mesh>
      {/* 胴体中央下部（ドア開口部の下 — 床として繋ぐ） */}
      <mesh position={[0, -0.15, -0.3]} material={bodyMat}>
        <boxGeometry args={[1.6, 0.3, 1.4]} />
      </mesh>

      {/* 胴体下部（白） — 前部 */}
      <mesh position={[0, -0.2, 0.8]} material={bodyWhiteMat}>
        <boxGeometry args={[1.5, 0.3, 1.1]} />
      </mesh>
      {/* 胴体下部（白） — 後部 */}
      <mesh position={[0, -0.2, -1.2]} material={bodyWhiteMat}>
        <boxGeometry args={[1.5, 0.3, 0.4]} />
      </mesh>

      {/* ノーズ（前部を丸みをつけて） */}
      <mesh position={[0, 0.2, 1.5]} material={bodyMat}>
        <boxGeometry args={[1.3, 1.0, 0.6]} />
      </mesh>

      {/* 黄色いストライプ（胴体装飾） */}
      <mesh position={[0, 0.3, 0.3]} material={stripeMat}>
        <boxGeometry args={[1.62, 0.15, 0.3]} />
      </mesh>

      {/* === ヘッドライト（ノーズ下部に2灯） === */}
      {/* 左ヘッドライト */}
      <group position={[-0.35, -0.15, 1.75]}>
        {/* ハウジング（ライトの外枠） */}
        <mesh material={housingMat}>
          <boxGeometry args={[0.28, 0.22, 0.15]} />
        </mesh>
        {/* レンズ（発光面 — 前方に少し出す） */}
        <mesh ref={lensLeftRef} position={[0, 0, 0.09]} material={lensMat.clone()}>
          <boxGeometry args={[0.22, 0.16, 0.04]} />
        </mesh>
        {/* SpotLight */}
        <spotLight
          ref={spotLightLeftRef}
          position={[0, 0, 0.1]}
          color={HEADLIGHT_COLOR}
          intensity={HEADLIGHT_CONFIG.IDLE_INTENSITY}
          distance={HEADLIGHT_CONFIG.DISTANCE}
          angle={HEADLIGHT_CONFIG.ANGLE}
          penumbra={HEADLIGHT_CONFIG.PENUMBRA}
          decay={HEADLIGHT_CONFIG.DECAY}
          castShadow={false}
        />
        {/* SpotLight ターゲット（前方8ブロック先・やや下向き） */}
        <object3D ref={spotLightTargetLeftRef} position={[0, -2, 8]} />
      </group>

      {/* 右ヘッドライト */}
      <group position={[0.35, -0.15, 1.75]}>
        {/* ハウジング */}
        <mesh material={housingMat}>
          <boxGeometry args={[0.28, 0.22, 0.15]} />
        </mesh>
        {/* レンズ */}
        <mesh ref={lensRightRef} position={[0, 0, 0.09]} material={lensMat.clone()}>
          <boxGeometry args={[0.22, 0.16, 0.04]} />
        </mesh>
        {/* SpotLight */}
        <spotLight
          ref={spotLightRightRef}
          position={[0, 0, 0.1]}
          color={HEADLIGHT_COLOR}
          intensity={HEADLIGHT_CONFIG.IDLE_INTENSITY}
          distance={HEADLIGHT_CONFIG.DISTANCE}
          angle={HEADLIGHT_CONFIG.ANGLE}
          penumbra={HEADLIGHT_CONFIG.PENUMBRA}
          decay={HEADLIGHT_CONFIG.DECAY}
          castShadow={false}
        />
        {/* SpotLight ターゲット */}
        <object3D ref={spotLightTargetRightRef} position={[0, -2, 8]} />
      </group>

      {/* === テールブーム === */}
      <mesh position={[0, 0.4, -2.2]} material={tailMat}>
        <boxGeometry args={[0.5, 0.5, 2.0]} />
      </mesh>

      {/* テールフィン（垂直） */}
      <mesh position={[0, 1.0, -3.0]} material={tailMat}>
        <boxGeometry args={[0.1, 1.0, 0.6]} />
      </mesh>

      {/* テールフィン（水平） */}
      <mesh position={[0, 0.65, -3.0]} material={tailMat}>
        <boxGeometry args={[1.2, 0.08, 0.4]} />
      </mesh>

      {/* === コックピット窓（常に表示 — 搭乗時はガラス越しに外が見える） === */}
      {/* フロントウィンドウ（大きく斜め） */}
      <mesh position={[0, 0.6, 1.6]} material={windowMat}>
        <boxGeometry args={[1.2, 0.6, 0.4]} />
      </mesh>
      {/* サイドウィンドウ左 */}
      <mesh position={[-0.81, 0.5, 0.5]} material={windowMat}>
        <boxGeometry args={[0.02, 0.5, 1.0]} />
      </mesh>
      {/* サイドウィンドウ右 */}
      <mesh position={[0.81, 0.5, 0.5]} material={windowMat}>
        <boxGeometry args={[0.02, 0.5, 1.0]} />
      </mesh>

      {/* === ドア開口部フレーム（ガンナー席の左右 — 開放状態） === */}
      {/* 左ドアフレーム前柱 */}
      <mesh position={[-0.78, 0.3, 0.1]} material={bodyMat}>
        <boxGeometry args={[0.06, 0.9, 0.08]} />
      </mesh>
      {/* 左ドアフレーム後柱 */}
      <mesh position={[-0.78, 0.3, -0.75]} material={bodyMat}>
        <boxGeometry args={[0.06, 0.9, 0.08]} />
      </mesh>
      {/* 右ドアフレーム前柱 */}
      <mesh position={[0.78, 0.3, 0.1]} material={bodyMat}>
        <boxGeometry args={[0.06, 0.9, 0.08]} />
      </mesh>
      {/* 右ドアフレーム後柱 */}
      <mesh position={[0.78, 0.3, -0.75]} material={bodyMat}>
        <boxGeometry args={[0.06, 0.9, 0.08]} />
      </mesh>

      {/* === ルーフ（ローター取り付け部） === */}
      <mesh position={[0, 0.95, 0]} material={bodyMat}>
        <boxGeometry args={[0.8, 0.15, 1.0]} />
      </mesh>

      {/* ローターマスト */}
      <mesh position={[0, 1.2, 0]} material={skidMat}>
        <boxGeometry args={[0.15, 0.4, 0.15]} />
      </mesh>

      {/* === メインローター（上部で回転） === */}
      <group ref={mainRotorRef} position={[0, 1.45, 0]}>
        {/* ローターブレード × 4 */}
        <mesh material={rotorMat}>
          <boxGeometry args={[5.0, 0.06, 0.25]} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]} material={rotorMat}>
          <boxGeometry args={[5.0, 0.06, 0.25]} />
        </mesh>
        {/* ローターハブ */}
        <mesh material={rotorMat}>
          <boxGeometry args={[0.3, 0.12, 0.3]} />
        </mesh>
      </group>

      {/* === テールローター === */}
      <group ref={tailRotorRef} position={[0.15, 0.9, -3.0]}>
        <mesh material={rotorMat}>
          <boxGeometry args={[0.05, 1.0, 0.15]} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={rotorMat}>
          <boxGeometry args={[0.05, 1.0, 0.15]} />
        </mesh>
      </group>



      {/* === スキッド（着陸脚） === */}
      {/* 左スキッド */}
      <group position={[-0.6, -0.5, 0]}>
        {/* 横棒 */}
        <mesh material={skidMat}>
          <boxGeometry args={[0.08, 0.08, 2.4]} />
        </mesh>
        {/* 前の支柱 */}
        <mesh position={[0, 0.25, 0.7]} material={skidMat}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
        </mesh>
        {/* 後の支柱 */}
        <mesh position={[0, 0.25, -0.7]} material={skidMat}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
        </mesh>
      </group>
      {/* 右スキッド */}
      <group position={[0.6, -0.5, 0]}>
        <mesh material={skidMat}>
          <boxGeometry args={[0.08, 0.08, 2.4]} />
        </mesh>
        <mesh position={[0, 0.25, 0.7]} material={skidMat}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
        </mesh>
        <mesh position={[0, 0.25, -0.7]} material={skidMat}>
          <boxGeometry args={[0.06, 0.5, 0.06]} />
        </mesh>
      {/* === 搭乗者アバター（180度回転グループ内に配置） === */}
      <PassengerAvatars />
      </group>
      </group>

      {/* === 搭乗プロンプト（回転ラッパーの外側に置く） === */}
      {(() => {
        const passengerCount = Object.values(helicopter.seats).filter((id) => id !== null).length;
        const hasEmptySeat = passengerCount < 3;
        if (!hasEmptySeat || helicopter.mySeat !== null) return null;
        return (
          <Billboard position={[0, 3.5, 0]}>
            {/* 背景パネル */}
            <mesh>
              <planeGeometry args={[4.5, 1.0]} />
              <meshBasicMaterial color={0x000000} transparent opacity={0.8} side={THREE.DoubleSide} />
            </mesh>
            {/* テキスト */}
            <Text
              position={[0, 0.12, 0.01]}
              fontSize={0.35}
              color="#ffdd00"
              anchorX="center"
              anchorY="middle"
              font={undefined}
              outlineWidth={0.02}
              outlineColor="#000000"
            >
              🚁 [F] のる
            </Text>
            {/* 搭乗者数 */}
            <Text
              position={[0, -0.22, 0.01]}
              fontSize={0.18}
              color="rgba(255, 255, 255, 0.7)"
              anchorX="center"
              anchorY="middle"
              font={undefined}
            >
              {`${passengerCount}/3`}
            </Text>
          </Billboard>
        );
      })()}
    </group>
  );
}

/**
 * 搭乗者のアバターをヘリモデル内部に描画
 * 180度回転グループの内側に配置されるため SEAT_MODEL_OFFSETS を使用
 * 自分自身は描画しない（FPS視点のため）
 */
function PassengerAvatars() {
  const seats = useVehicleStore((s) => s.helicopter.seats);

  const remotePlayers = useMultiplayerStore((s) => s.remotePlayers);
  const myId = useMultiplayerStore((s) => s.myId);

  return (
    <>
      {ALL_SEATS.map((seat) => {
        const playerId = seats[seat];
        // 空席 or 自分自身はスキップ
        if (playerId === null || playerId === '__local__' || playerId === myId) return null;

        // リモートプレイヤーの情報を取得
        const player = remotePlayers.get(playerId);
        if (!player) return null;

        const offset = SEAT_MODEL_OFFSETS[seat];

        return (
          <group key={seat} position={[offset.x, offset.y, offset.z]}>
            <VoxelAvatar
              skinId={player.skinId && isValidSkinId(player.skinId) ? player.skinId : undefined}
              color={player.color}
              isMoving={false}
              isDead={player.isDead}
              deathTime={player.deathTime}
            />
          </group>
        );
      })}
    </>
  );
}

