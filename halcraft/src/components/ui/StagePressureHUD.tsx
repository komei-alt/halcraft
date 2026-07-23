// ステージ環境プレッシャーHUD
// 暑さ・寒さ・暗がりなど、マップ固有の危険と対策を短く表示する

import { useEffect, useMemo } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useStagePressureStore } from '../../stores/useStagePressureStore';
import { getStagePressure } from '../../types/stagePressures';
import { isTouchDevice } from '../../utils/device';
import { useIsRideMode } from '../../utils/hudRideMode';
import { STAGE_MOBILE_RAIL_TOP, STAGE_RIGHT_RAIL_TOP } from './stageHudLayout';
import { HUD_TEXT_SHADOW, SG } from './startScreenTheme';

const SEVERITY_COLORS = {
  safe: '#8ff0d2',
  watch: '#ffe28a',
  danger: '#ffaf6d',
  critical: '#ff6f86',
} as const;

export function StagePressureHUD() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const rideMode = useIsRideMode();
  const pressure = useStagePressureStore((s) => s.pressure);
  const severity = useStagePressureStore((s) => s.severity);
  const isSheltered = useStagePressureStore((s) => s.isSheltered);
  const timeMultiplier = useStagePressureStore((s) => s.timeMultiplier);
  const statusLabel = useStagePressureStore((s) => s.statusLabel);
  const recentRelief = useStagePressureStore((s) => s.recentRelief);
  const clearRecentRelief = useStagePressureStore((s) => s.clearRecentRelief);
  const isCompact = isTouchDevice() || window.innerWidth <= 560;

  const definition = useMemo(() => getStagePressure(stage?.id), [stage?.id]);

  useEffect(() => {
    if (!recentRelief) return undefined;
    const timer = window.setTimeout(() => clearRecentRelief(), 2800);
    return () => window.clearTimeout(timer);
  }, [clearRecentRelief, recentRelief]);

  if (phase !== 'playing' || !stage || !definition || rideMode) return null;

  const activeRelief = recentRelief?.stageId === stage.id ? recentRelief : null;
  const severityColor = SEVERITY_COLORS[severity];
  const pressurePercent = Math.round(pressure * 100);
  const title = activeRelief
    ? activeRelief.title
    : timeMultiplier <= 0
    ? '環境はおだやか'
    : isSheltered
      ? definition.safeLabel
      : statusLabel;
  const detail = activeRelief
    ? activeRelief.detail
    : `${definition.protectLabel} / ${definition.reliefLabel}`;

  return (
    <div
      id="stage-pressure-hud"
      style={{
        position: 'fixed',
        top: isCompact ? STAGE_MOBILE_RAIL_TOP.pressure : STAGE_RIGHT_RAIL_TOP.pressure,
        right: isCompact ? 14 : 16,
        zIndex: 96,
        width: isCompact ? 'min(248px, calc(100vw - 28px))' : 276,
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
            fontSize: isCompact ? 18 : 21,
            flex: '0 0 auto',
            filter: activeRelief
              ? `drop-shadow(0 0 8px ${definition.accent})`
              : `drop-shadow(0 1px 3px rgba(0,0,0,0.9))`,
          }}
        >
          {activeRelief?.icon ?? definition.icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              color: definition.accent,
              fontSize: isCompact ? 10 : 11,
              lineHeight: '13px',
              fontWeight: 900,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {activeRelief ? '環境対策' : 'マップ環境'}
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.94)',
              fontSize: isCompact ? 12 : 13,
              lineHeight: '16px',
              fontWeight: 900,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {definition.title}
          </div>
        </div>
        <div
          style={{
            flex: '0 0 auto',
            minWidth: 42,
            textAlign: 'right',
            color: severityColor,
            fontSize: isCompact ? 10 : 11,
            fontWeight: 900,
            fontFamily: 'monospace',
          }}
        >
          {pressurePercent}%
        </div>
      </div>

      <div
        style={{
          marginTop: 7,
          color: activeRelief || isSheltered || timeMultiplier <= 0 ? '#a8ffe9' : severityColor,
          fontSize: isCompact ? 10 : 11,
          lineHeight: '14px',
          fontWeight: 900,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </div>
      {!isCompact && (
        <div
          style={{
            marginTop: 4,
            color: 'rgba(255,255,255,0.58)',
            fontSize: 10,
            lineHeight: '13px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {detail}
        </div>
      )}

      <div
        style={{
          marginTop: 7,
          height: 5,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.12)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pressurePercent}%`,
            height: '100%',
            borderRadius: 999,
            background: activeRelief
              ? `linear-gradient(90deg, #fff2a6, ${definition.accent})`
              : `linear-gradient(90deg, ${definition.accent}, ${severityColor})`,
            transition: 'width 0.24s ease',
          }}
        />
      </div>
    </div>
  );
}
