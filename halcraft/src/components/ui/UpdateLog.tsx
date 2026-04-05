// アップデート履歴パネル
// タイトル画面の左側に表示するスクロール可能な履歴リスト
// モバイルでは非表示（画面が狭いため）

import { UPDATES, UPDATE_ICONS } from '../../data/updateLog';

/** 日付を「MM/DD」形式にフォーマット */
function formatDate(dateStr: string): string {
  const parts = dateStr.split('-');
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

/** 今日からの相対日数を計算 */
function daysAgo(dateStr: string): string {
  const now = new Date();
  const target = new Date(dateStr + 'T00:00:00');
  const diffMs = now.getTime() - target.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'きょう';
  if (diffDays === 1) return 'きのう';
  if (diffDays <= 7) return `${diffDays}日前`;
  return '';
}

export function UpdateLog() {
  return (
    <div
      style={containerStyle}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ヘッダー */}
      <div style={headerStyle}>
        <span style={headerIconStyle}>📋</span>
        <span style={headerTextStyle}>アップデート</span>
      </div>

      {/* スクロール領域 */}
      <div style={scrollAreaStyle}>
        {UPDATES.map((group, gi) => {
          const relative = daysAgo(group.date);
          return (
            <div key={group.date} style={groupStyle}>
              {/* 日付ヘッダー */}
              <div style={dateRowStyle}>
                <span style={dateTextStyle}>{formatDate(group.date)}</span>
                {relative && (
                  <span style={relativeDateStyle}>{relative}</span>
                )}
                {gi === 0 && (
                  <span style={newBadgeStyle}>NEW</span>
                )}
              </div>

              {/* アイテム一覧 */}
              {group.items.map((item, ii) => (
                <div key={ii} style={itemStyle}>
                  <span style={itemIconStyle}>
                    {UPDATE_ICONS[item.type]}
                  </span>
                  <span style={itemTextStyle}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* アニメーション用CSS */}
      <style>{animCSS}</style>
    </div>
  );
}

// ============================================
// スタイル定義
// ============================================

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  left: 16,
  top: 16,
  bottom: 100,
  width: 260,
  display: 'flex',
  flexDirection: 'column',
  zIndex: 3,
  pointerEvents: 'auto',
  animation: 'updateLogSlideIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
  animationDelay: '0.3s',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 14px',
  background: 'rgba(0, 0, 0, 0.55)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRadius: '12px 12px 0 0',
  borderTop: '1px solid rgba(255, 255, 255, 0.1)',
  borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
  borderRight: '1px solid rgba(255, 255, 255, 0.1)',
};

const headerIconStyle: React.CSSProperties = {
  fontSize: 14,
};

const headerTextStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'rgba(255, 255, 255, 0.85)',
  letterSpacing: 2,
  fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
};

const scrollAreaStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  background: 'rgba(0, 0, 0, 0.45)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRadius: '0 0 12px 12px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
  borderRight: '1px solid rgba(255, 255, 255, 0.06)',
  padding: '4px 0',
  // カスタムスクロールバー用
  scrollbarWidth: 'thin',
  scrollbarColor: 'rgba(255,255,255,0.15) transparent',
};

const groupStyle: React.CSSProperties = {
  padding: '6px 12px 8px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
};

const dateRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: 4,
};

const dateTextStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'rgba(160, 200, 255, 0.8)',
  fontFamily: 'monospace',
};

const relativeDateStyle: React.CSSProperties = {
  fontSize: 9,
  color: 'rgba(160, 200, 255, 0.45)',
  fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
};

const newBadgeStyle: React.CSSProperties = {
  fontSize: 8,
  fontWeight: 800,
  color: '#fff',
  background: 'linear-gradient(135deg, #ff6b6b, #ee5a24)',
  borderRadius: 4,
  padding: '1px 5px',
  letterSpacing: 1,
  animation: 'newBadgePulse 2s ease-in-out infinite',
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 5,
  padding: '2px 0',
};

const itemIconStyle: React.CSSProperties = {
  fontSize: 10,
  flexShrink: 0,
  lineHeight: '16px',
};

const itemTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'rgba(255, 255, 255, 0.65)',
  lineHeight: '16px',
  fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
};

const animCSS = `
  @keyframes updateLogSlideIn {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  @keyframes newBadgePulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
  /* カスタムスクロールバー（Webkit系） */
  div::-webkit-scrollbar {
    width: 4px;
  }
  div::-webkit-scrollbar-track {
    background: transparent;
  }
  div::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border-radius: 2px;
  }
  div::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.25);
  }
`;
