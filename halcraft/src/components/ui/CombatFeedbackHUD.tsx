// 命中・撃破フィードバックHUD
// 3Dのダメージ表示とは別に、手元の照準付近で当たった実感を返す

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import {
  getModeFlowRankLabel,
  useModeFlowStore,
} from '../../stores/useModeFlowStore';
import {
  MASTERY_DEFS,
  type MasteryEvent,
  useMasteryStore,
} from '../../stores/useMasteryStore';
import type { EquippedItem } from '../../stores/usePlayerStore';
import {
  formatStageCombatBonus,
  getStageCombatStyle,
  getStageCombatStyleForItem,
  getStageCombatWeaponLabel,
} from '../../types/stageCombatStyles';
import { getStageModeRule } from '../../types/stageModeRules';
import { isTouchDevice } from '../../utils/device';
import {
  playCombatFeedbackSound,
  playCombatTechniqueSound,
  playStageCombatCueSound,
  type CombatTechniqueSoundKind,
} from '../../utils/sounds';

interface CombatFeedback {
  id: number;
  item: EquippedItem;
  kind: 'hit' | 'critical' | 'defeat';
  label: string;
  xp: number;
  streak: number;
  techniqueRecordUpdated: boolean;
  createdAt: number;
}

interface TechniqueFeedback {
  eyebrow: string;
  label: string;
  detail: string;
  meterLabel: string;
  meterText: string;
  ratio: number;
  soundKind: CombatTechniqueSoundKind | null;
}

interface StageTacticFeedback {
  accent: string;
  glow: string;
  eyebrow: string;
  label: string;
  detail: string;
  meterLabel: string;
  meterText: string;
  ratio: number;
  matched: boolean;
}

const DISPLAY_MS = 1120;

function isCombatFeedbackEvent(event: MasteryEvent): boolean {
  return event.kind === 'hit' || event.kind === 'defeat';
}

function getFeedbackKind(event: MasteryEvent): CombatFeedback['kind'] {
  if (event.kind === 'defeat') return 'defeat';
  return event.critical ? 'critical' : 'hit';
}

function getFeedbackLabel(feedback: CombatFeedback): string {
  if (feedback.kind === 'defeat') return 'DOWN';
  if (feedback.kind === 'critical') return 'CRIT';
  return 'HIT';
}

function getTechniqueFeedback(feedback: CombatFeedback): TechniqueFeedback {
  if (feedback.item === 'rocket_launcher') {
    if (feedback.techniqueRecordUpdated) {
      return {
        eyebrow: 'ロケット記録',
        label: '爆風BEST更新',
        detail: '今の巻き込みがロケット技の新記録',
        meterLabel: 'BLAST',
        meterText: 'NEW',
        ratio: 1,
        soundKind: 'ready',
      };
    }
    if (feedback.kind === 'critical') {
      return {
        eyebrow: 'ロケット技',
        label: '巻き込み成功',
        detail: '密集へ撃つとチャレンジと熟練が伸びる',
        meterLabel: 'BLAST',
        meterText: 'AREA',
        ratio: 1,
        soundKind: 'blast',
      };
    }
    if (feedback.kind === 'defeat') {
      return {
        eyebrow: 'ロケット技',
        label: '爆風で撃破',
        detail: '再装填後に次の群れへ向ける',
        meterLabel: 'BLAST',
        meterText: 'DOWN',
        ratio: 0.88,
        soundKind: 'finish',
      };
    }
    return {
      eyebrow: 'ロケット技',
      label: '爆風確認',
      detail: '直撃より少し奥を狙うと巻き込める',
      meterLabel: 'BLAST',
      meterText: '+HIT',
      ratio: 0.66,
      soundKind: null,
    };
  }

  if (feedback.item === 'machine_gun') {
    if (feedback.techniqueRecordUpdated) {
      return {
        eyebrow: '制圧記録',
        label: 'チェーンBEST更新',
        detail: '当て続けた弾幕が新記録',
        meterLabel: 'BURST',
        meterText: 'NEW',
        ratio: 1,
        soundKind: 'ready',
      };
    }
    if (feedback.streak >= 8) {
      return {
        eyebrow: '制圧技',
        label: '弾幕チェーン',
        detail: '照準を保つほど敵を押し返せる',
        meterLabel: 'BURST',
        meterText: `x${feedback.streak}`,
        ratio: 1,
        soundKind: 'chain',
      };
    }
    if (feedback.kind === 'defeat') {
      return {
        eyebrow: '制圧技',
        label: '押し切り撃破',
        detail: 'スコープで集弾、腰撃ちで足止め',
        meterLabel: 'BURST',
        meterText: 'DOWN',
        ratio: 0.86,
        soundKind: 'finish',
      };
    }
    return {
      eyebrow: '制圧技',
      label: feedback.streak >= 3 ? '照準維持' : '命中確認',
      detail: '連続ヒットで制圧チェーンへ',
      meterLabel: 'BURST',
      meterText: feedback.streak >= 3 ? `x${feedback.streak}` : 'HOLD',
      ratio: Math.min(1, feedback.streak / 8),
      soundKind: feedback.streak >= 5 ? 'chain' : null,
    };
  }

  if (feedback.item === 'lightsaber') {
    if (feedback.techniqueRecordUpdated) {
      return {
        eyebrow: 'セイバー記録',
        label: 'コンボBEST更新',
        detail: '今の斬撃がセイバー技の新記録',
        meterLabel: 'COMBO',
        meterText: 'NEW',
        ratio: 1,
        soundKind: 'ready',
      };
    }
    if (feedback.kind === 'critical') {
      return {
        eyebrow: 'セイバー技',
        label: 'フィニッシュ斬り',
        detail: '5段目を当てると大きく熟練が伸びる',
        meterLabel: 'COMBO',
        meterText: 'FIN',
        ratio: 1,
        soundKind: 'finish',
      };
    }
    if (feedback.streak >= 5) {
      return {
        eyebrow: 'セイバー技',
        label: 'コンボ継続',
        detail: '次の斬撃まで間を空けすぎない',
        meterLabel: 'COMBO',
        meterText: `x${feedback.streak}`,
        ratio: 0.92,
        soundKind: 'chain',
      };
    }
    return {
      eyebrow: 'セイバー技',
      label: '斬撃ヒット',
      detail: '近距離でつなぐとフィニッシュへ',
      meterLabel: 'COMBO',
      meterText: `${Math.min(5, Math.max(1, feedback.streak))}/5`,
      ratio: Math.min(1, feedback.streak / 5),
      soundKind: null,
    };
  }

  if (feedback.techniqueRecordUpdated) {
    return {
      eyebrow: 'ビルダー記録',
      label: '制作連鎖更新',
      detail: '作る流れがビルダー技の新記録',
      meterLabel: 'BUILD',
      meterText: 'NEW',
      ratio: 1,
      soundKind: 'ready',
    };
  }

  return {
    eyebrow: 'ビルダー技',
    label: feedback.kind === 'critical' ? '会心ヒット' : '近接確認',
    detail: '道具を整えると採掘も戦闘も安定する',
    meterLabel: 'BUILD',
    meterText: feedback.kind === 'defeat' ? 'DOWN' : 'HIT',
    ratio: feedback.kind === 'defeat' ? 1 : 0.58,
    soundKind: feedback.kind === 'defeat' ? 'finish' : null,
  };
}

function getStageTacticFeedback(
  feedback: CombatFeedback,
  currentStageId: string | null,
  modeMeter: number,
  modeLastGain: number,
  modeLastGainAt: number,
  modeLastCombatStyleItem: EquippedItem | null,
  modeFlowRank: number,
): StageTacticFeedback | null {
  const rule = getStageModeRule(currentStageId);
  const recommendedStyle = getStageCombatStyle(currentStageId);
  if (!rule || rule.category !== 'war' || !recommendedStyle) return null;

  const matchedStyle = getStageCombatStyleForItem(currentStageId, feedback.item);
  const threshold = Math.max(1, rule.threshold);
  const ratio = Math.max(0, Math.min(1, modeMeter / threshold));
  const rankLabel = getModeFlowRankLabel(rule.category, modeFlowRank);

  if (!matchedStyle) {
    return {
      accent: recommendedStyle.accent,
      glow: `${recommendedStyle.accent}3f`,
      eyebrow: 'マップ作戦',
      label: '推奨武器へ切替',
      detail: `${getStageCombatWeaponLabel(recommendedStyle.weapon)}なら${rule.meterLabel}が進む / ${formatStageCombatBonus(recommendedStyle)}`,
      meterLabel: 'MAP',
      meterText: 'SWAP',
      ratio: 0.24,
      matched: false,
    };
  }

  const hasRecentGain = modeLastCombatStyleItem === feedback.item
    && modeLastGainAt >= feedback.createdAt - 24
    && modeLastGainAt <= feedback.createdAt + 700;
  const gainText = hasRecentGain && modeLastGain > 0 ? `+${modeLastGain}` : '進行';
  const nextText = Math.max(0, threshold - modeMeter);
  return {
    accent: matchedStyle.accent,
    glow: `${matchedStyle.accent}55`,
    eyebrow: matchedStyle.shortLabel,
    label: `${rule.meterLabel}${gainText}`,
    detail: `${rankLabel} / 次の${rule.shortLabel}まであと${Math.ceil(nextText)} / ${formatStageCombatBonus(matchedStyle)}`,
    meterLabel: rule.meterLabel.toUpperCase(),
    meterText: `${Math.round(ratio * 100)}%`,
    ratio,
    matched: true,
  };
}

export function CombatFeedbackHUD() {
  const phase = useGameStore((s) => s.phase);
  const currentStageId = useGameStore((s) => s.currentStageId);
  const modeMeter = useModeFlowStore((s) => s.meter);
  const modeLastGain = useModeFlowStore((s) => s.lastGain);
  const modeLastGainAt = useModeFlowStore((s) => s.lastGainAt);
  const modeLastCombatStyleItem = useModeFlowStore((s) => s.lastCombatStyleItem);
  const modeFlowRank = useModeFlowStore((s) => s.flowRank);
  const [feedback, setFeedback] = useState<CombatFeedback | null>(null);
  const clearTimerRef = useRef<number | null>(null);
  const lastEventIdRef = useRef<number | null>(null);
  const isCompact = isTouchDevice() || window.innerWidth <= 560;

  const clearTimer = useCallback(() => {
    if (clearTimerRef.current === null) return;
    window.clearTimeout(clearTimerRef.current);
    clearTimerRef.current = null;
  }, []);

  useEffect(() => {
    const unsubscribe = useMasteryStore.subscribe((state) => {
      const event = state.recentEvent;
      if (useGameStore.getState().phase !== 'playing' || !event) return;
      if (lastEventIdRef.current === event.id || !isCombatFeedbackEvent(event)) return;
      lastEventIdRef.current = event.id;

      const kind = getFeedbackKind(event);
      const nextFeedback = {
        id: event.id,
        item: event.item,
        kind,
        label: event.label,
        xp: event.xp,
        streak: event.streak,
        techniqueRecordUpdated: event.techniqueRecordUpdated,
        createdAt: event.createdAt,
      };
      setFeedback(nextFeedback);
      playCombatFeedbackSound(kind);
      const technique = getTechniqueFeedback(nextFeedback);
      if (technique.soundKind) {
        playCombatTechniqueSound(technique.soundKind);
      }
      const matchedStyle = getStageCombatStyleForItem(useGameStore.getState().currentStageId, event.item);
      if (matchedStyle) {
        playStageCombatCueSound(
          event.critical || event.kind === 'defeat' || event.techniqueRecordUpdated ? 'surge' : 'match',
        );
      }

      clearTimer();
      clearTimerRef.current = window.setTimeout(() => {
        clearTimerRef.current = null;
        setFeedback((current) => (current?.id === event.id ? null : current));
      }, DISPLAY_MS);
    });

    return () => {
      unsubscribe();
      clearTimer();
    };
  }, [clearTimer]);

  if (phase !== 'playing' || !feedback) return null;

  const def = MASTERY_DEFS[feedback.item];
  const isDefeat = feedback.kind === 'defeat';
  const isCritical = feedback.kind === 'critical';
  const label = getFeedbackLabel(feedback);
  const technique = getTechniqueFeedback(feedback);
  const stageTactic = getStageTacticFeedback(
    feedback,
    currentStageId,
    modeMeter,
    modeLastGain,
    modeLastGainAt,
    modeLastCombatStyleItem,
    modeFlowRank,
  );
  const accent = stageTactic?.matched ? stageTactic.accent : def.accent;
  const glow = stageTactic?.matched ? stageTactic.glow : def.glow;

  return (
    <div
      id="combat-feedback-hud"
      key={feedback.id}
      style={{
        position: 'fixed',
        // 照準（画面中央のクロスヘア）に重ならないよう、デスクトップはクロスヘアの右上へ寄せる。
        // 射撃の視界中心と射線を空けつつ、手応えのパネルは視界の隅で確認できる位置に置く。
        left: isCompact ? '50%' : 'calc(50% + 52px)',
        top: isCompact ? 204 : 'calc(50% - 156px)',
        transform: isCompact ? 'translateX(-50%)' : 'none',
        zIndex: 121,
        pointerEvents: 'none',
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
      }}
    >
      <div
        style={{
          width: isCompact ? 'min(236px, calc(100vw - 32px))' : 222,
          padding: isCompact ? '5px 7px' : '6px 9px',
          borderRadius: 6,
          border: `1px solid ${accent}73`,
          background: isDefeat
            ? 'rgba(28, 18, 8, 0.72)'
            : stageTactic?.matched
              ? 'rgba(12, 15, 18, 0.72)'
              : 'rgba(8, 12, 18, 0.66)',
          color: '#fff',
          boxShadow: `0 0 ${stageTactic?.matched ? 24 : 16}px ${isDefeat ? 'rgba(255, 214, 96, 0.28)' : glow}`,
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          animation: stageTactic?.matched
            ? 'combatFeedbackPop 0.76s ease-out forwards, combatStagePulse 0.58s ease-out'
            : 'combatFeedbackPop 0.76s ease-out forwards',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span
            style={{
              width: isCompact ? 20 : 24,
              height: isCompact ? 20 : 24,
              flex: '0 0 auto',
              display: 'grid',
              placeItems: 'center',
              borderRadius: 5,
              background: isDefeat ? 'rgba(255, 214, 96, 0.18)' : glow,
              border: `1px solid ${accent}66`,
              fontSize: isCompact ? 12 : 14,
            }}
          >
            {def.icon}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                color: isDefeat ? '#ffe680' : isCritical ? '#fff1a8' : accent,
                fontSize: isCompact ? 11 : 12,
                lineHeight: '13px',
                fontWeight: 950,
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
              {feedback.streak >= 3 ? ` x${feedback.streak}` : ''}
            </div>
            <div
              style={{
                color: 'rgba(255,255,255,0.86)',
                fontSize: isCompact ? 9 : 10,
                lineHeight: '12px',
                fontWeight: 850,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {feedback.label}
            </div>
          </div>
          <span
            style={{
              flex: '0 0 auto',
              color: isDefeat ? '#ffe680' : 'rgba(255,255,255,0.72)',
              fontSize: isCompact ? 9 : 10,
              lineHeight: '12px',
              fontWeight: 950,
              fontFamily: 'monospace',
            }}
          >
            +{feedback.xp}
          </span>
        </div>
        <div
          style={{
            marginTop: 6,
            padding: isCompact ? '5px 6px' : '6px 7px',
            borderRadius: 5,
            background: `${accent}14`,
            border: `1px solid ${accent}38`,
            boxShadow: `inset 0 0 12px ${glow}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span
              style={{
                minWidth: 0,
                color: accent,
                fontSize: isCompact ? 9 : 10,
                lineHeight: '12px',
                fontWeight: 950,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {technique.eyebrow}: {technique.label}
            </span>
            <span
              style={{
                flex: '0 0 auto',
                color: 'rgba(255,255,255,0.72)',
                fontSize: isCompact ? 8 : 9,
                lineHeight: '12px',
                fontWeight: 950,
                fontFamily: 'monospace',
              }}
            >
              {technique.meterLabel} {technique.meterText}
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
                width: `${Math.round(technique.ratio * 100)}%`,
                height: '100%',
                borderRadius: 999,
                background: `linear-gradient(90deg, ${accent}, #ffffff)`,
                boxShadow: `0 0 8px ${glow}`,
              }}
            />
          </div>
          <div
            style={{
              marginTop: 3,
              color: 'rgba(255,255,255,0.58)',
              fontSize: isCompact ? 8 : 9,
              lineHeight: '11px',
              fontWeight: 760,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {technique.detail}
          </div>
        </div>
        {stageTactic && (
          <div
            style={{
              marginTop: 5,
              padding: isCompact ? '5px 6px' : '6px 7px',
              borderRadius: 5,
              background: stageTactic.matched
                ? `linear-gradient(90deg, ${stageTactic.accent}24, rgba(255,255,255,0.06))`
                : 'rgba(255,255,255,0.06)',
              border: `1px solid ${stageTactic.accent}${stageTactic.matched ? '66' : '38'}`,
              boxShadow: stageTactic.matched ? `0 0 12px ${stageTactic.glow}` : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span
                style={{
                  minWidth: 0,
                  color: stageTactic.accent,
                  fontSize: isCompact ? 8 : 9,
                  lineHeight: '11px',
                  fontWeight: 950,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {stageTactic.eyebrow}: {stageTactic.label}
              </span>
              <span
                style={{
                  flex: '0 0 auto',
                  color: stageTactic.matched ? '#fff4b0' : 'rgba(255,255,255,0.62)',
                  fontSize: isCompact ? 8 : 9,
                  lineHeight: '11px',
                  fontWeight: 950,
                  fontFamily: 'monospace',
                }}
              >
                {stageTactic.meterLabel} {stageTactic.meterText}
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
                  width: `${Math.round(stageTactic.ratio * 100)}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: stageTactic.matched
                    ? `linear-gradient(90deg, ${stageTactic.accent}, #fff4b0)`
                    : `linear-gradient(90deg, ${stageTactic.accent}, rgba(255,255,255,0.5))`,
                  boxShadow: `0 0 8px ${stageTactic.glow}`,
                }}
              />
            </div>
            <div
              style={{
                marginTop: 3,
                color: stageTactic.matched ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.58)',
                fontSize: isCompact ? 8 : 9,
                lineHeight: '11px',
                fontWeight: 780,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {stageTactic.detail}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
