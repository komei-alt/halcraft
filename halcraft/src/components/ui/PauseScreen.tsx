// ポーズ画面コンポーネント
// ESCキーでゲームを一時停止し、「再開」と「タイトルに戻る」を表示
// マルチプレイ接続中はタイトルに戻る際にサーバーから切断する

import { useEffect, useCallback, type CSSProperties } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { isTouchDevice } from '../../utils/device';
import { activateDesktopGameplayInput } from '../../utils/gameCanvas';
import { SG } from './startScreenTheme';

interface PauseScreenProps {
  onOpenSettings: () => void;
}

/** ポーズメニューの共通ボタン（アクセント色・ホバーで持ち上がる） */
function PauseButton({
  id,
  icon,
  label,
  accent,
  onClick,
  touch,
}: {
  id: string;
  icon: string;
  label: string;
  accent: string;
  onClick: () => void;
  touch: boolean;
}) {
  const base: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: touch ? '13px 18px' : '15px 22px',
    fontSize: touch ? 16 : 18,
    fontWeight: 800,
    color: '#fff',
    background: `linear-gradient(160deg, ${accent}30 0%, ${accent}12 100%)`,
    border: `2px solid ${accent}66`,
    borderRadius: 14,
    cursor: 'pointer',
    fontFamily: SG.font,
    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
    transition: 'all 0.2s cubic-bezier(0.22,1,0.36,1)',
    letterSpacing: 1,
    boxSizing: 'border-box',
  };
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      style={base}
      onMouseEnter={(e) => {
        const btn = e.currentTarget;
        btn.style.background = `linear-gradient(160deg, ${accent}48 0%, ${accent}1f 100%)`;
        btn.style.borderColor = accent;
        btn.style.boxShadow = `0 8px 26px ${accent}40`;
        btn.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        const btn = e.currentTarget;
        btn.style.background = `linear-gradient(160deg, ${accent}30 0%, ${accent}12 100%)`;
        btn.style.borderColor = `${accent}66`;
        btn.style.boxShadow = '0 4px 16px rgba(0,0,0,0.28)';
        btn.style.transform = 'translateY(0)';
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: touch ? 30 : 34,
          height: touch ? 30 : 34,
          borderRadius: 10,
          background: `${accent}26`,
          border: `1px solid ${accent}55`,
          fontSize: touch ? 15 : 17,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function PauseScreen({ onOpenSettings }: PauseScreenProps) {
  const phase = useGameStore((s) => s.phase);
  const togglePause = useGameStore((s) => s.togglePause);
  const returnToMenu = useGameStore((s) => s.returnToMenu);
  const leave = useMultiplayerStore((s) => s.leave);
  const isTouch = isTouchDevice();

  // ESCキーでポーズ切り替え（クラフト等のUIが先に閉じた場合は defaultPrevented で抑制）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      const currentPhase = useGameStore.getState().phase;
      if (currentPhase === 'playing' || currentPhase === 'paused') {
        togglePause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePause]);

  // ポーズ時にPointerLockを解除
  useEffect(() => {
    if (phase === 'paused' && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [phase]);

  // 再開ハンドラ
  const handleResume = useCallback(() => {
    togglePause();
    // デスクトップではPointerLockを再取得
    if (!isTouch) {
      setTimeout(() => {
        activateDesktopGameplayInput();
      }, 100);
    }
  }, [togglePause, isTouch]);

  // タイトルに戻るハンドラ
  const handleReturnToMenu = useCallback(() => {
    // マルチプレイから切断
    leave();
    // ゲーム状態をメニューに戻す
    returnToMenu();
  }, [leave, returnToMenu]);

  if (phase !== 'paused') return null;

  return (
    <div
      id="pause-screen"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 250,
        background: 'rgba(4, 7, 12, 0.68)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'pauseFadeIn 0.2s ease-out',
        fontFamily: SG.font,
      }}
    >
      {/* 中央パネル */}
      <div
        style={{
          width: isTouch ? 280 : 340,
          maxWidth: 'calc(100vw - 32px)',
          padding: isTouch ? '22px 20px 18px' : '28px 26px 22px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'rgba(11,15,23,0.7)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 22,
          boxShadow: 'var(--sg-shadow)',
          animation: 'pauseSlideIn 0.3s ease-out',
        }}
      >
        {/* タイトル */}
        <div
          style={{
            fontSize: isTouch ? 26 : 32,
            fontWeight: 900,
            color: '#fff',
            letterSpacing: 4,
            textShadow: '0 0 22px rgba(100, 200, 255, 0.4), 0 2px 5px rgba(0,0,0,0.7)',
          }}
        >
          ⏸ ポーズ中
        </div>
        <div
          style={{
            color: SG.textFaint,
            fontSize: isTouch ? 10 : 11,
            fontWeight: 700,
            letterSpacing: 5,
            marginTop: 4,
          }}
        >
          HALCRAFT
        </div>

        {/* 区切り線 */}
        <div
          style={{
            width: '100%',
            height: 1,
            margin: isTouch ? '16px 0 16px' : '20px 0 20px',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
          }}
        />

        {/* メニューボタン群 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: isTouch ? 10 : 12,
            width: '100%',
          }}
        >
          <PauseButton id="pause-resume-btn" icon="▶" label="再開する" accent={SG.emerald} onClick={handleResume} touch={isTouch} />
          <PauseButton id="pause-settings-btn" icon="⚙" label="設定" accent={SG.build} onClick={onOpenSettings} touch={isTouch} />
          <PauseButton id="pause-return-btn" icon="🏠" label="タイトルに戻る" accent="#8a93a6" onClick={handleReturnToMenu} touch={isTouch} />
        </div>

        {/* 操作ヒント */}
        <div
          style={{
            marginTop: isTouch ? 16 : 20,
            color: 'rgba(255, 255, 255, 0.34)',
            fontSize: isTouch ? 11 : 12,
            letterSpacing: 1,
            fontWeight: 600,
          }}
        >
          {isTouch ? 'タップでえらぶ' : 'ESC キーでも再開できるよ'}
        </div>
      </div>
    </div>
  );
}
