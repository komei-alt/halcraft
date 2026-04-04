// 乗り物（ヘリコプター等）の状態管理ストア
// 搭乗状態、ヘリコプターの位置・回転・速度を管理

import { create } from 'zustand';

/** 乗り物の種類 */
export type VehicleType = 'helicopter';

/** ヘリコプターの状態 */
export interface HelicopterState {
  /** ヘリコプターがスポーン済みか */
  spawned: boolean;
  /** プレイヤーが搭乗中か */
  isBoarded: boolean;
  /** ワールド座標 */
  x: number;
  y: number;
  z: number;
  /** スポーン位置（降車時のリセット先） */
  spawnX: number;
  spawnY: number;
  spawnZ: number;
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
  /** ローターの回転角度（アニメーション用） */
  rotorAngle: number;
}

/** ヘリコプターの定数 */
export const HELICOPTER_CONSTANTS = {
  /** 最大速度 */
  MAX_SPEED: 25,
  /** 加速度 */
  ACCELERATION: 10,
  /** 減速度（入力なし時） */
  DECELERATION: 6,
  /** 旋回速度 */
  TURN_SPEED: 1.8,
  /** 上昇/下降速度 */
  VERTICAL_SPEED: 10,
  /** 搭乗可能距離 */
  BOARD_DISTANCE: 3,
  /** 着陸判定高度（地面からこの高さ以下なら着陸扱い） */
  LANDING_HEIGHT: 2,
  /** ローター回転速度 */
  ROTOR_SPEED: 20,
  /** ヘリコプターのサイズ（衝突判定用） */
  WIDTH: 3,
  HEIGHT: 2.5,
  LENGTH: 5,
} as const;

interface VehicleState {
  /** ヘリコプターの状態 */
  helicopter: HelicopterState;

  /** ヘリコプターをスポーン */
  spawnHelicopter: (x: number, y: number, z: number) => void;

  /** ヘリコプターに搭乗 */
  boardHelicopter: () => void;

  /** ヘリコプターから降りる */
  dismountHelicopter: () => void;

  /** ヘリコプターの状態を更新 */
  updateHelicopter: (updates: Partial<HelicopterState>) => void;

  /** 搭乗中かどうか */
  isInVehicle: () => boolean;
}

export const useVehicleStore = create<VehicleState>((set, get) => ({
  helicopter: {
    spawned: false,
    isBoarded: false,
    x: 0,
    y: 0,
    z: 0,
    spawnX: 0,
    spawnY: 0,
    spawnZ: 0,
    rotationY: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    engineOn: false,
    rotorAngle: 0,
  },

  spawnHelicopter: (x, y, z) => {
    set({
      helicopter: {
        spawned: true,
        isBoarded: false,
        x,
        y,
        z,
        spawnX: x,
        spawnY: y,
        spawnZ: z,
        rotationY: 0,
        pitch: 0,
        roll: 0,
        speed: 0,
        engineOn: false,
        rotorAngle: 0,
      },
    });
  },

  boardHelicopter: () => {
    set((state) => ({
      helicopter: {
        ...state.helicopter,
        isBoarded: true,
        engineOn: true,
      },
    }));
  },

  dismountHelicopter: () => {
    set((state) => ({
      helicopter: {
        ...state.helicopter,
        isBoarded: false,
        engineOn: false,
        speed: 0,
        // ヘリポートにリセット（スポーン位置に戻す）
        x: state.helicopter.spawnX,
        y: state.helicopter.spawnY,
        z: state.helicopter.spawnZ,
        rotationY: 0,
        pitch: 0,
        roll: 0,
        rotorAngle: 0,
      },
    }));
  },

  updateHelicopter: (updates) => {
    set((state) => ({
      helicopter: {
        ...state.helicopter,
        ...updates,
      },
    }));
  },

  isInVehicle: () => {
    return get().helicopter.isBoarded;
  },
}));
