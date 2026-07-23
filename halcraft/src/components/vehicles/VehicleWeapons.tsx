// 戦車・飛行機の武器制御
// 左クリック長押し = ガトリング、右クリック = 戦車主砲ロケット、B / 右クリック(飛行機) = 爆弾投下

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useModeFlowStore } from '../../stores/useModeFlowStore';
import { useStageChallengeStore } from '../../stores/useStageChallengeStore';
import { useVehicleFirepowerStore, type VehicleFirepowerKind } from '../../stores/useVehicleFirepowerStore';
import { isDesktopGameplayInputActive } from '../../utils/gameCanvas';
import { consumeVehicleRocket, consumeVehicleBomb, mobileActions } from '../../utils/touchInput';
import { useGameStore } from '../../stores/useGameStore';
import { rayMarchProjectile, type RemotePlayerTarget } from '../../utils/projectilePhysics';
import { airplaneRealtime } from '../../utils/airplaneRealtime';
import { spawnBlockBreakEffect, spawnCombatExplosion, spawnDamagePopup, spawnHitImpactEffect } from '../../utils/effectTriggers';
import {
  playBombFallingSound,
  playBulletImpactSound,
  playMachineGunSound,
  playRocketExplosionSound,
  playRocketLaunchSound,
} from '../../utils/sounds';
import { BLOCK_DEFS, BLOCK_IDS, type BlockId } from '../../types/blocks';
import { getStageModeVehicleGain } from '../../types/stageModeRules';
import { TANK_TURRET_PIVOT } from './vehicleModelConfig';
import { checkProjectileHitVehicle } from '../../utils/vehicleCombat';

const BULLET_SPEED = 130;
const BULLET_MAX_AGE = 0.95;
/** 照準一致を優先し、落下は控えめ */
const BULLET_GRAVITY = 1.0;
const BULLET_MIN_AIM_DISTANCE = 1.2;
/** 自機射撃時、画面中心とのトレイル一致用スポーン前送り */
const CAMERA_SPAWN_FORWARD = 0.85;
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
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const TANK_CANNON_MUZZLE_LOCAL = new THREE.Vector3(0.95, 2.1, -3.25);
const TANK_GATLING_MUZZLE_LOCAL = new THREE.Vector3(1.18, 1.35, -2.35);
const AIRPLANE_GATLING_MUZZLE_LOCAL = new THREE.Vector3(0, 1.2, -7.05);

/** 爆弾の定数 */
const BOMB_GRAVITY = 22;
const BOMB_MAX_AGE = 8;
const BOMB_COOLDOWN = 1.2;
const BOMB_HIT_RADIUS = 1.0;
const BOMB_EXPLOSION_RADIUS = 10;
const BOMB_EXPLOSION_DAMAGE = 35;
const BOMB_EXPLOSION_MIN_DAMAGE = 5;
const BOMB_EXPLOSION_BLOCK_RADIUS = 4.0;
const BOMB_EXPLOSION_MAX_DESTROY_BLOCKS = 120;
const BOMB_DROP_OFFSET_LEFT = new THREE.Vector3(-2.0, -1.5, 0);
const BOMB_DROP_OFFSET_RIGHT = new THREE.Vector3(2.0, -1.5, 0);
const BOMB_DROP_DELAY = 0.1; // 2発目の遅延（秒）
const ROCKET_MODEL_FORWARD = new THREE.Vector3(0, 1, 0);
const BOMB_MODEL_FORWARD = new THREE.Vector3(0, -1, 0);

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

interface MuzzleFlash {
  id: number;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  life: number;
  maxLife: number;
  color: string;
}

interface BombProjectile {
  id: number;
  syncId: string;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
}

let nextProjectileId = 0;

function recordVehicleStrike(
  type: VehicleType,
  amount = 1,
  critical = false,
  kind: VehicleFirepowerKind = 'gatling',
): void {
  const delta = Math.max(1, Math.round(amount));
  const stageId = useModeFlowStore.getState().currentStageId;
  const modeGain = getStageModeVehicleGain(stageId, type, delta, critical);
  useVehicleFirepowerStore.getState().recordStrike({
    vehicleType: type,
    kind,
    amount: delta,
    critical,
    modeGain,
  });
  useStageChallengeStore.getState().recordVehicleHit(delta);
  useModeFlowStore.getState().recordVehicleHit(type, delta, critical);
}

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

function calculateBombExplosionDamage(distance: number): number {
  if (distance >= BOMB_EXPLOSION_RADIUS) return 0;
  const falloff = 1 - distance / BOMB_EXPLOSION_RADIUS;
  const eased = falloff * falloff;
  return Math.max(1, Math.round(BOMB_EXPLOSION_MIN_DAMAGE + (BOMB_EXPLOSION_DAMAGE - BOMB_EXPLOSION_MIN_DAMAGE) * eased));
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
  // リアルタイム位置があればそれを使う（1フレーム遅延を解消）
  const src = airplaneRealtime.valid ? airplaneRealtime : useVehicleStore.getState().airplane;
  return localPoint.clone().applyEuler(
    new THREE.Euler(src.pitch, src.rotationY, src.roll),
  ).add(
    new THREE.Vector3(src.x, src.y, src.z),
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

/** 戦車砲塔の砲身前方（モデルは砲塔ローカル -Z が前方） */
function getTankCannonDirection(): THREE.Vector3 {
  const tank = useVehicleStore.getState().tank;
  return new THREE.Vector3(0, 0, -1)
    .applyAxisAngle(Y_AXIS, tank.turretYaw)
    .applyAxisAngle(Y_AXIS, tank.rotationY)
    .normalize();
}

/** 戦車ガトリング前方（車体向き） */
function getTankGatlingDirection(): THREE.Vector3 {
  const tank = useVehicleStore.getState().tank;
  return new THREE.Vector3(0, 0, -1)
    .applyAxisAngle(Y_AXIS, tank.rotationY)
    .normalize();
}

/** 飛行機ガトリング前方（機首向き） */
function getAirplaneGatlingDirection(): THREE.Vector3 {
  const src = airplaneRealtime.valid ? airplaneRealtime : useVehicleStore.getState().airplane;
  return new THREE.Vector3(0, 0, -1)
    .applyEuler(new THREE.Euler(src.pitch, src.rotationY, src.roll))
    .normalize();
}

/**
 * 銃口から照準点へ向けつつ、砲身方向から大きく外れない方向を返す。
 * 戦車主砲など砲身が見える武器向け。ガトリングはカメラ視線優先。
 */
function getBarrelAlignedAimDirection(
  startPos: THREE.Vector3,
  barrelDir: THREE.Vector3,
  camera: THREE.Camera,
  range: number,
  minDot = 0.2,
): THREE.Vector3 {
  const cameraAim = getCameraAimDirection(camera, startPos, range);
  // 極端に後ろを向いているときだけ砲身にフォールバック
  if (cameraAim.dot(barrelDir) < minDot) {
    return barrelDir.clone();
  }
  return cameraAim;
}

/** 画面中心＝弾道（VehicleAimHUD のレティクルと一致させる） */
function getCameraForward(camera: THREE.Camera): THREE.Vector3 {
  return new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
}

/** playing 中かつ生存中のみ乗り物武器を使える */
function canUseVehicleWeapons(): boolean {
  const phase = useGameStore.getState().phase;
  if (phase !== 'playing') return false;
  if (usePlayerStore.getState().isDead) return false;
  return true;
}

export function VehicleWeapons() {
  const { camera } = useThree();
  const [bullets, setBullets] = useState<BulletProjectile[]>([]);
  const [rockets, setRockets] = useState<CannonRocket[]>([]);
  const [bombs, setBombs] = useState<BombProjectile[]>([]);
  const [explosions, setExplosions] = useState<ExplosionFlash[]>([]);
  const [muzzleFlashes, setMuzzleFlashes] = useState<MuzzleFlash[]>([]);
  const isMouseDown = useRef(false);
  const lastGunFire = useRef(0);
  const lastRocketFire = useRef(0);
  const lastBombDrop = useRef(0);
  const shootDir = useRef(new THREE.Vector3());

  const fireGatling = useCallback((type: VehicleType, mount: 'center' | 'left' | 'right' = 'center', isRemote = false, remoteDir?: THREE.Vector3, remotePos?: THREE.Vector3) => {
    if (!isRemote && !canUseVehicleWeapons()) return;
    const now = performance.now() / 1000;
    if (!isRemote && now - lastGunFire.current < GUN_CONSTANTS.FIRE_COOLDOWN) return;
    if (!isRemote) lastGunFire.current = now;

    const muzzlePos = remotePos ?? getVehicleMuzzle(type, mount);
    let dir: THREE.Vector3;
    let startPos: THREE.Vector3;
    if (remoteDir) {
      dir = remoteDir.clone().normalize();
      startPos = muzzlePos.clone();
    } else {
      // 画面中心の照準HUDと弾道を一致（ヘリ機関銃・徒歩銃と同じ方針）
      dir = getCameraForward(camera);
      startPos = camera.position.clone().addScaledVector(dir, CAMERA_SPAWN_FORWARD);
      // 極端にカメラが後ろを向いている時だけ銃身フォールバック
      const barrelDir = type === 'tank'
        ? getTankGatlingDirection()
        : getAirplaneGatlingDirection();
      if (dir.dot(barrelDir) < 0.15) {
        dir = barrelDir.clone();
        startPos = muzzlePos.clone();
      }
    }

    if (!isRemote) {
      const spread = 0.006;
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

    // 銃口フラッシュは銃口位置（見た目）
    setMuzzleFlashes((prev) => [...prev.slice(-12), {
      id: nextProjectileId++,
      pos: muzzlePos.clone(),
      dir: dir.clone(),
      life: 0.06,
      maxLife: 0.06,
      color: type === 'tank' ? '#fff36a' : '#8ff6ff',
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

  /** 爆弾用のブロック破壊（広範囲） */
  const destroyBombBlocks = useCallback((center: THREE.Vector3) => {
    const world = useWorldStore.getState();
    const multi = useMultiplayerStore.getState();
    const radiusSq = BOMB_EXPLOSION_BLOCK_RADIUS * BOMB_EXPLOSION_BLOCK_RADIUS;
    const minX = Math.floor(center.x - BOMB_EXPLOSION_BLOCK_RADIUS);
    const maxX = Math.floor(center.x + BOMB_EXPLOSION_BLOCK_RADIUS);
    const minY = Math.floor(center.y - BOMB_EXPLOSION_BLOCK_RADIUS);
    const maxY = Math.floor(center.y + BOMB_EXPLOSION_BLOCK_RADIUS);
    const minZ = Math.floor(center.z - BOMB_EXPLOSION_BLOCK_RADIUS);
    const maxZ = Math.floor(center.z + BOMB_EXPLOSION_BLOCK_RADIUS);
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

    for (const block of candidates.slice(0, BOMB_EXPLOSION_MAX_DESTROY_BLOCKS)) {
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

      // 爆発ノックバックはごく弱く
      const dist = Math.max(0.2, mobCenter.distanceTo(center));
      const dirX = (mob.x - center.x) / dist;
      const dirZ = (mob.z - center.z) / dist;
      const kbForce = 0.55 * (1 - Math.min(1, dist / EXPLOSION_RADIUS));
      multi.sendMobDamage(mob.id, damage, dirX * kbForce, dirZ * kbForce);
      mobStore.damageMob(mob.id, damage, dirX * kbForce, dirZ * kbForce);
      spawnDamagePopup(damage, mob.x, mob.y + 1.1, mob.z, damage >= EXPLOSION_DAMAGE * 0.75);
      spawnHitImpactEffect(mob.x, mob.y + 0.9, mob.z, dirX, 0.35, dirZ, damage >= EXPLOSION_DAMAGE * 0.7);
      recordVehicleStrike('tank', 1, damage >= EXPLOSION_DAMAGE * 0.7, 'cannon');
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

  /** 爆弾の爆発ダメージ適用 */
  const applyBombExplosionDamage = useCallback((center: THREE.Vector3) => {
    const mobStore = useMobStore.getState();
    const multi = useMultiplayerStore.getState();
    const playerStore = usePlayerStore.getState();
    const playerCenter = new THREE.Vector3(camera.position.x, camera.position.y - 0.85, camera.position.z);
    const selfDamage = calculateBombExplosionDamage(playerCenter.distanceTo(center));

    if (selfDamage > 0) {
      playerStore.takeDamage(selfDamage, playerCenter.x - center.x, playerCenter.z - center.z);
    }

    for (const mob of mobStore.mobs) {
      if (mob.hp <= 0) continue;
      const mobCenter = new THREE.Vector3(mob.x, mob.y + 0.9, mob.z);
      const damage = calculateBombExplosionDamage(mobCenter.distanceTo(center));
      if (damage <= 0) continue;

      // 爆発ノックバックはごく弱く
      const dist = Math.max(0.2, mobCenter.distanceTo(center));
      const dirX = (mob.x - center.x) / dist;
      const dirZ = (mob.z - center.z) / dist;
      const kbForce = 0.65 * (1 - Math.min(1, dist / BOMB_EXPLOSION_RADIUS));
      multi.sendMobDamage(mob.id, damage, dirX * kbForce, dirZ * kbForce);
      mobStore.damageMob(mob.id, damage, dirX * kbForce, dirZ * kbForce);
      spawnDamagePopup(damage, mob.x, mob.y + 1.1, mob.z, damage >= BOMB_EXPLOSION_DAMAGE * 0.75);
      spawnHitImpactEffect(mob.x, mob.y + 0.9, mob.z, dirX, 0.35, dirZ, damage >= BOMB_EXPLOSION_DAMAGE * 0.7);
      recordVehicleStrike('airplane', 1, damage >= BOMB_EXPLOSION_DAMAGE * 0.7, 'bomb');
    }

    for (const [, player] of multi.remotePlayers) {
      if (player.isDead) continue;
      const playerBody = new THREE.Vector3(
        player.position[0],
        player.position[1] + PLAYER_HIT_HEIGHT * 0.5,
        player.position[2],
      );
      const damage = calculateBombExplosionDamage(playerBody.distanceTo(center));
      if (damage <= 0) continue;

      const dirX = player.position[0] - center.x;
      const dirZ = player.position[2] - center.z;
      multi.sendPlayerAttack(player.id, damage, dirX * 2.5, dirZ * 2.5);
      spawnDamagePopup(damage, player.position[0], player.position[1] + 1.1, player.position[2], false);
      spawnHitImpactEffect(player.position[0], player.position[1] + 0.9, player.position[2], dirX, 0.35, dirZ, false);
    }
  }, [camera]);

  const fireTankRocket = useCallback(() => {
    if (!canUseVehicleWeapons()) return;
    if (useVehicleStore.getState().getActiveVehicle() !== 'tank') return;
    const now = performance.now() / 1000;
    if (now - lastRocketFire.current < TANK_CONSTANTS.CANNON_COOLDOWN) return;
    lastRocketFire.current = now;

    const startPos = getTankCannonMuzzle();
    const barrelDir = getTankCannonDirection();
    // カメラ照準点へ寄せつつ、砲身方向から大きく外れたら砲身優先
    shootDir.current.copy(
      getBarrelAlignedAimDirection(startPos, barrelDir, camera, ROCKET_AIM_DISTANCE, 0.25),
    );

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
    setMuzzleFlashes((prev) => [...prev.slice(-12), {
      id: nextProjectileId++,
      pos: startPos.clone(),
      dir: shootDir.current.clone(),
      life: 0.12,
      maxLife: 0.12,
      color: '#ff9a40',
    }]);
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
    spawnCombatExplosion(pos.x, pos.y, pos.z, { style: 'rocket', intensity: 1.15, accent: '#ff9a40' });
    playRocketExplosionSound(pos.distanceTo(camera.position));
    useMultiplayerStore.getState().sendRocketExplode(rocket.syncId, [pos.x, pos.y, pos.z]);
    setExplosions((prev) => [...prev, { id: nextProjectileId++, pos: pos.clone(), life: 0.35 }]);
  }, [applyRocketExplosionDamage, camera, destroyExplosionBlocks]);

  /** 爆弾の爆発処理 */
  const explodeBomb = useCallback((bomb: BombProjectile, pos: THREE.Vector3) => {
    destroyBombBlocks(pos);
    applyBombExplosionDamage(pos);
    spawnHitImpactEffect(pos.x, pos.y, pos.z, 0, 1, 0, true);
    spawnCombatExplosion(pos.x, pos.y, pos.z, { style: 'bomb', intensity: 1.3, accent: '#ff6a18' });
    playRocketExplosionSound(pos.distanceTo(camera.position));
    useMultiplayerStore.getState().sendRocketExplode(bomb.syncId, [pos.x, pos.y, pos.z]);
    setExplosions((prev) => [...prev, { id: nextProjectileId++, pos: pos.clone(), life: 0.4 }]);

    // 乗り物への爆弾ダメージ判定
    const activeType = useVehicleStore.getState().getActiveVehicle();
    const vehicleHit = checkProjectileHitVehicle(
      pos.x, pos.y, pos.z,
      activeType ?? undefined,
    );
    if (vehicleHit) {
      useVehicleStore.getState().damageVehicle(vehicleHit.type, 40);
    }
  }, [applyBombExplosionDamage, camera, destroyBombBlocks]);

  /** 爆弾投下（左右2発、0.1s時間差） */
  const pendingBombTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dropBomb = useCallback(() => {
    if (!canUseVehicleWeapons()) return;
    if (useVehicleStore.getState().getActiveVehicle() !== 'airplane') return;
    const now = performance.now() / 1000;
    if (now - lastBombDrop.current < BOMB_COOLDOWN) return;
    lastBombDrop.current = now;

    // リアルタイム位置を優先使用（ストアは1フレーム遅延する）
    const ap = airplaneRealtime.valid ? airplaneRealtime : useVehicleStore.getState().airplane;
    const euler = new THREE.Euler(ap.pitch, ap.rotationY, ap.roll);
    const origin = new THREE.Vector3(ap.x, ap.y, ap.z);

    // 飛行機の速度を継承（前方への慣性）
    const forwardDir = new THREE.Vector3(0, 0, -1).applyEuler(euler);

    // --- 1発目: 左側から投下 ---
    const dropPosL = BOMB_DROP_OFFSET_LEFT.clone().applyEuler(euler).add(origin);
    const velL = forwardDir.clone().multiplyScalar(ap.speed);
    velL.y = -2;
    const syncIdL = `bomb_${Date.now()}_L_${Math.floor(Math.random() * 100000)}`;

    setBombs((prev) => [...prev, {
      id: nextProjectileId++,
      syncId: syncIdL,
      pos: dropPosL.clone(),
      prev: dropPosL.clone(),
      vel: velL,
      age: 0,
    }]);

    playBombFallingSound(dropPosL.distanceTo(camera.position));
    useMultiplayerStore.getState().sendRocketFire(
      syncIdL,
      [dropPosL.x, dropPosL.y, dropPosL.z],
      [velL.x, velL.y, velL.z],
    );

    // --- 2発目: 右側から 0.1s 遅延で投下 ---
    if (pendingBombTimer.current) clearTimeout(pendingBombTimer.current);
    pendingBombTimer.current = setTimeout(() => {
      const ap2 = airplaneRealtime.valid ? airplaneRealtime : useVehicleStore.getState().airplane;
      const euler2 = new THREE.Euler(ap2.pitch, ap2.rotationY, ap2.roll);
      const origin2 = new THREE.Vector3(ap2.x, ap2.y, ap2.z);
      const fwd2 = new THREE.Vector3(0, 0, -1).applyEuler(euler2);

      const dropPosR = BOMB_DROP_OFFSET_RIGHT.clone().applyEuler(euler2).add(origin2);
      const velR = fwd2.clone().multiplyScalar(ap2.speed);
      velR.y = -2;
      const syncIdR = `bomb_${Date.now()}_R_${Math.floor(Math.random() * 100000)}`;

      setBombs((prev) => [...prev, {
        id: nextProjectileId++,
        syncId: syncIdR,
        pos: dropPosR.clone(),
        prev: dropPosR.clone(),
        vel: velR,
        age: 0,
      }]);

      playBombFallingSound(dropPosR.distanceTo(camera.position));
      useMultiplayerStore.getState().sendRocketFire(
        syncIdR,
        [dropPosR.x, dropPosR.y, dropPosR.z],
        [velR.x, velR.y, velR.z],
      );
    }, BOMB_DROP_DELAY * 1000);
  }, [camera]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!canUseVehicleWeapons()) return;
      const active = useVehicleStore.getState().getActiveVehicle();
      if (e.button === 0) {
        isMouseDown.current = true;
        return;
      }
      if (e.button === 2 && active === 'tank' && !isEditableTarget(e.target)) {
        e.preventDefault();
        fireTankRocket();
      }
      if (e.button === 2 && active === 'airplane' && !isEditableTarget(e.target)) {
        e.preventDefault();
        dropBomb();
      }
    };
    const onBlur = () => {
      isMouseDown.current = false;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) isMouseDown.current = false;
    };
    const onContextMenu = (e: MouseEvent) => {
      const active = useVehicleStore.getState().getActiveVehicle();
      if (active === 'tank' || active === 'airplane') {
        e.preventDefault();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('blur', onBlur);
    };
  }, [fireTankRocket, dropBomb]);

  // Bキーで爆弾投下（飛行機専用）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyB' && !e.repeat) {
        if (!canUseVehicleWeapons()) return;
        const active = useVehicleStore.getState().getActiveVehicle();
        if (active === 'airplane') {
          dropBomb();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dropBomb]);

  useEffect(() => {
    return onRemoteVehicleGunFire((data) => {
      const pos = new THREE.Vector3(data.pos[0], data.pos[1], data.pos[2]);
      const dir = new THREE.Vector3(data.dir[0], data.dir[1], data.dir[2]).normalize();
      fireGatling(data.type, data.mount, true, dir, pos);
    });
  }, [fireGatling]);

  useFrame((_, delta) => {
    // ポーズ・メニュー・死亡中は新規射撃のみ止める（飛翔中の弾は更新を続ける）
    const weaponsLive = canUseVehicleWeapons();
    if (!weaponsLive) {
      isMouseDown.current = false;
      mobileActions.vehicleGun = false;
    } else {
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

      if (active === 'airplane' && consumeVehicleBomb()) {
        dropBomb();
      }
    }

    const now = performance.now() / 1000;
    const getBlock = useWorldStore.getState().getBlock;
    const mobs = useMobStore.getState().mobs;
    const remotePlayers = useMultiplayerStore.getState().remotePlayers as Map<string, RemotePlayerTarget>;

    if (muzzleFlashes.length > 0) {
      setMuzzleFlashes((prev) => prev
        .map((flash) => ({ ...flash, life: flash.life - delta }))
        .filter((flash) => flash.life > 0));
    }

    setBullets((prev) => {
      if (prev.length === 0) return prev;
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
            // 銃撃はノックバックなし（接近を止めない）
            useMultiplayerStore.getState().sendMobDamage(hit.targetId, GUN_CONSTANTS.DAMAGE, 0, 0);
            useMobStore.getState().damageMob(hit.targetId, GUN_CONSTANTS.DAMAGE, 0, 0);
            spawnDamagePopup(GUN_CONSTANTS.DAMAGE, mob.x, mob.y + 1.0, mob.z, false);
            recordVehicleStrike(bullet.type);
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

        // 乗り物への弾丸ダメージ判定（線分スイープでトンネル抜けを防ぐ）
        const activeType = useVehicleStore.getState().getActiveVehicle();
        if (!bullet.isRemote) {
          const vehicleHit = checkProjectileHitVehicle(
            bullet.pos.x, bullet.pos.y, bullet.pos.z,
            activeType ?? undefined,
            bullet.prev.x, bullet.prev.y, bullet.prev.z,
          );
          if (vehicleHit) {
            useVehicleStore.getState().damageVehicle(vehicleHit.type, GUN_CONSTANTS.DAMAGE);
            spawnHitImpactEffect(vehicleHit.hitX, vehicleHit.hitY, vehicleHit.hitZ, moveDir.x, moveDir.y, moveDir.z, false);
            spawnDamagePopup(GUN_CONSTANTS.DAMAGE, vehicleHit.hitX, vehicleHit.hitY + 0.5, vehicleHit.hitZ, false);
            playBulletImpactSound(camera.position.distanceTo(
              new THREE.Vector3(vehicleHit.hitX, vehicleHit.hitY, vehicleHit.hitZ),
            ), 'mob');
            continue;
          }
        }

        alive.push(bullet);
      }
      return alive;
    });

    setRockets((prev) => {
      if (prev.length === 0) return prev;
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
        if (hit.type !== 'none') {
          const explosionPos = hit.type === 'block'
            ? getVisibleExplosionPosition(hit.hitPos, hit.normal)
            : hit.hitPos;
          explodeRocket(rocket, explosionPos);
          continue;
        }

        // ロケットの乗り物ヒット判定（線分スイープ）
        const activeType = useVehicleStore.getState().getActiveVehicle();
        const vehicleHit = checkProjectileHitVehicle(
          rocket.pos.x, rocket.pos.y, rocket.pos.z,
          activeType ?? undefined,
          rocket.prev.x, rocket.prev.y, rocket.prev.z,
        );
        if (vehicleHit) {
          useVehicleStore.getState().damageVehicle(vehicleHit.type, 25);
          explodeRocket(rocket, new THREE.Vector3(vehicleHit.hitX, vehicleHit.hitY, vehicleHit.hitZ));
          continue;
        }

        alive.push(rocket);
      }
      return alive;
    });

    setExplosions((prev) => prev.length === 0
      ? prev
      : prev
        .map((explosion) => ({ ...explosion, life: explosion.life - delta }))
        .filter((explosion) => explosion.life > 0));

    // === 爆弾の物理更新 ===
    setBombs((prev) => {
      if (prev.length === 0) return prev;
      const alive: BombProjectile[] = [];
      for (const bomb of prev) {
        bomb.age += delta;
        if (bomb.age > BOMB_MAX_AGE) {
          explodeBomb(bomb, bomb.pos);
          continue;
        }

        bomb.prev.copy(bomb.pos);
        bomb.vel.y -= BOMB_GRAVITY * delta;
        const moveDir = bomb.vel.clone().normalize();
        const moveDist = bomb.vel.length() * delta;
        const hit = rayMarchProjectile(
          bomb.pos,
          moveDir,
          moveDist,
          getBlock,
          mobs,
          BOMB_HIT_RADIUS,
          { remotePlayers, playerHitRadius: PLAYER_HIT_RADIUS, playerHitHeight: PLAYER_HIT_HEIGHT },
        );

        if (hit.type !== 'none') {
          const explosionPos = hit.type === 'block'
            ? getVisibleExplosionPosition(hit.hitPos, hit.normal)
            : hit.hitPos;
          explodeBomb(bomb, explosionPos);
          continue;
        }

        // 乗り物への爆弾ヒット判定（線分スイープ）
        const activeType = useVehicleStore.getState().getActiveVehicle();
        const vehicleHit = checkProjectileHitVehicle(
          bomb.pos.x, bomb.pos.y, bomb.pos.z,
          activeType ?? undefined,
          bomb.prev.x, bomb.prev.y, bomb.prev.z,
        );
        if (vehicleHit) {
          useVehicleStore.getState().damageVehicle(vehicleHit.type, 40);
          explodeBomb(bomb, new THREE.Vector3(vehicleHit.hitX, vehicleHit.hitY, vehicleHit.hitZ));
          continue;
        }

        alive.push(bomb);
      }
      return alive;
    });
  });

  return (
    <group>
      {bullets.map((bullet) => (
        <Tracer
          key={bullet.id}
          start={bullet.prev}
          end={bullet.pos}
          color={bullet.type === 'tank' ? '#fff36a' : '#8ff6ff'}
          radius={0.028}
          glowRadius={0.055}
        />
      ))}
      {rockets.map((rocket) => (
        <group key={rocket.id}>
          <Tracer start={rocket.prev} end={rocket.pos} color="#ff9a40" radius={0.09} glowRadius={0.18} />
          <VehicleRocketModel
            x={rocket.pos.x}
            y={rocket.pos.y}
            z={rocket.pos.z}
            previousX={rocket.prev.x}
            previousY={rocket.prev.y}
            previousZ={rocket.prev.z}
          />
          <pointLight position={rocket.pos} color="#ff9a40" intensity={4.2} distance={14} />
        </group>
      ))}
      {bombs.map((bomb) => (
        <group key={bomb.id}>
          <VehicleBombModel
            x={bomb.pos.x}
            y={bomb.pos.y}
            z={bomb.pos.z}
            previousX={bomb.prev.x}
            previousY={bomb.prev.y}
            previousZ={bomb.prev.z}
          />
          {/* 落下の軌跡（コア＋グロー） */}
          <Tracer start={bomb.prev} end={bomb.pos} color="#ff8844" radius={0.08} glowRadius={0.16} />
        </group>
      ))}
      {/* 補助フラッシュ（本体は CombatExplosionFX） */}
      {explosions.map((explosion) => {
        const t = Math.max(0, explosion.life / 0.4);
        return (
          <group key={explosion.id} position={explosion.pos}>
            <mesh scale={[1 + (1 - t) * 4.5, 1 + (1 - t) * 4.5, 1 + (1 - t) * 4.5]}>
              <sphereGeometry args={[0.55, 16, 12]} />
              <meshBasicMaterial
                color="#ffd29a"
                transparent
                opacity={t * 0.55}
                depthWrite={false}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            <pointLight color="#ff7b22" intensity={t * 10} distance={22} decay={2} />
          </group>
        );
      })}
      {/* 銃口マズルフラッシュ */}
      {muzzleFlashes.map((flash) => {
        const t = Math.max(0, flash.life / flash.maxLife);
        const mid = flash.pos.clone().addScaledVector(flash.dir, 0.35 * t + 0.15);
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          flash.dir.lengthSq() > 0.0001 ? flash.dir.clone().normalize() : new THREE.Vector3(0, 0, -1),
        );
        return (
          <group key={flash.id}>
            <mesh position={flash.pos}>
              <sphereGeometry args={[0.12 + (1 - t) * 0.18, 10, 8]} />
              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={t * 0.95}
                depthWrite={false}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            <mesh position={mid} quaternion={quat}>
              <coneGeometry args={[0.14 + (1 - t) * 0.1, 0.55 + (1 - t) * 0.35, 8]} />
              <meshBasicMaterial
                color={flash.color}
                transparent
                opacity={t * 0.8}
                depthWrite={false}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            <pointLight
              position={flash.pos}
              color={flash.color}
              intensity={t * 5.5}
              distance={8}
              decay={2}
            />
          </group>
        );
      })}
    </group>
  );
}

interface ProjectileModelProps {
  x: number;
  y: number;
  z: number;
  previousX: number;
  previousY: number;
  previousZ: number;
}

/** 戦車砲弾。発光球ではなく、進行方向を向く弾頭・胴体・尾部として描画する */
function VehicleRocketModel({ x, y, z, previousX, previousY, previousZ }: ProjectileModelProps) {
  const quaternion = useMemo(() => {
    const result = new THREE.Quaternion();
    const direction = new THREE.Vector3(x - previousX, y - previousY, z - previousZ);
    if (direction.lengthSq() > 0.000001) {
      result.setFromUnitVectors(ROCKET_MODEL_FORWARD, direction.normalize());
    }
    return result;
  }, [previousX, previousY, previousZ, x, y, z]);

  return (
    <group position={[x, y, z]} quaternion={quaternion}>
      <mesh>
        <cylinderGeometry args={[0.1, 0.13, 0.42, 10]} />
        <meshStandardMaterial color="#697079" roughness={0.38} metalness={0.68} emissive="#3a1a08" emissiveIntensity={0.22} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <coneGeometry args={[0.1, 0.18, 10]} />
        <meshStandardMaterial color="#c57933" emissive="#542006" emissiveIntensity={0.42} roughness={0.36} metalness={0.5} />
      </mesh>
      <mesh position={[0, -0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.12, 0.018, 6, 12]} />
        <meshStandardMaterial color="#30343a" roughness={0.5} metalness={0.6} />
      </mesh>
      {/* 尾焰 */}
      <mesh position={[0, -0.38, 0]}>
        <coneGeometry args={[0.09, 0.32, 8]} />
        <meshBasicMaterial
          color="#ffb04a"
          transparent
          opacity={0.85}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh position={[0, -0.52, 0]}>
        <coneGeometry args={[0.14, 0.28, 8]} />
        <meshBasicMaterial
          color="#ff6a18"
          transparent
          opacity={0.45}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

/** 航空爆弾。速度方向へ機首を向け、弾頭・安全帯・垂直尾翼を明確にする */
function VehicleBombModel({ x, y, z, previousX, previousY, previousZ }: ProjectileModelProps) {
  const quaternion = useMemo(() => {
    const result = new THREE.Quaternion();
    const direction = new THREE.Vector3(x - previousX, y - previousY, z - previousZ);
    if (direction.lengthSq() > 0.000001) {
      result.setFromUnitVectors(BOMB_MODEL_FORWARD, direction.normalize());
    }
    return result;
  }, [previousX, previousY, previousZ, x, y, z]);

  return (
    <group position={[x, y, z]} quaternion={quaternion}>
      <mesh>
        <capsuleGeometry args={[0.4, 0.72, 8, 12]} />
        <meshStandardMaterial color="#34383d" metalness={0.74} roughness={0.36} />
      </mesh>
      <mesh position={[0, -0.57, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.35, 0.34, 12]} />
        <meshStandardMaterial color="#272b30" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.4, 0.035, 6, 16]} />
        <meshStandardMaterial color="#b7372c" emissive="#4d0b07" emissiveIntensity={0.26} roughness={0.46} metalness={0.42} />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <boxGeometry args={[0.68, 0.34, 0.07]} />
        <meshStandardMaterial color="#b7372c" metalness={0.4} roughness={0.58} />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <boxGeometry args={[0.07, 0.34, 0.68]} />
        <meshStandardMaterial color="#b7372c" metalness={0.4} roughness={0.58} />
      </mesh>
    </group>
  );
}

function Tracer({
  start,
  end,
  color,
  radius,
  glowRadius,
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  color: string;
  radius: number;
  glowRadius?: number;
}) {
  const delta = end.clone().sub(start);
  const length = Math.max(0.08, delta.length() * 1.35);
  const midpoint = start.clone().addScaledVector(delta, 0.5);
  const dir = delta.lengthSq() > 0.000001 ? delta.normalize() : new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir,
  );
  const outer = glowRadius ?? radius * 2.1;

  return (
    <group position={midpoint} quaternion={quaternion}>
      {/* 外側のグロートレイル */}
      <mesh>
        <cylinderGeometry args={[outer, outer * 0.55, length, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.28}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* 明るいコア */}
      <mesh>
        <cylinderGeometry args={[radius, radius * 0.45, length, 8]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.92}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* 色付き中間層 */}
      <mesh>
        <cylinderGeometry args={[radius * 1.35, radius * 0.7, length, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.78}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}
