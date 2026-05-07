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
import { useGameStore } from '../stores/useGameStore';
import { useExperienceStore } from '../stores/useExperienceStore';
import { BLOCK_IDS, BLOCK_DEFS } from '../types/blocks';
import { isTouchDevice } from '../utils/device';
import { consumeBreakBlock, consumePlaceBlock } from '../utils/touchInput';
import { spawnBlockBreakEffect, spawnDamagePopup, spawnHitImpactEffect } from '../utils/effectTriggers';
import { playHitSound, playBlockBreakSound } from '../utils/sounds';
import { getMobHitbox, getMobHitboxMaxY, getMobHitboxMinY } from '../utils/mobHitboxes';
import { triggerTntExplosion } from '../utils/tntExplosion';

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
/** 連続設置の間隔（秒） — Minecraft は約 4tick = 200ms */
const PLACE_INTERVAL = 0.2;
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
  /** カメラからヒットしたブロックまでの距離 */
  distance: number;
}

/** ブロック破壊の進行状態 */
interface BreakProgress {
  x: number;
  y: number;
  z: number;
  /** 現在の破壊進行度（0〜1） */
  progress: number;
  /** そのブロックの硬さ（秒） */
  hardness: number;
}

interface TargetPlayer {
  id: string;
  x: number;
  y: number;
  z: number;
  distance: number;
}

interface TargetMob {
  id: string;
  x: number;
  y: number;
  z: number;
  hitY: number;
  distance: number;
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

/** ブロック破壊の進行度表示（ひび割れオーバーレイ） */
function BlockBreakProgressOverlay({ breakProgress }: { breakProgress: BreakProgress | null }) {
  if (!breakProgress || breakProgress.progress <= 0) return null;
  const stage = Math.min(9, Math.floor(breakProgress.progress * 10));
  // 10段階の透明度（進行するほど濃く）
  const opacity = 0.15 + stage * 0.075;
  return (
    <mesh
      position={[
        breakProgress.x + 0.5,
        breakProgress.y + 0.5,
        breakProgress.z + 0.5,
      ]}
    >
      <boxGeometry args={[1.005, 1.005, 1.005]} />
      <meshBasicMaterial
        color={0x000000}
        transparent
        opacity={opacity}
        depthTest={true}
        polygonOffset
        polygonOffsetFactor={-1}
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
  const spawnMob = useMobStore((s) => s.spawnMob);
  const performAttack = usePlayerStore((s) => s.performAttack);
  const sendBlockBreak = useMultiplayerStore((s) => s.sendBlockBreak);
  const sendBlockPlace = useMultiplayerStore((s) => s.sendBlockPlace);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const isBuildMode = useGameStore((s) => s.isBuildMode);

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

  // ブロック破壊の進行状態
  const breakProgressRef = useRef<BreakProgress | null>(null);
  const [breakProgressState, setBreakProgressState] = useState<BreakProgress | null>(null);
  // 左クリック押しっぱなし状態
  const isBreakingRef = useRef(false);
  // 右クリック押しっぱなし状態（連続設置用）
  const isPlacingRef = useRef(false);
  // 連続設置のクールダウンタイマー
  const placeTimerRef = useRef(0);
  // 直前に設置した座標（同じ座標に二重設置しない）
  const lastPlacedRef = useRef<string>('');

  // 照準先のリモートプレイヤーを検索
  const getAttackDistanceLimit = useCallback((): number => {
    const blockTarget = targetRef.current;
    if (!blockTarget) return ATTACK_REACH;
    return Math.min(ATTACK_REACH, Math.max(0, blockTarget.distance - 0.05));
  }, []);

  const findTargetPlayer = useCallback((maxDistance = ATTACK_REACH): TargetPlayer | null => {
    const multiState = useMultiplayerStore.getState();
    if (!multiState.connected) return null;

    attackDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const dir = attackDir.current;
    tempOrigin.current.copy(camera.position);
    const origin = tempOrigin.current;
    const remotePlayers = multiState.remotePlayers;

    let closestPlayer: TargetPlayer | null = null;
    let closestDist = Math.min(ATTACK_REACH, maxDistance);

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
        closestPlayer = {
          id: player.id,
          x: targetX,
          y: targetY,
          z: targetZ,
          distance: projection,
        };
      }
    }

    return closestPlayer;
  }, [camera]);

  // 照準先のモブを検索（データごと返す版）
  const findTargetMobData = useCallback((maxDistance = ATTACK_REACH): TargetMob | null => {
    attackDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const dir = attackDir.current;
    tempOrigin.current.copy(camera.position);
    const origin = tempOrigin.current;
    const mobs = useMobStore.getState().mobs;

    let closestMob: TargetMob | null = null;
    let closestDist = Math.min(ATTACK_REACH, maxDistance);

    for (const mob of mobs) {
      // ニワトリは攻撃対象外（中立パッシブ）。味方モブはフレンドリーファイヤー可能
      if (mob.type === 'chicken') continue;

      const hitbox = getMobHitbox(mob.type);
      const minY = getMobHitboxMinY(mob.y, hitbox);
      const maxY = getMobHitboxMaxY(mob.y, hitbox);
      const centerY = mob.y + hitbox.height * 0.5;

      tempToTarget.current.set(mob.x - origin.x, centerY - origin.y, mob.z - origin.z);
      const projection = tempToTarget.current.dot(dir);
      if (projection < 0 || projection > closestDist) continue;

      tempClosest.current.copy(origin).addScaledVector(dir, projection);
      const dx = tempClosest.current.x - mob.x;
      const hitY = Math.max(minY, Math.min(maxY, tempClosest.current.y));
      const dy = tempClosest.current.y - hitY;
      const dz = tempClosest.current.z - mob.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance < hitbox.radius && projection < closestDist) {
        closestDist = projection;
        closestMob = { id: mob.id, x: mob.x, y: mob.y, z: mob.z, hitY, distance: projection };
      }
    }

    return closestMob;
  }, [camera]);

  const tryMeleeAttack = useCallback((): boolean => {
    const maxAttackDistance = getAttackDistanceLimit();
    if (maxAttackDistance <= 0) return false;

    const targetPlayer = findTargetPlayer(maxAttackDistance);
    if (targetPlayer) {
      const multiplier = performAttack();
      if (multiplier <= 0) return true;

      attackDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const actualDamage = Math.max(1, Math.round(PVP_DAMAGE * multiplier));
      useMultiplayerStore.getState().sendPlayerAttack(
        targetPlayer.id,
        actualDamage,
        attackDir.current.x,
        attackDir.current.z,
      );
      spawnHitImpactEffect(
        targetPlayer.x,
        targetPlayer.y,
        targetPlayer.z,
        attackDir.current.x,
        attackDir.current.y,
        attackDir.current.z,
        false,
      );
      playHitSound();
      return true;
    }

    const targetMob = findTargetMobData(maxAttackDistance);
    if (targetMob) {
      const multiplier = performAttack();
      if (multiplier <= 0) return true;

      attackDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const actualDamage = Math.max(1, Math.round(ATTACK_DAMAGE * multiplier));
      const isCritical = multiplier >= 0.9;
      damageMob(targetMob.id, actualDamage, attackDir.current.x, attackDir.current.z);
      spawnDamagePopup(actualDamage, targetMob.x, targetMob.hitY - 1.0, targetMob.z, isCritical);
      spawnHitImpactEffect(
        targetMob.x,
        targetMob.hitY,
        targetMob.z,
        attackDir.current.x,
        attackDir.current.y,
        attackDir.current.z,
        isCritical,
      );
      playHitSound();
      return true;
    }

    return false;
  }, [camera, damageMob, findTargetMobData, findTargetPlayer, getAttackDistanceLimit, performAttack]);

  // レイマーチングで照準先のブロックを検出
  useFrame((_, frameDelta) => {
    const dt = Math.min(frameDelta, 0.1);
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
        // 液体ブロックは破壊対象外（通過）
        const def = BLOCK_DEFS[block];
        if (def?.isLiquid || def?.noCollision) {
          // 液体・非実体ブロックは空気と同じ扱い
          lastAirX = bx;
          lastAirY = by;
          lastAirZ = bz;
          hasLastAir = true;
          continue;
        }
        // 固体ブロックにヒット！
        found = {
          x: bx, y: by, z: bz,
          placeX: lastAirX,
          placeY: lastAirY,
          placeZ: lastAirZ,
          hasPlaceTarget: hasLastAir,
          distance: t,
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

    // --- 段階的ブロック破壊の進行（デスクトップ 左クリック押しっぱなし） ---
    if (isBreakingRef.current && found && !isTouch.current) {
      if (usePlayerStore.getState().isDead) { isBreakingRef.current = false; return; }
      if (useVehicleStore.getState().isInVehicle()) { isBreakingRef.current = false; return; }
      if (equippedItem !== 'builder') { isBreakingRef.current = false; return; }

      const bp = breakProgressRef.current;
      const blockId = getBlock(found.x, found.y, found.z);
      const def = BLOCK_DEFS[blockId];
      const hardness = isBuildMode ? 0 : (def?.hardness ?? 0.5);
      const minTier = def?.minToolTier ?? 0;
      const playerTier = usePlayerStore.getState().getToolTierLevel();

      // ティア不足でブロックが掘れない（ビルドモード除く）
      if (!isBuildMode && minTier > 0 && playerTier < minTier) {
        // 進行度をリセット（掘れないことを示す）
        if (bp) {
          breakProgressRef.current = null;
          setBreakProgressState(null);
        }
        // TODO: 掘れない音のフィードバック
      } else if (hardness <= 0) {
        // hardness <= 0 のブロック（TNT等）は即破壊
        if (breakBlock(found.x, found.y, found.z)) {
          spawnBlockBreakEffect(blockId, found.x, found.y, found.z);
          if (!isBuildMode) {
            dropItem(blockId, found.x, found.y, found.z);
          }
          sendBlockBreak(found.x, found.y, found.z);
          if (BLOCK_DEFS[blockId]?.explosive) {
            const cp = camera.position;
            triggerTntExplosion(found.x, found.y, found.z, [cp.x, cp.y - 1.6, cp.z]);
          }
        }
        breakProgressRef.current = null;
        setBreakProgressState(null);
        isBreakingRef.current = false;
      } else if (!bp || bp.x !== found.x || bp.y !== found.y || bp.z !== found.z) {
        // ターゲットが変わったらリセット
        breakProgressRef.current = { x: found.x, y: found.y, z: found.z, progress: 0, hardness };
      } else {
        // 進行度を加算（ツール速度倍率適用）
        const miningSpeed = usePlayerStore.getState().getMiningSpeed(def?.blockCategory);
        bp.progress += (dt * miningSpeed) / hardness;

        if (bp.progress >= 1) {
          // 破壊完了！
          if (breakBlock(found.x, found.y, found.z)) {
            spawnBlockBreakEffect(blockId, found.x, found.y, found.z);
            if (!isBuildMode) {
              dropItem(blockId, found.x, found.y, found.z);
            }
            sendBlockBreak(found.x, found.y, found.z);
            playBlockBreakSound();
            // ツール耐久値消費
            if (!isBuildMode) {
              usePlayerStore.getState().damageTool();
              // 鉱石採掘時にXP獲得
              const cat = def?.blockCategory;
              if (cat === 'ore') {
                useExperienceStore.getState().addXp(3 + Math.floor(Math.random() * 5));
              }
            }
            // TNT爆発チェック
            if (BLOCK_DEFS[blockId]?.explosive) {
              const cp = camera.position;
              triggerTntExplosion(found.x, found.y, found.z, [cp.x, cp.y - 1.6, cp.z]);
            }
          }
          breakProgressRef.current = null;
        }
      }

      setBreakProgressState(breakProgressRef.current ? { ...breakProgressRef.current } : null);
    } else if (!isBreakingRef.current) {
      // 押していない場合はリセット
      if (breakProgressRef.current) {
        breakProgressRef.current = null;
        setBreakProgressState(null);
      }
    }

    // --- デスクトップ: 右クリック長押しによる連続ブロック設置 ---
    if (!isTouch.current && isPlacingRef.current) {
      if (!usePlayerStore.getState().isDead
        && !useVehicleStore.getState().isInVehicle()
        && equippedItem === 'builder'
        && document.pointerLockElement
      ) {
        placeTimerRef.current += dt;
        const t = targetRef.current;
        if (t && t.hasPlaceTarget) {
          const coordKey = `${t.placeX},${t.placeY},${t.placeZ}`;
          // 照準先が変わったら即座に設置（クールダウンリセット）
          const targetChanged = coordKey !== lastPlacedRef.current;
          if (targetChanged || placeTimerRef.current >= PLACE_INTERVAL) {
            // TNT右クリック起爆チェック
            const targetBlockId = getBlock(t.x, t.y, t.z);
            if (BLOCK_DEFS[targetBlockId]?.explosive) {
              if (breakBlock(t.x, t.y, t.z)) {
                spawnBlockBreakEffect(targetBlockId, t.x, t.y, t.z);
                sendBlockBreak(t.x, t.y, t.z);
                const cp = camera.position;
                triggerTntExplosion(t.x, t.y, t.z, [cp.x, cp.y - 1.6, cp.z]);
              }
            } else if (!wouldBlockOverlapPlayer(t.placeX, t.placeY, t.placeZ)) {
              const selectedBlock = getSelectedBlock();
              setBlock(t.placeX, t.placeY, t.placeZ, selectedBlock);
              sendBlockPlace(t.placeX, t.placeY, t.placeZ, selectedBlock);
              playBlockBreakSound();

              // SPAWNERブロック設置時
              if (selectedBlock === BLOCK_IDS.SPAWNER) {
                spawnMob('iron_golem', t.placeX + 0.5, t.placeY + 2, t.placeZ + 0.5);
              }
              // レバー設置時: 隣接TNT遠隔起爆
              if (selectedBlock === BLOCK_IDS.LEVER) {
                const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
                for (const [dx, dy, dz] of dirs) {
                  const nx = t.placeX + dx;
                  const ny = t.placeY + dy;
                  const nz = t.placeZ + dz;
                  const neighborBlock = getBlock(nx, ny, nz);
                  if (BLOCK_DEFS[neighborBlock]?.explosive) {
                    if (breakBlock(nx, ny, nz)) {
                      spawnBlockBreakEffect(neighborBlock, nx, ny, nz);
                      sendBlockBreak(nx, ny, nz);
                      const cp = camera.position;
                      triggerTntExplosion(nx, ny, nz, [cp.x, cp.y - 1.6, cp.z]);
                    }
                  }
                }
              }
              lastPlacedRef.current = coordKey;
            }
            placeTimerRef.current = 0;
          }
        }
      }
    }

    // --- モバイル: タッチによるブロック操作の処理 ---
    if (isTouch.current) {
      if (usePlayerStore.getState().isDead) return;
      // ヘリコプター搭乗中はブロック操作を無効化
      if (useVehicleStore.getState().isInVehicle()) return;
      if (equippedItem !== 'builder') return;

      // 破壊
      if (consumeBreakBlock()) {
        // まずプレイヤー攻撃 → モブ攻撃 → ブロック破壊
        if (!tryMeleeAttack()) {
          const t = targetRef.current;
          if (t) {
            const blockId = getBlock(t.x, t.y, t.z);
            if (breakBlock(t.x, t.y, t.z)) {
              // パーティクルエフェクト + ドロップアイテム
              spawnBlockBreakEffect(blockId, t.x, t.y, t.z);
              if (!isBuildMode) {
                dropItem(blockId, t.x, t.y, t.z);
              }
              sendBlockBreak(t.x, t.y, t.z);
              playBlockBreakSound();
              if (BLOCK_DEFS[blockId]?.explosive) {
                const cp = camera.position;
                triggerTntExplosion(t.x, t.y, t.z, [cp.x, cp.y - 1.6, cp.z]);
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

            // レバー設置時: 隣接するTNTを遠隔起爆
            if (selectedBlock === BLOCK_IDS.LEVER) {
              const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
              for (const [dx, dy, dz] of dirs) {
                const nx = t.placeX + dx;
                const ny = t.placeY + dy;
                const nz = t.placeZ + dz;
                const neighborBlock = getBlock(nx, ny, nz);
                if (BLOCK_DEFS[neighborBlock]?.explosive) {
                  if (breakBlock(nx, ny, nz)) {
                    spawnBlockBreakEffect(neighborBlock, nx, ny, nz);
                    sendBlockBreak(nx, ny, nz);
                    const cp = camera.position;
                    triggerTntExplosion(nx, ny, nz, [cp.x, cp.y - 1.6, cp.z]);
                  }
                }
              }
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
    if (useVehicleStore.getState().isInVehicle()) return;
    if (equippedItem !== 'builder') return;

    if (e.button === 0) {
      // 左クリック: プレイヤー攻撃 → モブ攻撃 → ブロック段階破壊開始
      if (!tryMeleeAttack()) {
        // ビルドモードは即破壊
        if (isBuildMode) {
          const t = targetRef.current;
          if (t) {
            const blockId = getBlock(t.x, t.y, t.z);
            if (breakBlock(t.x, t.y, t.z)) {
              spawnBlockBreakEffect(blockId, t.x, t.y, t.z);
              sendBlockBreak(t.x, t.y, t.z);
              playBlockBreakSound();
              if (BLOCK_DEFS[blockId]?.explosive) {
                const cp = camera.position;
                triggerTntExplosion(t.x, t.y, t.z, [cp.x, cp.y - 1.6, cp.z]);
              }
            }
          }
        } else {
          // サバイバルモード: 押しっぱなしで段階的破壊
          isBreakingRef.current = true;
        }
      }
    } else if (e.button === 2) {
      // 右クリック押下: 連続設置モード開始 + 初回即設置
      isPlacingRef.current = true;
      placeTimerRef.current = 0;
      lastPlacedRef.current = '';

      const t = targetRef.current;
      if (!t) return;

      // TNTブロックを右クリックで遠隔起爆
      const targetBlockId = getBlock(t.x, t.y, t.z);
      if (BLOCK_DEFS[targetBlockId]?.explosive) {
        if (breakBlock(t.x, t.y, t.z)) {
          spawnBlockBreakEffect(targetBlockId, t.x, t.y, t.z);
          sendBlockBreak(t.x, t.y, t.z);
          const cp = camera.position;
          triggerTntExplosion(t.x, t.y, t.z, [cp.x, cp.y - 1.6, cp.z]);
        }
        return;
      }

      if (!t.hasPlaceTarget) return;
      if (wouldBlockOverlapPlayer(t.placeX, t.placeY, t.placeZ)) return;
      const selectedBlock = getSelectedBlock();
      setBlock(t.placeX, t.placeY, t.placeZ, selectedBlock);
      sendBlockPlace(t.placeX, t.placeY, t.placeZ, selectedBlock);
      playBlockBreakSound();
      lastPlacedRef.current = `${t.placeX},${t.placeY},${t.placeZ}`;

      // SPAWNERブロック設置時
      if (selectedBlock === BLOCK_IDS.SPAWNER) {
        spawnMob('iron_golem', t.placeX + 0.5, t.placeY + 2, t.placeZ + 0.5);
      }
      // レバー設置時: 隣接TNT遠隔起爆
      if (selectedBlock === BLOCK_IDS.LEVER) {
        const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
        for (const [dx, dy, dz] of dirs) {
          const nx = t.placeX + dx;
          const ny = t.placeY + dy;
          const nz = t.placeZ + dz;
          const neighborBlock = getBlock(nx, ny, nz);
          if (BLOCK_DEFS[neighborBlock]?.explosive) {
            if (breakBlock(nx, ny, nz)) {
              spawnBlockBreakEffect(neighborBlock, nx, ny, nz);
              sendBlockBreak(nx, ny, nz);
              const cp = camera.position;
              triggerTntExplosion(nx, ny, nz, [cp.x, cp.y - 1.6, cp.z]);
            }
          }
        }
      }
    }
  }, [breakBlock, setBlock, getSelectedBlock, getBlock, dropItem, spawnMob, tryMeleeAttack, sendBlockBreak, sendBlockPlace, wouldBlockOverlapPlayer, equippedItem, isBuildMode, camera]);

  // 左クリック離し → 破壊中止
  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (e.button === 0) {
      isBreakingRef.current = false;
    }
    if (e.button === 2) {
      isPlacingRef.current = false;
      lastPlacedRef.current = '';
    }
  }, []);

  useEffect(() => {
    // デスクトップのみ: マウスイベントを登録
    if (isTouch.current) return;

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    // 右クリックのコンテキストメニューを無効化
    const preventContext = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', preventContext);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('contextmenu', preventContext);
    };
  }, [handleMouseDown, handleMouseUp]);

  return (
    <>
      <BlockHighlight target={target} />
      <BlockBreakProgressOverlay breakProgress={breakProgressState} />
    </>
  );
}
