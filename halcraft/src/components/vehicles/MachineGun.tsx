// 機関銃コンポーネント
// ヘリコプターの左右ドア位置に搭載されるボクセル風の機関銃
// ガンナーの視点方向に銃が追従して回転
// 弾丸は銃口（マズル）のワールド座標から発射
// 弾道は明るく太いトレイルで視認しやすい
//
// 弾道システム:
//   1. マズル位置から弾丸（プロジェクタイル）を発射
//   2. 毎フレーム弾丸を高速移動させながらレイマーチングでブロック衝突判定
//   3. モブとの球体交差判定を同時実行
//   4. 衝突時にインパクトエフェクト（パーティクル）を生成
//   5. 弾道は光る3D円柱トレイルで尾を引く表現

import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { useVehicleStore, GUN_CONSTANTS } from '../../stores/useVehicleStore';
import { useMobStore } from '../../stores/useMobStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { onRemoteGunFire } from '../../stores/useMultiplayerStore';
import { useWorldStore } from '../../stores/useWorldStore';
import { spawnDamagePopup } from '../../utils/effectTriggers';
import { rayMarchProjectile, type RemotePlayerTarget } from '../../utils/projectilePhysics';
import { checkProjectileHitVehicle } from '../../utils/vehicleCombat';
import { playMachineGunSound, playBulletImpactSound } from '../../utils/sounds';
import { mobileActions } from '../../utils/touchInput';
import { useGameStore } from '../../stores/useGameStore';
import { isDesktopGameplayInputActive } from '../../utils/gameCanvas';
import { usePlayerStore } from '../../stores/usePlayerStore';

// ─── 定数 ──────────────────────────────────────────────
/** 弾速（ブロック/秒） */
const BULLET_SPEED = 120;
/** 弾の最大生存時間（秒） */
const BULLET_MAX_AGE = 1.0;
/** トレイル（残光）の長さ（ブロック） */
const TRAIL_LENGTH = 5.5;
/** 弾のヒット半径（モブ当たり判定） */
const MOB_HIT_RADIUS = 1.2;
/** インパクトパーティクルの数 */
const IMPACT_PARTICLE_COUNT = 14;
/** インパクトパーティクルの表示時間（秒） */
const IMPACT_LIFETIME = 0.62;
/** ヒットフラッシュの表示時間（秒） */
const HIT_FLASH_LIFETIME = 0.2;
/** 重力（弾道にわずかな落下を加える） */
const BULLET_GRAVITY = 3.0;
/** プレイヤーヒット半径 */
const PLAYER_HIT_RADIUS = 0.5;
/** プレイヤーヒット高さ */
const PLAYER_HIT_HEIGHT = 1.7;

/**
 * 銃のモデル内配置（180度回転グループ内の座標）
 * ヘリのサイドドア開口部に設置
 * Z正方向 = ノーズ方向（モデル内座標系）
 *
 * 注意: 180度回転グループ内なので、ワールドでの位置は左右・前後が反転する
 *   モデル left (x:-0.82)  → ワールド RIGHT (x:+1.07)
 *   モデル right (x:+0.82) → ワールド LEFT  (x:-1.07)
 *   モデル z:0.2 → ワールド z:-0.26（カメラz:-0.2の近くに配置）
 */
const GUN_MOUNT_POSITIONS = {
  left:  { x: -0.82, y: -0.15, z: 0.2 },
  right: { x:  0.82, y: -0.15, z: 0.2 },
} as const;

/** マズル（銃口）のローカルオフセット（銃本体原点から） */
const MUZZLE_LOCAL_OFFSET = new THREE.Vector3(0, 0.035, 1.1);
/** 銃身の前方（銃グループローカル。銃身・マズルは +Z 方向） */
const BARREL_FORWARD_LOCAL = new THREE.Vector3(0, 0, 1);
/** 銃の水平旋回制限（ラジアン） */
const GUN_MAX_YAW = Math.PI * 0.7;
/** 銃の上下制限（ラジアン） */
const GUN_MAX_PITCH = Math.PI * 0.35;
/** 散布（銃口方向との同期を優先し、基本は0） */
const GUN_SPREAD = 0;

/** ワーク用（毎フレーム再利用） */
const _worldAimDir = new THREE.Vector3();
const _localAimDir = new THREE.Vector3();
const _invParentWorld = new THREE.Matrix4();
const _barrelWorldDir = new THREE.Vector3();

/**
 * カメラ前方をピボット親のローカルへ変換し、ヨー/ピッチを求める
 * ヘリの pitch/roll 込みで「銃の向き = 視点方向」になる
 */
function computeGunAimFromCamera(
  pivotParent: THREE.Object3D,
  camera: THREE.Camera,
): { yaw: number; pitch: number } {
  pivotParent.updateWorldMatrix(true, false);
  _worldAimDir.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  _invParentWorld.copy(pivotParent.matrixWorld).invert();
  _localAimDir.copy(_worldAimDir).transformDirection(_invParentWorld).normalize();

  const yaw = Math.atan2(_localAimDir.x, _localAimDir.z);
  const horizontal = Math.hypot(_localAimDir.x, _localAimDir.z);
  const pitch = -Math.atan2(_localAimDir.y, Math.max(1e-6, horizontal));

  return {
    yaw: THREE.MathUtils.clamp(yaw, -GUN_MAX_YAW, GUN_MAX_YAW),
    pitch: THREE.MathUtils.clamp(pitch, -GUN_MAX_PITCH, GUN_MAX_PITCH),
  };
}

/** 銃ピボットをカメラ照準に即時合わせる（発射時のズレ防止） */
function snapGunPivotToCamera(
  pivot: THREE.Group,
  camera: THREE.Camera,
  yawRef: { current: number },
  pitchRef: { current: number },
): void {
  const parent = pivot.parent;
  if (!parent) return;
  const aim = computeGunAimFromCamera(parent, camera);
  yawRef.current = aim.yaw;
  pitchRef.current = aim.pitch;
  pivot.rotation.set(aim.pitch, aim.yaw, 0);
  pivot.updateMatrixWorld(true);
}

/**
 * 銃グループのワールド行列からマズル位置と銃身方向を取得
 * 弾道はこの方向と完全一致させる
 */
function getMuzzleWorldPose(gunGroup: THREE.Object3D): {
  position: THREE.Vector3;
  direction: THREE.Vector3;
} {
  gunGroup.updateWorldMatrix(true, false);
  const position = MUZZLE_LOCAL_OFFSET.clone().applyMatrix4(gunGroup.matrixWorld);
  const direction = _barrelWorldDir
    .copy(BARREL_FORWARD_LOCAL)
    .transformDirection(gunGroup.matrixWorld)
    .normalize()
    .clone();
  return { position, direction };
}

// ─── 色定義 ──────────────────────────────────────────
const GUN_BARREL_COLOR = new THREE.Color(0x333333);
const GUN_BODY_COLOR = new THREE.Color(0x555555);
const GUN_MOUNT_COLOR = new THREE.Color(0x444444);
const MUZZLE_FLASH_COLOR = new THREE.Color(0xffaa33);
const TRACER_COLOR = new THREE.Color(0xffdd44);
const TRACER_GLOW_COLOR = new THREE.Color(0xffaa22);
const BLOCK_IMPACT_COLOR = new THREE.Color(0xccaa66);
const MOB_HIT_COLOR = new THREE.Color(0xff3333);
const SPARK_COLOR = new THREE.Color(0xffffff);

type Vector3Tuple = [number, number, number];

interface GunBoxPart {
  position: Vector3Tuple;
  size: Vector3Tuple;
  rotation?: Vector3Tuple;
}

interface GunCylinderPart {
  position: Vector3Tuple;
  radiusTop: number;
  radiusBottom: number;
  height: number;
  rotation?: Vector3Tuple;
  radialSegments?: number;
}

const ZERO_ROTATION: Vector3Tuple = [0, 0, 0];

function transformGunGeometry(
  geometry: THREE.BufferGeometry,
  position: Vector3Tuple,
  rotation: Vector3Tuple = ZERO_ROTATION,
): THREE.BufferGeometry {
  geometry.rotateX(rotation[0]);
  geometry.rotateY(rotation[1]);
  geometry.rotateZ(rotation[2]);
  geometry.translate(position[0], position[1], position[2]);
  return geometry;
}

function mergeGunGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  merged.computeBoundingSphere();
  return merged;
}

function createGunBoxGeometry(parts: GunBoxPart[]): THREE.BufferGeometry {
  return mergeGunGeometries(parts.map((part) => transformGunGeometry(
    new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]),
    part.position,
    part.rotation,
  )));
}

function createGunCylinderGeometry(parts: GunCylinderPart[]): THREE.BufferGeometry {
  return mergeGunGeometries(parts.map((part) => transformGunGeometry(
    new THREE.CylinderGeometry(
      part.radiusTop,
      part.radiusBottom,
      part.height,
      part.radialSegments ?? 10,
    ),
    part.position,
    part.rotation,
  )));
}

/** ドア枠へ荷重を逃がす、旋回リング付きの固定架台。 */
const DOOR_MOUNT_GEOMETRY = mergeGunGeometries([
  createGunBoxGeometry([
    { position: [0, -0.015, 0], size: [0.3, 0.075, 0.28] },
    { position: [-0.13, -0.08, 0.02], size: [0.055, 0.18, 0.13], rotation: [0, 0, -0.3] },
    { position: [0.13, -0.08, 0.02], size: [0.055, 0.18, 0.13], rotation: [0, 0, 0.3] },
  ]),
  createGunCylinderGeometry([
    { position: [0, 0.045, 0], radiusTop: 0.115, radiusBottom: 0.125, height: 0.08, radialSegments: 12 },
  ]),
]);

/** 俯仰軸・トラニオン・反動受けを一体化した可動マウント。 */
const GUN_TRUNNION_GEOMETRY = mergeGunGeometries([
  createGunBoxGeometry([
    { position: [0, 0.02, 0.02], size: [0.22, 0.11, 0.24] },
    { position: [-0.13, -0.015, 0.09], size: [0.045, 0.19, 0.16], rotation: [0, 0, -0.22] },
    { position: [0.13, -0.015, 0.09], size: [0.045, 0.19, 0.16], rotation: [0, 0, 0.22] },
  ]),
  createGunCylinderGeometry([
    { position: [0, 0.025, 0.14], radiusTop: 0.075, radiusBottom: 0.075, height: 0.34, rotation: [0, 0, Math.PI / 2], radialSegments: 12 },
  ]),
]);

/** レシーバー、給弾箱、フィードシュートを材質単位で結合した銃本体。 */
const GUN_RECEIVER_GEOMETRY = createGunBoxGeometry([
  { position: [0, 0.035, 0.25], size: [0.25, 0.18, 0.42] },
  { position: [0, 0.145, 0.21], size: [0.2, 0.065, 0.27], rotation: [-0.04, 0, 0] },
  { position: [0, 0.035, 0.035], size: [0.21, 0.2, 0.14] },
  { position: [-0.175, -0.055, 0.2], size: [0.115, 0.19, 0.25] },
  { position: [-0.145, -0.07, 0.39], size: [0.07, 0.08, 0.12], rotation: [0.18, 0, 0] },
  { position: [-0.105, -0.045, 0.49], size: [0.065, 0.07, 0.1], rotation: [0.12, 0, 0] },
  { position: [0, 0.035, 0.5], size: [0.2, 0.2, 0.13] },
  { position: [0, 0.035, 0.63], size: [0.175, 0.175, 0.13] },
  { position: [0.105, -0.055, 0.2], size: [0.035, 0.1, 0.22] },
  { position: [0, 0.205, 0.22], size: [0.12, 0.08, 0.16] },
]);

/** 四連銃身と前後の保持カラー。銃身全体を1ドローで回転させる。 */
const GUN_BARREL_CLUSTER_GEOMETRY = mergeGunGeometries([
  createGunCylinderGeometry([
    { position: [0.062, 0, 0.29], radiusTop: 0.019, radiusBottom: 0.021, height: 0.58, rotation: [Math.PI / 2, 0, 0], radialSegments: 8 },
    { position: [-0.062, 0, 0.29], radiusTop: 0.019, radiusBottom: 0.021, height: 0.58, rotation: [Math.PI / 2, 0, 0], radialSegments: 8 },
    { position: [0, 0.062, 0.29], radiusTop: 0.019, radiusBottom: 0.021, height: 0.58, rotation: [Math.PI / 2, 0, 0], radialSegments: 8 },
    { position: [0, -0.062, 0.29], radiusTop: 0.019, radiusBottom: 0.021, height: 0.58, rotation: [Math.PI / 2, 0, 0], radialSegments: 8 },
    { position: [0, 0, 0.035], radiusTop: 0.105, radiusBottom: 0.105, height: 0.07, rotation: [Math.PI / 2, 0, 0], radialSegments: 12 },
    { position: [0, 0, 0.55], radiusTop: 0.102, radiusBottom: 0.102, height: 0.075, rotation: [Math.PI / 2, 0, 0], radialSegments: 12 },
  ]),
]);

const GUN_SENSOR_GEOMETRY = createGunCylinderGeometry([
  { position: [0, 0.205, 0.31], radiusTop: 0.04, radiusBottom: 0.04, height: 0.018, rotation: [Math.PI / 2, 0, 0], radialSegments: 12 },
]);

const MUZZLE_FLASH_GEOMETRY = transformGunGeometry(
  new THREE.ConeGeometry(0.15, 0.28, 6, 1, true),
  [0, 0, 0],
  [Math.PI / 2, 0, 0],
);

// ─── 型定義 ──────────────────────────────────────────
/** 飛翔中の弾丸 */
interface Projectile {
  id: number;
  /** 現在位置 */
  pos: THREE.Vector3;
  /** 速度ベクトル */
  vel: THREE.Vector3;
  /** 発射時刻 */
  createdAt: number;
  /** 前フレームの位置（トレイル描画用） */
  prevPositions: THREE.Vector3[];
  /** 発射元の銃の位置（マズルフラッシュ用） */
  side: 'left' | 'right';
  /** 弾が衝突して消滅済みか */
  dead: boolean;
  /** リモートプレイヤーの弾か（ダメージ判定なし・視覚のみ） */
  isRemote?: boolean;
}

/** 衝突エフェクト */
interface ImpactEffect {
  id: number;
  /** 衝突位置 */
  pos: THREE.Vector3;
  /** 衝突面の法線ベクトル（パーティクルの飛散方向） */
  normal: THREE.Vector3;
  /** 衝突種別 */
  type: 'block' | 'mob';
  /** 生成時刻 */
  createdAt: number;
  /** パーティクルの初速度（各粒子ごと） */
  particles: Array<{
    vel: THREE.Vector3;
    pos: THREE.Vector3;
    size: number;
  }>;
}

let nextId = 0;


// ────────────────────────────────────────────────────────
// メインコンポーネント
// ────────────────────────────────────────────────────────
export function MachineGun() {
  const helicopterSpawned = useVehicleStore((s) => s.helicopter.spawned);
  const mySeat = useVehicleStore((s) => s.helicopter.mySeat);
  const { camera } = useThree();

  // 発射クールダウン
  const lastFireTime = useRef(0);
  const isMouseDown = useRef(false);

  // マズルフラッシュ
  const flashLeftRef = useRef<THREE.Mesh>(null);
  const flashRightRef = useRef<THREE.Mesh>(null);
  const flashTimerLeft = useRef(0);
  const flashTimerRight = useRef(0);
  const barrelSpinLeft = useRef(0);
  const barrelSpinRight = useRef(0);
  const barrelSpinVelocityLeft = useRef(0);
  const barrelSpinVelocityRight = useRef(0);

  // 銃モデルのグループ参照（ワールド座標取得用）
  const gunGroupLeftRef = useRef<THREE.Group>(null);
  const gunGroupRightRef = useRef<THREE.Group>(null);
  // 旋回ピボット（発射直前に照準をスナップする）
  const pivotLeftRef = useRef<THREE.Group>(null);
  const pivotRightRef = useRef<THREE.Group>(null);
  const yawLeftRef = useRef(0);
  const pitchLeftRef = useRef(0);
  const yawRightRef = useRef(0);
  const pitchRightRef = useRef(0);

  // 弾丸（プロジェクタイル）とエフェクト
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [impacts, setImpacts] = useState<ImpactEffect[]>([]);

  // 射撃方向のワーク用ベクトル
  const shootDir = useRef(new THREE.Vector3());

  const boostBarrelSpin = useCallback((side: 'left' | 'right', amount: number = 90) => {
    const velocityRef = side === 'left' ? barrelSpinVelocityLeft : barrelSpinVelocityRight;
    velocityRef.current = Math.min(velocityRef.current + amount, 140);
  }, []);

  // マテリアル（メモ化）
  const barrelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: GUN_BARREL_COLOR, roughness: 0.6, metalness: 0.4,
  }), []);
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: GUN_BODY_COLOR, roughness: 0.5, metalness: 0.3,
  }), []);
  const mountMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: GUN_MOUNT_COLOR, roughness: 0.7, metalness: 0.2,
  }), []);
  const sensorMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: 0x72dcff, emissive: 0x1686aa, emissiveIntensity: 1.15,
    roughness: 0.2, metalness: 0.15,
  }), []);
  const flashLeftMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: MUZZLE_FLASH_COLOR, transparent: true, opacity: 0,
    depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
  }), []);
  const flashRightMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: MUZZLE_FLASH_COLOR, transparent: true, opacity: 0,
    depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
  }), []);

  // ─── 射撃処理 ─────────────────────────────────────
  const fireGun = useCallback((side: 'left' | 'right') => {
    // ポーズ・死亡中は撃てない
    if (useGameStore.getState().phase !== 'playing') return;
    if (usePlayerStore.getState().isDead) return;
    const now = performance.now() / 1000;
    if (now - lastFireTime.current < GUN_CONSTANTS.FIRE_COOLDOWN) return;
    lastFireTime.current = now;

    const gunGroup = side === 'left' ? gunGroupLeftRef.current : gunGroupRightRef.current;
    const pivot = side === 'left' ? pivotLeftRef.current : pivotRightRef.current;
    const yawRef = side === 'left' ? yawLeftRef : yawRightRef;
    const pitchRef = side === 'left' ? pitchLeftRef : pitchRightRef;

    // 発射直前に銃をカメラ照準へ即時スナップ → 銃身方向と弾道を一致させる
    if (pivot) {
      snapGunPivotToCamera(pivot, camera, yawRef, pitchRef);
    }

    let startPos: THREE.Vector3;
    if (gunGroup) {
      const pose = getMuzzleWorldPose(gunGroup);
      startPos = pose.position;
      // 弾道 = 銃身のワールド前方（カメラ前方ではない）
      shootDir.current.copy(pose.direction);
    } else {
      // フォールバック: カメラ前方
      startPos = camera.position.clone();
      shootDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    }

    // ごく小さい散布（見た目の同期を崩さない範囲）
    if (GUN_SPREAD > 0) {
      shootDir.current.x += (Math.random() - 0.5) * GUN_SPREAD;
      shootDir.current.y += (Math.random() - 0.5) * GUN_SPREAD;
      shootDir.current.z += (Math.random() - 0.5) * GUN_SPREAD;
      shootDir.current.normalize();
    }

    // 弾丸を生成
    const vel = shootDir.current.clone().multiplyScalar(BULLET_SPEED);
    const projectile: Projectile = {
      id: nextId++,
      pos: startPos,
      vel,
      createdAt: now,
      prevPositions: [startPos.clone()],
      side,
      dead: false,
      isRemote: false,
    };

    setProjectiles((prev) => [...prev, projectile]);

    // サウンド再生（カメラからの距離）
    playMachineGunSound(startPos.distanceTo(camera.position));

    // マズルフラッシュ
    if (side === 'left') {
      flashTimerLeft.current = 0.08;
    } else {
      flashTimerRight.current = 0.08;
    }
    boostBarrelSpin(side);

    // サーバーに発射データを送信（他プレイヤーの弾道表示用）
    const sendGunFire = useMultiplayerStore.getState().sendGunFire;
    sendGunFire(
      [startPos.x, startPos.y, startPos.z],
      [shootDir.current.x, shootDir.current.y, shootDir.current.z],
      side,
    );
  }, [boostBarrelSpin, camera]);

  // ─── マウスイベント ───────────────────────────────
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) isMouseDown.current = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) isMouseDown.current = false;
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // ─── リモートプレイヤーの弾丸受信 ─────────────────
  useEffect(() => {
    const unsubscribe = onRemoteGunFire((data) => {
      const now = performance.now() / 1000;
      const startPos = new THREE.Vector3(data.pos[0], data.pos[1], data.pos[2]);
      const dir = new THREE.Vector3(data.dir[0], data.dir[1], data.dir[2]).normalize();
      const vel = dir.clone().multiplyScalar(BULLET_SPEED);

      const projectile: Projectile = {
        id: nextId++,
        pos: startPos,
        vel,
        createdAt: now,
        prevPositions: [startPos.clone()],
        side: data.side,
        dead: false,
        isRemote: true,
      };

      setProjectiles((prev) => [...prev, projectile]);

      // リモートプレイヤーの発射時にも音を鳴らす
      playMachineGunSound(startPos.distanceTo(camera.position));

      // リモート弾のマズルフラッシュも発火
      if (data.side === 'left') {
        flashTimerLeft.current = 0.08;
      } else {
        flashTimerRight.current = 0.08;
      }
      boostBarrelSpin(data.side, 72);
    });
    return unsubscribe;
  }, [boostBarrelSpin, camera]);

  // ─── インパクトエフェクト生成ヘルパー ─────────────
  const spawnImpact = useCallback((
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    type: 'block' | 'mob',
  ) => {
    const particles: ImpactEffect['particles'] = [];
    for (let i = 0; i < IMPACT_PARTICLE_COUNT; i++) {
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 4,
      );
      spread.addScaledVector(normal, Math.random() * 3);
      particles.push({
        vel: spread,
        pos: pos.clone(),
        size: 0.05 + Math.random() * 0.1,
      });
    }
    const effect: ImpactEffect = {
      id: nextId++,
      pos: pos.clone(),
      normal: normal.clone(),
      type,
      createdAt: performance.now() / 1000,
      particles,
    };
    setImpacts((prev) => [...prev, effect]);

    // 着弾音再生
    playBulletImpactSound(pos.distanceTo(camera.position), type);
  }, [camera]);

  // ─── フレーム更新 ─────────────────────────────────
  useFrame((_, delta) => {
    const now = performance.now() / 1000;
    const getBlock = useWorldStore.getState().getBlock;
    const mobs = useMobStore.getState().mobs;

    // マズルフラッシュ減衰
    if (flashTimerLeft.current > 0) {
      flashTimerLeft.current -= delta;
      if (flashLeftRef.current) {
        const mat = flashLeftRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = flashTimerLeft.current > 0 ? 1 : 0;
      }
    }
    if (flashTimerRight.current > 0) {
      flashTimerRight.current -= delta;
      if (flashRightRef.current) {
        const mat = flashRightRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = flashTimerRight.current > 0 ? 1 : 0;
      }
    }

    const spinDamping = Math.exp(-5.2 * delta);
    barrelSpinVelocityLeft.current *= spinDamping;
    barrelSpinVelocityRight.current *= spinDamping;
    barrelSpinLeft.current = (barrelSpinLeft.current + barrelSpinVelocityLeft.current * delta) % (Math.PI * 2);
    barrelSpinRight.current = (barrelSpinRight.current + barrelSpinVelocityRight.current * delta) % (Math.PI * 2);

    // 弾丸の物理更新
    setProjectiles((prev) => {
      const alive: Projectile[] = [];
      for (const proj of prev) {
        if (proj.dead) { continue; }
        const age = now - proj.createdAt;
        if (age > BULLET_MAX_AGE) { continue; }

        // 前フレームの位置を記録（トレイル用、最大6点を保持）
        proj.prevPositions.push(proj.pos.clone());
        if (proj.prevPositions.length > 10) proj.prevPositions.shift();

        // 重力を適用
        proj.vel.y -= BULLET_GRAVITY * delta;

        // 共通レイマーチングで衝突判定
        const moveDir = proj.vel.clone().normalize();
        const moveDist = BULLET_SPEED * delta;
        const fromX = proj.pos.x;
        const fromY = proj.pos.y;
        const fromZ = proj.pos.z;

        // ローカル弾のみダメージ判定あり、リモート弾は視覚のみ
        const hitResult = rayMarchProjectile(
          proj.pos,
          moveDir,
          moveDist,
          getBlock,
          proj.isRemote ? [] : mobs,
          MOB_HIT_RADIUS,
          proj.isRemote ? undefined : {
            remotePlayers: useMultiplayerStore.getState().remotePlayers as Map<string, RemotePlayerTarget>,
            playerHitRadius: PLAYER_HIT_RADIUS,
            playerHitHeight: PLAYER_HIT_HEIGHT,
          },
        );

        if (hitResult.type === 'block') {
          spawnImpact(hitResult.hitPos, hitResult.normal, 'block');
          proj.dead = true;
        } else if (hitResult.type === 'mob' && hitResult.targetId) {
          spawnImpact(hitResult.hitPos, hitResult.normal, 'mob');
          const sendMobDamage = useMultiplayerStore.getState().sendMobDamage;
          // 銃撃はノックバックなし（接近を止めない）
          sendMobDamage(hitResult.targetId, GUN_CONSTANTS.DAMAGE, 0, 0);
          useMobStore.getState().damageMob(hitResult.targetId, GUN_CONSTANTS.DAMAGE, 0, 0);
          const mob = mobs.find(m => m.id === hitResult.targetId);
          if (mob) spawnDamagePopup(GUN_CONSTANTS.DAMAGE, mob.x, mob.y + 1.0, mob.z, false);
          proj.dead = true;
        } else if (hitResult.type === 'player' && hitResult.targetId) {
          spawnImpact(hitResult.hitPos, hitResult.normal, 'mob');
          const rp = useMultiplayerStore.getState().remotePlayers.get(hitResult.targetId);
          if (rp) {
            const sendPlayerAttack = useMultiplayerStore.getState().sendPlayerAttack;
            sendPlayerAttack(rp.id, GUN_CONSTANTS.DAMAGE, moveDir.x * 3, moveDir.z * 3);
            spawnDamagePopup(GUN_CONSTANTS.DAMAGE, rp.position[0], rp.position[1] + 1.0, rp.position[2], false);
          }
          proj.dead = true;
        } else if (!proj.isRemote) {
          // ヘリの機関銃でも他乗り物へダメージ（自分のヘリは除外）
          const vehicleHit = checkProjectileHitVehicle(
            proj.pos.x, proj.pos.y, proj.pos.z,
            'helicopter',
            fromX, fromY, fromZ,
          );
          if (vehicleHit) {
            useVehicleStore.getState().damageVehicle(vehicleHit.type, GUN_CONSTANTS.DAMAGE);
            spawnImpact(
              new THREE.Vector3(vehicleHit.hitX, vehicleHit.hitY, vehicleHit.hitZ),
              moveDir.clone().negate(),
              'mob',
            );
            spawnDamagePopup(GUN_CONSTANTS.DAMAGE, vehicleHit.hitX, vehicleHit.hitY + 0.5, vehicleHit.hitZ, false);
            proj.dead = true;
          }
        }

        if (!proj.dead) {
          alive.push(proj);
        }
      }

      return alive;
    });

    // インパクトエフェクト期限切れ除去
    setImpacts((prev) => {
      const filtered = prev.filter((e) => now - e.createdAt < IMPACT_LIFETIME);
      if (filtered.length === prev.length) return prev;
      return filtered;
    });

    // ガンナー席の射撃（デスクトップ左クリック / モバイル機銃ボタン）
    // ポーズ・死亡・入力無効時は完全停止
    if (useGameStore.getState().phase !== 'playing' || usePlayerStore.getState().isDead) {
      isMouseDown.current = false;
      return;
    }
    const isGunner = mySeat === 'gunner_left' || mySeat === 'gunner_right';
    const desktopFiring = isMouseDown.current && isDesktopGameplayInputActive();
    const mobileFiring = mobileActions.vehicleGun;
    if (isGunner && (desktopFiring || mobileFiring)) {
      // 180度回転グループ内でモデルの左右が反転するため、
      // gunner_left（ワールド左）→ モデル right銃（ワールド左）
      // gunner_right（ワールド右）→ モデル left銃（ワールド右）
      fireGun(mySeat === 'gunner_left' ? 'right' : 'left');
    }
  });

  // モデル座標は180度反転しているため、座席と表示側をここで一度だけ対応付ける。
  const myGunSide =
    mySeat === 'gunner_left' ? 'right' :
    mySeat === 'gunner_right' ? 'left' : null;

  return (
    <group>
      {/* === 銃モデルはヘリがスポーンしている場合のみ表示 === */}
      {helicopterSpawned && (
        <>
          {/* === 左機関銃（ドア位置に設置、ガンナー視点追従） === */}
          <DoorMountedGun
            side="left"
            isMyGun={myGunSide === 'left'}
            flashRef={flashLeftRef}
            gunGroupRef={gunGroupLeftRef}
            pivotRef={pivotLeftRef}
            yawRef={yawLeftRef}
            pitchRef={pitchLeftRef}
            barrelSpinRef={barrelSpinLeft}
            barrelMat={barrelMat}
            bodyMat={bodyMat}
            mountMat={mountMat}
            sensorMat={sensorMat}
            flashMat={flashLeftMat}
          />
          {/* === 右機関銃（ドア位置に設置、ガンナー視点追従） === */}
          <DoorMountedGun
            side="right"
            isMyGun={myGunSide === 'right'}
            flashRef={flashRightRef}
            gunGroupRef={gunGroupRightRef}
            pivotRef={pivotRightRef}
            yawRef={yawRightRef}
            pitchRef={pitchRightRef}
            barrelSpinRef={barrelSpinRight}
            barrelMat={barrelMat}
            bodyMat={bodyMat}
            mountMat={mountMat}
            sensorMat={sensorMat}
            flashMat={flashRightMat}
          />
        </>
      )}
      {/* === 飛翔中の弾丸 + トレイル（リモート含む、常に描画） === */}
      {projectiles.map((proj) => (
        <ProjectileTrail key={proj.id} projectile={proj} />
      ))}
      {/* === 衝突エフェクト（パーティクル、常に描画） === */}
      {impacts.map((effect) => (
        <ImpactParticles key={effect.id} effect={effect} />
      ))}
    </group>
  );
}

// ────────────────────────────────────────────────────────
// ドア設置型機関銃 — ヘリのドア位置に固定し、ガンナーの視点方向に回転
// ────────────────────────────────────────────────────────
function DoorMountedGun({
  side,
  isMyGun,
  flashRef,
  gunGroupRef,
  pivotRef,
  yawRef,
  pitchRef,
  barrelSpinRef,
  barrelMat,
  bodyMat,
  mountMat,
  sensorMat,
  flashMat,
}: {
  side: 'left' | 'right';
  isMyGun: boolean;
  flashRef: React.RefObject<THREE.Mesh | null>;
  gunGroupRef: React.RefObject<THREE.Group | null>;
  pivotRef: React.RefObject<THREE.Group | null>;
  yawRef: React.MutableRefObject<number>;
  pitchRef: React.MutableRefObject<number>;
  barrelSpinRef: React.MutableRefObject<number>;
  barrelMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshStandardMaterial;
  mountMat: THREE.MeshStandardMaterial;
  sensorMat: THREE.MeshStandardMaterial;
  flashMat: THREE.MeshBasicMaterial;
}) {
  const { camera } = useThree();
  // 銃全体のルートグループ（位置・回転を毎フレーム同期）
  const rootRef = useRef<THREE.Group>(null);

  // 毎フレーム、ヘリの最新位置に銃の位置を同期（stale prop 回避）
  // priority 高め: 銃の姿勢更新を射撃より先に行う
  useFrame(() => {
    if (!rootRef.current) return;
    const heli = useVehicleStore.getState().helicopter;
    if (!heli.spawned) {
      rootRef.current.visible = false;
      return;
    }
    rootRef.current.visible = true;
    rootRef.current.position.set(heli.x, heli.y, heli.z);
    rootRef.current.rotation.set(heli.pitch, heli.rotationY, heli.roll);
  }, 1);

  const mountPos = GUN_MOUNT_POSITIONS[side];

  return (
    <group ref={rootRef} scale={1.3}>
      {/* ヘリモデル内部座標系（180度回転） */}
      <group rotation={[0, Math.PI, 0]}>
        {/* 銃マウント位置 */}
        <group position={[mountPos.x, mountPos.y, mountPos.z]}>
          {/* 固定マウントベース（ドアフレーム） */}
          <mesh
            geometry={DOOR_MOUNT_GEOMETRY}
            material={mountMat}
            receiveShadow
          />
          {/* 旋回ピボット（ここで回転する） — gunGroupRef を割り当て */}
          <GunPivot
            pivotRef={pivotRef}
            gunGroupRef={gunGroupRef}
            isMyGun={isMyGun}
            flashRef={flashRef}
            barrelSpinRef={barrelSpinRef}
            barrelMat={barrelMat}
            bodyMat={bodyMat}
            mountMat={mountMat}
            sensorMat={sensorMat}
            flashMat={flashMat}
            camera={camera}
            currentYawRef={yawRef}
            currentPitchRef={pitchRef}
          />
        </group>
      </group>
    </group>
  );
}

// ────────────────────────────────────────────────────────
// 銃のピボット（回転部分）— useFrame で視点追従
// ────────────────────────────────────────────────────────
function GunPivot({
  pivotRef,
  gunGroupRef,
  isMyGun,
  flashRef,
  barrelSpinRef,
  barrelMat,
  bodyMat,
  mountMat,
  sensorMat,
  flashMat,
  camera,
  currentYawRef,
  currentPitchRef,
}: {
  pivotRef: React.RefObject<THREE.Group | null>;
  gunGroupRef: React.RefObject<THREE.Group | null>;
  isMyGun: boolean;
  flashRef: React.RefObject<THREE.Mesh | null>;
  barrelSpinRef: React.MutableRefObject<number>;
  barrelMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshStandardMaterial;
  mountMat: THREE.MeshStandardMaterial;
  sensorMat: THREE.MeshStandardMaterial;
  flashMat: THREE.MeshBasicMaterial;
  camera: THREE.Camera;
  currentYawRef: React.MutableRefObject<number>;
  currentPitchRef: React.MutableRefObject<number>;
}) {
  const barrelClusterRef = useRef<THREE.Group>(null);

  // priority 1: 射撃処理より先に銃口をカメラへ合わせる
  useFrame((_, delta) => {
    if (!pivotRef.current) return;

    if (barrelClusterRef.current) {
      barrelClusterRef.current.rotation.z = barrelSpinRef.current;
    }

    if (isMyGun) {
      const parent = pivotRef.current.parent;
      if (!parent) return;

      // ヘリの pitch/roll/180°回転込みで、ピボット親ローカルにカメラ前方を写像
      const aim = computeGunAimFromCamera(parent, camera);

      // ほぼ即時追従（わずかな補間でカクつきを抑える）
      const lerpT = 1 - Math.exp(-28 * delta);
      currentYawRef.current += (aim.yaw - currentYawRef.current) * lerpT;
      currentPitchRef.current += (aim.pitch - currentPitchRef.current) * lerpT;

      pivotRef.current.rotation.set(currentPitchRef.current, currentYawRef.current, 0);
    } else {
      // 自分のガンでない場合は正面向きへ戻す
      const lerpT = 1 - Math.exp(-5 * delta);
      currentYawRef.current *= (1 - lerpT);
      currentPitchRef.current *= (1 - lerpT);
      pivotRef.current.rotation.set(currentPitchRef.current, currentYawRef.current, 0);
    }
  }, 1);

  return (
    <group ref={pivotRef}>
      {/* 銃本体のグループ（ワールドマトリクス取得用） */}
      <group ref={gunGroupRef}>
        <mesh
          geometry={GUN_TRUNNION_GEOMETRY}
          material={mountMat}
          receiveShadow
        />
        <mesh
          geometry={GUN_RECEIVER_GEOMETRY}
          material={bodyMat}
          castShadow
          receiveShadow
        />
        <mesh geometry={GUN_SENSOR_GEOMETRY} material={sensorMat} />
        <group ref={barrelClusterRef} position={[0, 0.035, 0.49]}>
          <mesh
            geometry={GUN_BARREL_CLUSTER_GEOMETRY}
            material={barrelMat}
          />
        </group>
        {/* マズルフラッシュ */}
        <mesh
          ref={flashRef}
          geometry={MUZZLE_FLASH_GEOMETRY}
          position={[0, 0.035, 1.12]}
          material={flashMat}
        />
      </group>
    </group>
  );
}

// ────────────────────────────────────────────────────────
// 弾丸 + トレイル描画（太く明るいトレイル）
// ────────────────────────────────────────────────────────
function ProjectileTrail({ projectile }: { projectile: Projectile }) {
  const groupRef = useRef<THREE.Group>(null);
  const bulletRef = useRef<THREE.Mesh>(null);
  const glowBulletRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.Mesh>(null);
  const glowTrailRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!groupRef.current || !bulletRef.current) return;

    // 弾頭の位置を更新
    bulletRef.current.position.copy(projectile.pos);
    if (glowBulletRef.current) {
      glowBulletRef.current.position.copy(projectile.pos);
    }

    // トレイル（弾の尾）を計算
    if (projectile.prevPositions.length >= 2) {
      const tailPos = projectile.prevPositions[0];
      const headPos = projectile.pos;
      const dir = headPos.clone().sub(tailPos);
      const len = Math.min(dir.length(), TRAIL_LENGTH);

      if (len > 0.1) {
        const mid = tailPos.clone().add(headPos).multiplyScalar(0.5);

        // Y軸 → 弾道方向へ回転
        const up = new THREE.Vector3(0, 1, 0);
        const dirNorm = dir.clone().normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dirNorm);

        // コアトレイル
        if (trailRef.current) {
          trailRef.current.position.copy(mid);
          trailRef.current.quaternion.copy(quat);
          trailRef.current.scale.set(1, len, 1);
          trailRef.current.visible = true;
        }

        // グロー（外側の光芒）
        if (glowTrailRef.current) {
          glowTrailRef.current.position.copy(mid);
          glowTrailRef.current.quaternion.copy(quat);
          glowTrailRef.current.scale.set(1, len, 1);
          glowTrailRef.current.visible = true;
        }
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* 弾頭コア */}
      <mesh ref={bulletRef} position={projectile.pos}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshBasicMaterial color={SPARK_COLOR} transparent opacity={0.98} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* 弾頭の外側グロー */}
      <mesh ref={glowBulletRef} position={projectile.pos}>
        <sphereGeometry args={[0.42, 8, 8]} />
        <meshBasicMaterial
          color={TRACER_COLOR}
          transparent
          opacity={0.52}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* コアトレイル（白芯） */}
      <mesh ref={trailRef} visible={false}>
        <cylinderGeometry args={[0.07, 0.02, 1, 8]} />
        <meshBasicMaterial
          color="#fff8d0"
          transparent
          opacity={0.95}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* グロートレイル（外側の太い光芒） */}
      <mesh ref={glowTrailRef} visible={false}>
        <cylinderGeometry args={[0.22, 0.05, 1, 8]} />
        <meshBasicMaterial
          color={TRACER_GLOW_COLOR}
          transparent
          opacity={0.42}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

// ────────────────────────────────────────────────────────
// 衝突エフェクト（パーティクル散乱）
// ────────────────────────────────────────────────────────
function ImpactParticles({ effect }: { effect: ImpactEffect }) {
  const groupRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<THREE.Mesh[]>([]);
  const flashRef = useRef<THREE.Mesh>(null);
  const particleStateRef = useRef(
    effect.particles.map((particle) => ({
      vel: particle.vel.clone(),
      pos: particle.pos.clone(),
      size: particle.size,
    })),
  );

  useFrame(() => {
    const now = performance.now() / 1000;
    const age = now - effect.createdAt;
    const progress = age / IMPACT_LIFETIME;
    if (progress >= 1) return;

    const dt = 1 / 60;
    for (let i = 0; i < particleStateRef.current.length; i++) {
      const p = particleStateRef.current[i];
      p.vel.y -= 12 * dt;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;
      p.vel.multiplyScalar(0.96);

      const mesh = particlesRef.current[i];
      if (mesh) {
        mesh.position.copy(p.pos);
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 1 - progress * 1.5);
        const s = p.size * Math.max(0.2, 1 - progress);
        mesh.scale.setScalar(s / p.size);
      }
    }

    if (flashRef.current) {
      const flashProgress = age / HIT_FLASH_LIFETIME;
      if (flashProgress < 1) {
        flashRef.current.visible = true;
        const flashScale = 0.3 + flashProgress * 0.5;
        flashRef.current.scale.setScalar(flashScale);
        const mat = flashRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 1 - flashProgress);
      } else {
        flashRef.current.visible = false;
      }
    }
  });

  const isBlock = effect.type === 'block';
  const mainColor = isBlock ? BLOCK_IMPACT_COLOR : MOB_HIT_COLOR;

  return (
    <group ref={groupRef}>
      {/* ヒットフラッシュ */}
      <mesh ref={flashRef} position={effect.pos.clone()}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial
          color={isBlock ? 0xffddaa : 0xff6633}
          transparent
          opacity={1}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* パーティクル群 */}
      {effect.particles.map((p, i) => (
        <mesh
          key={i}
          ref={(el) => { if (el) particlesRef.current[i] = el; }}
          position={p.pos.clone()}
        >
          <boxGeometry args={[p.size, p.size, p.size]} />
          <meshBasicMaterial
            color={i % 3 === 0 ? SPARK_COLOR : mainColor}
            transparent
            opacity={1}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* ブロック衝突: 破片 */}
      {isBlock && (
        <>
          <mesh position={effect.pos.clone()}>
            <boxGeometry args={[0.15, 0.15, 0.15]} />
            <meshBasicMaterial color={0x886633} transparent opacity={0.8} depthWrite={false} />
          </mesh>
          <mesh position={[effect.pos.x + 0.1, effect.pos.y + 0.05, effect.pos.z - 0.1]}>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
            <meshBasicMaterial color={0x997744} transparent opacity={0.6} depthWrite={false} />
          </mesh>
        </>
      )}

      {/* モブ衝突: ヒットマーカー */}
      {!isBlock && (
        <group position={effect.pos.clone()}>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.4, 0.06, 0.06]} />
            <meshBasicMaterial color={0xff0000} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.4, 0.06, 0.06]} />
            <meshBasicMaterial color={0xff0000} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}
