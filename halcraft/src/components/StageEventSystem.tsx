// ステージ時間イベントの進行と実効果をまとめて処理する

import { useEffect, useRef } from 'react';
import { useGameStore } from '../stores/useGameStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useStageEventStore, type StageTimedEvent } from '../stores/useStageEventStore';
import { playStageEventSound } from '../utils/sounds';

function applyStageEvent(event: StageTimedEvent): void {
  const inventory = useInventoryStore.getState();
  for (const block of event.effect.blocks) {
    inventory.addItem(block.blockId, block.count);
  }

  if (event.effect.heal > 0) {
    usePlayerStore.getState().heal(event.effect.heal);
  }

  if (event.effect.hunger > 0) {
    usePlayerStore.setState((state) => ({
      hunger: Math.min(20, state.hunger + event.effect.hunger),
      hungerExhaustion: Math.max(0, state.hungerExhaustion - event.effect.hunger * 0.28),
    }));
  }

  if (event.effect.rocketReady) {
    usePlayerStore.getState().grantRocketReady({ pulseMs: 1100 });
  }

  if (event.effect.shieldMs > 0) {
    usePlayerStore.setState((state) => ({
      invincibleUntil: Math.max(state.invincibleUntil, Date.now() + event.effect.shieldMs),
    }));
  }

  usePlayerStore.setState((state) => ({
    cameraShake: Math.max(state.cameraShake, event.effect.rocketReady ? 0.42 : 0.18),
  }));
}

export function StageEventSystem() {
  const phase = useGameStore((s) => s.phase);
  const currentStageId = useGameStore((s) => s.currentStageId);
  const stageElapsedSeconds = useGameStore((s) => s.stageElapsedSeconds);
  const startRun = useStageEventStore((s) => s.startRun);
  const evaluate = useStageEventStore((s) => s.evaluate);
  const lastAppliedEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    startRun(currentStageId);
  }, [currentStageId, startRun]);

  useEffect(() => {
    if (phase !== 'playing') return;
    evaluate(stageElapsedSeconds);
  }, [evaluate, phase, stageElapsedSeconds]);

  useEffect(() => {
    return useStageEventStore.subscribe((state, previous) => {
      const event = state.recentEvent;
      if (useGameStore.getState().phase !== 'playing' || !event) return;
      if (event.id === previous.recentEvent?.id || lastAppliedEventIdRef.current === event.id) return;

      lastAppliedEventIdRef.current = event.id;
      applyStageEvent(event);
      playStageEventSound(event.sound);
    });
  }, []);

  return null;
}
