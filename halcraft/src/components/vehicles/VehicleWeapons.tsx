// 戦車・飛行機の武器制御
// 左クリック長押し = ガトリング、右クリック = 戦車主砲ロケット

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  GUN_CONSTANTS,
  TANK_CONSTANTS,
  useVehicleStore,
  type VehicleType,
} from '../../stores/useVehicleStore';
import {
  onRemoteVehicleGunFire,
  useMultiplayerStore,
} from '../../stores/useMultiplayerStore';
import { useWorldStore } from '../../stores/useWorldStore';
import { useMobStore } from '../../stores/useMobStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { isDesktopGameplayInputActive } from '../../utils/gameCanvas';
import { consumeVehicleRocket, mobileActions } from '../../utils/touchInput';
import { rayMarchProjectile, type RemotePlayerTarget } from '../../utils/projectilePhysics';
import { spawnBlockBreakEffect, spawnDamagePopup, spawnHitImpactEffect } from '../../utils/effectTriggers';
import {
  playBulletImpactSound,
  playMachineGunSound,
  playRocketExplosionSound,
  playRocketLaunchSound,
} from '../../utils/sounds';
import { BLOCK_DEFS, BLOCK_IDS, type BlockId } from '../../types/blocks';
import { TANK_TURRET_PIVOT } from './vehicleModelConfig';
import { checkProjectileHitVehicle } from './VehicleCombat';

const BULLET_SPEED = 130;
const BULLET_MAX_AGE = 0.95;
const BULLET_GRAVITY = 2.2;
const BULLET_MIN_AIM_DISTANCE = 1.2;
const MOB_HIT_RADIUS = 1.2;
const PLAYER_HIT_RADIUS = 0.5;
const PLAYER_HIT_HEIGHT = 1.7;

const ROCKET_SPEED = 30;
const ROCKET_MAX_AGE = 4.2;
const ROCKET_GRAVITY = 9.5;
const ROCKET_HIT_RADIUS = 0.9;
const EXPLOSION_RADIUS = 7.5;
const EXPLOSION_DAMAGE = 22;
const EXPLOSION_MIN_DAMAGE = 3;
const EXPLOSION_BLOCK_RADIUS = 2.8;
const EXPLOSION_MAX_DESTROY_BLOCKS = 80;
const EXPLOSION_SURFACE_OFFSET = 0.36;
const ROCKET_AIM_DISTANCE = 80;
const ROCKET_MIN_AIM_DISTANCE = 1.5;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const TANK_CANNON_MUZZLE_LOCAL = new THREE.Vector3(0.95, 2.1, -3.25);
const TANK_GATLING_MUZZLE_LOCAL = new THREE.Vector3(1.18, 1.35, -2.35);
const AIRPLANE_GATLING_MUZZLE_LOCAL = new THREE.Vector3(0, 1.2, -7.05);

interface BulletProjectile {
  id: number;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  createdAt: number;
  isRemote: boolean;
  type: VehicleType;
}

interface CannonRocket {
  id: number;
  syncId: string;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
}

interface ExplosionFlash {
  id: number;
  pos: THREE.Vector3;
  life: number;
}

let nextProjectileId = 0;

interface ExplosionBlockCandidate {
  x: number;
  y: number;
  z: number;
  blockId: BlockId;
  distSq: number;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

function calculateExplosionDamage(distance: number): number {
  if (distance >= EXPLOSION_RADIUS) return 0;
  const falloff = 1 - distance / EXPLOSION_RADIUS;
  const eased = falloff * falloff;
  return Math.max(1, Math.round(EXPLOSION_MIN_DAMAGE + (EXPLOSION_DAMAGE - EXPLOSION_MIN_DAMAGE) * eased));
}

function getVisibleExplosionPosition(hitPos: THREE.Vector3, normal: THREE.Vector3): THREE.Vector3 {
  if (normal.lengthSq() < 0.0001) return hitPos.clone();
  return hitPos.clone().addScaledVector(normal.clone().normalize(), EXPLOSION_SURFACE_OFFSET);
}

function getTankTurretWorldPoint(localPoint: THREE.Vector3): THREE.Vector3 {
  const tank = useVehicleStore.getState().tank;
  const pivot = new THREE.Vector3(TANK_TURRET_PIVOT[0], TANK_TURRET_PIVOT[1], TANK_TURRET_PIVOT[2]);
  return localPoint.clone()
    .sub(pivot)
    .applyAxisAngle(Y_AXIS, tank.turretYaw)
    .add(pivot)
    .applyAxisAngle(Y_AXIS, tank.rotationY)
    .add(
      new THREE.Vector3(tank.x, tank.y, tank.z),
    );
}

function getAirplaneWorldPoint(localPoint: THREE.Vector3): THREE.Vector3 {
  const airplane = useVehicleStore.getState().airplane;
  return localPoint.clone().applyEuler(
    new THREE.Euler(airplane.pitch, airplane.rotationY, airplane.roll),
  ).add(
    new THREE.Vector3(airplane.x, airplane.y, airplane.z),
  );
}

function getCameraAimDirection(camera: THREE.Camera, startPos: THREE.Vector3, range: number): THREE.Vector3 {
  const aimDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const multi = useMultiplayerStore.getState();
  const hit = rayMarchProjectile(
    camera.position.clone(),
    aimDir.clone(),
    range,
    useWorldStore.getState().getBlock,
    useMobStore.getState().mobs,
    MOB_HIT_RADIUS,
    {
      remotePlayers: multi.remotePlayers as Map<string, RemotePlayerTarget>,
      playerHitRadius: PLAYER_HIT_RADIUS,
      playerHitHeight: PLAYER_HIT_HEIGHT,
    },
  );
  const point = hit.type === 'none'
    ? camera.position.clone().addScaledVector(aimDir, range)
    : hit.hitPos;
  const dir = point.sub(startPos);
  if (
    dir.lengthSq() < BULLET_MIN_AIM_DISTANCE * BULLET_MIN_AIM_DISTANCE
    || dir.normalize().dot(aimDir) < 0.2
  ) {
    return aimDir;
  }
  return dir.clone();
}

function getTankBodyWorldPoint(localPoint: THREE.Vector3): THREE.Vector3 {
  const tank = useVehicleStore.getState().tank;
  return localPoint.clone().applyAxisAngle(Y_AXIS, tank.rotationY).add(
    new THREE.Vector3(tank.x, tank.y, tank.z),
  );
}

function getVehicleMuzzle(type: VehicleType, mount: 'center' | 'left' | 'right'): THREE.Vector3 {
  if (type === 'tank') {
    const lateral = mount === 'left' ? -0.28 : mount === 'right' ? 0.28 : 0;
    return getTankBodyWorldPoint(TANK_GATLING_MUZZLE_LOCAL.clone().add(new THREE.Vector3(lateral, 0, 0)));
  }

  const lateral = mount === 'left' ? -1.85 : mount === 'right' ? 1.85 : 0;
  return getAirplaneWorldPoint(AIRPLANE_GATLING_MUZZLE_LOCAL.clone().add(new THREE.Vector3(lateral, 0, 0)));
}

function getTankCannonMuzzle(): THREE.Vector3 {
  return getTankTurretWorldPoint(TANK_CANNON_MUZZLE_LOCAL);
}

export function VehicleWeapons() {
  const { camera } = useThree();
  const [bullets, setBullets] = useState<BulletProjectile[]>([]);
  const [rockets, setRockets] = useState<CannonRocket[]>([]);
  const [explosions, setExplosions] = useState<ExplosionFlash[]>([]);
  const isMouseDown = useRef(false);
  const lastGunFire = useRef(0);
  const lastRocketFire = useRef(0);
  const shootDir = useRef(new THREE.Vector3());
  const cameraAimDir = useRef(new THREE.Vector3());
  const aimPoint = useRef(new THREE.Vector3());

  const fireGatling = useCallback((type: VehicleType, mount: 'center' | 'left' | 'right' = 'center', isRemote = false, remoteDir?: THREE.Vector3, remotePos?: THREE.Vector3) => {
    const now = performance.now() / 1000;
    if (!isRemote && now - lastGunFire.current < GUN_CONSTANTS.FIRE_COOLDOWN) return;
    if (!isRemote) lastGunFire.current = now;

    const startPos = remotePos ?? getVehicleMuzzle(type, mount);
    const dir = remoteDir ?? getCameraAimDirection(camera, startPos, GUN_CONSTANTS.RANGE);

    if (!isRemote) {
      const spread = 0.012;
      dir.x += (Math.random() - 0.5) * spread;
      dir.y += (Math.random() - 0.5) * spread;
      dir.z += (Math.random() - 0.5) * spread;
      dir.normalize();
    }

    setBullets((prev) => [...prev, {
      id: nextProjectileId++,
      pos: startPos.clone(),
      prev: startPos.clone(),
      vel: dir.clone().multiplyScalar(BULLET_SPEED),
      createdAt: now,
      isRemote,
      type,
    }]);

    if (!isRemote) {
      playMachineGunSound(startPos.distanceTo(camera.position));
      useMultiplayerStore.getState().sendVehicleGunFire(
        type,
        [startPos.x, startPos.y, startPos.z],
        [dir.x, dir.y, dir.z],
        mount,
      );
    }
  }, [camera]);

  const destroyExplosionBlocks = useCallback((center: THREE.Vector3) => {
    const world = useWorldStore.getState();
    const multi = useMultiplayerStore.getState();
    const radiusSq = EXPLOSION_BLOCK_RADIUS * EXPLOSION_BLOCK_RADIUS;
    const minX = Math.floor(center.x - EXPLOSION_BLOCK_RADIUS);
    const maxX = Math.floor(center.x + EXPLOSION_BLOCK_RADIUS);
    const minY = Math.floor(center.y - EXPLOSION_BLOCK_RADIUS);
    const maxY = Math.floor(center.y + EXPLOSION_BLOCK_RADIUS);
    const minZ = Math.floor(center.z - EXPLOSION_BLOCK_RADIUS);
    const maxZ = Math.floor(center.z + EXPLOSION_BLOCK_RADIUS);
    const candidates: ExplosionBlockCandidate[] = [];

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const dx = x + 0.5 - center.x;
          const dy = y + 0.5 - center.y;
          const dz = z + 0.5 - center.z;
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

    for (const block of candidates.slice(0, EXPLOSION_MAX_DESTROY_BLOCKS)) {
      if (!world.breakBlock(block.x, block.y, block.z)) continue;
      spawnBlockBreakEffect(block.blockId, block.x, block.y, block.z);
      multi.sendBlockBreak(block.x, block.y, block.z);
    }
  }, []);

  const applyRocketExplosionDamage = useCallback((center: THREE.Vector3) => {
    const mobStore = useMobStore.getState();
    const multi = useMultiplayerStore.getState();
    const playerStore = usePlayerStore.getState();
    const playerCenter = new THREE.Vector3(camera.position.x, camera.position.y - 0.85, camera.position.z);
    const selfDamage = calculateExplosionDamage(playerCenter.distanceTo(center));

    if (selfDamage > 0) {
      playerStore.takeDamage(selfDamage, playerCenter.x - center.x, playerCenter.z - center.z);
    }

    for (const mob of mobStore.mobs) {
      if (mob.hp <= 0) continue;
      const mobCenter = new THREE.Vector3(mob.x, mob.y + 0.9, mob.z);
      const damage = calculateExplosionDamage(mobCenter.distanceTo(center));
      if (damage <= 0) continue;

      const dirX = mob.x - center.x;
      const dirZ = mob.z - center.z;
      multi.sendMobDamage(mob.id, damage, dirX * 1.8, dirZ * 1.8);
      mobStore.damageMob(mob.id, damage, dirX, dirZ);
      spawnDamagePopup(damage, mob.x, mob.y + 1.1, mob.z, damage >= EXPLOSION_DAMAGE * 0.75);
      spawnHitImpactEffect(mob.x, mob.y + 0.9, mob.z, dirX, 0.35, dirZ, damage >= EXPLOSION_DAMAGE * 0.7);
    }

    for (const [, player] of multi.remotePlayers) {
      if (player.isDead) continue;
      const playerBody = new THREE.Vector3(
        player.position[0],
        player.position[1] + PLAYER_HIT_HEIGHT * 0.5,
        player.position[2],
      );
      const damage = calculateExplosionDamage(playerBody.distanceTo(center));
      if (damage <= 0) continue;

      const dirX = player.position[0] - center.x;
      const dirZ = player.position[2] - center.z;
      multi.sendPlayerAttack(player.id, damage, dirX * 1.8, dirZ * 1.8);
      spawnDamagePopup(damage, player.position[0], player.position[1] + 1.1, player.position[2], false);
      spawnHitImpactEffect(player.position[0], player.position[1] + 0.9, player.position[2], dirX, 0.35, dirZ, false);
    }
  }, [camera]);

  const fireTankRocket = useCallback(() => {
    const now = performance.now() / 1000;
    if (now - lastRocketFire.current < TANK_CONSTANTS.CANNON_COOLDOWN) return;
    lastRocketFire.current = now;

    const startPos = getTankCannonMuzzle();
    cameraAimDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const currentMobs = useMobStore.getState().mobs;
    const multi = useMultiplayerStore.getState();
    const aimHit = rayMarchProjectile(
      camera.position.clone(),
      cameraAimDir.current.clone(),
      ROCKET_AIM_DISTANCE,
      useWorldStore.getState().getBlock,
      currentMobs,
      ROCKET_HIT_RADIUS,
      {
        remotePlayers: multi.remotePlayers as Map<string, RemotePlayerTarget>,
        playerHitRadius: PLAYER_HIT_RADIUS,
        playerHitHeight: PLAYER_HIT_HEIGHT,
      },
    );

    if (aimHit.type !== 'none') {
      aimPoint.current.copy(aimHit.hitPos);
    } else {
      aimPoint.current.copy(camera.position).addScaledVector(cameraAimDir.current, ROCKET_AIM_DISTANCE);
    }

    shootDir.current.copy(aimPoint.current).sub(startPos);
    if (
      shootDir.current.lengthSq() < ROCKET_MIN_AIM_DISTANCE * ROCKET_MIN_AIM_DISTANCE
      || shootDir.current.normalize().dot(cameraAimDir.current) < 0.2
    ) {
      shootDir.current.copy(cameraAimDir.current);
    }

    const vel = shootDir.current.clone().multiplyScalar(ROCKET_SPEED);
    const syncId = `tank_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    setRockets((prev) => [...prev, {
      id: nextProjectileId++,
      syncId,
      pos: startPos.clone(),
      prev: startPos.clone(),
      vel,
      age: 0,
    }]);

    playRocketLaunchSound(startPos.distanceTo(camera.position));
    useMultiplayerStore.getState().sendRocketFire(
      syncId,
      [startPos.x, startPos.y, startPos.z],
      [vel.x, vel.y, vel.z],
    );
  }, [camera]);

  const explodeRocket = useCallback((rocket: CannonRocket, pos: THREE.Vector3) => {
    destroyExplosionBlocks(pos);
    applyRocketExplosionDamage(pos);
    spawnHitImpactEffect(pos.x, pos.y, pos.z, 0, 1, 0, true);
    playRocketExplosionSound(pos.distanceTo(camera.position));
    useMultiplayerStore.getState().sendRocketExplode(rocket.syncId, [pos.x, pos.y, pos.z]);
    setExplosions((prev) => [...prev, { id: nextProjectileId++, pos: pos.clone(), life: 0.45 }]);
  }, [applyRocketExplosionDamage, camera, destroyExplosionBlocks]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const active = useVehicleStore.getState().getActiveVehicle();
      if (e.button === 0) {
        isMouseDown.current = true;
        return;
      }
      if (e.button === 2 && active === 'tank' && !isEditableTarget(e.target)) {
        e.preventDefault();
        fireTankRocket();
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) isMouseDown.current = false;
    };
    const onContextMenu = (e: MouseEvent) => {
      const active = useVehicleStore.getState().getActiveVehicle();
      if (active === 'tank') {
        e.preventDefault();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [fireTankRocket]);

  useEffect(() => {
    return onRemoteVehicleGunFire((data) => {
      const pos = new THREE.Vector3(data.pos[0], data.pos[1], data.pos[2]);
      const dir = new THREE.Vector3(data.dir[0], data.dir[1], data.dir[2]).normalize();
      fireGatling(data.type, data.mount, true, dir, pos);
    });
  }, [fireGatling]);

  useFrame((_, delta) => {
    const active = useVehicleStore.getState().getActiveVehicle();
    const canUsePointer = isDesktopGameplayInputActive();

    if ((active === 'tank' || active === 'airplane') && ((isMouseDown.current && canUsePointer) || mobileActions.vehicleGun)) {
      const mount = active === 'airplane'
        ? (Math.random() < 0.5 ? 'left' : 'right')
        : 'center';
      fireGatling(active, mount);
    }

    if (active === 'tank' && consumeVehicleRocket()) {
      fireTankRocket();
    }

    const now = performance.now() / 1000;
    const getBlock = useWorldStore.getState().getBlock;
    const mobs = useMobStore.getState().mobs;
    const remotePlayers = useMultiplayerStore.getState().remotePlayers as Map<string, RemotePlayerTarget>;

    setBullets((prev) => {
      const alive: BulletProjectile[] = [];
      for (const bullet of prev) {
        if (now - bullet.createdAt > BULLET_MAX_AGE) continue;
        bullet.prev.copy(bullet.pos);
        bullet.vel.y -= BULLET_GRAVITY * delta;
        const moveDir = bullet.vel.clone().normalize();
        const moveDist = bullet.vel.length() * delta;
        const hit = rayMarchProjectile(
          bullet.pos,
          moveDir,
          moveDist,
          getBlock,
          bullet.isRemote ? [] : mobs,
          MOB_HIT_RADIUS,
          bullet.isRemote ? undefined : { remotePlayers, playerHitRadius: PLAYER_HIT_RADIUS, playerHitHeight: PLAYER_HIT_HEIGHT },
        );

        if (hit.type === 'block') {
          spawnHitImpactEffect(hit.hitPos.x, hit.hitPos.y, hit.hitPos.z, hit.normal.x, hit.normal.y, hit.normal.z, false);
          playBulletImpactSound(hit.hitPos.distanceTo(camera.position), 'block');
          continue;
        }

        if (hit.type === 'mob' && hit.targetId) {
          const mob = mobs.find((m) => m.id === hit.targetId);
          if (mob) {
            useMultiplayerStore.getState().sendMobDamage(hit.targetId, GUN_CONSTANTS.DAMAGE, moveDir.x * 3, moveDir.z * 3);
            useMobStore.getState().damageMob(hit.targetId, GUN_CONSTANTS.DAMAGE, moveDir.x, moveDir.z);
            spawnDamagePopup(GUN_CONSTANTS.DAMAGE, mob.x, mob.y + 1.0, mob.z, false);
          }
          spawnHitImpactEffect(hit.hitPos.x, hit.hitPos.y, hit.hitPos.z, hit.normal.x, hit.normal.y, hit.normal.z, false);
          playBulletImpactSound(hit.hitPos.distanceTo(camera.position), 'mob');
          continue;
        }

        if (hit.type === 'player' && hit.targetId) {
          useMultiplayerStore.getState().sendPlayerAttack(hit.targetId, GUN_CONSTANTS.DAMAGE, moveDir.x * 3, moveDir.z * 3);
          spawnHitImpactEffect(hit.hitPos.x, hit.hitPos.y, hit.hitPos.z, hit.normal.x, hit.normal.y, hit.normal.z, false);
          continue;
        }

        // 乗り物への弾丸ダメージ判定
        const activeType = useVehicleStore.getState().getActiveVehicle();
        if (!bullet.isRemote) {
          const vehicleHit = checkProjectileHitVehicle(
            bullet.pos.x, bullet.pos.y, bullet.pos.z,
            activeType ?? undefined,
          );
          if (vehicleHit) {
            useVehicleStore.getState().damageVehicle(vehicleHit.type, GUN_CONSTANTS.DAMAGE);
            spawnHitImpactEffect(bullet.pos.x, bullet.pos.y, bullet.pos.z, moveDir.x, moveDir.y, moveDir.z, false);
            spawnDamagePopup(GUN_CONSTANTS.DAMAGE, bullet.pos.x, bullet.pos.y + 0.5, bullet.pos.z, false);
            playBulletImpactSound(bullet.pos.distanceTo(camera.position), 'mob');
            continue;
          }
        }

        alive.push(bullet);
      }
      return alive;
    });

    setRockets((prev) => {
      const alive: CannonRocket[] = [];
      for (const rocket of prev) {
        rocket.age += delta;
        if (rocket.age > ROCKET_MAX_AGE) {
          explodeRocket(rocket, rocket.pos);
          continue;
        }

        rocket.prev.copy(rocket.pos);
        rocket.vel.y -= ROCKET_GRAVITY * delta;
        const moveDir = rocket.vel.clone().normalize();
        const moveDist = rocket.vel.length() * delta;
        const hit = rayMarchProjectile(
          rocket.pos,
          moveDir,
          moveDist,
          getBlock,
          mobs,
          ROCKET_HIT_RADIUS,
          { remotePlayers, playerHitRadius: PLAYER_HIT_RADIUS, playerHitHeight: PLAYER_HIT_HEIGHT },
        );

        // ロケットの乗り物ヒット判定
        const activeType = useVehicleStore.getState().getActiveVehicle();
        const vehicleHit = checkProjectileHitVehicle(
          rocket.pos.x, rocket.pos.y, rocket.pos.z,
          activeType ?? undefined,
        );
        if (vehicleHit) {
          // 乗り物にロケット直撃
          useVehicleStore.getState().damageVehicle(vehicleHit.type, 25);
          explodeRocket(rocket, rocket.pos);
          continue;
        }

        if (hit.type !== 'none') {
          const explosionPos = hit.type === 'block'
            ? getVisibleExplosionPosition(hit.hitPos, hit.normal)
            : hit.hitPos;
          explodeRocket(rocket, explosionPos);
          continue;
        }
        alive.push(rocket);
      }
      return alive;
    });

    setExplosions((prev) => prev
      .map((explosion) => ({ ...explosion, life: explosion.life - delta }))
      .filter((explosion) => explosion.life > 0));
  });

  return (
    <group>
      {bullets.map((bullet) => (
        <Tracer key={bullet.id} start={bullet.prev} end={bullet.pos} color={bullet.type === 'tank' ? '#fff36a' : '#8ff6ff'} radius={0.025} />
      ))}
      {rockets.map((rocket) => (
        <group key={rocket.id}>
          <Tracer start={rocket.prev} end={rocket.pos} color="#ff9a40" radius={0.08} />
          <mesh position={rocket.pos}>
            <sphereGeometry args={[0.18, 12, 8]} />
            <meshBasicMaterial color="#ffb14a" />
          </mesh>
          <pointLight position={rocket.pos} color="#ff9a40" intensity={2.4} distance={10} />
        </group>
      ))}
      {explosions.map((explosion) => (
        <mesh key={explosion.id} position={explosion.pos}>
          <sphereGeometry args={[EXPLOSION_RADIUS * (1 - explosion.life / 0.45), 18, 12]} />
          <meshBasicMaterial color="#ff7b22" transparent opacity={Math.max(0, explosion.life / 0.45) * 0.35} />
        </mesh>
      ))}
    </group>
  );
}

function Tracer({
  start,
  end,
  color,
  radius,
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  color: string;
  radius: number;
}) {
  const delta = end.clone().sub(start);
  const length = Math.max(0.01, delta.length());
  const midpoint = start.clone().addScaledVector(delta, 0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );

  return (
    <mesh position={midpoint} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} />
    </mesh>
  );
}
