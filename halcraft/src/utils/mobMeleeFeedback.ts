// モブ近接攻撃のヒットフィードバック（VFX・音）共通化

import type { MobType } from '../stores/useMobStore';
import {
  spawnHitImpactEffect,
  spawnMobMeleeHit,
  type MobMeleeHitOptions,
} from './effectTriggers';
import { playMeleeHitSound, playMeleeSwingSound } from './sounds';

export function meleeAccentForType(type: MobType): string {
  switch (type) {
    case 'prototype':
      return '#7ec8ff';
    case 'iron_golem':
      return '#ffb04a';
    case 'zombie':
      return '#8fd66a';
    case 'darwin':
      return '#c86bff';
    case 'spider':
      return '#ff4a3a';
    case 'boss_giant':
      return '#ffdd55';
    default:
      return '#ff8844';
  }
}

export function meleeStyleForType(type: MobType): MobMeleeHitOptions['style'] {
  if (type === 'boss_giant' || type === 'iron_golem') return 'heavy';
  if (type === 'spider') return 'lunge';
  if (type === 'zombie' || type === 'darwin') return 'claw';
  return 'ally';
}

export function meleeScaleForType(type: MobType): number {
  switch (type) {
    case 'boss_giant':
      return 1.85;
    case 'iron_golem':
      return 1.35;
    case 'darwin':
      return 1.25;
    case 'spider':
      return 0.85;
    default:
      return 1.05;
  }
}

/** 振り始め〜スイング同期の風切り音 */
export function triggerMeleeSwingSound(): void {
  playMeleeSwingSound();
}

/**
 * ヒットフレームで呼ぶ: 専用アーク + 共通衝撃 + ヒット音
 */
export function triggerMobMeleeHitFeedback(
  type: MobType,
  x: number,
  y: number,
  z: number,
  dirX: number,
  dirY: number,
  dirZ: number,
): void {
  const accent = meleeAccentForType(type);
  const scale = meleeScaleForType(type);
  const style = meleeStyleForType(type);
  const heavy = style === 'heavy';

  spawnMobMeleeHit(x, y, z, dirX, dirY, dirZ, { accent, scale, style });
  spawnHitImpactEffect(
    x,
    y,
    z,
    dirX,
    Math.max(0.12, dirY),
    dirZ,
    heavy || type === 'darwin',
  );
  playMeleeHitSound(heavy);
}
