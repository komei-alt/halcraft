// アップデート通知トースト
// サーバーのバージョンが変わったときに画面上部にスライドインする通知
// リロードボタン or 閉じるボタンを提供

import { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';

/** 表示アニメーションの長さ（ms） */
const SLIDE_DURATION = 400;
/** 自動閉じるまでの時間（ms）— 0 なら手動のみ */
const AUTO_DISMISS_MS = 0;

export function UpdateToast() {
  const updateAvailable = useGameStore((s) => s.updateAvailable);
  const dismissUpdate = useGameStore((s) => s.dismissUpdate);
  const [visible, setVisible] = useState(false);
  const [slideIn, setSlideIn] = useState(false);

  // updateAvailable が true になったらスライドイン
  useEffect(() => {
    if (updateAvailable) {
      setVisible(true);
      // 次のフレームでアニメーションを開始（CSSトランジションのため）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setSlideIn(true));
      });

      if (AUTO_DISMISS_MS > 0) {
        const timer = setTimeout(() => handleDismiss(), AUTO_DISMISS_MS);
        return () => clearTimeout(timer);
      }
    }
  }, [updateAvailable]);

  const handleDismiss = () => {
    setSlideIn(false);
    setTimeout(() => {
      setVisible(false);
      dismissUpdate();
    }, SLIDE_DURATION);
  };

  const handleReload = () => {
    window.location.reload();
  };

  if (!visible) return null;

  return (
    <div style={{
      ...containerStyle,
      transform: slideIn ? 'translateY(0)' : 'translateY(-120%)',
      opacity: slideIn ? 1 : 0,
    }}>
      {/* 背景グロー */}
      <div style={glowStyle} />

      <div style={contentStyle}>
        {/* アイコン */}
        <div style={iconStyle}>🎉</div>

        {/* テキスト */}
        <div style={textContainerStyle}>
          <div style={titleStyle}>あたらしいバージョンが来たよ！</div>
          <div style={subtitleStyle}>リロードして最新でプレイ 🚀</div>
        </div>

        {/* ボタン群 */}
        <div style={buttonContainerStyle}>
          <button
            onClick={handleReload}
            style={reloadButtonStyle}
            onMouseEnter={(e) => {
              (e.currentTarget).style.background = 'linear-gradient(145deg, #5dca5d, #3da33d)';
              (e.currentTarget).style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget).style.background = 'linear-gradient(145deg, #4CAF50, #388E3C)';
              (e.currentTarget).style.transform = 'scale(1)';
            }}
          >
            🔄 リロード
          </button>
          <button
            onClick={handleDismiss}
            style={dismissButtonStyle}
            onMouseEnter={(e) => {
              (e.currentTarget).style.background = 'rgba(255,255,255,0.15)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget).style.background = 'rgba(255,255,255,0.08)';
            }}
          >
            あとで
          </button>
        </div>
      </div>

      {/* CSSアニメーション */}
      <style>{animCSS}</style>
    </div>
  );
}

// ============================================
// スタイル定義
// ============================================

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 16,
  left: '50%',
  transform: 'translateX(-50%) translateY(-120%)',
  zIndex: 90000,
  transition: `transform ${SLIDE_DURATION}ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity ${SLIDE_DURATION}ms ease`,
  pointerEvents: 'auto',
  // translateX は後から上書きされるので marginLeft で中央揃え
  marginLeft: 0,
  width: 'fit-content',
};

const glowStyle: React.CSSProperties = {
  position: 'absolute',
  inset: -4,
  borderRadius: 20,
  background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.3), rgba(33, 150, 243, 0.3))',
  filter: 'blur(12px)',
  animation: 'toastGlow 2s ease-in-out infinite alternate',
};

const contentStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '14px 20px',
  background: 'linear-gradient(135deg, rgba(30, 40, 60, 0.95), rgba(20, 30, 50, 0.95))',
  backdropFilter: 'blur(12px)',
  border: '2px solid rgba(76, 175, 80, 0.5)',
  borderRadius: 16,
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
  fontFamily: "'Rounded Mplus 1c', 'Noto Sans JP', sans-serif",
};

const iconStyle: React.CSSProperties = {
  fontSize: 28,
  animation: 'toastBounce 0.6s ease-out',
};

const textContainerStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#fff',
  textShadow: '0 1px 4px rgba(0,0,0,0.4)',
  whiteSpace: 'nowrap',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#a0c4ff',
  marginTop: 2,
  whiteSpace: 'nowrap',
};

const buttonContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexShrink: 0,
};

const reloadButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 700,
  color: '#fff',
  background: 'linear-gradient(145deg, #4CAF50, #388E3C)',
  border: '2px solid rgba(76, 175, 80, 0.6)',
  borderRadius: 10,
  cursor: 'pointer',
  fontFamily: "'Rounded Mplus 1c', 'Noto Sans JP', sans-serif",
  textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
  boxShadow: '0 2px 8px rgba(76, 175, 80, 0.3)',
  transition: 'all 0.2s',
  whiteSpace: 'nowrap',
};

const dismissButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.7)',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 10,
  cursor: 'pointer',
  fontFamily: "'Rounded Mplus 1c', 'Noto Sans JP', sans-serif",
  transition: 'all 0.2s',
  whiteSpace: 'nowrap',
};

const animCSS = `
  @keyframes toastGlow {
    from { opacity: 0.5; }
    to   { opacity: 1; }
  }
  @keyframes toastBounce {
    0%   { transform: scale(0) rotate(-15deg); }
    50%  { transform: scale(1.3) rotate(5deg); }
    100% { transform: scale(1) rotate(0deg); }
  }
  @import url('https://fonts.googleapis.com/css2?family=Rounded+Mplus+1c:wght@700&display=swap');
`;
