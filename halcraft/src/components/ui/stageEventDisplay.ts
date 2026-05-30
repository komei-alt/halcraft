// ステージイベントHUDの表示値を共通化する

import type { StageTimedEvent } from '../../stores/useStageEventStore';
import type { StageEventDefinition } from '../../types/stageEvents';

export interface StageEventHudDisplay {
  active: boolean;
  icon: string;
  title: string;
  detail: string;
  accent: string;
  statusLabel: string;
  timerLabel: string;
  progress: number;
}

export function formatStageEventCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return minutes > 0 ? `${minutes}:${rest.toString().padStart(2, '0')}` : `${rest}s`;
}

export function getStageEventHudDisplay(
  definition: StageEventDefinition,
  elapsedSeconds: number,
  nextTriggerAtSeconds: number,
  recentEvent: StageTimedEvent | null,
  now: number,
): StageEventHudDisplay {
  const active = Boolean(recentEvent && recentEvent.activeUntil > now);
  const remainingSeconds = Math.max(0, nextTriggerAtSeconds - elapsedSeconds);
  const activeDuration = recentEvent
    ? Math.max(1, recentEvent.activeUntil - recentEvent.createdAt)
    : 1;

  return {
    active,
    icon: active ? recentEvent?.icon ?? definition.icon : definition.icon,
    title: active ? recentEvent?.title ?? definition.title : definition.title,
    detail: active ? recentEvent?.detail ?? definition.detail : definition.detail,
    accent: active ? recentEvent?.accent ?? definition.accent : definition.accent,
    statusLabel: active ? 'マップイベント発生中' : '次のマップイベント',
    timerLabel: active
      ? recentEvent?.label ?? definition.label
      : `次まで ${formatStageEventCountdown(remainingSeconds)}`,
    progress: active && recentEvent
      ? Math.max(0, Math.min(1, (recentEvent.activeUntil - now) / activeDuration))
      : 1 - Math.max(0, Math.min(1, remainingSeconds / definition.repeatEverySeconds)),
  };
}
