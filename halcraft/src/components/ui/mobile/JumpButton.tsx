// ジャンプボタン
// 右下に配置されるジャンプ用タッチボタン

import { useCallback } from 'react';
import { mobileActions } from '../../../utils/touchInput';

const BUTTON_SIZE = 64;

export function JumpButton() {
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.jump = true;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    mobileActions.jump = false;
  }, []);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{
        position: 'fixed',
        right: 20,
        bottom: 'calc(40px + env(safe-area-inset-bottom))',
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.08)',
        border: '2px solid rgba(255, 255, 255, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 120,
        touchAction: 'none',
        WebkitTapHighlightColor: 'transparent',
        fontSize: 22,
        color: 'rgba(255, 255, 255, 0.6)',
        textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      ▲
    </div>
  );
}
