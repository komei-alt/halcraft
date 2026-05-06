// 水中エフェクトオーバーレイ
// プレイヤーが水中に沈んでいるとき、画面全体に青いフィルターをかける

import { usePlayerStore } from '../../stores/usePlayerStore';

export function UnderwaterOverlay() {
  const isSubmerged = usePlayerStore((s) => s.isSubmerged);

  if (!isSubmerged) return null;

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
