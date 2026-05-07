// ツール・武器システムの型定義
// マイクラ風のツールティア（木→石→鉄→ダイヤ）と種別（ピッケル・斧・シャベル・剣）

/** ツールティア（数値が高いほど上位） */
export type ToolTier = 'wood' | 'stone' | 'iron' | 'diamond';

/** ツール種別 */
export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'sword';

/** ツールの固有ID */
export type ToolId = `${ToolTier}_${ToolType}`;

/** ツール定義 */
export interface ToolDef {
  id: ToolId;
  name: string;
  tier: ToolTier;
  type: ToolType;
  /** ティア数値（0=素手, 1=木, 2=石, 3=鉄, 4=ダイヤ） */
  tierLevel: number;
  /** 採掘速度倍率（素手=1.0） */
  miningSpeed: number;
  /** 攻撃力（素手=1） */
  attackDamage: number;
  /** 最大耐久値 */
  maxDurability: number;
  /** 表示用の絵文字 */
  emoji: string;
  /** テクスチャカラー（HUD描画用） */
  color: string;
}

/** ティアレベルのマッピング */
export const TIER_LEVELS: Record<ToolTier, number> = {
  wood: 1,
  stone: 2,
  iron: 3,
  diamond: 4,
};

/** 全ツール定義 */
export const TOOL_DEFS: Record<ToolId, ToolDef> = {
  // === 木のツール ===
  wood_pickaxe: {
    id: 'wood_pickaxe', name: '木のピッケル', tier: 'wood', type: 'pickaxe',
    tierLevel: 1, miningSpeed: 2, attackDamage: 2, maxDurability: 60,
    emoji: '⛏️', color: '#8B6914',
  },
  wood_axe: {
    id: 'wood_axe', name: '木の斧', tier: 'wood', type: 'axe',
    tierLevel: 1, miningSpeed: 2, attackDamage: 3, maxDurability: 60,
    emoji: '🪓', color: '#8B6914',
  },
  wood_shovel: {
    id: 'wood_shovel', name: '木のシャベル', tier: 'wood', type: 'shovel',
    tierLevel: 1, miningSpeed: 2, attackDamage: 1, maxDurability: 60,
    emoji: '🪣', color: '#8B6914',
  },
  wood_sword: {
    id: 'wood_sword', name: '木の剣', tier: 'wood', type: 'sword',
    tierLevel: 1, miningSpeed: 1, attackDamage: 4, maxDurability: 60,
    emoji: '🗡️', color: '#8B6914',
  },

  // === 石のツール ===
  stone_pickaxe: {
    id: 'stone_pickaxe', name: '石のピッケル', tier: 'stone', type: 'pickaxe',
    tierLevel: 2, miningSpeed: 4, attackDamage: 3, maxDurability: 132,
    emoji: '⛏️', color: '#808080',
  },
  stone_axe: {
    id: 'stone_axe', name: '石の斧', tier: 'stone', type: 'axe',
    tierLevel: 2, miningSpeed: 4, attackDamage: 4, maxDurability: 132,
    emoji: '🪓', color: '#808080',
  },
  stone_shovel: {
    id: 'stone_shovel', name: '石のシャベル', tier: 'stone', type: 'shovel',
    tierLevel: 2, miningSpeed: 4, attackDamage: 2, maxDurability: 132,
    emoji: '🪣', color: '#808080',
  },
  stone_sword: {
    id: 'stone_sword', name: '石の剣', tier: 'stone', type: 'sword',
    tierLevel: 2, miningSpeed: 1, attackDamage: 5, maxDurability: 132,
    emoji: '🗡️', color: '#808080',
  },

  // === 鉄のツール ===
  iron_pickaxe: {
    id: 'iron_pickaxe', name: '鉄のピッケル', tier: 'iron', type: 'pickaxe',
    tierLevel: 3, miningSpeed: 6, attackDamage: 4, maxDurability: 251,
    emoji: '⛏️', color: '#C0C0C0',
  },
  iron_axe: {
    id: 'iron_axe', name: '鉄の斧', tier: 'iron', type: 'axe',
    tierLevel: 3, miningSpeed: 6, attackDamage: 5, maxDurability: 251,
    emoji: '🪓', color: '#C0C0C0',
  },
  iron_shovel: {
    id: 'iron_shovel', name: '鉄のシャベル', tier: 'iron', type: 'shovel',
    tierLevel: 3, miningSpeed: 6, attackDamage: 3, maxDurability: 251,
    emoji: '🪣', color: '#C0C0C0',
  },
  iron_sword: {
    id: 'iron_sword', name: '鉄の剣', tier: 'iron', type: 'sword',
    tierLevel: 3, miningSpeed: 1, attackDamage: 6, maxDurability: 251,
    emoji: '🗡️', color: '#C0C0C0',
  },

  // === ダイヤのツール ===
  diamond_pickaxe: {
    id: 'diamond_pickaxe', name: 'ダイヤのピッケル', tier: 'diamond', type: 'pickaxe',
    tierLevel: 4, miningSpeed: 8, attackDamage: 5, maxDurability: 1562,
    emoji: '⛏️', color: '#00CED1',
  },
  diamond_axe: {
    id: 'diamond_axe', name: 'ダイヤの斧', tier: 'diamond', type: 'axe',
    tierLevel: 4, miningSpeed: 8, attackDamage: 6, maxDurability: 1562,
    emoji: '🪓', color: '#00CED1',
  },
  diamond_shovel: {
    id: 'diamond_shovel', name: 'ダイヤのシャベル', tier: 'diamond', type: 'shovel',
    tierLevel: 4, miningSpeed: 8, attackDamage: 4, maxDurability: 1562,
    emoji: '🪣', color: '#00CED1',
  },
  diamond_sword: {
    id: 'diamond_sword', name: 'ダイヤの剣', tier: 'diamond', type: 'sword',
    tierLevel: 4, miningSpeed: 1, attackDamage: 7, maxDurability: 1562,
    emoji: '🗡️', color: '#00CED1',
  },
};

/** ToolId からツール定義を取得 */
export function getToolDef(id: ToolId): ToolDef | undefined {
  return TOOL_DEFS[id];
}

/** ブロック種別に対して適切なツール種別か判定 */
export function isEffectiveTool(toolType: ToolType, blockCategory?: string): boolean {
  if (!blockCategory) return false;
  switch (blockCategory) {
    case 'stone': return toolType === 'pickaxe';
    case 'wood': return toolType === 'axe';
    case 'dirt': return toolType === 'shovel';
    default: return false;
  }
}

/** 素手でのティアレベル */
export const HAND_TIER_LEVEL = 0;
/** 素手の採掘速度 */
export const HAND_MINING_SPEED = 1;
/** 素手の攻撃力 */
export const HAND_ATTACK_DAMAGE = 1;
