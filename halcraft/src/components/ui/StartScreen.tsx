// スタート画面コンポーネント
// ハルが描いたタイトル画像を背景に使用
// 名前入力 + ステージ選択 + クリック/タップでゲーム開始
// デバイスに応じて操作説明を切り替え

import { useState, useCallback, useEffect } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { isTouchDevice, requestFullscreen } from '../../utils/device';
import { initAudio } from '../../utils/sounds';
import { initPushIfPWA } from '../../utils/pushNotifications';
import { InstallBanner } from './mobile/InstallBanner';
import { UpdateLog } from './UpdateLog';
import { SkinSelector } from './SkinSelector';
import { STAGES } from '../../types/stages';

/** localStorage のキー */
const PLAYER_NAME_KEY = 'halcraft-player-name';
const SELECTED_STAGE_KEY = 'halcraft-selected-stage';

export function StartScreen() {
  const phase = useGameStore((s) => s.phase);
  const startGame = useGameStore((s) => s.startGame);
  const setStage = useGameStore((s) => s.setStage);
  const join = useMultiplayerStore((s) => s.join);
  const serverFull = useMultiplayerStore((s) => s.serverFull);

  const [name, setName] = useState(() => {
    try { return localStorage.getItem(PLAYER_NAME_KEY) || ''; } catch { return ''; }
  });
  const [selectedStageId, setSelectedStageId] = useState(() => {
    try { return localStorage.getItem(SELECTED_STAGE_KEY) || STAGES[0].id; } catch { return STAGES[0].id; }
  });
  const [isJoining, setIsJoining] = useState(false);
  const [stagePlayerCounts, setStagePlayerCounts] = useState<Record<string, number>>({});

  const isTouch = isTouchDevice();
  const isValidName = name.trim().length >= 1 && name.trim().length <= 8;

  // 定期的にステージのプレイヤー数を取得
  useEffect(() => {
    if (phase !== 'menu') return;

    let mounted = true;
    const fetchStages = async () => {
      try {
        // 注: utils/socket.ts がない場合は /api/stages (プロキシ設定済であれば) を利用
        const res = await fetch('/api/stages');
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.stages) {
            const counts: Record<string, number> = {};
            data.stages.forEach((s: any) => {
              counts[s.id] = s.playerCount;
            });
            setStagePlayerCounts(counts);
          }
        }
      } catch (err) {
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
    } catch { /* noop */ }

    // ゲーム開始 + マルチプレイ接続
    requestFullscreen();
    initAudio();
    initPushIfPWA().catch(() => { /* noop */ });

    setStage(selectedStageId);
    startGame();
    join(trimmedName, selectedStageId);
  }, [isValidName, isJoining, name, selectedStageId, setStage, startGame, join]);

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
        alignItems: 'center',
        justifyContent: 'flex-end',
        zIndex: 200,
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
          height: '60%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 40%, transparent 100%)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* 左側グラデーション（アップデートログの可読性向上） */}
      {!isTouch && (
        <div
          style={{
            position: 'absolute',
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

      {/* UI コンテンツ（下寄せ） */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingBottom: isTouch ? 20 : 40,
          gap: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ステージ選択UI */}
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 600 }}>
          {STAGES.map((stage) => {
            const isSelected = selectedStageId === stage.id;
            const players = stagePlayerCounts[stage.id] || 0;
            return (
              <div
                key={stage.id}
                onClick={() => setSelectedStageId(stage.id)}
                style={{
                  width: 140,
                  padding: '8px 12px',
                  background: isSelected ? 'rgba(50, 180, 50, 0.4)' : 'rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(8px)',
                  border: '2px solid',
                  borderColor: isSelected ? 'rgba(100, 220, 100, 0.8)' : 'rgba(255,255,255,0.2)',
                  borderRadius: 12,
                  color: isSelected ? '#fff' : 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  boxShadow: isSelected ? '0 0 15px rgba(100,220,100,0.4)' : 'none',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 'bold' }}>{stage.name}</div>
                <div style={{ fontSize: 10, opacity: 0.8 }}>ミッション:<br/>{stage.mission.title}</div>
                <div style={{ fontSize: 11, marginTop: 4, color: players > 0 ? '#4caf50' : 'rgba(255,255,255,0.4)' }}>
                  {players > 0 ? `🟢 ${players}人がプレイ中` : '○ 誰もいない'}
                </div>
              </div>
            );
          })}
        </div>

        {/* 名前入力 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
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

        {/* スキン選択 */}
        <div
          style={{ marginTop: 12 }}
        >
          <SkinSelector compact />
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
          onClick={handleStart}
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
            cursor: isValidName ? 'pointer' : 'default',
          }}
        >
          {isJoining ? '接続中...' : (isTouch ? 'タップでスタート' : 'クリックでスタート')}
        </div>

        {/* 操作説明 */}
        <div
          style={{
            marginTop: 20,
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
              <span>F — ✈ 飛行機にのる</span>
            </>
          )}
        </div>

        {/* iOS Safari用：ホーム画面に追加の案内バナー */}
        <InstallBanner />
      </div>
    </div>
  );
}
