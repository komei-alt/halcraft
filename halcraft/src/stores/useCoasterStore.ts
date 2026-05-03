// ジェットコースターの状態管理ストア v2
// カート（車体）のスポーン・搭乗・降車・走行状態を管理
// チェーンリフト状態・エネルギー情報を追加

import { create } from 'zustand';
import * as THREE from 'three';
import { type BlockId } from '../types/blocks';
import {
  buildTrackPath,
  buildTrackSpline,
  isRailBlock,
  updateCoasterPhysics,
  type LoopSegment,
  COASTER_MAX_SPEED,
} from '../utils/coasterPhysics';
import type { GetBlockFn } from '../utils/collision';

// ─── ストア外ランタイム状態（毎フレーム更新、Zustandの再レンダリング回避） ─
export const coasterRuntime = {
  spline: null as THREE.CatmullRomCurve3 | null,
  trackPath: [] as Array<{ x: number; y: number; z: number; blockId: BlockId }>,
  loops: [] as LoopSegment[],
  isLoop: false,
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(0, 0, 1),
  slopeAngle: 0,
  valid: false,
  /** チェーンリフトのラチェットタイマー */
  chainRatchetTimer: 0,
};

// ─── ストア型定義 ──────────────────────────────
export interface CoasterState {
  cartSpawned: boolean;
  cartX: number;
  cartY: number;
  cartZ: number;
  cartPitch: number;
  cartYaw: number;
  cartRoll: number;
  speed: number;
  progress: number;
  isBoarded: boolean;
  braking: boolean;
  spawnRailX: number;
  spawnRailY: number;
  spawnRailZ: number;
  /** チェーンリフト上にいるか */
  onChainLift: boolean;
  /** 運動エネルギー (J/kg) */
  kineticEnergy: number;
  /** 位置エネルギー (J/kg) */
  potentialEnergy: number;
  /** 体感G力 */
  gForce: number;

  // アクション
  spawnCart: (getBlock: GetBlockFn, railX: number, railY: number, railZ: number) => boolean;
  despawnCart: () => void;
  board: () => void;
  dismount: () => void;
  setBraking: (b: boolean) => void;
  launch: (initialSpeed?: number) => void;
  updatePhysics: (dt: number) => void;
}

export const useCoasterStore = create<CoasterState>((set, get) => ({
  cartSpawned: false,
  cartX: 0, cartY: 0, cartZ: 0,
  cartPitch: 0, cartYaw: 0, cartRoll: 0,
  speed: 0,
  progress: 0,
  isBoarded: false,
  braking: false,
  spawnRailX: 0, spawnRailY: 0, spawnRailZ: 0,
  onChainLift: false,
  kineticEnergy: 0,
  potentialEnergy: 0,
  gForce: 1,

  spawnCart: (getBlock, railX, railY, railZ) => {
    if (!isRailBlock(getBlock(railX, railY, railZ))) return false;

    const path = buildTrackPath(getBlock, railX, railY, railZ);
    if (path.length < 2) return false;

    const result = buildTrackSpline(path);
    if (!result) return false;

    coasterRuntime.spline = result.spline;
    coasterRuntime.trackPath = path;
    coasterRuntime.loops = result.loops;
    coasterRuntime.isLoop = result.isLoop;
    coasterRuntime.valid = true;
    coasterRuntime.chainRatchetTimer = 0;

    const startPoint = result.spline.getPointAt(0);
    coasterRuntime.position.copy(startPoint);
    result.spline.getTangentAt(0, coasterRuntime.tangent);

    set({
      cartSpawned: true,
      cartX: startPoint.x,
      cartY: startPoint.y,
      cartZ: startPoint.z,
      cartPitch: 0,
      cartYaw: Math.atan2(coasterRuntime.tangent.x, coasterRuntime.tangent.z),
      cartRoll: 0,
      speed: 0,
      progress: 0,
      isBoarded: false,
      braking: false,
      onChainLift: false,
      kineticEnergy: 0,
      potentialEnergy: 0,
      gForce: 1,
      spawnRailX: railX,
      spawnRailY: railY,
      spawnRailZ: railZ,
    });
    return true;
  },

  despawnCart: () => {
    coasterRuntime.spline = null;
    coasterRuntime.trackPath = [];
    coasterRuntime.loops = [];
    coasterRuntime.isLoop = false;
    coasterRuntime.valid = false;
    coasterRuntime.chainRatchetTimer = 0;
    set({
      cartSpawned: false,
      isBoarded: false,
      speed: 0,
      progress: 0,
      onChainLift: false,
      kineticEnergy: 0,
      potentialEnergy: 0,
      gForce: 1,
    });
  },

  board: () => {
    if (!get().cartSpawned) return;
    set({ isBoarded: true });
  },

  dismount: () => {
    set({ isBoarded: false, braking: false });
  },

  setBraking: (b) => {
    set({ braking: b });
  },

  launch: (initialSpeed = 5) => {
    const state = get();
    if (!state.cartSpawned || !state.isBoarded) return;
    if (Math.abs(state.speed) < 0.5) {
      set({ speed: initialSpeed });
    }
  },

  updatePhysics: (dt) => {
    const state = get();
    if (!state.cartSpawned || !coasterRuntime.spline || !coasterRuntime.valid) return;

    const result = updateCoasterPhysics(
      {
        progress: state.progress,
        speed: state.speed,
        braking: state.braking,
        onChainLift: state.onChainLift,
        chainRatchetTimer: coasterRuntime.chainRatchetTimer,
      },
      coasterRuntime.spline,
      coasterRuntime.trackPath,
      coasterRuntime.isLoop,
      dt,
    );

    // ランタイム更新
    coasterRuntime.position.copy(result.position);
    coasterRuntime.tangent.copy(result.tangent);
    coasterRuntime.slopeAngle = result.slopeAngle;
    coasterRuntime.chainRatchetTimer = result.chainRatchetTimer;

    // Yaw
    const yaw = Math.atan2(result.tangent.x, result.tangent.z);
    // Pitch
    const pitch = -result.slopeAngle;
    // Roll: カーブの旋回に応じた傾き
    const speedFactor = Math.min(1, Math.abs(result.speed) / COASTER_MAX_SPEED);
    const lateralAccel = result.tangent.x * Math.cos(yaw) - result.tangent.z * Math.sin(yaw);
    const roll = -lateralAccel * speedFactor * 0.6;

    set({
      cartX: result.position.x,
      cartY: result.position.y,
      cartZ: result.position.z,
      cartPitch: pitch,
      cartYaw: yaw,
      cartRoll: roll,
      speed: result.speed,
      progress: result.progress,
      onChainLift: result.onChainLift,
      kineticEnergy: result.kineticEnergy,
      potentialEnergy: result.potentialEnergy,
      gForce: result.gForce,
    });
  },
}));
