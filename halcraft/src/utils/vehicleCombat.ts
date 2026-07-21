// 乗り物の共通当たり判定ユーティリティ

import {
  useVehicleStore,
  VEHICLE_HITBOX,
  type VehicleType,
} from '../stores/useVehicleStore';

const ALL_VEHICLE_TYPES: VehicleType[] = ['helicopter', 'tank', 'airplane', 'car'];
const EPSILON = 1e-8;

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

/**
 * 線分と乗り物AABBの交差判定（高速弾のトンネル抜け防止）
 * ヒットした場合は線分パラメータ t（0〜1）を返す
 */
export function segmentHitsVehicleHitbox(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  vx: number,
  vy: number,
  vz: number,
  type: VehicleType,
): { hit: true; t: number } | { hit: false } {
  const hitbox = VEHICLE_HITBOX[type];
  const minX = vx - hitbox.rx;
  const maxX = vx + hitbox.rx;
  const minY = vy - hitbox.ry;
  const maxY = vy + hitbox.ry;
  const minZ = vz - hitbox.rz;
  const maxZ = vz + hitbox.rz;

  // 始点が既に内部なら即ヒット
  if (
    x0 >= minX && x0 <= maxX
    && y0 >= minY && y0 <= maxY
    && z0 >= minZ && z0 <= maxZ
  ) {
    return { hit: true, t: 0 };
  }

  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  let tMin = 0;
  let tMax = 1;

  // Xスラブ
  if (Math.abs(dx) < EPSILON) {
    if (x0 < minX || x0 > maxX) return { hit: false };
  } else {
    let t1 = (minX - x0) / dx;
    let t2 = (maxX - x0) / dx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return { hit: false };
  }

  // Yスラブ
  if (Math.abs(dy) < EPSILON) {
    if (y0 < minY || y0 > maxY) return { hit: false };
  } else {
    let t1 = (minY - y0) / dy;
    let t2 = (maxY - y0) / dy;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return { hit: false };
  }

  // Zスラブ
  if (Math.abs(dz) < EPSILON) {
    if (z0 < minZ || z0 > maxZ) return { hit: false };
  } else {
    let t1 = (minZ - z0) / dz;
    let t2 = (maxZ - z0) / dz;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return { hit: false };
  }

  return { hit: true, t: tMin };
}

export interface VehicleProjectileHit {
  type: VehicleType;
  hit: true;
  /** 線分上のヒット位置 */
  hitX: number;
  hitY: number;
  hitZ: number;
}

/**
 * 全乗り物に対して弾の当たり判定をチェック
 * prev を渡すと線分スイープ判定（高速弾のトンネル抜け防止）
 */
export function checkProjectileHitVehicle(
  px: number,
  py: number,
  pz: number,
  excludeType?: VehicleType,
  prevX?: number,
  prevY?: number,
  prevZ?: number,
): VehicleProjectileHit | null {
  const state = useVehicleStore.getState();
  const fromX = prevX ?? px;
  const fromY = prevY ?? py;
  const fromZ = prevZ ?? pz;

  let best: VehicleProjectileHit | null = null;
  let bestT = Number.POSITIVE_INFINITY;

  for (const type of ALL_VEHICLE_TYPES) {
    if (type === excludeType) continue;
    const vehicle = state[type];
    if (!vehicle.spawned || vehicle.destroyed) continue;

    const seg = segmentHitsVehicleHitbox(
      fromX, fromY, fromZ,
      px, py, pz,
      vehicle.x, vehicle.y, vehicle.z,
      type,
    );
    if (!seg.hit) continue;
    if (seg.t >= bestT) continue;

    bestT = seg.t;
    best = {
      type,
      hit: true,
      hitX: fromX + (px - fromX) * seg.t,
      hitY: fromY + (py - fromY) * seg.t,
      hitZ: fromZ + (pz - fromZ) * seg.t,
    };
  }

  return best;
}
