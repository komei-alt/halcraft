// ロケットランチャーのリチャージ表示
// クロスヘア下に表示し、発射後だけ短く現れる

import { usePlayerStore } from '../../stores/usePlayerStore';

export function RocketCooldownIndicator() {
  const rocketCharge = usePlayerStore((s) => s.rocketCharge);

  if (rocketCharge >= 1) return null;

  return (
    <div
      id="rocket-cooldown-indicator"
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, 28px)',
        width: 52,
        zIndex: 110,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          height: 4,
          background: 'rgba(0, 0, 0, 0.68)',
          borderRadius: 999,
          overflow: 'hidden',
          border: '1px solid rgba(255, 190, 120, 0.25)',
        }}
      >
        <div
          style={{
            width: `${rocketCharge * 100}%`,
            height: '100%',
            background: rocketCharge > 0.8
              ? '#ffd27a'
              : rocketCharge > 0.4
                ? '#ff9c4a'
                : '#ff5f3a',
            boxShadow: '0 0 8px rgba(255, 150, 90, 0.45)',
            transition: 'background 0.1s',
          }}
        />
      </div>
      <div
        style={{
          textAlign: 'center',
          fontSize: 8,
          marginTop: 2,
          opacity: 0.8,
          lineHeight: 1,
          letterSpacing: '0.14em',
          color: 'rgba(255, 225, 200, 0.9)',
          textTransform: 'uppercase',
        }}
      >
        RKT
      </div>
    </div>
  );
}
