// ライトセイバー専用サウンドエンジン
// Web Audio API でプロシージャル生成する厚めのSF武器サウンド

let audioCtx: AudioContext | null = null;

interface MasterBus {
  ctx: AudioContext;
  input: GainNode;
}

interface HumLoop {
  ctx: AudioContext;
  gain: GainNode;
  shimmerGain: GainNode;
  noiseGain: GainNode;
  sources: Array<OscillatorNode | AudioBufferSourceNode>;
}

let masterBus: MasterBus | null = null;
let humLoop: HumLoop | null = null;

function getAudioContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    audioCtx = new AudioContext();
    return audioCtx;
  } catch {
    return null;
  }
}

function resumeIfNeeded(ctx: AudioContext): void {
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
}

function getMasterInput(ctx: AudioContext): GainNode {
  if (masterBus && masterBus.ctx === ctx) return masterBus.input;

  const input = ctx.createGain();
  input.gain.value = 0.78;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 20;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;

  const output = ctx.createGain();
  output.gain.value = 0.86;

  input.connect(compressor);
  compressor.connect(output);
  output.connect(ctx.destination);

  masterBus = { ctx, input };
  return input;
}

/** 各サウンドの最終再生時間（ミリ秒） */
const lastPlayTime: Record<string, number> = {};

function canPlay(key: string, minIntervalMs: number): boolean {
  const now = performance.now();
  const last = lastPlayTime[key] || 0;
  if (now - last < minIntervalMs) return false;
  lastPlayTime[key] = now;
  return true;
}

/** ホワイトノイズバッファ（遅延初期化） */
let noiseBuffer: AudioBuffer | null = null;

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 1.2);
  noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function stopSource(source: OscillatorNode | AudioBufferSourceNode, when: number): void {
  try {
    source.stop(when);
  } catch {
    // 既に停止済みなら何もしない
  }
}

function connectFilteredNoise(
  ctx: AudioContext,
  now: number,
  duration: number,
  filterType: BiquadFilterType,
  frequency: number,
  q: number,
  gainValue: number,
): void {
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(frequency, now);
  filter.Q.setValueAtTime(q, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainValue, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(getMasterInput(ctx));
  noise.start(now);
  noise.stop(now + duration);
}

// ============================================
// 1. 起動音（イグニッション）
// ============================================

export function playLightsaberIgnite(): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('lsIgnite', 260)) return;
  resumeIfNeeded(ctx);

  const now = ctx.currentTime;
  const out = getMasterInput(ctx);

  // 低音の立ち上がり。刃が伸びる重量感を作る。
  const core = ctx.createOscillator();
  core.type = 'sawtooth';
  core.frequency.setValueAtTime(72, now);
  core.frequency.exponentialRampToValueAtTime(185, now + 0.42);

  const coreFilter = ctx.createBiquadFilter();
  coreFilter.type = 'lowpass';
  coreFilter.frequency.setValueAtTime(360, now);
  coreFilter.frequency.exponentialRampToValueAtTime(1350, now + 0.18);
  coreFilter.frequency.exponentialRampToValueAtTime(520, now + 0.55);
  coreFilter.Q.setValueAtTime(1.2, now);

  const coreGain = ctx.createGain();
  coreGain.gain.setValueAtTime(0.001, now);
  coreGain.gain.linearRampToValueAtTime(0.36, now + 0.06);
  coreGain.gain.setValueAtTime(0.28, now + 0.28);
  coreGain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);

  core.connect(coreFilter);
  coreFilter.connect(coreGain);
  coreGain.connect(out);
  core.start(now);
  core.stop(now + 0.64);

  // 明るいレーザーの伸長音。
  const blade = ctx.createOscillator();
  blade.type = 'triangle';
  blade.frequency.setValueAtTime(310, now);
  blade.frequency.exponentialRampToValueAtTime(920, now + 0.16);
  blade.frequency.exponentialRampToValueAtTime(430, now + 0.48);

  const bladeGain = ctx.createGain();
  bladeGain.gain.setValueAtTime(0.001, now);
  bladeGain.gain.linearRampToValueAtTime(0.18, now + 0.04);
  bladeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  blade.connect(bladeGain);
  bladeGain.connect(out);
  blade.start(now + 0.01);
  blade.stop(now + 0.52);

  // 点火の電気的なパチッという粒。
  for (let i = 0; i < 4; i++) {
    connectFilteredNoise(ctx, now + i * 0.018, 0.06, 'bandpass', 1800 + i * 500, 3.2, 0.075);
  }
}

// ============================================
// 2. 継続ハム音
// ============================================

export function startLightsaberHumLoop(): void {
  const ctx = getAudioContext();
  if (!ctx || humLoop) return;
  resumeIfNeeded(ctx);

  const now = ctx.currentTime;
  const out = getMasterInput(ctx);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.085, now + 0.18);

  const base = ctx.createOscillator();
  base.type = 'sine';
  base.frequency.setValueAtTime(116, now);

  const sub = ctx.createOscillator();
  sub.type = 'triangle';
  sub.frequency.setValueAtTime(58, now);

  const shimmer = ctx.createOscillator();
  shimmer.type = 'sawtooth';
  shimmer.frequency.setValueAtTime(232, now);

  const shimmerFilter = ctx.createBiquadFilter();
  shimmerFilter.type = 'bandpass';
  shimmerFilter.frequency.setValueAtTime(460, now);
  shimmerFilter.Q.setValueAtTime(1.8, now);

  const shimmerGain = ctx.createGain();
  shimmerGain.gain.setValueAtTime(0.018, now);

  const vibrato = ctx.createOscillator();
  vibrato.type = 'sine';
  vibrato.frequency.setValueAtTime(5.8, now);
  const vibratoGain = ctx.createGain();
  vibratoGain.gain.setValueAtTime(3.5, now);
  vibrato.connect(vibratoGain);
  vibratoGain.connect(base.frequency);

  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  noise.loop = true;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(740, now);
  noiseFilter.Q.setValueAtTime(0.7, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.012, now);

  base.connect(gain);
  sub.connect(gain);
  shimmer.connect(shimmerFilter);
  shimmerFilter.connect(shimmerGain);
  shimmerGain.connect(gain);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(gain);
  gain.connect(out);

  const sources = [base, sub, shimmer, vibrato, noise];
  for (const source of sources) source.start(now);

  humLoop = { ctx, gain, shimmerGain, noiseGain, sources };
}

export function setLightsaberHumIntensity(intensity: number): void {
  if (!humLoop) return;
  const clamped = Math.max(0, Math.min(1, intensity));
  const now = humLoop.ctx.currentTime;
  humLoop.gain.gain.setTargetAtTime(0.07 + clamped * 0.11, now, 0.055);
  humLoop.shimmerGain.gain.setTargetAtTime(0.018 + clamped * 0.05, now, 0.04);
  humLoop.noiseGain.gain.setTargetAtTime(0.01 + clamped * 0.045, now, 0.035);
}

export function stopLightsaberHumLoop(): void {
  if (!humLoop) return;
  const loop = humLoop;
  const now = loop.ctx.currentTime;
  loop.gain.gain.cancelScheduledValues(now);
  loop.gain.gain.setTargetAtTime(0.001, now, 0.05);
  for (const source of loop.sources) {
    stopSource(source, now + 0.22);
  }
  humLoop = null;
}

// 旧呼び出し互換。現在は連続ループを使う。
export function playLightsaberHum(): void {
  startLightsaberHumLoop();
}

// ============================================
// 3. スイング音（コンボステップ別）
// ============================================

interface SwingParams {
  startFreq: number;
  midFreq: number;
  endFreq: number;
  duration: number;
  noiseFreq: number;
  growl: number;
}

const SWING_PARAMS: SwingParams[] = [
  { startFreq: 180, midFreq: 440, endFreq: 285, duration: 0.36, noiseFreq: 820, growl: 0.8 },
  { startFreq: 230, midFreq: 520, endFreq: 210, duration: 0.34, noiseFreq: 960, growl: 0.85 },
  { startFreq: 155, midFreq: 650, endFreq: 380, duration: 0.38, noiseFreq: 1120, growl: 1.0 },
  { startFreq: 480, midFreq: 720, endFreq: 260, duration: 0.28, noiseFreq: 1320, growl: 0.7 },
  { startFreq: 150, midFreq: 760, endFreq: 170, duration: 0.56, noiseFreq: 980, growl: 1.15 },
];

export function playLightsaberSwing(comboStep: number): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('lsSwing', 75)) return;
  resumeIfNeeded(ctx);

  const stepIndex = Math.max(0, Math.min(comboStep, SWING_PARAMS.length - 1));
  const params = SWING_PARAMS[stepIndex];
  const now = ctx.currentTime;
  const out = getMasterInput(ctx);

  // 太いウォーン音。周波数スイープを二段にして、大きく振った感触を出す。
  const sweep = ctx.createOscillator();
  sweep.type = 'sawtooth';
  sweep.frequency.setValueAtTime(params.startFreq, now);
  sweep.frequency.exponentialRampToValueAtTime(params.midFreq, now + params.duration * 0.45);
  sweep.frequency.exponentialRampToValueAtTime(params.endFreq, now + params.duration);

  const sweepFilter = ctx.createBiquadFilter();
  sweepFilter.type = 'lowpass';
  sweepFilter.frequency.setValueAtTime(520, now);
  sweepFilter.frequency.exponentialRampToValueAtTime(1800, now + params.duration * 0.35);
  sweepFilter.frequency.exponentialRampToValueAtTime(620, now + params.duration);
  sweepFilter.Q.setValueAtTime(1.5 + params.growl, now);

  const sweepGain = ctx.createGain();
  sweepGain.gain.setValueAtTime(0.001, now);
  sweepGain.gain.linearRampToValueAtTime(0.26 + params.growl * 0.06, now + 0.035);
  sweepGain.gain.setValueAtTime(0.22, now + params.duration * 0.56);
  sweepGain.gain.exponentialRampToValueAtTime(0.001, now + params.duration);

  sweep.connect(sweepFilter);
  sweepFilter.connect(sweepGain);
  sweepGain.connect(out);
  sweep.start(now);
  sweep.stop(now + params.duration + 0.02);

  // 低域の空気を押す成分。
  const sub = ctx.createOscillator();
  sub.type = 'triangle';
  sub.frequency.setValueAtTime(params.startFreq * 0.42, now);
  sub.frequency.exponentialRampToValueAtTime(Math.max(55, params.endFreq * 0.36), now + params.duration);

  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.11 + params.growl * 0.035, now);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + params.duration * 0.92);

  sub.connect(subGain);
  subGain.connect(out);
  sub.start(now);
  sub.stop(now + params.duration);

  // 風切りの高域ノイズ。
  connectFilteredNoise(
    ctx,
    now + 0.015,
    params.duration * 0.85,
    'bandpass',
    params.noiseFreq,
    0.9,
    0.12 + params.growl * 0.035,
  );

  // 刃が画面を横切る瞬間の明るい芯。
  const chirp = ctx.createOscillator();
  chirp.type = 'sine';
  chirp.frequency.setValueAtTime(params.midFreq * 1.15, now + params.duration * 0.22);
  chirp.frequency.exponentialRampToValueAtTime(params.midFreq * 1.9, now + params.duration * 0.48);

  const chirpGain = ctx.createGain();
  chirpGain.gain.setValueAtTime(0.001, now + params.duration * 0.18);
  chirpGain.gain.linearRampToValueAtTime(0.07, now + params.duration * 0.32);
  chirpGain.gain.exponentialRampToValueAtTime(0.001, now + params.duration * 0.56);

  chirp.connect(chirpGain);
  chirpGain.connect(out);
  chirp.start(now + params.duration * 0.18);
  chirp.stop(now + params.duration * 0.58);
}

// ============================================
// 4. ヒット音
// ============================================

export function playLightsaberHit(): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('lsHit', 70)) return;
  resumeIfNeeded(ctx);

  const now = ctx.currentTime;
  const out = getMasterInput(ctx);

  // 低音パンチ。
  const punch = ctx.createOscillator();
  punch.type = 'sine';
  punch.frequency.setValueAtTime(220, now);
  punch.frequency.exponentialRampToValueAtTime(54, now + 0.14);

  const punchGain = ctx.createGain();
  punchGain.gain.setValueAtTime(0.46, now);
  punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

  punch.connect(punchGain);
  punchGain.connect(out);
  punch.start(now);
  punch.stop(now + 0.17);

  // 金属的なクラッシュ。
  const clashA = ctx.createOscillator();
  clashA.type = 'square';
  clashA.frequency.setValueAtTime(720, now);
  clashA.frequency.exponentialRampToValueAtTime(1280, now + 0.09);
  const clashB = ctx.createOscillator();
  clashB.type = 'sawtooth';
  clashB.frequency.setValueAtTime(910, now);
  clashB.frequency.exponentialRampToValueAtTime(520, now + 0.12);

  const clashFilter = ctx.createBiquadFilter();
  clashFilter.type = 'bandpass';
  clashFilter.frequency.setValueAtTime(1450, now);
  clashFilter.Q.setValueAtTime(4.4, now);

  const clashGain = ctx.createGain();
  clashGain.gain.setValueAtTime(0.18, now);
  clashGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

  clashA.connect(clashFilter);
  clashB.connect(clashFilter);
  clashFilter.connect(clashGain);
  clashGain.connect(out);
  clashA.start(now);
  clashB.start(now);
  clashA.stop(now + 0.17);
  clashB.stop(now + 0.17);

  // 火花ノイズを小さく複数回飛ばす。
  for (let i = 0; i < 5; i++) {
    connectFilteredNoise(ctx, now + i * 0.014, 0.055, 'highpass', 2400 + i * 420, 1.0, 0.09);
  }
}
