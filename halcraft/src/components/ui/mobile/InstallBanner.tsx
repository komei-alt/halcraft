// iOS Safari 用「ホーム画面に追加」案内バナー
// PWA としてフルスクリーンで遊ぶための誘導UI

import { useState, useCallback } from 'react';
import { isIOS, isStandalone } from '../../../utils/device';

/**
 * iOS Safari でブラウジング中（PWA未起動）の場合のみ表示
 * 「ホーム画面に追加」してフルスクリーンで遊ぶよう案内する
 */
export function InstallBanner() {
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setDismissed(true);
  }, []);

  // iOS + 通常のブラウザ（PWA非起動）のみ表示
  if (!isIOS() || isStandalone() || dismissed) return null;

  return (
    <div
      id="install-banner"
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 340,
        width: 'calc(100% - 40px)',
        padding: '14px 16px',
        background: 'rgba(66, 165, 245, 0.15)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(66, 165, 245, 0.3)',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        zIndex: 210,
        animation: 'craftSlideIn 0.5s ease-out',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ヘッダー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          📱 フルスクリーンで遊ぼう！
        </span>
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 18,
            cursor: 'pointer',
            padding: '0 4px',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* 手順 */}
      <p
        style={{
          color: 'rgba(255,255,255,0.7)',
          fontSize: 12,
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        Safari の{' '}
        <span style={{ fontSize: 15, verticalAlign: 'middle' }}>
          {/* Share icon */}
          ⬆
        </span>
        {' '}→「ホーム画面に追加」で
        <br />
        バーなしのフルスクリーンで遊べるよ！
      </p>
    </div>
  );
}
