// ============================================
// VoiceChatUI — ボイスチャットの操作パネル
// スピーカーはデフォルトON、マイクは明示的にON
// マイクOFF時は「参加を促す」フレンドリーなUI表示
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { voiceChat } from '../../utils/voiceChat';
import type { VoiceChatState } from '../../utils/voiceChat';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { useGameStore } from '../../stores/useGameStore';
import { isTouchDevice } from '../../utils/device';

// --- SVG アイコン ---
const MicIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="1" width="6" height="11" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="17" x2="12" y2="21" />
    <line x1="8" y1="21" x2="16" y2="21" />
  </svg>
);

const MicOffIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
    <path d="M17 16.95A7 7 0 0 1 5 12" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const SpeakerIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

const SpeakerMutedIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

export function VoiceChatUI() {
  const phase = useGameStore((s) => s.phase);
  const connected = useMultiplayerStore((s) => s.connected);

  const [vcState, setVcState] = useState<VoiceChatState>('disconnected');
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // マイク参加を促すツールチップの表示（初回のみ数秒間表示）
  const [showJoinHint, setShowJoinHint] = useState(false);
  const hintShownRef = useRef(false);

  const isTouch = isTouchDevice();

  // コールバックを設定
  useEffect(() => {
    voiceChat.setCallbacks({
      onStateChange: (state) => setVcState(state),
      onMicChange: (mic) => setIsMicEnabled(mic),
      onSpeakerChange: (speaker) => setIsSpeakerOn(speaker),
      onSpeakingChange: (speaking) => setIsSpeaking(speaking),
      onRemoteSpeaking: (playerId, speaking) => {
        useMultiplayerStore.getState().setRemoteSpeaking(playerId, speaking);
      },
      onError: (err) => {
        setError(err);
        setTimeout(() => setError(null), 5000);
      },
    });

    return () => {
      voiceChat.leave();
    };
  }, []);

  // マルチプレイ接続時にリスナー（スピーカーのみ）として自動参加
  useEffect(() => {
    if (phase === 'playing' && connected) {
      voiceChat.joinAsListener();
    }
    // マルチプレイ切断時はクリーンアップ
    if (!connected && vcState !== 'disconnected') {
      voiceChat.leave();
    }
  }, [phase, connected, vcState]);

  // リスナー参加後、マイク未有効の場合にヒントを表示（初回のみ）
  useEffect(() => {
    if (vcState === 'connected' && !isMicEnabled && !hintShownRef.current) {
      const timer = setTimeout(() => {
        setShowJoinHint(true);
        hintShownRef.current = true;
        // 6秒後にフェードアウト
        setTimeout(() => setShowJoinHint(false), 6000);
      }, 2000); // 参加後2秒待ってから表示
      return () => clearTimeout(timer);
    }
  }, [vcState, isMicEnabled]);

  // マイクON/OFF
  const handleToggleMic = useCallback(() => {
    if (isMicEnabled) {
      voiceChat.disableMicrophone();
    } else {
      voiceChat.enableMicrophone();
      setShowJoinHint(false);
    }
  }, [isMicEnabled]);

  // マイクミュートトグル
  const handleToggleMute = useCallback(() => {
    const newMuted = voiceChat.toggleMute();
    setIsMuted(newMuted);
  }, []);

  // スピーカーON/OFF
  const handleToggleSpeaker = useCallback(() => {
    voiceChat.toggleSpeaker();
  }, []);

  // タッチ用ハンドラ
  const handleTouchToggleMic = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleToggleMic();
  }, [handleToggleMic]);

  const handleTouchToggleMute = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleToggleMute();
  }, [handleToggleMute]);

  const handleTouchToggleSpeaker = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleToggleSpeaker();
  }, [handleToggleSpeaker]);

  // ゲームプレイ中 + マルチプレイ接続中のみ表示
  if (phase !== 'playing' || !connected) return null;

  return (
    <div
      id="voice-chat-panel"
      style={{
        position: 'fixed',
        top: isTouch ? 76 : 64,
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

      {/* マイク参加を促すヒント（マイクOFF時に表示） */}
      {showJoinHint && !isMicEnabled && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: 'rgba(52, 152, 219, 0.9)',
            borderRadius: 10,
            color: '#fff',
            fontSize: isTouch ? 13 : 12,
            maxWidth: 220,
            textAlign: 'right',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 2px 12px rgba(52, 152, 219, 0.4)',
            animation: 'hintSlideIn 0.4s ease-out',
            lineHeight: 1.4,
          }}
        >
          <span style={{ fontSize: 16 }}>🎤</span>
          <span>マイクを押して<br />会話に参加しよう！</span>
          <span style={{
            position: 'absolute',
            right: isTouch ? 18 : 16,
            top: -6,
            width: 0,
            height: 0,
          }} />
        </div>
      )}

      {/* ボタンの行 */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* スピーカーボタン（常時表示） */}
        <button
          id="voice-speaker-button"
          onClick={isTouch ? undefined : handleToggleSpeaker}
          onTouchStart={isTouch ? handleTouchToggleSpeaker : undefined}
          style={{
            width: isTouch ? 40 : 36,
            height: isTouch ? 40 : 36,
            borderRadius: '50%',
            border: 'none',
            background: isSpeakerOn
              ? 'rgba(255,255,255,0.15)'
              : 'rgba(231, 76, 60, 0.8)',
            color: '#fff',
            fontSize: isTouch ? 20 : 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s',
            backdropFilter: 'blur(8px)',
            touchAction: 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
          title={isSpeakerOn ? 'スピーカーOFF' : 'スピーカーON'}
        >
          {isSpeakerOn
            ? <SpeakerIcon size={isTouch ? 20 : 16} />
            : <SpeakerMutedIcon size={isTouch ? 20 : 16} />}
        </button>

        {/* マイクミュートボタン（マイクON時のみ） */}
        {isMicEnabled && (
          <button
            id="voice-mute-button"
            onClick={isTouch ? undefined : handleToggleMute}
            onTouchStart={isTouch ? handleTouchToggleMute : undefined}
            style={{
              width: isTouch ? 40 : 36,
              height: isTouch ? 40 : 36,
              borderRadius: '50%',
              border: 'none',
              background: isMuted
                ? 'rgba(231, 76, 60, 0.8)'
                : 'rgba(255,255,255,0.15)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
              backdropFilter: 'blur(8px)',
              touchAction: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
            title={isMuted ? 'ミュート解除' : 'ミュート'}
          >
            {isMuted
              ? <MicOffIcon size={isTouch ? 20 : 16} />
              : <MicIcon size={isTouch ? 20 : 16} />}
          </button>
        )}

        {/* メインのマイクON/OFFボタン */}
        <button
          id="voice-mic-button"
          onClick={isTouch ? undefined : handleToggleMic}
          onTouchStart={isTouch ? handleTouchToggleMic : undefined}
          style={{
            width: isTouch ? 48 : 44,
            height: isTouch ? 48 : 44,
            borderRadius: '50%',
            border: '2px solid',
            borderColor: isMicEnabled
              ? (isSpeaking ? '#2ecc71' : '#3498db')
              : 'rgba(255,255,255,0.25)',
            background: isMicEnabled
              ? (isSpeaking
                ? 'rgba(46, 204, 113, 0.3)'
                : 'rgba(52, 152, 219, 0.3)')
              : 'rgba(0,0,0,0.4)',
            color: '#fff',
            fontSize: isTouch ? 22 : 20,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s',
            backdropFilter: 'blur(8px)',
            touchAction: 'none',
            WebkitTapHighlightColor: 'transparent',
            // 発話中のパルスアニメーション
            boxShadow: isSpeaking
              ? '0 0 12px rgba(46, 204, 113, 0.6), 0 0 24px rgba(46, 204, 113, 0.3)'
              : (showJoinHint && !isMicEnabled
                ? '0 0 12px rgba(52, 152, 219, 0.5), 0 0 24px rgba(52, 152, 219, 0.2)'
                : 'none'),
            animation: isSpeaking
              ? 'voicePulse 1.5s ease-in-out infinite'
              : (showJoinHint && !isMicEnabled
                ? 'micHintPulse 2s ease-in-out infinite'
                : 'none'),
          }}
          title={isMicEnabled ? 'マイクOFF' : 'マイクON — 会話に参加'}
        >
          {isMicEnabled
            ? <MicIcon size={isTouch ? 24 : 20} />
            : <MicOffIcon size={isTouch ? 24 : 20} />}
        </button>
      </div>

      {/* 状態テキスト */}
      <span
        style={{
          fontSize: 10,
          color: isMicEnabled
            ? (isMuted ? 'rgba(231, 76, 60, 0.8)' : 'rgba(52, 152, 219, 0.8)')
            : 'rgba(255,255,255,0.3)',
          letterSpacing: 1,
        }}
      >
        {isMicEnabled && (isMuted ? 'ミュート中' : 'マイクON')}
        {!isMicEnabled && vcState === 'connected' && '聴取中'}
      </span>

      {/* アニメーション用スタイル */}
      <style>{`
        @keyframes voicePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes micHintPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 8px rgba(52, 152, 219, 0.4); }
          50% { transform: scale(1.05); box-shadow: 0 0 16px rgba(52, 152, 219, 0.6); }
        }
        @keyframes hintSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
