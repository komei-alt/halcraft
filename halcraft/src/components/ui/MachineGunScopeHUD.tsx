// 機関銃 ADS 用スコープHUD（Canvas 外の通常DOM）
// drei Html だと表示が消えたり位置がずれるため、Crosshair と同じ固定レイヤーで描画する

import { useGameStore } from '../../stores/useGameStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { getStageCombatStyleForItem } from '../../types/stageCombatStyles';
import { useIsRideMode } from '../../utils/hudRideMode';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) ** 3;
}

export function MachineGunScopeHUD() {
  const phase = useGameStore((s) => s.phase);
  const currentStageId = useGameStore((s) => s.currentStageId);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const isDead = usePlayerStore((s) => s.isDead);
  const progress = usePlayerStore((s) => s.machineGunScopeProgress);
  const rideMode = useIsRideMode();

  if (phase !== 'playing' || isDead || rideMode) return null;
  if (equippedItem !== 'machine_gun' || progress < 0.05) return null;

  const accent = getStageCombatStyleForItem(currentStageId, 'machine_gun')?.accent ?? '#7ee8ff';
  // 早めに照準を出す（覗き込み途中でも狙いが分かる）
  const pBlackout = easeOutCubic(clamp01((progress - 0.04) / 0.45));
  const pAperture = easeOutCubic(clamp01((progress - 0.08) / 0.55));
  const pHud = easeOutCubic(clamp01((progress - 0.12) / 0.5));
  const holePct = 28 + pAperture * 22; // 28% → 50%
  const midPct = holePct + 10 + pAperture * 4;
  const ringSize = 40 + pAperture * 18; // vw/vh

  return (
    <div
      id="machine-gun-scope-hud"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 105,
        pointerEvents: 'none',
        opacity: clamp01(pBlackout * 1.05),
      }}
    >
      {/* 周囲ビネット：中央は大きく透明 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: [
            `radial-gradient(circle at 50% 50%,`,
            `transparent 0%,`,
            `transparent ${holePct}%,`,
            `rgba(0, 8, 16, ${0.32 * pBlackout}) ${midPct}%,`,
            `rgba(0, 0, 0, ${0.7 * pBlackout}) 78%,`,
            `rgba(0, 0, 0, ${0.86 * pBlackout}) 100%)`,
          ].join(' '),
        }}
      />

      {/* 円形スコープ枠 */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: `min(${ringSize}vw, ${ringSize}vh)`,
          height: `min(${ringSize}vw, ${ringSize}vh)`,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          border: `2px solid ${accent}${Math.round(160 + pHud * 60).toString(16).padStart(2, '0')}`,
          boxShadow: [
            '0 0 0 1px rgba(0,0,0,0.4)',
            `0 0 ${12 + pHud * 16}px ${accent}55`,
            'inset 0 0 0 1px rgba(255,255,255,0.14)',
          ].join(', '),
          opacity: clamp01(pAperture * 1.15),
          background: `radial-gradient(circle at 50% 42%, ${accent}14 0%, transparent 55%, rgba(0,10,18,0.06) 100%)`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '3.5%',
            borderRadius: '50%',
            border: '1px solid rgba(220, 245, 255, 0.2)',
          }}
        />
      </div>

      {/* 標準HUD照準（画面中心・円の中） */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: `min(${ringSize * 0.92}vw, ${ringSize * 0.92}vh)`,
          height: `min(${ringSize * 0.92}vw, ${ringSize * 0.92}vh)`,
          transform: 'translate(-50%, -50%)',
          opacity: clamp01(pHud),
        }}
      >
        {/* 縦クロス（中央ギャップ） */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '16%',
            height: '26%',
            width: 2,
            transform: 'translateX(-50%)',
            background: `${accent}`,
            boxShadow: `0 0 5px ${accent}`,
            borderRadius: 1,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '16%',
            height: '26%',
            width: 2,
            transform: 'translateX(-50%)',
            background: `${accent}`,
            boxShadow: `0 0 5px ${accent}`,
            borderRadius: 1,
          }}
        />
        {/* 横クロス（中央ギャップ） */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '16%',
            width: '26%',
            height: 2,
            transform: 'translateY(-50%)',
            background: `${accent}`,
            boxShadow: `0 0 5px ${accent}`,
            borderRadius: 1,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            right: '16%',
            width: '26%',
            height: 2,
            transform: 'translateY(-50%)',
            background: `${accent}`,
            boxShadow: `0 0 5px ${accent}`,
            borderRadius: 1,
          }}
        />
        {/* 距離目盛り（控えめ） */}
        {[0.4, 0.5, 0.6].map((t) => (
          <div
            key={`mh-${t}`}
            style={{
              position: 'absolute',
              left: `${t * 100}%`,
              top: '50%',
              width: 5,
              height: 1.5,
              transform: 'translate(-50%, -50%)',
              background: `${accent}cc`,
            }}
          />
        ))}
        {[0.4, 0.5, 0.6].map((t) => (
          <div
            key={`mv-${t}`}
            style={{
              position: 'absolute',
              top: `${t * 100}%`,
              left: '50%',
              width: 1.5,
              height: 5,
              transform: 'translate(-50%, -50%)',
              background: `${accent}cc`,
            }}
          />
        ))}
        {/* 中央点 */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 5,
            height: 5,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: '#fffef8',
            boxShadow: `0 0 10px ${accent}, 0 0 2px #fff`,
          }}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: `calc(50% + min(${ringSize * 0.58}vw, ${ringSize * 0.58}vh))`,
          transform: 'translateX(-50%)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 11,
          letterSpacing: '0.16em',
          color: `${accent}cc`,
          textShadow: '0 0 6px rgba(0,0,0,0.9)',
          opacity: clamp01(pHud * 0.85),
          whiteSpace: 'nowrap',
        }}
      >
        ADS
      </div>
    </div>
  );
}
