// ステージ環境プレッシャーの現在値
// HUDと実プレイ処理を分離し、マップごとの消耗状態を共有する

import { create } from 'zustand';
import type { StagePressureKind, StagePressureSeverity } from '../types/stagePressures';

interface StagePressureSnapshot {
  stageId: string | null;
  kind: StagePressureKind | null;
  title: string;
  pressure: number;
  severity: StagePressureSeverity;
  isSheltered: boolean;
  timeMultiplier: number;
  statusLabel: string;
  updatedAt: number;
}

interface StagePressureState extends StagePressureSnapshot {
  setSnapshot: (snapshot: StagePressureSnapshot) => void;
  reset: () => void;
}

const EMPTY_SNAPSHOT: StagePressureSnapshot = {
  stageId: null,
  kind: null,
  title: '',
  pressure: 0,
  severity: 'safe',
  isSheltered: true,
  timeMultiplier: 0,
  statusLabel: '',
  updatedAt: 0,
};

export const useStagePressureStore = create<StagePressureState>()((set) => ({
  ...EMPTY_SNAPSHOT,
  setSnapshot: (snapshot) => set(snapshot),
  reset: () => set(EMPTY_SNAPSHOT),
}));
