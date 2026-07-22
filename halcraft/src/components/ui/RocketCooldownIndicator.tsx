// ロケットランチャーのリチャージ表示
// クロスヘア下に表示し、発射後だけ短く現れる

import { usePlayerStore } from '../../stores/usePlayerStore';

export function RocketCooldownIndicator() {
  const rocketCharge = usePlayerStore((s) => s.rocketCharge);
  const rocketReadyPulseUntil = usePlayerStore((s) => s.rocketReadyPulseUntil);
  const equippedItem = usePlayerStore((s) => s.equippedItem);

  const isReadyPulse = rocketCharge >= 1 && rocketReadyPulseUntil > 0;
  if (equippedItem !== 'rocket_launcher' || (rocketCharge >= 1 && !isReadyPulse)) return null;

  return (
    <div
      id="rocket-cooldown-indicator"
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, 28px)',
        width: isReadyPulse ? 84 : 56,
        zIndex: 110,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          height: 5,
          background: 'rgba(0, 0, 0, 0.74)',
          borderRadius: 999,
          overflow: 'hidden',
          border: `1px solid ${isReadyPulse ? 'rgba(255, 242, 166, 0.55)' : 'rgba(255, 190, 120, 0.32)'}`,
          boxShadow: isReadyPulse ? '0 0 10px rgba(255, 210, 120, 0.35)' : 'none',
        }}
      >
        <div
          style={{
            width: `${(isReadyPulse ? 1 : rocketCharge) * 100}%`,
            height: '100%',
            background: isReadyPulse
              ? '#fff2a6'
              : rocketCharge > 0.8
              ? '#ffd27a'
              : rocketCharge > 0.4
                ? '#ff9c4a'
                : '#ff5f3a',
            boxShadow: isReadyPulse
              ? '0 0 14px rgba(255, 242, 166, 0.85)'
              : '0 0 8px rgba(255, 150, 90, 0.5)',
            transition: 'background 0.1s, width 0.06s linear',
          }}
        />
      </div>
      <div
        style={{
          textAlign: 'center',
          fontSize: 9,
          marginTop: 2,
          opacity: isReadyPulse ? 0.98 : 0.85,
          lineHeight: 1,
          letterSpacing: '0.12em',
          color: isReadyPulse ? '#fff2a6' : 'rgba(255, 225, 200, 0.92)',
          textTransform: 'uppercase',
          fontWeight: 950,
          fontFamily: 'monospace',
          textShadow: isReadyPulse ? '0 0 10px rgba(255, 210, 120, 0.9)' : '0 1px 2px rgba(0,0,0,0.8)',
        }}
      >
        {isReadyPulse ? 'READY' : `RKT ${Math.round(rocketCharge * 100)}%`}
      </div>
    </div>
  );
}
