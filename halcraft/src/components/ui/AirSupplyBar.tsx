// 息ゲージ（AirSupply）UI コンポーネント
// 水中に沈んでいるときのみ表示、Minecraft風の泡アイコンバー

import { usePlayerStore } from '../../stores/usePlayerStore';
import { useGameStore } from '../../stores/useGameStore';

/** 最大息（秒） */
const MAX_AIR = 15;
/** 泡アイコンの数 */
const BUBBLE_COUNT = 10;

export function AirSupplyBar() {
  const airSupply = usePlayerStore((s) => s.airSupply);
  const isSubmerged = usePlayerStore((s) => s.isSubmerged);
  const phase = useGameStore((s) => s.phase);

  // 水中でない時／プレイ外は非表示
  if (!isSubmerged || phase !== 'playing') return null;

  const ratio = airSupply / MAX_AIR;
  const filledBubbles = Math.ceil(ratio * BUBBLE_COUNT);

  return (
    <div
      style={{
        position: 'fixed',
        // 体力・空腹の上に置き、重ならないようにする
        bottom: 100,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 2,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      {Array.from({ length: BUBBLE_COUNT }, (_, i) => {
        const filled = i < filledBubbles;
        const isPopping = i === filledBubbles; // 消える直前の泡
        return (
          <div
            key={i}
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: filled
                ? 'radial-gradient(circle at 35% 35%, #88ddff, #2288cc)'
                : 'rgba(40, 40, 40, 0.4)',
              border: filled
                ? '1.5px solid rgba(255, 255, 255, 0.5)'
                : '1.5px solid rgba(100, 100, 100, 0.3)',
              opacity: filled ? 1 : 0.3,
              transform: isPopping ? 'scale(0.7)' : 'scale(1)',
              transition: 'transform 0.2s, opacity 0.2s',
              boxShadow: filled ? '0 0 6px rgba(100, 200, 255, 0.4)' : 'none',
            }}
          />
        );
      })}
    </div>
  );
}
