// 熟練度HUD
// 現在装備している道具の成長と、直近の上達イベントを表示する

import { useEffect } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { usePlayerStore, type EquippedItem } from '../../stores/usePlayerStore';
import { useInventoryStore } from '../../stores/useInventoryStore';
import {
  getMasteryProgress,
  getMasteryTitle,
  MASTERY_DEFS,
  useMasteryStore,
} from '../../stores/useMasteryStore';
import { BLOCK_DEFS, HOTBAR_BLOCKS, type BlockId } from '../../types/blocks';
import { getMasteryPerkSummary, getNextMasteryPerkSummary } from '../../types/masteryPerks';
import {
  formatStageCombatBonus,
  getStageCombatStyle,
  getStageCombatStyleForItem,
  getStageCombatWeaponLabel,
  type StageCombatStyle,
} from '../../types/stageCombatStyles';
import { getBlockUseHint } from '../../utils/blockUseFeedback';
import { isTouchDevice } from '../../utils/device';
import { HUD_TEXT_SHADOW, SG } from './startScreenTheme';

interface ItemActionStatus {
  label: string;
  detail: string;
  meterLabel: string;
  meterText: string;
  meterRatio: number;
  meterColor: string;
}

interface ItemActionStatusOptions {
  equippedItem: EquippedItem;
  selectedBlock: BlockId;
  selectedBlockName: string;
  selectedCount: number;
  currentStageId: string | null;
  isPlaceMode: boolean;
  rocketCharge: number;
  rocketCooldown: number;
  attackCharge: number;
  stageStyle: StageCombatStyle | null;
  recommendedStageStyle: StageCombatStyle | null;
  swapActionLabel: string;
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function formatCooldown(seconds: number): string {
  if (seconds <= 0) return '0s';
  return seconds < 1 ? `${seconds.toFixed(1)}s` : `${Math.ceil(seconds)}s`;
}

function getItemActionStatus({
  equippedItem,
  selectedBlock,
  selectedBlockName,
  selectedCount,
  currentStageId,
  isPlaceMode,
  rocketCharge,
  rocketCooldown,
  attackCharge,
  stageStyle,
  recommendedStageStyle,
  swapActionLabel,
}: ItemActionStatusOptions): ItemActionStatus {
  if (recommendedStageStyle && recommendedStageStyle.weapon !== equippedItem) {
    return {
      label: 'マップ相性OFF',
      detail: `${recommendedStageStyle.shortLabel}: ${swapActionLabel}${getStageCombatWeaponLabel(recommendedStageStyle.weapon)} / ${formatStageCombatBonus(recommendedStageStyle)}`,
      meterLabel: 'MAP',
      meterText: 'SWAP',
      meterRatio: 0.26,
      meterColor: recommendedStageStyle.accent,
    };
  }

  if (equippedItem === 'builder') {
    const hasStock = selectedCount > 0;
    return {
      label: isPlaceMode ? '設置準備' : '建築操作',
      detail: hasStock
        ? `${selectedBlockName}: ${getBlockUseHint(selectedBlock, currentStageId)}`
        : `${selectedBlockName}: 素材なし / クラフトで補充`,
      meterLabel: '素材',
      meterText: `x${selectedCount}`,
      meterRatio: hasStock ? clampRatio(selectedCount / 24) : 0,
      meterColor: hasStock ? '#9bdcff' : '#ff9a9a',
    };
  }

  if (equippedItem === 'rocket_launcher') {
    const ready = rocketCharge >= 1;
    return {
      label: ready ? '爆風準備OK' : '再装填中',
      detail: stageStyle ? formatStageCombatBonus(stageStyle) : '群れや大型敵に合わせて撃つ',
      meterLabel: 'RKT',
      meterText: ready ? 'READY' : formatCooldown(rocketCooldown),
      meterRatio: clampRatio(rocketCharge),
      meterColor: ready ? '#ffc06d' : '#ff7a4f',
    };
  }

  if (equippedItem === 'machine_gun') {
    return {
      label: stageStyle ? 'マップ相性発動' : '制圧射撃',
      detail: stageStyle ? formatStageCombatBonus(stageStyle) : '長押しで足止め / 右クリックでスコープ',
      meterLabel: 'BURST',
      meterText: stageStyle ? 'BOOST' : 'READY',
      meterRatio: stageStyle ? 1 : 0.76,
      meterColor: '#ffe28a',
    };
  }

  const ready = attackCharge >= 1;
  return {
    label: stageStyle ? 'コンボ相性発動' : ready ? '斬撃準備OK' : '斬撃リカバー',
    detail: stageStyle ? formatStageCombatBonus(stageStyle) : '近距離で5段コンボをつなぐ',
    meterLabel: 'COMBO',
    meterText: ready ? 'READY' : `${Math.round(clampRatio(attackCharge) * 100)}%`,
    meterRatio: clampRatio(attackCharge),
    meterColor: '#c8b0ff',
  };
}

export function MasteryHUD() {
  const phase = useGameStore((s) => s.phase);
  const currentStageId = useGameStore((s) => s.currentStageId);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const selectedSlot = usePlayerStore((s) => s.selectedSlot);
  const hotbarSlots = usePlayerStore((s) => s.hotbarSlots);
  const isPlaceMode = usePlayerStore((s) => s.isPlaceMode);
  const rocketCharge = usePlayerStore((s) => s.rocketCharge);
  const rocketCooldown = usePlayerStore((s) => s.rocketCooldown);
  const attackCharge = usePlayerStore((s) => s.attackCharge);
  const mastery = useMasteryStore((s) => s.items[equippedItem]);
  const recentEvent = useMasteryStore((s) => s.recentEvent);
  const clearRecentEvent = useMasteryStore((s) => s.clearRecentEvent);
  const items = useInventoryStore((s) => s.items);
  const isTouch = isTouchDevice();

  useEffect(() => {
    if (!recentEvent) return undefined;
    const timer = window.setTimeout(() => {
      clearRecentEvent();
    }, 1900);
    return () => window.clearTimeout(timer);
  }, [clearRecentEvent, recentEvent]);

  if (phase !== 'playing' || !mastery) return null;

  const def = MASTERY_DEFS[equippedItem];
  const progress = getMasteryProgress(mastery);
  const title = getMasteryTitle(equippedItem, mastery.level);
  const perkSummary = getMasteryPerkSummary(equippedItem, mastery.level);
  const nextPerkSummary = getNextMasteryPerkSummary(equippedItem, mastery.level);
  const stageStyle = getStageCombatStyleForItem(currentStageId, equippedItem);
  const recommendedStageStyle = getStageCombatStyle(currentStageId);
  const eventMatches = recentEvent?.item === equippedItem;
  const statLabel = equippedItem === 'builder'
    ? `${mastery.blocksChanged} ブロック`
    : `${mastery.hits} HIT / ${mastery.defeats} DOWN`;
  const selectedBlock = hotbarSlots[selectedSlot] ?? hotbarSlots[0] ?? HOTBAR_BLOCKS[0];
  const selectedDef = BLOCK_DEFS[selectedBlock];
  const selectedCount = items[selectedBlock] ?? 0;
  const actionStatus = getItemActionStatus({
    equippedItem,
    selectedBlock,
    selectedBlockName: selectedDef?.name ?? 'ブロック',
    selectedCount,
    currentStageId,
    isPlaceMode,
    rocketCharge,
    rocketCooldown,
    attackCharge,
    stageStyle,
    recommendedStageStyle,
    swapActionLabel: isTouch ? '装備ボタンで' : 'Vで',
  });

  return (
    <div
      id="mastery-hud"
      style={{
        position: 'fixed',
        left: isTouch ? 'calc(50% + 43px)' : 16,
        top: 'auto',
        bottom: isTouch ? 'calc(132px + env(safe-area-inset-bottom))' : 116,
        transform: isTouch ? 'translateX(-50%)' : 'none',
        zIndex: 101,
        width: isTouch ? 'max(136px, min(166px, calc(100vw - 224px)))' : 252,
        padding: 0,
        background: 'none',
        border: 'none',
        boxShadow: 'none',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        color: '#fff',
        pointerEvents: 'none',
        textShadow: HUD_TEXT_SHADOW,
        fontFamily: SG.font,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <div
          style={{
            fontSize: isTouch ? 18 : 21,
            flex: '0 0 auto',
            filter: `drop-shadow(0 0 7px ${def.accent})`,
          }}
        >
          {def.icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              color: def.accent,
              fontSize: isTouch ? 10 : 11,
              lineHeight: '13px',
              fontWeight: 900,
              letterSpacing: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {def.shortLabel} Lv.{mastery.level}
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.94)',
              fontSize: isTouch ? 12 : 13,
              lineHeight: '16px',
              fontWeight: 900,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
        </div>
        <div
          style={{
            minWidth: 46,
            display: isTouch ? 'none' : 'block',
            textAlign: 'right',
            color: 'rgba(255,255,255,0.74)',
            fontSize: isTouch ? 9 : 10,
            lineHeight: '12px',
            fontWeight: 800,
            fontFamily: 'monospace',
          }}
        >
          {statLabel}
        </div>
      </div>

      <div
        style={{
          marginTop: 7,
          height: 5,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.13)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: '100%',
            borderRadius: 999,
            background: `linear-gradient(90deg, ${def.accent}, #ffffff)`,
            boxShadow: `0 0 10px ${def.glow}`,
            transition: 'width 0.28s ease',
          }}
        />
      </div>

      <div
        style={{
          marginTop: 6,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          color: 'rgba(255,255,255,0.62)',
          fontSize: isTouch ? 9 : 10,
          lineHeight: '13px',
          fontWeight: 800,
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {def.actionLabel}
        </span>
        <span style={{ flex: '0 0 auto', fontFamily: 'monospace' }}>
          {mastery.xp}/{mastery.xpToNextLevel}
        </span>
      </div>

      <div
        style={{
          marginTop: 7,
          paddingLeft: 9,
          borderLeft: `3px solid ${actionStatus.meterColor}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span
            style={{
              minWidth: 0,
              color: 'rgba(255,255,255,0.9)',
              fontSize: isTouch ? 10 : 11,
              lineHeight: '13px',
              fontWeight: 950,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {actionStatus.label}
          </span>
          <span
            style={{
              flex: '0 0 auto',
              color: actionStatus.meterColor,
              fontSize: isTouch ? 9 : 10,
              lineHeight: '12px',
              fontWeight: 950,
              fontFamily: 'monospace',
            }}
          >
            {actionStatus.meterLabel} {actionStatus.meterText}
          </span>
        </div>
        <div
          style={{
            marginTop: 5,
            height: 4,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.12)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.round(actionStatus.meterRatio * 100)}%`,
              height: '100%',
              borderRadius: 999,
              background: `linear-gradient(90deg, ${actionStatus.meterColor}, #ffffff)`,
              boxShadow: `0 0 9px ${actionStatus.meterColor}55`,
              transition: 'width 0.2s ease',
            }}
          />
        </div>
        <div
          style={{
            marginTop: 4,
            color: 'rgba(255,255,255,0.54)',
            fontSize: isTouch ? 9 : 10,
            lineHeight: '12px',
            fontWeight: 750,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {actionStatus.detail}
        </div>
      </div>

      <div
        style={{
          marginTop: 5,
          display: isTouch ? 'none' : 'flex',
          flexDirection: 'column',
          gap: 2,
          color: def.accent,
          fontSize: isTouch ? 9 : 10,
          lineHeight: '13px',
          fontWeight: 900,
        }}
      >
        <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          特典: {perkSummary}
        </span>
        {nextPerkSummary && (
          <span
            style={{
              color: 'rgba(255,255,255,0.48)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            次: {nextPerkSummary}
          </span>
        )}
        {stageStyle && (
          <span
            style={{
              color: stageStyle.accent,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            マップ: {stageStyle.shortLabel} / {formatStageCombatBonus(stageStyle)}
          </span>
        )}
        {!stageStyle && recommendedStageStyle && (
          <span
            style={{
              color: recommendedStageStyle.accent,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            推奨: {getStageCombatWeaponLabel(recommendedStageStyle.weapon)} / {formatStageCombatBonus(recommendedStageStyle)}
          </span>
        )}
      </div>

      {eventMatches && (
        <div
          key={recentEvent.id}
          style={{
            marginTop: 7,
            paddingLeft: 9,
            borderLeft: `3px solid ${recentEvent.leveledUp ? '#ffe678' : 'rgba(255,255,255,0.5)'}`,
            color: recentEvent.leveledUp ? '#fff0a8' : 'rgba(255,255,255,0.82)',
            fontSize: isTouch ? 10 : 11,
            lineHeight: '14px',
            fontWeight: 900,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            animation: 'masteryPulse 0.42s ease-out',
          }}
        >
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {recentEvent.leveledUp ? 'レベルアップ！' : recentEvent.label}
          </span>
          <span style={{ flex: '0 0 auto', fontFamily: 'monospace' }}>
            +{recentEvent.xp} XP
            {recentEvent.streak >= 3 ? ` x${recentEvent.streak}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
