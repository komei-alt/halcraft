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
import { useVehicleFirepowerStore } from '../../stores/useVehicleFirepowerStore';
import { getMasteryPerkSummary, isMasteryPerkUpgradeLevel } from '../../types/masteryPerks';
import { formatMasteryTechniqueBonus, getMasteryTechniqueBonus } from '../../types/masteryTechniquePerks';
import { getStageChallenges } from '../../types/stageChallenges';
import { formatStageMasteryPerkLabel, getStageMasteryPerkForProgress } from '../../types/stageMastery';
import { formatStageRunBonusLabel, getStageRunBonusForProgress } from '../../types/stageRunBonuses';
import { isTouchDevice } from '../../utils/device';
import { playPerkUnlockSound, playStageRewardSound } from '../../utils/sounds';

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

function getTechniqueRecordValue(item: keyof typeof MASTERY_DEFS, streak: number, score: number): string {
  if (item === 'rocket_launcher') return `BEST ${score}`;
  return `BEST x${streak}`;
}

export function ProgressCelebration() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const runId = useGameStore((s) => s.runId);
  const challengeBestByStage = useStageChallengeStore((s) => s.bestByStage);
  const buildBestByStage = useStageBuildScoreStore((s) => s.bestByStage);
  const [toasts, setToasts] = useState<CelebrationToast[]>([]);
  const lastMasteryIdRef = useRef<number | null>(null);
  const lastChallengeIdRef = useRef<string | null>(null);
  const lastConditionIdRef = useRef<string | null>(null);
  const lastStageEventIdRef = useRef<string | null>(null);
  const lastBuildScoreIdRef = useRef<string | null>(null);
  const lastBuildComboIdRef = useRef<string | null>(null);
  const lastItemFeedbackIdRef = useRef<string | null>(null);
  const lastModeFlowIdRef = useRef<string | null>(null);
  const lastVehicleFirepowerIdRef = useRef<string | null>(null);
  const lastRunBonusKeyRef = useRef<string | null>(null);
  const pendingRunBonusKeyRef = useRef<string | null>(null);
  const timersRef = useRef<number[]>([]);
  const lastTechniqueRecordIdRef = useRef<number | null>(null);
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
    if (phase !== 'playing' || !stage) return;

    const toastKey = `${runId}-${stage.id}`;
    if (lastRunBonusKeyRef.current === toastKey) return;
    if (pendingRunBonusKeyRef.current === toastKey) return;

    const challengeBest = challengeBestByStage[stage.id];
    const challengeMedal = challengeBest?.medal ?? 'none';
    const buildScore = buildBestByStage[stage.id]?.score ?? 0;
    const runBonus = getStageRunBonusForProgress(stage.id, challengeMedal, buildScore);
    const masteryPerk = getStageMasteryPerkForProgress({
      stage,
      completedCount: challengeBest?.completedCount ?? 0,
      challengeCount: getStageChallenges(stage.id).length,
      buildScore,
    });
    if (!runBonus && !masteryPerk) return;

    pendingRunBonusKeyRef.current = toastKey;
    const timer = window.setTimeout(() => {
      pendingRunBonusKeyRef.current = null;
      if (useGameStore.getState().phase !== 'playing') return;
      if (useGameStore.getState().currentStage?.id !== stage.id) return;
      if (lastRunBonusKeyRef.current === toastKey) return;

      lastRunBonusKeyRef.current = toastKey;
      playStageRewardSound(stage.category === 'build' ? 'build_supply' : 'war_supply');
      if (masteryPerk) {
        addToast({
          id: `mastery-perk-${toastKey}`,
          icon: masteryPerk.icon,
          eyebrow: 'マップ熟練特典',
          title: `${masteryPerk.shortLabel} ${masteryPerk.title}`,
          detail: formatStageMasteryPerkLabel(masteryPerk),
          accent: masteryPerk.accent,
          glow: masteryPerk.glow,
        });
      }
      if (runBonus) {
        addToast({
          id: `run-bonus-${toastKey}`,
          icon: runBonus.icon,
          eyebrow: runBonus.sourceLabel,
          title: `${runBonus.shortLabel} ${runBonus.title}`,
          detail: formatStageRunBonusLabel(runBonus),
          accent: runBonus.accent,
          glow: `${runBonus.accent}44`,
        });
      }
    }, 260);
    timersRef.current.push(timer);

    return () => {
      window.clearTimeout(timer);
      if (pendingRunBonusKeyRef.current === toastKey) {
        pendingRunBonusKeyRef.current = null;
      }
    };
  }, [addToast, buildBestByStage, challengeBestByStage, phase, runId, stage]);

  useEffect(() => {
    const unsubscribeMastery = useMasteryStore.subscribe((state, previous) => {
      const event = state.recentEvent;
      if (useGameStore.getState().phase !== 'playing' || !event) return;
      if (event.id === previous.recentEvent?.id) return;

      const def = MASTERY_DEFS[event.item];
      const itemState = state.items[event.item];

      if (event.techniqueRecordUpdated && lastTechniqueRecordIdRef.current !== event.id) {
        lastTechniqueRecordIdRef.current = event.id;
        const techniqueBonus = getMasteryTechniqueBonus(event.item, itemState);
        const recordValue = getTechniqueRecordValue(
          event.item,
          itemState.bestTechniqueStreak ?? event.streak,
          itemState.bestTechniqueScore ?? 0,
        );
        playPerkUnlockSound();
        addToast({
          id: `technique-record-${event.id}`,
          icon: def.icon,
          eyebrow: '技記録更新',
          title: `${def.shortLabel} ${recordValue}`,
          detail: `${event.label} / ${techniqueBonus.title}: ${techniqueBonus.tierLabel} ${formatMasteryTechniqueBonus(event.item, techniqueBonus)}`,
          accent: def.accent,
          glow: def.glow,
        });
      }

      if (event.leveledUp && lastMasteryIdRef.current !== event.id) {
        lastMasteryIdRef.current = event.id;
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
      }
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

    const unsubscribeBuildCombo = useStageBuildScoreStore.subscribe((state, previous) => {
      const combo = state.recentCombo;
      if (useGameStore.getState().phase !== 'playing' || !combo) return;
      if (combo.id === previous.recentCombo?.id || lastBuildComboIdRef.current === combo.id) return;
      lastBuildComboIdRef.current = combo.id;

      addToast({
        id: `build-combo-${combo.id}`,
        icon: '🧩',
        eyebrow: '素材コンボ',
        title: combo.title,
        detail: combo.detail,
        accent: combo.accent,
        glow: combo.glow,
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
        eyebrow: `${activation.eyebrow} / ${activation.rankLabel}`,
        title: activation.title,
        detail: activation.detail,
        accent: activation.accent,
        glow: activation.glow,
      });
    });

    const unsubscribeVehicleFirepower = useVehicleFirepowerStore.subscribe((state, previous) => {
      const event = state.recentEvent;
      if (useGameStore.getState().phase !== 'playing' || !event?.celebration) return;
      if (event.id === previous.recentEvent?.id || lastVehicleFirepowerIdRef.current === event.id) return;
      lastVehicleFirepowerIdRef.current = event.id;

      addToast({
        id: event.id,
        icon: event.icon,
        eyebrow: event.eyebrow,
        title: event.title,
        detail: `${event.detail} / ${event.meterText}`,
        accent: event.accent,
        glow: event.glow,
      });
    });

    return () => {
      unsubscribeMastery();
      unsubscribeChallenge();
      unsubscribeCondition();
      unsubscribeStageEvent();
      unsubscribeBuildScore();
      unsubscribeBuildCombo();
      unsubscribeItemFeedback();
      unsubscribeModeFlow();
      unsubscribeVehicleFirepower();
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
