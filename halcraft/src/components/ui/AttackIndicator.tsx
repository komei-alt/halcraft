// 攻撃チャージインジケーター
// マイクラ風のクロスヘア下に表示されるチャージバー
// 攻撃後にバーが回復し、フルチャージで消える

import { usePlayerStore } from '../../stores/usePlayerStore';
import { isTouchDevice } from '../../utils/device';

export function AttackIndicator() {
  const attackCharge = usePlayerStore((s) => s.attackCharge);
  const equippedItem = usePlayerStore((s) => s.equippedItem);

  // ビルダー装備時のみ、フルチャージ時は非表示
  if (equippedItem !== 'builder') return null;
  if (attackCharge >= 0.995) return null;

  const isCompact = isTouchDevice() || (typeof window !== 'undefined' && window.innerWidth <= 560);
  const readySoon = attackCharge > 0.82;
  const mid = attackCharge > 0.4;
  const barColor = readySoon
    ? '#7dff7a'
    : mid
      ? '#ffd24a'
      : '#ff5a5a';
  const glow = readySoon
    ? '0 0 8px rgba(110, 255, 120, 0.65)'
    : mid
      ? '0 0 5px rgba(255, 200, 70, 0.4)'
      : 'none';

  return (
    <div
      id="attack-indicator"
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, 14px)',
        width: isCompact ? 40 : 44,
        zIndex: 110,
        pointerEvents: 'none',
      }}
    >
      {/* 背景バー */}
      <div
        style={{
          width: '100%',
          height: isCompact ? 4 : 5,
          background: 'rgba(0, 0, 0, 0.72)',
          borderRadius: 2,
          overflow: 'hidden',
          border: `1px solid ${readySoon ? 'rgba(140, 255, 140, 0.45)' : 'rgba(255, 255, 255, 0.2)'}`,
          boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
        }}
      >
        {/* チャージ量 */}
        <div
          style={{
            width: `${Math.max(0, Math.min(1, attackCharge)) * 100}%`,
            height: '100%',
            background: barColor,
            transition: 'background 0.08s linear, width 0.05s linear',
            boxShadow: glow,
          }}
        />
      </div>
      <div
        style={{
          textAlign: 'center',
          fontSize: isCompact ? 8 : 9,
          marginTop: 2,
          opacity: readySoon ? 0.95 : 0.72,
          lineHeight: 1,
          color: readySoon ? '#b8ffb0' : '#e8f0ff',
          fontWeight: 800,
          fontFamily: 'monospace',
          textShadow: '0 1px 2px rgba(0,0,0,0.85)',
          letterSpacing: 0.4,
        }}
      >
        {readySoon ? 'READY' : '⚔'}
      </div>
    </div>
  );
}
