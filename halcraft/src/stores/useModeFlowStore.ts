// ゲームモード固有の勢いを管理するストア
// 建築はテーマ配置、戦争は連続撃破を実際の補給・回復・即応に変える

import { create } from 'zustand';
import type { BlockId } from '../types/blocks';
import {
  formatStageModeRewardDetail,
  getStageModeBuildGain,
  getStageModeEnemyGain,
  getStageModeRule,
  getStageModeVehicleGain,
  type StageModeReward,
  type StageModeRule,
} from '../types/stageModeRules';
import { getStageCombatStyleForItem } from '../types/stageCombatStyles';
import type { StageCategory } from '../types/stages';
import {
  playBuildFocusPlaceSound,
  playModeFlowSurgeSound,
  playStageRewardSound,
} from '../utils/sounds';
import { useInventoryStore } from './useInventoryStore';
import type { MobType } from './useMobStore';
import { usePlayerStore, type EquippedItem } from './usePlayerStore';
import type { VehicleType } from './useVehicleStore';

const MODE_FLOW_MAX_RANK = 3;
const BUILD_FOCUS_MINING_SPEED_MULTIPLIER = 1.32;
const BUILD_FOCUS_PLACEMENT_INTERVAL_MULTIPLIER = 0.68;

export interface ModeFlowActivation {
  id: string;
  stageId: string;
  category: StageCategory;
  icon: string;
  eyebrow: string;
  title: string;
  detail: string;
  flowRank: number;
  rankLabel: string;
  accent: string;
  glow: string;
  createdAt: number;
}

export interface ModeFlowBuildPlacementResult {
  focused: boolean;
  activated: boolean;
  chain: number;
  bestChain: number;
  accent: string;
  glow: string;
  label: string;
}

interface ModeFlowState {
  currentStageId: string | null;
  meter: number;
  lastGain: number;
  lastGainLabel: string | null;
  lastGainAt: number;
  lastCombatStyleItem: EquippedItem | null;
  streak: number;
  bestStreak: number;
  streakExpiresAt: number;
  flowRank: number;
  activationCount: number;
  buildFocusUntil: number;
  buildFocusChain: number;
  bestBuildFocusChain: number;
  buildFocusChainExpiresAt: number;
  recentActivation: ModeFlowActivation | null;
  startRun: (stageId: string | null) => void;
  grantOpeningBuildFocus: (durationMs: number, sourceLabel: string) => void;
  recordBuildBlockPlace: (blockId: BlockId) => ModeFlowBuildPlacementResult | null;
  recordCombatStyleHit: (item: EquippedItem, amount?: number, critical?: boolean) => void;
  recordVehicleHit: (vehicleType: VehicleType, amount?: number, critical?: boolean) => void;
  recordEnemyDefeat: (mobType: MobType) => void;
  recordPressureRelief: (gain: number, label: string) => void;
  clearRecentActivation: () => void;
}

function nowMs(): number {
  if (typeof performance !== 'undefined') return performance.now();
  return Date.now();
}

export function getModeFlowRank(activationCount: number): number {
  if (activationCount <= 0) return 0;
  return Math.min(MODE_FLOW_MAX_RANK, 1 + Math.floor(Math.max(0, activationCount - 1) / 2));
}

export function getModeFlowRankLabel(category: StageCategory, rank: number): string {
  const safeRank = Math.max(0, Math.min(MODE_FLOW_MAX_RANK, Math.floor(rank)));
  if (safeRank <= 0) return category === 'build' ? '未着想' : '未点火';
  const labels: Record<StageCategory, Record<number, string>> = {
    build: {
      1: 'ひらめきLv.1',
      2: 'ひらめきLv.2',
      3: '大ひらめき',
    },
    war: {
      1: '戦意Lv.1',
      2: '戦意Lv.2',
      3: '大戦意',
    },
  };
  return labels[category][safeRank];
}

function getRewardMultiplier(rank: number): number {
  if (rank >= 3) return 2;
  if (rank === 2) return 1.5;
  return 1;
}

export function getBuildFocusRemainingMs(now = nowMs()): number {
  return Math.max(0, useModeFlowStore.getState().buildFocusUntil - now);
}

export function getBuildFocusMiningSpeedMultiplier(now = nowMs()): number {
  return getBuildFocusRemainingMs(now) > 0 ? BUILD_FOCUS_MINING_SPEED_MULTIPLIER : 1;
}

export function getBuildFocusPlacementIntervalMultiplier(now = nowMs()): number {
  return getBuildFocusRemainingMs(now) > 0 ? BUILD_FOCUS_PLACEMENT_INTERVAL_MULTIPLIER : 1;
}

function getCombatStyleHitGain(item: EquippedItem, amount: number, critical: boolean): number {
  const safeAmount = Math.max(1, Math.round(amount));
  if (item === 'machine_gun') return Math.min(18, safeAmount * 5 + (critical ? 4 : 0));
  if (item === 'rocket_launcher') return Math.min(44, 16 + (safeAmount - 1) * 8 + (critical ? 8 : 0));
  if (item === 'lightsaber') return Math.min(28, 11 + (critical ? 12 : 0));
  return 0;
}

export function getScaledStageModeReward(rule: StageModeRule, rank: number): StageModeReward {
  const safeRank = Math.max(1, Math.min(MODE_FLOW_MAX_RANK, Math.floor(rank)));
  const multiplier = getRewardMultiplier(safeRank);
  return {
    blocks: rule.reward.blocks.map((block) => ({
      blockId: block.blockId,
      count: Math.max(1, Math.round(block.count * multiplier)),
    })),
    heal: rule.reward.heal > 0 ? rule.reward.heal + safeRank - 1 : 0,
    hunger: rule.reward.hunger > 0 ? rule.reward.hunger + safeRank - 1 : 0,
    shieldMs: rule.reward.shieldMs > 0 ? rule.reward.shieldMs + (safeRank - 1) * 1200 : 0,
    rocketReady: rule.reward.rocketReady,
    buildFocusMs: rule.reward.buildFocusMs > 0 ? rule.reward.buildFocusMs + (safeRank - 1) * 1600 : 0,
  };
}

function applyModeReward(reward: StageModeReward, category: StageCategory): void {
  const inventory = useInventoryStore.getState();
  for (const block of reward.blocks) {
    inventory.addItem(block.blockId, block.count);
  }

  if (reward.heal > 0) {
    usePlayerStore.getState().heal(reward.heal);
  }

  if (reward.hunger > 0) {
    usePlayerStore.setState((state) => ({
      hunger: Math.min(20, state.hunger + reward.hunger),
      hungerExhaustion: Math.max(0, state.hungerExhaustion - reward.hunger * 0.28),
    }));
  }

  if (reward.shieldMs > 0) {
    usePlayerStore.setState((state) => ({
      invincibleUntil: Math.max(state.invincibleUntil, Date.now() + reward.shieldMs),
    }));
  }

  if (reward.rocketReady) {
    usePlayerStore.setState({
      rocketCooldown: 0,
      rocketCharge: 1,
    });
  }

  usePlayerStore.setState((state) => ({
    cameraShake: Math.max(state.cameraShake, category === 'war' ? 0.36 : 0.2),
  }));
}

function createActivation(
  rule: StageModeRule,
  reward: StageModeReward,
  flowRank: number,
  createdAt: number,
): ModeFlowActivation {
  const rankLabel = getModeFlowRankLabel(rule.category, flowRank);
  return {
    id: `${rule.stageId}-${rule.category}-${Math.round(createdAt)}`,
    stageId: rule.stageId,
    category: rule.category,
    icon: rule.icon,
    eyebrow: rule.category === 'build' ? '建築モード発動' : '戦争モード発動',
    title: rule.title,
    detail: `${rankLabel} / ${formatStageModeRewardDetail(reward)}`,
    flowRank,
    rankLabel,
    accent: rule.accent,
    glow: rule.glow,
    createdAt,
  };
}

function triggerRule(rule: StageModeRule, flowRank: number, createdAt: number): ModeFlowActivation {
  const reward = getScaledStageModeReward(rule, flowRank);
  applyModeReward(reward, rule.category);
  playStageRewardSound(rule.category === 'build' ? 'build_supply' : 'war_supply');
  if (flowRank >= 2) {
    playModeFlowSurgeSound(rule.category, flowRank);
  }
  return createActivation(rule, reward, flowRank, createdAt);
}

function createOpeningBuildFocusActivation(
  rule: StageModeRule,
  durationMs: number,
  sourceLabel: string,
  createdAt: number,
): ModeFlowActivation {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return {
    id: `${rule.stageId}-opening-focus-${Math.round(createdAt)}`,
    stageId: rule.stageId,
    category: 'build',
    icon: rule.icon,
    eyebrow: 'マップ熟練特典',
    title: '開幕高速建築',
    detail: `${sourceLabel} / 高速建築 +${seconds}s`,
    flowRank: 0,
    rankLabel: '開幕制作',
    accent: rule.accent,
    glow: rule.glow,
    createdAt,
  };
}

export const useModeFlowStore = create<ModeFlowState>((set, get) => ({
  currentStageId: null,
  meter: 0,
  lastGain: 0,
  lastGainLabel: null,
  lastGainAt: 0,
  lastCombatStyleItem: null,
  streak: 0,
  bestStreak: 0,
  streakExpiresAt: 0,
  flowRank: 0,
  activationCount: 0,
  buildFocusUntil: 0,
  buildFocusChain: 0,
  bestBuildFocusChain: 0,
  buildFocusChainExpiresAt: 0,
  recentActivation: null,

  startRun: (stageId) => {
    const rule = getStageModeRule(stageId);
    set({
      currentStageId: rule ? stageId : null,
      meter: 0,
      lastGain: 0,
      lastGainLabel: null,
      lastGainAt: 0,
      lastCombatStyleItem: null,
      streak: 0,
      bestStreak: 0,
      streakExpiresAt: 0,
      flowRank: 0,
      activationCount: 0,
      buildFocusUntil: 0,
      buildFocusChain: 0,
      bestBuildFocusChain: 0,
      buildFocusChainExpiresAt: 0,
      recentActivation: null,
    });
  },

  grantOpeningBuildFocus: (durationMs, sourceLabel) => {
    const state = get();
    const rule = getStageModeRule(state.currentStageId);
    if (!rule || rule.category !== 'build' || durationMs <= 0) return;

    const createdAt = nowMs();
    const activation = createOpeningBuildFocusActivation(rule, durationMs, sourceLabel, createdAt);
    set({
      lastGain: 0,
      lastGainLabel: '熟練BOOST',
      lastGainAt: createdAt,
      recentActivation: activation,
      buildFocusUntil: Math.max(state.buildFocusUntil, createdAt + durationMs),
      buildFocusChain: 0,
      buildFocusChainExpiresAt: 0,
    });
    playStageRewardSound('build_supply');
  },

  recordBuildBlockPlace: (blockId) => {
    const state = get();
    const stageId = state.currentStageId;
    const rule = getStageModeRule(stageId);
    if (!stageId || !rule || rule.category !== 'build') return null;

    const gain = getStageModeBuildGain(stageId, blockId);
    if (gain <= 0) return null;

    const nextRawMeter = state.meter + gain;
    const reached = nextRawMeter >= rule.threshold;
    const nextActivationCount = reached ? state.activationCount + 1 : state.activationCount;
    const flowRank = reached ? getModeFlowRank(nextActivationCount) : state.flowRank;
    const createdAt = nowMs();
    const activation = reached ? triggerRule(rule, flowRank, createdAt) : state.recentActivation;
    const focusActiveBeforePlace = state.buildFocusUntil > createdAt;
    const buildFocusUntil = reached
      ? Math.max(
          state.buildFocusUntil,
          createdAt + getScaledStageModeReward(rule, Math.max(1, flowRank)).buildFocusMs,
        )
      : state.buildFocusUntil;
    const focusActiveAfterPlace = buildFocusUntil > createdAt;
    const nextBuildFocusChain = focusActiveAfterPlace
      ? focusActiveBeforePlace && createdAt <= state.buildFocusChainExpiresAt
        ? state.buildFocusChain + 1
        : 1
      : 0;
    const nextBestBuildFocusChain = Math.max(state.bestBuildFocusChain, nextBuildFocusChain);
    const nextBuildFocusChainExpiresAt = focusActiveAfterPlace ? createdAt + 1450 : 0;

    set({
      meter: reached ? nextRawMeter - rule.threshold : nextRawMeter,
      lastGain: gain,
      lastGainLabel: `+${gain} ${rule.meterLabel}`,
      lastGainAt: createdAt,
      lastCombatStyleItem: null,
      recentActivation: activation,
      flowRank,
      activationCount: nextActivationCount,
      buildFocusUntil,
      buildFocusChain: nextBuildFocusChain,
      bestBuildFocusChain: nextBestBuildFocusChain,
      buildFocusChainExpiresAt: nextBuildFocusChainExpiresAt,
    });

    if (focusActiveBeforePlace) {
      playBuildFocusPlaceSound(nextBuildFocusChain);
    }

    return focusActiveAfterPlace
      ? {
          focused: true,
          activated: reached,
          chain: nextBuildFocusChain,
          bestChain: nextBestBuildFocusChain,
          accent: rule.accent,
          glow: rule.glow,
          label: rule.meterLabel,
        }
      : null;
  },

  recordCombatStyleHit: (item, amount = 1, critical = false) => {
    const state = get();
    const stageId = state.currentStageId;
    const rule = getStageModeRule(stageId);
    const style = getStageCombatStyleForItem(stageId, item);
    if (!stageId || !rule || rule.category !== 'war' || !style) return;

    const gain = getCombatStyleHitGain(item, amount, critical);
    if (gain <= 0) return;

    const nextRawMeter = state.meter + gain;
    const reached = nextRawMeter >= rule.threshold;
    const nextActivationCount = reached ? state.activationCount + 1 : state.activationCount;
    const flowRank = reached ? getModeFlowRank(nextActivationCount) : state.flowRank;
    const createdAt = nowMs();
    const activation = reached ? triggerRule(rule, flowRank, createdAt) : state.recentActivation;

    set({
      meter: reached ? nextRawMeter - rule.threshold : nextRawMeter,
      lastGain: gain,
      lastGainLabel: `${style.shortLabel} +${gain}`,
      lastGainAt: createdAt,
      lastCombatStyleItem: item,
      recentActivation: activation,
      flowRank,
      activationCount: nextActivationCount,
    });
  },

  recordVehicleHit: (vehicleType, amount = 1, critical = false) => {
    const state = get();
    const stageId = state.currentStageId;
    const rule = getStageModeRule(stageId);
    if (!stageId || !rule || rule.category !== 'war') return;

    const gain = getStageModeVehicleGain(stageId, vehicleType, amount, critical);
    if (gain <= 0) return;

    const nextRawMeter = state.meter + gain;
    const reached = nextRawMeter >= rule.threshold;
    const nextActivationCount = reached ? state.activationCount + 1 : state.activationCount;
    const flowRank = reached ? getModeFlowRank(nextActivationCount) : state.flowRank;
    const createdAt = nowMs();
    const activation = reached ? triggerRule(rule, flowRank, createdAt) : state.recentActivation;

    set({
      meter: reached ? nextRawMeter - rule.threshold : nextRawMeter,
      lastGain: gain,
      lastGainLabel: `${vehicleType === 'airplane' ? '空爆' : '戦車'} +${gain}`,
      lastGainAt: createdAt,
      lastCombatStyleItem: null,
      recentActivation: activation,
      flowRank,
      activationCount: nextActivationCount,
    });
  },

  recordEnemyDefeat: (mobType) => {
    const state = get();
    const stageId = state.currentStageId;
    const rule = getStageModeRule(stageId);
    if (!stageId || !rule || rule.category !== 'war') return;

    const createdAt = nowMs();
    const streakWindow = rule.comboWindowMs ?? 8000;
    const nextStreak = createdAt <= state.streakExpiresAt ? state.streak + 1 : 1;
    const gain = getStageModeEnemyGain(stageId, mobType, nextStreak);
    if (gain <= 0) return;

    const nextRawMeter = state.meter + gain;
    const reached = nextRawMeter >= rule.threshold;
    const nextActivationCount = reached ? state.activationCount + 1 : state.activationCount;
    const flowRank = reached ? getModeFlowRank(nextActivationCount) : state.flowRank;
    const activation = reached ? triggerRule(rule, flowRank, createdAt) : state.recentActivation;

    set({
      meter: reached ? nextRawMeter - rule.threshold : nextRawMeter,
      lastGain: gain,
      lastGainLabel: `x${nextStreak} / +${gain}`,
      lastGainAt: createdAt,
      lastCombatStyleItem: null,
      streak: nextStreak,
      bestStreak: Math.max(state.bestStreak, nextStreak),
      streakExpiresAt: createdAt + streakWindow,
      recentActivation: activation,
      flowRank,
      activationCount: nextActivationCount,
    });
  },

  recordPressureRelief: (gain, label) => {
    const state = get();
    const stageId = state.currentStageId;
    const rule = getStageModeRule(stageId);
    if (!stageId || !rule || rule.category !== 'war') return;

    const safeGain = Math.max(1, Math.round(gain));
    const nextRawMeter = state.meter + safeGain;
    const reached = nextRawMeter >= rule.threshold;
    const nextActivationCount = reached ? state.activationCount + 1 : state.activationCount;
    const flowRank = reached ? getModeFlowRank(nextActivationCount) : state.flowRank;
    const createdAt = nowMs();
    const activation = reached ? triggerRule(rule, flowRank, createdAt) : state.recentActivation;

    set({
      meter: reached ? nextRawMeter - rule.threshold : nextRawMeter,
      lastGain: safeGain,
      lastGainLabel: `${label} +${safeGain}`,
      lastGainAt: createdAt,
      lastCombatStyleItem: null,
      recentActivation: activation,
      flowRank,
      activationCount: nextActivationCount,
    });
  },

  clearRecentActivation: () => set({ recentActivation: null }),
}));
