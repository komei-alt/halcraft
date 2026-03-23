// プレイヤーコンポーネント
// カスタム物理エンジン方式：ブロックとの直接AABB衝突判定
// Rapierに依存しないため軽量で確実
// デスクトップ（キーボード+マウス）とモバイル（タッチ）両対応

import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useWorldStore } from '../stores/useWorldStore';
import { useMultiplayerStore } from '../stores/useMultiplayerStore';
import { HOTBAR_BLOCKS, BLOCK_IDS, BLOCK_DEFS } from '../types/blocks';
import { isTouchDevice } from '../utils/device';
import {
  joystickInput,
  touchLook,
  mobileActions,
  resetTouchLookDelta,
} from '../utils/touchInput';

// 定数
const MOVE_SPEED = 6;
const SPRINT_SPEED = 10;
const JUMP_VELOCITY = 8;
const GRAVITY = -25;
const MOUSE_SENSITIVITY = 0.002;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.25;

export function Player() {
  const { camera } = useThree();

  // プレイヤーの物理状態
  const position = useRef(new THREE.Vector3(8, 40, 8));
  const velocity = useRef(new THREE.Vector3(0, 0, 0));
  const onGround = useRef(false);

  // 落下ダメージ追跡
  const lastGroundY = useRef(40);
  const wasFalling = useRef(false);

  // キー入力状態
  const keys = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
  });

  // 視点回転
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  // タッチデバイス判定（初回のみ）
  const isTouch = useRef(isTouchDevice());

  // 再利用用ベクトル（GCプレッシャー削減）
  const moveDir = useRef(new THREE.Vector3());
  const moveEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  const selectSlot = usePlayerStore((s) => s.selectSlot);
  const getBlock = useWorldStore((s) => s.getBlock);
  const sendPosition = useMultiplayerStore((s) => s.sendPosition);

  // マルチプレイ位置送信のスロットリング
  const lastSendTime = useRef(0);
  const applyFallDamage = usePlayerStore((s) => s.applyFallDamage);
  const isDead = usePlayerStore((s) => s.isDead);
  const respawn = usePlayerStore((s) => s.respawn);

  // ブロックが固体（通行不可）かチェック
  const isBlockSolid = useCallback((bx: number, by: number, bz: number) => {
    const blockId = getBlock(bx, by, bz);
    if (blockId === BLOCK_IDS.AIR) return false;
    // 松明などnoCollision=trueのブロックは通過可能
    const def = BLOCK_DEFS[blockId];
    if (def?.noCollision) return false;
    return true;
  }, [getBlock]);

  // 指定位置にプレイヤーのAABBが固体ブロックと重なるか判定
  const checkCollision = useCallback((px: number, py: number, pz: number): boolean => {
    const minX = px - PLAYER_RADIUS;
    const maxX = px + PLAYER_RADIUS;
    const minY = py;
    const maxY = py + PLAYER_HEIGHT;
    const minZ = pz - PLAYER_RADIUS;
    const maxZ = pz + PLAYER_RADIUS;

    for (let bx = Math.floor(minX); bx <= Math.floor(maxX); bx++) {
      for (let by = Math.floor(minY); by <= Math.floor(maxY); by++) {
        for (let bz = Math.floor(minZ); bz <= Math.floor(maxZ); bz++) {
          if (!isBlockSolid(bx, by, bz)) continue;

          // ブロックAABBとの重なり判定
          if (
            maxX > bx && minX < bx + 1 &&
            maxY > by && minY < by + 1 &&
            maxZ > bz && minZ < bz + 1
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }, [isBlockSolid]);

  // マウスによる視点回転（デスクトップ用）
  const handleMouseMove = useCallback((e: MouseEvent) => {
    euler.current.y -= e.movementX * MOUSE_SENSITIVITY;
    euler.current.x -= e.movementY * MOUSE_SENSITIVITY;
    euler.current.x = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, euler.current.x));
    camera.quaternion.setFromEuler(euler.current);
  }, [camera]);

  // PointerLock（デスクトップのみ）
  useEffect(() => {
    // タッチデバイスではPointerLockを使わない
    if (isTouch.current) return;

    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    const handleClick = () => {
      if (!document.pointerLockElement) {
        canvas.requestPointerLock();
      }
    };
    const handleLockChange = () => {
      if (document.pointerLockElement === canvas) {
        document.addEventListener('mousemove', handleMouseMove);
      } else {
        document.removeEventListener('mousemove', handleMouseMove);
      }
    };

    canvas.addEventListener('click', handleClick);
    document.addEventListener('pointerlockchange', handleLockChange);
    return () => {
      canvas.removeEventListener('click', handleClick);
      document.removeEventListener('pointerlockchange', handleLockChange);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleMouseMove]);

  // キーボード入力（デスクトップのみ）
  useEffect(() => {
    if (isTouch.current) return;

    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': keys.current.forward = true; break;
        case 'KeyS': keys.current.backward = true; break;
        case 'KeyA': keys.current.left = true; break;
        case 'KeyD': keys.current.right = true; break;
        case 'Space': keys.current.jump = true; e.preventDefault(); break;
        case 'ShiftLeft': keys.current.sprint = true; break;
      }
      if (e.code >= 'Digit1' && e.code <= 'Digit9') {
        const slot = parseInt(e.code.replace('Digit', '')) - 1;
        if (slot < HOTBAR_BLOCKS.length) selectSlot(slot);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': keys.current.forward = false; break;
        case 'KeyS': keys.current.backward = false; break;
        case 'KeyA': keys.current.left = false; break;
        case 'KeyD': keys.current.right = false; break;
        case 'Space': keys.current.jump = false; break;
        case 'ShiftLeft': keys.current.sprint = false; break;
      }
    };
    const onWheel = (e: WheelEvent) => {
      const current = usePlayerStore.getState().selectedSlot;
      const dir = e.deltaY > 0 ? 1 : -1;
      const next = ((current + dir) % HOTBAR_BLOCKS.length + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length;
      selectSlot(next);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('wheel', onWheel);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('wheel', onWheel);
    };
  }, [selectSlot]);

  // 毎フレーム物理シミュレーション
  useFrame((_, delta) => {
    // 死亡中は動けない
    if (isDead) return;

    const dt = Math.min(delta, 0.05); // フレーム落ち対策
    const vel = velocity.current;
    const pos = position.current;

    // --- タッチ視点操作の適用 ---
    if (isTouch.current) {
      euler.current.y -= touchLook.deltaX;
      euler.current.x -= touchLook.deltaY;
      euler.current.x = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, euler.current.x));
      camera.quaternion.setFromEuler(euler.current);
      resetTouchLookDelta();
    }

    // --- 入力のアクティブ判定 ---
    // デスクトップ: PointerLock中のみ入力受付
    // モバイル: 常に入力受付（タッチUIが制御）
    const isInputActive = isTouch.current ? true : !!document.pointerLockElement;

    // --- ジャンプ（重力適用前に処理） ---
    const jumpRequested = isTouch.current ? mobileActions.jump : keys.current.jump;
    if (isInputActive && jumpRequested && onGround.current) {
      vel.y = JUMP_VELOCITY;
      onGround.current = false;
    }

    // --- 重力 ---
    vel.y += GRAVITY * dt;
    // 終端速度を制限
    if (vel.y < -40) vel.y = -40;

    // --- 水平入力 ---
    const speed = keys.current.sprint ? SPRINT_SPEED : MOVE_SPEED;

    let inputX: number;
    let inputZ: number;

    if (isTouch.current) {
      // モバイル: ジョイスティック入力
      inputX = joystickInput.x;
      inputZ = -joystickInput.y; // ジョイスティックyの正=前方 → inputZの負=前方
    } else {
      // デスクトップ: キーボード入力
      inputZ = isInputActive ? (keys.current.backward ? 1 : 0) - (keys.current.forward ? 1 : 0) : 0;
      inputX = isInputActive ? (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0) : 0;
    }

    if (Math.abs(inputX) > 0.1 || Math.abs(inputZ) > 0.1) {
      moveDir.current.set(inputX, 0, inputZ).normalize();
      moveEuler.current.set(0, euler.current.y, 0);
      moveDir.current.applyEuler(moveEuler.current);
      vel.x = moveDir.current.x * speed;
      vel.z = moveDir.current.z * speed;
    } else {
      // 入力なし → 減速
      vel.x *= 0.85;
      vel.z *= 0.85;
      if (Math.abs(vel.x) < 0.01) vel.x = 0;
      if (Math.abs(vel.z) < 0.01) vel.z = 0;
    }

    // --- 落下追跡（Y軸衝突判定の前に） ---
    const isFallingNow = vel.y < -0.5;
    if (onGround.current && !isFallingNow) {
      // 地上にいる → 落下開始位置を更新
      lastGroundY.current = pos.y;
    }
    wasFalling.current = isFallingNow;

    // --- 軸分離衝突判定 ---
    // Y軸（上下）
    const newY = pos.y + vel.y * dt;
    if (checkCollision(pos.x, newY, pos.z)) {
      // 落下中に衝突 → 接地
      if (vel.y < 0) {
        // 落下ダメージを計算
        const fallDistance = lastGroundY.current - newY;
        if (fallDistance > 0 && wasFalling.current) {
          applyFallDamage(fallDistance);
        }
        onGround.current = true;
        // 足元のブロック上面にスナップ
        const footBlockY = Math.floor(pos.y + vel.y * dt);
        pos.y = footBlockY + 1;
        // 着地後の落下開始位置をリセット
        lastGroundY.current = pos.y;
      }
      vel.y = 0;
    } else {
      pos.y = newY;
      // 空中にいる場合は接地フラグを降ろす
      if (vel.y !== 0) {
        onGround.current = false;
      }
    }

    // X軸（左右）
    const newX = pos.x + vel.x * dt;
    if (checkCollision(newX, pos.y, pos.z)) {
      vel.x = 0;
    } else {
      pos.x = newX;
    }

    // Z軸（前後）
    const newZ = pos.z + vel.z * dt;
    if (checkCollision(pos.x, pos.y, newZ)) {
      vel.z = 0;
    } else {
      pos.z = newZ;
    }

    // --- 接地チェック（静止時にも接地判定を維持） ---
    if (vel.y === 0) {
      // 足元にブロックがあるか確認（少し下をチェック）
      if (checkCollision(pos.x, pos.y - 0.05, pos.z)) {
        onGround.current = true;
      } else {
        onGround.current = false;
      }
    }

    // --- カメラ追従（目の高さ） ---
    camera.position.set(
      pos.x,
      pos.y + PLAYER_HEIGHT - 0.1,
      pos.z,
    );

    // --- マルチプレイ位置送信（50ms間隔） ---
    const now = performance.now();
    if (now - lastSendTime.current > 50) {
      sendPosition(
        [pos.x, pos.y, pos.z],
        [euler.current.y, euler.current.x],
      );
      lastSendTime.current = now;
    }

    // --- 落下リスポーン ---
    if (pos.y < -20) {
      pos.set(8, 40, 8);
      vel.set(0, 0, 0);
      lastGroundY.current = 40;
      respawn();
    }
  });

  return null; // プレイヤーは見えない（FPS視点）
}
