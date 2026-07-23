// 空腹ゲージ（HungerBar）UIコンポーネント
// Minecraft風の肉アイコンバー（ホットバーの右側に表示）
// 空腹レベルに応じた色変化とパルスアニメーション

import { usePlayerStore } from '../../stores/usePlayerStore';
import { useGameStore } from '../../stores/useGameStore';
import { useVehicleStore } from '../../stores/useVehicleStore';

const ICON_COUNT = 10; // 各アイコンは2ポイント分

export function HungerBar() {
  const hunger = usePlayerStore((s) => s.hunger);
  const phase = useGameStore((s) => s.phase);
  const isBuildMode = useGameStore((s) => s.isBuildMode);
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);

  // メニュー画面・ビルドモード・搭乗中は非表示（搭乗中は左上HPのみ）
  if (phase !== 'playing' || isBuildMode || activeVehicle !== null) return null;

  const isCritical = hunger <= 4;
  const isLow = hunger <= 6;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 76,
        // ホットバー中央から右側に肉アイコンを並べる
        left: 'calc(50% + 10px)',
        display: 'flex',
        flexDirection: 'row-reverse',
        justifyContent: 'flex-end',
        gap: 1,
        zIndex: 100,
        pointerEvents: 'none',
        filter: isCritical
          ? 'drop-shadow(0 0 5px rgba(255,120,40,0.55))'
          : 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))',
      }}
    >
      {Array.from({ length: ICON_COUNT }, (_, i) => {
        const value = hunger - i * 2;
        const isFull = value >= 2;
        const isHalf = value >= 1 && value < 2;
        const isEmpty = value < 1;

        return (
          <div
            key={i}
            style={{
              width: 17,
              height: 17,
              position: 'relative',
              opacity: isEmpty ? 0.28 : 1,
              animation: isLow && !isEmpty
                ? `hungerPulse ${isCritical ? 0.45 : 0.6}s infinite alternate`
                : 'none',
            }}
          >
            {/* 肉アイコン（SVG描画） */}
            <svg viewBox="0 0 16 16" width="17" height="17">
              {/* 背景の輪郭 */}
              <rect
                x="2"
                y="3"
                width="12"
                height="10"
                rx="2"
                fill={isEmpty ? '#333' : isCritical ? '#3a1000' : '#4a1a00'}
              />
              {/* 肉の中身 */}
              {isFull && (
                <rect
                  x="3"
                  y="4"
                  width="10"
                  height="8"
                  rx="1.5"
                  fill={isCritical ? '#e84a30' : isLow ? '#d84830' : '#c84030'}
                />
              )}
              {isHalf && (
                <>
                  <rect
                    x="3"
                    y="4"
                    width="5"
                    height="8"
                    rx="1.5"
                    fill={isCritical ? '#e84a30' : '#c84030'}
                  />
                  <rect x="8" y="4" width="5" height="8" rx="1.5" fill="#4a1a00" />
                </>
              )}
              {/* 骨のハイライト */}
              {!isEmpty && (
                <circle cx="6" cy="8" r="1.5" fill="#f0e0c0" opacity="0.65" />
              )}
            </svg>
          </div>
        );
      })}
      <style>{`
        @keyframes hungerPulse {
          0% { transform: scale(1); }
          100% { transform: scale(1.14); }
        }
      `}</style>
    </div>
  );
}
