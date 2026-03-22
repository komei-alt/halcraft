// クラフト画面UIコンポーネント
// Eキーで開閉するマイクラ風のクラフトインターフェース

import { useEffect, useState, useCallback } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useInventoryStore } from '../../stores/useInventoryStore';
import { CRAFTING_RECIPES } from '../../types/crafting';
import { BLOCK_DEFS, type BlockId } from '../../types/blocks';

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

export function CraftingScreen() {
  const phase = useGameStore((s) => s.phase);
  const items = useInventoryStore((s) => s.items);
  const canCraft = useInventoryStore((s) => s.canCraft);
  const craft = useInventoryStore((s) => s.craft);

  const [isOpen, setIsOpen] = useState(false);
  const [craftedRecipeId, setCraftedRecipeId] = useState<string | null>(null);
  const [shakingRecipeId, setShakingRecipeId] = useState<string | null>(null);

  // Eキーでクラフト画面の開閉
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'KeyE' && phase === 'playing') {
        e.preventDefault();
        setIsOpen((prev) => {
          const next = !prev;
          if (next) {
            // クラフト画面を開く → PointerLock解除
            document.exitPointerLock();
          } else {
            // クラフト画面を閉じる → PointerLock再取得
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
        setTimeout(() => setCraftedRecipeId(null), 600);
      } else {
        // 素材不足シェイク
        setShakingRecipeId(recipeId);
        setTimeout(() => setShakingRecipeId(null), 400);
      }
    },
    [canCraft, craft],
  );

  if (!isOpen || phase !== 'playing') return null;

  // インベントリに持っているアイテム一覧
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
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        animation: 'craftFadeIn 0.2s ease-out',
      }}
      onClick={(e) => {
        // オーバーレイの空白をクリックで閉じる
        if (e.target === e.currentTarget) {
          setIsOpen(false);
          const canvas = document.querySelector('canvas');
          if (canvas) canvas.requestPointerLock();
        }
      }}
    >
      <div
        id="crafting-panel"
        style={{
          display: 'flex',
          gap: 24,
          maxWidth: 900,
          width: '90%',
          maxHeight: '80vh',
          animation: 'craftSlideIn 0.25s ease-out',
        }}
      >
        {/* 左: インベントリ */}
        <div
          id="inventory-panel"
          style={{
            flex: '0 0 260px',
            background: 'linear-gradient(145deg, rgba(30, 30, 40, 0.95), rgba(20, 20, 28, 0.95))',
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: 20,
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          }}
        >
          <h2
            style={{
              color: '#e8e8f0',
              fontSize: 16,
              fontWeight: 700,
              marginBottom: 16,
              paddingBottom: 10,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 20 }}>🎒</span>
            インベントリ
          </h2>

          {inventoryEntries.length === 0 ? (
            <div
              style={{
                color: 'rgba(255,255,255,0.35)',
                fontSize: 13,
                textAlign: 'center',
                padding: '32px 0',
                lineHeight: 1.6,
              }}
            >
              素材がありません
              <br />
              <span style={{ fontSize: 11, opacity: 0.7 }}>ブロックを破壊して集めよう</span>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 6,
              }}
            >
              {inventoryEntries.map(({ blockId, count }) => (
                <div
                  key={blockId}
                  title={getBlockName(blockId)}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    background: 'rgba(255, 255, 255, 0.06)',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    transition: 'background 0.15s',
                  }}
                >
                  <img
                    src={getTextureUrl(blockId)}
                    alt={getBlockName(blockId)}
                    style={{
                      width: '65%',
                      height: '65%',
                      imageRendering: 'pixelated',
                      objectFit: 'contain',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 2,
                      right: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#fff',
                      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右: レシピ一覧 */}
        <div
          id="recipes-panel"
          style={{
            flex: 1,
            background: 'linear-gradient(145deg, rgba(30, 30, 40, 0.95), rgba(20, 20, 28, 0.95))',
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: 20,
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          }}
        >
          <h2
            style={{
              color: '#e8e8f0',
              fontSize: 16,
              fontWeight: 700,
              marginBottom: 16,
              paddingBottom: 10,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 20 }}>⚒️</span>
            クラフト
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CRAFTING_RECIPES.map((recipe) => {
              const craftable = canCraft(recipe);
              const justCrafted = craftedRecipeId === recipe.id;
              const isShaking = shakingRecipeId === recipe.id;

              return (
                <div
                  key={recipe.id}
                  onClick={() => handleCraft(recipe.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '12px 16px',
                    borderRadius: 8,
                    cursor: craftable ? 'pointer' : 'not-allowed',
                    background: justCrafted
                      ? 'rgba(100, 255, 100, 0.15)'
                      : craftable
                        ? 'rgba(255, 255, 255, 0.06)'
                        : 'rgba(255, 255, 255, 0.02)',
                    border: justCrafted
                      ? '1px solid rgba(100, 255, 100, 0.4)'
                      : craftable
                        ? '1px solid rgba(255,255,255,0.1)'
                        : '1px solid rgba(255,255,255,0.04)',
                    transition: 'all 0.2s ease',
                    opacity: craftable ? 1 : 0.5,
                    animation: isShaking
                      ? 'craftShake 0.4s ease'
                      : justCrafted
                        ? 'craftPop 0.4s ease'
                        : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (craftable) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!justCrafted) {
                      e.currentTarget.style.background = craftable
                        ? 'rgba(255, 255, 255, 0.06)'
                        : 'rgba(255, 255, 255, 0.02)';
                      e.currentTarget.style.borderColor = craftable
                        ? 'rgba(255,255,255,0.1)'
                        : 'rgba(255,255,255,0.04)';
                    }
                  }}
                >
                  {/* 完成品アイコン */}
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      position: 'relative',
                    }}
                  >
                    <img
                      src={getTextureUrl(recipe.result)}
                      alt={recipe.name}
                      style={{
                        width: 32,
                        height: 32,
                        imageRendering: 'pixelated',
                        objectFit: 'contain',
                      }}
                    />
                    {recipe.resultCount > 1 && (
                      <span
                        style={{
                          position: 'absolute',
                          bottom: 1,
                          right: 3,
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#fff',
                          textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                          fontFamily: 'monospace',
                        }}
                      >
                        ×{recipe.resultCount}
                      </span>
                    )}
                  </div>

                  {/* レシピ情報 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        color: craftable ? '#e8e8f0' : 'rgba(255,255,255,0.4)',
                        fontSize: 14,
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      {recipe.name}
                    </div>
                    <div
                      style={{
                        color: 'rgba(255,255,255,0.35)',
                        fontSize: 11,
                        marginBottom: 6,
                      }}
                    >
                      {recipe.description}
                    </div>
                    {/* 素材リスト */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                              gap: 4,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: enough
                                ? 'rgba(100, 255, 100, 0.08)'
                                : 'rgba(255, 80, 80, 0.08)',
                              border: `1px solid ${enough ? 'rgba(100,255,100,0.2)' : 'rgba(255,80,80,0.2)'}`,
                            }}
                          >
                            <img
                              src={getTextureUrl(bId)}
                              alt={getBlockName(bId)}
                              style={{
                                width: 16,
                                height: 16,
                                imageRendering: 'pixelated',
                                objectFit: 'contain',
                              }}
                            />
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                fontFamily: 'monospace',
                                color: enough ? '#8f8' : '#f88',
                              }}
                            >
                              {have}/{required}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* クラフトボタン */}
                  <div
                    style={{
                      flexShrink: 0,
                      padding: '8px 16px',
                      borderRadius: 6,
                      background: craftable
                        ? 'linear-gradient(135deg, #4a9eff, #2d7ad8)'
                        : 'rgba(255,255,255,0.05)',
                      color: craftable ? '#fff' : 'rgba(255,255,255,0.3)',
                      fontSize: 12,
                      fontWeight: 700,
                      transition: 'all 0.15s',
                      boxShadow: craftable ? '0 2px 8px rgba(74, 158, 255, 0.3)' : 'none',
                    }}
                  >
                    {justCrafted ? '✓' : 'クラフト'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 操作ヒント */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.4)',
          fontSize: 12,
          display: 'flex',
          gap: 16,
        }}
      >
        <span>
          <kbd
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)',
              fontFamily: 'monospace',
              fontSize: 11,
            }}
          >
            E
          </kbd>{' '}
          閉じる
        </span>
        <span>
          <kbd
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)',
              fontFamily: 'monospace',
              fontSize: 11,
            }}
          >
            ESC
          </kbd>{' '}
          閉じる
        </span>
      </div>
    </div>
  );
}
