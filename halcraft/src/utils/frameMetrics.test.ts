import { describe, expect, it } from 'vitest';
import { calculateFrameWindowMetrics } from './frameMetrics';

describe('frame window metrics', () => {
  it('固定60FPS列の平均と1% Lowを60として返す', () => {
    const metrics = calculateFrameWindowMetrics(Array.from({ length: 1800 }, () => 1 / 60));
    expect(metrics.averageFps).toBeCloseTo(60, 5);
    expect(metrics.onePercentLowFps).toBeCloseTo(60, 5);
    expect(metrics.elapsedSeconds).toBeCloseTo(30, 5);
    expect(metrics.maxFrameMs).toBeCloseTo(1000 / 60, 5);
    expect(metrics.framesOver100Ms).toBe(0);
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

  it('長時間停止を平均用クランプで隠さず閾値別に数える', () => {
    const metrics = calculateFrameWindowMetrics([1 / 60, 0.12, 0.3, 2.4]);
    expect(metrics.maxFrameMs).toBe(2400);
    expect(metrics.framesOver100Ms).toBe(3);
    expect(metrics.framesOver250Ms).toBe(2);
    expect(metrics.framesOver500Ms).toBe(1);
  });
});
