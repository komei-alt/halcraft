// 乗り物（ヘリコプター / 戦車 / 飛行機 / 車）の状態管理ストア
// 既存ヘリAPIを維持しつつ、単座乗り物は共通APIで扱う

import { create } from 'zustand';

/** 乗り物の種類 */
export type VehicleType = 'helicopter' | 'tank' | 'airplane' | 'car';

/** ヘリコプター座席タイプ */
export type SeatType = 'pilot' | 'gunner_left' | 'gunner_right';
export type SingleSeatType = 'pilot';
export type CarSeatType = 'driver' | 'front_passenger' | 'rear_left' | 'rear_right';
export type VehicleSeatType = SeatType | SingleSeatType | CarSeatType;

/** 座席の優先順（搭乗時に空席を探す順序） */
export const SEAT_PRIORITY: SeatType[] = ['pilot', 'gunner_left', 'gunner_right'];

/** 全座席リスト */
export const ALL_SEATS: SeatType[] = ['pilot', 'gunner_left', 'gunner_right'];
export const CAR_SEAT_PRIORITY: CarSeatType[] = ['driver', 'front_passenger', 'rear_left', 'rear_right'];

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

export const CAR_SEAT_NAMES: Record<CarSeatType, string> = {
  driver: '運転席',
  front_passenger: '助手席',
  rear_left: '後部左席',
  rear_right: '後部右席',
};

export const VEHICLE_NAMES: Record<VehicleType, string> = {
  helicopter: 'ヘリコプター',
  tank: '戦車',
  airplane: '飛行機',
  car: '車1',
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

/** 乗り物のHP定数 */
export const VEHICLE_HP: Record<VehicleType, number> = {
  helicopter: 80,
  tank: 120,
  airplane: 60,
  car: 50,
} as const;

/** 乗り物の当たり判定サイズ（半径 x, 高さ半分 y, 半径 z） */
export const VEHICLE_HITBOX: Record<VehicleType, { rx: number; ry: number; rz: number }> = {
  helicopter: { rx: 2.0, ry: 1.5, rz: 3.0 },
  tank:       { rx: 1.8, ry: 1.2, rz: 2.5 },
  airplane:   { rx: 3.0, ry: 1.0, rz: 4.5 },
  car:        { rx: 1.2, ry: 0.8, rz: 2.2 },
} as const;

/** 乗り物爆発の定数 */
export const VEHICLE_EXPLOSION = {
  /** 爆発半径 */
  RADIUS: 10,
  /** 搭乗者への即死ダメージ */
  RIDER_DAMAGE: 999,
  /** 近くのプレイヤーへの最大ダメージ */
  PROXIMITY_MAX_DAMAGE: 30,
  /** 近くのプレイヤーへの最小ダメージ */
  PROXIMITY_MIN_DAMAGE: 5,
  /** 乗り物同士の体当たりダメージ（毎フレーム、速度比例） */
  COLLISION_DAMAGE_MULTIPLIER: 0.8,
  /** リスポーンまでの秒数 */
  RESPAWN_DELAY: 3,
  /** ブロック破壊半径 */
  BLOCK_DESTROY_RADIUS: 3.5,
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
  hp: number;
  maxHp: number;
  destroyed: boolean;
  destroyedAt: number;
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
  hp: number;
  maxHp: number;
  destroyed: boolean;
  destroyedAt: number;
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

export interface CarState {
  spawned: boolean;
  mySeat: CarSeatType | null;
  seats: Record<CarSeatType, string | null>;
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
  wheelSpin: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  destroyedAt: number;
}

export interface VehiclesSyncPayload {
  helicopter?: Partial<HelicopterState> & { seats?: Record<SeatType, string | null> };
  tank?: Partial<TankState> & { seats?: Record<SingleSeatType, string | null> };
  airplane?: Partial<AirplaneState> & { seats?: Record<SingleSeatType, string | null> };
  car?: Partial<CarState> & { seats?: Record<CarSeatType, string | null> };
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
  PILOT_CAMERA_HEIGHT: 4.8,
  PILOT_CAMERA_BACK: 8.8,
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
  BODY_HEIGHT: 0.72,
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
  CAMERA_HEIGHT: 6.2,
  CAMERA_BACK: 12.5,
  CAMERA_LOOK_HEIGHT: 2.2,
  CAMERA_LOOK_AHEAD: 16,
  BODY_HEIGHT: 1.0,
  GRAVITY: 7.5,
  LIFT: 0.42,
  PROPELLER_SPEED: 36,
} as const;

/** 車1の定数 */
export const CAR_CONSTANTS = {
  MAX_SPEED: 16,
  REVERSE_SPEED: 6,
  ACCELERATION: 12,
  DECELERATION: 8,
  TURN_SPEED: 1.55,
  BOARD_DISTANCE: 5,
  BODY_HEIGHT: 0.95,
  CAMERA_HEIGHT: 2.75,
  CAMERA_BACK: 5.8,
} as const;

const EMPTY_SEATS: Record<SeatType, string | null> = {
  pilot: null,
  gunner_left: null,
  gunner_right: null,
};

const EMPTY_SINGLE_SEAT: Record<SingleSeatType, string | null> = {
  pilot: null,
};

const EMPTY_CAR_SEATS: Record<CarSeatType, string | null> = {
  driver: null,
  front_passenger: null,
  rear_left: null,
  rear_right: null,
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
    hp: VEHICLE_HP.helicopter,
    maxHp: VEHICLE_HP.helicopter,
    destroyed: false,
    destroyedAt: 0,
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
    hp: VEHICLE_HP.tank,
    maxHp: VEHICLE_HP.tank,
    destroyed: false,
    destroyedAt: 0,
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
    hp: VEHICLE_HP.airplane,
    maxHp: VEHICLE_HP.airplane,
    destroyed: false,
    destroyedAt: 0,
  };
}

function createCarState(x = 0, y = 0, z = 0): CarState {
  return {
    spawned: false,
    mySeat: null,
    seats: { ...EMPTY_CAR_SEATS },
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
    wheelSpin: 0,
    hp: VEHICLE_HP.car,
    maxHp: VEHICLE_HP.car,
    destroyed: false,
    destroyedAt: 0,
  };
}

function hasHelicopterPassenger(helicopter: HelicopterState): boolean {
  return Object.values(helicopter.seats).some((id) => id !== null);
}

function hasSinglePassenger(vehicle: SingleSeatVehicleState): boolean {
  return vehicle.seats.pilot !== null;
}

function hasCarPassenger(car: CarState): boolean {
  return Object.values(car.seats).some((id) => id !== null);
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

function syncCarLegacy(car: CarState): CarState {
  const someoneBoarded = hasCarPassenger(car);
  return {
    ...car,
    pilotId: car.seats.driver,
    isBoarded: car.mySeat !== null,
    engineOn: someoneBoarded,
  };
}

function vehicleHasLocalSeat(state: Pick<VehicleState, 'helicopter' | 'tank' | 'airplane' | 'car'>): VehicleType | null {
  if (state.helicopter.mySeat !== null) return 'helicopter';
  if (state.tank.mySeat !== null) return 'tank';
  if (state.airplane.mySeat !== null) return 'airplane';
  if (state.car.mySeat !== null) return 'car';
  return null;
}

function getHelicopterSeatForPlayer(
  seats: Record<SeatType, string | null>,
  playerId: string | null,
): SeatType | null {
  if (playerId === null) return null;
  for (const [seat, seatPlayerId] of Object.entries(seats)) {
    if (seatPlayerId === playerId) return seat as SeatType;
  }
  return null;
}

function getSingleSeatForPlayer(
  seats: Record<SingleSeatType, string | null>,
  playerId: string | null,
): SingleSeatType | null {
  return playerId !== null && seats.pilot === playerId ? 'pilot' : null;
}

function resolveSingleSeatForSync(
  localVehicle: SingleSeatVehicleState,
  seats: Record<SingleSeatType, string | null>,
  playerId: string | null,
): { mySeat: SingleSeatType | null; seats: Record<SingleSeatType, string | null> } {
  const serverSeat = getSingleSeatForPlayer(seats, playerId);
  if (serverSeat !== null) return { mySeat: serverSeat, seats };

  const canKeepLocalPilot =
    localVehicle.mySeat === 'pilot'
    && (playerId === null || localVehicle.seats.pilot === '__local__')
    && (playerId === null || seats.pilot === null);

  if (!canKeepLocalPilot) return { mySeat: null, seats };

  return {
    mySeat: 'pilot',
    seats: seats.pilot === null ? localVehicle.seats : seats,
  };
}

function getCarSeatForPlayer(
  seats: Record<CarSeatType, string | null>,
  playerId: string | null,
): CarSeatType | null {
  if (playerId === null) return null;
  for (const [seat, seatPlayerId] of Object.entries(seats)) {
    if (seatPlayerId === playerId) return seat as CarSeatType;
  }
  return null;
}

/** 乗り物ごとの補間目標値（ストア外で管理してZustandの再レンダリングを回避） */
interface VehicleInterpolationTarget {
  x: number; y: number; z: number;
  rotationY: number; pitch: number; roll: number;
  speed: number;
  // 飛行機固有
  propellerAngle?: number;
  throttle?: number;
  airborne?: boolean;
  // ヘリ固有
  rotorAngle?: number;
  // 戦車固有
  turretYaw?: number;
  gunSpin?: number;
  // 車固有
  wheelSpin?: number;
}

/** 補間目標値（ストア外管理 — 毎フレーム補間で使用） */
const vehicleTargets: Record<VehicleType, VehicleInterpolationTarget | null> = {
  helicopter: null,
  tank: null,
  airplane: null,
  car: null,
};

/** 角度の最短回転で補間する */
function lerpAngle(current: number, target: number, t: number): number {
  let diff = target - current;
  // -PI ~ PI に正規化
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * t;
}

interface VehicleState {
  helicopter: HelicopterState;
  tank: TankState;
  airplane: AirplaneState;
  car: CarState;
  activeVehicle: VehicleType | null;

  spawnHelicopter: (x: number, y: number, z: number) => void;
  spawnTank: (x: number, y: number, z: number) => void;
  spawnAirplane: (x: number, y: number, z: number) => void;
  spawnCar: (x: number, y: number, z: number) => void;

  boardHelicopter: (preferredSeat?: SeatType) => SeatType | null;
  dismountHelicopter: () => void;
  updateHelicopter: (updates: Partial<HelicopterState>) => void;

  boardVehicle: (type: VehicleType, preferredSeat?: SeatType) => VehicleSeatType | null;
  dismountVehicle: (type?: VehicleType) => void;
  updateTank: (updates: Partial<TankState>) => void;
  updateAirplane: (updates: Partial<AirplaneState>) => void;
  updateCar: (updates: Partial<CarState>) => void;
  updateVehicle: (type: VehicleType, updates: Partial<HelicopterState> | Partial<TankState> | Partial<AirplaneState> | Partial<CarState>) => void;
  syncVehicles: (vehicles: VehiclesSyncPayload, myId: string | null) => void;

  /** 自分が操縦していない乗り物の補間を毎フレーム実行 */
  interpolateVehicles: (dt: number) => void;

  /** 乗り物にダメージを与える。破壊された場合 true を返す */
  damageVehicle: (type: VehicleType, amount: number) => boolean;
  /** 乗り物を破壊する */
  destroyVehicle: (type: VehicleType) => void;
  /** 破壊された乗り物をリスポーンさせる */
  respawnVehicle: (type: VehicleType) => void;
  /** 乗り物のHPを取得 */
  getVehicleHp: (type: VehicleType) => { hp: number; maxHp: number; destroyed: boolean };

  isInVehicle: () => boolean;
  getMySeat: () => VehicleSeatType | null;
  getActiveVehicle: () => VehicleType | null;
  getPassengerCount: () => number;
  findAvailableSeat: (preferred?: SeatType) => SeatType | null;
  findAvailableCarSeat: (preferred?: CarSeatType) => CarSeatType | null;
  changeSeat: (targetSeat: SeatType) => boolean;
  changeCarSeat: (targetSeat: CarSeatType) => boolean;
  setSeatPlayer: (seat: SeatType, playerId: string | null) => void;
  syncSeats: (seats: Record<SeatType, string | null>) => void;
  hasAnyPassenger: () => boolean;
}

export const useVehicleStore = create<VehicleState>((set, get) => ({
  helicopter: createHelicopterState(),
  tank: createTankState(),
  airplane: createAirplaneState(),
  car: createCarState(),
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

  spawnCar: (x, y, z) => {
    set({ car: { ...createCarState(x, y, z), spawned: true } });
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
            car: state.car,
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

    if (type === 'airplane') {
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
    }

    if (!state.car.spawned) return null;
    const carSeat = state.findAvailableCarSeat();
    if (carSeat === null) return null;
    set((s) => ({
      activeVehicle: 'car',
      car: syncCarLegacy({
        ...s.car,
        mySeat: carSeat,
        seats: {
          ...s.car.seats,
          [carSeat]: '__local__',
        },
        engineOn: true,
      }),
    }));
    return carSeat;
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

    if (active === 'airplane') {
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
      return;
    }

    set((state) => {
      const mySeat = state.car.mySeat;
      const seats = { ...state.car.seats };
      if (mySeat) seats[mySeat] = null;
      const shouldReset = mySeat === 'driver' || !Object.values(seats).some((id) => id !== null);
      const car = syncCarLegacy({
        ...state.car,
        mySeat: null,
        seats,
        speed: mySeat === 'driver' ? 0 : state.car.speed,
        ...(shouldReset ? {
          x: state.car.spawnX,
          y: state.car.spawnY,
          z: state.car.spawnZ,
          rotationY: 0,
          pitch: 0,
          roll: 0,
          wheelSpin: 0,
        } : {}),
      });
      return {
        activeVehicle: vehicleHasLocalSeat({ ...state, car }),
        car,
      };
    });
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

  updateCar: (updates) => {
    set((state) => ({
      car: syncCarLegacy({
        ...state.car,
        ...updates,
      }),
    }));
  },

  updateVehicle: (type, updates) => {
    if (type === 'helicopter') {
      get().updateHelicopter(updates as Partial<HelicopterState>);
    } else if (type === 'tank') {
      get().updateTank(updates as Partial<TankState>);
    } else if (type === 'airplane') {
      get().updateAirplane(updates as Partial<AirplaneState>);
    } else {
      get().updateCar(updates as Partial<CarState>);
    }
  },

  syncVehicles: (vehicles, myId) => {
    set((state) => {
      let helicopter = state.helicopter;
      let tank = state.tank;
      let airplane = state.airplane;
      let car = state.car;

      if (vehicles.helicopter) {
        const seats = vehicles.helicopter.seats ?? helicopter.seats;
        const mySeat = getHelicopterSeatForPlayer(seats, myId);
        const keepLocalPilotMotion = helicopter.mySeat === 'pilot' && mySeat === 'pilot';
        if (keepLocalPilotMotion) {
          // ローカル操縦中: 座席情報のみ同期、位置はローカル
          helicopter = syncHelicopterLegacy({
            ...helicopter,
            seats,
            mySeat,
            spawned: vehicles.helicopter.spawned ?? helicopter.spawned,
          });
          vehicleTargets.helicopter = null;
        } else {
          // リモート乗り物: 座席と spawned は即座に反映し、位置は目標値に設定
          const v = vehicles.helicopter;
          vehicleTargets.helicopter = {
            x: v.x ?? helicopter.x,
            y: v.y ?? helicopter.y,
            z: v.z ?? helicopter.z,
            rotationY: v.rotationY ?? helicopter.rotationY,
            pitch: v.pitch ?? helicopter.pitch,
            roll: v.roll ?? helicopter.roll,
            speed: v.speed ?? helicopter.speed,
            rotorAngle: v.rotorAngle ?? helicopter.rotorAngle,
          };
          helicopter = syncHelicopterLegacy({
            ...helicopter,
            seats,
            mySeat,
            spawned: vehicles.helicopter.spawned ?? helicopter.spawned,
          });
        }
      }

      if (vehicles.tank) {
        const seats = vehicles.tank.seats ?? tank.seats;
        const resolved = resolveSingleSeatForSync(tank, seats, myId);
        const mySeat = resolved.mySeat;
        const keepLocalPilotMotion = tank.mySeat === 'pilot' && mySeat === 'pilot';
        if (keepLocalPilotMotion) {
          tank = syncSingleLegacy({
            ...tank,
            seats: resolved.seats,
            mySeat,
            spawned: vehicles.tank.spawned ?? tank.spawned,
          });
          vehicleTargets.tank = null;
        } else {
          const v = vehicles.tank;
          vehicleTargets.tank = {
            x: v.x ?? tank.x,
            y: v.y ?? tank.y,
            z: v.z ?? tank.z,
            rotationY: v.rotationY ?? tank.rotationY,
            pitch: v.pitch ?? tank.pitch,
            roll: v.roll ?? tank.roll,
            speed: v.speed ?? tank.speed,
            turretYaw: (v as Partial<TankState>).turretYaw ?? (tank as TankState).turretYaw,
            gunSpin: (v as Partial<TankState>).gunSpin ?? (tank as TankState).gunSpin,
          };
          tank = syncSingleLegacy({
            ...tank,
            seats: resolved.seats,
            mySeat,
            spawned: vehicles.tank.spawned ?? tank.spawned,
          });
        }
      }

      if (vehicles.airplane) {
        const seats = vehicles.airplane.seats ?? airplane.seats;
        const resolved = resolveSingleSeatForSync(airplane, seats, myId);
        const mySeat = resolved.mySeat;
        const keepLocalPilotMotion = airplane.mySeat === 'pilot' && mySeat === 'pilot';
        if (keepLocalPilotMotion) {
          airplane = syncSingleLegacy({
            ...airplane,
            seats: resolved.seats,
            mySeat,
            spawned: vehicles.airplane.spawned ?? airplane.spawned,
          });
          vehicleTargets.airplane = null;
        } else {
          const v = vehicles.airplane;
          vehicleTargets.airplane = {
            x: v.x ?? airplane.x,
            y: v.y ?? airplane.y,
            z: v.z ?? airplane.z,
            rotationY: v.rotationY ?? airplane.rotationY,
            pitch: v.pitch ?? airplane.pitch,
            roll: v.roll ?? airplane.roll,
            speed: v.speed ?? airplane.speed,
            propellerAngle: (v as Partial<AirplaneState>).propellerAngle ?? (airplane as AirplaneState).propellerAngle,
            throttle: (v as Partial<AirplaneState>).throttle ?? (airplane as AirplaneState).throttle,
            airborne: (v as Partial<AirplaneState>).airborne ?? (airplane as AirplaneState).airborne,
          };
          airplane = syncSingleLegacy({
            ...airplane,
            seats: resolved.seats,
            mySeat,
            spawned: vehicles.airplane.spawned ?? airplane.spawned,
          });
        }
      }

      if (vehicles.car) {
        const seats = vehicles.car.seats ?? car.seats;
        const mySeat = getCarSeatForPlayer(seats, myId);
        const keepLocalDriverMotion = car.mySeat === 'driver' && mySeat === 'driver';
        if (keepLocalDriverMotion) {
          car = syncCarLegacy({
            ...car,
            seats,
            mySeat,
            spawned: vehicles.car.spawned ?? car.spawned,
          });
          vehicleTargets.car = null;
        } else {
          const v = vehicles.car;
          vehicleTargets.car = {
            x: v.x ?? car.x,
            y: v.y ?? car.y,
            z: v.z ?? car.z,
            rotationY: v.rotationY ?? car.rotationY,
            pitch: v.pitch ?? car.pitch,
            roll: v.roll ?? car.roll,
            speed: v.speed ?? car.speed,
            wheelSpin: (v as Partial<CarState>).wheelSpin ?? (car as CarState).wheelSpin,
          };
          car = syncCarLegacy({
            ...car,
            seats,
            mySeat,
            spawned: vehicles.car.spawned ?? car.spawned,
          });
        }
      }

      return {
        helicopter,
        tank,
        airplane,
        car,
        activeVehicle: vehicleHasLocalSeat({ helicopter, tank, airplane, car }),
      };
    });
  },

  interpolateVehicles: (dt) => {
    const state = get();
    // 補間速度: 値が大きいほど目標値に速く追従する
    const t = Math.min(1, dt * 15);
    let changed = false;
    const updates: Partial<Pick<VehicleState, 'helicopter' | 'tank' | 'airplane' | 'car'>> = {};

    // ヘリコプター補間
    const heliTarget = vehicleTargets.helicopter;
    if (heliTarget && state.helicopter.spawned && state.helicopter.mySeat !== 'pilot') {
      const h = state.helicopter;
      const dx = heliTarget.x - h.x;
      const dy = heliTarget.y - h.y;
      const dz = heliTarget.z - h.z;
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01 || Math.abs(dz) > 0.01 ||
          Math.abs(heliTarget.rotationY - h.rotationY) > 0.01) {
        updates.helicopter = syncHelicopterLegacy({
          ...h,
          x: h.x + dx * t,
          y: h.y + dy * t,
          z: h.z + dz * t,
          rotationY: lerpAngle(h.rotationY, heliTarget.rotationY, t),
          pitch: h.pitch + (heliTarget.pitch - h.pitch) * t,
          roll: h.roll + (heliTarget.roll - h.roll) * t,
          speed: h.speed + (heliTarget.speed - h.speed) * t,
          rotorAngle: heliTarget.rotorAngle ?? h.rotorAngle,
        });
        changed = true;
      }
    }

    // 戦車補間
    const tankTarget = vehicleTargets.tank;
    if (tankTarget && state.tank.spawned && state.tank.mySeat !== 'pilot') {
      const v = state.tank;
      const dx = tankTarget.x - v.x;
      const dz = tankTarget.z - v.z;
      if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01 ||
          Math.abs(tankTarget.rotationY - v.rotationY) > 0.01) {
        updates.tank = syncSingleLegacy({
          ...v,
          x: v.x + dx * t,
          y: v.y + (tankTarget.y - v.y) * t,
          z: v.z + dz * t,
          rotationY: lerpAngle(v.rotationY, tankTarget.rotationY, t),
          pitch: v.pitch + (tankTarget.pitch - v.pitch) * t,
          roll: v.roll + (tankTarget.roll - v.roll) * t,
          speed: v.speed + (tankTarget.speed - v.speed) * t,
          turretYaw: lerpAngle(v.turretYaw, tankTarget.turretYaw ?? v.turretYaw, t),
          gunSpin: tankTarget.gunSpin ?? v.gunSpin,
        });
        changed = true;
      }
    }

    // 飛行機補間
    const airTarget = vehicleTargets.airplane;
    if (airTarget && state.airplane.spawned && state.airplane.mySeat !== 'pilot') {
      const v = state.airplane;
      const dx = airTarget.x - v.x;
      const dy = airTarget.y - v.y;
      const dz = airTarget.z - v.z;
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01 || Math.abs(dz) > 0.01 ||
          Math.abs(airTarget.rotationY - v.rotationY) > 0.01) {
        updates.airplane = syncSingleLegacy({
          ...v,
          x: v.x + dx * t,
          y: v.y + dy * t,
          z: v.z + dz * t,
          rotationY: lerpAngle(v.rotationY, airTarget.rotationY, t),
          pitch: v.pitch + (airTarget.pitch - v.pitch) * t,
          roll: v.roll + (airTarget.roll - v.roll) * t,
          speed: v.speed + (airTarget.speed - v.speed) * t,
          propellerAngle: airTarget.propellerAngle ?? v.propellerAngle,
          throttle: v.throttle + ((airTarget.throttle ?? v.throttle) - v.throttle) * t,
          airborne: airTarget.airborne ?? v.airborne,
        });
        changed = true;
      }
    }

    // 車補間
    const carTarget = vehicleTargets.car;
    if (carTarget && state.car.spawned && state.car.mySeat !== 'driver') {
      const v = state.car;
      const dx = carTarget.x - v.x;
      const dz = carTarget.z - v.z;
      if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01 ||
          Math.abs(carTarget.rotationY - v.rotationY) > 0.01) {
        updates.car = syncCarLegacy({
          ...v,
          x: v.x + dx * t,
          y: v.y + (carTarget.y - v.y) * t,
          z: v.z + dz * t,
          rotationY: lerpAngle(v.rotationY, carTarget.rotationY, t),
          pitch: v.pitch + (carTarget.pitch - v.pitch) * t,
          roll: v.roll + (carTarget.roll - v.roll) * t,
          speed: v.speed + (carTarget.speed - v.speed) * t,
          wheelSpin: carTarget.wheelSpin ?? v.wheelSpin,
        });
        changed = true;
      }
    }

    if (changed) {
      set(updates);
    }
  },

  isInVehicle: () => {
    const state = get();
    return state.helicopter.mySeat !== null || state.tank.mySeat !== null || state.airplane.mySeat !== null || state.car.mySeat !== null;
  },

  getMySeat: () => {
    const state = get();
    return state.helicopter.mySeat ?? state.tank.mySeat ?? state.airplane.mySeat ?? state.car.mySeat;
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
    const carCount = Object.values(state.car.seats).filter((id) => id !== null).length;
    return heliCount + tankCount + airplaneCount + carCount;
  },

  findAvailableSeat: (preferred?) => {
    const seats = get().helicopter.seats;
    if (preferred && seats[preferred] === null) return preferred;
    for (const seat of SEAT_PRIORITY) {
      if (seats[seat] === null) return seat;
    }
    return null;
  },

  findAvailableCarSeat: (preferred?) => {
    const seats = get().car.seats;
    if (preferred && seats[preferred] === null) return preferred;
    for (const seat of CAR_SEAT_PRIORITY) {
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

  changeCarSeat: (targetSeat) => {
    const state = get();
    const currentSeat = state.car.mySeat;
    if (currentSeat === null) return false;
    if (currentSeat === targetSeat) return false;
    if (state.car.seats[targetSeat] !== null) return false;

    set((s) => {
      const newSeats = { ...s.car.seats };
      newSeats[currentSeat] = null;
      newSeats[targetSeat] = '__local__';

      return {
        activeVehicle: 'car',
        car: syncCarLegacy({
          ...s.car,
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
      || hasSinglePassenger(state.airplane)
      || hasCarPassenger(state.car);
  },

  damageVehicle: (type, amount) => {
    const state = get();
    const vehicle = state[type];
    if (!vehicle.spawned || vehicle.destroyed) return false;
    const newHp = Math.max(0, vehicle.hp - amount);
    const destroyed = newHp <= 0;

    if (type === 'helicopter') {
      set({ helicopter: { ...state.helicopter, hp: newHp, destroyed, destroyedAt: destroyed ? performance.now() / 1000 : 0 } });
    } else if (type === 'tank') {
      set({ tank: { ...state.tank, hp: newHp, destroyed, destroyedAt: destroyed ? performance.now() / 1000 : 0 } });
    } else if (type === 'airplane') {
      set({ airplane: { ...state.airplane, hp: newHp, destroyed, destroyedAt: destroyed ? performance.now() / 1000 : 0 } });
    } else {
      set({ car: { ...state.car, hp: newHp, destroyed, destroyedAt: destroyed ? performance.now() / 1000 : 0 } });
    }

    if (destroyed) {
      get().destroyVehicle(type);
    }
    return destroyed;
  },

  destroyVehicle: (type) => {
    // 搭乗者を全員降ろす（搭乗者は爆発で死亡するが、それは呼び出し側で処理）
    const state = get();
    if (type === 'helicopter') {
      set({
        helicopter: {
          ...state.helicopter,
          mySeat: null,
          seats: { ...EMPTY_SEATS },
          isBoarded: false,
          pilotId: null,
          engineOn: false,
          speed: 0,
          destroyed: true,
          destroyedAt: performance.now() / 1000,
          hp: 0,
        },
        activeVehicle: state.activeVehicle === 'helicopter' ? null : state.activeVehicle,
      });
    } else if (type === 'tank') {
      set({
        tank: {
          ...state.tank,
          mySeat: null,
          seats: { pilot: null },
          isBoarded: false,
          pilotId: null,
          engineOn: false,
          speed: 0,
          destroyed: true,
          destroyedAt: performance.now() / 1000,
          hp: 0,
        },
        activeVehicle: state.activeVehicle === 'tank' ? null : state.activeVehicle,
      });
    } else if (type === 'airplane') {
      set({
        airplane: {
          ...state.airplane,
          mySeat: null,
          seats: { pilot: null },
          isBoarded: false,
          pilotId: null,
          engineOn: false,
          speed: 0,
          destroyed: true,
          destroyedAt: performance.now() / 1000,
          hp: 0,
        },
        activeVehicle: state.activeVehicle === 'airplane' ? null : state.activeVehicle,
      });
    } else {
      set({
        car: {
          ...state.car,
          mySeat: null,
          seats: { ...EMPTY_CAR_SEATS },
          isBoarded: false,
          pilotId: null,
          engineOn: false,
          speed: 0,
          destroyed: true,
          destroyedAt: performance.now() / 1000,
          hp: 0,
        },
        activeVehicle: state.activeVehicle === 'car' ? null : state.activeVehicle,
      });
    }
  },

  respawnVehicle: (type) => {
    const state = get();
    const vehicle = state[type];
    if (!vehicle.destroyed) return;

    if (type === 'helicopter') {
      set({ helicopter: { ...createHelicopterState(vehicle.spawnX, vehicle.spawnY, vehicle.spawnZ), spawned: true } });
    } else if (type === 'tank') {
      set({ tank: { ...createTankState(vehicle.spawnX, vehicle.spawnY, vehicle.spawnZ), spawned: true } });
    } else if (type === 'airplane') {
      set({ airplane: { ...createAirplaneState(vehicle.spawnX, vehicle.spawnY, vehicle.spawnZ), spawned: true } });
    } else {
      set({ car: { ...createCarState(vehicle.spawnX, vehicle.spawnY, vehicle.spawnZ), spawned: true } });
    }
  },

  getVehicleHp: (type) => {
    const vehicle = get()[type];
    return { hp: vehicle.hp, maxHp: vehicle.maxHp, destroyed: vehicle.destroyed };
  },
}));
