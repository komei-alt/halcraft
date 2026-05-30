// マップごとのやり込み度を、チャレンジ達成と作品評価からまとめて見せる

import {
  BUILD_SCORE_MILESTONES,
  getStageBuildStyle,
} from './stageBuildStyles';
import type { StageCategory, StageDefinition } from './stages';

export type StageMasteryRank = 'new' | 'bronze' | 'silver' | 'gold' | 'master';

export interface StageMasterySummary {
  score: number;
  rank: StageMasteryRank;
  rankLabel: string;
  title: string;
  nextLabel: string;
  accent: string;
  glow: string;
  challengeScore: number;
  buildScore: number;
  mastered: boolean;
}

interface StageMasteryInput {
  stage: StageDefinition;
  completedCount: number;
  challengeCount: number;
  buildScore?: number;
}

const FINAL_BUILD_SCORE = BUILD_SCORE_MILESTONES[BUILD_SCORE_MILESTONES.length - 1];

const RANK_LABELS: Record<StageMasteryRank, string> = {
  new: '未開拓',
  bronze: 'BRONZE',
  silver: 'SILVER',
  gold: 'GOLD',
  master: 'MASTER',
};

const RANK_ACCENTS: Record<StageMasteryRank, string> = {
  new: 'rgba(255,255,255,0.72)',
  bronze: '#ffc58a',
  silver: '#dce8ff',
  gold: '#ffe680',
  master: '#a6ffcf',
};

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function clampContribution(score: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(score)));
}

function getRank(score: number): StageMasteryRank {
  if (score >= 100) return 'master';
  if (score >= 80) return 'gold';
  if (score >= 55) return 'silver';
  if (score >= 25) return 'bronze';
  return 'new';
}

function getRankTitle(category: StageCategory, rank: StageMasteryRank): string {
  const titles: Record<StageCategory, Record<StageMasteryRank, string>> = {
    build: {
      new: '制作これから',
      bronze: '制作見習い',
      silver: '拠点職人',
      gold: 'マップ職人',
      master: 'マップマスター',
    },
    war: {
      new: '初陣これから',
      bronze: '前線参加',
      silver: '前線突破',
      gold: '防衛隊長',
      master: '戦場マスター',
    },
  };
  return titles[category][rank];
}

function getNextLabel(input: StageMasteryInput, challengeScore: number, buildScore: number): string {
  if (input.stage.category === 'build') {
    const style = getStageBuildStyle(input.stage.id);
    const currentBuildScore = Math.max(0, input.buildScore ?? 0);
    if (style && buildScore < 40) {
      return `${style.shortLabel} あと${Math.max(0, FINAL_BUILD_SCORE - Math.min(currentBuildScore, FINAL_BUILD_SCORE))}pt`;
    }
  }

  if (input.completedCount < input.challengeCount) {
    return `チャレンジあと${Math.max(0, input.challengeCount - input.completedCount)}`;
  }

  if (challengeScore + buildScore < 100) {
    return 'もう少しで熟練アップ';
  }

  return '完全制覇';
}

export function getStageMasterySummary(input: StageMasteryInput): StageMasterySummary {
  const challengeWeight = input.stage.category === 'build' ? 60 : 100;
  const challengeRatio = input.challengeCount > 0
    ? input.completedCount / input.challengeCount
    : 0;
  const challengeScore = clampContribution(challengeRatio * challengeWeight, challengeWeight);
  const buildScore = input.stage.category === 'build'
    ? clampContribution((Math.max(0, input.buildScore ?? 0) / FINAL_BUILD_SCORE) * 40, 40)
    : 0;
  const score = clampScore(challengeScore + buildScore);
  const rank = getRank(score);
  const accent = RANK_ACCENTS[rank];

  return {
    score,
    rank,
    rankLabel: RANK_LABELS[rank],
    title: getRankTitle(input.stage.category, rank),
    nextLabel: getNextLabel(input, challengeScore, buildScore),
    accent,
    glow: rank === 'new' ? 'rgba(255,255,255,0.14)' : `${accent}38`,
    challengeScore,
    buildScore,
    mastered: rank === 'master',
  };
}
