// ホットバー（ブロック選択UI）コンポーネント
// 画面下部にマイクラ風のブロック選択バーを表示
// モバイルではタップで選択可能

import { useMemo } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { BLOCK_DEFS } from '../../types/blocks';
import { isTouchDevice } from '../../utils/device';

export function Hotbar() {
  const selectedSlot = usePlayerStore((s) => s.selectedSlot);
  const selectSlot = usePlayerStore((s) => s.selectSlot);
  const hotbarSlots = usePlayerStore((s) => s.hotbarSlots);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const setEquippedItem = usePlayerStore((s) => s.setEquippedItem);

  const isTouch = isTouchDevice();

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
        zIndex: 100,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: 4,
          background: 'rgba(0, 0, 0, 0.55)',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.14)',
          backdropFilter: 'blur(6px)',
        }}
      >
        {[
          { id: 'builder', icon: '⛏️', label: '建築' },
          { id: 'rocket_launcher', icon: '🚀', label: 'ロケット' },
        ].map((item) => {
          const isSelected = equippedItem === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setEquippedItem(item.id as 'builder' | 'rocket_launcher')}
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
                    : 'rgba(180, 220, 255, 0.14)'
                  : 'rgba(255,255,255,0.04)',
                color: isSelected ? '#fff0d0' : 'rgba(255,255,255,0.65)',
                fontSize: isTouch ? 12 : 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'pointer',
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {!isTouch && item.id === 'rocket_launcher' && (
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
          background: 'rgba(0,0,0,0.55)',
          borderRadius: 6,
          border: '2px solid rgba(255,255,255,0.15)',
          backdropFilter: 'blur(6px)',
        }}
      >
      {hotbarSlots.map((blockId, index) => {
        const def = BLOCK_DEFS[blockId];
        const isSelected = index === selectedSlot;
        const texUrl = textures.get(blockId);

        return (
          <div
            key={blockId}
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
                ? '3px solid #fff'
                : '2px solid rgba(255,255,255,0.2)',
              borderRadius: 4,
              background: isSelected
                ? 'rgba(255,255,255,0.18)'
                : 'rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              transition: 'border 0.1s, background 0.1s',
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
