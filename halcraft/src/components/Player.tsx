// プレイヤーコンポーネント
// カスタム物理エンジン方式：ブロックとの直接AABB衝突判定
// Rapierに依存しないため軽量で確実
// デスクトップ（キーボード+マウス）とモバイル（タッチ）両対応
// ヘリコプター搭乗時は飛行物理に切り替え

import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useWorldStore } from '../stores/useWorldStore';
import { useMultiplayerStore } from '../stores/useMultiplayerStore';
import { useVehicleStore, HELICOPTER_CONSTANTS } from '../stores/useVehicleStore';
import { HOTBAR_BLOCKS, BLOCK_IDS, BLOCK_DEFS } from '../types/blocks';
import { isTouchDevice } from '../utils/device';
import {
  joystickInput,
  touchLook,
  mobileActions,
  resetTouchLookDelta,
} from '../utils/touchInput';

// 定数
const MOVE_SPEED = 4.5;
const SPRINT_SPEED = 7.5;
const JUMP_VELOCITY = 8;
const GRAVITY = -25;
const MOUSE_SENSITIVITY = 0.002;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.25;
/** 再利用用Y軸ベクトル（GCプレッシャー防止） */
const Y_AXIS = new THREE.Vector3(0, 1, 0);

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
    interact: false, // Fキー（搭乗/降車）
  });

  // Fキーの単発入力用（押した瞬間のみ反応）
  const interactPressed = useRef(false);

  // 視点回転
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  // タッチデバイス判定（初回のみ）
  const isTouch = useRef(isTouchDevice());

  // 再利用用ベクトル（GCプレッシャー削減）
  const moveDir = useRef(new THREE.Vector3());
  const moveEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  // 飛行機の前方ベクトル（再利用）
  const flyForward = useRef(new THREE.Vector3());

  const selectSlot = usePlayerStore((s) => s.selectSlot);
  const getBlock = useWorldStore((s) => s.getBlock);
  const sendPosition = useMultiplayerStore((s) => s.sendPosition);

  // マルチプレイ位置送信のスロットリング
  const lastSendTime = useRef(0);
  const applyFallDamage = usePlayerStore((s) => s.applyFallDamage);
  const isDead = usePlayerStore((s) => s.isDead);
  const respawn = usePlayerStore((s) => s.respawn);
  const cameraShake = usePlayerStore((s) => s.cameraShake);
  const consumeKnockback = usePlayerStore((s) => s.consumeKnockback);

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
        case 'KeyF':
          if (!keys.current.interact) {
            keys.current.interact = true;
            interactPressed.current = true;
          }
          break;
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
        case 'KeyF': keys.current.interact = false; break;
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
    const isInputActive = isTouch.current ? true : !!document.pointerLockElement;

    // --- 乗り物ストアの状態を取得 ---
    const vehicleState = useVehicleStore.getState();
    const heli = vehicleState.helicopter;
    const isInHeli = heli.isBoarded;

    // --- 搭乗/降車の処理（Fキー） ---
    if (interactPressed.current && isInputActive) {
      interactPressed.current = false;

      if (isInHeli) {
        // 降車: ヘリコプターから降りる
        vehicleState.dismountHelicopter();
        // プレイヤーをヘリの横に配置し、地面まで降ろす
        const dismountX = heli.x + 2;
        const dismountZ = heli.z;
        // ヘリの高度から下方向に地面を探す
        let landingY = heli.y;
        for (let checkY = Math.floor(heli.y); checkY >= 0; checkY--) {
          if (checkCollision(dismountX, checkY, dismountZ)) {
            // このブロックの上面に着地
            landingY = checkY + 1.001;
            break;
          }
          if (checkY === 0) {
            // 地面が見つからない場合はY=1に配置
            landingY = 1;
          }
        }
        pos.x = dismountX;
        pos.y = landingY;
        pos.z = dismountZ;
        vel.set(0, 0, 0);
        onGround.current = true;
        lastGroundY.current = pos.y;
      } else if (heli.spawned) {
        // 搭乗: ヘリに近いかチェック
        const dx = pos.x - heli.x;
        const dy = (pos.y + PLAYER_HEIGHT / 2) - heli.y;
        const dz = pos.z - heli.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < HELICOPTER_CONSTANTS.BOARD_DISTANCE) {
          vehicleState.boardHelicopter();
          // カメラの向きをヘリの正面に合わせる
          euler.current.y = heli.rotationY;
          euler.current.x = -0.1; // 少し下向き（前方が見やすい）
          camera.quaternion.setFromEuler(euler.current);
        }
      }
    }
    // interactPressedをリセット（既に処理済み）
    if (!keys.current.interact) {
      interactPressed.current = false;
    }

    // ========================================
    // ヘリコプター搭乗中の物理
    // ========================================
    if (isInHeli) {
      const {
        MAX_SPEED, ACCELERATION, DECELERATION, TURN_SPEED,
        VERTICAL_SPEED, ROTOR_SPEED,
      } = HELICOPTER_CONSTANTS;

      let apSpeed = heli.speed;
      let apRotY = heli.rotationY;
      let apPitch = heli.pitch;
      let apRoll = heli.roll;
      let apX = heli.x;
      let apY = heli.y;
      let apZ = heli.z;
      let apRotorAngle = heli.rotorAngle;

      // 入力取得
      let inputForward: number;
      let inputTurn: number;
      let inputVertical: number;

      if (isTouch.current) {
        inputForward = -joystickInput.y; // 前後
        inputTurn = -joystickInput.x;    // 左右旋回
        inputVertical = mobileActions.jump ? 1 : 0; // 上昇
      } else {
        inputForward = isInputActive ? (keys.current.forward ? 1 : 0) - (keys.current.backward ? 1 : 0) : 0;
        inputTurn = isInputActive ? (keys.current.left ? 1 : 0) - (keys.current.right ? 1 : 0) : 0;
        inputVertical = isInputActive
          ? (keys.current.jump ? 1 : 0) - (keys.current.sprint ? 1 : 0)
          : 0;
      }

      // 加速/減速
      if (inputForward > 0) {
        apSpeed = Math.min(MAX_SPEED, apSpeed + ACCELERATION * dt);
      } else if (inputForward < 0) {
        apSpeed = Math.max(-MAX_SPEED * 0.3, apSpeed - ACCELERATION * 1.5 * dt);
      } else {
        // 自動減速
        if (apSpeed > 0) {
          apSpeed = Math.max(0, apSpeed - DECELERATION * dt);
        } else {
          apSpeed = Math.min(0, apSpeed + DECELERATION * dt);
        }
      }

      // 旋回（ヘリは低速でも旋回可能、ホバリング中も回れる）
      const turnFactor = Math.min(1, (Math.abs(apSpeed) + 2) / 5);
      const turnDelta = inputTurn * TURN_SPEED * dt * turnFactor;
      apRotY += turnDelta;

      // カメラの向きも旋回に同期（マウスはこの上にオーバーライドで動く）
      euler.current.y += turnDelta;

      // 上昇/下降
      apY += inputVertical * VERTICAL_SPEED * dt;

      // 前方への移動
      flyForward.current.set(0, 0, 1);
      flyForward.current.applyAxisAngle(Y_AXIS, apRotY);
      apX += flyForward.current.x * apSpeed * dt;
      apZ += flyForward.current.z * apSpeed * dt;

      // ビジュアル: ピッチとロール（滑らかに補間）
      const targetPitch = inputForward > 0 ? -0.1 : inputForward < 0 ? 0.15 : 0;
      const targetRoll = -inputTurn * 0.4;
      apPitch += (targetPitch - apPitch) * 3 * dt;
      apRoll += (targetRoll - apRoll) * 3 * dt;

      // 最低高度: 地面には潜らない
      // 簡易的な地面衝突チェック
      const groundCheck = checkCollision(apX, apY - 1, apZ);
      if (groundCheck && inputVertical <= 0) {
        // 地面に近い場合、下がらない
        if (apSpeed < 0.5) {
          // 速度がほぼ0で地面にいる → 着陸状態
        }
        // Y位置を地面の上に補正
        for (let checkY = Math.floor(apY); checkY < apY + 5; checkY++) {
          if (!checkCollision(apX, checkY + 1, apZ)) {
            apY = Math.max(apY, checkY + 2);
            break;
          }
        }
      }

      // 落下防止（最低高度）
      if (apY < 1) apY = 1;

      // ローターアニメーション
      const rotorSpeedFactor = Math.abs(apSpeed) / MAX_SPEED;
      apRotorAngle += ROTOR_SPEED * (0.5 + rotorSpeedFactor * 0.5) * dt;

      // ストアに反映
      vehicleState.updateHelicopter({
        x: apX,
        y: apY,
        z: apZ,
        rotationY: apRotY,
        pitch: apPitch,
        roll: apRoll,
        speed: apSpeed,
        rotorAngle: apRotorAngle,
      });

      // カメラをヘリの上に配置（操縦席の視点）
      const cockpitOffset = new THREE.Vector3(0, 1.8, 0.5);
      cockpitOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), apRotY);

      pos.x = apX + cockpitOffset.x;
      pos.y = apY + cockpitOffset.y;
      pos.z = apZ + cockpitOffset.z;

      // カメラの向きをeulerから更新（旋回+マウスの合成結果を反映）
      camera.quaternion.setFromEuler(euler.current);
      camera.position.set(pos.x, pos.y, pos.z);

      // マルチプレイ位置送信
      const now = performance.now();
      if (now - lastSendTime.current > 50) {
        sendPosition(
          [pos.x, pos.y, pos.z],
          [euler.current.y, euler.current.x],
        );
        lastSendTime.current = now;
      }

      return; // 通常の物理処理をスキップ
    }

    // ========================================
    // 通常の歩行物理（ヘリコプターに乗っていない場合）
    // ========================================

    // --- ジャンプ（重力適用前に処理） ---
    const jumpRequested = isTouch.current ? mobileActions.jump : keys.current.jump;
    if (isInputActive && jumpRequested && onGround.current) {
      vel.y = JUMP_VELOCITY;
      onGround.current = false;
    }

    // --- 重力（空中の場合のみ適用） ---
    if (!onGround.current) {
      vel.y += GRAVITY * dt;
      // 終端速度を制限
      if (vel.y < -40) vel.y = -40;
    }

    // --- ノックバック適用 ---
    const kb = consumeKnockback();
    if (kb.vx !== 0 || kb.vz !== 0) {
      vel.x += kb.vx;
      vel.z += kb.vz;
      vel.y = Math.max(vel.y, 4); // 少し上に浮く
    }

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
        // 足元のブロック上面にスナップ（微量上げて境界振動を防止）
        const footBlockY = Math.floor(newY);
        pos.y = footBlockY + 1.001;
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
    if (vel.y === 0 && onGround.current) {
      // 足元にブロックがあるか確認（少し下をチェック）
      if (!checkCollision(pos.x, pos.y - 0.1, pos.z)) {
        // 足元にブロックがない → 空中に出た
        onGround.current = false;
      }
    }

    // --- カメラ追従（目の高さ + シェイク） ---
    let shakeX = 0;
    let shakeY = 0;
    if (cameraShake > 0.01) {
      const shakeIntensity = cameraShake * 0.08;
      shakeX = (Math.random() - 0.5) * shakeIntensity;
      shakeY = (Math.random() - 0.5) * shakeIntensity;
    }
    camera.position.set(
      pos.x + shakeX,
      pos.y + PLAYER_HEIGHT - 0.1 + shakeY,
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
