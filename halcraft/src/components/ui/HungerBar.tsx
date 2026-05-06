// 空腹ゲージ（HungerBar）UIコンポーネント
// Minecraft風の肉アイコンバー（ホットバーの右側に表示）
// 空腹レベルに応じた色変化とパルスアニメーション

import { usePlayerStore } from '../../stores/usePlayerStore';
import { useGameStore } from '../../stores/useGameStore';

const ICON_COUNT = 10; // 各アイコンは2ポイント分

export function HungerBar() {
  const hunger = usePlayerStore((s) => s.hunger);
  const phase = useGameStore((s) => s.phase);

  // メニュー画面では非表示
  if (phase !== 'playing') return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 52,
        right: 'calc(50% - 180px)',
        transform: 'translateX(50%)',
        display: 'flex',
        gap: 1,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      {Array.from({ length: ICON_COUNT }, (_, i) => {
        const value = hunger - i * 2;
        const isFull = value >= 2;
        const isHalf = value >= 1 && value < 2;
        const isEmpty = value < 1;
        const isLow = hunger <= 6; // 空腹が少ないとパルス

        return (
          <div
            key={i}
            style={{
              width: 16,
              height: 16,
              position: 'relative',
              opacity: isEmpty ? 0.25 : 1,
              animation: isLow && !isEmpty ? 'hungerPulse 0.6s infinite alternate' : 'none',
            }}
          >
            {/* 肉アイコン（SVG描画） */}
            <svg viewBox="0 0 16 16" width="16" height="16">
              {/* 背景の輪郭 */}
              <rect x="2" y="3" width="12" height="10" rx="2" fill={isEmpty ? '#333' : '#4a1a00'} />
              {/* 肉の中身 */}
              {isFull && (
                <rect x="3" y="4" width="10" height="8" rx="1.5" fill="#c84030" />
              )}
              {isHalf && (
                <>
                  <rect x="3" y="4" width="5" height="8" rx="1.5" fill="#c84030" />
                  <rect x="8" y="4" width="5" height="8" rx="1.5" fill="#4a1a00" />
                </>
              )}
              {/* 骨のハイライト */}
              {!isEmpty && (
                <circle cx="6" cy="8" r="1.5" fill="#f0e0c0" opacity="0.6" />
              )}
            </svg>
          </div>
        );
      })}
      <style>{`
        @keyframes hungerPulse {
          0% { transform: scale(1); }
          100% { transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}
