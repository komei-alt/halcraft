// 照準下の武器ステータスインジケーター
// ビルダーの攻撃チャージに加え、グローブ押し準備・ボム装填数も表示

import { usePlayerStore, type EquippedItem } from '../../stores/usePlayerStore';
import { isTouchDevice } from '../../utils/device';
import { useIsRideMode } from '../../utils/hudRideMode';

interface IndicatorView {
  ratio: number;
  label: string;
  color: string;
  border: string;
  glow: string;
  ready: boolean;
  accentText: string;
}

function getIndicator(
  item: EquippedItem,
  attackCharge: number,
  glovePushReady: number,
  glovePulling: boolean,
  bombArmedCount: number,
  bombMaxCount: number,
): IndicatorView | null {
  if (item === 'builder') {
    if (attackCharge >= 0.995) return null;
    const readySoon = attackCharge > 0.82;
    const mid = attackCharge > 0.4;
    return {
      ratio: attackCharge,
      label: readySoon ? 'READY' : '⚔ CHARGE',
      color: readySoon ? '#7dff7a' : mid ? '#ffd24a' : '#ff5a5a',
      border: readySoon ? 'rgba(140, 255, 140, 0.5)' : 'rgba(255, 255, 255, 0.22)',
      glow: readySoon
        ? '0 0 10px rgba(110, 255, 120, 0.7)'
        : mid
          ? '0 0 6px rgba(255, 200, 70, 0.45)'
          : 'none',
      ready: readySoon,
      accentText: readySoon ? '#b8ffb0' : '#e8f0ff',
    };
  }

  if (item === 'gravity_glove') {
    if (glovePulling) {
      return {
        ratio: 1,
        label: 'PULL…',
        color: '#b8a8ff',
        border: 'rgba(180, 160, 255, 0.55)',
        glow: '0 0 12px rgba(150, 130, 255, 0.75)',
        ready: true,
        accentText: '#e8e0ff',
      };
    }
    const ready = glovePushReady >= 0.995;
    return {
      ratio: glovePushReady,
      label: ready ? 'PUSH READY' : `PUSH ${Math.round(glovePushReady * 100)}%`,
      color: ready ? '#d4c4ff' : glovePushReady > 0.5 ? '#9d8cff' : '#6a5aaa',
      border: ready ? 'rgba(210, 190, 255, 0.6)' : 'rgba(160, 140, 255, 0.3)',
      glow: ready ? '0 0 12px rgba(170, 150, 255, 0.8)' : '0 0 6px rgba(120, 100, 220, 0.35)',
      ready,
      accentText: ready ? '#f0e8ff' : '#d0c8f0',
    };
  }

  if (item === 'bomb_slinger') {
    const max = Math.max(1, bombMaxCount);
    const ratio = bombArmedCount / max;
    const full = bombArmedCount >= max;
    const empty = bombArmedCount <= 0;
    return {
      ratio: empty ? 0.08 : Math.max(0.12, ratio),
      label: empty ? 'EMPTY' : full ? `FULL ${bombArmedCount}` : `BOMB ${bombArmedCount}/${max}`,
      color: empty ? '#665544' : full ? '#ffaa66' : '#ff7744',
      border: full ? 'rgba(255, 200, 120, 0.55)' : 'rgba(255, 140, 90, 0.35)',
      glow: full
        ? '0 0 12px rgba(255, 180, 90, 0.75)'
        : bombArmedCount > 0
          ? '0 0 8px rgba(255, 120, 70, 0.45)'
          : 'none',
      ready: full || bombArmedCount > 0,
      accentText: full ? '#ffe8c0' : '#ffd0b0',
    };
  }

  if (item === 'lightsaber') {
    if (attackCharge >= 0.995) return null;
    const readySoon = attackCharge > 0.75;
    return {
      ratio: attackCharge,
      label: readySoon ? 'COMBO' : 'RECOVER',
      color: readySoon ? '#d4b8ff' : '#8a70cc',
      border: readySoon ? 'rgba(200, 170, 255, 0.5)' : 'rgba(160, 130, 255, 0.28)',
      glow: readySoon ? '0 0 10px rgba(180, 140, 255, 0.65)' : 'none',
      ready: readySoon,
      accentText: readySoon ? '#f0e8ff' : '#d0c8f0',
    };
  }

  return null;
}

export function AttackIndicator() {
  const attackCharge = usePlayerStore((s) => s.attackCharge);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const glovePushReady = usePlayerStore((s) => s.glovePushReady);
  const glovePulling = usePlayerStore((s) => s.glovePulling);
  const bombArmedCount = usePlayerStore((s) => s.bombArmedCount);
  const bombMaxCount = usePlayerStore((s) => s.bombMaxCount);
  const rideMode = useIsRideMode();

  // 搭乗中は乗り物照準に任せる
  if (rideMode) return null;

  const view = getIndicator(
    equippedItem,
    attackCharge,
    glovePushReady,
    glovePulling,
    bombArmedCount,
    bombMaxCount,
  );
  if (!view) return null;

  const isCompact = isTouchDevice() || (typeof window !== 'undefined' && window.innerWidth <= 560);
  // ボムは装填スロットを点で見せる
  const showPips = equippedItem === 'bomb_slinger';
  const maxPips = Math.min(5, Math.max(1, bombMaxCount));

  return (
    <div
      id="attack-indicator"
      className={view.ready ? 'weapon-status-ready' : undefined}
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, 16px)',
        width: isCompact ? 52 : showPips ? 72 : 56,
        zIndex: 110,
        pointerEvents: 'none',
      }}
    >
      {showPips ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 4,
            marginBottom: 3,
          }}
        >
          {Array.from({ length: maxPips }, (_, i) => {
            const filled = i < bombArmedCount;
            return (
              <div
                key={i}
                style={{
                  width: isCompact ? 8 : 9,
                  height: isCompact ? 8 : 9,
                  borderRadius: '50%',
                  background: filled
                    ? 'radial-gradient(circle at 35% 30%, #ffd0a0, #ff6633)'
                    : 'rgba(40, 28, 20, 0.85)',
                  border: `1px solid ${filled ? 'rgba(255,200,140,0.7)' : 'rgba(255,255,255,0.15)'}`,
                  boxShadow: filled ? '0 0 6px rgba(255,120,60,0.75)' : 'none',
                  transition: 'background 0.12s ease, box-shadow 0.12s ease, transform 0.12s ease',
                  transform: filled ? 'scale(1.05)' : 'scale(0.9)',
                }}
              />
            );
          })}
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            height: isCompact ? 5 : 6,
            background: 'rgba(0, 0, 0, 0.74)',
            borderRadius: 3,
            overflow: 'hidden',
            border: `1px solid ${view.border}`,
            boxShadow: '0 1px 5px rgba(0,0,0,0.5)',
          }}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(1, view.ratio)) * 100}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${view.color}cc, ${view.color})`,
              transition: 'background 0.1s linear, width 0.06s linear',
              boxShadow: view.glow,
            }}
          />
        </div>
      )}
      <div
        style={{
          textAlign: 'center',
          fontSize: isCompact ? 8 : 9,
          marginTop: 3,
          opacity: view.ready ? 0.98 : 0.78,
          lineHeight: 1,
          color: view.accentText,
          fontWeight: 900,
          fontFamily: 'monospace',
          textShadow: '0 1px 3px rgba(0,0,0,0.9)',
          letterSpacing: 0.5,
          animation: view.ready ? 'weaponReadyPulse 0.7s ease-in-out infinite alternate' : undefined,
        }}
      >
        {view.label}
      </div>
    </div>
  );
}
