// 戦闘用の高品質爆発エフェクト
// ロケット・戦車砲・爆弾・TNT などから共通利用する
// 火球・衝撃波・火花・煙・破片・砂ぼこり・ライトを多層で描画する

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { registerCombatExplosionSpawner, type CombatExplosionOptions } from '../utils/effectTriggers';
import { createSizedPointsMaterial } from '../utils/sizedPointsMaterial';
import { usePlayerStore } from '../stores/usePlayerStore';

/** 加算ブレンド向け（火花・火・残火） */
type AdditiveKind = 'spark' | 'ember' | 'fire';
/** 通常ブレンド向け（煙・砂ぼこり・破片の煙） */
type SoftKind = 'smoke' | 'dust' | 'debrisSmoke';

interface ExplosionParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  kind: AdditiveKind | SoftKind;
  color: THREE.Color;
}

interface DebrisPiece {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  rx: number;
  ry: number;
  rz: number;
  avx: number;
  avy: number;
  avz: number;
  color: THREE.Color;
  /** 煙をまとって飛ぶ破片 */
  smoky: boolean;
  /** 次の煙トレイル放出までの残り時間 */
  smokeTimer: number;
}

interface ShockRing {
  elapsed: number;
  life: number;
  startRadius: number;
  endRadius: number;
  thickness: number;
  tiltX: number;
  tiltY: number;
  tiltZ: number;
  color: THREE.Color;
}

interface FlashCore {
  life: number;
  maxLife: number;
  startSize: number;
  endSize: number;
  color: THREE.Color;
}

interface CombatExplosion {
  id: number;
  cx: number;
  cy: number;
  cz: number;
  scale: number;
  intensity: number;
  life: number;
  maxLife: number;
  lightIntensity: number;
  lightDistance: number;
  particles: ExplosionParticle[];
  debris: DebrisPiece[];
  rings: ShockRing[];
  cores: FlashCore[];
}

const MAX_EXPLOSIONS = 8;
const MAX_ADDITIVE_PARTICLES = MAX_EXPLOSIONS * 120;
const MAX_SOFT_PARTICLES = MAX_EXPLOSIONS * 180;
const MAX_DEBRIS = MAX_EXPLOSIONS * 36;
const MAX_RINGS = MAX_EXPLOSIONS * 4;
const MAX_CORES = MAX_EXPLOSIONS * 3;

/** 破片から煙を放出する間隔（秒） */
const DEBRIS_SMOKE_INTERVAL = 0.028;
/** 1破片あたりの最大煙トレイル数（概算・生成時の上限感） */
const DEBRIS_SMOKE_PER_TICK = 1;

const ringGeometry = new THREE.RingGeometry(0.92, 1.08, 48);
const coreGeometry = new THREE.SphereGeometry(1, 18, 14);
const debrisGeometry = new THREE.BoxGeometry(1, 1, 1);

let nextExplosionId = 0;

function createRadialTexture(stops: Array<{ offset: number; color: string }>): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(48, 48, 2, 48, 48, 48);
    for (const stop of stops) gradient.addColorStop(stop.offset, stop.color);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 96, 96);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function resolvePreset(options?: CombatExplosionOptions): {
  scale: number;
  intensity: number;
  radius: number;
  life: number;
  light: number;
  lightDist: number;
  shake: number;
  accent: THREE.Color;
  soft: THREE.Color;
  smoke: THREE.Color;
  debris: THREE.Color;
  dust: THREE.Color;
} {
  const style = options?.style ?? 'rocket';
  const accent = new THREE.Color(options?.accent ?? (
    style === 'bomb' ? '#ff6a18'
      : style === 'tnt' ? '#ff8a2a'
        : style === 'precision' ? '#ffd27a'
          : '#ff9248'
  ));
  const soft = accent.clone().lerp(new THREE.Color('#ffffff'), style === 'precision' ? 0.45 : 0.28);
  const smoke = new THREE.Color(style === 'tnt' ? '#5a4e45' : '#4a433d');
  const debris = new THREE.Color(style === 'bomb' ? '#4a3a2e' : '#6b4a32');
  // 砂ぼこり: 砂漠寄り〜土っぽいベージュ
  const dust = new THREE.Color(
    style === 'tnt' ? '#c4a574'
      : style === 'bomb' ? '#b8956a'
        : '#d2b48c',
  );

  if (style === 'bomb') {
    return {
      scale: 1.45,
      intensity: 1.35,
      radius: 11,
      life: 4.2,
      light: 18,
      lightDist: 34,
      shake: 0.95,
      accent,
      soft,
      smoke,
      debris,
      dust,
    };
  }
  if (style === 'tnt') {
    return {
      scale: 0.85,
      intensity: 0.95,
      radius: 5.5,
      life: 3.4,
      light: 10,
      lightDist: 18,
      shake: 0.72,
      accent,
      soft,
      smoke,
      debris,
      dust,
    };
  }
  if (style === 'precision') {
    return {
      scale: 1.15,
      intensity: 1.25,
      radius: 8.4,
      life: 3.8,
      light: 16,
      lightDist: 28,
      shake: 0.82,
      accent,
      soft,
      smoke,
      debris,
      dust,
    };
  }
  return {
    scale: 1,
    intensity: 1,
    radius: 7.5,
    life: 3.6,
    light: 13,
    lightDist: 24,
    shake: 0.7,
    accent,
    soft,
    smoke,
    debris,
    dust,
  };
}

function pushSoftParticle(
  particles: ExplosionParticle[],
  p: ExplosionParticle,
): void {
  particles.push(p);
}

function createExplosion(x: number, y: number, z: number, options?: CombatExplosionOptions): CombatExplosion {
  const preset = resolvePreset(options);
  const scale = preset.scale * (options?.scale ?? 1);
  const intensity = preset.intensity * (options?.intensity ?? 1);
  const sparkCount = Math.round((42 + intensity * 18) * scale);
  const emberCount = Math.round((18 + intensity * 10) * scale);
  const smokeCount = Math.round((18 + intensity * 10) * scale);
  const fireCount = Math.round((12 + intensity * 6) * scale);
  // 放射状に飛び散る煙つき破片
  const debrisCount = Math.round((22 + intensity * 12) * scale);
  // 砂ぼこり（長時間残留）
  const dustCount = Math.round((48 + intensity * 28) * scale);
  const dustRingCount = Math.round((20 + intensity * 10) * scale);
  const particles: ExplosionParticle[] = [];
  const debris: DebrisPiece[] = [];
  const rings: ShockRing[] = [];
  const cores: FlashCore[] = [];

  for (let i = 0; i < sparkCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.12) * Math.PI * 0.85;
    const speed = (9 + Math.random() * 18) * scale * intensity;
    const life = 0.32 + Math.random() * 0.55;
    const hot = Math.random() < 0.35;
    particles.push({
      x: x + (Math.random() - 0.5) * 0.55 * scale,
      y: y + (Math.random() - 0.5) * 0.4 * scale,
      z: z + (Math.random() - 0.5) * 0.55 * scale,
      vx: Math.cos(theta) * Math.cos(phi) * speed,
      vy: Math.sin(phi) * speed + 3.8 * scale,
      vz: Math.sin(theta) * Math.cos(phi) * speed,
      life,
      maxLife: life,
      size: (0.1 + Math.random() * 0.22) * scale,
      kind: 'spark',
      color: (hot ? preset.soft : preset.accent).clone().lerp(new THREE.Color('#ffffff'), Math.random() * 0.35),
    });
  }

  for (let i = 0; i < emberCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const speed = (2.2 + Math.random() * 5.5) * scale;
    const life = 0.7 + Math.random() * 0.95;
    particles.push({
      x: x + (Math.random() - 0.5) * 0.9 * scale,
      y: y + Math.random() * 0.5 * scale,
      z: z + (Math.random() - 0.5) * 0.9 * scale,
      vx: Math.cos(theta) * speed * 0.45,
      vy: 2.2 + Math.random() * 4.8,
      vz: Math.sin(theta) * speed * 0.45,
      life,
      maxLife: life,
      size: (0.08 + Math.random() * 0.14) * scale,
      kind: 'ember',
      color: preset.accent.clone().lerp(new THREE.Color('#ff3a00'), Math.random() * 0.4),
    });
  }

  for (let i = 0; i < fireCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const speed = (1.5 + Math.random() * 4.8) * scale;
    const life = 0.28 + Math.random() * 0.42;
    particles.push({
      x: x + (Math.random() - 0.5) * 0.75 * scale,
      y: y + (Math.random() - 0.25) * 0.55 * scale,
      z: z + (Math.random() - 0.5) * 0.75 * scale,
      vx: Math.cos(theta) * speed,
      vy: 1.6 + Math.random() * 4.2,
      vz: Math.sin(theta) * speed,
      life,
      maxLife: life,
      size: (0.45 + Math.random() * 0.75) * scale,
      kind: 'fire',
      color: (i % 2 === 0 ? preset.soft : preset.accent).clone(),
    });
  }

  for (let i = 0; i < smokeCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const speed = (1.2 + Math.random() * 4.0) * scale;
    const life = 1.05 + Math.random() * 1.15;
    pushSoftParticle(particles, {
      x: x + (Math.random() - 0.5) * 1.2 * scale,
      y: y + Math.random() * 0.45 * scale,
      z: z + (Math.random() - 0.5) * 1.2 * scale,
      vx: Math.cos(theta) * speed * 0.42,
      vy: 1.4 + Math.random() * 2.8,
      vz: Math.sin(theta) * speed * 0.42,
      life,
      maxLife: life,
      size: (0.95 + Math.random() * 1.6) * scale,
      kind: 'smoke',
      color: preset.smoke.clone().lerp(new THREE.Color('#1a1614'), Math.random() * 0.35),
    });
  }

  // ── 砂ぼこり: 放射状に広がりながらゆっくり舞い上がり、長時間残る ──
  for (let i = 0; i < dustCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    // 水平方向に強く飛ばす（地面の砂が巻き上がる感じ）
    const radialSpeed = (1.8 + Math.random() * 5.5) * scale * intensity;
    const upward = (0.6 + Math.random() * 2.4) * scale;
    // 長寿命: 2.5〜5.5秒
    const life = 2.5 + Math.random() * 3.0;
    const dustColor = preset.dust.clone().lerp(
      new THREE.Color(Math.random() < 0.4 ? '#e8d4a8' : '#8a7355'),
      Math.random() * 0.45,
    );
    pushSoftParticle(particles, {
      x: x + (Math.random() - 0.5) * 1.4 * scale,
      y: y + Math.random() * 0.35 * scale,
      z: z + (Math.random() - 0.5) * 1.4 * scale,
      vx: Math.cos(theta) * radialSpeed,
      vy: upward,
      vz: Math.sin(theta) * radialSpeed,
      life,
      maxLife: life,
      size: (0.55 + Math.random() * 1.35) * scale,
      kind: 'dust',
      color: dustColor,
    });
  }

  // 地面を這う砂のリング（低め・外向き）
  for (let i = 0; i < dustRingCount; i++) {
    const theta = (i / dustRingCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
    const radialSpeed = (3.5 + Math.random() * 4.5) * scale * intensity;
    const life = 2.2 + Math.random() * 2.4;
    pushSoftParticle(particles, {
      x: x + Math.cos(theta) * 0.3 * scale,
      y: y + 0.05 + Math.random() * 0.2,
      z: z + Math.sin(theta) * 0.3 * scale,
      vx: Math.cos(theta) * radialSpeed,
      vy: 0.35 + Math.random() * 1.1,
      vz: Math.sin(theta) * radialSpeed,
      life,
      maxLife: life,
      size: (0.7 + Math.random() * 1.1) * scale,
      kind: 'dust',
      color: preset.dust.clone().lerp(new THREE.Color('#a89070'), Math.random() * 0.35),
    });
  }

  // ── 煙をまとった破片: 放射状に飛ばし、飛行中に煙を吐く ──
  for (let i = 0; i < debrisCount; i++) {
    // ほぼ水平〜やや上向きの放射状
    const theta = (i / Math.max(1, debrisCount)) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const elev = 0.15 + Math.random() * 0.55; // 上向き成分
    const cosE = Math.cos(elev);
    const sinE = Math.sin(elev);
    const speed = (4.5 + Math.random() * 11) * scale * intensity;
    const life = 1.1 + Math.random() * 1.0;
    const smoky = Math.random() < 0.85; // 大半が煙つき

    debris.push({
      x: x + Math.cos(theta) * 0.25 * scale,
      y: y + 0.15 + Math.random() * 0.4 * scale,
      z: z + Math.sin(theta) * 0.25 * scale,
      vx: Math.cos(theta) * cosE * speed,
      vy: sinE * speed + 2.2 + Math.random() * 4.5,
      vz: Math.sin(theta) * cosE * speed,
      life,
      maxLife: life,
      size: (0.08 + Math.random() * 0.2) * scale,
      rx: Math.random() * Math.PI,
      ry: Math.random() * Math.PI,
      rz: Math.random() * Math.PI,
      avx: (Math.random() - 0.5) * 16,
      avy: (Math.random() - 0.5) * 16,
      avz: (Math.random() - 0.5) * 16,
      color: preset.debris.clone().lerp(new THREE.Color('#2c241f'), Math.random() * 0.4),
      smoky,
      smokeTimer: Math.random() * DEBRIS_SMOKE_INTERVAL,
    });

    // 発射直後の煙のかたまり（破片の「まとわり」）
    if (smoky) {
      for (let s = 0; s < 2; s++) {
        const puffLife = 0.55 + Math.random() * 0.55;
        pushSoftParticle(particles, {
          x: x + Math.cos(theta) * 0.2 * scale,
          y: y + 0.2 * scale,
          z: z + Math.sin(theta) * 0.2 * scale,
          vx: Math.cos(theta) * cosE * speed * 0.35 + (Math.random() - 0.5) * 0.8,
          vy: sinE * speed * 0.2 + 0.8 + Math.random() * 1.2,
          vz: Math.sin(theta) * cosE * speed * 0.35 + (Math.random() - 0.5) * 0.8,
          life: puffLife,
          maxLife: puffLife,
          size: (0.28 + Math.random() * 0.4) * scale,
          kind: 'debrisSmoke',
          color: preset.smoke.clone().lerp(preset.dust, 0.35 + Math.random() * 0.25),
        });
      }
    }
  }

  rings.push(
    {
      elapsed: 0,
      life: 0.55,
      startRadius: 0.35 * scale,
      endRadius: preset.radius * 0.92 * scale,
      thickness: 1.08,
      tiltX: -Math.PI / 2,
      tiltY: 0,
      tiltZ: 0,
      color: preset.accent.clone(),
    },
    {
      elapsed: 0,
      life: 0.48,
      startRadius: 0.28 * scale,
      endRadius: preset.radius * 0.68 * scale,
      thickness: 1.05,
      tiltX: 0,
      tiltY: Math.PI / 2,
      tiltZ: 0,
      color: preset.soft.clone(),
    },
    {
      elapsed: 0.02,
      life: 0.42,
      startRadius: 0.22 * scale,
      endRadius: preset.radius * 0.55 * scale,
      thickness: 1.04,
      tiltX: 0.65,
      tiltY: 0.4,
      tiltZ: 0.2,
      color: preset.accent.clone().lerp(new THREE.Color('#ff5500'), 0.25),
    },
    {
      elapsed: 0.04,
      life: 0.36,
      startRadius: 0.18 * scale,
      endRadius: preset.radius * 0.42 * scale,
      thickness: 1.03,
      tiltX: -0.4,
      tiltY: -0.55,
      tiltZ: 0.3,
      color: preset.soft.clone(),
    },
  );

  cores.push(
    {
      life: 0.22,
      maxLife: 0.22,
      startSize: 0.55 * scale,
      endSize: 2.4 * scale * intensity,
      color: softWhite(preset.soft),
    },
    {
      life: 0.42,
      maxLife: 0.42,
      startSize: 0.8 * scale,
      endSize: 3.8 * scale * intensity,
      color: preset.accent.clone(),
    },
    {
      life: 0.7,
      maxLife: 0.7,
      startSize: 1.1 * scale,
      endSize: 5.2 * scale,
      color: preset.accent.clone().lerp(new THREE.Color('#3a1a08'), 0.55),
    },
  );

  return {
    id: nextExplosionId++,
    cx: x,
    cy: y,
    cz: z,
    scale,
    intensity,
    life: preset.life,
    maxLife: preset.life,
    lightIntensity: preset.light * intensity,
    lightDistance: preset.lightDist * scale,
    particles,
    debris,
    rings,
    cores,
  };
}

function softWhite(color: THREE.Color): THREE.Color {
  return color.clone().lerp(new THREE.Color('#ffffff'), 0.55);
}

function applyCameraShake(_x: number, _y: number, _z: number, strength: number): void {
  usePlayerStore.setState((state) => ({
    cameraShake: Math.min(1, Math.max(state.cameraShake, strength)),
  }));
}

function isAdditiveKind(kind: ExplosionParticle['kind']): kind is AdditiveKind {
  return kind === 'spark' || kind === 'ember' || kind === 'fire';
}

function createParticleGeometry(maxCount: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxCount * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxCount * 3), 3));
  geo.setAttribute('particleSize', new THREE.BufferAttribute(new Float32Array(maxCount), 1));
  geo.setDrawRange(0, 0);
  return geo;
}

export function CombatExplosionFX() {
  const { camera } = useThree();
  const explosionsRef = useRef<CombatExplosion[]>([]);
  const additivePointsRef = useRef<THREE.Points>(null);
  const softPointsRef = useRef<THREE.Points>(null);
  const debrisMeshRef = useRef<THREE.InstancedMesh>(null);
  const ringMeshRef = useRef<THREE.InstancedMesh>(null);
  const coreMeshRef = useRef<THREE.InstancedMesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  const glowTexture = useMemo(() => createRadialTexture([
    { offset: 0, color: 'rgba(255,255,255,1)' },
    { offset: 0.25, color: 'rgba(255,230,160,0.95)' },
    { offset: 0.55, color: 'rgba(255,120,40,0.45)' },
    { offset: 1, color: 'rgba(0,0,0,0)' },
  ]), []);

  const softTexture = useMemo(() => createRadialTexture([
    { offset: 0, color: 'rgba(255,255,255,0.85)' },
    { offset: 0.35, color: 'rgba(255,255,255,0.45)' },
    { offset: 0.7, color: 'rgba(255,255,255,0.12)' },
    { offset: 1, color: 'rgba(0,0,0,0)' },
  ]), []);

  const additiveGeometry = useMemo(() => createParticleGeometry(MAX_ADDITIVE_PARTICLES), []);
  const softGeometry = useMemo(() => createParticleGeometry(MAX_SOFT_PARTICLES), []);

  const additiveMaterial = useMemo(() => {
    const mat = createSizedPointsMaterial({
      size: 0.35,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    mat.map = glowTexture;
    mat.alphaTest = 0.02;
    return mat;
  }, [glowTexture]);

  const softMaterial = useMemo(() => {
    const mat = createSizedPointsMaterial({
      size: 0.5,
      opacity: 0.72,
      blending: THREE.NormalBlending,
      toneMapped: true,
      depthWrite: false,
    });
    mat.map = softTexture;
    mat.alphaTest = 0.04;
    return mat;
  }, [softTexture]);

  const debrisMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.08,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    vertexColors: true,
  }), []);

  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  }), []);

  const coreMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  }), []);

  useEffect(() => () => {
    glowTexture.dispose();
    softTexture.dispose();
    additiveMaterial.dispose();
    softMaterial.dispose();
    debrisMaterial.dispose();
    ringMaterial.dispose();
    coreMaterial.dispose();
    additiveGeometry.dispose();
    softGeometry.dispose();
  }, [
    glowTexture, softTexture, additiveMaterial, softMaterial,
    debrisMaterial, ringMaterial, coreMaterial, additiveGeometry, softGeometry,
  ]);

  useLayoutEffect(() => {
    for (const mesh of [debrisMeshRef.current, ringMeshRef.current, coreMeshRef.current]) {
      if (!mesh) continue;
      mesh.count = 0;
      mesh.visible = false;
    }
  }, []);

  const spawn = useCallback((x: number, y: number, z: number, options?: CombatExplosionOptions) => {
    const explosion = createExplosion(x, y, z, options);
    const list = explosionsRef.current;
    list.push(explosion);
    if (list.length > MAX_EXPLOSIONS) list.splice(0, list.length - MAX_EXPLOSIONS);

    const preset = resolvePreset(options);
    const dist = camera.position.distanceTo(new THREE.Vector3(x, y, z));
    const falloff = Math.max(0, 1 - dist / (preset.radius * 3.2 * explosion.scale));
    if (falloff > 0.02) {
      applyCameraShake(x, y, z, Math.min(1, preset.shake * falloff * explosion.intensity));
    }
  }, [camera]);

  useEffect(() => {
    registerCombatExplosionSpawner(spawn);
    return () => registerCombatExplosionSpawner(() => {});
  }, [spawn]);

  useFrame((_, delta) => {
    const list = explosionsRef.current;
    const dt = Math.min(delta, 0.05);

    if (list.length === 0) {
      additiveGeometry.setDrawRange(0, 0);
      softGeometry.setDrawRange(0, 0);
      if (debrisMeshRef.current) {
        debrisMeshRef.current.count = 0;
        debrisMeshRef.current.visible = false;
      }
      if (ringMeshRef.current) {
        ringMeshRef.current.count = 0;
        ringMeshRef.current.visible = false;
      }
      if (coreMeshRef.current) {
        coreMeshRef.current.count = 0;
        coreMeshRef.current.visible = false;
      }
      if (lightRef.current) lightRef.current.intensity = 0;
      return;
    }

    for (let i = list.length - 1; i >= 0; i--) {
      const ex = list[i];
      ex.life -= dt;
      let alive = ex.life > 0;
      if (!alive) {
        for (const p of ex.particles) {
          if (p.life > 0) {
            alive = true;
            break;
          }
        }
      }
      if (!alive) {
        for (const d of ex.debris) {
          if (d.life > 0) {
            alive = true;
            break;
          }
        }
      }
      if (!alive) list.splice(i, 1);
    }

    const addPos = additiveGeometry.getAttribute('position') as THREE.BufferAttribute;
    const addCol = additiveGeometry.getAttribute('color') as THREE.BufferAttribute;
    const addSize = additiveGeometry.getAttribute('particleSize') as THREE.BufferAttribute;
    const addPositions = addPos.array as Float32Array;
    const addColors = addCol.array as Float32Array;
    const addSizes = addSize.array as Float32Array;

    const softPos = softGeometry.getAttribute('position') as THREE.BufferAttribute;
    const softCol = softGeometry.getAttribute('color') as THREE.BufferAttribute;
    const softSize = softGeometry.getAttribute('particleSize') as THREE.BufferAttribute;
    const softPositions = softPos.array as Float32Array;
    const softColors = softCol.array as Float32Array;
    const softSizes = softSize.array as Float32Array;

    let aIdx = 0;
    let sIdx = 0;
    let dIdx = 0;
    let rIdx = 0;
    let cIdx = 0;
    let maxLight = 0;
    let lightX = 0;
    let lightY = 0;
    let lightZ = 0;
    let lightDist = 20;

    for (const ex of list) {
      const lifeRatio = Math.max(0, ex.life / ex.maxLife);
      // ライトは爆発前半だけ強く（砂ぼこり期間は暗く）
      const lightPulse = Math.min(1, lifeRatio * (ex.maxLife / 1.2)) * ex.lightIntensity;
      if (lightPulse > maxLight) {
        maxLight = lightPulse;
        lightX = ex.cx;
        lightY = ex.cy + 0.4;
        lightZ = ex.cz;
        lightDist = ex.lightDistance;
      }

      // 破片更新 → 煙トレイルを粒子として放出
      for (const d of ex.debris) {
        if (d.life <= 0) continue;
        d.life -= dt;
        d.vy -= 18 * dt;
        d.vx *= 0.975;
        d.vz *= 0.975;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.z += d.vz * dt;
        d.rx += d.avx * dt;
        d.ry += d.avy * dt;
        d.rz += d.avz * dt;

        if (d.smoky && d.life > 0) {
          d.smokeTimer -= dt;
          while (d.smokeTimer <= 0) {
            d.smokeTimer += DEBRIS_SMOKE_INTERVAL;
            for (let n = 0; n < DEBRIS_SMOKE_PER_TICK; n++) {
              // 爆発の粒子数が膨らみすぎないようソフト上限
              if (ex.particles.length > MAX_SOFT_PARTICLES) break;
              const puffLife = 0.45 + Math.random() * 0.65;
              ex.particles.push({
                x: d.x + (Math.random() - 0.5) * d.size * 1.5,
                y: d.y + (Math.random() - 0.5) * d.size,
                z: d.z + (Math.random() - 0.5) * d.size * 1.5,
                // 破片速度の一部を引きずりつつ、わずかに遅れ・広がり
                vx: d.vx * 0.22 + (Math.random() - 0.5) * 0.9,
                vy: d.vy * 0.12 + 0.4 + Math.random() * 0.9,
                vz: d.vz * 0.22 + (Math.random() - 0.5) * 0.9,
                life: puffLife,
                maxLife: puffLife,
                size: d.size * (2.2 + Math.random() * 2.8),
                kind: 'debrisSmoke',
                color: new THREE.Color().copy(d.color).lerp(new THREE.Color('#6a5c50'), 0.55)
                  .lerp(new THREE.Color('#3a322c'), Math.random() * 0.3),
              });
            }
          }
        }

        if (d.life <= 0 || dIdx >= MAX_DEBRIS || !debrisMeshRef.current) continue;
        const alpha = Math.max(0, d.life / d.maxLife);
        dummy.position.set(d.x, d.y, d.z);
        dummy.rotation.set(d.rx, d.ry, d.rz);
        dummy.scale.set(d.size, d.size * (0.55 + (dIdx % 3) * 0.2), d.size * 0.85);
        dummy.updateMatrix();
        debrisMeshRef.current.setMatrixAt(dIdx, dummy.matrix);
        tempColor.copy(d.color).multiplyScalar(0.55 + alpha * 0.55);
        debrisMeshRef.current.setColorAt(dIdx, tempColor);
        dIdx++;
      }

      // パーティクル更新
      for (const p of ex.particles) {
        if (p.life <= 0) continue;
        p.life -= dt;

        if (p.kind === 'spark') {
          p.vy -= 16 * dt;
          p.vx *= 0.955;
          p.vz *= 0.955;
        } else if (p.kind === 'ember') {
          p.vy += 1.2 * dt;
          p.vx *= 0.97;
          p.vz *= 0.97;
          p.vx += (Math.random() - 0.5) * 0.8 * dt;
          p.vz += (Math.random() - 0.5) * 0.8 * dt;
        } else if (p.kind === 'fire') {
          p.vy -= 3.8 * dt;
          p.vx *= 0.92;
          p.vz *= 0.92;
        } else if (p.kind === 'dust') {
          // 砂ぼこり: 水平に減速しながらゆっくり上昇、長く漂う
          p.vx *= 0.978;
          p.vz *= 0.978;
          p.vy = p.vy * 0.99 + 0.55 * dt;
          // わずかな風ゆらぎ
          p.vx += Math.sin(p.life * 3.1 + p.x) * 0.35 * dt;
          p.vz += Math.cos(p.life * 2.7 + p.z) * 0.35 * dt;
        } else if (p.kind === 'debrisSmoke') {
          p.vx *= 0.96;
          p.vz *= 0.96;
          p.vy += 0.65 * dt;
        } else {
          // smoke
          p.vy += 0.85 * dt;
          p.vx *= 0.985;
          p.vz *= 0.985;
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;

        const alpha = Math.max(0, p.life / p.maxLife);

        if (isAdditiveKind(p.kind)) {
          if (aIdx >= MAX_ADDITIVE_PARTICLES) continue;
          const i3 = aIdx * 3;
          addPositions[i3] = p.x;
          addPositions[i3 + 1] = p.y;
          addPositions[i3 + 2] = p.z;

          if (p.kind === 'spark') {
            addColors[i3] = p.color.r * (0.7 + alpha * 0.9);
            addColors[i3 + 1] = p.color.g * alpha;
            addColors[i3 + 2] = p.color.b * alpha * alpha * 0.55;
            addSizes[aIdx] = p.size * (0.45 + alpha * 1.4) * 48;
          } else if (p.kind === 'ember') {
            addColors[i3] = p.color.r * alpha * 1.2;
            addColors[i3 + 1] = p.color.g * alpha * 0.55;
            addColors[i3 + 2] = p.color.b * alpha * 0.2;
            addSizes[aIdx] = p.size * (0.6 + alpha * 0.9) * 42;
          } else {
            addColors[i3] = p.color.r * alpha * 1.15;
            addColors[i3 + 1] = p.color.g * alpha * 0.85;
            addColors[i3 + 2] = p.color.b * alpha * 0.35;
            addSizes[aIdx] = p.size * (0.85 + (1 - alpha) * 1.4) * 58;
          }
          aIdx++;
        } else {
          if (sIdx >= MAX_SOFT_PARTICLES) continue;
          const i3 = sIdx * 3;
          softPositions[i3] = p.x;
          softPositions[i3 + 1] = p.y;
          softPositions[i3 + 2] = p.z;

          if (p.kind === 'dust') {
            // 出現直後はやや濃く、後半は薄く長く漂う
            const fadeIn = Math.min(1, (p.maxLife - p.life) * 1.8);
            const lateFade = alpha < 0.35 ? alpha / 0.35 : 1;
            const visibility = fadeIn * lateFade * 0.55;
            softColors[i3] = p.color.r * visibility;
            softColors[i3 + 1] = p.color.g * visibility;
            softColors[i3 + 2] = p.color.b * visibility;
            // 時間とともに膨らむ
            softSizes[sIdx] = p.size * (0.85 + (1 - alpha) * 2.4) * 58;
          } else if (p.kind === 'debrisSmoke') {
            const fadeIn = Math.min(1, (p.maxLife - p.life) * 4);
            const visibility = fadeIn * alpha * 0.62;
            softColors[i3] = p.color.r * visibility;
            softColors[i3 + 1] = p.color.g * visibility;
            softColors[i3 + 2] = p.color.b * visibility;
            softSizes[sIdx] = p.size * (0.7 + (1 - alpha) * 1.6) * 50;
          } else {
            const fadeIn = Math.min(1, (p.maxLife - p.life) * 2.8);
            const visibility = fadeIn * alpha * 0.58;
            softColors[i3] = p.color.r * visibility;
            softColors[i3 + 1] = p.color.g * visibility;
            softColors[i3 + 2] = p.color.b * visibility;
            softSizes[sIdx] = p.size * (0.9 + (1 - alpha) * 1.8) * 52;
          }
          sIdx++;
        }
      }

      for (const ring of ex.rings) {
        ring.elapsed += dt;
        if (ring.elapsed >= ring.life || rIdx >= MAX_RINGS || !ringMeshRef.current) continue;
        const progress = ring.elapsed / ring.life;
        const alpha = (1 - progress) * (1 - progress) * 0.85;
        const radius = THREE.MathUtils.lerp(ring.startRadius, ring.endRadius, progress);
        dummy.position.set(ex.cx, ex.cy, ex.cz);
        dummy.rotation.set(ring.tiltX, ring.tiltY, ring.tiltZ);
        dummy.scale.set(radius, radius * ring.thickness, radius);
        dummy.updateMatrix();
        ringMeshRef.current.setMatrixAt(rIdx, dummy.matrix);
        tempColor.copy(ring.color).multiplyScalar(alpha);
        ringMeshRef.current.setColorAt(rIdx, tempColor);
        rIdx++;
      }

      for (const core of ex.cores) {
        if (core.life <= 0 || cIdx >= MAX_CORES || !coreMeshRef.current) continue;
        core.life -= dt;
        const progress = 1 - Math.max(0, core.life / core.maxLife);
        const alpha = (1 - progress) * (1 - progress * 0.45);
        const size = THREE.MathUtils.lerp(core.startSize, core.endSize, progress);
        dummy.position.set(ex.cx, ex.cy, ex.cz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(size);
        dummy.updateMatrix();
        coreMeshRef.current.setMatrixAt(cIdx, dummy.matrix);
        tempColor.copy(core.color).multiplyScalar(alpha * 0.9);
        coreMeshRef.current.setColorAt(cIdx, tempColor);
        cIdx++;
      }
    }

    additiveGeometry.setDrawRange(0, aIdx);
    addPos.needsUpdate = true;
    addCol.needsUpdate = true;
    addSize.needsUpdate = true;

    softGeometry.setDrawRange(0, sIdx);
    softPos.needsUpdate = true;
    softCol.needsUpdate = true;
    softSize.needsUpdate = true;

    if (debrisMeshRef.current) {
      debrisMeshRef.current.count = dIdx;
      debrisMeshRef.current.visible = dIdx > 0;
      debrisMeshRef.current.instanceMatrix.needsUpdate = true;
      if (debrisMeshRef.current.instanceColor) debrisMeshRef.current.instanceColor.needsUpdate = true;
    }
    if (ringMeshRef.current) {
      ringMeshRef.current.count = rIdx;
      ringMeshRef.current.visible = rIdx > 0;
      ringMeshRef.current.instanceMatrix.needsUpdate = true;
      if (ringMeshRef.current.instanceColor) ringMeshRef.current.instanceColor.needsUpdate = true;
    }
    if (coreMeshRef.current) {
      coreMeshRef.current.count = cIdx;
      coreMeshRef.current.visible = cIdx > 0;
      coreMeshRef.current.instanceMatrix.needsUpdate = true;
      if (coreMeshRef.current.instanceColor) coreMeshRef.current.instanceColor.needsUpdate = true;
    }
    if (lightRef.current) {
      lightRef.current.position.set(lightX, lightY, lightZ);
      lightRef.current.intensity = maxLight;
      lightRef.current.distance = lightDist;
      lightRef.current.color.setHex(0xff7a28);
    }
  });

  return (
    <group>
      {/* 砂ぼこり・煙・破片煙（通常ブレンドで自然に） */}
      <points
        ref={softPointsRef}
        geometry={softGeometry}
        material={softMaterial}
        frustumCulled={false}
        renderOrder={3}
      />
      {/* 火花・火・残火（加算） */}
      <points
        ref={additivePointsRef}
        geometry={additiveGeometry}
        material={additiveMaterial}
        frustumCulled={false}
        renderOrder={8}
      />
      <instancedMesh
        ref={coreMeshRef}
        args={[coreGeometry, coreMaterial, MAX_CORES]}
        frustumCulled={false}
        renderOrder={6}
      />
      <instancedMesh
        ref={ringMeshRef}
        args={[ringGeometry, ringMaterial, MAX_RINGS]}
        frustumCulled={false}
        renderOrder={5}
      />
      <instancedMesh
        ref={debrisMeshRef}
        args={[debrisGeometry, debrisMaterial, MAX_DEBRIS]}
        frustumCulled={false}
        renderOrder={4}
      />
      <pointLight
        ref={lightRef}
        color="#ff7a28"
        intensity={0}
        distance={24}
        decay={2}
      />
    </group>
  );
}
