// ロケットランチャーのリチャージ表示
// クロスヘア下に表示し、発射後だけ短く現れる。READY時はパルスで目立たせる

import { usePlayerStore } from '../../stores/usePlayerStore';
import { isTouchDevice } from '../../utils/device';

export function RocketCooldownIndicator() {
  const rocketCharge = usePlayerStore((s) => s.rocketCharge);
  const rocketReadyPulseUntil = usePlayerStore((s) => s.rocketReadyPulseUntil);
  const equippedItem = usePlayerStore((s) => s.equippedItem);

  const isReadyPulse = rocketCharge >= 1 && rocketReadyPulseUntil > performance.now();
  if (equippedItem !== 'rocket_launcher' || (rocketCharge >= 1 && !isReadyPulse)) return null;

  const isCompact = isTouchDevice() || (typeof window !== 'undefined' && window.innerWidth <= 560);
  const almost = rocketCharge > 0.8;
  const mid = rocketCharge > 0.4;
  const barColor = isReadyPulse
    ? '#fff2a6'
    : almost
      ? '#ffd27a'
      : mid
        ? '#ff9c4a'
        : '#ff5f3a';

  return (
    <div
      id="rocket-cooldown-indicator"
      className={isReadyPulse ? 'weapon-status-ready' : undefined}
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, 28px)',
        width: isReadyPulse ? (isCompact ? 78 : 88) : isCompact ? 56 : 62,
        zIndex: 110,
        pointerEvents: 'none',
        transition: 'width 0.18s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          height: isCompact ? 5 : 6,
          background: 'rgba(0, 0, 0, 0.76)',
          borderRadius: 999,
          overflow: 'hidden',
          border: `1px solid ${isReadyPulse ? 'rgba(255, 242, 166, 0.6)' : 'rgba(255, 190, 120, 0.35)'}`,
          boxShadow: isReadyPulse
            ? '0 0 12px rgba(255, 210, 120, 0.45)'
            : '0 1px 4px rgba(0,0,0,0.45)',
        }}
      >
        <div
          style={{
            width: `${(isReadyPulse ? 1 : rocketCharge) * 100}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${barColor}bb, ${barColor})`,
            boxShadow: isReadyPulse
              ? '0 0 14px rgba(255, 242, 166, 0.9)'
              : '0 0 8px rgba(255, 150, 90, 0.5)',
            transition: 'background 0.1s, width 0.06s linear',
          }}
        />
      </div>
      <div
        style={{
          textAlign: 'center',
          fontSize: isCompact ? 8 : 9,
          marginTop: 3,
          opacity: isReadyPulse ? 1 : 0.88,
          lineHeight: 1,
          letterSpacing: '0.1em',
          color: isReadyPulse ? '#fff2a6' : 'rgba(255, 225, 200, 0.94)',
          textTransform: 'uppercase',
          fontWeight: 950,
          fontFamily: 'monospace',
          textShadow: isReadyPulse
            ? '0 0 10px rgba(255, 210, 120, 0.95)'
            : '0 1px 2px rgba(0,0,0,0.85)',
          animation: isReadyPulse ? 'weaponReadyPulse 0.65s ease-in-out infinite alternate' : undefined,
        }}
      >
        {isReadyPulse ? '★ READY ★' : `RKT ${Math.round(rocketCharge * 100)}%`}
      </div>
    </div>
  );
}
