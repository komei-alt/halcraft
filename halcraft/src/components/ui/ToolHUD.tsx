// ツールHUD — 装備中のツール名・耐久値バーを表示
// サバイバルモードのみ表示

import { useEffect, useState } from 'react';
import { useMiningFocusStore } from '../../stores/useMiningFocusStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useGameStore } from '../../stores/useGameStore';
import { useVehicleStore } from '../../stores/useVehicleStore';
import { TOOL_DEFS } from '../../types/tools';
import { isTouchDevice } from '../../utils/device';

const TOOL_TIER_LABELS: Record<number, string> = {
  0: '素手',
  1: '木',
  2: '石',
  3: '鉄',
  4: 'ダイヤ',
};

const TOOL_TYPE_LABELS = {
  pickaxe: '採掘',
  axe: '伐採',
  shovel: '整地',
  sword: '戦闘',
} as const;

const BLOCK_CATEGORY_LABELS: Record<string, string> = {
  stone: '石材',
  wood: '木材',
  dirt: '土砂',
  ore: '鉱石',
};

function getTierLabel(tier: number): string {
  const safeTier = Math.max(0, Math.min(4, Math.floor(tier)));
  return TOOL_TIER_LABELS[safeTier] ?? '上位';
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function ToolHUD() {
  const equippedToolId = usePlayerStore((s) => s.equippedToolId);
  const tools = usePlayerStore((s) => s.tools);
  const isBuildMode = useGameStore((s) => s.isBuildMode);
  const phase = useGameStore((s) => s.phase);
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);
  const target = useMiningFocusStore((s) => s.target);
  const [now, setNow] = useState(() => performance.now());
  const isTouch = isTouchDevice();

  useEffect(() => {
    if (!target) return undefined;
    const timer = window.setInterval(() => setNow(performance.now()), 180);
    return () => window.clearInterval(timer);
  }, [target]);

  // 搭乗中はツールHUDを隠し、照準・計器を優先
  if (phase !== 'playing' || isBuildMode || activeVehicle !== null || (!equippedToolId && !target)) return null;

  const def = equippedToolId ? TOOL_DEFS[equippedToolId] : undefined;
  const targetFresh = target && now - target.updatedAt < 650 ? target : null;
  const displayName = def?.name ?? '素手';
  const displayEmoji = def?.emoji ?? '✋';
  const displayColor = def?.color ?? '#f3d8a6';

  const durability = equippedToolId ? (tools[equippedToolId] ?? 0) : 0;
  const durabilityRatio = def ? Math.max(0, Math.min(1, durability / def.maxDurability)) : 1;
  const lowDurability = Boolean(def && durabilityRatio <= 0.18);
  const toolTypeLabel = def ? TOOL_TYPE_LABELS[def.type] : '手作業';
  const targetCategory = targetFresh?.blockCategory
    ? BLOCK_CATEGORY_LABELS[targetFresh.blockCategory] ?? targetFresh.blockCategory
    : '素材';
  const targetProgress = targetFresh ? Math.max(0, Math.min(1, targetFresh.progress)) : 0;
  const targetAccent = !targetFresh
    ? displayColor
    : targetFresh.canBreak
      ? targetFresh.effective
        ? '#9cff9a'
        : '#ffe28a'
      : '#ff9c9c';
  const targetStatus = !targetFresh
    ? `${toolTypeLabel} / 照準で採掘情報`
    : targetFresh.canBreak
      ? targetFresh.effective
        ? `最適 ${targetCategory} / SPEED x${targetFresh.miningSpeed.toFixed(1)}`
        : `掘れる ${targetCategory} / SPEED x${targetFresh.miningSpeed.toFixed(1)}`
      : targetFresh.blockerReason === 'unbreakable'
        ? '破壊不可 / 別ルートを探す'
        : `${getTierLabel(targetFresh.requiredTier)}以上が必要 / 今は${getTierLabel(targetFresh.playerTier)}`;
  const targetMeterText = !targetFresh
    ? ''
    : targetFresh.canBreak
      ? targetProgress > 0
        ? formatPercent(targetProgress)
        : targetFresh.effective
          ? 'READY'
          : 'SLOW'
      : 'BLOCK';

  // 耐久値に応じた色
  const barColor = durabilityRatio > 0.5
    ? `hsl(${120 * durabilityRatio}, 80%, 50%)`
    : durabilityRatio > 0.2
      ? '#f0ad4e'
      : '#e74c3c';

  return (
    <div
      id="tool-hud"
      style={{
        position: 'fixed',
        bottom: isTouch ? 'calc(100px + env(safe-area-inset-bottom))' : 106,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        zIndex: 100,
        pointerEvents: 'none',
        width: isTouch ? 'min(284px, calc(100vw - 24px))' : 292,
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '6px 10px',
          borderRadius: 8,
          border: `1px solid ${
            targetFresh && targetProgress > 0
              ? `${targetAccent}99`
              : lowDurability
                ? '#ff8f8f88'
                : `${displayColor}66`
          }`,
          background: targetFresh && targetProgress > 0
            ? 'rgba(12, 16, 22, 0.72)'
            : 'rgba(9, 12, 18, 0.6)',
          boxShadow: lowDurability
            ? '0 0 14px rgba(255, 100, 100, 0.28)'
            : targetFresh && targetProgress > 0
              ? `0 0 16px ${targetAccent}44`
            : `0 0 12px ${displayColor}24`,
          backdropFilter: 'blur(9px)',
          WebkitBackdropFilter: 'blur(9px)',
          color: '#fff',
          animation: lowDurability ? 'toolDurabilityWarning 0.7s ease-in-out infinite alternate' : undefined,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
              color: displayColor,
              fontSize: isTouch ? 10 : 11,
              lineHeight: '13px',
              fontWeight: 900,
              textShadow: '0 1px 3px rgba(0,0,0,0.86)',
            }}
          >
            <span style={{ flex: '0 0 auto' }}>{displayEmoji}</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </span>
            <span style={{ flex: '0 0 auto', color: 'rgba(255,255,255,0.58)', fontSize: 9 }}>
              {toolTypeLabel}
            </span>
          </div>
          <div
            style={{
              marginTop: 2,
              color: targetAccent,
              fontSize: isTouch ? 9 : 10,
              lineHeight: '12px',
              fontWeight: 850,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textShadow: '0 1px 3px rgba(0,0,0,0.86)',
            }}
          >
            {targetFresh ? `${targetFresh.blockName}: ${targetStatus}` : targetStatus}
          </div>
        </div>
        <div
          style={{
            flex: '0 0 auto',
            minWidth: 54,
            textAlign: 'right',
            color: targetFresh ? targetAccent : 'rgba(255,255,255,0.68)',
            fontSize: isTouch ? 9 : 10,
            lineHeight: '12px',
            fontWeight: 950,
            fontFamily: 'monospace',
            textShadow: '0 1px 3px rgba(0,0,0,0.86)',
          }}
        >
          {targetFresh ? targetMeterText : def ? `${durability}/${def.maxDurability}` : 'HAND'}
        </div>
      </div>

      <div
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: targetFresh ? '1fr 1fr' : '1fr',
          gap: 4,
        }}
      >
        {def && (
          <div style={{
            height: 5,
            background: 'rgba(0,0,0,0.52)',
            borderRadius: 999,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{
              width: `${durabilityRatio * 100}%`,
              height: '100%',
              background: barColor,
              transition: 'width 0.2s ease, background 0.2s ease',
              borderRadius: 999,
              boxShadow: lowDurability ? '0 0 6px rgba(255,80,80,0.5)' : 'none',
            }} />
          </div>
        )}
        {targetFresh && (
          <div style={{
            height: 5,
            background: 'rgba(0,0,0,0.52)',
            borderRadius: 999,
            overflow: 'hidden',
            border: `1px solid ${targetAccent}44`,
          }}>
            <div style={{
              width: targetFresh.canBreak
                ? `${Math.max(targetProgress > 0 ? 8 : 4, targetProgress * 100)}%`
                : '100%',
              height: '100%',
              background: targetFresh.canBreak
                ? `linear-gradient(90deg, ${targetAccent}, #ffffff)`
                : 'linear-gradient(90deg, #ff6b6b, #ffd166)',
              transition: 'width 0.16s linear',
              borderRadius: 999,
            }} />
          </div>
        )}
      </div>
    </div>
  );
}
