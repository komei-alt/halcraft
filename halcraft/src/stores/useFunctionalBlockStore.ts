// 置いた機能ブロックの一時状態を管理する
// ワールドのブロックIDだけでは表せない「開いたドア」などをここで扱う

import { create } from 'zustand';

const blockKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

interface FunctionalBlockState {
  /** 開いているドア座標 */
  openDoors: Record<string, boolean>;
  /** ドアを開閉して、開いた状態なら true を返す */
  toggleDoor: (x: number, y: number, z: number) => boolean;
  /** ドアが開いているか */
  isDoorOpen: (x: number, y: number, z: number) => boolean;
  /** ステージ切替などで一時状態を消す */
  clearFunctionalBlocks: () => void;
}

export const useFunctionalBlockStore = create<FunctionalBlockState>((set, get) => ({
  openDoors: {},

  toggleDoor: (x, y, z) => {
    const key = blockKey(x, y, z);
    const nextOpen = !get().openDoors[key];
    set((state) => {
      const nextDoors = { ...state.openDoors };
      if (nextOpen) {
        nextDoors[key] = true;
      } else {
        delete nextDoors[key];
      }
      return { openDoors: nextDoors };
    });
    return nextOpen;
  },

  isDoorOpen: (x, y, z) => Boolean(get().openDoors[blockKey(x, y, z)]),

  clearFunctionalBlocks: () => set({ openDoors: {} }),
}));
