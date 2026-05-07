// エンチャントシステムの型定義
// ツールや防具に付与できる強化効果

/** エンチャントの種類 */
export type EnchantmentType =
  | 'sharpness'    // 攻撃力UP
  | 'efficiency'   // 採掘速度UP
  | 'unbreaking'   // 耐久力UP
  | 'fortune'      // 鉱石ドロップ増加
  | 'protection';  // 防御力UP

/** エンチャント定義 */
export interface EnchantmentDef {
  id: EnchantmentType;
  name: string;
  /** 最大レベル */
  maxLevel: number;
  /** 適用可能な対象 */
  target: 'tool' | 'weapon' | 'armor' | 'all';
  /** 説明テンプレート */
  description: string;
  /** 表示用の絵文字 */
  emoji: string;
  /** テーマカラー */
  color: string;
}

/** 全エンチャント定義 */
export const ENCHANTMENT_DEFS: Record<EnchantmentType, EnchantmentDef> = {
  sharpness: {
    id: 'sharpness',
    name: 'ダメージ増加',
    maxLevel: 3,
    target: 'weapon',
    description: '攻撃力 +{level}',
    emoji: '⚔️',
    color: '#FF6B6B',
  },
  efficiency: {
    id: 'efficiency',
    name: '効率強化',
    maxLevel: 3,
    target: 'tool',
    description: '採掘速度 +{level}0%',
    emoji: '⛏️',
    color: '#4ECDC4',
  },
  unbreaking: {
    id: 'unbreaking',
    name: '耐久力',
    maxLevel: 3,
    target: 'all',
    description: '耐久値消費 {level}0%減少',
    emoji: '🛡️',
    color: '#A0A0FF',
  },
  fortune: {
    id: 'fortune',
    name: '幸運',
    maxLevel: 3,
    target: 'tool',
    description: '鉱石ドロップ +{level}個',
    emoji: '💎',
    color: '#FFD700',
  },
  protection: {
    id: 'protection',
    name: '防護',
    maxLevel: 3,
    target: 'armor',
    description: '防御力 +{level}',
    emoji: '🛡️',
    color: '#87CEEB',
  },
};

/** エンチャントに必要なXPコスト */
export function getEnchantCost(level: number): number {
  return level * 5; // Lv1: 5XP、Lv2: 10XP、Lv3: 15XP
}

/** エンチャントレベルのローマ数字表記 */
export function romanNumeral(level: number): string {
  const map: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III' };
  return map[level] ?? String(level);
}
