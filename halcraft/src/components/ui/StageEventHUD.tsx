// 次のマップイベントと発動中の効果を表示するHUD

import { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useStageEventStore } from '../../stores/useStageEventStore';
import { getStageEvent } from '../../types/stageEvents';
import { getStagePressure } from '../../types/stagePressures';
import { isTouchDevice } from '../../utils/device';
import { getStageEventHudDisplay } from './stageEventDisplay';
import { STAGE_RIGHT_RAIL_TOP } from './stageHudLayout';

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
  const display = getStageEventHudDisplay(definition, elapsedSeconds, nextTriggerAtSeconds, recentEvent, now);

  return (
    <div
      id="stage-event-hud"
      style={{
        position: 'fixed',
        top: pressure ? STAGE_RIGHT_RAIL_TOP.eventWithPressure : STAGE_RIGHT_RAIL_TOP.eventWithoutPressure,
        right: 16,
        zIndex: 96,
        width: 276,
        padding: '9px 11px',
        borderRadius: 8,
        border: `1px solid ${display.accent}5f`,
        background: 'rgba(8, 11, 16, 0.5)',
        boxShadow: display.active ? `0 0 20px ${display.accent}44` : `0 0 12px ${display.accent}1f`,
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
            background: `${display.accent}24`,
            border: `1px solid ${display.accent}66`,
            fontSize: 18,
            flex: '0 0 auto',
          }}
        >
          {display.icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              color: display.accent,
              fontSize: 10,
              lineHeight: '13px',
              fontWeight: 900,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {display.statusLabel}
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
            {display.title}
          </div>
        </div>
        <div
          style={{
            flex: '0 0 auto',
            color: display.active ? '#fff1a8' : 'rgba(255,255,255,0.68)',
            fontSize: 10,
            lineHeight: '12px',
            fontWeight: 900,
            fontFamily: 'monospace',
            textAlign: 'right',
          }}
        >
          {display.timerLabel}
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
        {display.detail}
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
            width: `${Math.round(display.progress * 100)}%`,
            height: '100%',
            borderRadius: 999,
            background: display.active
              ? `linear-gradient(90deg, #fff2a6, ${display.accent})`
              : `linear-gradient(90deg, ${stage.color}, ${display.accent})`,
            transition: 'width 0.25s ease',
          }}
        />
      </div>
    </div>
  );
}
