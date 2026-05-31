// ステージランドマークの場所と個性を遠目にも分かるようにする軽量ビーコン

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import type { StageCategory } from '../types/stages';
import {
  STAGE_LANDMARK_CENTER,
  STAGE_LANDMARK_RADIUS,
  STAGE_LANDMARK_WORLD_CENTER,
} from '../types/stageLandmarks';
import { getTerrainHeight } from '../utils/terrain/heightmap';

type LandmarkVariant =
  | 'forest_arch'
  | 'tropical_lagoon'
  | 'snow_crown'
  | 'desert_obelisk'
  | 'forest_fort'
  | 'tropical_radar'
  | 'snow_shield'
  | 'desert_war_pyramid';

type CoreGeometry = 'sphere' | 'octahedron' | 'cone';
type RingShape = 'circle' | 'diamond' | 'square';

interface LandmarkVisual {
  variant: LandmarkVariant;
  primary: string;
  secondary: string;
  glow: string;
  halo: string;
  beamHeight: number;
  coreHeight: number;
  ringRadius: number;
  pulseRadius: number;
  rotationSpeed: number;
  coreGeometry: CoreGeometry;
  ringShape: RingShape;
}

const LANDMARK_VISUALS: Record<string, LandmarkVisual> = {
  'build-forest': {
    variant: 'forest_arch',
    primary: '#795126',
    secondary: '#4fbe5f',
    glow: '#ffd76a',
    halo: '#94ff86',
    beamHeight: 4.4,
    coreHeight: 4.85,
    ringRadius: STAGE_LANDMARK_RADIUS * 0.52,
    pulseRadius: STAGE_LANDMARK_RADIUS * 0.28,
    rotationSpeed: 0.28,
    coreGeometry: 'sphere',
    ringShape: 'circle',
  },
  'build-tropical': {
    variant: 'tropical_lagoon',
    primary: '#2aaed0',
    secondary: '#f2cf6b',
    glow: '#9dfcff',
    halo: '#72e7ff',
    beamHeight: 4.8,
    coreHeight: 5.1,
    ringRadius: STAGE_LANDMARK_RADIUS * 0.56,
    pulseRadius: STAGE_LANDMARK_RADIUS * 0.32,
    rotationSpeed: 0.36,
    coreGeometry: 'sphere',
    ringShape: 'circle',
  },
  'build-snow': {
    variant: 'snow_crown',
    primary: '#d8f7ff',
    secondary: '#8fd5ff',
    glow: '#f6feff',
    halo: '#b7efff',
    beamHeight: 5.2,
    coreHeight: 5.55,
    ringRadius: STAGE_LANDMARK_RADIUS * 0.5,
    pulseRadius: STAGE_LANDMARK_RADIUS * 0.25,
    rotationSpeed: 0.24,
    coreGeometry: 'octahedron',
    ringShape: 'diamond',
  },
  'build-desert': {
    variant: 'desert_obelisk',
    primary: '#d99b42',
    secondary: '#ffe08a',
    glow: '#ffcf5c',
    halo: '#ffd07a',
    beamHeight: 5.0,
    coreHeight: 5.38,
    ringRadius: STAGE_LANDMARK_RADIUS * 0.54,
    pulseRadius: STAGE_LANDMARK_RADIUS * 0.3,
    rotationSpeed: 0.32,
    coreGeometry: 'cone',
    ringShape: 'diamond',
  },
  'war-forest': {
    variant: 'forest_fort',
    primary: '#405644',
    secondary: '#b6ff71',
    glow: '#ff8c4a',
    halo: '#ffb25e',
    beamHeight: 5.7,
    coreHeight: 5.95,
    ringRadius: STAGE_LANDMARK_RADIUS * 0.58,
    pulseRadius: STAGE_LANDMARK_RADIUS * 0.34,
    rotationSpeed: 0.58,
    coreGeometry: 'octahedron',
    ringShape: 'square',
  },
  'war-tropical': {
    variant: 'tropical_radar',
    primary: '#1b8aa6',
    secondary: '#ffcf6a',
    glow: '#ff6d4a',
    halo: '#6ff3ff',
    beamHeight: 5.9,
    coreHeight: 6.18,
    ringRadius: STAGE_LANDMARK_RADIUS * 0.6,
    pulseRadius: STAGE_LANDMARK_RADIUS * 0.36,
    rotationSpeed: 0.64,
    coreGeometry: 'octahedron',
    ringShape: 'circle',
  },
  'war-snow': {
    variant: 'snow_shield',
    primary: '#bcd9e6',
    secondary: '#74c7ff',
    glow: '#fffbde',
    halo: '#c7f8ff',
    beamHeight: 6.0,
    coreHeight: 6.28,
    ringRadius: STAGE_LANDMARK_RADIUS * 0.56,
    pulseRadius: STAGE_LANDMARK_RADIUS * 0.32,
    rotationSpeed: 0.5,
    coreGeometry: 'octahedron',
    ringShape: 'diamond',
  },
  'war-desert': {
    variant: 'desert_war_pyramid',
    primary: '#b8682c',
    secondary: '#1e1612',
    glow: '#ff4d32',
    halo: '#ff9c52',
    beamHeight: 6.15,
    coreHeight: 6.42,
    ringRadius: STAGE_LANDMARK_RADIUS * 0.62,
    pulseRadius: STAGE_LANDMARK_RADIUS * 0.38,
    rotationSpeed: 0.72,
    coreGeometry: 'cone',
    ringShape: 'diamond',
  },
};

const SNOW_CROWN_SPIRES: Array<[number, number, number]> = [
  [-1.58, 1.34, 0],
  [1.58, 1.34, 0],
  [0, 1.34, -1.58],
  [0, 1.34, 1.58],
];

const SNOW_SHIELD_ROTATIONS = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];

const ORBITING_SHARDS: Array<[number, number, number]> = [
  [1.2, 0, 0],
  [-1.2, 0.05, 0],
  [0, -0.05, 1.2],
  [0, 0.08, -1.2],
];

function getLandmarkVisual(stageId: string, category: StageCategory, fallbackColor: string): LandmarkVisual {
  const visual = LANDMARK_VISUALS[stageId];
  if (visual) return visual;

  return {
    variant: category === 'war' ? 'forest_fort' : 'forest_arch',
    primary: category === 'war' ? '#405644' : '#795126',
    secondary: category === 'war' ? '#b6ff71' : '#4fbe5f',
    glow: fallbackColor,
    halo: fallbackColor,
    beamHeight: category === 'war' ? 5.7 : 4.6,
    coreHeight: category === 'war' ? 5.95 : 4.95,
    ringRadius: STAGE_LANDMARK_RADIUS * 0.54,
    pulseRadius: STAGE_LANDMARK_RADIUS * 0.3,
    rotationSpeed: category === 'war' ? 0.58 : 0.3,
    coreGeometry: category === 'war' ? 'octahedron' : 'sphere',
    ringShape: category === 'war' ? 'square' : 'circle',
  };
}

function CoreGeometryMesh({ geometry }: { geometry: CoreGeometry }) {
  if (geometry === 'octahedron') return <octahedronGeometry args={[0.66, 0]} />;
  if (geometry === 'cone') return <coneGeometry args={[0.58, 1.12, 5]} />;
  return <sphereGeometry args={[0.56, 18, 12]} />;
}

function RingGeometryMesh({ shape, radius }: { shape: RingShape; radius: number }) {
  if (shape === 'circle') return <torusGeometry args={[radius, 0.075, 8, 84]} />;
  return <ringGeometry args={[radius - 0.14, radius + 0.14, shape === 'square' ? 4 : 4]} />;
}

function StageLandmarkSculpture({ visual }: { visual: LandmarkVisual }) {
  switch (visual.variant) {
    case 'forest_arch':
      return (
        <group name="halcraft-landmark-forest-arch">
          <mesh position={[-2.4, 1.25, -0.2]}>
            <boxGeometry args={[0.55, 2.5, 0.55]} />
            <meshStandardMaterial color={visual.primary} roughness={0.88} />
          </mesh>
          <mesh position={[2.4, 1.25, -0.2]}>
            <boxGeometry args={[0.55, 2.5, 0.55]} />
            <meshStandardMaterial color={visual.primary} roughness={0.88} />
          </mesh>
          <mesh position={[0, 2.58, -0.2]}>
            <boxGeometry args={[5.2, 0.48, 0.58]} />
            <meshStandardMaterial color={visual.primary} roughness={0.88} />
          </mesh>
          <mesh position={[0, 3.18, -0.2]} rotation={[0, 0, 0.78]}>
            <boxGeometry args={[3.4, 0.62, 1.18]} />
            <meshStandardMaterial color={visual.secondary} roughness={0.82} />
          </mesh>
          <mesh position={[0, 3.18, -0.2]} rotation={[0, 0, -0.78]}>
            <boxGeometry args={[3.4, 0.62, 1.18]} />
            <meshStandardMaterial color={visual.secondary} roughness={0.82} />
          </mesh>
          <mesh position={[-1.25, 1.65, 0.82]}>
            <sphereGeometry args={[0.22, 10, 8]} />
            <meshBasicMaterial color={visual.glow} transparent opacity={0.72} depthWrite={false} />
          </mesh>
          <mesh position={[1.25, 1.65, 0.82]}>
            <sphereGeometry args={[0.22, 10, 8]} />
            <meshBasicMaterial color={visual.glow} transparent opacity={0.72} depthWrite={false} />
          </mesh>
        </group>
      );

    case 'tropical_lagoon':
      return (
        <group name="halcraft-landmark-tropical-lagoon">
          <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[2.45, 2.45, 0.06, 32]} />
            <meshBasicMaterial color={visual.halo} transparent opacity={0.18} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0.26, 0]}>
            <boxGeometry args={[4.8, 0.16, 0.78]} />
            <meshStandardMaterial color={visual.secondary} roughness={0.78} />
          </mesh>
          <mesh position={[0, 0.45, -0.94]}>
            <boxGeometry args={[3.4, 0.12, 0.42]} />
            <meshStandardMaterial color={visual.primary} roughness={0.62} metalness={0.08} />
          </mesh>
          <mesh position={[0, 0.45, 0.94]}>
            <boxGeometry args={[3.4, 0.12, 0.42]} />
            <meshStandardMaterial color={visual.primary} roughness={0.62} metalness={0.08} />
          </mesh>
          <mesh position={[-1.95, 1.34, 0]} rotation={[0, 0, -0.18]}>
            <cylinderGeometry args={[0.13, 0.19, 2.4, 7]} />
            <meshStandardMaterial color="#6f4a22" roughness={0.8} />
          </mesh>
          <mesh position={[-2.28, 2.45, 0]} rotation={[0.18, 0, 0.58]}>
            <coneGeometry args={[0.9, 1.8, 5]} />
            <meshStandardMaterial color="#4ec96f" roughness={0.72} />
          </mesh>
          <mesh position={[2.05, 1.25, 0.12]}>
            <sphereGeometry args={[0.28, 12, 8]} />
            <meshBasicMaterial color={visual.glow} transparent opacity={0.72} depthWrite={false} />
          </mesh>
        </group>
      );

    case 'snow_crown':
      return (
        <group name="halcraft-landmark-snow-crown">
          <mesh position={[0, 0.34, 0]}>
            <cylinderGeometry args={[1.85, 2.35, 0.68, 6]} />
            <meshStandardMaterial color={visual.primary} roughness={0.36} metalness={0.08} />
          </mesh>
          <mesh position={[0, 1.65, 0]}>
            <octahedronGeometry args={[1.05, 0]} />
            <meshStandardMaterial color={visual.secondary} roughness={0.32} metalness={0.12} />
          </mesh>
          {SNOW_CROWN_SPIRES.map(([x, y, z]) => (
            <mesh key={`${x}:${z}`} position={[x, y, z]}>
              <coneGeometry args={[0.28, 2.2, 5]} />
              <meshStandardMaterial color={visual.halo} roughness={0.25} metalness={0.1} />
            </mesh>
          ))}
          <mesh position={[0, 2.76, 0]} rotation={[Math.PI / 2, 0, Math.PI / 4]}>
            <ringGeometry args={[1.05, 1.18, 4]} />
            <meshBasicMaterial color={visual.glow} transparent opacity={0.4} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      );

    case 'desert_obelisk':
      return (
        <group name="halcraft-landmark-desert-obelisk">
          <mesh position={[0, 0.42, 0]}>
            <cylinderGeometry args={[2.1, 2.8, 0.84, 4]} />
            <meshStandardMaterial color={visual.primary} roughness={0.86} />
          </mesh>
          <mesh position={[0, 1.56, 0]}>
            <cylinderGeometry args={[0.48, 0.72, 2.15, 4]} />
            <meshStandardMaterial color={visual.secondary} roughness={0.78} />
          </mesh>
          <mesh position={[0, 2.94, 0]}>
            <coneGeometry args={[0.72, 1.1, 4]} />
            <meshStandardMaterial color={visual.glow} emissive={visual.glow} emissiveIntensity={0.32} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.72, 0]} rotation={[Math.PI / 2, 0, Math.PI / 4]}>
            <ringGeometry args={[2.85, 3.06, 4]} />
            <meshBasicMaterial color={visual.halo} transparent opacity={0.25} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      );

    case 'forest_fort':
      return (
        <group name="halcraft-landmark-forest-fort">
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[4.9, 0.9, 4.9]} />
            <meshStandardMaterial color={visual.primary} roughness={0.82} />
          </mesh>
          <mesh position={[0, 1.34, 0]}>
            <boxGeometry args={[3.35, 0.62, 3.35]} />
            <meshStandardMaterial color="#2e3d34" roughness={0.84} />
          </mesh>
          <mesh position={[0, 2.15, 0]} rotation={[0, Math.PI / 4, 0]}>
            <boxGeometry args={[3.9, 0.22, 0.24]} />
            <meshBasicMaterial color={visual.glow} transparent opacity={0.58} depthWrite={false} />
          </mesh>
          <mesh position={[0, 2.15, 0]} rotation={[0, -Math.PI / 4, 0]}>
            <boxGeometry args={[3.9, 0.22, 0.24]} />
            <meshBasicMaterial color={visual.glow} transparent opacity={0.58} depthWrite={false} />
          </mesh>
          <mesh position={[0, 2.72, 0]}>
            <octahedronGeometry args={[0.52, 0]} />
            <meshBasicMaterial color={visual.secondary} transparent opacity={0.72} depthWrite={false} />
          </mesh>
        </group>
      );

    case 'tropical_radar':
      return (
        <group name="halcraft-landmark-tropical-radar">
          <mesh position={[0, 0.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[2.45, 0.16, 8, 48]} />
            <meshStandardMaterial color={visual.primary} roughness={0.44} metalness={0.2} />
          </mesh>
          <mesh position={[0, 1.7, 0]}>
            <cylinderGeometry args={[0.16, 0.26, 3.4, 8]} />
            <meshStandardMaterial color={visual.secondary} roughness={0.68} metalness={0.16} />
          </mesh>
          <mesh position={[0, 3.18, -0.25]} rotation={[0.32, 0, 0]}>
            <torusGeometry args={[1.08, 0.055, 8, 44]} />
            <meshBasicMaterial color={visual.halo} transparent opacity={0.55} depthWrite={false} />
          </mesh>
          <mesh position={[0, 3.18, -0.25]} rotation={[0.32, 0, 0]}>
            <boxGeometry args={[2.28, 0.12, 0.16]} />
            <meshBasicMaterial color={visual.glow} transparent opacity={0.5} depthWrite={false} />
          </mesh>
        </group>
      );

    case 'snow_shield':
      return (
        <group name="halcraft-landmark-snow-shield">
          <mesh position={[0, 0.52, 0]}>
            <cylinderGeometry args={[2.25, 2.55, 1.04, 6]} />
            <meshStandardMaterial color={visual.primary} roughness={0.42} metalness={0.08} />
          </mesh>
          {SNOW_SHIELD_ROTATIONS.map((rotation) => (
            <mesh key={rotation} position={[Math.sin(rotation) * 1.74, 1.65, Math.cos(rotation) * 1.74]} rotation={[0, rotation, 0]}>
              <boxGeometry args={[1.4, 2.08, 0.16]} />
              <meshStandardMaterial color={visual.halo} roughness={0.3} metalness={0.12} />
            </mesh>
          ))}
          <mesh position={[0, 2.92, 0]}>
            <octahedronGeometry args={[0.64, 0]} />
            <meshBasicMaterial color={visual.glow} transparent opacity={0.68} depthWrite={false} />
          </mesh>
        </group>
      );

    case 'desert_war_pyramid':
      return (
        <group name="halcraft-landmark-desert-war-pyramid">
          <mesh position={[0, 0.42, 0]}>
            <cylinderGeometry args={[2.95, 3.45, 0.84, 4]} />
            <meshStandardMaterial color={visual.primary} roughness={0.86} />
          </mesh>
          <mesh position={[0, 1.1, 0]}>
            <cylinderGeometry args={[2.1, 2.62, 0.8, 4]} />
            <meshStandardMaterial color="#8f4628" roughness={0.84} />
          </mesh>
          <mesh position={[0, 1.86, 0]}>
            <cylinderGeometry args={[1.22, 1.72, 0.72, 4]} />
            <meshStandardMaterial color={visual.secondary} roughness={0.76} />
          </mesh>
          <mesh position={[0, 2.68, 0]}>
            <coneGeometry args={[1.05, 1.25, 4]} />
            <meshBasicMaterial color={visual.glow} transparent opacity={0.74} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0.9, 0]} rotation={[Math.PI / 2, 0, Math.PI / 4]}>
            <ringGeometry args={[3.35, 3.62, 4]} />
            <meshBasicMaterial color={visual.glow} transparent opacity={0.36} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      );
  }

  return null;
}

export function StageLandmarkBeaconFX() {
  const groupRef = useRef<THREE.Group>(null);
  const signalRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const outerPulseRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const shardRef = useRef<THREE.Group>(null);
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const stageId = stage?.id ?? null;

  const landmarkY = useMemo(() => {
    if (!stageId) return 0;
    return getTerrainHeight(STAGE_LANDMARK_CENTER.x, STAGE_LANDMARK_CENTER.z) + 1.12;
  }, [stageId]);

  useFrame(({ clock }) => {
    if (phase !== 'playing') return;

    const elapsed = clock.getElapsedTime();
    const visual = stage ? getLandmarkVisual(stage.id, stage.category, stage.color) : null;

    if (signalRef.current && visual) {
      signalRef.current.rotation.y = elapsed * visual.rotationSpeed;
    }

    if (pulseRef.current) {
      const pulse = 1 + Math.sin(elapsed * 2.25) * 0.08;
      pulseRef.current.scale.set(pulse, pulse, pulse);
    }

    if (outerPulseRef.current) {
      const pulse = 1 + Math.sin(elapsed * 1.35 + 0.7) * 0.05;
      outerPulseRef.current.scale.set(pulse, pulse, pulse);
    }

    if (coreRef.current) {
      const glow = 1 + Math.max(0, Math.sin(elapsed * 3.4)) * 0.2;
      if (visual) {
        coreRef.current.position.y = visual.coreHeight + Math.sin(elapsed * 2.1) * 0.04;
      }
      coreRef.current.scale.setScalar(glow);
    }

    if (shardRef.current) {
      shardRef.current.rotation.y = -elapsed * 0.72;
    }

    if (groupRef.current) {
      groupRef.current.position.y = landmarkY + Math.sin(elapsed * 0.9) * 0.025;
    }
  });

  if (!stage || phase !== 'playing') return null;

  const accent = stage.color;
  const isWar = stage.category === 'war';
  const visual = getLandmarkVisual(stage.id, stage.category, accent);

  return (
    <group
      ref={groupRef}
      position={[STAGE_LANDMARK_WORLD_CENTER.x, landmarkY, STAGE_LANDMARK_WORLD_CENTER.z]}
      renderOrder={3}
    >
      <StageLandmarkSculpture visual={visual} />

      <group ref={signalRef} position={[0, 0.06, 0]}>
        <mesh ref={outerPulseRef} rotation={[Math.PI / 2, 0, visual.ringShape === 'circle' ? 0 : Math.PI / 4]}>
          <RingGeometryMesh shape={visual.ringShape} radius={visual.ringRadius} />
          <meshBasicMaterial color={visual.halo} transparent opacity={isWar ? 0.28 : 0.22} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>

        <mesh ref={pulseRef} rotation={[Math.PI / 2, 0, visual.ringShape === 'circle' ? 0 : Math.PI / 4]}>
          <RingGeometryMesh shape={visual.ringShape} radius={visual.pulseRadius} />
          <meshBasicMaterial color="#ffffff" transparent opacity={isWar ? 0.38 : 0.34} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>

        <mesh position={[0, visual.beamHeight * 0.5, 0]}>
          <cylinderGeometry args={[0.11, 0.18, visual.beamHeight, 8]} />
          <meshBasicMaterial color={accent} transparent opacity={isWar ? 0.22 : 0.17} depthWrite={false} />
        </mesh>

        <group ref={shardRef} position={[0, visual.coreHeight, 0]}>
          {ORBITING_SHARDS.map(([x, y, z], index) => (
            <mesh key={index} position={[x, y, z]} rotation={[0.35, index * Math.PI * 0.5, 0.5]}>
              <boxGeometry args={[0.12, isWar ? 0.52 : 0.38, 0.12]} />
              <meshBasicMaterial color={index % 2 === 0 ? visual.glow : visual.halo} transparent opacity={0.48} depthWrite={false} />
            </mesh>
          ))}
        </group>
      </group>

      <mesh ref={coreRef} position={[0, visual.coreHeight, 0]}>
        <CoreGeometryMesh geometry={visual.coreGeometry} />
        <meshBasicMaterial color={visual.glow} transparent opacity={0.86} depthWrite={false} />
      </mesh>

      <mesh position={[0, visual.coreHeight, 0]}>
        <CoreGeometryMesh geometry={visual.coreGeometry} />
        <meshBasicMaterial color={visual.glow} transparent opacity={0.16} depthWrite={false} />
      </mesh>
    </group>
  );
}
