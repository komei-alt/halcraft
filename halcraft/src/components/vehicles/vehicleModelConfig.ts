// 乗り物GLBモデルの表示・搭乗位置調整
// ※ MODEL_POSITION.y は autoGround に移行済み。ここには XZ/回転/アバター位置のみ残す。

export const TANK_MODEL_SCALE = 0.58;
export const TANK_MODEL_YAW = -Math.PI / 2;
export const TANK_TURRET_PIVOT: [number, number, number] = [0.95, 1.92, -0.05];
export const TANK_AVATAR_POSITION: [number, number, number] = [0.2, 1.72, 0.18];
export const TANK_AVATAR_SCALE = 0.82;
export const TANK_CAMERA_POSITION: [number, number, number] = [0.2, 2.82, 0.18];

export const AIRPLANE_MODEL_SCALE = 0.165;
export const AIRPLANE_MODEL_YAW = Math.PI;
export const AIRPLANE_AVATAR_POSITION: [number, number, number] = [0, 2.55, -0.35];
export const AIRPLANE_AVATAR_SCALE = 0.72;
