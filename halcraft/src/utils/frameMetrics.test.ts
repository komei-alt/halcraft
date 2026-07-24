import { describe, expect, it } from 'vitest';
import { calculateFrameWindowMetrics } from './frameMetrics';

describe('frame window metrics', () => {
  it('固定60FPS列の平均と1% Lowを60として返す', () => {
    const metrics = calculateFrameWindowMetrics(Array.from({ length: 1800 }, () => 1 / 60));
    expect(metrics.averageFps).toBeCloseTo(60, 5);
    expect(metrics.onePercentLowFps).toBeCloseTo(60, 5);
    expect(metrics.elapsedSeconds).toBeCloseTo(30, 5);
  });

  it('遅い1%のフレームを1% Lowへ反映する', () => {
    const deltas = [
      ...Array.from({ length: 990 }, () => 1 / 60),
      ...Array.from({ length: 10 }, () => 1 / 40),
    ];
    const metrics = calculateFrameWindowMetrics(deltas);
    expect(metrics.averageFps).toBeGreaterThan(59);
    expect(metrics.onePercentLowFps).toBeCloseTo(40, 5);
  });
});
