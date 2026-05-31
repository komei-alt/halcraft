// 技記録に応じた実用ボーナス定義

import type { EquippedItem } from '../stores/usePlayerStore';
import type { MasteryItemState } from '../stores/useMasteryStore';

export interface MasteryTechniqueBonus {
  tier: number;
  tierLabel: string;
  title: string;
  detail: string;
  rocketCooldownMultiplier: number;
  machineGunCooldownMultiplier: number;
  machineGunSpreadMultiplier: number;
  machineGunDamageBonus: number;
  lightsaberDamageMultiplier: number;
  lightsaberComboWindowMultiplier: number;
  builderMiningSpeedMultiplier: number;
  builderPlacementIntervalMultiplier: number;
}

export interface MasteryTechniqueProgress {
  currentValue: number;
  currentTier: number;
  nextTier: number | null;
  nextThreshold: number | null;
  finalThreshold: number;
  ratio: number;
  valueText: string;
  nextTargetText: string;
}

const BASE_TECHNIQUE_BONUS: MasteryTechniqueBonus = {
  tier: 0,
  tierLabel: 'TECH 0',
  title: '技特典',
  detail: '記録を伸ばすと特典が育つ',
  rocketCooldownMultiplier: 1,
  machineGunCooldownMultiplier: 1,
  machineGunSpreadMultiplier: 1,
  machineGunDamageBonus: 0,
  lightsaberDamageMultiplier: 1,
  lightsaberComboWindowMultiplier: 1,
  builderMiningSpeedMultiplier: 1,
  builderPlacementIntervalMultiplier: 1,
};

const TECHNIQUE_THRESHOLDS: Record<EquippedItem, readonly [number, number, number]> = {
  builder: [8, 12, 18],
  rocket_launcher: [45, 65, 85],
  machine_gun: [5, 8, 12],
  lightsaber: [5, 8, 12],
};

function clampMultiplier(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getTier(value: number, thresholds: readonly [number, number, number]): number {
  if (value >= thresholds[2]) return 3;
  if (value >= thresholds[1]) return 2;
  if (value >= thresholds[0]) return 1;
  return 0;
}

function getTechniqueValue(item: EquippedItem, mastery: MasteryItemState | undefined): number {
  if (!mastery) return 0;
  if (item === 'rocket_launcher') return mastery.bestTechniqueScore ?? 0;
  return mastery.bestTechniqueStreak ?? 0;
}

export function formatMasteryTechniqueValue(item: EquippedItem, value: number): string {
  if (item === 'rocket_launcher') return `BLAST ${value}`;
  if (item === 'machine_gun') return `BURST x${value}`;
  if (item === 'lightsaber') return `COMBO x${value}`;
  return `CHAIN x${value}`;
}

export function getMasteryTechniqueProgress(
  item: EquippedItem,
  mastery: MasteryItemState | undefined,
): MasteryTechniqueProgress {
  const thresholds = TECHNIQUE_THRESHOLDS[item];
  const currentValue = getTechniqueValue(item, mastery);
  const currentTier = getTier(currentValue, thresholds);
  const nextTier = currentTier >= 3 ? null : currentTier + 1;
  const nextThreshold = nextTier ? thresholds[nextTier - 1] : null;
  const floor = currentTier <= 0 ? 0 : thresholds[currentTier - 1];
  const ceiling = nextThreshold ?? thresholds[2];
  const ratio = nextThreshold === null ? 1 : clampRatio((currentValue - floor) / Math.max(1, ceiling - floor));

  return {
    currentValue,
    currentTier,
    nextTier,
    nextThreshold,
    finalThreshold: thresholds[2],
    ratio,
    valueText: currentValue > 0 ? formatMasteryTechniqueValue(item, currentValue) : 'START',
    nextTargetText: nextThreshold === null
      ? 'TECH MAX'
      : `次 TECH ${nextTier}: ${formatMasteryTechniqueValue(item, nextThreshold)}`,
  };
}

export function getMasteryTechniqueBonus(
  item: EquippedItem,
  mastery: MasteryItemState | undefined,
): MasteryTechniqueBonus {
  const tier = getTier(getTechniqueValue(item, mastery), TECHNIQUE_THRESHOLDS[item]);
  const tierLabel = tier > 0 ? `TECH ${tier}` : 'TECH 0';

  if (item === 'builder') {
    return {
      ...BASE_TECHNIQUE_BONUS,
      tier,
      tierLabel,
      title: '制作連鎖特典',
      detail: '制作連鎖が採掘と連続設置を速くする',
      builderMiningSpeedMultiplier: clampMultiplier(1 + tier * 0.025, 1, 1.1),
      builderPlacementIntervalMultiplier: clampMultiplier(1 - tier * 0.03, 0.88, 1),
    };
  }

  if (item === 'rocket_launcher') {
    return {
      ...BASE_TECHNIQUE_BONUS,
      tier,
      tierLabel,
      title: '爆風BEST特典',
      detail: '爆風BESTが次弾の装填を速くする',
      rocketCooldownMultiplier: clampMultiplier(1 - tier * 0.035, 0.88, 1),
    };
  }

  if (item === 'machine_gun') {
    return {
      ...BASE_TECHNIQUE_BONUS,
      tier,
      tierLabel,
      title: '弾幕チェーン特典',
      detail: '弾幕チェーンが連射と命中精度を育てる',
      machineGunCooldownMultiplier: clampMultiplier(1 - tier * 0.025, 0.9, 1),
      machineGunSpreadMultiplier: clampMultiplier(1 - tier * 0.035, 0.88, 1),
      machineGunDamageBonus: tier >= 3 ? 1 : 0,
    };
  }

  return {
    ...BASE_TECHNIQUE_BONUS,
    tier,
    tierLabel,
    title: 'コンボBEST特典',
    detail: 'コンボ記録が斬撃とコンボ継続を強くする',
    lightsaberDamageMultiplier: clampMultiplier(1 + tier * 0.03, 1, 1.1),
    lightsaberComboWindowMultiplier: clampMultiplier(1 + tier * 0.08, 1, 1.25),
  };
}

export function formatMasteryTechniqueBonus(item: EquippedItem, bonus: MasteryTechniqueBonus): string {
  if (bonus.tier <= 0) return '記録で解放';

  if (item === 'builder') {
    const mining = Math.round((bonus.builderMiningSpeedMultiplier - 1) * 100);
    const placement = Math.round((1 - bonus.builderPlacementIntervalMultiplier) * 100);
    return `採掘 +${mining}% / 設置 ${placement}%短縮`;
  }

  if (item === 'rocket_launcher') {
    const cooldown = Math.round((1 - bonus.rocketCooldownMultiplier) * 100);
    return `再発射 ${cooldown}%短縮`;
  }

  if (item === 'machine_gun') {
    const cooldown = Math.round((1 - bonus.machineGunCooldownMultiplier) * 100);
    const spread = Math.round((1 - bonus.machineGunSpreadMultiplier) * 100);
    const damage = bonus.machineGunDamageBonus > 0 ? ` / 弾 +${bonus.machineGunDamageBonus}` : '';
    return `連射 ${cooldown}%短縮 / ブレ ${spread}%軽減${damage}`;
  }

  const damage = Math.round((bonus.lightsaberDamageMultiplier - 1) * 100);
  const combo = Math.round((bonus.lightsaberComboWindowMultiplier - 1) * 100);
  return `斬撃 +${damage}% / コンボ猶予 +${combo}%`;
}
