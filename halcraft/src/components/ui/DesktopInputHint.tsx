// デスクトップで操作入力がまだ有効化されていない時の案内HUD

import { useCallback, useEffect, useState } from 'react';
import { isTouchDevice } from '../../utils/device';
import { activateDesktopGameplayInput, isDesktopGameplayInputActive } from '../../utils/gameCanvas';

function readInputReady(): boolean {
  return isTouchDevice() || isDesktopGameplayInputActive();
}

export function DesktopInputHint() {
  const [inputReady, setInputReady] = useState(readInputReady);

  useEffect(() => {
    if (isTouchDevice()) return undefined;

    const sync = () => setInputReady(readInputReady());

    sync();
    window.addEventListener('focus', sync);
    window.addEventListener('blur', sync);
    document.addEventListener('pointerlockchange', sync);
    document.addEventListener('focusin', sync);

    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('blur', sync);
      document.removeEventListener('pointerlockchange', sync);
      document.removeEventListener('focusin', sync);
    };
  }, []);

  const handleActivate = useCallback(() => {
    setInputReady(activateDesktopGameplayInput());
  }, []);

  if (inputReady) return null;

  return (
    <button
      type="button"
      onClick={handleActivate}
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '132px',
        transform: 'translateX(-50%)',
        zIndex: 140,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 16px',
        borderRadius: '999px',
        border: '1px solid rgba(255, 214, 128, 0.38)',
        background: 'rgba(10, 8, 6, 0.82)',
        color: '#ffe2a0',
        fontSize: '13px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.28)',
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
      }}
    >
      <span style={{ fontSize: '15px' }}>🖱️</span>
      <span>クリックで操作開始</span>
      <span style={{ color: 'rgba(255, 255, 255, 0.58)', fontSize: '11px', fontWeight: 600 }}>
        Rでロケット発射
      </span>
    </button>
  );
}
