// 適応型 BGM マネージャー
// 録音済みの探索・森林・戦闘・ボス曲を、ゲーム状態に合わせて途切れなくクロスフェードする。

import { audioEngine } from '../audio/AudioEngine';
import type { StageCategory } from '../types/stages';

export type BGMTrackId = 'exploration' | 'forest' | 'battle' | 'boss';

export interface BGMScene {
  biome?: string | null;
  category?: StageCategory | null;
  dimension?: 'overworld' | 'nether';
  isNight?: boolean;
  combatIntensity?: number;
  bossActive?: boolean;
}

interface BGMTrackDefinition {
  title: string;
  level: number;
}

interface BGMDeck {
  element: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  trackId: BGMTrackId | null;
}

const TRACKS: Record<BGMTrackId, BGMTrackDefinition> = {
  exploration: { title: 'Fairy Adventure', level: 0.92 },
  forest: { title: 'Iremos Forest', level: 0.96 },
  battle: { title: 'Determined Pursuit', level: 0.78 },
  boss: { title: 'Battle RPG Theme', level: 0.78 },
};

const BGM_OUTPUT_GAIN = 0.46;
const CROSSFADE_SECONDS = 2.4;
const MIN_TRACK_DWELL_MS = 6500;
const COMBAT_RELEASE_MS = 9000;
const FADE_CURVE_POINTS = 64;

let audioCtx: AudioContext | null = null;
let outputGain: GainNode | null = null;
let decks: [BGMDeck, BGMDeck] | null = null;
let activeDeckIndex = -1;
let currentTrack: BGMTrackId | null = null;
let desiredTrack: BGMTrackId = 'exploration';
let isPlaying = false;
let transitionSerial = 0;
let lastTransitionAt = 0;
let combatHoldUntil = 0;
let deferredTransitionTimer: ReturnType<typeof setTimeout> | null = null;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function supportsOgg(): boolean {
  if (typeof document === 'undefined') return true;
  return document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"') !== '';
}

function getTrackUrl(trackId: BGMTrackId): string {
  return `/audio/music/${trackId}.${supportsOgg() ? 'ogg' : 'mp3'}`;
}

function createDeck(context: AudioContext, destination: AudioNode): BGMDeck {
  const element = new Audio();
  element.preload = 'auto';
  element.loop = true;
  element.crossOrigin = 'anonymous';

  const source = context.createMediaElementSource(element);
  const gain = context.createGain();
  gain.gain.value = 0;
  source.connect(gain);
  gain.connect(destination);
  return { element, source, gain, trackId: null };
}

function ensureGraph(): boolean {
  if (audioCtx && outputGain && decks) return true;
  if (typeof window === 'undefined') return false;
  const context = audioEngine.getContext();
  if (!context) return false;

  const nextOutput = context.createGain();
  nextOutput.gain.value = BGM_OUTPUT_GAIN;
  nextOutput.connect(audioEngine.getBusInput('music'));

  audioCtx = context;
  outputGain = nextOutput;
  decks = [createDeck(context, nextOutput), createDeck(context, nextOutput)];
  return true;
}

function makeFadeCurve(fadeIn: boolean, level: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(FADE_CURVE_POINTS);
  for (let index = 0; index < curve.length; index++) {
    const progress = index / (curve.length - 1);
    const gain = fadeIn
      ? Math.sin(progress * Math.PI * 0.5)
      : Math.cos(progress * Math.PI * 0.5);
    curve[index] = gain * level;
  }
  return curve;
}

function scheduleFade(param: AudioParam, fadeIn: boolean, level: number, now: number, seconds: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.setValueCurveAtTime(makeFadeCurve(fadeIn, level), now, seconds);
}

async function crossfadeTo(trackId: BGMTrackId): Promise<void> {
  if (!isPlaying || !ensureGraph() || !audioCtx || !decks) return;
  if (currentTrack === trackId && activeDeckIndex >= 0) return;

  const serial = ++transitionSerial;
  const nextIndex = activeDeckIndex === 0 ? 1 : 0;
  const incoming = decks[nextIndex];
  const outgoing = activeDeckIndex >= 0 ? decks[activeDeckIndex] : null;

  incoming.element.pause();
  if (incoming.trackId !== trackId) {
    incoming.element.src = getTrackUrl(trackId);
    incoming.element.load();
    incoming.trackId = trackId;
  }
  try {
    incoming.element.currentTime = 0;
  } catch {
    // メタデータ読込前は currentTime の変更が拒否されるブラウザがある。
  }

  await audioEngine.unlock();
  try {
    await incoming.element.play();
  } catch {
    // 自動再生制限時は次のユーザー操作または scene 更新で再試行する。
    if (serial === transitionSerial) incoming.gain.gain.value = 0;
    return;
  }

  if (!isPlaying || serial !== transitionSerial || !audioCtx) {
    incoming.element.pause();
    return;
  }

  const now = audioCtx.currentTime;
  const seconds = outgoing ? CROSSFADE_SECONDS : 1.15;
  const incomingLevel = TRACKS[trackId].level;
  incoming.gain.gain.cancelScheduledValues(now);
  incoming.gain.gain.setValueAtTime(0, now);
  scheduleFade(incoming.gain.gain, true, incomingLevel, now, seconds);
  if (outgoing) scheduleFade(outgoing.gain.gain, false, outgoing.gain.gain.value, now, seconds);

  activeDeckIndex = nextIndex;
  currentTrack = trackId;
  lastTransitionAt = performance.now();

  if (outgoing) {
    const outgoingElement = outgoing.element;
    window.setTimeout(() => {
      if (activeDeckIndex === nextIndex) outgoingElement.pause();
    }, seconds * 1000 + 120);
  }
}

function requestTrack(trackId: BGMTrackId, urgent = false): void {
  desiredTrack = trackId;
  if (!isPlaying || currentTrack === trackId) return;
  if (deferredTransitionTimer) {
    clearTimeout(deferredTransitionTimer);
    deferredTransitionTimer = null;
  }

  const elapsed = performance.now() - lastTransitionAt;
  if (!urgent && currentTrack && elapsed < MIN_TRACK_DWELL_MS) {
    deferredTransitionTimer = setTimeout(() => {
      deferredTransitionTimer = null;
      if (isPlaying && desiredTrack !== currentTrack) void crossfadeTo(desiredTrack);
    }, MIN_TRACK_DWELL_MS - elapsed);
    return;
  }
  void crossfadeTo(trackId);
}

/** 純粋関数としてテストできる、シーンから曲への割当。 */
export function resolveBGMTrack(scene: BGMScene, combatHeld = false): BGMTrackId {
  if (scene.bossActive) return 'boss';
  const combatIntensity = clamp01(scene.combatIntensity ?? 0);
  if (scene.dimension === 'nether' || combatIntensity >= 0.14 || combatHeld) return 'battle';
  if (scene.category === 'build' && scene.biome === 'forest') return 'forest';
  if (scene.category === 'war' && scene.isNight) return 'battle';
  return 'exploration';
}

/** 敵数・ボス・バイオームなどの変化に応じて次の曲を選ぶ。 */
export function updateBGMScene(scene: BGMScene): void {
  const now = performance.now();
  if ((scene.combatIntensity ?? 0) >= 0.14 || scene.bossActive) {
    combatHoldUntil = now + COMBAT_RELEASE_MS;
  }
  const nextTrack = resolveBGMTrack(scene, now < combatHoldUntil && !scene.bossActive);
  requestTrack(nextTrack, nextTrack === 'boss');
}

/** BGM 再生開始。初回は現在選択済みのシーン曲をフェードインする。 */
export function startBGM(): void {
  if (isPlaying) return;
  if (!ensureGraph()) return;
  isPlaying = true;
  void crossfadeTo(desiredTrack);
}

/** BGM 停止。AudioContext はゲーム全体で共有するため閉じない。 */
export function stopBGM(): void {
  if (!isPlaying) return;
  isPlaying = false;
  transitionSerial++;
  if (deferredTransitionTimer) {
    clearTimeout(deferredTransitionTimer);
    deferredTransitionTimer = null;
  }
  if (!audioCtx || !decks) return;

  const now = audioCtx.currentTime;
  // 直後に再開されても、停止中の同一トラック判定で無音のままにならないよう先に解除する。
  currentTrack = null;
  for (const deck of decks) {
    deck.gain.gain.cancelScheduledValues(now);
    deck.gain.gain.setValueAtTime(deck.gain.gain.value, now);
    deck.gain.gain.linearRampToValueAtTime(0, now + 0.55);
  }
  window.setTimeout(() => {
    if (isPlaying || !decks) return;
    for (const deck of decks) deck.element.pause();
    activeDeckIndex = -1;
    currentTrack = null;
  }, 680);
}

/** BGM 音量調整（0-1）。最終的な音量は共有ミキサーで管理する。 */
export function setBGMVolume(volume: number): void {
  audioEngine.setBusVolume('music', clamp01(volume));
}

/** 後方互換 API。ポーズ等の存在感は共有ミキサーへ一本化する。 */
export function setBGMPresence(presence: number): void {
  audioEngine.setPresence(clamp01(presence));
}

/** 開発用 Audio Lab から任意の曲を即座に確認する。 */
export function previewBGMTrack(trackId: BGMTrackId): void {
  desiredTrack = trackId;
  if (!isPlaying) {
    startBGM();
    return;
  }
  requestTrack(trackId, true);
}

export function getBGMState(): {
  playing: boolean;
  currentTrack: BGMTrackId | null;
  desiredTrack: BGMTrackId;
  title: string | null;
} {
  return {
    playing: isPlaying,
    currentTrack,
    desiredTrack,
    title: currentTrack ? TRACKS[currentTrack].title : null,
  };
}
