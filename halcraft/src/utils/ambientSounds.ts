// 環境音（アンビエント）マネージャー
// プレイヤーの位置や状況に応じて環境音を再生する
// Web Audio API で手続き的に生成（外部ファイル不要）

import { SEA_LEVEL } from '../types/blocks';
import type { BiomeId, StageCategory } from '../types/stages';

interface AmbientProfile {
  windLevel: number;
  windBodyCutoff: number;
  windAirCutoff: number;
  windRustleLevel: number;
  waterLevel: number;
  caveCutoff: number;
  cavePitch: number;
}

const AMBIENT_VOLUME = 0.045;
const PARAM_RESPONSE_SECONDS = 0.75;
const MAX_STAGE_AMBIENT = 1.15;

const AMBIENT_PROFILES: Record<BiomeId, AmbientProfile> = {
  forest: {
    windLevel: 0.2,
    windBodyCutoff: 560,
    windAirCutoff: 1850,
    windRustleLevel: 0.22,
    waterLevel: 0.78,
    caveCutoff: 120,
    cavePitch: 46,
  },
  tropical: {
    windLevel: 0.15,
    windBodyCutoff: 480,
    windAirCutoff: 1650,
    windRustleLevel: 0.32,
    waterLevel: 1,
    caveCutoff: 110,
    cavePitch: 42,
  },
  snow: {
    windLevel: 0.3,
    windBodyCutoff: 760,
    windAirCutoff: 2700,
    windRustleLevel: 0.1,
    waterLevel: 0.62,
    caveCutoff: 135,
    cavePitch: 50,
  },
  desert: {
    windLevel: 0.24,
    windBodyCutoff: 680,
    windAirCutoff: 2450,
    windRustleLevel: 0.07,
    waterLevel: 0.28,
    caveCutoff: 95,
    cavePitch: 44,
  },
};

const BUILD_TONE_PITCH: Record<BiomeId, number> = {
  forest: 196,
  tropical: 246,
  snow: 220,
  desert: 174,
};

const WAR_TONE_PITCH: Record<BiomeId, number> = {
  forest: 74,
  tropical: 86,
  snow: 62,
  desert: 56,
};

const BUILD_TEXTURE_PITCH: Record<BiomeId, number> = {
  forest: 2750,
  tropical: 3400,
  snow: 4200,
  desert: 2250,
};

const WAR_TEXTURE_PITCH: Record<BiomeId, number> = {
  forest: 360,
  tropical: 430,
  snow: 280,
  desert: 520,
};

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let windBodyGain: GainNode | null = null;
let windAirGain: GainNode | null = null;
let windRustleGain: GainNode | null = null;
let waterGain: GainNode | null = null;
let caveGain: GainNode | null = null;
let windBodyFilterNode: BiquadFilterNode | null = null;
let windAirFilterNode: BiquadFilterNode | null = null;
let waterFilterNode: BiquadFilterNode | null = null;
let caveFilterNode: BiquadFilterNode | null = null;
let caveDroneNode: OscillatorNode | null = null;
let modeToneGain: GainNode | null = null;
let modeToneFilterNode: BiquadFilterNode | null = null;
let modeToneNode: OscillatorNode | null = null;
let modeTextureGain: GainNode | null = null;
let modeTextureFilterNode: BiquadFilterNode | null = null;
let activeSources: AudioScheduledSourceNode[] = [];
let isRunning = false;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function trackSource<T extends AudioScheduledSourceNode>(source: T): T {
  activeSources.push(source);
  return source;
}

function smoothParam(param: AudioParam, target: number, now: number, responseSeconds = PARAM_RESPONSE_SECONDS): void {
  param.cancelScheduledValues(now);
  param.setTargetAtTime(target, now, responseSeconds);
}

function softenLoopEdges(buffer: AudioBuffer, fadeSeconds: number): void {
  const fadeSamples = Math.min(Math.floor(buffer.sampleRate * fadeSeconds), Math.floor(buffer.length / 2));
  if (fadeSamples <= 0) return;

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < fadeSamples; i++) {
      const t = i / fadeSamples;
      const startIndex = i;
      const endIndex = buffer.length - fadeSamples + i;
      const blended = data[endIndex] * (1 - t) + data[startIndex] * t;
      data[startIndex] = blended;
      data[endIndex] = blended;
    }
  }
}

function createTexturedNoiseBuffer(ctx: AudioContext, seconds: number, smoothing: number, drive: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    let value = (Math.random() * 2 - 1) * 0.2;
    let slowDrift = (Math.random() * 2 - 1) * 0.1;

    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      const driftWhite = Math.random() * 2 - 1;
      slowDrift = slowDrift * 0.9995 + driftWhite * 0.0005;
      value = value * smoothing + white * (1 - smoothing);
      data[i] = clamp((value + slowDrift * 0.45) * drive, -1, 1);
    }
  }

  softenLoopEdges(buffer, 0.18);
  return buffer;
}

function createWaterNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 10);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    let wash = 0;
    let bubble = 0;

    for (let i = 0; i < length; i++) {
      wash = wash * 0.94 + (Math.random() * 2 - 1) * 0.06;
      if (Math.random() < 0.0018) {
        bubble += Math.random() * 0.8;
      }
      bubble *= 0.985;
      data[i] = clamp(wash * 1.35 + bubble * 0.28, -1, 1);
    }
  }

  softenLoopEdges(buffer, 0.12);
  return buffer;
}

function safeStop(source: AudioScheduledSourceNode): void {
  try {
    source.stop();
  } catch {
    // stop 済みのノードは無視する
  }
}

/** 環境音システムの初期化 */
export function initAmbientSounds(): void {
  if (isRunning) return;

  audioCtx = new AudioContext();
  // ブラウザの自動再生ポリシー対応
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  masterGain = audioCtx.createGain();
  masterGain.gain.value = AMBIENT_VOLUME;
  masterGain.connect(audioCtx.destination);

  // --- 風音: 音程を持つオシレーターではなく、自然音に近い色付きノイズで構成 ---
  const windSource = trackSource(audioCtx.createBufferSource());
  windSource.buffer = createTexturedNoiseBuffer(audioCtx, 14, 0.985, 4.2);
  windSource.loop = true;

  const windBodyHighpass = audioCtx.createBiquadFilter();
  windBodyHighpass.type = 'highpass';
  windBodyHighpass.frequency.value = 85;
  windBodyHighpass.Q.value = 0.35;

  const windBodyFilter = audioCtx.createBiquadFilter();
  windBodyFilter.type = 'lowpass';
  windBodyFilter.frequency.value = AMBIENT_PROFILES.forest.windBodyCutoff;
  windBodyFilter.Q.value = 0.28;
  windBodyFilterNode = windBodyFilter;

  windBodyGain = audioCtx.createGain();
  windBodyGain.gain.value = 0;

  const windAirFilter = audioCtx.createBiquadFilter();
  windAirFilter.type = 'bandpass';
  windAirFilter.frequency.value = AMBIENT_PROFILES.forest.windAirCutoff;
  windAirFilter.Q.value = 0.55;
  windAirFilterNode = windAirFilter;

  windAirGain = audioCtx.createGain();
  windAirGain.gain.value = 0;

  windSource.connect(windBodyHighpass);
  windBodyHighpass.connect(windBodyFilter);
  windBodyFilter.connect(windBodyGain);
  windBodyGain.connect(masterGain);

  windSource.connect(windAirFilter);
  windAirFilter.connect(windAirGain);
  windAirGain.connect(masterGain);
  windSource.start();

  const rustleSource = trackSource(audioCtx.createBufferSource());
  rustleSource.buffer = createTexturedNoiseBuffer(audioCtx, 9, 0.72, 0.95);
  rustleSource.loop = true;

  const rustleFilter = audioCtx.createBiquadFilter();
  rustleFilter.type = 'bandpass';
  rustleFilter.frequency.value = 2450;
  rustleFilter.Q.value = 0.9;

  windRustleGain = audioCtx.createGain();
  windRustleGain.gain.value = 0;

  rustleSource.connect(rustleFilter);
  rustleFilter.connect(windRustleGain);
  windRustleGain.connect(masterGain);
  rustleSource.start();

  // --- 水音: 低い水の揺れと小さな泡を混ぜたノイズ ---
  const waterSource = trackSource(audioCtx.createBufferSource());
  waterSource.buffer = createWaterNoiseBuffer(audioCtx);
  waterSource.loop = true;

  const waterHighpass = audioCtx.createBiquadFilter();
  waterHighpass.type = 'highpass';
  waterHighpass.frequency.value = 120;
  waterHighpass.Q.value = 0.4;

  const waterFilter = audioCtx.createBiquadFilter();
  waterFilter.type = 'bandpass';
  waterFilter.frequency.value = 720;
  waterFilter.Q.value = 0.75;
  waterFilterNode = waterFilter;

  waterGain = audioCtx.createGain();
  waterGain.gain.value = 0;

  waterSource.connect(waterHighpass);
  waterHighpass.connect(waterFilter);
  waterFilter.connect(waterGain);
  waterGain.connect(masterGain);
  waterSource.start();

  // --- 洞窟音: 低く薄い共鳴 + 空気のゆらぎ ---
  caveGain = audioCtx.createGain();
  caveGain.gain.value = 0;
  caveGain.connect(masterGain);

  const caveDrone = trackSource(audioCtx.createOscillator());
  caveDrone.type = 'sine';
  caveDrone.frequency.value = AMBIENT_PROFILES.forest.cavePitch;
  caveDroneNode = caveDrone;

  const caveFilter = audioCtx.createBiquadFilter();
  caveFilter.type = 'lowpass';
  caveFilter.frequency.value = AMBIENT_PROFILES.forest.caveCutoff;
  caveFilter.Q.value = 0.45;
  caveFilterNode = caveFilter;

  const caveToneGain = audioCtx.createGain();
  caveToneGain.gain.value = 0.18;

  const caveAirSource = trackSource(audioCtx.createBufferSource());
  caveAirSource.buffer = createTexturedNoiseBuffer(audioCtx, 16, 0.996, 5.5);
  caveAirSource.loop = true;

  const caveAirFilter = audioCtx.createBiquadFilter();
  caveAirFilter.type = 'lowpass';
  caveAirFilter.frequency.value = 210;
  caveAirFilter.Q.value = 0.35;

  const caveAirGain = audioCtx.createGain();
  caveAirGain.gain.value = 0.16;

  caveDrone.connect(caveFilter);
  caveFilter.connect(caveToneGain);
  caveToneGain.connect(caveGain);
  caveDrone.start();

  caveAirSource.connect(caveAirFilter);
  caveAirFilter.connect(caveAirGain);
  caveAirGain.connect(caveGain);
  caveAirSource.start();

  // --- モード空気音: 建築は柔らかい制作感、戦争は低い緊張感を薄く重ねる ---
  modeToneGain = audioCtx.createGain();
  modeToneGain.gain.value = 0;
  modeToneGain.connect(masterGain);

  const modeToneFilter = audioCtx.createBiquadFilter();
  modeToneFilter.type = 'lowpass';
  modeToneFilter.frequency.value = 700;
  modeToneFilter.Q.value = 0.35;
  modeToneFilterNode = modeToneFilter;

  const modeTone = trackSource(audioCtx.createOscillator());
  modeTone.type = 'triangle';
  modeTone.frequency.value = BUILD_TONE_PITCH.forest;
  modeToneNode = modeTone;

  modeTone.connect(modeToneFilter);
  modeToneFilter.connect(modeToneGain);
  modeTone.start();

  modeTextureGain = audioCtx.createGain();
  modeTextureGain.gain.value = 0;
  modeTextureGain.connect(masterGain);

  const modeTextureSource = trackSource(audioCtx.createBufferSource());
  modeTextureSource.buffer = createTexturedNoiseBuffer(audioCtx, 11, 0.93, 1.35);
  modeTextureSource.loop = true;

  const modeTextureFilter = audioCtx.createBiquadFilter();
  modeTextureFilter.type = 'bandpass';
  modeTextureFilter.frequency.value = BUILD_TEXTURE_PITCH.forest;
  modeTextureFilter.Q.value = 1.1;
  modeTextureFilterNode = modeTextureFilter;

  modeTextureSource.connect(modeTextureFilter);
  modeTextureFilter.connect(modeTextureGain);
  modeTextureSource.start();

  isRunning = true;
}

/**
 * 環境音の状態を更新（毎フレーム呼び出し）
 * @param isOutside 屋外にいるか
 * @param isUnderwater 水中にいるか
 * @param isUnderground 地下にいるか（y < 海面レベル）
 * @param playerY プレイヤーのY座標
 * @param stageCategory 建築/戦争のモード差
 * @param modeFlowRatio ひらめき/戦意ゲージの進み具合
 */
export function updateAmbientSounds(
  isOutside: boolean,
  isUnderwater: boolean,
  isUnderground: boolean,
  playerY: number,
  biomeId: BiomeId = 'forest',
  isNight = false,
  stageAmbientIntensity = 1,
  stageCategory: StageCategory | null = null,
  modeFlowRatio = 0,
  modeFlowRank = 0,
): void {
  if (
    !audioCtx ||
    !windBodyGain ||
    !windAirGain ||
    !windRustleGain ||
    !waterGain ||
    !caveGain ||
    !modeToneGain ||
    !modeTextureGain
  ) {
    return;
  }

  const now = audioCtx.currentTime;
  const profile = AMBIENT_PROFILES[biomeId];
  const stageIntensity = clamp(stageAmbientIntensity, 0, MAX_STAGE_AMBIENT);
  const nightBoost = isNight ? 1.08 : 1;
  const gust =
    0.78 +
    Math.sin(now * 0.071 + 0.6) * 0.14 +
    Math.sin(now * 0.023 + 2.4) * 0.08;
  const windPresence = clamp(gust, 0.55, 1.02);

  if (windBodyFilterNode) {
    smoothParam(windBodyFilterNode.frequency, profile.windBodyCutoff * (isNight ? 0.92 : 1), now, 1.2);
  }
  if (windAirFilterNode) {
    smoothParam(windAirFilterNode.frequency, profile.windAirCutoff, now, 1.2);
  }
  if (waterFilterNode) {
    const waterTone = biomeId === 'tropical' ? 850 : biomeId === 'snow' ? 620 : 720;
    smoothParam(waterFilterNode.frequency, waterTone, now, 1);
  }
  if (caveFilterNode) {
    const caveDepth = Math.max(0, Math.min(1, (SEA_LEVEL - playerY) / SEA_LEVEL));
    smoothParam(caveFilterNode.frequency, profile.caveCutoff + caveDepth * 35, now, 1.1);
  }
  if (caveDroneNode) {
    const caveDepth = Math.max(0, Math.min(1, (SEA_LEVEL - playerY) / SEA_LEVEL));
    smoothParam(caveDroneNode.frequency, profile.cavePitch + caveDepth * 8, now, 1.4);
  }

  // 風音: 屋外 + 地上。音程感のない柔らかい風にして、常時の耳障りな持続音を避ける。
  const windTarget = isOutside && !isUnderwater && !isUnderground
    ? profile.windLevel * windPresence * nightBoost * stageIntensity
    : 0;
  smoothParam(windBodyGain.gain, windTarget, now);
  smoothParam(windAirGain.gain, windTarget * 0.32, now);
  smoothParam(windRustleGain.gain, windTarget * profile.windRustleLevel, now, 0.55);

  // 水音: 水中
  const waterTarget = isUnderwater ? 0.34 * profile.waterLevel * stageIntensity : 0;
  smoothParam(waterGain.gain, waterTarget, now, 0.65);

  // 洞窟音: 地下。深くなるほど少しだけ増えるが、圧迫感が出ない範囲に抑える。
  const caveDepth = Math.max(0, Math.min(1, (SEA_LEVEL - playerY) / SEA_LEVEL));
  const caveTarget = isUnderground && !isUnderwater ? (0.08 + caveDepth * 0.1) * stageIntensity : 0;
  smoothParam(caveGain.gain, caveTarget, now, 0.9);

  const safeModeRatio = clamp(modeFlowRatio, 0, 1);
  const safeModeRank = clamp(modeFlowRank, 0, 3);
  const playfieldPresence = isUnderwater ? 0.12 : isUnderground ? 0.42 : isOutside ? 1 : 0.72;
  const modePresence = stageCategory
    ? (0.42 + safeModeRatio * 0.42 + safeModeRank * 0.08) * stageIntensity * playfieldPresence
    : 0;
  const modePulse = stageCategory === 'war'
    ? 0.8 + Math.sin(now * (1.55 + safeModeRatio * 1.6)) * 0.2
    : 0.74 + Math.sin(now * 0.58 + safeModeRatio) * 0.16;

  if (modeToneNode) {
    const basePitch = stageCategory === 'war'
      ? WAR_TONE_PITCH[biomeId]
      : BUILD_TONE_PITCH[biomeId];
    const flowLift = stageCategory === 'war'
      ? safeModeRatio * 8 + safeModeRank * 2
      : safeModeRatio * 18 + safeModeRank * 4;
    const drift = Math.sin(now * 0.17 + basePitch) * (stageCategory === 'war' ? 1.8 : 3.2);
    modeToneNode.type = stageCategory === 'war' ? 'sawtooth' : 'triangle';
    smoothParam(modeToneNode.frequency, basePitch + flowLift + drift, now, 1.1);
  }

  if (modeToneFilterNode) {
    const targetCutoff = stageCategory === 'war'
      ? 170 + safeModeRatio * 150
      : 720 + safeModeRatio * 520;
    smoothParam(modeToneFilterNode.frequency, targetCutoff, now, 1);
  }

  if (modeTextureFilterNode) {
    const texturePitch = stageCategory === 'war'
      ? WAR_TEXTURE_PITCH[biomeId] + safeModeRatio * 130
      : BUILD_TEXTURE_PITCH[biomeId] + safeModeRatio * 760;
    modeTextureFilterNode.type = stageCategory === 'war' ? 'lowpass' : 'bandpass';
    smoothParam(modeTextureFilterNode.frequency, texturePitch, now, 0.85);
  }

  const toneTarget = stageCategory === 'war'
    ? 0.12 * modePresence * modePulse
    : 0.09 * modePresence * modePulse;
  const textureTarget = stageCategory === 'war'
    ? 0.075 * modePresence * (0.74 + safeModeRatio * 0.3)
    : 0.082 * modePresence * (0.8 + safeModeRatio * 0.45);
  smoothParam(modeToneGain.gain, toneTarget, now, 0.28);
  smoothParam(modeTextureGain.gain, textureTarget, now, 0.36);
}

/** 環境音の停止 */
export function stopAmbientSounds(): void {
  if (!isRunning) return;
  isRunning = false;

  for (const source of activeSources) {
    safeStop(source);
  }
  activeSources = [];

  setTimeout(() => {
    audioCtx?.close();
    audioCtx = null;
    masterGain = null;
    windBodyGain = null;
    windAirGain = null;
    windRustleGain = null;
    waterGain = null;
    caveGain = null;
    windBodyFilterNode = null;
    windAirFilterNode = null;
    waterFilterNode = null;
    caveFilterNode = null;
    caveDroneNode = null;
    modeToneGain = null;
    modeToneFilterNode = null;
    modeToneNode = null;
    modeTextureGain = null;
    modeTextureFilterNode = null;
  }, 500);
}
