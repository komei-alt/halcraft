import { BLOCK_IDS, type BlockId } from '../types/blocks';
import type { BiomeId } from '../types/stages';
import { playRecordedCue, type RecordedCueId } from './recordedAudio';

export type FootstepSurface =
  | 'grass'
  | 'dirt'
  | 'sand'
  | 'snow'
  | 'wood'
  | 'stone'
  | 'metal'
  | 'glass'
  | 'soft'
  | 'ice'
  | 'nether';

export type FootstepGait = 'walk' | 'run' | 'land';

interface FootstepProfile {
  primary: RecordedCueId;
  detail?: RecordedCueId;
  gain: number;
  playbackRate: number;
  detailGain?: number;
}

const SURFACE_PROFILES: Record<FootstepSurface, FootstepProfile> = {
  grass: { primary: 'footstep.grass', gain: 0.94, playbackRate: 1 },
  dirt: { primary: 'footstep.grass', detail: 'impact.soft', gain: 0.88, playbackRate: 0.92, detailGain: 0.08 },
  sand: { primary: 'footstep.soft', detail: 'impact.soft', gain: 0.9, playbackRate: 0.86, detailGain: 0.1 },
  snow: { primary: 'footstep.snow', gain: 1, playbackRate: 0.96 },
  wood: { primary: 'footstep.wood', detail: 'impact.wood', gain: 0.9, playbackRate: 1, detailGain: 0.1 },
  stone: { primary: 'footstep.stone', gain: 0.9, playbackRate: 1 },
  metal: { primary: 'footstep.stone', detail: 'impact.metal', gain: 0.72, playbackRate: 1.06, detailGain: 0.16 },
  glass: { primary: 'footstep.stone', detail: 'impact.glass', gain: 0.58, playbackRate: 1.14, detailGain: 0.14 },
  soft: { primary: 'footstep.soft', gain: 0.9, playbackRate: 0.98 },
  ice: { primary: 'footstep.snow', detail: 'impact.glass', gain: 0.76, playbackRate: 1.12, detailGain: 0.08 },
  nether: { primary: 'footstep.stone', detail: 'impact.soft', gain: 0.86, playbackRate: 0.86, detailGain: 0.09 },
};

const fallbackByBiome: Record<BiomeId, FootstepSurface> = {
  forest: 'grass',
  tropical: 'dirt',
  snow: 'snow',
  desert: 'sand',
};

export function resolveFootstepSurface(blockId: BlockId, biome: BiomeId = 'forest'): FootstepSurface {
  switch (blockId) {
    case BLOCK_IDS.GRASS:
    case BLOCK_IDS.LEAVES:
    case BLOCK_IDS.TALL_GRASS:
    case BLOCK_IDS.WILDFLOWER:
    case BLOCK_IDS.BUSH:
    case BLOCK_IDS.REED:
    case BLOCK_IDS.FROST_GRASS:
      return 'grass';
    case BLOCK_IDS.DIRT:
    case BLOCK_IDS.FARMLAND:
      return 'dirt';
    case BLOCK_IDS.SAND:
    case BLOCK_IDS.SOUL_SAND:
    case BLOCK_IDS.DEAD_BUSH:
      return 'sand';
    case BLOCK_IDS.SNOW:
      return 'snow';
    case BLOCK_IDS.ICE:
      return 'ice';
    case BLOCK_IDS.WOOD:
    case BLOCK_IDS.RAW_WOOD:
    case BLOCK_IDS.STAIRS:
    case BLOCK_IDS.DOOR:
    case BLOCK_IDS.LADDER:
    case BLOCK_IDS.CHEST:
      return 'wood';
    case BLOCK_IDS.IRON:
    case BLOCK_IDS.IRON_CRACKED:
    case BLOCK_IDS.IRON_MOSSY:
    case BLOCK_IDS.ELECTRIC:
    case BLOCK_IDS.SPAWNER:
    case BLOCK_IDS.TURRET:
    case BLOCK_IDS.CORE:
    case BLOCK_IDS.RAIL:
    case BLOCK_IDS.RAIL_SLOPE:
    case BLOCK_IDS.RAIL_BOOSTER:
    case BLOCK_IDS.RAIL_LOOP:
    case BLOCK_IDS.RAIL_CHAIN:
      return 'metal';
    case BLOCK_IDS.GLASS:
    case BLOCK_IDS.ENCHANT:
      return 'glass';
    case BLOCK_IDS.BED:
    case BLOCK_IDS.MUSHROOM:
      return 'soft';
    case BLOCK_IDS.NETHERRACK:
    case BLOCK_IDS.GLOWSTONE:
    case BLOCK_IDS.NETHER_FUNGUS:
      return 'nether';
    case BLOCK_IDS.AIR:
    case BLOCK_IDS.WATER:
    case BLOCK_IDS.LAVA:
      return fallbackByBiome[biome];
    default:
      return 'stone';
  }
}

export function playSurfaceFootstep(
  surface: FootstepSurface,
  gait: FootstepGait,
  intensity = 1,
): void {
  const profile = SURFACE_PROFILES[surface];
  const gaitGain = gait === 'run' ? 1.1 : gait === 'land' ? 1.28 : 0.92;
  const gaitRate = gait === 'run' ? 1.035 : gait === 'land' ? 0.9 : 1;
  const safeIntensity = Math.min(1.35, Math.max(0.62, intensity));
  playRecordedCue(profile.primary, {
    bus: 'player',
    gain: profile.gain * gaitGain * safeIntensity,
    playbackRate: profile.playbackRate * gaitRate,
    priority: gait === 'land' ? 6 : 3,
  });

  if (profile.detail && (gait === 'land' || surface === 'metal' || surface === 'glass' || surface === 'ice')) {
    playRecordedCue(profile.detail, {
      bus: 'player',
      gain: (profile.detailGain ?? 0.1) * (gait === 'land' ? 1.7 : 1) * safeIntensity,
      playbackRate: profile.playbackRate * gaitRate,
      priority: gait === 'land' ? 6 : 3,
    });
  }
}

export const FOOTSTEP_SURFACES = Object.freeze(Object.keys(SURFACE_PROFILES) as FootstepSurface[]);
