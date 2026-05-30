// ステージ環境プレッシャーHUD
// 暑さ・寒さ・暗がりなど、マップ固有の危険と対策を短く表示する

import { useMemo } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useStagePressureStore } from '../../stores/useStagePressureStore';
import { getStagePressure } from '../../types/stagePressures';
import { isTouchDevice } from '../../utils/device';

const SEVERITY_COLORS = {
  safe: '#8ff0d2',
  watch: '#ffe28a',
  danger: '#ffaf6d',
  critical: '#ff6f86',
} as const;

export function StagePressureHUD() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const pressure = useStagePressureStore((s) => s.pressure);
  const severity = useStagePressureStore((s) => s.severity);
  const isSheltered = useStagePressureStore((s) => s.isSheltered);
  const timeMultiplier = useStagePressureStore((s) => s.timeMultiplier);
  const statusLabel = useStagePressureStore((s) => s.statusLabel);
  const isCompact = isTouchDevice() || window.innerWidth <= 560;

  const definition = useMemo(() => getStagePressure(stage?.id), [stage?.id]);

  if (phase !== 'playing' || !stage || !definition) return null;

  const severityColor = SEVERITY_COLORS[severity];
  const pressurePercent = Math.round(pressure * 100);
  const title = timeMultiplier <= 0
    ? '環境はおだやか'
    : isSheltered
      ? definition.safeLabel
      : statusLabel;

  return (
    <div
      id="stage-pressure-hud"
      style={{
        position: 'fixed',
        top: isCompact ? 244 : 226,
        right: isCompact ? 14 : 16,
        zIndex: 96,
        width: isCompact ? 'min(248px, calc(100vw - 28px))' : 276,
        padding: isCompact ? '8px 10px' : '10px 12px',
        borderRadius: 8,
        border: `1px solid ${definition.accent}66`,
        background: 'rgba(6, 9, 14, 0.56)',
        boxShadow: severity === 'critical'
          ? `0 0 24px ${severityColor}55`
          : `0 0 14px ${definition.accent}22`,
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
            width: isCompact ? 28 : 32,
            height: isCompact ? 28 : 32,
            borderRadius: 7,
            display: 'grid',
            placeItems: 'center',
            background: `${definition.accent}24`,
            border: `1px solid ${definition.accent}66`,
            fontSize: isCompact ? 16 : 18,
            flex: '0 0 auto',
          }}
        >
          {definition.icon}
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
            マップ環境
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
          color: isSheltered || timeMultiplier <= 0 ? '#a8ffe9' : severityColor,
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
          {definition.protectLabel}
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
            background: `linear-gradient(90deg, ${definition.accent}, ${severityColor})`,
            transition: 'width 0.24s ease',
          }}
        />
      </div>
    </div>
  );
}
