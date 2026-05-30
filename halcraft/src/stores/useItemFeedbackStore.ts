// アイテム/ブロック使用時の短いフィードバックを管理するストア

import { create } from 'zustand';
import type { BlockId } from '../types/blocks';
import {
  getBlockUseFeedback,
  type BlockUseFeedbackContent,
  type BlockUseFeedbackContext,
} from '../utils/blockUseFeedback';

export interface ItemFeedbackEvent extends BlockUseFeedbackContent {
  id: string;
  blockId: BlockId;
  createdAt: number;
}

interface EmitFeedbackOptions {
  rateLimitKey?: string;
  rateLimitMs?: number;
}

interface ItemFeedbackState {
  recentFeedback: ItemFeedbackEvent | null;
  emitBlockUseFeedback: (
    blockId: BlockId,
    stageId: string | null,
    context?: BlockUseFeedbackContext,
  ) => ItemFeedbackEvent | null;
  emitFeedback: (
    blockId: BlockId,
    feedback: BlockUseFeedbackContent,
    options?: EmitFeedbackOptions,
  ) => ItemFeedbackEvent | null;
  clearRecentFeedback: (id?: string) => void;
}

const lastFeedbackAt = new Map<string, number>();
let feedbackSequence = 0;

function getRateLimitMs(feedback: BlockUseFeedbackContent): number {
  if (feedback.kind === 'condition') return 2600;
  if (feedback.kind === 'rail' || feedback.kind === 'light') return 1800;
  return 950;
}

export const useItemFeedbackStore = create<ItemFeedbackState>((set) => {
  const emitFeedback = (
    blockId: BlockId,
    feedback: BlockUseFeedbackContent,
    options: EmitFeedbackOptions = {},
  ): ItemFeedbackEvent | null => {
    const now = performance.now();
    const key = options.rateLimitKey ?? `custom:${blockId}:${feedback.kind}:${feedback.title}`;
    const lastAt = lastFeedbackAt.get(key) ?? 0;
    if (now - lastAt < (options.rateLimitMs ?? getRateLimitMs(feedback))) return null;
    lastFeedbackAt.set(key, now);

    const event: ItemFeedbackEvent = {
      ...feedback,
      id: `item-feedback-${feedbackSequence++}`,
      blockId,
      createdAt: now,
    };
    set({ recentFeedback: event });
    return event;
  };

  return {
    recentFeedback: null,

    emitFeedback,

    emitBlockUseFeedback: (blockId, stageId, context = {}) => {
      const feedback = getBlockUseFeedback(blockId, stageId, context);
      if (!feedback) return null;

      return emitFeedback(blockId, feedback, {
        rateLimitKey: `${stageId ?? 'none'}:${blockId}:${feedback.kind}:${feedback.title}`,
      });
    },

    clearRecentFeedback: (id) => {
      set((state) => {
        if (id && state.recentFeedback?.id !== id) return state;
        return { recentFeedback: null };
      });
    },
  };
});
