// スタート画面コンポーネント
// ハルが描いたタイトル画像を背景に使用
// 名前入力 + クリック/タップでゲーム開始 + マルチプレイ接続
// デバイスに応じて操作説明を切り替え

import { useState, useCallback } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { isTouchDevice, requestFullscreen } from '../../utils/device';
import { initAudio } from '../../utils/sounds';
import { InstallBanner } from './mobile/InstallBanner';

/** localStorage のキー */
const PLAYER_NAME_KEY = 'halcraft-player-name';

export function StartScreen() {
  const phase = useGameStore((s) => s.phase);
  const startGame = useGameStore((s) => s.startGame);
  const join = useMultiplayerStore((s) => s.join);
  const serverFull = useMultiplayerStore((s) => s.serverFull);

  const [name, setName] = useState(() => {
    try { return localStorage.getItem(PLAYER_NAME_KEY) || ''; } catch { return ''; }
  });
  const [isJoining, setIsJoining] = useState(false);

  const isTouch = isTouchDevice();
  const isValidName = name.trim().length >= 1 && name.trim().length <= 8;

  const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // 入力フィールドのクリックでゲーム開始しないようにする
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (!isValidName || isJoining) return;

    setIsJoining(true);
    const trimmedName = name.trim();
    try { localStorage.setItem(PLAYER_NAME_KEY, trimmedName); } catch { /* noop */ }

    // ゲーム開始 + マルチプレイ接続
    // フルスクリーンを試みる（対応ブラウザのみ）
    requestFullscreen();

    // サウンドエンジン初期化（ユーザーインタラクション時に必要）
    initAudio();

    startGame();
    join(trimmedName);
  }, [isValidName, isJoining, name, startGame, join]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValidName && !isJoining) {
      setIsJoining(true);
      const trimmedName = name.trim();
      try { localStorage.setItem(PLAYER_NAME_KEY, trimmedName); } catch { /* noop */ }
      requestFullscreen();
      initAudio();
      startGame();
      join(trimmedName);
    }
  }, [isValidName, isJoining, name, startGame, join]);

  if (phase !== 'menu') return null;

  return (
    <div
      id="start-screen"
      onClick={handleStart}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        zIndex: 200,
        cursor: isValidName ? 'pointer' : 'default',
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
        padding: 0,
        overflow: 'hidden',
      }}
    >
      {/* ハルが描いたタイトル画像（背景全面） */}
      <img
        src="/textures/title.jpg"
        alt="ハルクラ タイトル"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          zIndex: 0,
        }}
        draggable={false}
      />

      {/* 下部グラデーション（UIを読みやすくする） */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '50%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* UI コンテンツ（下寄せ） */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingBottom: isTouch ? 40 : 60,
          gap: 0,
        }}
      >
        {/* 名前入力 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <label
            style={{
              color: 'rgba(255,255,255,0.8)',
              fontSize: isTouch ? 13 : 15,
              letterSpacing: 2,
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            }}
          >
            なまえを入力してね
          </label>
          <input
            id="player-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 8))}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            placeholder="ハル"
            maxLength={8}
            autoComplete="off"
            autoFocus={!isTouch}
            style={{
              width: isTouch ? 200 : 240,
              padding: '12px 16px',
              fontSize: isTouch ? 18 : 22,
              fontWeight: 700,
              textAlign: 'center',
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '2px solid',
              borderColor: isValidName
                ? 'rgba(100, 220, 100, 0.7)'
                : 'rgba(255,255,255,0.2)',
              borderRadius: 10,
              color: '#fff',
              outline: 'none',
              letterSpacing: 4,
              transition: 'border-color 0.3s, box-shadow 0.3s',
              boxShadow: isValidName
                ? '0 0 20px rgba(100, 220, 100, 0.3)'
                : 'none',
              fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
            }}
          />
          <span
            style={{
              color: 'rgba(255,255,255,0.4)',
              fontSize: 11,
              textShadow: '0 1px 2px rgba(0,0,0,0.6)',
            }}
          >
            {name.trim().length}/8
          </span>
        </div>

        {/* サーバー満員表示 */}
        {serverFull && (
          <div
            style={{
              marginTop: 12,
              padding: '8px 20px',
              background: 'rgba(231, 76, 60, 0.3)',
              backdropFilter: 'blur(4px)',
              border: '1px solid rgba(231, 76, 60, 0.5)',
              borderRadius: 6,
              color: '#ff6b6b',
              fontSize: 14,
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            サーバーが満員です（最大10人）
          </div>
        )}

        {/* 開始ボタン */}
        <div
          style={{
            marginTop: 20,
            padding: isTouch ? '14px 36px' : '16px 48px',
            background: isValidName
              ? 'rgba(50, 180, 50, 0.35)'
              : 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(4px)',
            border: '2px solid',
            borderColor: isValidName
              ? 'rgba(100, 220, 100, 0.6)'
              : 'rgba(255,255,255,0.1)',
            borderRadius: 10,
            color: isValidName ? '#fff' : 'rgba(255,255,255,0.3)',
            fontSize: isTouch ? 16 : 20,
            fontWeight: 700,
            letterSpacing: 3,
            animation: isValidName ? 'pulse 2s ease-in-out infinite' : 'none',
            transition: 'all 0.3s',
            pointerEvents: isValidName ? 'auto' : 'none',
            textShadow: isValidName ? '0 1px 4px rgba(0,0,0,0.6)' : 'none',
          }}
        >
          {isJoining ? '接続中...' : (isTouch ? 'タップでスタート' : 'クリックでスタート')}
        </div>

        {/* 操作説明 */}
        <div
          style={{
            marginTop: 24,
            display: 'flex',
            flexDirection: isTouch ? 'column' : 'row',
            gap: isTouch ? 6 : 20,
            alignItems: 'center',
            color: 'rgba(255,255,255,0.5)',
            fontSize: isTouch ? 11 : 12,
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          }}
        >
          {isTouch ? (
            <>
              <span>左スティック — 移動</span>
              <span>右スワイプ — 視点</span>
              <span>タップ — 破壊/設置</span>
              <span>▲ ボタン — ジャンプ</span>
            </>
          ) : (
            <>
              <span>WASD — 移動</span>
              <span>Space — ジャンプ</span>
              <span>左クリック — 破壊</span>
              <span>右クリック — 設置</span>
              <span>1-9 — ブロック選択</span>
            </>
          )}
        </div>

        {/* iOS Safari用：ホーム画面に追加の案内バナー */}
        <InstallBanner />
      </div>
    </div>
  );
}
