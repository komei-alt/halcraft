// 機能を持つブロックに、近距離で分かる控えめな光の目印を重ねる

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { useWorldStore, type IndexedBlockPosition } from '../stores/useWorldStore';
import { BLOCK_IDS, type BlockId } from '../types/blocks';
import { getBlockUseProfile } from '../utils/blockUseFeedback';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';

type AuraMotion = 'utility' | 'defense' | 'hazard' | 'route' | 'portal' | 'light';

interface AuraTuning {
  blockId: BlockId;
  height: number;
  groundScale: number;
  beaconScale: number;
  priority: number;
  motion: AuraMotion;
  secondaryColor: THREE.Color;
}

interface AuraCandidate extends AuraTuning {
  x: number;
  y: number;
  z: number;
  accent: THREE.Color;
}

const AURA_BLOCKS: BlockId[] = [
  BLOCK_IDS.TURRET,
  BLOCK_IDS.SPAWNER,
  BLOCK_IDS.TNT,
  BLOCK_IDS.LEVER,
  BLOCK_IDS.CHEST,
  BLOCK_IDS.FURNACE,
  BLOCK_IDS.BED,
  BLOCK_IDS.DOOR,
  BLOCK_IDS.NETHER_PORTAL,
  BLOCK_IDS.RAIL_BOOSTER,
  BLOCK_IDS.RAIL_CHAIN,
  BLOCK_IDS.RAIL_LOOP,
  BLOCK_IDS.CAMPFIRE,
  BLOCK_IDS.CANDLE,
];

const AURA_TUNING: Partial<Record<BlockId, Omit<AuraTuning, 'blockId'>>> = {
  [BLOCK_IDS.TURRET]: {
    height: 1.55,
    groundScale: 1.28,
    beaconScale: 1.08,
    priority: 1,
    motion: 'defense',
    secondaryColor: new THREE.Color(0xffd3df),
  },
  [BLOCK_IDS.SPAWNER]: {
    height: 1.55,
    groundScale: 1.36,
    beaconScale: 1.16,
    priority: 1,
    motion: 'defense',
    secondaryColor: new THREE.Color(0xffc06f),
  },
  [BLOCK_IDS.TNT]: {
    height: 1.05,
    groundScale: 1.22,
    beaconScale: 0.98,
    priority: 2,
    motion: 'hazard',
    secondaryColor: new THREE.Color(0xffe08a),
  },
  [BLOCK_IDS.LEVER]: {
    height: 0.78,
    groundScale: 0.88,
    beaconScale: 0.7,
    priority: 3,
    motion: 'hazard',
    secondaryColor: new THREE.Color(0xfff0a0),
  },
  [BLOCK_IDS.CHEST]: {
    height: 1.05,
    groundScale: 1.04,
    beaconScale: 0.82,
    priority: 4,
    motion: 'utility',
    secondaryColor: new THREE.Color(0xffe6a0),
  },
  [BLOCK_IDS.FURNACE]: {
    height: 1.08,
    groundScale: 1.08,
    beaconScale: 0.84,
    priority: 4,
    motion: 'light',
    secondaryColor: new THREE.Color(0xffd098),
  },
  [BLOCK_IDS.BED]: {
    height: 0.92,
    groundScale: 1.02,
    beaconScale: 0.78,
    priority: 5,
    motion: 'utility',
    secondaryColor: new THREE.Color(0xffd7e0),
  },
  [BLOCK_IDS.DOOR]: {
    height: 1.42,
    groundScale: 0.95,
    beaconScale: 0.72,
    priority: 5,
    motion: 'utility',
    secondaryColor: new THREE.Color(0xffd0a0),
  },
  [BLOCK_IDS.NETHER_PORTAL]: {
    height: 1.72,
    groundScale: 1.42,
    beaconScale: 1.3,
    priority: 1,
    motion: 'portal',
    secondaryColor: new THREE.Color(0xffffff),
  },
  [BLOCK_IDS.RAIL_BOOSTER]: {
    height: 0.28,
    groundScale: 0.84,
    beaconScale: 0.54,
    priority: 6,
    motion: 'route',
    secondaryColor: new THREE.Color(0xfff0a0),
  },
  [BLOCK_IDS.RAIL_CHAIN]: {
    height: 0.28,
    groundScale: 0.84,
    beaconScale: 0.54,
    priority: 6,
    motion: 'route',
    secondaryColor: new THREE.Color(0xffd08a),
  },
  [BLOCK_IDS.RAIL_LOOP]: {
    height: 0.3,
    groundScale: 0.92,
    beaconScale: 0.6,
    priority: 6,
    motion: 'route',
    secondaryColor: new THREE.Color(0xd8b7ff),
  },
  [BLOCK_IDS.CAMPFIRE]: {
    height: 0.9,
    groundScale: 1,
    beaconScale: 0.78,
    priority: 5,
    motion: 'light',
    secondaryColor: new THREE.Color(0xffe2a0),
  },
  [BLOCK_IDS.CANDLE]: {
    height: 0.72,
    groundScale: 0.72,
    beaconScale: 0.56,
    priority: 7,
    motion: 'light',
    secondaryColor: new THREE.Color(0xfff4c0),
  },
};

const MAX_AURAS_HIGH = 96;
const MAX_AURAS_BALANCED = 64;
const MAX_AURAS_LOW = 38;
const RANGE_HIGH = 42;
const RANGE_BALANCED = 34;
const RANGE_LOW = 26;
const _auraColor = new THREE.Color();

function getMaxAuras(): number {
  const profile = getPerformanceProfile();
  if (isTouchDevice() || profile.tier === 'low') return MAX_AURAS_LOW;
  if (profile.tier === 'balanced') return MAX_AURAS_BALANCED;
  return MAX_AURAS_HIGH;
}

function getAuraRange(): number {
  const profile = getPerformanceProfile();
  if (isTouchDevice() || profile.tier === 'low') return RANGE_LOW;
  if (profile.tier === 'balanced') return RANGE_BALANCED;
  return RANGE_HIGH;
}

function createCandidate(block: IndexedBlockPosition, stageId: string | null): AuraCandidate | null {
  const tuning = AURA_TUNING[block.blockId];
  if (!tuning) return null;
  const profile = getBlockUseProfile(block.blockId, stageId);
  return {
    ...tuning,
    blockId: block.blockId,
    x: block.x + 0.5,
    y: block.y,
    z: block.z + 0.5,
    accent: new THREE.Color(profile.accent),
  };
}

function collectAuraCandidates(stageId: string | null, _blockIndexVersion: number): AuraCandidate[] {
  void _blockIndexVersion;
  const world = useWorldStore.getState();
  const candidates: AuraCandidate[] = [];
  for (const blockId of AURA_BLOCKS) {
    const blocks = world.getIndexedBlockPositions(blockId);
    for (const block of blocks) {
      const candidate = createCandidate(block, stageId);
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates.sort((a, b) => a.priority - b.priority);
}

function getMotionPulse(motion: AuraMotion, elapsed: number, seed: number): number {
  if (motion === 'hazard') return 1 + Math.sin(elapsed * 5.6 + seed) * 0.13;
  if (motion === 'defense') return 1 + Math.sin(elapsed * 3.4 + seed) * 0.09;
  if (motion === 'route') return 1 + Math.sin(elapsed * 6.8 + seed) * 0.1;
  if (motion === 'portal') return 1 + Math.sin(elapsed * 2.1 + seed) * 0.16;
  if (motion === 'light') return 1 + Math.sin(elapsed * 7.5 + seed) * 0.08;
  return 1 + Math.sin(elapsed * 2.8 + seed) * 0.07;
}

function getMotionRotation(motion: AuraMotion, elapsed: number, seed: number): number {
  const direction = motion === 'hazard' || motion === 'portal' ? -1 : 1;
  const speed = motion === 'route'
    ? 1.8
    : motion === 'hazard'
      ? 2.4
      : motion === 'portal'
        ? 1.2
        : 0.72;
  return seed + elapsed * speed * direction;
}

/** 機能ブロックが置かれた瞬間から、役割を見た目で読めるようにする */
export function FunctionalBlockAuraFX() {
  const phase = useGameStore((s) => s.phase);
  const stageId = useGameStore((s) => s.currentStageId);
  const blockIndexVersion = useWorldStore((s) => s.blockIndexVersion);
  const groundRef = useRef<THREE.InstancedMesh>(null);
  const beaconRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const candidates = useMemo(
    () => collectAuraCandidates(stageId, blockIndexVersion),
    [blockIndexVersion, stageId],
  );
  const maxAuras = getMaxAuras();
  const range = getAuraRange();
  const rangeSq = range * range;

  const groundGeometry = useMemo(() => new THREE.RingGeometry(0.34, 0.67, 56), []);
  const beaconGeometry = useMemo(() => new THREE.RingGeometry(0.18, 0.46, 40), []);
  const groundMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), []);
  const beaconMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), []);

  useFrame(({ camera, clock }) => {
    if (!groundRef.current || !beaconRef.current || phase !== 'playing' || candidates.length === 0) {
      if (groundRef.current) groundRef.current.count = 0;
      if (beaconRef.current) beaconRef.current.count = 0;
      return;
    }

    const elapsed = clock.getElapsedTime();
    const dummy = dummyRef.current;
    let visibleCount = 0;

    for (let i = 0; i < candidates.length && visibleCount < maxAuras; i++) {
      const candidate = candidates[i];
      const dx = candidate.x - camera.position.x;
      const dy = candidate.y - camera.position.y;
      const dz = candidate.z - camera.position.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq > rangeSq) continue;

      const distanceFade = 1 - THREE.MathUtils.smoothstep(Math.sqrt(distSq), range * 0.62, range);
      if (distanceFade <= 0.01) continue;

      const seed = candidate.x * 0.37 + candidate.y * 0.19 + candidate.z * 0.27;
      const pulse = getMotionPulse(candidate.motion, elapsed, seed);
      const rotation = getMotionRotation(candidate.motion, elapsed, seed);
      _auraColor.copy(candidate.accent).lerp(candidate.secondaryColor, 0.2 + Math.max(0, Math.sin(elapsed * 2.2 + seed)) * 0.18);
      _auraColor.multiplyScalar(0.72 + distanceFade * 0.86);

      dummy.position.set(candidate.x, candidate.y + 0.095, candidate.z);
      dummy.rotation.set(-Math.PI / 2, 0, rotation);
      dummy.scale.setScalar(candidate.groundScale * pulse * distanceFade);
      dummy.updateMatrix();
      groundRef.current.setMatrixAt(visibleCount, dummy.matrix);
      groundRef.current.setColorAt(visibleCount, _auraColor);

      dummy.position.set(
        candidate.x,
        candidate.y + candidate.height + Math.sin(elapsed * 1.8 + seed) * 0.055,
        candidate.z,
      );
      dummy.quaternion.copy(camera.quaternion);
      dummy.rotateZ(-rotation * 0.85);
      dummy.scale.setScalar(candidate.beaconScale * (1.02 + pulse * 0.24) * distanceFade);
      dummy.updateMatrix();
      beaconRef.current.setMatrixAt(visibleCount, dummy.matrix);
      beaconRef.current.setColorAt(visibleCount, _auraColor);

      visibleCount++;
    }

    groundRef.current.count = visibleCount;
    beaconRef.current.count = visibleCount;
    groundRef.current.instanceMatrix.needsUpdate = true;
    beaconRef.current.instanceMatrix.needsUpdate = true;
    if (groundRef.current.instanceColor) groundRef.current.instanceColor.needsUpdate = true;
    if (beaconRef.current.instanceColor) beaconRef.current.instanceColor.needsUpdate = true;
  });

  if (phase !== 'playing') return null;

  return (
    <>
      <instancedMesh
        ref={groundRef}
        args={[groundGeometry, groundMaterial, maxAuras]}
        frustumCulled={false}
        renderOrder={2}
      />
      <instancedMesh
        ref={beaconRef}
        args={[beaconGeometry, beaconMaterial, maxAuras]}
        frustumCulled={false}
        renderOrder={3}
      />
    </>
  );
}
