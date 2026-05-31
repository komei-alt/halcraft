// ホットバー（ブロック選択UI）コンポーネント
// 画面下部にマイクラ風のブロック選択バーを表示
// モバイルではタップで選択可能

import { useEffect, useMemo, useState } from 'react';
import { usePlayerStore, type EquippedItem } from '../../stores/usePlayerStore';
import { useInventoryStore } from '../../stores/useInventoryStore';
import { useGameStore } from '../../stores/useGameStore';
import { useModeFlowStore } from '../../stores/useModeFlowStore';
import { useStageBuildScoreStore } from '../../stores/useStageBuildScoreStore';
import { useStageChallengeStore } from '../../stores/useStageChallengeStore';
import { BLOCK_DEFS, type BlockId } from '../../types/blocks';
import {
  getNextStageBuildMilestone,
  getStageBuildBlockScore,
  getStageBuildStyle,
} from '../../types/stageBuildStyles';
import {
  getStageChallengeProgress,
  getStageChallenges,
  type StageChallengeStats,
} from '../../types/stageChallenges';
import {
  getStageCombatStyle,
  getStageCombatWeaponLabel,
} from '../../types/stageCombatStyles';
import {
  getStageModeBuildGain,
  getStageModeRule,
} from '../../types/stageModeRules';
import type { StageDefinition } from '../../types/stages';
import { getBlockUseProfile } from '../../utils/blockUseFeedback';
import { isTouchDevice } from '../../utils/device';

interface HotbarStageHint {
  icon: string;
  label: string;
  detail: string;
  value: string;
  accent: string;
  ratio: number;
}

interface ItemTacticBadge {
  label: string;
  accent: string;
  matched: boolean;
}

interface ItemReadinessBadge {
  label: string;
  ratio: number;
  accent: string;
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getBlockChallengeHint(args: {
  stageId: string | null;
  blockId: BlockId;
  stats: StageChallengeStats;
  completedIds: string[];
}): HotbarStageHint | null {
  const challenge = getStageChallenges(args.stageId)
    .find((item) => (
      item.metric === 'block_group_placed'
      && item.blockIds?.includes(args.blockId)
      && !args.completedIds.includes(item.id)
    ));
  if (!challenge) return null;

  const progress = getStageChallengeProgress(challenge, args.stats);
  if (progress.completed) return null;
  const remaining = Math.max(0, progress.target - progress.current);

  return {
    icon: challenge.icon,
    label: 'チャレンジ',
    detail: challenge.title,
    value: remaining > 0 ? `あと${remaining}` : '達成',
    accent: challenge.accent,
    ratio: progress.ratio,
  };
}

function getBlockBuildHint(args: {
  stageId: string | null;
  blockId: BlockId;
  buildScore: number;
  buildMilestones: number[];
}): HotbarStageHint | null {
  const style = getStageBuildStyle(args.stageId);
  const blockScore = getStageBuildBlockScore(args.stageId, args.blockId);
  if (!style || !blockScore) return null;

  const nextMilestone = getNextStageBuildMilestone(args.buildScore, args.buildMilestones);
  const remaining = nextMilestone ? Math.max(0, nextMilestone - args.buildScore) : 0;

  return {
    icon: style.icon,
    label: `作品+${blockScore.points}`,
    detail: `${style.shortLabel}: ${blockScore.label}が評価対象`,
    value: nextMilestone ? `あと${remaining}pt` : '作品MAX',
    accent: style.accent,
    ratio: nextMilestone ? clampRatio(args.buildScore / nextMilestone) : 1,
  };
}

function getBlockModeHint(args: {
  stageId: string | null;
  blockId: BlockId;
  modeMeter: number;
}): HotbarStageHint | null {
  const rule = getStageModeRule(args.stageId);
  if (!rule || rule.category !== 'build') return null;

  const gain = getStageModeBuildGain(args.stageId, args.blockId);
  if (gain <= 0) return null;

  return {
    icon: rule.icon,
    label: `${rule.meterLabel}+${gain}`,
    detail: rule.shortLabel,
    value: `${Math.floor(args.modeMeter)}/${rule.threshold}`,
    accent: rule.accent,
    ratio: clampRatio(args.modeMeter / rule.threshold),
  };
}

function getSelectedBlockStageHint(args: {
  stage: StageDefinition | null;
  blockId: BlockId;
  challengeStats: StageChallengeStats;
  completedChallengeIds: string[];
  buildScore: number;
  buildMilestones: number[];
  modeMeter: number;
}): HotbarStageHint | null {
  const stageId = args.stage?.id ?? null;
  return getBlockChallengeHint({
    stageId,
    blockId: args.blockId,
    stats: args.challengeStats,
    completedIds: args.completedChallengeIds,
  })
    ?? getBlockBuildHint({
      stageId,
      blockId: args.blockId,
      buildScore: args.buildScore,
      buildMilestones: args.buildMilestones,
    })
    ?? getBlockModeHint({
      stageId,
      blockId: args.blockId,
      modeMeter: args.modeMeter,
    });
}

function getItemTacticBadge(
  item: EquippedItem,
  stage: StageDefinition | null,
): ItemTacticBadge | null {
  if (!stage) return null;

  if (item === 'builder') {
    const buildStyle = getStageBuildStyle(stage.id);
    if (!buildStyle) return null;
    return {
      label: buildStyle.shortLabel,
      accent: buildStyle.accent,
      matched: stage.category === 'build',
    };
  }

  const combatStyle = getStageCombatStyle(stage.id);
  if (!combatStyle) return null;
  return {
    label: combatStyle.weapon === item ? '推奨' : getStageCombatWeaponLabel(combatStyle.weapon),
    accent: combatStyle.accent,
    matched: combatStyle.weapon === item,
  };
}

function getItemReadinessBadge(args: {
  item: EquippedItem;
  rocketCharge: number;
  attackCharge: number;
  tactic: ItemTacticBadge | null;
}): ItemReadinessBadge | null {
  if (args.item === 'rocket_launcher') {
    const ratio = clampRatio(args.rocketCharge);
    return {
      label: ratio >= 1 ? 'READY' : `${Math.round(ratio * 100)}%`,
      ratio,
      accent: args.tactic?.accent ?? '#ffc06d',
    };
  }

  if (args.item === 'lightsaber') {
    const ratio = clampRatio(args.attackCharge);
    return {
      label: ratio >= 1 ? 'COMBO' : `${Math.round(ratio * 100)}%`,
      ratio,
      accent: args.tactic?.accent ?? '#c8b0ff',
    };
  }

  if (args.item === 'machine_gun') {
    return {
      label: args.tactic?.matched ? 'MAP' : 'BURST',
      ratio: 1,
      accent: args.tactic?.accent ?? '#ffe28a',
    };
  }

  if (args.tactic?.matched) {
    return {
      label: args.tactic.label,
      ratio: 1,
      accent: args.tactic.accent,
    };
  }

  return null;
}

export function Hotbar() {
  const selectedSlot = usePlayerStore((s) => s.selectedSlot);
  const selectSlot = usePlayerStore((s) => s.selectSlot);
  const hotbarSlots = usePlayerStore((s) => s.hotbarSlots);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const setEquippedItem = usePlayerStore((s) => s.setEquippedItem);
  const rocketCharge = usePlayerStore((s) => s.rocketCharge);
  const attackCharge = usePlayerStore((s) => s.attackCharge);
  const items = useInventoryStore((s) => s.items);
  const currentStageId = useGameStore((s) => s.currentStageId);
  const currentStage = useGameStore((s) => s.currentStage);
  const challengeStats = useStageChallengeStore((s) => s.stats);
  const completedChallengeIds = useStageChallengeStore((s) => s.completedIds);
  const buildScore = useStageBuildScoreStore((s) => s.score);
  const buildMilestones = useStageBuildScoreStore((s) => s.achievedMilestones);
  const modeMeter = useModeFlowStore((s) => s.meter);
  const buildFocusUntil = useModeFlowStore((s) => s.buildFocusUntil);
  const buildFocusChain = useModeFlowStore((s) => s.buildFocusChain);
  const buildFocusChainExpiresAt = useModeFlowStore((s) => s.buildFocusChainExpiresAt);
  const [now, setNow] = useState(() => performance.now());

  const isTouch = isTouchDevice();
  const selectedBlock = hotbarSlots[selectedSlot] ?? hotbarSlots[0];
  const selectedDef = BLOCK_DEFS[selectedBlock];
  const selectedCount = items[selectedBlock] ?? 0;
  const selectedProfile = getBlockUseProfile(selectedBlock, currentStageId);
  const modeRule = getStageModeRule(currentStageId);
  const buildFocusActive = currentStage?.category === 'build' && buildFocusUntil > now;
  const activeBuildFocusChain = buildFocusChainExpiresAt > now ? buildFocusChain : 0;
  const buildFocusAccent = modeRule?.accent ?? selectedProfile.accent;
  const selectedStageHint = getSelectedBlockStageHint({
    stage: currentStage,
    blockId: selectedBlock,
    challengeStats,
    completedChallengeIds,
    buildScore,
    buildMilestones,
    modeMeter,
  });

  // セルサイズ（モバイルではやや小さめ）
  const cellSize = isTouch ? 40 : 48;
  const imgSize = isTouch ? 28 : 36;

  useEffect(() => {
    if (currentStage?.category !== 'build') return undefined;
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [currentStage?.category]);

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
              ? `1px solid ${buildFocusActive ? buildFocusAccent : selectedProfile.accent}7a`
              : '1px solid rgba(255, 105, 105, 0.55)',
            background: selectedCount > 0
              ? buildFocusActive
                ? `linear-gradient(135deg, ${buildFocusAccent}38, ${selectedProfile.glow}, rgba(20, 24, 16, 0.76))`
                : `linear-gradient(135deg, ${selectedProfile.glow}, rgba(24, 20, 16, 0.72))`
              : 'rgba(70, 18, 18, 0.72)',
            color: '#fff',
            boxShadow: selectedCount > 0
              ? buildFocusActive
                ? `0 8px 24px rgba(0,0,0,0.22), 0 0 24px ${buildFocusAccent}55`
                : `0 8px 24px rgba(0,0,0,0.22), 0 0 18px ${selectedProfile.glow}`
              : '0 8px 24px rgba(0,0,0,0.22)',
            backdropFilter: 'blur(8px)',
            fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
            animation: buildFocusActive ? 'builderFocusPanel 0.9s ease-in-out infinite alternate' : undefined,
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
            {selectedCount > 0 && selectedStageHint && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  minWidth: 0,
                  color: selectedStageHint.accent,
                  fontSize: isTouch ? 9 : 10,
                  fontWeight: 900,
                  lineHeight: '12px',
                }}
              >
                <span style={{ flex: '0 0 auto' }}>{selectedStageHint.icon}</span>
                <span
                  style={{
                    flex: '0 0 auto',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {selectedStageHint.label}
                </span>
                <span
                  style={{
                    minWidth: 0,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'rgba(255,255,255,0.74)',
                  }}
                >
                  {selectedStageHint.detail}
                </span>
                <span
                  style={{
                    flex: '0 0 auto',
                    color: selectedStageHint.accent,
                    fontFamily: 'monospace',
                  }}
                >
                  {selectedStageHint.value}
                </span>
              </span>
            )}
            {selectedCount > 0 && buildFocusActive && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  minWidth: 0,
                  color: buildFocusAccent,
                  fontSize: isTouch ? 9 : 10,
                  fontWeight: 950,
                  lineHeight: '12px',
                }}
              >
                <span style={{ flex: '0 0 auto' }}>⚡</span>
                <span style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}>
                  高速建築
                </span>
                <span
                  style={{
                    minWidth: 0,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'rgba(255,255,255,0.74)',
                  }}
                >
                  置くテンポUP
                </span>
                <span style={{ flex: '0 0 auto', fontFamily: 'monospace' }}>
                  x{Math.max(1, activeBuildFocusChain)}
                </span>
              </span>
            )}
            {selectedCount > 0 && selectedStageHint && (
              <span
                style={{
                  height: 3,
                  width: '100%',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.13)',
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: `${Math.round(selectedStageHint.ratio * 100)}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: `linear-gradient(90deg, ${selectedStageHint.accent}, #ffffff)`,
                  }}
                />
              </span>
            )}
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
          const tactic = getItemTacticBadge(item.id, currentStage);
          const isMatchedTactic = Boolean(tactic?.matched);
          const readiness = getItemReadinessBadge({
            item: item.id,
            rocketCharge,
            attackCharge,
            tactic,
          });
          const showReadinessLabel = Boolean(
            readiness && (!tactic?.matched || item.id === 'rocket_launcher' || item.id === 'lightsaber'),
          );
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setEquippedItem(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                position: 'relative',
                overflow: 'hidden',
                padding: isTouch ? '7px 10px' : '6px 10px',
                borderRadius: 999,
                border: isSelected
                  ? `1px solid ${tactic?.accent ?? 'rgba(255, 206, 120, 0.62)'}`
                  : isMatchedTactic
                    ? `1px solid ${tactic?.accent}88`
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
                boxShadow: isMatchedTactic
                  ? `0 0 12px ${tactic?.accent}44`
                  : undefined,
              }}
            >
              {readiness && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: 6,
                    right: 6,
                    bottom: 3,
                    height: 2,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.12)',
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      width: `${Math.round(readiness.ratio * 100)}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: readiness.accent,
                      boxShadow: `0 0 8px ${readiness.accent}88`,
                    }}
                  />
                </span>
              )}
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {!isTouch && tactic && (
                <span
                  style={{
                    padding: '1px 4px',
                    borderRadius: 999,
                    color: tactic.accent,
                    background: `${tactic.accent}18`,
                    border: `1px solid ${tactic.accent}55`,
                    fontSize: 8,
                    lineHeight: '10px',
                    fontWeight: 900,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tactic.label}
                </span>
              )}
              {!isTouch && readiness && showReadinessLabel && (
                <span
                  style={{
                    padding: '1px 4px',
                    borderRadius: 999,
                    color: readiness.accent,
                    background: `${readiness.accent}16`,
                    border: `1px solid ${readiness.accent}44`,
                    fontSize: 8,
                    lineHeight: '10px',
                    fontWeight: 900,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {readiness.label}
                </span>
              )}
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
