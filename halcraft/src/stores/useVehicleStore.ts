// 乗り物（ヘリコプター / 戦車 / 飛行機）の状態管理ストア
// 既存ヘリAPIを維持しつつ、単座乗り物は共通APIで扱う

import { create } from 'zustand';

/** 乗り物の種類 */
export type VehicleType = 'helicopter' | 'tank' | 'airplane';

/** ヘリコプター座席タイプ */
export type SeatType = 'pilot' | 'gunner_left' | 'gunner_right';
export type SingleSeatType = 'pilot';
export type VehicleSeatType = SeatType | SingleSeatType;

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
  pilot:        { x:  0.0, y: 0.7, z:  0.9 },
  gunner_left:  { x: -1.0, y: 0.5, z: -0.2 },
  gunner_right: { x:  1.0, y: 0.5, z: -0.2 },
};

/** ヘリモデル内部座標系でのアバター配置オフセット（180°回転グループ内） */
export const SEAT_MODEL_OFFSETS: Record<SeatType, { x: number; y: number; z: number }> = {
  pilot:        { x:  0.0, y: -0.15, z:  0.7 },
  gunner_left:  { x: -0.75, y: -0.25, z: -0.5 },
  gunner_right: { x:  0.75, y: -0.25, z: -0.5 },
};

/** 座席の表示名 */
export const SEAT_NAMES: Record<SeatType, string> = {
  pilot: 'パイロット',
  gunner_left: '左ガナー',
  gunner_right: '右ガナー',
};

export const VEHICLE_NAMES: Record<VehicleType, string> = {
  helicopter: 'ヘリコプター',
  tank: '戦車',
  airplane: '飛行機',
};

/** 機関銃のパラメータ */
export const GUN_CONSTANTS = {
  /** 発射クールダウン（秒） */
  FIRE_COOLDOWN: 0.11,
  /** ダメージ */
  DAMAGE: 3,
  /** 射程（ブロック） */
  RANGE: 40,
  /** トレーサーの表示時間（秒） */
  TRACER_LIFETIME: 0.2,
} as const;

/** ヘリコプターの状態 */
export interface HelicopterState {
  spawned: boolean;
  mySeat: SeatType | null;
  seats: Record<SeatType, string | null>;
  isBoarded: boolean;
  pilotId: string | null;
  x: number;
  y: number;
  z: number;
  spawnX: number;
  spawnY: number;
  spawnZ: number;
  rotationY: number;
  pitch: number;
  roll: number;
  speed: number;
  engineOn: boolean;
  rotorAngle: number;
}

/** 単座乗り物の共通状態 */
export interface SingleSeatVehicleState {
  spawned: boolean;
  mySeat: SingleSeatType | null;
  seats: Record<SingleSeatType, string | null>;
  isBoarded: boolean;
  pilotId: string | null;
  x: number;
  y: number;
  z: number;
  spawnX: number;
  spawnY: number;
  spawnZ: number;
  rotationY: number;
  pitch: number;
  roll: number;
  speed: number;
  engineOn: boolean;
}

export interface TankState extends SingleSeatVehicleState {
  turretYaw: number;
  gunSpin: number;
}

export interface AirplaneState extends SingleSeatVehicleState {
  throttle: number;
  airborne: boolean;
  propellerAngle: number;
}

export interface VehiclesSyncPayload {
  helicopter?: Partial<HelicopterState> & { seats?: Record<SeatType, string | null> };
  tank?: Partial<TankState> & { seats?: Record<SingleSeatType, string | null> };
  airplane?: Partial<AirplaneState> & { seats?: Record<SingleSeatType, string | null> };
}

/** ヘリコプターの定数 */
export const HELICOPTER_CONSTANTS = {
  MAX_SPEED: 25,
  ACCELERATION: 10,
  DECELERATION: 6,
  TURN_SPEED: 1.8,
  VERTICAL_SPEED: 10,
  BOARD_DISTANCE: 4,
  LANDING_HEIGHT: 2,
  ROTOR_SPEED: 20,
  WIDTH: 3.5,
  HEIGHT: 2.5,
  LENGTH: 5.5,
  MAX_PASSENGERS: 3,
} as const;

/** 戦車の定数 */
export const TANK_CONSTANTS = {
  MAX_SPEED: 10,
  REVERSE_SPEED: 4,
  ACCELERATION: 9,
  DECELERATION: 7,
  TURN_SPEED: 1.35,
  BOARD_DISTANCE: 5,
  CAMERA_HEIGHT: 2.9,
  CAMERA_BACK: 1.7,
  BODY_HEIGHT: 1.15,
  CANNON_COOLDOWN: 0.9,
} as const;

/** 飛行機の定数 */
export const AIRPLANE_CONSTANTS = {
  MAX_SPEED: 42,
  TAKEOFF_SPEED: 17,
  STALL_SPEED: 9,
  ACCELERATION: 13,
  DECELERATION: 7,
  TURN_SPEED: 1.05,
  PITCH_SPEED: 0.62,
  BOARD_DISTANCE: 6,
  CAMERA_HEIGHT: 2.1,
  CAMERA_BACK: 2.8,
  BODY_HEIGHT: 1.8,
  GRAVITY: 7.5,
  LIFT: 0.42,
  PROPELLER_SPEED: 36,
} as const;

const EMPTY_SEATS: Record<SeatType, string | null> = {
  pilot: null,
  gunner_left: null,
  gunner_right: null,
};

const EMPTY_SINGLE_SEAT: Record<SingleSeatType, string | null> = {
  pilot: null,
};

function createHelicopterState(x = 0, y = 0, z = 0): HelicopterState {
  return {
    spawned: false,
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
  };
}

function createTankState(x = 0, y = 0, z = 0): TankState {
  return {
    spawned: false,
    mySeat: null,
    seats: { ...EMPTY_SINGLE_SEAT },
    isBoarded: false,
    pilotId: null,
    x,
    y,
    z,
    spawnX: x,
    spawnY: y,
    spawnZ: z,
    rotationY: Math.PI / 2,
    pitch: 0,
    roll: 0,
    speed: 0,
    engineOn: false,
    turretYaw: 0,
    gunSpin: 0,
  };
}

function createAirplaneState(x = 0, y = 0, z = 0): AirplaneState {
  return {
    spawned: false,
    mySeat: null,
    seats: { ...EMPTY_SINGLE_SEAT },
    isBoarded: false,
    pilotId: null,
    x,
    y,
    z,
    spawnX: x,
    spawnY: y,
    spawnZ: z,
    rotationY: -Math.PI / 2,
    pitch: 0,
    roll: 0,
    speed: 0,
    engineOn: false,
    throttle: 0,
    airborne: false,
    propellerAngle: 0,
  };
}

function hasHelicopterPassenger(helicopter: HelicopterState): boolean {
  return Object.values(helicopter.seats).some((id) => id !== null);
}

function hasSinglePassenger(vehicle: SingleSeatVehicleState): boolean {
  return vehicle.seats.pilot !== null;
}

function syncHelicopterLegacy(helicopter: HelicopterState): HelicopterState {
  const someoneBoarded = hasHelicopterPassenger(helicopter);
  return {
    ...helicopter,
    pilotId: helicopter.seats.pilot,
    isBoarded: helicopter.mySeat !== null,
    engineOn: someoneBoarded,
  };
}

function syncSingleLegacy<T extends SingleSeatVehicleState>(vehicle: T): T {
  return {
    ...vehicle,
    pilotId: vehicle.seats.pilot,
    isBoarded: vehicle.mySeat !== null,
    engineOn: hasSinglePassenger(vehicle),
  };
}

function vehicleHasLocalSeat(state: Pick<VehicleState, 'helicopter' | 'tank' | 'airplane'>): VehicleType | null {
  if (state.helicopter.mySeat !== null) return 'helicopter';
  if (state.tank.mySeat !== null) return 'tank';
  if (state.airplane.mySeat !== null) return 'airplane';
  return null;
}

interface VehicleState {
  helicopter: HelicopterState;
  tank: TankState;
  airplane: AirplaneState;
  activeVehicle: VehicleType | null;

  spawnHelicopter: (x: number, y: number, z: number) => void;
  spawnTank: (x: number, y: number, z: number) => void;
  spawnAirplane: (x: number, y: number, z: number) => void;

  boardHelicopter: (preferredSeat?: SeatType) => SeatType | null;
  dismountHelicopter: () => void;
  updateHelicopter: (updates: Partial<HelicopterState>) => void;

  boardVehicle: (type: VehicleType, preferredSeat?: SeatType) => VehicleSeatType | null;
  dismountVehicle: (type?: VehicleType) => void;
  updateTank: (updates: Partial<TankState>) => void;
  updateAirplane: (updates: Partial<AirplaneState>) => void;
  updateVehicle: (type: VehicleType, updates: Partial<HelicopterState> | Partial<TankState> | Partial<AirplaneState>) => void;
  syncVehicles: (vehicles: VehiclesSyncPayload, myId: string | null) => void;

  isInVehicle: () => boolean;
  getMySeat: () => VehicleSeatType | null;
  getActiveVehicle: () => VehicleType | null;
  getPassengerCount: () => number;
  findAvailableSeat: (preferred?: SeatType) => SeatType | null;
  changeSeat: (targetSeat: SeatType) => boolean;
  setSeatPlayer: (seat: SeatType, playerId: string | null) => void;
  syncSeats: (seats: Record<SeatType, string | null>) => void;
  hasAnyPassenger: () => boolean;
}

export const useVehicleStore = create<VehicleState>((set, get) => ({
  helicopter: createHelicopterState(),
  tank: createTankState(),
  airplane: createAirplaneState(),
  activeVehicle: null,

  spawnHelicopter: (x, y, z) => {
    set({ helicopter: { ...createHelicopterState(x, y, z), spawned: true } });
  },

  spawnTank: (x, y, z) => {
    set({ tank: { ...createTankState(x, y, z), spawned: true } });
  },

  spawnAirplane: (x, y, z) => {
    set({ airplane: { ...createAirplaneState(x, y, z), spawned: true } });
  },

  boardHelicopter: (preferredSeat?) => {
    const state = get();
    if (state.activeVehicle !== null) return null;
    const seat = state.findAvailableSeat(preferredSeat);
    if (seat === null) return null;

    set((s) => {
      const seats = {
        ...s.helicopter.seats,
        [seat]: '__local__',
      };
      return {
        activeVehicle: 'helicopter',
        helicopter: syncHelicopterLegacy({
          ...s.helicopter,
          mySeat: seat,
          seats,
          engineOn: true,
        }),
      };
    });

    return seat;
  },

  dismountHelicopter: () => {
    set((state) => {
      const mySeat = state.helicopter.mySeat;
      const newSeats = { ...state.helicopter.seats };
      if (mySeat) newSeats[mySeat] = null;

      const wasPilot = mySeat === 'pilot';
      const hasOtherPassengers = Object.values(newSeats).some((id) => id !== null);
      const reset = wasPilot && !hasOtherPassengers;
      const helicopter = syncHelicopterLegacy({
        ...state.helicopter,
        mySeat: null,
        seats: newSeats,
        speed: wasPilot ? 0 : state.helicopter.speed,
        ...(reset ? {
          x: state.helicopter.spawnX,
          y: state.helicopter.spawnY,
          z: state.helicopter.spawnZ,
          rotationY: 0,
          pitch: 0,
          roll: 0,
          rotorAngle: 0,
        } : {}),
      });

      return {
        activeVehicle: vehicleHasLocalSeat({ ...state, helicopter }) === 'helicopter' ? 'helicopter' : null,
        helicopter,
      };
    });
  },

  updateHelicopter: (updates) => {
    set((state) => ({
      helicopter: syncHelicopterLegacy({
        ...state.helicopter,
        ...updates,
      }),
      activeVehicle: updates.mySeat !== undefined
        ? (updates.mySeat !== null ? 'helicopter' : vehicleHasLocalSeat({
            helicopter: { ...state.helicopter, ...updates, mySeat: updates.mySeat },
            tank: state.tank,
            airplane: state.airplane,
          }))
        : state.activeVehicle,
    }));
  },

  boardVehicle: (type, preferredSeat?) => {
    if (type === 'helicopter') return get().boardHelicopter(preferredSeat);
    const state = get();
    if (state.activeVehicle !== null) return null;

    if (type === 'tank') {
      if (!state.tank.spawned || state.tank.seats.pilot !== null) return null;
      set((s) => ({
        activeVehicle: 'tank',
        tank: syncSingleLegacy({
          ...s.tank,
          mySeat: 'pilot',
          seats: { pilot: '__local__' },
          engineOn: true,
        }),
      }));
      return 'pilot';
    }

    if (!state.airplane.spawned || state.airplane.seats.pilot !== null) return null;
    set((s) => ({
      activeVehicle: 'airplane',
      airplane: syncSingleLegacy({
        ...s.airplane,
        mySeat: 'pilot',
        seats: { pilot: '__local__' },
        engineOn: true,
      }),
    }));
    return 'pilot';
  },

  dismountVehicle: (type) => {
    const active = type ?? get().activeVehicle;
    if (active === null) return;
    if (active === 'helicopter') {
      get().dismountHelicopter();
      return;
    }

    if (active === 'tank') {
      set((state) => ({
        activeVehicle: null,
        tank: syncSingleLegacy({
          ...state.tank,
          mySeat: null,
          seats: { pilot: null },
          speed: 0,
          x: state.tank.spawnX,
          y: state.tank.spawnY,
          z: state.tank.spawnZ,
          rotationY: Math.PI / 2,
          pitch: 0,
          roll: 0,
          turretYaw: 0,
          gunSpin: 0,
        }),
      }));
      return;
    }

    set((state) => ({
      activeVehicle: null,
      airplane: syncSingleLegacy({
        ...state.airplane,
        mySeat: null,
        seats: { pilot: null },
        speed: 0,
        throttle: 0,
        airborne: false,
        x: state.airplane.spawnX,
        y: state.airplane.spawnY,
        z: state.airplane.spawnZ,
        rotationY: -Math.PI / 2,
        pitch: 0,
        roll: 0,
        propellerAngle: 0,
      }),
    }));
  },

  updateTank: (updates) => {
    set((state) => ({
      tank: syncSingleLegacy({
        ...state.tank,
        ...updates,
      }),
    }));
  },

  updateAirplane: (updates) => {
    set((state) => ({
      airplane: syncSingleLegacy({
        ...state.airplane,
        ...updates,
      }),
    }));
  },

  updateVehicle: (type, updates) => {
    if (type === 'helicopter') {
      get().updateHelicopter(updates as Partial<HelicopterState>);
    } else if (type === 'tank') {
      get().updateTank(updates as Partial<TankState>);
    } else {
      get().updateAirplane(updates as Partial<AirplaneState>);
    }
  },

  syncVehicles: (vehicles, myId) => {
    set((state) => {
      let helicopter = state.helicopter;
      let tank = state.tank;
      let airplane = state.airplane;

      if (vehicles.helicopter) {
        const seats = vehicles.helicopter.seats ?? helicopter.seats;
        let mySeat: SeatType | null = null;
        for (const [seat, playerId] of Object.entries(seats)) {
          if (playerId === myId) {
            mySeat = seat as SeatType;
            break;
          }
        }
        helicopter = syncHelicopterLegacy({
          ...helicopter,
          ...vehicles.helicopter,
          seats,
          mySeat,
          spawned: vehicles.helicopter.spawned ?? true,
        });
      }

      if (vehicles.tank) {
        const seats = vehicles.tank.seats ?? tank.seats;
        tank = syncSingleLegacy({
          ...tank,
          ...vehicles.tank,
          seats,
          mySeat: seats.pilot === myId ? 'pilot' : null,
          spawned: vehicles.tank.spawned ?? true,
        });
      }

      if (vehicles.airplane) {
        const seats = vehicles.airplane.seats ?? airplane.seats;
        airplane = syncSingleLegacy({
          ...airplane,
          ...vehicles.airplane,
          seats,
          mySeat: seats.pilot === myId ? 'pilot' : null,
          spawned: vehicles.airplane.spawned ?? true,
        });
      }

      return {
        helicopter,
        tank,
        airplane,
        activeVehicle: vehicleHasLocalSeat({ helicopter, tank, airplane }),
      };
    });
  },

  isInVehicle: () => {
    const state = get();
    return state.helicopter.mySeat !== null || state.tank.mySeat !== null || state.airplane.mySeat !== null;
  },

  getMySeat: () => {
    const state = get();
    return state.helicopter.mySeat ?? state.tank.mySeat ?? state.airplane.mySeat;
  },

  getActiveVehicle: () => {
    const state = get();
    return state.activeVehicle ?? vehicleHasLocalSeat(state);
  },

  getPassengerCount: () => {
    const state = get();
    const heliCount = Object.values(state.helicopter.seats).filter((id) => id !== null).length;
    const tankCount = state.tank.seats.pilot ? 1 : 0;
    const airplaneCount = state.airplane.seats.pilot ? 1 : 0;
    return heliCount + tankCount + airplaneCount;
  },

  findAvailableSeat: (preferred?) => {
    const seats = get().helicopter.seats;
    if (preferred && seats[preferred] === null) return preferred;
    for (const seat of SEAT_PRIORITY) {
      if (seats[seat] === null) return seat;
    }
    return null;
  },

  changeSeat: (targetSeat) => {
    const state = get();
    const currentSeat = state.helicopter.mySeat;
    if (currentSeat === null) return false;
    if (currentSeat === targetSeat) return false;
    if (state.helicopter.seats[targetSeat] !== null) return false;

    set((s) => {
      const newSeats = { ...s.helicopter.seats };
      newSeats[currentSeat] = null;
      newSeats[targetSeat] = '__local__';

      return {
        activeVehicle: 'helicopter',
        helicopter: syncHelicopterLegacy({
          ...s.helicopter,
          mySeat: targetSeat,
          seats: newSeats,
        }),
      };
    });

    return true;
  },

  setSeatPlayer: (seat, playerId) => {
    set((state) => {
      const seats = {
        ...state.helicopter.seats,
        [seat]: playerId,
      };
      return {
        helicopter: syncHelicopterLegacy({
          ...state.helicopter,
          seats,
        }),
      };
    });
  },

  syncSeats: (seats) => {
    set((state) => ({
      helicopter: syncHelicopterLegacy({
        ...state.helicopter,
        seats,
      }),
    }));
  },

  hasAnyPassenger: () => {
    const state = get();
    return hasHelicopterPassenger(state.helicopter)
      || hasSinglePassenger(state.tank)
      || hasSinglePassenger(state.airplane);
  },
}));
