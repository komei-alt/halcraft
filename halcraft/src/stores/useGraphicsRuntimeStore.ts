// 実行中のフレームレートに応じて、一時的な描画負荷だけを調整するストア
// ユーザー設定は変更せず、負荷が下がれば自動で元の画質へ戻す

import { create } from 'zustand';

export type GraphicsPressure = 0 | 1 | 2;

interface GraphicsRuntimeState {
  pressure: GraphicsPressure;
  sampledFps: number;
  setRuntimeSample: (pressure: GraphicsPressure, sampledFps: number) => void;
  resetRuntimeQuality: () => void;
}

export const GRAPHICS_PRESSURE_DPR_SCALE: Record<GraphicsPressure, number> = {
  0: 1,
  1: 0.86,
  2: 0.72,
};

export const useGraphicsRuntimeStore = create<GraphicsRuntimeState>((set) => ({
  pressure: 0,
  sampledFps: 60,
  setRuntimeSample: (pressure, sampledFps) => set({ pressure, sampledFps }),
  resetRuntimeQuality: () => set({ pressure: 0, sampledFps: 60 }),
}));
