// ステージ進行HUD
// 選んだマップごとの目的・進行・ランドマークを常時見える状態にする

import { useGameStore } from '../../stores/useGameStore';
import { useStageChallengeStore } from '../../stores/useStageChallengeStore';
import { useStageConditionStore } from '../../stores/useStageConditionStore';
import {
  getStageChallengeProgress,
  getStageChallenges,
  type StageChallengeStats,
} from '../../types/stageChallenges';
import { getStageCondition } from '../../types/stageConditions';
import type { StageDefinition } from '../../types/stages';
import { isTouchDevice } from '../../utils/device';

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

function getStageGuidance(
  stage: StageDefinition,
  stats: StageChallengeStats,
  completedIds: string[],
  charge: number,
  enemiesDefeated: number,
  bossSpawned: boolean,
): StageGuidance {
  const challengeGuidance = getChallengeGuidance(stage, stats, completedIds);
  const conditionGuidance = getConditionGuidance(stage, charge);
  const condition = getStageCondition(stage.id);
  const conditionClose = Boolean(
    condition && charge > 0 && condition.target - charge <= Math.ceil(condition.target * 0.35),
  );

  if (conditionClose && conditionGuidance) return conditionGuidance;
  if (stage.category === 'build') return challengeGuidance ?? conditionGuidance ?? getObjectiveGuidance(stage, enemiesDefeated, bossSpawned);
  return challengeGuidance ?? getObjectiveGuidance(stage, enemiesDefeated, bossSpawned);
}

export function StageProgressHUD() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const enemiesDefeated = useGameStore((s) => s.enemiesDefeated);
  const stageElapsedSeconds = useGameStore((s) => s.stageElapsedSeconds);
  const bossSpawned = useGameStore((s) => s.bossSpawned);
  const isBuildMode = useGameStore((s) => s.isBuildMode);
  const challengeStats = useStageChallengeStore((s) => s.stats);
  const completedChallengeIds = useStageChallengeStore((s) => s.completedIds);
  const conditionCharge = useStageConditionStore((s) => s.charge);
  const isCompact = isTouchDevice() || window.innerWidth <= 560;

  if (phase !== 'playing' || !stage) return null;

  const target = stage.rules.objective.targetCount;
  const progressRatio = target ? Math.min(1, enemiesDefeated / target) : 0;
  const objectiveState = target
    ? bossSpawned
      ? 'ボス出現'
      : `${enemiesDefeated}/${target}`
    : formatElapsed(stageElapsedSeconds);
  const accent = stage.category === 'build' ? '#9bdcff' : '#ffb36d';
  const guidance = getStageGuidance(
    stage,
    challengeStats,
    completedChallengeIds,
    conditionCharge,
    enemiesDefeated,
    bossSpawned,
  );

  return (
    <div
      id="stage-progress-hud"
      style={{
        position: 'fixed',
        top: isCompact ? 54 : 14,
        left: isCompact ? 14 : 64,
        zIndex: 96,
        width: isCompact ? 'min(248px, calc(100vw - 28px))' : 310,
        padding: isCompact ? '9px 10px' : '11px 13px',
        borderRadius: 8,
        border: `1px solid ${stage.color}77`,
        background: 'rgba(0,0,0,0.46)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        color: '#fff',
        pointerEvents: 'none',
        boxShadow: `0 0 18px ${stage.color}26`,
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: isCompact ? 18 : 20 }}>{stage.icon}</span>
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
          padding: '7px 8px',
          borderRadius: 6,
          background: 'rgba(255,255,255,0.075)',
          border: `1px solid ${guidance.accent}44`,
          boxShadow: `inset 0 0 12px ${guidance.accent}12`,
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

      {target && (
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
              background: bossSpawned
                ? 'linear-gradient(90deg, #ffdd66, #ff6b4a)'
                : `linear-gradient(90deg, ${stage.color}, #ffdd66)`,
              transition: 'width 0.25s ease',
            }}
          />
        </div>
      )}

      {!isCompact && (
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            gap: 5,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.75)',
              fontSize: 10,
              fontWeight: 800,
            }}
          >
            {stage.rules.landmarkName}
          </span>
          {(isBuildMode ? stage.rules.objective.prompts : stage.rules.featureTags).slice(0, 3).map((text) => (
            <span
              key={text}
              style={{
                padding: '2px 6px',
                borderRadius: 4,
                background: `${stage.color}24`,
                color: 'rgba(255,255,255,0.78)',
                fontSize: 10,
                fontWeight: 800,
              }}
            >
              {text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
