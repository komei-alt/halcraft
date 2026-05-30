// ステージ時間イベントストア
// 経過時間に応じて、マップごとの補給・気候・戦闘チャンスを発火する

import { create } from 'zustand';
import {
  getStageEvent,
  type StageEventDefinition,
  type StageEventEffect,
} from '../types/stageEvents';

export interface StageTimedEvent {
  id: string;
  eventId: string;
  stageId: string;
  icon: string;
  title: string;
  detail: string;
  label: string;
  accent: string;
  sound: StageEventDefinition['sound'];
  effect: StageEventEffect;
  createdAt: number;
  activeUntil: number;
  triggerCount: number;
}

interface StageEventState {
  currentStageId: string | null;
  triggerCount: number;
  nextTriggerAtSeconds: number | null;
  recentEvent: StageTimedEvent | null;
  startRun: (stageId: string | null) => void;
  evaluate: (elapsedSeconds: number) => void;
  clearRecentEvent: () => void;
}

function nowMs(): number {
  if (typeof performance !== 'undefined') return performance.now();
  return Date.now();
}

function getNextStart(definition: StageEventDefinition | null): number | null {
  if (!definition) return null;
  return definition.firstTriggerSeconds;
}

export const useStageEventStore = create<StageEventState>((set, get) => ({
  currentStageId: null,
  triggerCount: 0,
  nextTriggerAtSeconds: null,
  recentEvent: null,

  startRun: (stageId) => {
    const definition = getStageEvent(stageId);
    set({
      currentStageId: stageId,
      triggerCount: 0,
      nextTriggerAtSeconds: getNextStart(definition),
      recentEvent: null,
    });
  },

  evaluate: (elapsedSeconds) => {
    const state = get();
    const definition = getStageEvent(state.currentStageId);
    if (!definition || state.nextTriggerAtSeconds === null) return;
    if (elapsedSeconds < state.nextTriggerAtSeconds) return;

    const triggerCount = state.triggerCount + 1;
    const createdAt = nowMs();
    const event: StageTimedEvent = {
      id: `${definition.id}-${triggerCount}-${Math.round(createdAt)}`,
      eventId: definition.id,
      stageId: definition.stageId,
      icon: definition.icon,
      title: definition.title,
      detail: definition.detail,
      label: definition.label,
      accent: definition.accent,
      sound: definition.sound,
      effect: definition.effect,
      createdAt,
      activeUntil: createdAt + definition.activeDurationMs,
      triggerCount,
    };

    set({
      triggerCount,
      nextTriggerAtSeconds: elapsedSeconds + definition.repeatEverySeconds,
      recentEvent: event,
    });
  },

  clearRecentEvent: () => set({ recentEvent: null }),
}));
