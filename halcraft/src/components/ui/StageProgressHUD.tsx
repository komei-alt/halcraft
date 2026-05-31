// ステージ進行HUD
// 選んだマップごとの目的・進行・ランドマークを常時見える状態にする

import { useEffect, useState } from 'react';
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
import { getStageModeRule } from '../../types/stageModeRules';
import { isTouchDevice } from '../../utils/device';
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

const FINAL_BUILD_SCORE = BUILD_SCORE_MILESTONES[BUILD_SCORE_MILESTONES.length - 1];

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
      ? lastComboBonus > 0
        ? `${lastPlacementLabel}+${lastPlacementPoints} / 多素材+${lastComboBonus}`
        : `${lastPlacementLabel}+${lastPlacementPoints} / ${formatStageBuildFocus(style, 2)}でコンボ`
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

export function StageProgressHUD() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const enemiesDefeated = useGameStore((s) => s.enemiesDefeated);
  const stageElapsedSeconds = useGameStore((s) => s.stageElapsedSeconds);
  const bossSpawned = useGameStore((s) => s.bossSpawned);
  const isBuildMode = useGameStore((s) => s.isBuildMode);
  const boss = useMobStore((s) => s.mobs.find((mob) => mob.type === 'boss_giant') ?? null);
  const challengeStats = useStageChallengeStore((s) => s.stats);
  const completedChallengeIds = useStageChallengeStore((s) => s.completedIds);
  const stageBestByStage = useStageChallengeStore((s) => s.bestByStage);
  const conditionCharge = useStageConditionStore((s) => s.charge);
  const buildScore = useStageBuildScoreStore((s) => s.score);
  const buildMilestones = useStageBuildScoreStore((s) => s.achievedMilestones);
  const buildStyleHits = useStageBuildScoreStore((s) => s.styleHits);
  const buildComboChain = useStageBuildScoreStore((s) => s.comboChain);
  const buildBestComboChain = useStageBuildScoreStore((s) => s.bestComboChain);
  const lastPlacementLabel = useStageBuildScoreStore((s) => s.lastPlacementLabel);
  const lastPlacementPoints = useStageBuildScoreStore((s) => s.lastPlacementPoints);
  const lastComboBonus = useStageBuildScoreStore((s) => s.lastComboBonus);
  const buildBestByStage = useStageBuildScoreStore((s) => s.bestByStage);
  const modeMeter = useModeFlowStore((s) => s.meter);
  const modeLastGainLabel = useModeFlowStore((s) => s.lastGainLabel);
  const modeFlowRank = useModeFlowStore((s) => s.flowRank);
  const modeActivationCount = useModeFlowStore((s) => s.activationCount);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const nextStageEventAtSeconds = useStageEventStore((s) => s.nextTriggerAtSeconds);
  const recentStageEvent = useStageEventStore((s) => s.recentEvent);
  const isCompact = isTouchDevice() || window.innerWidth <= 560;
  const [eventNow, setEventNow] = useState(() => performance.now());

  useEffect(() => {
    if (phase !== 'playing' || !isCompact) return undefined;

    const timer = window.setInterval(() => setEventNow(performance.now()), 500);
    return () => window.clearInterval(timer);
  }, [isCompact, phase]);

  if (phase !== 'playing' || !stage) return null;

  const target = stage.rules.objective.targetCount;
  const buildStyle = getStageBuildStyle(stage.id);
  const bossEncounter = getStageBossEncounterById(boss?.bossEncounterId) ?? getStageBossEncounter(stage.id);
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
  const bossHpRatio = boss ? Math.max(0, Math.min(1, boss.hp / Math.max(1, boss.maxHp))) : null;
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
  const guidance: StageGuidance = boss && bossEncounter
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
        equippedItem,
        isCompact ? '装備ボタン' : 'Vで切替',
      );
  const buildTopMaterial = buildStyle
    ? Object.entries(buildStyleHits).sort((a, b) => b[1] - a[1])[0]
    : undefined;
  const enemyProfile = getStageEnemyProfile(stage.id);
  const eventDefinition = getStageEvent(stage.id);
  const compactStageEvent = isCompact && eventDefinition && nextStageEventAtSeconds !== null
    ? getStageEventHudDisplay(
        eventDefinition,
        stageElapsedSeconds,
        nextStageEventAtSeconds,
        recentStageEvent,
        eventNow,
      )
    : null;
  const compactNextModeRank = modeRule ? getModeFlowRank(modeActivationCount + 1) || 1 : 1;
  const compactModeRankLabel = modeRule
    ? modeFlowRank > 0
      ? getModeFlowRankLabel(modeRule.category, modeFlowRank)
      : `次${getModeFlowRankLabel(modeRule.category, compactNextModeRank)}`
    : '';

  return (
    <div
      id="stage-progress-hud"
      style={{
        position: 'fixed',
        top: isCompact ? 54 : 14,
        left: isCompact ? 14 : 64,
        zIndex: 96,
        width: isCompact ? 'min(248px, calc(100vw - 28px))' : 310,
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

      {!isCompact && (
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
          marginTop: 8,
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
            次の一手
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
      </div>

      {hasProgressBar && (
        <div
          style={{
            marginTop: 8,
            height: 5,
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

      {buildStyle && (
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
                ? `${lastPlacementLabel}+${lastPlacementPoints}${lastComboBonus > 0 ? ` / 多素材+${lastComboBonus}` : ''}`
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
              {buildComboChain > 0 ? `x${buildComboChain}` : `BEST x${buildBestComboChain}`}
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
                width: `${Math.min(100, Math.max(8, buildComboChain * 18))}%`,
                height: '100%',
                borderRadius: 999,
                background: `linear-gradient(90deg, ${buildStyle.accent}, #ffffff)`,
                transition: 'width 0.25s ease',
              }}
            />
          </div>
        </div>
      )}

      {compactStageEvent && (
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

      {isCompact && modeRule && (
        <div
          id="stage-mode-flow-mini"
          style={{
            marginTop: 7,
            color: 'rgba(255,255,255,0.7)',
            fontSize: 9,
            lineHeight: '12px',
            fontWeight: 900,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              minWidth: 0,
            }}
          >
            <span
              style={{
                minWidth: 0,
                color: modeRule.accent,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {modeRule.icon} {compactModeRankLabel}: {modeRule.shortLabel}
            </span>
            <span style={{ flex: '0 0 auto', fontFamily: 'monospace' }}>
              {Math.floor(modeMeter)}/{modeRule.threshold}
              {modeLastGainLabel ? ` ${modeLastGainLabel}` : ''}
            </span>
          </div>
          <div
            style={{
              marginTop: 3,
              color: 'rgba(255,255,255,0.58)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {modeRule.actionLabel}
          </div>
        </div>
      )}

      {!isCompact && (
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
          <span style={{ color: 'rgba(255,255,255,0.72)' }}>{stage.rules.landmarkName}</span>
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
          {(isBuildMode ? stage.rules.objective.prompts : stage.rules.featureTags).slice(0, 3).map((text) => (
            <span key={text} style={{ color: 'rgba(255,255,255,0.74)' }}>
              <span style={{ opacity: 0.4 }}>· </span>{text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
