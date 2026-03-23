// スタート画面コンポーネント
// 名前入力 + クリック/タップでゲーム開始 + マルチプレイ接続
// デバイスに応じて操作説明を切り替え

import { useState, useCallback } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { isTouchDevice, requestFullscreen } from '../../utils/device';
import { InstallBanner } from './mobile/InstallBanner';

export function StartScreen() {
  const phase = useGameStore((s) => s.phase);
  const startGame = useGameStore((s) => s.startGame);
  const join = useMultiplayerStore((s) => s.join);
  const serverFull = useMultiplayerStore((s) => s.serverFull);

  const [name, setName] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const isTouch = isTouchDevice();
  const isValidName = name.trim().length >= 1 && name.trim().length <= 8;

  const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // 入力フィールドのクリックでゲーム開始しないようにする
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (!isValidName || isJoining) return;

    setIsJoining(true);
    const trimmedName = name.trim();

    // ゲーム開始 + マルチプレイ接続
    // フルスクリーンを試みる（対応ブラウザのみ）
    requestFullscreen();

    startGame();
    join(trimmedName);
  }, [isValidName, isJoining, name, startGame, join]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValidName && !isJoining) {
      setIsJoining(true);
      const trimmedName = name.trim();
      requestFullscreen();
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
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        zIndex: 200,
        cursor: isValidName ? 'pointer' : 'default',
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
        padding: '0 20px',
      }}
    >
      {/* タイトル */}
      <h1
        style={{
          fontSize: isTouch ? 48 : 72,
          fontWeight: 900,
          color: '#fff',
          textShadow: '0 0 40px rgba(66, 165, 245, 0.6), 0 4px 8px rgba(0,0,0,0.5)',
          margin: 0,
          letterSpacing: 8,
        }}
      >
        ハルクラ
      </h1>

      {/* サブタイトル */}
      <p
        style={{
          fontSize: isTouch ? 14 : 18,
          color: 'rgba(255,255,255,0.6)',
          marginTop: 12,
          letterSpacing: 4,
        }}
      >
        HALCRAFT
      </p>

      {/* 名前入力 */}
      <div
        style={{
          marginTop: 40,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <label
          style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: isTouch ? 13 : 15,
            letterSpacing: 2,
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
            background: 'rgba(255,255,255,0.08)',
            border: '2px solid',
            borderColor: isValidName
              ? 'rgba(66, 165, 245, 0.6)'
              : 'rgba(255,255,255,0.15)',
            borderRadius: 10,
            color: '#fff',
            outline: 'none',
            letterSpacing: 4,
            transition: 'border-color 0.3s, box-shadow 0.3s',
            boxShadow: isValidName
              ? '0 0 20px rgba(66, 165, 245, 0.2)'
              : 'none',
            fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
          }}
        />
        <span
          style={{
            color: 'rgba(255,255,255,0.3)',
            fontSize: 11,
          }}
        >
          {name.trim().length}/8
        </span>
      </div>

      {/* サーバー満員表示 */}
      {serverFull && (
        <div
          style={{
            marginTop: 16,
            padding: '8px 20px',
            background: 'rgba(231, 76, 60, 0.2)',
            border: '1px solid rgba(231, 76, 60, 0.4)',
            borderRadius: 6,
            color: '#e74c3c',
            fontSize: 14,
          }}
        >
          サーバーが満員です（最大10人）
        </div>
      )}

      {/* 開始ボタン */}
      <div
        style={{
          marginTop: 24,
          padding: isTouch ? '14px 36px' : '16px 48px',
          background: isValidName
            ? 'rgba(66, 165, 245, 0.2)'
            : 'rgba(255,255,255,0.05)',
          border: '1px solid',
          borderColor: isValidName
            ? 'rgba(66, 165, 245, 0.5)'
            : 'rgba(255,255,255,0.1)',
          borderRadius: 8,
          color: isValidName ? '#fff' : 'rgba(255,255,255,0.3)',
          fontSize: isTouch ? 16 : 20,
          letterSpacing: 2,
          animation: isValidName ? 'pulse 2s ease-in-out infinite' : 'none',
          transition: 'all 0.3s',
          pointerEvents: isValidName ? 'auto' : 'none',
        }}
      >
        {isJoining ? '接続中...' : (isTouch ? 'タップでスタート' : 'クリックでスタート')}
      </div>

      {/* 操作説明 */}
      <div
        style={{
          marginTop: 32,
          display: 'flex',
          flexDirection: isTouch ? 'column' : 'row',
          gap: isTouch ? 8 : 24,
          alignItems: 'center',
          color: 'rgba(255,255,255,0.4)',
          fontSize: isTouch ? 12 : 13,
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
  );
}
