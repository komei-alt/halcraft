export interface FrameWindowMetrics {
  averageFps: number;
  onePercentLowFps: number;
  elapsedSeconds: number;
  frameCount: number;
  maxFrameMs: number;
  framesOver100Ms: number;
  framesOver250Ms: number;
  framesOver500Ms: number;
}

/** フレーム時間列から平均FPSと、最も遅い1%の平均に基づく1% Lowを求める。 */
export function calculateFrameWindowMetrics(frameDeltas: readonly number[]): FrameWindowMetrics {
  const validDeltas = frameDeltas.filter((delta) => Number.isFinite(delta) && delta > 0);
  if (validDeltas.length === 0) {
    return {
      averageFps: 0,
      onePercentLowFps: 0,
      elapsedSeconds: 0,
      frameCount: 0,
      maxFrameMs: 0,
      framesOver100Ms: 0,
      framesOver250Ms: 0,
      framesOver500Ms: 0,
    };
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
    maxFrameMs: Math.max(...validDeltas) * 1000,
    framesOver100Ms: validDeltas.filter((delta) => delta >= 0.1).length,
    framesOver250Ms: validDeltas.filter((delta) => delta >= 0.25).length,
    framesOver500Ms: validDeltas.filter((delta) => delta >= 0.5).length,
  };
}
