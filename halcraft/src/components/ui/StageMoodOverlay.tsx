// マップとモードの空気感を画面端に薄く重ねる軽量演出

import { useMemo, type CSSProperties } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useStagePressureStore } from '../../stores/useStagePressureStore';
import type { BiomeId, StageCategory } from '../../types/stages';
import type { StagePressureSeverity } from '../../types/stagePressures';

interface MoodPalette {
  accent: string;
  secondary: string;
  shadow: string;
  stripe: string;
  horizon: string;
  highlight: string;
  atmosphere: string;
}

interface CategoryMood {
  mode: string;
  opacity: number;
  stripeOpacity: number;
  lensOpacity: number;
  strataOpacity: number;
  flowMs: number;
  tiltDeg: number;
}

const BIOME_PALETTE: Record<BiomeId, MoodPalette> = {
  forest: {
    accent: 'rgba(118, 255, 128, 0.34)',
    secondary: 'rgba(255, 232, 128, 0.18)',
    shadow: 'rgba(8, 32, 18, 0.38)',
    stripe: 'rgba(190, 255, 160, 0.22)',
    horizon: 'rgba(178, 255, 130, 0.17)',
    highlight: 'rgba(255, 244, 174, 0.2)',
    atmosphere: 'rgba(70, 180, 100, 0.18)',
  },
  tropical: {
    accent: 'rgba(102, 255, 242, 0.32)',
    secondary: 'rgba(255, 238, 145, 0.2)',
    shadow: 'rgba(4, 34, 48, 0.36)',
    stripe: 'rgba(125, 255, 230, 0.24)',
    horizon: 'rgba(116, 255, 232, 0.18)',
    highlight: 'rgba(255, 245, 178, 0.18)',
    atmosphere: 'rgba(54, 185, 210, 0.18)',
  },
  snow: {
    accent: 'rgba(214, 242, 255, 0.34)',
    secondary: 'rgba(176, 203, 255, 0.2)',
    shadow: 'rgba(14, 22, 42, 0.4)',
    stripe: 'rgba(235, 255, 255, 0.24)',
    horizon: 'rgba(218, 246, 255, 0.18)',
    highlight: 'rgba(187, 214, 255, 0.16)',
    atmosphere: 'rgba(166, 210, 255, 0.16)',
  },
  desert: {
    accent: 'rgba(255, 194, 109, 0.34)',
    secondary: 'rgba(255, 128, 91, 0.18)',
    shadow: 'rgba(55, 30, 12, 0.38)',
    stripe: 'rgba(255, 218, 150, 0.24)',
    horizon: 'rgba(255, 193, 103, 0.18)',
    highlight: 'rgba(255, 232, 164, 0.18)',
    atmosphere: 'rgba(255, 145, 82, 0.16)',
  },
};

const CATEGORY_MOOD: Record<StageCategory, CategoryMood> = {
  build: {
    mode: 'rgba(155, 220, 255, 0.24)',
    opacity: 0.66,
    stripeOpacity: 0.46,
    lensOpacity: 0.54,
    strataOpacity: 0.44,
    flowMs: 7800,
    tiltDeg: -2,
  },
  war: {
    mode: 'rgba(255, 120, 94, 0.3)',
    opacity: 0.72,
    stripeOpacity: 0.52,
    lensOpacity: 0.58,
    strataOpacity: 0.5,
    flowMs: 5200,
    tiltDeg: 5,
  },
};

const SEVERITY_INTENSITY: Record<StagePressureSeverity, number> = {
  safe: 1,
  watch: 1.08,
  danger: 1.18,
  critical: 1.3,
};

type MoodStyle = CSSProperties & {
  '--stage-mood-accent': string;
  '--stage-mood-secondary': string;
  '--stage-mood-shadow': string;
  '--stage-mood-stripe': string;
  '--stage-mood-horizon': string;
  '--stage-mood-highlight': string;
  '--stage-mood-atmosphere': string;
  '--stage-mood-mode': string;
  '--stage-mood-opacity': number;
  '--stage-mood-stripe-opacity': number;
  '--stage-mood-lens-opacity': number;
  '--stage-mood-strata-opacity': number;
  '--stage-mood-strata-near-opacity': number;
  '--stage-mood-shaft-opacity': number;
  '--stage-mood-shaft-soft-opacity': number;
  '--stage-mood-flow-ms': string;
  '--stage-mood-flow-fast-ms': string;
  '--stage-mood-tilt': string;
};

export function StageMoodOverlay() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const runId = useGameStore((s) => s.runId);
  const severity = useStagePressureStore((s) => s.severity);

  const moodStyle = useMemo<MoodStyle | null>(() => {
    if (!stage) return null;
    const biome = BIOME_PALETTE[stage.biome];
    const category = CATEGORY_MOOD[stage.category];
    const pressureIntensity = stage.category === 'war' ? SEVERITY_INTENSITY[severity] : 1;
    return {
      '--stage-mood-accent': biome.accent,
      '--stage-mood-secondary': biome.secondary,
      '--stage-mood-shadow': biome.shadow,
      '--stage-mood-stripe': biome.stripe,
      '--stage-mood-horizon': biome.horizon,
      '--stage-mood-highlight': biome.highlight,
      '--stage-mood-atmosphere': biome.atmosphere,
      '--stage-mood-mode': category.mode,
      '--stage-mood-opacity': Number((
        Math.min(0.96, category.opacity * pressureIntensity)
      ).toFixed(2)),
      '--stage-mood-stripe-opacity': Number((
        Math.min(0.92, category.stripeOpacity * pressureIntensity)
      ).toFixed(2)),
      '--stage-mood-lens-opacity': Number((
        Math.min(0.9, category.lensOpacity * pressureIntensity)
      ).toFixed(2)),
      '--stage-mood-strata-opacity': Number((
        Math.min(0.88, category.strataOpacity * pressureIntensity)
      ).toFixed(2)),
      '--stage-mood-strata-near-opacity': Number((
        Math.min(0.64, category.strataOpacity * pressureIntensity * 0.72)
      ).toFixed(2)),
      '--stage-mood-shaft-opacity': Number((
        Math.min(0.34, category.lensOpacity * pressureIntensity * 0.36)
      ).toFixed(2)),
      '--stage-mood-shaft-soft-opacity': Number((
        Math.min(0.28, category.lensOpacity * pressureIntensity * 0.3)
      ).toFixed(2)),
      '--stage-mood-flow-ms': `${Math.max(3600, Math.round(category.flowMs / pressureIntensity))}ms`,
      '--stage-mood-flow-fast-ms': `${Math.max(3200, Math.round(category.flowMs * 0.86 / pressureIntensity))}ms`,
      '--stage-mood-tilt': `${category.tiltDeg}deg`,
    };
  }, [severity, stage]);

  if (phase !== 'playing' || !stage || !moodStyle) return null;

  return (
    <div
      key={`${stage.id}-${runId}`}
      id="stage-mood-overlay"
      className={`stage-mood-overlay stage-mood-overlay--${stage.category}`}
      data-biome={stage.biome}
      data-category={stage.category}
      data-severity={severity}
      style={moodStyle}
      aria-hidden="true"
    >
      <div className="stage-mood-overlay__lens" />
      <div className="stage-mood-overlay__depth stage-mood-overlay__depth--far" />
      <div className="stage-mood-overlay__depth stage-mood-overlay__depth--near" />
      <div className="stage-mood-overlay__edge stage-mood-overlay__edge--top" />
      <div className="stage-mood-overlay__edge stage-mood-overlay__edge--bottom" />
      <div className="stage-mood-overlay__edge stage-mood-overlay__edge--left" />
      <div className="stage-mood-overlay__edge stage-mood-overlay__edge--right" />
      <div className="stage-mood-overlay__ribbon stage-mood-overlay__ribbon--a" />
      <div className="stage-mood-overlay__ribbon stage-mood-overlay__ribbon--b" />
      <div className="stage-mood-overlay__shaft stage-mood-overlay__shaft--a" />
      <div className="stage-mood-overlay__shaft stage-mood-overlay__shaft--b" />
      <div className="stage-mood-overlay__shaft stage-mood-overlay__shaft--c" />
      <div className="stage-mood-overlay__vista" />
      <div className="stage-mood-overlay__grain" />
    </div>
  );
}
