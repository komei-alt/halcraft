// ホットバー（ブロック選択UI）コンポーネント
// 画面下部にマイクラ風のブロック選択バーを表示
// モバイルではタップで選択可能

import { useMemo } from 'react';
import { usePlayerStore, type EquippedItem } from '../../stores/usePlayerStore';
import { useInventoryStore } from '../../stores/useInventoryStore';
import { useGameStore } from '../../stores/useGameStore';
import { BLOCK_DEFS } from '../../types/blocks';
import { getBlockUseProfile } from '../../utils/blockUseFeedback';
import { isTouchDevice } from '../../utils/device';

export function Hotbar() {
  const selectedSlot = usePlayerStore((s) => s.selectedSlot);
  const selectSlot = usePlayerStore((s) => s.selectSlot);
  const hotbarSlots = usePlayerStore((s) => s.hotbarSlots);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const setEquippedItem = usePlayerStore((s) => s.setEquippedItem);
  const items = useInventoryStore((s) => s.items);
  const currentStageId = useGameStore((s) => s.currentStageId);

  const isTouch = isTouchDevice();
  const selectedBlock = hotbarSlots[selectedSlot] ?? hotbarSlots[0];
  const selectedDef = BLOCK_DEFS[selectedBlock];
  const selectedCount = items[selectedBlock] ?? 0;
  const selectedProfile = getBlockUseProfile(selectedBlock, currentStageId);

  // セルサイズ（モバイルではやや小さめ）
  const cellSize = isTouch ? 40 : 48;
  const imgSize = isTouch ? 28 : 36;

  // テクスチャをdata URLに変換して表示用に準備（hotbarSlotsが変わるたび再計算）
  const textures = useMemo(() => {
    const map = new Map<number, string>();
    hotbarSlots.forEach((blockId) => {
      const def = BLOCK_DEFS[blockId];
      if (def) {
        map.set(blockId, `/textures/blocks/${def.texture}`);
      }
    });
    return map;
  }, [hotbarSlots]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: isTouch
          ? 'calc(8px + env(safe-area-inset-bottom))'
          : 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        zIndex: isTouch ? 125 : 100,
      }}
    >
      {equippedItem === 'builder' && selectedDef && (
        <div
          style={{
            minWidth: isTouch ? 250 : 320,
            maxWidth: 'calc(100vw - 32px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: isTouch ? '8px 12px' : '7px 12px',
            borderRadius: 999,
            border: selectedCount > 0
              ? `1px solid ${selectedProfile.accent}7a`
              : '1px solid rgba(255, 105, 105, 0.55)',
            background: selectedCount > 0
              ? `linear-gradient(135deg, ${selectedProfile.glow}, rgba(24, 20, 16, 0.72))`
              : 'rgba(70, 18, 18, 0.72)',
            color: '#fff',
            boxShadow: selectedCount > 0
              ? `0 8px 24px rgba(0,0,0,0.22), 0 0 18px ${selectedProfile.glow}`
              : '0 8px 24px rgba(0,0,0,0.22)',
            backdropFilter: 'blur(8px)',
            fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
          }}
        >
          <span
            style={{
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: isTouch ? 12 : 13,
                fontWeight: 900,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  filter: selectedCount > 0 ? `drop-shadow(0 0 6px ${selectedProfile.glow})` : undefined,
                }}
              >
                {selectedProfile.icon}
              </span>
              <span
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedDef.name}
              </span>
              {selectedCount > 0 && (
                <span
                  style={{
                    flexShrink: 0,
                    color: selectedProfile.accent,
                    fontSize: isTouch ? 9 : 10,
                    fontWeight: 900,
                  }}
                >
                  {selectedProfile.eyebrow}
                </span>
              )}
            </span>
            <span
              style={{
                color: selectedCount > 0 ? 'rgba(255,255,255,0.66)' : '#ffc0c0',
                fontSize: isTouch ? 10 : 11,
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedCount > 0 ? selectedProfile.detail : '素材なし / クラフト画面で補充'}
            </span>
          </span>
          <span
            style={{
              flexShrink: 0,
              minWidth: isTouch ? 52 : 60,
              textAlign: 'center',
              padding: '4px 9px',
              borderRadius: 999,
              background: selectedCount > 0 ? `${selectedProfile.accent}24` : 'rgba(255,0,0,0.16)',
              color: selectedCount > 0 ? selectedProfile.accent : '#ffb3b3',
              fontSize: isTouch ? 12 : 13,
              fontWeight: 900,
              fontFamily: 'monospace',
            }}
          >
            x{selectedCount}
          </span>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: 4,
          background: 'rgba(8, 11, 17, 0.4)',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.14)',
          backdropFilter: 'blur(11px)',
          WebkitBackdropFilter: 'blur(11px)',
        }}
      >
        {([
          { id: 'builder', icon: '⛏️', label: '建築' },
          { id: 'rocket_launcher', icon: '🚀', label: 'ロケット' },
          { id: 'machine_gun', icon: '🔫', label: '機関銃' },
          { id: 'lightsaber', icon: '⚔️', label: '剣' },
        ] satisfies Array<{ id: EquippedItem; icon: string; label: string }>).map((item) => {
          const isSelected = equippedItem === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setEquippedItem(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: isTouch ? '7px 10px' : '6px 10px',
                borderRadius: 999,
                border: isSelected
                  ? '1px solid rgba(255, 206, 120, 0.62)'
                  : '1px solid rgba(255,255,255,0.08)',
                background: isSelected
                  ? item.id === 'rocket_launcher'
                    ? 'rgba(255, 145, 72, 0.22)'
                    : item.id === 'machine_gun'
                      ? 'rgba(255, 210, 90, 0.18)'
                      : item.id === 'lightsaber'
                        ? 'rgba(170, 130, 255, 0.2)'
                        : 'rgba(180, 220, 255, 0.14)'
                  : 'rgba(255,255,255,0.04)',
                color: isSelected ? '#fff0d0' : 'rgba(255,255,255,0.65)',
                fontSize: isTouch ? 12 : 11,
                fontWeight: 700,
                letterSpacing: 0,
                cursor: 'pointer',
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {!isTouch && item.id !== 'builder' && (
                <span style={{ fontSize: 9, opacity: 0.7 }}>V</span>
              )}
            </button>
          );
        })}
      </div>

      <div
        id="hotbar"
        style={{
          display: 'flex',
          gap: 2,
          padding: 4,
          maxWidth: 'calc(100vw - 24px)',
          overflowX: 'auto',
          boxSizing: 'border-box',
          background: 'rgba(8, 11, 17, 0.42)',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.15)',
          backdropFilter: 'blur(11px)',
          WebkitBackdropFilter: 'blur(11px)',
          scrollbarWidth: 'none',
        }}
      >
        {hotbarSlots.map((blockId, index) => {
          const def = BLOCK_DEFS[blockId];
          const isSelected = index === selectedSlot;
          const texUrl = textures.get(blockId);
          const count = items[blockId] ?? 0;
          const hasItem = count > 0;
          const profile = getBlockUseProfile(blockId, currentStageId);

          return (
            <div
              key={`${blockId}-${index}`}
              onClick={() => selectSlot(index)}
              onTouchStart={(e) => {
                // モバイルではタッチで選択
                if (isTouch) {
                  e.stopPropagation();
                  selectSlot(index);
                }
              }}
              style={{
                width: cellSize,
                height: cellSize,
                border: isSelected
                  ? `3px solid ${profile.accent}`
                  : `2px solid ${hasItem ? `${profile.accent}66` : 'rgba(255,255,255,0.18)'}`,
                borderRadius: 4,
                background: isSelected
                  ? `linear-gradient(135deg, ${profile.glow}, rgba(255,255,255,0.14))`
                  : 'rgba(0,0,0,0.3)',
                opacity: hasItem ? 1 : 0.46,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                transition: 'border 0.1s, background 0.1s',
                boxShadow: isSelected
                  ? `0 0 0 1px rgba(255,255,255,0.55), 0 0 14px ${profile.glow}`
                  : 'none',
                imageRendering: 'pixelated',
                touchAction: 'none',
                WebkitTapHighlightColor: 'transparent',
                cursor: 'pointer',
              }}
            >
              {texUrl && (
                <img
                  src={texUrl}
                  alt={def?.name}
                  style={{
                    width: imgSize,
                    height: imgSize,
                    imageRendering: 'pixelated',
                    objectFit: 'cover',
                    pointerEvents: 'none',
                  }}
                />
              )}
              {hasItem && (
                <span
                  title={profile.eyebrow}
                  style={{
                    position: 'absolute',
                    top: 3,
                    right: 3,
                    width: isSelected ? 8 : 6,
                    height: isSelected ? 8 : 6,
                    borderRadius: 999,
                    background: profile.accent,
                    boxShadow: `0 0 8px ${profile.glow}`,
                    border: '1px solid rgba(0,0,0,0.35)',
                  }}
                />
              )}
              <span
                style={{
                  position: 'absolute',
                  right: 3,
                  bottom: 1,
                  minWidth: 12,
                  padding: '0 2px',
                  borderRadius: 3,
                  color: hasItem ? '#fff' : '#ff9c9c',
                  fontSize: isTouch ? 9 : 10,
                  fontFamily: 'monospace',
                  fontWeight: 900,
                  lineHeight: '12px',
                  textAlign: 'right',
                  textShadow: '1px 1px 2px #000',
                }}
              >
                {count}
              </span>
              {/* ショートカット番号（デスクトップのみ表示） */}
              {!isTouch && (
                <span
                  style={{
                    position: 'absolute',
                    top: 1,
                    left: 4,
                    fontSize: 10,
                    color: isSelected ? '#fff' : 'rgba(255,255,255,0.5)',
                    fontFamily: 'monospace',
                    fontWeight: isSelected ? 'bold' : 'normal',
                  }}
                >
                  {index + 1}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
