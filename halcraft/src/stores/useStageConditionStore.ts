// ステージコンディション進行ストア
// マップごとの行動ゲージと発動中ボーナスを管理する

import { create } from 'zustand';
import type { BlockId } from '../types/blocks';
import type { MobType } from './useMobStore';
import type { EquippedItem } from './usePlayerStore';
import {
  getStageCondition,
  type StageConditionDefinition,
} from '../types/stageConditions';
import { playStageConditionSound } from '../utils/sounds';

export interface StageConditionActivation {
  id: string;
  conditionId: string;
  title: string;
  icon: string;
  label: string;
  activeUntil: number;
  createdAt: number;
}

interface StageConditionState {
  currentStageId: string | null;
  charge: number;
  activeUntil: number;
  recentActivation: StageConditionActivation | null;
  startRun: (stageId: string | null) => void;
  recordBlockPlace: (blockId: BlockId) => void;
  recordEnemyDefeat: (mobType: MobType) => void;
  recordWeaponHit: (item: EquippedItem, amount?: number) => void;
  recordDetonation: (amount?: number) => void;
  clearRecentActivation: () => void;
}

function nowMs(): number {
  if (typeof performance !== 'undefined') return performance.now();
  return Date.now();
}

function getCurrentCondition(stageId: string | null): StageConditionDefinition | null {
  return getStageCondition(stageId);
}

function isHostileDefeat(mobType: MobType): boolean {
  return mobType === 'zombie' || mobType === 'spider' || mobType === 'darwin';
}

export const useStageConditionStore = create<StageConditionState>()((set, get) => {
  const advance = (amount: number) => {
    const state = get();
    const condition = getCurrentCondition(state.currentStageId);
    if (!condition) return;

    const delta = Math.max(1, Math.round(amount));
    const nextCharge = state.charge + delta;
    if (nextCharge < condition.target) {
      set({ charge: nextCharge });
      return;
    }

    const createdAt = nowMs();
    const activeUntil = createdAt + condition.activeDurationMs;
    set({
      charge: 0,
      activeUntil,
      recentActivation: {
        id: `${condition.id}-${Math.round(createdAt)}`,
        conditionId: condition.id,
        title: condition.title,
        icon: condition.icon,
        label: condition.effect.label,
        activeUntil,
        createdAt,
      },
    });
    playStageConditionSound(condition.effect.kind);
  };

  return {
    currentStageId: null,
    charge: 0,
    activeUntil: 0,
    recentActivation: null,

    startRun: (stageId) => {
      set({
        currentStageId: stageId,
        charge: 0,
        activeUntil: 0,
        recentActivation: null,
      });
    },

    recordBlockPlace: (blockId) => {
      const condition = getCurrentCondition(get().currentStageId);
      if (!condition?.blockIds?.includes(blockId)) return;
      advance(1);
    },

    recordEnemyDefeat: (mobType) => {
      const condition = getCurrentCondition(get().currentStageId);
      if (!condition?.countsEnemyDefeats || !isHostileDefeat(mobType)) return;
      advance(1);
    },

    recordWeaponHit: (item, amount = 1) => {
      const condition = getCurrentCondition(get().currentStageId);
      if (!condition?.weaponItems?.includes(item)) return;
      advance(amount);
    },

    recordDetonation: (amount = 1) => {
      const condition = getCurrentCondition(get().currentStageId);
      if (!condition?.countsDetonations) return;
      advance(amount);
    },

    clearRecentActivation: () => set({ recentActivation: null }),
  };
});
