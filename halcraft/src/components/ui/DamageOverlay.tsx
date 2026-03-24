// ダメージオーバーレイ + ゲームオーバー画面 + ダメージ方向インジケーター
// ダメージ時の赤フラッシュと方向性ビネット、HP0時のゲームオーバー画面を表示

import { useEffect } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { isTouchDevice } from '../../utils/device';

/** ダメージ方向インジケーター（攻撃元の方向に赤い矢印） */
function DamageDirectionIndicator({ direction }: { direction: number | null }) {
  if (direction === null) return null;

  // プレイヤーの向き（カメラのY回転）を取得
  // damageDirectionはワールド座標の角度なので、カメラのY回転との差分で画面上の角度にする
  // ここではdamageDirectionがすでに画面相対の角度として格納されている前提

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 155,
        animation: 'damageFlash 0.4s ease-out forwards',
      }}
    >
      {/* 方向性ビネット（攻撃が来た方向にグラデーション集中） */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(
              ellipse 120% 120% at 
              ${50 - Math.sin(direction) * 40}% ${50 - Math.cos(direction) * 40}%,
              rgba(220, 0, 0, 0.5) 0%,
              rgba(200, 0, 0, 0.15) 30%,
              transparent 70%
            )
          `,
        }}
      />
      {/* 方向矢印インジケーター */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 200,
          height: 200,
          transform: `translate(-50%, -50%) rotate(${-direction}rad)`,
        }}
      >
        {/* 上方向に矢印（回転でダメージ方向を示す） */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '10px solid transparent',
            borderRight: '10px solid transparent',
            borderBottom: '20px solid rgba(255, 60, 60, 0.7)',
            filter: 'drop-shadow(0 0 6px rgba(255, 0, 0, 0.6))',
          }}
        />
      </div>
    </div>
  );
}

export function DamageOverlay() {
  const isDamageFlash = usePlayerStore((s) => s.isDamageFlash);
  const isDead = usePlayerStore((s) => s.isDead);
  const respawn = usePlayerStore((s) => s.respawn);
  const damageDirection = usePlayerStore((s) => s.damageDirection);

  // ゲームオーバー時にPointerLockを解除してマウスカーソルを表示
  useEffect(() => {
    if (isDead && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [isDead]);

  const handleRespawn = () => {
    respawn();
    // リスポーン時にポインターロックを再取得（デスクトップのみ）
    if (!isTouchDevice()) {
      setTimeout(() => {
        const canvas = document.querySelector('canvas');
        if (canvas) canvas.requestPointerLock();
      }, 100);
    }
  };

  return (
    <>
      {/* ダメージフラッシュ（方向性なし — 方向が無い場合のフォールバック） */}
      {isDamageFlash && !isDead && damageDirection === null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'radial-gradient(ellipse at center, transparent 30%, rgba(200, 0, 0, 0.4) 100%)',
            pointerEvents: 'none',
            zIndex: 150,
            animation: 'damageFlash 0.3s ease-out forwards',
          }}
        />
      )}

      {/* ダメージ方向インジケーター（方向がある場合） */}
      {isDamageFlash && !isDead && damageDirection !== null && (
        <DamageDirectionIndicator direction={damageDirection} />
      )}

      {/* ゲームオーバー画面 */}
      {isDead && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(120, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 300,
            animation: 'craftFadeIn 0.5s ease-out',
          }}
        >
          <div
            style={{
              fontSize: 48,
              fontWeight: 900,
              color: '#FF4444',
              textShadow: '0 0 20px rgba(255, 0, 0, 0.5), 2px 2px 4px rgba(0,0,0,0.8)',
              marginBottom: 20,
              fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
              letterSpacing: 8,
            }}
          >
            ゲームオーバー
          </div>
          <button
            onClick={handleRespawn}
            style={{
              padding: '14px 40px',
              fontSize: 18,
              fontWeight: 700,
              color: '#fff',
              background: 'linear-gradient(145deg, #555, #333)',
              border: '3px solid #888',
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
              textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(145deg, #666, #444)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#aaa';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(145deg, #555, #333)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#888';
            }}
          >
            リスポーン
          </button>
        </div>
      )}
    </>
  );
}
