// インベントリ状態の管理ストア
// ブロック破壊で取得した素材と、クラフト機能を管理

import { create } from 'zustand';
import { type BlockId, BLOCK_IDS } from '../types/blocks';
import { type CraftingRecipe } from '../types/crafting';

interface InventoryState {
  /** インベントリ { blockId: 個数 } */
  items: Record<number, number>;

  /** アイテムを追加 */
  addItem: (blockId: BlockId, count?: number) => void;

  /** アイテムを消費 */
  removeItem: (blockId: BlockId, count: number) => boolean;

  /** アイテムの所持数を取得 */
  getItemCount: (blockId: BlockId) => number;

  /** クラフト可能かチェック */
  canCraft: (recipe: CraftingRecipe) => boolean;

  /** クラフトを実行 */
  craft: (recipe: CraftingRecipe) => boolean;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  items: {},

  addItem: (blockId, count = 1) => {
    // 空気ブロックと岩盤は拾わない
    if (blockId === BLOCK_IDS.AIR || blockId === BLOCK_IDS.BEDROCK) return;
    set((state) => ({
      items: {
        ...state.items,
        [blockId]: (state.items[blockId] ?? 0) + count,
      },
    }));
  },

  removeItem: (blockId, count) => {
    const current = get().items[blockId] ?? 0;
    if (current < count) return false;
    set((state) => {
      const newCount = (state.items[blockId] ?? 0) - count;
      const newItems = { ...state.items };
      if (newCount <= 0) {
        delete newItems[blockId];
      } else {
        newItems[blockId] = newCount;
      }
      return { items: newItems };
    });
    return true;
  },

  getItemCount: (blockId) => {
    return get().items[blockId] ?? 0;
  },

  canCraft: (recipe) => {
    const { items } = get();
    return Object.entries(recipe.ingredients).every(([blockIdStr, required]) => {
      const blockId = parseInt(blockIdStr);
      return (items[blockId] ?? 0) >= required;
    });
  },

  craft: (recipe) => {
    if (!get().canCraft(recipe)) return false;

    // 素材を消費
    set((state) => {
      const newItems = { ...state.items };
      Object.entries(recipe.ingredients).forEach(([blockIdStr, required]) => {
        const blockId = parseInt(blockIdStr);
        const current = newItems[blockId] ?? 0;
        const remaining = current - required;
        if (remaining <= 0) {
          delete newItems[blockId];
        } else {
          newItems[blockId] = remaining;
        }
      });
      // 完成品を追加
      newItems[recipe.result] = (newItems[recipe.result] ?? 0) + recipe.resultCount;
      return { items: newItems };
    });
    return true;
  },
}));
