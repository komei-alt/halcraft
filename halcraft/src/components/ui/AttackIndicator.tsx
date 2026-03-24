// 攻撃チャージインジケーター
// マイクラ風のクロスヘア下に表示されるチャージバー
// 攻撃後にバーが回復し、フルチャージで消える

import { usePlayerStore } from '../../stores/usePlayerStore';

export function AttackIndicator() {
  const attackCharge = usePlayerStore((s) => s.attackCharge);

  // フルチャージ時は非表示
  if (attackCharge >= 1) return null;

  return (
    <div
      id="attack-indicator"
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, 12px)',
        width: 32,
        zIndex: 110,
        pointerEvents: 'none',
      }}
    >
      {/* 背景バー */}
      <div
        style={{
          width: '100%',
          height: 3,
          background: 'rgba(0, 0, 0, 0.6)',
          borderRadius: 1,
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.15)',
        }}
      >
        {/* チャージ量 */}
        <div
          style={{
            width: `${attackCharge * 100}%`,
            height: '100%',
            background: attackCharge > 0.8
              ? '#66ff66'    // フルチャージ近く = 緑
              : attackCharge > 0.4
              ? '#ffcc33'    // 中間 = 黄色
              : '#ff4444',   // 低チャージ = 赤
            transition: 'background 0.1s',
            boxShadow: attackCharge > 0.8
              ? '0 0 4px rgba(102, 255, 102, 0.5)'
              : 'none',
          }}
        />
      </div>
      {/* 剣アイコン（小さなインジケーター） */}
      <div
        style={{
          textAlign: 'center',
          fontSize: 8,
          marginTop: 1,
          opacity: 0.7,
          lineHeight: 1,
        }}
      >
        ⚔
      </div>
    </div>
  );
}
