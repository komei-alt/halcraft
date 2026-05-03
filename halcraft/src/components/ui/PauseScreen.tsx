// ポーズ画面コンポーネント
// ESCキーでゲームを一時停止し、「再開」と「タイトルに戻る」を表示
// マルチプレイ接続中はタイトルに戻る際にサーバーから切断する

import { useEffect, useCallback } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { isTouchDevice } from '../../utils/device';
import { activateDesktopGameplayInput } from '../../utils/gameCanvas';

export function PauseScreen() {
  const phase = useGameStore((s) => s.phase);
  const togglePause = useGameStore((s) => s.togglePause);
  const returnToMenu = useGameStore((s) => s.returnToMenu);
  const leave = useMultiplayerStore((s) => s.leave);
  const isTouch = isTouchDevice();

  // ESCキーでポーズ切り替え
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        const currentPhase = useGameStore.getState().phase;
        if (currentPhase === 'playing' || currentPhase === 'paused') {
          togglePause();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePause]);

  // ポーズ時にPointerLockを解除
  useEffect(() => {
    if (phase === 'paused' && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [phase]);

  // 再開ハンドラ
  const handleResume = useCallback(() => {
    togglePause();
    // デスクトップではPointerLockを再取得
    if (!isTouch) {
      setTimeout(() => {
        activateDesktopGameplayInput();
      }, 100);
    }
  }, [togglePause, isTouch]);

  // タイトルに戻るハンドラ
  const handleReturnToMenu = useCallback(() => {
    // マルチプレイから切断
    leave();
    // ゲーム状態をメニューに戻す
    returnToMenu();
  }, [leave, returnToMenu]);

  if (phase !== 'paused') return null;

  return (
    <div
      id="pause-screen"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 250,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        animation: 'pauseFadeIn 0.2s ease-out',
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
      }}
    >
      {/* タイトル */}
      <div
        style={{
          fontSize: isTouch ? 32 : 42,
          fontWeight: 900,
          color: '#fff',
          letterSpacing: 8,
          textShadow: '0 0 24px rgba(100, 200, 255, 0.4), 2px 2px 4px rgba(0,0,0,0.8)',
          marginBottom: isTouch ? 28 : 40,
          animation: 'pauseSlideIn 0.3s ease-out',
        }}
      >
        ⏸ ポーズ
      </div>

      {/* メニューボタン群 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: isTouch ? 12 : 16,
          width: isTouch ? 220 : 280,
          animation: 'pauseSlideIn 0.35s ease-out',
        }}
      >
        {/* 再開ボタン */}
        <button
          id="pause-resume-btn"
          type="button"
          onClick={handleResume}
          style={{
            padding: isTouch ? '14px 24px' : '16px 32px',
            fontSize: isTouch ? 16 : 20,
            fontWeight: 700,
            color: '#fff',
            background: 'linear-gradient(145deg, rgba(60, 180, 80, 0.5), rgba(40, 140, 60, 0.5))',
            border: '2px solid rgba(100, 220, 120, 0.6)',
            borderRadius: 10,
            cursor: 'pointer',
            fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
            textShadow: '1px 1px 3px rgba(0,0,0,0.5)',
            boxShadow: '0 4px 16px rgba(60, 180, 80, 0.2)',
            transition: 'all 0.2s ease',
            letterSpacing: 3,
            backdropFilter: 'blur(4px)',
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget;
            btn.style.background = 'linear-gradient(145deg, rgba(80, 200, 100, 0.6), rgba(60, 160, 80, 0.6))';
            btn.style.borderColor = 'rgba(130, 240, 150, 0.8)';
            btn.style.boxShadow = '0 6px 24px rgba(60, 180, 80, 0.35)';
            btn.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget;
            btn.style.background = 'linear-gradient(145deg, rgba(60, 180, 80, 0.5), rgba(40, 140, 60, 0.5))';
            btn.style.borderColor = 'rgba(100, 220, 120, 0.6)';
            btn.style.boxShadow = '0 4px 16px rgba(60, 180, 80, 0.2)';
            btn.style.transform = 'translateY(0)';
          }}
        >
          ▶ 再開
        </button>

        {/* タイトルに戻るボタン */}
        <button
          id="pause-return-btn"
          type="button"
          onClick={handleReturnToMenu}
          style={{
            padding: isTouch ? '14px 24px' : '16px 32px',
            fontSize: isTouch ? 16 : 20,
            fontWeight: 700,
            color: 'rgba(255, 255, 255, 0.85)',
            background: 'linear-gradient(145deg, rgba(100, 100, 120, 0.45), rgba(70, 70, 90, 0.45))',
            border: '2px solid rgba(150, 150, 170, 0.4)',
            borderRadius: 10,
            cursor: 'pointer',
            fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
            textShadow: '1px 1px 3px rgba(0,0,0,0.5)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
            transition: 'all 0.2s ease',
            letterSpacing: 3,
            backdropFilter: 'blur(4px)',
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget;
            btn.style.background = 'linear-gradient(145deg, rgba(120, 120, 140, 0.55), rgba(90, 90, 110, 0.55))';
            btn.style.borderColor = 'rgba(180, 180, 200, 0.6)';
            btn.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.25)';
            btn.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget;
            btn.style.background = 'linear-gradient(145deg, rgba(100, 100, 120, 0.45), rgba(70, 70, 90, 0.45))';
            btn.style.borderColor = 'rgba(150, 150, 170, 0.4)';
            btn.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.15)';
            btn.style.transform = 'translateY(0)';
          }}
        >
          🏠 タイトルに戻る
        </button>
      </div>

      {/* 操作ヒント */}
      <div
        style={{
          marginTop: isTouch ? 24 : 36,
          color: 'rgba(255, 255, 255, 0.35)',
          fontSize: isTouch ? 11 : 13,
          letterSpacing: 1,
          textShadow: '0 1px 2px rgba(0,0,0,0.6)',
          animation: 'pauseSlideIn 0.45s ease-out',
        }}
      >
        {isTouch ? 'タップで選択' : 'ESC で再開'}
      </div>
    </div>
  );
}
