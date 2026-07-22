// 水中エフェクトオーバーレイ
// プレイヤーが水中に沈んでいるとき、画面全体に青いフィルターをかける

import { useGameStore } from '../../stores/useGameStore';
import { usePlayerStore } from '../../stores/usePlayerStore';

export function UnderwaterOverlay() {
  const phase = useGameStore((s) => s.phase);
  const isSubmerged = usePlayerStore((s) => s.isSubmerged);
  const isDead = usePlayerStore((s) => s.isDead);

  // プレイ中かつ生存時だけ表示（ポーズ/死亡/メニューで固着しない）
  if (phase !== 'playing' || isDead || !isSubmerged) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(10, 60, 120, 0.35), rgba(5, 30, 60, 0.55))',
        pointerEvents: 'none',
        zIndex: 50,
        transition: 'opacity 0.3s',
      }}
    />
  );
}
