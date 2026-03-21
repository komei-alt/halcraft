// スタート画面コンポーネント
// クリックでゲーム開始 + PointerLock

import { useGameStore } from '../../stores/useGameStore';

export function StartScreen() {
  const phase = useGameStore((s) => s.phase);
  const startGame = useGameStore((s) => s.startGame);

  if (phase !== 'menu') return null;

  return (
    <div
      id="start-screen"
      onClick={startGame}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        zIndex: 200,
        cursor: 'pointer',
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
      }}
    >
      {/* タイトル */}
      <h1
        style={{
          fontSize: 72,
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
          fontSize: 18,
          color: 'rgba(255,255,255,0.6)',
          marginTop: 12,
          letterSpacing: 4,
        }}
      >
        HALCRAFT
      </p>

      {/* 開始ボタン */}
      <div
        style={{
          marginTop: 48,
          padding: '16px 48px',
          background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: 8,
          color: '#fff',
          fontSize: 20,
          letterSpacing: 2,
          animation: 'pulse 2s ease-in-out infinite',
        }}
      >
        クリックでスタート
      </div>

      {/* 操作説明 */}
      <div
        style={{
          marginTop: 40,
          display: 'flex',
          gap: 24,
          color: 'rgba(255,255,255,0.4)',
          fontSize: 13,
        }}
      >
        <span>WASD — 移動</span>
        <span>Space — ジャンプ</span>
        <span>左クリック — 破壊</span>
        <span>右クリック — 設置</span>
        <span>1-9 — ブロック選択</span>
      </div>
    </div>
  );
}
