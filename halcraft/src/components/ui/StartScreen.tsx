// スタート画面コンポーネント
// ハルが描いたタイトル画像を背景に使用
// 名前入力 + ステージ選択 + クリック/タップでゲーム開始
// デバイスに応じて操作説明を切り替え
// スマホ縦・横両対応（スクロール可能）

import { useState, useCallback, useEffect } from 'react';
import { useGameStore, type GameMode } from '../../stores/useGameStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { isTouchDevice, requestFullscreen } from '../../utils/device';
import { activateDesktopGameplayInput } from '../../utils/gameCanvas';
import { initAudio } from '../../utils/sounds';
import { initPushIfPWA } from '../../utils/pushNotifications';
import { InstallBanner } from './mobile/InstallBanner';
import { UpdateLog } from './UpdateLog';
import { SkinSelector } from './SkinSelector';
import { STAGES } from '../../types/stages';

/** localStorage のキー */
const PLAYER_NAME_KEY = 'halcraft-player-name';
const SELECTED_STAGE_KEY = 'halcraft-selected-stage';
const SELECTED_GAME_MODE_KEY = 'halcraft-selected-game-mode';

const GAME_MODE_OPTIONS: Array<{
  id: GameMode;
  name: string;
  caption: string;
}> = [
  { id: 'survival', name: 'サバイバル', caption: 'HPあり・夜の敵あり' },
  { id: 'creative', name: 'クリエイティブ', caption: '二段ジャンプで空中建築' },
];

function loadGameMode(): GameMode {
  try {
    const saved = localStorage.getItem(SELECTED_GAME_MODE_KEY);
    if (saved === 'survival' || saved === 'creative') return saved;
  } catch { /* noop */ }
  return 'survival';
}

function extractStagePlayerCounts(payload: unknown): Record<string, number> | null {
  if (!payload || typeof payload !== 'object') return null;

  const { stages } = payload as { stages?: unknown };
  if (!Array.isArray(stages)) return null;

  const counts: Record<string, number> = {};
  for (const stage of stages) {
    if (!stage || typeof stage !== 'object') return null;

    const { id, playerCount } = stage as {
      id?: unknown;
      playerCount?: unknown;
    };

    if (typeof id !== 'string' || typeof playerCount !== 'number' || !Number.isFinite(playerCount)) {
      return null;
    }

    counts[id] = playerCount;
  }

  return counts;
}

export function StartScreen() {
  const phase = useGameStore((s) => s.phase);
  const startGame = useGameStore((s) => s.startGame);
  const setStage = useGameStore((s) => s.setStage);
  const setGameMode = useGameStore((s) => s.setGameMode);
  const join = useMultiplayerStore((s) => s.join);
  const serverFull = useMultiplayerStore((s) => s.serverFull);

  const [name, setName] = useState(() => {
    try { return localStorage.getItem(PLAYER_NAME_KEY) || ''; } catch { return ''; }
  });
  const [selectedStageId, setSelectedStageId] = useState(() => {
    try { return localStorage.getItem(SELECTED_STAGE_KEY) || STAGES[0].id; } catch { return STAGES[0].id; }
  });
  const [selectedGameMode, setSelectedGameMode] = useState<GameMode>(loadGameMode);
  const [isJoining, setIsJoining] = useState(false);
  const [stagePlayerCounts, setStagePlayerCounts] = useState<Record<string, number>>({});

  const isTouch = isTouchDevice();
  const isValidName = name.trim().length >= 1 && name.trim().length <= 8;

  // 定期的にステージのプレイヤー数を取得
  useEffect(() => {
    if (phase !== 'menu') return;

    // Socket.IO サーバーと同じ URL を使用（Nginx ではなく Express API へ直接リクエスト）
    const serverUrl = import.meta.env.PROD
      ? 'https://halcraft-ws.rosch.jp'
      : `http://${window.location.hostname}:4001`;

    let mounted = true;
    const fetchStages = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/stages`);
        if (!res.ok) return;

        const data: unknown = await res.json();
        const counts = extractStagePlayerCounts(data);
        if (mounted && counts) {
          setStagePlayerCounts(counts);
        }
      } catch {
        // 無視
      }
    };

    fetchStages();
    const interval = setInterval(fetchStages, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [phase]);

  const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent | React.KeyboardEvent) => {
    // 入力フィールドのクリックでゲーム開始しないようにする
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (!isValidName || isJoining) return;

    setIsJoining(true);
    const trimmedName = name.trim();
    try { 
      localStorage.setItem(PLAYER_NAME_KEY, trimmedName); 
      localStorage.setItem(SELECTED_STAGE_KEY, selectedStageId); 
      localStorage.setItem(SELECTED_GAME_MODE_KEY, selectedGameMode);
    } catch { /* noop */ }

    // ゲーム開始 + マルチプレイ接続
    requestFullscreen();
    initAudio();
    initPushIfPWA().catch(() => { /* noop */ });

    setStage(selectedStageId);
    setGameMode(selectedGameMode);
    startGame();
    join(trimmedName, selectedStageId);

    // メニューのクリック直後に canvas をアクティブ化して操作不能に見える状態を防ぐ
    window.requestAnimationFrame(() => {
      activateDesktopGameplayInput();
      window.setTimeout(() => {
        activateDesktopGameplayInput();
      }, 120);
    });
  }, [isValidName, isJoining, name, selectedGameMode, selectedStageId, setGameMode, setStage, startGame, join]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleStart(e);
    }
  }, [handleStart]);

  if (phase !== 'menu') return null;

  return (
    <div
      id="start-screen"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 200,
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
        padding: 0,
        /* モバイルでスクロール可能にする */
        overflowX: 'hidden',
        overflowY: 'auto',
      }}
    >
      {/* ハルが描いたタイトル画像（背景全面・スクロールに追従しない） */}
      <img
        src="/textures/title.jpg"
        alt="ハルクラ タイトル"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          zIndex: 0,
          pointerEvents: 'none',
        }}
        draggable={false}
      />

      {/* 下部グラデーション（UIを読みやすくする） */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '70%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 40%, transparent 100%)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* 左側グラデーション（アップデートログの可読性向上） */}
      {!isTouch && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            width: '35%',
            background: 'linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* アップデート履歴パネル（デスクトップのみ） */}
      {!isTouch && <UpdateLog />}

      {/* スペーサー：コンテンツが少ない場合に下寄せする */}
      <div style={{ flexGrow: 1, minHeight: isTouch ? 80 : 120 }} />

      {/* UI コンテンツ */}
      <div
        id="start-screen-content"
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingBottom: isTouch ? 24 : 40,
          paddingLeft: isTouch ? 12 : 0,
          paddingRight: isTouch ? 12 : 0,
          gap: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ステージ選択UI */}
        <div
          id="start-screen-stages"
          style={{
            marginBottom: isTouch ? 12 : 16,
            display: 'flex',
            flexDirection: 'row',
            gap: isTouch ? 8 : 12,
            flexWrap: 'wrap',
            justifyContent: 'center',
            maxWidth: isTouch ? 340 : 600,
          }}
        >
          {STAGES.map((stage) => {
            const isSelected = selectedStageId === stage.id;
            const players = stagePlayerCounts[stage.id] || 0;
            return (
              <div
                key={stage.id}
                onClick={() => setSelectedStageId(stage.id)}
                style={{
                  width: isTouch ? 100 : 140,
                  padding: isTouch ? '6px 8px' : '8px 12px',
                  background: isSelected ? 'rgba(50, 180, 50, 0.4)' : 'rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(8px)',
                  border: '2px solid',
                  borderColor: isSelected ? 'rgba(100, 220, 100, 0.8)' : 'rgba(255,255,255,0.2)',
                  borderRadius: isTouch ? 10 : 12,
                  color: isSelected ? '#fff' : 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  boxShadow: isSelected ? '0 0 15px rgba(100,220,100,0.4)' : 'none',
                }}
              >
                <div style={{ fontSize: isTouch ? 11 : 13, fontWeight: 'bold' }}>{stage.name}</div>
                <div style={{ fontSize: isTouch ? 9 : 10, opacity: 0.8, lineHeight: 1.3 }}>
                  ミッション:<br/>{stage.mission.title}
                </div>
                <div style={{
                  fontSize: isTouch ? 9 : 11,
                  marginTop: 2,
                  color: players > 0 ? '#4caf50' : 'rgba(255,255,255,0.4)',
                }}>
                  {players > 0 ? `🟢 ${players}人` : '○ 0人'}
                </div>
              </div>
            );
          })}
        </div>

        {/* ゲームモード選択UI */}
        <div
          style={{
            marginBottom: isTouch ? 10 : 16,
            display: 'flex',
            flexDirection: 'row',
            gap: isTouch ? 8 : 10,
            flexWrap: 'wrap',
            justifyContent: 'center',
            maxWidth: 460,
          }}
        >
          {GAME_MODE_OPTIONS.map((mode) => {
            const isSelected = selectedGameMode === mode.id;
            const isCreative = mode.id === 'creative';
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setSelectedGameMode(mode.id)}
                style={{
                  width: isTouch ? 150 : 200,
                  padding: isTouch ? '7px 10px' : '10px 14px',
                  background: isSelected
                    ? isCreative
                      ? 'rgba(80, 170, 255, 0.36)'
                      : 'rgba(50, 180, 50, 0.36)'
                    : 'rgba(0,0,0,0.48)',
                  backdropFilter: 'blur(8px)',
                  border: '2px solid',
                  borderColor: isSelected
                    ? isCreative
                      ? 'rgba(130, 210, 255, 0.82)'
                      : 'rgba(100, 220, 100, 0.82)'
                    : 'rgba(255,255,255,0.18)',
                  borderRadius: 8,
                  color: isSelected ? '#fff' : 'rgba(255,255,255,0.68)',
                  cursor: 'pointer',
                  transition: 'background 0.2s, border-color 0.2s, color 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 3,
                  boxShadow: isSelected
                    ? isCreative
                      ? '0 0 16px rgba(100,190,255,0.34)'
                      : '0 0 16px rgba(100,220,100,0.34)'
                    : 'none',
                  fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: isTouch ? 13 : 15, fontWeight: 800 }}>{mode.name}</span>
                <span style={{ fontSize: isTouch ? 10 : 11, opacity: 0.82 }}>{mode.caption}</span>
              </button>
            );
          })}
        </div>

        {/* 名前入力 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <label
            style={{
              color: 'rgba(255,255,255,0.8)',
              fontSize: isTouch ? 12 : 15,
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
            placeholder="ハル"
            maxLength={8}
            autoComplete="off"
            autoFocus={!isTouch}
            style={{
              width: isTouch ? 180 : 240,
              padding: isTouch ? '10px 14px' : '12px 16px',
              fontSize: isTouch ? 16 : 22,
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
              fontSize: 10,
              textShadow: '0 1px 2px rgba(0,0,0,0.6)',
            }}
          >
            {name.trim().length}/8
          </span>
        </div>

        {/* スキン選択 */}
        <div style={{ marginTop: isTouch ? 8 : 12 }}>
          <SkinSelector compact />
        </div>

        {/* サーバー満員表示 */}
        {serverFull && (
          <div
            style={{
              marginTop: 10,
              padding: '6px 16px',
              background: 'rgba(231, 76, 60, 0.3)',
              backdropFilter: 'blur(4px)',
              border: '1px solid rgba(231, 76, 60, 0.5)',
              borderRadius: 6,
              color: '#ff6b6b',
              fontSize: isTouch ? 12 : 14,
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            サーバーが満員です（最大10人）
          </div>
        )}

        {/* 開始ボタン */}
        <div
          onClick={handleStart}
          style={{
            marginTop: isTouch ? 14 : 20,
            padding: isTouch ? '12px 32px' : '16px 48px',
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
            fontSize: isTouch ? 15 : 20,
            fontWeight: 700,
            letterSpacing: 3,
            animation: isValidName ? 'pulse 2s ease-in-out infinite' : 'none',
            transition: 'all 0.3s',
            pointerEvents: isValidName ? 'auto' : 'none',
            textShadow: isValidName ? '0 1px 4px rgba(0,0,0,0.6)' : 'none',
            cursor: isValidName ? 'pointer' : 'default',
          }}
        >
          {isJoining ? '接続中...' : (isTouch ? 'タップでスタート' : 'クリックでスタート')}
        </div>

        {/* 操作説明 */}
        <div
          style={{
            marginTop: isTouch ? 12 : 20,
            display: 'flex',
            flexDirection: isTouch ? 'column' : 'row',
            gap: isTouch ? 4 : 20,
            alignItems: 'center',
            color: 'rgba(255,255,255,0.5)',
            fontSize: isTouch ? 10 : 12,
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          }}
        >
          {isTouch ? (
            <>
              <span>左スティック — 移動</span>
              <span>右スワイプ — 視点</span>
              <span>タップ — 破壊/設置</span>
              <span>▲ ボタン — ジャンプ / 2回で飛行</span>
            </>
          ) : (
            <>
              <span>WASD — 移動</span>
              <span>Space — ジャンプ</span>
              <span>Creative: Space×2 — 飛行</span>
              <span>左クリック — 破壊</span>
              <span>右クリック — 設置</span>
              <span>V — 武器切替</span>
              <span>1-9 — ブロック選択</span>
              <span>F — ✈ 飛行機にのる</span>
            </>
          )}
        </div>

        {/* iOS Safari用：ホーム画面に追加の案内バナー */}
        <div style={{ marginTop: isTouch ? 12 : 16, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <InstallBanner />
        </div>

        {/* 下端の余白（Safe Area対応） */}
        <div style={{ height: 'env(safe-area-inset-bottom, 16px)', minHeight: 16 }} />
      </div>
    </div>
  );
}
