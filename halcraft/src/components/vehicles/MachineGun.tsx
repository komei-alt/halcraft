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
import * as THREE from 'three';
import { useVehicleStore, GUN_CONSTANTS } from '../../stores/useVehicleStore';
import { useMobStore } from '../../stores/useMobStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { onRemoteGunFire } from '../../stores/useMultiplayerStore';
import { useWorldStore } from '../../stores/useWorldStore';
import { spawnDamagePopup } from '../../utils/effectTriggers';
import { rayMarchProjectile, type RemotePlayerTarget } from '../../utils/projectilePhysics';
import { playMachineGunSound, playBulletImpactSound } from '../../utils/sounds';

// ─── 定数 ──────────────────────────────────────────────
/** 弾速（ブロック/秒） */
const BULLET_SPEED = 120;
/** 弾の最大生存時間（秒） */
const BULLET_MAX_AGE = 1.0;
/** トレイル（残光）の長さ（ブロック） */
const TRAIL_LENGTH = 4.0;
/** 弾のヒット半径（モブ当たり判定） */
const MOB_HIT_RADIUS = 1.2;
/** インパクトパーティクルの数 */
const IMPACT_PARTICLE_COUNT = 8;
/** インパクトパーティクルの表示時間（秒） */
const IMPACT_LIFETIME = 0.5;
/** ヒットフラッシュの表示時間（秒） */
const HIT_FLASH_LIFETIME = 0.15;
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
const MUZZLE_LOCAL_OFFSET = new THREE.Vector3(0, 0, 0.85);

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
  const helicopter = useVehicleStore((s) => s.helicopter);
  const mySeat = helicopter.mySeat;
  const { camera } = useThree();

  // 発射クールダウン
  const lastFireTime = useRef(0);
  const isMouseDown = useRef(false);

  // マズルフラッシュ
  const flashLeftRef = useRef<THREE.Mesh>(null);
  const flashRightRef = useRef<THREE.Mesh>(null);
  const flashTimerLeft = useRef(0);
  const flashTimerRight = useRef(0);

  // 銃モデルのグループ参照（ワールド座標取得用）
  const gunGroupLeftRef = useRef<THREE.Group>(null);
  const gunGroupRightRef = useRef<THREE.Group>(null);

  // 弾丸（プロジェクタイル）とエフェクト
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [impacts, setImpacts] = useState<ImpactEffect[]>([]);

  // 射撃方向のワーク用ベクトル
  const shootDir = useRef(new THREE.Vector3());
  // マズルのワールド座標計算用
  const muzzleWorldPos = useRef(new THREE.Vector3());

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
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: MUZZLE_FLASH_COLOR, transparent: true, opacity: 0,
  }), []);

  // ─── 射撃処理 ─────────────────────────────────────
  const fireGun = useCallback((side: 'left' | 'right') => {
    const now = performance.now() / 1000;
    if (now - lastFireTime.current < GUN_CONSTANTS.FIRE_COOLDOWN) return;
    lastFireTime.current = now;

    // 照準方向 = カメラの前方
    shootDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);

    // 弾の初期位置 = 銃口（マズル）のワールド座標
    const gunGroup = side === 'left' ? gunGroupLeftRef.current : gunGroupRightRef.current;
    let startPos: THREE.Vector3;

    if (gunGroup) {
      // 銃グループのワールドマトリクスからマズル位置を算出
      gunGroup.updateWorldMatrix(true, false);
      muzzleWorldPos.current.copy(MUZZLE_LOCAL_OFFSET);
      muzzleWorldPos.current.applyMatrix4(gunGroup.matrixWorld);
      startPos = muzzleWorldPos.current.clone();
    } else {
      // フォールバック: カメラ位置
      startPos = camera.position.clone();
    }

    // わずかなランダム散布（リアリティ向上）
    const spread = 0.015;
    shootDir.current.x += (Math.random() - 0.5) * spread;
    shootDir.current.y += (Math.random() - 0.5) * spread;
    shootDir.current.z += (Math.random() - 0.5) * spread;
    shootDir.current.normalize();

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

    // サーバーに発射データを送信（他プレイヤーの弾道表示用）
    const sendGunFire = useMultiplayerStore.getState().sendGunFire;
    sendGunFire(
      [startPos.x, startPos.y, startPos.z],
      [shootDir.current.x, shootDir.current.y, shootDir.current.z],
      side,
    );
  }, [camera]);

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
    });
    return unsubscribe;
  }, []);

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

    // 弾丸の物理更新
    setProjectiles((prev) => {
      const alive: Projectile[] = [];
      for (const proj of prev) {
        if (proj.dead) { continue; }
        const age = now - proj.createdAt;
        if (age > BULLET_MAX_AGE) { continue; }

        // 前フレームの位置を記録（トレイル用、最大6点を保持）
        proj.prevPositions.push(proj.pos.clone());
        if (proj.prevPositions.length > 6) proj.prevPositions.shift();

        // 重力を適用
        proj.vel.y -= BULLET_GRAVITY * delta;

        // 共通レイマーチングで衝突判定
        const moveDir = proj.vel.clone().normalize();
        const moveDist = BULLET_SPEED * delta;

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
          sendMobDamage(hitResult.targetId, GUN_CONSTANTS.DAMAGE, moveDir.x * 3, moveDir.z * 3);
          useMobStore.getState().damageMob(hitResult.targetId, GUN_CONSTANTS.DAMAGE, moveDir.x, moveDir.z);
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

    // ガンナー席の射撃（左クリック長押し対応）
    const isGunner = mySeat === 'gunner_left' || mySeat === 'gunner_right';
    const hasPointerLock = !!document.pointerLockElement;
    if (isGunner && isMouseDown.current && hasPointerLock) {
      // 180度回転グループ内でモデルの左右が反転するため、
      // gunner_left（ワールド左）→ モデル right銃（ワールド左）
      // gunner_right（ワールド右）→ モデル left銃（ワールド右）
      fireGun(mySeat === 'gunner_left' ? 'right' : 'left');
    }
  });

  return (
    <group>
      {/* === 銃モデルはヘリがスポーンしている場合のみ表示 === */}
      {helicopter.spawned && (
        <>
          {/* === 左機関銃（ドア位置に設置、ガンナー視点追従） === */}
          <DoorMountedGun
            side="left"
            flashRef={flashLeftRef}
            gunGroupRef={gunGroupLeftRef}
            barrelMat={barrelMat}
            bodyMat={bodyMat}
            mountMat={mountMat}
            flashMat={flashMat}
          />
          {/* === 右機関銃（ドア位置に設置、ガンナー視点追従） === */}
          <DoorMountedGun
            side="right"
            flashRef={flashRightRef}
            gunGroupRef={gunGroupRightRef}
            barrelMat={barrelMat}
            bodyMat={bodyMat}
            mountMat={mountMat}
            flashMat={flashMat}
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
  flashRef,
  gunGroupRef,
  barrelMat,
  bodyMat,
  mountMat,
  flashMat,
}: {
  side: 'left' | 'right';
  flashRef: React.RefObject<THREE.Mesh | null>;
  gunGroupRef: React.RefObject<THREE.Group | null>;
  barrelMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshStandardMaterial;
  mountMat: THREE.MeshStandardMaterial;
  flashMat: THREE.MeshBasicMaterial;
}) {
  const helicopter = useVehicleStore((s) => s.helicopter);
  const { camera } = useThree();
  // 銃全体のルートグループ（位置・回転を毎フレーム同期）
  const rootRef = useRef<THREE.Group>(null);
  // 銃の回転部分（ピボット）の参照
  const pivotRef = useRef<THREE.Group>(null);

  // 回転計算用のワークベクトル
  const targetDir = useRef(new THREE.Vector3());
  const localDir = useRef(new THREE.Vector3());
  const currentYaw = useRef(0);
  const currentPitch = useRef(0);

  // 毎フレーム、ヘリの最新位置に銃の位置を同期（stale prop 回避）
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
  });

  if (!helicopter.spawned) return null;

  const mountPos = GUN_MOUNT_POSITIONS[side];

  // ガンナーが自分のサイドに座っている場合のみ視点追従
  // 180度回転グループ内でモデルの左右がワールドで反転するため:
  //   gunner_left （ワールド左側に座る）→ モデル right銃（ワールド左側）にリンク
  //   gunner_right（ワールド右側に座る）→ モデル left銃（ワールド右側）にリンク
  const myGunSide =
    helicopter.mySeat === 'gunner_left' ? 'right' :
    helicopter.mySeat === 'gunner_right' ? 'left' : null;
  const isMyGun = myGunSide === side;

  return (
    <group ref={rootRef} scale={1.3}>
      {/* ヘリモデル内部座標系（180度回転） */}
      <group rotation={[0, Math.PI, 0]}>
        {/* 銃マウント位置 */}
        <group position={[mountPos.x, mountPos.y, mountPos.z]}>
          {/* 固定マウントベース（ドアフレーム） */}
          <mesh material={mountMat}>
            <boxGeometry args={[0.25, 0.08, 0.25]} />
          </mesh>
          {/* 旋回ピボット（ここで回転する） — gunGroupRef を割り当て */}
          <GunPivot
            pivotRef={pivotRef}
            gunGroupRef={gunGroupRef}
            isMyGun={isMyGun}
            flashRef={flashRef}
            barrelMat={barrelMat}
            bodyMat={bodyMat}
            mountMat={mountMat}
            flashMat={flashMat}
            camera={camera}
            targetDir={targetDir}
            localDir={localDir}
            currentYaw={currentYaw}
            currentPitch={currentPitch}
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
  barrelMat,
  bodyMat,
  mountMat,
  flashMat,
  camera,
  targetDir,
  localDir,
  currentYaw,
  currentPitch,
}: {
  pivotRef: React.RefObject<THREE.Group | null>;
  gunGroupRef: React.RefObject<THREE.Group | null>;
  isMyGun: boolean;
  flashRef: React.RefObject<THREE.Mesh | null>;
  barrelMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshStandardMaterial;
  mountMat: THREE.MeshStandardMaterial;
  flashMat: THREE.MeshBasicMaterial;
  camera: THREE.Camera;
  targetDir: React.MutableRefObject<THREE.Vector3>;
  localDir: React.MutableRefObject<THREE.Vector3>;
  currentYaw: React.MutableRefObject<number>;
  currentPitch: React.MutableRefObject<number>;
}) {

  useFrame((_, delta) => {
    if (!pivotRef.current) return;

    // 毎フレーム最新のヘリ状態を取得（prop 経由だと stale になる可能性あり）
    const heli = useVehicleStore.getState().helicopter;

    if (isMyGun) {
      // カメラの前方向をワールド座標で取得
      targetDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);

      // ヘリの回転の逆を適用してローカル座標系に変換
      // ヘリは rotationY で回転 + モデル内部で180度回転なので
      // ローカルZ正 = ノーズ方向。カメラの向きをヘリローカルに戻す
      const heliYaw = heli.rotationY + Math.PI; // モデルの180度回転を含む
      const cosY = Math.cos(-heliYaw);
      const sinY = Math.sin(-heliYaw);

      localDir.current.set(
        cosY * targetDir.current.x - sinY * targetDir.current.z,
        targetDir.current.y,
        sinY * targetDir.current.x + cosY * targetDir.current.z,
      );

      // ローカルYaw（水平角）とPitch（仰角）を算出
      const targetYaw = Math.atan2(localDir.current.x, localDir.current.z);
      const horizontalDist = Math.sqrt(
        localDir.current.x * localDir.current.x +
        localDir.current.z * localDir.current.z,
      );
      const targetPitch = -Math.atan2(localDir.current.y, horizontalDist);

      // 制限: 左銃は右方向、右銃は左方向にあまり回らないように
      const maxYaw = Math.PI * 0.7; // ±126度
      const clampedYaw = Math.max(-maxYaw, Math.min(maxYaw, targetYaw));
      const maxPitch = Math.PI * 0.35; // ±63度
      const clampedPitch = Math.max(-maxPitch, Math.min(maxPitch, targetPitch));

      // スムーズ補間
      const lerpSpeed = 12 * delta;
      currentYaw.current += (clampedYaw - currentYaw.current) * Math.min(1, lerpSpeed);
      currentPitch.current += (clampedPitch - currentPitch.current) * Math.min(1, lerpSpeed);

      pivotRef.current.rotation.set(currentPitch.current, currentYaw.current, 0);
    } else {
      // 自分のガンでない場合は正面向き
      const lerpSpeed = 5 * delta;
      currentYaw.current *= (1 - Math.min(1, lerpSpeed));
      currentPitch.current *= (1 - Math.min(1, lerpSpeed));
      pivotRef.current.rotation.set(currentPitch.current, currentYaw.current, 0);
    }
  });

  return (
    <group ref={pivotRef}>
      {/* 銃本体のグループ（ワールドマトリクス取得用） */}
      <group ref={gunGroupRef}>
        {/* 旋回台座（ピボット上部） */}
        <mesh material={mountMat} position={[0, 0.05, 0]}>
          <boxGeometry args={[0.18, 0.12, 0.18]} />
        </mesh>
        {/* 銃本体 */}
        <mesh position={[0, 0.0, 0.22]} material={bodyMat}>
          <boxGeometry args={[0.15, 0.12, 0.35]} />
        </mesh>
        {/* 銃身 */}
        <mesh position={[0, 0.0, 0.55]} material={barrelMat}>
          <boxGeometry args={[0.08, 0.08, 0.5]} />
        </mesh>
        {/* 銃身先端 */}
        <mesh position={[0, 0.0, 0.82]} material={barrelMat}>
          <boxGeometry args={[0.1, 0.1, 0.06]} />
        </mesh>
        {/* 弾薬ボックス */}
        <mesh position={[0, -0.12, 0.15]} material={bodyMat}>
          <boxGeometry args={[0.12, 0.1, 0.18]} />
        </mesh>
        {/* グリップ */}
        <mesh position={[0, -0.12, 0.35]} material={bodyMat}>
          <boxGeometry args={[0.06, 0.12, 0.06]} />
        </mesh>
        {/* マズルフラッシュ */}
        <mesh ref={flashRef} position={[0, 0.0, 0.9]} material={flashMat.clone()}>
          <boxGeometry args={[0.25, 0.25, 0.15]} />
        </mesh>
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
  const trailRef = useRef<THREE.Mesh>(null);
  const glowTrailRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!groupRef.current || !bulletRef.current) return;

    // 弾頭の位置を更新
    bulletRef.current.position.copy(projectile.pos);

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
      {/* 弾頭（明るい光る球 — より大きく） */}
      <mesh ref={bulletRef}>
        <sphereGeometry args={[0.15, 6, 6]} />
        <meshBasicMaterial color={SPARK_COLOR} transparent opacity={0.95} />
      </mesh>
      {/* 弾頭のグロー（外側の光芒） */}
      <mesh position={projectile.pos.clone()}>
        <sphereGeometry args={[0.35, 6, 6]} />
        <meshBasicMaterial color={TRACER_COLOR} transparent opacity={0.45} />
      </mesh>
      {/* コアトレイル（明るく太い） */}
      <mesh ref={trailRef} visible={false}>
        <cylinderGeometry args={[0.08, 0.03, 1, 6]} />
        <meshBasicMaterial color={TRACER_COLOR} transparent opacity={0.85} />
      </mesh>
      {/* グロートレイル（外側の太い光芒） */}
      <mesh ref={glowTrailRef} visible={false}>
        <cylinderGeometry args={[0.18, 0.06, 1, 6]} />
        <meshBasicMaterial color={TRACER_GLOW_COLOR} transparent opacity={0.35} />
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

  useFrame(() => {
    const now = performance.now() / 1000;
    const age = now - effect.createdAt;
    const progress = age / IMPACT_LIFETIME;
    if (progress >= 1) return;

    const dt = 1 / 60;
    for (let i = 0; i < effect.particles.length; i++) {
      const p = effect.particles[i];
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
          />
        </mesh>
      ))}

      {/* ブロック衝突: 破片 */}
      {isBlock && (
        <>
          <mesh position={effect.pos.clone()}>
            <boxGeometry args={[0.15, 0.15, 0.15]} />
            <meshBasicMaterial color={0x886633} transparent opacity={0.8} />
          </mesh>
          <mesh position={[effect.pos.x + 0.1, effect.pos.y + 0.05, effect.pos.z - 0.1]}>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
            <meshBasicMaterial color={0x997744} transparent opacity={0.6} />
          </mesh>
        </>
      )}

      {/* モブ衝突: ヒットマーカー */}
      {!isBlock && (
        <group position={effect.pos.clone()}>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.4, 0.06, 0.06]} />
            <meshBasicMaterial color={0xff0000} transparent opacity={0.9} />
          </mesh>
          <mesh rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.4, 0.06, 0.06]} />
            <meshBasicMaterial color={0xff0000} transparent opacity={0.9} />
          </mesh>
        </group>
      )}
    </group>
  );
}
