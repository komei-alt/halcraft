// ヘリコプター操作HUD
// 搭乗中に速度・高度・操作ガイドを表示

import { useVehicleStore, SEAT_NAMES } from '../../stores/useVehicleStore';

export function VehicleHUD() {
  const helicopter = useVehicleStore((s) => s.helicopter);

  const mySeat = helicopter.mySeat;
  if (mySeat === null) return null;

  const speed = Math.abs(helicopter.speed).toFixed(1);
  const altitude = helicopter.y.toFixed(1);

  return (
    <div style={{
      position: 'fixed',
      bottom: '80px',
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
        gap: '20px',
        background: 'rgba(0, 0, 0, 0.7)',
        borderRadius: '12px',
        padding: '10px 24px',
        backdropFilter: 'blur(4px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
      }}>
        {/* 速度計 */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <span style={{
            color: '#88ccff',
            fontSize: '11px',
            fontWeight: 'bold',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}>
            SPEED
          </span>
          <span style={{
            color: '#ffffff',
            fontSize: '24px',
            fontWeight: 'bold',
            fontFamily: 'monospace',
          }}>
            {speed}
          </span>
        </div>

        {/* 区切り線 */}
        <div style={{
          width: '1px',
          background: 'rgba(255, 255, 255, 0.2)',
          alignSelf: 'stretch',
        }} />

        {/* 高度計 */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <span style={{
            color: '#ffcc44',
            fontSize: '11px',
            fontWeight: 'bold',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}>
            ALT
          </span>
          <span style={{
            color: '#ffffff',
            fontSize: '24px',
            fontWeight: 'bold',
            fontFamily: 'monospace',
          }}>
            {altitude}
          </span>
        </div>
      </div>

      {/* 操作ガイド（座席別） */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.5)',
        borderRadius: '8px',
        padding: '6px 16px',
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.6)',
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        <span style={{ color: '#ffdd00', fontWeight: 'bold', fontSize: '10px' }}>
          {SEAT_NAMES[mySeat]}
        </span>
        {mySeat === 'pilot' && (
          <>
            <span><b style={{ color: '#ffcc00' }}>W/S</b> 前進/後退</span>
            <span><b style={{ color: '#ffcc00' }}>A/D</b> 旋回</span>
            <span><b style={{ color: '#ffcc00' }}>Space</b> 上昇</span>
            <span><b style={{ color: '#ffcc00' }}>Shift</b> 下降</span>
          </>
        )}
        {(mySeat === 'gunner_left' || mySeat === 'gunner_right') && (
          <>
            <span><b style={{ color: '#ff6644' }}>左クリック</b> 射撃</span>
            <span><b style={{ color: '#ffcc00' }}>マウス</b> 照準</span>
          </>
        )}
        {mySeat === 'copilot' && (
          <span>マウスで周囲を見回せます</span>
        )}
        <span><b style={{ color: '#ff6644' }}>F</b> 降りる</span>
      </div>
    </div>
  );
}
