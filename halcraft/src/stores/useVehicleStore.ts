// 乗り物（飛行機等）の状態管理ストア
// 搭乗状態、飛行機の位置・回転・速度を管理

import { create } from 'zustand';

/** 乗り物の種類 */
export type VehicleType = 'airplane';

/** 飛行機の状態 */
export interface AirplaneState {
  /** 飛行機がスポーン済みか */
  spawned: boolean;
  /** プレイヤーが搭乗中か */
  isBoarded: boolean;
  /** ワールド座標 */
  x: number;
  y: number;
  z: number;
  /** 回転（ラジアン） */
  rotationY: number;
  /** ピッチ（上下傾き） */
  pitch: number;
  /** ロール（左右傾き） */
  roll: number;
  /** 現在の速度 */
  speed: number;
  /** エンジンが動いているか */
  engineOn: boolean;
  /** プロペラの回転角度（アニメーション用） */
  propellerAngle: number;
}

/** 飛行機の定数 */
export const AIRPLANE_CONSTANTS = {
  /** 最大速度 */
  MAX_SPEED: 30,
  /** 加速度 */
  ACCELERATION: 12,
  /** 減速度（入力なし時） */
  DECELERATION: 5,
  /** 旋回速度 */
  TURN_SPEED: 1.5,
  /** 上昇/下降速度 */
  VERTICAL_SPEED: 8,
  /** 搭乗可能距離 */
  BOARD_DISTANCE: 3,
  /** 着陸判定高度（地面からこの高さ以下なら着陸扱い） */
  LANDING_HEIGHT: 2,
  /** プロペラ回転速度 */
  PROPELLER_SPEED: 15,
  /** 飛行機のサイズ（衝突判定用） */
  WIDTH: 4,
  HEIGHT: 2,
  LENGTH: 5,
} as const;

interface VehicleState {
  /** 飛行機の状態 */
  airplane: AirplaneState;

  /** 飛行機をスポーン */
  spawnAirplane: (x: number, y: number, z: number) => void;

  /** 飛行機に搭乗 */
  boardAirplane: () => void;

  /** 飛行機から降りる */
  dismountAirplane: () => void;

  /** 飛行機の状態を更新 */
  updateAirplane: (updates: Partial<AirplaneState>) => void;

  /** 搭乗中かどうか */
  isInVehicle: () => boolean;
}

export const useVehicleStore = create<VehicleState>((set, get) => ({
  airplane: {
    spawned: false,
    isBoarded: false,
    x: 0,
    y: 0,
    z: 0,
    rotationY: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    engineOn: false,
    propellerAngle: 0,
  },

  spawnAirplane: (x, y, z) => {
    set({
      airplane: {
        spawned: true,
        isBoarded: false,
        x,
        y,
        z,
        rotationY: 0,
        pitch: 0,
        roll: 0,
        speed: 0,
        engineOn: false,
        propellerAngle: 0,
      },
    });
  },

  boardAirplane: () => {
    set((state) => ({
      airplane: {
        ...state.airplane,
        isBoarded: true,
        engineOn: true,
      },
    }));
  },

  dismountAirplane: () => {
    set((state) => ({
      airplane: {
        ...state.airplane,
        isBoarded: false,
        engineOn: false,
        speed: 0,
      },
    }));
  },

  updateAirplane: (updates) => {
    set((state) => ({
      airplane: {
        ...state.airplane,
        ...updates,
      },
    }));
  },

  isInVehicle: () => {
    return get().airplane.isBoarded;
  },
}));
