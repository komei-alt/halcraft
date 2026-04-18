import { useMobStore } from '../../stores/useMobStore';
import { useGameStore } from '../../stores/useGameStore';
import { isTouchDevice } from '../../utils/device';

export function BossHealthBar() {
  const phase = useGameStore((s) => s.phase);
  const currentStage = useGameStore((s) => s.currentStage);
  
  // ボスの情報を取得
  const mobs = useMobStore((s) => s.mobs);
  const boss = mobs.find((m) => m.type === 'boss_giant');

  if (phase !== 'playing' || !currentStage || currentStage.mission.type !== 'defeat_boss' || !boss) {
    return null;
  }

  const isTouch = isTouchDevice();
  const hpPercent = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));

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
        fontSize: 18,
        fontWeight: 'bold',
        color: '#ff4444',
        textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 10px rgba(255,0,0,0.5)',
        marginBottom: 4,
        letterSpacing: 4,
      }}>
        巨大ボス
      </div>
      <div
        style={{
          width: 400,
          height: 16,
          background: 'rgba(0,0,0,0.8)',
          border: '2px solid rgba(255,50,50,0.6)',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 4px 10px rgba(0,0,0,0.6)',
        }}
      >
        <div
          style={{
            width: `${hpPercent}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #aa0000 0%, #ff3333 100%)',
            transition: 'width 0.2s ease',
            boxShadow: '0 0 10px #ff0000',
          }}
        />
      </div>
      <div style={{
        fontSize: 12,
        color: 'rgba(255,100,100,0.9)',
        marginTop: 4,
        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
      }}>
        {Math.ceil(boss.hp)} / {boss.maxHp}
      </div>
    </div>
  );
}
