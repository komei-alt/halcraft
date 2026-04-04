// メンテナンスオーバーレイ
// サーバーとの接続が切れた時（デプロイ中など）に表示する
// 復帰を検知したら再起動を促すメッセージを表示

import { useState, useEffect, useRef, useCallback } from 'react';

/** ヘルスチェックの間隔（ミリ秒） */
const CHECK_INTERVAL = 3000;
/** オフライン判定前の連続失敗回数 */
const FAIL_THRESHOLD = 2;
/** ヘルスチェック用の軽量URLパス */
const HEALTH_URL = '/manifest.json';
/** サーバー復帰後の追加待機秒数（コンテナ完全起動を待つ） */
const RECOVERY_WAIT_SECONDS = 8;

export function MaintenanceOverlay() {
  const [isOffline, setIsOffline] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [countdown, setCountdown] = useState(RECOVERY_WAIT_SECONDS);
  const failCount = useRef(0);
  const wasOffline = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      // キャッシュバスター付きでフェッチ（Cloudflareキャッシュ回避）
      const url = `${HEALTH_URL}?_t=${Date.now()}`;
      const res = await fetch(url, {
        method: 'HEAD',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        failCount.current = 0;
        if (wasOffline.current && !isRecovering) {
          // サーバー復帰検知 → カウントダウン開始
          setIsRecovering(true);
        }
        if (!wasOffline.current) {
          setIsOffline(false);
        }
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
  }, [isRecovering]);

  // 復帰カウントダウン — setInterval コールバックで外部タイマーと同期するパターン
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isRecovering) return;

    // isRecovering になった瞬間にカウントダウンを初期値にリセット
    let current = RECOVERY_WAIT_SECONDS;
    setCountdown(current);

    const timer = setInterval(() => {
      current -= 1;
      if (current <= 0) {
        clearInterval(timer);
        // カウントダウン終了 → リロード
        window.location.reload();
        return;
      }
      setCountdown(current);
    }, 1000);

    return () => clearInterval(timer);
  }, [isRecovering]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
          <div style={isRecovering ? blockStyleDone : blockStyle}>
            <div style={{ ...blockFaceStyle, ...(isRecovering ? blockFrontDoneStyle : blockFrontStyle) }} />
            <div style={{ ...blockFaceStyle, ...(isRecovering ? blockTopDoneStyle : blockTopStyle) }} />
            <div style={{ ...blockFaceStyle, ...(isRecovering ? blockRightDoneStyle : blockRightStyle) }} />
          </div>
        </div>

        {isRecovering ? (
          <>
            <h1 style={titleDoneStyle}>
              ✅ アップデート完了！
            </h1>
            <p style={messageStyle}>
              新しいバージョンの準備ができたよ！
            </p>
            <p style={countdownStyle}>
              {countdown} 秒後に自動リロード…
            </p>
            <button
              onClick={() => window.location.reload()}
              style={reloadButtonStyle}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(145deg, #4da3ff, #2980e0)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(145deg, #3498db, #2980b9)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
              }}
            >
              🔄 今すぐリロード
            </button>
          </>
        ) : (
          <>
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
          </>
        )}
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

const blockStyleDone: React.CSSProperties = {
  ...blockStyle,
  animation: 'blockBounce 0.6s ease-out forwards',
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

// 復帰時は青色に変更
const blockFrontDoneStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #3498db, #5dade2)',
  transform: 'translateZ(30px)',
};

const blockTopDoneStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #5dade2, #85c1e9)',
  transform: 'rotateX(90deg) translateZ(30px)',
};

const blockRightDoneStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #2980b9, #4a9fd5)',
  transform: 'rotateY(90deg) translateZ(30px)',
};

const titleStyle: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: 'bold',
  color: '#ffffff',
  marginBottom: '16px',
  textShadow: '0 2px 8px rgba(0,0,0,0.5)',
};

const titleDoneStyle: React.CSSProperties = {
  ...titleStyle,
  color: '#5dade2',
  animation: 'fadeInUp 0.5s ease-out',
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

const countdownStyle: React.CSSProperties = {
  fontSize: '16px',
  color: '#7b8fb2',
  marginBottom: '24px',
  animation: 'fadeInUp 0.5s ease-out 0.2s both',
};

const reloadButtonStyle: React.CSSProperties = {
  padding: '14px 36px',
  fontSize: '18px',
  fontWeight: 700,
  color: '#fff',
  background: 'linear-gradient(145deg, #3498db, #2980b9)',
  border: '3px solid #5dade2',
  borderRadius: 12,
  cursor: 'pointer',
  fontFamily: "'Rounded Mplus 1c', 'Noto Sans JP', sans-serif",
  textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
  boxShadow: '0 4px 16px rgba(52, 152, 219, 0.4)',
  transition: 'all 0.2s',
  animation: 'fadeInUp 0.5s ease-out 0.4s both',
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
  @keyframes blockBounce {
    0%   { transform: rotateX(0deg) rotateY(0deg) scale(1); }
    50%  { transform: rotateX(0deg) rotateY(0deg) scale(1.2); }
    100% { transform: rotateX(0deg) rotateY(0deg) scale(1); }
  }
  @keyframes dotPulse {
    0%, 100% { opacity: 0.3; transform: scale(0.8); }
    50%      { opacity: 1; transform: scale(1.2); }
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @import url('https://fonts.googleapis.com/css2?family=Rounded+Mplus+1c:wght@700&display=swap');
`;
