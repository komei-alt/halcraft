// モードフロー発動時に、建築/戦争で違う粒子バーストを視界へ出す

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { useModeFlowStore } from '../stores/useModeFlowStore';
import { getStageModeRule } from '../types/stageModeRules';
import type { StageCategory } from '../types/stages';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';

interface ModeFlowFxConfig {
  count: number;
  opacity: number;
  distance: number;
  radius: number;
  height: number;
  size: number;
  speed: number;
}

interface ModeFlowParticle {
  seed: number;
  angle: number;
  radius: number;
  height: number;
  speed: number;
  phase: number;
  size: number;
}

const CONFIGS: Record<StageCategory, ModeFlowFxConfig> = {
  build: {
    count: 46,
    opacity: 0.34,
    distance: 3.15,
    radius: 1.1,
    height: 1.85,
    size: 0.034,
    speed: 1.12,
  },
  war: {
    count: 54,
    opacity: 0.38,
    distance: 3.35,
    radius: 0.95,
    height: 1.35,
    size: 0.038,
    speed: 1.65,
  },
};

const LOW_TIER_SCALE = 0.58;
const BALANCED_TIER_SCALE = 0.78;
const TOUCH_SCALE = 0.68;
const FX_DURATION_MS = 1500;
const CHARGE_VISIBLE_RATIO = 0.36;

const sharedSphereGeometry = new THREE.SphereGeometry(1, 8, 6);
const sharedChargeRingGeometry = new THREE.TorusGeometry(1, 0.018, 8, 56);
const _up = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _chargeColor = new THREE.Color();
const _whiteColor = new THREE.Color(0xffffff);

function getEffectiveCount(config: ModeFlowFxConfig): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? LOW_TIER_SCALE
    : profile.tier === 'balanced'
      ? BALANCED_TIER_SCALE
      : 1;
  const touchScale = isTouchDevice() ? TOUCH_SCALE : 1;
  return Math.max(18, Math.round(config.count * tierScale * touchScale));
}

function createParticles(config: ModeFlowFxConfig, count: number): ModeFlowParticle[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 16807 % 9973) / 9973;
    const seed2 = (i * 48271 % 7919) / 7919;
    const seed3 = (i * 69621 % 6151) / 6151;
    return {
      seed,
      angle: seed * Math.PI * 2,
      radius: config.radius * (0.35 + seed2 * 0.9),
      height: config.height * (0.18 + seed3 * 0.82),
      speed: config.speed * (0.72 + seed2 * 0.78),
      phase: seed3 * Math.PI * 2,
      size: config.size * (0.68 + seed * 0.8),
    };
  });
}

function getFxFade(createdAt: number): number {
  const age = performance.now() - createdAt;
  const fadeIn = Math.min(1, age / 180);
  const fadeOut = Math.min(1, Math.max(0, FX_DURATION_MS - age) / 620);
  return Math.max(0, Math.min(fadeIn, fadeOut));
}

function prepareCameraBasis(camera: THREE.Camera, distance: number): void {
  camera.getWorldDirection(_forward);
  _forward.y = 0;
  if (_forward.lengthSq() < 0.001) {
    _forward.set(0, 0, -1);
  } else {
    _forward.normalize();
  }
  _right.crossVectors(_forward, _up).normalize();
  _origin.copy(camera.position).addScaledVector(_forward, distance);
}

/** モード発動の「いま乗った」感を、カメラ前方の短い反応で見せる */
export function StageModeFlowFX() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const chargeMeshRef = useRef<THREE.InstancedMesh>(null);
  const chargeRingRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const chargeMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const chargeRingMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const phase = useGameStore((s) => s.phase);
  const currentStageId = useGameStore((s) => s.currentStageId);
  const activation = useModeFlowStore((s) => s.recentActivation);
  const meter = useModeFlowStore((s) => s.meter);
  const flowRank = useModeFlowStore((s) => s.flowRank);
  const { camera } = useThree();
  const config = activation ? CONFIGS[activation.category] : null;
  const rule = getStageModeRule(currentStageId);
  const chargeConfig = rule ? CONFIGS[rule.category] : null;
  const chargeRatio = rule ? THREE.MathUtils.clamp(meter / rule.threshold, 0, 1) : 0;
  const chargeRenderable = phase === 'playing' && Boolean(rule && chargeConfig && chargeRatio >= CHARGE_VISIBLE_RATIO);
  const particles = useMemo(() => {
    const baseConfig = config ?? CONFIGS.build;
    return createParticles(baseConfig, getEffectiveCount(baseConfig));
  }, [config]);
  const chargeParticles = useMemo(() => {
    const baseConfig = chargeConfig ?? CONFIGS.build;
    return createParticles(baseConfig, Math.max(10, Math.round(getEffectiveCount(baseConfig) * 0.54)));
  }, [chargeConfig]);
  const color = useMemo(() => new THREE.Color(activation?.accent ?? '#ffffff'), [activation?.accent]);
  const chargeColor = useMemo(() => new THREE.Color(rule?.accent ?? '#ffffff'), [rule?.accent]);

  useFrame(({ clock }) => {
    const activationMesh = meshRef.current;
    const activationMaterial = materialRef.current;
    const chargeMesh = chargeMeshRef.current;
    const chargeMaterial = chargeMaterialRef.current;
    const chargeRing = chargeRingRef.current;
    const chargeRingMaterial = chargeRingMaterialRef.current;
    const elapsed = clock.getElapsedTime();

    if (activationMesh && activationMaterial && phase === 'playing' && activation && config) {
      const fade = getFxFade(activation.createdAt);
      if (fade <= 0) {
        activationMesh.visible = false;
      } else {
        activationMesh.visible = true;
        const rankScale = 1 + Math.max(0, activation.flowRank - 1) * 0.22;
        const burst = Math.max(0, 1 - (performance.now() - activation.createdAt) / 720);
        activationMaterial.color.copy(color);
        activationMaterial.opacity = Math.min(0.48, config.opacity * fade * rankScale);

        prepareCameraBasis(camera, config.distance);

        for (let i = 0; i < particles.length; i++) {
          const particle = particles[i];
          const t = elapsed * particle.speed + particle.phase;
          const ring = particle.angle + elapsed * particle.speed * (activation.category === 'build' ? 0.9 : 1.45);
          let x = 0;
          let y = 0;
          let z = 0;

          if (activation.category === 'build') {
            const lift = ((elapsed * 0.95 + particle.seed * config.height) % config.height) - config.height * 0.32;
            x = Math.cos(ring) * particle.radius * (0.7 + burst * 0.5);
            y = lift + Math.sin(t * 1.5) * 0.16 + burst * 0.24;
            z = Math.sin(ring) * 0.32;
          } else {
            const streak = 0.4 + burst * (0.85 + particle.seed * 0.6);
            x = Math.cos(ring) * particle.radius * (0.45 + burst * 0.55);
            y = Math.sin(ring) * config.height * 0.32 + 0.22 + Math.sin(t) * 0.1;
            z = streak + Math.sin(t * 1.2) * 0.28;
          }

          dummyRef.current.position
            .copy(_origin)
            .addScaledVector(_right, x)
            .addScaledVector(_up, y)
            .addScaledVector(_forward, z);
          dummyRef.current.scale.setScalar(particle.size * (0.92 + burst * 0.9) * rankScale);
          dummyRef.current.updateMatrix();
          activationMesh.setMatrixAt(i, dummyRef.current.matrix);
        }

        activationMesh.instanceMatrix.needsUpdate = true;
      }
    } else if (activationMesh) {
      activationMesh.visible = false;
    }

    if (!chargeMesh || !chargeMaterial || !rule || !chargeConfig || !chargeRenderable) {
      if (chargeMesh) chargeMesh.visible = false;
      if (chargeRing) chargeRing.visible = false;
      return;
    }

    const chargeStrength = THREE.MathUtils.smoothstep(chargeRatio, CHARGE_VISIBLE_RATIO, 0.96);
    const rankScale = 1 + Math.max(0, flowRank) * 0.14;
    const pulse = 0.76 + Math.max(0, Math.sin(elapsed * (rule.category === 'build' ? 2.2 : 3.1))) * 0.32;
    chargeMesh.visible = true;
    _chargeColor.copy(chargeColor).lerp(_whiteColor, chargeRatio > 0.88 ? 0.45 : 0.16);
    chargeMaterial.color.copy(_chargeColor);
    chargeMaterial.opacity = Math.min(0.32, chargeConfig.opacity * (0.24 + chargeStrength * 0.58) * pulse);

    prepareCameraBasis(camera, chargeConfig.distance * 0.86);

    if (chargeRing && chargeRingMaterial) {
      const ringScale = rule.category === 'build'
        ? 0.34 + chargeStrength * 0.3
        : 0.28 + chargeStrength * 0.22;
      chargeRing.visible = true;
      chargeRing.position.copy(_origin).addScaledVector(_up, rule.category === 'build' ? 0.12 : 0.06);
      chargeRing.lookAt(camera.position);
      chargeRing.rotateZ(elapsed * (rule.category === 'build' ? 0.75 : -1.35));
      chargeRing.scale.set(
        ringScale,
        rule.category === 'build' ? ringScale : ringScale * 0.72,
        ringScale,
      );
      chargeRingMaterial.color.copy(_chargeColor);
      chargeRingMaterial.opacity = Math.min(0.36, 0.1 + chargeStrength * 0.26) * pulse;
    }

    for (let i = 0; i < chargeParticles.length; i++) {
      const particle = chargeParticles[i];
      const t = elapsed * particle.speed + particle.phase;
      const ring = particle.angle + elapsed * particle.speed * (rule.category === 'build' ? 0.62 : 1.12);
      let x = 0;
      let y = 0;
      let z = 0;

      if (rule.category === 'build') {
        const orbit = 0.28 + chargeStrength * 0.86 + particle.radius * 0.08;
        x = Math.cos(ring) * orbit + Math.sin(t * 1.6) * 0.05;
        y = 0.14 + Math.sin(ring * 1.4) * 0.34 + chargeStrength * 0.24;
        z = Math.sin(t * 0.9) * 0.1;
      } else {
        const lane = (particle.seed - 0.5) * (0.56 + chargeStrength * 0.58);
        x = lane + Math.cos(ring) * chargeConfig.radius * 0.16;
        y = 0.12 + Math.sin(ring) * chargeConfig.height * 0.18;
        z = -0.18 + ((elapsed * particle.speed * 0.85 + particle.seed * 2.2) % 1.2) * (0.48 + chargeStrength * 0.5);
      }

      dummyRef.current.position
        .copy(_origin)
        .addScaledVector(_right, x)
        .addScaledVector(_up, y)
        .addScaledVector(_forward, z);
      dummyRef.current.scale.setScalar(particle.size * (0.42 + chargeStrength * 1.05) * rankScale);
      dummyRef.current.updateMatrix();
      chargeMesh.setMatrixAt(i, dummyRef.current.matrix);
    }

    chargeMesh.instanceMatrix.needsUpdate = true;
  });

  if (phase !== 'playing' || (!activation && !chargeRenderable)) return null;

  return (
    <>
      {activation && config ? (
        <instancedMesh
          ref={meshRef}
          args={[sharedSphereGeometry, undefined, particles.length]}
          frustumCulled={false}
          renderOrder={6}
        >
          <meshBasicMaterial
            ref={materialRef}
            color={color}
            depthTest={false}
            depthWrite={false}
            opacity={config.opacity}
            transparent
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </instancedMesh>
      ) : null}
      {chargeRenderable && chargeConfig ? (
        <>
          <mesh
            ref={chargeRingRef}
            geometry={sharedChargeRingGeometry}
            frustumCulled={false}
            renderOrder={5}
          >
            <meshBasicMaterial
              ref={chargeRingMaterialRef}
              color={chargeColor}
              depthTest={false}
              depthWrite={false}
              opacity={0.16}
              transparent
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          <instancedMesh
            ref={chargeMeshRef}
            args={[sharedSphereGeometry, undefined, chargeParticles.length]}
            frustumCulled={false}
            renderOrder={5}
          >
            <meshBasicMaterial
              ref={chargeMaterialRef}
              color={chargeColor}
              depthTest={false}
              depthWrite={false}
              opacity={chargeConfig.opacity * 0.28}
              transparent
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </instancedMesh>
        </>
      ) : null}
    </>
  );
}
