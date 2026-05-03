// ライトセイバー専用サウンドエンジン
// Web Audio API でプロシージャル生成するスターウォーズ風の効果音

/** AudioContext のシングルトン（sounds.ts と共有） */
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    audioCtx = new AudioContext();
    return audioCtx;
  } catch {
    return null;
  }
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
  const length = ctx.sampleRate * 0.5;
  noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

// ============================================
// 1. 起動音（イグニッション）
// ============================================

export function playLightsaberIgnite(): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('lsIgnite', 300)) return;

  const now = ctx.currentTime;

  // 低音のハム立ち上がり（サイン波 80Hz → 200Hz）
  const hum = ctx.createOscillator();
  hum.type = 'sine';
  hum.frequency.setValueAtTime(80, now);
  hum.frequency.exponentialRampToValueAtTime(200, now + 0.4);

  const humGain = ctx.createGain();
  humGain.gain.setValueAtTime(0.001, now);
  humGain.gain.linearRampToValueAtTime(0.35, now + 0.08);
  humGain.gain.setValueAtTime(0.35, now + 0.25);
  humGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  hum.connect(humGain);
  humGain.connect(ctx.destination);
  hum.start(now);
  hum.stop(now + 0.5);

  // 高音のシャープな立ち上がり（ノコギリ波 400Hz → 800Hz）
  const sharp = ctx.createOscillator();
  sharp.type = 'sawtooth';
  sharp.frequency.setValueAtTime(400, now);
  sharp.frequency.exponentialRampToValueAtTime(800, now + 0.15);

  const sharpFilter = ctx.createBiquadFilter();
  sharpFilter.type = 'lowpass';
  sharpFilter.frequency.setValueAtTime(1200, now);
  sharpFilter.frequency.exponentialRampToValueAtTime(600, now + 0.15);

  const sharpGain = ctx.createGain();
  sharpGain.gain.setValueAtTime(0.2, now);
  sharpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  sharp.connect(sharpFilter);
  sharpFilter.connect(sharpGain);
  sharpGain.connect(ctx.destination);
  sharp.start(now);
  sharp.stop(now + 0.2);

  // ノイズバースト（パチッという質感）
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(1500, now);
  noiseFilter.Q.setValueAtTime(1.5, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.15, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.08);
}

// ============================================
// 2. スイング音（コンボステップ別）
// ============================================

/** コンボステップごとの音程パラメータ */
const SWING_PARAMS: Array<{
  startFreq: number;
  endFreq: number;
  duration: number;
  midFreq?: number;
}> = [
  { startFreq: 200, endFreq: 350, duration: 0.28 },   // Step 1: 右横斬り
  { startFreq: 250, endFreq: 400, duration: 0.25 },   // Step 2: 左横斬り
  { startFreq: 300, endFreq: 600, duration: 0.28 },   // Step 3: 斬り上げ
  { startFreq: 500, endFreq: 250, duration: 0.18 },   // Step 4: 突き
  { startFreq: 200, endFreq: 200, duration: 0.4, midFreq: 500 }, // Step 5: 回転斬り
];

export function playLightsaberSwing(comboStep: number): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('lsSwing', 100)) return;

  const stepIndex = Math.max(0, Math.min(comboStep, SWING_PARAMS.length - 1));
  const params = SWING_PARAMS[stepIndex];
  const now = ctx.currentTime;

  // メインのウォーン音（ノコギリ波）
  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(params.startFreq, now);
  if (params.midFreq) {
    // Step 5: 往復スイープ
    osc1.frequency.exponentialRampToValueAtTime(params.midFreq, now + params.duration * 0.5);
    osc1.frequency.exponentialRampToValueAtTime(params.endFreq, now + params.duration);
  } else {
    osc1.frequency.exponentialRampToValueAtTime(params.endFreq, now + params.duration);
  }

  const filter1 = ctx.createBiquadFilter();
  filter1.type = 'lowpass';
  filter1.frequency.setValueAtTime(800, now);
  filter1.frequency.exponentialRampToValueAtTime(400, now + params.duration);
  filter1.Q.setValueAtTime(2, now);

  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(0.001, now);
  gain1.gain.linearRampToValueAtTime(0.3, now + 0.03);
  gain1.gain.setValueAtTime(0.3, now + params.duration * 0.6);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + params.duration);

  osc1.connect(filter1);
  filter1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + params.duration + 0.01);

  // ハム成分（三角波、低い音でレイヤー）
  const hum = ctx.createOscillator();
  hum.type = 'triangle';
  hum.frequency.setValueAtTime(params.startFreq * 0.5, now);
  hum.frequency.exponentialRampToValueAtTime(
    (params.midFreq ?? params.endFreq) * 0.5,
    now + params.duration,
  );

  const humGain = ctx.createGain();
  humGain.gain.setValueAtTime(0.15, now);
  humGain.gain.exponentialRampToValueAtTime(0.001, now + params.duration);

  hum.connect(humGain);
  humGain.connect(ctx.destination);
  hum.start(now);
  hum.stop(now + params.duration + 0.01);

  // 風切り音（ノイズ成分）
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(600 + stepIndex * 100, now);
  noiseFilter.Q.setValueAtTime(0.8, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.12, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + params.duration * 0.8);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + params.duration);
}

// ============================================
// 3. ヒット音
// ============================================

export function playLightsaberHit(): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('lsHit', 100)) return;

  const now = ctx.currentTime;

  // 低音パンチ（衝撃音）
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.4, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.12);

  // 高音のスパーク音
  const spark = ctx.createOscillator();
  spark.type = 'sine';
  spark.frequency.setValueAtTime(1000, now);
  spark.frequency.exponentialRampToValueAtTime(2000, now + 0.08);

  const sparkGain = ctx.createGain();
  sparkGain.gain.setValueAtTime(0.2, now);
  sparkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  spark.connect(sparkGain);
  sparkGain.connect(ctx.destination);
  spark.start(now);
  spark.stop(now + 0.1);

  // ノイズバースト（ジジッ）
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.setValueAtTime(2500, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.2, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.06);
}

// ============================================
// 4. アイドルハム（持続的な低いハム音）
// ============================================

export function playLightsaberHum(): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('lsHum', 800)) return;

  const now = ctx.currentTime;
  const duration = 0.9;

  // 基音（サイン波 120Hz）
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);

  // 微妙なビブラート
  const vibrato = ctx.createOscillator();
  vibrato.type = 'sine';
  vibrato.frequency.setValueAtTime(5, now);
  const vibratoGain = ctx.createGain();
  vibratoGain.gain.setValueAtTime(3, now);
  vibrato.connect(vibratoGain);
  vibratoGain.connect(osc.frequency);
  vibrato.start(now);
  vibrato.stop(now + duration);

  // 倍音（サイン波 240Hz、微量）
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(240, now);

  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.04, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now);
  osc2.stop(now + duration);

  // メイン音量エンベロープ（フェードイン→サステイン→フェードアウト）
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
  gain.gain.setValueAtTime(0.08, now + duration * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}
