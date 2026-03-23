// 時間表示UI
// ゲーム内の時刻と昼夜状態を表示

import { useGameStore } from '../../stores/useGameStore';
import { isTouchDevice } from '../../utils/device';

// --- SVG アイコン ---
const SunIcon = ({ size = 18, color = '#FFE8B0' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="4" />
    <line x1="12" y1="20" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
    <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="4" y2="12" />
    <line x1="20" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
    <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = ({ size = 18, color = '#8888ff' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

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
  const isTouch = isTouchDevice();

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
          fontSize: isTouch ? 20 : 18,
          fontWeight: 700,
          color: isNight ? '#8888ff' : '#FFE8B0',
          textShadow: isNight
            ? '0 0 8px rgba(100,100,255,0.5), 1px 1px 3px rgba(0,0,0,0.8)'
            : '0 0 8px rgba(255,200,100,0.4), 1px 1px 3px rgba(0,0,0,0.6)',
          fontFamily: 'monospace',
          letterSpacing: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {isNight
          ? <MoonIcon size={isTouch ? 22 : 18} />
          : <SunIcon size={isTouch ? 22 : 18} />
        }
        {formatGameTime(gameTime)}
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
