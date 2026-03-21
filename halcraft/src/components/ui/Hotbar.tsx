// ホットバー（ブロック選択UI）コンポーネント
// 画面下部にマイクラ風のブロック選択バーを表示

import { useEffect, useState } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { HOTBAR_BLOCKS, BLOCK_DEFS } from '../../types/blocks';

export function Hotbar() {
  const selectedSlot = usePlayerStore((s) => s.selectedSlot);
  const [textures, setTextures] = useState<Map<number, string>>(new Map());

  // テクスチャをdata URLに変換して表示用に準備
  useEffect(() => {
    const map = new Map<number, string>();
    HOTBAR_BLOCKS.forEach((blockId) => {
      const def = BLOCK_DEFS[blockId];
      if (def) {
        map.set(blockId, `/textures/blocks/${def.texture}`);
      }
    });
    setTextures(map);
  }, []);

  return (
    <div
      id="hotbar"
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 2,
        padding: 4,
        background: 'rgba(0,0,0,0.55)',
        borderRadius: 6,
        border: '2px solid rgba(255,255,255,0.15)',
        zIndex: 100,
        backdropFilter: 'blur(6px)',
      }}
    >
      {HOTBAR_BLOCKS.map((blockId, index) => {
        const def = BLOCK_DEFS[blockId];
        const isSelected = index === selectedSlot;
        const texUrl = textures.get(blockId);

        return (
          <div
            key={blockId}
            style={{
              width: 48,
              height: 48,
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
            }}
          >
            {texUrl && (
              <img
                src={texUrl}
                alt={def?.name}
                style={{
                  width: 36,
                  height: 36,
                  imageRendering: 'pixelated',
                  objectFit: 'cover',
                }}
              />
            )}
            {/* ショートカット番号 */}
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
          </div>
        );
      })}
    </div>
  );
}
