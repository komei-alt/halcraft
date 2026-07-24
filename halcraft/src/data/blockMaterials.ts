import {
  BLOCK_DEFS,
  BLOCK_IDS,
  type BlockId,
  type BlockInfo,
  type BlockMaterialSpec,
} from '../types/blocks';
import {
  MATERIAL_ATLAS_SLOTS,
  MATERIAL_ATLAS_SPECS,
  type MaterialAtlasId,
  type PlantAtlasId,
} from '../generated/materialAtlas';

export type MaterialFaceRole = 'top' | 'side' | 'bottom';

export const BLOCK_MATERIAL_CATALOG = MATERIAL_ATLAS_SPECS satisfies Record<string, BlockMaterialSpec>;

const MATERIAL_FAMILY_COLORS: Record<string, number> = {
  flora: 0x6f9f3d,
  soil: 0x8a5d36,
  wood: 0x9b6c3c,
  stone: 0x85827a,
  sand: 0xd7a95f,
  terracotta: 0xb75d3f,
  snow: 0xd9edf2,
  ice: 0x8fcee4,
  nether: 0x8b2f35,
  metal: 0xa7adb2,
  glass: 0xa9dbe4,
  ore: 0xd9b85f,
  crystal: 0x53d6df,
  magic: 0x9561dc,
  functional: 0xc16042,
};

const VEGETATION_ATLAS_BY_BLOCK: Partial<Record<BlockId, PlantAtlasId>> = {
  [BLOCK_IDS.TALL_GRASS]: 'tall_grass',
  [BLOCK_IDS.WILDFLOWER]: 'wildflower',
  [BLOCK_IDS.BUSH]: 'bush',
  [BLOCK_IDS.REED]: 'reed',
  [BLOCK_IDS.MUSHROOM]: 'mushroom',
  [BLOCK_IDS.DEAD_BUSH]: 'dead_bush',
  [BLOCK_IDS.FROST_GRASS]: 'frost_grass',
  [BLOCK_IDS.NETHER_FUNGUS]: 'nether_fungus',
};

export const VEGETATION_BLOCK_IDS = Object.freeze(
  Object.keys(VEGETATION_ATLAS_BY_BLOCK).map(Number) as BlockId[],
);

export function getMaterialIdForFace(
  definition: BlockInfo,
  role: MaterialFaceRole,
): MaterialAtlasId {
  const requested = definition.faceMaterialIds?.[role] ?? definition.materialId ?? 'stone';
  return requested in MATERIAL_ATLAS_SLOTS ? requested as MaterialAtlasId : 'stone';
}

export function getBlockMaterialSpec(blockId: BlockId): BlockMaterialSpec {
  const definition = BLOCK_DEFS[blockId];
  const materialId = definition ? getMaterialIdForFace(definition, 'side') : 'stone';
  return BLOCK_MATERIAL_CATALOG[materialId];
}

/** 破壊片・火花・衝撃リングをマテリアル系統と同色へ揃える。 */
export function getBlockMaterialColorHex(blockId: BlockId): number {
  const definition = BLOCK_DEFS[blockId];
  if (definition?.emissiveColor) return definition.emissiveColor.getHex();
  return MATERIAL_FAMILY_COLORS[getBlockMaterialSpec(blockId).family] ?? 0x888888;
}

export function getBlockIconUrl(blockId: BlockId): string {
  const definition = BLOCK_DEFS[blockId];
  if (!definition) return '/textures/material-icons/stone.webp';
  if (definition.iconTexture) return definition.iconTexture;
  const materialId = getMaterialIdForFace(definition, 'top');
  return `/textures/material-icons/${materialId}.webp`;
}

export function getPlantAtlasId(blockId: BlockId): PlantAtlasId | null {
  return VEGETATION_ATLAS_BY_BLOCK[blockId] ?? null;
}

export function isVegetationBlock(blockId: BlockId): boolean {
  return VEGETATION_ATLAS_BY_BLOCK[blockId] !== undefined || blockId === BLOCK_IDS.CACTUS;
}

export function resolveDecorativeDrop(
  blockId: BlockId,
  x: number,
  y: number,
  z: number,
): BlockId | null {
  const definition = BLOCK_DEFS[blockId];
  if (!definition) return null;
  const drop = definition.dropBlockId === undefined ? blockId : definition.dropBlockId;
  if (drop === null) return null;
  const chance = definition.dropChance ?? 1;
  if (chance >= 1) return drop;
  let hash = Math.imul(x | 0, 0x45d9f3b)
    ^ Math.imul(y | 0, 0x119de1f3)
    ^ Math.imul(z | 0, 0x3449f5)
    ^ Math.imul(blockId, 0x27d4eb2d);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295 <= chance ? drop : null;
}
