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
}

interface CategoryMood {
  mode: string;
  opacity: number;
  stripeOpacity: number;
  flowMs: number;
}

const BIOME_PALETTE: Record<BiomeId, MoodPalette> = {
  forest: {
    accent: 'rgba(118, 255, 128, 0.34)',
    secondary: 'rgba(255, 232, 128, 0.18)',
    shadow: 'rgba(8, 32, 18, 0.38)',
    stripe: 'rgba(190, 255, 160, 0.22)',
  },
  tropical: {
    accent: 'rgba(102, 255, 242, 0.32)',
    secondary: 'rgba(255, 238, 145, 0.2)',
    shadow: 'rgba(4, 34, 48, 0.36)',
    stripe: 'rgba(125, 255, 230, 0.24)',
  },
  snow: {
    accent: 'rgba(214, 242, 255, 0.34)',
    secondary: 'rgba(176, 203, 255, 0.2)',
    shadow: 'rgba(14, 22, 42, 0.4)',
    stripe: 'rgba(235, 255, 255, 0.24)',
  },
  desert: {
    accent: 'rgba(255, 194, 109, 0.34)',
    secondary: 'rgba(255, 128, 91, 0.18)',
    shadow: 'rgba(55, 30, 12, 0.38)',
    stripe: 'rgba(255, 218, 150, 0.24)',
  },
};

const CATEGORY_MOOD: Record<StageCategory, CategoryMood> = {
  build: {
    mode: 'rgba(155, 220, 255, 0.24)',
    opacity: 0.78,
    stripeOpacity: 0.58,
    flowMs: 7800,
  },
  war: {
    mode: 'rgba(255, 120, 94, 0.3)',
    opacity: 0.88,
    stripeOpacity: 0.74,
    flowMs: 5200,
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
  '--stage-mood-mode': string;
  '--stage-mood-opacity': number;
  '--stage-mood-stripe-opacity': number;
  '--stage-mood-flow-ms': string;
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
      '--stage-mood-mode': category.mode,
      '--stage-mood-opacity': Number((category.opacity * pressureIntensity).toFixed(2)),
      '--stage-mood-stripe-opacity': Number((category.stripeOpacity * pressureIntensity).toFixed(2)),
      '--stage-mood-flow-ms': `${Math.max(3600, Math.round(category.flowMs / pressureIntensity))}ms`,
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
      <div className="stage-mood-overlay__edge stage-mood-overlay__edge--top" />
      <div className="stage-mood-overlay__edge stage-mood-overlay__edge--bottom" />
      <div className="stage-mood-overlay__edge stage-mood-overlay__edge--left" />
      <div className="stage-mood-overlay__edge stage-mood-overlay__edge--right" />
      <div className="stage-mood-overlay__ribbon stage-mood-overlay__ribbon--a" />
      <div className="stage-mood-overlay__ribbon stage-mood-overlay__ribbon--b" />
      <div className="stage-mood-overlay__grain" />
    </div>
  );
}
