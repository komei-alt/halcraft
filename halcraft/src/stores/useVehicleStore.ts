// 乗り物（ヘリコプター等）の状態管理ストア
// 4人搭乗対応: パイロット / 副操縦士 / 左機関銃手 / 右機関銃手
// 搭乗状態、ヘリコプターの位置・回転・速度を管理

import { create } from 'zustand';

/** 乗り物の種類 */
export type VehicleType = 'helicopter';

/** 座席タイプ */
export type SeatType = 'pilot' | 'gunner_left' | 'gunner_right';

/** 座席の優先順（搭乗時に空席を探す順序） */
export const SEAT_PRIORITY: SeatType[] = ['pilot', 'gunner_left', 'gunner_right'];

/** 全座席リスト */
export const ALL_SEATS: SeatType[] = ['pilot', 'gunner_left', 'gunner_right'];

/**
 * 座席ごとのオフセット
 * - worldOffset: ワールド座標系でのオフセット（カメラ配置に使用）
 *   ヘリモデルは scale=1.3 + 内部180°Y回転。Z正=モデル後方=ワールド前方
 * - modelOffset: ヘリモデル内部座標系でのオフセット（アバター3D配置に使用）
 *   180°回転グループの内側で使う座標（Z正=ノーズ方向）
 */
export const SEAT_OFFSETS: Record<SeatType, { x: number; y: number; z: number }> = {
  // ワールド座標系（Player.tsx / RemotePlayers.tsx で使用）
  pilot:        { x:  0.0, y: 0.7, z:  0.9 },   // コクピット前席
  gunner_left:  { x: -1.0, y: 0.5, z: -0.6 },   // 後方左席
  gunner_right: { x:  1.0, y: 0.5, z: -0.6 },   // 後方右席
};

/** ヘリモデル内部座標系でのアバター配置オフセット（180°回転グループ内） */
export const SEAT_MODEL_OFFSETS: Record<SeatType, { x: number; y: number; z: number }> = {
  pilot:        { x:  0.0, y: -0.15, z:  0.7 },   // コクピット前席
  gunner_left:  { x: -0.75, y: -0.25, z: -0.5 },  // 後方左席
  gunner_right: { x:  0.75, y: -0.25, z: -0.5 },  // 後方右席
};

/** 座席の表示名 */
export const SEAT_NAMES: Record<SeatType, string> = {
  pilot: 'パイロット',
  gunner_left: '左ガナー',
  gunner_right: '右ガナー',
};

/** 機関銃のパラメータ */
export const GUN_CONSTANTS = {
  /** 発射クールダウン（秒） */
  FIRE_COOLDOWN: 0.15,
  /** ダメージ */
  DAMAGE: 3,
  /** 射程（ブロック） */
  RANGE: 40,
  /** トレーサーの表示時間（秒） */
  TRACER_LIFETIME: 0.2,
} as const;

/** ヘリコプターの状態 */
export interface HelicopterState {
  /** ヘリコプターがスポーン済みか */
  spawned: boolean;
  /** 自分の座席（null = 搭乗していない） */
  mySeat: SeatType | null;
  /** 各座席のプレイヤーID（null = 空席） */
  seats: Record<SeatType, string | null>;
  /** 後方互換: 自分が搭乗中か */
  isBoarded: boolean;
  /** 後方互換: パイロットのプレイヤーID */
  pilotId: string | null;
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
  BOARD_DISTANCE: 4,
  /** 着陸判定高度（地面からこの高さ以下なら着陸扱い） */
  LANDING_HEIGHT: 2,
  /** ローター回転速度 */
  ROTOR_SPEED: 20,
  /** ヘリコプターのサイズ（衝突判定用） */
  WIDTH: 3.5,
  HEIGHT: 2.5,
  LENGTH: 5.5,
  /** 最大搭乗人数 */
  MAX_PASSENGERS: 3,
} as const;

/** 空の座席マップ */
const EMPTY_SEATS: Record<SeatType, string | null> = {
  pilot: null,
  gunner_left: null,
  gunner_right: null,
};

interface VehicleState {
  /** ヘリコプターの状態 */
  helicopter: HelicopterState;

  /** ヘリコプターをスポーン */
  spawnHelicopter: (x: number, y: number, z: number) => void;

  /** ヘリコプターに搭乗（指定席 or 自動割り当て） */
  boardHelicopter: (preferredSeat?: SeatType) => SeatType | null;

  /** ヘリコプターから降りる */
  dismountHelicopter: () => void;

  /** ヘリコプターの状態を更新 */
  updateHelicopter: (updates: Partial<HelicopterState>) => void;

  /** 搭乗中かどうか */
  isInVehicle: () => boolean;

  /** 自分の座席を取得 */
  getMySeat: () => SeatType | null;

  /** 搭乗者数を取得 */
  getPassengerCount: () => number;

  /** 空席を探して返す */
  findAvailableSeat: (preferred?: SeatType) => SeatType | null;

  /** 座席を移動する（搭乗中のみ） */
  changeSeat: (targetSeat: SeatType) => boolean;

  /** 特定の席にプレイヤーをセット（リモート同期用） */
  setSeatPlayer: (seat: SeatType, playerId: string | null) => void;

  /** 全席のプレイヤーIDを一括設定（サーバー同期用） */
  syncSeats: (seats: Record<SeatType, string | null>) => void;

  /** 誰かが搭乗中か */
  hasAnyPassenger: () => boolean;
}

export const useVehicleStore = create<VehicleState>((set, get) => ({
  helicopter: {
    spawned: false,
    mySeat: null,
    seats: { ...EMPTY_SEATS },
    isBoarded: false,
    pilotId: null,
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
        mySeat: null,
        seats: { ...EMPTY_SEATS },
        isBoarded: false,
        pilotId: null,
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

  boardHelicopter: (preferredSeat?) => {
    const state = get();
    const seat = state.findAvailableSeat(preferredSeat);
    if (seat === null) return null; // 満席

    set((s) => ({
      helicopter: {
        ...s.helicopter,
        mySeat: seat,
        seats: {
          ...s.helicopter.seats,
          [seat]: '__local__', // ローカルプレイヤーのIDは後でサーバーから設定
        },
        isBoarded: true,
        pilotId: seat === 'pilot' ? '__local__' : s.helicopter.seats.pilot,
        engineOn: true,
      },
    }));

    return seat;
  },

  dismountHelicopter: () => {
    set((state) => {
      const mySeat = state.helicopter.mySeat;
      const newSeats = { ...state.helicopter.seats };
      if (mySeat) {
        newSeats[mySeat] = null;
      }

      // パイロットが降りた場合、速度リセット
      const wasPilot = mySeat === 'pilot';
      const hasOtherPassengers = Object.values(newSeats).some((id) => id !== null);

      return {
        helicopter: {
          ...state.helicopter,
          mySeat: null,
          seats: newSeats,
          isBoarded: false,
          pilotId: newSeats.pilot,
          engineOn: hasOtherPassengers,
          speed: wasPilot ? 0 : state.helicopter.speed,
          // パイロットが降りて他に誰もいなければスポーン位置にリセット
          ...(!hasOtherPassengers ? {
            x: state.helicopter.spawnX,
            y: state.helicopter.spawnY,
            z: state.helicopter.spawnZ,
            rotationY: 0,
            pitch: 0,
            roll: 0,
            rotorAngle: 0,
          } : {}),
        },
      };
    });
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
    return get().helicopter.mySeat !== null;
  },

  getMySeat: () => {
    return get().helicopter.mySeat;
  },

  getPassengerCount: () => {
    const seats = get().helicopter.seats;
    return Object.values(seats).filter((id) => id !== null).length;
  },

  findAvailableSeat: (preferred?) => {
    const seats = get().helicopter.seats;

    // 希望する席が空いていればそれを使用
    if (preferred && seats[preferred] === null) {
      return preferred;
    }

    // 優先順に空席を探す
    for (const seat of SEAT_PRIORITY) {
      if (seats[seat] === null) {
        return seat;
      }
    }

    return null; // 満席
  },

  changeSeat: (targetSeat) => {
    const state = get();
    const currentSeat = state.helicopter.mySeat;

    // 搭乗していない場合は移動不可
    if (currentSeat === null) return false;
    // 同じ席への移動は何もしない
    if (currentSeat === targetSeat) return false;
    // ターゲット席が埋まっている場合は移動不可
    if (state.helicopter.seats[targetSeat] !== null) return false;

    set((s) => {
      const newSeats = { ...s.helicopter.seats };
      // 元の席を空ける
      newSeats[currentSeat] = null;
      // 新しい席に移動
      newSeats[targetSeat] = '__local__';

      return {
        helicopter: {
          ...s.helicopter,
          mySeat: targetSeat,
          seats: newSeats,
          pilotId: targetSeat === 'pilot'
            ? '__local__'
            : (currentSeat === 'pilot' ? null : s.helicopter.pilotId),
        },
      };
    });

    return true;
  },

  setSeatPlayer: (seat, playerId) => {
    set((state) => ({
      helicopter: {
        ...state.helicopter,
        seats: {
          ...state.helicopter.seats,
          [seat]: playerId,
        },
        pilotId: seat === 'pilot' ? playerId : state.helicopter.seats.pilot,
        engineOn: playerId !== null || Object.entries(state.helicopter.seats)
          .some(([s, id]) => s !== seat && id !== null),
      },
    }));
  },

  syncSeats: (seats) => {
    set((state) => ({
      helicopter: {
        ...state.helicopter,
        seats,
        pilotId: seats.pilot,
        engineOn: Object.values(seats).some((id) => id !== null),
      },
    }));
  },

  hasAnyPassenger: () => {
    return Object.values(get().helicopter.seats).some((id) => id !== null);
  },
}));
