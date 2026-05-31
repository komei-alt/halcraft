// モードフローHUD
// 建築/戦争というゲームモードそのものの手触り差を常時見えるようにする

import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import {
  getModeFlowRank,
  getModeFlowRankLabel,
  getScaledStageModeReward,
  useModeFlowStore,
} from '../../stores/useModeFlowStore';
import { formatStageModeRewardDetail, getStageModeRule } from '../../types/stageModeRules';
import { getStagePressure } from '../../types/stagePressures';
import { isTouchDevice } from '../../utils/device';
import { STAGE_RIGHT_RAIL_TOP } from './stageHudLayout';
import { HUD_TEXT_SHADOW, SG } from './startScreenTheme';

function formatSeconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}

export function ModeFlowHUD() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const meter = useModeFlowStore((s) => s.meter);
  const lastGainLabel = useModeFlowStore((s) => s.lastGainLabel);
  const streak = useModeFlowStore((s) => s.streak);
  const bestStreak = useModeFlowStore((s) => s.bestStreak);
  const streakExpiresAt = useModeFlowStore((s) => s.streakExpiresAt);
  const flowRank = useModeFlowStore((s) => s.flowRank);
  const activationCount = useModeFlowStore((s) => s.activationCount);
  const buildFocusUntil = useModeFlowStore((s) => s.buildFocusUntil);
  const buildFocusChain = useModeFlowStore((s) => s.buildFocusChain);
  const bestBuildFocusChain = useModeFlowStore((s) => s.bestBuildFocusChain);
  const buildFocusChainExpiresAt = useModeFlowStore((s) => s.buildFocusChainExpiresAt);
  const combatFocusUntil = useModeFlowStore((s) => s.combatFocusUntil);
  const combatFocusRank = useModeFlowStore((s) => s.combatFocusRank);
  const combatFocusLabel = useModeFlowStore((s) => s.combatFocusLabel);
  const combatFocusChain = useModeFlowStore((s) => s.combatFocusChain);
  const bestCombatFocusChain = useModeFlowStore((s) => s.bestCombatFocusChain);
  const combatFocusChainExpiresAt = useModeFlowStore((s) => s.combatFocusChainExpiresAt);
  const recentActivation = useModeFlowStore((s) => s.recentActivation);
  const clearRecentActivation = useModeFlowStore((s) => s.clearRecentActivation);
  const [now, setNow] = useState(() => performance.now());
  const isCompact = isTouchDevice() || window.innerWidth <= 560;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!recentActivation) return undefined;
    const timer = window.setTimeout(() => clearRecentActivation(), 2800);
    return () => window.clearTimeout(timer);
  }, [clearRecentActivation, recentActivation]);

  const rule = useMemo(() => getStageModeRule(stage?.id), [stage?.id]);
  const pressure = useMemo(() => getStagePressure(stage?.id), [stage?.id]);

  if (phase !== 'playing' || !stage || !rule || isCompact) return null;

  const progress = Math.max(0, Math.min(1, meter / rule.threshold));
  const streakRemainingMs = rule.category === 'war' ? Math.max(0, streakExpiresAt - now) : 0;
  const buildFocusRemainingMs = rule.category === 'build' ? Math.max(0, buildFocusUntil - now) : 0;
  const combatFocusRemainingMs = rule.category === 'war' ? Math.max(0, combatFocusUntil - now) : 0;
  const buildFocusActive = buildFocusRemainingMs > 0;
  const combatFocusActive = combatFocusRemainingMs > 0;
  const activeBuildFocusChain = buildFocusChainExpiresAt > now ? buildFocusChain : 0;
  const activeCombatFocusChain = combatFocusChainExpiresAt > now ? combatFocusChain : 0;
  const activeActivation = recentActivation?.stageId === stage.id ? recentActivation : null;
  const activeTitle = activeActivation ? activeActivation.title : rule.title;
  const visibleRank = activeActivation ? activeActivation.flowRank : flowRank;
  const nextRank = getModeFlowRank(activationCount + 1) || 1;
  const previewReward = getScaledStageModeReward(rule, Math.max(visibleRank, nextRank, 1));
  const rankLabel = activeActivation
    ? activeActivation.rankLabel
    : visibleRank > 0
      ? getModeFlowRankLabel(rule.category, visibleRank)
      : `次${getModeFlowRankLabel(rule.category, nextRank)}`;
  const activeDetail = activeActivation
    ? activeActivation.detail
    : rule.category === 'build'
      ? buildFocusActive
        ? activeBuildFocusChain >= 2
          ? `高速建築中 / 連置x${activeBuildFocusChain} / 残り${formatSeconds(buildFocusRemainingMs)}`
          : `高速建築中 / 残り${formatSeconds(buildFocusRemainingMs)}`
        : rule.actionLabel
      : combatFocusActive
        ? activeCombatFocusChain >= 2
          ? `${combatFocusLabel ?? '作戦'}集中中 / 追撃x${activeCombatFocusChain} / 残り${formatSeconds(combatFocusRemainingMs)}`
          : `${combatFocusLabel ?? '作戦'}集中中 / 残り${formatSeconds(combatFocusRemainingMs)}`
        : streak > 0
        ? `連続${streak}体 / 残り${formatSeconds(streakRemainingMs)}`
        : rule.actionLabel;
  const meterText = `${Math.floor(meter)}/${rule.threshold}`;

  return (
    <div
      id="mode-flow-hud"
      style={{
        position: 'fixed',
        top: isCompact
          ? 358
          : pressure
            ? STAGE_RIGHT_RAIL_TOP.modeWithPressure
            : STAGE_RIGHT_RAIL_TOP.modeWithoutPressure,
        right: isCompact ? 14 : 16,
        zIndex: 95,
        width: isCompact ? 'min(248px, calc(100vw - 28px))' : 276,
        padding: 0,
        background: 'none',
        border: 'none',
        boxShadow: 'none',
        color: '#fff',
        pointerEvents: 'none',
        textShadow: HUD_TEXT_SHADOW,
        fontFamily: SG.font,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div
          style={{
            fontSize: isCompact ? 18 : 21,
            flex: '0 0 auto',
            filter: recentActivation?.stageId === stage.id
              ? `drop-shadow(0 0 8px ${rule.accent})`
              : 'drop-shadow(0 1px 3px rgba(0,0,0,0.9))',
          }}
        >
          {rule.icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              color: rule.accent,
              fontSize: isCompact ? 10 : 11,
              lineHeight: '13px',
              fontWeight: 900,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {rule.category === 'build' ? '建築モード' : '戦争モード'} / {rule.meterLabel}
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.94)',
              fontSize: isCompact ? 12 : 13,
              lineHeight: '16px',
              fontWeight: 950,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {activeTitle}
          </div>
        </div>
        <div
          style={{
            flex: '0 0 auto',
            color: recentActivation?.stageId === stage.id ? '#fff1a8' : 'rgba(255,255,255,0.72)',
            fontSize: isCompact ? 10 : 11,
            fontWeight: 950,
            fontFamily: 'monospace',
            textAlign: 'right',
            lineHeight: '14px',
          }}
        >
          <div>{rankLabel}</div>
          <div>{meterText}</div>
        </div>
      </div>

      <div
        style={{
          marginTop: 7,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          color: 'rgba(255,255,255,0.64)',
          fontSize: isCompact ? 10 : 11,
          lineHeight: '14px',
          fontWeight: 850,
        }}
      >
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeDetail}
        </span>
        <span style={{ flex: '0 0 auto', color: rule.accent, fontFamily: 'monospace', fontWeight: 950 }}>
          {buildFocusActive
            ? activeBuildFocusChain >= 2
              ? `PLACE x${activeBuildFocusChain}`
              : 'BUILD x1.32'
            : combatFocusActive
              ? activeCombatFocusChain >= 2
                ? `FOCUS x${activeCombatFocusChain}`
                : `FOCUS Lv.${Math.max(1, combatFocusRank)}`
            : lastGainLabel ?? (rule.category === 'war' && bestStreak > 0 ? `BEST x${bestStreak}` : `${activationCount}回`)}
        </span>
      </div>

      <div
        style={{
          marginTop: 7,
          height: 5,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.12)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.round(progress * 100)}%`,
            height: '100%',
            borderRadius: 999,
            background: recentActivation?.stageId === stage.id
              ? `linear-gradient(90deg, #fff2a6, ${rule.accent})`
              : `linear-gradient(90deg, ${stage.color}, ${rule.accent})`,
            transition: 'width 0.24s ease',
          }}
        />
      </div>

      {!isCompact && (
        <div
          style={{
            marginTop: 6,
            color: 'rgba(255,255,255,0.48)',
            fontSize: 10,
            lineHeight: '13px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          次発動: {getModeFlowRankLabel(rule.category, nextRank)} / {formatStageModeRewardDetail(previewReward)}
          {rule.category === 'build' && bestBuildFocusChain > 1 ? ` / 連置BEST x${bestBuildFocusChain}` : ''}
          {rule.category === 'war' && combatFocusActive ? ` / 作戦集中 ${formatSeconds(combatFocusRemainingMs)}` : ''}
          {rule.category === 'war' && bestCombatFocusChain > 1 ? ` / 追撃BEST x${bestCombatFocusChain}` : ''}
        </div>
      )}
    </div>
  );
}
