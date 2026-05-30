// ゲームモード固有の勢いを管理するストア
// 建築はテーマ配置、戦争は連続撃破を実際の補給・回復・即応に変える

import { create } from 'zustand';
import type { BlockId } from '../types/blocks';
import {
  formatStageModeReward,
  getStageModeBuildGain,
  getStageModeEnemyGain,
  getStageModeRule,
  type StageModeRule,
} from '../types/stageModeRules';
import { playStageRewardSound } from '../utils/sounds';
import { useInventoryStore } from './useInventoryStore';
import type { MobType } from './useMobStore';
import { usePlayerStore } from './usePlayerStore';

export interface ModeFlowActivation {
  id: string;
  stageId: string;
  icon: string;
  eyebrow: string;
  title: string;
  detail: string;
  accent: string;
  glow: string;
  createdAt: number;
}

interface ModeFlowState {
  currentStageId: string | null;
  meter: number;
  lastGain: number;
  lastGainLabel: string | null;
  streak: number;
  bestStreak: number;
  streakExpiresAt: number;
  activationCount: number;
  recentActivation: ModeFlowActivation | null;
  startRun: (stageId: string | null) => void;
  recordBuildBlockPlace: (blockId: BlockId) => void;
  recordEnemyDefeat: (mobType: MobType) => void;
  clearRecentActivation: () => void;
}

function nowMs(): number {
  if (typeof performance !== 'undefined') return performance.now();
  return Date.now();
}

function applyModeReward(rule: StageModeRule): void {
  const inventory = useInventoryStore.getState();
  for (const block of rule.reward.blocks) {
    inventory.addItem(block.blockId, block.count);
  }

  if (rule.reward.heal > 0) {
    usePlayerStore.getState().heal(rule.reward.heal);
  }

  if (rule.reward.hunger > 0) {
    usePlayerStore.setState((state) => ({
      hunger: Math.min(20, state.hunger + rule.reward.hunger),
      hungerExhaustion: Math.max(0, state.hungerExhaustion - rule.reward.hunger * 0.28),
    }));
  }

  if (rule.reward.shieldMs > 0) {
    usePlayerStore.setState((state) => ({
      invincibleUntil: Math.max(state.invincibleUntil, Date.now() + rule.reward.shieldMs),
    }));
  }

  if (rule.reward.rocketReady) {
    usePlayerStore.setState({
      rocketCooldown: 0,
      rocketCharge: 1,
    });
  }

  usePlayerStore.setState((state) => ({
    cameraShake: Math.max(state.cameraShake, rule.category === 'war' ? 0.36 : 0.2),
  }));
}

function createActivation(rule: StageModeRule, createdAt: number): ModeFlowActivation {
  return {
    id: `${rule.stageId}-${rule.category}-${Math.round(createdAt)}`,
    stageId: rule.stageId,
    icon: rule.icon,
    eyebrow: rule.category === 'build' ? '建築モード発動' : '戦争モード発動',
    title: rule.title,
    detail: formatStageModeReward(rule),
    accent: rule.accent,
    glow: rule.glow,
    createdAt,
  };
}

function triggerRule(rule: StageModeRule, createdAt: number): ModeFlowActivation {
  applyModeReward(rule);
  playStageRewardSound(rule.category === 'build' ? 'build_supply' : 'war_supply');
  return createActivation(rule, createdAt);
}

export const useModeFlowStore = create<ModeFlowState>((set, get) => ({
  currentStageId: null,
  meter: 0,
  lastGain: 0,
  lastGainLabel: null,
  streak: 0,
  bestStreak: 0,
  streakExpiresAt: 0,
  activationCount: 0,
  recentActivation: null,

  startRun: (stageId) => {
    const rule = getStageModeRule(stageId);
    set({
      currentStageId: rule ? stageId : null,
      meter: 0,
      lastGain: 0,
      lastGainLabel: null,
      streak: 0,
      bestStreak: 0,
      streakExpiresAt: 0,
      activationCount: 0,
      recentActivation: null,
    });
  },

  recordBuildBlockPlace: (blockId) => {
    const state = get();
    const stageId = state.currentStageId;
    const rule = getStageModeRule(stageId);
    if (!stageId || !rule || rule.category !== 'build') return;

    const gain = getStageModeBuildGain(stageId, blockId);
    if (gain <= 0) return;

    const nextRawMeter = state.meter + gain;
    const reached = nextRawMeter >= rule.threshold;
    const createdAt = nowMs();
    const activation = reached ? triggerRule(rule, createdAt) : state.recentActivation;

    set({
      meter: reached ? nextRawMeter - rule.threshold : nextRawMeter,
      lastGain: gain,
      lastGainLabel: `+${gain} ${rule.meterLabel}`,
      recentActivation: activation,
      activationCount: reached ? state.activationCount + 1 : state.activationCount,
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
    const activation = reached ? triggerRule(rule, createdAt) : state.recentActivation;

    set({
      meter: reached ? nextRawMeter - rule.threshold : nextRawMeter,
      lastGain: gain,
      lastGainLabel: `x${nextStreak} / +${gain}`,
      streak: nextStreak,
      bestStreak: Math.max(state.bestStreak, nextStreak),
      streakExpiresAt: createdAt + streakWindow,
      recentActivation: activation,
      activationCount: reached ? state.activationCount + 1 : state.activationCount,
    });
  },

  clearRecentActivation: () => set({ recentActivation: null }),
}));
