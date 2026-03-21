// プレイヤーコンポーネント
// カスタム物理エンジン方式：ブロックとの直接AABB衝突判定
// Rapierに依存しないため軽量で確実

import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useWorldStore } from '../stores/useWorldStore';
import { HOTBAR_BLOCKS, BLOCK_IDS } from '../types/blocks';

// 定数
const MOVE_SPEED = 6;
const SPRINT_SPEED = 10;
const JUMP_VELOCITY = 9;
const GRAVITY = -28;
const MOUSE_SENSITIVITY = 0.002;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.3;

export function Player() {
  const { camera } = useThree();

  // プレイヤーの物理状態
  const position = useRef(new THREE.Vector3(8, 32, 8));
  const velocity = useRef(new THREE.Vector3(0, 0, 0));
  const onGround = useRef(false);

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

  const selectSlot = usePlayerStore((s) => s.selectSlot);
  const getBlock = useWorldStore((s) => s.getBlock);

  // ブロックとの衝突チェック
  const isBlockSolid = useCallback((x: number, y: number, z: number) => {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    return getBlock(bx, by, bz) !== BLOCK_IDS.AIR;
  }, [getBlock]);

  // AABB衝突判定（軸ごとに分離して解決）
  const collideAxis = useCallback((
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    axis: 'x' | 'y' | 'z',
    dt: number,
  ) => {
    const newPos = pos.clone();
    newPos[axis] += vel[axis] * dt;

    // プレイヤーの占有範囲をチェック
    const minX = newPos.x - PLAYER_RADIUS;
    const maxX = newPos.x + PLAYER_RADIUS;
    const minY = newPos.y;
    const maxY = newPos.y + PLAYER_HEIGHT;
    const minZ = newPos.z - PLAYER_RADIUS;
    const maxZ = newPos.z + PLAYER_RADIUS;

    for (let bx = Math.floor(minX); bx <= Math.floor(maxX); bx++) {
      for (let by = Math.floor(minY); by <= Math.floor(maxY); by++) {
        for (let bz = Math.floor(minZ); bz <= Math.floor(maxZ); bz++) {
          if (!isBlockSolid(bx, by, bz)) continue;

          // ブロックの境界
          const blockMin = new THREE.Vector3(bx, by, bz);
          const blockMax = new THREE.Vector3(bx + 1, by + 1, bz + 1);

          // AABB重なりチェック
          if (
            maxX > blockMin.x && minX < blockMax.x &&
            maxY > blockMin.y && minY < blockMax.y &&
            maxZ > blockMin.z && minZ < blockMax.z
          ) {
            // 衝突解決
            vel[axis] = 0;
            if (axis === 'y' && vel.y <= 0) {
              onGround.current = true;
            }
            return pos; // 元の位置を返す
          }
        }
      }
    }

    return newPos;
  }, [isBlockSolid]);

  // マウスによる視点回転
  const handleMouseMove = useCallback((e: MouseEvent) => {
    euler.current.y -= e.movementX * MOUSE_SENSITIVITY;
    euler.current.x -= e.movementY * MOUSE_SENSITIVITY;
    euler.current.x = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, euler.current.x));
    camera.quaternion.setFromEuler(euler.current);
  }, [camera]);

  // PointerLock
  useEffect(() => {
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

  // キーボード入力
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': keys.current.forward = true; break;
        case 'KeyS': keys.current.backward = true; break;
        case 'KeyA': keys.current.left = true; break;
        case 'KeyD': keys.current.right = true; break;
        case 'Space': keys.current.jump = true; break;
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
    const dt = Math.min(delta, 0.05); // フレーム落ち対策
    const vel = velocity.current;
    const pos = position.current;

    // 重力
    vel.y += GRAVITY * dt;
    onGround.current = false;

    // 入力から移動方向を算出
    const speed = keys.current.sprint ? SPRINT_SPEED : MOVE_SPEED;
    const inputZ = (keys.current.backward ? 1 : 0) - (keys.current.forward ? 1 : 0);
    const inputX = (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0);

    if (inputX !== 0 || inputZ !== 0) {
      const moveDir = new THREE.Vector3(inputX, 0, inputZ).normalize();
      moveDir.applyEuler(new THREE.Euler(0, euler.current.y, 0, 'YXZ'));
      vel.x = moveDir.x * speed;
      vel.z = moveDir.z * speed;
    } else {
      vel.x *= 0.8;
      vel.z *= 0.8;
      if (Math.abs(vel.x) < 0.01) vel.x = 0;
      if (Math.abs(vel.z) < 0.01) vel.z = 0;
    }

    // 軸ごとの衝突判定と位置更新
    const newPosY = collideAxis(pos, vel, 'y', dt);
    position.current.copy(newPosY);

    const newPosX = collideAxis(position.current, vel, 'x', dt);
    position.current.copy(newPosX);

    const newPosZ = collideAxis(position.current, vel, 'z', dt);
    position.current.copy(newPosZ);

    // 移動が衝突で止められなかった場合のみ位置を更新
    if (vel.x !== 0) position.current.x += vel.x * dt;
    if (vel.z !== 0) position.current.z += vel.z * dt;
    if (vel.y !== 0) position.current.y += vel.y * dt;

    // ジャンプ
    if (keys.current.jump && onGround.current) {
      vel.y = JUMP_VELOCITY;
      onGround.current = false;
    }

    // カメラ追従（目の高さ）
    camera.position.set(
      position.current.x,
      position.current.y + PLAYER_HEIGHT - 0.1,
      position.current.z,
    );

    // 落下リスポーン
    if (position.current.y < -20) {
      position.current.set(8, 32, 8);
      vel.set(0, 0, 0);
    }
  });

  return null; // プレイヤーは見えない（FPS視点）
}
