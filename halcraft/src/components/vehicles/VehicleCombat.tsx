// 乗り物の戦闘・衝突・爆発ダメージ管理
// - ガトリング/ロケットが乗り物に当たるとダメージ
// - 乗り物同士の衝突でダメージ
// - 乗り物破壊時に搭乗者即死 + 近接プレイヤーにダメージ
// - 破壊後タイマーでリスポーン
// - マルチプレイヤー同期（破壊・リスポーン）

import { useCallback, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  useVehicleStore,
  VEHICLE_HITBOX,
  VEHICLE_EXPLOSION,
  type VehicleType,
} from '../../stores/useVehicleStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { onRemoteVehicleDestroy, onRemoteVehicleRespawn } from '../../stores/useMultiplayerStore';
import { useMobStore } from '../../stores/useMobStore';
import { useWorldStore } from '../../stores/useWorldStore';
import { spawnVehicleExplosion, spawnBlockBreakEffect, spawnDamagePopup, spawnHitImpactEffect } from '../../utils/effectTriggers';
import { playVehicleExplosionSound } from '../../utils/sounds';
import { BLOCK_DEFS, BLOCK_IDS, type BlockId } from '../../types/blocks';

const ALL_VEHICLE_TYPES: VehicleType[] = ['helicopter', 'tank', 'airplane', 'car'];

/** 衝突ダメージのクールダウン（秒） */
const COLLISION_COOLDOWN = 0.5;
/** 最小衝突速度（これ以下は無視） */
const MIN_COLLISION_SPEED = 3;

interface ExplosionBlockCandidate {
  x: number;
  y: number;
  z: number;
  blockId: BlockId;
  distSq: number;
}

/** 乗り物のAABBに弾が入っているか判定 */
export function isPointInVehicleHitbox(
  px: number, py: number, pz: number,
  vx: number, vy: number, vz: number,
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
  px: number, py: number, pz: number,
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

/** 爆発ダメージの距離減衰 */
function calculateProximityDamage(distance: number): number {
  if (distance >= VEHICLE_EXPLOSION.RADIUS) return 0;
  const falloff = 1 - distance / VEHICLE_EXPLOSION.RADIUS;
  const eased = falloff * falloff;
  return Math.max(1, Math.round(
    VEHICLE_EXPLOSION.PROXIMITY_MIN_DAMAGE +
    (VEHICLE_EXPLOSION.PROXIMITY_MAX_DAMAGE - VEHICLE_EXPLOSION.PROXIMITY_MIN_DAMAGE) * eased
  ));
}

export function VehicleCombat() {
  const { camera } = useThree();
  const lastCollisionTime = useRef<Record<string, number>>({});
  const respawnTimers = useRef<Record<VehicleType, number>>({
    helicopter: 0,
    tank: 0,
    airplane: 0,
    car: 0,
  });

  /** 前フレームの destroyed 状態を追跡して、新たに破壊されたかを検知 */
  const prevDestroyed = useRef<Record<VehicleType, boolean>>({
    helicopter: false,
    tank: false,
    airplane: false,
    car: false,
  });

  /** 乗り物の爆発処理（ブロック破壊 + 周囲ダメージ + 搭乗者即死） */
  const handleVehicleExplosion = useCallback((type: VehicleType, isRemote: boolean = false) => {
    const state = useVehicleStore.getState();
    const vehicle = state[type];
    const cx = vehicle.x;
    const cy = vehicle.y + 1;
    const cz = vehicle.z;

    // 1. 派手な爆発エフェクトを発生
    spawnVehicleExplosion(type, cx, cy, cz);

    // 2. 爆発音
    playVehicleExplosionSound(camera.position.distanceTo(new THREE.Vector3(cx, cy, cz)));

    // 3. ブロック破壊
    const world = useWorldStore.getState();
    const multi = useMultiplayerStore.getState();
    const radius = VEHICLE_EXPLOSION.BLOCK_DESTROY_RADIUS;
    const radiusSq = radius * radius;
    const minX = Math.floor(cx - radius);
    const maxX = Math.floor(cx + radius);
    const minY = Math.floor(cy - radius);
    const maxY = Math.floor(cy + radius);
    const minZ = Math.floor(cz - radius);
    const maxZ = Math.floor(cz + radius);
    const candidates: ExplosionBlockCandidate[] = [];

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          const dz = z + 0.5 - cz;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq > radiusSq) continue;
          const blockId = world.getBlock(x, y, z);
          if (blockId === BLOCK_IDS.AIR) continue;
          if (BLOCK_DEFS[blockId]?.unbreakable) continue;
          candidates.push({ x, y, z, blockId, distSq });
        }
      }
    }

    candidates.sort((a, b) => a.distSq - b.distSq);
    for (const block of candidates.slice(0, 100)) {
      if (!world.breakBlock(block.x, block.y, block.z)) continue;
      spawnBlockBreakEffect(block.blockId, block.x, block.y, block.z);
      if (!isRemote) {
        multi.sendBlockBreak(block.x, block.y, block.z);
      }
    }

    // 4. 搭乗者に即死ダメージ（自分が乗っていた場合）
    const wasMyVehicle = state.activeVehicle === type;
    if (wasMyVehicle) {
      usePlayerStore.getState().takeDamage(VEHICLE_EXPLOSION.RIDER_DAMAGE);
    }

    // 5. 近くのプレイヤーにダメージ
    const playerPos = camera.position;
    if (!wasMyVehicle) {
      const dist = playerPos.distanceTo(new THREE.Vector3(cx, cy, cz));
      const damage = calculateProximityDamage(dist);
      if (damage > 0) {
        const dirX = playerPos.x - cx;
        const dirZ = playerPos.z - cz;
        usePlayerStore.getState().takeDamage(damage, dirX, dirZ);
      }
    }

    // 6. 近くのリモートプレイヤーにダメージ通知（ローカル側のみ送信）
    if (!isRemote) {
      for (const [, player] of multi.remotePlayers) {
        if (player.isDead) continue;
        const pPos = new THREE.Vector3(player.position[0], player.position[1] + 0.85, player.position[2]);
        const dist = pPos.distanceTo(new THREE.Vector3(cx, cy, cz));
        const damage = calculateProximityDamage(dist);
        if (damage <= 0) continue;
        const dirX = player.position[0] - cx;
        const dirZ = player.position[2] - cz;
        multi.sendPlayerAttack(player.id, damage, dirX * 2, dirZ * 2);
        spawnDamagePopup(damage, player.position[0], player.position[1] + 1.5, player.position[2], damage >= VEHICLE_EXPLOSION.PROXIMITY_MAX_DAMAGE * 0.7);
      }
    }

    // 7. 近くのモブにダメージ（ローカル側のみ処理）
    if (!isRemote) {
      const mobs = useMobStore.getState().mobs;
      for (const mob of mobs) {
        if (mob.hp <= 0) continue;
        const mobPos = new THREE.Vector3(mob.x, mob.y + 0.9, mob.z);
        const dist = mobPos.distanceTo(new THREE.Vector3(cx, cy, cz));
        const damage = calculateProximityDamage(dist);
        if (damage <= 0) continue;
        const dirX = mob.x - cx;
        const dirZ = mob.z - cz;
        multi.sendMobDamage(mob.id, damage, dirX * 2, dirZ * 2);
        useMobStore.getState().damageMob(mob.id, damage, dirX, dirZ);
        spawnDamagePopup(damage, mob.x, mob.y + 1.1, mob.z, false);
      }
    }

    // 8. カメラシェイク
    const shakeDist = playerPos.distanceTo(new THREE.Vector3(cx, cy, cz));
    if (shakeDist < 30) {
      const shakeIntensity = Math.min(1, (1 - shakeDist / 30) * 1.2);
      usePlayerStore.setState({ cameraShake: Math.max(usePlayerStore.getState().cameraShake, shakeIntensity) });
    }

    // 9. リスポーンタイマー開始（ローカル管理のみ）
    if (!isRemote) {
      respawnTimers.current[type] = VEHICLE_EXPLOSION.RESPAWN_DELAY;

      // 10. 他プレイヤーに破壊を通知
      useMultiplayerStore.getState().sendVehicleDestroy(type, [cx, cy, cz]);
    }
  }, [camera]);

  // リモートプレイヤーからの破壊・リスポーンイベントを受信
  useEffect(() => {
    const unsubDestroy = onRemoteVehicleDestroy((data) => {
      const vehicleStore = useVehicleStore.getState();
      const vehicle = vehicleStore[data.type];
      // まだローカルで破壊されていなければ破壊処理を実行
      if (vehicle.spawned && !vehicle.destroyed) {
        vehicleStore.destroyVehicle(data.type);
      }
      handleVehicleExplosion(data.type, true);
    });

    const unsubRespawn = onRemoteVehicleRespawn((data) => {
      const vehicleStore = useVehicleStore.getState();
      const vehicle = vehicleStore[data.type];
      if (vehicle.destroyed) {
        vehicleStore.respawnVehicle(data.type);
      }
    });

    return () => {
      unsubDestroy();
      unsubRespawn();
    };
  }, [handleVehicleExplosion]);

  useFrame((_, delta) => {
    const vehicleStore = useVehicleStore.getState();
    const dt = Math.min(delta, 0.05);

    // === 新規破壊の検知（バグ修正: どの武器から damageVehicle が呼ばれても爆発を発火） ===
    for (const type of ALL_VEHICLE_TYPES) {
      const vehicle = vehicleStore[type];
      const wasDestroyed = prevDestroyed.current[type];
      const isNowDestroyed = vehicle.destroyed;

      if (!wasDestroyed && isNowDestroyed) {
        // このフレームで新たに破壊された → 爆発を発火
        handleVehicleExplosion(type, false);
      }

      prevDestroyed.current[type] = isNowDestroyed;
    }

    // === 乗り物同士の衝突判定 ===
    for (let i = 0; i < ALL_VEHICLE_TYPES.length; i++) {
      for (let j = i + 1; j < ALL_VEHICLE_TYPES.length; j++) {
        const typeA = ALL_VEHICLE_TYPES[i];
        const typeB = ALL_VEHICLE_TYPES[j];
        const vehicleA = vehicleStore[typeA];
        const vehicleB = vehicleStore[typeB];

        // 両方スポーン済み・未破壊・少なくとも片方が動いている
        if (!vehicleA.spawned || !vehicleB.spawned) continue;
        if (vehicleA.destroyed || vehicleB.destroyed) continue;
        if (Math.abs(vehicleA.speed) < MIN_COLLISION_SPEED && Math.abs(vehicleB.speed) < MIN_COLLISION_SPEED) continue;

        const hitboxA = VEHICLE_HITBOX[typeA];
        const hitboxB = VEHICLE_HITBOX[typeB];

        // AABB衝突判定
        const dx = Math.abs(vehicleA.x - vehicleB.x);
        const dy = Math.abs(vehicleA.y - vehicleB.y);
        const dz = Math.abs(vehicleA.z - vehicleB.z);

        if (dx < hitboxA.rx + hitboxB.rx &&
            dy < hitboxA.ry + hitboxB.ry &&
            dz < hitboxA.rz + hitboxB.rz) {

          const collisionKey = `${typeA}_${typeB}`;
          const now = performance.now() / 1000;
          const lastTime = lastCollisionTime.current[collisionKey] || 0;
          if (now - lastTime < COLLISION_COOLDOWN) continue;
          lastCollisionTime.current[collisionKey] = now;

          // 衝突速度によるダメージ
          const relativeSpeed = Math.max(Math.abs(vehicleA.speed), Math.abs(vehicleB.speed));
          const damage = Math.ceil(relativeSpeed * VEHICLE_EXPLOSION.COLLISION_DAMAGE_MULTIPLIER);

          if (damage > 0) {
            // damageVehicle の結果は prevDestroyed の差分で検知するため、ここでは呼ぶだけ
            vehicleStore.damageVehicle(typeA, damage);
            vehicleStore.damageVehicle(typeB, damage);

            // 衝突エフェクト
            const hitX = (vehicleA.x + vehicleB.x) / 2;
            const hitY = (vehicleA.y + vehicleB.y) / 2 + 1;
            const hitZ = (vehicleA.z + vehicleB.z) / 2;
            spawnHitImpactEffect(hitX, hitY, hitZ, 0, 1, 0, true);
          }
        }
      }
    }

    // === リスポーンタイマー ===
    for (const type of ALL_VEHICLE_TYPES) {
      const timer = respawnTimers.current[type];
      if (timer > 0) {
        respawnTimers.current[type] = timer - dt;
        if (respawnTimers.current[type] <= 0) {
          respawnTimers.current[type] = 0;
          vehicleStore.respawnVehicle(type);

          // リスポーンを他プレイヤーに通知
          useMultiplayerStore.getState().sendVehicleRespawn(type);
        }
      }
    }
  });

  return null;
}
