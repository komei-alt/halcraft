// ============================================
// VoiceChatUI — ボイスチャットの操作パネル
// マイクON/OFF / ミュート / 発話インジケーター
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { voiceChat } from '../../utils/voiceChat';
import type { VoiceChatState } from '../../utils/voiceChat';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { useGameStore } from '../../stores/useGameStore';
import { isTouchDevice } from '../../utils/device';

export function VoiceChatUI() {
  const phase = useGameStore((s) => s.phase);
  const connected = useMultiplayerStore((s) => s.connected);

  const [vcState, setVcState] = useState<VoiceChatState>('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTouch = isTouchDevice();

  // コールバックを設定
  useEffect(() => {
    voiceChat.setCallbacks({
      onStateChange: (state) => setVcState(state),
      onSpeakingChange: (speaking) => setIsSpeaking(speaking),
      onRemoteSpeaking: (playerId, speaking) => {
        // リモートプレイヤーの発話状態を useMultiplayerStore に反映
        useMultiplayerStore.getState().setRemoteSpeaking(playerId, speaking);
      },
      onError: (err) => {
        setError(err);
        // 3秒後にエラーをクリア
        setTimeout(() => setError(null), 5000);
      },
    });

    return () => {
      voiceChat.leave();
    };
  }, []);

  // ボイスチャットに参加/退出
  const handleToggleVoice = useCallback(() => {
    if (vcState === 'connected') {
      voiceChat.leave();
    } else if (vcState === 'disconnected' || vcState === 'error') {
      voiceChat.join();
    }
  }, [vcState]);

  // ミュートトグル
  const handleToggleMute = useCallback(() => {
    const newMuted = voiceChat.toggleMute();
    setIsMuted(newMuted);
  }, []);

  // ゲームプレイ中 + マルチプレイ接続中のみ表示
  if (phase !== 'playing' || !connected) return null;

  return (
    <div
      id="voice-chat-panel"
      style={{
        position: 'fixed',
        top: isTouch ? 12 : 16,
        right: isTouch ? 12 : 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        zIndex: 120,
        pointerEvents: 'auto',
      }}
    >
      {/* エラーメッセージ */}
      {error && (
        <div
          style={{
            padding: '6px 12px',
            background: 'rgba(231, 76, 60, 0.85)',
            borderRadius: 6,
            color: '#fff',
            fontSize: 12,
            maxWidth: 200,
            textAlign: 'right',
            backdropFilter: 'blur(4px)',
          }}
        >
          {error}
        </div>
      )}

      {/* ボタンの行 */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* ミュートボタン（VC接続中のみ） */}
        {vcState === 'connected' && (
          <button
            id="voice-mute-button"
            onClick={handleToggleMute}
            style={{
              width: isTouch ? 44 : 40,
              height: isTouch ? 44 : 40,
              borderRadius: '50%',
              border: 'none',
              background: isMuted
                ? 'rgba(231, 76, 60, 0.8)'
                : 'rgba(255,255,255,0.15)',
              color: '#fff',
              fontSize: isTouch ? 18 : 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
              backdropFilter: 'blur(8px)',
            }}
            title={isMuted ? 'ミュート解除' : 'ミュート'}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
        )}

        {/* マイクON/OFFボタン */}
        <button
          id="voice-toggle-button"
          onClick={handleToggleVoice}
          disabled={vcState === 'connecting'}
          style={{
            width: isTouch ? 48 : 44,
            height: isTouch ? 48 : 44,
            borderRadius: '50%',
            border: '2px solid',
            borderColor: vcState === 'connected'
              ? (isSpeaking ? '#2ecc71' : '#3498db')
              : 'rgba(255,255,255,0.2)',
            background: vcState === 'connected'
              ? (isSpeaking
                ? 'rgba(46, 204, 113, 0.3)'
                : 'rgba(52, 152, 219, 0.3)')
              : 'rgba(0,0,0,0.4)',
            color: '#fff',
            fontSize: isTouch ? 22 : 20,
            cursor: vcState === 'connecting' ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s',
            backdropFilter: 'blur(8px)',
            // 発話中のパルスアニメーション
            boxShadow: isSpeaking
              ? '0 0 12px rgba(46, 204, 113, 0.6), 0 0 24px rgba(46, 204, 113, 0.3)'
              : 'none',
            animation: isSpeaking ? 'voicePulse 1.5s ease-in-out infinite' : 'none',
          }}
          title={
            vcState === 'connected' ? 'ボイスチャットを終了'
            : vcState === 'connecting' ? '接続中...'
            : 'ボイスチャットに参加'
          }
        >
          {vcState === 'connecting' ? '⏳' : '🎙️'}
        </button>
      </div>

      {/* 状態テキスト */}
      <span
        style={{
          fontSize: 10,
          color: vcState === 'connected'
            ? 'rgba(52, 152, 219, 0.8)'
            : 'rgba(255,255,255,0.3)',
          letterSpacing: 1,
        }}
      >
        {vcState === 'connected' && (isMuted ? '🔇 ミュート中' : '🎙️ ボイスON')}
        {vcState === 'connecting' && '接続中...'}
        {vcState === 'disconnected' && ''}
      </span>

      {/* パルスアニメーション用のスタイル */}
      <style>{`
        @keyframes voicePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}
