// 採掘ターゲットHUD用の一時状態
// BlockInteractionで見ているブロックをUIへ渡し、道具選びの意味を画面に返す

import { create } from 'zustand';
import type { BlockId } from '../types/blocks';
import type { ToolId, ToolType } from '../types/tools';

export type MiningFocusBlockerReason = 'unbreakable' | 'tool-tier';

export interface MiningFocusSnapshot {
  blockId: BlockId;
  blockName: string;
  x: number;
  y: number;
  z: number;
  progress: number;
  hardness: number;
  canBreak: boolean;
  blockerReason: MiningFocusBlockerReason | null;
  requiredTier: number;
  playerTier: number;
  miningSpeed: number;
  effective: boolean;
  blockCategory: string | null;
  equippedToolId: ToolId | null;
  equippedToolName: string;
  equippedToolType: ToolType | null;
  updatedAt: number;
}

interface MiningFocusState {
  target: MiningFocusSnapshot | null;
  setTarget: (target: MiningFocusSnapshot) => void;
  clearTarget: () => void;
}

export const useMiningFocusStore = create<MiningFocusState>((set) => ({
  target: null,
  setTarget: (target) => set({ target }),
  clearTarget: () => set({ target: null }),
}));
