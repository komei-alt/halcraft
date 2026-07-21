// ロケットランチャーコンポーネント
// 肩載せのランチャーモデル、専用弾道、爆発VFX、範囲ダメージをまとめて担当

import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useWorldStore } from '../stores/useWorldStore';
import { useMobStore } from '../stores/useMobStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { onRemoteRocketExplode, onRemoteRocketFire, useMultiplayerStore } from '../stores/useMultiplayerStore';
import { useVehicleStore } from '../stores/useVehicleStore';
import { useGameStore } from '../stores/useGameStore';
import { useMasteryStore } from '../stores/useMasteryStore';
import { useStageChallengeStore } from '../stores/useStageChallengeStore';
import { useStageConditionStore } from '../stores/useStageConditionStore';
import { getCombatFocusModifier, useModeFlowStore } from '../stores/useModeFlowStore';
import { isTouchDevice } from '../utils/device';
import { consumeFireRocket } from '../utils/touchInput';
import { getGameCanvas, isDesktopGameplayInputActive } from '../utils/gameCanvas';
import { rayMarchProjectile, type RemotePlayerTarget } from '../utils/projectilePhysics';
import { spawnBlockBreakEffect, spawnCombatExplosion, spawnDamagePopup, spawnHitImpactEffect } from '../utils/effectTriggers';
import { playRocketDirectHitSound, playRocketExplosionSound, playRocketLaunchSound } from '../utils/sounds';
import { BLOCK_DEFS, BLOCK_IDS, type BlockId } from '../types/blocks';
import { getStageCombatStyleForItem } from '../types/stageCombatStyles';
import { checkProjectileHitVehicle } from '../utils/vehicleCombat';

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
const EXPLOSION_LIFETIME = 1.15;
const EXPLOSION_BLOCK_RADIUS = 2.8;
const EXPLOSION_MAX_DESTROY_BLOCKS = 80;
const EXPLOSION_SURFACE_OFFSET = 0.36;
const ROCKET_DIRECT_HIT_MIN_DISTANCE = 18;
const ROCKET_DIRECT_HIT_BONUS_DAMAGE = 10;
const SPARK_COUNT = 20;
const SMOKE_COUNT = 12;
const FIREBALL_COUNT = 6;
const DEBRIS_COUNT = 10;
const MAX_TRAIL_POINTS = 16;

/** 照準補正 */
const ROCKET_AIM_DISTANCE = 80;
const ROCKET_MIN_AIM_DISTANCE = 1.5;
const ROCKET_SAFE_LAUNCH_OFFSET = 1.35;
const ROCKET_MIN_CAMERA_CLEARANCE = 0.85;
const ROCKET_COLLISION_ARM_DISTANCE = 2.4;
const ROCKET_SELF_DAMAGE_SAFE_DISTANCE = 4.2;

/** 残煙・トレイル */
const TRAIL_INTERVAL = 0.018;
const TRAIL_PUFF_LIFETIME = 1.05;
const MAX_TRAIL_PUFFS = 120;

/** 武器のローカル配置 */
const SHOULDER_OFFSET = new THREE.Vector3(0.32, -0.16, -0.42);
const MUZZLE_LOCAL_OFFSET = new THREE.Vector3(0.18, 0.02, -1.56);
const BACKBLAST_LOCAL_OFFSET = new THREE.Vector3(0.18, 0.02, 0.16);
const MODEL_FORWARD = new THREE.Vector3(0, 0, -1);
const FIRST_PERSON_SKIN_COLOR = '#f0b686';
const FIRST_PERSON_SLEEVE_COLOR = '#3f78d4';

interface RocketProjectile {
  id: number;
  syncId: string;
  launchPos: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
  trailTimer: number;
  trailPoints: THREE.Vector3[];
  orientation: THREE.Quaternion;
  isRemote?: boolean;
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

interface ExplosionDebris extends ExplosionParticle {
  rotation: THREE.Euler;
  angularVel: THREE.Vector3;
}

interface ExplosionEffect {
  id: number;
  pos: THREE.Vector3;
  life: number;
  maxLife: number;
  sparks: ExplosionParticle[];
  smoke: ExplosionParticle[];
  fireballs: ExplosionParticle[];
  debris: ExplosionDebris[];
}

interface PendingExplosion {
  pos: THREE.Vector3;
  syncId: string;
  applyGameplay: boolean;
  notifyRemote: boolean;
  directHit?: RocketDirectHitContext;
  suppressSelfDamage?: boolean;
}

interface RocketDirectHitContext {
  targetType: 'mob' | 'player' | 'vehicle';
  targetId?: string;
  distance: number;
  precision: boolean;
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
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function calculateExplosionDamage(distance: number, radius = EXPLOSION_RADIUS, damageMultiplier = 1): number {
  if (distance >= radius) return 0;
  const falloff = 1 - distance / radius;
  const eased = falloff * falloff;
  return Math.max(1, Math.round(
    (EXPLOSION_MIN_DAMAGE + (EXPLOSION_DAMAGE - EXPLOSION_MIN_DAMAGE) * eased) * damageMultiplier,
  ));
}

function createExplosion(pos: THREE.Vector3, precisionDirectHit = false): ExplosionEffect {
  const sparks: ExplosionParticle[] = [];
  const smoke: ExplosionParticle[] = [];
  const fireballs: ExplosionParticle[] = [];
  const debris: ExplosionDebris[] = [];
  const sparkCount = precisionDirectHit ? SPARK_COUNT + 18 : SPARK_COUNT;
  const smokeCount = precisionDirectHit ? SMOKE_COUNT + 8 : SMOKE_COUNT;
  const fireballCount = precisionDirectHit ? FIREBALL_COUNT + 4 : FIREBALL_COUNT;
  const debrisCount = precisionDirectHit ? DEBRIS_COUNT + 8 : DEBRIS_COUNT;

  for (let i = 0; i < sparkCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.16) * Math.PI * 0.78;
    const speed = 8 + Math.random() * 16;
    const life = 0.38 + Math.random() * 0.48;

    sparks.push({
      pos: pos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.5,
      )),
      vel: new THREE.Vector3(
        Math.cos(theta) * Math.cos(phi) * speed,
        Math.sin(phi) * speed + 3.5,
        Math.sin(theta) * Math.cos(phi) * speed,
      ),
      life,
      maxLife: life,
      size: 0.12 + Math.random() * 0.24,
    });
  }

  for (let i = 0; i < fireballCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const speed = 1.8 + Math.random() * 4.6;
    const life = 0.34 + Math.random() * 0.36;

    fireballs.push({
      pos: pos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.7,
        (Math.random() - 0.35) * 0.55,
        (Math.random() - 0.5) * 0.7,
      )),
      vel: new THREE.Vector3(
        Math.cos(theta) * speed,
        1.4 + Math.random() * 3.8,
        Math.sin(theta) * speed,
      ),
      life,
      maxLife: life,
      size: 0.46 + Math.random() * 0.7,
    });
  }

  for (let i = 0; i < smokeCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const speed = 1.3 + Math.random() * 4.2;
    const life = 1.15 + Math.random() * 0.9;

    smoke.push({
      pos: pos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.1,
        Math.random() * 0.35,
        (Math.random() - 0.5) * 1.1,
      )),
      vel: new THREE.Vector3(
        Math.cos(theta) * speed * 0.48,
        1.6 + Math.random() * 2.6,
        Math.sin(theta) * speed * 0.48,
      ),
      life,
      maxLife: life,
      size: 1.0 + Math.random() * 1.55,
    });
  }

  for (let i = 0; i < debrisCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const speed = 3.0 + Math.random() * 8.5;
    const life = 0.95 + Math.random() * 0.75;

    debris.push({
      pos: pos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.25) * 0.55,
        (Math.random() - 0.5) * 0.8,
      )),
      vel: new THREE.Vector3(
        Math.cos(theta) * speed,
        3.2 + Math.random() * 5.8,
        Math.sin(theta) * speed,
      ),
      life,
      maxLife: life,
      size: 0.08 + Math.random() * 0.16,
      rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
      angularVel: new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
      ),
    });
  }

  return {
    id: nextExplosionId++,
    pos: pos.clone(),
    life: EXPLOSION_LIFETIME,
    maxLife: EXPLOSION_LIFETIME,
    sparks,
    smoke,
    fireballs,
    debris,
  };
}

function getVisibleExplosionPosition(hitPos: THREE.Vector3, normal: THREE.Vector3): THREE.Vector3 {
  if (normal.lengthSq() < 0.0001) return hitPos.clone();
  return hitPos.clone().addScaledVector(normal.clone().normalize(), EXPLOSION_SURFACE_OFFSET);
}

function createTrailPuff(pos: THREE.Vector3, vel: THREE.Vector3, hot = false): TrailPuff {
  const life = TRAIL_PUFF_LIFETIME * (hot ? 0.45 + Math.random() * 0.25 : 0.8 + Math.random() * 0.4);
  return {
    id: nextTrailId++,
    pos: pos.clone().add(new THREE.Vector3(
      (Math.random() - 0.5) * (hot ? 0.04 : 0.1),
      (Math.random() - 0.5) * (hot ? 0.04 : 0.1),
      (Math.random() - 0.5) * (hot ? 0.04 : 0.1),
    )),
    vel: vel.clone().multiplyScalar(hot ? -0.04 : -0.03).add(new THREE.Vector3(
      (Math.random() - 0.5) * (hot ? 0.55 : 0.45),
      (hot ? 0.15 : 0.4) + Math.random() * (hot ? 0.35 : 0.55),
      (Math.random() - 0.5) * (hot ? 0.55 : 0.45),
    )),
    life,
    maxLife: life,
    size: hot ? 0.18 + Math.random() * 0.16 : 0.38 + Math.random() * 0.36,
  };
}

export function RocketLauncher() {
  const { camera } = useThree();
  const phase = useGameStore((s) => s.phase);
  const currentStageId = useGameStore((s) => s.currentStageId);
  const isDead = usePlayerStore((s) => s.isDead);
  const fireRocket = usePlayerStore((s) => s.fireRocket);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const rocketCharge = usePlayerStore((s) => s.rocketCharge);
  const takeDamage = usePlayerStore((s) => s.takeDamage);
  const getBlock = useWorldStore((s) => s.getBlock);
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);
  const stageVisualStyle = useMemo(
    () => getStageCombatStyleForItem(currentStageId, 'rocket_launcher'),
    [currentStageId],
  );
  const rocketAccent = stageVisualStyle?.accent ?? '#ffb566';
  const rocketAccentSoft = stageVisualStyle ? '#fff0bd' : '#ffd7a6';
  const rocketTailColor = stageVisualStyle?.accent ?? '#ff9248';

  const isTouch = useRef(isTouchDevice());
  const fireRequested = useRef(false);
  const recoil = useRef(0);
  const idleTimer = useRef(0);
  const readyPulse = useRef(0);
  const previousRocketCharge = useRef(1);
  const muzzleFlashTimer = useRef(0);
  const backblastTimer = useRef(0);

  const weaponGroupRef = useRef<THREE.Group>(null);
  const chargeRingRef = useRef<THREE.Mesh>(null);
  const chargeCellRef = useRef<THREE.Mesh>(null);
  const chargeLightRef = useRef<THREE.PointLight>(null);

  const launcherPos = useRef(new THREE.Vector3());
  const launcherQuat = useRef(new THREE.Quaternion());
  const offsetWorld = useRef(new THREE.Vector3());
  const shootDir = useRef(new THREE.Vector3());
  const moveDir = useRef(new THREE.Vector3());
  const muzzleWorld = useRef(new THREE.Vector3());
  const launchWorld = useRef(new THREE.Vector3());
  const cameraAimDir = useRef(new THREE.Vector3());
  const aimPoint = useRef(new THREE.Vector3());
  const playerCenter = useRef(new THREE.Vector3());
  const localTiltQuat = useMemo(() => {
    const euler = new THREE.Euler(-0.03, -0.06, -0.02);
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
  const projectilesRef = useRef<RocketProjectile[]>([]);

  const syncProjectiles = useCallback((next: RocketProjectile[]) => {
    projectilesRef.current = next;
    setProjectiles(next);
  }, []);

  const destroyExplosionBlocks = useCallback((center: THREE.Vector3, radius = EXPLOSION_BLOCK_RADIUS) => {
    const world = useWorldStore.getState();
    const multi = useMultiplayerStore.getState();
    const radiusSq = radius * radius;
    const minX = Math.floor(center.x - radius);
    const maxX = Math.floor(center.x + radius);
    const minY = Math.floor(center.y - radius);
    const maxY = Math.floor(center.y + radius);
    const minZ = Math.floor(center.z - radius);
    const maxZ = Math.floor(center.z + radius);
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

  const applyExplosionDamage = useCallback((
    center: THREE.Vector3,
    directHit?: RocketDirectHitContext,
    suppressSelfDamage = false,
  ) => {
    const mobStore = useMobStore.getState();
    const multi = useMultiplayerStore.getState();
    const combatFocus = getCombatFocusModifier('rocket_launcher');
    const explosionRadius = EXPLOSION_RADIUS * combatFocus.rocketRadiusMultiplier;
    const damageMultiplier = combatFocus.damageMultiplier;
    let masteryHits = 0;

    if (!suppressSelfDamage) {
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
    }

    for (const mob of mobStore.mobs) {
      const mobCenter = new THREE.Vector3(mob.x, mob.y + 0.9, mob.z);
      const distance = mobCenter.distanceTo(center);
      const directTarget = directHit?.targetType === 'mob' && directHit.targetId === mob.id;
      const directBonus = directTarget
        ? directHit.precision ? ROCKET_DIRECT_HIT_BONUS_DAMAGE : Math.round(ROCKET_DIRECT_HIT_BONUS_DAMAGE * 0.5)
        : 0;
      const damage = calculateExplosionDamage(distance, explosionRadius, damageMultiplier) + directBonus;
      if (damage <= 0) continue;
      masteryHits += 1;

      // 爆発ノックバックはごく弱く（方向のみ・距離で減衰）
      const dist = Math.max(0.2, distance);
      const dirX = (mob.x - center.x) / dist;
      const dirZ = (mob.z - center.z) / dist;
      const kbForce = 0.55 * (1 - Math.min(1, distance / Math.max(0.1, explosionRadius)));
      multi.sendMobDamage(mob.id, damage, dirX * kbForce, dirZ * kbForce);
      mobStore.damageMob(mob.id, damage, dirX * kbForce, dirZ * kbForce);
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
        directTarget || damage >= EXPLOSION_DAMAGE * damageMultiplier * 0.7,
      );
      spawnDamagePopup(damage, mob.x, mob.y + 1.1, mob.z, directTarget || damage >= EXPLOSION_DAMAGE * damageMultiplier * 0.75);
    }

    for (const [, player] of multi.remotePlayers) {
      if (player.isDead) continue;

      const playerBody = new THREE.Vector3(
        player.position[0],
        player.position[1] + PLAYER_HIT_HEIGHT * 0.5,
        player.position[2],
      );
      const distance = playerBody.distanceTo(center);
      const directTarget = directHit?.targetType === 'player' && directHit.targetId === player.id;
      const directBonus = directTarget
        ? directHit.precision ? ROCKET_DIRECT_HIT_BONUS_DAMAGE : Math.round(ROCKET_DIRECT_HIT_BONUS_DAMAGE * 0.5)
        : 0;
      const damage = calculateExplosionDamage(distance, explosionRadius, damageMultiplier) + directBonus;
      if (damage <= 0) continue;
      masteryHits += 1;

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
        directTarget,
      );
      spawnDamagePopup(damage, player.position[0], player.position[1] + 1.1, player.position[2], directTarget);
    }

    if (masteryHits > 0) {
      const directHitLabel = directHit?.precision ? '遠距離直撃' : directHit ? '直撃ヒット' : null;
      const directHitAmount = directHit?.precision
        ? 24 + masteryHits * 6
        : directHit
          ? 18 + masteryHits * 5
          : 10 + masteryHits * 5;
      const directHitCritical = Boolean(directHit) || masteryHits >= 3;
      useMasteryStore.getState().recordItemHit('rocket_launcher', {
        label: directHitLabel ?? (masteryHits >= 3 ? '大爆風ヒット' : '爆風ヒット'),
        amount: directHitAmount,
        critical: directHitCritical,
      });
      useStageChallengeStore.getState().recordWeaponHit('rocket_launcher', masteryHits);
      useStageConditionStore.getState().recordWeaponHit('rocket_launcher', masteryHits);
      useModeFlowStore.getState().recordCombatStyleHit(
        'rocket_launcher',
        directHit?.precision ? masteryHits + 1 : masteryHits,
        directHitCritical,
      );
    }
  }, [camera, takeDamage]);

  const spawnExplosionAt = useCallback((
    pos: THREE.Vector3,
    applyGameplay: boolean = true,
    directHit?: RocketDirectHitContext,
    suppressSelfDamage = false,
  ) => {
    if (applyGameplay) {
      const combatFocus = getCombatFocusModifier('rocket_launcher');
      destroyExplosionBlocks(pos, EXPLOSION_BLOCK_RADIUS * combatFocus.rocketRadiusMultiplier);
      applyExplosionDamage(pos, directHit, suppressSelfDamage);
      useStageChallengeStore.getState().recordDetonation();
      useStageConditionStore.getState().recordDetonation();
    }
    // 共有の高品質爆発FX（衝撃波・破片・煙・カメラシェイク込み）
    spawnCombatExplosion(pos.x, pos.y, pos.z, {
      style: directHit?.precision ? 'precision' : 'rocket',
      accent: rocketAccent,
      intensity: directHit?.precision ? 1.25 : directHit ? 1.1 : 1,
    });
    // 近距離向けの補助フラッシュ（共有FXと重ねて芯の明るさを足す）
    setExplosions((prev) => {
      const next = [...prev, createExplosion(pos, Boolean(directHit?.precision))];
      return next.slice(-4);
    });
    playRocketExplosionSound(pos.distanceTo(camera.position));
    if (directHit) {
      playRocketDirectHitSound(pos.distanceTo(camera.position), directHit.precision);
    }
  }, [applyExplosionDamage, camera, destroyExplosionBlocks, rocketAccent]);

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
    launchWorld.current.copy(camera.position).addScaledVector(cameraAimDir.current, ROCKET_SAFE_LAUNCH_OFFSET);
    if (launchWorld.current.distanceTo(camera.position) < ROCKET_MIN_CAMERA_CLEARANCE) {
      launchWorld.current.copy(camera.position).addScaledVector(cameraAimDir.current, ROCKET_MIN_CAMERA_CLEARANCE);
    }

    shootDir.current.copy(aimPoint.current).sub(launchWorld.current);
    if (shootDir.current.lengthSq() < ROCKET_MIN_AIM_DISTANCE * ROCKET_MIN_AIM_DISTANCE) {
      shootDir.current.copy(cameraAimDir.current);
    } else {
      shootDir.current.normalize();
      if (shootDir.current.dot(cameraAimDir.current) < 0.2) {
        shootDir.current.copy(cameraAimDir.current);
      }
    }

    const velocity = shootDir.current.clone().multiplyScalar(ROCKET_SPEED);
    const rocketId = `rocket_${nextRocketId}_${Math.round(performance.now() * 1000)}`;
    const projectile: RocketProjectile = {
      id: nextRocketId++,
      syncId: rocketId,
      launchPos: launchWorld.current.clone(),
      pos: launchWorld.current.clone(),
      vel: velocity,
      age: 0,
      maxAge: ROCKET_MAX_AGE,
      trailTimer: 0,
      trailPoints: [muzzleWorld.current.clone(), launchWorld.current.clone()],
      orientation: new THREE.Quaternion().setFromUnitVectors(MODEL_FORWARD, shootDir.current),
    };

    syncProjectiles([...projectilesRef.current.slice(-4), projectile]);
    recoil.current = 1;
    muzzleFlashTimer.current = 0.16;
    backblastTimer.current = 0.22;
    playRocketLaunchSound(muzzleWorld.current.distanceTo(camera.position));
    useMasteryStore.getState().recordItemUse('rocket_launcher');
    multi.sendRocketFire(
      rocketId,
      [launchWorld.current.x, launchWorld.current.y, launchWorld.current.z],
      [velocity.x, velocity.y, velocity.z],
    );
  }, [camera, fireRocket, getBlock, syncProjectiles]);

  useEffect(() => {
    const unsubscribeFire = onRemoteRocketFire((data) => {
      const startPos = new THREE.Vector3(data.pos[0], data.pos[1], data.pos[2]);
      const velocity = new THREE.Vector3(data.vel[0], data.vel[1], data.vel[2]);
      const direction = velocity.clone().normalize();
      if (direction.lengthSq() < 0.0001) direction.copy(MODEL_FORWARD);

      const projectile: RocketProjectile = {
        id: nextRocketId++,
        syncId: data.rocketId,
        launchPos: startPos.clone(),
        pos: startPos,
        vel: velocity,
        age: 0,
        maxAge: ROCKET_MAX_AGE,
        trailTimer: 0,
        trailPoints: [startPos.clone()],
        orientation: new THREE.Quaternion().setFromUnitVectors(MODEL_FORWARD, direction),
        isRemote: true,
      };

      const withoutDuplicate = projectilesRef.current.filter((p) => p.syncId !== data.rocketId);
      syncProjectiles([...withoutDuplicate.slice(-7), projectile]);
      playRocketLaunchSound(startPos.distanceTo(camera.position));
    });

    const unsubscribeExplode = onRemoteRocketExplode((data) => {
      const explosionPos = new THREE.Vector3(data.pos[0], data.pos[1], data.pos[2]);
      syncProjectiles(projectilesRef.current.filter((p) => p.syncId !== data.rocketId));
      spawnExplosionAt(explosionPos, false);
    });

    return () => {
      unsubscribeFire();
      unsubscribeExplode();
    };
  }, [camera, spawnExplosionAt, syncProjectiles]);

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

    idleTimer.current += dt;
    recoil.current = Math.max(0, recoil.current - dt * 5.6);
    readyPulse.current = Math.max(0, readyPulse.current - dt * 2.4);
    muzzleFlashTimer.current = Math.max(0, muzzleFlashTimer.current - dt);
    backblastTimer.current = Math.max(0, backblastTimer.current - dt);
    if (rocketCharge >= 0.99 && previousRocketCharge.current < 0.99) {
      readyPulse.current = 1;
    }
    previousRocketCharge.current = rocketCharge;

    if (weaponGroupRef.current) {
      const readyBob = rocketCharge >= 0.99 ? Math.sin(idleTimer.current * 4.8) * 0.005 : 0;
      offsetWorld.current.copy(SHOULDER_OFFSET);
      offsetWorld.current.x += Math.sin(idleTimer.current * 0.92) * 0.007;
      offsetWorld.current.y += Math.sin(idleTimer.current * 1.38) * 0.01 + readyBob;
      offsetWorld.current.z += recoil.current * 0.12;
      offsetWorld.current.y -= recoil.current * 0.025;
      offsetWorld.current.applyQuaternion(camera.quaternion);

      launcherPos.current.copy(camera.position).add(offsetWorld.current);
      launcherQuat.current.copy(camera.quaternion).multiply(localTiltQuat);

      weaponGroupRef.current.position.copy(launcherPos.current);
      weaponGroupRef.current.quaternion.copy(launcherQuat.current);
    }

    if (chargeRingRef.current) {
      const material = chargeRingRef.current.material as THREE.MeshBasicMaterial;
      const readyGlow = rocketCharge >= 0.99 ? 0.45 + Math.sin(idleTimer.current * 8) * 0.12 : 0;
      const pulse = readyPulse.current;
      chargeRingRef.current.rotation.z += dt * (1.8 + rocketCharge * 5.5 + pulse * 5);
      chargeRingRef.current.scale.setScalar(1 + pulse * 0.28);
      material.color.set(rocketAccent);
      material.opacity = 0.22 + rocketCharge * 0.34 + readyGlow + pulse * 0.18;
    }
    if (chargeCellRef.current) {
      const material = chargeCellRef.current.material as THREE.MeshBasicMaterial;
      chargeCellRef.current.scale.x = Math.max(0.08, rocketCharge);
      material.color.set(rocketAccentSoft);
      material.opacity = 0.32 + rocketCharge * 0.58 + readyPulse.current * 0.1;
    }
    if (chargeLightRef.current) {
      chargeLightRef.current.color.set(rocketAccent);
      chargeLightRef.current.intensity = 0.8 + rocketCharge * 2.6 + readyPulse.current * 3.4;
    }

    const canUseLauncher = phase === 'playing'
      && activeVehicle === null
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
    const explosionsToSpawn: PendingExplosion[] = [];

    if (projectilesRef.current.length > 0) {
      const alive: RocketProjectile[] = [];
      const currentMobs = useMobStore.getState().mobs;

      for (const projectile of projectilesRef.current) {
        projectile.age += dt;
        if (projectile.age >= projectile.maxAge) {
          if (!projectile.isRemote) {
            explosionsToSpawn.push({
              pos: projectile.pos.clone(),
              syncId: projectile.syncId,
              applyGameplay: true,
              notifyRemote: true,
            });
          }
          continue;
        }

        projectile.trailTimer += dt;
        while (projectile.trailTimer >= TRAIL_INTERVAL) {
          projectile.trailTimer -= TRAIL_INTERVAL;
          trailSpawns.push(createTrailPuff(projectile.pos, projectile.vel, false));
          if (Math.random() < 0.55) {
            trailSpawns.push(createTrailPuff(projectile.pos, projectile.vel, true));
          }
        }

        projectile.vel.y -= ROCKET_GRAVITY * dt;
        moveDir.current.copy(projectile.vel).normalize();
        const moveDist = projectile.vel.length() * dt;
        const traveledDistance = projectile.launchPos.distanceTo(projectile.pos);

        if (projectile.isRemote) {
          projectile.pos.addScaledVector(moveDir.current, moveDist);
          projectile.orientation.setFromUnitVectors(MODEL_FORWARD, moveDir.current);
          projectile.trailPoints.push(projectile.pos.clone());
          if (projectile.trailPoints.length > MAX_TRAIL_POINTS) projectile.trailPoints.shift();
          alive.push(projectile);
          continue;
        }

        if (traveledDistance < ROCKET_COLLISION_ARM_DISTANCE) {
          // 発射直後は肩元や目の前のブロック判定で即爆発しないよう安全距離を取る
          projectile.pos.addScaledVector(moveDir.current, moveDist);
          projectile.orientation.setFromUnitVectors(MODEL_FORWARD, moveDir.current);
          projectile.trailPoints.push(projectile.pos.clone());
          if (projectile.trailPoints.length > MAX_TRAIL_POINTS) projectile.trailPoints.shift();
          alive.push(projectile);
          continue;
        }

        const fromX = projectile.pos.x;
        const fromY = projectile.pos.y;
        const fromZ = projectile.pos.z;
        const hitResult = rayMarchProjectile(
          projectile.pos,
          moveDir.current,
          moveDist,
          getBlock,
          currentMobs,
          ROCKET_HIT_RADIUS,
          {
            remotePlayers: useMultiplayerStore.getState().remotePlayers as Map<string, RemotePlayerTarget>,
            playerHitRadius: PLAYER_HIT_RADIUS,
            playerHitHeight: PLAYER_HIT_HEIGHT,
          },
        );

        if (hitResult.type !== 'none') {
          const hitDistance = projectile.launchPos.distanceTo(hitResult.hitPos);
          const suppressSelfDamage = hitDistance < ROCKET_SELF_DAMAGE_SAFE_DISTANCE;
          const directHit = hitResult.type === 'mob' || hitResult.type === 'player'
            ? {
                targetType: hitResult.type,
                targetId: hitResult.targetId,
                distance: hitDistance,
                precision: hitDistance >= ROCKET_DIRECT_HIT_MIN_DISTANCE,
              } satisfies RocketDirectHitContext
            : undefined;
          explosionsToSpawn.push({
            pos: hitResult.type === 'block'
              ? getVisibleExplosionPosition(hitResult.hitPos, hitResult.normal)
              : hitResult.hitPos.clone(),
            syncId: projectile.syncId,
            applyGameplay: true,
            notifyRemote: true,
            directHit,
            suppressSelfDamage,
          });
          continue;
        }

        // ロケットの乗り物ヒット判定（線分スイープ）
        const vehicleHit = checkProjectileHitVehicle(
          projectile.pos.x, projectile.pos.y, projectile.pos.z,
          undefined,
          fromX, fromY, fromZ,
        );
        if (vehicleHit) {
          const hitDistance = projectile.launchPos.distanceTo(
            new THREE.Vector3(vehicleHit.hitX, vehicleHit.hitY, vehicleHit.hitZ),
          );
          const precision = hitDistance >= ROCKET_DIRECT_HIT_MIN_DISTANCE;
          useVehicleStore.getState().damageVehicle(vehicleHit.type, 25);
          useMasteryStore.getState().recordItemHit('rocket_launcher', {
            label: precision ? '遠距離直撃' : '直撃ヒット',
            amount: precision ? 30 : 18,
            critical: true,
          });
          useStageChallengeStore.getState().recordWeaponHit('rocket_launcher');
          useStageConditionStore.getState().recordWeaponHit('rocket_launcher');
          useModeFlowStore.getState().recordCombatStyleHit('rocket_launcher', precision ? 2 : 1, true);
          explosionsToSpawn.push({
            pos: new THREE.Vector3(vehicleHit.hitX, vehicleHit.hitY, vehicleHit.hitZ),
            syncId: projectile.syncId,
            applyGameplay: true,
            notifyRemote: true,
            directHit: {
              targetType: 'vehicle',
              distance: hitDistance,
              precision,
            },
            suppressSelfDamage: hitDistance < ROCKET_SELF_DAMAGE_SAFE_DISTANCE,
          });
          continue;
        }

        projectile.orientation.setFromUnitVectors(MODEL_FORWARD, moveDir.current);
        projectile.trailPoints.push(projectile.pos.clone());
        if (projectile.trailPoints.length > MAX_TRAIL_POINTS) projectile.trailPoints.shift();
        alive.push(projectile);
      }

      syncProjectiles(alive);
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
            spark.vel.y -= 17 * dt;
            spark.vel.multiplyScalar(0.955);
            spark.pos.addScaledVector(spark.vel, dt);
          }

          for (const fireball of explosion.fireballs) {
            fireball.life -= dt;
            if (fireball.life <= 0) continue;
            fireball.vel.y -= 4.5 * dt;
            fireball.vel.multiplyScalar(0.92);
            fireball.pos.addScaledVector(fireball.vel, dt);
          }

          for (const smoke of explosion.smoke) {
            smoke.life -= dt;
            if (smoke.life <= 0) continue;
            smoke.vel.multiplyScalar(0.985);
            smoke.vel.y += 0.9 * dt;
            smoke.pos.addScaledVector(smoke.vel, dt);
          }

          for (const debris of explosion.debris) {
            debris.life -= dt;
            if (debris.life <= 0) continue;
            debris.vel.y -= 18 * dt;
            debris.vel.multiplyScalar(0.975);
            debris.pos.addScaledVector(debris.vel, dt);
            debris.rotation.x += debris.angularVel.x * dt;
            debris.rotation.y += debris.angularVel.y * dt;
            debris.rotation.z += debris.angularVel.z * dt;
          }

          const hasLiveParticles = explosion.sparks.some((spark) => spark.life > 0)
            || explosion.fireballs.some((fireball) => fireball.life > 0)
            || explosion.smoke.some((smoke) => smoke.life > 0)
            || explosion.debris.some((debris) => debris.life > 0);

          if (explosion.life > 0 || hasLiveParticles) {
            next.push(explosion);
          }
        }

        return next;
      });
    }

    if (explosionsToSpawn.length > 0) {
      const multi = useMultiplayerStore.getState();
      for (const explosion of explosionsToSpawn) {
        spawnExplosionAt(
          explosion.pos,
          explosion.applyGameplay,
          explosion.directHit,
          explosion.suppressSelfDamage,
        );
        if (explosion.notifyRemote) {
          multi.sendRocketExplode(
            explosion.syncId,
            [explosion.pos.x, explosion.pos.y, explosion.pos.z],
          );
        }
      }
    }
  });

  const showWeapon = phase === 'playing'
    && activeVehicle === null
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

          {/* 前方保持リング — 穴の開いたトーラスで砲身の開口を残す */}
          <mesh position={[0.18, 0.02, -1.35]}>
            <torusGeometry args={[0.145, 0.025, 8, 24]} />
            <meshStandardMaterial color="#2b2724" roughness={0.65} metalness={0.3} />
          </mesh>

          {/* 砲口リングと暗い内筒。正面から蓋付き円柱に見えない構造 */}
          <mesh position={[0.18, 0.02, -1.53]}>
            <torusGeometry args={[0.13, 0.025, 8, 24]} />
            <meshStandardMaterial color="#181614" roughness={0.55} metalness={0.4} emissive="#331100" emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[0.18, 0.02, -1.43]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.108, 0.108, 0.25, 16, 1, true]} />
            <meshStandardMaterial color="#080909" roughness={0.5} metalness={0.58} side={THREE.DoubleSide} />
          </mesh>

          {/* 後部ベンチュリ。バックブラストの出口を広げ、肩載せ火器らしい輪郭にする */}
          <mesh position={[0.18, 0.02, 0.045]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.205, 0.22, 16, 1, true]} />
            <meshStandardMaterial color="#292521" roughness={0.64} metalness={0.32} side={THREE.DoubleSide} />
          </mesh>

          {/* チューブ保持バンド */}
          {[-1.05, -0.36].map((z) => (
            <mesh key={z} position={[0.18, 0.02, z]}>
              <torusGeometry args={[0.153, 0.018, 7, 18]} />
              <meshStandardMaterial color="#877c68" roughness={0.46} metalness={0.55} />
            </mesh>
          ))}

          {/* 肩当て */}
          <mesh position={[0.02, -0.02, 0.08]} rotation={[0.08, 0, -0.08]}>
            <boxGeometry args={[0.28, 0.22, 0.2]} />
            <meshStandardMaterial color="#3e342f" roughness={0.84} metalness={0.12} />
          </mesh>

          {/* 右腕: トリガーグリップを握る */}
          <mesh position={[0.32, -0.25, -0.18]} rotation={[-0.68, 0.08, -0.2]}>
            <boxGeometry args={[0.15, 0.48, 0.15]} />
            <meshStandardMaterial color={FIRST_PERSON_SLEEVE_COLOR} roughness={0.78} />
          </mesh>
          <mesh position={[0.15, -0.05, -0.48]} rotation={[-0.1, 0.02, -0.08]}>
            <boxGeometry args={[0.18, 0.16, 0.16]} />
            <meshStandardMaterial color={FIRST_PERSON_SKIN_COLOR} roughness={0.72} />
          </mesh>

          {/* 左腕: 前方グリップを支えて肩撃ち姿勢にする */}
          <mesh position={[-0.1, -0.18, -0.72]} rotation={[-0.78, -0.16, 0.34]}>
            <boxGeometry args={[0.14, 0.52, 0.14]} />
            <meshStandardMaterial color={FIRST_PERSON_SLEEVE_COLOR} roughness={0.78} />
          </mesh>
          <mesh position={[0.17, 0.02, -0.98]} rotation={[-0.08, 0.08, 0.04]}>
            <boxGeometry args={[0.17, 0.15, 0.16]} />
            <meshStandardMaterial color={FIRST_PERSON_SKIN_COLOR} roughness={0.72} />
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
          {/* トリガーガード */}
          <mesh position={[0.15, -0.285, -0.4]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.064, 0.011, 6, 14, Math.PI]} />
            <meshStandardMaterial color="#17191a" roughness={0.42} metalness={0.62} />
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

          {/* 簡易照準器 */}
          <mesh position={[0.18, 0.23, -0.68]}>
            <boxGeometry args={[0.08, 0.08, 0.38]} />
            <meshStandardMaterial color="#17191a" roughness={0.5} metalness={0.55} />
          </mesh>
          <mesh position={[0.18, 0.28, -0.96]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.035, 12]} />
            <meshStandardMaterial color="#20394a" emissive={rocketAccentSoft} emissiveIntensity={0.28} roughness={0.3} metalness={0.48} />
          </mesh>

          {/* 装填状態が見えるエネルギーリング */}
          <mesh ref={chargeRingRef} position={[0.18, 0.28, -0.96]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.074, 0.006, 8, 28]} />
            <meshBasicMaterial
              color={rocketAccent}
              transparent
              opacity={0.52}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
              />
          </mesh>
          <mesh ref={chargeCellRef} position={[0.18, 0.145, -0.33]}>
            <boxGeometry args={[0.22, 0.024, 0.04]} />
            <meshBasicMaterial
              color={rocketAccentSoft}
              transparent
              opacity={0.75}
              depthWrite={false}
            toneMapped={false}
            />
          </mesh>
          <pointLight
            ref={chargeLightRef}
            position={[0.18, 0.18, -0.58]}
            color={rocketAccent}
            intensity={1.6}
            distance={2.7}
            decay={2.2}
          />

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
              color={rocketAccent}
              transparent
              opacity={clamp01(muzzleFlashTimer.current * 8)}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            toneMapped={false}
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
              color={rocketTailColor}
              transparent
              opacity={clamp01(backblastTimer.current * 6)}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            toneMapped={false}
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
            <cylinderGeometry args={[0.045, 0.06, 0.38, 12]} />
            <meshStandardMaterial color="#8b8f93" roughness={0.42} metalness={0.68} emissive="#2a1a08" emissiveIntensity={0.28} />
          </mesh>
          <mesh position={[0, 0, -0.22]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.06, 0.17, 12]} />
            <meshStandardMaterial color="#c67b34" roughness={0.34} metalness={0.55} emissive="#79310f" emissiveIntensity={0.42} />
          </mesh>
          <mesh position={[0, 0, 0.19]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.032, 0.05, 0.07, 10]} />
            <meshStandardMaterial color="#2f2f2f" roughness={0.6} metalness={0.4} emissive={rocketTailColor} emissiveIntensity={0.55} />
          </mesh>
          <mesh position={[0.055, 0, 0.08]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.02, 0.1, 0.08]} />
            <meshStandardMaterial color="#5a5a5a" roughness={0.58} metalness={0.42} />
          </mesh>
          <mesh position={[-0.055, 0, 0.08]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.02, 0.1, 0.08]} />
            <meshStandardMaterial color="#5a5a5a" roughness={0.58} metalness={0.42} />
          </mesh>
          {/* エンジン噴射コア */}
          <sprite position={[0, 0, 0.28]} scale={[0.34, 0.34, 1]}>
            <spriteMaterial
              map={glowTexture}
              color={rocketAccentSoft}
              transparent
              opacity={0.95}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </sprite>
          {/* エンジン噴射の外側ハロー */}
          <sprite position={[0, 0, 0.38]} scale={[0.55, 0.42, 1]}>
            <spriteMaterial
              map={glowTexture}
              color={rocketTailColor}
              transparent
              opacity={0.72}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </sprite>
          {/* 長い噴射フレア */}
          <sprite position={[0, 0, 0.55]} scale={[0.28, 0.72, 1]}>
            <spriteMaterial
              map={glowTexture}
              color={rocketTailColor}
              transparent
              opacity={0.48}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </sprite>
          <pointLight position={[0, 0, 0.2]} color={rocketTailColor} intensity={3.6} distance={8} decay={2} />
        </group>
      ))}

      {projectiles.map((projectile) => (
        projectile.trailPoints.map((point, index) => {
          const ratio = (index + 1) / projectile.trailPoints.length;
          const coreScale = 0.1 + ratio * 0.28;
          const glowScale = 0.18 + ratio * 0.42;
          return (
            <group key={`${projectile.id}_trail_${index}`}>
              <sprite
                position={[point.x, point.y, point.z]}
                scale={[coreScale, coreScale, 1]}
              >
                <spriteMaterial
                  map={glowTexture}
                  color={rocketAccentSoft}
                  transparent
                  opacity={0.18 + ratio * 0.55}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </sprite>
              <sprite
                position={[point.x, point.y, point.z]}
                scale={[glowScale, glowScale, 1]}
              >
                <spriteMaterial
                  map={glowTexture}
                  color={rocketAccent}
                  transparent
                  opacity={0.08 + ratio * 0.28}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  toneMapped={false}
                />
              </sprite>
            </group>
          );
        })
      ))}

      {trailPuffs.map((puff) => {
        const ratio = puff.life / puff.maxLife;
        const isHot = puff.size < 0.32;
        const scale = puff.size * (isHot ? 1.1 + (1 - ratio) * 1.2 : 1.25 + (1 - ratio) * 2.1);
        return (
          <sprite
            key={puff.id}
            position={[puff.pos.x, puff.pos.y, puff.pos.z]}
            scale={[scale, scale, 1]}
          >
            <spriteMaterial
              map={isHot ? glowTexture : smokeTexture}
              color={isHot ? rocketTailColor : '#a89c93'}
              transparent
              opacity={isHot ? ratio * 0.62 : ratio * 0.42}
              depthWrite={false}
              blending={isHot ? THREE.AdditiveBlending : THREE.NormalBlending}
              toneMapped={false}
            />
          </sprite>
        );
      })}

      {explosions.map((explosion) => {
        const ratio = clamp01(explosion.life / explosion.maxLife);
        const progress = 1 - ratio;
        const flashScale = 1.0 + progress * 5.8;
        const shockwaveScale = 0.9 + progress * EXPLOSION_RADIUS * 0.86;
        const smokeDomeScale = 2.5 + progress * 4.2;
        const flashOpacity = progress < 0.32 ? (1 - progress / 0.32) * 0.86 : 0;
        const emberOpacity = ratio * 0.5;

        return (
          <group key={explosion.id} position={[explosion.pos.x, explosion.pos.y, explosion.pos.z]}>
            <pointLight
              color={rocketAccent}
              intensity={ratio * (stageVisualStyle ? 13 : 11)}
              distance={20}
              decay={2.1}
            />

            <mesh scale={[flashScale, flashScale, flashScale]}>
              <sphereGeometry args={[0.42, 24, 24]} />
              <meshBasicMaterial
                color={rocketAccentSoft}
                transparent
                opacity={flashOpacity}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              toneMapped={false}
              />
            </mesh>

            <mesh scale={[smokeDomeScale, smokeDomeScale * 0.62, smokeDomeScale]}>
              <sphereGeometry args={[0.24, 24, 16]} />
              <meshBasicMaterial
                color="#4b403a"
                transparent
                opacity={ratio * 0.16}
                depthWrite={false}
              />
            </mesh>

            <mesh scale={[2.1 + progress * 2.8, 2.1 + progress * 2.8, 2.1 + progress * 2.8]}>
              <sphereGeometry args={[0.18, 20, 20]} />
              <meshBasicMaterial
                color={rocketTailColor}
                transparent
                opacity={emberOpacity}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              toneMapped={false}
              />
            </mesh>

            <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[shockwaveScale, shockwaveScale, shockwaveScale]}>
              <ringGeometry args={[0.7, 1, 40]} />
              <meshBasicMaterial
                color={rocketAccent}
                transparent
                opacity={ratio * 0.52}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>

            <mesh rotation={[0, Math.PI / 2, 0]} scale={[shockwaveScale * 0.72, shockwaveScale * 0.72, shockwaveScale * 0.72]}>
              <ringGeometry args={[0.7, 1, 36]} />
              <meshBasicMaterial
                color={rocketAccentSoft}
                transparent
                opacity={ratio * 0.24}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>

            <mesh rotation={[0.7, 0.45, 0.15]} scale={[shockwaveScale * 0.56, shockwaveScale * 0.56, shockwaveScale * 0.56]}>
              <ringGeometry args={[0.6, 1, 32]} />
              <meshBasicMaterial
                color={rocketTailColor}
                transparent
                opacity={ratio * 0.28}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>

            {explosion.fireballs.map((fireball, index) => {
              if (fireball.life <= 0) return null;
              const fireRatio = fireball.life / fireball.maxLife;
              const scale = fireball.size * (0.8 + (1 - fireRatio) * 1.3);
              return (
                <sprite
                  key={`fireball_${explosion.id}_${index}`}
                  position={[fireball.pos.x - explosion.pos.x, fireball.pos.y - explosion.pos.y, fireball.pos.z - explosion.pos.z]}
                  scale={[scale, scale, 1]}
                >
                  <spriteMaterial
                    map={glowTexture}
                    color={index % 2 === 0 ? rocketAccentSoft : rocketTailColor}
                    transparent
                    opacity={fireRatio * 0.82}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                  toneMapped={false}
                  />
                </sprite>
              );
            })}

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
                    color={rocketAccent}
                    transparent
                    opacity={sparkRatio * 0.9}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                  toneMapped={false}
                  />
                </sprite>
              );
            })}

            {explosion.debris.map((debris, index) => {
              if (debris.life <= 0) return null;
              const debrisRatio = debris.life / debris.maxLife;
              const scale = debris.size * (0.8 + debrisRatio * 1.2);
              return (
                <mesh
                  key={`debris_${explosion.id}_${index}`}
                  position={[debris.pos.x - explosion.pos.x, debris.pos.y - explosion.pos.y, debris.pos.z - explosion.pos.z]}
                  rotation={debris.rotation}
                  scale={[scale, scale * (0.5 + (index % 3) * 0.25), scale]}
                >
                  <boxGeometry args={[1, 1, 1]} />
                  <meshStandardMaterial
                    color={index % 2 === 0 ? '#6b4a32' : '#3e322b'}
                    roughness={0.88}
                    metalness={0.04}
                    transparent
                    opacity={Math.min(1, debrisRatio * 1.25)}
                    depthWrite={false}
                  />
                </mesh>
              );
            })}

            {explosion.smoke.map((smoke, index) => {
              if (smoke.life <= 0) return null;
              const smokeRatio = smoke.life / smoke.maxLife;
              const scale = smoke.size * (1.2 + (1 - smokeRatio) * 2.25);
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
                    opacity={smokeRatio * 0.5}
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
