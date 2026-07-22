// グローバルエフェクトトリガー関数
// コンポーネントファイルからエクスポートするとreact-refresh違反になるので分離
// コンポーネント側は useEffect でこのモジュールの関数を登録する

import type { BlockId } from '../types/blocks';
import type { MobType } from '../stores/useMobStore';
import type { BlockUseFeedbackKind } from './blockUseFeedback';

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

// ========== BlockUseEffect ==========
let _spawnBlockUseEffectFn: (
  kind: BlockUseFeedbackKind,
  x: number,
  y: number,
  z: number,
  accent: string,
) => void = () => {};

export function spawnBlockUseEffect(
  kind: BlockUseFeedbackKind,
  x: number,
  y: number,
  z: number,
  accent: string,
): void {
  _spawnBlockUseEffectFn(kind, x, y, z, accent);
}

export function registerBlockUseEffectSpawner(fn: typeof _spawnBlockUseEffectFn): void {
  _spawnBlockUseEffectFn = fn;
}

// ========== VehicleExplosionEffect ==========
import type { VehicleType } from '../stores/useVehicleStore';

let _spawnVehicleExplosionFn: (type: VehicleType, x: number, y: number, z: number) => void = () => {};

export function spawnVehicleExplosion(type: VehicleType, x: number, y: number, z: number): void {
  _spawnVehicleExplosionFn(type, x, y, z);
}

export function registerVehicleExplosionSpawner(fn: typeof _spawnVehicleExplosionFn): void {
  _spawnVehicleExplosionFn = fn;
}

// ========== CombatExplosionFX（ロケット・砲弾・爆弾・TNT共通） ==========
export type CombatExplosionStyle = 'rocket' | 'bomb' | 'tnt' | 'precision';

export interface CombatExplosionOptions {
  style?: CombatExplosionStyle;
  scale?: number;
  intensity?: number;
  accent?: string;
}

let _spawnCombatExplosionFn: (
  x: number,
  y: number,
  z: number,
  options?: CombatExplosionOptions,
) => void = () => {};

export function spawnCombatExplosion(
  x: number,
  y: number,
  z: number,
  options?: CombatExplosionOptions,
): void {
  _spawnCombatExplosionFn(x, y, z, options);
}

export function registerCombatExplosionSpawner(fn: typeof _spawnCombatExplosionFn): void {
  _spawnCombatExplosionFn = fn;
}

// ========== AllyMeleeAttackFX（味方近接のヒット瞬間） ==========
export interface AllyMeleeHitOptions {
  /** アクセント色（CSS/hex） */
  accent?: string;
  /** 見た目スケール */
  scale?: number;
  /** ally=プロトタイプ, heavy=ゴーレム */
  style?: 'ally' | 'heavy';
}

let _spawnAllyMeleeHitFn: (
  x: number,
  y: number,
  z: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  options?: AllyMeleeHitOptions,
) => void = () => {};

export function spawnAllyMeleeHit(
  x: number,
  y: number,
  z: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  options?: AllyMeleeHitOptions,
): void {
  _spawnAllyMeleeHitFn(x, y, z, dirX, dirY, dirZ, options);
}

export function registerAllyMeleeHitSpawner(fn: typeof _spawnAllyMeleeHitFn): void {
  _spawnAllyMeleeHitFn = fn;
}
