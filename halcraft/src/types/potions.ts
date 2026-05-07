// ポーション & エフェクトシステムの型定義
// Minecraft 準拠の一時バフ/デバフエフェクト

/** エフェクト種別 */
export type EffectType =
  | 'speed'            // 速度UP
  | 'slowness'         // 鈍足
  | 'strength'         // 攻撃力UP
  | 'regeneration'     // HP自然回復加速
  | 'fire_resistance'  // 耐火
  | 'water_breathing'  // 水中呼吸
  | 'night_vision'     // 暗視
  | 'jump_boost';      // ジャンプ力UP

/** ポーションIDの型 */
export type PotionId =
  | 'speed_potion'
  | 'strength_potion'
  | 'regeneration_potion'
  | 'fire_resistance_potion'
  | 'water_breathing_potion'
  | 'night_vision_potion'
  | 'jump_boost_potion';

/** ポーション定義 */
export interface PotionDef {
  id: PotionId;
  name: string;
  /** 付与するエフェクト */
  effect: EffectType;
  /** エフェクトレベル (1=基本, 2=強化) */
  level: number;
  /** 持続時間（秒） */
  duration: number;
  /** 表示用の絵文字 */
  emoji: string;
  /** テーマカラー */
  color: string;
  /** 説明 */
  description: string;
}

/** アクティブエフェクト（プレイヤーに適用中） */
export interface ActiveEffect {
  type: EffectType;
  level: number;
  /** 残り時間（秒） */
  remainingTime: number;
  /** 総持続時間（秒、バー表示用） */
  totalDuration: number;
  /** テーマカラー */
  color: string;
  /** 表示用の絵文字 */
  emoji: string;
}

/** エフェクトの表示情報 */
export const EFFECT_INFO: Record<EffectType, { name: string; emoji: string; color: string }> = {
  speed:            { name: '俊足',     emoji: '💨', color: '#7CAFC2' },
  slowness:         { name: '鈍足',     emoji: '🐌', color: '#5A6C81' },
  strength:         { name: '怪力',     emoji: '💪', color: '#932423' },
  regeneration:     { name: '再生',     emoji: '💗', color: '#CD5CAB' },
  fire_resistance:  { name: '耐火',     emoji: '🔥', color: '#E49A3A' },
  water_breathing:  { name: '水中呼吸', emoji: '🫧', color: '#2E8B9A' },
  night_vision:     { name: '暗視',     emoji: '👁️', color: '#1F1FA1' },
  jump_boost:       { name: '跳躍力UP', emoji: '🦘', color: '#22FF4F' },
};

/** 全ポーション定義 */
export const POTION_DEFS: Record<PotionId, PotionDef> = {
  speed_potion: {
    id: 'speed_potion',
    name: '俊足のポーション',
    effect: 'speed',
    level: 1,
    duration: 60,
    emoji: '💨',
    color: '#7CAFC2',
    description: '60秒間 移動速度が40%アップ',
  },
  strength_potion: {
    id: 'strength_potion',
    name: '怪力のポーション',
    effect: 'strength',
    level: 1,
    duration: 60,
    emoji: '💪',
    color: '#932423',
    description: '60秒間 攻撃力が3増加',
  },
  regeneration_potion: {
    id: 'regeneration_potion',
    name: '再生のポーション',
    effect: 'regeneration',
    level: 1,
    duration: 45,
    emoji: '💗',
    color: '#CD5CAB',
    description: '45秒間 HPが徐々に回復',
  },
  fire_resistance_potion: {
    id: 'fire_resistance_potion',
    name: '耐火のポーション',
    effect: 'fire_resistance',
    level: 1,
    duration: 180,
    emoji: '🔥',
    color: '#E49A3A',
    description: '3分間 炎と溶岩のダメージを無効化',
  },
  water_breathing_potion: {
    id: 'water_breathing_potion',
    name: '水中呼吸のポーション',
    effect: 'water_breathing',
    level: 1,
    duration: 180,
    emoji: '🫧',
    color: '#2E8B9A',
    description: '3分間 水中で息が減らなくなる',
  },
  night_vision_potion: {
    id: 'night_vision_potion',
    name: '暗視のポーション',
    effect: 'night_vision',
    level: 1,
    duration: 180,
    emoji: '👁️',
    color: '#1F1FA1',
    description: '3分間 暗闇でも明るく見える',
  },
  jump_boost_potion: {
    id: 'jump_boost_potion',
    name: '跳躍のポーション',
    effect: 'jump_boost',
    level: 1,
    duration: 60,
    emoji: '🦘',
    color: '#22FF4F',
    description: '60秒間 ジャンプ力がアップ',
  },
};

/** エフェクトの倍率計算 */
export function getSpeedMultiplier(level: number): number {
  return 1 + level * 0.2; // Lv1: 1.2倍、Lv2: 1.4倍
}

export function getStrengthBonus(level: number): number {
  return level * 3; // Lv1: +3、Lv2: +6
}

export function getJumpBoostMultiplier(level: number): number {
  return 1 + level * 0.5; // Lv1: 1.5倍、Lv2: 2.0倍
}

export function getRegenRate(level: number): number {
  return level * 1.0; // Lv1: 1HP/s、Lv2: 2HP/s
}
