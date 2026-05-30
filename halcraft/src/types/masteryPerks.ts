// 熟練度レベルに応じた実用ボーナス定義

import type { EquippedItem } from '../stores/usePlayerStore';

export interface MasteryBonus {
  miningSpeedMultiplier: number;
  placementIntervalMultiplier: number;
  rocketCooldownMultiplier: number;
  machineGunDamageBonus: number;
  machineGunSpreadMultiplier: number;
  lightsaberDamageMultiplier: number;
  lightsaberReachBonus: number;
}

const BASE_BONUS: MasteryBonus = {
  miningSpeedMultiplier: 1,
  placementIntervalMultiplier: 1,
  rocketCooldownMultiplier: 1,
  machineGunDamageBonus: 0,
  machineGunSpreadMultiplier: 1,
  lightsaberDamageMultiplier: 1,
  lightsaberReachBonus: 0,
};

function getPerkStep(level: number): number {
  return Math.max(0, Math.min(5, Math.floor((level - 1) / 2)));
}

function getLevelLabel(level: number): string {
  return `Lv.${Math.max(1, Math.floor(level))}`;
}

export function getMasteryBonus(item: EquippedItem, level: number): MasteryBonus {
  const step = getPerkStep(level);

  if (item === 'builder') {
    return {
      ...BASE_BONUS,
      miningSpeedMultiplier: 1 + step * 0.04,
      placementIntervalMultiplier: 1 - step * 0.035,
    };
  }

  if (item === 'rocket_launcher') {
    return {
      ...BASE_BONUS,
      rocketCooldownMultiplier: 1 - step * 0.04,
    };
  }

  if (item === 'machine_gun') {
    return {
      ...BASE_BONUS,
      machineGunDamageBonus: level >= 10 ? 2 : level >= 6 ? 1 : 0,
      machineGunSpreadMultiplier: 1 - step * 0.035,
    };
  }

  return {
    ...BASE_BONUS,
    lightsaberDamageMultiplier: 1 + step * 0.04,
    lightsaberReachBonus: level >= 10 ? 0.5 : level >= 6 ? 0.35 : level >= 3 ? 0.2 : 0,
  };
}

export function getMasteryPerkSummary(item: EquippedItem, level: number): string {
  const bonus = getMasteryBonus(item, level);

  if (item === 'builder') {
    const mining = Math.round((bonus.miningSpeedMultiplier - 1) * 100);
    const placement = Math.round((1 - bonus.placementIntervalMultiplier) * 100);
    return `採掘 +${mining}% / 設置 ${placement}%短縮`;
  }

  if (item === 'rocket_launcher') {
    const cooldown = Math.round((1 - bonus.rocketCooldownMultiplier) * 100);
    return `再発射 ${cooldown}%短縮`;
  }

  if (item === 'machine_gun') {
    const spread = Math.round((1 - bonus.machineGunSpreadMultiplier) * 100);
    const damage = bonus.machineGunDamageBonus > 0 ? ` / 弾 +${bonus.machineGunDamageBonus}` : '';
    return `弾ブレ ${spread}%軽減${damage}`;
  }

  const damage = Math.round((bonus.lightsaberDamageMultiplier - 1) * 100);
  const reach = bonus.lightsaberReachBonus > 0 ? ` / リーチ +${bonus.lightsaberReachBonus.toFixed(1)}` : '';
  return `斬撃 +${damage}%${reach}`;
}

export function getNextMasteryPerkSummary(item: EquippedItem, level: number): string | null {
  const nextLevel = [3, 6, 10].find((candidate) => candidate > level);
  if (!nextLevel) return null;
  return `${getLevelLabel(nextLevel)} ${getMasteryPerkSummary(item, nextLevel)}`;
}
