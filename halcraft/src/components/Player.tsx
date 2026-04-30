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
import { useGameStore } from '../stores/useGameStore';
import {
  AIRPLANE_CONSTANTS,
  HELICOPTER_CONSTANTS,
  SEAT_OFFSETS,
  TANK_CONSTANTS,
  useVehicleStore,
  ALL_SEATS,
  type VehicleType,
} from '../stores/useVehicleStore';
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
import { TANK_CAMERA_POSITION, TANK_TURRET_PIVOT } from './vehicles/vehicleModelConfig';

// 定数
const MOVE_SPEED = 4.5;
const SPRINT_SPEED = 7.5;
const JUMP_VELOCITY = 8;
const GRAVITY = -25;
const CREATIVE_FLY_SPEED = 8.5;
const CREATIVE_FLY_SPRINT_SPEED = 14;
const CREATIVE_FLY_VERTICAL_SPEED = 6.8;
const CREATIVE_DOUBLE_JUMP_MS = 350;
const MOUSE_SENSITIVITY = 0.002;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.25;
const AIRCRAFT_MOUSE_YAW_RANGE = 0.72;
const HELICOPTER_BANK_LIMIT = 0.45;
const AIRPLANE_BANK_LIMIT = 0.58;
const AIRPLANE_MOUSE_PITCH_LIMIT = 0.42;
const AIRPLANE_MOUSE_YAW_RATE = 1.2;
const AIRPLANE_KEYBOARD_YAW_RATE = 1.15;
const AIRPLANE_KEYBOARD_PITCH_RATE = 0.75;
const AIRPLANE_YAW_FOLLOW_RATE = 2.6;
const AIRPLANE_PITCH_CLIMB_RATE = 9.5;
const AIRPLANE_LOW_SPEED_SINK_RATE = 2.2;
/** 再利用用Y軸ベクトル（GCプレッシャー防止） */
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// スポーン座標（プレイヤーの家の中心近く）
const SPAWN_X = 8;
const SPAWN_Z = 8;
// プレイヤーの家の基準高さ（x=7, z=7 の地形高さ）を取得し、床(y=floorY)の上(空気ブロック)にスポーンさせる
const getSpawnY = () => getTerrainHeight(7, 7) + 1.1;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle: number): number {
  return ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function smoothValue(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

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
    descend: false,
    interact: false, // Fキー（搭乗/降車）
  });

  // Fキーの単発入力用（押した瞬間のみ反応）
  const interactPressed = useRef(false);

  // Wキーダブルタップでダッシュ用タイマー
  const lastWPressTime = useRef(0);
  const doubleTapSprint = useRef(false);
  const lastJumpPressTime = useRef(0);
  const lastJumpDown = useRef(false);

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
  const tankCameraOffset = useRef(new THREE.Vector3());
  const tankTurretPivot = useRef(new THREE.Vector3());
  const airplaneControlYaw = useRef(0);
  const airplaneControlPitch = useRef(0);
  const airplaneControlActive = useRef(false);

  const selectSlot = usePlayerStore((s) => s.selectSlot);
  const cycleEquippedItem = usePlayerStore((s) => s.cycleEquippedItem);
  const getBlock = useWorldStore((s) => s.getBlock);
  const sendPosition = useMultiplayerStore((s) => s.sendPosition);
  const sendHelicopterBoard = useMultiplayerStore((s) => s.sendHelicopterBoard);
  const sendHelicopterDismount = useMultiplayerStore((s) => s.sendHelicopterDismount);
  const sendHelicopterMove = useMultiplayerStore((s) => s.sendHelicopterMove);
  const sendVehicleBoard = useMultiplayerStore((s) => s.sendVehicleBoard);
  const sendVehicleDismount = useMultiplayerStore((s) => s.sendVehicleDismount);
  const sendVehicleMove = useMultiplayerStore((s) => s.sendVehicleMove);

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
    if (useVehicleStore.getState().getActiveVehicle() === 'airplane') {
      airplaneControlYaw.current = normalizeAngle(
        airplaneControlYaw.current - e.movementX * MOUSE_SENSITIVITY * AIRPLANE_MOUSE_YAW_RATE,
      );
      airplaneControlPitch.current = clamp(
        airplaneControlPitch.current - e.movementY * MOUSE_SENSITIVITY,
        -AIRPLANE_MOUSE_PITCH_LIMIT,
        AIRPLANE_MOUSE_PITCH_LIMIT,
      );
      return;
    }

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
        case 'ShiftLeft':
        case 'ShiftRight':
          keys.current.sprint = true;
          keys.current.descend = true;
          break;
        case 'ControlLeft':
        case 'ControlRight':
          keys.current.sprint = true;
          break;
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
        case 'ShiftLeft':
        case 'ShiftRight':
          keys.current.sprint = false;
          keys.current.descend = false;
          break;
        case 'ControlLeft':
        case 'ControlRight':
          keys.current.sprint = false;
          break;
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
    const gameState = useGameStore.getState();
    if (gameState.phase !== 'playing') return;
    const gameMode = gameState.gameMode;
    let creativeFlying = gameMode === 'creative' && gameState.creativeFlying;

    if (gameMode !== 'creative' && gameState.creativeFlying) {
      useGameStore.getState().setCreativeFlying(false);
      creativeFlying = false;
    }

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
    const isInVehicle = vehicleState.isInVehicle();
    const jumpRequested = isTouch.current ? mobileActions.jump : keys.current.jump;
    const jumpJustPressed = jumpRequested && !lastJumpDown.current;
    lastJumpDown.current = jumpRequested;

    if (!isInVehicle && isInputActive && gameMode === 'creative' && jumpJustPressed) {
      const now = performance.now();
      if (now - lastJumpPressTime.current <= CREATIVE_DOUBLE_JUMP_MS) {
        creativeFlying = !creativeFlying;
        useGameStore.getState().setCreativeFlying(creativeFlying);
        vel.y = 0;
        onGround.current = false;
        wasFalling.current = false;
        lastGroundY.current = pos.y;
        lastJumpPressTime.current = 0;
      } else {
        lastJumpPressTime.current = now;
      }
    }

    // --- 搭乗/降車の処理（Fキー） ---
    if (interactPressed.current && isInputActive) {
      interactPressed.current = false;

      const activeVehicle = vehicleState.getActiveVehicle();

      if (activeVehicle !== null) {
        const vehicle =
          activeVehicle === 'helicopter' ? vehicleState.helicopter :
          activeVehicle === 'tank' ? vehicleState.tank :
          vehicleState.airplane;
        const dismountOffset = activeVehicle === 'airplane' ? 5 : 3;
        const cosR = Math.cos(vehicle.rotationY + Math.PI / 2);
        const sinR = Math.sin(vehicle.rotationY + Math.PI / 2);
        const dismountX = vehicle.x + sinR * dismountOffset;
        const dismountZ = vehicle.z + cosR * dismountOffset;
        const groundY = getTerrainHeight(Math.floor(dismountX), Math.floor(dismountZ)) + 1.001;

        if (activeVehicle === 'helicopter') {
          vehicleState.dismountHelicopter();
          sendHelicopterDismount();
        } else {
          vehicleState.dismountVehicle(activeVehicle);
          sendVehicleDismount(activeVehicle);
          if (activeVehicle === 'airplane') {
            airplaneControlActive.current = false;
          }
        }

        pos.x = dismountX;
        pos.y = groundY;
        pos.z = dismountZ;
        vel.set(0, 0, 0);
        onGround.current = true;
        lastGroundY.current = pos.y;
        euler.current.x = 0;
        camera.quaternion.setFromEuler(euler.current);
      } else {
        const candidates: Array<{ type: VehicleType; dist: number }> = [];

        if (heli.spawned && vehicleState.findAvailableSeat() !== null) {
          const dx = pos.x - heli.x;
          const dy = (pos.y + PLAYER_HEIGHT / 2) - heli.y;
          const dz = pos.z - heli.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < HELICOPTER_CONSTANTS.BOARD_DISTANCE) candidates.push({ type: 'helicopter', dist });
        }

        const tank = vehicleState.tank;
        if (tank.spawned && tank.seats.pilot === null) {
          const dx = pos.x - tank.x;
          const dy = (pos.y + PLAYER_HEIGHT / 2) - tank.y;
          const dz = pos.z - tank.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < TANK_CONSTANTS.BOARD_DISTANCE) candidates.push({ type: 'tank', dist });
        }

        const airplane = vehicleState.airplane;
        if (airplane.spawned && airplane.seats.pilot === null) {
          const dx = pos.x - airplane.x;
          const dy = (pos.y + PLAYER_HEIGHT / 2) - airplane.y;
          const dz = pos.z - airplane.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < AIRPLANE_CONSTANTS.BOARD_DISTANCE) candidates.push({ type: 'airplane', dist });
        }

        candidates.sort((a, b) => a.dist - b.dist);
        const nearest = candidates[0]?.type;

        if (nearest === 'helicopter') {
          const assignedSeat = vehicleState.boardHelicopter();
          if (assignedSeat) {
            sendHelicopterBoard(assignedSeat);
            euler.current.y = heli.rotationY;
            euler.current.x = -0.1;
            camera.quaternion.setFromEuler(euler.current);
          }
        } else if (nearest === 'tank' || nearest === 'airplane') {
          const assignedSeat = vehicleState.boardVehicle(nearest);
          if (assignedSeat) {
            sendVehicleBoard(nearest);
            const v = nearest === 'tank' ? vehicleState.tank : vehicleState.airplane;
            euler.current.y = v.rotationY;
            euler.current.x = nearest === 'airplane' ? -0.04 : -0.08;
            if (nearest === 'airplane') {
              airplaneControlYaw.current = v.rotationY;
              airplaneControlPitch.current = 0;
              airplaneControlActive.current = true;
            }
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
            ? (keys.current.jump ? 1 : 0) - (keys.current.descend ? 1 : 0)
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

        const mouseTurn = !isTouch.current && isInputActive
          ? clamp(normalizeAngle(euler.current.y - apRotY) / AIRCRAFT_MOUSE_YAW_RANGE, -1, 1)
          : 0;
        const steeringInput = isTouch.current
          ? inputTurn
          : clamp(inputTurn + mouseTurn, -1, 1);

        // ビジュアル: ピッチとロール。ロール量を旋回入力として使う。
        const mousePitch = !isTouch.current && isInputActive
          ? clamp(euler.current.x / 0.7, -1, 1)
          : 0;
        const targetPitch = clamp(
          mousePitch * 0.2 + (inputForward > 0 ? -0.08 : inputForward < 0 ? 0.12 : 0),
          -0.32,
          0.32,
        );
        const targetRoll = steeringInput * HELICOPTER_BANK_LIMIT;
        apPitch += (targetPitch - apPitch) * 3 * dt;
        apRoll += (targetRoll - apRoll) * 4 * dt;

        // 旋回
        const turnFactor = Math.min(1, (Math.abs(apSpeed) + 2) / 5);
        const bankTurn = clamp(apRoll / HELICOPTER_BANK_LIMIT, -1, 1);
        const turnDelta = bankTurn * TURN_SPEED * dt * turnFactor;
        apRotY += turnDelta;

        // キーボード旋回時は視点目標も一緒に動かす。マウス旋回時は機体が照準へ追従する。
        if (!isTouch.current && Math.abs(inputTurn) > 0.01) {
          euler.current.y += turnDelta;
        }

        // 上昇/下降
        apY += inputVertical * VERTICAL_SPEED * dt;

        // 前方への移動
        flyForward.current.set(0, 0, -1);
        flyForward.current.applyAxisAngle(Y_AXIS, apRotY);
        apX += flyForward.current.x * apSpeed * dt;
        apZ += flyForward.current.z * apSpeed * dt;

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
    // 戦車搭乗中の物理
    // ========================================
    const latestTank = useVehicleStore.getState().tank;
    if (latestTank.mySeat === 'pilot') {
      updateAttackCooldown(dt);
      consumeKnockback();

      let tankSpeed = latestTank.speed;
      let tankRotY = latestTank.rotationY;
      let tankX = latestTank.x;
      let tankZ = latestTank.z;

      const inputForward = isTouch.current
        ? -joystickInput.y
        : (isInputActive ? (keys.current.forward ? 1 : 0) - (keys.current.backward ? 1 : 0) : 0);
      const inputTurn = isTouch.current
        ? -joystickInput.x
        : (isInputActive ? (keys.current.left ? 1 : 0) - (keys.current.right ? 1 : 0) : 0);

      if (inputForward > 0) {
        tankSpeed = Math.min(TANK_CONSTANTS.MAX_SPEED, tankSpeed + TANK_CONSTANTS.ACCELERATION * dt);
      } else if (inputForward < 0) {
        tankSpeed = Math.max(-TANK_CONSTANTS.REVERSE_SPEED, tankSpeed - TANK_CONSTANTS.ACCELERATION * dt);
      } else if (tankSpeed > 0) {
        tankSpeed = Math.max(0, tankSpeed - TANK_CONSTANTS.DECELERATION * dt);
      } else {
        tankSpeed = Math.min(0, tankSpeed + TANK_CONSTANTS.DECELERATION * dt);
      }

      const turnFactor = Math.min(1, (Math.abs(tankSpeed) + 1) / 5);
      const turnDelta = inputTurn * TANK_CONSTANTS.TURN_SPEED * dt * turnFactor;
      tankRotY += turnDelta;
      euler.current.y += turnDelta;

      flyForward.current.set(0, 0, -1).applyAxisAngle(Y_AXIS, tankRotY);
      tankX += flyForward.current.x * tankSpeed * dt;
      tankZ += flyForward.current.z * tankSpeed * dt;

      const tankY = getTerrainHeight(Math.floor(tankX), Math.floor(tankZ)) + TANK_CONSTANTS.BODY_HEIGHT;
      const turretYaw = ((euler.current.y - tankRotY + Math.PI) % (Math.PI * 2)) - Math.PI;
      const nextGunSpin = latestTank.gunSpin + Math.abs(tankSpeed) * dt;
      const tankRoll = -inputTurn * 0.05;

      useVehicleStore.getState().updateTank({
        x: tankX,
        y: tankY,
        z: tankZ,
        rotationY: tankRotY,
        pitch: 0,
        roll: tankRoll,
        speed: tankSpeed,
        turretYaw,
        gunSpin: nextGunSpin,
      });

      tankTurretPivot.current.set(TANK_TURRET_PIVOT[0], TANK_TURRET_PIVOT[1], TANK_TURRET_PIVOT[2]);
      tankCameraOffset.current
        .set(
          TANK_CAMERA_POSITION[0] - TANK_TURRET_PIVOT[0],
          TANK_CAMERA_POSITION[1] - TANK_TURRET_PIVOT[1],
          TANK_CAMERA_POSITION[2] - TANK_TURRET_PIVOT[2],
        )
        .applyAxisAngle(Y_AXIS, turretYaw)
        .add(tankTurretPivot.current)
        .applyAxisAngle(Y_AXIS, tankRotY);
      pos.x = tankX + tankCameraOffset.current.x;
      pos.y = tankY + tankCameraOffset.current.y;
      pos.z = tankZ + tankCameraOffset.current.z;

      camera.quaternion.setFromEuler(euler.current);
      camera.position.set(pos.x, pos.y, pos.z);

      const now = performance.now();
      if (now - lastSendTime.current > 50) {
        sendPosition([pos.x, pos.y, pos.z], [euler.current.y, euler.current.x]);
        sendVehicleMove('tank', {
          x: tankX,
          y: tankY,
          z: tankZ,
          rotationY: tankRotY,
          pitch: 0,
          roll: tankRoll,
          speed: tankSpeed,
          turretYaw,
          gunSpin: nextGunSpin,
        });
        lastSendTime.current = now;
      }

      return;
    }

    // ========================================
    // 飛行機搭乗中の物理
    // ========================================
    const latestAirplane = useVehicleStore.getState().airplane;
    if (latestAirplane.mySeat === 'pilot') {
      updateAttackCooldown(dt);
      consumeKnockback();

      let planeSpeed = latestAirplane.speed;
      let planeRotY = latestAirplane.rotationY;
      let planePitch = latestAirplane.pitch;
      let planeRoll = latestAirplane.roll;
      let planeX = latestAirplane.x;
      let planeY = latestAirplane.y;
      let planeZ = latestAirplane.z;
      let airborne = latestAirplane.airborne;

      if (!airplaneControlActive.current) {
        airplaneControlYaw.current = planeRotY;
        airplaneControlPitch.current = planePitch;
        airplaneControlActive.current = true;
      }

      const inputForward = isTouch.current
        ? -joystickInput.y
        : (isInputActive ? (keys.current.forward ? 1 : 0) - (keys.current.backward ? 1 : 0) : 0);
      const inputTurn = isTouch.current
        ? -joystickInput.x
        : (isInputActive ? (keys.current.left ? 1 : 0) - (keys.current.right ? 1 : 0) : 0);
      const inputPitch = isTouch.current
        ? (mobileActions.jump ? 1 : 0)
        : (isInputActive ? (keys.current.jump ? 1 : 0) - (keys.current.descend ? 1 : 0) : 0);

      if (inputForward > 0) {
        planeSpeed = Math.min(AIRPLANE_CONSTANTS.MAX_SPEED, planeSpeed + AIRPLANE_CONSTANTS.ACCELERATION * dt);
      } else if (inputForward < 0) {
        planeSpeed = Math.max(0, planeSpeed - AIRPLANE_CONSTANTS.DECELERATION * 1.4 * dt);
      } else {
        planeSpeed = Math.max(0, planeSpeed - AIRPLANE_CONSTANTS.DECELERATION * 0.35 * dt);
      }

      if (!isTouch.current && isInputActive) {
        airplaneControlYaw.current = normalizeAngle(
          airplaneControlYaw.current + inputTurn * AIRPLANE_KEYBOARD_YAW_RATE * dt,
        );
        airplaneControlPitch.current = clamp(
          airplaneControlPitch.current + inputPitch * AIRPLANE_KEYBOARD_PITCH_RATE * dt,
          -AIRPLANE_MOUSE_PITCH_LIMIT,
          AIRPLANE_MOUSE_PITCH_LIMIT,
        );
      }

      const yawAuthority = clamp(planeSpeed / 12, 0.18, 1);
      const yawError = normalizeAngle(airplaneControlYaw.current - planeRotY);
      const steeringInput = isTouch.current
        ? inputTurn
        : clamp(yawError / AIRCRAFT_MOUSE_YAW_RANGE, -1, 1);
      const pitchDemand = isTouch.current
        ? inputPitch * 0.42
        : airplaneControlPitch.current;

      const groundY = getTerrainHeight(Math.floor(planeX), Math.floor(planeZ)) + AIRPLANE_CONSTANTS.BODY_HEIGHT;
      if (!airborne && planeSpeed >= AIRPLANE_CONSTANTS.TAKEOFF_SPEED && pitchDemand > 0.07) {
        airborne = true;
        planeY = Math.max(planeY, groundY + 0.5);
      }

      const bankLimit = airborne ? AIRPLANE_BANK_LIMIT : 0.18;
      const targetRoll = steeringInput * bankLimit;
      planeRoll = smoothValue(planeRoll, targetRoll, 6.5, dt);

      if (isTouch.current) {
        const bankTurn = clamp(planeRoll / bankLimit, -1, 1);
        planeRotY = normalizeAngle(
          planeRotY + bankTurn * AIRPLANE_CONSTANTS.TURN_SPEED * dt * yawAuthority,
        );
      } else {
        const maxTurnRate = AIRPLANE_CONSTANTS.TURN_SPEED * yawAuthority;
        const turnRate = clamp(yawError * AIRPLANE_YAW_FOLLOW_RATE, -maxTurnRate, maxTurnRate);
        planeRotY = normalizeAngle(planeRotY + turnRate * dt);
      }

      const targetPitch = airborne
        ? clamp(pitchDemand, -0.38, 0.42)
        : 0;
      planePitch = smoothValue(planePitch, targetPitch, 6.5, dt);

      flyForward.current.set(0, 0, -1).applyAxisAngle(Y_AXIS, planeRotY);
      planeX += flyForward.current.x * planeSpeed * dt;
      planeZ += flyForward.current.z * planeSpeed * dt;

      const nextGroundY = getTerrainHeight(Math.floor(planeX), Math.floor(planeZ)) + AIRPLANE_CONSTANTS.BODY_HEIGHT;
      if (airborne) {
        const controllableSpeedRange = Math.max(0.001, AIRPLANE_CONSTANTS.TAKEOFF_SPEED - AIRPLANE_CONSTANTS.STALL_SPEED);
        const controlAuthority = clamp(
          (planeSpeed - AIRPLANE_CONSTANTS.STALL_SPEED) / controllableSpeedRange,
          0,
          1,
        );
        const stallSink = Math.pow(1 - controlAuthority, 2) * AIRPLANE_CONSTANTS.GRAVITY;
        const landingSink = (1 - controlAuthority) * AIRPLANE_LOW_SPEED_SINK_RATE;
        const pitchVerticalSpeed = planePitch * AIRPLANE_PITCH_CLIMB_RATE * (0.25 + controlAuthority * 0.75);
        const verticalSpeed = pitchVerticalSpeed - stallSink - landingSink;
        planeY += verticalSpeed * dt;
        if (planeY <= nextGroundY + 0.15) {
          planeY = nextGroundY;
          airborne = planeSpeed > AIRPLANE_CONSTANTS.TAKEOFF_SPEED * 0.8 && pitchDemand > 0.07;
          planePitch = airborne ? Math.max(planePitch, 0.08) : 0;
        }
      } else {
        planeY = nextGroundY;
      }

      const nextPropellerAngle = latestAirplane.propellerAngle + AIRPLANE_CONSTANTS.PROPELLER_SPEED * dt;
      const throttle = planeSpeed / AIRPLANE_CONSTANTS.MAX_SPEED;
      useVehicleStore.getState().updateAirplane({
        x: planeX,
        y: planeY,
        z: planeZ,
        rotationY: planeRotY,
        pitch: planePitch,
        roll: planeRoll,
        speed: planeSpeed,
        throttle,
        airborne,
        propellerAngle: nextPropellerAngle,
      });

      cockpitOffset.current.set(0, AIRPLANE_CONSTANTS.CAMERA_HEIGHT, AIRPLANE_CONSTANTS.CAMERA_BACK);
      cockpitOffset.current.applyAxisAngle(Y_AXIS, planeRotY);
      pos.x = planeX + cockpitOffset.current.x;
      pos.y = planeY + cockpitOffset.current.y;
      pos.z = planeZ + cockpitOffset.current.z;

      euler.current.y = planeRotY;
      euler.current.x = planePitch;
      camera.quaternion.setFromEuler(euler.current);
      camera.position.set(pos.x, pos.y, pos.z);

      const now = performance.now();
      if (now - lastSendTime.current > 50) {
        sendPosition([pos.x, pos.y, pos.z], [euler.current.y, euler.current.x]);
        sendVehicleMove('airplane', {
          x: planeX,
          y: planeY,
          z: planeZ,
          rotationY: planeRotY,
          pitch: planePitch,
          roll: planeRoll,
          speed: planeSpeed,
          throttle,
          airborne,
          propellerAngle: nextPropellerAngle,
        });
        lastSendTime.current = now;
      }

      return;
    }

    // ========================================
    // クリエイティブ飛行（Space二度押しでホバー、Space上昇 / Shift下降）
    // ========================================
    if (creativeFlying) {
      updateAttackCooldown(dt);
      consumeKnockback();

      onGround.current = false;
      wasFalling.current = false;
      lastGroundY.current = pos.y;
      vel.set(0, 0, 0);

      let inputX: number;
      let inputZ: number;
      if (isTouch.current) {
        inputX = joystickInput.x;
        inputZ = -joystickInput.y;
      } else {
        inputZ = isInputActive ? (keys.current.backward ? 1 : 0) - (keys.current.forward ? 1 : 0) : 0;
        inputX = isInputActive ? (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0) : 0;
      }

      const descendRequested = isTouch.current ? mobileActions.descend : keys.current.descend;
      const inputY = (jumpRequested ? 1 : 0) - (descendRequested ? 1 : 0);
      const flySpeed = keys.current.sprint && !keys.current.descend
        ? CREATIVE_FLY_SPRINT_SPEED
        : CREATIVE_FLY_SPEED;

      if (Math.abs(inputX) > 0.1 || Math.abs(inputZ) > 0.1) {
        moveDir.current.set(inputX, 0, inputZ).normalize();
        moveEuler.current.set(0, euler.current.y, 0);
        moveDir.current.applyEuler(moveEuler.current);
        vel.x = moveDir.current.x * flySpeed;
        vel.z = moveDir.current.z * flySpeed;
      }
      vel.y = inputY * CREATIVE_FLY_VERTICAL_SPEED;

      const newY = pos.y + vel.y * dt;
      if (!checkCollision(pos.x, newY, pos.z)) {
        pos.y = Math.max(0.5, newY);
      }

      const newX = pos.x + vel.x * dt;
      if (!checkCollision(newX, pos.y, pos.z)) {
        pos.x = newX;
      }

      const newZ = pos.z + vel.z * dt;
      if (!checkCollision(pos.x, pos.y, newZ)) {
        pos.z = newZ;
      }

      const targetCameraY = pos.y + PLAYER_HEIGHT - 0.1;
      smoothCameraY.current += (targetCameraY - smoothCameraY.current) * Math.min(1, 30 * dt);
      if (Math.abs(smoothCameraY.current - targetCameraY) < 0.0005) {
        smoothCameraY.current = targetCameraY;
      }

      camera.position.set(pos.x, smoothCameraY.current, pos.z);

      const now = performance.now();
      if (now - lastSendTime.current > 50) {
        sendPosition(
          [pos.x, pos.y, pos.z],
          [euler.current.y, euler.current.x],
        );
        lastSendTime.current = now;
      }

      if (pos.y < -20) {
        const respawnY = getSpawnY();
        pos.set(SPAWN_X, respawnY, SPAWN_Z);
        vel.set(0, 0, 0);
        lastGroundY.current = respawnY;
        smoothCameraY.current = respawnY + PLAYER_HEIGHT - 0.1;
      }

      return;
    }

    // ========================================
    // 通常の歩行物理（ヘリコプターに乗っていない場合）
    // ========================================

    // --- ジャンプ（重力適用前に処理） ---
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
