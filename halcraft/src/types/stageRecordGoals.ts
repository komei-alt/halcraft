// マップごとの次にねらう記録
// 既存のチャレンジ・作品BEST・ラン記録から、ステージ選択で迷わない目標を作る

import type { StageBuildScoreBest } from '../stores/useStageBuildScoreStore';
import type { StageChallengeBest } from '../stores/useStageChallengeStore';
import {
  BUILD_SCORE_MILESTONES,
  getStageBuildStyle,
} from './stageBuildStyles';
import {
  getStageChallengeMedal,
  getStageChallenges,
} from './stageChallenges';
import { getStageModeRule } from './stageModeRules';
import type { StageCategory, StageDefinition } from './stages';

export interface StageRecordGoal {
  icon: string;
  title: string;
  detail: string;
  progressLabel: string;
  trophyLabel: string;
  accent: string;
  ratio: number;
  completed: boolean;
}

interface StageRecordGoalInput {
  stage: StageDefinition;
  runBest?: StageChallengeBest;
  buildBest?: StageBuildScoreBest;
}

const MODE_FLOW_MAX_RANK = 3;

const WAR_STREAK_TARGETS: Record<string, number> = {
  'war-forest': 8,
  'war-tropical': 10,
  'war-snow': 7,
  'war-desert': 9,
};

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function formatRecordTime(seconds: number | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '未記録';
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

function getModeRankLabel(category: StageCategory, rank: number): string {
  if (rank <= 0) return category === 'build' ? '未着想' : '未点火';
  if (rank >= MODE_FLOW_MAX_RANK) return category === 'build' ? '大ひらめき' : '大戦意';
  return category === 'build' ? `ひらめきLv.${rank}` : `戦意Lv.${rank}`;
}

function getChallengeGoal(stage: StageDefinition, runBest: StageChallengeBest | undefined): StageRecordGoal | null {
  const challengeCount = getStageChallenges(stage.id).length;
  if (challengeCount <= 0) return null;

  const completedCount = runBest?.completedCount ?? 0;
  const medal = getStageChallengeMedal(completedCount, challengeCount);
  if (medal === 'gold') return null;

  const remaining = Math.max(0, challengeCount - completedCount);
  return {
    icon: '🎖️',
    title: 'GOLDチャレンジ',
    detail: `あと${remaining}個のチャレンジで、このマップの金メダルに届く。`,
    progressLabel: `${completedCount}/${challengeCount}`,
    trophyLabel: 'NEXT GOLD',
    accent: '#ffe680',
    ratio: clampRatio(completedCount / challengeCount),
    completed: false,
  };
}

function getBuildRecordGoal(input: StageRecordGoalInput): StageRecordGoal {
  const { stage, runBest, buildBest } = input;
  const style = getStageBuildStyle(stage.id);
  const score = buildBest?.score ?? 0;
  const nextMilestone = BUILD_SCORE_MILESTONES.find((milestone) => score < milestone);

  if (nextMilestone) {
    return {
      icon: style?.icon ?? stage.icon,
      title: score > 0 ? '作品BESTを伸ばす' : '初回作品記録',
      detail: style
        ? `${style.focusLabel}を使って、${nextMilestone}ptの作品記録をねらう。`
        : `${stage.rules.landmarkName}を育てて、作品記録を残す。`,
      progressLabel: `${score}/${nextMilestone}pt`,
      trophyLabel: `NEXT ${nextMilestone}pt`,
      accent: style?.accent ?? stage.color,
      ratio: clampRatio(score / nextMilestone),
      completed: false,
    };
  }

  const challengeGoal = getChallengeGoal(stage, runBest);
  if (challengeGoal) return challengeGoal;

  return {
    icon: '👑',
    title: '作品MASTER更新',
    detail: `完成済みの作品をさらに広げて、${stage.rules.landmarkName}の最高スコアを更新する。`,
    progressLabel: `BEST ${score}pt`,
    trophyLabel: 'MASTER',
    accent: '#a6ffcf',
    ratio: 1,
    completed: true,
  };
}

function getWarRecordGoal(input: StageRecordGoalInput): StageRecordGoal {
  const { stage, runBest } = input;
  const targetCount = stage.rules.objective.targetCount ?? 1;

  if (!runBest?.clearCount) {
    return {
      icon: stage.icon,
      title: '初回クリア記録',
      detail: `${stage.rules.objective.title}を最後まで進めて、このマップのBESTタイムを作る。`,
      progressLabel: `0/${targetCount}体`,
      trophyLabel: 'FIRST CLEAR',
      accent: '#ffb36d',
      ratio: 0,
      completed: false,
    };
  }

  const challengeGoal = getChallengeGoal(stage, runBest);
  if (challengeGoal) return challengeGoal;

  const modeRule = getStageModeRule(stage.id);
  const bestModeRank = runBest.bestModeFlowRank ?? 0;
  if (modeRule && bestModeRank < MODE_FLOW_MAX_RANK) {
    const nextRank = Math.min(MODE_FLOW_MAX_RANK, bestModeRank + 1);
    return {
      icon: modeRule.icon,
      title: `${modeRule.meterLabel}記録を伸ばす`,
      detail: `${modeRule.actionLabel}で${getModeRankLabel(modeRule.category, nextRank)}をねらう。`,
      progressLabel: `${getModeRankLabel(modeRule.category, bestModeRank)} → ${getModeRankLabel(modeRule.category, nextRank)}`,
      trophyLabel: `NEXT ${getModeRankLabel(modeRule.category, nextRank)}`,
      accent: modeRule.accent,
      ratio: clampRatio(bestModeRank / MODE_FLOW_MAX_RANK),
      completed: false,
    };
  }

  const streakTarget = WAR_STREAK_TARGETS[stage.id] ?? 8;
  const bestStreak = runBest.bestStreak ?? 0;
  if (bestStreak < streakTarget) {
    return {
      icon: '⚡',
      title: '連続撃破記録',
      detail: `敵を途切れず倒して、${streakTarget}連続のマップ記録をねらう。`,
      progressLabel: `BEST x${bestStreak}/${streakTarget}`,
      trophyLabel: `NEXT x${streakTarget}`,
      accent: '#fff1a8',
      ratio: clampRatio(bestStreak / streakTarget),
      completed: false,
    };
  }

  return {
    icon: '🏁',
    title: 'BESTタイム更新',
    detail: '金メダルと大戦意は達成済み。次はボス撃破までのタイムを縮める。',
    progressLabel: `BEST ${formatRecordTime(runBest.bestClearSeconds)}`,
    trophyLabel: 'TIME ATTACK',
    accent: '#a6ffcf',
    ratio: 1,
    completed: true,
  };
}

export function getStageRecordGoal(input: StageRecordGoalInput): StageRecordGoal {
  return input.stage.category === 'build'
    ? getBuildRecordGoal(input)
    : getWarRecordGoal(input);
}
