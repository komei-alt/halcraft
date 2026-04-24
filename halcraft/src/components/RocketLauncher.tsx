// ロケットランチャーコンポーネント
// 肩載せのランチャーモデル、専用弾道、爆発VFX、範囲ダメージをまとめて担当

import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useWorldStore } from '../stores/useWorldStore';
import { useMobStore } from '../stores/useMobStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useMultiplayerStore } from '../stores/useMultiplayerStore';
import { useVehicleStore } from '../stores/useVehicleStore';
import { useGameStore } from '../stores/useGameStore';
import { isTouchDevice } from '../utils/device';
import { consumeFireRocket } from '../utils/touchInput';
import { getGameCanvas, isDesktopGameplayInputActive } from '../utils/gameCanvas';
import { rayMarchProjectile, type RemotePlayerTarget } from '../utils/projectilePhysics';
import { spawnBlockBreakEffect, spawnDamagePopup, spawnHitImpactEffect } from '../utils/effectTriggers';
import { playRocketExplosionSound, playRocketLaunchSound } from '../utils/sounds';
import { BLOCK_DEFS, BLOCK_IDS, type BlockId } from '../types/blocks';

const FIRE_KEY = 'KeyR';
const FIRE_MOUSE_BUTTON = 0;

/** 弾道定数 */
const ROCKET_SPEED = 30;
const ROCKET_GRAVITY = 9.5;
const ROCKET_MAX_AGE = 4.2;
const ROCKET_HIT_RADIUS = 0.9;
const PLAYER_HIT_RADIUS = 0.5;
const PLAYER_HIT_HEIGHT = 1.7;

/** 爆発定数 */
const EXPLOSION_RADIUS = 7.5;
const EXPLOSION_DAMAGE = 22;
const EXPLOSION_MIN_DAMAGE = 3;
const EXPLOSION_LIFETIME = 1.45;
const EXPLOSION_BLOCK_RADIUS = 2.8;
const EXPLOSION_MAX_DESTROY_BLOCKS = 80;
const SPARK_COUNT = 20;
const SMOKE_COUNT = 12;

/** 照準補正 */
const ROCKET_AIM_DISTANCE = 80;
const ROCKET_MIN_AIM_DISTANCE = 1.5;

/** 残煙・トレイル */
const TRAIL_INTERVAL = 0.03;
const TRAIL_PUFF_LIFETIME = 0.85;
const MAX_TRAIL_PUFFS = 80;

/** 武器のローカル配置 */
const SHOULDER_OFFSET = new THREE.Vector3(0.44, -0.34, -0.62);
const MUZZLE_LOCAL_OFFSET = new THREE.Vector3(0.18, 0.02, -1.56);
const BACKBLAST_LOCAL_OFFSET = new THREE.Vector3(0.18, 0.02, 0.16);
const MODEL_FORWARD = new THREE.Vector3(0, 0, -1);

interface RocketProjectile {
  id: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
  trailTimer: number;
  trailPoints: THREE.Vector3[];
  orientation: THREE.Quaternion;
}

interface TrailPuff {
  id: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

interface ExplosionParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

interface ExplosionEffect {
  id: number;
  pos: THREE.Vector3;
  life: number;
  maxLife: number;
  sparks: ExplosionParticle[];
  smoke: ExplosionParticle[];
}

interface ExplosionBlockCandidate {
  x: number;
  y: number;
  z: number;
  blockId: BlockId;
  distSq: number;
}

let nextRocketId = 0;
let nextTrailId = 0;
let nextExplosionId = 0;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function createRadialTexture(stops: Array<{ offset: number; color: string }>): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.needsUpdate = true;
    return fallback;
  }

  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  for (const stop of stops) {
    gradient.addColorStop(stop.offset, stop.color);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function calculateExplosionDamage(distance: number): number {
  if (distance >= EXPLOSION_RADIUS) return 0;
  const falloff = 1 - distance / EXPLOSION_RADIUS;
  const eased = falloff * falloff;
  return Math.max(1, Math.round(EXPLOSION_MIN_DAMAGE + (EXPLOSION_DAMAGE - EXPLOSION_MIN_DAMAGE) * eased));
}

function createExplosion(pos: THREE.Vector3): ExplosionEffect {
  const sparks: ExplosionParticle[] = [];
  const smoke: ExplosionParticle[] = [];

  for (let i = 0; i < SPARK_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.2) * Math.PI * 0.8;
    const speed = 6 + Math.random() * 10;
    const life = 0.35 + Math.random() * 0.35;

    sparks.push({
      pos: pos.clone(),
      vel: new THREE.Vector3(
        Math.cos(theta) * Math.cos(phi) * speed,
        Math.sin(phi) * speed + 2.5,
        Math.sin(theta) * Math.cos(phi) * speed,
      ),
      life,
      maxLife: life,
      size: 0.1 + Math.random() * 0.18,
    });
  }

  for (let i = 0; i < SMOKE_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const speed = 1.2 + Math.random() * 2.8;
    const life = 0.9 + Math.random() * 0.5;

    smoke.push({
      pos: pos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        Math.random() * 0.2,
        (Math.random() - 0.5) * 0.6,
      )),
      vel: new THREE.Vector3(
        Math.cos(theta) * speed * 0.35,
        1.5 + Math.random() * 1.8,
        Math.sin(theta) * speed * 0.35,
      ),
      life,
      maxLife: life,
      size: 0.9 + Math.random() * 0.9,
    });
  }

  return {
    id: nextExplosionId++,
    pos: pos.clone(),
    life: EXPLOSION_LIFETIME,
    maxLife: EXPLOSION_LIFETIME,
    sparks,
    smoke,
  };
}

function createTrailPuff(pos: THREE.Vector3, vel: THREE.Vector3): TrailPuff {
  const life = TRAIL_PUFF_LIFETIME * (0.8 + Math.random() * 0.35);
  return {
    id: nextTrailId++,
    pos: pos.clone().add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.08,
      (Math.random() - 0.5) * 0.08,
      (Math.random() - 0.5) * 0.08,
    )),
    vel: vel.clone().multiplyScalar(-0.025).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.4,
      0.35 + Math.random() * 0.45,
      (Math.random() - 0.5) * 0.4,
    )),
    life,
    maxLife: life,
    size: 0.34 + Math.random() * 0.28,
  };
}

export function RocketLauncher() {
  const { camera } = useThree();
  const phase = useGameStore((s) => s.phase);
  const isDead = usePlayerStore((s) => s.isDead);
  const fireRocket = usePlayerStore((s) => s.fireRocket);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const takeDamage = usePlayerStore((s) => s.takeDamage);
  const getBlock = useWorldStore((s) => s.getBlock);
  const helicopterBoarded = useVehicleStore((s) => s.helicopter.isBoarded);
  const mobs = useMobStore((s) => s.mobs);

  const isTouch = useRef(isTouchDevice());
  const fireRequested = useRef(false);
  const recoil = useRef(0);
  const muzzleFlashTimer = useRef(0);
  const backblastTimer = useRef(0);

  const weaponGroupRef = useRef<THREE.Group>(null);

  const launcherPos = useRef(new THREE.Vector3());
  const launcherQuat = useRef(new THREE.Quaternion());
  const offsetWorld = useRef(new THREE.Vector3());
  const shootDir = useRef(new THREE.Vector3());
  const moveDir = useRef(new THREE.Vector3());
  const muzzleWorld = useRef(new THREE.Vector3());
  const cameraAimDir = useRef(new THREE.Vector3());
  const aimPoint = useRef(new THREE.Vector3());
  const playerCenter = useRef(new THREE.Vector3());
  const localTiltQuat = useMemo(() => {
    const euler = new THREE.Euler(-0.16, -0.22, -0.1);
    return new THREE.Quaternion().setFromEuler(euler);
  }, []);

  const glowTexture = useMemo(() => createRadialTexture([
    { offset: 0, color: 'rgba(255,255,255,1)' },
    { offset: 0.28, color: 'rgba(255,210,120,0.95)' },
    { offset: 0.7, color: 'rgba(255,110,40,0.28)' },
    { offset: 1, color: 'rgba(255,110,40,0)' },
  ]), []);
  const smokeTexture = useMemo(() => createRadialTexture([
    { offset: 0, color: 'rgba(255,255,255,0.55)' },
    { offset: 0.3, color: 'rgba(220,220,220,0.42)' },
    { offset: 0.7, color: 'rgba(110,110,110,0.16)' },
    { offset: 1, color: 'rgba(0,0,0,0)' },
  ]), []);

  useEffect(() => () => {
    glowTexture.dispose();
    smokeTexture.dispose();
  }, [glowTexture, smokeTexture]);

  const [projectiles, setProjectiles] = useState<RocketProjectile[]>([]);
  const [trailPuffs, setTrailPuffs] = useState<TrailPuff[]>([]);
  const [explosions, setExplosions] = useState<ExplosionEffect[]>([]);

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

  const applyExplosionDamage = useCallback((center: THREE.Vector3) => {
    const mobStore = useMobStore.getState();
    const multi = useMultiplayerStore.getState();

    playerCenter.current.set(camera.position.x, camera.position.y - 0.85, camera.position.z);
    const selfDistance = playerCenter.current.distanceTo(center);
    const selfDamage = calculateExplosionDamage(selfDistance);
    if (selfDamage > 0) {
      takeDamage(
        selfDamage,
        playerCenter.current.x - center.x,
        playerCenter.current.z - center.z,
      );
    }

    for (const mob of mobStore.mobs) {
      const mobCenter = new THREE.Vector3(mob.x, mob.y + 0.9, mob.z);
      const distance = mobCenter.distanceTo(center);
      const damage = calculateExplosionDamage(distance);
      if (damage <= 0) continue;

      const dirX = mob.x - center.x;
      const dirZ = mob.z - center.z;
      multi.sendMobDamage(mob.id, damage, dirX * 1.8, dirZ * 1.8);
      mobStore.damageMob(mob.id, damage, dirX, dirZ);
      const impactDir = mobCenter.clone().sub(center);
      if (impactDir.lengthSq() < 0.001) {
        impactDir.set(0, 1, 0);
      } else {
        impactDir.normalize();
      }
      spawnHitImpactEffect(
        mob.x,
        mob.y + 0.9,
        mob.z,
        impactDir.x,
        Math.max(0.2, impactDir.y),
        impactDir.z,
        damage >= EXPLOSION_DAMAGE * 0.7,
      );
      spawnDamagePopup(damage, mob.x, mob.y + 1.1, mob.z, damage >= EXPLOSION_DAMAGE * 0.75);
    }

    for (const [, player] of multi.remotePlayers) {
      if (player.isDead) continue;

      const playerBody = new THREE.Vector3(
        player.position[0],
        player.position[1] + PLAYER_HIT_HEIGHT * 0.5,
        player.position[2],
      );
      const distance = playerBody.distanceTo(center);
      const damage = calculateExplosionDamage(distance);
      if (damage <= 0) continue;

      const dirX = player.position[0] - center.x;
      const dirZ = player.position[2] - center.z;
      multi.sendPlayerAttack(player.id, damage, dirX * 1.8, dirZ * 1.8);
      const impactDir = playerBody.clone().sub(center);
      if (impactDir.lengthSq() < 0.001) {
        impactDir.set(0, 1, 0);
      } else {
        impactDir.normalize();
      }
      spawnHitImpactEffect(
        player.position[0],
        player.position[1] + 0.9,
        player.position[2],
        impactDir.x,
        Math.max(0.2, impactDir.y),
        impactDir.z,
        false,
      );
      spawnDamagePopup(damage, player.position[0], player.position[1] + 1.1, player.position[2], false);
    }
  }, [camera, takeDamage]);

  const spawnExplosionAt = useCallback((pos: THREE.Vector3) => {
    destroyExplosionBlocks(pos);
    applyExplosionDamage(pos);
    setExplosions((prev) => {
      const next = [...prev, createExplosion(pos)];
      return next.slice(-6);
    });
    playRocketExplosionSound(pos.distanceTo(camera.position));
  }, [applyExplosionDamage, camera, destroyExplosionBlocks]);

  const fireLauncher = useCallback(() => {
    if (!fireRocket()) return;

    cameraAimDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const currentMobs = useMobStore.getState().mobs;
    const multi = useMultiplayerStore.getState();
    const aimHit = rayMarchProjectile(
      camera.position.clone(),
      cameraAimDir.current.clone(),
      ROCKET_AIM_DISTANCE,
      getBlock,
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

    const weaponGroup = weaponGroupRef.current;
    if (weaponGroup) {
      weaponGroup.updateWorldMatrix(true, false);
      muzzleWorld.current.copy(MUZZLE_LOCAL_OFFSET).applyMatrix4(weaponGroup.matrixWorld);
    } else {
      muzzleWorld.current
        .copy(camera.position)
        .addScaledVector(cameraAimDir.current, 1.25);
    }

    muzzleWorld.current.addScaledVector(cameraAimDir.current, 0.22);

    shootDir.current.copy(aimPoint.current).sub(muzzleWorld.current);
    if (shootDir.current.lengthSq() < ROCKET_MIN_AIM_DISTANCE * ROCKET_MIN_AIM_DISTANCE) {
      shootDir.current.copy(cameraAimDir.current);
    } else {
      shootDir.current.normalize();
      if (shootDir.current.dot(cameraAimDir.current) < 0.2) {
        shootDir.current.copy(cameraAimDir.current);
      }
    }

    const velocity = shootDir.current.clone().multiplyScalar(ROCKET_SPEED);
    const projectile: RocketProjectile = {
      id: nextRocketId++,
      pos: muzzleWorld.current.clone(),
      vel: velocity,
      age: 0,
      maxAge: ROCKET_MAX_AGE,
      trailTimer: 0,
      trailPoints: [muzzleWorld.current.clone()],
      orientation: new THREE.Quaternion().setFromUnitVectors(MODEL_FORWARD, shootDir.current),
    };

    setProjectiles((prev) => [...prev.slice(-4), projectile]);
    recoil.current = 1;
    muzzleFlashTimer.current = 0.11;
    backblastTimer.current = 0.15;
    playRocketLaunchSound(muzzleWorld.current.distanceTo(camera.position));
  }, [camera, fireRocket, getBlock]);

  useEffect(() => {
    if (isTouch.current) return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === FIRE_KEY && !e.repeat) {
        fireRequested.current = true;
        e.preventDefault();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== FIRE_MOUSE_BUTTON) return;
      const canvas = getGameCanvas();
      if (!canvas) return;
      const isPointerLockedToCanvas = document.pointerLockElement === canvas;
      const isCanvasMouseDown = e.target === canvas;
      if (!isPointerLockedToCanvas && !isCanvasMouseDown) return;
      if (usePlayerStore.getState().equippedItem !== 'rocket_launcher') return;
      fireRequested.current = true;
      e.preventDefault();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    recoil.current = Math.max(0, recoil.current - dt * 5.6);
    muzzleFlashTimer.current = Math.max(0, muzzleFlashTimer.current - dt);
    backblastTimer.current = Math.max(0, backblastTimer.current - dt);

    if (weaponGroupRef.current) {
      offsetWorld.current.copy(SHOULDER_OFFSET);
      offsetWorld.current.z += recoil.current * 0.12;
      offsetWorld.current.y -= recoil.current * 0.025;
      offsetWorld.current.applyQuaternion(camera.quaternion);

      launcherPos.current.copy(camera.position).add(offsetWorld.current);
      launcherQuat.current.copy(camera.quaternion).multiply(localTiltQuat);

      weaponGroupRef.current.position.copy(launcherPos.current);
      weaponGroupRef.current.quaternion.copy(launcherQuat.current);
    }

    const canUseLauncher = phase === 'playing'
      && !helicopterBoarded
      && !isDead
      && equippedItem === 'rocket_launcher'
      && (isTouch.current ? true : isDesktopGameplayInputActive());

    const touchFire = isTouch.current && consumeFireRocket();
    if (fireRequested.current || touchFire) {
      fireRequested.current = false;
      if (canUseLauncher) {
        fireLauncher();
      }
    }

    const trailSpawns: TrailPuff[] = [];
    const explosionsToSpawn: THREE.Vector3[] = [];

    if (projectiles.length > 0) {
      setProjectiles((prev) => {
        const alive: RocketProjectile[] = [];

        for (const projectile of prev) {
          projectile.age += dt;
          if (projectile.age >= projectile.maxAge) {
            explosionsToSpawn.push(projectile.pos.clone());
            continue;
          }

          projectile.trailTimer += dt;
          while (projectile.trailTimer >= TRAIL_INTERVAL) {
            projectile.trailTimer -= TRAIL_INTERVAL;
            trailSpawns.push(createTrailPuff(projectile.pos, projectile.vel));
          }

          projectile.vel.y -= ROCKET_GRAVITY * dt;
          moveDir.current.copy(projectile.vel).normalize();
          const moveDist = projectile.vel.length() * dt;

          const hitResult = rayMarchProjectile(
            projectile.pos,
            moveDir.current,
            moveDist,
            getBlock,
            mobs,
            ROCKET_HIT_RADIUS,
            {
              remotePlayers: useMultiplayerStore.getState().remotePlayers as Map<string, RemotePlayerTarget>,
              playerHitRadius: PLAYER_HIT_RADIUS,
              playerHitHeight: PLAYER_HIT_HEIGHT,
            },
          );

          if (hitResult.type !== 'none') {
            explosionsToSpawn.push(hitResult.hitPos.clone());
            continue;
          }

          projectile.orientation.setFromUnitVectors(MODEL_FORWARD, moveDir.current);
          projectile.trailPoints.push(projectile.pos.clone());
          if (projectile.trailPoints.length > 7) projectile.trailPoints.shift();
          alive.push(projectile);
        }

        return alive;
      });
    }

    if (trailPuffs.length > 0 || trailSpawns.length > 0) {
      setTrailPuffs((prev) => {
        const next: TrailPuff[] = [];

        for (const puff of prev) {
          puff.life -= dt;
          if (puff.life <= 0) continue;
          puff.pos.addScaledVector(puff.vel, dt);
          puff.vel.multiplyScalar(0.96);
          puff.vel.y += 0.45 * dt;
          next.push(puff);
        }

        next.push(...trailSpawns);
        return next.slice(-MAX_TRAIL_PUFFS);
      });
    }

    if (explosions.length > 0) {
      setExplosions((prev) => {
        const next: ExplosionEffect[] = [];

        for (const explosion of prev) {
          explosion.life -= dt;

          for (const spark of explosion.sparks) {
            spark.life -= dt;
            if (spark.life <= 0) continue;
            spark.vel.y -= 16 * dt;
            spark.vel.multiplyScalar(0.96);
            spark.pos.addScaledVector(spark.vel, dt);
          }

          for (const smoke of explosion.smoke) {
            smoke.life -= dt;
            if (smoke.life <= 0) continue;
            smoke.vel.multiplyScalar(0.985);
            smoke.vel.y += 0.75 * dt;
            smoke.pos.addScaledVector(smoke.vel, dt);
          }

          const hasLiveParticles = explosion.sparks.some((spark) => spark.life > 0)
            || explosion.smoke.some((smoke) => smoke.life > 0);

          if (explosion.life > 0 || hasLiveParticles) {
            next.push(explosion);
          }
        }

        return next;
      });
    }

    if (explosionsToSpawn.length > 0) {
      for (const explosionPos of explosionsToSpawn) {
        spawnExplosionAt(explosionPos);
      }
    }
  });

  const showWeapon = phase === 'playing'
    && !helicopterBoarded
    && !isDead
    && equippedItem === 'rocket_launcher';

  return (
    <>
      {showWeapon && (
        <group ref={weaponGroupRef}>
          {/* メインランチャーチューブ */}
          <mesh position={[0.18, 0.02, -0.68]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.14, 0.16, 1.38, 18]} />
            <meshStandardMaterial color="#524b43" roughness={0.72} metalness={0.22} />
          </mesh>

          {/* 前方リング */}
          <mesh position={[0.18, 0.02, -1.36]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.17, 0.17, 0.08, 18]} />
            <meshStandardMaterial color="#2b2724" roughness={0.65} metalness={0.3} />
          </mesh>

          {/* 砲口リング */}
          <mesh position={[0.18, 0.02, -1.54]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.08, 18]} />
            <meshStandardMaterial color="#181614" roughness={0.55} metalness={0.4} emissive="#331100" emissiveIntensity={0.35} />
          </mesh>

          {/* 肩当て */}
          <mesh position={[0.02, -0.02, 0.08]} rotation={[0.08, 0, -0.08]}>
            <boxGeometry args={[0.28, 0.22, 0.2]} />
            <meshStandardMaterial color="#3e342f" roughness={0.84} metalness={0.12} />
          </mesh>

          {/* サイドレール */}
          <mesh position={[0.18, 0.12, -0.72]}>
            <boxGeometry args={[0.1, 0.06, 0.9]} />
            <meshStandardMaterial color="#262626" roughness={0.46} metalness={0.45} />
          </mesh>

          {/* グリップ */}
          <mesh position={[0.15, -0.2, -0.48]} rotation={[-0.45, 0, 0]}>
            <boxGeometry args={[0.1, 0.25, 0.12]} />
            <meshStandardMaterial color="#2c2420" roughness={0.82} metalness={0.08} />
          </mesh>

          {/* 補助グリップ */}
          <mesh position={[0.17, -0.15, -0.98]} rotation={[-0.22, 0, 0]}>
            <boxGeometry args={[0.08, 0.18, 0.11]} />
            <meshStandardMaterial color="#352a24" roughness={0.82} metalness={0.1} />
          </mesh>

          {/* チューブ下部フレーム */}
          <mesh position={[0.18, -0.08, -0.74]}>
            <boxGeometry args={[0.28, 0.1, 1.05]} />
            <meshStandardMaterial color="#1f1f1f" roughness={0.48} metalness={0.52} />
          </mesh>

          {/* 警告ストライプ */}
          <mesh position={[0.03, 0.14, -0.12]} rotation={[0, 0.2, 0]}>
            <boxGeometry args={[0.22, 0.04, 0.08]} />
            <meshStandardMaterial color="#bb6f2d" roughness={0.45} metalness={0.25} emissive="#8a4312" emissiveIntensity={0.35} />
          </mesh>

          {/* 砲口フラッシュ */}
          <sprite
            position={[MUZZLE_LOCAL_OFFSET.x, MUZZLE_LOCAL_OFFSET.y, MUZZLE_LOCAL_OFFSET.z]}
            scale={[
              0.28 + muzzleFlashTimer.current * 1.35,
              0.28 + muzzleFlashTimer.current * 1.35,
              1,
            ]}
          >
            <spriteMaterial
              map={glowTexture}
              color="#ffb566"
              transparent
              opacity={clamp01(muzzleFlashTimer.current * 8)}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>

          {/* 後方バックブラスト */}
          <sprite
            position={[BACKBLAST_LOCAL_OFFSET.x, BACKBLAST_LOCAL_OFFSET.y, BACKBLAST_LOCAL_OFFSET.z]}
            scale={[
              0.4 + backblastTimer.current * 1.8,
              0.4 + backblastTimer.current * 1.2,
              1,
            ]}
          >
            <spriteMaterial
              map={glowTexture}
              color="#ff7a42"
              transparent
              opacity={clamp01(backblastTimer.current * 6)}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>
        </group>
      )}

      {projectiles.map((projectile) => (
        <group
          key={projectile.id}
          position={[projectile.pos.x, projectile.pos.y, projectile.pos.z]}
          quaternion={projectile.orientation}
        >
          <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.055, 0.34, 12]} />
            <meshStandardMaterial color="#8b8f93" roughness={0.42} metalness={0.68} emissive="#2a1a08" emissiveIntensity={0.2} />
          </mesh>
          <mesh position={[0, 0, -0.2]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.055, 0.15, 12]} />
            <meshStandardMaterial color="#c67b34" roughness={0.34} metalness={0.55} emissive="#79310f" emissiveIntensity={0.28} />
          </mesh>
          <mesh position={[0, 0, 0.17]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.045, 0.06, 10]} />
            <meshStandardMaterial color="#2f2f2f" roughness={0.6} metalness={0.4} />
          </mesh>
          <mesh position={[0.055, 0, 0.08]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.02, 0.1, 0.08]} />
            <meshStandardMaterial color="#5a5a5a" roughness={0.58} metalness={0.42} />
          </mesh>
          <mesh position={[-0.055, 0, 0.08]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.02, 0.1, 0.08]} />
            <meshStandardMaterial color="#5a5a5a" roughness={0.58} metalness={0.42} />
          </mesh>
          <sprite position={[0, 0, 0.22]} scale={[0.26, 0.26, 1]}>
            <spriteMaterial
              map={glowTexture}
              color="#ff9248"
              transparent
              opacity={0.88}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>
        </group>
      ))}

      {projectiles.map((projectile) => (
        projectile.trailPoints.map((point, index) => {
          const ratio = (index + 1) / projectile.trailPoints.length;
          return (
            <sprite
              key={`${projectile.id}_trail_${index}`}
              position={[point.x, point.y, point.z]}
              scale={[0.12 + ratio * 0.22, 0.12 + ratio * 0.22, 1]}
            >
              <spriteMaterial
                map={glowTexture}
                color="#ffb261"
                transparent
                opacity={0.12 + ratio * 0.24}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </sprite>
          );
        })
      ))}

      {trailPuffs.map((puff) => {
        const ratio = puff.life / puff.maxLife;
        const scale = puff.size * (1.2 + (1 - ratio) * 1.8);
        return (
          <sprite
            key={puff.id}
            position={[puff.pos.x, puff.pos.y, puff.pos.z]}
            scale={[scale, scale, 1]}
          >
            <spriteMaterial
              map={smokeTexture}
              color="#b9aea6"
              transparent
              opacity={ratio * 0.36}
              depthWrite={false}
            />
          </sprite>
        );
      })}

      {explosions.map((explosion) => {
        const ratio = clamp01(explosion.life / explosion.maxLife);
        const progress = 1 - ratio;
        const flashScale = 0.9 + progress * 4.5;
        const shockwaveScale = 0.8 + progress * EXPLOSION_RADIUS * 0.72;
        const flashOpacity = progress < 0.35 ? (1 - progress / 0.35) * 0.7 : 0;
        const emberOpacity = ratio * 0.44;

        return (
          <group key={explosion.id} position={[explosion.pos.x, explosion.pos.y, explosion.pos.z]}>
            <pointLight
              color="#ffb56d"
              intensity={ratio * 6.5}
              distance={14}
              decay={2.2}
            />

            <mesh scale={[flashScale, flashScale, flashScale]}>
              <sphereGeometry args={[0.42, 24, 24]} />
              <meshBasicMaterial
                color="#ffd7a6"
                transparent
                opacity={flashOpacity}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>

            <mesh scale={[2.1 + progress * 2.8, 2.1 + progress * 2.8, 2.1 + progress * 2.8]}>
              <sphereGeometry args={[0.18, 20, 20]} />
              <meshBasicMaterial
                color="#ff8b3d"
                transparent
                opacity={emberOpacity}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>

            <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[shockwaveScale, shockwaveScale, shockwaveScale]}>
              <ringGeometry args={[0.7, 1, 40]} />
              <meshBasicMaterial
                color="#ffb46a"
                transparent
                opacity={ratio * 0.42}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>

            {explosion.sparks.map((spark, index) => {
              if (spark.life <= 0) return null;
              const sparkRatio = spark.life / spark.maxLife;
              const scale = spark.size * (0.6 + sparkRatio * 1.5);
              return (
                <sprite
                  key={`spark_${explosion.id}_${index}`}
                  position={[spark.pos.x - explosion.pos.x, spark.pos.y - explosion.pos.y, spark.pos.z - explosion.pos.z]}
                  scale={[scale, scale, 1]}
                >
                  <spriteMaterial
                    map={glowTexture}
                    color="#ff9f59"
                    transparent
                    opacity={sparkRatio * 0.9}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                  />
                </sprite>
              );
            })}

            {explosion.smoke.map((smoke, index) => {
              if (smoke.life <= 0) return null;
              const smokeRatio = smoke.life / smoke.maxLife;
              const scale = smoke.size * (1.1 + (1 - smokeRatio) * 1.8);
              return (
                <sprite
                  key={`smoke_${explosion.id}_${index}`}
                  position={[smoke.pos.x - explosion.pos.x, smoke.pos.y - explosion.pos.y, smoke.pos.z - explosion.pos.z]}
                  scale={[scale, scale, 1]}
                >
                  <spriteMaterial
                    map={smokeTexture}
                    color="#7a726d"
                    transparent
                    opacity={smokeRatio * 0.42}
                    depthWrite={false}
                  />
                </sprite>
              );
            })}
          </group>
        );
      })}
    </>
  );
}
