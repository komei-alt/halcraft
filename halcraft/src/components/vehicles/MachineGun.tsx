// 機関銃コンポーネント
// ヘリコプターの左右に搭載されるボクセル風の機関銃
// ガンナー席のプレイヤーが左クリックで発射
// レイキャストでモブにヒット判定
// 3Dメッシュによる太くて視認しやすいトレーサー弾エフェクト

import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
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

  // トレーサー弾 — useState で管理して再レンダリングをトリガー
  const [tracers, setTracers] = useState<TracerData[]>([]);

  // 射撃方向ベクトル
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

    // モブストアからモブの位置を取得してヒット判定
    const mobs = useMobStore.getState().mobs;
    let hitMob: { id: string; distance: number } | null = null;
    const hitRadius = 1.2; // モブの当たり判定半径（少し大きめに）

    for (const mob of mobs) {
      // 死んでいるモブはスキップ
      if (mob.hp <= 0) continue;

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

    setTracers((prev) => [...prev, {
      id: tracerIdCounter++,
      start: startPos.clone(),
      end: endPos,
      createdAt: now,
    }]);

    // マズルフラッシュ
    if (side === 'left') {
      flashTimerLeft.current = 0.08;
    } else {
      flashTimerRight.current = 0.08;
    }
  }, [camera]);

  // マウスイベントの適切な登録（useEffect）
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        isMouseDown.current = true;
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        isMouseDown.current = false;
      }
    };
    // PointerLock中もmousedownイベントは届く
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // フレーム更新
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
    setTracers((prev) => {
      const filtered = prev.filter((t) => now - t.createdAt < GUN_CONSTANTS.TRACER_LIFETIME);
      // 配列の長さが変わった場合のみ更新（不要な再レンダリング防止）
      if (filtered.length === prev.length) return prev;
      return filtered;
    });

    // ガンナー席の射撃（左クリック長押し対応）
    // PointerLock中かどうかも確認
    const isGunner = mySeat === 'gunner_left' || mySeat === 'gunner_right';
    const hasPointerLock = !!document.pointerLockElement;
    if (isGunner && isMouseDown.current && hasPointerLock) {
      fireGun(mySeat === 'gunner_left' ? 'left' : 'right');
    }
  });

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
      {/* === トレーサー弾（3Dメッシュで太く視認性の高い弾丸） === */}
      {tracers.map((tracer) => (
        <TracerBullet key={tracer.id} start={tracer.start} end={tracer.end} createdAt={tracer.createdAt} />
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

/** トレーサー弾（太い3Dメッシュで飛翔中の弾を視覚化） */
function TracerBullet({ start, end, createdAt }: { start: THREE.Vector3; end: THREE.Vector3; createdAt: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  // 弾の進行方向と長さ
  const { position, quaternion, length } = useMemo(() => {
    const dir = end.clone().sub(start);
    const len = dir.length();
    const mid = start.clone().add(end).multiplyScalar(0.5);

    // 向きを計算
    const quat = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const dirNorm = dir.clone().normalize();

    // CylinderGeometryはデフォルトでY軸方向なので、射線方向に回転させる
    quat.setFromUnitVectors(up, dirNorm);

    return { position: mid, quaternion: quat, length: len };
  }, [start, end]);

  // フェードアウトアニメーション
  useFrame(() => {
    if (!meshRef.current) return;
    const now = performance.now() / 1000;
    const age = now - createdAt;
    const fadeProgress = age / GUN_CONSTANTS.TRACER_LIFETIME;

    // 時間経過で弾を前方に移動させつつフェードアウト
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, 1 - fadeProgress * 1.5);

    // スケールも時間で少し縮小
    const scale = Math.max(0.3, 1 - fadeProgress * 0.5);
    meshRef.current.scale.set(scale, 1, scale);
  });

  // 弾の長さを制限（あまりに長いと不自然）
  const tracerLength = Math.min(length, 8);

  return (
    <group position={position} quaternion={quaternion}>
      {/* メインの弾体（明るい黄色） */}
      <mesh ref={meshRef}>
        <cylinderGeometry args={[0.04, 0.04, tracerLength, 4]} />
        <meshBasicMaterial
          color={0xffdd44}
          transparent
          opacity={1}
        />
      </mesh>
      {/* グロー（やや太めの半透明で光っているように見せる） */}
      <mesh>
        <cylinderGeometry args={[0.1, 0.1, tracerLength, 4]} />
        <meshBasicMaterial
          color={0xffaa22}
          transparent
          opacity={0.3}
        />
      </mesh>
      {/* 先端の光点 */}
      <mesh position={[0, tracerLength / 2, 0]}>
        <sphereGeometry args={[0.08, 6, 6]} />
        <meshBasicMaterial
          color={0xffffff}
          transparent
          opacity={0.9}
        />
      </mesh>
    </group>
  );
}
