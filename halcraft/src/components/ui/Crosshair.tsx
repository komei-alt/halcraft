// クロスヘア（照準）UIコンポーネント
// ヘリコプター搭乗中は非表示

import { useVehicleStore } from '../../stores/useVehicleStore';

export function Crosshair() {
  const isInHeli = useVehicleStore((s) => s.helicopter.isBoarded);

  // ヘリコプター搭乗中はクロスヘアを非表示
  if (isInHeli) return null;

  return (
    <div
      id="crosshair"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      {/* 横線 */}
      <div
        style={{
          position: 'absolute',
          width: 24,
          height: 2,
          background: 'rgba(255,255,255,0.85)',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 2px rgba(0,0,0,0.6)',
        }}
      />
      {/* 縦線 */}
      <div
        style={{
          position: 'absolute',
          width: 2,
          height: 24,
          background: 'rgba(255,255,255,0.85)',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 2px rgba(0,0,0,0.6)',
        }}
      />
    </div>
  );
}
