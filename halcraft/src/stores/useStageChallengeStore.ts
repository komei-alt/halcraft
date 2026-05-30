// ステージチャレンジ進行ストア
// 1ステージ3目標の達成状況とベストメダルを管理する

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BlockId } from '../types/blocks';
import type { MobType } from './useMobStore';
import type { EquippedItem } from './usePlayerStore';
import {
  EMPTY_STAGE_CHALLENGE_STATS,
  getCompletedStageChallenges,
  getStageChallengeMedal,
  getStageChallengeMedalLabel,
  getStageChallenges,
  type StageChallengeMedal,
  type StageChallengeStats,
} from '../types/stageChallenges';
import { getStageChallengeReward } from '../types/stageChallengeRewards';
import { playLevelUpSound, playXPGainSound } from '../utils/sounds';

export interface StageChallengeBest {
  completedCount: number;
  completedIds: string[];
  medal: StageChallengeMedal;
  updatedAt: number;
}

export interface StageChallengeCompletion {
  id: string;
  title: string;
  icon: string;
  medal: StageChallengeMedal;
  completedCount: number;
  totalCount: number;
  rewardLabel: string | null;
  rewardAccent: string | null;
  createdAt: number;
}

interface BlockBreakOptions {
  isOre?: boolean;
  isExplosive?: boolean;
}

interface StageChallengeState {
  currentStageId: string | null;
  stats: StageChallengeStats;
  completedIds: string[];
  bestByStage: Record<string, StageChallengeBest>;
  recentCompletion: StageChallengeCompletion | null;
  resultDismissed: boolean;
  startRun: (stageId: string | null) => void;
  recordBlockPlace: (blockId: BlockId) => void;
  recordBlockBreak: (blockId: BlockId, options?: BlockBreakOptions) => void;
  recordEnemyDefeat: (mobType: MobType) => void;
  recordWeaponHit: (item: EquippedItem, amount?: number) => void;
  recordDetonation: (amount?: number) => void;
  clearRecentCompletion: () => void;
  dismissStageResult: () => void;
}

function createEmptyStats(): StageChallengeStats {
  return {
    ...EMPTY_STAGE_CHALLENGE_STATS,
    placedBlockCounts: {},
  };
}

function nowMs(): number {
  if (typeof performance !== 'undefined') return performance.now();
  return Date.now();
}

function createBest(completedIds: string[], totalCount: number): StageChallengeBest {
  const medal = getStageChallengeMedal(completedIds.length, totalCount);
  return {
    completedCount: completedIds.length,
    completedIds,
    medal,
    updatedAt: Date.now(),
  };
}

function getNewCompletion(
  stageId: string,
  previousCompletedIds: string[],
  nextCompletedIds: string[],
): StageChallengeCompletion | null {
  const completedId = nextCompletedIds.find((id) => !previousCompletedIds.includes(id));
  if (!completedId) return null;

  const challenges = getStageChallenges(stageId);
  const challenge = challenges.find((item) => item.id === completedId);
  if (!challenge) return null;
  const reward = getStageChallengeReward(stageId, nextCompletedIds.length, challenges.length);

  return {
    id: completedId,
    title: challenge.title,
    icon: challenge.icon,
    medal: getStageChallengeMedal(nextCompletedIds.length, challenges.length),
    completedCount: nextCompletedIds.length,
    totalCount: challenges.length,
    rewardLabel: reward?.label ?? null,
    rewardAccent: reward?.accent ?? null,
    createdAt: nowMs(),
  };
}

export const useStageChallengeStore = create<StageChallengeState>()(
  persist(
    (set, get) => {
      const updateStats = (updater: (stats: StageChallengeStats) => StageChallengeStats) => {
        const state = get();
        if (!state.currentStageId) return;

        const nextStats = updater(state.stats);
        const nextCompletedIds = getCompletedStageChallenges(state.currentStageId, nextStats);
        const completion = getNewCompletion(state.currentStageId, state.completedIds, nextCompletedIds);
        const challenges = getStageChallenges(state.currentStageId);
        const currentBest = state.bestByStage[state.currentStageId];
        const nextBestByStage = { ...state.bestByStage };

        if (!currentBest || nextCompletedIds.length > currentBest.completedCount) {
          nextBestByStage[state.currentStageId] = createBest(nextCompletedIds, challenges.length);
        }

        set({
          stats: nextStats,
          completedIds: nextCompletedIds,
          bestByStage: nextBestByStage,
          recentCompletion: completion ?? state.recentCompletion,
        });

        if (completion) {
          if (completion.medal === 'gold') {
            playLevelUpSound();
          } else {
            playXPGainSound();
          }
        }
      };

      return {
        currentStageId: null,
        stats: createEmptyStats(),
        completedIds: [],
        bestByStage: {},
        recentCompletion: null,
        resultDismissed: false,

        startRun: (stageId) => {
          set({
            currentStageId: stageId,
            stats: createEmptyStats(),
            completedIds: [],
            recentCompletion: null,
            resultDismissed: false,
          });
        },

        recordBlockPlace: (blockId) => {
          updateStats((stats) => ({
            ...stats,
            blocksPlaced: stats.blocksPlaced + 1,
            placedBlockCounts: {
              ...stats.placedBlockCounts,
              [blockId]: (stats.placedBlockCounts[blockId] ?? 0) + 1,
            },
          }));
        },

        recordBlockBreak: (_blockId, options) => {
          updateStats((stats) => ({
            ...stats,
            blocksBroken: stats.blocksBroken + 1,
            oresMined: stats.oresMined + (options?.isOre ? 1 : 0),
            detonations: stats.detonations + (options?.isExplosive ? 1 : 0),
          }));
        },

        recordEnemyDefeat: (mobType) => {
          updateStats((stats) => ({
            ...stats,
            enemiesDefeated: mobType === 'boss_giant' ? stats.enemiesDefeated : stats.enemiesDefeated + 1,
            bossDefeated: mobType === 'boss_giant' ? Math.max(1, stats.bossDefeated) : stats.bossDefeated,
          }));
        },

        recordWeaponHit: (item, amount = 1) => {
          const delta = Math.max(1, Math.round(amount));
          updateStats((stats) => ({
            ...stats,
            machineGunHits: stats.machineGunHits + (item === 'machine_gun' ? delta : 0),
            rocketHits: stats.rocketHits + (item === 'rocket_launcher' ? delta : 0),
            lightsaberHits: stats.lightsaberHits + (item === 'lightsaber' ? delta : 0),
          }));
        },

        recordDetonation: (amount = 1) => {
          const delta = Math.max(1, Math.round(amount));
          updateStats((stats) => ({
            ...stats,
            detonations: stats.detonations + delta,
          }));
        },

        clearRecentCompletion: () => set({ recentCompletion: null }),
        dismissStageResult: () => set({ resultDismissed: true, recentCompletion: null }),
      };
    },
    {
      name: 'halcraft-stage-challenges-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ bestByStage: state.bestByStage }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<Pick<StageChallengeState, 'bestByStage'>>;
        return {
          ...current,
          bestByStage: persistedState.bestByStage ?? current.bestByStage,
        };
      },
    },
  ),
);

export { getStageChallengeMedalLabel };
