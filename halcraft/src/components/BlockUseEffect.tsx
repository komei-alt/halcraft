// ブロックを使った瞬間の小さな光エフェクト
// 特殊ブロックの役割が、画面内でも手応えとして伝わるようにする

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerBlockUseEffectSpawner } from '../utils/effectTriggers';
import type { BlockUseFeedbackKind } from '../utils/blockUseFeedback';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  totalLife: number;
  color: THREE.Color;
}

interface UseEffectBurst {
  id: string;
  kind: BlockUseFeedbackKind;
  particles: Particle[];
  originX: number;
  originY: number;
  originZ: number;
  accent: THREE.Color;
  life: number;
  totalLife: number;
  spin: number;
}

const MAX_EFFECTS = 18;
const PARTICLES_PER_EFFECT = 22;
const MAX_PARTICLES = MAX_EFFECTS * PARTICLES_PER_EFFECT;
const SIGNATURES_PER_EFFECT = 2;
const MAX_SIGNATURES = MAX_EFFECTS * SIGNATURES_PER_EFFECT;
const BASE_LIFETIME = 0.78;
const RING_LIFETIME = 0.64;

let effectSequence = 0;

function getParticleCount(kind: BlockUseFeedbackKind): number {
  if (kind === 'explosive' || kind === 'summon') return 28;
  if (kind === 'condition' || kind === 'defense') return 24;
  return PARTICLES_PER_EFFECT;
}

function getVelocity(kind: BlockUseFeedbackKind, index: number, count: number): THREE.Vector3 {
  const angle = (index / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.25;
  const radiusSpeed = kind === 'explosive'
    ? 4.2 + Math.random() * 2.4
    : kind === 'rail'
      ? 2.8 + Math.random() * 1.4
      : kind === 'liquid'
        ? 1.1 + Math.random() * 0.9
        : 1.8 + Math.random() * 1.5;

  if (kind === 'summon') {
    return new THREE.Vector3(
      Math.cos(angle) * 1.4,
      2.8 + Math.random() * 2.1,
      Math.sin(angle) * 1.4,
    );
  }

  if (kind === 'rail') {
    return new THREE.Vector3(
      Math.cos(angle) * radiusSpeed,
      0.25 + Math.random() * 0.55,
      Math.sin(angle) * 0.45,
    );
  }

  if (kind === 'liquid') {
    return new THREE.Vector3(
      Math.cos(angle) * radiusSpeed,
      0.35 + Math.random() * 0.75,
      Math.sin(angle) * radiusSpeed,
    );
  }

  return new THREE.Vector3(
    Math.cos(angle) * radiusSpeed,
    kind === 'explosive' ? 1.2 + Math.random() * 2.8 : 1.6 + Math.random() * 1.8,
    Math.sin(angle) * radiusSpeed,
  );
}

function tintParticle(base: THREE.Color, kind: BlockUseFeedbackKind, index: number): THREE.Color {
  const color = base.clone();
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const brightBoost = kind === 'light' || kind === 'condition' ? 0.22 : 0.14;
  hsl.l = Math.max(0.18, Math.min(0.92, hsl.l + brightBoost + (Math.random() - 0.5) * 0.18));
  hsl.s = Math.max(0.35, Math.min(1, hsl.s + (Math.random() - 0.5) * 0.16));
  color.setHSL(hsl.h, hsl.s, hsl.l);
  if (kind === 'explosive' && index % 3 === 0) color.set('#ffe082');
  if (kind === 'liquid' && index % 4 === 0) color.set('#d8f7ff');
  return color;
}

function getRingLife(kind: BlockUseFeedbackKind): number {
  if (kind === 'explosive' || kind === 'summon') return 0.92;
  if (kind === 'condition' || kind === 'defense') return 0.76;
  return RING_LIFETIME;
}

function getRingScale(kind: BlockUseFeedbackKind, progress: number): number {
  const base = kind === 'explosive'
    ? 1.1
    : kind === 'summon'
      ? 0.95
      : kind === 'liquid'
        ? 0.72
        : 0.58;
  const spread = kind === 'explosive'
    ? 2.45
    : kind === 'summon'
      ? 1.75
      : kind === 'rail'
        ? 1.95
        : 1.24;
  return base + progress * spread;
}

function getCoreScale(kind: BlockUseFeedbackKind, progress: number): number {
  const pulse = Math.sin(Math.min(1, progress) * Math.PI);
  if (kind === 'explosive') return 0.22 + pulse * 0.42 + progress * 0.2;
  if (kind === 'summon') return 0.28 + pulse * 0.36;
  if (kind === 'condition' || kind === 'light') return 0.18 + pulse * 0.28;
  if (kind === 'rail') return 0.16 + pulse * 0.22;
  return 0.14 + pulse * 0.18;
}

function getSignatureScale(
  kind: BlockUseFeedbackKind,
  progress: number,
  layer: number,
): { width: number; height: number; y: number; rotation: number } {
  const pulse = Math.sin(Math.min(1, progress) * Math.PI);
  const layerScale = layer === 0 ? 1 : 0.72;

  if (kind === 'explosive') {
    return {
      width: (0.6 + progress * 2.2) * layerScale,
      height: (0.18 + pulse * 0.46) * layerScale,
      y: 0.02 + pulse * 0.22,
      rotation: layer * Math.PI * 0.5,
    };
  }

  if (kind === 'summon') {
    return {
      width: (0.36 + pulse * 0.28) * layerScale,
      height: (1.15 + progress * 1.4) * layerScale,
      y: 0.45 + progress * 0.58,
      rotation: layer * Math.PI * 0.5,
    };
  }

  if (kind === 'condition' || kind === 'light') {
    return {
      width: (0.22 + pulse * 0.18) * layerScale,
      height: (0.92 + progress * 0.86) * layerScale,
      y: 0.34 + progress * 0.34,
      rotation: layer * Math.PI * 0.5,
    };
  }

  if (kind === 'rail') {
    return {
      width: (1.05 + progress * 1.25) * layerScale,
      height: (0.09 + pulse * 0.16) * layerScale,
      y: 0.02 + pulse * 0.12,
      rotation: layer * Math.PI * 0.5,
    };
  }

  if (kind === 'defense' || kind === 'switch') {
    return {
      width: (0.72 + progress * 0.82) * layerScale,
      height: (0.14 + pulse * 0.2) * layerScale,
      y: 0.16 + pulse * 0.14,
      rotation: layer * Math.PI * 0.5,
    };
  }

  return {
    width: (0.44 + progress * 0.72) * layerScale,
    height: (0.12 + pulse * 0.16) * layerScale,
    y: 0.12 + pulse * 0.1,
    rotation: layer * Math.PI * 0.5,
  };
}

function getSignatureCount(kind: BlockUseFeedbackKind): number {
  if (kind === 'condition' || kind === 'explosive' || kind === 'summon' || kind === 'rail') return 2;
  return 1;
}

export function BlockUseEffect() {
  const effectsRef = useRef<UseEffectBurst[]>([]);
  const floorRingRef = useRef<THREE.InstancedMesh>(null);
  const haloRingRef = useRef<THREE.InstancedMesh>(null);
  const coreRef = useRef<THREE.InstancedMesh>(null);
  const signatureRef = useRef<THREE.InstancedMesh>(null);

  const floorRingGeometry = useMemo(() => new THREE.RingGeometry(0.38, 0.53, 56), []);
  const haloRingGeometry = useMemo(() => new THREE.RingGeometry(0.28, 0.42, 56), []);
  const coreGeometry = useMemo(() => new THREE.OctahedronGeometry(0.5, 0), []);
  const signatureGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.96,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), []);
  const haloMaterial = useMemo(() => ringMaterial.clone(), [ringMaterial]);
  const coreMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), []);
  const signatureMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.74,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), []);
  const dummyObject = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);

  const material = useMemo(() => new THREE.PointsMaterial({
    size: 0.16,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    sizeAttenuation: true,
    depthWrite: false,
  }), []);

  const spawnEffect = useCallback((
    kind: BlockUseFeedbackKind,
    x: number,
    y: number,
    z: number,
    accent: string,
  ) => {
    const centerX = x + 0.5;
    const centerY = y + 0.75;
    const centerZ = z + 0.5;
    const baseColor = new THREE.Color(accent);
    const count = getParticleCount(kind);
    const particles: Particle[] = [];
    const ringLife = getRingLife(kind);

    for (let i = 0; i < count; i++) {
      const velocity = getVelocity(kind, i, count);
      const totalLife = BASE_LIFETIME * (0.72 + Math.random() * 0.46);
      particles.push({
        x: centerX + (Math.random() - 0.5) * 0.28,
        y: centerY + (Math.random() - 0.5) * 0.24,
        z: centerZ + (Math.random() - 0.5) * 0.28,
        vx: velocity.x,
        vy: velocity.y,
        vz: velocity.z,
        life: totalLife,
        totalLife,
        color: tintParticle(baseColor, kind, i),
      });
    }

    const effects = effectsRef.current;
    effects.push({
      id: `use_${effectSequence++}`,
      kind,
      particles,
      originX: centerX,
      originY: y + 0.5,
      originZ: centerZ,
      accent: baseColor,
      life: ringLife,
      totalLife: ringLife,
      spin: Math.random() * Math.PI * 2,
    });
    if (effects.length > MAX_EFFECTS) {
      effects.splice(0, effects.length - MAX_EFFECTS);
    }
  }, []);

  useEffect(() => {
    registerBlockUseEffectSpawner(spawnEffect);
    return () => registerBlockUseEffectSpawner(() => {});
  }, [spawnEffect]);

  useFrame(({ camera }, delta) => {
    const effects = effectsRef.current;
    if (effects.length === 0) {
      geometry.setDrawRange(0, 0);
      if (floorRingRef.current) floorRingRef.current.count = 0;
      if (haloRingRef.current) haloRingRef.current.count = 0;
      if (coreRef.current) coreRef.current.count = 0;
      if (signatureRef.current) signatureRef.current.count = 0;
      return;
    }

    const dt = Math.min(delta, 0.05);
    for (let i = effects.length - 1; i >= 0; i--) {
      effects[i].life -= dt;
      if (effects[i].life <= 0 && effects[i].particles.every((particle) => particle.life <= 0)) {
        effects.splice(i, 1);
      }
    }

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colorAttr.array as Float32Array;
    let particleIndex = 0;
    let ringIndex = 0;
    let haloIndex = 0;
    let coreIndex = 0;
    let signatureIndex = 0;

    for (const effect of effects) {
      if (effect.life > 0) {
        const progress = 1 - Math.max(0, effect.life / effect.totalLife);
        const fade = Math.max(0, effect.life / effect.totalLife);
        const bloom = Math.sin(Math.min(1, progress) * Math.PI);
        const ringScale = getRingScale(effect.kind, progress);
        const colorPower = 0.22 + fade * 0.9 + bloom * 0.22;
        tempColor.copy(effect.accent).multiplyScalar(colorPower);

        if (coreRef.current && coreIndex < MAX_EFFECTS) {
          dummyObject.position.set(effect.originX, effect.originY + 0.08 + bloom * 0.24, effect.originZ);
          dummyObject.rotation.set(
            effect.spin + progress * 2.1,
            effect.spin * 0.31 + progress * 1.4,
            effect.spin * 0.7 + progress * 2.6,
          );
          dummyObject.scale.setScalar(getCoreScale(effect.kind, progress));
          dummyObject.updateMatrix();
          coreRef.current.setMatrixAt(coreIndex, dummyObject.matrix);
          coreRef.current.setColorAt(coreIndex, tempColor);
          coreIndex++;
        }

        if (signatureRef.current) {
          const signatureCount = getSignatureCount(effect.kind);
          for (let layer = 0; layer < signatureCount && signatureIndex < MAX_SIGNATURES; layer++) {
            const signature = getSignatureScale(effect.kind, progress, layer);
            dummyObject.position.set(
              effect.originX,
              effect.originY + signature.y + bloom * 0.08,
              effect.originZ,
            );
            dummyObject.quaternion.copy(camera.quaternion);
            dummyObject.rotateZ(effect.spin + progress * 1.7 + signature.rotation);
            dummyObject.scale.set(signature.width, signature.height, 1);
            dummyObject.updateMatrix();
            signatureRef.current.setMatrixAt(signatureIndex, dummyObject.matrix);
            tempColor.copy(effect.accent).multiplyScalar((0.18 + fade * 0.66 + bloom * 0.34) * (layer === 0 ? 1 : 0.72));
            signatureRef.current.setColorAt(signatureIndex, tempColor);
            signatureIndex++;
          }
        }

        if (floorRingRef.current && ringIndex < MAX_EFFECTS) {
          dummyObject.position.set(effect.originX, effect.originY - 0.46, effect.originZ);
          dummyObject.rotation.set(-Math.PI / 2, 0, effect.spin + progress * 1.6);
          dummyObject.scale.setScalar(ringScale);
          dummyObject.updateMatrix();
          floorRingRef.current.setMatrixAt(ringIndex, dummyObject.matrix);
          floorRingRef.current.setColorAt(ringIndex, tempColor);
          ringIndex++;
        }

        if (haloRingRef.current && haloIndex < MAX_EFFECTS) {
          dummyObject.position.set(effect.originX, effect.originY + 0.2 + bloom * 0.16, effect.originZ);
          dummyObject.quaternion.copy(camera.quaternion);
          dummyObject.scale.setScalar((0.5 + progress * 0.85) * (effect.kind === 'summon' ? 1.22 : 1));
          dummyObject.updateMatrix();
          haloRingRef.current.setMatrixAt(haloIndex, dummyObject.matrix);
          haloRingRef.current.setColorAt(haloIndex, tempColor);
          haloIndex++;
        }
      }

      const gravity = effect.kind === 'liquid' ? -3.2 : effect.kind === 'explosive' ? -4.5 : -1.2;
      const drag = effect.kind === 'rail' ? 0.93 : 0.96;
      for (const particle of effect.particles) {
        if (particle.life <= 0 || particleIndex >= MAX_PARTICLES) continue;
        particle.vy += gravity * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.z += particle.vz * dt;
        particle.vx *= drag;
        particle.vz *= drag;
        particle.life -= dt;

        const alpha = Math.max(0, particle.life / particle.totalLife);
        const i3 = particleIndex * 3;
        positions[i3] = particle.x;
        positions[i3 + 1] = particle.y;
        positions[i3 + 2] = particle.z;
        colors[i3] = particle.color.r * alpha;
        colors[i3 + 1] = particle.color.g * alpha;
        colors[i3 + 2] = particle.color.b * alpha;
        particleIndex++;
      }
    }

    geometry.setDrawRange(0, particleIndex);
    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;

    if (floorRingRef.current) {
      floorRingRef.current.count = ringIndex;
      floorRingRef.current.instanceMatrix.needsUpdate = true;
      if (floorRingRef.current.instanceColor) floorRingRef.current.instanceColor.needsUpdate = true;
    }
    if (haloRingRef.current) {
      haloRingRef.current.count = haloIndex;
      haloRingRef.current.instanceMatrix.needsUpdate = true;
      if (haloRingRef.current.instanceColor) haloRingRef.current.instanceColor.needsUpdate = true;
    }
    if (coreRef.current) {
      coreRef.current.count = coreIndex;
      coreRef.current.instanceMatrix.needsUpdate = true;
      if (coreRef.current.instanceColor) coreRef.current.instanceColor.needsUpdate = true;
    }
    if (signatureRef.current) {
      signatureRef.current.count = signatureIndex;
      signatureRef.current.instanceMatrix.needsUpdate = true;
      if (signatureRef.current.instanceColor) signatureRef.current.instanceColor.needsUpdate = true;
    }
  });

  useLayoutEffect(() => {
    if (signatureRef.current) signatureRef.current.count = 0;
    if (floorRingRef.current) floorRingRef.current.count = 0;
    if (haloRingRef.current) haloRingRef.current.count = 0;
    if (coreRef.current) coreRef.current.count = 0;
  }, []);

  return (
    <>
      <instancedMesh
        ref={signatureRef}
        args={[signatureGeometry, signatureMaterial, MAX_SIGNATURES]}
        renderOrder={224}
        frustumCulled={false}
      />
      <instancedMesh
        ref={floorRingRef}
        args={[floorRingGeometry, ringMaterial, MAX_EFFECTS]}
        renderOrder={225}
        frustumCulled={false}
      />
      <instancedMesh
        ref={haloRingRef}
        args={[haloRingGeometry, haloMaterial, MAX_EFFECTS]}
        renderOrder={226}
        frustumCulled={false}
      />
      <instancedMesh
        ref={coreRef}
        args={[coreGeometry, coreMaterial, MAX_EFFECTS]}
        renderOrder={228}
        frustumCulled={false}
      />
      <points geometry={geometry} material={material} renderOrder={227} frustumCulled={false} />
    </>
  );
}
