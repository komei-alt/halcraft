// ステージ別の開始ホットバー定義
// 支給品とマップ特性がすぐ遊びに出るよう、1-9番に置くブロックを優先する

import { BLOCK_DEFS, BLOCK_IDS, HOTBAR_BLOCKS, type BlockId } from './blocks';
import type { StageDefinition } from './stages';
import type { StageRunBonus } from './stageRunBonuses';

export type HotbarItemCounts = Readonly<Record<number, number | undefined>>;

const STAGE_HOTBAR_PRIORITIES: Record<string, BlockId[]> = {
  'build-forest': [
    BLOCK_IDS.WOOD,
    BLOCK_IDS.RAW_WOOD,
    BLOCK_IDS.LEAVES,
    BLOCK_IDS.TORCH,
    BLOCK_IDS.CAMPFIRE,
    BLOCK_IDS.RAIL,
    BLOCK_IDS.RAIL_SLOPE,
    BLOCK_IDS.RAIL_BOOSTER,
    BLOCK_IDS.GLASS,
  ],
  'build-tropical': [
    BLOCK_IDS.WATER,
    BLOCK_IDS.GLASS,
    BLOCK_IDS.ELECTRIC,
    BLOCK_IDS.WOOD,
    BLOCK_IDS.TORCH,
    BLOCK_IDS.RAIL,
    BLOCK_IDS.RAIL_SLOPE,
    BLOCK_IDS.RAIL_BOOSTER,
    BLOCK_IDS.CANDLE,
  ],
  'build-snow': [
    BLOCK_IDS.SNOW,
    BLOCK_IDS.GLASS,
    BLOCK_IDS.GLOWSTONE,
    BLOCK_IDS.TORCH,
    BLOCK_IDS.CANDLE,
    BLOCK_IDS.STONE,
    BLOCK_IDS.RAIL,
    BLOCK_IDS.RAIL_SLOPE,
    BLOCK_IDS.RAIL_BOOSTER,
  ],
  'build-desert': [
    BLOCK_IDS.SAND,
    BLOCK_IDS.STONE,
    BLOCK_IDS.WATER,
    BLOCK_IDS.GLOWSTONE,
    BLOCK_IDS.GLASS,
    BLOCK_IDS.TORCH,
    BLOCK_IDS.RAIL,
    BLOCK_IDS.RAIL_BOOSTER,
    BLOCK_IDS.TNT,
  ],
  'war-forest': [
    BLOCK_IDS.TURRET,
    BLOCK_IDS.TORCH,
    BLOCK_IDS.CAMPFIRE,
    BLOCK_IDS.STONE,
    BLOCK_IDS.WOOD,
    BLOCK_IDS.TNT,
    BLOCK_IDS.SPAWNER,
    BLOCK_IDS.CORE,
    BLOCK_IDS.LEAVES,
  ],
  'war-tropical': [
    BLOCK_IDS.TNT,
    BLOCK_IDS.WATER,
    BLOCK_IDS.TURRET,
    BLOCK_IDS.CAMPFIRE,
    BLOCK_IDS.TORCH,
    BLOCK_IDS.STONE,
    BLOCK_IDS.WOOD,
    BLOCK_IDS.GLASS,
    BLOCK_IDS.ELECTRIC,
  ],
  'war-snow': [
    BLOCK_IDS.CAMPFIRE,
    BLOCK_IDS.GLOWSTONE,
    BLOCK_IDS.SNOW,
    BLOCK_IDS.GLASS,
    BLOCK_IDS.TURRET,
    BLOCK_IDS.TORCH,
    BLOCK_IDS.STONE,
    BLOCK_IDS.WOOD,
    BLOCK_IDS.TNT,
  ],
  'war-desert': [
    BLOCK_IDS.TNT,
    BLOCK_IDS.STONE,
    BLOCK_IDS.WATER,
    BLOCK_IDS.ELECTRIC,
    BLOCK_IDS.TURRET,
    BLOCK_IDS.SAND,
    BLOCK_IDS.TORCH,
    BLOCK_IDS.CAMPFIRE,
    BLOCK_IDS.WOOD,
  ],
};

function isUsableBlockId(value: number): value is BlockId {
  return value !== BLOCK_IDS.AIR && value !== BLOCK_IDS.BEDROCK && Boolean(BLOCK_DEFS[value]);
}

function uniqueUsableBlocks(blocks: BlockId[]): BlockId[] {
  const seen = new Set<BlockId>();
  const result: BlockId[] = [];

  for (const blockId of blocks) {
    if (!isUsableBlockId(blockId) || seen.has(blockId)) continue;
    seen.add(blockId);
    result.push(blockId);
  }

  return result;
}

function getStockedBlocks(items: HotbarItemCounts): BlockId[] {
  return Object.entries(items)
    .map(([rawBlockId, count]) => ({
      blockId: Number(rawBlockId),
      count: count ?? 0,
    }))
    .filter((entry): entry is { blockId: BlockId; count: number } => (
      entry.count > 0 && isUsableBlockId(entry.blockId)
    ))
    .map((entry) => entry.blockId);
}

function fillHotbar(primaryBlocks: BlockId[]): BlockId[] {
  return uniqueUsableBlocks([...primaryBlocks, ...HOTBAR_BLOCKS])
    .slice(0, HOTBAR_BLOCKS.length);
}

function getShortBlockName(blockId: BlockId): string {
  return (BLOCK_DEFS[blockId]?.name ?? `ID${blockId}`)
    .replace('ブロック', '')
    .replace('草付き土', '草')
    .replace('生の木', '原木')
    .replace('グロウストーン', '光る石')
    .replace('電気の', '電気');
}

export function getStageStarterHotbarItemCounts(
  stage: StageDefinition,
  runBonus: Pick<StageRunBonus, 'blocks'> | null,
): Record<number, number> {
  const items: Record<number, number> = {};

  for (const [rawBlockId, rawCount] of Object.entries(stage.rules.starterKit.blocks)) {
    const blockId = Number(rawBlockId);
    if (rawCount && rawCount > 0 && isUsableBlockId(blockId)) {
      items[blockId] = rawCount;
    }
  }

  for (const block of runBonus?.blocks ?? []) {
    items[block.blockId] = (items[block.blockId] ?? 0) + block.count;
  }

  return items;
}

export function getStageHotbarSlots(
  stageId: string | null | undefined,
  items?: HotbarItemCounts,
): BlockId[] {
  const priority = stageId ? STAGE_HOTBAR_PRIORITIES[stageId] ?? [] : [];
  if (!items) return fillHotbar(priority);

  const stockedPriority = priority.filter((blockId) => (items[blockId] ?? 0) > 0);
  const stockedFallback = uniqueUsableBlocks([...HOTBAR_BLOCKS, ...getStockedBlocks(items)])
    .filter((blockId) => (items[blockId] ?? 0) > 0 && !stockedPriority.includes(blockId));
  const unstockedPriority = priority.filter((blockId) => (items[blockId] ?? 0) <= 0);

  return fillHotbar([
    ...stockedPriority,
    ...stockedFallback,
    ...unstockedPriority,
  ]);
}

export function formatStageHotbarPreview(
  stageId: string | null | undefined,
  items: HotbarItemCounts,
  limit: number,
): string {
  const preview = getStageHotbarSlots(stageId, items)
    .filter((blockId) => (items[blockId] ?? 0) > 0)
    .slice(0, limit)
    .map((blockId) => `${getShortBlockName(blockId)}x${items[blockId] ?? 0}`);

  return preview.length > 0 ? preview.join(' / ') : '標準';
}
