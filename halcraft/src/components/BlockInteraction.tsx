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
import { useMultiplayerStore } from '../stores/useMultiplayerStore';
import { useVehicleStore } from '../stores/useVehicleStore';
import { BLOCK_IDS } from '../types/blocks';
import { isTouchDevice } from '../utils/device';
import { consumeBreakBlock, consumePlaceBlock } from '../utils/touchInput';
import { spawnBlockBreakEffect, spawnDamagePopup } from '../utils/effectTriggers';
import { playHitSound } from '../utils/sounds';

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
/** プレイヤーへの攻撃ダメージ */
const PVP_DAMAGE = 3;
/** プレイヤーの当たり判定サイズ */
const PLAYER_HIT_RADIUS = 0.5;
const PLAYER_HIT_HEIGHT = 1.7;
/** プレイヤー体AABBの高さ（ブロック設置衝突チェック用） */
const PLACE_PLAYER_HEIGHT = 1.7;

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

/** ブロック選択ハイライト用の共有ジオメトリ */
const highlightGeometry = new THREE.BoxGeometry(1.01, 1.01, 1.01);
const highlightMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  wireframe: true,
  transparent: true,
  opacity: 0.5,
  depthTest: false,
});

/** ブロック選択ハイライトの表示 */
function BlockHighlight({ target }: { target: TargetBlock | null }) {
  if (!target) return null;
  return (
    <mesh
      position={[target.x + 0.5, target.y + 0.5, target.z + 0.5]}
      geometry={highlightGeometry}
      material={highlightMaterial}
    />
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
  const spawnMob = useMobStore((s) => s.spawnMob);
  const performAttack = usePlayerStore((s) => s.performAttack);
  const sendBlockBreak = useMultiplayerStore((s) => s.sendBlockBreak);
  const sendBlockPlace = useMultiplayerStore((s) => s.sendBlockPlace);

  // 設置先ブロックがプレイヤーの体と重なるかチェック
  // マージン0.1を追加して浮動小数点の境界ケースを確実にガード
  const wouldBlockOverlapPlayer = useCallback((bx: number, by: number, bz: number): boolean => {
    const px = camera.position.x;
    // camera.position.y = pos.y + 1.6 なので、足元は camera.y - 1.6
    const footY = camera.position.y - 1.6;
    const pz = camera.position.z;

    // マージン付きプレイヤーAABB（実際のPLAYER_RADIUSに近い値に設定）
    const margin = 0.05;
    const radius = 0.3; // PLAYER_RADIUS(0.25)に近い値
    const pMinX = px - radius - margin;
    const pMaxX = px + radius + margin;
    const pMinY = footY - margin;
    const pMaxY = footY + PLACE_PLAYER_HEIGHT + margin;
    const pMinZ = pz - radius - margin;
    const pMaxZ = pz + radius + margin;

    // ブロックAABB
    const bMinX = bx;
    const bMaxX = bx + 1;
    const bMinY = by;
    const bMaxY = by + 1;
    const bMinZ = bz;
    const bMaxZ = bz + 1;

    // AABB重なり判定
    return (
      pMaxX > bMinX && pMinX < bMaxX &&
      pMaxY > bMinY && pMinY < bMaxY &&
      pMaxZ > bMinZ && pMinZ < bMaxZ
    );
  }, [camera]);

  const [target, setTarget] = useState<TargetBlock | null>(null);
  const targetRef = useRef<TargetBlock | null>(null);

  // タッチデバイス判定（初回のみ）
  const isTouch = useRef(isTouchDevice());

  // 再利用用ベクトル（GCプレッシャー削減）
  const rayDir = useRef(new THREE.Vector3());
  const rayOrigin = useRef(new THREE.Vector3());
  const attackDir = useRef(new THREE.Vector3());
  const tempOrigin = useRef(new THREE.Vector3());
  const tempToTarget = useRef(new THREE.Vector3());
  const tempClosest = useRef(new THREE.Vector3());

  // 照準先のリモートプレイヤーを検索
  const findTargetPlayer = useCallback((): string | null => {
    const multiState = useMultiplayerStore.getState();
    if (!multiState.connected) return null;

    attackDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const dir = attackDir.current;
    tempOrigin.current.copy(camera.position);
    const origin = tempOrigin.current;
    const remotePlayers = multiState.remotePlayers;

    let closestPlayerId: string | null = null;
    let closestDist = ATTACK_REACH;

    for (const [, player] of remotePlayers) {
      tempToTarget.current.set(
        player.position[0] - origin.x,
        player.position[1] + PLAYER_HIT_HEIGHT * 0.5 - origin.y,
        player.position[2] - origin.z,
      );

      const projection = tempToTarget.current.dot(dir);
      if (projection < 0 || projection > ATTACK_REACH) continue;

      tempClosest.current.copy(origin).addScaledVector(dir, projection);
      const targetX = origin.x + tempToTarget.current.x;
      const targetY = origin.y + tempToTarget.current.y;
      const targetZ = origin.z + tempToTarget.current.z;
      const dx = tempClosest.current.x - targetX;
      const dy = tempClosest.current.y - targetY;
      const dz = tempClosest.current.z - targetZ;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance < PLAYER_HIT_RADIUS + 0.3 && projection < closestDist) {
        closestDist = projection;
        closestPlayerId = player.id;
      }
    }

    return closestPlayerId;
  }, [camera]);

  // 照準先のモブを検索（データごと返す版）
  const findTargetMobData = useCallback((): { id: string; x: number; y: number; z: number } | null => {
    attackDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const dir = attackDir.current;
    tempOrigin.current.copy(camera.position);
    const origin = tempOrigin.current;
    const mobs = useMobStore.getState().mobs;

    let closestMob: { id: string; x: number; y: number; z: number } | null = null;
    let closestDist = ATTACK_REACH;

    for (const mob of mobs) {
      if (mob.isAlly) continue;

      tempToTarget.current.set(mob.x - origin.x, mob.y + 0.9 - origin.y, mob.z - origin.z);
      const projection = tempToTarget.current.dot(dir);
      if (projection < 0 || projection > ATTACK_REACH) continue;

      tempClosest.current.copy(origin).addScaledVector(dir, projection);
      const dx = tempClosest.current.x - mob.x;
      const dy = tempClosest.current.y - (mob.y + 0.9);
      const dz = tempClosest.current.z - mob.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance < 0.8 && projection < closestDist) {
        closestDist = projection;
        closestMob = { id: mob.id, x: mob.x, y: mob.y, z: mob.z };
      }
    }

    return closestMob;
  }, [camera]);

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
      // ヘリコプター搭乗中はブロック操作を無効化
      if (useVehicleStore.getState().helicopter.isBoarded) return;

      // 破壊
      if (consumeBreakBlock()) {
        // まずプレイヤー攻撃をチェック → モブ攻撃 → ブロック破壊
        const targetPlayerId = findTargetPlayer();
        if (targetPlayerId) {
          const multiplier = performAttack({ noShake: true });
          attackDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
          const actualDamage = Math.round(PVP_DAMAGE * multiplier);
          useMultiplayerStore.getState().sendPlayerAttack(targetPlayerId, actualDamage, attackDir.current.x, attackDir.current.z);
          playHitSound();
        } else {
          const targetMob = findTargetMobData();
          if (targetMob) {
            const multiplier = performAttack({ noShake: true });
            attackDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
            const actualDamage = Math.round(ATTACK_DAMAGE * multiplier);
            const isCritical = multiplier >= 0.9;
            damageMob(targetMob.id, actualDamage, attackDir.current.x, attackDir.current.z);
            spawnDamagePopup(actualDamage, targetMob.x, targetMob.y, targetMob.z, isCritical);
            playHitSound();
          } else {
            const t = targetRef.current;
            if (t) {
              const blockId = getBlock(t.x, t.y, t.z);
              if (breakBlock(t.x, t.y, t.z)) {
                // パーティクルエフェクト + ドロップアイテム
                spawnBlockBreakEffect(blockId, t.x, t.y, t.z);
                dropItem(blockId, t.x, t.y, t.z);
                sendBlockBreak(t.x, t.y, t.z);
              }
            }
          }
        }
      }

      // 設置
      if (consumePlaceBlock()) {
        const t = targetRef.current;
        if (t && t.hasPlaceTarget) {
          // プレイヤーの体と重ならないかチェック
          if (!wouldBlockOverlapPlayer(t.placeX, t.placeY, t.placeZ)) {
            const selectedBlock = getSelectedBlock();
            setBlock(t.placeX, t.placeY, t.placeZ, selectedBlock);
            sendBlockPlace(t.placeX, t.placeY, t.placeZ, selectedBlock);
            // SPAWNERブロック設置時:アイアンゴーレムをスポーン
            if (selectedBlock === BLOCK_IDS.SPAWNER) {
              spawnMob('iron_golem', t.placeX + 0.5, t.placeY + 2, t.placeZ + 0.5);
            }
          }
        }
      }
    }
  });

  // クリック処理（デスクトップのみ）
  const handleMouseDown = useCallback((e: MouseEvent) => {
    // タッチデバイスではマウスクリックは使わない
    if (isTouch.current) return;
    // PointerLock中でなければ無視
    if (!document.pointerLockElement) return;
    // 死亡中は操作不可
    if (usePlayerStore.getState().isDead) return;
    // ヘリコプター搭乗中はブロック操作を無効化
    if (useVehicleStore.getState().helicopter.isBoarded) return;

    if (e.button === 0) {
      // 左クリック: プレイヤー攻撃 → モブ攻撃 → ブロック破壊
      const targetPlayerId = findTargetPlayer();

      if (targetPlayerId) {
        // プレイヤーを殴る
        const multiplier = performAttack({ noShake: true });
        attackDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
        const actualDamage = Math.round(PVP_DAMAGE * multiplier);
        useMultiplayerStore.getState().sendPlayerAttack(targetPlayerId, actualDamage, attackDir.current.x, attackDir.current.z);
        playHitSound();
      } else {
        const targetMob = findTargetMobData();

        if (targetMob) {
          // モブを殴る
          const multiplier = performAttack({ noShake: true });
          attackDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
          const actualDamage = Math.round(ATTACK_DAMAGE * multiplier);
          const isCritical = multiplier >= 0.9;
          damageMob(targetMob.id, actualDamage, attackDir.current.x, attackDir.current.z);
          spawnDamagePopup(actualDamage, targetMob.x, targetMob.y, targetMob.z, isCritical);
          playHitSound();
        } else {
          // ブロック破壊
          const t = targetRef.current;
          if (!t) return;
          const blockId = getBlock(t.x, t.y, t.z);
          if (breakBlock(t.x, t.y, t.z)) {
            // パーティクルエフェクト + ドロップアイテム
            spawnBlockBreakEffect(blockId, t.x, t.y, t.z);
            dropItem(blockId, t.x, t.y, t.z);
            sendBlockBreak(t.x, t.y, t.z);
          }
        }
      }
    } else if (e.button === 2) {
      // 右クリック: ブロック設置
      const t = targetRef.current;
      if (!t || !t.hasPlaceTarget) return;
      // プレイヤーの体と重ならないかチェック
      if (wouldBlockOverlapPlayer(t.placeX, t.placeY, t.placeZ)) return;
      const selectedBlock = getSelectedBlock();
      setBlock(t.placeX, t.placeY, t.placeZ, selectedBlock);
      sendBlockPlace(t.placeX, t.placeY, t.placeZ, selectedBlock);
      // SPAWNERブロック設置時:アイアンゴーレムをスポーン
      if (selectedBlock === BLOCK_IDS.SPAWNER) {
        spawnMob('iron_golem', t.placeX + 0.5, t.placeY + 2, t.placeZ + 0.5);
      }
    }
  }, [breakBlock, setBlock, getSelectedBlock, getBlock, dropItem, damageMob, spawnMob, performAttack, findTargetMobData, findTargetPlayer, camera, sendBlockBreak, sendBlockPlace, wouldBlockOverlapPlayer]);

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
