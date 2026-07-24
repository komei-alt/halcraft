import { BLOCK_DEFS, BLOCK_IDS } from '../types/blocks';

export type BlockAudioMaterial = 'stone' | 'wood' | 'metal' | 'glass' | 'soft';

const WOOD_BLOCKS = new Set<number>([
  BLOCK_IDS.WOOD,
  BLOCK_IDS.RAW_WOOD,
  BLOCK_IDS.STAIRS,
  BLOCK_IDS.BED,
  BLOCK_IDS.LEAVES,
  BLOCK_IDS.CHEST,
  BLOCK_IDS.DOOR,
  BLOCK_IDS.LADDER,
  BLOCK_IDS.CAMPFIRE,
  BLOCK_IDS.CANDLE,
  BLOCK_IDS.STICK,
]);

const METAL_BLOCKS = new Set<number>([
  BLOCK_IDS.IRON,
  BLOCK_IDS.IRON_CRACKED,
  BLOCK_IDS.IRON_MOSSY,
  BLOCK_IDS.ELECTRIC,
  BLOCK_IDS.SPAWNER,
  BLOCK_IDS.TURRET,
  BLOCK_IDS.CORE,
  BLOCK_IDS.RAIL,
  BLOCK_IDS.RAIL_SLOPE,
  BLOCK_IDS.RAIL_BOOSTER,
  BLOCK_IDS.RAIL_LOOP,
  BLOCK_IDS.RAIL_CHAIN,
  BLOCK_IDS.FURNACE,
  BLOCK_IDS.IRON_INGOT,
  BLOCK_IDS.GOLD_INGOT,
]);

const GLASS_BLOCKS = new Set<number>([
  BLOCK_IDS.GLASS,
  BLOCK_IDS.ENCHANT,
  BLOCK_IDS.GLOWSTONE,
  BLOCK_IDS.NETHER_PORTAL,
]);

const SOFT_BLOCKS = new Set<number>([
  BLOCK_IDS.GRASS,
  BLOCK_IDS.DIRT,
  BLOCK_IDS.SNOW,
  BLOCK_IDS.SAND,
  BLOCK_IDS.WHEAT_SEEDS,
  BLOCK_IDS.FARMLAND,
  BLOCK_IDS.SOUL_SAND,
]);

export function getBlockAudioMaterial(blockId: number): BlockAudioMaterial {
  if (WOOD_BLOCKS.has(blockId)) return 'wood';
  if (METAL_BLOCKS.has(blockId)) return 'metal';
  if (GLASS_BLOCKS.has(blockId)) return 'glass';
  if (SOFT_BLOCKS.has(blockId)) return 'soft';

  const category = BLOCK_DEFS[blockId]?.blockCategory;
  if (category === 'wood') return 'wood';
  if (category === 'dirt') return 'soft';
  if (category === 'ore') return 'metal';
  return 'stone';
}
