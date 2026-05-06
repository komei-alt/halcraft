// 乗り物の共通当たり判定ユーティリティ

import {
  useVehicleStore,
  VEHICLE_HITBOX,
  type VehicleType,
} from '../stores/useVehicleStore';

const ALL_VEHICLE_TYPES: VehicleType[] = ['helicopter', 'tank', 'airplane', 'car'];

/** 乗り物のAABBに弾が入っているか判定 */
export function isPointInVehicleHitbox(
  px: number,
  py: number,
  pz: number,
  vx: number,
  vy: number,
  vz: number,
  type: VehicleType,
): boolean {
  const hitbox = VEHICLE_HITBOX[type];
  const dx = Math.abs(px - vx);
  const dy = Math.abs(py - vy);
  const dz = Math.abs(pz - vz);
  return dx < hitbox.rx && dy < hitbox.ry && dz < hitbox.rz;
}

/** 全乗り物に対してポイントの当たり判定をチェック */
export function checkProjectileHitVehicle(
  px: number,
  py: number,
  pz: number,
  excludeType?: VehicleType,
): { type: VehicleType; hit: boolean } | null {
  const state = useVehicleStore.getState();
  for (const type of ALL_VEHICLE_TYPES) {
    if (type === excludeType) continue;
    const vehicle = state[type];
    if (!vehicle.spawned || vehicle.destroyed) continue;
    if (isPointInVehicleHitbox(px, py, pz, vehicle.x, vehicle.y, vehicle.z, type)) {
      return { type, hit: true };
    }
  }
  return null;
}
