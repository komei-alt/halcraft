// ジェットコースターHUD
// 搭乗中に表示される速度メーター・高度・操作ガイド

import { useCoasterStore } from '../../stores/useCoasterStore';
import { useGameStore } from '../../stores/useGameStore';
import { COASTER_MAX_SPEED } from '../../utils/coasterPhysics';

const HUD_STYLE: React.CSSProperties = {
  position: 'fixed',
  bottom: 100,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  pointerEvents: 'none',
  zIndex: 100,
  fontFamily: '"Press Start 2P", "Courier New", monospace',
};

const SPEED_BAR_CONTAINER: React.CSSProperties = {
  width: 220,
  height: 18,
  background: 'rgba(0, 0, 0, 0.6)',
  borderRadius: 4,
  border: '2px solid rgba(255, 255, 255, 0.3)',
  overflow: 'hidden',
  position: 'relative',
};

const LABEL_STYLE: React.CSSProperties = {
  color: 'rgba(255, 255, 255, 0.9)',
  fontSize: 10,
  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
  letterSpacing: 1,
};

const INFO_STYLE: React.CSSProperties = {
  color: 'rgba(255, 255, 255, 0.7)',
  fontSize: 8,
  textShadow: '0 1px 2px rgba(0,0,0,0.6)',
};

const CONTROLS_STYLE: React.CSSProperties = {
  color: 'rgba(255, 255, 255, 0.5)',
  fontSize: 7,
  textShadow: '0 1px 2px rgba(0,0,0,0.6)',
  marginTop: 4,
};

export function CoasterHUD() {
  const isBoarded = useCoasterStore((s) => s.isBoarded);
  const speed = useCoasterStore((s) => s.speed);
  const cartY = useCoasterStore((s) => s.cartY);
  const braking = useCoasterStore((s) => s.braking);
  const phase = useGameStore((s) => s.phase);

  if (!isBoarded || phase !== 'playing') return null;

  const absSpeed = Math.abs(speed);
  const speedPercent = Math.min(100, (absSpeed / COASTER_MAX_SPEED) * 100);
  const speedKmh = Math.round(absSpeed * 3.6); // m/s → km/h
  const height = Math.round(cartY);

  // 速度に応じた色
  const speedColor =
    speedPercent > 80 ? '#ff3333' :
    speedPercent > 50 ? '#ffaa00' :
    speedPercent > 25 ? '#44dd44' :
    '#88bbff';

  return (
    <div style={HUD_STYLE}>
      {/* 速度ラベル */}
      <div style={LABEL_STYLE}>
        🎢 {speedKmh} km/h
      </div>

      {/* 速度バー */}
      <div style={SPEED_BAR_CONTAINER}>
        <div
          style={{
            width: `${speedPercent}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${speedColor}, ${speedColor}dd)`,
            transition: 'width 0.1s ease-out',
            boxShadow: speedPercent > 60 ? `0 0 8px ${speedColor}88` : 'none',
          }}
        />
        {/* ブレーキインジケーター */}
        {braking && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 4,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              color: '#ff4444',
              fontSize: 9,
              fontWeight: 'bold',
            }}
          >
            BRAKE
          </div>
        )}
      </div>

      {/* 高度表示 */}
      <div style={INFO_STYLE}>
        高度: Y {height}
      </div>

      {/* 操作ガイド */}
      <div style={CONTROLS_STYLE}>
        Space: 発進/ブレーキ　F: 降車
      </div>
    </div>
  );
}
