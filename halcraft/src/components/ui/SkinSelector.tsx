// ============================================
// SkinSelector — スキン選択UIコンポーネント
// タイトル画面やゲーム中のTab画面で表示
// ハルのイラストに基づいた6種のスキンから選択
// ============================================

import { useMemo } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { ALL_SKIN_IDS, SKIN_DEFS, type SkinId } from '../../types/skins';
import { isTouchDevice } from '../../utils/device';

interface SkinSelectorProps {
  /** コンパクト表示（タイトル画面用） */
  compact?: boolean;
  /** オーバーレイ表示（ゲーム中のTab画面用） */
  overlay?: boolean;
  /** 閉じるコールバック（オーバーレイ時） */
  onClose?: () => void;
}

/** ミニアバターのプレビュー（CSSで簡易的に表現） */
function MiniAvatar({ skinId, size = 48 }: { skinId: SkinId; size?: number }) {
  const skin = SKIN_DEFS[skinId];
  const s = size;
  const headSize = s * 0.35;
  const bodyW = s * 0.4;
  const bodyH = s * 0.35;
  const armW = s * 0.12;
  const legW = s * 0.16;
  const legH = s * 0.2;

  return (
    <div style={{
      width: s,
      height: s,
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* 頭 */}
      <div style={{
        width: headSize,
        height: headSize,
        background: skin.colors.head,
        borderRadius: 3,
        position: 'relative',
        zIndex: 2,
      }}>
        {/* ツノ（赤ウォーデン） */}
        {skin.hasHeadAccessory && (
          <>
            <div style={{
              position: 'absolute',
              top: -6,
              left: 2,
              width: 4,
              height: 8,
              background: skin.accessoryColor || '#881100',
              borderRadius: '2px 2px 0 0',
              transform: 'rotate(-10deg)',
            }} />
            <div style={{
              position: 'absolute',
              top: -6,
              right: 2,
              width: 4,
              height: 8,
              background: skin.accessoryColor || '#881100',
              borderRadius: '2px 2px 0 0',
              transform: 'rotate(10deg)',
            }} />
          </>
        )}
      </div>
      {/* 体 + 腕 */}
      <div style={{
        display: 'flex',
        gap: 1,
        marginTop: -1,
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{ width: armW, height: bodyH, background: skin.colors.arms, borderRadius: 2 }} />
        <div style={{ width: bodyW, height: bodyH, background: skin.colors.body, borderRadius: 2 }} />
        <div style={{ width: armW, height: bodyH, background: skin.colors.arms, borderRadius: 2 }} />
      </div>
      {/* 足 */}
      <div style={{ display: 'flex', gap: 2, marginTop: -1 }}>
        <div style={{ width: legW, height: legH, background: skin.colors.legs, borderRadius: '0 0 2px 2px' }} />
        <div style={{ width: legW, height: legH, background: skin.colors.legs, borderRadius: '0 0 2px 2px' }} />
      </div>
    </div>
  );
}

export function SkinSelector({ compact = false, overlay = false, onClose }: SkinSelectorProps) {
  const selectedSkin = usePlayerStore((s) => s.skinId);
  const setSkin = usePlayerStore((s) => s.setSkin);
  const isTouch = useMemo(() => isTouchDevice(), []);

  const handleSelect = (id: SkinId) => {
    setSkin(id);
  };

  const content = (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: compact ? 8 : 16,
    }}>
      {/* タイトル */}
      {!compact && (
        <div style={{
          color: '#fff',
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 2,
          textShadow: '0 2px 8px rgba(0,0,0,0.6)',
        }}>
          スキンを選ぼう
        </div>
      )}

      {/* スキン一覧 */}
      <div style={{
        display: 'flex',
        gap: isTouch ? 6 : 10,
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: isTouch ? 280 : 480,
      }}>
        {ALL_SKIN_IDS.map((id) => {
          const skin = SKIN_DEFS[id];
          const isSelected = id === selectedSkin;
          const avatarSize = compact ? (isTouch ? 40 : 48) : (isTouch ? 52 : 64);

          return (
            <div
              key={id}
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(id);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: compact ? 6 : 10,
                borderRadius: 10,
                background: isSelected
                  ? 'rgba(100, 220, 100, 0.25)'
                  : 'rgba(255,255,255,0.06)',
                border: `2px solid ${isSelected
                  ? 'rgba(100, 220, 100, 0.7)'
                  : 'rgba(255,255,255,0.1)'}`,
                cursor: 'pointer',
                transition: 'all 0.2s',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                boxShadow: isSelected
                  ? '0 0 16px rgba(100, 220, 100, 0.3)'
                  : 'none',
                minWidth: compact ? 60 : 72,
              }}
            >
              <MiniAvatar skinId={id} size={avatarSize} />
              <span style={{
                color: isSelected ? '#8f8' : 'rgba(255,255,255,0.7)',
                fontSize: compact ? 10 : 12,
                fontWeight: isSelected ? 700 : 400,
                textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                whiteSpace: 'nowrap',
              }}>
                {skin.icon} {skin.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // オーバーレイ表示（ゲーム内Tab画面）
  if (overlay) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 300,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: 'rgba(20, 20, 40, 0.95)',
            borderRadius: 16,
            padding: '24px 32px',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {content}
          <div style={{
            marginTop: 16,
            textAlign: 'center',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 12,
          }}>
            {isTouch ? 'タップで閉じる' : 'Tab キーで閉じる'}
          </div>
        </div>
      </div>
    );
  }

  // コンパクト表示（タイトル画面内埋め込み）
  return content;
}
