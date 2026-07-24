export interface FrameWindowMetrics {
  averageFps: number;
  onePercentLowFps: number;
  elapsedSeconds: number;
  frameCount: number;
}

/** フレーム時間列から平均FPSと、最も遅い1%の平均に基づく1% Lowを求める。 */
export function calculateFrameWindowMetrics(frameDeltas: readonly number[]): FrameWindowMetrics {
  const validDeltas = frameDeltas.filter((delta) => Number.isFinite(delta) && delta > 0);
  if (validDeltas.length === 0) {
    return { averageFps: 0, onePercentLowFps: 0, elapsedSeconds: 0, frameCount: 0 };
  }

  const elapsedSeconds = validDeltas.reduce((sum, delta) => sum + delta, 0);
  const slowestFrameCount = Math.max(1, Math.ceil(validDeltas.length * 0.01));
  const slowestAverage = [...validDeltas]
    .sort((a, b) => b - a)
    .slice(0, slowestFrameCount)
    .reduce((sum, delta) => sum + delta, 0) / slowestFrameCount;

  return {
    averageFps: validDeltas.length / elapsedSeconds,
    onePercentLowFps: 1 / slowestAverage,
    elapsedSeconds,
    frameCount: validDeltas.length,
  };
}
