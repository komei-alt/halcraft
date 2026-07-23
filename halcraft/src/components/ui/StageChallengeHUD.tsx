// ステージチャレンジHUD
// そのマップ固有の3つの達成目標を小さく表示する

import { useEffect } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useStageChallengeStore, getStageChallengeMedalLabel } from '../../stores/useStageChallengeStore';
import { useIsRideMode } from '../../utils/hudRideMode';
import {
  getStageChallengeMedal,
  getStageChallengeProgress,
  getStageChallenges,
} from '../../types/stageChallenges';
import { isTouchDevice } from '../../utils/device';
import { STAGE_MOBILE_RAIL_TOP } from './stageHudLayout';
import { HUD_TEXT_SHADOW, SG } from './startScreenTheme';

const CHALLENGE_OPPORTUNITY_RATIO = 0.68;

function isNearChallengeGoal(current: number, target: number): boolean {
  if (target <= 0 || current <= 0) return false;
  const remaining = Math.max(0, target - current);
  return current / target >= CHALLENGE_OPPORTUNITY_RATIO || remaining <= Math.max(1, Math.ceil(target * 0.22));
}

export function StageChallengeHUD() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const rideMode = useIsRideMode();
  const stats = useStageChallengeStore((s) => s.stats);
  const completedIds = useStageChallengeStore((s) => s.completedIds);
  const recentCompletion = useStageChallengeStore((s) => s.recentCompletion);
  const clearRecentCompletion = useStageChallengeStore((s) => s.clearRecentCompletion);
  const isCompact = isTouchDevice() || window.innerWidth <= 560;

  useEffect(() => {
    if (!recentCompletion) return undefined;
    const timer = window.setTimeout(() => {
      clearRecentCompletion();
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [clearRecentCompletion, recentCompletion]);

  // 搭乗中は左上レールを畳んで射撃視界を優先
  if (phase !== 'playing' || !stage || rideMode) return null;

  const challenges = getStageChallenges(stage.id);
  if (challenges.length === 0) return null;

  const medal = getStageChallengeMedal(completedIds.length, challenges.length);
  const medalLabel = getStageChallengeMedalLabel(medal);

  return (
    <div
      id="stage-challenge-hud"
      style={{
        position: 'fixed',
        top: isCompact ? STAGE_MOBILE_RAIL_TOP.challenge : 252,
        left: isCompact ? 14 : 64,
        zIndex: 95,
        width: isCompact ? 'min(248px, calc(100vw - 28px))' : 310,
        maxHeight: isCompact ? 'max(132px, calc(100vh - 548px))' : 'none',
        overflow: 'hidden',
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 7,
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,0.88)',
            fontSize: isCompact ? 11 : 12,
            fontWeight: 900,
            whiteSpace: 'nowrap',
          }}
        >
          ステージチャレンジ
        </div>
        <div
          style={{
            color: medal === 'gold' ? '#ffe680' : 'rgba(255,255,255,0.65)',
            fontSize: isCompact ? 9 : 10,
            fontWeight: 900,
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
          }}
        >
          {completedIds.length}/{challenges.length} {medalLabel}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {challenges.map((challenge) => {
          const progress = getStageChallengeProgress(challenge, stats);
          const isCompleted = completedIds.includes(challenge.id);
          const remaining = Math.max(0, progress.target - progress.current);
          const isNearGoal = !isCompleted && !progress.completed && isNearChallengeGoal(progress.current, progress.target);
          const progressText = isNearGoal
            ? `あと${remaining}`
            : `${Math.min(progress.current, progress.target)}/${progress.target}`;
          return (
            <div
              key={challenge.id}
              style={{
                animation: isNearGoal ? 'stageOpportunityGlow 0.9s ease-in-out infinite alternate' : undefined,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  minWidth: 0,
                  color: isCompleted ? '#fff5b5' : isNearGoal ? '#fff1a8' : 'rgba(255,255,255,0.82)',
                }}
              >
                <span
                  style={{
                    flex: '0 0 auto',
                    fontSize: isCompact ? 12 : 13,
                    filter: isNearGoal ? `drop-shadow(0 0 6px ${challenge.accent})` : undefined,
                  }}
                >
                  {isCompleted ? '✓' : isNearGoal ? '!' : challenge.icon}
                </span>
                <span
                  style={{
                    minWidth: 0,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: isCompact ? 10 : 11,
                    fontWeight: 850,
                    lineHeight: '14px',
                  }}
                >
                  {challenge.title}
                </span>
                <span
                  style={{
                    flex: '0 0 auto',
                    fontSize: isCompact ? 9 : 10,
                    fontWeight: 900,
                    fontFamily: 'monospace',
                    color: isCompleted || isNearGoal ? '#fff1a8' : 'rgba(255,255,255,0.58)',
                  }}
                >
                  {progressText}
                </span>
              </div>
              <div
                style={{
                  marginTop: 3,
                  height: isNearGoal ? 5 : 4,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.11)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progress.ratio * 100}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: isCompleted
                      ? 'linear-gradient(90deg, #ffdd66, #ffffff)'
                      : isNearGoal
                        ? `linear-gradient(90deg, ${challenge.accent}, #fff1a8, #ffffff)`
                      : `linear-gradient(90deg, ${challenge.accent}, ${stage.color})`,
                    transition: 'width 0.25s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {recentCompletion && (
        <div
          key={recentCompletion.id}
          style={{
            marginTop: 8,
            paddingLeft: 9,
            borderLeft: '3px solid #ffe678',
            color: '#fff2a6',
            fontSize: isCompact ? 10 : 11,
            lineHeight: '14px',
            fontWeight: 900,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            animation: 'masteryPulse 0.42s ease-out',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {recentCompletion.icon} {recentCompletion.title} 達成
            </span>
            <span style={{ flex: '0 0 auto', fontFamily: 'monospace' }}>
              {recentCompletion.completedCount}/{recentCompletion.totalCount}
            </span>
          </div>
          {recentCompletion.rewardLabel && (
            <div
              style={{
                color: recentCompletion.rewardAccent ?? '#fff2a6',
                fontSize: isCompact ? 9 : 10,
                lineHeight: '12px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              報酬 {recentCompletion.rewardLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
