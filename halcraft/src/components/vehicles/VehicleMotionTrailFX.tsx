// 乗り物の走行・飛行に、風圧・砂ぼこり・尾流の手ざわりを足す共通エフェクト

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  type AirplaneState,
  type CarState,
  type HelicopterState,
  type TankState,
  useVehicleStore,
  type VehicleType,
} from '../../stores/useVehicleStore';
import { useGameStore } from '../../stores/useGameStore';
import { useWorldStore } from '../../stores/useWorldStore';
import { BLOCK_DEFS, BLOCK_IDS, WORLD_HEIGHT } from '../../types/blocks';
import type { BiomeId } from '../../types/stages';
import { isTouchDevice } from '../../utils/device';
import { getPerformanceProfile } from '../../utils/performance';
import { getTerrainHeight } from '../../utils/terrain/heightmap';

interface FxPalette {
  primary: number;
  secondary: number;
  accent: number;
}

interface TrailBudgets {
  groundRings: number;
  airRibbons: number;
}

const MAX_CONTACT_SHADOWS = 4;
const MAX_GROUND_RINGS = 56;
const MAX_AIR_RIBBONS = 48;
const LOW_TIER_SCALE = 0.44;
const BALANCED_TIER_SCALE = 0.72;
const TOUCH_SCALE = 0.62;
const CONTACT_SHADOW_RENDER_ORDER = 88;
const GROUND_RING_RENDER_ORDER = 112;
const AIR_RIBBON_RENDER_ORDER = 113;

const VEHICLE_PALETTES: Record<VehicleType, FxPalette> = {
  helicopter: { primary: 0xeaffff, secondary: 0x7ef5ff, accent: 0xffffff },
  tank: { primary: 0xffd08a, secondary: 0xb47745, accent: 0x5c5b43 },
  airplane: { primary: 0xf9feff, secondary: 0x8dcaff, accent: 0xfff2a8 },
  car: { primary: 0xfff0b0, secondary: 0x82caff, accent: 0xffa94f },
};

const BIOME_DUST_PALETTES: Record<BiomeId, FxPalette> = {
  forest: { primary: 0xd6ca92, secondary: 0x7fa769, accent: 0xf4e2aa },
  tropical: { primary: 0xffe5a4, secondary: 0x7df7e5, accent: 0xffffff },
  snow: { primary: 0xf9ffff, secondary: 0xadd8ff, accent: 0xffffff },
  desert: { primary: 0xffd187, secondary: 0xf09645, accent: 0xfff2b4 },
};

const sharedContactShadowGeometry = new THREE.PlaneGeometry(1, 1);
const sharedGroundRingGeometry = new THREE.RingGeometry(0.44, 0.74, 42);
const sharedAirRibbonGeometry = new THREE.PlaneGeometry(1, 1);
const _vehicleForward = new THREE.Vector3();
const _vehicleRight = new THREE.Vector3();
const _fxPrimaryColor = new THREE.Color();
const _fxSecondaryColor = new THREE.Color();
const _fxColor = new THREE.Color();

function resolveBudgets(): TrailBudgets {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? LOW_TIER_SCALE
    : profile.tier === 'balanced'
      ? BALANCED_TIER_SCALE
      : 1;
  const scale = tierScale * (isTouchDevice() ? TOUCH_SCALE : 1);

  return {
    groundRings: Math.max(20, Math.round(MAX_GROUND_RINGS * scale)),
    airRibbons: Math.max(18, Math.round(MAX_AIR_RIBBONS * scale)),
  };
}

function resolveForward(out: THREE.Vector3, rotationY: number, pitch = 0): THREE.Vector3 {
  out.set(Math.sin(rotationY), Math.sin(pitch) * 0.42, Math.cos(rotationY));
  if (out.lengthSq() < 0.0001) {
    out.set(0, 0, 1);
  } else {
    out.normalize();
  }
  return out;
}

function resolveRight(out: THREE.Vector3, forward: THREE.Vector3): THREE.Vector3 {
  out.set(forward.z, 0, -forward.x);
  if (out.lengthSq() < 0.0001) {
    out.set(1, 0, 0);
  } else {
    out.normalize();
  }
  return out;
}

function clampMotionPower(value: number): number {
  return THREE.MathUtils.clamp(value, 0.08, 1.25);
}

function getGroundHeight(x: number, z: number, nearY?: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const getBlock = useWorldStore.getState().getBlock;
  const startY = THREE.MathUtils.clamp(
    Math.floor((nearY ?? getTerrainHeight(ix, iz)) + 6),
    0,
    WORLD_HEIGHT - 1,
  );

  // 置かれたブロックや破壊後の地形も拾い、影・砂ぼこりが浮いたり沈んだりしないようにする
  for (let y = startY; y >= 0; y--) {
    const blockId = getBlock(ix, y, iz);
    if (blockId === BLOCK_IDS.AIR) continue;
    const def = BLOCK_DEFS[blockId];
    if (!def || def.isLiquid || def.nonStandard) continue;
    return y + 1 + 0.08;
  }

  return getTerrainHeight(ix, iz) + 0.08;
}

function createSoftShadowTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const gradient = ctx.createRadialGradient(64, 64, 5, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255,255,255,0.78)');
  gradient.addColorStop(0.42, 'rgba(255,255,255,0.32)');
  gradient.addColorStop(0.78, 'rgba(255,255,255,0.08)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function getVehicleBasePower(vehicle: Pick<HelicopterState | TankState | AirplaneState | CarState, 'engineOn' | 'speed'>, maxSpeed: number): number {
  const speedPower = Math.abs(vehicle.speed) / maxSpeed;
  return clampMotionPower(vehicle.engineOn ? Math.max(0.28, speedPower) : speedPower * 0.7);
}

function getVehicleGroundPalette(type: VehicleType, biomeId: BiomeId | null): FxPalette {
  if (type === 'helicopter' || type === 'airplane') return VEHICLE_PALETTES[type];
  return biomeId ? BIOME_DUST_PALETTES[biomeId] : BIOME_DUST_PALETTES.forest;
}

function setInstanceColor(
  mesh: THREE.InstancedMesh,
  index: number,
  palette: FxPalette,
  tint: number,
  strength: number,
): void {
  _fxPrimaryColor.set(palette.primary);
  _fxSecondaryColor.set(palette.secondary);
  _fxColor.copy(_fxPrimaryColor).lerp(_fxSecondaryColor, tint);
  _fxColor.lerp(_fxPrimaryColor.set(palette.accent), Math.max(0, strength - 0.9) * 0.35);
  _fxColor.multiplyScalar(THREE.MathUtils.clamp(strength, 0.16, 1.35));
  mesh.setColorAt(index, _fxColor);
}

function setContactShadowMatrix(
  dummy: THREE.Object3D,
  mesh: THREE.InstancedMesh,
  index: number,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  width: number,
  length: number,
): void {
  dummy.position.set(x, y, z);
  dummy.rotation.set(-Math.PI / 2, 0, rotationY);
  dummy.scale.set(width, length, 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function setFlatRingMatrix(
  dummy: THREE.Object3D,
  mesh: THREE.InstancedMesh,
  index: number,
  x: number,
  y: number,
  z: number,
  radius: number,
  rotation: number,
): void {
  dummy.position.set(x, y, z);
  dummy.rotation.set(-Math.PI / 2, 0, rotation);
  dummy.scale.set(radius, radius, 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function setCameraRibbonMatrix(
  dummy: THREE.Object3D,
  mesh: THREE.InstancedMesh,
  index: number,
  camera: THREE.Camera,
  x: number,
  y: number,
  z: number,
  width: number,
  length: number,
  rotation: number,
): void {
  dummy.position.set(x, y, z);
  dummy.quaternion.copy(camera.quaternion);
  dummy.rotateZ(rotation);
  dummy.scale.set(width, length, 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

export function VehicleMotionTrailFX() {
  const shadowMeshRef = useRef<THREE.InstancedMesh>(null);
  const groundMeshRef = useRef<THREE.InstancedMesh>(null);
  const airMeshRef = useRef<THREE.InstancedMesh>(null);
  const groundMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const airMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const elapsedRef = useRef(0);
  const phase = useGameStore((s) => s.phase);
  const biomeId = useGameStore((s) => s.currentStage?.biome ?? null);
  const { camera } = useThree();

  const budgets = useMemo(() => resolveBudgets(), []);
  const shadowTexture = useMemo(() => createSoftShadowTexture(), []);

  useEffect(() => () => {
    shadowTexture?.dispose();
  }, [shadowTexture]);

  useFrame((_, delta) => {
    const shadowMesh = shadowMeshRef.current;
    const groundMesh = groundMeshRef.current;
    const airMesh = airMeshRef.current;
    if (!groundMesh || !airMesh || phase !== 'playing') return;

    const {
      helicopter,
      tank,
      airplane,
      car,
    } = useVehicleStore.getState();
    elapsedRef.current += Math.min(delta, 0.05);
    const elapsed = elapsedRef.current;
    const dummy = dummyRef.current;
    let shadowIndex = 0;
    let groundIndex = 0;
    let airIndex = 0;

    const addContactShadow = (
      vehicle: HelicopterState | TankState | AirplaneState | CarState,
      baseWidth: number,
      baseLength: number,
      maxAltitude: number,
      groundLift: number,
    ) => {
      if (!shadowMesh || !vehicle.spawned || vehicle.destroyed || shadowIndex >= MAX_CONTACT_SHADOWS) return;

      const groundY = getGroundHeight(vehicle.x, vehicle.z, vehicle.y);
      const altitude = Math.max(0, vehicle.y - groundY);
      if (altitude > maxAltitude) return;

      const altitudeRatio = altitude / maxAltitude;
      const spread = 1 + altitudeRatio * 1.35;
      const squeeze = 1 - altitudeRatio * 0.28;
      setContactShadowMatrix(
        dummy,
        shadowMesh,
        shadowIndex,
        vehicle.x,
        groundY + groundLift,
        vehicle.z,
        vehicle.rotationY,
        baseWidth * spread,
        baseLength * Math.max(0.58, squeeze),
      );
      shadowIndex += 1;
    };

    const addGroundRing = (
      x: number,
      y: number,
      z: number,
      radius: number,
      rotation: number,
      palette: FxPalette,
      tint: number,
      strength: number,
    ) => {
      if (groundIndex >= budgets.groundRings) return;
      setFlatRingMatrix(dummy, groundMesh, groundIndex, x, y, z, radius, rotation);
      setInstanceColor(groundMesh, groundIndex, palette, tint, strength);
      groundIndex += 1;
    };

    const addAirRibbon = (
      x: number,
      y: number,
      z: number,
      width: number,
      length: number,
      rotation: number,
      palette: FxPalette,
      tint: number,
      strength: number,
    ) => {
      if (airIndex >= budgets.airRibbons) return;
      setCameraRibbonMatrix(dummy, airMesh, airIndex, camera, x, y, z, width, length, rotation);
      setInstanceColor(airMesh, airIndex, palette, tint, strength);
      airIndex += 1;
    };

    addContactShadow(helicopter, 4.6, 6.4, 16, 0.015);
    addContactShadow(tank, 3.8, 5.4, 4.6, 0.018);
    addContactShadow(airplane, 6.6, 8.6, 10, 0.014);
    addContactShadow(car, 2.7, 4.5, 3.6, 0.018);

    if (helicopter.spawned && !helicopter.destroyed) {
      const groundY = getGroundHeight(helicopter.x, helicopter.z, helicopter.y);
      const heightAboveGround = Math.max(1, helicopter.y - groundY);
      const rotorPower = helicopter.engineOn
        ? 0.8
        : Math.abs(helicopter.rotorAngle) > 0.01
          ? 0.38
          : 0.12;
      const altitudeFalloff = THREE.MathUtils.clamp(1.25 - heightAboveGround / 18, 0.22, 1);
      const power = clampMotionPower((rotorPower + Math.abs(helicopter.speed) / 25) * altitudeFalloff);
      const palette = VEHICLE_PALETTES.helicopter;

      for (let i = 0; i < 10 && groundIndex < budgets.groundRings; i++) {
        const phaseOffset = (elapsed * (0.9 + power * 1.2) + i * 0.137) % 1;
        const radius = (1.2 + i * 0.32 + phaseOffset * 1.7) * (0.85 + heightAboveGround * 0.035);
        const wobble = elapsed * 0.72 + i * 0.8;
        addGroundRing(
          helicopter.x + Math.sin(wobble) * 0.18 * power,
          groundY,
          helicopter.z + Math.cos(wobble * 0.8) * 0.18 * power,
          radius,
          elapsed * 0.4 + i * 0.45,
          palette,
          i / 10,
          0.36 + power * (1 - phaseOffset * 0.55),
        );
      }
    }

    if (airplane.spawned && !airplane.destroyed) {
      const forward = resolveForward(_vehicleForward, airplane.rotationY, airplane.pitch);
      const right = resolveRight(_vehicleRight, forward);
      const throttlePower = Math.max(airplane.throttle, Math.abs(airplane.speed) / 42);
      const airborneBoost = airplane.airborne ? 1.18 : 0.72;
      const power = clampMotionPower((airplane.engineOn ? Math.max(0.3, throttlePower) : throttlePower * 0.55) * airborneBoost);
      const palette = VEHICLE_PALETTES.airplane;

      for (let i = 0; i < 18 && airIndex < budgets.airRibbons; i++) {
        const lane = i % 3;
        const age = ((i / 18) + elapsed * (0.22 + power * 0.18)) % 1;
        const side = lane === 0 ? -1 : lane === 1 ? 1 : 0;
        const sideOffset = side * (lane === 2 ? 0.4 : 2.35);
        const distance = 2.4 + age * (9.5 + power * 9.0);
        const fade = 1 - age;
        const swirl = Math.sin(elapsed * 1.3 + i * 0.74) * 0.38;
        addAirRibbon(
          airplane.x - forward.x * distance + right.x * (sideOffset + swirl),
          airplane.y + 0.25 - age * 0.72 + Math.sin(elapsed + i) * 0.08,
          airplane.z - forward.z * distance + right.z * (sideOffset + swirl),
          0.16 + age * 0.42 + (side === 0 ? 0.12 : 0),
          (2.6 + age * 6.8) * (0.7 + power * 0.45),
          side * 0.22 + Math.sin(elapsed * 0.4 + i) * 0.16,
          palette,
          lane === 2 ? 0.72 : age,
          0.22 + fade * power,
        );
      }
    }

    const addGroundVehicleTrail = (
      type: 'tank' | 'car',
      vehicle: TankState | CarState,
      maxSpeed: number,
      sideOffset: number,
      ringCount: number,
    ) => {
      if (!vehicle.spawned || vehicle.destroyed) return;

      const forward = resolveForward(_vehicleForward, vehicle.rotationY);
      const right = resolveRight(_vehicleRight, forward);
      const groundY = getGroundHeight(vehicle.x, vehicle.z, vehicle.y);
      const power = getVehicleBasePower(vehicle, maxSpeed);
      const palette = getVehicleGroundPalette(type, biomeId);
      const baseBack = type === 'tank' ? 1.8 : 1.35;

      for (let i = 0; i < ringCount && groundIndex < budgets.groundRings; i++) {
        const age = ((i / ringCount) + elapsed * (0.24 + power * 0.22)) % 1;
        const side = i % 2 === 0 ? -1 : 1;
        const wobble = Math.sin(elapsed * 1.5 + i * 1.8) * (0.08 + power * 0.14);
        const distance = baseBack + age * (3.4 + power * 3.0);
        const x = vehicle.x - forward.x * distance + right.x * (side * sideOffset + wobble);
        const z = vehicle.z - forward.z * distance + right.z * (side * sideOffset + wobble);
        const radius = (0.48 + age * (type === 'tank' ? 1.2 : 0.86)) * (0.85 + power * 0.35);

        addGroundRing(
          x,
          groundY + 0.02,
          z,
          radius,
          vehicle.rotationY + side * 0.36 + elapsed * 0.08,
          palette,
          age,
          0.18 + (1 - age) * power * (type === 'tank' ? 0.92 : 0.76),
        );
      }
    };

    addGroundVehicleTrail('tank', tank, 10, 1.15, 12);
    addGroundVehicleTrail('car', car, 16, 0.82, 10);

    if (car.spawned && !car.destroyed) {
      const forward = resolveForward(_vehicleForward, car.rotationY);
      const right = resolveRight(_vehicleRight, forward);
      const speedPower = clampMotionPower(Math.abs(car.speed) / 16);
      if (speedPower > 0.09 || car.engineOn) {
        const palette = VEHICLE_PALETTES.car;
        for (let i = 0; i < 8 && airIndex < budgets.airRibbons; i++) {
          const age = ((i / 8) + elapsed * (0.34 + speedPower * 0.28)) % 1;
          const side = i % 2 === 0 ? -1 : 1;
          addAirRibbon(
            car.x - forward.x * (1.4 + age * 3.0) + right.x * side * 1.0,
            car.y + 0.72 + Math.sin(elapsed * 1.8 + i) * 0.05,
            car.z - forward.z * (1.4 + age * 3.0) + right.z * side * 1.0,
            0.12 + age * 0.18,
            1.1 + speedPower * 2.4,
            side * 0.16,
            palette,
            age,
            0.18 + (1 - age) * Math.max(0.24, speedPower),
          );
        }
      }
    }

    groundMesh.count = groundIndex;
    airMesh.count = airIndex;
    if (shadowMesh) {
      shadowMesh.count = shadowIndex;
      shadowMesh.instanceMatrix.needsUpdate = true;
    }
    groundMesh.instanceMatrix.needsUpdate = true;
    airMesh.instanceMatrix.needsUpdate = true;
    if (groundMesh.instanceColor) groundMesh.instanceColor.needsUpdate = true;
    if (airMesh.instanceColor) airMesh.instanceColor.needsUpdate = true;

    if (groundMaterialRef.current) {
      groundMaterialRef.current.opacity = 0.34;
    }
    if (airMaterialRef.current) {
      airMaterialRef.current.opacity = 0.46;
    }
  });

  useLayoutEffect(() => {
    if (shadowMeshRef.current) shadowMeshRef.current.count = 0;
    if (groundMeshRef.current) groundMeshRef.current.count = 0;
    if (airMeshRef.current) airMeshRef.current.count = 0;
  }, []);

  if (phase !== 'playing') return null;

  return (
    <>
      {shadowTexture && (
        <instancedMesh
          ref={shadowMeshRef}
          args={[sharedContactShadowGeometry, undefined, MAX_CONTACT_SHADOWS]}
          frustumCulled={false}
          renderOrder={CONTACT_SHADOW_RENDER_ORDER}
        >
          <meshBasicMaterial
            alphaMap={shadowTexture}
            color={0x05060a}
            transparent
            opacity={0.28}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </instancedMesh>
      )}
      <instancedMesh
        ref={groundMeshRef}
        args={[sharedGroundRingGeometry, undefined, budgets.groundRings]}
        frustumCulled={false}
        renderOrder={GROUND_RING_RENDER_ORDER}
      >
        <meshBasicMaterial
          ref={groundMaterialRef}
          vertexColors
          transparent
          opacity={0.34}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
      <instancedMesh
        ref={airMeshRef}
        args={[sharedAirRibbonGeometry, undefined, budgets.airRibbons]}
        frustumCulled={false}
        renderOrder={AIR_RIBBON_RENDER_ORDER}
      >
        <meshBasicMaterial
          ref={airMaterialRef}
          vertexColors
          transparent
          opacity={0.46}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
    </>
  );
}
