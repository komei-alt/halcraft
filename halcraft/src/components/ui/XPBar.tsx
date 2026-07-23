// XPバー — ホットバー上部に経験値バーとレベル表示
// Minecraft スタイルのネオングリーンバー

import { useExperienceStore } from '../../stores/useExperienceStore';
import { useGameStore } from '../../stores/useGameStore';
import { useVehicleStore } from '../../stores/useVehicleStore';

export function XPBar() {
  const level = useExperienceStore((s) => s.level);
  const progress = useExperienceStore((s) => s.getProgress());
  const phase = useGameStore((s) => s.phase);
  const isBuildMode = useGameStore((s) => s.isBuildMode);
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);

  // 搭乗中はホットバー周辺HUDを畳む
  if (phase !== 'playing' || isBuildMode || activeVehicle !== null) return null;

  return (
    <div
      id="xp-bar"
      style={{
        position: 'fixed',
        bottom: 68,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 182,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      {/* レベル表示 */}
      {level > 0 && (
        <div style={{
          textAlign: 'center',
          fontSize: 10,
          fontWeight: 900,
          color: '#7EFC20',
          textShadow: '0 0 4px rgba(0,0,0,0.8), 0 0 8px rgba(126,252,32,0.3)',
          marginBottom: 1,
          fontFamily: 'monospace',
        }}>
          {level}
        </div>
      )}

      {/* XPバー */}
      <div style={{
        width: '100%',
        height: 4,
        background: 'rgba(0, 0, 0, 0.5)',
        borderRadius: 2,
        border: '1px solid rgba(126, 252, 32, 0.2)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${progress * 100}%`,
          height: '100%',
          background: 'linear-gradient(180deg, #7EFC20 0%, #5CB000 100%)',
          borderRadius: 2,
          transition: 'width 0.3s ease',
          boxShadow: '0 0 4px rgba(126, 252, 32, 0.4)',
        }} />
      </div>
    </div>
  );
}
