// クラフト画面UIコンポーネント
// お子さんのデザイン画を踏襲した石グレーのグリッドベースUI
// 左: インベントリグリッド + 上部ホットバー
// 右: クラフトレシピグリッド
// Eキーで開閉、アイテム選択でホットバーに反映

import { useEffect, useState, useCallback } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useInventoryStore } from '../../stores/useInventoryStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { CRAFTING_RECIPES } from '../../types/crafting';
import {
  BLOCK_DEFS,
  HOTBAR_BLOCKS,
  type BlockId,
} from '../../types/blocks';

// === 定数 ===
/** インベントリグリッドの列数 */
const INVENTORY_COLS = 9;
/** インベントリグリッドの行数 */
const INVENTORY_ROWS = 4;
/** クラフトレシピグリッドの列数 */
const RECIPE_COLS = 4;
/** グリッドセルのサイズ (px) */
const CELL_SIZE = 52;
/** グリッドセル間のギャップ (px) */
const CELL_GAP = 3;

// === ヘルパー ===

/** テクスチャURLを取得 */
const getTextureUrl = (blockId: BlockId): string => {
  const def = BLOCK_DEFS[blockId];
  return def ? `/textures/blocks/${def.texture}` : '';
};

/** ブロック名を取得 */
const getBlockName = (blockId: BlockId): string => {
  const def = BLOCK_DEFS[blockId];
  return def?.name ?? '不明';
};

// === スタイル定数 ===
const STONE_BG = '#8B8B8B';
const STONE_DARK = '#6B6B6B';
const STONE_BORDER = '#A0A0A0';
const STONE_SHADOW = '#5A5A5A';
const CELL_BG = '#7A7A7A';
const CELL_BORDER_LIGHT = '#9E9E9E';
const CELL_BORDER_DARK = '#5E5E5E';
const CELL_HOVER = '#8E8E8E';
const CELL_SELECTED = '#B0B0FF';

/** 石テクスチャ風のベースパネルスタイル */
const stonePanelStyle: React.CSSProperties = {
  background: `linear-gradient(145deg, ${STONE_BG}, ${STONE_DARK})`,
  border: `3px solid ${STONE_BORDER}`,
  borderRadius: 4,
  boxShadow: `
    inset 1px 1px 0 ${STONE_BORDER},
    inset -1px -1px 0 ${STONE_SHADOW},
    4px 4px 12px rgba(0, 0, 0, 0.5)
  `,
  padding: 12,
};

/** グリッドセルのスタイル */
const cellStyle = (isSelected: boolean, isHoverable: boolean): React.CSSProperties => ({
  width: CELL_SIZE,
  height: CELL_SIZE,
  background: isSelected ? CELL_SELECTED : CELL_BG,
  border: `2px solid ${CELL_BORDER_LIGHT}`,
  borderBottomColor: CELL_BORDER_DARK,
  borderRightColor: CELL_BORDER_DARK,
  borderRadius: 2,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative' as const,
  cursor: isHoverable ? 'pointer' : 'default',
  transition: 'background 0.1s',
  imageRendering: 'pixelated' as const,
});

// === コンポーネント ===

export function CraftingScreen() {
  const phase = useGameStore((s) => s.phase);
  const items = useInventoryStore((s) => s.items);
  const canCraft = useInventoryStore((s) => s.canCraft);
  const craft = useInventoryStore((s) => s.craft);
  const selectedSlot = usePlayerStore((s) => s.selectedSlot);
  const selectSlot = usePlayerStore((s) => s.selectSlot);

  const [isOpen, setIsOpen] = useState(false);
  const [craftedRecipeId, setCraftedRecipeId] = useState<string | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<BlockId | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Eキーでクラフト画面の開閉
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'KeyE' && phase === 'playing') {
        e.preventDefault();
        setIsOpen((prev) => {
          const next = !prev;
          if (next) {
            document.exitPointerLock();
          } else {
            const canvas = document.querySelector('canvas');
            if (canvas) canvas.requestPointerLock();
          }
          return next;
        });
      }
      if (e.code === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
        const canvas = document.querySelector('canvas');
        if (canvas) canvas.requestPointerLock();
      }
    },
    [phase, isOpen],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // クラフト実行
  const handleCraft = useCallback(
    (recipeId: string) => {
      const recipe = CRAFTING_RECIPES.find((r) => r.id === recipeId);
      if (!recipe) return;
      if (canCraft(recipe)) {
        craft(recipe);
        setCraftedRecipeId(recipeId);
        setTimeout(() => setCraftedRecipeId(null), 500);
      }
    },
    [canCraft, craft],
  );

  // ホットバースロットにアイテムをセット
  const handleSelectItem = useCallback(
    (blockId: BlockId) => {
      // ホットバーのブロック一覧の中からこのブロックのインデックスを探す
      const hotbarIndex = HOTBAR_BLOCKS.indexOf(blockId);
      if (hotbarIndex >= 0) {
        selectSlot(hotbarIndex);
      }
    },
    [selectSlot],
  );

  // ツールチップ表示制御
  const handleItemMouseMove = useCallback(
    (e: React.MouseEvent, blockId: BlockId) => {
      setHoveredItemId(blockId);
      setTooltipPos({ x: e.clientX + 14, y: e.clientY - 10 });
    },
    [],
  );

  const handleItemMouseLeave = useCallback(() => {
    setHoveredItemId(null);
  }, []);

  if (!isOpen || phase !== 'playing') return null;

  // インベントリに所持しているアイテム一覧
  const inventoryEntries = Object.entries(items)
    .map(([idStr, count]) => ({
      blockId: parseInt(idStr) as BlockId,
      count,
    }))
    .filter((e) => e.count > 0);

  return (
    <div
      id="crafting-screen-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.55)',
        animation: 'craftFadeIn 0.15s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setIsOpen(false);
          const canvas = document.querySelector('canvas');
          if (canvas) canvas.requestPointerLock();
        }
      }}
    >
      <div
        id="crafting-main-panel"
        style={{
          display: 'flex',
          gap: 16,
          animation: 'craftSlideIn 0.2s ease-out',
        }}
      >
        {/* ============================ */}
        {/* 左パネル: インベントリ       */}
        {/* ============================ */}
        <div style={stonePanelStyle}>
          {/* パネルタイトル */}
          <div
            style={{
              color: '#E8E8E8',
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 10,
              textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
              fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
            }}
          >
            インベントリ
          </div>

          {/* 上部: ホットバー（現在の選択を表示） */}
          <div
            style={{
              display: 'flex',
              gap: CELL_GAP,
              marginBottom: 10,
              padding: 6,
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 3,
              border: `1px solid ${STONE_SHADOW}`,
            }}
          >
            {HOTBAR_BLOCKS.map((blockId, idx) => {
              const isSelected = idx === selectedSlot;
              const texUrl = getTextureUrl(blockId);
              const count = items[blockId] ?? 0;

              return (
                <div
                  key={`hotbar-${idx}`}
                  onClick={() => selectSlot(idx)}
                  onMouseMove={(e) => handleItemMouseMove(e, blockId)}
                  onMouseLeave={handleItemMouseLeave}
                  style={{
                    ...cellStyle(isSelected, true),
                    width: CELL_SIZE - 4,
                    height: CELL_SIZE - 4,
                    border: isSelected
                      ? '2px solid #FFFFFF'
                      : `2px solid ${CELL_BORDER_LIGHT}`,
                    borderBottomColor: isSelected ? '#CCCCCC' : CELL_BORDER_DARK,
                    borderRightColor: isSelected ? '#CCCCCC' : CELL_BORDER_DARK,
                    background: isSelected ? 'rgba(180,180,255,0.35)' : CELL_BG,
                  }}
                >
                  {texUrl && (
                    <img
                      src={texUrl}
                      alt={getBlockName(blockId)}
                      draggable={false}
                      style={{
                        width: 30,
                        height: 30,
                        imageRendering: 'pixelated',
                        objectFit: 'contain',
                      }}
                    />
                  )}
                  {count > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 1,
                        right: 3,
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#FFF',
                        textShadow: '1px 1px 2px #000',
                        fontFamily: 'monospace',
                      }}
                    >
                      {count}
                    </span>
                  )}
                  <span
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 2,
                      fontSize: 9,
                      color: isSelected ? '#FFF' : 'rgba(255,255,255,0.5)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {idx + 1}
                  </span>
                </div>
              );
            })}
          </div>

          {/* グリッド: 持ち物一覧 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${INVENTORY_COLS}, ${CELL_SIZE}px)`,
              gap: CELL_GAP,
            }}
          >
            {Array.from({ length: INVENTORY_COLS * INVENTORY_ROWS }).map((_, cellIdx) => {
              const entry = inventoryEntries[cellIdx];

              if (!entry) {
                // 空セル
                return (
                  <div
                    key={`inv-empty-${cellIdx}`}
                    style={cellStyle(false, false)}
                  />
                );
              }

              const { blockId, count } = entry;
              const texUrl = getTextureUrl(blockId);
              const isInHotbar = HOTBAR_BLOCKS.includes(blockId);

              return (
                <div
                  key={`inv-${blockId}`}
                  onClick={() => handleSelectItem(blockId)}
                  onMouseMove={(e) => handleItemMouseMove(e, blockId)}
                  onMouseLeave={handleItemMouseLeave}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = CELL_HOVER;
                  }}
                  style={cellStyle(false, isInHotbar)}
                >
                  {texUrl && (
                    <img
                      src={texUrl}
                      alt={getBlockName(blockId)}
                      draggable={false}
                      style={{
                        width: 34,
                        height: 34,
                        imageRendering: 'pixelated',
                        objectFit: 'contain',
                      }}
                    />
                  )}
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 1,
                      right: 3,
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#FFF',
                      textShadow: '1px 1px 2px #000',
                      fontFamily: 'monospace',
                    }}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ============================ */}
        {/* 右パネル: クラフトレシピ      */}
        {/* ============================ */}
        <div style={{ ...stonePanelStyle, minWidth: 320 }}>
          {/* パネルタイトル */}
          <div
            style={{
              color: '#E8E8E8',
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 10,
              textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
              fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
            }}
          >
            ⚒️ クラフト
          </div>

          {/* レシピグリッド */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${RECIPE_COLS}, 1fr)`,
              gap: CELL_GAP + 2,
            }}
          >
            {CRAFTING_RECIPES.map((recipe) => {
              const craftable = canCraft(recipe);
              const justCrafted = craftedRecipeId === recipe.id;
              const texUrl = getTextureUrl(recipe.result);

              return (
                <div
                  key={recipe.id}
                  onClick={() => handleCraft(recipe.id)}
                  onMouseMove={(e) => {
                    setHoveredItemId(recipe.result);
                    setTooltipPos({ x: e.clientX + 14, y: e.clientY - 10 });
                  }}
                  onMouseLeave={handleItemMouseLeave}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    padding: 8,
                    borderRadius: 4,
                    cursor: craftable ? 'pointer' : 'not-allowed',
                    background: justCrafted
                      ? 'rgba(80, 200, 80, 0.25)'
                      : craftable
                        ? 'rgba(0,0,0,0.15)'
                        : 'rgba(0,0,0,0.25)',
                    border: justCrafted
                      ? `2px solid #6F6`
                      : craftable
                        ? `2px solid ${CELL_BORDER_LIGHT}`
                        : `2px solid ${STONE_SHADOW}`,
                    borderBottomColor: justCrafted ? '#4A4' : CELL_BORDER_DARK,
                    borderRightColor: justCrafted ? '#4A4' : CELL_BORDER_DARK,
                    transition: 'all 0.15s',
                    opacity: craftable ? 1 : 0.5,
                    animation: justCrafted ? 'craftPop 0.4s ease' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (craftable) {
                      (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.1)';
                    }
                  }}
                >
                  {/* アイテムアイコン */}
                  <div
                    style={{
                      ...cellStyle(false, false),
                      width: 56,
                      height: 56,
                      background: craftable ? CELL_BG : STONE_SHADOW,
                    }}
                  >
                    {texUrl && (
                      <img
                        src={texUrl}
                        alt={recipe.name}
                        draggable={false}
                        style={{
                          width: 40,
                          height: 40,
                          imageRendering: 'pixelated',
                          objectFit: 'contain',
                        }}
                      />
                    )}
                    {recipe.resultCount > 1 && (
                      <span
                        style={{
                          position: 'absolute',
                          bottom: 1,
                          right: 3,
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#FFF',
                          textShadow: '1px 1px 2px #000',
                          fontFamily: 'monospace',
                        }}
                      >
                        ×{recipe.resultCount}
                      </span>
                    )}
                  </div>

                  {/* レシピ名 */}
                  <div
                    style={{
                      color: craftable ? '#E8E8E8' : '#999',
                      fontSize: 10,
                      fontWeight: 600,
                      textAlign: 'center',
                      textShadow: '1px 1px 1px rgba(0,0,0,0.5)',
                      lineHeight: 1.2,
                      maxWidth: 70,
                      wordBreak: 'keep-all',
                    }}
                  >
                    {recipe.name}
                  </div>

                  {/* 素材バッジ */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 3,
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                    }}
                  >
                    {Object.entries(recipe.ingredients).map(([blockIdStr, required]) => {
                      const bId = parseInt(blockIdStr) as BlockId;
                      const have = items[bId] ?? 0;
                      const enough = have >= required;

                      return (
                        <div
                          key={blockIdStr}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            padding: '1px 3px',
                            borderRadius: 2,
                            background: enough
                              ? 'rgba(80, 200, 80, 0.2)'
                              : 'rgba(200, 60, 60, 0.2)',
                            border: `1px solid ${enough ? 'rgba(80,200,80,0.4)' : 'rgba(200,60,60,0.4)'}`,
                          }}
                        >
                          <img
                            src={getTextureUrl(bId)}
                            alt=""
                            draggable={false}
                            style={{
                              width: 12,
                              height: 12,
                              imageRendering: 'pixelated',
                            }}
                          />
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              color: enough ? '#8F8' : '#F88',
                            }}
                          >
                            {have}/{required}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ツールチップ */}
      {hoveredItemId !== null && (
        <div
          style={{
            position: 'fixed',
            left: tooltipPos.x,
            top: tooltipPos.y,
            pointerEvents: 'none',
            zIndex: 300,
            background: 'rgba(20, 10, 30, 0.92)',
            border: '2px solid #5A3A8A',
            borderRadius: 4,
            padding: '6px 10px',
            color: '#E8E8F8',
            fontSize: 13,
            fontWeight: 600,
            textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {getBlockName(hoveredItemId)}
        </div>
      )}

      {/* 操作ヒント（下部） */}
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 20,
          alignItems: 'center',
        }}
      >
        <span
          style={{
            color: 'rgba(255,255,255,0.5)',
            fontSize: 13,
            textShadow: '1px 1px 2px rgba(0,0,0,0.6)',
          }}
        >
          <kbd
            style={{
              padding: '2px 8px',
              borderRadius: 3,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              fontFamily: 'monospace',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            E
          </kbd>{' '}
          もどる
        </span>
      </div>
    </div>
  );
}
