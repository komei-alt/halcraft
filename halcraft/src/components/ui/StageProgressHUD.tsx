// ステージ進行HUD
// 選んだマップごとの目的・進行・ランドマークを常時見える状態にする

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useStageBuildScoreStore, type StageBuildScoreBest } from '../../stores/useStageBuildScoreStore';
import { useStageChallengeStore, type StageChallengeBest } from '../../stores/useStageChallengeStore';
import { useStageConditionStore } from '../../stores/useStageConditionStore';
import { useStageEventStore } from '../../stores/useStageEventStore';
import {
  getModeFlowRank,
  getModeFlowRankLabel,
  useModeFlowStore,
} from '../../stores/useModeFlowStore';
import { useMobStore } from '../../stores/useMobStore';
import { usePlayerStore, type EquippedItem } from '../../stores/usePlayerStore';
import { useVehicleStore } from '../../stores/useVehicleStore';
import {
  getStageBossEncounter,
  getStageBossEncounterById,
} from '../../types/stageBossEncounters';
import {
  getStageChallengeProgress,
  getStageChallenges,
  type StageChallengeStats,
} from '../../types/stageChallenges';
import { getStageCondition } from '../../types/stageConditions';
import { getStageEnemyProfile } from '../../types/stageEnemyProfiles';
import {
  BUILD_SCORE_MILESTONES,
  formatStageBuildFocus,
  getNextStageBuildMilestone,
  getStageBuildStyle,
} from '../../types/stageBuildStyles';
import {
  formatStageCombatBonus,
  getStageCombatStyle,
  getStageCombatWeaponLabel,
} from '../../types/stageCombatStyles';
import { getStageEvent } from '../../types/stageEvents';
import type { StageDefinition } from '../../types/stages';
import {
  formatStageLandmarkNavigation,
  getStageLandmarkBriefing,
  getStageLandmarkDistance,
  STAGE_LANDMARK_RADIUS,
} from '../../types/stageLandmarks';
import { formatStageModeReward, getStageModeRule } from '../../types/stageModeRules';
import { getStageSignatureAward, type StageSignatureAward } from '../../types/stageSignatureAwards';
import { useSimpleHud } from '../../utils/hudDensity';
import {
  playPerkUnlockSound,
  playStageOpportunitySound,
  type StageOpportunitySoundKind,
} from '../../utils/sounds';
import { getStageEventHudDisplay } from './stageEventDisplay';
import { HUD_TEXT_SHADOW, SG } from './startScreenTheme';

function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

interface StageGuidance {
  icon: string;
  label: string;
  detail: string;
  accent: string;
  progressText: string;
}

interface StageRecordTarget {
  icon: string;
  label: string;
  detail: string;
  accent: string;
  valueText: string;
  ratio: number;
}

interface StageOpportunityCue {
  id: string;
  icon: string;
  label: string;
  detail: string;
  accent: string;
  valueText: string;
  ratio: number;
  momentLabel: string;
  soundKind: StageOpportunitySoundKind;
}

interface StageOpportunityCandidate {
  cue: StageOpportunityCue;
  priority: number;
}

interface StageRouteStep {
  icon: string;
  label: string;
  detail: string;
  valueText: string;
  accent: string;
  ratio: number;
}

interface StageOpportunityMoment {
  key: string;
  cue: StageOpportunityCue;
  stageName: string;
  visibleUntil: number;
}

interface StageSignatureMoment {
  key: string;
  award: StageSignatureAward;
  stageName: string;
  visibleUntil: number;
}

const FINAL_BUILD_SCORE = BUILD_SCORE_MILESTONES[BUILD_SCORE_MILESTONES.length - 1];
const OPPORTUNITY_RATIO = 0.68;
const STAGE_OPPORTUNITY_MOMENT_MS = 2800;
const STAGE_SIGNATURE_MOMENT_MS = 4400;

function isCloseToTarget(current: number, target: number): boolean {
  if (target <= 0 || current <= 0) return false;
  const remaining = Math.max(0, target - current);
  return current / target >= OPPORTUNITY_RATIO || remaining <= Math.max(1, Math.ceil(target * 0.22));
}

function getChallengeGuidance(
  stage: StageDefinition,
  stats: StageChallengeStats,
  completedIds: string[],
): StageGuidance | null {
  const candidates = getStageChallenges(stage.id)
    .map((challenge, index) => ({
      challenge,
      index,
      progress: getStageChallengeProgress(challenge, stats),
    }))
    .filter(({ challenge, progress }) => !progress.completed && !completedIds.includes(challenge.id))
    .sort((a, b) => b.progress.ratio - a.progress.ratio || a.index - b.index);

  const next = candidates[0];
  if (!next) return null;

  const remaining = Math.max(0, next.progress.target - next.progress.current);
  return {
    icon: next.challenge.icon,
    label: next.challenge.title,
    detail: next.challenge.description,
    accent: next.challenge.accent,
    progressText: `あと${remaining}`,
  };
}

function getConditionGuidance(stage: StageDefinition, charge: number): StageGuidance | null {
  const condition = getStageCondition(stage.id);
  if (!condition) return null;

  const remaining = Math.max(0, condition.target - charge);
  return {
    icon: condition.icon,
    label: condition.title,
    detail: `${condition.triggerLabel}で${condition.effect.label}を発動`,
    accent: condition.accent,
    progressText: `あと${remaining}`,
  };
}

function getObjectiveGuidance(
  stage: StageDefinition,
  enemiesDefeated: number,
  bossSpawned: boolean,
): StageGuidance {
  const target = stage.rules.objective.targetCount;

  if (stage.category === 'war' && target) {
    if (bossSpawned) {
      return {
        icon: '👑',
        label: 'ボス決着',
        detail: '出現した巨大ボスに火力を集中',
        accent: '#ffdd66',
        progressText: '決戦',
      };
    }

    const remaining = Math.max(0, target - enemiesDefeated);
    return {
      icon: stage.icon,
      label: stage.rules.objective.title,
      detail: stage.rules.objective.description,
      accent: '#ffb36d',
      progressText: `ボスまで${remaining}`,
    };
  }

  return {
    icon: stage.icon,
    label: stage.rules.objective.prompts[0] ?? stage.rules.objective.title,
    detail: stage.rules.objective.description,
    accent: '#9bdcff',
    progressText: stage.rules.landmarkName,
  };
}

function getBuildScoreGuidance(
  stage: StageDefinition,
  score: number,
  achievedMilestones: number[],
  comboChain: number,
  lastPlacementLabel: string | null,
  lastPlacementPoints: number,
  lastComboBonus: number,
  lastFocusBonus: number,
): StageGuidance | null {
  const style = getStageBuildStyle(stage.id);
  if (!style) return null;

  const nextMilestone = getNextStageBuildMilestone(score, achievedMilestones);
  const progressText = nextMilestone
    ? `あと${Math.max(0, nextMilestone - score)}pt`
    : '完成度MAX';

  return {
    icon: style.icon,
    label: `${style.shortLabel} ${score}pt`,
    detail: lastPlacementLabel
      ? [
          `${lastPlacementLabel}+${lastPlacementPoints}`,
          lastComboBonus > 0 ? `多素材+${lastComboBonus}` : null,
          lastFocusBonus > 0 ? `連置+${lastFocusBonus}` : null,
        ].filter(Boolean).join(' / ') || `${lastPlacementLabel}+${lastPlacementPoints}`
      : `${formatStageBuildFocus(style, 3)}で作品評価アップ`,
    accent: style.accent,
    progressText: comboChain > 0 ? `コンボx${comboChain}` : progressText,
  };
}

function getCombatStyleGuidance(
  stage: StageDefinition,
  equippedItem: EquippedItem,
  swapLabel: string,
): StageGuidance | null {
  if (stage.category !== 'war') return null;
  const style = getStageCombatStyle(stage.id);
  if (!style || style.weapon === equippedItem) return null;

  return {
    icon: style.icon,
    label: `${getStageCombatWeaponLabel(style.weapon)}へ切替`,
    detail: `${style.shortLabel}: ${formatStageCombatBonus(style)}`,
    accent: style.accent,
    progressText: swapLabel,
  };
}

function getStageGuidance(
  stage: StageDefinition,
  stats: StageChallengeStats,
  completedIds: string[],
  charge: number,
  enemiesDefeated: number,
  bossSpawned: boolean,
  buildScore: number,
  buildMilestones: number[],
  buildComboChain: number,
  lastPlacementLabel: string | null,
  lastPlacementPoints: number,
  lastComboBonus: number,
  lastFocusBonus: number,
  equippedItem: EquippedItem,
  swapLabel: string,
): StageGuidance {
  const challengeGuidance = getChallengeGuidance(stage, stats, completedIds);
  const conditionGuidance = getConditionGuidance(stage, charge);
  const buildScoreGuidance = getBuildScoreGuidance(
    stage,
    buildScore,
    buildMilestones,
    buildComboChain,
    lastPlacementLabel,
    lastPlacementPoints,
    lastComboBonus,
    lastFocusBonus,
  );
  const combatStyleGuidance = getCombatStyleGuidance(stage, equippedItem, swapLabel);
  const condition = getStageCondition(stage.id);
  const conditionClose = Boolean(
    condition && charge > 0 && condition.target - charge <= Math.ceil(condition.target * 0.35),
  );

  if (conditionClose && conditionGuidance) return conditionGuidance;
  if (stage.category === 'build') {
    return buildScoreGuidance ?? challengeGuidance ?? conditionGuidance ?? getObjectiveGuidance(stage, enemiesDefeated, bossSpawned);
  }
  return combatStyleGuidance ?? challengeGuidance ?? getObjectiveGuidance(stage, enemiesDefeated, bossSpawned);
}

function getStageRecordTarget(args: {
  stage: StageDefinition;
  elapsedSeconds: number;
  enemiesDefeated: number;
  targetCount: number | null;
  buildScore: number;
  buildBest: StageBuildScoreBest | undefined;
  runBest: StageChallengeBest | undefined;
  modeRule: ReturnType<typeof getStageModeRule>;
  modeFlowRank: number;
}): StageRecordTarget {
  if (args.stage.category === 'build') {
    const bestScore = args.buildBest?.score ?? 0;
    if (bestScore > 0) {
      const isNewBest = args.buildScore > bestScore;
      const remaining = Math.max(0, bestScore - args.buildScore);
      return {
        icon: isNewBest ? '🏆' : '📐',
        label: isNewBest ? '作品BEST更新中' : '作品BESTを追う',
        detail: `記録 ${bestScore}pt / 今回 ${args.buildScore}pt`,
        accent: isNewBest ? '#fff1a8' : '#9bdcff',
        valueText: isNewBest ? 'NEW' : `あと${remaining}pt`,
        ratio: bestScore > 0 ? Math.min(1, args.buildScore / bestScore) : 0,
      };
    }

    return {
      icon: '📐',
      label: '初回作品記録',
      detail: 'テーマ素材を置くと、このマップの作品BESTが残る',
      accent: '#9bdcff',
      valueText: `${args.buildScore}pt`,
      ratio: Math.min(1, args.buildScore / FINAL_BUILD_SCORE),
    };
  }

  const bestSeconds = args.runBest?.bestClearSeconds;
  const clearCount = args.runBest?.clearCount ?? 0;
  if (typeof bestSeconds === 'number' && clearCount > 0) {
    const delta = bestSeconds - args.elapsedSeconds;
    const isBestPace = delta >= 0;
    const bestModeRank = args.runBest?.bestModeFlowRank ?? 0;
    const bestRankLabel = args.modeRule && bestModeRank > 0
      ? getModeFlowRankLabel(args.modeRule.category, bestModeRank)
      : '未点火';
    const currentRankLabel = args.modeRule && args.modeFlowRank > 0
      ? getModeFlowRankLabel(args.modeRule.category, args.modeFlowRank)
      : null;

    return {
      icon: isBestPace ? '🏁' : '⏱️',
      label: isBestPace ? 'BEST更新ペース' : 'リベンジ目標',
      detail: currentRankLabel
        ? `BEST ${formatElapsed(bestSeconds)} / 最高${bestRankLabel} / 今回${currentRankLabel}`
        : `BEST ${formatElapsed(bestSeconds)} / 最高${bestRankLabel} / クリア${clearCount}回`,
      accent: isBestPace ? '#fff1a8' : '#ffb36d',
      valueText: isBestPace ? `残り${formatElapsed(delta)}` : `+${formatElapsed(-delta)}`,
      ratio: args.targetCount ? Math.min(1, args.enemiesDefeated / args.targetCount) : 0,
    };
  }

  return {
    icon: '🏁',
    label: '初回クリア記録',
    detail: 'ボス撃破まで進めると、このマップのBESTタイムが残る',
    accent: '#ffb36d',
    valueText: `${args.enemiesDefeated}/${args.targetCount ?? '-'}`,
    ratio: args.targetCount ? Math.min(1, args.enemiesDefeated / args.targetCount) : 0,
  };
}

function getStageOpportunityCue(args: {
  stage: StageDefinition;
  stats: StageChallengeStats;
  completedIds: string[];
  modeRule: ReturnType<typeof getStageModeRule>;
  modeMeter: number;
  modeActivationCount: number;
  elapsedSeconds: number;
  buildScore: number;
  buildMilestones: number[];
  buildComboChain: number;
  enemiesDefeated: number;
  targetCount: number | null;
  bossSpawned: boolean;
  bossHpRatio: number | null;
  bossWeakness: string | null;
  bossAccent: string | null;
  signatureAward: StageSignatureAward;
}): StageOpportunityCue | null {
  const candidates: StageOpportunityCandidate[] = [];

  if (args.bossHpRatio !== null && args.bossHpRatio <= 0.35) {
    const bossPercent = Math.ceil(args.bossHpRatio * 100);
    candidates.push({
      priority: 100,
      cue: {
        id: `boss:${args.stage.id}:${args.bossWeakness ?? 'finish'}`,
        icon: '👑',
        label: 'ボス撃破チャンス',
        detail: args.bossWeakness ? `弱点「${args.bossWeakness}」へ火力を集中` : 'いま押し切ればクリア記録が伸びる',
        accent: args.bossAccent ?? '#ffdd66',
        valueText: `${bossPercent}%`,
        ratio: 1 - args.bossHpRatio,
        momentLabel: '決着の一撃',
        soundKind: 'boss',
      },
    });
  }

  const challenge = getStageChallenges(args.stage.id)
    .map((definition, index) => ({
      definition,
      index,
      progress: getStageChallengeProgress(definition, args.stats),
    }))
    .filter(({ definition, progress }) => {
      if (args.completedIds.includes(definition.id) || progress.completed) return false;
      return isCloseToTarget(progress.current, progress.target);
    })
    .sort((a, b) => b.progress.ratio - a.progress.ratio || a.index - b.index)[0];

  if (challenge) {
    const remaining = Math.max(0, challenge.progress.target - challenge.progress.current);
    candidates.push({
      priority: 80,
      cue: {
        id: `challenge:${challenge.definition.id}`,
        icon: challenge.definition.icon,
        label: 'チャレンジ目前',
        detail: `${challenge.definition.title}: ${challenge.definition.description}`,
        accent: challenge.definition.accent,
        valueText: `あと${remaining}`,
        ratio: challenge.progress.ratio,
        momentLabel: 'あと一歩で達成',
        soundKind: args.stage.category === 'build' ? 'build' : 'war',
      },
    });
  }

  if (args.modeRule) {
    const remaining = Math.max(0, Math.ceil(args.modeRule.threshold - args.modeMeter));
    const ratio = Math.max(0, Math.min(1, args.modeMeter / args.modeRule.threshold));
    if (isCloseToTarget(args.modeMeter, args.modeRule.threshold)) {
      const nextRank = getModeFlowRank(args.modeActivationCount + 1) || 1;
      candidates.push({
        priority: 70,
        cue: {
          id: `mode:${args.modeRule.stageId}:${args.modeActivationCount + 1}`,
          icon: args.modeRule.icon,
          label: `${args.modeRule.meterLabel}発動目前`,
          detail: `${args.modeRule.actionLabel}で${getModeFlowRankLabel(args.modeRule.category, nextRank)}へ`,
          accent: args.modeRule.accent,
          valueText: `あと${remaining}`,
          ratio,
          momentLabel: '今ため切る',
          soundKind: args.modeRule.category === 'build' ? 'build' : 'war',
        },
      });
    }
  }

  if (!args.signatureAward.unlocked && args.signatureAward.ratio >= 0.58) {
    candidates.push({
      priority: args.signatureAward.ratio >= OPPORTUNITY_RATIO ? 72 : 52,
      cue: {
        id: `signature:${args.stage.id}:${Math.floor(args.signatureAward.ratio * 10)}`,
        icon: args.signatureAward.icon,
        label: '称号目前',
        detail: `${args.signatureAward.title}: ${args.signatureAward.nextLabel}`,
        accent: args.signatureAward.accent,
        valueText: `${Math.round(args.signatureAward.ratio * 100)}%`,
        ratio: args.signatureAward.ratio,
        momentLabel: 'マップ称号へあと少し',
        soundKind: args.stage.category === 'build' ? 'build' : 'war',
      },
    });
  }

  if (args.stage.category === 'build') {
    const style = getStageBuildStyle(args.stage.id);
    const nextMilestone = getNextStageBuildMilestone(args.buildScore, args.buildMilestones);
    if (style && nextMilestone && isCloseToTarget(args.buildScore, nextMilestone)) {
      const remaining = Math.max(0, nextMilestone - args.buildScore);
      candidates.push({
        priority: args.buildComboChain >= 3 ? 75 : 60,
        cue: {
          id: `build:${args.stage.id}:${nextMilestone}`,
          icon: style.icon,
          label: '作品節目前',
          detail: `${style.shortLabel}を重ねて${nextMilestone}ptの作品記録へ`,
          accent: style.accent,
          valueText: args.buildComboChain > 0 ? `コンボx${args.buildComboChain}` : `あと${remaining}pt`,
          ratio: Math.min(1, args.buildScore / nextMilestone),
          momentLabel: '節目へつなぐ',
          soundKind: 'build',
        },
      });
    }
  }

  if (
    args.stage.category === 'war' &&
    args.targetCount &&
    !args.bossSpawned &&
    isCloseToTarget(args.enemiesDefeated, args.targetCount)
  ) {
    const remaining = Math.max(0, args.targetCount - args.enemiesDefeated);
    candidates.push({
      priority: 55,
      cue: {
        id: `boss-spawn:${args.stage.id}`,
        icon: args.stage.icon,
        label: 'ボス出現目前',
        detail: args.stage.rules.objective.description,
        accent: '#ffdd66',
        valueText: `あと${remaining}体`,
        ratio: Math.min(1, args.enemiesDefeated / args.targetCount),
        momentLabel: '次の撃破で決戦',
        soundKind: 'war',
      },
    });
  }

  if (candidates.length === 0 && args.elapsedSeconds <= 12) {
    if (args.stage.category === 'build') {
      const style = getStageBuildStyle(args.stage.id);
      candidates.push({
        priority: 10,
        cue: {
          id: `first-build:${args.stage.id}`,
          icon: style?.icon ?? args.stage.icon,
          label: '初回作品チャンス',
          detail: style
            ? `${formatStageBuildFocus(style, 3)}を置いて作品記録を作る`
            : `${args.stage.rules.landmarkName}を育てて作品記録を作る`,
          accent: style?.accent ?? args.stage.color,
          valueText: 'START',
          ratio: 0.08,
          momentLabel: '最初の記録を作る',
          soundKind: 'build',
        },
      });
    } else {
      candidates.push({
        priority: 10,
        cue: {
          id: `first-clear:${args.stage.id}`,
          icon: args.stage.icon,
          label: '初回クリアチャンス',
          detail: `${args.stage.rules.objective.title}を進めてBESTタイムの基準を作る`,
          accent: '#ffdd66',
          valueText: args.targetCount ? `0/${args.targetCount}` : 'START',
          ratio: 0.08,
          momentLabel: '最初の記録を作る',
          soundKind: 'war',
        },
      });
    }
  }

  return candidates.sort((a, b) => b.priority - a.priority || b.cue.ratio - a.cue.ratio)[0]?.cue ?? null;
}

function getStageRouteSteps(args: {
  stage: StageDefinition;
  modeRule: ReturnType<typeof getStageModeRule>;
  modeMeter: number;
  buildScore: number;
  buildComboChain: number;
  enemiesDefeated: number;
  targetCount: number | null;
  bossSpawned: boolean;
  bossHpPercent: number | null;
  signatureAward: StageSignatureAward;
}): StageRouteStep[] {
  const {
    stage,
    modeRule,
    modeMeter,
    buildScore,
    buildComboChain,
    enemiesDefeated,
    targetCount,
    bossSpawned,
    bossHpPercent,
    signatureAward,
  } = args;
  const buildStyle = getStageBuildStyle(stage.id);
  const combatStyle = getStageCombatStyle(stage.id);
  const steps: StageRouteStep[] = [];

  if (stage.category === 'build') {
    steps.push({
      icon: buildStyle?.icon ?? stage.icon,
      label: '今つくる',
      detail: buildStyle
        ? `${formatStageBuildFocus(buildStyle, 2)}を置いて作品点を伸ばす`
        : stage.rules.objective.prompts[0] ?? stage.rules.objective.title,
      valueText: buildComboChain > 0 ? `連置x${buildComboChain}` : `${buildScore}pt`,
      accent: buildStyle?.accent ?? stage.color,
      ratio: Math.min(1, buildScore / FINAL_BUILD_SCORE),
    });
  } else {
    const targetRatio = targetCount ? Math.min(1, enemiesDefeated / targetCount) : 0;
    steps.push({
      icon: combatStyle?.icon ?? stage.icon,
      label: bossSpawned ? 'ボス集中' : '今攻める',
      detail: combatStyle
        ? `${getStageCombatWeaponLabel(combatStyle.weapon)}で${combatStyle.shortLabel}`
        : stage.rules.objective.description,
      valueText: bossHpPercent !== null
        ? `${bossHpPercent}%`
        : targetCount
          ? `${enemiesDefeated}/${targetCount}`
          : 'FIGHT',
      accent: combatStyle?.accent ?? '#ffb36d',
      ratio: bossHpPercent !== null ? 1 - bossHpPercent / 100 : targetRatio,
    });
  }

  if (modeRule) {
    const modeRemaining = Math.max(0, Math.ceil(modeRule.threshold - modeMeter));
    steps.push({
      icon: modeRule.icon,
      label: modeRule.category === 'build' ? 'ひらめき' : '戦意',
      detail: `${modeRule.actionLabel} / 発動: ${formatStageModeReward(modeRule)}`,
      valueText: modeRemaining > 0 ? `あと${modeRemaining}` : '発動',
      accent: modeRule.accent,
      ratio: Math.max(0, Math.min(1, modeMeter / modeRule.threshold)),
    });
  }

  steps.push({
    icon: signatureAward.icon,
    label: '称号',
    detail: signatureAward.unlocked
      ? `${signatureAward.title} 獲得済み`
      : `${signatureAward.title}: ${signatureAward.nextLabel}`,
    valueText: `${Math.round(signatureAward.ratio * 100)}%`,
    accent: signatureAward.accent,
    ratio: signatureAward.ratio,
  });

  return steps.slice(0, 3);
}

function StageOpportunityMomentAnnouncer({
  cue,
  stageName,
  runKey,
  isCompact,
}: {
  cue: StageOpportunityCue | null;
  stageName: string;
  runKey: string;
  isCompact: boolean;
}) {
  const [now, setNow] = useState(() => performance.now());
  const [moment, setMoment] = useState<StageOpportunityMoment | null>(null);
  const announcedKeysRef = useRef<Set<string>>(new Set());
  const runKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (runKeyRef.current !== runKey) {
      runKeyRef.current = runKey;
      announcedKeysRef.current = new Set();
    }

    if (!cue) return undefined;
    const shouldAnnounce = cue.soundKind === 'boss' || cue.ratio >= OPPORTUNITY_RATIO;
    if (!shouldAnnounce) return undefined;

    const announceKey = `${runKey}:${cue.id}`;
    if (announcedKeysRef.current.has(announceKey)) return undefined;
    announcedKeysRef.current.add(announceKey);

    const timer = window.setTimeout(() => {
      const nowMs = performance.now();
      setNow(nowMs);
      setMoment({
        key: announceKey,
        cue,
        stageName,
        visibleUntil: nowMs + STAGE_OPPORTUNITY_MOMENT_MS,
      });
      playStageOpportunitySound(cue.soundKind);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [cue, runKey, stageName]);

  useEffect(() => {
    if (!moment) return undefined;
    const timer = window.setInterval(() => setNow(performance.now()), 120);
    return () => window.clearInterval(timer);
  }, [moment]);

  if (!moment || !moment.key.startsWith(`${runKey}:`) || now > moment.visibleUntil) return null;

  const progress = Math.max(0, Math.min(1, (moment.visibleUntil - now) / STAGE_OPPORTUNITY_MOMENT_MS));

  return (
    <div
      id="stage-opportunity-moment"
      data-opportunity-id={moment.cue.id}
      style={{
        position: 'fixed',
        top: isCompact ? 112 : 94,
        left: '50%',
        zIndex: 111,
        width: isCompact ? 'min(318px, calc(100vw - 26px))' : 390,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        color: '#fff',
        textShadow: HUD_TEXT_SHADOW,
        fontFamily: SG.font,
        animation: 'stageOpportunityMomentIn 0.24s ease-out both',
      }}
    >
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          padding: isCompact ? '10px 12px' : '12px 14px',
          borderRadius: 8,
          border: `1px solid ${moment.cue.accent}77`,
          background: `linear-gradient(135deg, ${moment.cue.accent}2e, rgba(4,7,12,0.72))`,
          boxShadow: `0 14px 34px rgba(0,0,0,0.42), 0 0 30px ${moment.cue.accent}45`,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(112deg, transparent, ${moment.cue.accent}38, transparent)`,
            transform: 'translateX(-70%)',
            animation: 'stageOpportunityMomentSweep 1.05s ease-out both',
          }}
        />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span
            style={{
              flex: '0 0 auto',
              width: isCompact ? 38 : 44,
              height: isCompact ? 38 : 44,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 8,
              background: `${moment.cue.accent}26`,
              border: `1px solid ${moment.cue.accent}66`,
              boxShadow: `0 0 16px ${moment.cue.accent}66`,
              fontSize: isCompact ? 22 : 25,
            }}
          >
            {moment.cue.icon}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                color: moment.cue.accent,
                fontSize: isCompact ? 9 : 10,
                lineHeight: '12px',
                fontWeight: 950,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              記録チャンス到来 / {moment.stageName}
            </div>
            <div
              style={{
                marginTop: 3,
                color: '#fff',
                fontSize: isCompact ? 14 : 16,
                lineHeight: isCompact ? '17px' : '20px',
                fontWeight: 950,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {moment.cue.momentLabel}: {moment.cue.label}
            </div>
            <div
              style={{
                marginTop: 4,
                color: 'rgba(255,255,255,0.68)',
                fontSize: isCompact ? 10 : 11,
                lineHeight: '14px',
                fontWeight: 850,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {moment.cue.detail}
            </div>
          </div>
          <span
            style={{
              flex: '0 0 auto',
              color: '#fff1a8',
              fontSize: isCompact ? 12 : 13,
              lineHeight: '15px',
              fontWeight: 950,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {moment.cue.valueText}
          </span>
        </div>
        <div
          style={{
            position: 'relative',
            marginTop: 8,
            height: 4,
            borderRadius: 999,
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.14)',
          }}
        >
          <div
            style={{
              width: `${Math.round(progress * 100)}%`,
              height: '100%',
              borderRadius: 999,
              background: `linear-gradient(90deg, ${moment.cue.accent}, #fff1a8)`,
              transition: 'width 0.12s linear',
            }}
          />
        </div>
      </div>
    </div>
  );
}

function StageSignatureMomentAnnouncer({
  award,
  stageName,
  runKey,
  isCompact,
}: {
  award: StageSignatureAward;
  stageName: string;
  runKey: string;
  isCompact: boolean;
}) {
  const [now, setNow] = useState(() => performance.now());
  const [moment, setMoment] = useState<StageSignatureMoment | null>(null);
  const baselineRef = useRef<{
    runKey: string;
    unlocked: boolean;
  } | null>(null);

  useEffect(() => {
    if (baselineRef.current?.runKey !== runKey) {
      baselineRef.current = {
        runKey,
        unlocked: award.unlocked,
      };
      return undefined;
    }

    if (baselineRef.current.unlocked || !award.unlocked) return undefined;

    baselineRef.current = {
      runKey,
      unlocked: true,
    };

    const timer = window.setTimeout(() => {
      const nowMs = performance.now();
      setNow(nowMs);
      setMoment({
        key: `${runKey}:signature:${award.title}:${Math.round(nowMs)}`,
        award,
        stageName,
        visibleUntil: nowMs + STAGE_SIGNATURE_MOMENT_MS,
      });
      playPerkUnlockSound();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [award, runKey, stageName]);

  useEffect(() => {
    if (!moment) return undefined;
    const timer = window.setInterval(() => setNow(performance.now()), 120);
    return () => window.clearInterval(timer);
  }, [moment]);

  if (!moment || !moment.key.startsWith(`${runKey}:`) || now > moment.visibleUntil) return null;

  const progress = Math.max(0, Math.min(1, (moment.visibleUntil - now) / STAGE_SIGNATURE_MOMENT_MS));

  return (
    <div
      id="stage-signature-moment"
      style={{
        position: 'fixed',
        top: isCompact ? 158 : 138,
        left: '50%',
        zIndex: 113,
        width: isCompact ? 'min(318px, calc(100vw - 26px))' : 420,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        color: '#fff',
        textShadow: HUD_TEXT_SHADOW,
        fontFamily: SG.font,
        animation: 'stageOpportunityMomentIn 0.24s ease-out both',
      }}
    >
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          padding: isCompact ? '11px 12px' : '13px 15px',
          borderRadius: 8,
          border: `1px solid ${moment.award.accent}88`,
          background: `linear-gradient(135deg, ${moment.award.accent}30, rgba(255,230,128,0.14), rgba(4,7,12,0.76))`,
          boxShadow: `0 14px 34px rgba(0,0,0,0.42), 0 0 34px ${moment.award.accent}52`,
          backdropFilter: 'blur(11px)',
          WebkitBackdropFilter: 'blur(11px)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(112deg, transparent, ${moment.award.accent}38, rgba(255,255,255,0.22), transparent)`,
            transform: 'translateX(-70%)',
            animation: 'stageOpportunityMomentSweep 1.15s ease-out both',
          }}
        />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span
            style={{
              flex: '0 0 auto',
              width: isCompact ? 40 : 46,
              height: isCompact ? 40 : 46,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 9,
              background: `${moment.award.accent}28`,
              border: `1px solid ${moment.award.accent}77`,
              boxShadow: `0 0 18px ${moment.award.accent}66`,
              fontSize: isCompact ? 23 : 27,
            }}
          >
            {moment.award.icon}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                color: moment.award.accent,
                fontSize: isCompact ? 9 : 10,
                lineHeight: '12px',
                fontWeight: 950,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              マップ称号GET / {moment.stageName}
            </div>
            <div
              style={{
                marginTop: 3,
                color: '#fff',
                fontSize: isCompact ? 15 : 18,
                lineHeight: isCompact ? '18px' : '22px',
                fontWeight: 950,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {moment.award.title}
            </div>
            <div
              style={{
                marginTop: 4,
                color: 'rgba(255,255,255,0.7)',
                fontSize: isCompact ? 10 : 11,
                lineHeight: '14px',
                fontWeight: 850,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {moment.award.requirementLabel} 達成 / {moment.award.label}
            </div>
          </div>
          <span
            style={{
              flex: '0 0 auto',
              color: '#fff1a8',
              fontSize: isCompact ? 13 : 15,
              lineHeight: '18px',
              fontWeight: 950,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
            }}
          >
            100%
          </span>
        </div>
        <div
          style={{
            position: 'relative',
            marginTop: 9,
            height: 4,
            borderRadius: 999,
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.14)',
          }}
        >
          <div
            style={{
              width: `${Math.round(progress * 100)}%`,
              height: '100%',
              borderRadius: 999,
              background: `linear-gradient(90deg, ${moment.award.accent}, #fff1a8, #ffffff)`,
              transition: 'width 0.12s linear',
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function StageProgressHUD() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);
  const runId = useGameStore((s) => s.runId);
  const enemiesDefeated = useGameStore((s) => s.enemiesDefeated);
  const stageElapsedSeconds = useGameStore((s) => s.stageElapsedSeconds);
  const bossSpawned = useGameStore((s) => s.bossSpawned);
  const isBuildMode = useGameStore((s) => s.isBuildMode);
  // 位置更新で 2000 行 UI を毎フレーム再レンダーしない（HP 比のみ、粗い量子化）
  const bossPresenceKey = useMobStore((s) => {
    const boss = s.mobs.find((mob) => mob.type === 'boss_giant');
    if (!boss) return '';
    const hpRatio = Math.round((boss.hp / Math.max(1, boss.maxHp)) * 50) / 50;
    return `${boss.bossEncounterId ?? ''}|${hpRatio}`;
  });
  const bossPresence = useMemo(() => {
    if (!bossPresenceKey) return null as null | { encounterId?: Parameters<typeof getStageBossEncounterById>[0]; hpRatio: number };
    const [encounterId, hpRatioRaw] = bossPresenceKey.split('|');
    const known = getStageBossEncounterById(
      encounterId ? (encounterId as Parameters<typeof getStageBossEncounterById>[0]) : undefined,
    );
    return {
      encounterId: known?.id,
      hpRatio: Number(hpRatioRaw),
    };
  }, [bossPresenceKey]);
  const challengeStats = useStageChallengeStore((s) => s.stats);
  const completedChallengeIds = useStageChallengeStore((s) => s.completedIds);
  const stageBestByStage = useStageChallengeStore((s) => s.bestByStage);
  const conditionCharge = useStageConditionStore((s) => s.charge);
  const buildScore = useStageBuildScoreStore((s) => s.score);
  const buildMilestones = useStageBuildScoreStore((s) => s.achievedMilestones);
  const buildStyleHits = useStageBuildScoreStore((s) => s.styleHits);
  const buildComboChain = useStageBuildScoreStore((s) => s.comboChain);
  const buildBestComboChain = useStageBuildScoreStore((s) => s.bestComboChain);
  const buildBestFocusChain = useStageBuildScoreStore((s) => s.bestFocusChain);
  const lastPlacementLabel = useStageBuildScoreStore((s) => s.lastPlacementLabel);
  const lastPlacementPoints = useStageBuildScoreStore((s) => s.lastPlacementPoints);
  const lastComboBonus = useStageBuildScoreStore((s) => s.lastComboBonus);
  const lastFocusBonus = useStageBuildScoreStore((s) => s.lastFocusBonus);
  const buildBestByStage = useStageBuildScoreStore((s) => s.bestByStage);
  const modeMeter = useModeFlowStore((s) => s.meter);
  const modeFlowRank = useModeFlowStore((s) => s.flowRank);
  const modeActivationCount = useModeFlowStore((s) => s.activationCount);
  const modeBestStreak = useModeFlowStore((s) => s.bestStreak);
  const buildFocusChain = useModeFlowStore((s) => s.buildFocusChain);
  const buildFocusChainExpiresAt = useModeFlowStore((s) => s.buildFocusChainExpiresAt);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const playerPosition = usePlayerStore((s) => s.worldPosition);
  const nextStageEventAtSeconds = useStageEventStore((s) => s.nextTriggerAtSeconds);
  const recentStageEvent = useStageEventStore((s) => s.recentEvent);
  const isSimpleHud = useSimpleHud();
  const isCompact = isSimpleHud;
  const showExtended = !isSimpleHud;
  const [eventNow, setEventNow] = useState(() => performance.now());

  useEffect(() => {
    if (phase !== 'playing') return undefined;

    const timer = window.setInterval(() => setEventNow(performance.now()), 500);
    return () => window.clearInterval(timer);
  }, [phase]);

  // 搭乗中は左上の大型進行カードを畳み、照準視界を優先
  if (phase !== 'playing' || !stage || activeVehicle !== null) return null;

  const target = stage.rules.objective.targetCount;
  const landmarkBriefing = getStageLandmarkBriefing(stage);
  const landmarkDistance = getStageLandmarkDistance(playerPosition);
  const landmarkNavigation = formatStageLandmarkNavigation(playerPosition);
  const landmarkReached = landmarkDistance !== null && landmarkDistance <= STAGE_LANDMARK_RADIUS;
  const buildStyle = getStageBuildStyle(stage.id);
  const bossEncounter = getStageBossEncounterById(bossPresence?.encounterId) ?? getStageBossEncounter(stage.id);
  const modeRule = getStageModeRule(stage.id);
  const recordTarget = getStageRecordTarget({
    stage,
    elapsedSeconds: stageElapsedSeconds,
    enemiesDefeated,
    targetCount: target,
    buildScore,
    buildBest: buildBestByStage[stage.id],
    runBest: stageBestByStage[stage.id],
    modeRule,
    modeFlowRank,
  });
  const bossHpRatio = bossPresence ? Math.max(0, Math.min(1, bossPresence.hpRatio)) : null;
  const bossHpPercent = bossHpRatio === null ? null : Math.ceil(bossHpRatio * 100);
  const hasProgressBar = Boolean(target) || Boolean(buildStyle);
  const progressRatio = target
    ? bossHpRatio ?? Math.min(1, enemiesDefeated / target)
    : buildStyle
      ? Math.min(1, buildScore / FINAL_BUILD_SCORE)
      : 0;
  const objectiveState = target
    ? bossHpPercent !== null
      ? `ボス${bossHpPercent}%`
      : bossSpawned
        ? 'ボス出現'
      : `${enemiesDefeated}/${target}`
    : buildStyle
      ? `${buildScore}pt`
      : formatElapsed(stageElapsedSeconds);
  const accent = stage.category === 'build' ? '#9bdcff' : '#ffb36d';
  const guidance: StageGuidance = bossPresence && bossEncounter
    ? {
        icon: bossEncounter.icon,
        label: bossEncounter.title,
        detail: `弱点: ${bossEncounter.weakness}`,
        accent: bossEncounter.accent,
        progressText: bossHpPercent === null ? '決戦' : `${bossHpPercent}%`,
      }
    : getStageGuidance(
        stage,
        challengeStats,
        completedChallengeIds,
        conditionCharge,
        enemiesDefeated,
        bossSpawned,
        buildScore,
        buildMilestones,
        buildComboChain,
        lastPlacementLabel,
        lastPlacementPoints,
        lastComboBonus,
        lastFocusBonus,
        equippedItem,
        'ホットバーで切替',
      );
  const buildTopMaterial = buildStyle
    ? Object.entries(buildStyleHits).sort((a, b) => b[1] - a[1])[0]
    : undefined;
  const enemyProfile = getStageEnemyProfile(stage.id);
  const eventDefinition = getStageEvent(stage.id);
  const compactStageEvent = showExtended && eventDefinition && nextStageEventAtSeconds !== null
    ? getStageEventHudDisplay(
        eventDefinition,
        stageElapsedSeconds,
        nextStageEventAtSeconds,
        recentStageEvent,
        eventNow,
      )
    : null;
  const activeBuildFocusChain = modeRule?.category === 'build' && buildFocusChainExpiresAt > eventNow
    ? buildFocusChain
    : 0;
  const signatureAward = getStageSignatureAward({
    stage,
    runBest: stageBestByStage[stage.id],
    buildBest: buildBestByStage[stage.id],
    buildProgress: stage.category === 'build'
      ? {
          score: buildScore,
          comboChain: buildBestComboChain,
          focusChain: Math.max(buildBestFocusChain, activeBuildFocusChain),
        }
      : undefined,
    warProgress: stage.category === 'war'
      ? {
          modeRank: modeFlowRank,
          streak: modeBestStreak,
        }
      : undefined,
  });
  const opportunityCue = getStageOpportunityCue({
    stage,
    stats: challengeStats,
    completedIds: completedChallengeIds,
    modeRule,
    modeMeter,
    modeActivationCount,
    elapsedSeconds: stageElapsedSeconds,
    buildScore,
    buildMilestones,
    buildComboChain,
    enemiesDefeated,
    targetCount: target,
    bossSpawned,
    bossHpRatio,
    bossWeakness: bossEncounter?.weakness ?? null,
    bossAccent: bossEncounter?.accent ?? null,
    signatureAward,
  });
  const routeSteps = getStageRouteSteps({
    stage,
    modeRule,
    modeMeter,
    buildScore,
    buildComboChain,
    enemiesDefeated,
    targetCount: target,
    bossSpawned,
    bossHpPercent,
    signatureAward,
  });
  const runKey = `${runId}:${stage.id}`;

  return (
    <>
      <StageOpportunityMomentAnnouncer
        cue={opportunityCue}
        stageName={stage.name}
        runKey={runKey}
        isCompact={isCompact}
      />
      <StageSignatureMomentAnnouncer
        award={signatureAward}
        stageName={stage.name}
        runKey={runKey}
        isCompact={isCompact}
      />
      <div
        id="stage-progress-hud"
        style={{
          position: 'fixed',
          top: isCompact ? 54 : 14,
          left: isCompact ? 14 : 64,
          zIndex: 96,
          width: isCompact ? 'min(248px, calc(100vw - 28px))' : 280,
          padding: 0,
          background: 'none',
          border: 'none',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          color: '#fff',
          pointerEvents: 'none',
          boxShadow: 'none',
          textShadow: HUD_TEXT_SHADOW,
          fontFamily: SG.font,
        }}
      >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: isCompact ? 20 : 23, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.9))' }}>{stage.icon}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              color: accent,
              fontSize: isCompact ? 10 : 11,
              fontWeight: 900,
              letterSpacing: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {stage.rules.modeLabel}
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.92)',
              fontSize: isCompact ? 13 : 15,
              fontWeight: 900,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {stage.rules.objective.title}
          </div>
        </div>
        <div
          style={{
            minWidth: isCompact ? 52 : 62,
            textAlign: 'right',
            color: target && enemiesDefeated >= target ? '#ffdd66' : '#fff',
            fontSize: isCompact ? 12 : 13,
            fontWeight: 900,
            fontFamily: 'monospace',
          }}
        >
          {objectiveState}
        </div>
      </div>

      {showExtended && (
        <div
          style={{
            marginTop: 7,
            color: 'rgba(255,255,255,0.68)',
            fontSize: 11,
            lineHeight: '15px',
          }}
        >
          {stage.rules.objective.description}
        </div>
      )}

      <div
        style={{
          marginTop: isCompact ? 6 : 8,
          paddingLeft: 9,
          borderLeft: `3px solid ${guidance.accent}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            minWidth: 0,
          }}
        >
          <span style={{ flex: '0 0 auto', fontSize: isCompact ? 12 : 13 }}>
            {guidance.icon}
          </span>
          <span
            style={{
              flex: '0 0 auto',
              color: guidance.accent,
              fontSize: isCompact ? 9 : 10,
              lineHeight: '12px',
              fontWeight: 900,
            }}
          >
            次
          </span>
          <span
            style={{
              minWidth: 0,
              flex: 1,
              color: 'rgba(255,255,255,0.9)',
              fontSize: isCompact ? 10 : 11,
              lineHeight: '13px',
              fontWeight: 900,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {guidance.label}
          </span>
          <span
            style={{
              flex: '0 0 auto',
              color: 'rgba(255,255,255,0.64)',
              fontSize: isCompact ? 9 : 10,
              lineHeight: '12px',
              fontWeight: 900,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {guidance.progressText}
          </span>
        </div>
        {showExtended && (
          <div
            style={{
              marginTop: 4,
              color: 'rgba(255,255,255,0.55)',
              fontSize: isCompact ? 9 : 10,
              lineHeight: '13px',
              fontWeight: 750,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {guidance.detail}
          </div>
        )}
      </div>

      {showExtended && (
      <div
        id="stage-landmark-route"
        style={{
          marginTop: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
          color: 'rgba(255,255,255,0.78)',
          fontSize: isCompact ? 9 : 10,
          lineHeight: isCompact ? '12px' : '13px',
          fontWeight: 900,
        }}
      >
        <span
          style={{
            flex: '0 0 auto',
            color: stage.color,
          }}
        >
          {landmarkBriefing.modeLabel}
        </span>
        <span
          style={{
            minWidth: 0,
            flex: 1,
            color: 'rgba(255,255,255,0.88)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {landmarkBriefing.name}: {landmarkReached ? landmarkBriefing.arrivalLabel : landmarkBriefing.actionLabel}
        </span>
        <span
          style={{
            flex: '0 0 auto',
            color: landmarkReached ? '#fff1a8' : 'rgba(255,255,255,0.62)',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
          }}
        >
          {landmarkNavigation}
        </span>
      </div>
      )}

      {showExtended && routeSteps.length > 0 && (
        <div
          id="stage-action-route"
          style={{
            marginTop: 7,
            padding: isCompact ? '5px 7px' : '7px 8px',
            borderRadius: 7,
            border: `1px solid ${stage.color}44`,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.055), rgba(0,0,0,0.18))',
            boxShadow: `0 0 16px ${stage.color}18`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: stage.color,
              fontSize: isCompact ? 8 : 9,
              lineHeight: '11px',
              fontWeight: 950,
              whiteSpace: 'nowrap',
            }}
          >
            <span>🧭</span>
            <span>作戦ルート</span>
            <span
              style={{
                flex: 1,
                height: 1,
                background: `linear-gradient(90deg, ${stage.color}66, transparent)`,
              }}
            />
          </div>

          {isCompact ? (
            <div
              style={{
                marginTop: 4,
                color: 'rgba(255,255,255,0.82)',
                fontSize: 9,
                lineHeight: '12px',
                fontWeight: 900,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {routeSteps.map((step) => `${step.label}:${step.valueText}`).join(' → ')}
            </div>
          ) : (
            <div
              style={{
                marginTop: 6,
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, routeSteps.length))}, minmax(0, 1fr))`,
                gap: 6,
              }}
            >
              {routeSteps.map((step) => (
                <div
                  key={`${step.label}-${step.valueText}`}
                  style={{
                    minWidth: 0,
                    padding: '6px 7px',
                    borderRadius: 6,
                    background: `${step.accent}14`,
                    border: `1px solid ${step.accent}3d`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                    <span style={{ flex: '0 0 auto', fontSize: 11 }}>{step.icon}</span>
                    <span
                      style={{
                        minWidth: 0,
                        flex: 1,
                        color: step.accent,
                        fontSize: 9,
                        lineHeight: '11px',
                        fontWeight: 950,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {step.label}
                    </span>
                    <span
                      style={{
                        flex: '0 0 auto',
                        color: 'rgba(255,255,255,0.72)',
                        fontSize: 9,
                        lineHeight: '11px',
                        fontWeight: 950,
                        fontFamily: 'monospace',
                      }}
                    >
                      {step.valueText}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      color: 'rgba(255,255,255,0.58)',
                      fontSize: 9,
                      lineHeight: '11px',
                      fontWeight: 780,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {step.detail}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      height: 3,
                      borderRadius: 999,
                      overflow: 'hidden',
                      background: 'rgba(255,255,255,0.13)',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.round(Math.max(0, Math.min(1, step.ratio)) * 100)}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: `linear-gradient(90deg, ${step.accent}, #ffffff)`,
                        transition: 'width 0.22s ease',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showExtended && opportunityCue && (
        <div
          id="stage-opportunity-cue"
          style={{
            marginTop: 7,
            padding: isCompact ? '6px 7px 6px 9px' : '7px 8px 7px 10px',
            borderLeft: `3px solid ${opportunityCue.accent}`,
            borderRadius: 7,
            background: `linear-gradient(90deg, ${opportunityCue.accent}24, rgba(255,255,255,0.04))`,
            boxShadow: `0 0 18px ${opportunityCue.accent}22`,
            animation: 'stageOpportunityPulse 1.1s ease-in-out infinite alternate',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              minWidth: 0,
            }}
          >
            <span style={{ flex: '0 0 auto', fontSize: isCompact ? 13 : 14 }}>
              {opportunityCue.icon}
            </span>
            <span
              style={{
                flex: '0 0 auto',
                color: opportunityCue.accent,
                fontSize: isCompact ? 9 : 10,
                lineHeight: '12px',
                fontWeight: 950,
                whiteSpace: 'nowrap',
              }}
            >
              記録チャンス
            </span>
            <span
              style={{
                minWidth: 0,
                flex: 1,
                color: 'rgba(255,255,255,0.94)',
                fontSize: isCompact ? 10 : 11,
                lineHeight: '13px',
                fontWeight: 950,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {opportunityCue.label}
            </span>
            <span
              style={{
                flex: '0 0 auto',
                color: '#fff1a8',
                fontSize: isCompact ? 9 : 10,
                lineHeight: '12px',
                fontWeight: 950,
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
              }}
            >
              {opportunityCue.valueText}
            </span>
          </div>
          <div
            style={{
              marginTop: 4,
              color: 'rgba(255,255,255,0.62)',
              fontSize: isCompact ? 9 : 10,
              lineHeight: '13px',
              fontWeight: 800,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {opportunityCue.detail}
          </div>
          <div
            style={{
              marginTop: 5,
              height: 3,
              borderRadius: 999,
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.14)',
            }}
          >
            <div
              style={{
                width: `${Math.round(opportunityCue.ratio * 100)}%`,
                height: '100%',
                borderRadius: 999,
                background: `linear-gradient(90deg, ${opportunityCue.accent}, #fff1a8)`,
                transition: 'width 0.25s ease',
              }}
            />
          </div>
        </div>
      )}

      {hasProgressBar && (
        <div
          style={{
            marginTop: isCompact ? 6 : 8,
            height: isCompact ? 4 : 5,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.12)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progressRatio * 100}%`,
              height: '100%',
              borderRadius: 999,
              background: bossHpRatio !== null
                ? `linear-gradient(90deg, ${bossEncounter?.accent ?? '#ffdd66'}, #ff6b4a)`
                : bossSpawned
                  ? 'linear-gradient(90deg, #ffdd66, #ff6b4a)'
                  : `linear-gradient(90deg, ${stage.color}, #ffdd66)`,
              transition: 'width 0.25s ease',
            }}
          />
        </div>
      )}

      {showExtended && (
      <div
        id="stage-record-target"
        style={{
          marginTop: 7,
          paddingLeft: 9,
          borderLeft: `3px solid ${recordTarget.accent}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            minWidth: 0,
          }}
        >
          <span style={{ flex: '0 0 auto', fontSize: isCompact ? 12 : 13 }}>
            {recordTarget.icon}
          </span>
          <span
            style={{
              minWidth: 0,
              flex: 1,
              color: recordTarget.accent,
              fontSize: isCompact ? 9 : 10,
              lineHeight: '12px',
              fontWeight: 950,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            記録: {recordTarget.label}
          </span>
          <span
            style={{
              flex: '0 0 auto',
              color: 'rgba(255,255,255,0.72)',
              fontSize: isCompact ? 9 : 10,
              lineHeight: '12px',
              fontWeight: 950,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {recordTarget.valueText}
          </span>
        </div>
        <div
          style={{
            marginTop: 4,
            height: 3,
            borderRadius: 999,
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.12)',
          }}
        >
          <div
            style={{
              width: `${Math.round(recordTarget.ratio * 100)}%`,
              height: '100%',
              borderRadius: 999,
              background: `linear-gradient(90deg, ${recordTarget.accent}, #ffffff)`,
              transition: 'width 0.25s ease',
            }}
          />
        </div>
        {!isCompact && (
          <div
            style={{
              marginTop: 3,
              color: 'rgba(255,255,255,0.52)',
              fontSize: 10,
              lineHeight: '13px',
              fontWeight: 760,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {recordTarget.detail}
          </div>
        )}
      </div>
      )}

      {showExtended && buildStyle && (
        <div
          id="build-combo-hud"
          style={{
            marginTop: 7,
            paddingLeft: 9,
            borderLeft: `3px solid ${buildStyle.accent}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              minWidth: 0,
            }}
          >
            <span style={{ flex: '0 0 auto', fontSize: isCompact ? 12 : 13 }}>🧩</span>
            <span
              style={{
                flex: '0 0 auto',
                color: buildStyle.accent,
                fontSize: isCompact ? 9 : 10,
                lineHeight: '12px',
                fontWeight: 950,
              }}
            >
              素材コンボ
            </span>
            <span
              style={{
                minWidth: 0,
                flex: 1,
                color: 'rgba(255,255,255,0.9)',
                fontSize: isCompact ? 10 : 11,
                lineHeight: '13px',
                fontWeight: 900,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {lastPlacementLabel
                ? [
                    `${lastPlacementLabel}+${lastPlacementPoints}`,
                    lastComboBonus > 0 ? `多素材+${lastComboBonus}` : null,
                    lastFocusBonus > 0 ? `連置+${lastFocusBonus}` : null,
                  ].filter(Boolean).join(' / ')
                : formatStageBuildFocus(buildStyle, 3)}
            </span>
            <span
              style={{
                flex: '0 0 auto',
                color: buildComboChain > 0 ? '#fff1a8' : 'rgba(255,255,255,0.66)',
                fontSize: isCompact ? 9 : 10,
                lineHeight: '12px',
                fontWeight: 950,
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
              }}
            >
              {activeBuildFocusChain >= 2
                ? `FAST x${activeBuildFocusChain}`
                : buildComboChain > 0
                  ? `x${buildComboChain}`
                  : `BEST x${Math.max(buildBestComboChain, buildBestFocusChain)}`}
            </span>
          </div>
          <div
            style={{
              marginTop: 4,
              height: 4,
              borderRadius: 999,
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.12)',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(8, Math.max(buildComboChain, activeBuildFocusChain) * 18))}%`,
                height: '100%',
                borderRadius: 999,
                background: `linear-gradient(90deg, ${buildStyle.accent}, #ffffff)`,
                transition: 'width 0.25s ease',
              }}
            />
          </div>
        </div>
      )}

      {showExtended && compactStageEvent && (
        <div
          id="stage-event-mini-hud"
          style={{
            marginTop: 7,
            paddingLeft: 9,
            borderLeft: `3px solid ${compactStageEvent.accent}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
            }}
          >
            <span style={{ flex: '0 0 auto', fontSize: 12 }}>
              {compactStageEvent.icon}
            </span>
            <span
              style={{
                flex: '0 0 auto',
                color: compactStageEvent.accent,
                fontSize: 9,
                lineHeight: '12px',
                fontWeight: 900,
              }}
            >
              {compactStageEvent.active ? 'イベント中' : 'イベント'}
            </span>
            <span
              style={{
                minWidth: 0,
                flex: 1,
                color: 'rgba(255,255,255,0.9)',
                fontSize: 10,
                lineHeight: '13px',
                fontWeight: 900,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {compactStageEvent.title}
            </span>
            <span
              style={{
                flex: '0 0 auto',
                color: compactStageEvent.active ? '#fff1a8' : 'rgba(255,255,255,0.66)',
                fontSize: 9,
                lineHeight: '12px',
                fontWeight: 900,
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
              }}
            >
              {compactStageEvent.timerLabel}
            </span>
          </div>
          <div
            style={{
              marginTop: 4,
              height: 4,
              borderRadius: 999,
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.12)',
            }}
          >
            <div
              style={{
                width: `${Math.round(compactStageEvent.progress * 100)}%`,
                height: '100%',
                borderRadius: 999,
                background: compactStageEvent.active
                  ? `linear-gradient(90deg, #fff2a6, ${compactStageEvent.accent})`
                  : `linear-gradient(90deg, ${stage.color}, ${compactStageEvent.accent})`,
                transition: 'width 0.25s ease',
              }}
            />
          </div>
        </div>
      )}

      {showExtended && (
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            gap: 4,
            rowGap: 2,
            flexWrap: 'wrap',
            alignItems: 'center',
            fontSize: 10,
            fontWeight: 800,
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.72)' }}>{landmarkBriefing.name}</span>
          <span style={{ color: stage.color, fontWeight: 900 }}>
            <span style={{ opacity: 0.4 }}>· </span>{landmarkBriefing.shortRole}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.72)', fontWeight: 900 }}>
            <span style={{ opacity: 0.4 }}>· </span>{landmarkNavigation}
          </span>
          {enemyProfile && (
            <span style={{ color: enemyProfile.accent, fontWeight: 900 }}>
              <span style={{ opacity: 0.4 }}>· </span>敵: {enemyProfile.shortLabel}
            </span>
          )}
          {buildStyle && (
            <span style={{ color: buildStyle.accent, fontWeight: 900 }}>
              <span style={{ opacity: 0.4 }}>· </span>作品: {buildStyle.shortLabel} {buildScore}pt
            </span>
          )}
          {buildStyle && buildTopMaterial && (
            <span style={{ color: buildStyle.accent, fontWeight: 900 }}>
              <span style={{ opacity: 0.4 }}>· </span>素材: {buildTopMaterial[0]} x{buildTopMaterial[1]}
            </span>
          )}
          {buildStyle && buildBestComboChain > 0 && (
            <span style={{ color: 'rgba(255,241,168,0.9)', fontWeight: 900 }}>
              <span style={{ opacity: 0.4 }}>· </span>コンボBEST x{buildBestComboChain}
            </span>
          )}
          {buildStyle && buildBestFocusChain > 0 && (
            <span style={{ color: buildStyle.accent, fontWeight: 900 }}>
              <span style={{ opacity: 0.4 }}>· </span>高速BEST x{buildBestFocusChain}
            </span>
          )}
          {(isBuildMode ? stage.rules.objective.prompts : stage.rules.featureTags).slice(0, 3).map((text) => (
            <span key={text} style={{ color: 'rgba(255,255,255,0.74)' }}>
              <span style={{ opacity: 0.4 }}>· </span>{text}
            </span>
          ))}
        </div>
      )}
      </div>
    </>
  );
}
