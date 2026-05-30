// レベルアップ・チャレンジ達成・ステージ特性発動を見逃さない祝福トースト

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import {
  getMasteryTitle,
  MASTERY_DEFS,
  useMasteryStore,
} from '../../stores/useMasteryStore';
import { useStageBuildScoreStore } from '../../stores/useStageBuildScoreStore';
import { getStageChallengeMedalLabel, useStageChallengeStore } from '../../stores/useStageChallengeStore';
import { useStageConditionStore } from '../../stores/useStageConditionStore';
import { useStageEventStore } from '../../stores/useStageEventStore';
import { useItemFeedbackStore } from '../../stores/useItemFeedbackStore';
import { useModeFlowStore } from '../../stores/useModeFlowStore';
import { getMasteryPerkSummary, isMasteryPerkUpgradeLevel } from '../../types/masteryPerks';
import { isTouchDevice } from '../../utils/device';

interface CelebrationToast {
  id: string;
  icon: string;
  eyebrow: string;
  title: string;
  detail: string;
  accent: string;
  glow: string;
}

const DISPLAY_MS = 3400;
const MAX_TOASTS = 3;

export function ProgressCelebration() {
  const phase = useGameStore((s) => s.phase);
  const [toasts, setToasts] = useState<CelebrationToast[]>([]);
  const lastMasteryIdRef = useRef<number | null>(null);
  const lastChallengeIdRef = useRef<string | null>(null);
  const lastConditionIdRef = useRef<string | null>(null);
  const lastStageEventIdRef = useRef<string | null>(null);
  const lastBuildScoreIdRef = useRef<string | null>(null);
  const lastItemFeedbackIdRef = useRef<string | null>(null);
  const lastModeFlowIdRef = useRef<string | null>(null);
  const timersRef = useRef<number[]>([]);
  const isCompact = isTouchDevice() || window.innerWidth <= 560;

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((toast: CelebrationToast) => {
    setToasts((current) => [toast, ...current.filter((item) => item.id !== toast.id)].slice(0, MAX_TOASTS));
    const timer = window.setTimeout(() => removeToast(toast.id), DISPLAY_MS);
    timersRef.current.push(timer);
  }, [removeToast]);

  useEffect(() => () => {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const unsubscribeMastery = useMasteryStore.subscribe((state, previous) => {
      const event = state.recentEvent;
      if (useGameStore.getState().phase !== 'playing' || !event?.leveledUp) return;
      if (event.id === previous.recentEvent?.id || lastMasteryIdRef.current === event.id) return;
      lastMasteryIdRef.current = event.id;

      const def = MASTERY_DEFS[event.item];
      const perkUpgraded = isMasteryPerkUpgradeLevel(event.item, event.level);
      addToast({
        id: `mastery-${event.id}`,
        icon: def.icon,
        eyebrow: perkUpgraded ? '特典強化' : 'レベルアップ',
        title: `${def.shortLabel} Lv.${event.level}`,
        detail: perkUpgraded
          ? getMasteryPerkSummary(event.item, event.level)
          : getMasteryTitle(event.item, event.level),
        accent: def.accent,
        glow: def.glow,
      });
    });

    const unsubscribeChallenge = useStageChallengeStore.subscribe((state, previous) => {
      const completion = state.recentCompletion;
      if (useGameStore.getState().phase !== 'playing' || !completion) return;
      if (completion.id === previous.recentCompletion?.id || lastChallengeIdRef.current === completion.id) return;
      lastChallengeIdRef.current = completion.id;

      addToast({
        id: `challenge-${completion.id}-${completion.createdAt}`,
        icon: completion.icon,
        eyebrow: 'チャレンジ達成',
        title: completion.title,
        detail: completion.rewardLabel
          ? `${completion.completedCount}/${completion.totalCount} ${getStageChallengeMedalLabel(completion.medal)} / 報酬 ${completion.rewardLabel}`
          : `${completion.completedCount}/${completion.totalCount} ${getStageChallengeMedalLabel(completion.medal)}`,
        accent: completion.rewardAccent ?? (completion.medal === 'gold' ? '#ffe680' : '#9bdcff'),
        glow: completion.medal === 'gold'
          ? 'rgba(255, 230, 120, 0.32)'
          : 'rgba(120, 210, 255, 0.24)',
      });
    });

    const unsubscribeCondition = useStageConditionStore.subscribe((state, previous) => {
      const activation = state.recentActivation;
      if (useGameStore.getState().phase !== 'playing' || !activation) return;
      if (activation.id === previous.recentActivation?.id || lastConditionIdRef.current === activation.id) return;
      lastConditionIdRef.current = activation.id;

      addToast({
        id: `condition-${activation.id}`,
        icon: activation.icon,
        eyebrow: 'ステージ特性発動',
        title: activation.title,
        detail: activation.label,
        accent: '#fff1a8',
        glow: 'rgba(255, 230, 120, 0.3)',
      });
    });

    const unsubscribeStageEvent = useStageEventStore.subscribe((state, previous) => {
      const event = state.recentEvent;
      if (useGameStore.getState().phase !== 'playing' || !event) return;
      if (event.id === previous.recentEvent?.id || lastStageEventIdRef.current === event.id) return;
      lastStageEventIdRef.current = event.id;

      addToast({
        id: `stage-event-${event.id}`,
        icon: event.icon,
        eyebrow: 'マップイベント',
        title: event.title,
        detail: event.label,
        accent: event.accent,
        glow: `${event.accent}40`,
      });
    });

    const unsubscribeBuildScore = useStageBuildScoreStore.subscribe((state, previous) => {
      const milestone = state.recentMilestone;
      if (useGameStore.getState().phase !== 'playing' || !milestone) return;
      if (milestone.id === previous.recentMilestone?.id || lastBuildScoreIdRef.current === milestone.id) return;
      lastBuildScoreIdRef.current = milestone.id;

      addToast({
        id: `build-score-${milestone.id}`,
        icon: milestone.icon,
        eyebrow: '作品評価アップ',
        title: milestone.title,
        detail: milestone.detail,
        accent: milestone.accent,
        glow: milestone.glow,
      });
    });

    const unsubscribeItemFeedback = useItemFeedbackStore.subscribe((state, previous) => {
      const feedback = state.recentFeedback;
      if (useGameStore.getState().phase !== 'playing' || !feedback) return;
      if (feedback.id === previous.recentFeedback?.id || lastItemFeedbackIdRef.current === feedback.id) return;
      lastItemFeedbackIdRef.current = feedback.id;

      addToast({
        id: feedback.id,
        icon: feedback.icon,
        eyebrow: feedback.eyebrow,
        title: feedback.title,
        detail: feedback.detail,
        accent: feedback.accent,
        glow: feedback.glow,
      });
    });

    const unsubscribeModeFlow = useModeFlowStore.subscribe((state, previous) => {
      const activation = state.recentActivation;
      if (useGameStore.getState().phase !== 'playing' || !activation) return;
      if (activation.id === previous.recentActivation?.id || lastModeFlowIdRef.current === activation.id) return;
      lastModeFlowIdRef.current = activation.id;

      addToast({
        id: `mode-flow-${activation.id}`,
        icon: activation.icon,
        eyebrow: activation.eyebrow,
        title: activation.title,
        detail: activation.detail,
        accent: activation.accent,
        glow: activation.glow,
      });
    });

    return () => {
      unsubscribeMastery();
      unsubscribeChallenge();
      unsubscribeCondition();
      unsubscribeStageEvent();
      unsubscribeBuildScore();
      unsubscribeItemFeedback();
      unsubscribeModeFlow();
    };
  }, [addToast]);

  if (phase !== 'playing' || toasts.length === 0) return null;

  return (
    <div
      id="progress-celebration"
      style={{
        position: 'fixed',
        top: isCompact ? 92 : 70,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 125,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: isCompact ? 7 : 8,
        width: isCompact ? 'min(330px, calc(100vw - 28px))' : 390,
        pointerEvents: 'none',
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            position: 'relative',
            width: '100%',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            gap: isCompact ? 9 : 11,
            padding: isCompact ? '9px 11px' : '11px 13px',
            borderRadius: 8,
            border: `1px solid ${toast.accent}88`,
            background: 'linear-gradient(135deg, rgba(12, 16, 24, 0.86), rgba(20, 26, 36, 0.66))',
            boxShadow: `0 0 22px ${toast.glow}, inset 0 1px 0 rgba(255,255,255,0.16)`,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            color: '#fff',
            animation: 'celebrationToast 3.4s ease forwards',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(110deg, transparent 0%, ${toast.accent}22 42%, rgba(255,255,255,0.18) 50%, transparent 62%)`,
              animation: 'celebrationShimmer 1.15s ease-out',
            }}
          />
          <div
            style={{
              position: 'relative',
              flex: '0 0 auto',
              width: isCompact ? 34 : 38,
              height: isCompact ? 34 : 38,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              background: `${toast.accent}24`,
              border: `1px solid ${toast.accent}77`,
              boxShadow: `0 0 14px ${toast.glow}`,
              fontSize: isCompact ? 19 : 21,
              animation: 'celebrationIconPop 0.55s ease-out',
            }}
          >
            {toast.icon}
          </div>
          <div style={{ position: 'relative', minWidth: 0, flex: 1 }}>
            <div
              style={{
                color: toast.accent,
                fontSize: isCompact ? 10 : 11,
                lineHeight: '13px',
                fontWeight: 900,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {toast.eyebrow}
            </div>
            <div
              style={{
                marginTop: 1,
                color: 'rgba(255,255,255,0.96)',
                fontSize: isCompact ? 14 : 15,
                lineHeight: isCompact ? '17px' : '18px',
                fontWeight: 950,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {toast.title}
            </div>
            <div
              style={{
                marginTop: 2,
                color: 'rgba(255,255,255,0.72)',
                fontSize: isCompact ? 10 : 11,
                lineHeight: '14px',
                fontWeight: 800,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {toast.detail}
            </div>
          </div>
          <div
            style={{
              position: 'relative',
              flex: '0 0 auto',
              display: 'flex',
              gap: 4,
            }}
          >
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: toast.accent,
                  opacity: 0.8,
                  animation: `celebrationDot 0.9s ease-in-out ${dot * 0.12}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
