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
import { playCombatFeedbackSound } from '../../utils/sounds';

interface CombatFeedback {
  id: number;
  item: EquippedItem;
  kind: 'hit' | 'critical' | 'defeat';
  label: string;
  xp: number;
  streak: number;
}

const DISPLAY_MS = 760;

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
      setFeedback({
        id: event.id,
        item: event.item,
        kind,
        label: event.label,
        xp: event.xp,
        streak: event.streak,
      });
      playCombatFeedbackSound(kind);

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

  return (
    <div
      id="combat-feedback-hud"
      key={feedback.id}
      style={{
        position: 'fixed',
        left: '50%',
        top: isCompact ? 204 : '50%',
        transform: isCompact ? 'translateX(-50%)' : 'translate(-50%, -68px)',
        zIndex: 121,
        pointerEvents: 'none',
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
      }}
    >
      <div
        style={{
          minWidth: isCompact ? 96 : 126,
          maxWidth: isCompact ? 138 : 180,
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
      </div>
    </div>
  );
}
