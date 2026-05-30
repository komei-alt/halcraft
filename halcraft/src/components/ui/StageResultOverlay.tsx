// ステージ結果画面
// ステージを遊び切った瞬間に評価・次アクション・リプレイ導線をまとめて出す

import { useCallback, useEffect, useMemo, type CSSProperties } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { useStageChallengeStore } from '../../stores/useStageChallengeStore';
import {
  getStageChallengeMedal,
  getStageChallengeMedalLabel,
  getStageChallengeProgress,
  getStageChallenges,
} from '../../types/stageChallenges';
import { formatStageRunBonusLabel, getStageRunBonus } from '../../types/stageRunBonuses';
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

export function StageResultOverlay() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const isBuildMode = useGameStore((s) => s.isBuildMode);
  const enemiesDefeated = useGameStore((s) => s.enemiesDefeated);
  const stageElapsedSeconds = useGameStore((s) => s.stageElapsedSeconds);
  const completeStage = useGameStore((s) => s.completeStage);
  const continueAfterStageClear = useGameStore((s) => s.continueAfterStageClear);
  const startGame = useGameStore((s) => s.startGame);
  const returnToMenu = useGameStore((s) => s.returnToMenu);
  const leave = useMultiplayerStore((s) => s.leave);
  const stats = useStageChallengeStore((s) => s.stats);
  const completedIds = useStageChallengeStore((s) => s.completedIds);
  const resultDismissed = useStageChallengeStore((s) => s.resultDismissed);
  const dismissStageResult = useStageChallengeStore((s) => s.dismissStageResult);
  const isTouch = isTouchDevice();

  const challenges = useMemo(() => getStageChallenges(stage?.id), [stage?.id]);
  const isGold = challenges.length > 0 && completedIds.length >= challenges.length;
  const stageCleared = Boolean(stage) && (
    isBuildMode
      ? isGold
      : stats.bossDefeated > 0
  );

  useEffect(() => {
    if (phase !== 'playing' || !stageCleared || resultDismissed) return;
    document.exitPointerLock?.();
    completeStage();
    playLevelUpSound();
  }, [completeStage, phase, resultDismissed, stageCleared]);

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
      : '制作完了';
  const actionHint = incomplete
    ? `${incomplete.title} もねらえる`
    : stage.category === 'war'
      ? '別の戦場でも金メダルをねらえる'
      : '別のマップでも作品を増やせる';
  const nextRunBonus = getStageRunBonus(stage.id, medal);
  const targetCount = stage.rules.objective.targetCount;
  const objectiveValue = targetCount
    ? `${Math.min(enemiesDefeated, targetCount)}/${targetCount}`
    : formatElapsed(stageElapsedSeconds);

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
        padding: isTouch ? 14 : 24,
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
          padding: isTouch ? 16 : 22,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isTouch ? 10 : 14,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: isTouch ? 52 : 64,
              height: isTouch ? 52 : 64,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              background: `${stage.color}33`,
              border: `1px solid ${stage.color}88`,
              fontSize: isTouch ? 28 : 34,
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
                fontSize: isTouch ? 13 : 15,
                fontWeight: 900,
                letterSpacing: 0,
              }}
            >
              {resultTitle}
            </div>
            <div
              style={{
                color: '#fff',
                fontSize: isTouch ? 24 : 34,
                lineHeight: isTouch ? '30px' : '40px',
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
              fontSize: isTouch ? 12 : 15,
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
            gridTemplateColumns: isTouch ? '1fr' : 'repeat(3, minmax(0, 1fr))',
            gap: 8,
            marginBottom: 14,
          }}
        >
          {[
            ['目標', objectiveValue],
            ['ボス', stats.bossDefeated > 0 ? '撃破' : stage.category === 'war' ? '未撃破' : 'なし'],
            ['時間', formatElapsed(stageElapsedSeconds)],
          ].map(([label, value]) => (
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
                      fontSize: isTouch ? 12 : 13,
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
                    fontSize: isTouch ? 11 : 12,
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
            fontSize: isTouch ? 12 : 13,
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
              fontSize: isTouch ? 11 : 12,
              fontWeight: 850,
              lineHeight: '17px',
            }}
          >
            <div
              style={{
                color: nextRunBonus.accent,
                fontSize: isTouch ? 10 : 11,
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
            display: 'grid',
            gridTemplateColumns: isTouch ? '1fr' : 'repeat(3, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          <button
            id="stage-result-continue"
            type="button"
            onClick={handleContinue}
            style={resultButtonStyle('#4caf50')}
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
