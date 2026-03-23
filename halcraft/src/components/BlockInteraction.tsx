// ブロック操作コンポーネント
// レイマーチングで照準先のブロックを検出し、左クリック=破壊/攻撃、右クリック=設置を行う
// モブが目の前にいる場合は攻撃が優先される
// デスクトップ（マウス）とモバイル（タッチ）両対応

import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { useWorldStore } from '../stores/useWorldStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useDroppedItemStore } from '../stores/useDroppedItemStore';
import { useMobStore } from '../stores/useMobStore';
import { BLOCK_IDS } from '../types/blocks';
import { isTouchDevice } from '../utils/device';
import { consumeBreakBlock, consumePlaceBlock } from '../utils/touchInput';
import { BlockBreakEffect } from './BlockBreakEffect';

/** ブロック操作のリーチ距離 */
const REACH = 6;
/** レイマーチングのステップ数（多いほど精度が高い） */
const RAY_STEPS = 120;
/** レイマーチングのステップ間隔 */
const STEP_SIZE = REACH / RAY_STEPS;
/** モブへの攻撃リーチ */
const ATTACK_REACH = 3.5;
/** 攻撃ダメージ */
const ATTACK_DAMAGE = 3;

interface TargetBlock {
  /** 照準先のブロック座標 */
  x: number;
  y: number;
  z: number;
  /** 設置先（照準ブロックの隣接面） */
  placeX: number;
  placeY: number;
  placeZ: number;
  /** 設置先が有効かどうか */
  hasPlaceTarget: boolean;
}

/** ブロック選択ハイライトの表示 */
function BlockHighlight({ target }: { target: TargetBlock | null }) {
  if (!target) return null;
  return (
    <mesh position={[target.x + 0.5, target.y + 0.5, target.z + 0.5]}>
      <boxGeometry args={[1.01, 1.01, 1.01]} />
      <meshBasicMaterial
        color={0xffffff}
        wireframe
        transparent
        opacity={0.5}
        depthTest={false}
      />
    </mesh>
  );
}

export function BlockInteraction() {
  const { camera } = useThree();
  const getBlock = useWorldStore((s) => s.getBlock);
  const breakBlock = useWorldStore((s) => s.breakBlock);
  const setBlock = useWorldStore((s) => s.setBlock);
  const getSelectedBlock = usePlayerStore((s) => s.getSelectedBlock);
  const dropItem = useDroppedItemStore((s) => s.dropItem);
  const damageMob = useMobStore((s) => s.damageMob);

  const [target, setTarget] = useState<TargetBlock | null>(null);
  const targetRef = useRef<TargetBlock | null>(null);

  // タッチデバイス判定（初回のみ）
  const isTouch = useRef(isTouchDevice());

  // 再利用用ベクトル（GCプレッシャー削減）
  const rayDir = useRef(new THREE.Vector3());
  const rayOrigin = useRef(new THREE.Vector3());

  // レイマーチングで照準先のブロックを検出
  useFrame(() => {
    rayDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    rayOrigin.current.copy(camera.position);
    const dir = rayDir.current;
    const origin = rayOrigin.current;

    let found: TargetBlock | null = null;

    // 前回の空気ブロック座標を追跡
    let lastAirX = -1;
    let lastAirY = -1;
    let lastAirZ = -1;
    let hasLastAir = false;
    let lastBx = -999;
    let lastBy = -999;
    let lastBz = -999;

    for (let i = 1; i <= RAY_STEPS; i++) {
      const t = i * STEP_SIZE;
      const px = origin.x + dir.x * t;
      const py = origin.y + dir.y * t;
      const pz = origin.z + dir.z * t;

      const bx = Math.floor(px);
      const by = Math.floor(py);
      const bz = Math.floor(pz);

      // 同じブロック座標ならスキップ
      if (bx === lastBx && by === lastBy && bz === lastBz) continue;
      lastBx = bx;
      lastBy = by;
      lastBz = bz;

      const block = getBlock(bx, by, bz);
      if (block !== BLOCK_IDS.AIR) {
        // 固体ブロックにヒット！
        found = {
          x: bx, y: by, z: bz,
          placeX: lastAirX,
          placeY: lastAirY,
          placeZ: lastAirZ,
          hasPlaceTarget: hasLastAir,
        };
        break;
      } else {
        // 空気ブロック → 設置先候補として記録
        lastAirX = bx;
        lastAirY = by;
        lastAirZ = bz;
        hasLastAir = true;
      }
    }

    targetRef.current = found;
    // ターゲット変更時のみstate更新（パフォーマンスのため）
    setTarget((prev) => {
      if (!found && !prev) return prev;
      if (!found || !prev) return found;
      if (found.x === prev.x && found.y === prev.y && found.z === prev.z) return prev;
      return found;
    });

    // --- モバイル: タッチによるブロック操作の処理 ---
    if (isTouch.current) {
      if (usePlayerStore.getState().isDead) return;

      // 破壊
      if (consumeBreakBlock()) {
        // まずモブ攻撃をチェック
        const targetMobId = findTargetMob();
        if (targetMobId) {
          const attackDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
          damageMob(targetMobId, ATTACK_DAMAGE, attackDir.x, attackDir.z);
        } else {
          const t = targetRef.current;
          if (t) {
            const blockId = getBlock(t.x, t.y, t.z);
            if (breakBlock(t.x, t.y, t.z)) {
              // パーティクルエフェクト + ドロップアイテム
              BlockBreakEffect.spawnEffect(blockId, t.x, t.y, t.z);
              dropItem(blockId, t.x, t.y, t.z);
            }
          }
        }
      }

      // 設置
      if (consumePlaceBlock()) {
        const t = targetRef.current;
        if (t && t.hasPlaceTarget) {
          const selectedBlock = getSelectedBlock();
          setBlock(t.placeX, t.placeY, t.placeZ, selectedBlock);
        }
      }
    }
  });

  // 照準先のモブを検索
  const findTargetMob = useCallback((): string | null => {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const origin = camera.position.clone();
    const mobs = useMobStore.getState().mobs;

    let closestMobId: string | null = null;
    let closestDist = ATTACK_REACH;

    for (const mob of mobs) {
      // 味方モブは攻撃対象から除外
      if (mob.isAlly) continue;
      // モブの中心位置
      const mobCenter = new THREE.Vector3(mob.x, mob.y + 0.9, mob.z);

      // レイとモブの距離を計算（カプセル近似）
      const toMob = mobCenter.clone().sub(origin);
      const projection = toMob.dot(dir);

      if (projection < 0 || projection > ATTACK_REACH) continue;

      const closestPoint = origin.clone().add(dir.clone().multiplyScalar(projection));
      const distance = closestPoint.distanceTo(mobCenter);

      // ヒット判定（半径0.6のシリンダー）
      if (distance < 0.8 && projection < closestDist) {
        closestDist = projection;
        closestMobId = mob.id;
      }
    }

    return closestMobId;
  }, [camera]);

  // クリック処理（デスクトップのみ）
  const handleMouseDown = useCallback((e: MouseEvent) => {
    // タッチデバイスではマウスクリックは使わない
    if (isTouch.current) return;
    // PointerLock中でなければ無視
    if (!document.pointerLockElement) return;
    // 死亡中は操作不可
    if (usePlayerStore.getState().isDead) return;

    if (e.button === 0) {
      // 左クリック: まずモブ攻撃をチェック → なければブロック破壊
      const targetMobId = findTargetMob();

      if (targetMobId) {
        // モブを殴る
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        damageMob(targetMobId, ATTACK_DAMAGE, dir.x, dir.z);
      } else {
        // ブロック破壊
        const t = targetRef.current;
        if (!t) return;
        const blockId = getBlock(t.x, t.y, t.z);
        if (breakBlock(t.x, t.y, t.z)) {
          // パーティクルエフェクト + ドロップアイテム
          BlockBreakEffect.spawnEffect(blockId, t.x, t.y, t.z);
          dropItem(blockId, t.x, t.y, t.z);
        }
      }
    } else if (e.button === 2) {
      // 右クリック: ブロック設置
      const t = targetRef.current;
      if (!t || !t.hasPlaceTarget) return;
      const selectedBlock = getSelectedBlock();
      setBlock(t.placeX, t.placeY, t.placeZ, selectedBlock);
    }
  }, [breakBlock, setBlock, getSelectedBlock, getBlock, dropItem, damageMob, findTargetMob, camera]);

  useEffect(() => {
    // デスクトップのみ: マウスイベントを登録
    if (isTouch.current) return;

    document.addEventListener('mousedown', handleMouseDown);
    // 右クリックのコンテキストメニューを無効化
    const preventContext = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', preventContext);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('contextmenu', preventContext);
    };
  }, [handleMouseDown]);

  return <BlockHighlight target={target} />;
}
