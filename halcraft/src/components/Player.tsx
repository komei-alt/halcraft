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
import { useVehicleStore, HELICOPTER_CONSTANTS, SEAT_OFFSETS, ALL_SEATS } from '../stores/useVehicleStore';
import { checkAABBCollision, isBlockSolid } from '../utils/collision';
import { isTouchDevice } from '../utils/device';
import {
  joystickInput,
  touchLook,
  mobileActions,
  resetTouchLookDelta,
} from '../utils/touchInput';
import { activateDesktopGameplayInput, getGameCanvas, isDesktopGameplayInputActive } from '../utils/gameCanvas';
import { getTerrainHeight } from '../utils/terrain/heightmap';

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

// スポーン座標（プレイヤーの家の中心近く）
const SPAWN_X = 8;
const SPAWN_Z = 8;
// プレイヤーの家の基準高さ（x=7, z=7 の地形高さ）を取得し、床(y=floorY)の上(空気ブロック)にスポーンさせる
const getSpawnY = () => getTerrainHeight(7, 7) + 1.1;

export function Player() {
  const { camera } = useThree();

  // プレイヤーの物理状態
  const initialY = getSpawnY();
  const position = useRef(new THREE.Vector3(SPAWN_X, initialY, SPAWN_Z));
  const velocity = useRef(new THREE.Vector3(0, 0, 0));
  const onGround = useRef(false);

  // カメラY座標スムージング用（接地振動によるブレを吸収）
  const smoothCameraY = useRef(initialY + PLAYER_HEIGHT - 0.1);

  // 落下ダメージ追跡
  const lastGroundY = useRef(initialY);
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

  // Wキーダブルタップでダッシュ用タイマー
  const lastWPressTime = useRef(0);
  const doubleTapSprint = useRef(false);

  // 視点回転
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  // タッチデバイス判定（初回のみ）
  const isTouch = useRef(isTouchDevice());

  // 再利用用ベクトル（GCプレッシャー削減）
  const moveDir = useRef(new THREE.Vector3());
  const moveEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  // 飛行機の前方ベクトル（再利用）
  const flyForward = useRef(new THREE.Vector3());
  // ヘリコプター操縦席オフセット（GCプレッシャー防止）
  const cockpitOffset = useRef(new THREE.Vector3());

  const selectSlot = usePlayerStore((s) => s.selectSlot);
  const cycleEquippedItem = usePlayerStore((s) => s.cycleEquippedItem);
  const getBlock = useWorldStore((s) => s.getBlock);
  const sendPosition = useMultiplayerStore((s) => s.sendPosition);
  const sendHelicopterBoard = useMultiplayerStore((s) => s.sendHelicopterBoard);
  const sendHelicopterDismount = useMultiplayerStore((s) => s.sendHelicopterDismount);
  const sendHelicopterMove = useMultiplayerStore((s) => s.sendHelicopterMove);

  // マルチプレイ位置送信のスロットリング
  const lastSendTime = useRef(0);
  const applyFallDamage = usePlayerStore((s) => s.applyFallDamage);
  const isDead = usePlayerStore((s) => s.isDead);
  const respawn = usePlayerStore((s) => s.respawn);
  const updateAttackCooldown = usePlayerStore((s) => s.updateAttackCooldown);
  const consumeKnockback = usePlayerStore((s) => s.consumeKnockback);

  // 指定位置にプレイヤーのAABBが固体ブロックと重なるか判定
  const checkCollision = useCallback((px: number, py: number, pz: number): boolean =>
    checkAABBCollision(getBlock, px, py, pz, PLAYER_RADIUS, PLAYER_HEIGHT, isBlockSolid),
  [getBlock]);

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

    const canvas = getGameCanvas();
    if (!canvas) return;

    const handleClick = () => {
      activateDesktopGameplayInput();
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
        case 'KeyW': {
          // ダブルタップ検出（300ms以内に再度Wを押すとダッシュ）
          const now = performance.now();
          if (!keys.current.forward && now - lastWPressTime.current < 300) {
            doubleTapSprint.current = true;
            keys.current.sprint = true;
          }
          lastWPressTime.current = now;
          keys.current.forward = true;
          break;
        }
        case 'KeyS': keys.current.backward = true; break;
        case 'KeyA': keys.current.left = true; break;
        case 'KeyD': keys.current.right = true; break;
        case 'Space': keys.current.jump = true; e.preventDefault(); break;
        case 'ShiftLeft': keys.current.sprint = true; break;
        case 'KeyQ': keys.current.sprint = true; break;
        case 'KeyF':
          if (!keys.current.interact) {
            keys.current.interact = true;
            interactPressed.current = true;
          }
          break;
        case 'KeyV':
          if (!e.repeat && isDesktopGameplayInputActive()) {
            cycleEquippedItem();
          }
          break;
      }
      if (e.code >= 'Digit1' && e.code <= 'Digit9') {
        const digit = parseInt(e.code.replace('Digit', ''));
        // ヘリ搭乗中: 1-4キーで座席移動
        const vehicleState = useVehicleStore.getState();
        if (vehicleState.helicopter.mySeat !== null && digit >= 1 && digit <= 3) {
          const targetSeat = ALL_SEATS[digit - 1];
          vehicleState.changeSeat(targetSeat);
        } else {
          // 通常: ホットバー選択
          const slot = digit - 1;
          const slotCount = usePlayerStore.getState().hotbarSlots.length;
          if (slot < slotCount) selectSlot(slot);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
          keys.current.forward = false;
          // ダブルタップダッシュ中にWを離したらダッシュ解除
          if (doubleTapSprint.current) {
            doubleTapSprint.current = false;
            keys.current.sprint = false;
          }
          break;
        case 'KeyS': keys.current.backward = false; break;
        case 'KeyA': keys.current.left = false; break;
        case 'KeyD': keys.current.right = false; break;
        case 'Space': keys.current.jump = false; break;
        case 'ShiftLeft': keys.current.sprint = false; break;
        case 'KeyQ': keys.current.sprint = false; break;
        case 'KeyF': keys.current.interact = false; break;
      }
    };
    const onWheel = (e: WheelEvent) => {
      const current = usePlayerStore.getState().selectedSlot;
      const dir = e.deltaY > 0 ? 1 : -1;
      const slotCount = usePlayerStore.getState().hotbarSlots.length;
      const next = ((current + dir) % slotCount + slotCount) % slotCount;
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
  }, [cycleEquippedItem, selectSlot]);

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
    const isInputActive = isTouch.current ? true : isDesktopGameplayInputActive();

    // --- 乗り物ストアの状態を取得 ---
    const vehicleState = useVehicleStore.getState();
    const heli = vehicleState.helicopter;
    const isInHeli = heli.mySeat !== null;

    // --- 搭乗/降車の処理（Fキー） ---
    if (interactPressed.current && isInputActive) {
      interactPressed.current = false;

      if (isInHeli) {
        // 降車: ヘリコプターから降りる
        vehicleState.dismountHelicopter();
        sendHelicopterDismount(); // サーバーに降車を通知
        // プレイヤーをヘリの横（右側）に配置（ヘリの向きを考慮）
        const dismountOffset = 2.5;
        const cosR = Math.cos(heli.rotationY + Math.PI / 2);
        const sinR = Math.sin(heli.rotationY + Math.PI / 2);
        const dismountX = heli.x + sinR * dismountOffset;
        const dismountZ = heli.z + cosR * dismountOffset;
        // ヘリの高度から下方向に地面を探す
        let landingY = heli.y;
        let foundGround = false;
        for (let checkY = Math.floor(heli.y); checkY >= 0; checkY--) {
          if (checkCollision(dismountX, checkY, dismountZ)) {
            // このブロックの上面に着地
            landingY = checkY + 1.001;
            foundGround = true;
            break;
          }
        }
        if (!foundGround) {
          landingY = 1;
        }
        pos.x = dismountX;
        pos.y = landingY;
        pos.z = dismountZ;
        vel.set(0, 0, 0);
        onGround.current = true;
        lastGroundY.current = pos.y;
        // カメラの向きをヘリの向きに合わせてリセット
        euler.current.x = 0;
        camera.quaternion.setFromEuler(euler.current);
      } else if (heli.spawned && vehicleState.findAvailableSeat() !== null) {
        // 搭乗: ヘリに近いかチェック（空席がある場合のみ）
        const dx = pos.x - heli.x;
        const dy = (pos.y + PLAYER_HEIGHT / 2) - heli.y;
        const dz = pos.z - heli.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < HELICOPTER_CONSTANTS.BOARD_DISTANCE) {
          const assignedSeat = vehicleState.boardHelicopter();
          if (assignedSeat) {
            sendHelicopterBoard(assignedSeat); // サーバーに搭乗を通知（座席指定）
            // カメラの向きをヘリの正面に合わせる
            euler.current.y = heli.rotationY;
            euler.current.x = -0.1; // 少し下向き（前方が見やすい）
            camera.quaternion.setFromEuler(euler.current);
          }
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
    // 降車直後のフレームで物理がリセット位置を上書きしないよう、最新の搭乗状態を再取得
    const latestHeli = useVehicleStore.getState().helicopter;
    const currentSeat = latestHeli.mySeat;
    if (currentSeat !== null) {
      const {
        MAX_SPEED, ACCELERATION, DECELERATION, TURN_SPEED,
        VERTICAL_SPEED, ROTOR_SPEED,
      } = HELICOPTER_CONSTANTS;

      // 搭乗中もクールダウンとノックバックを消費する（蓄積防止）
      updateAttackCooldown(dt);
      consumeKnockback();

      // パイロット席のみ操縦可能
      const isPilot = currentSeat === 'pilot';

      if (isPilot) {
        // === パイロット: 操縦ロジック ===
        let apSpeed = latestHeli.speed;
        let apRotY = latestHeli.rotationY;
        let apPitch = latestHeli.pitch;
        let apRoll = latestHeli.roll;
        let apX = latestHeli.x;
        let apY = latestHeli.y;
        let apZ = latestHeli.z;
        let apRotorAngle = latestHeli.rotorAngle;

        // 入力取得
        let inputForward: number;
        let inputTurn: number;
        let inputVertical: number;

        if (isTouch.current) {
          inputForward = -joystickInput.y;
          inputTurn = -joystickInput.x;
          inputVertical = mobileActions.jump ? 1 : 0;
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
          if (apSpeed > 0) {
            apSpeed = Math.max(0, apSpeed - DECELERATION * dt);
          } else {
            apSpeed = Math.min(0, apSpeed + DECELERATION * dt);
          }
        }

        // 旋回
        const turnFactor = Math.min(1, (Math.abs(apSpeed) + 2) / 5);
        const turnDelta = inputTurn * TURN_SPEED * dt * turnFactor;
        apRotY += turnDelta;

        // カメラの向きも旋回に同期
        euler.current.y += turnDelta;

        // 上昇/下降
        apY += inputVertical * VERTICAL_SPEED * dt;

        // 前方への移動
        flyForward.current.set(0, 0, -1);
        flyForward.current.applyAxisAngle(Y_AXIS, apRotY);
        apX += flyForward.current.x * apSpeed * dt;
        apZ += flyForward.current.z * apSpeed * dt;

        // ビジュアル: ピッチとロール
        const targetPitch = inputForward > 0 ? -0.1 : inputForward < 0 ? 0.15 : 0;
        const targetRoll = -inputTurn * 0.4;
        apPitch += (targetPitch - apPitch) * 3 * dt;
        apRoll += (targetRoll - apRoll) * 3 * dt;

        // 地面衝突チェック
        const heliBottomY = apY - 0.5;
        const groundCheck = checkCollision(apX, heliBottomY, apZ);
        if (groundCheck && inputVertical <= 0) {
          let safeY = apY;
          for (let checkY = Math.floor(heliBottomY); checkY < Math.floor(heliBottomY) + 5; checkY++) {
            if (!checkCollision(apX, checkY + 1, apZ)) {
              safeY = checkY + 1 + 0.5;
              break;
            }
          }
          apY = Math.max(apY, safeY);
        }

        if (apY < 1) apY = 1;

        // ローターアニメーション
        const rotorSpeedFactor = Math.abs(apSpeed) / MAX_SPEED;
        apRotorAngle += ROTOR_SPEED * (0.5 + rotorSpeedFactor * 0.5) * dt;

        // ストアに反映
        vehicleState.updateHelicopter({
          x: apX, y: apY, z: apZ,
          rotationY: apRotY, pitch: apPitch, roll: apRoll,
          speed: apSpeed, rotorAngle: apRotorAngle,
        });

        // カメラをパイロット席に配置
        const seatOff = SEAT_OFFSETS.pilot;
        cockpitOffset.current.set(seatOff.x, seatOff.y, seatOff.z);
        cockpitOffset.current.applyAxisAngle(Y_AXIS, apRotY);

        pos.x = apX + cockpitOffset.current.x;
        pos.y = apY + cockpitOffset.current.y;
        pos.z = apZ + cockpitOffset.current.z;

        camera.quaternion.setFromEuler(euler.current);
        camera.position.set(pos.x, pos.y, pos.z);

        // マルチプレイ送信
        const now = performance.now();
        if (now - lastSendTime.current > 50) {
          sendPosition([pos.x, pos.y, pos.z], [euler.current.y, euler.current.x]);
          sendHelicopterMove({
            x: apX, y: apY, z: apZ,
            rotationY: apRotY, pitch: apPitch, roll: apRoll,
            speed: apSpeed, rotorAngle: apRotorAngle,
          });
          lastSendTime.current = now;
        }
      } else {
        // === パイロット以外の席: ヘリに追従、視点のみ自由 ===
        // 毎フレーム最新のヘリ位置を再取得（サーバーから受信した値が反映される）
        // latestHeli は345行で1度取得したスナップショットなので、
        // 同乗者はサーバー同期で更新されるストアの最新値を使う必要がある
        const passengerHeli = useVehicleStore.getState().helicopter;
        const seatOff = SEAT_OFFSETS[currentSeat];
        cockpitOffset.current.set(seatOff.x, seatOff.y, seatOff.z);
        cockpitOffset.current.applyAxisAngle(Y_AXIS, passengerHeli.rotationY);

        pos.x = passengerHeli.x + cockpitOffset.current.x;
        pos.y = passengerHeli.y + cockpitOffset.current.y;
        pos.z = passengerHeli.z + cockpitOffset.current.z;

        // パイロット以外もヘリの向きベースで視点が回転
        // ただしマウスで自由に見回せる

        camera.quaternion.setFromEuler(euler.current);
        camera.position.set(pos.x, pos.y, pos.z);

        // マルチプレイ送信（同乗者の位置）
        const now = performance.now();
        if (now - lastSendTime.current > 50) {
          sendPosition([pos.x, pos.y, pos.z], [euler.current.y, euler.current.x]);
          lastSendTime.current = now;
        }
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

    // --- 重力（空中の場合のみ適用、接地中はスキップして振動を防ぐ） ---
    if (!onGround.current) {
      vel.y += GRAVITY * dt;
      // 終端速度を制限
      if (vel.y < -40) vel.y = -40;
    } else {
      // 接地中は垂直速度を強制的にゼロ維持（重力→衝突→スナップの振動を防止）
      vel.y = 0;
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
      // 空中にいる場合は接地フラグを降ろす（ジャンプ初期のvel.y>0含む）
      if (!onGround.current || vel.y > 0) {
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
    if (onGround.current) {
      // 足元にブロックがあるか確認（0.05だけ下をチェック — 0.1だとスナップ値1.001との
      // 精度差で誤検出し接地フラグが毎フレーム外れて振動の原因になる）
      if (!checkCollision(pos.x, pos.y - 0.05, pos.z)) {
        // 足元にブロックがない → 空中に出た（崖から歩き出した等）
        onGround.current = false;
      }
    }

    // --- カメラシェイクの減衰（MobManagerに依存せず常にここで処理） ---
    updateAttackCooldown(dt);

    // --- カメラ追従（目の高さ + シェイク） ---
    // カメラY座標をスムージング（接地スナップの微細な変動を吸収して震えを防止）
    const targetCameraY = pos.y + PLAYER_HEIGHT - 0.1;
    // 接地中は強めにスムージング、空中では追従を速く
    const smoothFactor = onGround.current ? 20 : 50;
    smoothCameraY.current += (targetCameraY - smoothCameraY.current) * Math.min(1, smoothFactor * dt);
    // smoothCameraYがtargetとほぼ一致したらスナップ（無限漸近を防止）
    if (Math.abs(smoothCameraY.current - targetCameraY) < 0.0005) {
      smoothCameraY.current = targetCameraY;
    }

    // 最新のcameraShake値を取得（上のupdateAttackCooldownで減衰済み）
    const currentShake = usePlayerStore.getState().cameraShake;
    let shakeX = 0;
    let shakeY = 0;
    if (currentShake > 0.01) {
      const shakeIntensity = currentShake * 0.08;
      shakeX = (Math.random() - 0.5) * shakeIntensity;
      shakeY = (Math.random() - 0.5) * shakeIntensity;
    }
    camera.position.set(
      pos.x + shakeX,
      smoothCameraY.current + shakeY,
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
      const respawnY = getSpawnY();
      pos.set(SPAWN_X, respawnY, SPAWN_Z);
      vel.set(0, 0, 0);
      lastGroundY.current = respawnY;
      smoothCameraY.current = respawnY + PLAYER_HEIGHT - 0.1;
      respawn();
    }
  });

  return null; // プレイヤーは見えない（FPS視点）
}
