// マップ熟練ランクアップ演出
// チャレンジや作品評価でマップ熟練が上がった瞬間をプレイ中に返す

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useStageBuildScoreStore } from '../../stores/useStageBuildScoreStore';
import { useStageChallengeStore } from '../../stores/useStageChallengeStore';
import {
  formatStageMasteryPerkLabel,
  getStageMasteryPerk,
  getStageMasterySummary,
  type StageMasteryRank,
  type StageMasterySummary,
} from '../../types/stageMastery';
import { getStageChallenges } from '../../types/stageChallenges';
import { isTouchDevice } from '../../utils/device';
import { playPerkUnlockSound } from '../../utils/sounds';
import { HUD_TEXT_SHADOW, SG } from './startScreenTheme';

interface StageMasteryMoment {
  key: string;
  summary: StageMasterySummary;
  previousRankLabel: string;
  visibleUntil: number;
}

const RANK_VALUES: Record<StageMasteryRank, number> = {
  new: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  master: 4,
};

const DISPLAY_MS = 4600;

function getRankValue(rank: StageMasteryRank): number {
  return RANK_VALUES[rank] ?? 0;
}

export function StageMasteryMomentHUD() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const runId = useGameStore((s) => s.runId);
  const completedIds = useStageChallengeStore((s) => s.completedIds);
  const challengeBestByStage = useStageChallengeStore((s) => s.bestByStage);
  const buildScore = useStageBuildScoreStore((s) => s.score);
  const buildBestByStage = useStageBuildScoreStore((s) => s.bestByStage);
  const [now, setNow] = useState(() => performance.now());
  const [moment, setMoment] = useState<StageMasteryMoment | null>(null);
  const baselineRef = useRef<{
    runKey: string;
    rankValue: number;
    rankLabel: string;
  } | null>(null);

  const isCompact = isTouchDevice() || window.innerWidth <= 560;
  const challengeCount = useMemo(() => getStageChallenges(stage?.id).length, [stage?.id]);
  const previousSummary = useMemo(() => {
    if (!stage) return null;
    return getStageMasterySummary({
      stage,
      completedCount: challengeBestByStage[stage.id]?.completedCount ?? 0,
      challengeCount,
      buildScore: buildBestByStage[stage.id]?.score ?? 0,
    });
  }, [buildBestByStage, challengeBestByStage, challengeCount, stage]);
  const currentSummary = useMemo(() => {
    if (!stage) return null;
    return getStageMasterySummary({
      stage,
      completedCount: completedIds.length,
      challengeCount,
      buildScore,
    });
  }, [buildScore, challengeCount, completedIds.length, stage]);

  useEffect(() => {
    if (phase !== 'playing' || !stage || !previousSummary || !currentSummary) return undefined;

    const runKey = `${runId}:${stage.id}`;
    if (baselineRef.current?.runKey !== runKey) {
      baselineRef.current = {
        runKey,
        rankValue: getRankValue(previousSummary.rank),
        rankLabel: previousSummary.rankLabel,
      };
      return undefined;
    }

    const baseline = baselineRef.current;
    const currentRankValue = getRankValue(currentSummary.rank);
    if (currentRankValue <= baseline.rankValue || currentSummary.rank === 'new') return undefined;

    const previousRankLabel = baseline.rankLabel;
    baselineRef.current = {
      runKey,
      rankValue: currentRankValue,
      rankLabel: currentSummary.rankLabel,
    };

    const timer = window.setTimeout(() => {
      const nowMs = performance.now();
      setNow(nowMs);
      setMoment({
        key: `${runKey}:mastery:${currentSummary.rank}:${Math.round(nowMs)}`,
        summary: currentSummary,
        previousRankLabel,
        visibleUntil: nowMs + DISPLAY_MS,
      });
      playPerkUnlockSound();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [currentSummary, phase, previousSummary, runId, stage]);

  useEffect(() => {
    if (!moment) return undefined;
    const timer = window.setInterval(() => setNow(performance.now()), 120);
    return () => window.clearInterval(timer);
  }, [moment]);

  if (phase !== 'playing' || !stage || !moment || now > moment.visibleUntil) return null;

  const perk = getStageMasteryPerk(stage, moment.summary);
  const progress = Math.max(0, Math.min(1, (moment.visibleUntil - now) / DISPLAY_MS));
  const perkLabel = perk ? formatStageMasteryPerkLabel(perk) : moment.summary.nextLabel;

  return (
    <div
      id="stage-mastery-moment-hud"
      style={{
        position: 'fixed',
        top: isCompact ? 158 : 138,
        left: '50%',
        zIndex: 112,
        width: isCompact ? 'min(316px, calc(100vw - 28px))' : 420,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        color: '#fff',
        textShadow: HUD_TEXT_SHADOW,
        fontFamily: SG.font,
        animation: 'stageMasteryMomentIn 0.24s ease-out both',
      }}
    >
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          padding: isCompact ? '10px 12px' : '12px 14px',
          borderRadius: 8,
          border: `1px solid ${moment.summary.accent}77`,
          background: `linear-gradient(135deg, ${moment.summary.accent}2b, rgba(4,7,12,0.66))`,
          boxShadow: `0 12px 30px rgba(0,0,0,0.38), 0 0 28px ${moment.summary.glow}`,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(110deg, transparent, ${moment.summary.accent}2f, transparent)`,
            transform: 'translateX(-65%)',
            animation: 'stageMasterySweep 1.25s ease-out both',
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
              background: `${moment.summary.accent}26`,
              border: `1px solid ${moment.summary.accent}66`,
              boxShadow: `0 0 16px ${moment.summary.glow}`,
              fontSize: isCompact ? 22 : 25,
            }}
          >
            {moment.summary.mastered ? '👑' : stage.icon}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                color: moment.summary.accent,
                fontSize: isCompact ? 9 : 10,
                lineHeight: '12px',
                fontWeight: 950,
                letterSpacing: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              マップ熟練UP / {moment.previousRankLabel} → {moment.summary.rankLabel}
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
              {stage.name}: {moment.summary.title}
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
              次回特典: {perkLabel || moment.summary.nextLabel}
            </div>
          </div>
          <div
            style={{
              flex: '0 0 auto',
              color: moment.summary.accent,
              fontSize: isCompact ? 15 : 18,
              lineHeight: '20px',
              fontWeight: 950,
              fontFamily: 'monospace',
              textAlign: 'right',
            }}
          >
            {moment.summary.score}%
          </div>
        </div>
        <div
          style={{
            position: 'relative',
            marginTop: 8,
            height: 4,
            borderRadius: 999,
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.13)',
          }}
        >
          <span
            style={{
              display: 'block',
              width: `${Math.round(progress * 100)}%`,
              height: '100%',
              borderRadius: 999,
              background: `linear-gradient(90deg, ${moment.summary.accent}, #ffffff)`,
            }}
          />
        </div>
      </div>
      <style>
        {`
          @keyframes stageMasteryMomentIn {
            from { opacity: 0; transform: translate(-50%, -10px) scale(0.98); }
            to { opacity: 1; transform: translate(-50%, 0) scale(1); }
          }
          @keyframes stageMasterySweep {
            from { transform: translateX(-70%); }
            to { transform: translateX(92%); }
          }
        `}
      </style>
    </div>
  );
}
