// 環境音（アンビエント）マネージャー
// プレイヤーの位置や状況に応じて環境音を再生する
// Web Audio API で手続き的に生成（外部ファイル不要）

let audioCtx: AudioContext | null = null;
let windNode: OscillatorNode | null = null;
let windGain: GainNode | null = null;
let waterGain: GainNode | null = null;
let waterNode: AudioBufferSourceNode | null = null;
let caveGain: GainNode | null = null;
let caveNode: OscillatorNode | null = null;
let masterGain: GainNode | null = null;
let isRunning = false;

const AMBIENT_VOLUME = 0.06;

/** 環境音システムの初期化 */
export function initAmbientSounds(): void {
  if (isRunning) return;

  audioCtx = new AudioContext();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = AMBIENT_VOLUME;
  masterGain.connect(audioCtx.destination);

  // --- 風音（フィルター付きホワイトノイズ） ---
  windGain = audioCtx.createGain();
  windGain.gain.value = 0;
  windGain.connect(masterGain);

  const windOsc = audioCtx.createOscillator();
  windOsc.type = 'sawtooth';
  windOsc.frequency.value = 200;
  const windFilter = audioCtx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 400;
  windFilter.Q.value = 1;
  windOsc.connect(windFilter);
  windFilter.connect(windGain);
  windOsc.start();
  windNode = windOsc;

  // 風のうねり（LFOでGainを揺らす）
  const windLfo = audioCtx.createOscillator();
  const windLfoGain = audioCtx.createGain();
  windLfo.type = 'sine';
  windLfo.frequency.value = 0.15;
  windLfoGain.gain.value = 0.3;
  windLfo.connect(windLfoGain);
  windLfoGain.connect(windGain.gain);
  windLfo.start();

  // --- 水音（ノイズバッファ + バンドパスフィルタ） ---
  waterGain = audioCtx.createGain();
  waterGain.gain.value = 0;
  waterGain.connect(masterGain);

  const waterBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
  const waterData = waterBuffer.getChannelData(0);
  for (let i = 0; i < waterData.length; i++) {
    waterData[i] = (Math.random() * 2 - 1) * 0.5;
  }
  const waterSource = audioCtx.createBufferSource();
  waterSource.buffer = waterBuffer;
  waterSource.loop = true;
  const waterFilter = audioCtx.createBiquadFilter();
  waterFilter.type = 'bandpass';
  waterFilter.frequency.value = 800;
  waterFilter.Q.value = 0.8;
  waterSource.connect(waterFilter);
  waterFilter.connect(waterGain);
  waterSource.start();
  waterNode = waterSource;

  // --- 洞窟音（低音ドローン） ---
  caveGain = audioCtx.createGain();
  caveGain.gain.value = 0;
  caveGain.connect(masterGain);

  const caveOsc = audioCtx.createOscillator();
  caveOsc.type = 'sine';
  caveOsc.frequency.value = 55;
  const caveFilter = audioCtx.createBiquadFilter();
  caveFilter.type = 'lowpass';
  caveFilter.frequency.value = 100;
  caveOsc.connect(caveFilter);
  caveFilter.connect(caveGain);
  caveOsc.start();
  caveNode = caveOsc;

  isRunning = true;
}

/**
 * 環境音の状態を更新（毎フレーム呼び出し）
 * @param isOutside 屋外にいるか
 * @param isUnderwater 水中にいるか
 * @param isUnderground 地下にいるか（y < 海面レベル）
 * @param playerY プレイヤーのY座標
 */
export function updateAmbientSounds(
  isOutside: boolean,
  isUnderwater: boolean,
  isUnderground: boolean,
  _playerY: number,
): void {
  if (!audioCtx || !windGain || !waterGain || !caveGain) return;

  const now = audioCtx.currentTime;
  const fadeTime = 1.5;

  // 風音: 屋外 + 地上
  const windTarget = isOutside && !isUnderwater && !isUnderground ? 0.5 : 0;
  windGain.gain.linearRampToValueAtTime(windTarget, now + fadeTime);

  // 水音: 水中
  const waterTarget = isUnderwater ? 0.8 : 0;
  waterGain.gain.linearRampToValueAtTime(waterTarget, now + fadeTime);

  // 洞窟音: 地下
  const caveTarget = isUnderground && !isUnderwater ? 0.4 : 0;
  caveGain.gain.linearRampToValueAtTime(caveTarget, now + fadeTime);
}

/** 環境音の停止 */
export function stopAmbientSounds(): void {
  if (!isRunning) return;
  isRunning = false;

  windNode?.stop();
  waterNode?.stop();
  caveNode?.stop();

  setTimeout(() => {
    audioCtx?.close();
    audioCtx = null;
    windNode = null;
    waterNode = null;
    caveNode = null;
    windGain = null;
    waterGain = null;
    caveGain = null;
    masterGain = null;
  }, 500);
}
