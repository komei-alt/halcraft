import type { BiomeId } from '../types/stages';
import { audioEngine } from './AudioEngine';

export type AmbientBedKey =
  | 'forest.day'
  | 'forest.night'
  | 'tropical.day'
  | 'tropical.night'
  | 'snow.day'
  | 'snow.night'
  | 'desert.day'
  | 'desert.night'
  | 'cave'
  | 'underwater'
  | 'nether.day'
  | 'nether.night';

export interface AmbientBedState {
  biome: BiomeId;
  isNight: boolean;
  isUnderground: boolean;
  isUnderwater: boolean;
  dimension: 'overworld' | 'nether';
}

interface AmbientBedManifest {
  schemaVersion: 1;
  language: 'none';
  beds: Partial<Record<AmbientBedKey, readonly string[]>>;
}

interface ActiveBed {
  key: AmbientBedKey;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const EMPTY_MANIFEST: AmbientBedManifest = { schemaVersion: 1, language: 'none', beds: {} };
const manifestFilePattern = /^[a-z0-9][a-z0-9_/-]*$/;
const bufferCache = new Map<string, Promise<AudioBuffer>>();
const decodedBuffers = new Map<string, AudioBuffer>();
const variantCursor = new Map<AmbientBedKey, number>();
let manifest: AmbientBedManifest | null = null;
let manifestPromise: Promise<AmbientBedManifest> | null = null;
let desiredKey: AmbientBedKey | null = null;
let activeBed: ActiveBed | null = null;
let requestedPresence = 1;
let appliedPresence = -1;
let transitionToken = 0;

function supportsOgg(): boolean {
  if (typeof document === 'undefined') return true;
  return document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"') !== '';
}

function getBedUrl(stem: string): string {
  return `/audio/ambience/${stem}.${supportsOgg() ? 'ogg' : 'mp3'}`;
}

function isManifest(value: unknown): value is AmbientBedManifest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1 || candidate.language !== 'none') return false;
  if (!candidate.beds || typeof candidate.beds !== 'object') return false;
  return Object.values(candidate.beds as Record<string, unknown>).every((variants) => (
    Array.isArray(variants)
    && variants.every((variant) => typeof variant === 'string' && manifestFilePattern.test(variant))
  ));
}

async function loadManifest(): Promise<AmbientBedManifest> {
  if (manifest) return manifest;
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch('/audio/ambience/manifest.json')
    .then((response) => {
      if (!response.ok) throw new Error('ambient manifest unavailable');
      return response.json() as Promise<unknown>;
    })
    .then((value) => isManifest(value) ? value : EMPTY_MANIFEST)
    .catch(() => EMPTY_MANIFEST)
    .then((value) => {
      manifest = value;
      return value;
    });
  return manifestPromise;
}

async function loadBuffer(url: string): Promise<AudioBuffer> {
  const decoded = decodedBuffers.get(url);
  if (decoded) return decoded;
  const pending = bufferCache.get(url);
  if (pending) return pending;
  const promise = (async () => {
    const context = audioEngine.getContext();
    if (!context) throw new Error('AudioContext is not available');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`ambient asset unavailable: ${url}`);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    decodedBuffers.set(url, buffer);
    return buffer;
  })();
  bufferCache.set(url, promise);
  promise.finally(() => bufferCache.delete(url)).catch(() => undefined);
  return promise;
}

function chooseVariant(key: AmbientBedKey, variants: readonly string[]): string {
  const previous = variantCursor.get(key) ?? Math.floor(Math.random() * variants.length);
  const next = variants.length > 1
    ? (previous + 1 + Math.floor(Math.random() * (variants.length - 1))) % variants.length
    : 0;
  variantCursor.set(key, next);
  return variants[next];
}

function fadeOutBed(bed: ActiveBed, context: AudioContext, seconds = 1.8): void {
  const now = context.currentTime;
  bed.gain.gain.cancelScheduledValues(now);
  bed.gain.gain.setValueAtTime(bed.gain.gain.value, now);
  bed.gain.gain.linearRampToValueAtTime(0, now + seconds);
  try { bed.source.stop(now + seconds + 0.05); } catch { /* 終了済み */ }
  bed.source.onended = () => {
    bed.source.disconnect();
    bed.gain.disconnect();
  };
}

async function transitionTo(key: AmbientBedKey): Promise<void> {
  const token = ++transitionToken;
  const loadedManifest = await loadManifest();
  if (token !== transitionToken || desiredKey !== key) return;
  const variants = loadedManifest.beds[key] ?? [];
  if (variants.length === 0) {
    const context = audioEngine.getContext();
    if (activeBed && context) fadeOutBed(activeBed, context, 1.1);
    activeBed = null;
    return;
  }

  const url = getBedUrl(chooseVariant(key, variants));
  const buffer = await loadBuffer(url).catch(() => null);
  if (!buffer || token !== transitionToken || desiredKey !== key) return;
  const context = audioEngine.getContext();
  if (!context) return;
  const previous = activeBed;
  const source = context.createBufferSource();
  const gain = context.createGain();
  const now = context.currentTime;
  source.buffer = buffer;
  source.loop = true;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.22 * requestedPresence, now + 1.8);
  source.connect(gain);
  gain.connect(audioEngine.getBusInput('ambience'));
  source.start();
  activeBed = { key, source, gain };
  appliedPresence = requestedPresence;
  if (previous) fadeOutBed(previous, context);
}

function applyPresence(): void {
  if (!activeBed || Math.abs(appliedPresence - requestedPresence) < 0.004) return;
  const context = audioEngine.getContext();
  if (!context) return;
  const now = context.currentTime;
  activeBed.gain.gain.cancelScheduledValues(now);
  activeBed.gain.gain.setValueAtTime(activeBed.gain.gain.value, now);
  activeBed.gain.gain.setTargetAtTime(0.22 * requestedPresence, now, 0.28);
  appliedPresence = requestedPresence;
}

export function resolveAmbientBedKey(state: AmbientBedState): AmbientBedKey {
  if (state.isUnderwater) return 'underwater';
  if (state.isUnderground) return 'cave';
  if (state.dimension === 'nether') return state.isNight ? 'nether.night' : 'nether.day';
  return `${state.biome}.${state.isNight ? 'night' : 'day'}` as AmbientBedKey;
}

export function updateRecordedAmbientBed(state: AmbientBedState, presence = 1): void {
  requestedPresence = Math.max(0, Math.min(1.2, presence));
  const key = resolveAmbientBedKey(state);
  applyPresence();
  if (desiredKey === key) return;
  desiredKey = key;
  void transitionTo(key);
}

export async function preloadAmbientBeds(): Promise<void> {
  await loadManifest();
}

export function setRecordedAmbientPresence(presence: number): void {
  requestedPresence = Math.max(0, Math.min(1, presence));
  applyPresence();
}

export function stopRecordedAmbientBed(): void {
  transitionToken += 1;
  desiredKey = null;
  if (activeBed) {
    const context = audioEngine.getContext();
    if (context) fadeOutBed(activeBed, context, 0.18);
  }
  activeBed = null;
  appliedPresence = -1;
}

export function getRecordedAmbientDiagnostics(): {
  activeKey: AmbientBedKey | null;
  desiredKey: AmbientBedKey | null;
  cachedBuffers: number;
  availableBeds: number;
} {
  return {
    activeKey: activeBed?.key ?? null,
    desiredKey,
    cachedBuffers: decodedBuffers.size,
    availableBeds: manifest ? Object.values(manifest.beds).filter((variants) => (variants?.length ?? 0) > 0).length : 0,
  };
}
