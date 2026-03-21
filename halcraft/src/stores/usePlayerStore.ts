// プレイヤー状態の管理ストア
// HP、選択中のブロック（ホットバー）を管理

import { create } from 'zustand';
import { HOTBAR_BLOCKS, type BlockId } from '../types/blocks';

interface PlayerState {
  /** 体力 */
  hp: number;
  maxHp: number;

  /** ホットバーの選択インデックス (0-8) */
  selectedSlot: number;

  /** 選択中のブロックIDを取得 */
  getSelectedBlock: () => BlockId;

  /** スロット選択（0-8） */
  selectSlot: (slot: number) => void;

  /** ダメージを受ける */
  takeDamage: (amount: number) => void;

  /** 回復 */
  heal: (amount: number) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  hp: 20,
  maxHp: 20,
  selectedSlot: 0,

  getSelectedBlock: () => {
    return HOTBAR_BLOCKS[get().selectedSlot] ?? HOTBAR_BLOCKS[0];
  },

  selectSlot: (slot) => {
    if (slot >= 0 && slot < HOTBAR_BLOCKS.length) {
      set({ selectedSlot: slot });
    }
  },

  takeDamage: (amount) => {
    set((state) => ({
      hp: Math.max(0, state.hp - amount),
    }));
  },

  heal: (amount) => {
    set((state) => ({
      hp: Math.min(state.maxHp, state.hp + amount),
    }));
  },
}));
