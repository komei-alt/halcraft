import type { MobType } from '../stores/useMobStore';
import { audioEngine } from './AudioEngine';
import { playRecordedCue } from './recordedAudio';
import type { AudioVector3, SpatialAudioHandle } from './types';

export type CreatureSoundEvent =
  | 'idle'
  | 'alert'
  | 'attack'
  | 'hurt'
  | 'death'
  | 'spawn'
  | 'special';

export type CreatureCueId = `${MobType}.${CreatureSoundEvent}`;

export interface CreatureCueOptions {
  position: AudioVector3;
  /** 同じ個体・イベントの連打を抑制するためのモブID。 */
  entityId?: string;
  occlusion?: number;
  gain?: number;
  priority?: number;
}

interface CreatureVoiceProfile {
  waveform: OscillatorType;
  baseFrequency: number;
  filterFrequency: number;
  filterQ: number;
  noiseAmount: number;
  vibratoRate: number;
  vibratoDepth: number;
  gain: number;
  maxDistance: number;
}

interface EventProfile {
  frequencyScale: number;
  endFrequencyScale: number;
  duration: number;
  gainScale: number;
  noiseScale: number;
  priority: number;
  cooldownMs: number;
}

interface CreatureRecordingManifest {
  schemaVersion: 1;
  language: 'none';
  cues: Partial<Record<CreatureCueId, readonly string[]>>;
}

interface ActiveCreatureVoice {
  priority: number;
  startedAt: number;
  stop: () => void;
}

const CREATURE_EVENTS_BY_MOB: Record<MobType, readonly CreatureSoundEvent[]> = {
  zombie: ['idle', 'alert', 'attack', 'hurt', 'death', 'spawn'],
  spider: ['idle', 'alert', 'attack', 'hurt', 'death', 'spawn'],
  darwin: ['idle', 'alert', 'attack', 'hurt', 'death', 'spawn'],
  chicken: ['idle', 'alert', 'hurt', 'death', 'spawn'],
  prototype: ['idle', 'attack', 'hurt', 'death', 'spawn', 'special'],
  iron_golem: ['idle', 'attack', 'hurt', 'death', 'spawn', 'special'],
  boss_giant: ['idle', 'alert', 'attack', 'hurt', 'death', 'spawn', 'special'],
};

const VOICE_PROFILES: Record<MobType, CreatureVoiceProfile> = {
  zombie: {
    waveform: 'sawtooth', baseFrequency: 76, filterFrequency: 310, filterQ: 2.8,
    noiseAmount: 0.17, vibratoRate: 4.4, vibratoDepth: 8, gain: 0.17, maxDistance: 24,
  },
  spider: {
    waveform: 'square', baseFrequency: 138, filterFrequency: 1750, filterQ: 5.2,
    noiseAmount: 0.28, vibratoRate: 15, vibratoDepth: 22, gain: 0.105, maxDistance: 18,
  },
  darwin: {
    waveform: 'triangle', baseFrequency: 116, filterFrequency: 720, filterQ: 3.4,
    noiseAmount: 0.2, vibratoRate: 7.2, vibratoDepth: 13, gain: 0.15, maxDistance: 26,
  },
  chicken: {
    waveform: 'triangle', baseFrequency: 510, filterFrequency: 2600, filterQ: 4.5,
    noiseAmount: 0.08, vibratoRate: 18, vibratoDepth: 32, gain: 0.09, maxDistance: 15,
  },
  prototype: {
    waveform: 'triangle', baseFrequency: 188, filterFrequency: 1450, filterQ: 4,
    noiseAmount: 0.1, vibratoRate: 9, vibratoDepth: 15, gain: 0.12, maxDistance: 28,
  },
  iron_golem: {
    waveform: 'sine', baseFrequency: 58, filterFrequency: 430, filterQ: 3.2,
    noiseAmount: 0.22, vibratoRate: 2.8, vibratoDepth: 4, gain: 0.19, maxDistance: 32,
  },
  boss_giant: {
    waveform: 'sawtooth', baseFrequency: 44, filterFrequency: 250, filterQ: 3.8,
    noiseAmount: 0.3, vibratoRate: 3.2, vibratoDepth: 6, gain: 0.24, maxDistance: 48,
  },
};

const EVENT_PROFILES: Record<CreatureSoundEvent, EventProfile> = {
  idle: { frequencyScale: 1, endFrequencyScale: 0.8, duration: 0.62, gainScale: 0.72, noiseScale: 0.8, priority: 2, cooldownMs: 2200 },
  alert: { frequencyScale: 1.22, endFrequencyScale: 0.72, duration: 0.78, gainScale: 1, noiseScale: 1.1, priority: 6, cooldownMs: 1400 },
  attack: { frequencyScale: 1.32, endFrequencyScale: 0.62, duration: 0.42, gainScale: 1.08, noiseScale: 1.2, priority: 7, cooldownMs: 260 },
  hurt: { frequencyScale: 1.55, endFrequencyScale: 0.72, duration: 0.3, gainScale: 0.94, noiseScale: 1.35, priority: 8, cooldownMs: 180 },
  death: { frequencyScale: 1.05, endFrequencyScale: 0.28, duration: 1.08, gainScale: 1.16, noiseScale: 1.4, priority: 10, cooldownMs: 900 },
  spawn: { frequencyScale: 0.82, endFrequencyScale: 1.18, duration: 0.72, gainScale: 0.8, noiseScale: 0.8, priority: 5, cooldownMs: 1200 },
  special: { frequencyScale: 0.72, endFrequencyScale: 1.42, duration: 1.16, gainScale: 1.14, noiseScale: 1.15, priority: 9, cooldownMs: 1800 },
};

const EMPTY_MANIFEST: CreatureRecordingManifest = {
  schemaVersion: 1,
  language: 'none',
  cues: {},
};

const manifestPath = '/audio/creatures/manifest.json';
const manifestFilePattern = /^[a-z0-9][a-z0-9_/-]*$/;
const lastPlayedAt = new Map<string, number>();
const variantCursor = new Map<CreatureCueId, number>();
const activeVoices = new Set<ActiveCreatureVoice>();
const decodedBuffers = new Map<string, AudioBuffer>();
const pendingBuffers = new Map<string, Promise<AudioBuffer>>();
const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();
let manifest: CreatureRecordingManifest | null = null;
let manifestPromise: Promise<CreatureRecordingManifest> | null = null;

function supportsOgg(): boolean {
  if (typeof document === 'undefined') return true;
  return document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"') !== '';
}

function getCreatureUrl(stem: string): string {
  return `/audio/creatures/${stem}.${supportsOgg() ? 'ogg' : 'mp3'}`;
}

function isManifest(value: unknown): value is CreatureRecordingManifest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1 || candidate.language !== 'none') return false;
  if (!candidate.cues || typeof candidate.cues !== 'object') return false;
  return Object.values(candidate.cues as Record<string, unknown>).every((variants) => (
    Array.isArray(variants)
    && variants.every((variant) => typeof variant === 'string' && manifestFilePattern.test(variant))
  ));
}

async function loadManifest(): Promise<CreatureRecordingManifest> {
  if (manifest) return manifest;
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch(manifestPath)
    .then((response) => {
      if (!response.ok) throw new Error('creature manifest unavailable');
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
  const pending = pendingBuffers.get(url);
  if (pending) return pending;
  const promise = (async () => {
    const context = audioEngine.getContext();
    if (!context) throw new Error('AudioContext is not available');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`creature asset unavailable: ${url}`);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    decodedBuffers.set(url, buffer);
    return buffer;
  })();
  pendingBuffers.set(url, promise);
  promise.finally(() => pendingBuffers.delete(url)).catch(() => undefined);
  return promise;
}

function chooseVariant(id: CreatureCueId, variants: readonly string[]): string {
  const previous = variantCursor.get(id) ?? Math.floor(Math.random() * variants.length);
  const step = variants.length > 1 ? 1 + Math.floor(Math.random() * (variants.length - 1)) : 0;
  const next = (previous + step) % variants.length;
  variantCursor.set(id, next);
  return variants[next];
}

function getVoiceLimit(): number {
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 ? 10 : 18;
}

function reserveVoice(priority: number): boolean {
  if (activeVoices.size < getVoiceLimit()) return true;
  let candidate: ActiveCreatureVoice | null = null;
  for (const voice of activeVoices) {
    if (!candidate || voice.priority < candidate.priority || (
      voice.priority === candidate.priority && voice.startedAt < candidate.startedAt
    )) candidate = voice;
  }
  if (!candidate || candidate.priority > priority) return false;
  candidate.stop();
  return true;
}

function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const cached = noiseBuffers.get(context);
  if (cached) return cached;
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 1.5), context.sampleRate);
  const data = buffer.getChannelData(0);
  let previous = 0;
  for (let index = 0; index < data.length; index++) {
    const white = Math.random() * 2 - 1;
    previous = previous * 0.87 + white * 0.13;
    data[index] = white * 0.58 + previous * 0.42;
  }
  noiseBuffers.set(context, buffer);
  return buffer;
}

function connectSpatialOutput(
  position: AudioVector3,
  occlusion: number | undefined,
  maxDistance: number,
): SpatialAudioHandle | null {
  return audioEngine.createSpatialOutput('creature', {
    position,
    occlusion,
    refDistance: 2,
    maxDistance,
    rolloffFactor: 1.18,
  });
}

function playRecordedBuffer(
  buffer: AudioBuffer,
  profile: CreatureVoiceProfile,
  event: EventProfile,
  options: CreatureCueOptions,
): boolean {
  const context = audioEngine.getContext();
  if (!context || !reserveVoice(options.priority ?? event.priority)) return false;
  const source = context.createBufferSource();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const spatial = connectSpatialOutput(options.position, options.occlusion, profile.maxDistance);
  const now = context.currentTime;
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(18000, profile.filterFrequency * 4.2);
  gain.gain.value = profile.gain * event.gainScale * (options.gain ?? 1) * 1.75;
  source.buffer = buffer;
  source.playbackRate.value = 0.965 + Math.random() * 0.07;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(spatial?.input ?? audioEngine.getBusInput('creature'));
  let cleaned = false;
  const voice: ActiveCreatureVoice = {
    priority: options.priority ?? event.priority,
    startedAt: now,
    stop: () => {
      try { source.stop(); } catch { /* 終了済み */ }
    },
  };
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    activeVoices.delete(voice);
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
    spatial?.disconnect();
  };
  source.onended = cleanup;
  activeVoices.add(voice);
  source.start();
  return true;
}

function playProceduralCreature(
  mobType: MobType,
  eventName: CreatureSoundEvent,
  options: CreatureCueOptions,
): boolean {
  const context = audioEngine.getContext();
  if (!context) return false;
  const profile = VOICE_PROFILES[mobType];
  const event = EVENT_PROFILES[eventName];
  const priority = options.priority ?? event.priority;
  if (!reserveVoice(priority)) return false;

  const now = context.currentTime;
  const durationJitter = 0.88 + Math.random() * 0.24;
  const duration = event.duration * durationJitter * (mobType === 'chicken' ? 0.68 : 1);
  const pitchJitter = 0.93 + Math.random() * 0.14;
  const baseFrequency = profile.baseFrequency * event.frequencyScale * pitchJitter;
  const endFrequency = profile.baseFrequency * event.endFrequencyScale * pitchJitter;
  const masterGain = context.createGain();
  const filter = context.createBiquadFilter();
  const spatial = connectSpatialOutput(options.position, options.occlusion, profile.maxDistance);
  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [masterGain, filter];

  filter.type = mobType === 'spider' || mobType === 'chicken' ? 'bandpass' : 'lowpass';
  filter.frequency.setValueAtTime(profile.filterFrequency * (0.9 + Math.random() * 0.2), now);
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(120, profile.filterFrequency * (eventName === 'death' ? 0.44 : 0.78)),
    now + duration,
  );
  filter.Q.value = profile.filterQ;
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.exponentialRampToValueAtTime(
    Math.max(0.0002, profile.gain * event.gainScale * (options.gain ?? 1)),
    now + Math.min(0.055, duration * 0.18),
  );
  masterGain.gain.setValueAtTime(
    Math.max(0.0002, profile.gain * event.gainScale * (options.gain ?? 1) * 0.84),
    now + duration * 0.62,
  );
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  filter.connect(masterGain);
  masterGain.connect(spatial?.input ?? audioEngine.getBusInput('creature'));

  const vibrato = context.createOscillator();
  const vibratoGain = context.createGain();
  vibrato.type = 'sine';
  vibrato.frequency.value = profile.vibratoRate * (0.88 + Math.random() * 0.24);
  vibratoGain.gain.value = profile.vibratoDepth * (eventName === 'hurt' ? 1.35 : 1);
  vibrato.connect(vibratoGain);
  nodes.push(vibratoGain);
  sources.push(vibrato);

  for (const detune of [-9, 8]) {
    const oscillator = context.createOscillator();
    oscillator.type = profile.waveform;
    oscillator.detune.value = detune + (Math.random() * 4 - 2);
    oscillator.frequency.setValueAtTime(baseFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, endFrequency), now + duration);
    vibratoGain.connect(oscillator.frequency);
    oscillator.connect(filter);
    sources.push(oscillator);
  }

  const noise = context.createBufferSource();
  const noiseFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.buffer = createNoiseBuffer(context);
  noiseFilter.type = mobType === 'spider' ? 'highpass' : 'bandpass';
  noiseFilter.frequency.value = mobType === 'spider' ? 1800 : Math.max(170, profile.filterFrequency * 0.72);
  noiseFilter.Q.value = mobType === 'spider' ? 2.8 : 0.9;
  noiseGain.gain.setValueAtTime(profile.noiseAmount * event.noiseScale, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(filter);
  nodes.push(noiseFilter, noiseGain);
  sources.push(noise);

  let cleaned = false;
  const voice: ActiveCreatureVoice = {
    priority,
    startedAt: now,
    stop: () => {
      for (const source of sources) {
        try { source.stop(); } catch { /* 終了済み */ }
      }
    },
  };
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    activeVoices.delete(voice);
    for (const source of sources) source.disconnect();
    for (const node of nodes) node.disconnect();
    spatial?.disconnect();
  };
  sources[1].onended = cleanup;
  activeVoices.add(voice);
  for (const source of sources) {
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  // 既存のCC0録音から短い材質トランジェントだけを重ね、収録音到着前も手触りを保つ。
  if (eventName === 'attack' || eventName === 'hurt' || eventName === 'death') {
    const transient = mobType === 'prototype' || mobType === 'iron_golem'
      ? 'impact.metal'
      : mobType === 'spider' || mobType === 'chicken'
        ? 'impact.soft'
        : 'impact.punch';
    playRecordedCue(transient, {
      bus: 'creature',
      position: options.position,
      occlusion: options.occlusion,
      gain: eventName === 'death' ? 0.32 : 0.18,
      playbackRate: mobType === 'boss_giant' ? 0.78 : mobType === 'chicken' ? 1.34 : 1,
      priority,
    });
  }
  return true;
}

export function isCreatureCueSupported(mobType: MobType, event: CreatureSoundEvent): boolean {
  return CREATURE_EVENTS_BY_MOB[mobType].includes(event);
}

export function playCreatureCue(
  mobType: MobType,
  eventName: CreatureSoundEvent,
  options: CreatureCueOptions,
): boolean {
  if (!isCreatureCueSupported(mobType, eventName)) return false;
  const event = EVENT_PROFILES[eventName];
  const cooldownKey = `${options.entityId ?? mobType}:${eventName}`;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const previous = lastPlayedAt.get(cooldownKey);
  if (previous !== undefined && nowMs - previous < event.cooldownMs) return false;
  lastPlayedAt.set(cooldownKey, nowMs);

  const cueId = `${mobType}.${eventName}` as CreatureCueId;
  const variants = manifest?.cues[cueId] ?? [];
  if (variants.length > 0) {
    const url = getCreatureUrl(chooseVariant(cueId, variants));
    const buffer = decodedBuffers.get(url);
    if (buffer) return playRecordedBuffer(buffer, VOICE_PROFILES[mobType], event, options);
    void loadBuffer(url).catch(() => undefined);
  } else if (manifest === null) {
    void loadManifest();
  }
  return playProceduralCreature(mobType, eventName, options);
}

export async function preloadCreatureAudio(): Promise<void> {
  const loadedManifest = await loadManifest();
  const urls = Object.values(loadedManifest.cues)
    .flatMap((variants) => variants?.slice(0, 1) ?? [])
    .map(getCreatureUrl);
  await Promise.all(urls.map((url) => loadBuffer(url).catch(() => undefined)));
}

export function getCreatureAudioDiagnostics(): {
  activeVoices: number;
  cachedBuffers: number;
  cueCount: number;
  recordedCueCount: number;
} {
  return {
    activeVoices: activeVoices.size,
    cachedBuffers: decodedBuffers.size,
    cueCount: CREATURE_CUE_IDS.length,
    recordedCueCount: manifest ? Object.values(manifest.cues).filter((variants) => (variants?.length ?? 0) > 0).length : 0,
  };
}

export const CREATURE_CUE_IDS = Object.freeze(
  (Object.entries(CREATURE_EVENTS_BY_MOB) as Array<[MobType, readonly CreatureSoundEvent[]]>)
    .flatMap(([mobType, events]) => events.map((event) => `${mobType}.${event}` as CreatureCueId)),
);

export { CREATURE_EVENTS_BY_MOB };
