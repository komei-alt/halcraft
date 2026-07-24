// 徒歩用機関銃
// ロケットランチャーと同じカメラ装備枠で、弱めの連射弾とマズルフレアを扱う
// 右クリック/モバイルでスコープADS：滑らかな覗き込み・ブラックアウト・HUD照準・精密射撃

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
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
/** 腰だめ時：画面中央を塞がないよう右下へ */
const HIP_MODEL_OFFSET = new THREE.Vector3(0.38, -0.38, -0.72);
/** ADS 完了時：画面中心（カメラ視線）に揃えて覗き込む位置 */
const SCOPED_MODEL_OFFSET = new THREE.Vector3(0.0, -0.04, -0.36);
const MUZZLE_LOCAL = new THREE.Vector3(0, -0.17, -1.18);
/** ADS 時の弾スポーン：カメラ中心から少し前（照準ドットと視線が重なる） */
const SCOPED_SPAWN_FORWARD = 0.48;
const MODEL_ROTATION = new THREE.Euler(0.02, Math.PI - 0.02, -0.03, 'YXZ');
const HIP_SPREAD = 0.026;
const SCOPED_SPREAD = 0.006;
/** スコープ時FOV（通常~70-75から約2.5倍相当の拡大） */
const SCOPED_FOV = 28;
/** スコープ入り/抜けの速度（秒あたり進捗） */
const SCOPE_IN_RATE = 2.6;
const SCOPE_OUT_RATE = 3.4;
/** この進捗以上で精密射撃扱い */
const SCOPE_PRECISION_THRESHOLD = 0.58;
const FIRST_PERSON_SKIN_COLOR = '#f0b686';
const FIRST_PERSON_SLEEVE_COLOR = '#3f78d4';
const MACHINE_GUN_BARREL_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [0.035, 0, 0],
  [-0.017, 0.03, 0],
  [-0.017, -0.03, 0],
];

interface BulletProjectile {
  id: number;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  createdAt: number;
  scoped: boolean;
}

let nextBulletId = 0;

function easeInOutCubic(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
}

function easeOutCubic(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return 1 - (1 - x) ** 3;
}

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
  const gunBodyRef = useRef<THREE.Group>(null);
  const scopeOpticRef = useRef<THREE.Group>(null);
  const barrelGroupRef = useRef<THREE.Group>(null);
  const barrelInstancesRef = useRef<THREE.InstancedMesh>(null);
  const flashCoreRef = useRef<THREE.Mesh>(null);
  const flashGlowRef = useRef<THREE.Mesh>(null);
  const flashCrossRef = useRef<THREE.Mesh>(null);
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
  const hipOffsetWorld = useRef(new THREE.Vector3());
  const scopedOffsetWorld = useRef(new THREE.Vector3());
  const rightWorld = useRef(new THREE.Vector3());
  const forwardWorld = useRef(new THREE.Vector3());
  const flashTimer = useRef(0);
  const baseFov = useRef<number | null>(null);
  /** 0=腰だめ, 1=完全ADS */
  const scopeProgress = useRef(0);
  const lastStoreScope = useRef(-1);
  const [bullets, setBullets] = useState<BulletProjectile[]>([]);
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
    const barrels = barrelInstancesRef.current;
    if (!barrels) return;
    const dummy = new THREE.Object3D();
    MACHINE_GUN_BARREL_OFFSETS.forEach(([x, y, z], index) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      barrels.setMatrixAt(index, dummy.matrix);
    });
    barrels.instanceMatrix.needsUpdate = true;
  }, []);

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
      mobileActions.scopeMachineGun = false;
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
    usePlayerStore.setState({ machineGunScopeProgress: 0 });
  }, [camera]);

  const isScopedAiming = useCallback(() => scopeProgress.current >= SCOPE_PRECISION_THRESHOLD, []);

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

    const scopedShot = isScopedAiming();
    const masteryBonus = getMachineGunMasteryBonus();
    // スコープ途中でも進捗に応じてブレが減る
    const scopeBlend = easeOutCubic(scopeProgress.current);

    // ADS（精密照準）: カメラ視線＝弾道。腰だめだけ銃口→照準点
    if (scopeBlend >= 0.35 || scopedShot) {
      shootDir.current.copy(aimDir.current);
    } else {
      shootDir.current.copy(aimPoint.current).sub(muzzleWorld.current);
      if (shootDir.current.lengthSq() < 0.01 || shootDir.current.dot(aimDir.current) < 0.15) {
        shootDir.current.copy(aimDir.current);
      } else {
        shootDir.current.normalize();
        shootDir.current.lerp(aimDir.current, scopeBlend).normalize();
      }
    }

    const spread = THREE.MathUtils.lerp(HIP_SPREAD, SCOPED_SPREAD, scopeBlend)
      * masteryBonus.machineGunSpreadMultiplier
      * techniqueBonus.machineGunSpreadMultiplier
      * stageStyle.machineGunSpreadMultiplier
      * combatFocus.machineGunSpreadMultiplier;
    // ADS 中はブレをほぼゼロにして照準点と着弾を一致させる
    if (scopeBlend < 0.95) {
      const spreadScale = 1 - scopeBlend;
      shootDir.current.x += (Math.random() - 0.5) * spread * spreadScale;
      shootDir.current.y += (Math.random() - 0.5) * spread * spreadScale;
      shootDir.current.z += (Math.random() - 0.5) * spread * spreadScale;
      shootDir.current.normalize();
    }

    // ADS 時は画面中心の少し前から発射（トレイルが照準と重なる）
    let startPos: THREE.Vector3;
    if (scopeBlend >= 0.35 || scopedShot) {
      startPos = camera.position.clone().addScaledVector(aimDir.current, SCOPED_SPAWN_FORWARD);
    } else {
      const centerSpawn = camera.position.clone().addScaledVector(aimDir.current, SCOPED_SPAWN_FORWARD);
      startPos = muzzleWorld.current.clone().lerp(centerSpawn, scopeBlend);
    }
    const vel = shootDir.current.clone().multiplyScalar(BULLET_SPEED);
    setBullets((prev) => [...prev.slice(-28), {
      id: nextBulletId++,
      pos: startPos.clone(),
      prev: startPos.clone(),
      vel,
      createdAt: now,
      scoped: scopedShot,
    }]);

    recoilKick.current = scopedShot ? 0.42 : 1.15;
    heatGlow.current = Math.min(1, heatGlow.current + (scopedShot ? 0.1 : 0.16));
    flashTimer.current = combatFocus.active ? 0.13 : scopedShot ? 0.12 : 0.095;
    playMachineGunSound(startPos.distanceTo(camera.position));
    // 三人称リコイル同期
    usePlayerStore.getState().triggerWeaponAction('gun');
    useMasteryStore.getState().recordItemUse('machine_gun');
    multi.sendGunFire(
      [startPos.x, startPos.y, startPos.z],
      [shootDir.current.x, shootDir.current.y, shootDir.current.z],
      'left',
    );
  }, [camera, isScopedAiming]);

  useFrame((_, delta) => {
    idleTimer.current += delta;
    recoilKick.current = Math.max(0, recoilKick.current - delta * 14);
    heatGlow.current = Math.max(0, heatGlow.current - delta * 0.85);
    const phasePlaying = useGameStore.getState().phase === 'playing';
    const visible = phasePlaying
      && equippedItem === 'machine_gun'
      && !isDead
      && !useVehicleStore.getState().isInVehicle();
    const wantScope = visible && (
      (isRightMouseDown.current && isDesktopGameplayInputActive())
      || mobileActions.scopeMachineGun
    );
    const firingInput = visible && (
      (isMouseDown.current && isDesktopGameplayInputActive()) ||
      mobileActions.fireMachineGun
    );

    if (!visible) {
      isMouseDown.current = false;
      isRightMouseDown.current = false;
      mobileActions.fireMachineGun = false;
      mobileActions.scopeMachineGun = false;
    }

    // --- スコープ進捗（非対称の入り/抜け） ---
    const scopeRate = wantScope ? SCOPE_IN_RATE : SCOPE_OUT_RATE;
    const scopeTarget = wantScope ? 1 : 0;
    scopeProgress.current = THREE.MathUtils.damp(
      scopeProgress.current,
      scopeTarget,
      scopeRate,
      delta,
    );
    if (!wantScope && scopeProgress.current < 0.004) scopeProgress.current = 0;
    if (wantScope && scopeProgress.current > 0.996) scopeProgress.current = 1;

    const raw = scopeProgress.current;
    // 銃を先に顔へ寄せ、ズームとブラックアウトは少し遅れて「覗き込む」感じに
    const pRaise = easeOutCubic(Math.min(1, raw / 0.52));
    const pZoom = easeInOutCubic(Math.max(0, (raw - 0.12) / 0.88));

    // ストアへ間引き同期（クロスヘア非表示など）
    if (Math.abs(raw - lastStoreScope.current) > 0.04 || (raw === 0) !== (lastStoreScope.current === 0)) {
      lastStoreScope.current = raw;
      usePlayerStore.setState({ machineGunScopeProgress: raw });
    }

    // スコープHUDは Canvas 外の MachineGunScopeHUD が描画（drei Html は照準が消えることがある）

    // FOV：覗き込みに合わせて滑らかに拡大
    if (camera instanceof THREE.PerspectiveCamera) {
      if (baseFov.current === null) baseFov.current = camera.fov;
      const targetFov = THREE.MathUtils.lerp(baseFov.current, SCOPED_FOV, pZoom);
      if (Math.abs(camera.fov - targetFov) > 0.02) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      } else if (raw === 0 && baseFov.current !== null && Math.abs(camera.fov - baseFov.current) > 0.02) {
        camera.fov = baseFov.current;
        camera.updateProjectionMatrix();
      }
    }

    if (weaponRef.current) {
      weaponRef.current.visible = visible;
      if (visible) {
        hipOffsetWorld.current.copy(HIP_MODEL_OFFSET).applyQuaternion(camera.quaternion);
        scopedOffsetWorld.current.copy(SCOPED_MODEL_OFFSET).applyQuaternion(camera.quaternion);
        offsetWorld.current.lerpVectors(hipOffsetWorld.current, scopedOffsetWorld.current, pRaise);

        const bobStrength = THREE.MathUtils.lerp(0.014, 0.0025, pRaise);
        const swayStrength = THREE.MathUtils.lerp(0.012, 0.002, pRaise);
        rightWorld.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
        forwardWorld.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
        offsetWorld.current
          .addScaledVector(camera.up, Math.sin(idleTimer.current * 1.7) * bobStrength - recoilKick.current * 0.024)
          .addScaledVector(
            rightWorld.current,
            Math.sin(idleTimer.current * 1.05) * swayStrength + recoilKick.current * 0.016,
          )
          .addScaledVector(forwardWorld.current, -recoilKick.current * (0.09 - pRaise * 0.04));
        weaponRef.current.position.copy(camera.position).add(offsetWorld.current);
        weaponRef.current.quaternion.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromEuler(MODEL_ROTATION));

        // ADS中は銃本体・3D接眼とも完全に隠す（黒い鉄塊で視界を塞がない）
        // 照準は 2D の円形スコープHUDのみで行う
        if (gunBodyRef.current) {
          const bodyFade = 1 - pRaise;
          gunBodyRef.current.visible = bodyFade > 0.12;
          gunBodyRef.current.scale.setScalar(THREE.MathUtils.lerp(1, 0.35, pRaise));
        }
        if (scopeOpticRef.current) {
          scopeOpticRef.current.visible = false;
        }
      } else if (scopeOpticRef.current) {
        scopeOpticRef.current.visible = false;
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
    const flashOpacity = Math.min(1, flashTimer.current * 18);
    if (flashCoreRef.current) {
      const material = flashCoreRef.current.material as THREE.MeshBasicMaterial;
      flashCoreRef.current.visible = flashOpacity > 0.02;
      material.color.copy(muzzleCoreColor);
      material.opacity = flashOpacity;
      flashCoreRef.current.scale.setScalar(1.05 + flashTimer.current * 12);
    }
    if (flashGlowRef.current) {
      const material = flashGlowRef.current.material as THREE.MeshBasicMaterial;
      flashGlowRef.current.visible = flashOpacity > 0.02;
      material.color.copy(muzzleGlowColor);
      material.opacity = flashOpacity * 0.88;
      flashGlowRef.current.scale.setScalar(1.0 + flashTimer.current * 13);
    }
    if (flashCrossRef.current) {
      const material = flashCrossRef.current.material as THREE.MeshBasicMaterial;
      flashCrossRef.current.visible = flashOpacity > 0.02;
      material.color.copy(muzzleCoreColor);
      material.opacity = flashOpacity * 0.7;
      flashCrossRef.current.scale.setScalar(0.9 + flashTimer.current * 11);
    }
    if (flashLightRef.current) {
      flashLightRef.current.color.copy(muzzleGlowColor);
      const combatFocusVisual = getCombatFocusModifier('machine_gun');
      flashLightRef.current.intensity = flashTimer.current > 0
        ? (stageVisualStyle ? 7.2 : 5.6) * (combatFocusVisual.active ? 1.35 : 1)
        : 0;
      flashLightRef.current.distance = 8.5;
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
          playBulletImpactSound(hit.hitPos.distanceTo(camera.position), 'block', hit.hitPos);
          continue;
        }

        if (hit.type === 'mob' && hit.targetId) {
          const mob = mobs.find((m) => m.id === hit.targetId);
          const precisionHit = bullet.scoped;
          const hitDamage = bulletDamage + (precisionHit ? 1 : 0);
          if (mob) {
            // 銃撃はノックバックなし（接近を止めない）
            useMultiplayerStore.getState().sendMobDamage(hit.targetId, hitDamage, 0, 0);
            useMobStore.getState().damageMob(hit.targetId, hitDamage, 0, 0);
            spawnDamagePopup(hitDamage, mob.x, mob.y + 1.0, mob.z, precisionHit);
          }
          spawnHitImpactEffect(hit.hitPos.x, hit.hitPos.y, hit.hitPos.z, hit.normal.x, hit.normal.y, hit.normal.z, precisionHit);
          playBulletImpactSound(hit.hitPos.distanceTo(camera.position), 'mob', hit.hitPos);
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

        // 乗り物への弾丸ダメージ（線分スイープでトンネル抜けを防ぐ）
        const vehicleHit = checkProjectileHitVehicle(
          bullet.pos.x, bullet.pos.y, bullet.pos.z,
          undefined,
          bullet.prev.x, bullet.prev.y, bullet.prev.z,
        );
        if (vehicleHit) {
          const precisionHit = bullet.scoped;
          const hitDamage = bulletDamage + (precisionHit ? 1 : 0);
          useVehicleStore.getState().damageVehicle(vehicleHit.type, hitDamage);
          spawnHitImpactEffect(vehicleHit.hitX, vehicleHit.hitY, vehicleHit.hitZ, moveDir.x, moveDir.y, moveDir.z, precisionHit);
          spawnDamagePopup(hitDamage, vehicleHit.hitX, vehicleHit.hitY + 0.5, vehicleHit.hitZ, precisionHit);
          playBulletImpactSound(camera.position.distanceTo(
            new THREE.Vector3(vehicleHit.hitX, vehicleHit.hitY, vehicleHit.hitZ),
          ), 'mob');
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
        <group ref={gunBodyRef}>
          <primitive
            object={model}
            scale={0.13}
            position={[0, -0.02, 0]}
            rotation={[0, 0, 0]}
          />
          {/* 射撃中に回る銃身で連射感を出す */}
          <group ref={barrelGroupRef} position={[MUZZLE_LOCAL.x, MUZZLE_LOCAL.y, MUZZLE_LOCAL.z + 0.15]}>
            <instancedMesh ref={barrelInstancesRef} args={[undefined, undefined, MACHINE_GUN_BARREL_OFFSETS.length]}>
              <cylinderGeometry args={[0.011, 0.012, 0.42, 6]} />
              <meshStandardMaterial color="#202327" roughness={0.42} metalness={0.72} />
            </instancedMesh>
            {/* 穴あき放熱筒と砲口カラー。GLB本体は保持し、追加機構だけ高精細化する */}
            <mesh position={[0, 0, -0.015]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.064, 0.07, 0.31, 10, 1, true]} />
              <meshStandardMaterial color="#30363d" roughness={0.4} metalness={0.72} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 0, -0.21]}>
              <torusGeometry args={[0.06, 0.009, 7, 16]} />
              <meshStandardMaterial color="#737b83" roughness={0.34} metalness={0.78} />
            </mesh>
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
            <sphereGeometry args={[0.18, 16, 10]} />
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
          {/* 十字のマズルフレアで撃ち感を足す */}
          <mesh
            ref={flashCrossRef}
            position={[MUZZLE_LOCAL.x, MUZZLE_LOCAL.y, MUZZLE_LOCAL.z - 0.05]}
            rotation={[-Math.PI / 2, 0, Math.PI / 2]}
            visible={false}
          >
            <coneGeometry args={[0.18, 0.42, 8]} />
            <meshBasicMaterial
              color="#fff6c8"
              transparent
              opacity={0}
              depthWrite={false}
              depthTest={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
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

        {/* 3D接眼は使わない。ADS照準は Canvas 外の MachineGunScopeHUD */}
        <group ref={scopeOpticRef} visible={false} />
      </group>

      {bullets.map((bullet) => (
        <PlayerGunTracer
          key={bullet.id}
          start={bullet.prev}
          end={bullet.pos}
          color={tracerColor}
          scoped={bullet.scoped}
        />
      ))}
    </group>
  );
}

function PlayerGunTracer({
  start,
  end,
  color,
  scoped,
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  color: string;
  scoped: boolean;
}) {
  const delta = end.clone().sub(start);
  const length = Math.max(0.18, delta.length() * (scoped ? 1.75 : 1.5));
  const midpoint = start.clone().addScaledVector(delta, 0.5);
  const dir = delta.lengthSq() > 0.000001 ? delta.normalize() : new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir,
  );
  const coreR = scoped ? 0.018 : 0.015;
  const midR = scoped ? 0.032 : 0.024;
  const glowR = scoped ? 0.065 : 0.05;

  return (
    <group position={midpoint} quaternion={quaternion}>
      <mesh>
        <cylinderGeometry args={[glowR, glowR * 0.4, length, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={scoped ? 0.4 : 0.3}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh>
        <cylinderGeometry args={[midR, midR * 0.45, length, 8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.88}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh>
        <cylinderGeometry args={[coreR, coreR * 0.35, length, 6]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.98}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

useGLTF.preload(MACHINE_GUN_MODEL_PATH);
