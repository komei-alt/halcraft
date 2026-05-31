// 命中・撃破フィードバックHUD
// 3Dのダメージ表示とは別に、手元の照準付近で当たった実感を返す

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import {
  MASTERY_DEFS,
  type MasteryEvent,
  useMasteryStore,
} from '../../stores/useMasteryStore';
import type { EquippedItem } from '../../stores/usePlayerStore';
import { isTouchDevice } from '../../utils/device';
import {
  playCombatFeedbackSound,
  playCombatTechniqueSound,
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

export function CombatFeedbackHUD() {
  const phase = useGameStore((s) => s.phase);
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
      };
      setFeedback(nextFeedback);
      playCombatFeedbackSound(kind);
      const technique = getTechniqueFeedback(nextFeedback);
      if (technique.soundKind) {
        playCombatTechniqueSound(technique.soundKind);
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
          border: `1px solid ${def.accent}66`,
          background: isDefeat
            ? 'rgba(28, 18, 8, 0.72)'
            : 'rgba(8, 12, 18, 0.66)',
          color: '#fff',
          boxShadow: `0 0 16px ${isDefeat ? 'rgba(255, 214, 96, 0.28)' : def.glow}`,
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          animation: 'combatFeedbackPop 0.76s ease-out forwards',
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
              background: isDefeat ? 'rgba(255, 214, 96, 0.18)' : def.glow,
              border: `1px solid ${def.accent}66`,
              fontSize: isCompact ? 12 : 14,
            }}
          >
            {def.icon}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                color: isDefeat ? '#ffe680' : isCritical ? '#fff1a8' : def.accent,
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
            background: `${def.accent}14`,
            border: `1px solid ${def.accent}38`,
            boxShadow: `inset 0 0 12px ${def.glow}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span
              style={{
                minWidth: 0,
                color: def.accent,
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
                background: `linear-gradient(90deg, ${def.accent}, #ffffff)`,
                boxShadow: `0 0 8px ${def.glow}`,
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
      </div>
    </div>
  );
}
