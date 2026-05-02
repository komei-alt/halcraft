// PWA インストール案内バナー
// iOS Safari / Android Chrome 向け
// フルスクリーン + プッシュ通知のメリットを案内

import { useState, useCallback } from 'react';
import { isIOS, isStandalone } from '../../../utils/device';

const BANNER_DISMISSED_KEY = 'halcraft-install-banner-dismissed';

/**
 * iOS Safari でブラウジング中 or Android Chrome（PWA未起動）の場合に表示
 * フルスクリーン＋プッシュ通知で遊ぶよう案内する
 */
export function InstallBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(BANNER_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const handleDismiss = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setDismissed(true);
    try {
      localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    } catch { /* noop */ }
  }, []);

  // PWA起動中 or 既に閉じた場合は非表示
  if (isStandalone() || dismissed) return null;

  const ios = isIOS();

  return (
    <div
      id="install-banner"
      style={{
        position: 'relative',
        maxWidth: 340,
        width: '100%',
        padding: '14px 16px',
        background: 'rgba(66, 165, 245, 0.15)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(66, 165, 245, 0.3)',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
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
          📱 アプリとしてインストール！
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

      {/* メリット */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          color: 'rgba(255,255,255,0.75)',
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        <span>🖥️ フルスクリーンでプレイできる</span>
        <span>🔔 誰かが参加したらプッシュ通知でお知らせ</span>
      </div>

      {/* 手順 */}
      <p
        style={{
          color: 'rgba(255,255,255,0.5)',
          fontSize: 11,
          lineHeight: 1.5,
          margin: 0,
          borderTop: '1px solid rgba(255,255,255,0.1)',
          paddingTop: 6,
        }}
      >
        {ios ? (
          <>
            Safari の{' '}
            <span style={{ fontSize: 14, verticalAlign: 'middle' }}>⬆</span>
            {' '}→「ホーム画面に追加」
          </>
        ) : (
          <>
            メニュー{' '}
            <span style={{ fontSize: 14, verticalAlign: 'middle' }}>⋮</span>
            {' '}→「ホーム画面に追加」or「インストール」
          </>
        )}
      </p>
    </div>
  );
}
