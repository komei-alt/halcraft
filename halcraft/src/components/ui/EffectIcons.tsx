// エフェクトアイコンHUD — 画面右上にアクティブエフェクトを表示
// シンプル時はアイコンのみ、詳細時は名前・残り時間も出す

import { useEffectStore } from '../../stores/useEffectStore';
import { useGameStore } from '../../stores/useGameStore';
import { EFFECT_INFO } from '../../types/potions';
import { useSimpleHud } from '../../utils/hudDensity';

/** 秒数を mm:ss 形式に変換 */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function EffectIcons() {
  const effects = useEffectStore((s) => s.effects);
  const phase = useGameStore((s) => s.phase);
  const isSimpleHud = useSimpleHud();

  if (phase !== 'playing' || effects.length === 0) return null;

  return (
    <div
      id="effect-icons"
      style={{
        position: 'fixed',
        top: isSimpleHud ? 42 : 10,
        right: 10,
        display: 'flex',
        flexDirection: isSimpleHud ? 'row' : 'column',
        gap: isSimpleHud ? 5 : 4,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      {effects.map((effect) => {
        const info = EFFECT_INFO[effect.type];
        const ratio = effect.remainingTime / effect.totalDuration;
        const isExpiring = effect.remainingTime < 10;

        if (isSimpleHud) {
          return (
            <div
              key={effect.type}
              title={`${info.name} ${formatTime(effect.remainingTime)}`}
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 28,
                height: 28,
                background: 'rgba(0, 0, 0, 0.45)',
                borderRadius: 6,
                border: `1px solid ${effect.color}${isExpiring ? 'aa' : '40'}`,
                animation: isExpiring ? 'effectBlink 0.5s ease-in-out infinite' : 'none',
              }}
            >
              <span style={{
                fontSize: 15,
                filter: ratio < 0.2 ? 'grayscale(0.5)' : 'none',
                lineHeight: 1,
              }}>
                {effect.emoji}
              </span>
            </div>
          );
        }

        return (
          <div
            key={effect.type}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              background: 'rgba(0, 0, 0, 0.6)',
              borderRadius: 4,
              border: `1px solid ${effect.color}40`,
              animation: isExpiring ? 'effectBlink 0.5s ease-in-out infinite' : 'none',
            }}
          >
            <span style={{
              fontSize: 16,
              filter: ratio < 0.2 ? 'grayscale(0.5)' : 'none',
            }}>
              {effect.emoji}
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div style={{
                fontSize: 10,
                fontWeight: 700,
                color: effect.color,
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                letterSpacing: '0.03em',
              }}>
                {info.name}
              </div>

              <div style={{
                width: 50,
                height: 3,
                background: 'rgba(255,255,255,0.1)',
                borderRadius: 2,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${ratio * 100}%`,
                  height: '100%',
                  background: effect.color,
                  borderRadius: 2,
                  transition: 'width 0.5s linear',
                }} />
              </div>

              <div style={{
                fontSize: 9,
                color: isExpiring ? '#FF6B6B' : 'rgba(255,255,255,0.5)',
                fontFamily: 'monospace',
                fontWeight: isExpiring ? 700 : 400,
              }}>
                {formatTime(effect.remainingTime)}
              </div>
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes effectBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
