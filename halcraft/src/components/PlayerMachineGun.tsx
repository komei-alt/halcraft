// 徒歩用機関銃
// ロケットランチャーと同じカメラ装備枠で、弱めの連射弾とマズルフレアを扱う

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useVehicleStore } from '../stores/useVehicleStore';
import { useWorldStore } from '../stores/useWorldStore';
import { useMobStore } from '../stores/useMobStore';
import { useMultiplayerStore } from '../stores/useMultiplayerStore';
import { mobileActions } from '../utils/touchInput';
import { isDesktopGameplayInputActive } from '../utils/gameCanvas';
import { rayMarchProjectile, type RemotePlayerTarget } from '../utils/projectilePhysics';
import { spawnDamagePopup, spawnHitImpactEffect } from '../utils/effectTriggers';
import { playBulletImpactSound, playMachineGunSound } from '../utils/sounds';
import { cloneSceneWithMaterials } from './vehicles/modelUtils';

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
const MODEL_OFFSET = new THREE.Vector3(0.42, -0.43, -0.72);
const MUZZLE_LOCAL = new THREE.Vector3(0, -0.02, -1.02);
const MODEL_ROTATION = new THREE.Euler(0.08, Math.PI, 0.02, 'YXZ');

interface BulletProjectile {
  id: number;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  createdAt: number;
}

let nextBulletId = 0;

export function PlayerMachineGun() {
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const isDead = usePlayerStore((s) => s.isDead);
  const { camera } = useThree();
  const gltf = useGLTF(MACHINE_GUN_MODEL_PATH);
  const model = useMemo(() => cloneSceneWithMaterials(gltf.scene), [gltf.scene]);
  const weaponRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const flashLightRef = useRef<THREE.PointLight>(null);
  const isMouseDown = useRef(false);
  const lastFireTime = useRef(0);
  const muzzleWorld = useRef(new THREE.Vector3());
  const shootDir = useRef(new THREE.Vector3());
  const offsetWorld = useRef(new THREE.Vector3());
  const flashTimer = useRef(0);
  const [bullets, setBullets] = useState<BulletProjectile[]>([]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) isMouseDown.current = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) isMouseDown.current = false;
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const fire = useCallback(() => {
    const now = performance.now() / 1000;
    if (now - lastFireTime.current < FIRE_COOLDOWN) return;
    if (useVehicleStore.getState().isInVehicle()) return;
    lastFireTime.current = now;

    shootDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    if (weaponRef.current) {
      weaponRef.current.updateWorldMatrix(true, false);
      muzzleWorld.current.copy(MUZZLE_LOCAL).applyMatrix4(weaponRef.current.matrixWorld);
    } else {
      muzzleWorld.current.copy(camera.position).addScaledVector(shootDir.current, 0.5);
    }

    const spread = 0.026;
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
    }]);

    flashTimer.current = 0.065;
    playMachineGunSound(startPos.distanceTo(camera.position));
    useMultiplayerStore.getState().sendGunFire(
      [startPos.x, startPos.y, startPos.z],
      [shootDir.current.x, shootDir.current.y, shootDir.current.z],
      'left',
    );
  }, [camera]);

  useFrame((_, delta) => {
    const visible = equippedItem === 'machine_gun' && !isDead && !useVehicleStore.getState().isInVehicle();
    if (weaponRef.current) {
      weaponRef.current.visible = visible;
      if (visible) {
        offsetWorld.current.copy(MODEL_OFFSET).applyQuaternion(camera.quaternion);
        weaponRef.current.position.copy(camera.position).add(offsetWorld.current);
        weaponRef.current.quaternion.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromEuler(MODEL_ROTATION));
      }
    }

    flashTimer.current = Math.max(0, flashTimer.current - delta);
    if (flashRef.current) {
      const material = flashRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = Math.min(1, flashTimer.current * 18);
      flashRef.current.scale.setScalar(0.6 + flashTimer.current * 7.5);
    }
    if (flashLightRef.current) {
      flashLightRef.current.intensity = flashTimer.current > 0 ? 1.6 : 0;
    }

    const canFire = visible && (
      (isMouseDown.current && isDesktopGameplayInputActive()) ||
      mobileActions.fireMachineGun
    );
    if (canFire) fire();

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
          spawnHitImpactEffect(hit.hitPos.x, hit.hitPos.y, hit.hitPos.z, hit.normal.x, hit.normal.y, hit.normal.z, false);
          playBulletImpactSound(hit.hitPos.distanceTo(camera.position), 'block');
          continue;
        }

        if (hit.type === 'mob' && hit.targetId) {
          const mob = mobs.find((m) => m.id === hit.targetId);
          if (mob) {
            useMultiplayerStore.getState().sendMobDamage(hit.targetId, BULLET_DAMAGE, moveDir.x * 1.5, moveDir.z * 1.5);
            useMobStore.getState().damageMob(hit.targetId, BULLET_DAMAGE, moveDir.x, moveDir.z);
            spawnDamagePopup(BULLET_DAMAGE, mob.x, mob.y + 1.0, mob.z, false);
          }
          spawnHitImpactEffect(hit.hitPos.x, hit.hitPos.y, hit.hitPos.z, hit.normal.x, hit.normal.y, hit.normal.z, false);
          playBulletImpactSound(hit.hitPos.distanceTo(camera.position), 'mob');
          continue;
        }

        if (hit.type === 'player' && hit.targetId) {
          useMultiplayerStore.getState().sendPlayerAttack(hit.targetId, BULLET_DAMAGE, moveDir.x * 1.5, moveDir.z * 1.5);
          spawnHitImpactEffect(hit.hitPos.x, hit.hitPos.y, hit.hitPos.z, hit.normal.x, hit.normal.y, hit.normal.z, false);
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
        <mesh ref={flashRef} position={[0, -0.02, -1.08]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.16, 0.34, 8]} />
          <meshBasicMaterial color="#ffb13d" transparent opacity={0} depthWrite={false} />
        </mesh>
        <pointLight ref={flashLightRef} position={[0, -0.02, -1.12]} color="#ffb13d" intensity={0} distance={4} />
      </group>

      {bullets.map((bullet) => (
        <PlayerGunTracer key={bullet.id} start={bullet.prev} end={bullet.pos} />
      ))}
    </group>
  );
}

function PlayerGunTracer({ start, end }: { start: THREE.Vector3; end: THREE.Vector3 }) {
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
      <meshBasicMaterial color="#ffd36a" transparent opacity={0.82} />
    </mesh>
  );
}

useGLTF.preload(MACHINE_GUN_MODEL_PATH);
