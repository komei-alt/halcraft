// 建築ステージの作品評価ストア
// テーマに合うブロック配置をスコア化し、最高作品と節目演出を管理する

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { BlockId } from '../types/blocks';
import {
  getReachedStageBuildMilestone,
  getStageBuildBlockScore,
  getStageBuildStyle,
} from '../types/stageBuildStyles';
import { playStageRewardSound } from '../utils/sounds';

export interface StageBuildScoreBest {
  score: number;
  achievedMilestones: number[];
  updatedAt: number;
}

export interface StageBuildScoreMilestoneEvent {
  id: string;
  stageId: string;
  score: number;
  milestone: number;
  icon: string;
  title: string;
  detail: string;
  accent: string;
  glow: string;
  createdAt: number;
}

interface StageBuildScoreState {
  currentStageId: string | null;
  score: number;
  styleHits: Record<string, number>;
  achievedMilestones: number[];
  bestByStage: Record<string, StageBuildScoreBest>;
  recentMilestone: StageBuildScoreMilestoneEvent | null;
  startRun: (stageId: string | null) => void;
  recordBlockPlace: (blockId: BlockId) => void;
  clearRecentMilestone: () => void;
}

function nowMs(): number {
  if (typeof performance !== 'undefined') return performance.now();
  return Date.now();
}

function mergeMilestones(current: number[], next: number[]): number[] {
  return Array.from(new Set([...current, ...next])).sort((a, b) => a - b);
}

export const useStageBuildScoreStore = create<StageBuildScoreState>()(
  persist(
    (set, get) => ({
      currentStageId: null,
      score: 0,
      styleHits: {},
      achievedMilestones: [],
      bestByStage: {},
      recentMilestone: null,

      startRun: (stageId) => {
        set({
          currentStageId: getStageBuildStyle(stageId) ? stageId : null,
          score: 0,
          styleHits: {},
          achievedMilestones: [],
          recentMilestone: null,
        });
      },

      recordBlockPlace: (blockId) => {
        const state = get();
        const stageId = state.currentStageId;
        if (!stageId) return;

        const style = getStageBuildStyle(stageId);
        const blockScore = getStageBuildBlockScore(stageId, blockId);
        if (!style || !blockScore) return;

        const previousScore = state.score;
        const nextScore = previousScore + blockScore.points;
        const milestone = getReachedStageBuildMilestone(
          previousScore,
          nextScore,
          state.achievedMilestones,
        );
        const nextAchievedMilestones = milestone
          ? [...state.achievedMilestones, milestone]
          : state.achievedMilestones;
        const currentBest = state.bestByStage[stageId];
        const bestScore = Math.max(nextScore, currentBest?.score ?? 0);
        const bestMilestones = mergeMilestones(
          currentBest?.achievedMilestones ?? [],
          nextAchievedMilestones,
        );
        const nextBestByStage = { ...state.bestByStage };
        nextBestByStage[stageId] = {
          score: bestScore,
          achievedMilestones: bestMilestones,
          updatedAt: Date.now(),
        };

        const createdAt = nowMs();
        const milestoneText = milestone ? style.milestones[milestone] : null;
        const recentMilestone = milestone && milestoneText
          ? {
              id: `${stageId}-${milestone}-${Math.round(createdAt)}`,
              stageId,
              score: nextScore,
              milestone,
              icon: style.icon,
              title: milestoneText.title,
              detail: `${milestoneText.detail} / ${nextScore}pt`,
              accent: style.accent,
              glow: style.glow,
              createdAt,
            }
          : state.recentMilestone;

        set({
          score: nextScore,
          styleHits: {
            ...state.styleHits,
            [blockScore.label]: (state.styleHits[blockScore.label] ?? 0) + 1,
          },
          achievedMilestones: nextAchievedMilestones,
          bestByStage: nextBestByStage,
          recentMilestone,
        });

        if (milestone) {
          playStageRewardSound('build_supply');
        }
      },

      clearRecentMilestone: () => set({ recentMilestone: null }),
    }),
    {
      name: 'halcraft-stage-build-score-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ bestByStage: state.bestByStage }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<Pick<StageBuildScoreState, 'bestByStage'>>;
        return {
          ...current,
          bestByStage: persistedState.bestByStage ?? current.bestByStage,
        };
      },
    },
  ),
);
