export type AudioBusId =
  | 'music'
  | 'ambience'
  | 'world'
  | 'player'
  | 'ui'
  | 'creature'
  | 'voiceChat';

export type DynamicRangeMode = 'night' | 'standard' | 'wide';

export interface AudioVector3 {
  x: number;
  y: number;
  z: number;
}

export interface AudioListenerPose {
  position: AudioVector3;
  forward: AudioVector3;
  up: AudioVector3;
}

export interface AudioEnvironmentState {
  underwater: boolean;
  underground: boolean;
  dimension: 'overworld' | 'nether';
}

export interface AudioMixSettings {
  masterVolume: number;
  musicVolume: number;
  ambienceVolume: number;
  sfxVolume: number;
  creatureVolume: number;
  voiceChatVolume: number;
  muted: boolean;
  dynamicRange: DynamicRangeMode;
  spatialAudio: boolean;
}

export interface SpatialAudioOptions {
  position: AudioVector3;
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  occlusion?: number;
}

export interface SpatialAudioHandle {
  input: AudioNode;
  setPosition: (position: AudioVector3) => void;
  setOcclusion: (occlusion: number) => void;
  disconnect: () => void;
}

export interface AudioEngineSnapshot {
  state: AudioContextState | 'unavailable';
  activeDucks: number;
  muted: boolean;
  dynamicRange: DynamicRangeMode;
  spatialAudio: boolean;
  busVolumes: Record<AudioBusId, number>;
}
