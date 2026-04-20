import { useGameStore } from '../../stores/useGameStore';
import { isTouchDevice } from '../../utils/device';

const CLEAR_ANIMATION_CSS = `
  @keyframes missionClearPulse {
    0% { transform: scale(1); }
    40% { transform: scale(1.08); }
    70% { transform: scale(1.03); }
    100% { transform: scale(1.05); }
  }
`;

export function MissionOverlay() {
  const phase = useGameStore((s) => s.phase);
  const currentStage = useGameStore((s) => s.currentStage);
  const progress = useGameStore((s) => s.missionProgress);
  const cleared = useGameStore((s) => s.missionCleared);

  if (phase !== 'playing' || !currentStage) return null;

  const mission = currentStage.mission;
  const isTouch = isTouchDevice();

  return (
    <>
      <style>{CLEAR_ANIMATION_CSS}</style>
      <div
        style={{
          position: 'absolute',
          top: isTouch ? 60 : 20, // HealthBarなどの下
          right: 20,
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          pointerEvents: 'none',
          fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
        }}
      >
        <div
          style={{
            background: cleared ? 'rgba(50, 200, 50, 0.6)' : 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(8px)',
            border: '2px solid',
            borderColor: cleared ? 'rgba(100, 255, 100, 0.8)' : 'rgba(255, 255, 255, 0.2)',
            padding: '10px 16px',
            borderRadius: 8,
            color: '#fff',
            boxShadow: cleared ? '0 0 20px rgba(50,200,50,0.5)' : '0 4px 6px rgba(0,0,0,0.3)',
            transition: 'all 0.5s ease',
            transform: cleared ? 'scale(1.05)' : 'scale(1)',
            animation: cleared ? 'missionClearPulse 750ms ease-out 1' : undefined,
          }}
        >
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span>{currentStage.name}</span>
            <span style={{ marginLeft: 16 }}>{cleared ? 'CLEAR!' : 'MISSION'}</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 'bold', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            {mission.title}
          </div>

          {/* 進捗バー */}
          <div style={{ marginTop: 8, height: 6, background: 'rgba(0,0,0,0.5)', borderRadius: 3, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, (progress / mission.target) * 100)}%`,
                height: '100%',
                background: cleared ? '#fff' : '#4caf50',
                transition: 'width 0.3s ease, background 0.3s ease',
              }}
            />
          </div>

          <div style={{ marginTop: 4, fontSize: 13, textAlign: 'right', fontWeight: 'bold' }}>
            {progress} / {mission.target}
          </div>
        </div>
      </div>
    </>
  );
}
