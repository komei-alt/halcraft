// ステージ別の空気感を出す軽量パーティクル演出

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import type { BiomeId } from '../types/stages';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';

type MotionKind = 'flutter' | 'sparkle' | 'snow' | 'dust';
type HorizonKind = 'dunes' | 'forestLine' | 'islands' | 'mountains';

interface AtmosphereConfig {
  count: number;
  color: number;
  opacity: number;
  size: number;
  radius: number;
  heightMin: number;
  heightMax: number;
  speed: number;
  verticalSpeed: number;
  driftStrength: number;
  motion: MotionKind;
  horizon: {
    kind: HorizonKind;
    color: number;
    accentColor: number;
    opacity: number;
    radius: number;
    yOffset: number;
    height: number;
  };
}

interface AtmosphereParticle {
  seed: number;
  angle: number;
  radius: number;
  height: number;
  speed: number;
  size: number;
  wave: number;
}

const CONFIGS: Record<BiomeId, AtmosphereConfig> = {
  forest: {
    count: 54,
    color: 0xb7ff72,
    opacity: 0.46,
    size: 0.075,
    radius: 20,
    heightMin: 1.6,
    heightMax: 7.5,
    speed: 0.18,
    verticalSpeed: 0.12,
    driftStrength: 1.4,
    motion: 'flutter',
    horizon: {
      kind: 'forestLine',
      color: 0x163a22,
      accentColor: 0x2f7b3c,
      opacity: 0.42,
      radius: 145,
      yOffset: -18,
      height: 18,
    },
  },
  tropical: {
    count: 48,
    color: 0x65fff2,
    opacity: 0.38,
    size: 0.065,
    radius: 22,
    heightMin: 1.1,
    heightMax: 5.8,
    speed: 0.22,
    verticalSpeed: 0.18,
    driftStrength: 1.8,
    motion: 'sparkle',
    horizon: {
      kind: 'islands',
      color: 0x0c5470,
      accentColor: 0x2fcf9f,
      opacity: 0.34,
      radius: 158,
      yOffset: -20,
      height: 14,
    },
  },
  snow: {
    count: 76,
    color: 0xf4fbff,
    opacity: 0.6,
    size: 0.055,
    radius: 24,
    heightMin: 2.2,
    heightMax: 12,
    speed: 0.09,
    verticalSpeed: 0.62,
    driftStrength: 1.1,
    motion: 'snow',
    horizon: {
      kind: 'mountains',
      color: 0xa7bfd5,
      accentColor: 0xf4fbff,
      opacity: 0.48,
      radius: 166,
      yOffset: -20,
      height: 34,
    },
  },
  desert: {
    count: 58,
    color: 0xffcc77,
    opacity: 0.34,
    size: 0.07,
    radius: 25,
    heightMin: 0.9,
    heightMax: 4.8,
    speed: 0.28,
    verticalSpeed: 0.05,
    driftStrength: 2.6,
    motion: 'dust',
    horizon: {
      kind: 'dunes',
      color: 0xc58b47,
      accentColor: 0xffcf7a,
      opacity: 0.36,
      radius: 172,
      yOffset: -22,
      height: 16,
    },
  },
};

const LOW_TIER_SCALE = 0.55;
const BALANCED_TIER_SCALE = 0.78;
const TOUCH_SCALE = 0.62;
const _motionOffset = new THREE.Vector3();
const _horizonPosition = new THREE.Vector3();
const _horizonRotation = new THREE.Euler();

interface HorizonPanel {
  angle: number;
  radiusOffset: number;
  yOffset: number;
  widthScale: number;
  heightScale: number;
}

function getEffectiveCount(config: AtmosphereConfig): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? LOW_TIER_SCALE
    : profile.tier === 'balanced'
      ? BALANCED_TIER_SCALE
      : 1;
  const touchScale = isTouchDevice() ? TOUCH_SCALE : 1;
  return Math.max(22, Math.round(config.count * tierScale * touchScale));
}

function createParticles(config: AtmosphereConfig, count: number): AtmosphereParticle[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 16807 % 9973) / 9973;
    const seed2 = (i * 48271 % 7919) / 7919;
    const seed3 = (i * 69621 % 6151) / 6151;
    return {
      seed,
      angle: seed * Math.PI * 2,
      radius: config.radius * (0.22 + seed2 * 0.78),
      height: config.heightMin + seed3 * (config.heightMax - config.heightMin),
      speed: config.speed * (0.65 + seed2 * 0.7),
      size: config.size * (0.65 + seed3 * 0.8),
      wave: seed3 * Math.PI * 2,
    };
  });
}

function skylineNoise(index: number, seed: number): number {
  const x = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function createSkylineGeometry(kind: HorizonKind, width: number, height: number, seed: number): THREE.BufferGeometry {
  const segments = 12;
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = (t - 0.5) * width;
    const noise = skylineNoise(i, seed);
    let top: number;

    if (kind === 'mountains') {
      const ridge = Math.max(
        0,
        1 - Math.abs(((t * 3.2 + seed * 0.37) % 1) * 2 - 1),
      );
      top = height * (0.34 + ridge * 0.78 + noise * 0.22);
    } else if (kind === 'forestLine') {
      const canopy = Math.sin(t * Math.PI * 8 + seed) * 0.18 + noise * 0.28;
      top = height * (0.58 + canopy);
    } else if (kind === 'islands') {
      const island = Math.max(0, Math.sin(t * Math.PI * 2.7 + seed * 2.1));
      top = height * (0.16 + island * 0.54 + noise * 0.16);
    } else {
      const dune = Math.sin(t * Math.PI * 2.2 + seed) * 0.28 + Math.sin(t * Math.PI * 4.4 + seed * 0.7) * 0.14;
      top = height * (0.42 + dune + noise * 0.1);
    }

    vertices.push(x, 0, 0, x, Math.max(height * 0.12, top), 0);
  }

  for (let i = 0; i < segments; i++) {
    const base = i * 2;
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createHorizonPanels(): HorizonPanel[] {
  const count = 14;
  return Array.from({ length: count }, (_, i) => {
    const seed = skylineNoise(i, 2.5);
    return {
      angle: (i / count) * Math.PI * 2,
      radiusOffset: (seed - 0.5) * 16,
      yOffset: (skylineNoise(i, 5.1) - 0.5) * 3,
      widthScale: 0.88 + skylineNoise(i, 8.7) * 0.28,
      heightScale: 0.82 + skylineNoise(i, 11.3) * 0.36,
    };
  });
}

function setMotionOffset(
  target: THREE.Vector3,
  config: AtmosphereConfig,
  particle: AtmosphereParticle,
  elapsed: number,
): void {
  const wind = elapsed * particle.speed + particle.wave;
  const sway = Math.sin(wind * 1.7) * config.driftStrength;
  const bob = Math.cos(wind * 1.3) * 0.35;

  if (config.motion === 'snow') {
    const fall = ((elapsed * config.verticalSpeed + particle.seed * 18) % 14) - 7;
    target.set(
      Math.sin(wind) * config.driftStrength,
      -fall,
      Math.cos(wind * 0.8) * config.driftStrength * 0.6,
    );
    return;
  }

  if (config.motion === 'dust') {
    target.set(
      sway + Math.sin(elapsed * 0.35 + particle.seed * 6) * 1.8,
      bob * 0.45,
      Math.cos(wind) * config.driftStrength * 0.5,
    );
    return;
  }

  if (config.motion === 'sparkle') {
    target.set(
      sway * 0.75,
      Math.sin(wind * 2.4) * config.verticalSpeed,
      Math.cos(wind * 1.9) * config.driftStrength * 0.55,
    );
    return;
  }

  target.set(
    sway * 0.85,
    Math.sin(wind * 2) * config.verticalSpeed + bob,
    Math.cos(wind) * config.driftStrength * 0.45,
  );
}

const sharedSphereGeometry = new THREE.SphereGeometry(1, 8, 6);

function BiomeHorizon({ config, phase }: { config: AtmosphereConfig; phase: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const panels = useMemo(() => createHorizonPanels(), []);
  const skylineGeometry = useMemo(
    () => createSkylineGeometry(config.horizon.kind, 48, config.horizon.height, config.horizon.color),
    [config.horizon.color, config.horizon.height, config.horizon.kind],
  );
  const accentGeometry = useMemo(
    () => createSkylineGeometry(config.horizon.kind, 42, config.horizon.height * 0.55, config.horizon.accentColor),
    [config.horizon.accentColor, config.horizon.height, config.horizon.kind],
  );

  useFrame(({ clock }) => {
    if (!groupRef.current || phase !== 'playing') return;
    const drift = Math.sin(clock.getElapsedTime() * 0.05) * 0.02;
    groupRef.current.position.set(camera.position.x, camera.position.y + config.horizon.yOffset, camera.position.z);
    groupRef.current.rotation.y = drift;
  });

  if (phase !== 'playing') return null;

  return (
    <group ref={groupRef} frustumCulled={false}>
      {panels.map((panel, index) => {
        const radius = config.horizon.radius + panel.radiusOffset;
        const x = Math.cos(panel.angle) * radius;
        const z = Math.sin(panel.angle) * radius;
        _horizonPosition.set(x, panel.yOffset, z);
        _horizonRotation.set(0, -panel.angle + Math.PI / 2, 0);
        return (
          <group
            key={`${config.horizon.kind}-${index}`}
            position={_horizonPosition.toArray()}
            rotation={[_horizonRotation.x, _horizonRotation.y, _horizonRotation.z]}
          >
            <mesh
              geometry={skylineGeometry}
              scale={[panel.widthScale, panel.heightScale, 1]}
              renderOrder={-20}
            >
              <meshBasicMaterial
                color={config.horizon.color}
                transparent
                opacity={config.horizon.opacity}
                depthWrite={false}
                fog
              />
            </mesh>
            <mesh
              geometry={accentGeometry}
              position={[0, config.horizon.height * 0.06, -0.45]}
              scale={[panel.widthScale * 0.82, panel.heightScale, 1]}
              renderOrder={-19}
            >
              <meshBasicMaterial
                color={config.horizon.accentColor}
                transparent
                opacity={config.horizon.opacity * 0.34}
                depthWrite={false}
                fog
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** 選んだマップの気候を、プレイ中の視界に薄く重ねる */
export function StageAtmosphereFX() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const phase = useGameStore((s) => s.phase);
  const biomeId = useGameStore((s) => s.currentStage?.biome ?? null);
  const { camera } = useThree();

  const config = biomeId ? CONFIGS[biomeId] : null;
  const particles = useMemo(() => {
    if (!config) return [];
    return createParticles(config, getEffectiveCount(config));
  }, [config]);

  useFrame(({ clock }) => {
    if (!meshRef.current || !config || phase !== 'playing') return;

    const elapsed = clock.getElapsedTime();
    const mesh = meshRef.current;
    const dummy = dummyRef.current;

    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const orbit = particle.angle + elapsed * particle.speed * 0.28;
      const baseX = Math.cos(orbit) * particle.radius;
      const baseZ = Math.sin(orbit) * particle.radius;
      setMotionOffset(_motionOffset, config, particle, elapsed);
      const scale = particle.size * (config.motion === 'sparkle'
        ? 0.75 + Math.max(0, Math.sin(elapsed * 5 + particle.wave)) * 0.65
        : 1);

      dummy.position.set(
        camera.position.x + baseX + _motionOffset.x,
        camera.position.y + particle.height + _motionOffset.y,
        camera.position.z + baseZ + _motionOffset.z,
      );
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!config || phase !== 'playing') return null;

  return (
    <>
      <BiomeHorizon config={config} phase={phase} />
      <instancedMesh
        ref={meshRef}
        args={[sharedSphereGeometry, undefined, particles.length]}
        frustumCulled={false}
        renderOrder={2}
      >
        <meshBasicMaterial
          color={config.color}
          depthWrite={false}
          opacity={config.opacity}
          transparent
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}
