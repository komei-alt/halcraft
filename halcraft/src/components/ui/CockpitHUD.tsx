// コックピットHUDオーバーレイ
// ヘリコプター搭乗中に表示する2D CSSオーバーレイ
// ガラスの反射エフェクト + 窓枠の影 + リアルな計器デザイン
// VehicleHUD を拡張してコックピット感を演出

import { useVehicleStore, HELICOPTER_CONSTANTS } from '../../stores/useVehicleStore';
import { useGameStore } from '../../stores/useGameStore';

export function CockpitHUD() {
  const helicopter = useVehicleStore((s) => s.helicopter);
  const isNight = useGameStore((s) => s.isNight);

  if (!helicopter.isBoarded) return null;

  const speed = Math.abs(helicopter.speed);
  const speedPct = (speed / HELICOPTER_CONSTANTS.MAX_SPEED) * 100;
  const altitude = helicopter.y;
  // 方位をヘリの回転から計算（0-360度）
  const heading = (((-helicopter.rotationY * 180) / Math.PI) % 360 + 360) % 360;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 90,
    }}>
      {/* === ガラスの反射・汚れエフェクト === */}
      {/* ガラスのエッジグロー（窓の端に薄いハイライト） */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `
          radial-gradient(ellipse at 30% 20%, rgba(180, 220, 255, ${isNight ? 0.04 : 0.06}) 0%, transparent 50%),
          radial-gradient(ellipse at 70% 15%, rgba(255, 255, 240, ${isNight ? 0.03 : 0.05}) 0%, transparent 40%),
          radial-gradient(ellipse at 50% 80%, rgba(100, 180, 255, ${isNight ? 0.02 : 0.03}) 0%, transparent 60%)
        `,
      }} />

      {/* ガラスの微妙なティント（全体に薄い青みがかった色） */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `rgba(160, 210, 240, ${isNight ? 0.03 : 0.04})`,
        mixBlendMode: 'screen',
      }} />

      {/* ガラスの反射ライン（対角線上の光の筋） */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(
          135deg,
          transparent 30%,
          rgba(255, 255, 255, ${isNight ? 0.02 : 0.04}) 45%,
          transparent 46%,
          transparent 60%,
          rgba(255, 255, 255, ${isNight ? 0.01 : 0.025}) 70%,
          transparent 71%
        )`,
      }} />

      {/* === 窓枠ビネット（エッジを暗くしてフレーム感を出す） === */}
      <div style={{
        position: 'absolute',
        inset: 0,
        boxShadow: `
          inset 0 0 120px 30px rgba(0, 0, 0, 0.4),
          inset 0 60px 80px -40px rgba(0, 0, 0, 0.3),
          inset 0 -40px 60px -20px rgba(0, 0, 0, 0.35)
        `,
      }} />

      {/* ダッシュボード下部のグラデーション（コックピット奥行き感） */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '18%',
        background: 'linear-gradient(to top, rgba(15, 15, 20, 0.85) 0%, rgba(15, 15, 20, 0.4) 60%, transparent 100%)',
      }} />

      {/* 天井のグラデーション */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '8%',
        background: 'linear-gradient(to bottom, rgba(10, 10, 15, 0.6) 0%, transparent 100%)',
      }} />

      {/* === HUD インストルメント === */}

      {/* ヘッドアップ風 方位表示（上部中央） */}
      <div style={{
        position: 'absolute',
        top: '8%',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2px',
      }}>
        {/* 方位テープ */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.5)',
          borderRadius: '4px',
          padding: '3px 20px',
          border: '1px solid rgba(80, 200, 120, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{
            color: 'rgba(80, 200, 120, 0.5)',
            fontSize: '9px',
            fontFamily: 'monospace',
          }}>
            HDG
          </span>
          <span style={{
            color: '#50c878',
            fontSize: '14px',
            fontWeight: 'bold',
            fontFamily: 'monospace',
            minWidth: '36px',
            textAlign: 'center',
          }}>
            {heading.toFixed(0).padStart(3, '0')}°
          </span>
        </div>
        {/* 方位マーカー（▽） */}
        <div style={{
          width: 0,
          height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop: '6px solid rgba(80, 200, 120, 0.6)',
        }} />
      </div>

      {/* 左側パネル: 速度計 */}
      <div style={{
        position: 'absolute',
        left: '5%',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
      }}>
        {/* 速度バー（縦） */}
        <div style={{
          width: '4px',
          height: '120px',
          background: 'rgba(0, 0, 0, 0.4)',
          borderRadius: '2px',
          border: '1px solid rgba(80, 200, 120, 0.2)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${speedPct}%`,
            background: speed > HELICOPTER_CONSTANTS.MAX_SPEED * 0.8
              ? 'linear-gradient(to top, #ff4444, #ffaa00)'
              : 'linear-gradient(to top, #50c878, #88ffaa)',
            borderRadius: '2px',
            transition: 'height 0.1s ease',
          }} />
        </div>
        {/* 速度数値 */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.5)',
          borderRadius: '4px',
          padding: '4px 10px',
          border: '1px solid rgba(80, 200, 120, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <span style={{
            color: 'rgba(80, 200, 120, 0.5)',
            fontSize: '8px',
            fontFamily: 'monospace',
            letterSpacing: '1px',
          }}>
            SPD
          </span>
          <span style={{
            color: '#50c878',
            fontSize: '16px',
            fontWeight: 'bold',
            fontFamily: 'monospace',
          }}>
            {speed.toFixed(1)}
          </span>
        </div>
      </div>

      {/* 右側パネル: 高度計 */}
      <div style={{
        position: 'absolute',
        right: '5%',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
      }}>
        {/* 高度バー（縦） */}
        <div style={{
          width: '4px',
          height: '120px',
          background: 'rgba(0, 0, 0, 0.4)',
          borderRadius: '2px',
          border: '1px solid rgba(68, 170, 255, 0.2)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${Math.min(100, (altitude / 80) * 100)}%`,
            background: altitude > 60
              ? 'linear-gradient(to top, #ff4444, #ffaa00)'
              : 'linear-gradient(to top, #44aaff, #88ccff)',
            borderRadius: '2px',
            transition: 'height 0.1s ease',
          }} />
        </div>
        {/* 高度数値 */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.5)',
          borderRadius: '4px',
          padding: '4px 10px',
          border: '1px solid rgba(68, 170, 255, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <span style={{
            color: 'rgba(68, 170, 255, 0.5)',
            fontSize: '8px',
            fontFamily: 'monospace',
            letterSpacing: '1px',
          }}>
            ALT
          </span>
          <span style={{
            color: '#44aaff',
            fontSize: '16px',
            fontWeight: 'bold',
            fontFamily: 'monospace',
          }}>
            {altitude.toFixed(1)}
          </span>
        </div>
      </div>

      {/* 下部中央: 操作ガイド（コンパクト） */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '16px',
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: '6px',
        padding: '5px 16px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontFamily: 'monospace' }}>
          <b style={{ color: '#50c878' }}>W/S</b> 前進/後退
        </span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontFamily: 'monospace' }}>
          <b style={{ color: '#50c878' }}>A/D</b> 旋回
        </span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontFamily: 'monospace' }}>
          <b style={{ color: '#50c878' }}>Space</b> ↑
        </span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontFamily: 'monospace' }}>
          <b style={{ color: '#50c878' }}>Shift</b> ↓
        </span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontFamily: 'monospace' }}>
          <b style={{ color: '#ff6644' }}>F</b> 降りる
        </span>
      </div>

      {/* ステータスバー（左下） */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#50c878',
            boxShadow: '0 0 4px #50c878',
          }} />
          <span style={{
            color: 'rgba(80, 200, 120, 0.7)',
            fontSize: '9px',
            fontFamily: 'monospace',
          }}>
            ENG NORMAL
          </span>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#50c878',
            boxShadow: '0 0 4px #50c878',
          }} />
          <span style={{
            color: 'rgba(80, 200, 120, 0.7)',
            fontSize: '9px',
            fontFamily: 'monospace',
          }}>
            ROTOR OK
          </span>
        </div>
      </div>

      {/* HALCRAFT マーク（右下） */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '2px',
      }}>
        <span style={{
          color: 'rgba(255, 255, 255, 0.15)',
          fontSize: '8px',
          fontFamily: 'monospace',
          letterSpacing: '2px',
        }}>
          HALCRAFT
        </span>
        <span style={{
          color: 'rgba(255, 255, 255, 0.1)',
          fontSize: '7px',
          fontFamily: 'monospace',
        }}>
          HC-01 RESCUE
        </span>
      </div>
    </div>
  );
}
