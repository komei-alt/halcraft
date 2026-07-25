// 実測フレームレートに合わせて、描画負荷をゆっくり段階調整する

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { StageCinematicLightingFX } from './StageCinematicLightingFX';
import { StageGroundLightFX } from './StageGroundLightFX';
import { useGameStore } from '../stores/useGameStore';
import { useGraphicsRuntimeStore, type GraphicsPressure } from '../stores/useGraphicsRuntimeStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';
import { calculateFrameWindowMetrics } from '../utils/frameMetrics';

const WARMUP_SECONDS = 6;
const SAMPLE_SECONDS = 2.5;
const BAD_SAMPLES_TO_REDUCE = 2;
const GOOD_SAMPLES_TO_RECOVER = 4;
const MAX_MEASURED_DELTA = 0.12;
const BENCHMARK_WINDOW_SECONDS = 30;

function nextPressure(current: GraphicsPressure, direction: -1 | 1): GraphicsPressure {
  return Math.max(0, Math.min(2, current + direction)) as GraphicsPressure;
}

/**
 * 一瞬の引っかかりでは画質を変えず、継続的な低下だけに反応する。
 * ユーザーの設定値は保存し直さないため、端末負荷が戻れば自動で復帰する。
 */
export function AdaptiveGraphicsGovernor() {
  const { gl } = useThree();
  const phase = useGameStore((s) => s.phase);
  const graphicsPreset = useSettingsStore((s) => s.graphicsPreset);
  const pressure = useGraphicsRuntimeStore((s) => s.pressure);
  const setRuntimeSample = useGraphicsRuntimeStore((s) => s.setRuntimeSample);
  const resetRuntimeQuality = useGraphicsRuntimeStore((s) => s.resetRuntimeQuality);
  const pressureRef = useRef<GraphicsPressure>(pressure);
  const warmupRef = useRef(0);
  const elapsedRef = useRef(0);
  const frameCountRef = useRef(0);
  const benchmarkFramesRef = useRef<number[]>([]);
  const benchmarkElapsedRef = useRef(0);
  const badSamplesRef = useRef(0);
  const goodSamplesRef = useRef(0);
  const touchRef = useRef(isTouchDevice());

  useEffect(() => {
    pressureRef.current = pressure;
  }, [pressure]);

  useEffect(() => {
    warmupRef.current = 0;
    elapsedRef.current = 0;
    frameCountRef.current = 0;
    benchmarkFramesRef.current = [];
    benchmarkElapsedRef.current = 0;
    badSamplesRef.current = 0;
    goodSamplesRef.current = 0;
    pressureRef.current = 0;
    resetRuntimeQuality();
  }, [graphicsPreset, resetRuntimeQuality]);

  useFrame((_, delta) => {
    if (phase !== 'playing' || document.visibilityState !== 'visible') return;

    warmupRef.current += delta;
    if (warmupRef.current < WARMUP_SECONDS) return;
    const benchmarkDelta = Math.min(delta, MAX_MEASURED_DELTA);
    // 平均品質制御は上限付き、停止検出は生deltaで記録して2〜3秒停止を隠さない。
    benchmarkFramesRef.current.push(delta);
    benchmarkElapsedRef.current += delta;
    if (benchmarkElapsedRef.current >= BENCHMARK_WINDOW_SECONDS) {
      const metrics = calculateFrameWindowMetrics(benchmarkFramesRef.current);
      gl.domElement.setAttribute('data-fps-window-seconds', String(BENCHMARK_WINDOW_SECONDS));
      gl.domElement.setAttribute('data-fps-30s-average', metrics.averageFps.toFixed(1));
      gl.domElement.setAttribute('data-fps-30s-1-percent-low', metrics.onePercentLowFps.toFixed(1));
      gl.domElement.setAttribute('data-frame-max-ms', metrics.maxFrameMs.toFixed(1));
      gl.domElement.setAttribute('data-frames-over-100ms', String(metrics.framesOver100Ms));
      gl.domElement.setAttribute('data-frames-over-250ms', String(metrics.framesOver250Ms));
      gl.domElement.setAttribute('data-frames-over-500ms', String(metrics.framesOver500Ms));
      benchmarkFramesRef.current = [];
      benchmarkElapsedRef.current = 0;
    }
    // 極端に遅いフレームも低FPSとして数える。タブ復帰時などの巨大deltaだけは上限で丸める。
    elapsedRef.current += benchmarkDelta;
    frameCountRef.current += 1;
    if (elapsedRef.current < SAMPLE_SECONDS) return;

    const sampledFps = frameCountRef.current / elapsedRef.current;
    elapsedRef.current = 0;
    frameCountRef.current = 0;

    const reduceBelow = touchRef.current ? 39 : 47;
    const recoverAbove = touchRef.current ? 52 : 56;
    let next = pressureRef.current;

    if (sampledFps < reduceBelow) {
      badSamplesRef.current += 1;
      goodSamplesRef.current = 0;
      if (badSamplesRef.current >= BAD_SAMPLES_TO_REDUCE && next < 2) {
        next = nextPressure(next, 1);
        badSamplesRef.current = 0;
      }
    } else if (sampledFps > recoverAbove) {
      goodSamplesRef.current += 1;
      badSamplesRef.current = 0;
      if (goodSamplesRef.current >= GOOD_SAMPLES_TO_RECOVER && next > 0) {
        next = nextPressure(next, -1);
        goodSamplesRef.current = 0;
      }
    } else {
      badSamplesRef.current = 0;
      goodSamplesRef.current = 0;
    }

    pressureRef.current = next;
    setRuntimeSample(next, Math.round(sampledFps));
    gl.domElement.setAttribute('data-graphics-pressure', String(next));
    gl.domElement.setAttribute('data-sampled-fps', String(Math.round(sampledFps)));
  });

  return null;
}

/** 視界を塞がない軽量レイヤーだけを、余力に合わせて追加する */
export function AdaptiveStageVisuals() {
  const graphicsPreset = useSettingsStore((s) => s.graphicsPreset);
  const atmosphereQuality = useSettingsStore((s) => s.atmosphereQuality);
  const pressure = useGraphicsRuntimeStore((s) => s.pressure);
  const profile = getPerformanceProfile();
  const enabled = graphicsPreset !== 'light'
    && atmosphereQuality !== 'off'
    && profile.tier !== 'low';

  if (!enabled || pressure >= 2) return null;

  return (
    <>
      <StageCinematicLightingFX />
      {pressure === 0 ? <StageGroundLightFX /> : null}
    </>
  );
}
