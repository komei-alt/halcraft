// サウンドエンジン
// Web Audio API でプロシージャル生成する効果音ユーティリティ
// 外部音声ファイル不要 — コードで合成

import type { BlockUseFeedbackSoundKind } from './blockUseFeedback';

/** AudioContext のシングルトン */
let audioCtx: AudioContext | null = null;

/** AudioContext を取得/初期化する */
function getAudioContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    audioCtx = new AudioContext();
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * ユーザーインタラクション時に AudioContext を初期化する
 * ブラウザの自動再生ポリシー対応
 */
export function initAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
}

// ============================================
// サウンド再生レート制限
// ============================================

/** 各サウンドの最終再生時間（ミリ秒） */
const lastPlayTime: Record<string, number> = {};

/** レート制限チェック */
function canPlay(key: string, minIntervalMs: number): boolean {
  const now = performance.now();
  const last = lastPlayTime[key] || 0;
  if (now - last < minIntervalMs) return false;
  lastPlayTime[key] = now;
  return true;
}

// ============================================
// ホワイトノイズバッファ（共有、遅延初期化）
// ============================================

let noiseBuffer: AudioBuffer | null = null;

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = ctx.sampleRate * 0.5; // 0.5秒分
  noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

// ============================================
// 1. 攻撃ヒット音
// ============================================

export function playHitSound(): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('hit', 100)) return;

  const now = ctx.currentTime;

  // 低音パンチ（短いサイン波）
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + 0.08);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.4, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);

  // ノイズバースト（インパクト感）
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.setValueAtTime(2000, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.25, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.06);
}

// ============================================
// 2. 被ダメージ音
// ============================================

export function playHurtSound(): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('hurt', 200)) return;

  const now = ctx.currentTime;

  // 低い不快なトーン
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.2);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(400, now);
  filter.frequency.exponentialRampToValueAtTime(100, now + 0.2);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.25);

  // パルス効果（ダメージ感を強調）
  const pulse = ctx.createOscillator();
  pulse.type = 'square';
  pulse.frequency.setValueAtTime(80, now);

  const pulseGain = ctx.createGain();
  pulseGain.gain.setValueAtTime(0.15, now);
  pulseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  pulse.connect(pulseGain);
  pulseGain.connect(ctx.destination);
  pulse.start(now);
  pulse.stop(now + 0.15);
}

// ============================================
// 3. 足音
// ============================================

export function playFootstep(): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('step', 280)) return;

  const now = ctx.currentTime;

  // フィルタードノイズの短バースト
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  // ランダムなバリエーション
  filter.frequency.setValueAtTime(800 + Math.random() * 400, now);
  filter.Q.setValueAtTime(2, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.05);

  // 低い衝撃音（地面の振動）
  const thud = ctx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(60 + Math.random() * 20, now);

  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.08, now);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  thud.connect(thudGain);
  thudGain.connect(ctx.destination);
  thud.start(now);
  thud.stop(now + 0.04);
}

// ============================================
// 4. 味方の動作音（メカニカルなハム）
// ============================================

export function playAllyMove(distance: number): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('ally', 800)) return;

  // 距離による音量減衰（最大距離15ブロック）
  const maxDist = 15;
  if (distance > maxDist) return;
  const volume = Math.max(0, 0.15 * (1 - distance / maxDist));

  const now = ctx.currentTime;

  // メカニカルなハム音
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(90 + Math.random() * 20, now);

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(6, now);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(10, now);
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  lfo.start(now);
  lfo.stop(now + 0.3);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(300, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.setValueAtTime(volume, now + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

// ============================================
// 5. ゾンビのうめき声
// ============================================

export function playZombieGrunt(distance: number): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('zombie', 2000)) return;

  // 距離による音量減衰（最大距離20ブロック）
  const maxDist = 20;
  if (distance > maxDist) return;
  const volume = Math.max(0, 0.3 * (1 - distance / maxDist));

  const now = ctx.currentTime;
  const duration = 0.4 + Math.random() * 0.3; // ランダムな長さ

  // 低い唸り声（デチューンしたノコギリ波）
  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  const baseFreq = 70 + Math.random() * 30;
  osc1.frequency.setValueAtTime(baseFreq, now);
  osc1.frequency.linearRampToValueAtTime(baseFreq * 0.7, now + duration);

  const osc2 = ctx.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.setValueAtTime(baseFreq * 1.02, now); // 微妙にデチューン
  osc2.frequency.linearRampToValueAtTime(baseFreq * 0.72, now + duration);

  // フィルターで籠った音に
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(250, now);
  filter.frequency.linearRampToValueAtTime(150, now + duration);
  filter.Q.setValueAtTime(3, now);

  // ビブラート（不安定さ）
  const vibrato = ctx.createOscillator();
  vibrato.type = 'sine';
  vibrato.frequency.setValueAtTime(4 + Math.random() * 3, now);
  const vibratoGain = ctx.createGain();
  vibratoGain.gain.setValueAtTime(8, now);
  vibrato.connect(vibratoGain);
  vibratoGain.connect(osc1.frequency);
  vibratoGain.connect(osc2.frequency);
  vibrato.start(now);
  vibrato.stop(now + duration);

  // 音量エンベロープ
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.05);
  gain.gain.setValueAtTime(volume, now + duration * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  // 接続
  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + duration);
  osc2.stop(now + duration);
}

// ============================================
// 6. モブ死亡音（撃破時の爽快な音）
// ============================================

export function playMobDeathSound(distance: number): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('mobDeath', 100)) return;

  // 距離による音量減衰
  const maxDist = 25;
  if (distance > maxDist) return;
  const volume = Math.max(0, 0.4 * (1 - distance / maxDist));

  const now = ctx.currentTime;

  // 低音爆発（破裂感）
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(volume, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);

  // 高音キラリ（撃破感）
  const sparkle = ctx.createOscillator();
  sparkle.type = 'sine';
  sparkle.frequency.setValueAtTime(800, now + 0.02);
  sparkle.frequency.exponentialRampToValueAtTime(1200, now + 0.12);

  const sparkleGain = ctx.createGain();
  sparkleGain.gain.setValueAtTime(volume * 0.3, now + 0.02);
  sparkleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  sparkle.connect(sparkleGain);
  sparkleGain.connect(ctx.destination);
  sparkle.start(now + 0.02);
  sparkle.stop(now + 0.15);

  // ノイズバースト（破片が飛び散る音）
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(1500, now);
  noiseFilter.Q.setValueAtTime(1, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.35, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.12);
}

// ============================================
// 7. ガトリングガン発射音
// ============================================

export function playMachineGunSound(distance: number): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('machinegun', 60)) return; // 早い連射のため制限を緩くする

  // 距離による音量減衰（最大距離50ブロック）
  const maxDist = 50;
  if (distance > maxDist) return;
  const volume = Math.max(0, 0.4 * (1 - distance / maxDist));

  const now = ctx.currentTime;

  // 重低音のパンチ（短いサイン波・徐々に下がる）
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + 0.1);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, now);
  filter.frequency.exponentialRampToValueAtTime(100, now + 0.1);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(volume * 0.7, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  osc.connect(filter);
  filter.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);

  // マズルフラッシュの破裂感（ノイズバースト）
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(1200, now);
  noiseFilter.Q.setValueAtTime(0.5, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.8, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.08);
}

// ============================================
// 8. 弾丸着弾音
// ============================================

export function playBulletImpactSound(distance: number, type: 'block' | 'mob'): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay(`impact_${type}`, 50)) return;

  const maxDist = 40;
  if (distance > maxDist) return;
  const volume = Math.max(0, 0.3 * (1 - distance / maxDist));

  const now = ctx.currentTime;

  if (type === 'block') {
    // 乾いた破砕音（高音ノイズ）
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(2000, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.1);
  } else {
    // モブ（少し水気のある衝撃音）
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(volume * 0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
    
    // 付帯ノイズ
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(1000, now);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.1);
  }
}

// ============================================
// 9. ロケットランチャー発射音
// ============================================

export function playRocketLaunchSound(distance: number): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('rocketLaunch', 120)) return;

  const maxDist = 50;
  if (distance > maxDist) return;
  const volume = Math.max(0, 0.55 * (1 - distance / maxDist));

  const now = ctx.currentTime;

  const thump = ctx.createOscillator();
  thump.type = 'triangle';
  thump.frequency.setValueAtTime(96, now);
  thump.frequency.exponentialRampToValueAtTime(36, now + 0.28);

  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(volume * 0.6, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

  thump.connect(thumpGain);
  thumpGain.connect(ctx.destination);
  thump.start(now);
  thump.stop(now + 0.32);

  const hiss = ctx.createBufferSource();
  hiss.buffer = getNoiseBuffer(ctx);

  const hissFilter = ctx.createBiquadFilter();
  hissFilter.type = 'bandpass';
  hissFilter.frequency.setValueAtTime(900, now);
  hissFilter.Q.setValueAtTime(0.8, now);

  const hissGain = ctx.createGain();
  hissGain.gain.setValueAtTime(volume * 0.42, now);
  hissGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

  hiss.connect(hissFilter);
  hissFilter.connect(hissGain);
  hissGain.connect(ctx.destination);
  hiss.start(now);
  hiss.stop(now + 0.24);
}

// ============================================
// 10. ロケット爆発音
// ============================================

export function playRocketExplosionSound(distance: number): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('rocketExplosion', 80)) return;

  const maxDist = 70;
  if (distance > maxDist) return;
  const volume = Math.max(0, 0.75 * (1 - distance / maxDist));

  const now = ctx.currentTime;

  const boom = ctx.createOscillator();
  boom.type = 'sawtooth';
  boom.frequency.setValueAtTime(72, now);
  boom.frequency.exponentialRampToValueAtTime(26, now + 0.5);

  const boomFilter = ctx.createBiquadFilter();
  boomFilter.type = 'lowpass';
  boomFilter.frequency.setValueAtTime(180, now);
  boomFilter.frequency.exponentialRampToValueAtTime(70, now + 0.45);

  const boomGain = ctx.createGain();
  boomGain.gain.setValueAtTime(volume * 0.75, now);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

  boom.connect(boomFilter);
  boomFilter.connect(boomGain);
  boomGain.connect(ctx.destination);
  boom.start(now);
  boom.stop(now + 0.55);

  const crack = ctx.createBufferSource();
  crack.buffer = getNoiseBuffer(ctx);

  const crackFilter = ctx.createBiquadFilter();
  crackFilter.type = 'highpass';
  crackFilter.frequency.setValueAtTime(900, now);

  const crackGain = ctx.createGain();
  crackGain.gain.setValueAtTime(volume * 0.45, now);
  crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  crack.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(ctx.destination);
  crack.start(now);
  crack.stop(now + 0.22);

  const tail = ctx.createBufferSource();
  tail.buffer = getNoiseBuffer(ctx);

  const tailFilter = ctx.createBiquadFilter();
  tailFilter.type = 'bandpass';
  tailFilter.frequency.setValueAtTime(140, now);
  tailFilter.Q.setValueAtTime(0.6, now);

  const tailGain = ctx.createGain();
  tailGain.gain.setValueAtTime(volume * 0.25, now + 0.05);
  tailGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

  tail.connect(tailFilter);
  tailFilter.connect(tailGain);
  tailGain.connect(ctx.destination);
  tail.start(now);
  tail.stop(now + 0.65);
}

// ============================================
// 11. ヘリコプターのローター音
// ============================================

export function playHelicopterRotor(distance: number): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('heliRotor', 70)) return; // 連続再生用

  const maxDist = 80; // 音が届く距離
  if (distance > maxDist) return;
  const volume = Math.max(0, 0.4 * (1 - distance / maxDist));

  const now = ctx.currentTime;

  // バタバタという低周波の音の成分
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(40, now); // 低いバタバタ音

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(120, now);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(volume * 0.5, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc.connect(filter);
  filter.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.12);

  // 風のノイズ成分
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(300, now);
  noiseFilter.Q.setValueAtTime(0.5, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.1, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.1);
}

// ============================================
// 12. 乗り物爆発音（超ド派手）
// ============================================

export function playVehicleExplosionSound(distance: number): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('vehicleExplosion', 200)) return;

  const maxDist = 100;
  if (distance > maxDist) return;
  const volume = Math.max(0, 1.0 * (1 - distance / maxDist));

  const now = ctx.currentTime;

  // 1. 超低音のメイン爆発（腹に響く重低音）
  const boom = ctx.createOscillator();
  boom.type = 'sawtooth';
  boom.frequency.setValueAtTime(50, now);
  boom.frequency.exponentialRampToValueAtTime(18, now + 0.8);

  const boomFilter = ctx.createBiquadFilter();
  boomFilter.type = 'lowpass';
  boomFilter.frequency.setValueAtTime(150, now);
  boomFilter.frequency.exponentialRampToValueAtTime(40, now + 0.7);

  const boomGain = ctx.createGain();
  boomGain.gain.setValueAtTime(volume * 0.9, now);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

  boom.connect(boomFilter);
  boomFilter.connect(boomGain);
  boomGain.connect(ctx.destination);
  boom.start(now);
  boom.stop(now + 0.9);

  // 2. 初期衝撃波（鋭いクラック）
  const crack = ctx.createBufferSource();
  crack.buffer = getNoiseBuffer(ctx);

  const crackFilter = ctx.createBiquadFilter();
  crackFilter.type = 'highpass';
  crackFilter.frequency.setValueAtTime(1200, now);

  const crackGain = ctx.createGain();
  crackGain.gain.setValueAtTime(volume * 0.7, now);
  crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  crack.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(ctx.destination);
  crack.start(now);
  crack.stop(now + 0.15);

  // 3. 金属片が飛び散る音（中音のノイズ、少し遅れて）
  const shrapnel = ctx.createBufferSource();
  shrapnel.buffer = getNoiseBuffer(ctx);

  const shrapnelFilter = ctx.createBiquadFilter();
  shrapnelFilter.type = 'bandpass';
  shrapnelFilter.frequency.setValueAtTime(2200, now + 0.05);
  shrapnelFilter.Q.setValueAtTime(1.5, now);

  const shrapnelGain = ctx.createGain();
  shrapnelGain.gain.setValueAtTime(0.001, now);
  shrapnelGain.gain.linearRampToValueAtTime(volume * 0.5, now + 0.08);
  shrapnelGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  shrapnel.connect(shrapnelFilter);
  shrapnelFilter.connect(shrapnelGain);
  shrapnelGain.connect(ctx.destination);
  shrapnel.start(now);
  shrapnel.stop(now + 0.4);

  // 4. 二次爆発（燃料誘爆、0.2秒遅れ）
  const secondary = ctx.createOscillator();
  secondary.type = 'square';
  secondary.frequency.setValueAtTime(70, now + 0.2);
  secondary.frequency.exponentialRampToValueAtTime(25, now + 0.65);

  const secFilter = ctx.createBiquadFilter();
  secFilter.type = 'lowpass';
  secFilter.frequency.setValueAtTime(200, now + 0.2);

  const secGain = ctx.createGain();
  secGain.gain.setValueAtTime(0.001, now);
  secGain.gain.linearRampToValueAtTime(volume * 0.55, now + 0.22);
  secGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

  secondary.connect(secFilter);
  secFilter.connect(secGain);
  secGain.connect(ctx.destination);
  secondary.start(now + 0.18);
  secondary.stop(now + 0.7);

  // 5. 余韻の轟音（長い残響）
  const rumble = ctx.createBufferSource();
  rumble.buffer = getNoiseBuffer(ctx);

  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'bandpass';
  rumbleFilter.frequency.setValueAtTime(80, now);
  rumbleFilter.Q.setValueAtTime(0.3, now);

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.setValueAtTime(volume * 0.2, now + 0.1);
  rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

  rumble.connect(rumbleFilter);
  rumbleFilter.connect(rumbleGain);
  rumbleGain.connect(ctx.destination);
  rumble.start(now);
  rumble.stop(now + 1.2);
}

// ============================================
// 13. 爆弾落下音（「ヒュー」という風切り音）
// ============================================

export function playBombFallingSound(distance: number): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('bombFalling', 200)) return;

  const maxDist = 60;
  if (distance > maxDist) return;
  const volume = Math.max(0, 0.45 * (1 - distance / maxDist));

  const now = ctx.currentTime;
  const duration = 1.8; // 長めの落下音

  // メインのピッチダウンするトーン（「ヒュー」の芯）
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1800, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.001, now);
  oscGain.gain.linearRampToValueAtTime(volume * 0.55, now + 0.08);
  oscGain.gain.setValueAtTime(volume * 0.55, now + duration * 0.6);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);

  // 倍音のレイヤー（厚みを出す）
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(2700, now);
  osc2.frequency.exponentialRampToValueAtTime(300, now + duration);

  const osc2Gain = ctx.createGain();
  osc2Gain.gain.setValueAtTime(0.001, now);
  osc2Gain.gain.linearRampToValueAtTime(volume * 0.2, now + 0.1);
  osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.85);

  osc2.connect(osc2Gain);
  osc2Gain.connect(ctx.destination);
  osc2.start(now);
  osc2.stop(now + duration);

  // 風切りノイズ（シャー感）
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(3000, now);
  noiseFilter.frequency.exponentialRampToValueAtTime(600, now + duration);
  noiseFilter.Q.setValueAtTime(1.2, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.001, now);
  noiseGain.gain.linearRampToValueAtTime(volume * 0.3, now + 0.15);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + duration);
}

// ============================================
// 14. TNT爆発音
// ============================================

export function playTntExplosionSound(distance: number): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('tntExplosion', 80)) return;

  const maxDist = 80;
  if (distance > maxDist) return;
  const volume = Math.max(0, 0.85 * (1 - distance / maxDist));

  const now = ctx.currentTime;

  // 1. 超低音の主爆発
  const boom = ctx.createOscillator();
  boom.type = 'sawtooth';
  boom.frequency.setValueAtTime(60, now);
  boom.frequency.exponentialRampToValueAtTime(20, now + 0.6);

  const boomFilter = ctx.createBiquadFilter();
  boomFilter.type = 'lowpass';
  boomFilter.frequency.setValueAtTime(160, now);
  boomFilter.frequency.exponentialRampToValueAtTime(50, now + 0.5);

  const boomGain = ctx.createGain();
  boomGain.gain.setValueAtTime(volume * 0.8, now);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

  boom.connect(boomFilter);
  boomFilter.connect(boomGain);
  boomGain.connect(ctx.destination);
  boom.start(now);
  boom.stop(now + 0.7);

  // 2. 初期衝撃波（鋭い破裂音）
  const crack = ctx.createBufferSource();
  crack.buffer = getNoiseBuffer(ctx);

  const crackFilter = ctx.createBiquadFilter();
  crackFilter.type = 'highpass';
  crackFilter.frequency.setValueAtTime(1000, now);

  const crackGain = ctx.createGain();
  crackGain.gain.setValueAtTime(volume * 0.6, now);
  crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  crack.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(ctx.destination);
  crack.start(now);
  crack.stop(now + 0.18);

  // 3. 破片の飛散ノイズ
  const debris = ctx.createBufferSource();
  debris.buffer = getNoiseBuffer(ctx);

  const debrisFilter = ctx.createBiquadFilter();
  debrisFilter.type = 'bandpass';
  debrisFilter.frequency.setValueAtTime(1800, now + 0.05);
  debrisFilter.Q.setValueAtTime(1.2, now);

  const debrisGain = ctx.createGain();
  debrisGain.gain.setValueAtTime(0.001, now);
  debrisGain.gain.linearRampToValueAtTime(volume * 0.4, now + 0.06);
  debrisGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  debris.connect(debrisFilter);
  debrisFilter.connect(debrisGain);
  debrisGain.connect(ctx.destination);
  debris.start(now);
  debris.stop(now + 0.35);

  // 4. 余韻の轟音
  const rumble = ctx.createBufferSource();
  rumble.buffer = getNoiseBuffer(ctx);

  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'bandpass';
  rumbleFilter.frequency.setValueAtTime(70, now);
  rumbleFilter.Q.setValueAtTime(0.3, now);

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.setValueAtTime(volume * 0.18, now + 0.08);
  rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

  rumble.connect(rumbleFilter);
  rumbleFilter.connect(rumbleGain);
  rumbleGain.connect(ctx.destination);
  rumble.start(now);
  rumble.stop(now + 0.9);
}

// ============================================
// 15. ブロック破壊音
// ============================================

export function playBlockBreakSound(): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('blockBreak', 60)) return;

  const now = ctx.currentTime;

  // クランチノイズ（短い破砕音）
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1200 + Math.random() * 600, now);
  filter.Q.setValueAtTime(1.5, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.08);

  // 低音パンチ
  const thud = ctx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(100 + Math.random() * 30, now);

  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.1, now);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

  thud.connect(thudGain);
  thudGain.connect(ctx.destination);
  thud.start(now);
  thud.stop(now + 0.06);
}

/** ブロック設置SE — 置いた手応えが残る短い低音 */
export function playBlockPlaceSound(): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('blockPlace', 55)) return;
  const now = ctx.currentTime;

  const thud = ctx.createOscillator();
  thud.type = 'triangle';
  thud.frequency.setValueAtTime(180 + Math.random() * 35, now);
  thud.frequency.exponentialRampToValueAtTime(95, now + 0.07);

  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.11, now);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

  thud.connect(thudGain);
  thudGain.connect(ctx.destination);
  thud.start(now);
  thud.stop(now + 0.09);

  const tick = ctx.createBufferSource();
  tick.buffer = getNoiseBuffer(ctx);

  const tickFilter = ctx.createBiquadFilter();
  tickFilter.type = 'bandpass';
  tickFilter.frequency.setValueAtTime(700 + Math.random() * 280, now);
  tickFilter.Q.setValueAtTime(1.2, now);

  const tickGain = ctx.createGain();
  tickGain.gain.setValueAtTime(0.06, now);
  tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

  tick.connect(tickFilter);
  tickFilter.connect(tickGain);
  tickGain.connect(ctx.destination);
  tick.start(now);
  tick.stop(now + 0.045);
}

/** 特殊ブロック使用SE — 置いたブロックの役割ごとに音色を変える */
export function playBlockUseFeedbackSound(kind: BlockUseFeedbackSoundKind): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay(`blockUse:${kind}`, kind === 'condition' ? 320 : 140)) return;
  const now = ctx.currentTime;

  const notes: Record<BlockUseFeedbackSoundKind, number[]> = {
    condition: [523.25, 659.25, 880],
    defense: [196, 293.66, 392],
    explosive: [110, 82.41, 55],
    light: [659.25, 880, 1318.51],
    liquid: [349.23, 261.63, 220],
    rail: [392, 493.88, 587.33],
    summon: [220, 440, 659.25],
    switch: [330, 660],
    utility: [440, 554.37],
  };

  const wave: OscillatorType = kind === 'explosive'
    ? 'sawtooth'
    : kind === 'defense' || kind === 'switch'
      ? 'square'
      : 'triangle';

  notes[kind].forEach((frequency, index) => {
    const t = now + index * 0.045;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(frequency, t);
    osc.frequency.exponentialRampToValueAtTime(frequency * (kind === 'explosive' ? 0.72 : 1.08), t + 0.14);

    const filter = ctx.createBiquadFilter();
    filter.type = kind === 'light' || kind === 'condition' ? 'lowpass' : 'bandpass';
    filter.frequency.setValueAtTime(kind === 'explosive' ? 360 : kind === 'liquid' ? 620 : 1400, t);
    filter.Q.setValueAtTime(kind === 'switch' ? 3.2 : 1.3, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(kind === 'explosive' ? 0.052 : 0.042, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  });

  if (kind !== 'explosive' && kind !== 'liquid' && kind !== 'defense') return;

  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = kind === 'liquid' ? 'lowpass' : 'highpass';
  noiseFilter.frequency.setValueAtTime(kind === 'liquid' ? 680 : 1800, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(kind === 'explosive' ? 0.045 : 0.025, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.16);
}

/** 素材不足SE — 置けないことを小さく知らせる */
export function playInventoryEmptySound(): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('inventoryEmpty', 180)) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.045, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.13);
}

/** ツール破壊SE — 金属が砕ける音 */
export function playToolBreakSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // 高音のガラス的な砕け音
  const crack = ctx.createOscillator();
  crack.type = 'sawtooth';
  crack.frequency.setValueAtTime(2000, now);
  crack.frequency.exponentialRampToValueAtTime(200, now + 0.15);

  const crackGain = ctx.createGain();
  crackGain.gain.setValueAtTime(0.15, now);
  crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  crack.connect(crackGain);
  crackGain.connect(ctx.destination);
  crack.start(now);
  crack.stop(now + 0.2);

  // 金属的な残響
  const ring = ctx.createOscillator();
  ring.type = 'sine';
  ring.frequency.setValueAtTime(800, now);
  ring.frequency.exponentialRampToValueAtTime(100, now + 0.4);

  const ringGain = ctx.createGain();
  ringGain.gain.setValueAtTime(0.08, now);
  ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  ring.connect(ringGain);
  ringGain.connect(ctx.destination);
  ring.start(now);
  ring.stop(now + 0.4);
}

/** ポーション飲用SE — ゴクゴクという液体音 */
export function playPotionDrinkSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // 3回の「ゴク」を連続再生
  for (let i = 0; i < 3; i++) {
    const t = now + i * 0.12;
    const gulp = ctx.createOscillator();
    gulp.type = 'sine';
    gulp.frequency.setValueAtTime(300 + i * 50, t);
    gulp.frequency.exponentialRampToValueAtTime(150, t + 0.08);

    const gulpGain = ctx.createGain();
    gulpGain.gain.setValueAtTime(0.12, t);
    gulpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    gulp.connect(gulpGain);
    gulpGain.connect(ctx.destination);
    gulp.start(t);
    gulp.stop(t + 0.1);
  }

  // シュワっという気泡音
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.03;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const hpf = ctx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = 4000;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.08, now + 0.3);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  noise.connect(hpf);
  hpf.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now + 0.3);
  noise.stop(now + 0.5);
}

/** エフェクト終了SE — パシュッという消滅音 */
export function playEffectExpireSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

/** XP獲得SE — キラリという短い高音 */
export function playXPGainSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(2000, now + 0.06);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.08);
}

type StageConditionSoundKind = 'resource' | 'regen' | 'rocket_ready';
type StageRewardSoundKind = 'build_supply' | 'war_supply' | 'recovery' | 'rocket_ready';
type StageEventSoundKind = 'forest' | 'tropical' | 'snow' | 'desert' | 'war' | 'rocket';
type StagePressureSoundKind = 'ambush' | 'humidity' | 'cold' | 'heat';
type StagePressureSoundSeverity = 'danger' | 'critical';

/** ステージ特性発動SE — 効果タイプごとに手触りを変える */
export function playStageConditionSound(kind: StageConditionSoundKind): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('stageCondition', 450)) return;
  const now = ctx.currentTime;
  const notes = kind === 'rocket_ready'
    ? [196, 392, 784]
    : kind === 'regen'
      ? [392, 523.25, 659.25]
      : [523.25, 783.99, 1046.5];
  const wave: OscillatorType = kind === 'rocket_ready'
    ? 'sawtooth'
    : kind === 'regen'
      ? 'sine'
      : 'triangle';

  for (let i = 0; i < notes.length; i++) {
    const t = now + i * 0.055;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(notes[i], t);
    osc.frequency.exponentialRampToValueAtTime(notes[i] * 1.08, t + 0.18);

    const filter = ctx.createBiquadFilter();
    filter.type = kind === 'rocket_ready' ? 'bandpass' : 'lowpass';
    filter.frequency.setValueAtTime(kind === 'rocket_ready' ? 900 : 2400, t);
    filter.Q.setValueAtTime(kind === 'rocket_ready' ? 2.4 : 0.7, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(kind === 'rocket_ready' ? 0.055 : 0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.28);
  }

  if (kind !== 'rocket_ready') return;

  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.setValueAtTime(1800, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.05, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.16);
}

/** チャレンジ報酬SE — 建築補給と戦闘補給で音色を分ける */
export function playStageRewardSound(kind: StageRewardSoundKind): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('stageReward', 420)) return;
  const now = ctx.currentTime;
  const notes = kind === 'rocket_ready'
    ? [164.81, 329.63, 659.25]
    : kind === 'recovery'
      ? [349.23, 440, 523.25]
      : kind === 'war_supply'
        ? [220, 330, 440]
        : [523.25, 659.25, 880];
  const wave: OscillatorType = kind === 'build_supply' ? 'triangle' : 'square';

  for (let i = 0; i < notes.length; i++) {
    const t = now + i * 0.045;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(notes[i], t);
    osc.frequency.exponentialRampToValueAtTime(notes[i] * 1.05, t + 0.16);

    const filter = ctx.createBiquadFilter();
    filter.type = kind === 'build_supply' ? 'lowpass' : 'bandpass';
    filter.frequency.setValueAtTime(kind === 'build_supply' ? 2600 : 880, t);
    filter.Q.setValueAtTime(kind === 'build_supply' ? 0.6 : 1.8, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(kind === 'war_supply' ? 0.045 : 0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  if (kind !== 'rocket_ready' && kind !== 'war_supply') return;

  const tick = ctx.createOscillator();
  tick.type = 'sawtooth';
  tick.frequency.setValueAtTime(kind === 'rocket_ready' ? 1180 : 720, now + 0.11);

  const tickGain = ctx.createGain();
  tickGain.gain.setValueAtTime(0.035, now + 0.11);
  tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  tick.connect(tickGain);
  tickGain.connect(ctx.destination);
  tick.start(now + 0.11);
  tick.stop(now + 0.22);
}

/** ボス出現SE — 決戦開始を画面外からでも気づける重い合図 */
export function playBossSpawnSound(): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('bossSpawn', 1800)) return;
  const now = ctx.currentTime;

  const rumble = ctx.createOscillator();
  rumble.type = 'sawtooth';
  rumble.frequency.setValueAtTime(58, now);
  rumble.frequency.exponentialRampToValueAtTime(34, now + 0.42);

  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.setValueAtTime(340, now);

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.setValueAtTime(0.16, now);
  rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  rumble.connect(rumbleFilter);
  rumbleFilter.connect(rumbleGain);
  rumbleGain.connect(ctx.destination);
  rumble.start(now);
  rumble.stop(now + 0.5);

  for (let i = 0; i < 3; i++) {
    const t = now + 0.06 + i * 0.105;
    const horn = ctx.createOscillator();
    horn.type = 'square';
    horn.frequency.setValueAtTime([196, 164.81, 130.81][i], t);

    const hornFilter = ctx.createBiquadFilter();
    hornFilter.type = 'bandpass';
    hornFilter.frequency.setValueAtTime(520, t);
    hornFilter.Q.setValueAtTime(1.5, t);

    const hornGain = ctx.createGain();
    hornGain.gain.setValueAtTime(0.055, t);
    hornGain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

    horn.connect(hornFilter);
    hornFilter.connect(hornGain);
    hornGain.connect(ctx.destination);
    horn.start(t);
    horn.stop(t + 0.24);
  }
}

/** ボス召喚SE — 取り巻きが増えた瞬間の短い警告 */
export function playBossSummonSound(distance: number): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('bossSummon', 950)) return;
  const maxDist = 48;
  if (distance > maxDist) return;
  const volume = Math.max(0.018, 0.09 * (1 - distance / maxDist));
  const now = ctx.currentTime;

  const pulse = ctx.createOscillator();
  pulse.type = 'triangle';
  pulse.frequency.setValueAtTime(420, now);
  pulse.frequency.exponentialRampToValueAtTime(180, now + 0.22);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(640, now);
  filter.Q.setValueAtTime(2.1, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

  pulse.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  pulse.start(now);
  pulse.stop(now + 0.26);

  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.setValueAtTime(1200, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.55, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.18);
}

/** ステージ環境プレッシャー警告SE — マップごとの消耗に気づける短い注意音 */
export function playStagePressureSound(
  kind: StagePressureSoundKind,
  severity: StagePressureSoundSeverity,
): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay(`stagePressure-${kind}`, severity === 'critical' ? 1600 : 2200)) return;
  const now = ctx.currentTime;
  const baseFrequency = kind === 'cold'
    ? 420
    : kind === 'heat'
      ? 190
      : kind === 'humidity'
        ? 260
        : 140;
  const highFrequency = severity === 'critical' ? baseFrequency * 2.6 : baseFrequency * 1.8;

  const osc = ctx.createOscillator();
  osc.type = kind === 'ambush' ? 'sawtooth' : 'triangle';
  osc.frequency.setValueAtTime(baseFrequency, now);
  osc.frequency.exponentialRampToValueAtTime(highFrequency, now + 0.18);

  const filter = ctx.createBiquadFilter();
  filter.type = kind === 'cold' ? 'highpass' : 'bandpass';
  filter.frequency.setValueAtTime(kind === 'cold' ? 520 : 720, now);
  filter.Q.setValueAtTime(severity === 'critical' ? 2.2 : 1.2, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(severity === 'critical' ? 0.07 : 0.045, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.28);

  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = kind === 'heat' ? 'lowpass' : 'highpass';
  noiseFilter.frequency.setValueAtTime(kind === 'heat' ? 520 : 1600, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(severity === 'critical' ? 0.045 : 0.025, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.22);
}

/** ステージ時間イベントSE — 補給やチャンスタイムの発生をマップ別に鳴らす */
export function playStageEventSound(kind: StageEventSoundKind): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('stageEvent', 650)) return;
  const now = ctx.currentTime;
  const notes = kind === 'rocket'
    ? [196, 392, 784]
    : kind === 'war'
      ? [220, 293.66, 440]
      : kind === 'snow'
        ? [659.25, 880, 1174.66]
        : kind === 'desert'
          ? [261.63, 392, 523.25]
          : kind === 'tropical'
            ? [523.25, 698.46, 880]
            : [392, 523.25, 783.99];
  const wave: OscillatorType = kind === 'rocket' || kind === 'war' ? 'sawtooth' : 'triangle';

  for (let i = 0; i < notes.length; i++) {
    const t = now + i * 0.052;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(notes[i], t);
    osc.frequency.exponentialRampToValueAtTime(notes[i] * 1.07, t + 0.2);

    const filter = ctx.createBiquadFilter();
    filter.type = kind === 'rocket' || kind === 'war' ? 'bandpass' : 'lowpass';
    filter.frequency.setValueAtTime(kind === 'rocket' ? 960 : 2200, t);
    filter.Q.setValueAtTime(kind === 'rocket' || kind === 'war' ? 1.8 : 0.7, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(kind === 'rocket' ? 0.062 : 0.055, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.28);
  }

  if (kind !== 'rocket' && kind !== 'war') return;

  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.setValueAtTime(kind === 'rocket' ? 1800 : 900, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(kind === 'rocket' ? 0.04 : 0.026, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.18);
}

/** レベルアップSE — 上昇する和音 */
export function playLevelUpSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  for (let i = 0; i < notes.length; i++) {
    const t = now + i * 0.08;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(notes[i], t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }
}

/** 熟練度特典強化SE — きらっと伸びる成功音 */
export function playPerkUnlockSound(): void {
  const ctx = getAudioContext();
  if (!ctx || !canPlay('perkUnlock', 250)) return;
  const now = ctx.currentTime;

  const notes = [659.25, 880, 1318.51]; // E5, A5, E6
  for (let i = 0; i < notes.length; i++) {
    const t = now + i * 0.055;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(notes[i], t);
    osc.frequency.exponentialRampToValueAtTime(notes[i] * 1.06, t + 0.18);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(420, t);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  const chime = ctx.createOscillator();
  chime.type = 'sine';
  chime.frequency.setValueAtTime(1760, now + 0.14);

  const chimeGain = ctx.createGain();
  chimeGain.gain.setValueAtTime(0.045, now + 0.14);
  chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

  chime.connect(chimeGain);
  chimeGain.connect(ctx.destination);
  chime.start(now + 0.14);
  chime.stop(now + 0.42);
}
