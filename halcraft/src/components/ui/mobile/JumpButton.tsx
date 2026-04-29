// ジャンプボタン
// 右下に配置されるジャンプ/飛行用タッチボタン

import { useCallback, useEffect } from 'react';
import { useGameStore } from '../../../stores/useGameStore';
import { mobileActions } from '../../../utils/touchInput';

const BUTTON_SIZE = 64;
const BUTTON_GAP = 12;

export function JumpButton() {
  const gameMode = useGameStore((s) => s.gameMode);
  const creativeFlying = useGameStore((s) => s.creativeFlying);
  const showDescend = gameMode === 'creative' && creativeFlying;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.jump = true;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    mobileActions.jump = false;
  }, []);

  const handleDescendStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.descend = true;
  }, []);

  const handleDescendEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    mobileActions.descend = false;
  }, []);

  useEffect(() => {
    if (!showDescend) {
      mobileActions.descend = false;
    }
    return () => {
      mobileActions.descend = false;
    };
  }, [showDescend]);

  return (
    <>
      {showDescend && (
        <div
          onTouchStart={handleDescendStart}
          onTouchEnd={handleDescendEnd}
          onTouchCancel={handleDescendEnd}
          style={{
            position: 'fixed',
            right: BUTTON_SIZE + BUTTON_GAP + 20,
            bottom: 'calc(40px + env(safe-area-inset-bottom))',
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            borderRadius: '50%',
            background: 'rgba(80, 170, 255, 0.12)',
            border: '2px solid rgba(130, 210, 255, 0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            touchAction: 'none',
            WebkitTapHighlightColor: 'transparent',
            fontSize: 22,
            color: 'rgba(210, 240, 255, 0.76)',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          ▼
        </div>
      )}
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
          background: showDescend ? 'rgba(80, 170, 255, 0.16)' : 'rgba(255, 255, 255, 0.08)',
          border: showDescend ? '2px solid rgba(130, 210, 255, 0.34)' : '2px solid rgba(255, 255, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 120,
          touchAction: 'none',
          WebkitTapHighlightColor: 'transparent',
          fontSize: 22,
          color: showDescend ? 'rgba(210, 240, 255, 0.82)' : 'rgba(255, 255, 255, 0.6)',
          textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        ▲
      </div>
    </>
  );
}
