// ステージチャレンジ達成時に、モード別の実用品報酬を付与する

import { useEffect, useRef } from 'react';
import { useGameStore } from '../stores/useGameStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useStageChallengeStore } from '../stores/useStageChallengeStore';
import {
  getStageChallengeReward,
  type StageChallengeRewardDefinition,
} from '../types/stageChallengeRewards';
import { playStageRewardSound } from '../utils/sounds';

function applyReward(reward: StageChallengeRewardDefinition): void {
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
      hungerExhaustion: Math.max(0, state.hungerExhaustion - reward.hunger * 0.35),
    }));
  }

  if (reward.rocketReady) {
    usePlayerStore.getState().grantRocketReady({ pulseMs: 1100 });
  }

  playStageRewardSound(reward.kind);
}

export function StageChallengeRewardSystem() {
  const lastRewardKeyRef = useRef<string | null>(null);

  useEffect(() => {
    return useStageChallengeStore.subscribe((state, previous) => {
      const completion = state.recentCompletion;
      if (useGameStore.getState().phase !== 'playing' || !completion) return;
      if (completion.id === previous.recentCompletion?.id) return;

      const rewardKey = `${completion.id}-${completion.createdAt}`;
      if (lastRewardKeyRef.current === rewardKey) return;

      const reward = getStageChallengeReward(
        state.currentStageId,
        completion.completedCount,
        completion.totalCount,
      );
      if (!reward) return;

      lastRewardKeyRef.current = rewardKey;
      applyReward(reward);
    });
  }, []);

  return null;
}
