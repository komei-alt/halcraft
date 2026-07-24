import { audioEngine } from './AudioEngine';
import type { AudioBusId, AudioVector3 } from './types';

export type RecordedCueId =
  | 'footstep.grass'
  | 'footstep.snow'
  | 'footstep.wood'
  | 'footstep.stone'
  | 'footstep.soft'
  | 'impact.mining'
  | 'impact.wood'
  | 'impact.metal'
  | 'impact.glass'
  | 'impact.soft'
  | 'impact.punch'
  | 'ui.select'
  | 'ui.confirm'
  | 'ui.open'
  | 'ui.back'
  | 'ui.error'
  | 'ui.click'
  | 'scifi.explosion'
  | 'scifi.explosion.low'
  | 'scifi.laser'
  | 'scifi.impact'
  | 'scifi.thruster'
  | 'scifi.forcefield'
  | 'jingle.reward'
  | 'jingle.clear';

interface RecordedCueDefinition {
  bus: AudioBusId;
  folder: string;
  variants: string[];
  gain: number;
  cooldownMs: number;
  rateVariation?: number;
  spatial?: boolean;
  duck?: boolean;
  priority: number;
}

export interface RecordedCueOptions {
  position?: AudioVector3;
  occlusion?: number;
  gain?: number;
  playbackRate?: number;
  priority?: number;
}

interface ActiveVoice {
  source: AudioBufferSourceNode;
  priority: number;
  startedAt: number;
}

const sequence = (prefix: string, count: number, pad = 3): string[] => Array.from(
  { length: count },
  (_, index) => `${prefix}${String(index).padStart(pad, '0')}`,
);

const CUES: Record<RecordedCueId, RecordedCueDefinition> = {
  'footstep.grass': { bus: 'player', folder: 'footsteps', variants: sequence('footstep_grass_', 5), gain: 0.34, cooldownMs: 75, rateVariation: 0.045, priority: 2 },
  'footstep.snow': { bus: 'player', folder: 'footsteps', variants: sequence('footstep_snow_', 5), gain: 0.38, cooldownMs: 75, rateVariation: 0.04, priority: 2 },
  'footstep.wood': { bus: 'player', folder: 'footsteps', variants: sequence('footstep_wood_', 5), gain: 0.32, cooldownMs: 75, rateVariation: 0.04, priority: 2 },
  'footstep.stone': { bus: 'player', folder: 'footsteps', variants: sequence('footstep_concrete_', 5), gain: 0.28, cooldownMs: 75, rateVariation: 0.035, priority: 2 },
  'footstep.soft': { bus: 'player', folder: 'footsteps', variants: sequence('footstep_carpet_', 5), gain: 0.34, cooldownMs: 75, rateVariation: 0.055, priority: 2 },
  'impact.mining': { bus: 'world', folder: 'impacts', variants: sequence('impactMining_', 5), gain: 0.45, cooldownMs: 45, rateVariation: 0.05, spatial: true, priority: 4 },
  'impact.wood': { bus: 'world', folder: 'impacts', variants: sequence('impactWood_medium_', 5), gain: 0.42, cooldownMs: 45, rateVariation: 0.06, spatial: true, priority: 4 },
  'impact.metal': { bus: 'world', folder: 'impacts', variants: sequence('impactMetal_medium_', 5), gain: 0.34, cooldownMs: 45, rateVariation: 0.04, spatial: true, priority: 5 },
  'impact.glass': { bus: 'world', folder: 'impacts', variants: sequence('impactGlass_light_', 5), gain: 0.35, cooldownMs: 45, rateVariation: 0.035, spatial: true, priority: 5 },
  'impact.soft': { bus: 'world', folder: 'impacts', variants: sequence('impactSoft_medium_', 5), gain: 0.38, cooldownMs: 45, rateVariation: 0.05, spatial: true, priority: 3 },
  'impact.punch': { bus: 'world', folder: 'impacts', variants: sequence('impactPunch_medium_', 5), gain: 0.42, cooldownMs: 55, rateVariation: 0.045, spatial: true, priority: 5 },
  'ui.select': { bus: 'ui', folder: 'ui', variants: sequence('select_', 8), gain: 0.28, cooldownMs: 45, rateVariation: 0.025, priority: 7 },
  'ui.confirm': { bus: 'ui', folder: 'ui', variants: sequence('confirmation_', 4), gain: 0.32, cooldownMs: 90, rateVariation: 0.02, priority: 8 },
  'ui.open': { bus: 'ui', folder: 'ui', variants: sequence('open_', 4), gain: 0.3, cooldownMs: 100, priority: 7 },
  'ui.back': { bus: 'ui', folder: 'ui', variants: sequence('back_', 4), gain: 0.26, cooldownMs: 100, priority: 7 },
  'ui.error': { bus: 'ui', folder: 'ui', variants: sequence('error_', 8), gain: 0.3, cooldownMs: 180, priority: 9 },
  'ui.click': { bus: 'ui', folder: 'ui', variants: sequence('click_', 5), gain: 0.24, cooldownMs: 40, rateVariation: 0.03, priority: 6 },
  'scifi.explosion': { bus: 'world', folder: 'scifi', variants: sequence('explosionCrunch_', 5), gain: 0.62, cooldownMs: 90, rateVariation: 0.035, spatial: true, priority: 9 },
  'scifi.explosion.low': { bus: 'world', folder: 'scifi', variants: sequence('lowFrequency_explosion_', 2), gain: 0.58, cooldownMs: 120, rateVariation: 0.02, spatial: true, priority: 9 },
  'scifi.laser': { bus: 'world', folder: 'scifi', variants: sequence('laserLarge_', 5), gain: 0.32, cooldownMs: 50, rateVariation: 0.04, spatial: true, priority: 6 },
  'scifi.impact': { bus: 'world', folder: 'scifi', variants: sequence('impactMetal_', 5), gain: 0.36, cooldownMs: 45, rateVariation: 0.045, spatial: true, priority: 6 },
  'scifi.thruster': { bus: 'world', folder: 'scifi', variants: sequence('thrusterFire_', 5), gain: 0.3, cooldownMs: 95, rateVariation: 0.025, spatial: true, priority: 4 },
  'scifi.forcefield': { bus: 'world', folder: 'scifi', variants: sequence('forceField_', 5), gain: 0.3, cooldownMs: 120, rateVariation: 0.025, spatial: true, priority: 5 },
  'jingle.reward': { bus: 'ui', folder: 'jingles', variants: ['jingles_PIZZI00', 'jingles_PIZZI03', 'jingles_PIZZI05', 'jingles_PIZZI08', 'jingles_PIZZI12', 'jingles_PIZZI16'], gain: 0.34, cooldownMs: 500, duck: true, priority: 10 },
  'jingle.clear': { bus: 'ui', folder: 'jingles', variants: ['jingles_STEEL00', 'jingles_STEEL03', 'jingles_STEEL08', 'jingles_STEEL12', 'jingles_STEEL16'], gain: 0.38, cooldownMs: 1200, duck: true, priority: 10 },
};

const bufferCache = new Map<string, Promise<AudioBuffer>>();
const lastPlayedAt = new Map<RecordedCueId, number>();
const variantCursor = new Map<RecordedCueId, number>();
const activeVoices = new Set<ActiveVoice>();

function supportsOgg(): boolean {
  if (typeof document === 'undefined') return true;
  return document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"') !== '';
}

function getSourceUrl(definition: RecordedCueDefinition, variant: string): string {
  const extension = supportsOgg() ? 'ogg' : 'mp3';
  return `/audio/recorded/${definition.folder}/${variant}.${extension}`;
}

async function loadBuffer(url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) return cached;
  const promise = (async () => {
    const context = audioEngine.getContext();
    if (!context) throw new Error('AudioContext is not available');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Audio asset fetch failed: ${response.status} ${url}`);
    return context.decodeAudioData(await response.arrayBuffer());
  })();
  bufferCache.set(url, promise);
  promise.catch(() => bufferCache.delete(url));
  return promise;
}

function chooseVariant(id: RecordedCueId, definition: RecordedCueDefinition): string {
  const previous = variantCursor.get(id) ?? Math.floor(Math.random() * definition.variants.length);
  const step = definition.variants.length > 1
    ? 1 + Math.floor(Math.random() * (definition.variants.length - 1))
    : 0;
  const next = (previous + step) % definition.variants.length;
  variantCursor.set(id, next);
  return definition.variants[next];
}

function enforceVoiceLimit(priority: number): boolean {
  const isTouch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  const limit = isTouch ? 32 : 64;
  if (activeVoices.size < limit) return true;
  let candidate: ActiveVoice | null = null;
  for (const voice of activeVoices) {
    if (!candidate || voice.priority < candidate.priority || (voice.priority === candidate.priority && voice.startedAt < candidate.startedAt)) {
      candidate = voice;
    }
  }
  if (!candidate || candidate.priority > priority) return false;
  try {
    candidate.source.stop();
  } catch {
    // 終了済みなら後続の onended に任せる。
  }
  activeVoices.delete(candidate);
  return true;
}

export function playRecordedCue(id: RecordedCueId, options: RecordedCueOptions = {}): void {
  const definition = CUES[id];
  const nowMs = performance.now();
  const previousPlayedAt = lastPlayedAt.get(id);
  if (previousPlayedAt !== undefined && nowMs - previousPlayedAt < definition.cooldownMs) return;
  lastPlayedAt.set(id, nowMs);
  const requestedAt = nowMs;
  const variant = chooseVariant(id, definition);
  const url = getSourceUrl(definition, variant);

  void loadBuffer(url).then((buffer) => {
    // 未読込だった音が遅れて鳴り、操作とずれるのを防ぐ。
    if (performance.now() - requestedAt > 600) return;
    const context = audioEngine.getContext();
    if (!context) return;
    const priority = options.priority ?? definition.priority;
    if (!enforceVoiceLimit(priority)) return;

    const source = context.createBufferSource();
    const gain = context.createGain();
    const variation = definition.rateVariation ?? 0;
    source.buffer = buffer;
    source.playbackRate.value = Math.max(0.72, (options.playbackRate ?? 1) + (Math.random() * 2 - 1) * variation);
    gain.gain.value = definition.gain * (options.gain ?? 1);
    source.connect(gain);

    const spatial = definition.spatial && options.position
      ? audioEngine.createSpatialOutput(definition.bus, {
          position: options.position,
          occlusion: options.occlusion,
        })
      : null;
    if (spatial) gain.connect(spatial.input);
    else gain.connect(audioEngine.getBusInput(definition.bus));

    const releaseDuck = definition.duck ? audioEngine.beginDuck() : null;
    const voice: ActiveVoice = { source, priority, startedAt: context.currentTime };
    activeVoices.add(voice);
    source.onended = () => {
      activeVoices.delete(voice);
      source.disconnect();
      gain.disconnect();
      spatial?.disconnect();
      releaseDuck?.();
    };
    source.start();
  }).catch(() => {
    // 録音レイヤーが読めなくても手続き音をフォールバックとして残す。
  });
}

export async function preloadRecordedAudio(ids: readonly RecordedCueId[]): Promise<void> {
  await Promise.all(ids.flatMap((id) => {
    const definition = CUES[id];
    return definition.variants.map((variant) => loadBuffer(getSourceUrl(definition, variant)).catch(() => undefined));
  }));
}

export function preloadCoreRecordedAudio(): Promise<void> {
  return preloadRecordedAudio([
    'footstep.grass',
    'footstep.snow',
    'footstep.soft',
    'impact.mining',
    'impact.punch',
    'ui.select',
    'ui.confirm',
    'ui.error',
    'scifi.explosion',
    'jingle.reward',
    'jingle.clear',
  ]);
}

export function getRecordedAudioDiagnostics(): { cachedBuffers: number; activeVoices: number; cueCount: number } {
  return {
    cachedBuffers: bufferCache.size,
    activeVoices: activeVoices.size,
    cueCount: Object.keys(CUES).length,
  };
}

export const RECORDED_CUE_IDS = Object.freeze(Object.keys(CUES) as RecordedCueId[]);
