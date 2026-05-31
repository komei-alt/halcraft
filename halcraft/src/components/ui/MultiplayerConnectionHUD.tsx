// マルチ接続の状態をゲーム中に短く知らせるHUD
// サーバー不通でも、ひとりプレイとして遊びが止まらないことを明示する

import { useGameStore } from '../../stores/useGameStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { isTouchDevice } from '../../utils/device';
import { HUD_TEXT_SHADOW, SG } from './startScreenTheme';

export function MultiplayerConnectionHUD() {
  const phase = useGameStore((s) => s.phase);
  const connectionState = useMultiplayerStore((s) => s.connectionState);
  const connectionMessage = useMultiplayerStore((s) => s.connectionMessage);
  const isTouch = isTouchDevice();

  if (!connectionMessage || connectionState === 'connected' || phase !== 'playing') return null;

  const isOffline = connectionState === 'offline';
  const accent = isOffline ? SG.gold : connectionState === 'full' ? '#ff8f7d' : SG.build;
  const title = isOffline
    ? 'ひとりプレイで開始'
    : connectionState === 'full'
      ? 'マルチ満員'
      : 'マルチ接続中';

  return (
    <div
      id="multiplayer-connection-hud"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: isTouch ? 104 : 72,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 145,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        width: 'min(88vw, 420px)',
        textAlign: 'center',
        fontFamily: SG.font,
        textShadow: HUD_TEXT_SHADOW,
        animation: 'sgRise 0.35s cubic-bezier(0.22,1,0.36,1) both',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          color: accent,
          fontSize: isTouch ? 12 : 13,
          fontWeight: 950,
          letterSpacing: 1.2,
          lineHeight: 1.2,
        }}
      >
        <span aria-hidden>{isOffline ? '⚡' : '🌐'}</span>
        <span>{title}</span>
      </div>
      <div
        style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: isTouch ? 10 : 11,
          fontWeight: 800,
          lineHeight: 1.35,
          maxWidth: '100%',
        }}
      >
        {connectionMessage}
      </div>
    </div>
  );
}
