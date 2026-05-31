// 徒歩用機関銃
// ロケットランチャーと同じカメラ装備枠で、弱めの連射弾とマズルフレアを扱う

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useVehicleStore } from '../stores/useVehicleStore';
import { useWorldStore } from '../stores/useWorldStore';
import { useMobStore } from '../stores/useMobStore';
import { useMultiplayerStore } from '../stores/useMultiplayerStore';
import { useMasteryStore } from '../stores/useMasteryStore';
import { useStageChallengeStore } from '../stores/useStageChallengeStore';
import { useStageConditionStore } from '../stores/useStageConditionStore';
import { getCombatFocusModifier, useModeFlowStore } from '../stores/useModeFlowStore';
import { useGameStore } from '../stores/useGameStore';
import { getMasteryBonus } from '../types/masteryPerks';
import { getMasteryTechniqueBonus } from '../types/masteryTechniquePerks';
import { getStageCombatModifier, getStageCombatStyleForItem } from '../types/stageCombatStyles';
import { mobileActions } from '../utils/touchInput';
import { isDesktopGameplayInputActive } from '../utils/gameCanvas';
import { rayMarchProjectile, type RemotePlayerTarget } from '../utils/projectilePhysics';
import { spawnDamagePopup, spawnHitImpactEffect } from '../utils/effectTriggers';
import { playBulletImpactSound, playMachineGunSound } from '../utils/sounds';
import { cloneSceneWithMaterials } from './vehicles/modelUtils';
import { checkProjectileHitVehicle } from '../utils/vehicleCombat';

const MACHINE_GUN_MODEL_PATH = '/models/2026-05-01/machine-gun.glb';
const BULLET_DAMAGE = 1;
const FIRE_COOLDOWN = 0.16;
const BULLET_SPEED = 115;
const BULLET_MAX_AGE = 0.82;
const BULLET_GRAVITY = 2.0;
const BULLET_RANGE = 34;
const MOB_HIT_RADIUS = 0.85;
const PLAYER_HIT_RADIUS = 0.48;
const PLAYER_HIT_HEIGHT = 1.7;
const HIP_MODEL_OFFSET = new THREE.Vector3(0.32, -0.32, -0.7);
const SCOPED_MODEL_OFFSET = new THREE.Vector3(0.05, -0.25, -0.64);
const MUZZLE_LOCAL = new THREE.Vector3(0, -0.17, -1.18);
const MODEL_ROTATION = new THREE.Euler(0.02, Math.PI - 0.02, -0.03, 'YXZ');
const HIP_SPREAD = 0.026;
const SCOPED_SPREAD = 0.008;
const SCOPED_FOV = 42;
const FOV_LERP_RATE = 14;
const FIRST_PERSON_SKIN_COLOR = '#f0b686';
const FIRST_PERSON_SLEEVE_COLOR = '#3f78d4';

interface BulletProjectile {
  id: number;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  createdAt: number;
  scoped: boolean;
}

let nextBulletId = 0;

function getMachineGunMasteryBonus() {
  const level = useMasteryStore.getState().items.machine_gun?.level ?? 1;
  return getMasteryBonus('machine_gun', level);
}

function getMachineGunTechniqueBonus() {
  return getMasteryTechniqueBonus('machine_gun', useMasteryStore.getState().items.machine_gun);
}

export function PlayerMachineGun() {
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const isDead = usePlayerStore((s) => s.isDead);
  const currentStageId = useGameStore((s) => s.currentStageId);
  const { camera } = useThree();
  const gltf = useGLTF(MACHINE_GUN_MODEL_PATH);
  const model = useMemo(() => cloneSceneWithMaterials(gltf.scene), [gltf.scene]);
  const weaponRef = useRef<THREE.Group>(null);
  const barrelGroupRef = useRef<THREE.Group>(null);
  const flashCoreRef = useRef<THREE.Mesh>(null);
  const flashGlowRef = useRef<THREE.Mesh>(null);
  const heatBandRef = useRef<THREE.Mesh>(null);
  const heatLightRef = useRef<THREE.PointLight>(null);
  const flashLightRef = useRef<THREE.PointLight>(null);
  const isMouseDown = useRef(false);
  const isRightMouseDown = useRef(false);
  const lastFireTime = useRef(0);
  const idleTimer = useRef(0);
  const recoilKick = useRef(0);
  const barrelSpin = useRef(0);
  const heatGlow = useRef(0);
  const muzzleWorld = useRef(new THREE.Vector3());
  const aimPoint = useRef(new THREE.Vector3());
  const aimDir = useRef(new THREE.Vector3());
  const shootDir = useRef(new THREE.Vector3());
  const offsetWorld = useRef(new THREE.Vector3());
  const rightWorld = useRef(new THREE.Vector3());
  const forwardWorld = useRef(new THREE.Vector3());
  const flashTimer = useRef(0);
  const baseFov = useRef<number | null>(null);
  const scopeVisibleRef = useRef(false);
  const [bullets, setBullets] = useState<BulletProjectile[]>([]);
  const [scopeVisible, setScopeVisible] = useState(false);
  const stageVisualStyle = useMemo(
    () => getStageCombatStyleForItem(currentStageId, 'machine_gun'),
    [currentStageId],
  );
  const muzzleCoreColor = useMemo(() => {
    const color = new THREE.Color(stageVisualStyle?.accent ?? '#fff0a0');
    if (stageVisualStyle) color.lerp(new THREE.Color('#ffffff'), 0.48);
    return color;
  }, [stageVisualStyle]);
  const muzzleGlowColor = useMemo(
    () => new THREE.Color(stageVisualStyle?.accent ?? '#ff8b2d'),
    [stageVisualStyle],
  );
  const tracerColor = stageVisualStyle?.accent ?? '#ffd36a';

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) isMouseDown.current = true;
      if (e.button === 2 && usePlayerStore.getState().equippedItem === 'machine_gun') {
        isRightMouseDown.current = true;
        e.preventDefault();
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) isMouseDown.current = false;
      if (e.button === 2) isRightMouseDown.current = false;
    };
    const onContextMenu = (e: MouseEvent) => {
      if (usePlayerStore.getState().equippedItem === 'machine_gun') {
        e.preventDefault();
      }
    };
    const onBlur = () => {
      isMouseDown.current = false;
      isRightMouseDown.current = false;
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
  }, []);

  useEffect(() => () => {
    if (camera instanceof THREE.PerspectiveCamera && baseFov.current !== null) {
      camera.fov = baseFov.current;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  const fire = useCallback(() => {
    const now = performance.now() / 1000;
    const stageStyle = getStageCombatModifier(useGameStore.getState().currentStageId, 'machine_gun');
    const techniqueBonus = getMachineGunTechniqueBonus();
    const combatFocus = getCombatFocusModifier('machine_gun');
    const fireCooldown = FIRE_COOLDOWN
      * stageStyle.machineGunCooldownMultiplier
      * techniqueBonus.machineGunCooldownMultiplier
      * combatFocus.machineGunCooldownMultiplier;
    if (now - lastFireTime.current < fireCooldown) return;
    if (useVehicleStore.getState().isInVehicle()) return;
    lastFireTime.current = now;

    aimDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const getBlock = useWorldStore.getState().getBlock;
    const mobs = useMobStore.getState().mobs;
    const multi = useMultiplayerStore.getState();
    const aimHit = rayMarchProjectile(
      camera.position.clone(),
      aimDir.current.clone(),
      BULLET_RANGE,
      getBlock,
      mobs,
      MOB_HIT_RADIUS,
      {
        remotePlayers: multi.remotePlayers as Map<string, RemotePlayerTarget>,
        playerHitRadius: PLAYER_HIT_RADIUS,
        playerHitHeight: PLAYER_HIT_HEIGHT,
      },
    );

    if (aimHit.type !== 'none') {
      aimPoint.current.copy(aimHit.hitPos);
    } else {
      aimPoint.current.copy(camera.position).addScaledVector(aimDir.current, BULLET_RANGE);
    }

    if (weaponRef.current) {
      weaponRef.current.updateWorldMatrix(true, false);
      muzzleWorld.current.copy(MUZZLE_LOCAL).applyMatrix4(weaponRef.current.matrixWorld);
    } else {
      muzzleWorld.current.copy(camera.position).addScaledVector(aimDir.current, 0.7);
      muzzleWorld.current.y -= 0.22;
    }

    shootDir.current.copy(aimPoint.current).sub(muzzleWorld.current);
    if (shootDir.current.lengthSq() < 0.01 || shootDir.current.dot(aimDir.current) < 0.15) {
      shootDir.current.copy(aimDir.current);
    } else {
      shootDir.current.normalize();
    }

    const scopedShot = isRightMouseDown.current && isDesktopGameplayInputActive();
    const masteryBonus = getMachineGunMasteryBonus();
    const spread = (scopedShot ? SCOPED_SPREAD : HIP_SPREAD)
      * masteryBonus.machineGunSpreadMultiplier
      * techniqueBonus.machineGunSpreadMultiplier
      * stageStyle.machineGunSpreadMultiplier
      * combatFocus.machineGunSpreadMultiplier;
    shootDir.current.x += (Math.random() - 0.5) * spread;
    shootDir.current.y += (Math.random() - 0.5) * spread;
    shootDir.current.z += (Math.random() - 0.5) * spread;
    shootDir.current.normalize();

    const startPos = muzzleWorld.current.clone();
    const vel = shootDir.current.clone().multiplyScalar(BULLET_SPEED);
    setBullets((prev) => [...prev.slice(-28), {
      id: nextBulletId++,
      pos: startPos.clone(),
      prev: startPos.clone(),
      vel,
      createdAt: now,
      scoped: scopedShot,
    }]);

    recoilKick.current = scopedShot ? 0.45 : 1;
    heatGlow.current = Math.min(1, heatGlow.current + (scopedShot ? 0.08 : 0.12));
    flashTimer.current = combatFocus.active ? 0.09 : scopedShot ? 0.08 : 0.065;
    playMachineGunSound(startPos.distanceTo(camera.position));
    useMasteryStore.getState().recordItemUse('machine_gun');
    multi.sendGunFire(
      [startPos.x, startPos.y, startPos.z],
      [shootDir.current.x, shootDir.current.y, shootDir.current.z],
      'left',
    );
  }, [camera]);

  useFrame((_, delta) => {
    idleTimer.current += delta;
    recoilKick.current = Math.max(0, recoilKick.current - delta * 12);
    heatGlow.current = Math.max(0, heatGlow.current - delta * 0.9);
    const visible = equippedItem === 'machine_gun' && !isDead && !useVehicleStore.getState().isInVehicle();
    const scoped = visible && isRightMouseDown.current && isDesktopGameplayInputActive();
    const firingInput = visible && (
      (isMouseDown.current && isDesktopGameplayInputActive()) ||
      mobileActions.fireMachineGun
    );

    if (!visible) {
      isMouseDown.current = false;
      isRightMouseDown.current = false;
    }

    if (scopeVisibleRef.current !== scoped) {
      scopeVisibleRef.current = scoped;
      setScopeVisible(scoped);
    }

    if (camera instanceof THREE.PerspectiveCamera) {
      if (baseFov.current === null) baseFov.current = camera.fov;
      const targetFov = scoped ? SCOPED_FOV : baseFov.current;
      const nextFov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-FOV_LERP_RATE * delta));
      if (Math.abs(camera.fov - nextFov) > 0.01) {
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
      }
    }

    if (weaponRef.current) {
      weaponRef.current.visible = visible;
      if (visible) {
        offsetWorld.current.copy(scoped ? SCOPED_MODEL_OFFSET : HIP_MODEL_OFFSET).applyQuaternion(camera.quaternion);
        const bobStrength = scoped ? 0.004 : 0.014;
        const swayStrength = scoped ? 0.003 : 0.012;
        rightWorld.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
        forwardWorld.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
        offsetWorld.current
          .addScaledVector(camera.up, Math.sin(idleTimer.current * 1.7) * bobStrength - recoilKick.current * 0.018)
          .addScaledVector(
            rightWorld.current,
            Math.sin(idleTimer.current * 1.05) * swayStrength + recoilKick.current * 0.011,
          )
          .addScaledVector(forwardWorld.current, -recoilKick.current * 0.07);
        weaponRef.current.position.copy(camera.position).add(offsetWorld.current);
        weaponRef.current.quaternion.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromEuler(MODEL_ROTATION));
      }
    }

    barrelSpin.current += delta * (firingInput ? 42 : 4 + heatGlow.current * 22);
    if (barrelGroupRef.current) {
      barrelGroupRef.current.rotation.z = barrelSpin.current;
    }
    if (heatBandRef.current) {
      const material = heatBandRef.current.material as THREE.MeshBasicMaterial;
      const focusBoost = getCombatFocusModifier('machine_gun').active ? 0.16 : 0;
      heatBandRef.current.scale.setScalar(1 + heatGlow.current * 0.18);
      material.color.copy(muzzleGlowColor);
      material.opacity = heatGlow.current * 0.62 + focusBoost;
    }
    if (heatLightRef.current) {
      heatLightRef.current.color.copy(muzzleGlowColor);
      heatLightRef.current.intensity = heatGlow.current * 1.8;
    }

    flashTimer.current = Math.max(0, flashTimer.current - delta);
    const flashOpacity = Math.min(1, flashTimer.current * 22);
    if (flashCoreRef.current) {
      const material = flashCoreRef.current.material as THREE.MeshBasicMaterial;
      flashCoreRef.current.visible = flashOpacity > 0.02;
      material.color.copy(muzzleCoreColor);
      material.opacity = flashOpacity;
      flashCoreRef.current.scale.setScalar(0.85 + flashTimer.current * 8.5);
    }
    if (flashGlowRef.current) {
      const material = flashGlowRef.current.material as THREE.MeshBasicMaterial;
      flashGlowRef.current.visible = flashOpacity > 0.02;
      material.color.copy(muzzleGlowColor);
      material.opacity = flashOpacity * 0.72;
      flashGlowRef.current.scale.setScalar(0.75 + flashTimer.current * 9);
    }
    if (flashLightRef.current) {
      flashLightRef.current.color.copy(muzzleGlowColor);
      const combatFocusVisual = getCombatFocusModifier('machine_gun');
      flashLightRef.current.intensity = flashTimer.current > 0
        ? (stageVisualStyle ? 4.6 : 3.5) * (combatFocusVisual.active ? 1.25 : 1)
        : 0;
    }

    if (firingInput) fire();

    const now = performance.now() / 1000;
    const getBlock = useWorldStore.getState().getBlock;
    const mobs = useMobStore.getState().mobs;
    const remotePlayers = useMultiplayerStore.getState().remotePlayers as Map<string, RemotePlayerTarget>;
    const masteryBonus = getMachineGunMasteryBonus();
    const techniqueBonus = getMachineGunTechniqueBonus();
    const combatFocus = getCombatFocusModifier('machine_gun');
    const bulletDamage = Math.max(1, Math.round((
      BULLET_DAMAGE
      + masteryBonus.machineGunDamageBonus
      + techniqueBonus.machineGunDamageBonus
    ) * combatFocus.damageMultiplier));

    setBullets((prev) => {
      const alive: BulletProjectile[] = [];
      for (const bullet of prev) {
        if (now - bullet.createdAt > BULLET_MAX_AGE) continue;

        bullet.prev.copy(bullet.pos);
        bullet.vel.y -= BULLET_GRAVITY * delta;
        const moveDir = bullet.vel.clone().normalize();
        const moveDist = Math.min(BULLET_RANGE, bullet.vel.length() * delta);
        const hit = rayMarchProjectile(
          bullet.pos,
          moveDir,
          moveDist,
          getBlock,
          mobs,
          MOB_HIT_RADIUS,
          { remotePlayers, playerHitRadius: PLAYER_HIT_RADIUS, playerHitHeight: PLAYER_HIT_HEIGHT },
        );

        if (hit.type === 'block') {
          spawnHitImpactEffect(hit.hitPos.x, hit.hitPos.y, hit.hitPos.z, hit.normal.x, hit.normal.y, hit.normal.z, bullet.scoped);
          playBulletImpactSound(hit.hitPos.distanceTo(camera.position), 'block');
          continue;
        }

        if (hit.type === 'mob' && hit.targetId) {
          const mob = mobs.find((m) => m.id === hit.targetId);
          const precisionHit = bullet.scoped;
          const hitDamage = bulletDamage + (precisionHit ? 1 : 0);
          if (mob) {
            useMultiplayerStore.getState().sendMobDamage(hit.targetId, hitDamage, moveDir.x * 1.5, moveDir.z * 1.5);
            useMobStore.getState().damageMob(hit.targetId, hitDamage, moveDir.x, moveDir.z);
            spawnDamagePopup(hitDamage, mob.x, mob.y + 1.0, mob.z, precisionHit);
          }
          spawnHitImpactEffect(hit.hitPos.x, hit.hitPos.y, hit.hitPos.z, hit.normal.x, hit.normal.y, hit.normal.z, precisionHit);
          playBulletImpactSound(hit.hitPos.distanceTo(camera.position), 'mob');
          useMasteryStore.getState().recordItemHit('machine_gun', {
            label: precisionHit ? '精密制圧ヒット' : '連射ヒット',
            amount: precisionHit ? 9 : 6,
          });
          useStageChallengeStore.getState().recordWeaponHit('machine_gun');
          useStageConditionStore.getState().recordWeaponHit('machine_gun');
          useModeFlowStore.getState().recordCombatStyleHit('machine_gun', 1, precisionHit);
          continue;
        }

        if (hit.type === 'player' && hit.targetId) {
          const precisionHit = bullet.scoped;
          const hitDamage = bulletDamage + (precisionHit ? 1 : 0);
          useMultiplayerStore.getState().sendPlayerAttack(hit.targetId, hitDamage, moveDir.x * 1.5, moveDir.z * 1.5);
          spawnHitImpactEffect(hit.hitPos.x, hit.hitPos.y, hit.hitPos.z, hit.normal.x, hit.normal.y, hit.normal.z, precisionHit);
          useMasteryStore.getState().recordItemHit('machine_gun', {
            label: precisionHit ? '精密対戦ヒット' : '対戦ヒット',
            amount: precisionHit ? 10 : 7,
          });
          useStageChallengeStore.getState().recordWeaponHit('machine_gun');
          useStageConditionStore.getState().recordWeaponHit('machine_gun');
          useModeFlowStore.getState().recordCombatStyleHit('machine_gun', 1, precisionHit);
          continue;
        }

        // 乗り物への弾丸ダメージ
        const vehicleHit = checkProjectileHitVehicle(bullet.pos.x, bullet.pos.y, bullet.pos.z);
        if (vehicleHit) {
          const precisionHit = bullet.scoped;
          const hitDamage = bulletDamage + (precisionHit ? 1 : 0);
          useVehicleStore.getState().damageVehicle(vehicleHit.type, hitDamage);
          spawnHitImpactEffect(bullet.pos.x, bullet.pos.y, bullet.pos.z, moveDir.x, moveDir.y, moveDir.z, precisionHit);
          spawnDamagePopup(hitDamage, bullet.pos.x, bullet.pos.y + 0.5, bullet.pos.z, precisionHit);
          playBulletImpactSound(bullet.pos.distanceTo(camera.position), 'mob');
          useMasteryStore.getState().recordItemHit('machine_gun', {
            label: precisionHit ? '精密車両ヒット' : '乗り物ヒット',
            amount: precisionHit ? 10 : 7,
          });
          useStageChallengeStore.getState().recordWeaponHit('machine_gun');
          useStageConditionStore.getState().recordWeaponHit('machine_gun');
          useModeFlowStore.getState().recordCombatStyleHit('machine_gun', 1, precisionHit);
          continue;
        }

        bullet.pos.addScaledVector(moveDir, moveDist);
        alive.push(bullet);
      }
      return alive;
    });
  });

  return (
    <group>
      <group ref={weaponRef} visible={false}>
        <primitive
          object={model}
          scale={0.13}
          position={[0, -0.02, 0]}
          rotation={[0, 0, 0]}
        />
        {/* 射撃中に回る銃身で連射感を出す */}
        <group ref={barrelGroupRef} position={[MUZZLE_LOCAL.x, MUZZLE_LOCAL.y, MUZZLE_LOCAL.z + 0.15]}>
          {[
            [0.035, 0, 0],
            [-0.017, 0.03, 0],
            [-0.017, -0.03, 0],
          ].map(([x, y, z], index) => (
            <mesh key={`barrel-${index}`} position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.011, 0.012, 0.42, 6]} />
              <meshStandardMaterial color="#202327" roughness={0.42} metalness={0.72} />
            </mesh>
          ))}
        </group>
        <mesh ref={heatBandRef} position={[MUZZLE_LOCAL.x, MUZZLE_LOCAL.y, MUZZLE_LOCAL.z + 0.1]}>
          <torusGeometry args={[0.085, 0.006, 8, 24]} />
          <meshBasicMaterial
            color={muzzleGlowColor}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <pointLight
          ref={heatLightRef}
          position={[MUZZLE_LOCAL.x, MUZZLE_LOCAL.y, MUZZLE_LOCAL.z + 0.05]}
          color={muzzleGlowColor}
          intensity={0}
          distance={2.5}
          decay={2}
        />
        {/* 右腕とグリップ: トリガー側を手で握っているように見せる */}
        <mesh position={[0.24, -0.34, -0.12]} rotation={[-0.78, 0.12, -0.24]}>
          <boxGeometry args={[0.15, 0.48, 0.15]} />
          <meshStandardMaterial color={FIRST_PERSON_SLEEVE_COLOR} roughness={0.78} />
        </mesh>
        <mesh position={[0.12, -0.14, -0.38]} rotation={[-0.1, 0.08, -0.08]}>
          <boxGeometry args={[0.18, 0.16, 0.16]} />
          <meshStandardMaterial color={FIRST_PERSON_SKIN_COLOR} roughness={0.72} />
        </mesh>
        {/* 左手を前方グリップに置いて、銃をしっかり支える */}
        <mesh position={[-0.16, -0.36, -0.48]} rotation={[-0.82, -0.1, 0.28]}>
          <boxGeometry args={[0.14, 0.5, 0.14]} />
          <meshStandardMaterial color={FIRST_PERSON_SLEEVE_COLOR} roughness={0.78} />
        </mesh>
        <mesh position={[-0.02, -0.14, -0.77]} rotation={[-0.08, -0.16, 0.08]}>
          <boxGeometry args={[0.17, 0.15, 0.16]} />
          <meshStandardMaterial color={FIRST_PERSON_SKIN_COLOR} roughness={0.72} />
        </mesh>
        <mesh
          ref={flashCoreRef}
          position={[MUZZLE_LOCAL.x, MUZZLE_LOCAL.y, MUZZLE_LOCAL.z - 0.06]}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
        >
          <coneGeometry args={[0.22, 0.5, 10]} />
          <meshBasicMaterial
            color="#fff0a0"
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            toneMapped={false}
          />
        </mesh>
        <mesh
          ref={flashGlowRef}
          position={[MUZZLE_LOCAL.x, MUZZLE_LOCAL.y, MUZZLE_LOCAL.z - 0.12]}
          visible={false}
        >
          <sphereGeometry args={[0.16, 16, 10]} />
          <meshBasicMaterial
            color="#ff8b2d"
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <pointLight
          ref={flashLightRef}
          position={[MUZZLE_LOCAL.x, MUZZLE_LOCAL.y, MUZZLE_LOCAL.z - 0.1]}
          color="#ffb13d"
          intensity={0}
          distance={5}
        />
      </group>

      {scopeVisible && (
        <Html fullscreen zIndexRange={[70, 0]}>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              pointerEvents: 'none',
              background: 'radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0.28) 36%, rgba(0,0,0,0.72) 100%)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 'min(54vw, 54vh)',
                height: 'min(54vw, 54vh)',
                transform: 'translate(-50%, -50%)',
                border: `2px solid ${stageVisualStyle ? `${stageVisualStyle.accent}cc` : 'rgba(210, 245, 255, 0.72)'}`,
                borderRadius: '50%',
                boxShadow: stageVisualStyle
                  ? `0 0 0 1px rgba(0,0,0,0.55), inset 0 0 28px ${stageVisualStyle.accent}55, 0 0 18px ${stageVisualStyle.accent}55`
                  : '0 0 0 1px rgba(0,0,0,0.55), inset 0 0 28px rgba(95,180,210,0.22)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 2,
                height: 'min(22vw, 22vh)',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(220, 250, 255, 0.62)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 'min(22vw, 22vh)',
                height: 2,
                transform: 'translate(-50%, -50%)',
                background: 'rgba(220, 250, 255, 0.62)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 6,
                height: 6,
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                background: '#f7feff',
                boxShadow: '0 0 10px rgba(160, 230, 255, 0.9)',
              }}
            />
          </div>
        </Html>
      )}

      {bullets.map((bullet) => (
        <PlayerGunTracer key={bullet.id} start={bullet.prev} end={bullet.pos} color={tracerColor} />
      ))}
    </group>
  );
}

function PlayerGunTracer({ start, end, color }: { start: THREE.Vector3; end: THREE.Vector3; color: string }) {
  const delta = end.clone().sub(start);
  const length = Math.max(0.01, delta.length());
  const midpoint = start.clone().addScaledVector(delta, 0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );

  return (
    <mesh position={midpoint} quaternion={quaternion}>
      <cylinderGeometry args={[0.018, 0.01, length, 6]} />
      <meshBasicMaterial color={color} transparent opacity={0.86} />
    </mesh>
  );
}

useGLTF.preload(MACHINE_GUN_MODEL_PATH);
