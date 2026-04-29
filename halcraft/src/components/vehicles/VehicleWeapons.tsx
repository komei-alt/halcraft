// 戦車・飛行機の武器制御
// 左クリック長押し = ガトリング、R = 戦車主砲ロケット

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
import { isDesktopGameplayInputActive } from '../../utils/gameCanvas';
import { consumeVehicleRocket, mobileActions } from '../../utils/touchInput';
import { rayMarchProjectile, type RemotePlayerTarget } from '../../utils/projectilePhysics';
import { spawnDamagePopup, spawnHitImpactEffect } from '../../utils/effectTriggers';
import {
  playBulletImpactSound,
  playMachineGunSound,
  playRocketExplosionSound,
  playRocketLaunchSound,
} from '../../utils/sounds';

const BULLET_SPEED = 130;
const BULLET_MAX_AGE = 0.95;
const BULLET_GRAVITY = 2.2;
const MOB_HIT_RADIUS = 1.2;
const PLAYER_HIT_RADIUS = 0.5;
const PLAYER_HIT_HEIGHT = 1.7;

const ROCKET_SPEED = 34;
const ROCKET_MAX_AGE = 4;
const ROCKET_HIT_RADIUS = 0.9;
const EXPLOSION_RADIUS = 7.5;
const EXPLOSION_DAMAGE = 22;

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

function getVehicleMuzzle(type: VehicleType, mount: 'center' | 'left' | 'right'): THREE.Vector3 {
  const vehicles = useVehicleStore.getState();
  if (type === 'tank') {
    const tank = vehicles.tank;
    const yaw = tank.rotationY + tank.turretYaw;
    const lateral = mount === 'left' ? -0.42 : mount === 'right' ? 0.42 : 0.62;
    return new THREE.Vector3(lateral, 1.92, -2.1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(
      new THREE.Vector3(tank.x, tank.y, tank.z),
    );
  }

  const airplane = vehicles.airplane;
  const lateral = mount === 'left' ? -1.25 : mount === 'right' ? 1.25 : 0;
  return new THREE.Vector3(lateral, 1.05, -4.75).applyAxisAngle(new THREE.Vector3(0, 1, 0), airplane.rotationY).add(
    new THREE.Vector3(airplane.x, airplane.y, airplane.z),
  );
}

function getTankCannonMuzzle(): THREE.Vector3 {
  const tank = useVehicleStore.getState().tank;
  const yaw = tank.rotationY + tank.turretYaw;
  return new THREE.Vector3(0, 2.0, -3.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(
    new THREE.Vector3(tank.x, tank.y, tank.z),
  );
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

  const fireGatling = useCallback((type: VehicleType, mount: 'center' | 'left' | 'right' = 'center', isRemote = false, remoteDir?: THREE.Vector3, remotePos?: THREE.Vector3) => {
    const now = performance.now() / 1000;
    if (!isRemote && now - lastGunFire.current < GUN_CONSTANTS.FIRE_COOLDOWN) return;
    if (!isRemote) lastGunFire.current = now;

    const startPos = remotePos ?? getVehicleMuzzle(type, mount);
    const dir = remoteDir ?? shootDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize().clone();

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

  const fireTankRocket = useCallback(() => {
    const now = performance.now() / 1000;
    if (now - lastRocketFire.current < TANK_CONSTANTS.CANNON_COOLDOWN) return;
    lastRocketFire.current = now;

    const startPos = getTankCannonMuzzle();
    const dir = shootDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize().clone();
    const vel = dir.multiplyScalar(ROCKET_SPEED);
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
    const mobs = useMobStore.getState().mobs;
    const multiplayer = useMultiplayerStore.getState();

    for (const mob of mobs) {
      if (mob.hp <= 0) continue;
      const dist = pos.distanceTo(new THREE.Vector3(mob.x, mob.y + 0.8, mob.z));
      if (dist > EXPLOSION_RADIUS) continue;
      const damage = Math.max(3, Math.round(EXPLOSION_DAMAGE * (1 - dist / EXPLOSION_RADIUS)));
      const knockback = new THREE.Vector3(mob.x - pos.x, 0, mob.z - pos.z).normalize();
      multiplayer.sendMobDamage(mob.id, damage, knockback.x * 4, knockback.z * 4);
      useMobStore.getState().damageMob(mob.id, damage, knockback.x, knockback.z);
      spawnDamagePopup(damage, mob.x, mob.y + 1.1, mob.z, damage >= 16);
    }

    spawnHitImpactEffect(pos.x, pos.y, pos.z, 0, 1, 0, true);
    playRocketExplosionSound(pos.distanceTo(camera.position));
    useMultiplayerStore.getState().sendRocketExplode(rocket.syncId, [pos.x, pos.y, pos.z]);
    setExplosions((prev) => [...prev, { id: nextProjectileId++, pos: pos.clone(), life: 0.45 }]);
  }, [camera]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) isMouseDown.current = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) isMouseDown.current = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const active = useVehicleStore.getState().getActiveVehicle();
      if (e.code === 'KeyR' && active === 'tank' && isDesktopGameplayInputActive()) {
        e.preventDefault();
        fireTankRocket();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
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
        rocket.vel.y -= 8.5 * delta;
        const moveDir = rocket.vel.clone().normalize();
        const moveDist = rocket.vel.length() * delta;
        const hit = rayMarchProjectile(rocket.pos, moveDir, moveDist, getBlock, mobs, ROCKET_HIT_RADIUS);
        if (hit.type !== 'none') {
          explodeRocket(rocket, hit.hitPos);
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
