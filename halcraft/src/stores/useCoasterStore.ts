// ジェットコースターの状態管理ストア
// カート（車体）のスポーン・搭乗・降車・走行状態を管理

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
  /** トラックのスプライン曲線 */
  spline: null as THREE.CatmullRomCurve3 | null,
  /** トラック経路（ブロック座標リスト） */
  trackPath: [] as Array<{ x: number; y: number; z: number; blockId: BlockId }>,
  /** ループ区間情報 */
  loops: [] as LoopSegment[],
  /** 閉ループコースか */
  isLoop: false,
  /** 現在のワールド位置 */
  position: new THREE.Vector3(),
  /** 現在のタンジェント（進行方向） */
  tangent: new THREE.Vector3(0, 0, 1),
  /** 現在の勾配角 */
  slopeAngle: 0,
  /** ランタイムが有効か */
  valid: false,
};

// ─── ストア型定義 ──────────────────────────────
export interface CoasterState {
  /** カートが存在するか */
  cartSpawned: boolean;
  /** カートのワールド座標 */
  cartX: number;
  cartY: number;
  cartZ: number;
  /** カートの回転 */
  cartPitch: number;
  cartYaw: number;
  cartRoll: number;
  /** 現在速度 (m/s) */
  speed: number;
  /** スプライン上の進行度 0-1 */
  progress: number;
  /** プレイヤーが搭乗中か */
  isBoarded: boolean;
  /** ブレーキ中か */
  braking: boolean;
  /** カートのスポーン元レール座標 */
  spawnRailX: number;
  spawnRailY: number;
  spawnRailZ: number;

  // ─── アクション ──
  /** 指定レール上にカートをスポーンさせる */
  spawnCart: (getBlock: GetBlockFn, railX: number, railY: number, railZ: number) => boolean;
  /** カートを破棄する */
  despawnCart: () => void;
  /** 搭乗 */
  board: () => void;
  /** 降車 */
  dismount: () => void;
  /** ブレーキ設定 */
  setBraking: (b: boolean) => void;
  /** 初速を与えて発進 */
  launch: (initialSpeed?: number) => void;
  /** 毎フレーム物理更新 */
  updatePhysics: (dt: number) => void;
}

export const useCoasterStore = create<CoasterState>((set, get) => ({
  cartSpawned: false,
  cartX: 0,
  cartY: 0,
  cartZ: 0,
  cartPitch: 0,
  cartYaw: 0,
  cartRoll: 0,
  speed: 0,
  progress: 0,
  isBoarded: false,
  braking: false,
  spawnRailX: 0,
  spawnRailY: 0,
  spawnRailZ: 0,

  spawnCart: (getBlock, railX, railY, railZ) => {
    if (!isRailBlock(getBlock(railX, railY, railZ))) return false;

    // トラック経路を構築
    const path = buildTrackPath(getBlock, railX, railY, railZ);
    if (path.length < 2) return false;

    const result = buildTrackSpline(path);
    if (!result) return false;

    // ランタイム状態を設定
    coasterRuntime.spline = result.spline;
    coasterRuntime.trackPath = path;
    coasterRuntime.loops = result.loops;
    coasterRuntime.isLoop = result.isLoop;
    coasterRuntime.valid = true;

    // 開始位置（経路上の開始レールに最も近い点）
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
    set({
      cartSpawned: false,
      isBoarded: false,
      speed: 0,
      progress: 0,
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

    // Yaw: タンジェントの水平方向から算出
    const yaw = Math.atan2(result.tangent.x, result.tangent.z);
    // Pitch: 勾配角そのまま
    const pitch = -result.slopeAngle;
    // Roll: カーブの旋回に応じた傾き（速度と旋回率から推定）
    const speedFactor = Math.min(1, Math.abs(result.speed) / COASTER_MAX_SPEED);
    // 前方向と真上の外積でロール方向を推定
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
    });
  },
}));
