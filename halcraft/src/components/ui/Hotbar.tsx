// ホットバー（ブロック・武器選択UI）コンポーネント
// 画面下部にマイクラ風の持ち物選択バーを表示
// モバイルではタップで選択可能

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayerStore, type EquippedItem } from '../../stores/usePlayerStore';
import { useInventoryStore } from '../../stores/useInventoryStore';
import { useGameStore } from '../../stores/useGameStore';
import { useModeFlowStore } from '../../stores/useModeFlowStore';
import { useVehicleStore } from '../../stores/useVehicleStore';
import { useStageBuildScoreStore } from '../../stores/useStageBuildScoreStore';
import { useStageChallengeStore } from '../../stores/useStageChallengeStore';
import {
  getMasteryProgress,
  getMasteryTitle,
  MASTERY_DEFS,
  type MasteryEvent,
  type MasteryItemState,
  useMasteryStore,
} from '../../stores/useMasteryStore';
import { BLOCK_DEFS, type BlockId } from '../../types/blocks';
import {
  getFirstHotbarBlock,
  getHotbarItemBlockId,
  isBlockHotbarItem,
  isWeaponHotbarItem,
  type WeaponItem,
} from '../../types/hotbar';
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
import { getNextMasteryPerkSummary } from '../../types/masteryPerks';
import type { StageDefinition } from '../../types/stages';
import { getBlockUseProfile } from '../../utils/blockUseFeedback';
import { isTouchDevice } from '../../utils/device';
import { useSimpleHud } from '../../utils/hudDensity';
import { playBlockUseFeedbackSound } from '../../utils/sounds';

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

interface WeaponTacticPanel {
  icon: string;
  title: string;
  role: string;
  detail: string;
  masteryLabel: string;
  masteryDetail: string;
  masteryRatio: number;
  statusLabel: string;
  ratio: number;
  accent: string;
}

interface EquippedMasteryPulse {
  id: number;
  icon: string;
  label: string;
  detail: string;
  xpText: string;
  accent: string;
  glow: string;
}

interface WeaponHotbarMeta {
  icon: string;
  label: string;
  accent: string;
  glow: string;
}

const WEAPON_HOTBAR_META: Record<WeaponItem, WeaponHotbarMeta> = {
  rocket_launcher: {
    icon: '🚀',
    label: 'ロケット',
    accent: '#ffc06d',
    glow: 'rgba(255, 145, 72, 0.3)',
  },
  machine_gun: {
    icon: '🔫',
    label: '機関銃',
    accent: '#ffe28a',
    glow: 'rgba(255, 220, 90, 0.28)',
  },
  lightsaber: {
    icon: '⚔️',
    label: '剣',
    accent: '#c8b0ff',
    glow: 'rgba(170, 130, 255, 0.3)',
  },
  gravity_glove: {
    icon: '🧤',
    label: '引力',
    accent: '#9d8cff',
    glow: 'rgba(140, 120, 255, 0.32)',
  },
  bomb_slinger: {
    icon: '💣',
    label: 'ボム',
    accent: '#ff8a6a',
    glow: 'rgba(255, 120, 80, 0.32)',
  },
};

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
  glovePushReady: number;
  glovePulling: boolean;
  bombArmedCount: number;
  bombMaxCount: number;
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

  if (args.item === 'gravity_glove') {
    const ratio = clampRatio(args.glovePushReady);
    return {
      label: args.glovePulling ? 'PULL…' : ratio >= 1 ? 'PUSH' : `${Math.round(ratio * 100)}%`,
      ratio: args.glovePulling ? 1 : ratio,
      accent: args.tactic?.accent ?? '#9d8cff',
    };
  }

  if (args.item === 'bomb_slinger') {
    const max = Math.max(1, args.bombMaxCount);
    const ratio = clampRatio(args.bombArmedCount / max);
    return {
      label: `${args.bombArmedCount}/${max}`,
      ratio: ratio <= 0 ? 0.08 : ratio,
      accent: args.tactic?.accent ?? '#ff8a6a',
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

function getWeaponTacticPanel(args: {
  item: EquippedItem;
  stage: StageDefinition | null;
  mastery: MasteryItemState | undefined;
  modeRule: ReturnType<typeof getStageModeRule>;
  readiness: ItemReadinessBadge | null;
  tactic: ItemTacticBadge | null;
}): WeaponTacticPanel | null {
  if (args.item === 'builder') return null;

  const mastery = args.mastery;
  const accent = args.tactic?.accent
    ?? args.readiness?.accent
    ?? (args.item === 'rocket_launcher' ? '#ffc06d' : args.item === 'machine_gun' ? '#ffe28a' : '#c8b0ff');
  const statusLabel = args.readiness?.label
    ?? (args.tactic?.matched ? 'MAP MATCH' : args.stage?.category === 'war' ? '作戦中' : '自由装備');
  const ratio = args.readiness?.ratio ?? 1;
  const stageLead = args.tactic?.matched
    ? `このマップの主役: ${args.tactic.label}`
    : args.tactic
      ? `推奨は${args.tactic.label}`
      : args.stage
        ? args.stage.rules.shortPitch
        : '好きなタイミングで切り替え';
  const meterLead = args.modeRule && args.stage?.category === 'war'
    ? `${args.modeRule.meterLabel}: ${args.modeRule.actionLabel}`
    : stageLead;
  const masteryLevel = mastery?.level ?? 1;
  const masteryTitle = getMasteryTitle(args.item, masteryLevel);
  const nextPerk = getNextMasteryPerkSummary(args.item, masteryLevel);
  const masteryLabel = `Lv.${masteryLevel} ${masteryTitle}`;
  const masteryDetail = mastery
    ? nextPerk ?? `${mastery.totalXp}XP / 特典MAX`
    : '使うほど特典が育つ';
  const masteryRatio = mastery ? getMasteryProgress(mastery) : 0;

  if (args.item === 'rocket_launcher') {
    return {
      icon: '🚀',
      title: 'ロケット',
      role: '範囲火力',
      detail: args.tactic?.matched ? meterLead : `${stageLead} / ボス・密集対策`,
      masteryLabel,
      masteryDetail,
      masteryRatio,
      statusLabel,
      ratio,
      accent,
    };
  }

  if (args.item === 'machine_gun') {
    return {
      icon: '🔫',
      title: '機関銃',
      role: '連射制圧',
      detail: args.stage?.category === 'war' ? meterLead : `${stageLead} / 近づく敵を止める`,
      masteryLabel,
      masteryDetail,
      masteryRatio,
      statusLabel,
      ratio,
      accent,
    };
  }

  if (args.item === 'gravity_glove') {
    return {
      icon: '🧤',
      title: '引力グローブ',
      role: '引き寄せ/押し',
      detail: '長押しで引き寄せ、右クリックで押し飛ばし',
      masteryLabel,
      masteryDetail,
      masteryRatio,
      statusLabel,
      ratio,
      accent: accent === '#c8b0ff' ? '#9d8cff' : accent,
    };
  }

  if (args.item === 'bomb_slinger') {
    return {
      icon: '💣',
      title: 'ボムスリンガー',
      role: '仕掛け爆破',
      detail: '左で投げる・右で一斉起爆（最大複数）',
      masteryLabel,
      masteryDetail,
      masteryRatio,
      statusLabel,
      ratio,
      accent: accent === '#c8b0ff' ? '#ff8a6a' : accent,
    };
  }

  return {
    icon: '⚔️',
    title: '剣',
    role: '近距離突破',
    detail: args.stage?.category === 'war' ? meterLead : `${stageLead} / 硬い敵を崩す`,
    masteryLabel,
    masteryDetail,
    masteryRatio,
    statusLabel,
    ratio,
    accent,
  };
}

function getEquippedMasteryPulse(
  event: MasteryEvent | null,
  equippedItem: EquippedItem,
  fallbackAccent: string,
): EquippedMasteryPulse | null {
  if (!event || event.item !== equippedItem) return null;

  const def = MASTERY_DEFS[equippedItem];
  const isBigMoment = event.techniqueTierUnlocked || event.leveledUp || event.techniqueRecordUpdated;
  const accent = event.techniqueTierUnlocked
    ? def.accent
    : event.leveledUp
      ? '#ffe678'
      : event.techniqueRecordUpdated
        ? def.accent
        : fallbackAccent;
  const label = event.techniqueTierUnlocked
    ? `${event.techniqueTierLabel} 解放`
    : event.leveledUp
      ? `Lv.${event.level} レベルアップ`
      : event.techniqueRecordUpdated
        ? '技記録更新'
        : event.label;
  const streakText = event.streak >= 3 ? ` / x${event.streak}` : '';
  const detail = event.techniqueTierUnlocked
    ? event.techniqueBonusLabel
    : isBigMoment
      ? `${event.label}${streakText}`
      : `${def.shortLabel} 成長${streakText}`;

  return {
    id: event.id,
    icon: def.icon,
    label,
    detail,
    xpText: `+${event.xp}XP`,
    accent,
    glow: def.glow,
  };
}

export function Hotbar() {
  const selectedSlot = usePlayerStore((s) => s.selectedSlot);
  const selectSlot = usePlayerStore((s) => s.selectSlot);
  const hotbarSlots = usePlayerStore((s) => s.hotbarSlots);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);
  const rocketCharge = usePlayerStore((s) => s.rocketCharge);
  const glovePushReady = usePlayerStore((s) => s.glovePushReady);
  const glovePulling = usePlayerStore((s) => s.glovePulling);
  const bombArmedCount = usePlayerStore((s) => s.bombArmedCount);
  const bombMaxCount = usePlayerStore((s) => s.bombMaxCount);
  const attackCharge = usePlayerStore((s) => s.attackCharge);
  const items = useInventoryStore((s) => s.items);
  const currentStageId = useGameStore((s) => s.currentStageId);
  const currentStage = useGameStore((s) => s.currentStage);
  const challengeStats = useStageChallengeStore((s) => s.stats);
  const completedChallengeIds = useStageChallengeStore((s) => s.completedIds);
  const buildScore = useStageBuildScoreStore((s) => s.score);
  const buildMilestones = useStageBuildScoreStore((s) => s.achievedMilestones);
  const modeMeter = useModeFlowStore((s) => s.meter);
  const selectedMastery = useMasteryStore((s) => s.items[equippedItem]);
  const recentMasteryEvent = useMasteryStore((s) => s.recentEvent);
  const buildFocusUntil = useModeFlowStore((s) => s.buildFocusUntil);
  const buildFocusChain = useModeFlowStore((s) => s.buildFocusChain);
  const buildFocusChainExpiresAt = useModeFlowStore((s) => s.buildFocusChainExpiresAt);
  const [now, setNow] = useState(() => performance.now());
  const [selectionPulseKey, setSelectionPulseKey] = useState(0);
  const previousSelectionKeyRef = useRef<string | null>(null);

  const isTouch = isTouchDevice();
  const isCompactHud = useSimpleHud();
  const selectedHotbarItem = hotbarSlots[selectedSlot];
  const selectedIsBlock = isBlockHotbarItem(selectedHotbarItem);
  const selectedBlock = getHotbarItemBlockId(
    selectedHotbarItem,
    getFirstHotbarBlock(hotbarSlots),
  );
  const selectedDef = BLOCK_DEFS[selectedBlock];
  const selectedCount = items[selectedBlock] ?? 0;
  const selectedProfile = getBlockUseProfile(selectedBlock, currentStageId);
  const modeRule = getStageModeRule(currentStageId);
  const selectedItemTactic = getItemTacticBadge(equippedItem, currentStage);
  const selectedItemReadiness = getItemReadinessBadge({
    item: equippedItem,
    rocketCharge,
    attackCharge,
    glovePushReady,
    glovePulling,
    bombArmedCount,
    bombMaxCount,
    tactic: selectedItemTactic,
  });
  const selectedWeaponPanel = getWeaponTacticPanel({
    item: equippedItem,
    stage: currentStage,
    mastery: selectedMastery,
    modeRule,
    readiness: selectedItemReadiness,
    tactic: selectedItemTactic,
  });
  const equippedMasteryPulse = getEquippedMasteryPulse(
    recentMasteryEvent,
    equippedItem,
    selectedWeaponPanel?.accent ?? selectedProfile.accent,
  );
  const buildFocusActive = currentStage?.category === 'build' && buildFocusUntil > now;
  const activeBuildFocusChain = buildFocusChainExpiresAt > now ? buildFocusChain : 0;
  const buildFocusAccent = modeRule?.accent ?? selectedProfile.accent;
  const selectedStageHint = selectedIsBlock
    ? getSelectedBlockStageHint({
        stage: currentStage,
        blockId: selectedBlock,
        challengeStats,
        completedChallengeIds,
        buildScore,
        buildMilestones,
        modeMeter,
      })
    : null;

  // セルサイズ（モバイルではやや小さめ）
  const cellSize = isTouch ? 40 : 48;
  const imgSize = isTouch ? 28 : 36;

  useEffect(() => {
    if (currentStage?.category !== 'build') return undefined;
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [currentStage?.category]);

  useEffect(() => {
    const selectionKey = `${selectedSlot}:${String(selectedHotbarItem)}`;
    if (previousSelectionKeyRef.current === null) {
      previousSelectionKeyRef.current = selectionKey;
      return;
    }
    if (previousSelectionKeyRef.current === selectionKey) return;
    previousSelectionKeyRef.current = selectionKey;
    if (equippedItem === 'builder' && selectedIsBlock) {
      playBlockUseFeedbackSound(selectedProfile.soundKind);
    }
    const timer = window.setTimeout(() => {
      setSelectionPulseKey((value) => value + 1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [equippedItem, selectedHotbarItem, selectedIsBlock, selectedProfile.soundKind, selectedSlot]);

  // テクスチャをdata URLに変換して表示用に準備（hotbarSlotsが変わるたび再計算）
  const textures = useMemo(() => {
    const map = new Map<number, string>();
    hotbarSlots.forEach((item) => {
      if (!isBlockHotbarItem(item)) return;
      const def = BLOCK_DEFS[item];
      if (def) {
        map.set(item, `/textures/blocks/${def.texture}`);
      }
    });
    return map;
  }, [hotbarSlots]);

  // 乗り物搭乗中は下端HUDを隠して射撃・計器の視界を優先
  if (activeVehicle !== null) return null;

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
      {!isCompactHud && equippedMasteryPulse && (
        <div
          id="equipped-mastery-pulse"
          key={`equipped-mastery-pulse-${equippedMasteryPulse.id}`}
          style={{
            minWidth: isTouch ? 224 : 300,
            maxWidth: 'calc(100vw - 32px)',
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr) auto',
            alignItems: 'center',
            gap: isTouch ? 8 : 10,
            padding: isTouch ? '7px 10px' : '7px 12px',
            borderRadius: 999,
            border: `1px solid ${equippedMasteryPulse.accent}88`,
            background: `linear-gradient(135deg, ${equippedMasteryPulse.accent}2e, rgba(8, 10, 16, 0.72))`,
            color: '#fff',
            boxShadow: `0 8px 22px rgba(0,0,0,0.26), 0 0 22px ${equippedMasteryPulse.accent}38`,
            backdropFilter: 'blur(9px)',
            WebkitBackdropFilter: 'blur(9px)',
            fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
            pointerEvents: 'none',
            position: 'relative',
            overflow: 'hidden',
            animation: 'equippedMasteryPulse 1.9s ease-out both',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(100deg, transparent, ${equippedMasteryPulse.accent}45, transparent)`,
              transform: 'translateX(-72%)',
              animation: 'hotbarSelectSweep 0.72s ease-out both',
            }}
          />
          <span
            style={{
              position: 'relative',
              zIndex: 1,
              width: isTouch ? 24 : 28,
              height: isTouch ? 24 : 28,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 999,
              background: `${equippedMasteryPulse.accent}24`,
              border: `1px solid ${equippedMasteryPulse.accent}55`,
              boxShadow: `0 0 12px ${equippedMasteryPulse.glow}`,
              fontSize: isTouch ? 14 : 16,
            }}
          >
            {equippedMasteryPulse.icon}
          </span>
          <span
            style={{
              position: 'relative',
              zIndex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <span
              style={{
                color: equippedMasteryPulse.accent,
                fontSize: isTouch ? 10 : 11,
                lineHeight: '13px',
                fontWeight: 950,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {equippedMasteryPulse.label}
            </span>
            {!isTouch && (
              <span
                style={{
                  color: 'rgba(255,255,255,0.66)',
                  fontSize: 10,
                  lineHeight: '12px',
                  fontWeight: 800,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {equippedMasteryPulse.detail}
              </span>
            )}
          </span>
          <span
            style={{
              position: 'relative',
              zIndex: 1,
              color: '#fff',
              background: `${equippedMasteryPulse.accent}2a`,
              border: `1px solid ${equippedMasteryPulse.accent}55`,
              borderRadius: 999,
              padding: '3px 8px',
              fontSize: isTouch ? 10 : 11,
              lineHeight: '12px',
              fontWeight: 950,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {equippedMasteryPulse.xpText}
          </span>
        </div>
      )}

      {!isCompactHud && equippedItem === 'builder' && selectedIsBlock && selectedDef && (
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
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {selectionPulseKey > 0 && (
            <span
              key={`selected-block-panel-${selectionPulseKey}`}
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 999,
                background: `linear-gradient(100deg, transparent, ${selectedProfile.accent}4d, transparent)`,
                animation: 'hotbarSelectSweep 0.42s ease-out both',
              }}
            />
          )}
          <span
            style={{
              position: 'relative',
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
              position: 'relative',
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

      {!isCompactHud && selectedWeaponPanel && (
        <div
          id="weapon-tactic-panel"
          style={{
            minWidth: isTouch ? 250 : 320,
            maxWidth: 'calc(100vw - 32px)',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            alignItems: 'center',
            gap: 12,
            padding: isTouch ? '8px 12px' : '7px 12px',
            borderRadius: 999,
            border: `1px solid ${selectedWeaponPanel.accent}7a`,
            background: `linear-gradient(135deg, ${selectedWeaponPanel.accent}22, rgba(10, 11, 18, 0.72))`,
            color: '#fff',
            boxShadow: `0 8px 24px rgba(0,0,0,0.22), 0 0 20px ${selectedWeaponPanel.accent}28`,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 8,
              right: 8,
              bottom: 4,
              height: 3,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.12)',
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                display: 'block',
                width: `${Math.round(selectedWeaponPanel.ratio * 100)}%`,
                height: '100%',
                borderRadius: 999,
                background: `linear-gradient(90deg, ${selectedWeaponPanel.accent}, #ffffff)`,
                boxShadow: `0 0 10px ${selectedWeaponPanel.accent}88`,
              }}
            />
          </span>
          <span
            style={{
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              overflow: 'hidden',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minWidth: 0,
                fontSize: isTouch ? 12 : 13,
                fontWeight: 950,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ flex: '0 0 auto', filter: `drop-shadow(0 0 7px ${selectedWeaponPanel.accent})` }}>
                {selectedWeaponPanel.icon}
              </span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedWeaponPanel.title}
              </span>
              <span
                style={{
                  flex: '0 0 auto',
                  color: selectedWeaponPanel.accent,
                  fontSize: isTouch ? 9 : 10,
                  fontWeight: 950,
                }}
              >
                {selectedWeaponPanel.role}
              </span>
            </span>
            <span
              style={{
                color: 'rgba(255,255,255,0.72)',
                fontSize: isTouch ? 10 : 11,
                lineHeight: '13px',
                fontWeight: 800,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedWeaponPanel.detail}
            </span>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minWidth: 0,
                color: selectedWeaponPanel.accent,
                fontSize: isTouch ? 9 : 10,
                lineHeight: '12px',
                fontWeight: 900,
              }}
            >
              <span style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}>
                {selectedWeaponPanel.masteryLabel}
              </span>
              <span
                style={{
                  minWidth: 0,
                  flex: 1,
                  color: 'rgba(255,255,255,0.58)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedWeaponPanel.masteryDetail}
              </span>
              <span
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  width: isTouch ? 34 : 44,
                  height: 3,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.14)',
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: `${Math.round(selectedWeaponPanel.masteryRatio * 100)}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: selectedWeaponPanel.accent,
                    boxShadow: `0 0 8px ${selectedWeaponPanel.accent}88`,
                  }}
                />
              </span>
            </span>
          </span>
          <span
            style={{
              position: 'relative',
              zIndex: 1,
              flexShrink: 0,
              minWidth: isTouch ? 54 : 66,
              textAlign: 'center',
              padding: '4px 9px',
              borderRadius: 999,
              background: `${selectedWeaponPanel.accent}24`,
              color: selectedWeaponPanel.accent,
              fontSize: isTouch ? 11 : 12,
              fontWeight: 950,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {selectedWeaponPanel.statusLabel}
          </span>
        </div>
      )}

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
        {hotbarSlots.map((item, index) => {
          const isSelected = index === selectedSlot;
          const isWeapon = isWeaponHotbarItem(item);
          const blockId = isBlockHotbarItem(item) ? item : null;
          const weaponId = isWeapon ? item : null;
          const def = blockId !== null ? BLOCK_DEFS[blockId] : null;
          const texUrl = blockId !== null ? textures.get(blockId) : null;
          const count = blockId !== null ? (items[blockId] ?? 0) : 0;
          const hasItem = isWeapon || count > 0;
          const weaponMeta = weaponId ? WEAPON_HOTBAR_META[weaponId] : null;
          const blockProfile = blockId !== null ? getBlockUseProfile(blockId, currentStageId) : null;
          const tactic = weaponId ? getItemTacticBadge(weaponId, currentStage) : null;
          const readiness = weaponId
            ? getItemReadinessBadge({
                item: weaponId,
                rocketCharge,
                attackCharge,
                glovePushReady,
                glovePulling,
                bombArmedCount,
                bombMaxCount,
                tactic,
              })
            : null;
          const accent = weaponMeta?.accent ?? blockProfile?.accent ?? '#ffffff';
          const glow = weaponMeta?.glow ?? blockProfile?.glow ?? 'rgba(255,255,255,0.2)';
          const slotLabel = weaponMeta?.label ?? def?.name ?? 'アイテム';

          return (
            <div
              key={`${String(item)}-${index}`}
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
                  ? `3px solid ${accent}`
                  : `2px solid ${hasItem ? `${accent}66` : 'rgba(255,255,255,0.18)'}`,
                borderRadius: 4,
                background: isSelected
                  ? `linear-gradient(135deg, ${glow}, rgba(255,255,255,0.14))`
                  : 'rgba(0,0,0,0.3)',
                opacity: hasItem ? 1 : 0.46,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                boxShadow: isSelected
                  ? `0 0 0 1px rgba(255,255,255,0.55), 0 0 16px ${glow}`
                  : 'none',
                animation: isSelected && selectionPulseKey > 0 ? 'hotbarSlotSelectPop 0.48s ease-out both' : undefined,
                transform: isSelected ? 'translateY(-2px)' : 'translateY(0)',
                transition: 'transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease, background 0.12s ease',
                imageRendering: 'pixelated',
                touchAction: 'none',
                WebkitTapHighlightColor: 'transparent',
                cursor: 'pointer',
              }}
            >
              {isSelected && selectionPulseKey > 0 && (
                <span
                  key={`selected-slot-flash-${selectionPulseKey}`}
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    inset: -7,
                    borderRadius: 8,
                    border: `2px solid ${accent}`,
                    boxShadow: `0 0 18px ${glow}`,
                    animation: 'hotbarSlotSelectRing 0.48s ease-out both',
                  }}
                />
              )}
              {weaponMeta ? (
                <span
                  aria-label={weaponMeta.label}
                  style={{
                    fontSize: isTouch ? 22 : 26,
                    lineHeight: 1,
                    filter: `drop-shadow(0 0 7px ${accent})`,
                    transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                    pointerEvents: 'none',
                  }}
                >
                  {weaponMeta.icon}
                </span>
              ) : texUrl ? (
                <img
                  src={texUrl}
                  alt={slotLabel}
                  style={{
                    width: imgSize,
                    height: imgSize,
                    imageRendering: 'pixelated',
                    objectFit: 'cover',
                    pointerEvents: 'none',
                  }}
                />
              ) : null}
              {hasItem && (
                <span
                  title={weaponMeta?.label ?? blockProfile?.eyebrow}
                  style={{
                    position: 'absolute',
                    top: 3,
                    right: 3,
                    width: isSelected ? 8 : 6,
                    height: isSelected ? 8 : 6,
                    borderRadius: 999,
                    background: accent,
                    boxShadow: `0 0 8px ${glow}`,
                    border: '1px solid rgba(0,0,0,0.35)',
                  }}
                />
              )}
              {weaponMeta && readiness ? (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: 5,
                    right: 5,
                    bottom: 3,
                    height: 3,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.13)',
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
              ) : (
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
