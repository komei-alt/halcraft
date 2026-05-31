// 攻撃ヒット時の火花エフェクト
// ダメージポップアップとは別に、当たった方向・会心・手ごたえを3Dで見せる

import { useRef, useMemo, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerHitImpactEffectSpawner } from '../utils/effectTriggers';

interface HitSpark {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  totalLife: number;
  color: THREE.Color;
}

interface HitSlash {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  life: number;
  totalLife: number;
  width: number;
  length: number;
  color: THREE.Color;
}

interface HitRing {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  elapsed: number;
  life: number;
  startRadius: number;
  endRadius: number;
  color: THREE.Color;
}

interface HitImpact {
  id: string;
  sparks: HitSpark[];
  slashes: HitSlash[];
  rings: HitRing[];
}

const MAX_IMPACTS = 12;
const SPARKS_PER_HIT = 14;
const CRITICAL_SPARK_BONUS = 8;
const SLASHES_PER_HIT = 2;
const CRITICAL_SLASH_BONUS = 1;
const RINGS_PER_HIT = 1;
const PARTICLE_GRAVITY = -8;
const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const slashGeometry = new THREE.PlaneGeometry(1, 1);
const ringGeometry = new THREE.RingGeometry(1, 1.16, 48);

let impactIdCounter = 0;

function createImpactBasis(hitDir: THREE.Vector3): {
  tangent: THREE.Vector3;
  bitangent: THREE.Vector3;
  baseQuaternion: THREE.Quaternion;
} {
  const tangent = new THREE.Vector3().crossVectors(hitDir, UP);
  if (tangent.lengthSq() < 0.001) tangent.set(1, 0, 0);
  tangent.normalize();
  const bitangent = new THREE.Vector3().crossVectors(hitDir, tangent).normalize();
  const baseQuaternion = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, hitDir);
  return { tangent, bitangent, baseQuaternion };
}

function createSparkColor(isCritical: boolean): THREE.Color {
  const baseColor = isCritical ? new THREE.Color(0xffd15c) : new THREE.Color(0xfff1b8);
  const accentColor = isCritical ? new THREE.Color(0xff4a4a) : new THREE.Color(0xff7a3d);
  const color = Math.random() < 0.35 ? accentColor.clone() : baseColor.clone();
  color.lerp(new THREE.Color(0xffffff), Math.random() * 0.25);
  return color;
}

export function HitImpactEffect() {
  const impactsRef = useRef<HitImpact[]>([]);
  const pointsRef = useRef<THREE.Points>(null);
  const slashMeshRef = useRef<THREE.InstancedMesh>(null);
  const ringMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummyObject = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);
  const maxSparks = MAX_IMPACTS * (SPARKS_PER_HIT + CRITICAL_SPARK_BONUS);
  const maxSlashes = MAX_IMPACTS * (SLASHES_PER_HIT + CRITICAL_SLASH_BONUS);
  const maxRings = MAX_IMPACTS * RINGS_PER_HIT;

  const sparkGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxSparks * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxSparks * 3), 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, [maxSparks]);

  const sparkMaterial = useMemo(() => new THREE.PointsMaterial({
    size: 0.095,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  const slashMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  }), []);

  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  }), []);

  useEffect(() => {
    if (slashMeshRef.current) slashMeshRef.current.count = 0;
    if (ringMeshRef.current) ringMeshRef.current.count = 0;
  }, []);

  const spawnImpact = useCallback((
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    isCritical: boolean,
  ) => {
    const hitDir = new THREE.Vector3(dirX, dirY, dirZ);
    if (hitDir.lengthSq() < 0.001) hitDir.set(0, 0, -1);
    hitDir.normalize();

    const { tangent, bitangent, baseQuaternion } = createImpactBasis(hitDir);
    const center = new THREE.Vector3(x, y, z);
    const sparks: HitSpark[] = [];
    const slashes: HitSlash[] = [];
    const rings: HitRing[] = [];

    const sparkCount = SPARKS_PER_HIT + (isCritical ? CRITICAL_SPARK_BONUS : 0);
    for (let i = 0; i < sparkCount; i++) {
      const spread = (Math.random() - 0.5) * 2;
      const lift = Math.random() * 0.8;
      const burst = 2.2 + Math.random() * (isCritical ? 4.9 : 2.9);
      const side = tangent.clone().multiplyScalar(spread * burst * 0.4);
      const up = bitangent.clone().multiplyScalar((lift - 0.1) * burst * 0.5);
      const recoil = hitDir.clone().multiplyScalar(-burst * (0.34 + Math.random() * 0.36));
      const vel = side.add(up).add(recoil);
      const life = isCritical ? 0.42 + Math.random() * 0.18 : 0.28 + Math.random() * 0.14;

      sparks.push({
        x: x + (Math.random() - 0.5) * 0.12,
        y: y + (Math.random() - 0.5) * 0.12,
        z: z + (Math.random() - 0.5) * 0.12,
        vx: vel.x,
        vy: vel.y,
        vz: vel.z,
        life,
        totalLife: life,
        color: createSparkColor(isCritical),
      });
    }

    const slashCount = SLASHES_PER_HIT + (isCritical ? CRITICAL_SLASH_BONUS : 0);
    for (let i = 0; i < slashCount; i++) {
      const angle = ((i / slashCount) * Math.PI * 1.1) - Math.PI * 0.5 + (Math.random() - 0.5) * 0.38;
      const slashQuat = baseQuaternion.clone();
      slashQuat.multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, angle));
      const offset = tangent.clone().multiplyScalar((Math.random() - 0.5) * 0.18)
        .add(bitangent.clone().multiplyScalar((Math.random() - 0.5) * 0.16))
        .add(hitDir.clone().multiplyScalar(-0.03));
      const life = isCritical ? 0.2 + Math.random() * 0.07 : 0.15 + Math.random() * 0.05;

      slashes.push({
        position: center.clone().add(offset),
        quaternion: slashQuat,
        life,
        totalLife: life,
        width: isCritical ? 0.042 + Math.random() * 0.028 : 0.03 + Math.random() * 0.018,
        length: isCritical ? 0.88 + Math.random() * 0.32 : 0.62 + Math.random() * 0.22,
        color: createSparkColor(isCritical),
      });
    }

    const ringColor = (isCritical ? new THREE.Color(0xff4a4a) : new THREE.Color(0xffd884))
      .lerp(new THREE.Color(0xffffff), isCritical ? 0.12 : 0.24);
    rings.push({
      position: center.clone().add(hitDir.clone().multiplyScalar(-0.06)),
      quaternion: baseQuaternion,
      elapsed: 0,
      life: isCritical ? 0.24 : 0.2,
      startRadius: isCritical ? 0.13 : 0.1,
      endRadius: isCritical ? 0.76 : 0.54,
      color: ringColor,
    });

    const impacts = impactsRef.current;
    impacts.push({ id: `hit_${impactIdCounter++}`, sparks, slashes, rings });
    if (impacts.length > MAX_IMPACTS) {
      impacts.splice(0, impacts.length - MAX_IMPACTS);
    }
  }, []);

  useEffect(() => {
    registerHitImpactEffectSpawner(spawnImpact);
    return () => registerHitImpactEffectSpawner(() => {});
  }, [spawnImpact]);

  useFrame((_, delta) => {
    const impacts = impactsRef.current;
    if (impacts.length === 0) {
      sparkGeometry.setDrawRange(0, 0);
      if (slashMeshRef.current) slashMeshRef.current.count = 0;
      if (ringMeshRef.current) ringMeshRef.current.count = 0;
      return;
    }

    const dt = Math.min(delta, 0.05);
    for (let i = impacts.length - 1; i >= 0; i--) {
      const impact = impacts[i];
      const sparksAlive = impact.sparks.some((p) => p.life > 0);
      const slashesAlive = impact.slashes.some((s) => s.life > 0);
      const ringsAlive = impact.rings.some((r) => r.elapsed < r.life);
      if (!sparksAlive && !slashesAlive && !ringsAlive) impacts.splice(i, 1);
    }

    const posAttr = sparkGeometry.getAttribute('position') as THREE.BufferAttribute;
    const colorAttr = sparkGeometry.getAttribute('color') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colorAttr.array as Float32Array;
    let sparkIndex = 0;
    let slashIndex = 0;
    let ringIndex = 0;

    for (const impact of impacts) {
      for (const p of impact.sparks) {
        if (p.life <= 0 || sparkIndex >= maxSparks) continue;

        p.vy += PARTICLE_GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx *= 0.9;
        p.vz *= 0.9;
        p.life -= dt;

        const alpha = THREE.MathUtils.clamp(p.life / p.totalLife, 0, 1);
        const i3 = sparkIndex * 3;
        positions[i3] = p.x;
        positions[i3 + 1] = p.y;
        positions[i3 + 2] = p.z;
        colors[i3] = p.color.r * alpha;
        colors[i3 + 1] = p.color.g * alpha;
        colors[i3 + 2] = p.color.b * alpha;
        sparkIndex++;
      }

      for (const slash of impact.slashes) {
        if (slash.life <= 0 || slashIndex >= maxSlashes || !slashMeshRef.current) continue;

        slash.life -= dt;
        const alpha = THREE.MathUtils.clamp(slash.life / slash.totalLife, 0, 1);
        dummyObject.position.copy(slash.position);
        dummyObject.quaternion.copy(slash.quaternion);
        dummyObject.scale.set(slash.length * (0.55 + alpha * 0.45), slash.width * (0.65 + alpha * 0.35), 1);
        dummyObject.updateMatrix();
        slashMeshRef.current.setMatrixAt(slashIndex, dummyObject.matrix);
        tempColor.copy(slash.color).multiplyScalar(alpha);
        slashMeshRef.current.setColorAt(slashIndex, tempColor);
        slashIndex++;
      }

      for (const ring of impact.rings) {
        ring.elapsed += dt;
        if (ring.elapsed >= ring.life || ringIndex >= maxRings || !ringMeshRef.current) continue;

        const progress = ring.elapsed / ring.life;
        const alpha = 1 - progress;
        const radius = THREE.MathUtils.lerp(ring.startRadius, ring.endRadius, progress);
        dummyObject.position.copy(ring.position);
        dummyObject.quaternion.copy(ring.quaternion);
        dummyObject.scale.setScalar(radius);
        dummyObject.updateMatrix();
        ringMeshRef.current.setMatrixAt(ringIndex, dummyObject.matrix);
        tempColor.copy(ring.color).multiplyScalar(alpha);
        ringMeshRef.current.setColorAt(ringIndex, tempColor);
        ringIndex++;
      }
    }

    sparkGeometry.setDrawRange(0, sparkIndex);
    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;

    if (slashMeshRef.current) {
      slashMeshRef.current.count = slashIndex;
      slashMeshRef.current.instanceMatrix.needsUpdate = true;
      if (slashMeshRef.current.instanceColor) slashMeshRef.current.instanceColor.needsUpdate = true;
    }
    if (ringMeshRef.current) {
      ringMeshRef.current.count = ringIndex;
      ringMeshRef.current.instanceMatrix.needsUpdate = true;
      if (ringMeshRef.current.instanceColor) ringMeshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh
        ref={ringMeshRef}
        args={[ringGeometry, ringMaterial, maxRings]}
        frustumCulled={false}
        renderOrder={4}
      />
      <instancedMesh
        ref={slashMeshRef}
        args={[slashGeometry, slashMaterial, maxSlashes]}
        frustumCulled={false}
        renderOrder={5}
      />
      <points ref={pointsRef} geometry={sparkGeometry} material={sparkMaterial} />
    </>
  );
}
