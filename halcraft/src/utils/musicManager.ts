// BGM（バックグラウンドミュージック）マネージャー
// Web Audio API で手続き的にアンビエントBGMを生成する
// Minecraft風の穏やかなピアノ + パッド音をランダムに生成

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let isPlaying = false;
let nextNoteTime = 0;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

/** BGMの音量（0-1） */
const BGM_VOLUME = 0.08;

/** ペンタトニックスケール（C, D, E, G, A）の周波数（2オクターブ） */
const PENTATONIC_NOTES = [
  261.63, 293.66, 329.63, 392.00, 440.00,  // C4-A4
  523.25, 587.33, 659.26, 783.99, 880.00,  // C5-A5
];

/** パッドコード（アンビエントな背景和音） */
const PAD_CHORDS = [
  [261.63, 329.63, 392.00], // C major
  [293.66, 369.99, 440.00], // D minor
  [220.00, 261.63, 329.63], // Am
  [246.94, 311.13, 392.00], // B diminished → G major
];

/** ピアノ風の単音を再生 */
function playNote(ctx: AudioContext, gain: GainNode, freq: number, startTime: number, duration: number): void {
  const osc = ctx.createOscillator();
  const noteGain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = freq;

  // エンベロープ: ゆるい立ち上がり + 長い減衰
  noteGain.gain.setValueAtTime(0, startTime);
  noteGain.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
  noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(noteGain);
  noteGain.connect(gain);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

/** パッド和音を再生 */
function playPad(ctx: AudioContext, gain: GainNode, chord: number[], startTime: number, duration: number): void {
  for (const freq of chord) {
    const osc = ctx.createOscillator();
    const noteGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = freq;

    noteGain.gain.setValueAtTime(0, startTime);
    noteGain.gain.linearRampToValueAtTime(0.06, startTime + 1);
    noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(noteGain);
    noteGain.connect(gain);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }
}

/** BGMスケジューラー（先読みでノートを予約） */
function scheduleBGM(): void {
  if (!audioCtx || !masterGain) return;

  const lookAhead = 0.5; // 500ms先読み

  while (nextNoteTime < audioCtx.currentTime + lookAhead) {
    // ランダムにメロディかパッドか決定
    const r = Math.random();

    if (r < 0.4) {
      // メロディノート
      const noteIdx = Math.floor(Math.random() * PENTATONIC_NOTES.length);
      const freq = PENTATONIC_NOTES[noteIdx];
      const duration = 1.5 + Math.random() * 3;
      playNote(audioCtx, masterGain, freq, nextNoteTime, duration);
      nextNoteTime += 0.8 + Math.random() * 2;
    } else if (r < 0.6) {
      // パッド和音
      const chordIdx = Math.floor(Math.random() * PAD_CHORDS.length);
      const duration = 4 + Math.random() * 4;
      playPad(audioCtx, masterGain, PAD_CHORDS[chordIdx], nextNoteTime, duration);
      nextNoteTime += 3 + Math.random() * 4;
    } else {
      // 無音（間を作る）
      nextNoteTime += 1 + Math.random() * 3;
    }
  }
}

/** BGM再生開始 */
export function startBGM(): void {
  if (isPlaying) return;

  audioCtx = new AudioContext();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = BGM_VOLUME;
  masterGain.connect(audioCtx.destination);

  nextNoteTime = audioCtx.currentTime + 2; // 2秒後から開始
  isPlaying = true;

  schedulerTimer = setInterval(scheduleBGM, 200);
}

/** BGM停止 */
export function stopBGM(): void {
  if (!isPlaying) return;
  isPlaying = false;

  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  if (masterGain) {
    masterGain.gain.linearRampToValueAtTime(0, audioCtx!.currentTime + 1);
  }

  setTimeout(() => {
    audioCtx?.close();
    audioCtx = null;
    masterGain = null;
  }, 1500);
}

/** BGM音量調整 */
export function setBGMVolume(vol: number): void {
  if (masterGain && audioCtx) {
    masterGain.gain.setValueAtTime(vol * BGM_VOLUME, audioCtx.currentTime);
  }
}
