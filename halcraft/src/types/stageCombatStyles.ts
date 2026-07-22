// 戦争マップごとの推奨武器と実用ボーナス
// ステージ選択の説明と実プレイ中の武器性能を同じ定義でつなぐ

import type { EquippedItem } from '../stores/usePlayerStore';

export interface StageCombatStyle {
  stageId: string;
  icon: string;
  title: string;
  shortLabel: string;
  weapon: EquippedItem;
  detail: string;
  accent: string;
  machineGunCooldownMultiplier?: number;
  machineGunSpreadMultiplier?: number;
  rocketCooldownMultiplier?: number;
  lightsaberDamageMultiplier?: number;
  lightsaberReachBonus?: number;
  lightsaberComboWindowMultiplier?: number;
}

export interface StageCombatModifier {
  machineGunCooldownMultiplier: number;
  machineGunSpreadMultiplier: number;
  rocketCooldownMultiplier: number;
  lightsaberDamageMultiplier: number;
  lightsaberReachBonus: number;
  lightsaberComboWindowMultiplier: number;
}

export const DEFAULT_STAGE_COMBAT_MODIFIER: StageCombatModifier = {
  machineGunCooldownMultiplier: 1,
  machineGunSpreadMultiplier: 1,
  rocketCooldownMultiplier: 1,
  lightsaberDamageMultiplier: 1,
  lightsaberReachBonus: 0,
  lightsaberComboWindowMultiplier: 1,
};

export const STAGE_COMBAT_WEAPON_LABELS: Record<EquippedItem, string> = {
  builder: '建築',
  rocket_launcher: 'ロケット',
  machine_gun: '機関銃',
  lightsaber: 'ライトセイバー',
  gravity_glove: '引力グローブ',
  bomb_slinger: 'ボムスリンガー',
};

export const STAGE_COMBAT_STYLES: Record<string, StageCombatStyle> = {
  'war-forest': {
    stageId: 'war-forest',
    icon: '🎯',
    title: '森の制圧射撃',
    shortLabel: '防衛射撃',
    weapon: 'machine_gun',
    detail: '木陰から来る敵を、低反動の連射で近づく前に止める。',
    accent: '#dce775',
    machineGunCooldownMultiplier: 0.9,
    machineGunSpreadMultiplier: 0.9,
  },
  'war-tropical': {
    stageId: 'war-tropical',
    icon: '🔫',
    title: 'ジャングル弾幕',
    shortLabel: '高速連射',
    weapon: 'machine_gun',
    detail: '敵の数が多い戦線で、連射間隔とブレが小さくなる。',
    accent: '#ffe28a',
    machineGunCooldownMultiplier: 0.82,
    machineGunSpreadMultiplier: 0.84,
  },
  'war-snow': {
    stageId: 'war-snow',
    icon: '⚔️',
    title: '極寒セイバー集中',
    shortLabel: '近接持久',
    weapon: 'lightsaber',
    detail: '白い視界でも踏み込めるよう、斬撃威力・リーチ・コンボ猶予が伸びる。',
    accent: '#c8b0ff',
    lightsaberDamageMultiplier: 1.12,
    lightsaberReachBonus: 0.25,
    lightsaberComboWindowMultiplier: 1.35,
  },
  'war-desert': {
    stageId: 'war-desert',
    icon: '🚀',
    title: '熱砂ロケット突破',
    shortLabel: '爆風突破',
    weapon: 'rocket_launcher',
    detail: '開けた砂地で遠距離爆風を回しやすく、ロケット再発射が短くなる。',
    accent: '#ffc06d',
    rocketCooldownMultiplier: 0.78,
  },
};

export function getStageCombatStyle(stageId: string | null | undefined): StageCombatStyle | null {
  if (!stageId) return null;
  return STAGE_COMBAT_STYLES[stageId] ?? null;
}

export function getStageCombatStyleForItem(
  stageId: string | null | undefined,
  item: EquippedItem,
): StageCombatStyle | null {
  const style = getStageCombatStyle(stageId);
  if (!style || style.weapon !== item) return null;
  return style;
}

export function getStageCombatModifier(
  stageId: string | null | undefined,
  item: EquippedItem,
): StageCombatModifier {
  const style = getStageCombatStyleForItem(stageId, item);
  if (!style) return DEFAULT_STAGE_COMBAT_MODIFIER;
  return {
    machineGunCooldownMultiplier: style.machineGunCooldownMultiplier ?? 1,
    machineGunSpreadMultiplier: style.machineGunSpreadMultiplier ?? 1,
    rocketCooldownMultiplier: style.rocketCooldownMultiplier ?? 1,
    lightsaberDamageMultiplier: style.lightsaberDamageMultiplier ?? 1,
    lightsaberReachBonus: style.lightsaberReachBonus ?? 0,
    lightsaberComboWindowMultiplier: style.lightsaberComboWindowMultiplier ?? 1,
  };
}

export function getStageCombatWeaponLabel(item: EquippedItem): string {
  return STAGE_COMBAT_WEAPON_LABELS[item];
}

export function formatStageCombatBonus(style: StageCombatStyle): string {
  if (style.weapon === 'machine_gun') {
    const fire = Math.round((1 - (style.machineGunCooldownMultiplier ?? 1)) * 100);
    const spread = Math.round((1 - (style.machineGunSpreadMultiplier ?? 1)) * 100);
    return `連射 ${fire}%短縮 / ブレ ${spread}%軽減`;
  }
  if (style.weapon === 'rocket_launcher') {
    const cooldown = Math.round((1 - (style.rocketCooldownMultiplier ?? 1)) * 100);
    return `ロケット再発射 ${cooldown}%短縮`;
  }
  const damage = Math.round(((style.lightsaberDamageMultiplier ?? 1) - 1) * 100);
  const reach = style.lightsaberReachBonus ?? 0;
  const window = Math.round(((style.lightsaberComboWindowMultiplier ?? 1) - 1) * 100);
  return `斬撃 +${damage}% / リーチ +${reach.toFixed(1)} / コンボ猶予 +${window}%`;
}
