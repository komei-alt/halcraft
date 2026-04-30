// 乗り物用の照準HUD

import { useVehicleStore } from '../../stores/useVehicleStore';
import type { CSSProperties } from 'react';

const panelBase: CSSProperties = {
  position: 'fixed',
  pointerEvents: 'none',
  zIndex: 104,
  fontFamily: 'monospace',
};

function Tick({ axis }: { axis: 'horizontal' | 'vertical' }) {
  return (
    <div style={{
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: axis === 'horizontal' ? 58 : 2,
      height: axis === 'horizontal' ? 2 : 58,
      transform: 'translate(-50%, -50%)',
      background: 'rgba(255, 245, 190, 0.78)',
      boxShadow: '0 0 5px rgba(255, 170, 60, 0.6), 0 0 1px rgba(0,0,0,0.9)',
    }} />
  );
}

export function VehicleAimHUD() {
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);
  if (activeVehicle !== 'tank' && activeVehicle !== 'airplane') return null;

  const isTank = activeVehicle === 'tank';

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
        border: `2px solid ${isTank ? 'rgba(255, 154, 64, 0.78)' : 'rgba(117, 223, 255, 0.82)'}`,
        boxShadow: isTank
          ? '0 0 12px rgba(255, 125, 40, 0.35), inset 0 0 12px rgba(255, 125, 40, 0.18)'
          : '0 0 10px rgba(80, 215, 255, 0.3), inset 0 0 10px rgba(80, 215, 255, 0.16)',
      }}>
        <Tick axis="horizontal" />
        <Tick axis="vertical" />
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 12,
          height: 12,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          border: '2px solid rgba(255, 250, 220, 0.9)',
          boxShadow: '0 0 8px rgba(255, 230, 130, 0.55)',
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
      </div>
    </div>
  );
}
