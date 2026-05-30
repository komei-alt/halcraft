// 次のマップイベントと発動中の効果を表示するHUD

import { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useStageEventStore } from '../../stores/useStageEventStore';
import { getStageEvent } from '../../types/stageEvents';
import { getStagePressure } from '../../types/stagePressures';
import { isTouchDevice } from '../../utils/device';

function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return minutes > 0 ? `${minutes}:${rest.toString().padStart(2, '0')}` : `${rest}s`;
}

export function StageEventHUD() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const elapsedSeconds = useGameStore((s) => s.stageElapsedSeconds);
  const nextTriggerAtSeconds = useStageEventStore((s) => s.nextTriggerAtSeconds);
  const recentEvent = useStageEventStore((s) => s.recentEvent);
  const [now, setNow] = useState(() => performance.now());
  const isCompact = isTouchDevice() || window.innerWidth <= 560;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  if (phase !== 'playing' || !stage || isCompact) return null;

  const definition = getStageEvent(stage.id);
  if (!definition || nextTriggerAtSeconds === null) return null;

  const pressure = getStagePressure(stage.id);
  const active = Boolean(recentEvent && recentEvent.activeUntil > now);
  const remainingSeconds = Math.max(0, nextTriggerAtSeconds - elapsedSeconds);
  const label = active ? recentEvent?.label ?? definition.label : `次まで ${formatCountdown(remainingSeconds)}`;
  const title = active ? recentEvent?.title ?? definition.title : definition.title;
  const detail = active ? recentEvent?.detail ?? definition.detail : definition.detail;
  const accent = active ? recentEvent?.accent ?? definition.accent : definition.accent;
  const progress = active && recentEvent
    ? Math.max(0, Math.min(1, (recentEvent.activeUntil - now) / Math.max(1, recentEvent.activeUntil - recentEvent.createdAt)))
    : 1 - Math.max(0, Math.min(1, remainingSeconds / definition.repeatEverySeconds));

  return (
    <div
      id="stage-event-hud"
      style={{
        position: 'fixed',
        top: pressure ? 258 : 132,
        right: 16,
        zIndex: 96,
        width: 276,
        padding: '9px 11px',
        borderRadius: 8,
        border: `1px solid ${accent}5f`,
        background: 'rgba(8, 11, 16, 0.5)',
        boxShadow: active ? `0 0 20px ${accent}44` : `0 0 12px ${accent}1f`,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        color: '#fff',
        pointerEvents: 'none',
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 7,
            display: 'grid',
            placeItems: 'center',
            background: `${accent}24`,
            border: `1px solid ${accent}66`,
            fontSize: 18,
            flex: '0 0 auto',
          }}
        >
          {active ? recentEvent?.icon : definition.icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              color: accent,
              fontSize: 10,
              lineHeight: '13px',
              fontWeight: 900,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {active ? 'マップイベント発生中' : '次のマップイベント'}
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.94)',
              fontSize: 13,
              lineHeight: '16px',
              fontWeight: 900,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
        </div>
        <div
          style={{
            flex: '0 0 auto',
            color: active ? '#fff1a8' : 'rgba(255,255,255,0.68)',
            fontSize: 10,
            lineHeight: '12px',
            fontWeight: 900,
            fontFamily: 'monospace',
            textAlign: 'right',
          }}
        >
          {label}
        </div>
      </div>
      <div
        style={{
          marginTop: 6,
          color: 'rgba(255,255,255,0.58)',
          fontSize: 10,
          lineHeight: '13px',
          fontWeight: 800,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {detail}
      </div>
      <div
        style={{
          marginTop: 6,
          height: 5,
          borderRadius: 999,
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.12)',
        }}
      >
        <div
          style={{
            width: `${Math.round(progress * 100)}%`,
            height: '100%',
            borderRadius: 999,
            background: active
              ? `linear-gradient(90deg, #fff2a6, ${accent})`
              : `linear-gradient(90deg, ${stage.color}, ${accent})`,
            transition: 'width 0.25s ease',
          }}
        />
      </div>
    </div>
  );
}
