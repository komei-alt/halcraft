// ステージ別の空気感を出す軽量パーティクル演出

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import type { BiomeId } from '../types/stages';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';

type MotionKind = 'flutter' | 'sparkle' | 'snow' | 'dust';
type HorizonKind = 'dunes' | 'forestLine' | 'islands' | 'mountains';
type WeatherRibbonKind = 'leaf' | 'spray' | 'snowfall' | 'sandGust';
type SignatureVeilKind = 'forestShaft' | 'lagoonGlint' | 'aurora' | 'heatMirage';
type DepthCurtainKind = 'forestLight' | 'lagoonShimmer' | 'iceAurora' | 'desertMirage';

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
  weather: {
    kind: WeatherRibbonKind;
    count: number;
    color: number;
    opacity: number;
    radius: number;
    heightMin: number;
    heightMax: number;
    speed: number;
    driftStrength: number;
    width: number;
    length: number;
  };
  signature: {
    kind: SignatureVeilKind;
    count: number;
    color: number;
    secondaryColor: number;
    opacity: number;
    radius: number;
    heightMin: number;
    heightMax: number;
    speed: number;
    driftStrength: number;
    width: number;
    length: number;
  };
  curtain: {
    kind: DepthCurtainKind;
    color: number;
    secondaryColor: number;
    opacity: number;
    distance: number;
    yOffset: number;
    width: number;
    height: number;
    driftSpeed: number;
    blending: THREE.Blending;
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

interface WeatherRibbon {
  seed: number;
  angle: number;
  radius: number;
  height: number;
  speed: number;
  width: number;
  length: number;
  spin: number;
  wave: number;
}

interface SignatureVeil {
  seed: number;
  angle: number;
  radius: number;
  height: number;
  speed: number;
  width: number;
  length: number;
  spin: number;
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
    weather: {
      kind: 'leaf',
      count: 34,
      color: 0xd8ff7a,
      opacity: 0.34,
      radius: 18,
      heightMin: 0.8,
      heightMax: 5.8,
      speed: 0.18,
      driftStrength: 1.25,
      width: 0.11,
      length: 0.28,
    },
    signature: {
      kind: 'forestShaft',
      count: 12,
      color: 0xfff3a8,
      secondaryColor: 0x84ff8f,
      opacity: 0.16,
      radius: 34,
      heightMin: 2.8,
      heightMax: 12,
      speed: 0.13,
      driftStrength: 1.1,
      width: 1.1,
      length: 8.2,
    },
    curtain: {
      kind: 'forestLight',
      color: 0xfff4a8,
      secondaryColor: 0x78ff9b,
      opacity: 0.105,
      distance: 64,
      yOffset: 9,
      width: 84,
      height: 34,
      driftSpeed: 0.08,
      blending: THREE.AdditiveBlending,
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
    weather: {
      kind: 'spray',
      count: 30,
      color: 0x95fff0,
      opacity: 0.27,
      radius: 19,
      heightMin: 0.5,
      heightMax: 4.6,
      speed: 0.28,
      driftStrength: 1.55,
      width: 0.045,
      length: 0.28,
    },
    signature: {
      kind: 'lagoonGlint',
      count: 14,
      color: 0x8affff,
      secondaryColor: 0xfff4a6,
      opacity: 0.2,
      radius: 31,
      heightMin: 0.8,
      heightMax: 4.4,
      speed: 0.2,
      driftStrength: 1.7,
      width: 2.4,
      length: 0.42,
    },
    curtain: {
      kind: 'lagoonShimmer',
      color: 0x7ffff0,
      secondaryColor: 0xfff2a8,
      opacity: 0.12,
      distance: 62,
      yOffset: 6.5,
      width: 88,
      height: 29,
      driftSpeed: 0.13,
      blending: THREE.AdditiveBlending,
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
    weather: {
      kind: 'snowfall',
      count: 58,
      color: 0xf9feff,
      opacity: 0.5,
      radius: 22,
      heightMin: 1.2,
      heightMax: 12,
      speed: 0.86,
      driftStrength: 1.35,
      width: 0.032,
      length: 0.58,
    },
    signature: {
      kind: 'aurora',
      count: 5,
      color: 0x7dffe8,
      secondaryColor: 0xd3a8ff,
      opacity: 0.11,
      radius: 46,
      heightMin: 15,
      heightMax: 25,
      speed: 0.06,
      driftStrength: 3.6,
      width: 13,
      length: 1.15,
    },
    curtain: {
      kind: 'iceAurora',
      color: 0x82fff0,
      secondaryColor: 0xd6a8ff,
      opacity: 0.11,
      distance: 68,
      yOffset: 15,
      width: 94,
      height: 38,
      driftSpeed: 0.055,
      blending: THREE.AdditiveBlending,
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
    weather: {
      kind: 'sandGust',
      count: 50,
      color: 0xffdfa0,
      opacity: 0.34,
      radius: 24,
      heightMin: 0.35,
      heightMax: 3.8,
      speed: 0.52,
      driftStrength: 3.7,
      width: 0.09,
      length: 0.98,
    },
    signature: {
      kind: 'heatMirage',
      count: 16,
      color: 0xffe0a0,
      secondaryColor: 0xff965a,
      opacity: 0.15,
      radius: 36,
      heightMin: 0.75,
      heightMax: 3.4,
      speed: 0.34,
      driftStrength: 3.1,
      width: 3.8,
      length: 0.34,
    },
    curtain: {
      kind: 'desertMirage',
      color: 0xffdaa0,
      secondaryColor: 0xff8b58,
      opacity: 0.11,
      distance: 66,
      yOffset: 5.5,
      width: 92,
      height: 26,
      driftSpeed: 0.16,
      blending: THREE.NormalBlending,
    },
  },
};

const LOW_TIER_SCALE = 0.55;
const BALANCED_TIER_SCALE = 0.78;
const TOUCH_SCALE = 0.62;
const _motionOffset = new THREE.Vector3();
const _horizonPosition = new THREE.Vector3();
const _horizonRotation = new THREE.Euler();
const _cameraRight = new THREE.Vector3();
const _cameraForward = new THREE.Vector3();
const _curtainForward = new THREE.Vector3();

interface HorizonPanel {
  angle: number;
  radiusOffset: number;
  yOffset: number;
  widthScale: number;
  heightScale: number;
  depthShift: number;
  mistLift: number;
}

type HorizonGeometryLayer = 'back' | 'main' | 'accent' | 'front';

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

function getEffectiveWeatherCount(config: AtmosphereConfig): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? LOW_TIER_SCALE
    : profile.tier === 'balanced'
      ? BALANCED_TIER_SCALE
      : 1;
  const touchScale = isTouchDevice() ? TOUCH_SCALE : 1;
  return Math.max(12, Math.round(config.weather.count * tierScale * touchScale));
}

function getEffectiveSignatureCount(config: AtmosphereConfig): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? LOW_TIER_SCALE
    : profile.tier === 'balanced'
      ? BALANCED_TIER_SCALE
      : 1;
  const touchScale = isTouchDevice() ? TOUCH_SCALE : 1;
  const minCount = config.signature.kind === 'aurora' ? 3 : 5;
  return Math.max(minCount, Math.round(config.signature.count * tierScale * touchScale));
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

function createWeatherRibbons(config: AtmosphereConfig, count: number): WeatherRibbon[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 16807 % 9973) / 9973;
    const seed2 = (i * 48271 % 7919) / 7919;
    const seed3 = (i * 69621 % 6151) / 6151;
    return {
      seed,
      angle: seed * Math.PI * 2,
      radius: config.weather.radius * (0.28 + seed2 * 0.72),
      height: config.weather.heightMin + seed3 * (config.weather.heightMax - config.weather.heightMin),
      speed: config.weather.speed * (0.72 + seed2 * 0.7),
      width: config.weather.width * (0.72 + seed * 0.62),
      length: config.weather.length * (0.76 + seed3 * 0.58),
      spin: seed2 * Math.PI * 2,
      wave: seed3 * Math.PI * 2,
    };
  });
}

function createSignatureVeils(config: AtmosphereConfig, count: number): SignatureVeil[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 16807 % 9973) / 9973;
    const seed2 = (i * 48271 % 7919) / 7919;
    const seed3 = (i * 69621 % 6151) / 6151;
    return {
      seed,
      angle: seed * Math.PI * 2,
      radius: config.signature.radius * (0.4 + seed2 * 0.6),
      height: config.signature.heightMin + seed3 * (config.signature.heightMax - config.signature.heightMin),
      speed: config.signature.speed * (0.75 + seed2 * 0.58),
      width: config.signature.width * (0.72 + seed * 0.58),
      length: config.signature.length * (0.74 + seed3 * 0.54),
      spin: seed2 * Math.PI * 2,
      wave: seed3 * Math.PI * 2,
    };
  });
}

function skylineNoise(index: number, seed: number): number {
  const x = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function getEffectiveHorizonCount(): number {
  const profile = getPerformanceProfile();
  const tierScale = profile.tier === 'low'
    ? 0.72
    : profile.tier === 'balanced'
      ? 0.86
      : 1;
  const touchScale = isTouchDevice() ? 0.78 : 1;
  return Math.max(10, Math.round(16 * tierScale * touchScale));
}

function createSkylineGeometry(
  kind: HorizonKind,
  width: number,
  height: number,
  seed: number,
  layer: HorizonGeometryLayer = 'main',
): THREE.BufferGeometry {
  const segments = layer === 'front' ? 14 : 18;
  const vertices: number[] = [];
  const indices: number[] = [];
  const layerHeight =
    layer === 'back' ? 0.64 :
      layer === 'accent' ? 0.54 :
        layer === 'front' ? 0.38 :
          1;
  const layerBase =
    layer === 'front' ? 0.08 :
      layer === 'accent' ? 0.1 :
        0.12;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = (t - 0.5) * width;
    const noise = skylineNoise(i, seed + (layer === 'back' ? 1.7 : layer === 'front' ? 4.8 : 0));
    let top: number;

    if (kind === 'mountains') {
      const ridge = Math.max(
        0,
        1 - Math.abs(((t * 3.2 + seed * 0.37) % 1) * 2 - 1),
      );
      const farLift = layer === 'back' ? 0.18 : 0;
      top = height * (0.34 + farLift + ridge * 0.78 + noise * 0.22);
    } else if (kind === 'forestLine') {
      const canopy = Math.sin(t * Math.PI * (layer === 'front' ? 11 : 8) + seed) * 0.18 + noise * 0.28;
      const crown = Math.max(0, Math.sin(t * Math.PI * 15 + seed * 0.6)) * (layer === 'front' ? 0.34 : 0.16);
      top = height * (0.48 + canopy + crown);
    } else if (kind === 'islands') {
      const island = Math.max(0, Math.sin(t * Math.PI * 2.7 + seed * 2.1));
      const palm = layer === 'front' ? Math.max(0, Math.sin(t * Math.PI * 12 + seed)) * 0.24 : 0;
      top = height * (0.14 + island * 0.54 + palm + noise * 0.16);
    } else {
      const dune = Math.sin(t * Math.PI * 2.2 + seed) * 0.28 + Math.sin(t * Math.PI * 4.4 + seed * 0.7) * 0.14;
      const crest = layer === 'front' ? Math.max(0, Math.sin(t * Math.PI * 5.5 + seed * 1.2)) * 0.12 : 0;
      top = height * (0.4 + dune + crest + noise * 0.1);
    }

    vertices.push(x, 0, 0, x, Math.max(height * layerBase, top * layerHeight), 0);
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

function createHorizonPanels(count: number): HorizonPanel[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = skylineNoise(i, 2.5);
    return {
      angle: (i / count) * Math.PI * 2,
      radiusOffset: (seed - 0.5) * 16,
      yOffset: (skylineNoise(i, 5.1) - 0.5) * 3,
      widthScale: 0.88 + skylineNoise(i, 8.7) * 0.28,
      heightScale: 0.82 + skylineNoise(i, 11.3) * 0.36,
      depthShift: (skylineNoise(i, 14.8) - 0.5) * 1.7,
      mistLift: skylineNoise(i, 17.2) * 0.28,
    };
  });
}

function colorToRgba(hex: number, alpha: number): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function createDepthCurtainTexture(config: AtmosphereConfig['curtain']): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const baseGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  baseGradient.addColorStop(0, colorToRgba(config.color, 0));
  baseGradient.addColorStop(0.2, colorToRgba(config.color, 0.12));
  baseGradient.addColorStop(0.58, colorToRgba(config.secondaryColor, 0.24));
  baseGradient.addColorStop(1, colorToRgba(config.color, 0));
  ctx.fillStyle = baseGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (config.kind === 'forestLight') {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 11; i++) {
      const x = 24 + skylineNoise(i, 22.4) * 468;
      const width = 18 + skylineNoise(i, 24.1) * 36;
      const gradient = ctx.createLinearGradient(x - width, 0, x + width * 1.6, canvas.height);
      gradient.addColorStop(0, colorToRgba(config.secondaryColor, 0));
      gradient.addColorStop(0.42, colorToRgba(config.color, 0.16 + skylineNoise(i, 25.7) * 0.12));
      gradient.addColorStop(1, colorToRgba(config.secondaryColor, 0));
      ctx.fillStyle = gradient;
      ctx.save();
      ctx.translate(x, canvas.height * 0.5);
      ctx.rotate(-0.18 + skylineNoise(i, 26.9) * 0.24);
      ctx.fillRect(-width * 0.5, -canvas.height, width, canvas.height * 2);
      ctx.restore();
    }
  } else if (config.kind === 'lagoonShimmer') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const y = 48 + skylineNoise(i, 32.2) * 152;
      ctx.strokeStyle = colorToRgba(i % 2 === 0 ? config.color : config.secondaryColor, 0.12 + skylineNoise(i, 34.1) * 0.14);
      ctx.lineWidth = 2 + skylineNoise(i, 35.8) * 7;
      ctx.beginPath();
      for (let x = -12; x <= canvas.width + 12; x += 34) {
        const wave = Math.sin(x * 0.035 + i * 1.7) * (7 + skylineNoise(i, 37.6) * 8);
        if (x <= -12) {
          ctx.moveTo(x, y + wave);
        } else {
          ctx.lineTo(x, y + wave);
        }
      }
      ctx.stroke();
    }
  } else if (config.kind === 'iceAurora') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, colorToRgba(config.color, 0));
      gradient.addColorStop(0.3 + skylineNoise(i, 42.2) * 0.18, colorToRgba(i % 2 === 0 ? config.color : config.secondaryColor, 0.12));
      gradient.addColorStop(0.72, colorToRgba(config.secondaryColor, 0.08 + skylineNoise(i, 43.8) * 0.1));
      gradient.addColorStop(1, colorToRgba(config.color, 0));
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 9 + skylineNoise(i, 44.6) * 16;
      ctx.beginPath();
      for (let x = -20; x <= canvas.width + 20; x += 32) {
        const y = 58 + i * 20 + Math.sin(x * 0.024 + i * 1.1) * (12 + i * 1.8);
        if (x <= -20) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const y = 72 + skylineNoise(i, 52.5) * 116;
      ctx.strokeStyle = colorToRgba(i % 3 === 0 ? config.secondaryColor : config.color, 0.07 + skylineNoise(i, 53.8) * 0.1);
      ctx.lineWidth = 3 + skylineNoise(i, 55.1) * 8;
      ctx.beginPath();
      for (let x = -18; x <= canvas.width + 18; x += 26) {
        const heat = Math.sin(x * 0.048 + i * 2.2) * (4 + skylineNoise(i, 56.4) * 9);
        if (x <= -18) {
          ctx.moveTo(x, y + heat);
        } else {
          ctx.lineTo(x, y + heat);
        }
      }
      ctx.stroke();
    }
  }

  ctx.globalCompositeOperation = 'destination-in';
  const edgeFade = ctx.createLinearGradient(0, 0, canvas.width, 0);
  edgeFade.addColorStop(0, 'rgba(255,255,255,0)');
  edgeFade.addColorStop(0.16, 'rgba(255,255,255,1)');
  edgeFade.addColorStop(0.84, 'rgba(255,255,255,1)');
  edgeFade.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = edgeFade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
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
const sharedWeatherGeometry = new THREE.PlaneGeometry(1, 1);
const sharedSignatureGeometry = new THREE.PlaneGeometry(1, 1);

function BiomeDepthCurtain({ config, phase }: { config: AtmosphereConfig; phase: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const { camera } = useThree();
  const texture = useMemo(() => createDepthCurtainTexture(config.curtain), [config.curtain]);

  useEffect(() => () => {
    texture?.dispose();
  }, [texture]);

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current || !texture || phase !== 'playing') return;

    const elapsed = clock.getElapsedTime();
    camera.getWorldDirection(_curtainForward);
    _curtainForward.y *= config.curtain.kind === 'iceAurora' ? 0.54 : 0.28;
    if (_curtainForward.lengthSq() < 0.001) {
      _curtainForward.set(0, 0, -1);
    } else {
      _curtainForward.normalize();
    }

    meshRef.current.position
      .copy(camera.position)
      .addScaledVector(_curtainForward, config.curtain.distance);
    meshRef.current.position.y += config.curtain.yOffset + Math.sin(elapsed * 0.18 + config.curtain.opacity * 10) * 0.55;
    meshRef.current.quaternion.copy(camera.quaternion);
    meshRef.current.rotateZ(Math.sin(elapsed * config.curtain.driftSpeed * 2.2) * 0.024);
    meshRef.current.scale.set(config.curtain.width, config.curtain.height, 1);

    materialRef.current.opacity = config.curtain.opacity * (0.86 + Math.sin(elapsed * 0.34) * 0.08);
  });

  if (!texture || phase !== 'playing') return null;

  return (
    <mesh
      ref={meshRef}
      geometry={sharedWeatherGeometry}
      frustumCulled={false}
      renderOrder={0}
    >
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        transparent
        depthWrite={false}
        depthTest
        opacity={config.curtain.opacity}
        side={THREE.DoubleSide}
        toneMapped={false}
        blending={config.curtain.blending}
      />
    </mesh>
  );
}

function BiomeHorizon({ config, phase }: { config: AtmosphereConfig; phase: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const panels = useMemo(() => createHorizonPanels(getEffectiveHorizonCount()), []);
  const backGeometry = useMemo(
    () => createSkylineGeometry(config.horizon.kind, 58, config.horizon.height * 1.08, config.horizon.accentColor, 'back'),
    [config.horizon.accentColor, config.horizon.height, config.horizon.kind],
  );
  const skylineGeometry = useMemo(
    () => createSkylineGeometry(config.horizon.kind, 48, config.horizon.height, config.horizon.color, 'main'),
    [config.horizon.color, config.horizon.height, config.horizon.kind],
  );
  const accentGeometry = useMemo(
    () => createSkylineGeometry(config.horizon.kind, 42, config.horizon.height * 0.55, config.horizon.accentColor, 'accent'),
    [config.horizon.accentColor, config.horizon.height, config.horizon.kind],
  );
  const frontGeometry = useMemo(
    () => createSkylineGeometry(config.horizon.kind, 36, config.horizon.height * 0.62, config.horizon.color, 'front'),
    [config.horizon.color, config.horizon.height, config.horizon.kind],
  );
  const mistGeometry = useMemo(
    () => new THREE.PlaneGeometry(56, Math.max(4, config.horizon.height * 0.36)),
    [config.horizon.height],
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
              geometry={mistGeometry}
              position={[0, config.horizon.height * (0.18 + panel.mistLift), -1.15 + panel.depthShift]}
              scale={[panel.widthScale * 1.08, panel.heightScale, 1]}
              renderOrder={-23}
            >
              <meshBasicMaterial
                color={config.horizon.accentColor}
                transparent
                opacity={config.horizon.opacity * 0.13}
                depthWrite={false}
                fog
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            <mesh
              geometry={backGeometry}
              position={[0, config.horizon.height * 0.05, -1.1 + panel.depthShift]}
              scale={[panel.widthScale * 1.18, panel.heightScale * 0.9, 1]}
              renderOrder={-22}
            >
              <meshBasicMaterial
                color={config.horizon.accentColor}
                transparent
                opacity={config.horizon.opacity * 0.18}
                depthWrite={false}
                fog
              />
            </mesh>
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
            <mesh
              geometry={frontGeometry}
              position={[0, -config.horizon.height * 0.02, 0.42]}
              scale={[panel.widthScale * 0.74, panel.heightScale * 0.82, 1]}
              renderOrder={-18}
            >
              <meshBasicMaterial
                color={config.horizon.color}
                transparent
                opacity={config.horizon.opacity * 0.24}
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

function BiomeWeatherRibbons({ config, phase }: { config: AtmosphereConfig; phase: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const { camera } = useThree();
  const ribbons = useMemo(
    () => createWeatherRibbons(config, getEffectiveWeatherCount(config)),
    [config],
  );
  const color = useMemo(() => new THREE.Color(config.weather.color), [config.weather.color]);

  useFrame(({ clock }) => {
    if (!meshRef.current || phase !== 'playing') return;

    const elapsed = clock.getElapsedTime();
    const mesh = meshRef.current;
    const dummy = dummyRef.current;
    _cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _cameraForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _cameraForward.y *= 0.18;
    if (_cameraForward.lengthSq() > 0.001) _cameraForward.normalize();

    for (let i = 0; i < ribbons.length; i++) {
      const ribbon = ribbons[i];
      const orbit = ribbon.angle + elapsed * ribbon.speed * 0.08;
      const localX = Math.cos(orbit) * ribbon.radius;
      const localZ = Math.sin(orbit) * ribbon.radius;
      const travel = (elapsed * ribbon.speed + ribbon.seed * 17) % 1;
      const wave = elapsed * (1.1 + ribbon.seed) + ribbon.wave;
      let x = localX;
      let y = ribbon.height;
      let z = localZ;
      let width = ribbon.width;
      let length = ribbon.length;
      let rotationZ = ribbon.spin;

      if (config.weather.kind === 'snowfall') {
        const fallRange = config.weather.heightMax - config.weather.heightMin + 5;
        y = config.weather.heightMax - travel * fallRange + Math.sin(wave) * 0.12;
        x += Math.sin(wave * 0.65) * config.weather.driftStrength;
        z += Math.cos(wave * 0.47) * config.weather.driftStrength * 0.58;
        rotationZ = -0.2 + Math.sin(wave * 0.4) * 0.24;
      } else if (config.weather.kind === 'sandGust') {
        const sweep = (travel - 0.5) * config.weather.radius * 1.65;
        x += sweep + Math.sin(wave * 0.7) * config.weather.driftStrength;
        y = config.weather.heightMin + Math.abs(Math.sin(wave * 0.56)) * (config.weather.heightMax - config.weather.heightMin);
        z += Math.cos(wave * 0.38) * config.weather.driftStrength;
        width *= 0.86 + Math.sin(wave) * 0.12;
        length *= 1.18;
        rotationZ = Math.PI / 2 + Math.sin(wave * 0.7) * 0.18;
      } else if (config.weather.kind === 'spray') {
        const rise = Math.sin((travel * Math.PI * 2) + ribbon.wave) * 0.5 + 0.5;
        y = config.weather.heightMin + rise * (config.weather.heightMax - config.weather.heightMin);
        x += Math.sin(wave * 1.4) * config.weather.driftStrength;
        z += Math.cos(wave * 1.1) * config.weather.driftStrength * 0.42;
        width *= 0.72;
        length *= 0.72 + rise * 0.7;
        rotationZ = ribbon.spin + Math.sin(wave * 1.8) * 0.75;
      } else {
        const flutter = Math.sin(wave * 1.7);
        y -= travel * 1.9;
        x += flutter * config.weather.driftStrength;
        z += Math.cos(wave) * config.weather.driftStrength * 0.48;
        rotationZ = ribbon.spin + elapsed * (0.8 + ribbon.seed * 1.2) + flutter * 0.8;
      }

      dummy.position
        .copy(camera.position)
        .addScaledVector(_cameraRight, x)
        .addScaledVector(_cameraForward, z);
      dummy.position.y += y;
      dummy.quaternion.copy(camera.quaternion);
      dummy.rotateZ(rotationZ);
      dummy.scale.set(width, length, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  if (phase !== 'playing') return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedWeatherGeometry, undefined, ribbons.length]}
      frustumCulled={false}
      renderOrder={3}
    >
      <meshBasicMaterial
        color={color}
        depthTest={false}
        depthWrite={false}
        opacity={config.weather.opacity}
        transparent
        side={THREE.DoubleSide}
        toneMapped={false}
        blending={config.weather.kind === 'sandGust' ? THREE.NormalBlending : THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}

function BiomeSignatureVeil({ config, phase }: { config: AtmosphereConfig; phase: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const { camera } = useThree();
  const veils = useMemo(
    () => createSignatureVeils(config, getEffectiveSignatureCount(config)),
    [config],
  );
  const primaryColor = useMemo(() => new THREE.Color(config.signature.color), [config.signature.color]);
  const secondaryColor = useMemo(() => new THREE.Color(config.signature.secondaryColor), [config.signature.secondaryColor]);

  useFrame(({ clock }) => {
    if (!meshRef.current || phase !== 'playing') return;

    const elapsed = clock.getElapsedTime();
    const mesh = meshRef.current;
    const dummy = dummyRef.current;
    const pulse = 0.5 + Math.sin(elapsed * 0.42) * 0.5;
    _cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _cameraForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _cameraForward.y *= config.signature.kind === 'aurora' ? 0.01 : 0.16;
    if (_cameraForward.lengthSq() > 0.001) _cameraForward.normalize();

    if (materialRef.current) {
      materialRef.current.color.copy(primaryColor).lerp(secondaryColor, 0.28 + pulse * 0.22);
      const pulseScale = config.signature.kind === 'aurora'
        ? 0.74 + pulse * 0.18
        : 0.78 + pulse * 0.28;
      materialRef.current.opacity = config.signature.opacity * pulseScale;
    }

    for (let i = 0; i < veils.length; i++) {
      const veil = veils[i];
      const orbit = veil.angle + elapsed * veil.speed * 0.05;
      const wave = elapsed * (0.72 + veil.seed * 0.5) + veil.wave;
      let localX = Math.cos(orbit) * veil.radius;
      let localZ = Math.sin(orbit) * veil.radius;
      let y = veil.height;
      let width = veil.width;
      let length = veil.length;
      let rotationZ = veil.spin;

      if (config.signature.kind === 'aurora') {
        const lane = i - (veils.length - 1) / 2;
        localX = lane * (config.signature.width * 0.78)
          + Math.sin(wave * 0.44) * config.signature.driftStrength
          + (veil.seed - 0.5) * 4.5;
        localZ = config.signature.radius * (0.92 + veil.seed * 0.18);
        y += Math.sin(wave * 0.36) * 1.1;
        width *= 0.88 + Math.sin(wave * 0.55) * 0.1;
        length *= 0.72 + Math.max(0, Math.sin(wave * 0.28 + lane)) * 0.34;
        rotationZ = Math.sin(wave * 0.38) * 0.08;
      } else if (config.signature.kind === 'forestShaft') {
        localX += Math.sin(wave * 0.42) * config.signature.driftStrength;
        localZ += Math.cos(wave * 0.37) * config.signature.driftStrength * 0.5;
        y += Math.sin(wave * 0.35) * 0.65;
        width *= 0.82 + Math.sin(wave * 0.58) * 0.08;
        rotationZ = -0.16 + Math.sin(wave * 0.3) * 0.12;
      } else if (config.signature.kind === 'lagoonGlint') {
        const shimmer = Math.max(0, Math.sin(wave * 1.7));
        localX += Math.sin(wave * 0.82) * config.signature.driftStrength;
        localZ += Math.cos(wave * 0.64) * config.signature.driftStrength * 0.55;
        y += shimmer * 0.55;
        width *= 0.78 + shimmer * 0.42;
        length *= 0.75 + shimmer * 0.85;
        rotationZ = Math.sin(wave * 0.9) * 0.35;
      } else {
        const sweep = ((elapsed * veil.speed + veil.seed * 13) % 1 - 0.5) * config.signature.radius;
        localX += sweep + Math.sin(wave * 0.7) * config.signature.driftStrength;
        localZ += Math.cos(wave * 0.45) * config.signature.driftStrength;
        y += Math.abs(Math.sin(wave * 0.52)) * 0.6;
        width *= 0.9 + Math.sin(wave) * 0.16;
        length *= 0.76 + Math.abs(Math.cos(wave * 0.8)) * 0.35;
        rotationZ = Math.sin(wave * 0.45) * 0.12;
      }

      dummy.position
        .copy(camera.position)
        .addScaledVector(_cameraRight, localX)
        .addScaledVector(_cameraForward, localZ);
      dummy.position.y += y;
      dummy.quaternion.copy(camera.quaternion);
      dummy.rotateZ(rotationZ);
      dummy.scale.set(width, length, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  if (phase !== 'playing') return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedSignatureGeometry, undefined, veils.length]}
      frustumCulled={false}
      renderOrder={1}
    >
      <meshBasicMaterial
        ref={materialRef}
        color={primaryColor}
        depthTest={config.signature.kind === 'aurora'}
        depthWrite={false}
        opacity={config.signature.opacity}
        transparent
        side={THREE.DoubleSide}
        toneMapped={false}
        blending={config.signature.kind === 'heatMirage' ? THREE.NormalBlending : THREE.AdditiveBlending}
      />
    </instancedMesh>
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
      <BiomeDepthCurtain config={config} phase={phase} />
      <BiomeHorizon config={config} phase={phase} />
      <BiomeSignatureVeil config={config} phase={phase} />
      <BiomeWeatherRibbons config={config} phase={phase} />
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
