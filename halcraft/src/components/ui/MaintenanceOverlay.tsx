// メンテナンスオーバーレイ
// サーバーとの接続が切れた時（デプロイ中など）に表示する
// 復帰を検知したら自動リロード

import { useState, useEffect, useRef, useCallback } from 'react';

/** ヘルスチェックの間隔（ミリ秒） */
const CHECK_INTERVAL = 5000;
/** オフライン判定前の連続失敗回数 */
const FAIL_THRESHOLD = 2;
/** ヘルスチェック用の軽量URLパス */
const HEALTH_URL = '/manifest.json';

export function MaintenanceOverlay() {
  const [isOffline, setIsOffline] = useState(false);
  const failCount = useRef(0);
  const wasOffline = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(HEALTH_URL, {
        method: 'HEAD',
        cache: 'no-store',
      });
      if (res.ok) {
        failCount.current = 0;
        if (wasOffline.current) {
          // サーバー復帰 → 自動リロード
          window.location.reload();
        }
        setIsOffline(false);
      } else {
        failCount.current++;
      }
    } catch {
      failCount.current++;
    }

    if (failCount.current >= FAIL_THRESHOLD) {
      wasOffline.current = true;
      setIsOffline(true);
    }
  }, []);

  useEffect(() => {
    // ブラウザのオンライン/オフラインイベント
    const handleOffline = () => {
      failCount.current = FAIL_THRESHOLD;
      wasOffline.current = true;
      setIsOffline(true);
    };
    const handleOnline = () => {
      // オンラインに戻ったらヘルスチェックで確認
      checkHealth();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // 定期的なヘルスチェック
    intervalRef.current = setInterval(checkHealth, CHECK_INTERVAL);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkHealth]);

  if (!isOffline) return null;

  return (
    <div style={overlayStyle}>
      <div style={contentStyle}>
        {/* 回転するブロックアイコン */}
        <div style={blockContainerStyle}>
          <div style={blockStyle}>
            <div style={{ ...blockFaceStyle, ...blockFrontStyle }} />
            <div style={{ ...blockFaceStyle, ...blockTopStyle }} />
            <div style={{ ...blockFaceStyle, ...blockRightStyle }} />
          </div>
        </div>

        <h1 style={titleStyle}>
          🔧 アップデート中！
        </h1>
        <p style={messageStyle}>
          ハルが作ったゲームを
          <br />
          新しくしています…
        </p>
        <p style={subMessageStyle}>
          もうすぐ遊べるよ！
        </p>

        {/* ドットローディング */}
        <div style={dotsContainerStyle}>
          <span style={{ ...dotStyle, animationDelay: '0s' }}>●</span>
          <span style={{ ...dotStyle, animationDelay: '0.3s' }}>●</span>
          <span style={{ ...dotStyle, animationDelay: '0.6s' }}>●</span>
        </div>
      </div>

      {/* CSS アニメーション */}
      <style>{animationCSS}</style>
    </div>
  );
}

// ============================================
// スタイル定義
// ============================================

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 99999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  fontFamily: "'Rounded Mplus 1c', 'Noto Sans JP', sans-serif",
};

const contentStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '40px',
};

const blockContainerStyle: React.CSSProperties = {
  perspective: '200px',
  width: '80px',
  height: '80px',
  margin: '0 auto 30px',
};

const blockStyle: React.CSSProperties = {
  width: '60px',
  height: '60px',
  position: 'relative',
  transformStyle: 'preserve-3d',
  animation: 'blockSpin 2s ease-in-out infinite',
  margin: '10px auto',
};

const blockFaceStyle: React.CSSProperties = {
  position: 'absolute',
  width: '60px',
  height: '60px',
  border: '3px solid rgba(255,255,255,0.3)',
  borderRadius: '4px',
};

const blockFrontStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #4a8f4a, #6bb86b)',
  transform: 'translateZ(30px)',
};

const blockTopStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #5cb85c, #8fd68f)',
  transform: 'rotateX(90deg) translateZ(30px)',
};

const blockRightStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #3d7a3d, #5aa55a)',
  transform: 'rotateY(90deg) translateZ(30px)',
};

const titleStyle: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: 'bold',
  color: '#ffffff',
  marginBottom: '16px',
  textShadow: '0 2px 8px rgba(0,0,0,0.5)',
};

const messageStyle: React.CSSProperties = {
  fontSize: '18px',
  color: '#a0c4ff',
  lineHeight: '1.8',
  marginBottom: '8px',
};

const subMessageStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#7b8fb2',
  marginBottom: '30px',
};

const dotsContainerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: '12px',
};

const dotStyle: React.CSSProperties = {
  fontSize: '16px',
  color: '#4a90d9',
  animation: 'dotPulse 1.2s ease-in-out infinite',
  display: 'inline-block',
};

const animationCSS = `
  @keyframes blockSpin {
    0%   { transform: rotateX(0deg) rotateY(0deg); }
    25%  { transform: rotateX(90deg) rotateY(90deg); }
    50%  { transform: rotateX(180deg) rotateY(180deg); }
    75%  { transform: rotateX(270deg) rotateY(90deg); }
    100% { transform: rotateX(360deg) rotateY(360deg); }
  }
  @keyframes dotPulse {
    0%, 100% { opacity: 0.3; transform: scale(0.8); }
    50%      { opacity: 1; transform: scale(1.2); }
  }
  @import url('https://fonts.googleapis.com/css2?family=Rounded+Mplus+1c:wght@700&display=swap');
`;
