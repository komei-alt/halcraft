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

    return () => {
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
        alignItems: 'center',
        justifyContent: 'center',
        // 薄い水色ティントで「固まった水色画面」に見えないよう、明示的な再開 UI を出す
        background: 'radial-gradient(ellipse at center, rgba(20, 40, 70, 0.28) 0%, rgba(6, 10, 18, 0.55) 100%)',
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
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          padding: '18px 28px',
          borderRadius: 16,
          border: '1px solid rgba(255, 214, 128, 0.42)',
          background: 'rgba(10, 12, 18, 0.9)',
          color: '#ffe2a0',
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: '0.04em',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.4)',
          cursor: 'pointer',
          backdropFilter: 'blur(10px)',
        }}
      >
        <span style={{ fontSize: 28 }}>🖱️</span>
        <span>クリックして操作を再開</span>
        <span style={{ color: 'rgba(255, 255, 255, 0.62)', fontSize: 12, fontWeight: 600 }}>
          画面を押すとマウスロックが戻るよ
        </span>
      </button>
    </div>
  );
}
