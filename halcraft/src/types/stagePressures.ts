// ステージ環境プレッシャー定義
// 戦争マップごとに、地形や支給ブロックを使って対策するルールを持たせる

import { BLOCK_IDS, type BlockId } from './blocks';

export type StagePressureKind = 'ambush' | 'humidity' | 'cold' | 'heat';
export type StagePressureSeverity = 'safe' | 'watch' | 'danger' | 'critical';

export interface StagePressureTimeWindow {
  start: number;
  end: number;
  multiplier: number;
  label: string;
}

export interface StagePressureDefinition {
  stageId: string;
  kind: StagePressureKind;
  icon: string;
  title: string;
  description: string;
  dangerLabel: string;
  safeLabel: string;
  protectLabel: string;
  reliefLabel: string;
  reliefModeGain: number;
  accent: string;
  safeBlocks: BlockId[];
  safeRadius: number;
  verticalRadius: number;
  risePerSecond: number;
  recoverPerSecond: number;
  hungerExhaustionPerSecond: number;
  damageThreshold: number;
  damagePerSecond: number;
  waterRelief: boolean;
  timeWindows?: StagePressureTimeWindow[];
}

const LIGHT_AND_DEFENSE_BLOCKS: BlockId[] = [
  BLOCK_IDS.TORCH,
  BLOCK_IDS.CAMPFIRE,
  BLOCK_IDS.GLOWSTONE,
  BLOCK_IDS.TURRET,
];

export const STAGE_PRESSURES: Record<string, StagePressureDefinition> = {
  'war-forest': {
    stageId: 'war-forest',
    kind: 'ambush',
    icon: '🌘',
    title: '夜森の緊張',
    description: '夜は森の暗がりで緊張が上がる。灯りやタレットの近くで立て直そう。',
    dangerLabel: '暗がりで消耗中',
    safeLabel: '灯りの防衛圏',
    protectLabel: '松明・焚き火・タレットの近くへ',
    reliefLabel: '防衛圏で立て直すと戦意が戻る',
    reliefModeGain: 16,
    accent: '#dce775',
    safeBlocks: LIGHT_AND_DEFENSE_BLOCKS,
    safeRadius: 5,
    verticalRadius: 3,
    risePerSecond: 0.03,
    recoverPerSecond: 0.19,
    hungerExhaustionPerSecond: 0.045,
    damageThreshold: 0.94,
    damagePerSecond: 0.18,
    waterRelief: false,
    timeWindows: [
      { start: 0.52, end: 1, multiplier: 1, label: '夜' },
      { start: 0, end: 0.08, multiplier: 0.7, label: '明け方' },
    ],
  },
  'war-tropical': {
    stageId: 'war-tropical',
    kind: 'humidity',
    icon: '💦',
    title: '密林の蒸し暑さ',
    description: '走り回るほど蒸し暑さがこたえる。水辺を使ってラッシュを受け流そう。',
    dangerLabel: '蒸し暑さで消耗中',
    safeLabel: '水辺でクールダウン',
    protectLabel: '水ブロックや水辺に寄る',
    reliefLabel: '水辺で受け流すと戦意が戻る',
    reliefModeGain: 18,
    accent: '#80deea',
    safeBlocks: [BLOCK_IDS.WATER],
    safeRadius: 4,
    verticalRadius: 2,
    risePerSecond: 0.045,
    recoverPerSecond: 0.22,
    hungerExhaustionPerSecond: 0.09,
    damageThreshold: 0.96,
    damagePerSecond: 0.16,
    waterRelief: true,
  },
  'war-snow': {
    stageId: 'war-snow',
    kind: 'cold',
    icon: '🥶',
    title: '極寒',
    description: '吹雪の戦場では体温が下がる。火と光の近くを補給地点にしよう。',
    dangerLabel: '寒さで消耗中',
    safeLabel: '暖かい補給圏',
    protectLabel: '焚き火・松明・光る石の近くへ',
    reliefLabel: '火のそばで温まると戦意が戻る',
    reliefModeGain: 22,
    accent: '#bbdefb',
    safeBlocks: [BLOCK_IDS.CAMPFIRE, BLOCK_IDS.TORCH, BLOCK_IDS.GLOWSTONE, BLOCK_IDS.ELECTRIC],
    safeRadius: 5,
    verticalRadius: 3,
    risePerSecond: 0.062,
    recoverPerSecond: 0.24,
    hungerExhaustionPerSecond: 0.11,
    damageThreshold: 0.88,
    damagePerSecond: 0.34,
    waterRelief: false,
  },
  'war-desert': {
    stageId: 'war-desert',
    kind: 'heat',
    icon: '☀️',
    title: '熱砂',
    description: '昼の砂漠は熱で消耗する。水場や石の陰を作って戦闘拠点にしよう。',
    dangerLabel: '熱で消耗中',
    safeLabel: '日陰・水場で冷却',
    protectLabel: '水・石・階段の近くへ',
    reliefLabel: '日陰や水場で冷やすと戦意が戻る',
    reliefModeGain: 22,
    accent: '#ffc06d',
    safeBlocks: [BLOCK_IDS.WATER, BLOCK_IDS.STONE, BLOCK_IDS.STAIRS],
    safeRadius: 5,
    verticalRadius: 3,
    risePerSecond: 0.068,
    recoverPerSecond: 0.24,
    hungerExhaustionPerSecond: 0.14,
    damageThreshold: 0.86,
    damagePerSecond: 0.3,
    waterRelief: true,
    timeWindows: [
      { start: 0.1, end: 0.58, multiplier: 1, label: '昼の熱' },
      { start: 0.58, end: 0.72, multiplier: 0.4, label: '残暑' },
    ],
  },
};

export function getStagePressure(stageId: string | null | undefined): StagePressureDefinition | null {
  if (!stageId) return null;
  return STAGE_PRESSURES[stageId] ?? null;
}

export function getStagePressureTimeMultiplier(
  definition: StagePressureDefinition,
  gameTime: number,
): number {
  if (!definition.timeWindows) return 1;

  for (const window of definition.timeWindows) {
    const inRange = window.start <= window.end
      ? gameTime >= window.start && gameTime < window.end
      : gameTime >= window.start || gameTime < window.end;
    if (inRange) return window.multiplier;
  }

  return 0;
}

export function getStagePressureSeverity(pressure: number): StagePressureSeverity {
  if (pressure >= 0.86) return 'critical';
  if (pressure >= 0.62) return 'danger';
  if (pressure >= 0.28) return 'watch';
  return 'safe';
}

export function getStagePressureReliefGain(
  definition: StagePressureDefinition,
  peakPressure: number,
): number {
  const urgencyBonus = peakPressure >= 0.86
    ? 10
    : peakPressure >= 0.62
      ? 6
      : peakPressure >= 0.42
        ? 3
        : 0;
  return definition.reliefModeGain + urgencyBonus;
}

export function isStagePressureShelterBlock(
  definition: StagePressureDefinition,
  blockId: BlockId,
): boolean {
  return definition.safeBlocks.includes(blockId);
}
