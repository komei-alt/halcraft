// グローバルエフェクトトリガー関数
// コンポーネントファイルからエクスポートするとreact-refresh違反になるので分離
// コンポーネント側は useEffect でこのモジュールの関数を登録する

import type { BlockId } from '../types/blocks';
import type { MobType } from '../stores/useMobStore';

// ========== DamagePopup ==========
let _spawnDamagePopupFn: (damage: number, x: number, y: number, z: number, isCritical: boolean) => void = () => {};

export function spawnDamagePopup(damage: number, x: number, y: number, z: number, isCritical: boolean): void {
  _spawnDamagePopupFn(damage, x, y, z, isCritical);
}

export function registerDamagePopupSpawner(fn: typeof _spawnDamagePopupFn): void {
  _spawnDamagePopupFn = fn;
}

// ========== HitImpactEffect ==========
let _spawnHitImpactEffectFn: (
  x: number,
  y: number,
  z: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  isCritical: boolean,
) => void = () => {};

export function spawnHitImpactEffect(
  x: number,
  y: number,
  z: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  isCritical: boolean,
): void {
  _spawnHitImpactEffectFn(x, y, z, dirX, dirY, dirZ, isCritical);
}

export function registerHitImpactEffectSpawner(fn: typeof _spawnHitImpactEffectFn): void {
  _spawnHitImpactEffectFn = fn;
}

// ========== MobDeathEffect ==========
let _spawnMobDeathEffectFn: (mobType: MobType, x: number, y: number, z: number) => void = () => {};

export function spawnMobDeathEffect(mobType: MobType, x: number, y: number, z: number): void {
  _spawnMobDeathEffectFn(mobType, x, y, z);
}

export function registerMobDeathEffectSpawner(fn: typeof _spawnMobDeathEffectFn): void {
  _spawnMobDeathEffectFn = fn;
}

// ========== BlockBreakEffect ==========
let _spawnBlockBreakEffectFn: (blockId: BlockId, x: number, y: number, z: number) => void = () => {};

export function spawnBlockBreakEffect(blockId: BlockId, x: number, y: number, z: number): void {
  _spawnBlockBreakEffectFn(blockId, x, y, z);
}

export function registerBlockBreakEffectSpawner(fn: typeof _spawnBlockBreakEffectFn): void {
  _spawnBlockBreakEffectFn = fn;
}
