// ダメージオーバーレイ + ゲームオーバー画面
// ダメージ時の赤フラッシュと、HP0時のゲームオーバー画面を表示

import { useEffect } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';

export function DamageOverlay() {
  const isDamageFlash = usePlayerStore((s) => s.isDamageFlash);
  const isDead = usePlayerStore((s) => s.isDead);
  const respawn = usePlayerStore((s) => s.respawn);

  // ゲームオーバー時にPointerLockを解除してマウスカーソルを表示
  useEffect(() => {
    if (isDead && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [isDead]);

  const handleRespawn = () => {
    respawn();
    // リスポーン時にポインターロックを再取得
    setTimeout(() => {
      const canvas = document.querySelector('canvas');
      if (canvas) canvas.requestPointerLock();
    }, 100);
  };

  return (
    <>
      {/* ダメージフラッシュ */}
      {isDamageFlash && !isDead && (
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
