import { useEffect, useRef } from 'react';
import { useDialogueStore } from '../stores/useDialogueStore';
import { useGameStore } from '../stores/useGameStore';
import { useMobStore } from '../stores/useMobStore';
import { usePlayerStore } from '../stores/usePlayerStore';

export function DialogueDirector() {
  const phase = useGameStore((state) => state.phase);
  const stageId = useGameStore((state) => state.currentStageId);
  const hp = usePlayerStore((state) => state.hp);
  const maxHp = usePlayerStore((state) => state.maxHp);
  const mobPresence = useMobStore((state) => {
    const prototype = state.mobs.some((mob) => mob.type === 'prototype');
    const golem = state.mobs.some((mob) => mob.type === 'iron_golem');
    const boss = state.mobs.find((mob) => mob.type === 'boss_giant');
    return `${prototype ? 1 : 0}:${golem ? 1 : 0}:${boss?.id ?? ''}`;
  });
  const previousPresence = useRef('0:0:');
  const stageAnnouncement = useRef<string | null>(null);
  const lowHealthAnnounced = useRef(false);

  useEffect(() => {
    if (phase !== 'playing' || stageAnnouncement.current === stageId) return;
    stageAnnouncement.current = stageId;
    const timer = window.setTimeout(() => useDialogueStore.getState().announce('system.stage_start'), 950);
    return () => window.clearTimeout(timer);
  }, [phase, stageId]);

  useEffect(() => {
    if (phase !== 'playing') return;
    const [prototype, golem, bossId] = mobPresence.split(':');
    const [previousPrototype, previousGolem, previousBossId] = previousPresence.current.split(':');
    previousPresence.current = mobPresence;
    const dialogue = useDialogueStore.getState();
    if (prototype === '1' && previousPrototype !== '1') dialogue.announce('prototype.greeting');
    if (golem === '1' && previousGolem !== '1') dialogue.announce('golem.ready');
    if (bossId && bossId !== previousBossId) dialogue.announce('boss.challenge');
    if (!bossId && previousBossId) dialogue.announce('system.victory');
  }, [mobPresence, phase]);

  useEffect(() => {
    if (phase !== 'playing') return;
    if (hp <= Math.max(4, maxHp * 0.3) && !lowHealthAnnounced.current) {
      lowHealthAnnounced.current = true;
      useDialogueStore.getState().announce('system.low_health');
    } else if (hp >= maxHp * 0.6) {
      lowHealthAnnounced.current = false;
    }
  }, [hp, maxHp, phase]);

  useEffect(() => () => useDialogueStore.getState().dismiss(), []);
  return null;
}
