// 時間表示UI
// ゲーム内の時刻と昼夜状態を表示

import { useGameStore } from '../../stores/useGameStore';

/** gameTime (0-1) を時刻文字列に変換 */
function formatGameTime(gameTime: number): string {
  // 0.0 = 6:00, 0.25 = 12:00, 0.5 = 18:00, 0.75 = 0:00
  const totalHours = (gameTime * 24 + 6) % 24;
  const hours = Math.floor(totalHours);
  const minutes = Math.floor((totalHours % 1) * 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function TimeDisplay() {
  const gameTime = useGameStore((s) => s.gameTime);
  const dayCount = useGameStore((s) => s.dayCount);
  const isNight = useGameStore((s) => s.isNight);

  return (
    <div
      id="time-display"
      style={{
        position: 'fixed',
        top: 12,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 4,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      {/* 時刻 */}
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: isNight ? '#8888ff' : '#FFE8B0',
          textShadow: isNight
            ? '0 0 8px rgba(100,100,255,0.5), 1px 1px 3px rgba(0,0,0,0.8)'
            : '0 0 8px rgba(255,200,100,0.4), 1px 1px 3px rgba(0,0,0,0.6)',
          fontFamily: 'monospace',
          letterSpacing: 2,
        }}
      >
        {isNight ? '🌙' : '☀️'} {formatGameTime(gameTime)}
      </div>

      {/* 日数 */}
      <div
        style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.5)',
          textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
          fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
        }}
      >
        Day {dayCount}
      </div>
    </div>
  );
}
