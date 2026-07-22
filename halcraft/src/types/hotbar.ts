// ホットバーに入るブロックと徒歩用武器をまとめて扱う型定義

import { HOTBAR_BLOCKS, type BlockId } from './blocks';

export type WeaponItem =
  | 'rocket_launcher'
  | 'machine_gun'
  | 'lightsaber'
  | 'gravity_glove'
  | 'bomb_slinger';
export type EquippedItem = 'builder' | WeaponItem;
export type HotbarSlotItem = BlockId | WeaponItem;

export const HOTBAR_WEAPON_ITEMS: readonly WeaponItem[] = [
  'rocket_launcher',
  'machine_gun',
  'lightsaber',
  'gravity_glove',
  'bomb_slinger',
];

export const HOTBAR_SLOT_COUNT = 9;

const BLOCK_SLOT_COUNT = Math.max(1, HOTBAR_SLOT_COUNT - HOTBAR_WEAPON_ITEMS.length);

export function isWeaponHotbarItem(item: HotbarSlotItem | undefined): item is WeaponItem {
  return typeof item === 'string';
}

export function isBlockHotbarItem(item: HotbarSlotItem | undefined): item is BlockId {
  return typeof item === 'number';
}

export function getHotbarItemEquippedItem(item: HotbarSlotItem | undefined): EquippedItem {
  return isWeaponHotbarItem(item) ? item : 'builder';
}

export function getFirstHotbarBlock(
  slots: HotbarSlotItem[],
  fallback: BlockId = HOTBAR_BLOCKS[0],
): BlockId {
  return slots.find(isBlockHotbarItem) ?? fallback;
}

export function getHotbarItemBlockId(
  item: HotbarSlotItem | undefined,
  fallback: BlockId = HOTBAR_BLOCKS[0],
): BlockId {
  return isBlockHotbarItem(item) ? item : fallback;
}

export function createHotbarSlotsWithWeapons(blocks: BlockId[]): HotbarSlotItem[] {
  const uniqueBlocks: BlockId[] = [];
  const seen = new Set<BlockId>();

  for (const blockId of [...blocks, ...HOTBAR_BLOCKS]) {
    if (seen.has(blockId)) continue;
    seen.add(blockId);
    uniqueBlocks.push(blockId);
  }

  return [
    ...uniqueBlocks.slice(0, BLOCK_SLOT_COUNT),
    ...HOTBAR_WEAPON_ITEMS,
  ].slice(0, HOTBAR_SLOT_COUNT);
}
