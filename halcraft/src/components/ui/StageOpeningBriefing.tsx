// ステージ開始時に、そのマップならではの遊び方を短く見せる演出

import { useEffect, useMemo, useRef } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useStageBuildScoreStore, type StageBuildScoreBest } from '../../stores/useStageBuildScoreStore';
import { useStageChallengeStore, type StageChallengeBest } from '../../stores/useStageChallengeStore';
import { formatStageBuildFocus, getStageBuildStyle } from '../../types/stageBuildStyles';
import { formatStageCombatBonus, getStageCombatStyle } from '../../types/stageCombatStyles';
import { getStageCondition } from '../../types/stageConditions';
import { getStageEvent } from '../../types/stageEvents';
import { getStageChallenges } from '../../types/stageChallenges';
import {
  formatStageMasteryPerkLabel,
  getStageMasteryPerkForProgress,
  type StageMasteryPerk,
} from '../../types/stageMastery';
import { formatStageModeReward, getStageModeRule } from '../../types/stageModeRules';
import { getStagePressure } from '../../types/stagePressures';
import { getStageRecordGoal } from '../../types/stageRecordGoals';
import {
  formatStageRunBonusLabel,
  getStageOpeningItemLabel,
  getStageRunBonusForProgress,
  type StageRunBonus,
} from '../../types/stageRunBonuses';
import type { StageDefinition } from '../../types/stages';
import { isTouchDevice } from '../../utils/device';
import { playStageStartSound } from '../../utils/sounds';

interface BriefingPoint {
  icon: string;
  title: string;
  detail: string;
  accent: string;
}

interface BriefingRouteStep {
  icon: string;
  label: string;
  detail: string;
  accent: string;
  valueText: string;
}

function getBriefingPoints(
  stage: StageDefinition,
  compact: boolean,
  runBonus: StageRunBonus | null,
  masteryPerk: StageMasteryPerk | null,
): BriefingPoint[] {
  const condition = getStageCondition(stage.id);
  const event = getStageEvent(stage.id);
  const modeRule = getStageModeRule(stage.id);
  const pressure = getStagePressure(stage.id);
  const buildStyle = getStageBuildStyle(stage.id);
  const combatStyle = getStageCombatStyle(stage.id);

  const points: BriefingPoint[] = [];

  if (modeRule) {
    points.push({
      icon: modeRule.icon,
      title: modeRule.category === 'build' ? '建築モード' : '戦争モード',
      detail: `${modeRule.shortLabel} / ${formatStageModeReward(modeRule)}`,
      accent: modeRule.accent,
    });
  }

  if (runBonus) {
    points.push({
      icon: runBonus.icon,
      title: runBonus.sourceLabel,
      detail: `${runBonus.shortLabel}: ${formatStageRunBonusLabel(runBonus)}`,
      accent: runBonus.accent,
    });
  }

  if (masteryPerk) {
    points.push({
      icon: masteryPerk.icon,
      title: 'マップ熟練特典',
      detail: `${masteryPerk.shortLabel}: ${formatStageMasteryPerkLabel(masteryPerk)}`,
      accent: masteryPerk.accent,
    });
  }

  if (buildStyle) {
    points.push({
      icon: buildStyle.icon,
      title: '作品評価',
      detail: `${buildStyle.shortLabel}: ${formatStageBuildFocus(buildStyle, 3)}`,
      accent: buildStyle.accent,
    });
  }

  if (combatStyle) {
    points.push({
      icon: combatStyle.icon,
      title: '推奨武器',
      detail: `${combatStyle.shortLabel}: ${formatStageCombatBonus(combatStyle)}`,
      accent: combatStyle.accent,
    });
  }

  if (condition) {
    points.push({
      icon: condition.icon,
      title: 'ステージ特性',
      detail: `${condition.triggerLabel}で${condition.effect.label}`,
      accent: condition.accent,
    });
  }

  if (pressure) {
    points.push({
      icon: pressure.icon,
      title: '環境対策',
      detail: pressure.protectLabel,
      accent: pressure.accent,
    });
  }

  if (event) {
    points.push({
      icon: event.icon,
      title: '時間イベント',
      detail: `${event.firstTriggerSeconds}秒後: ${event.label}`,
      accent: event.accent,
    });
  }

  return points.slice(0, compact ? 3 : 4);
}

function getBriefingRouteSteps(
  stage: StageDefinition,
  runBest: StageChallengeBest | undefined,
  buildBest: StageBuildScoreBest | undefined,
  masteryPerk: StageMasteryPerk | null,
): BriefingRouteStep[] {
  const modeRule = getStageModeRule(stage.id);
  const buildStyle = getStageBuildStyle(stage.id);
  const combatStyle = getStageCombatStyle(stage.id);
  const recordGoal = getStageRecordGoal({ stage, runBest, buildBest });
  const openingItemLabel = getStageOpeningItemLabel(stage.id);
  const firstAction = modeRule?.actionLabel
    ?? buildStyle?.focusLabel
    ?? combatStyle?.shortLabel
    ?? stage.rules.objective.prompts[0]
    ?? stage.rules.objective.title;

  return [
    {
      icon: stage.category === 'build' ? '🧰' : '⚔️',
      label: '初動装備',
      detail: stage.category === 'build'
        ? masteryPerk?.buildFocusMs
          ? `${masteryPerk.shortLabel}で開幕高速建築`
          : '建築テンポを作って作品点へつなげる'
        : masteryPerk?.shieldMs
          ? `${masteryPerk.shortLabel}で安全時間を上乗せ`
          : 'マップ推奨の戦い方で戦意をためる',
      accent: stage.category === 'build' ? '#9bdcff' : '#ffb36d',
      valueText: openingItemLabel,
    },
    {
      icon: modeRule?.icon ?? stage.icon,
      label: '最初の一手',
      detail: firstAction,
      accent: modeRule?.accent ?? stage.color,
      valueText: modeRule?.meterLabel ?? stage.rules.modeLabel,
    },
    {
      icon: recordGoal.icon,
      label: '今回の記録',
      detail: recordGoal.title,
      accent: recordGoal.accent,
      valueText: recordGoal.progressLabel,
    },
  ];
}

export function StageOpeningBriefing() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const runId = useGameStore((s) => s.runId);
  const stageElapsedSeconds = useGameStore((s) => s.stageElapsedSeconds);
  const bestByStage = useStageChallengeStore((s) => s.bestByStage);
  const buildBestByStage = useStageBuildScoreStore((s) => s.bestByStage);
  const shownRunIdRef = useRef<number | null>(null);
  const isCompact = isTouchDevice() || window.innerWidth <= 560;

  useEffect(() => {
    if (phase !== 'playing' || !stage || shownRunIdRef.current === runId) return undefined;

    shownRunIdRef.current = runId;
    playStageStartSound(stage.category);
    return undefined;
  }, [phase, runId, stage]);

  const runBonus = useMemo(() => {
    if (!stage) return null;
    return getStageRunBonusForProgress(
      stage.id,
      bestByStage[stage.id]?.medal ?? 'none',
      buildBestByStage[stage.id]?.score ?? 0,
    );
  }, [bestByStage, buildBestByStage, stage]);

  const masteryPerk = useMemo(() => {
    if (!stage) return null;
    return getStageMasteryPerkForProgress({
      stage,
      completedCount: bestByStage[stage.id]?.completedCount ?? 0,
      challengeCount: getStageChallenges(stage.id).length,
      buildScore: buildBestByStage[stage.id]?.score ?? 0,
    });
  }, [bestByStage, buildBestByStage, stage]);

  const points = useMemo(
    () => (stage ? getBriefingPoints(stage, isCompact, runBonus, masteryPerk) : []),
    [isCompact, masteryPerk, runBonus, stage],
  );
  const routeSteps = useMemo(
    () => (stage
      ? getBriefingRouteSteps(
          stage,
          bestByStage[stage.id],
          buildBestByStage[stage.id],
          masteryPerk,
        )
      : []),
    [bestByStage, buildBestByStage, masteryPerk, stage],
  );

  if (phase !== 'playing' || !stage || stageElapsedSeconds > 4.3) return null;

  const startLabel = stage.category === 'build' ? 'BUILD START' : 'MISSION START';
  const accent = stage.color;

  return (
    <div
      id="stage-opening-briefing"
      style={{
        position: 'fixed',
        left: '50%',
        top: isCompact ? '47%' : '45%',
        transform: 'translate(-50%, -50%)',
        zIndex: 126,
        width: isCompact ? 'min(338px, calc(100vw - 28px))' : 470,
        padding: isCompact ? '13px 14px' : '16px 18px',
        borderRadius: 8,
        border: `1px solid ${accent}88`,
        background: 'linear-gradient(135deg, rgba(8, 11, 17, 0.88), rgba(22, 28, 38, 0.72))',
        boxShadow: `0 0 34px ${accent}42, inset 0 1px 0 rgba(255,255,255,0.18)`,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        color: '#fff',
        pointerEvents: 'none',
        overflow: 'hidden',
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
        animation: 'stageOpeningBriefing 4.3s ease forwards',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(110deg, transparent 0%, ${accent}1f 38%, rgba(255,255,255,0.16) 50%, transparent 64%)`,
          animation: 'stageOpeningSweep 1.25s ease-out',
        }}
      />
      <div style={{ position: 'relative', display: 'flex', gap: isCompact ? 11 : 13, alignItems: 'flex-start' }}>
        <div
          style={{
            width: isCompact ? 46 : 54,
            height: isCompact ? 46 : 54,
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
            flex: '0 0 auto',
            background: `${accent}24`,
            border: `1px solid ${accent}77`,
            boxShadow: `0 0 18px ${accent}44`,
            fontSize: isCompact ? 26 : 30,
            animation: 'stageOpeningIcon 0.58s ease-out',
          }}
        >
          {stage.icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              minWidth: 0,
            }}
          >
            <div
              style={{
                color: accent,
                fontSize: isCompact ? 10 : 11,
                lineHeight: '13px',
                fontWeight: 950,
                letterSpacing: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {startLabel}
            </div>
            <div
              style={{
                flex: '0 0 auto',
                color: 'rgba(255,255,255,0.62)',
                fontSize: isCompact ? 9 : 10,
                lineHeight: '12px',
                fontWeight: 900,
                fontFamily: 'monospace',
              }}
            >
              {stage.category === 'build' ? 'CREATE' : 'SURVIVE'}
            </div>
          </div>
          <div
            style={{
              marginTop: 2,
              color: 'rgba(255,255,255,0.96)',
              fontSize: isCompact ? 18 : 22,
              lineHeight: isCompact ? '22px' : '27px',
              fontWeight: 950,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {stage.name}
          </div>
          <div
            style={{
              marginTop: 5,
              color: 'rgba(255,255,255,0.68)',
              fontSize: isCompact ? 11 : 12,
              lineHeight: isCompact ? '15px' : '16px',
              fontWeight: 760,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {stage.rules.objective.description}
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          marginTop: isCompact ? 11 : 13,
          display: 'grid',
          gridTemplateColumns: isCompact ? '1fr' : 'repeat(2, minmax(0, 1fr))',
          gap: isCompact ? 6 : 8,
        }}
      >
        {points.map((point) => (
          <div
            key={`${point.title}-${point.detail}`}
            style={{
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: isCompact ? '6px 7px' : '7px 8px',
              borderRadius: 6,
              background: `${point.accent}16`,
              border: `1px solid ${point.accent}40`,
            }}
          >
            <span style={{ flex: '0 0 auto', fontSize: isCompact ? 14 : 15 }}>
              {point.icon}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span
                style={{
                  display: 'block',
                  color: point.accent,
                  fontSize: isCompact ? 9 : 10,
                  lineHeight: '12px',
                  fontWeight: 950,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {point.title}
              </span>
              <span
                style={{
                  display: 'block',
                  marginTop: 1,
                  color: 'rgba(255,255,255,0.78)',
                  fontSize: isCompact ? 9 : 10,
                  lineHeight: '13px',
                  fontWeight: 820,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {point.detail}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          position: 'relative',
          marginTop: isCompact ? 9 : 11,
          display: 'grid',
          gridTemplateColumns: isCompact ? '1fr' : 'repeat(3, minmax(0, 1fr))',
          gap: isCompact ? 5 : 7,
        }}
      >
        {routeSteps.map((step) => (
          <div
            key={`${step.label}-${step.valueText}`}
            style={{
              minWidth: 0,
              padding: isCompact ? '6px 7px' : '7px 8px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.055)',
              border: `1px solid ${step.accent}42`,
              boxShadow: `inset 0 0 12px ${step.accent}12`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ flex: '0 0 auto', fontSize: isCompact ? 13 : 14 }}>
                {step.icon}
              </span>
              <span
                style={{
                  minWidth: 0,
                  flex: 1,
                  color: step.accent,
                  fontSize: isCompact ? 9 : 10,
                  lineHeight: '12px',
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
                  color: 'rgba(255,255,255,0.68)',
                  fontSize: isCompact ? 8 : 9,
                  lineHeight: '12px',
                  fontWeight: 950,
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  maxWidth: isCompact ? 92 : 82,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {step.valueText}
              </span>
            </div>
            <div
              style={{
                marginTop: 3,
                color: 'rgba(255,255,255,0.62)',
                fontSize: isCompact ? 9 : 10,
                lineHeight: '13px',
                fontWeight: 790,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {step.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
