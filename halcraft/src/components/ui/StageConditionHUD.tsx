// ステージコンディションHUD
// マップ固有のボーナスゲージと発動状態を表示する

import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useStageConditionStore } from '../../stores/useStageConditionStore';
import { getStageCondition, getStageConditionProgress } from '../../types/stageConditions';
import { isTouchDevice } from '../../utils/device';
import { STAGE_MOBILE_RAIL_TOP, STAGE_RIGHT_RAIL_TOP } from './stageHudLayout';

export function StageConditionHUD() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const charge = useStageConditionStore((s) => s.charge);
  const activeUntil = useStageConditionStore((s) => s.activeUntil);
  const recentActivation = useStageConditionStore((s) => s.recentActivation);
  const clearRecentActivation = useStageConditionStore((s) => s.clearRecentActivation);
  const [now, setNow] = useState(() => performance.now());
  const isCompact = isTouchDevice() || window.innerWidth <= 560;

  const condition = useMemo(() => getStageCondition(stage?.id), [stage?.id]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!recentActivation) return undefined;
    const timer = window.setTimeout(() => {
      clearRecentActivation();
    }, 2300);
    return () => window.clearTimeout(timer);
  }, [clearRecentActivation, recentActivation]);

  if (phase !== 'playing' || !stage || !condition) return null;

  const activeRemainingSeconds = Math.max(0, Math.ceil((activeUntil - now) / 1000));
  const active = activeRemainingSeconds > 0;
  const progress = getStageConditionProgress(charge, condition.target);

  return (
    <div
      id="stage-condition-hud"
      style={{
        position: 'fixed',
        top: isCompact ? STAGE_MOBILE_RAIL_TOP.condition : STAGE_RIGHT_RAIL_TOP.condition,
        right: isCompact ? 14 : 16,
        zIndex: 97,
        width: isCompact ? 'min(248px, calc(100vw - 28px))' : 276,
        padding: isCompact ? '9px 10px' : '10px 12px',
        borderRadius: 14,
        border: `1px solid ${condition.accent}${active ? '66' : '40'}`,
        background: 'rgba(8, 11, 17, 0.32)',
        boxShadow: active
          ? `0 0 22px ${condition.accent}55`
          : '0 6px 22px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(11px)',
        WebkitBackdropFilter: 'blur(11px)',
        color: '#fff',
        pointerEvents: 'none',
        textShadow: '0 1px 3px rgba(0,0,0,0.85)',
        fontFamily: "'M PLUS Rounded 1c','Hiragino Maru Gothic ProN','Segoe UI','Hiragino Sans',sans-serif",
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div
          style={{
            width: isCompact ? 30 : 34,
            height: isCompact ? 30 : 34,
            borderRadius: 7,
            display: 'grid',
            placeItems: 'center',
            background: `${condition.accent}24`,
            border: `1px solid ${condition.accent}66`,
            fontSize: isCompact ? 17 : 19,
            flex: '0 0 auto',
          }}
        >
          {condition.icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              color: condition.accent,
              fontSize: isCompact ? 10 : 11,
              lineHeight: '13px',
              fontWeight: 900,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            ステージ特性
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
            {condition.title}
          </div>
        </div>
        <div
          style={{
            minWidth: 54,
            textAlign: 'right',
            color: active ? '#fff1a8' : 'rgba(255,255,255,0.68)',
            fontSize: isCompact ? 9 : 10,
            lineHeight: '12px',
            fontWeight: 900,
            fontFamily: 'monospace',
          }}
        >
          {active ? `${activeRemainingSeconds}s` : `${charge}/${condition.target}`}
        </div>
      </div>

      <div
        style={{
          marginTop: 7,
          color: 'rgba(255,255,255,0.62)',
          fontSize: isCompact ? 9 : 10,
          lineHeight: '13px',
          fontWeight: 800,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {condition.triggerLabel}
        </span>
        <span style={{ flex: '0 0 auto', color: active ? '#fff1a8' : 'rgba(255,255,255,0.64)' }}>
          {condition.effect.label}
        </span>
      </div>

      <div
        style={{
          marginTop: 6,
          height: 5,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.12)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${active ? 100 : progress * 100}%`,
            height: '100%',
            borderRadius: 999,
            background: active
              ? 'linear-gradient(90deg, #ffe680, #ffffff)'
              : `linear-gradient(90deg, ${condition.accent}, ${stage.color})`,
            transition: 'width 0.25s ease',
          }}
        />
      </div>

      {recentActivation && (
        <div
          key={recentActivation.id}
          style={{
            marginTop: 7,
            padding: '5px 7px',
            borderRadius: 5,
            background: 'rgba(255, 230, 120, 0.18)',
            border: '1px solid rgba(255, 230, 120, 0.22)',
            color: '#fff2a6',
            fontSize: isCompact ? 10 : 11,
            lineHeight: '14px',
            fontWeight: 900,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            animation: 'masteryPulse 0.42s ease-out',
          }}
        >
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {recentActivation.icon} {recentActivation.title}
          </span>
          <span style={{ flex: '0 0 auto', fontFamily: 'monospace' }}>
            {recentActivation.label}
          </span>
        </div>
      )}
    </div>
  );
}
