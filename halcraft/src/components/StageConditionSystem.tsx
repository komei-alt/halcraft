// ステージコンディションの実プレイ効果
// HUDだけで終わらせず、回復・素材還元・ロケット即応として反映する

import { useEffect, useRef } from 'react';
import { useGameStore } from '../stores/useGameStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useStageConditionStore } from '../stores/useStageConditionStore';
import { getStageCondition } from '../types/stageConditions';

export function StageConditionSystem() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const activeUntil = useStageConditionStore((s) => s.activeUntil);
  const recentActivation = useStageConditionStore((s) => s.recentActivation);
  const appliedActivationId = useRef<string | null>(null);

  useEffect(() => {
    if (!recentActivation || recentActivation.id === appliedActivationId.current) return;
    const condition = getStageCondition(stage?.id);
    if (!condition || condition.id !== recentActivation.conditionId) return;

    appliedActivationId.current = recentActivation.id;
    if (condition.effect.kind === 'resource') {
      useInventoryStore.getState().addItem(condition.effect.blockId, condition.effect.count);
      return;
    }

    if (condition.effect.kind === 'regen') {
      usePlayerStore.getState().heal(condition.effect.healOnActivate);
      return;
    }

    if (condition.effect.kind === 'rocket_ready') {
      usePlayerStore.setState({ rocketCooldown: 0, rocketCharge: 1 });
    }
  }, [recentActivation, stage?.id]);

  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const condition = getStageCondition(stage?.id);
    if (!condition || condition.effect.kind !== 'regen') return undefined;
    if (activeUntil <= performance.now()) return undefined;
    const healPerSecond = condition.effect.healPerSecond;

    const interval = window.setInterval(() => {
      if (useStageConditionStore.getState().activeUntil <= performance.now()) return;
      usePlayerStore.getState().heal(healPerSecond * 0.5);
    }, 500);

    return () => window.clearInterval(interval);
  }, [activeUntil, phase, stage?.id]);

  return null;
}
