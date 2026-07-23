// 乗り物用の照準HUD

import { useEffect, useState, type CSSProperties } from 'react';
import { useVehicleStore } from '../../stores/useVehicleStore';
import { useGameStore } from '../../stores/useGameStore';
import { useVehicleFirepowerStore } from '../../stores/useVehicleFirepowerStore';
import { getStageModeRule } from '../../types/stageModeRules';

const panelBase: CSSProperties = {
  position: 'fixed',
  pointerEvents: 'none',
  zIndex: 104,
  fontFamily: 'monospace',
};

function Tick({ axis }: { axis: 'horizontal' | 'vertical' }) {
  // 中央にギャップを空け、ドットと重ならない十字にする
  if (axis === 'horizontal') {
    return (
      <>
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 22,
          height: 2,
          transform: 'translate(calc(-100% - 10px), -50%)',
          background: 'rgba(255, 245, 190, 0.9)',
          boxShadow: '0 0 5px rgba(255, 170, 60, 0.65), 0 0 1px rgba(0,0,0,0.9)',
        }} />
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 22,
          height: 2,
          transform: 'translate(10px, -50%)',
          background: 'rgba(255, 245, 190, 0.9)',
          boxShadow: '0 0 5px rgba(255, 170, 60, 0.65), 0 0 1px rgba(0,0,0,0.9)',
        }} />
      </>
    );
  }
  return (
    <>
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 2,
        height: 22,
        transform: 'translate(-50%, calc(-100% - 10px))',
        background: 'rgba(255, 245, 190, 0.9)',
        boxShadow: '0 0 5px rgba(255, 170, 60, 0.65), 0 0 1px rgba(0,0,0,0.9)',
      }} />
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 2,
        height: 22,
        transform: 'translate(-50%, 10px)',
        background: 'rgba(255, 245, 190, 0.9)',
        boxShadow: '0 0 5px rgba(255, 170, 60, 0.65), 0 0 1px rgba(0,0,0,0.9)',
      }} />
    </>
  );
}

export function VehicleAimHUD() {
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);
  const currentStageId = useGameStore((s) => s.currentStageId);
  const firepowerEvent = useVehicleFirepowerStore((s) => s.recentEvent);
  const firepowerEventId = firepowerEvent?.id;
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (!firepowerEventId) return undefined;
    const frame = window.requestAnimationFrame(() => setNow(performance.now()));
    const timer = window.setInterval(() => setNow(performance.now()), 120);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, [firepowerEventId]);

  if (activeVehicle !== 'tank' && activeVehicle !== 'airplane') return null;

  const isTank = activeVehicle === 'tank';
  const modeRule = getStageModeRule(currentStageId);
  const desertFirepowerActive = currentStageId === 'war-desert' && modeRule?.category === 'war';
  const firepowerActive = Boolean(
    firepowerEvent
      && firepowerEvent.vehicleType === activeVehicle
      && now - firepowerEvent.createdAt < 1280,
  );
  const accent = desertFirepowerActive
    ? modeRule.accent
    : isTank
      ? '#ff9a40'
      : '#75dfff';

  return (
    <div style={{
      ...panelBase,
      inset: 0,
    }}>
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: isTank ? 112 : 82,
        height: isTank ? 112 : 82,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        border: `2px solid ${desertFirepowerActive ? `${accent}d8` : isTank ? 'rgba(255, 154, 64, 0.78)' : 'rgba(117, 223, 255, 0.82)'}`,
        boxShadow: desertFirepowerActive
          ? `0 0 14px ${accent}66, inset 0 0 16px ${accent}33`
          : isTank
            ? '0 0 12px rgba(255, 125, 40, 0.35), inset 0 0 12px rgba(255, 125, 40, 0.18)'
            : '0 0 10px rgba(80, 215, 255, 0.3), inset 0 0 10px rgba(80, 215, 255, 0.16)',
      }}>
        <Tick axis="horizontal" />
        <Tick axis="vertical" />
        {/* 中心ドット（弾道の基準点） */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 6,
          height: 6,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background: '#fffef8',
          boxShadow: '0 0 8px rgba(255, 230, 130, 0.75)',
        }} />
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 14,
          height: 14,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          border: '1.5px solid rgba(255, 250, 220, 0.75)',
          boxShadow: '0 0 8px rgba(255, 230, 130, 0.4)',
        }} />
        {isTank && (
          <div style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 42,
            height: 42,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            border: '1px dashed rgba(255, 239, 118, 0.9)',
          }} />
        )}
      </div>

      <div style={{
        position: 'absolute',
        left: '50%',
        top: 'calc(50% + 72px)',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255, 248, 214, 0.86)',
        fontSize: 10,
        textShadow: '0 1px 4px rgba(0,0,0,0.8)',
        whiteSpace: 'nowrap',
      }}>
        <span>{isTank ? 'ガトリング' : '機銃'}</span>
        {isTank && <span style={{ color: 'rgba(255, 167, 97, 0.95)' }}>主砲 右クリック</span>}
        {desertFirepowerActive && (
          <span style={{ color: accent }}>
            決戦火力: 戦意+
          </span>
        )}
      </div>

      {firepowerActive && firepowerEvent && (
        <div style={{
          position: 'absolute',
          left: '50%',
          top: 'calc(50% + 94px)',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          maxWidth: 'min(320px, calc(100vw - 34px))',
          padding: '5px 8px',
          borderRadius: 6,
          border: `1px solid ${firepowerEvent.accent}88`,
          background: 'rgba(10, 12, 18, 0.56)',
          boxShadow: `0 0 14px ${firepowerEvent.glow}`,
          color: 'rgba(255, 255, 255, 0.92)',
          fontSize: 10,
          fontWeight: 900,
          textShadow: '0 1px 4px rgba(0,0,0,0.9)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}>
          <span style={{ flex: '0 0 auto', color: firepowerEvent.accent }}>
            {firepowerEvent.icon}
          </span>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {firepowerEvent.title}
          </span>
          <span style={{ flex: '0 0 auto', color: firepowerEvent.accent }}>
            {firepowerEvent.meterText}
          </span>
        </div>
      )}
    </div>
  );
}
