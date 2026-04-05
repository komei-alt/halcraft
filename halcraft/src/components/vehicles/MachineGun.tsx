// 機関銃コンポーネント
// ヘリコプターの左右に搭載されるボクセル風の機関銃
// 機関銃手席のプレイヤーが左クリックで発射
// レイキャストでモブにヒット判定、トレーサー弾エフェクト付き

import { useRef, useMemo, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useVehicleStore, GUN_CONSTANTS } from '../../stores/useVehicleStore';
import { useMobStore } from '../../stores/useMobStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';

/** 機関銃の色定義 */
const GUN_BARREL_COLOR = new THREE.Color(0x333333);  // 銃身（ダークグレー）
const GUN_BODY_COLOR = new THREE.Color(0x555555);    // 銃本体
const GUN_MOUNT_COLOR = new THREE.Color(0x444444);   // マウント
const MUZZLE_FLASH_COLOR = new THREE.Color(0xffaa33); // マズルフラッシュ
const TRACER_COLOR = new THREE.Color(0xffdd44);       // トレーサー弾

/** トレーサー弾の情報 */
interface TracerData {
  id: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  createdAt: number;
}

let tracerIdCounter = 0;

export function MachineGun() {
  const helicopter = useVehicleStore((s) => s.helicopter);
  const mySeat = helicopter.mySeat;
  const { camera } = useThree();

  // 発射クールダウン管理
  const lastFireTime = useRef(0);
  const isMouseDown = useRef(false);

  // マズルフラッシュ
  const flashLeftRef = useRef<THREE.Mesh>(null);
  const flashRightRef = useRef<THREE.Mesh>(null);
  const flashTimerLeft = useRef(0);
  const flashTimerRight = useRef(0);

  // トレーサー弾のステート
  const tracers = useRef<TracerData[]>([]);

  // レイキャスター
  const raycaster = useRef(new THREE.Raycaster());
  const shootDir = useRef(new THREE.Vector3());

  // マテリアル
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
    color: MUZZLE_FLASH_COLOR,
    transparent: true,
    opacity: 0,
  }), []);

  // 射撃処理
  const fireGun = useCallback((side: 'left' | 'right') => {
    const now = performance.now() / 1000;
    if (now - lastFireTime.current < GUN_CONSTANTS.FIRE_COOLDOWN) return;
    lastFireTime.current = now;

    // カメラの向きを射撃方向として使用
    shootDir.current.set(0, 0, -1);
    shootDir.current.applyQuaternion(camera.quaternion);

    const startPos = camera.position.clone();

    // レイキャストでモブへのヒット判定
    raycaster.current.set(startPos, shootDir.current);
    raycaster.current.far = GUN_CONSTANTS.RANGE;

    // モブストアからモブの位置を取得してヒット判定
    const mobs = useMobStore.getState().mobs;
    let hitMob: { id: string; distance: number } | null = null;
    const hitRadius = 0.8; // モブの当たり判定半径

    for (const mob of mobs) {
      // モブの中心位置
      const mobPos = new THREE.Vector3(mob.x, mob.y + 0.5, mob.z);
      // レイとモブの球体との交差判定
      const toMob = mobPos.clone().sub(startPos);
      const dot = toMob.dot(shootDir.current);

      if (dot < 0 || dot > GUN_CONSTANTS.RANGE) continue;

      // レイ上の最近接点
      const closest = startPos.clone().add(shootDir.current.clone().multiplyScalar(dot));
      const dist = closest.distanceTo(mobPos);

      if (dist < hitRadius) {
        if (!hitMob || dot < hitMob.distance) {
          hitMob = { id: mob.id, distance: dot };
        }
      }
    }

    // ヒット処理
    if (hitMob) {
      // ダメージ送信（マルチプレイ対応）
      const sendMobDamage = useMultiplayerStore.getState().sendMobDamage;
      sendMobDamage(hitMob.id, GUN_CONSTANTS.DAMAGE, shootDir.current.x * 3, shootDir.current.z * 3);
      // ローカルでもダメージ適用
      useMobStore.getState().damageMob(hitMob.id, GUN_CONSTANTS.DAMAGE, shootDir.current.x, shootDir.current.z);
    }

    // トレーサー弾エフェクト
    const endPos = hitMob
      ? startPos.clone().add(shootDir.current.clone().multiplyScalar(hitMob.distance))
      : startPos.clone().add(shootDir.current.clone().multiplyScalar(GUN_CONSTANTS.RANGE));

    tracers.current.push({
      id: tracerIdCounter++,
      start: startPos.clone(),
      end: endPos,
      createdAt: now,
    });

    // マズルフラッシュ
    if (side === 'left') {
      flashTimerLeft.current = 0.08;
    } else {
      flashTimerRight.current = 0.08;
    }
  }, [camera]);

  // マウスイベント（機関銃手席のみ）
  useFrame((_, delta) => {
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

    // トレーサー期限切れ除去
    const now = performance.now() / 1000;
    tracers.current = tracers.current.filter(
      (t) => now - t.createdAt < GUN_CONSTANTS.TRACER_LIFETIME,
    );

    // 機関銃手の射撃（左クリック長押し対応）
    const isGunner = mySeat === 'gunner_left' || mySeat === 'gunner_right';
    if (isGunner && isMouseDown.current) {
      fireGun(mySeat === 'gunner_left' ? 'left' : 'right');
    }
  });

  // マウスダウン/アップイベントの登録
  useFrame(() => {
    // フレームごとにイベント登録は不要 → useEffectに移す方がいいが
    // R3Fコンテキスト内ではuseEffectでcanvasアクセスしにくいため、
    // グローバルイベントで管理
  });

  // マウスイベントの直接登録
  const mouseHandlerAttached = useRef(false);
  if (!mouseHandlerAttached.current) {
    mouseHandlerAttached.current = true;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) isMouseDown.current = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) isMouseDown.current = false;
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
  }

  if (!helicopter.spawned) return null;

  return (
    <group>
      {/* === 左機関銃 === */}
      <GunModel
        side="left"
        flashRef={flashLeftRef}
        barrelMat={barrelMat}
        bodyMat={bodyMat}
        mountMat={mountMat}
        flashMat={flashMat}
      />
      {/* === 右機関銃 === */}
      <GunModel
        side="right"
        flashRef={flashRightRef}
        barrelMat={barrelMat}
        bodyMat={bodyMat}
        mountMat={mountMat}
        flashMat={flashMat}
      />
      {/* === トレーサー弾 === */}
      {tracers.current.map((tracer) => (
        <TracerLine key={tracer.id} start={tracer.start} end={tracer.end} />
      ))}
    </group>
  );
}

/** 機関銃3Dモデル（ボクセルスタイル） */
function GunModel({
  side,
  flashRef,
  barrelMat,
  bodyMat,
  mountMat,
  flashMat,
}: {
  side: 'left' | 'right';
  flashRef: React.RefObject<THREE.Mesh | null>;
  barrelMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshStandardMaterial;
  mountMat: THREE.MeshStandardMaterial;
  flashMat: THREE.MeshBasicMaterial;
}) {
  const xOffset = side === 'left' ? -1.0 : 1.0;
  const helicopter = useVehicleStore((s) => s.helicopter);

  if (!helicopter.spawned) return null;

  return (
    <group
      position={[helicopter.x, helicopter.y, helicopter.z]}
      rotation={[helicopter.pitch, helicopter.rotationY, helicopter.roll]}
      scale={1.3}
    >
      {/* モデルを180度回転（ノーズが-Z方向を向くため） */}
      <group rotation={[0, Math.PI, 0]}>
        <group position={[xOffset, 0.0, 0.4]}>
          {/* マウント（取り付け部） */}
          <mesh material={mountMat}>
            <boxGeometry args={[0.2, 0.15, 0.2]} />
          </mesh>
          {/* 銃本体（ボックス） */}
          <mesh position={[0, -0.1, 0.2]} material={bodyMat}>
            <boxGeometry args={[0.15, 0.12, 0.35]} />
          </mesh>
          {/* 銃身（細長い） */}
          <mesh position={[0, -0.1, 0.55]} material={barrelMat}>
            <boxGeometry args={[0.08, 0.08, 0.5]} />
          </mesh>
          {/* 銃身先端 */}
          <mesh position={[0, -0.1, 0.82]} material={barrelMat}>
            <boxGeometry args={[0.1, 0.1, 0.06]} />
          </mesh>
          {/* 弾薬ボックス（銃の下） */}
          <mesh position={[0, -0.22, 0.15]} material={bodyMat}>
            <boxGeometry args={[0.12, 0.1, 0.18]} />
          </mesh>
          {/* マズルフラッシュ */}
          <mesh
            ref={flashRef}
            position={[0, -0.1, 0.9]}
            material={flashMat.clone()}
          >
            <boxGeometry args={[0.2, 0.2, 0.15]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** トレーサー弾のライン */
function TracerLine({ start, end }: { start: THREE.Vector3; end: THREE.Vector3 }) {
  const lineRef = useRef<THREE.Line>(null);

  const geometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints([start, end]);
  }, [start, end]);

  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: TRACER_COLOR, linewidth: 2, transparent: true, opacity: 0.8 }),
    [],
  );

  const line = useMemo(() => {
    return new THREE.Line(geometry, material);
  }, [geometry, material]);

  return <primitive ref={lineRef} object={line} />;
}
