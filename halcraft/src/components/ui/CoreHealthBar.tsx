import { useGameStore } from '../../stores/useGameStore';
import { isTouchDevice } from '../../utils/device';

export function CoreHealthBar() {
  const phase = useGameStore((s) => s.phase);
  const currentStage = useGameStore((s) => s.currentStage);
  const coreHp = useGameStore((s) => s.coreHp);
  const coreMaxHp = useGameStore((s) => s.coreMaxHp);

  if (phase !== 'playing' || !currentStage || currentStage.mission.type !== 'defend_core') {
    return null;
  }

  const isTouch = isTouchDevice();
  const hpPercent = Math.max(0, Math.min(100, (coreHp / coreMaxHp) * 100));

  let barColor = 'rgba(100, 255, 100, 0.8)';
  if (hpPercent < 30) {
    barColor = 'rgba(255, 50, 50, 0.8)';
  } else if (hpPercent < 60) {
    barColor = 'rgba(255, 200, 50, 0.8)';
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: isTouch ? 50 : 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
      }}
    >
      <div style={{
        fontSize: 14,
        fontWeight: 'bold',
        color: '#fff',
        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
        marginBottom: 4,
        letterSpacing: 2,
      }}>
        クリスタルの体力
      </div>
      <div
        style={{
          width: 300,
          height: 12,
          background: 'rgba(0,0,0,0.6)',
          border: '2px solid rgba(255,255,255,0.3)',
          borderRadius: 6,
          overflow: 'hidden',
          boxShadow: '0 4px 6px rgba(0,0,0,0.4)',
        }}
      >
        <div
          style={{
            width: `${hpPercent}%`,
            height: '100%',
            background: barColor,
            transition: 'width 0.2s ease, background 0.3s ease',
            boxShadow: `0 0 10px ${barColor}`,
          }}
        />
      </div>
      <div style={{
        fontSize: 12,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 4,
        textShadow: '0 1px 2px rgba(0,0,0,0.6)',
      }}>
        {coreHp} / {coreMaxHp}
      </div>
    </div>
  );
}
