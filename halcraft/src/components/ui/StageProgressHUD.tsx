// ステージ進行HUD
// 選んだマップごとの目的・進行・ランドマークを常時見える状態にする

import { useGameStore } from '../../stores/useGameStore';
import { isTouchDevice } from '../../utils/device';

function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

export function StageProgressHUD() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const enemiesDefeated = useGameStore((s) => s.enemiesDefeated);
  const stageElapsedSeconds = useGameStore((s) => s.stageElapsedSeconds);
  const bossSpawned = useGameStore((s) => s.bossSpawned);
  const isBuildMode = useGameStore((s) => s.isBuildMode);
  const isTouch = isTouchDevice();

  if (phase !== 'playing' || !stage) return null;

  const target = stage.rules.objective.targetCount;
  const progressRatio = target ? Math.min(1, enemiesDefeated / target) : 0;
  const objectiveState = target
    ? bossSpawned
      ? 'ボス出現'
      : `${enemiesDefeated}/${target}`
    : formatElapsed(stageElapsedSeconds);
  const accent = stage.category === 'build' ? '#9bdcff' : '#ffb36d';

  return (
    <div
      id="stage-progress-hud"
      style={{
        position: 'fixed',
        top: isTouch ? 54 : 14,
        left: isTouch ? 14 : 64,
        zIndex: 96,
        width: isTouch ? 248 : 310,
        padding: isTouch ? '9px 10px' : '11px 13px',
        borderRadius: 8,
        border: `1px solid ${stage.color}77`,
        background: 'rgba(0,0,0,0.46)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        color: '#fff',
        pointerEvents: 'none',
        boxShadow: `0 0 18px ${stage.color}26`,
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: isTouch ? 18 : 20 }}>{stage.icon}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              color: accent,
              fontSize: isTouch ? 10 : 11,
              fontWeight: 900,
              letterSpacing: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {stage.rules.modeLabel}
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.92)',
              fontSize: isTouch ? 13 : 15,
              fontWeight: 900,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {stage.rules.objective.title}
          </div>
        </div>
        <div
          style={{
            minWidth: isTouch ? 52 : 62,
            textAlign: 'right',
            color: target && enemiesDefeated >= target ? '#ffdd66' : '#fff',
            fontSize: isTouch ? 12 : 13,
            fontWeight: 900,
            fontFamily: 'monospace',
          }}
        >
          {objectiveState}
        </div>
      </div>

      <div
        style={{
          marginTop: 7,
          color: 'rgba(255,255,255,0.68)',
          fontSize: isTouch ? 10 : 11,
          lineHeight: '15px',
        }}
      >
        {stage.rules.objective.description}
      </div>

      {target && (
        <div
          style={{
            marginTop: 8,
            height: 5,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.12)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progressRatio * 100}%`,
              height: '100%',
              borderRadius: 999,
              background: bossSpawned
                ? 'linear-gradient(90deg, #ffdd66, #ff6b4a)'
                : `linear-gradient(90deg, ${stage.color}, #ffdd66)`,
              transition: 'width 0.25s ease',
            }}
          />
        </div>
      )}

      <div
        style={{
          marginTop: 8,
          display: 'flex',
          gap: 5,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            padding: '2px 6px',
            borderRadius: 4,
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.75)',
            fontSize: isTouch ? 9 : 10,
            fontWeight: 800,
          }}
        >
          {stage.rules.landmarkName}
        </span>
        {(isBuildMode ? stage.rules.objective.prompts : stage.rules.featureTags).slice(0, 3).map((text) => (
          <span
            key={text}
            style={{
              padding: '2px 6px',
              borderRadius: 4,
              background: `${stage.color}24`,
              color: 'rgba(255,255,255,0.78)',
              fontSize: isTouch ? 9 : 10,
              fontWeight: 800,
            }}
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
