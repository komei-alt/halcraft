// デスクトップで操作入力がまだ有効化されていない時の案内HUD
// Pointer Lock が外れたまま操作不能に見える問題を防ぐ

import { useCallback, useEffect, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { isTouchDevice } from '../../utils/device';
import { activateDesktopGameplayInput, isDesktopGameplayInputActive } from '../../utils/gameCanvas';

function readInputReady(): boolean {
  return isTouchDevice() || isDesktopGameplayInputActive();
}

export function DesktopInputHint() {
  const phase = useGameStore((s) => s.phase);
  const [inputReady, setInputReady] = useState(readInputReady);

  useEffect(() => {
    if (isTouchDevice()) return undefined;

    const sync = () => setInputReady(readInputReady());

    sync();
    window.addEventListener('focus', sync);
    window.addEventListener('blur', sync);
    document.addEventListener('pointerlockchange', sync);
    document.addEventListener('focusin', sync);
    document.addEventListener('visibilitychange', sync);
    // Pointer Lock がコンポーネントの初期化より先に成立した場合も、案内を残さない。
    const syncTimer = window.setInterval(sync, 250);

    return () => {
      window.clearInterval(syncTimer);
      window.removeEventListener('focus', sync);
      window.removeEventListener('blur', sync);
      document.removeEventListener('pointerlockchange', sync);
      document.removeEventListener('focusin', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  const handleActivate = useCallback(() => {
    setInputReady(activateDesktopGameplayInput());
  }, []);

  // プレイ中以外、または入力済みなら出さない
  if (phase !== 'playing' || inputReady) return null;

  return (
    <div
      role="dialog"
      aria-label="操作を再開"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 220,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 92,
        // 景色を暗く覆わず、下端の案内だけで再開できるようにする。
        background: 'linear-gradient(to top, rgba(6, 10, 18, 0.28) 0%, transparent 28%)',
        pointerEvents: 'auto',
        cursor: 'pointer',
      }}
      onClick={handleActivate}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleActivate();
        }}
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          borderRadius: 12,
          border: '1px solid rgba(255, 214, 128, 0.42)',
          background: 'rgba(10, 12, 18, 0.9)',
          color: '#ffe2a0',
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: '0.04em',
          boxShadow: '0 10px 26px rgba(0, 0, 0, 0.32)',
          cursor: 'pointer',
          backdropFilter: 'blur(10px)',
        }}
      >
        <span style={{ fontSize: 20 }}>🖱️</span>
        <span>クリックして操作を再開</span>
      </button>
    </div>
  );
}
