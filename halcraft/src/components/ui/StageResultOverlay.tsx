// ステージ結果画面
// ステージを遊び切った瞬間に評価・次アクション・リプレイ導線をまとめて出す

import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { useStageBuildScoreStore } from '../../stores/useStageBuildScoreStore';
import { useStageChallengeStore } from '../../stores/useStageChallengeStore';
import { getModeFlowRankLabel, useModeFlowStore } from '../../stores/useModeFlowStore';
import {
  getStageChallengeMedal,
  getStageChallengeMedalLabel,
  getStageChallengeProgress,
  getStageChallenges,
} from '../../types/stageChallenges';
import { formatStageBossReward, getStageBossEncounter } from '../../types/stageBossEncounters';
import {
  BUILD_SCORE_MILESTONES,
  formatStageBuildFocus,
  getStageBuildStyle,
} from '../../types/stageBuildStyles';
import { formatStageRunBonusLabel, getStageRunBonus } from '../../types/stageRunBonuses';
import { formatStageModeReward, getStageModeRule } from '../../types/stageModeRules';
import { getStageMasterySummary } from '../../types/stageMastery';
import { activateDesktopGameplayInput } from '../../utils/gameCanvas';
import { isTouchDevice } from '../../utils/device';
import { playLevelUpSound } from '../../utils/sounds';

function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

function getMedalColor(medal: string): string {
  if (medal === 'gold') return '#ffe680';
  if (medal === 'silver') return '#dce8ff';
  if (medal === 'bronze') return '#ffc58a';
  return 'rgba(255,255,255,0.7)';
}

const FINAL_BUILD_SCORE = BUILD_SCORE_MILESTONES[BUILD_SCORE_MILESTONES.length - 1];

export function StageResultOverlay() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const isBuildMode = useGameStore((s) => s.isBuildMode);
  const enemiesDefeated = useGameStore((s) => s.enemiesDefeated);
  const stageElapsedSeconds = useGameStore((s) => s.stageElapsedSeconds);
  const runId = useGameStore((s) => s.runId);
  const completeStage = useGameStore((s) => s.completeStage);
  const continueAfterStageClear = useGameStore((s) => s.continueAfterStageClear);
  const startGame = useGameStore((s) => s.startGame);
  const returnToMenu = useGameStore((s) => s.returnToMenu);
  const leave = useMultiplayerStore((s) => s.leave);
  const stats = useStageChallengeStore((s) => s.stats);
  const completedIds = useStageChallengeStore((s) => s.completedIds);
  const bestByStage = useStageChallengeStore((s) => s.bestByStage);
  const resultDismissed = useStageChallengeStore((s) => s.resultDismissed);
  const recordStageClear = useStageChallengeStore((s) => s.recordStageClear);
  const dismissStageResult = useStageChallengeStore((s) => s.dismissStageResult);
  const buildScore = useStageBuildScoreStore((s) => s.score);
  const buildMilestones = useStageBuildScoreStore((s) => s.achievedMilestones);
  const buildBestByStage = useStageBuildScoreStore((s) => s.bestByStage);
  const modeMeter = useModeFlowStore((s) => s.meter);
  const modeActivations = useModeFlowStore((s) => s.activationCount);
  const modeBestStreak = useModeFlowStore((s) => s.bestStreak);
  const modeFlowRank = useModeFlowStore((s) => s.flowRank);
  const recordedClearRunRef = useRef<number | null>(null);
  const isTouch = isTouchDevice();
  const isCompact = isTouch || window.innerWidth <= 560;

  const challenges = useMemo(() => getStageChallenges(stage?.id), [stage?.id]);
  const isGold = challenges.length > 0 && completedIds.length >= challenges.length;
  const buildStyle = useMemo(() => getStageBuildStyle(stage?.id), [stage?.id]);
  const bossEncounter = useMemo(() => getStageBossEncounter(stage?.id), [stage?.id]);
  const modeRule = useMemo(() => getStageModeRule(stage?.id), [stage?.id]);
  const buildScoreCleared = Boolean(buildStyle && buildScore >= FINAL_BUILD_SCORE);
  const stageCleared = Boolean(stage) && (
    isBuildMode
      ? isGold || buildScoreCleared
      : stats.bossDefeated > 0
  );

  useEffect(() => {
    if (phase !== 'playing' || !stageCleared || resultDismissed) return;
    document.exitPointerLock?.();
    if (recordedClearRunRef.current !== runId) {
      recordStageClear({
        elapsedSeconds: stageElapsedSeconds,
        modeFlowRank,
        modeActivations,
        bestStreak: modeBestStreak,
      });
      recordedClearRunRef.current = runId;
    }
    completeStage();
    playLevelUpSound();
  }, [
    completeStage,
    modeActivations,
    modeBestStreak,
    modeFlowRank,
    phase,
    recordStageClear,
    resultDismissed,
    runId,
    stageCleared,
    stageElapsedSeconds,
  ]);

  const handleContinue = useCallback(() => {
    dismissStageResult();
    continueAfterStageClear();
    if (!isTouch) {
      window.setTimeout(() => activateDesktopGameplayInput(), 100);
    }
  }, [continueAfterStageClear, dismissStageResult, isTouch]);

  const handleRestart = useCallback(() => {
    startGame();
    if (!isTouch) {
      window.setTimeout(() => activateDesktopGameplayInput(), 100);
    }
  }, [isTouch, startGame]);

  const handleReturnToMenu = useCallback(() => {
    dismissStageResult();
    leave();
    returnToMenu();
  }, [dismissStageResult, leave, returnToMenu]);

  if (phase !== 'stageclear' || !stage || !stageCleared) return null;

  const medal = getStageChallengeMedal(completedIds.length, challenges.length);
  const medalLabel = getStageChallengeMedalLabel(medal);
  const medalColor = getMedalColor(medal);
  const incomplete = challenges.find((challenge) => !completedIds.includes(challenge.id));
  const resultTitle = isGold
    ? 'チャレンジ制覇'
    : stage.category === 'war'
      ? 'ステージクリア'
      : buildScoreCleared
        ? '作品評価達成'
        : '制作完了';
  const actionHint = incomplete
    ? `${incomplete.title} もねらえる`
    : stage.category === 'war'
      ? '別の戦場でも金メダルをねらえる'
      : '別のマップでも作品を増やせる';
  const nextRunBonus = getStageRunBonus(stage.id, medal);
  const targetCount = stage.rules.objective.targetCount;
  const runBest = bestByStage[stage.id];
  const buildBest = buildBestByStage[stage.id];
  const mastery = getStageMasterySummary({
    stage,
    completedCount: completedIds.length,
    challengeCount: challenges.length,
    buildScore: buildBest?.score ?? buildScore,
  });
  const objectiveValue = targetCount
    ? `${Math.min(enemiesDefeated, targetCount)}/${targetCount}`
    : buildStyle
      ? `${buildScore}pt`
    : formatElapsed(stageElapsedSeconds);
  const summaryStats = buildStyle
    ? [
        ['作品', `${buildScore}pt`],
        ['節目', `${buildMilestones.length}/${BUILD_SCORE_MILESTONES.length}`],
        ['時間', formatElapsed(stageElapsedSeconds)],
      ]
    : [
        ['目標', objectiveValue],
        ['ボス', stats.bossDefeated > 0 ? '撃破' : stage.category === 'war' ? '未撃破' : 'なし'],
        ['時間', formatElapsed(stageElapsedSeconds)],
      ];
  const bestClearSeconds = runBest?.bestClearSeconds ?? stageElapsedSeconds;
  const bestModeRank = Math.max(runBest?.bestModeFlowRank ?? 0, modeFlowRank);
  const bestModeActivationCount = Math.max(runBest?.bestModeActivations ?? 0, modeActivations);
  const bestModeStreak = Math.max(runBest?.bestStreak ?? 0, modeBestStreak);
  const recordDetail = modeRule
    ? modeRule.category === 'war'
      ? `${getModeFlowRankLabel(modeRule.category, bestModeRank)} / 発動最多 ${bestModeActivationCount}回 / 連続 x${bestModeStreak}`
      : `${getModeFlowRankLabel(modeRule.category, bestModeRank)} / 発動最多 ${bestModeActivationCount}回 / 作品BEST ${buildBest?.score ?? buildScore}pt`
    : 'このマップのクリア記録を保存中';

  return (
    <div
      id="stage-result-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 245,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isCompact ? 14 : 24,
        background: 'radial-gradient(circle at 50% 38%, rgba(255, 230, 120, 0.16), rgba(0, 0, 0, 0.78) 46%, rgba(0, 0, 0, 0.88) 100%)',
        backdropFilter: 'blur(7px)',
        WebkitBackdropFilter: 'blur(7px)',
        color: '#fff',
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
      }}
    >
      <div
        style={{
          width: 'min(620px, calc(100vw - 28px))',
          maxHeight: 'calc(100vh - 28px)',
          overflowY: 'auto',
          borderRadius: 8,
          border: `2px solid ${stage.color}aa`,
          background: 'rgba(7, 10, 15, 0.78)',
          boxShadow: `0 0 34px ${stage.color}44, 0 18px 56px rgba(0,0,0,0.58)`,
          padding: isCompact ? 16 : 22,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isCompact ? 10 : 14,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: isCompact ? 52 : 64,
              height: isCompact ? 52 : 64,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              background: `${stage.color}33`,
              border: `1px solid ${stage.color}88`,
              fontSize: isCompact ? 28 : 34,
              boxShadow: `0 0 18px ${stage.color}44`,
              flex: '0 0 auto',
            }}
          >
            {stage.icon}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                color: medalColor,
                fontSize: isCompact ? 13 : 15,
                fontWeight: 900,
                letterSpacing: 0,
              }}
            >
              {resultTitle}
            </div>
            <div
              style={{
                color: '#fff',
                fontSize: isCompact ? 24 : 34,
                lineHeight: isCompact ? '30px' : '40px',
                fontWeight: 950,
                overflowWrap: 'anywhere',
              }}
            >
              {stage.name}
            </div>
          </div>
          <div
            style={{
              flex: '0 0 auto',
              color: medalColor,
              fontSize: isCompact ? 12 : 15,
              fontWeight: 950,
              fontFamily: 'monospace',
              textAlign: 'right',
            }}
          >
            <div>{completedIds.length}/{challenges.length}</div>
            <div>{medalLabel}</div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
            marginBottom: 14,
          }}
        >
          {summaryStats.map(([label, value]) => (
            <div
              key={label}
              style={{
                minWidth: 0,
                padding: '9px 10px',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.10)',
              }}
            >
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 800 }}>
                {label}
              </div>
              <div style={{ color: '#fff', fontSize: 17, fontWeight: 950, marginTop: 2 }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginBottom: 14,
            padding: '10px 11px',
            borderRadius: 6,
            background: 'rgba(168, 255, 205, 0.10)',
            border: '1px solid rgba(168, 255, 205, 0.34)',
            boxShadow: 'inset 0 0 18px rgba(168,255,205,0.10)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 8,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: 'rgba(168,255,205,0.95)',
                  fontSize: isCompact ? 10 : 11,
                  fontWeight: 950,
                }}
              >
                ラン記録
              </div>
              <div
                style={{
                  color: '#fff',
                  fontSize: isCompact ? 14 : 16,
                  fontWeight: 950,
                  overflowWrap: 'anywhere',
                }}
              >
                このマップのBESTを更新できる
              </div>
            </div>
            <div
              style={{
                flex: '0 0 auto',
                color: 'rgba(168,255,205,0.95)',
                fontSize: isCompact ? 12 : 13,
                fontWeight: 950,
                fontFamily: 'monospace',
                textAlign: 'right',
              }}
            >
              {runBest?.clearCount ?? 1}回 CLEAR
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 7,
            }}
          >
            {[
              ['今回', formatElapsed(stageElapsedSeconds)],
              ['BEST', formatElapsed(bestClearSeconds)],
              ['差', bestClearSeconds >= stageElapsedSeconds ? 'NEW' : `あと${formatElapsed(stageElapsedSeconds - bestClearSeconds)}`],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  minWidth: 0,
                  padding: '7px 8px',
                  borderRadius: 5,
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.09)',
                }}
              >
                <div style={{ color: 'rgba(255,255,255,0.52)', fontSize: 9, fontWeight: 850 }}>
                  {label}
                </div>
                <div style={{ color: '#fff', fontSize: isCompact ? 13 : 15, fontWeight: 950, marginTop: 2 }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 7,
              color: 'rgba(255,255,255,0.74)',
              fontSize: isCompact ? 11 : 12,
              lineHeight: '16px',
              fontWeight: 850,
            }}
          >
            最高: {recordDetail}
          </div>
        </div>

        <div
          style={{
            marginBottom: 14,
            padding: '10px 11px',
            borderRadius: 6,
            background: `${mastery.accent}1f`,
            border: `1px solid ${mastery.accent}55`,
            boxShadow: `0 0 18px ${mastery.glow}, inset 0 0 16px ${mastery.glow}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: mastery.accent,
                  fontSize: isCompact ? 10 : 11,
                  fontWeight: 950,
                }}
              >
                マップ熟練: {mastery.rankLabel}
              </div>
              <div
                style={{
                  color: '#fff',
                  fontSize: isCompact ? 15 : 17,
                  fontWeight: 950,
                  overflowWrap: 'anywhere',
                }}
              >
                {mastery.title}
              </div>
            </div>
            <div
              style={{
                flex: '0 0 auto',
                color: mastery.accent,
                fontSize: isCompact ? 18 : 22,
                fontWeight: 950,
                fontFamily: 'monospace',
              }}
            >
              {mastery.score}%
            </div>
          </div>
          <div
            style={{
              marginTop: 8,
              height: 6,
              borderRadius: 999,
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.13)',
            }}
          >
            <div
              style={{
                width: `${mastery.score}%`,
                height: '100%',
                borderRadius: 999,
                background: `linear-gradient(90deg, ${mastery.accent}, ${stage.color})`,
              }}
            />
          </div>
          <div
            style={{
              marginTop: 7,
              color: 'rgba(255,255,255,0.74)',
              fontSize: isCompact ? 11 : 12,
              lineHeight: '16px',
              fontWeight: 850,
            }}
          >
            次: {mastery.nextLabel} / チャレンジ {mastery.challengeScore}pt
            {stage.category === 'build' ? ` / 作品 ${mastery.buildScore}pt` : ''}
          </div>
        </div>

        {bossEncounter && (
          <div
            style={{
              marginBottom: 14,
              padding: '10px 11px',
              borderRadius: 6,
              background: `${bossEncounter.accent}1f`,
              border: `1px solid ${bossEncounter.accent}55`,
              boxShadow: `inset 0 0 18px ${bossEncounter.accent}14`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 20 }}>{bossEncounter.icon}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    color: bossEncounter.accent,
                    fontSize: isCompact ? 10 : 11,
                    fontWeight: 950,
                  }}
                >
                  ボス戦: {bossEncounter.shortLabel}
                </div>
                <div
                  style={{
                    color: '#fff',
                    fontSize: isCompact ? 14 : 16,
                    fontWeight: 950,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {bossEncounter.title}
                </div>
              </div>
            </div>
            <div
              style={{
                marginTop: 7,
                color: 'rgba(255,255,255,0.76)',
                fontSize: isCompact ? 11 : 12,
                lineHeight: '17px',
                fontWeight: 800,
              }}
            >
              弱点: {bossEncounter.weakness} / 報酬: {formatStageBossReward(bossEncounter)}
            </div>
          </div>
        )}

        {buildStyle && (
          <div
            style={{
              marginBottom: 14,
              padding: '10px 11px',
              borderRadius: 6,
              background: `${buildStyle.accent}1f`,
              border: `1px solid ${buildStyle.accent}55`,
              boxShadow: `inset 0 0 18px ${buildStyle.glow}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>{buildStyle.icon}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    color: buildStyle.accent,
                    fontSize: isCompact ? 10 : 11,
                    fontWeight: 950,
                  }}
                >
                  作品評価: {formatStageBuildFocus(buildStyle, 3)}
                </div>
                <div
                  style={{
                    color: '#fff',
                    fontSize: isCompact ? 14 : 16,
                    fontWeight: 950,
                  }}
                >
                  {buildStyle.title} {buildScore}pt
                </div>
              </div>
              <div
                style={{
                  color: 'rgba(255,255,255,0.72)',
                  fontSize: isCompact ? 10 : 11,
                  fontWeight: 900,
                  textAlign: 'right',
                  fontFamily: 'monospace',
                }}
              >
                BEST {buildBest?.score ?? buildScore}pt
              </div>
            </div>
            <div
              style={{
                marginTop: 7,
                color: 'rgba(255,255,255,0.76)',
                fontSize: isCompact ? 11 : 12,
                lineHeight: '17px',
                fontWeight: 800,
              }}
            >
              {buildStyle.detail}
            </div>
          </div>
        )}

        {modeRule && (
          <div
            style={{
              marginBottom: 14,
              padding: '10px 11px',
              borderRadius: 6,
              background: `${modeRule.accent}1f`,
              border: `1px solid ${modeRule.accent}55`,
              boxShadow: `inset 0 0 18px ${modeRule.glow}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 20 }}>{modeRule.icon}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    color: modeRule.accent,
                    fontSize: isCompact ? 10 : 11,
                    fontWeight: 950,
                  }}
                >
                  {modeRule.category === 'build' ? '建築モード' : '戦争モード'}: {modeRule.meterLabel}
                </div>
                <div
                  style={{
                    color: '#fff',
                    fontSize: isCompact ? 14 : 16,
                    fontWeight: 950,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {modeRule.title}
                </div>
              </div>
              <div
                style={{
                  color: 'rgba(255,255,255,0.72)',
                  fontSize: isCompact ? 10 : 11,
                  fontWeight: 900,
                  textAlign: 'right',
                  fontFamily: 'monospace',
                }}
              >
                <div>発動 {modeActivations}回</div>
                <div>
                  {modeRule.category === 'war'
                    ? `BEST x${modeBestStreak}`
                    : `${Math.floor(modeMeter)}/${modeRule.threshold}`}
                </div>
              </div>
            </div>
            <div
              style={{
                marginTop: 7,
                color: 'rgba(255,255,255,0.76)',
                fontSize: isCompact ? 11 : 12,
                lineHeight: '17px',
                fontWeight: 800,
              }}
            >
              {modeRule.actionLabel} / 到達: {getModeFlowRankLabel(modeRule.category, modeFlowRank)} / 発動: {formatStageModeReward(modeRule)}
            </div>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
            marginBottom: 14,
          }}
        >
          {challenges.map((challenge) => {
            const progress = getStageChallengeProgress(challenge, stats);
            const completed = completedIds.includes(challenge.id);
            return (
              <div
                key={challenge.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 9px',
                  borderRadius: 6,
                  background: completed ? 'rgba(255, 230, 120, 0.13)' : 'rgba(255,255,255,0.055)',
                  border: completed ? '1px solid rgba(255, 230, 120, 0.22)' : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <span style={{ fontSize: 18 }}>{completed ? '✓' : challenge.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: completed ? '#fff4b8' : 'rgba(255,255,255,0.88)',
                      fontSize: isCompact ? 12 : 13,
                      fontWeight: 900,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {challenge.title}
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      height: 4,
                      borderRadius: 999,
                      overflow: 'hidden',
                      background: 'rgba(255,255,255,0.12)',
                    }}
                  >
                    <div
                      style={{
                        width: `${progress.ratio * 100}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: completed
                          ? 'linear-gradient(90deg, #ffe680, #fff)'
                          : `linear-gradient(90deg, ${challenge.accent}, ${stage.color})`,
                      }}
                    />
                  </div>
                </div>
                <span
                  style={{
                    color: completed ? '#fff1a8' : 'rgba(255,255,255,0.62)',
                    fontSize: isCompact ? 11 : 12,
                    fontWeight: 950,
                    fontFamily: 'monospace',
                  }}
                >
                  {Math.min(progress.current, progress.target)}/{progress.target}
                </span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginBottom: 16,
            padding: '9px 10px',
            borderRadius: 6,
            color: 'rgba(255,255,255,0.78)',
            background: `${stage.color}22`,
            border: `1px solid ${stage.color}44`,
            fontSize: isCompact ? 12 : 13,
            fontWeight: 800,
            lineHeight: '18px',
          }}
        >
          次: {actionHint}
        </div>

        {nextRunBonus && (
          <div
            style={{
              marginBottom: 16,
              padding: '9px 10px',
              borderRadius: 6,
              color: '#fff',
              background: `${nextRunBonus.accent}22`,
              border: `1px solid ${nextRunBonus.accent}55`,
              fontSize: isCompact ? 11 : 12,
              fontWeight: 850,
              lineHeight: '17px',
            }}
          >
            <div
              style={{
                color: nextRunBonus.accent,
                fontSize: isCompact ? 10 : 11,
                fontWeight: 950,
                marginBottom: 2,
              }}
            >
              次回開始特典: {nextRunBonus.icon} {nextRunBonus.shortLabel}
            </div>
            <div
              style={{
                color: 'rgba(255,255,255,0.78)',
                overflowWrap: 'anywhere',
              }}
            >
              {formatStageRunBonusLabel(nextRunBonus)}
            </div>
          </div>
        )}

        <div
          style={{
            position: 'sticky',
            bottom: -1,
            zIndex: 2,
            display: 'grid',
            gridTemplateColumns: isCompact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
            gap: 8,
            margin: '0 -2px -2px',
            padding: '9px 2px 2px',
            background: 'linear-gradient(to top, rgba(7, 10, 15, 0.97), rgba(7, 10, 15, 0.84) 72%, rgba(7, 10, 15, 0))',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          <button
            id="stage-result-continue"
            type="button"
            onClick={handleContinue}
            style={{
              ...resultButtonStyle('#4caf50'),
              ...(isCompact ? { gridColumn: '1 / -1' } : {}),
            }}
          >
            ▶ 続ける
          </button>
          <button
            id="stage-result-restart"
            type="button"
            onClick={handleRestart}
            style={resultButtonStyle(stage.color)}
          >
            ↻ もう一度
          </button>
          <button
            id="stage-result-menu"
            type="button"
            onClick={handleReturnToMenu}
            style={resultButtonStyle('#78909c')}
          >
            ⌂ タイトル
          </button>
        </div>
      </div>
    </div>
  );
}

function resultButtonStyle(color: string): CSSProperties {
  return {
    padding: '12px 10px',
    borderRadius: 7,
    border: `2px solid ${color}aa`,
    background: `${color}44`,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 15,
    fontWeight: 900,
    fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
    letterSpacing: 0,
    boxShadow: `0 4px 14px ${color}22`,
  };
}
