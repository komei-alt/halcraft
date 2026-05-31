// 次のマップイベントと発動中の効果を表示するHUD

import { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useStageEventStore } from '../../stores/useStageEventStore';
import { getStageEvent } from '../../types/stageEvents';
import { getStagePressure } from '../../types/stagePressures';
import { isTouchDevice } from '../../utils/device';
import { getStageEventHudDisplay } from './stageEventDisplay';
import { STAGE_RIGHT_RAIL_TOP } from './stageHudLayout';
import { HUD_TEXT_SHADOW, SG } from './startScreenTheme';

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
        padding: 0,
        background: 'none',
        border: 'none',
        boxShadow: 'none',
        color: '#fff',
        pointerEvents: 'none',
        textShadow: HUD_TEXT_SHADOW,
        fontFamily: SG.font,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div
          style={{
            fontSize: 21,
            flex: '0 0 auto',
            filter: display.active ? `drop-shadow(0 0 7px ${display.accent})` : 'drop-shadow(0 1px 3px rgba(0,0,0,0.9))',
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
