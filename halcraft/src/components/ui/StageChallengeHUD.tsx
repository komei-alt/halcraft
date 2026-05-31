// ステージチャレンジHUD
// そのマップ固有の3つの達成目標を小さく表示する

import { useEffect } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useStageChallengeStore, getStageChallengeMedalLabel } from '../../stores/useStageChallengeStore';
import {
  getStageChallengeMedal,
  getStageChallengeProgress,
  getStageChallenges,
} from '../../types/stageChallenges';
import { isTouchDevice } from '../../utils/device';
import { STAGE_MOBILE_RAIL_TOP } from './stageHudLayout';

export function StageChallengeHUD() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
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

  if (phase !== 'playing' || !stage) return null;

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
        padding: isCompact ? '8px 9px' : '10px 12px',
        borderRadius: 14,
        border: `1px solid ${stage.color}3a`,
        background: 'rgba(8, 11, 17, 0.3)',
        backdropFilter: 'blur(11px)',
        WebkitBackdropFilter: 'blur(11px)',
        color: '#fff',
        pointerEvents: 'none',
        boxShadow: '0 6px 22px rgba(0,0,0,0.3)',
        textShadow: '0 1px 3px rgba(0,0,0,0.85)',
        fontFamily: "'M PLUS Rounded 1c','Hiragino Maru Gothic ProN','Segoe UI','Hiragino Sans',sans-serif",
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
          return (
            <div key={challenge.id}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  minWidth: 0,
                  color: isCompleted ? '#fff5b5' : 'rgba(255,255,255,0.82)',
                }}
              >
                <span style={{ flex: '0 0 auto', fontSize: isCompact ? 12 : 13 }}>
                  {isCompleted ? '✓' : challenge.icon}
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
                    color: isCompleted ? '#fff1a8' : 'rgba(255,255,255,0.58)',
                  }}
                >
                  {Math.min(progress.current, progress.target)}/{progress.target}
                </span>
              </div>
              <div
                style={{
                  marginTop: 3,
                  height: 4,
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
            padding: '6px 7px',
            borderRadius: 6,
            background: 'rgba(255, 230, 120, 0.18)',
            border: '1px solid rgba(255, 230, 120, 0.22)',
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
