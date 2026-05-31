// マップごとの称号チャレンジ
// 既存の記録を組み合わせ、ステージごとに極めたい遊び方を短く見せる。

import type { StageBuildScoreBest } from '../stores/useStageBuildScoreStore';
import type { StageChallengeBest } from '../stores/useStageChallengeStore';
import {
  BUILD_SCORE_MILESTONES,
  getStageBuildStyle,
} from './stageBuildStyles';
import { getStageCombatStyle } from './stageCombatStyles';
import { getStageModeRule } from './stageModeRules';
import type { StageDefinition } from './stages';

export interface StageSignatureAward {
  icon: string;
  title: string;
  label: string;
  detail: string;
  requirementLabel: string;
  progressLabel: string;
  nextLabel: string;
  accent: string;
  ratio: number;
  unlocked: boolean;
}

interface BuildSignatureConfig {
  title: string;
  label: string;
  targetScore: number;
  comboTarget?: number;
  focusTarget?: number;
}

interface WarSignatureConfig {
  title: string;
  label: string;
  modeRankTarget: number;
  streakTarget: number;
}

const FINAL_BUILD_SCORE = BUILD_SCORE_MILESTONES[BUILD_SCORE_MILESTONES.length - 1];

const BUILD_SIGNATURES: Record<string, BuildSignatureConfig> = {
  'build-forest': {
    title: '森の秘密基地職人',
    label: '木と灯りの称号',
    targetScore: FINAL_BUILD_SCORE,
    comboTarget: 4,
  },
  'build-tropical': {
    title: '南国リゾート設計士',
    label: '水辺とガラスの称号',
    targetScore: FINAL_BUILD_SCORE,
    comboTarget: 4,
  },
  'build-snow': {
    title: '氷城クラフター',
    label: '雪と光の称号',
    targetScore: FINAL_BUILD_SCORE,
    focusTarget: 3,
  },
  'build-desert': {
    title: '砂漠遺跡ビルダー',
    label: '砂と水の称号',
    targetScore: FINAL_BUILD_SCORE,
    focusTarget: 3,
  },
};

const WAR_SIGNATURES: Record<string, WarSignatureConfig> = {
  'war-forest': {
    title: '森の防衛隊長',
    label: '防衛射撃の称号',
    modeRankTarget: 2,
    streakTarget: 8,
  },
  'war-tropical': {
    title: 'ジャングル制圧手',
    label: '高速連射の称号',
    modeRankTarget: 2,
    streakTarget: 10,
  },
  'war-snow': {
    title: '極寒前線剣士',
    label: '近接持久の称号',
    modeRankTarget: 2,
    streakTarget: 7,
  },
  'war-desert': {
    title: '熱砂ロケット隊長',
    label: '遠距離爆風の称号',
    modeRankTarget: 2,
    streakTarget: 9,
  },
};

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getModeRankText(rank: number): string {
  if (rank <= 0) return '戦意Lv.0';
  return `戦意Lv.${rank}`;
}

function getBuildSignatureAward(
  stage: StageDefinition,
  buildBest: StageBuildScoreBest | undefined,
): StageSignatureAward {
  const style = getStageBuildStyle(stage.id);
  const config = BUILD_SIGNATURES[stage.id] ?? {
    title: `${stage.name}マスター`,
    label: '建築称号',
    targetScore: FINAL_BUILD_SCORE,
    comboTarget: 4,
  };
  const score = Math.max(0, Math.floor(buildBest?.score ?? 0));
  const combo = Math.max(0, Math.floor(buildBest?.bestComboChain ?? 0));
  const focus = Math.max(0, Math.floor(buildBest?.bestFocusChain ?? 0));
  const secondaryTarget = config.comboTarget ?? config.focusTarget ?? 1;
  const secondaryValue = config.comboTarget ? combo : focus;
  const secondaryShortLabel = config.comboTarget ? 'コンボ' : '高速';
  const secondaryFullLabel = config.comboTarget ? '素材コンボ' : '高速建築';
  const scoreDone = score >= config.targetScore;
  const secondaryDone = secondaryValue >= secondaryTarget;
  const unlocked = scoreDone && secondaryDone;

  return {
    icon: style?.icon ?? stage.icon,
    title: config.title,
    label: config.label,
    detail: `${style?.title ?? stage.name}を${style?.focusLabel ?? stage.rules.landmarkName}で仕上げる称号。`,
    requirementLabel: `${config.targetScore}pt + ${secondaryFullLabel}x${secondaryTarget}`,
    progressLabel: `${Math.min(score, config.targetScore)}/${config.targetScore}pt・${secondaryShortLabel}x${Math.min(secondaryValue, secondaryTarget)}/${secondaryTarget}`,
    nextLabel: unlocked
      ? '称号獲得済み'
      : !scoreDone
        ? `${config.targetScore}ptの作品BESTへ`
        : `${secondaryFullLabel}x${secondaryTarget}へ`,
    accent: style?.accent ?? stage.color,
    ratio: (clampRatio(score / config.targetScore) + clampRatio(secondaryValue / secondaryTarget)) / 2,
    unlocked,
  };
}

function getWarSignatureAward(
  stage: StageDefinition,
  runBest: StageChallengeBest | undefined,
): StageSignatureAward {
  const config = WAR_SIGNATURES[stage.id] ?? {
    title: `${stage.name}マスター`,
    label: '戦闘称号',
    modeRankTarget: 2,
    streakTarget: 8,
  };
  const modeRule = getStageModeRule(stage.id);
  const combatStyle = getStageCombatStyle(stage.id);
  const clearCount = Math.max(0, Math.floor(runBest?.clearCount ?? 0));
  const modeRank = Math.max(0, Math.floor(runBest?.bestModeFlowRank ?? 0));
  const streak = Math.max(0, Math.floor(runBest?.bestStreak ?? 0));
  const clearDone = clearCount > 0;
  const modeDone = modeRank >= config.modeRankTarget;
  const streakDone = streak >= config.streakTarget;
  const unlocked = clearDone && modeDone && streakDone;
  const meterLabel = modeRule?.meterLabel ?? '戦意';

  return {
    icon: combatStyle?.icon ?? modeRule?.icon ?? stage.icon,
    title: config.title,
    label: config.label,
    detail: `${combatStyle?.shortLabel ?? stage.rules.modeLabel}で${meterLabel}を上げ、連続撃破をつなぐ称号。`,
    requirementLabel: `CLEAR + ${getModeRankText(config.modeRankTarget)} + 連続x${config.streakTarget}`,
    progressLabel: `CLEAR ${Math.min(clearCount, 1)}/1・Lv.${Math.min(modeRank, config.modeRankTarget)}/${config.modeRankTarget}・x${Math.min(streak, config.streakTarget)}/${config.streakTarget}`,
    nextLabel: unlocked
      ? '称号獲得済み'
      : !clearDone
        ? 'まず1回クリア'
        : !modeDone
          ? `${getModeRankText(config.modeRankTarget)}へ`
          : `連続x${config.streakTarget}へ`,
    accent: combatStyle?.accent ?? modeRule?.accent ?? stage.color,
    ratio: (
      clampRatio(clearCount / 1)
      + clampRatio(modeRank / config.modeRankTarget)
      + clampRatio(streak / config.streakTarget)
    ) / 3,
    unlocked,
  };
}

export function getStageSignatureAward(args: {
  stage: StageDefinition;
  runBest?: StageChallengeBest;
  buildBest?: StageBuildScoreBest;
}): StageSignatureAward {
  return args.stage.category === 'build'
    ? getBuildSignatureAward(args.stage, args.buildBest)
    : getWarSignatureAward(args.stage, args.runBest);
}
