// 乗り物GLBモデルの表示・搭乗位置調整
// グループ原点は地面上面。モデルは autoGround で底面を Y=0 に揃える。
// アバター座標はグループ原点（地面）基準。

export const TANK_MODEL_SCALE = 0.58;
export const TANK_MODEL_YAW = -Math.PI / 2;
export const TANK_GROUND_CONTACT_NODE = '円柱';
/** 砲塔の回転中心（グループ原点=地面基準） */
export const TANK_TURRET_PIVOT: [number, number, number] = [0.95, 1.55, -0.05];
/** 搭乗員アバター位置（ハッチ付近・地面基準） */
export const TANK_AVATAR_POSITION: [number, number, number] = [0.15, 1.38, 0.12];
export const TANK_AVATAR_SCALE = 0.78;
/** 操縦カメラ位置（ハッチ上・地面基準） */
export const TANK_CAMERA_POSITION: [number, number, number] = [0.15, 2.45, 0.12];

export const AIRPLANE_MODEL_SCALE = 0.165;
/** XZ オフセットのみ。Y は autoGround が決める */
export const AIRPLANE_MODEL_XZ_OFFSET: [number, number] = [0, 0];
export const AIRPLANE_MODEL_YAW = Math.PI;
/** コックピット搭乗員（地面基準）。ローカル操縦者は非表示 */
export const AIRPLANE_AVATAR_POSITION: [number, number, number] = [0, 1.85, 0.55];
export const AIRPLANE_AVATAR_SCALE = 0.68;
