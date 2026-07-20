// 水面と溶岩面の輪郭・きらめきを足す近景用の軽量レイヤー

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useWorldStore, type IndexedBlockPosition } from '../stores/useWorldStore';
import { BLOCK_IDS, CHUNK_SIZE, RENDER_DISTANCE, type BlockId } from '../types/blocks';
import type { BiomeId } from '../types/stages';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';

type LiquidFxKind = 'water' | 'lava';

interface LiquidSurfaceConfig {
  kind: LiquidFxKind;
  blockId: BlockId;
  count: number;
  radius: number;
  primaryColor: number;
  secondaryColor: number;
  opacity: number;
  minScale: number;
  maxScale: number;
  pulseSpeed: number;
  driftStrength: number;
}

interface SurfaceInstance {
  x: number;
  y: number;
  z: number;
  seed: number;
  tint: number;
  angle: number;
  scale: number;
  edgeWeight: number;
  distanceSq: number;
}

interface CameraSurfaceCenter {
  cx: number;
  cz: number;
  cellX: number;
  cellZ: number;
}

const BIOME_WATER_COLORS: Record<BiomeId, { primary: number; secondary: number }> = {
  forest: { primary: 0x9fffe7, secondary: 0x5ecbff },
  tropical: { primary: 0xd8fff6, secondary: 0x62fff0 },
  snow: { primary: 0xf8ffff, secondary: 0x9fcfff },
  desert: { primary: 0xffe0a0, secondary: 0x78eaff },
};

const LOW_TIER_SCALE = 0.42;
const BALANCED_TIER_SCALE = 0.68;
const TOUCH_SCALE = 0.56;
const CENTER_UPDATE_INTERVAL_MS = 520;
const SURFACE_REFRESH_CELL_SIZE = 8;
const WATER_RENDER_ORDER = 106;
const LAVA_RENDER_ORDER = 107;

const sharedWaterRingGeometry = new THREE.RingGeometry(0.26, 0.48, 54);
const sharedWaterGlintGeometry = new THREE.PlaneGeometry(1, 1);
const sharedLavaRingGeometry = new THREE.RingGeometry(0.18, 0.42, 5);
const sharedLavaSparkGeometry = new THREE.PlaneGeometry(1, 1);
const _fxColor = new THREE.Color();

function seededUnit(x: number, y: number, z: number, salt: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + salt * 19.193) * 43758.5453;
  return value - Math.floor(value);
}

function getTierScale(): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? LOW_TIER_SCALE
    : profile.tier === 'balanced'
      ? BALANCED_TIER_SCALE
      : 1;
  return tierScale * (isTouchDevice() ? TOUCH_SCALE : 1);
}

function getEffectiveCount(config: LiquidSurfaceConfig): number {
  return Math.max(12, Math.round(config.count * getTierScale()));
}

function getWaterConfig(biomeId: BiomeId | null): LiquidSurfaceConfig {
  const colors = biomeId ? BIOME_WATER_COLORS[biomeId] : BIOME_WATER_COLORS.forest;
  return {
    kind: 'water',
    blockId: BLOCK_IDS.WATER,
    count: 118,
    radius: 44,
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    opacity: biomeId === 'tropical' ? 0.38 : 0.3,
    minScale: 0.72,
    maxScale: biomeId === 'tropical' ? 1.36 : 1.12,
    pulseSpeed: biomeId === 'tropical' ? 1.2 : 0.9,
    driftStrength: biomeId === 'tropical' ? 0.08 : 0.045,
  };
}

function getLavaConfig(): LiquidSurfaceConfig {
  return {
    kind: 'lava',
    blockId: BLOCK_IDS.LAVA,
    count: 82,
    radius: 48,
    primaryColor: 0xfff078,
    secondaryColor: 0xff3a18,
    opacity: 0.44,
    minScale: 0.52,
    maxScale: 1.16,
    pulseSpeed: 1.65,
    driftStrength: 0.05,
  };
}

function getHorizontalEdgeWeight(getBlock: (x: number, y: number, z: number) => BlockId, pos: IndexedBlockPosition): number {
  let openSides = 0;
  if (getBlock(pos.x + 1, pos.y, pos.z) !== pos.blockId) openSides++;
  if (getBlock(pos.x - 1, pos.y, pos.z) !== pos.blockId) openSides++;
  if (getBlock(pos.x, pos.y, pos.z + 1) !== pos.blockId) openSides++;
  if (getBlock(pos.x, pos.y, pos.z - 1) !== pos.blockId) openSides++;
  return openSides / 4;
}

function collectSurfaceInstances(
  config: LiquidSurfaceConfig,
  indexedBlocks: IndexedBlockPosition[],
  getBlock: (x: number, y: number, z: number) => BlockId,
  camera: THREE.Camera,
  cameraCenter: CameraSurfaceCenter,
): SurfaceInstance[] {
  const countLimit = getEffectiveCount(config);
  const radiusSq = config.radius * config.radius;
  const visibleDistance = Math.min(RENDER_DISTANCE, getPerformanceProfile().visibleChunkRadius + 1);
  const instances: SurfaceInstance[] = [];

  for (const pos of indexedBlocks) {
    const chunkX = Math.floor(pos.x / CHUNK_SIZE);
    const chunkZ = Math.floor(pos.z / CHUNK_SIZE);
    if (Math.max(Math.abs(chunkX - cameraCenter.cx), Math.abs(chunkZ - cameraCenter.cz)) > visibleDistance) {
      continue;
    }

    const topBlock = getBlock(pos.x, pos.y + 1, pos.z);
    if (topBlock === config.blockId) continue;

    const dx = pos.x + 0.5 - camera.position.x;
    const dz = pos.z + 0.5 - camera.position.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > radiusSq) continue;

    const edgeWeight = getHorizontalEdgeWeight(getBlock, pos);
    if (edgeWeight <= 0 && config.kind === 'water') continue;

    const seed = seededUnit(pos.x, pos.y, pos.z, config.blockId);
    instances.push({
      x: pos.x + 0.5,
      y: pos.y + 1.018,
      z: pos.z + 0.5,
      seed,
      tint: seededUnit(pos.x, pos.y, pos.z, 7.2),
      angle: seededUnit(pos.x, pos.y, pos.z, 11.6) * Math.PI * 2,
      scale: THREE.MathUtils.lerp(config.minScale, config.maxScale, seededUnit(pos.x, pos.y, pos.z, 15.4)),
      edgeWeight: Math.max(edgeWeight, config.kind === 'lava' ? 0.55 : 0.2),
      distanceSq,
    });
  }

  instances.sort((a, b) => a.distanceSq - b.distanceSq);
  return instances.slice(0, countLimit);
}

function setFlatTransform(
  dummy: THREE.Object3D,
  instance: SurfaceInstance,
  config: LiquidSurfaceConfig,
  elapsed: number,
  index: number,
  isGlint: boolean,
): void {
  const wave = elapsed * config.pulseSpeed + instance.seed * Math.PI * 2;
  const pulse = 0.82 + Math.max(0, Math.sin(wave + index * 0.17)) * 0.36;
  const drift = Math.sin(wave * 0.72) * config.driftStrength;
  const scale = instance.scale * pulse * (0.72 + instance.edgeWeight * 0.55);

  dummy.position.set(
    instance.x + Math.cos(instance.angle) * drift,
    instance.y + (config.kind === 'lava' ? 0.018 : 0),
    instance.z + Math.sin(instance.angle) * drift,
  );
  dummy.rotation.set(-Math.PI / 2, 0, instance.angle + elapsed * (0.08 + instance.seed * 0.08));

  if (isGlint) {
    const thinScale = config.kind === 'water'
      ? 0.16 + instance.edgeWeight * 0.18
      : 0.08 + instance.edgeWeight * 0.11;
    dummy.scale.set(scale * (0.8 + Math.max(0, Math.cos(wave * 1.4)) * 0.4), thinScale, 1);
    return;
  }

  dummy.scale.setScalar(scale);
}

function LiquidSurfaceLayer({ config }: { config: LiquidSurfaceConfig }) {
  const ringMeshRef = useRef<THREE.InstancedMesh>(null);
  const glintMeshRef = useRef<THREE.InstancedMesh>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const glintMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const lastCenterUpdate = useRef(0);
  const { camera } = useThree();
  const blockIndexVersion = useWorldStore((s) => s.blockIndexVersion);
  const getIndexedBlockPositions = useWorldStore((s) => s.getIndexedBlockPositions);
  const getBlock = useWorldStore((s) => s.getBlock);
  useSettingsStore((s) => s.graphicsPreset);
  useSettingsStore((s) => s.waterAnimation);
  useSettingsStore((s) => s.renderDistance);
  const [cameraCenter, setCameraCenter] = useState<CameraSurfaceCenter>({
    cx: 0,
    cz: 0,
    cellX: 0,
    cellZ: 0,
  });

  const instances = useMemo(() => {
    void blockIndexVersion;
    return collectSurfaceInstances(
      config,
      getIndexedBlockPositions(config.blockId),
      getBlock,
      camera,
      cameraCenter,
    );
  }, [blockIndexVersion, camera, cameraCenter, config, getBlock, getIndexedBlockPositions]);

  const primaryColor = useMemo(() => new THREE.Color(config.primaryColor), [config.primaryColor]);
  const secondaryColor = useMemo(() => new THREE.Color(config.secondaryColor), [config.secondaryColor]);

  useEffect(() => {
    const ringMesh = ringMeshRef.current;
    const glintMesh = glintMeshRef.current;
    if (!ringMesh || !glintMesh) return;

    for (let i = 0; i < instances.length; i++) {
      _fxColor.copy(primaryColor).lerp(secondaryColor, instances[i].tint);
      ringMesh.setColorAt(i, _fxColor);
      glintMesh.setColorAt(i, _fxColor);
    }
    if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
    if (glintMesh.instanceColor) glintMesh.instanceColor.needsUpdate = true;
  }, [instances, primaryColor, secondaryColor]);

  useFrame(({ clock }) => {
    const now = performance.now();
    if (now - lastCenterUpdate.current >= CENTER_UPDATE_INTERVAL_MS) {
      lastCenterUpdate.current = now;
      const nextCx = Math.floor(camera.position.x / CHUNK_SIZE);
      const nextCz = Math.floor(camera.position.z / CHUNK_SIZE);
      const nextCellX = Math.floor(camera.position.x / SURFACE_REFRESH_CELL_SIZE);
      const nextCellZ = Math.floor(camera.position.z / SURFACE_REFRESH_CELL_SIZE);
      setCameraCenter((current) => (
        current.cx === nextCx
        && current.cz === nextCz
        && current.cellX === nextCellX
        && current.cellZ === nextCellZ
          ? current
          : {
              cx: nextCx,
              cz: nextCz,
              cellX: nextCellX,
              cellZ: nextCellZ,
            }
      ));
    }

    if (!ringMeshRef.current || !glintMeshRef.current || !ringMaterialRef.current || !glintMaterialRef.current) return;

    const elapsed = clock.getElapsedTime();
    const opacityPulse = config.kind === 'lava'
      ? 0.78 + Math.max(0, Math.sin(elapsed * 1.8)) * 0.28
      : 0.84 + Math.max(0, Math.sin(elapsed * 0.9)) * 0.18;
    ringMaterialRef.current.opacity = config.opacity * opacityPulse;
    glintMaterialRef.current.opacity = config.opacity * (config.kind === 'lava' ? 0.76 : 0.62) * opacityPulse;

    const ringMesh = ringMeshRef.current;
    const glintMesh = glintMeshRef.current;
    const dummy = dummyRef.current;

    for (let i = 0; i < instances.length; i++) {
      setFlatTransform(dummy, instances[i], config, elapsed, i, false);
      dummy.updateMatrix();
      ringMesh.setMatrixAt(i, dummy.matrix);

      setFlatTransform(dummy, instances[i], config, elapsed, i, true);
      dummy.updateMatrix();
      glintMesh.setMatrixAt(i, dummy.matrix);
    }

    ringMesh.instanceMatrix.needsUpdate = true;
    glintMesh.instanceMatrix.needsUpdate = true;
  });

  if (instances.length === 0) return null;

  const ringGeometry = config.kind === 'water' ? sharedWaterRingGeometry : sharedLavaRingGeometry;
  const glintGeometry = config.kind === 'water' ? sharedWaterGlintGeometry : sharedLavaSparkGeometry;
  const renderOrder = config.kind === 'water' ? WATER_RENDER_ORDER : LAVA_RENDER_ORDER;
  const blending = config.kind === 'water' ? THREE.AdditiveBlending : THREE.NormalBlending;

  return (
    <>
      <instancedMesh
        ref={ringMeshRef}
        args={[ringGeometry, undefined, instances.length]}
        renderOrder={renderOrder}
        frustumCulled={false}
      >
        <meshBasicMaterial
          ref={ringMaterialRef}
          vertexColors
          transparent
          opacity={config.opacity}
          depthWrite={false}
          depthTest
          // 水面より少し手前に押し出し、地形・壁を突き抜けないようにする
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
          side={THREE.DoubleSide}
          toneMapped={false}
          blending={blending}
        />
      </instancedMesh>
      <instancedMesh
        ref={glintMeshRef}
        args={[glintGeometry, undefined, instances.length]}
        renderOrder={renderOrder + 1}
        frustumCulled={false}
      >
        <meshBasicMaterial
          ref={glintMaterialRef}
          vertexColors
          transparent
          opacity={config.opacity * 0.6}
          depthWrite={false}
          depthTest
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
          side={THREE.DoubleSide}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
    </>
  );
}

/** 近くの水辺と溶岩面に、輪郭・泡・火花を重ねる */
export function LiquidSurfaceFX() {
  const phase = useGameStore((s) => s.phase);
  const biomeId = useGameStore((s) => s.currentStage?.biome ?? null);

  const waterConfig = useMemo(() => getWaterConfig(biomeId), [biomeId]);
  const lavaConfig = useMemo(() => getLavaConfig(), []);

  if (phase !== 'playing') return null;

  return (
    <>
      <LiquidSurfaceLayer config={waterConfig} />
      <LiquidSurfaceLayer config={lavaConfig} />
    </>
  );
}
