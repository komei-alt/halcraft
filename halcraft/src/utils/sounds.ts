// サウンドエンジン
// Web Audio API でプロシージャル生成する効果音ユーティリティ
// 外部音声ファイル不要 — コードで合成

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
