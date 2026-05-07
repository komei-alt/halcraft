// 経験値（XP）管理ストア
// モブ撃破や鉱石採掘で獲得、エンチャントに消費

import { create } from 'zustand';
import { playXPGainSound, playLevelUpSound } from '../utils/sounds';

/** レベルアップに必要なXP */
function xpForLevel(level: number): number {
  if (level < 16) return 2 * level + 7;
  if (level < 31) return 5 * level - 38;
  return 9 * level - 158;
}

interface ExperienceState {
  /** 現在のレベル */
  level: number;
  /** 現在のXP（レベル内のポイント） */
  xp: number;
  /** 次のレベルまでに必要なXP */
  xpToNextLevel: number;
  /** 累計XP */
  totalXp: number;

  /** XPを獲得 */
  addXp: (amount: number) => void;
  /** XPを消費（エンチャント等） */
  spendXp: (amount: number) => boolean;
  /** XPをリセット（死亡時） */
  resetXp: () => void;
  /** 現在のXP進捗率（0-1） */
  getProgress: () => number;
}

export const useExperienceStore = create<ExperienceState>((set, get) => ({
  level: 0,
  xp: 0,
  xpToNextLevel: xpForLevel(0),
  totalXp: 0,

  addXp: (amount) => {
    let { level, xp, totalXp } = get();
    xp += amount;
    totalXp += amount;

    // レベルアップ判定
    let needed = xpForLevel(level);
    let leveledUp = false;
    while (xp >= needed) {
      xp -= needed;
      level++;
      needed = xpForLevel(level);
      leveledUp = true;
    }

    set({ level, xp, xpToNextLevel: needed, totalXp });

    if (leveledUp) {
      playLevelUpSound();
    } else {
      playXPGainSound();
    }
  },

  spendXp: (amount) => {
    const { totalXp } = get();
    if (totalXp < amount) return false;

    let { level, xp } = get();
    let remaining = amount;

    // XPを消費してレベルを下げる
    while (remaining > 0) {
      if (xp >= remaining) {
        xp -= remaining;
        remaining = 0;
      } else {
        remaining -= xp;
        if (level > 0) {
          level--;
          xp = xpForLevel(level);
        } else {
          xp = 0;
          remaining = 0;
        }
      }
    }

    set({
      level,
      xp,
      xpToNextLevel: xpForLevel(level),
      totalXp: get().totalXp - amount,
    });
    return true;
  },

  resetXp: () => {
    set({
      level: 0,
      xp: 0,
      xpToNextLevel: xpForLevel(0),
      totalXp: 0,
    });
  },

  getProgress: () => {
    const { xp, xpToNextLevel } = get();
    return xpToNextLevel > 0 ? xp / xpToNextLevel : 0;
  },
}));
