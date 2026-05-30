// モードフローHUD
// 建築/戦争というゲームモードそのものの手触り差を常時見えるようにする

import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useModeFlowStore } from '../../stores/useModeFlowStore';
import { formatStageModeReward, getStageModeRule } from '../../types/stageModeRules';
import { getStagePressure } from '../../types/stagePressures';
import { isTouchDevice } from '../../utils/device';
import { STAGE_RIGHT_RAIL_TOP } from './stageHudLayout';

function formatSeconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}

export function ModeFlowHUD() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const meter = useModeFlowStore((s) => s.meter);
  const lastGainLabel = useModeFlowStore((s) => s.lastGainLabel);
  const streak = useModeFlowStore((s) => s.streak);
  const bestStreak = useModeFlowStore((s) => s.bestStreak);
  const streakExpiresAt = useModeFlowStore((s) => s.streakExpiresAt);
  const activationCount = useModeFlowStore((s) => s.activationCount);
  const recentActivation = useModeFlowStore((s) => s.recentActivation);
  const clearRecentActivation = useModeFlowStore((s) => s.clearRecentActivation);
  const [now, setNow] = useState(() => performance.now());
  const isCompact = isTouchDevice() || window.innerWidth <= 560;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!recentActivation) return undefined;
    const timer = window.setTimeout(() => clearRecentActivation(), 2800);
    return () => window.clearTimeout(timer);
  }, [clearRecentActivation, recentActivation]);

  const rule = useMemo(() => getStageModeRule(stage?.id), [stage?.id]);
  const pressure = useMemo(() => getStagePressure(stage?.id), [stage?.id]);

  if (phase !== 'playing' || !stage || !rule || isCompact) return null;

  const progress = Math.max(0, Math.min(1, meter / rule.threshold));
  const streakRemainingMs = rule.category === 'war' ? Math.max(0, streakExpiresAt - now) : 0;
  const activeTitle = recentActivation?.stageId === stage.id ? recentActivation.title : rule.title;
  const activeDetail = recentActivation?.stageId === stage.id
    ? recentActivation.detail
    : rule.category === 'build'
      ? rule.actionLabel
      : streak > 0
        ? `連続${streak}体 / 残り${formatSeconds(streakRemainingMs)}`
        : rule.actionLabel;
  const meterText = `${Math.floor(meter)}/${rule.threshold}`;

  return (
    <div
      id="mode-flow-hud"
      style={{
        position: 'fixed',
        top: isCompact
          ? 358
          : pressure
            ? STAGE_RIGHT_RAIL_TOP.modeWithPressure
            : STAGE_RIGHT_RAIL_TOP.modeWithoutPressure,
        right: isCompact ? 14 : 16,
        zIndex: 95,
        width: isCompact ? 'min(248px, calc(100vw - 28px))' : 276,
        padding: isCompact ? '8px 10px' : '10px 12px',
        borderRadius: 8,
        border: `1px solid ${rule.accent}66`,
        background: 'rgba(7, 10, 15, 0.55)',
        boxShadow: recentActivation?.stageId === stage.id
          ? `0 0 22px ${rule.glow}`
          : `0 0 14px ${rule.accent}20`,
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
            background: `${rule.accent}22`,
            border: `1px solid ${rule.accent}66`,
            fontSize: isCompact ? 16 : 18,
            flex: '0 0 auto',
          }}
        >
          {rule.icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              color: rule.accent,
              fontSize: isCompact ? 10 : 11,
              lineHeight: '13px',
              fontWeight: 900,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {rule.category === 'build' ? '建築モード' : '戦争モード'} / {rule.meterLabel}
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.94)',
              fontSize: isCompact ? 12 : 13,
              lineHeight: '16px',
              fontWeight: 950,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {activeTitle}
          </div>
        </div>
        <div
          style={{
            flex: '0 0 auto',
            color: recentActivation?.stageId === stage.id ? '#fff1a8' : 'rgba(255,255,255,0.72)',
            fontSize: isCompact ? 10 : 11,
            fontWeight: 950,
            fontFamily: 'monospace',
            textAlign: 'right',
          }}
        >
          {meterText}
        </div>
      </div>

      <div
        style={{
          marginTop: 7,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          color: 'rgba(255,255,255,0.64)',
          fontSize: isCompact ? 10 : 11,
          lineHeight: '14px',
          fontWeight: 850,
        }}
      >
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeDetail}
        </span>
        <span style={{ flex: '0 0 auto', color: rule.accent, fontFamily: 'monospace', fontWeight: 950 }}>
          {lastGainLabel ?? (rule.category === 'war' && bestStreak > 0 ? `BEST x${bestStreak}` : `${activationCount}回`)}
        </span>
      </div>

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
            width: `${Math.round(progress * 100)}%`,
            height: '100%',
            borderRadius: 999,
            background: recentActivation?.stageId === stage.id
              ? `linear-gradient(90deg, #fff2a6, ${rule.accent})`
              : `linear-gradient(90deg, ${stage.color}, ${rule.accent})`,
            transition: 'width 0.24s ease',
          }}
        />
      </div>

      {!isCompact && (
        <div
          style={{
            marginTop: 6,
            color: 'rgba(255,255,255,0.48)',
            fontSize: 10,
            lineHeight: '13px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          発動: {formatStageModeReward(rule)}
        </div>
      )}
    </div>
  );
}
