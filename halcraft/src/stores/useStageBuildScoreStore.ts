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
import type { ModeFlowBuildPlacementResult } from './useModeFlowStore';

export interface StageBuildScoreBest {
  score: number;
  achievedMilestones: number[];
  bestComboChain: number;
  bestFocusChain: number;
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

export interface StageBuildScoreComboEvent {
  id: string;
  stageId: string;
  label: string;
  score: number;
  comboChain: number;
  bonus: number;
  title: string;
  detail: string;
  accent: string;
  glow: string;
  createdAt: number;
}

export interface StageBuildFocusComboEvent {
  id: string;
  stageId: string;
  score: number;
  focusChain: number;
  bonus: number;
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
  recentThemeLabels: string[];
  comboChain: number;
  bestComboChain: number;
  bestFocusChain: number;
  lastPlacementLabel: string | null;
  lastPlacementPoints: number;
  lastComboBonus: number;
  lastFocusBonus: number;
  achievedMilestones: number[];
  bestByStage: Record<string, StageBuildScoreBest>;
  recentMilestone: StageBuildScoreMilestoneEvent | null;
  recentCombo: StageBuildScoreComboEvent | null;
  recentFocusCombo: StageBuildFocusComboEvent | null;
  startRun: (stageId: string | null) => void;
  recordBlockPlace: (blockId: BlockId, focusResult?: ModeFlowBuildPlacementResult | null) => void;
  clearRecentMilestone: () => void;
  clearRecentCombo: () => void;
  clearRecentFocusCombo: () => void;
}

const BUILD_COMBO_WINDOW = 4;
const BUILD_COMBO_MIN_UNIQUE = 3;
const BUILD_FOCUS_SCORE_MIN_CHAIN = 2;
const BUILD_FOCUS_SCORE_EVENT_STEP = 3;

function nowMs(): number {
  if (typeof performance !== 'undefined') return performance.now();
  return Date.now();
}

function mergeMilestones(current: number[], next: number[]): number[] {
  return Array.from(new Set([...current, ...next])).sort((a, b) => a - b);
}

function getBuildComboBonus(uniqueCount: number, comboChain: number): number {
  return Math.min(12, 2 + uniqueCount + Math.floor(Math.max(0, comboChain - 1) / 2));
}

function getBuildFocusScoreBonus(
  focusResult: ModeFlowBuildPlacementResult | null | undefined,
  blockPoints: number,
  comboBonus: number,
): number {
  if (!focusResult?.focused || focusResult.chain < BUILD_FOCUS_SCORE_MIN_CHAIN) return 0;

  const chainBonus = Math.floor(focusResult.chain / 2);
  const activationBonus = focusResult.activated ? 2 : 0;
  const comboLift = comboBonus > 0 ? 2 : 0;
  return Math.min(16, 2 + Math.min(6, blockPoints) + chainBonus + activationBonus + comboLift);
}

function shouldEmitBuildFocusCombo(
  focusResult: ModeFlowBuildPlacementResult | null | undefined,
  currentBestFocusChain: number,
  focusBonus: number,
): focusResult is ModeFlowBuildPlacementResult {
  if (!focusResult?.focused || focusBonus <= 0) return false;
  if (focusResult.chain < BUILD_FOCUS_SCORE_EVENT_STEP) return false;
  if (focusResult.chain <= currentBestFocusChain) return false;
  return focusResult.chain % BUILD_FOCUS_SCORE_EVENT_STEP === 0;
}

export const useStageBuildScoreStore = create<StageBuildScoreState>()(
  persist(
    (set, get) => ({
      currentStageId: null,
      score: 0,
      styleHits: {},
      recentThemeLabels: [],
      comboChain: 0,
      bestComboChain: 0,
      bestFocusChain: 0,
      lastPlacementLabel: null,
      lastPlacementPoints: 0,
      lastComboBonus: 0,
      lastFocusBonus: 0,
      achievedMilestones: [],
      bestByStage: {},
      recentMilestone: null,
      recentCombo: null,
      recentFocusCombo: null,

      startRun: (stageId) => {
        set({
          currentStageId: getStageBuildStyle(stageId) ? stageId : null,
          score: 0,
          styleHits: {},
          recentThemeLabels: [],
          comboChain: 0,
          bestComboChain: 0,
          bestFocusChain: 0,
          lastPlacementLabel: null,
          lastPlacementPoints: 0,
          lastComboBonus: 0,
          lastFocusBonus: 0,
          achievedMilestones: [],
          recentMilestone: null,
          recentCombo: null,
          recentFocusCombo: null,
        });
      },

      recordBlockPlace: (blockId, focusResult) => {
        const state = get();
        const stageId = state.currentStageId;
        if (!stageId) return;

        const style = getStageBuildStyle(stageId);
        const blockScore = getStageBuildBlockScore(stageId, blockId);
        if (!style || !blockScore) return;

        const previousScore = state.score;
        const repeatedSameMaterial = state.recentThemeLabels[0] === blockScore.label;
        const nextRecentThemeLabels = [
          blockScore.label,
          ...state.recentThemeLabels.filter((label) => label !== blockScore.label),
        ].slice(0, BUILD_COMBO_WINDOW);
        const comboActive = !repeatedSameMaterial && nextRecentThemeLabels.length >= BUILD_COMBO_MIN_UNIQUE;
        const nextComboChain = comboActive ? state.comboChain + 1 : 0;
        const comboBonus = comboActive
          ? getBuildComboBonus(nextRecentThemeLabels.length, nextComboChain)
          : 0;
        const focusBonus = getBuildFocusScoreBonus(focusResult, blockScore.points, comboBonus);
        const nextScore = previousScore + blockScore.points + comboBonus + focusBonus;
        const nextBestComboChain = Math.max(state.bestComboChain, nextComboChain);
        const nextBestFocusChain = Math.max(
          state.bestFocusChain,
          focusResult?.focused ? focusResult.chain : 0,
        );
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
          bestComboChain: Math.max(currentBest?.bestComboChain ?? 0, nextBestComboChain),
          bestFocusChain: Math.max(currentBest?.bestFocusChain ?? 0, nextBestFocusChain),
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
        const recentCombo = comboBonus > 0
          ? {
              id: `${stageId}-combo-${nextComboChain}-${Math.round(createdAt)}`,
              stageId,
              label: blockScore.label,
              score: nextScore,
              comboChain: nextComboChain,
              bonus: comboBonus,
              title: `素材コンボ x${nextComboChain}`,
              detail: `${blockScore.label}+${blockScore.points} / 多素材 +${comboBonus} / ${nextScore}pt`,
              accent: style.accent,
              glow: style.glow,
              createdAt,
            }
          : state.recentCombo;
        const focusComboActive = shouldEmitBuildFocusCombo(
          focusResult,
          state.bestFocusChain,
          focusBonus,
        );
        const recentFocusCombo = focusComboActive
          ? {
              id: `${stageId}-focus-${focusResult.chain}-${Math.round(createdAt)}`,
              stageId,
              score: nextScore,
              focusChain: focusResult.chain,
              bonus: focusBonus,
              title: `高速建築 x${focusResult.chain}`,
              detail: `${blockScore.label}+${blockScore.points} / 連置 +${focusBonus} / ${nextScore}pt`,
              accent: focusResult.accent,
              glow: focusResult.glow,
              createdAt,
            }
          : state.recentFocusCombo;

        set({
          score: nextScore,
          styleHits: {
            ...state.styleHits,
            [blockScore.label]: (state.styleHits[blockScore.label] ?? 0) + 1,
          },
          recentThemeLabels: nextRecentThemeLabels,
          comboChain: nextComboChain,
          bestComboChain: nextBestComboChain,
          bestFocusChain: nextBestFocusChain,
          lastPlacementLabel: blockScore.label,
          lastPlacementPoints: blockScore.points,
          lastComboBonus: comboBonus,
          lastFocusBonus: focusBonus,
          achievedMilestones: nextAchievedMilestones,
          bestByStage: nextBestByStage,
          recentMilestone,
          recentCombo,
          recentFocusCombo,
        });

        if (milestone || comboBonus > 0 || focusComboActive) {
          playStageRewardSound('build_supply');
        }
      },

      clearRecentMilestone: () => set({ recentMilestone: null }),
      clearRecentCombo: () => set({ recentCombo: null }),
      clearRecentFocusCombo: () => set({ recentFocusCombo: null }),
    }),
    {
      name: 'halcraft-stage-build-score-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ bestByStage: state.bestByStage }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<Pick<StageBuildScoreState, 'bestByStage'>>;
        return {
          ...current,
          bestByStage: Object.fromEntries(
            Object.entries(persistedState.bestByStage ?? current.bestByStage).map(([stageId, best]) => [
              stageId,
              {
                ...best,
                bestComboChain: Math.max(0, best.bestComboChain ?? 0),
                bestFocusChain: Math.max(0, best.bestFocusChain ?? 0),
              },
            ]),
          ),
        };
      },
    },
  ),
);
