// ヘリコプター操作HUD
// 搭乗中に速度・高度・操作ガイドを表示

import { useVehicleStore, SEAT_NAMES } from '../../stores/useVehicleStore';

export function VehicleHUD() {
  const helicopter = useVehicleStore((s) => s.helicopter);

  const mySeat = helicopter.mySeat;
  if (mySeat === null) return null;

  // 銃手は CockpitHUD の中央照準を優先。下の大型メーターは視界を塞ぐので出さない
  const isGunner = mySeat === 'gunner_left' || mySeat === 'gunner_right';
  if (isGunner) return null;

  const speed = Math.abs(helicopter.speed).toFixed(1);
  const altitude = helicopter.y.toFixed(1);

  const speedNum = Math.abs(helicopter.speed);
  const speedHot = speedNum > 18;

  return (
    <div style={{
      position: 'fixed',
      // ホットバー非表示時は下端に寄せて中央を空ける
      bottom: 18,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      pointerEvents: 'none',
      zIndex: 100,
    }}>
      {/* メーターパネル */}
      <div style={{
        display: 'flex',
        gap: '22px',
        background: 'rgba(8, 12, 18, 0.78)',
        borderRadius: '14px',
        padding: '10px 26px',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: `1px solid ${speedHot ? 'rgba(120, 200, 255, 0.45)' : 'rgba(255, 255, 255, 0.16)'}`,
        boxShadow: speedHot
          ? '0 0 18px rgba(80, 180, 255, 0.28)'
          : '0 6px 16px rgba(0,0,0,0.35)',
      }}>
        {/* 速度計 */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minWidth: 56,
        }}>
          <span style={{
            color: '#88ccff',
            fontSize: '10px',
            fontWeight: 950,
            letterSpacing: '1.2px',
            textTransform: 'uppercase',
            fontFamily: 'monospace',
          }}>
            SPEED
          </span>
          <span style={{
            color: speedHot ? '#b8e8ff' : '#ffffff',
            fontSize: '26px',
            fontWeight: 900,
            fontFamily: 'monospace',
            textShadow: speedHot ? '0 0 10px rgba(120,200,255,0.6)' : 'none',
            lineHeight: 1.1,
          }}>
            {speed}
          </span>
        </div>

        {/* 区切り線 */}
        <div style={{
          width: '1px',
          background: 'rgba(255, 255, 255, 0.18)',
          alignSelf: 'stretch',
        }} />

        {/* 高度計 */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minWidth: 56,
        }}>
          <span style={{
            color: '#ffcc44',
            fontSize: '10px',
            fontWeight: 950,
            letterSpacing: '1.2px',
            textTransform: 'uppercase',
            fontFamily: 'monospace',
          }}>
            ALT
          </span>
          <span style={{
            color: '#ffffff',
            fontSize: '26px',
            fontWeight: 900,
            fontFamily: 'monospace',
            lineHeight: 1.1,
          }}>
            {altitude}
          </span>
        </div>
      </div>

      {/* 操作ガイド（パイロット） */}
      <div style={{
        background: 'rgba(8, 12, 18, 0.62)',
        borderRadius: '10px',
        padding: '7px 16px',
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.7)',
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        justifyContent: 'center',
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(6px)',
      }}>
        <span style={{ color: '#ffdd00', fontWeight: 950, fontSize: '10px', letterSpacing: 0.4 }}>
          {SEAT_NAMES[mySeat]}
        </span>
        <span><b style={{ color: '#ffcc00' }}>W/S</b> 前進/後退</span>
        <span><b style={{ color: '#ffcc00' }}>マウス</b> 傾けて旋回</span>
        <span><b style={{ color: '#ffcc00' }}>Space</b> 上昇</span>
        <span><b style={{ color: '#ffcc00' }}>Shift</b> 下降</span>
        <span><b style={{ color: '#44aaff' }}>1-3</b> 座席変更</span>
        <span><b style={{ color: '#ff6644' }}>F</b> 降りる</span>
      </div>
    </div>
  );
}
