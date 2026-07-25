import type {
  AudioBusId,
  AudioEngineSnapshot,
  AudioEnvironmentState,
  AudioListenerPose,
  AudioMixSettings,
  AudioVector3,
  DynamicRangeMode,
  SpatialAudioHandle,
  SpatialAudioOptions,
} from './types';

interface AudioBusGraph {
  input: GainNode;
  tone: BiquadFilterNode;
  duck: GainNode;
  reverbSend: GainNode;
}

const BUS_IDS: AudioBusId[] = [
  'music',
  'ambience',
  'world',
  'player',
  'ui',
  'creature',
  'voiceChat',
];

const DEFAULT_BUS_VOLUMES: Record<AudioBusId, number> = {
  music: 0.85,
  ambience: 0.82,
  world: 1,
  player: 1,
  ui: 0.9,
  creature: 1,
  voiceChat: 1,
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function setAudioParam(param: AudioParam, value: number, now: number, seconds = 0.08): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}

function setPosition(paramX: AudioParam, paramY: AudioParam, paramZ: AudioParam, value: AudioVector3): void {
  // リスナー更新は毎フレーム走るため、過去の automation event を蓄積しない。
  paramX.value = value.x;
  paramY.value = value.y;
  paramZ.value = value.z;
}

/**
 * ゲーム全体で共有する Web Audio グラフ。
 * AudioContext、音量、ダッキング、空間定位を一か所に集約する。
 */
class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private reverbGain: GainNode | null = null;
  private buses = new Map<AudioBusId, AudioBusGraph>();
  private busVolumes: Record<AudioBusId, number> = { ...DEFAULT_BUS_VOLUMES };
  private masterVolume = 1;
  private muted = false;
  private dynamicRange: DynamicRangeMode = 'standard';
  private spatialAudio = true;
  private presence = 1;
  private duckTokens = new Set<symbol>();
  private lifecycleBound = false;
  private environmentKey = '';

  getContext(): AudioContext | null {
    if (this.context && this.context.state !== 'closed') return this.context;
    if (typeof window === 'undefined') return null;

    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return null;

    try {
      this.context = new AudioContextClass({ latencyHint: 'interactive' });
      this.createGraph(this.context);
      this.bindLifecycle();
      return this.context;
    } catch {
      this.context = null;
      return null;
    }
  }

  async unlock(): Promise<boolean> {
    const context = this.getContext();
    if (!context) return false;
    if (context.state === 'suspended' || context.state === 'interrupted') {
      try {
        await context.resume();
      } catch {
        return false;
      }
    }
    return context.state === 'running';
  }

  getBusInput(bus: AudioBusId): AudioNode {
    const context = this.getContext();
    if (!context) throw new Error('AudioContext is not available');
    const graph = this.buses.get(bus);
    if (!graph) throw new Error(`Audio bus is not available: ${bus}`);
    return graph.input;
  }

  applyMix(settings: AudioMixSettings): void {
    this.masterVolume = clamp01(settings.masterVolume);
    this.muted = settings.muted;
    this.dynamicRange = settings.dynamicRange;
    this.spatialAudio = settings.spatialAudio;
    this.busVolumes.music = clamp01(settings.musicVolume);
    this.busVolumes.ambience = clamp01(settings.ambienceVolume);
    this.busVolumes.world = clamp01(settings.sfxVolume);
    this.busVolumes.player = clamp01(settings.sfxVolume);
    this.busVolumes.ui = clamp01(settings.sfxVolume * 0.9);
    this.busVolumes.creature = clamp01(settings.creatureVolume);
    this.busVolumes.voiceChat = clamp01(settings.voiceChatVolume);

    const context = this.context;
    if (!context) return;
    this.applyMasterGain(context.currentTime);
    this.applyDynamicRange();
    for (const bus of BUS_IDS) this.applyBusGain(bus, context.currentTime);
    this.applyDuckMix(context.currentTime);
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = clamp01(volume);
    if (this.context) this.applyMasterGain(this.context.currentTime);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.context) this.applyMasterGain(this.context.currentTime);
  }

  setBusVolume(bus: AudioBusId, volume: number): void {
    this.busVolumes[bus] = clamp01(volume);
    if (this.context) this.applyBusGain(bus, this.context.currentTime);
  }

  setDynamicRange(mode: DynamicRangeMode): void {
    this.dynamicRange = mode;
    this.applyDynamicRange();
  }

  setSpatialAudio(enabled: boolean): void {
    this.spatialAudio = enabled;
  }

  setPresence(presence: number): void {
    const context = this.context;
    this.presence = clamp01(presence);
    if (context) this.applyDuckMix(context.currentTime, 0.18);
  }

  beginDuck(): () => void {
    const token = Symbol('audio-duck');
    this.duckTokens.add(token);
    if (this.context) this.applyDuckMix(this.context.currentTime);
    return () => {
      if (!this.duckTokens.delete(token)) return;
      if (this.context) this.applyDuckMix(this.context.currentTime);
    };
  }

  updateListener(pose: AudioListenerPose): void {
    const context = this.context;
    if (!context) return;
    const listener = context.listener;
    setPosition(listener.positionX, listener.positionY, listener.positionZ, pose.position);
    listener.forwardX.value = pose.forward.x;
    listener.forwardY.value = pose.forward.y;
    listener.forwardZ.value = pose.forward.z;
    listener.upX.value = pose.up.x;
    listener.upY.value = pose.up.y;
    listener.upZ.value = pose.up.z;
  }

  setEnvironment(environment: AudioEnvironmentState): void {
    const context = this.context;
    if (!context) return;
    const key = `${environment.underwater}:${environment.underground}:${environment.dimension}`;
    if (key === this.environmentKey) return;
    this.environmentKey = key;

    const worldCutoff = environment.underwater ? 900 : environment.underground ? 6200 : 19000;
    const ambienceCutoff = environment.underwater ? 1150 : environment.underground ? 4800 : 17500;
    const now = context.currentTime;
    for (const [id, graph] of this.buses) {
      const cutoff = id === 'ambience'
        ? ambienceCutoff
        : id === 'world' || id === 'player' || id === 'creature'
          ? worldCutoff
          : 19000;
      setAudioParam(graph.tone.frequency, cutoff, now, 0.22);
      graph.tone.Q.setTargetAtTime(environment.underwater ? 0.9 : 0.35, now, 0.08);
      const send = id === 'world' || id === 'creature'
        ? environment.underground ? 0.34 : environment.dimension === 'nether' ? 0.2 : 0.035
        : id === 'ambience'
          ? environment.underground ? 0.18 : environment.dimension === 'nether' ? 0.12 : 0.025
          : 0;
      setAudioParam(graph.reverbSend.gain, send, now, 0.28);
    }
    if (this.reverbGain) {
      setAudioParam(this.reverbGain.gain, environment.underwater ? 0.16 : 0.3, now, 0.22);
    }
  }

  createSpatialOutput(bus: AudioBusId, options: SpatialAudioOptions): SpatialAudioHandle | null {
    const context = this.getContext();
    if (!context) return null;

    const input = context.createGain();
    const occlusionFilter = context.createBiquadFilter();
    occlusionFilter.type = 'lowpass';
    const occlusionGain = context.createGain();
    let panner: PannerNode | StereoPannerNode;

    if (this.spatialAudio) {
      const spatialPanner = context.createPanner();
      spatialPanner.panningModel = 'HRTF';
      spatialPanner.distanceModel = 'inverse';
      spatialPanner.refDistance = options.refDistance ?? 1.5;
      spatialPanner.maxDistance = options.maxDistance ?? 48;
      spatialPanner.rolloffFactor = options.rolloffFactor ?? 1.25;
      setPosition(spatialPanner.positionX, spatialPanner.positionY, spatialPanner.positionZ, options.position);
      panner = spatialPanner;
    } else {
      const stereoPanner = context.createStereoPanner();
      stereoPanner.pan.value = 0;
      panner = stereoPanner;
    }

    input.connect(occlusionFilter);
    occlusionFilter.connect(occlusionGain);
    occlusionGain.connect(panner);
    panner.connect(this.getBusInput(bus));

    const setOcclusion = (value: number): void => {
      const amount = clamp01(value);
      const now = context.currentTime;
      setAudioParam(occlusionFilter.frequency, 18000 - amount * 16500, now, 0.06);
      setAudioParam(occlusionGain.gain, 1 - amount * 0.58, now, 0.06);
    };
    setOcclusion(options.occlusion ?? 0);

    return {
      input,
      setPosition: (position) => {
        if (!('positionX' in panner)) return;
        setPosition(panner.positionX, panner.positionY, panner.positionZ, position);
      },
      setOcclusion,
      disconnect: () => {
        input.disconnect();
        occlusionFilter.disconnect();
        occlusionGain.disconnect();
        panner.disconnect();
      },
    };
  }

  getSnapshot(): AudioEngineSnapshot {
    return {
      state: this.context?.state ?? 'unavailable',
      activeDucks: this.duckTokens.size,
      muted: this.muted,
      dynamicRange: this.dynamicRange,
      spatialAudio: this.spatialAudio,
      busVolumes: { ...this.busVolumes },
    };
  }

  private createGraph(context: AudioContext): void {
    const masterInput = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const masterGain = context.createGain();
    const reverb = context.createConvolver();
    const reverbFilter = context.createBiquadFilter();
    const reverbGain = context.createGain();

    masterInput.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(context.destination);
    reverb.buffer = this.createImpulseResponse(context, 1.35, 2.6);
    reverbFilter.type = 'lowpass';
    reverbFilter.frequency.value = 6800;
    reverbGain.gain.value = 0.3;
    reverb.connect(reverbFilter);
    reverbFilter.connect(reverbGain);
    reverbGain.connect(masterInput);

    this.compressor = compressor;
    this.masterGain = masterGain;
    this.reverbGain = reverbGain;
    this.buses.clear();

    for (const id of BUS_IDS) {
      const input = context.createGain();
      const tone = context.createBiquadFilter();
      const duck = context.createGain();
      const reverbSend = context.createGain();
      tone.type = 'lowpass';
      tone.frequency.value = 19000;
      reverbSend.gain.value = 0;
      input.connect(tone);
      tone.connect(duck);
      duck.connect(reverbSend);
      reverbSend.connect(reverb);
      duck.connect(masterInput);
      this.buses.set(id, { input, tone, duck, reverbSend });
      this.applyBusGain(id, context.currentTime, 0);
    }

    this.applyMasterGain(context.currentTime, 0);
    this.applyDynamicRange();
    this.applyDuckMix(context.currentTime, 0);
  }

  private createImpulseResponse(context: AudioContext, seconds: number, decay: number): AudioBuffer {
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < length; index++) {
        const envelope = Math.pow(1 - index / length, decay);
        data[index] = (Math.random() * 2 - 1) * envelope;
      }
    }
    return buffer;
  }

  private applyMasterGain(now: number, seconds = 0.08): void {
    if (!this.masterGain) return;
    setAudioParam(this.masterGain.gain, this.muted ? 0 : this.masterVolume, now, seconds);
  }

  private applyBusGain(bus: AudioBusId, now: number, seconds = 0.08): void {
    const graph = this.buses.get(bus);
    if (!graph) return;
    setAudioParam(graph.input.gain, this.busVolumes[bus], now, seconds);
  }

  private applyDynamicRange(): void {
    if (!this.compressor) return;
    const values: Record<DynamicRangeMode, { threshold: number; knee: number; ratio: number; attack: number; release: number }> = {
      night: { threshold: -34, knee: 24, ratio: 8, attack: 0.004, release: 0.28 },
      standard: { threshold: -24, knee: 18, ratio: 4, attack: 0.006, release: 0.2 },
      wide: { threshold: -12, knee: 10, ratio: 2, attack: 0.012, release: 0.16 },
    };
    const value = values[this.dynamicRange];
    this.compressor.threshold.value = value.threshold;
    this.compressor.knee.value = value.knee;
    this.compressor.ratio.value = value.ratio;
    this.compressor.attack.value = value.attack;
    this.compressor.release.value = value.release;
  }

  private getDuckGain(bus: AudioBusId): number {
    const presence = bus === 'music' || bus === 'ambience' || bus === 'world' || bus === 'player' || bus === 'creature'
      ? this.presence
      : 1;
    if (this.duckTokens.size === 0) return presence;
    if (bus === 'music') return 0.38 * presence;
    if (bus === 'ambience') return 0.5 * presence;
    if (bus === 'world') return 0.72 * presence;
    if (bus === 'player') return 0.82 * presence;
    if (bus === 'creature') return 0.78 * presence;
    return presence;
  }

  private applyDuckMix(now: number, seconds = 0.14): void {
    for (const bus of BUS_IDS) {
      const graph = this.buses.get(bus);
      if (!graph) continue;
      setAudioParam(graph.duck.gain, this.getDuckGain(bus), now, seconds);
    }
  }

  private bindLifecycle(): void {
    if (this.lifecycleBound || typeof document === 'undefined') return;
    this.lifecycleBound = true;
    const resume = (): void => {
      if (document.visibilityState !== 'visible') return;
      void this.unlock();
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
  }
}

export const audioEngine = new AudioEngine();
