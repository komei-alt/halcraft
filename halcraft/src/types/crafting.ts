// クラフトレシピの定義
// 3×3グリッドベースのクラフトシステム

import { BLOCK_IDS, type BlockId } from './blocks';

/** クラフトレシピ */
export interface CraftingRecipe {
  /** レシピID */
  id: string;
  /** レシピ名 */
  name: string;
  /** 説明 */
  description: string;
  /** 必要素材 { blockId: 個数 } */
  ingredients: Record<number, number>;
  /** 完成品のブロックID */
  result: BlockId;
  /** 完成品の個数 */
  resultCount: number;
  /** ツールクラフトの場合、付与するツールID */
  toolId?: string;
  /** 防具クラフトの場合、付与する防具ID */
  armorId?: string;
  /** ポーションクラフトの場合、使用するポーションID */
  potionId?: string;
}

/** 全クラフトレシピの定義 */
export const CRAFTING_RECIPES: CraftingRecipe[] = [
  // === 基本素材 ===
  {
    id: 'wood_from_raw',
    name: '木のブロック',
    description: '生の木を加工した建築素材',
    ingredients: { [BLOCK_IDS.RAW_WOOD]: 2 },
    result: BLOCK_IDS.WOOD,
    resultCount: 4,
  },
  {
    id: 'glass_from_dirt',
    name: 'ガラスブロック',
    description: '土ブロックを精錬して作るガラス',
    ingredients: { [BLOCK_IDS.DIRT]: 4 },
    result: BLOCK_IDS.GLASS,
    resultCount: 2,
  },

  // === 鉄系 ===
  {
    id: 'iron_block',
    name: '鉄ブロック',
    description: '草と土を圧縮して作る鉄素材',
    ingredients: { [BLOCK_IDS.GRASS]: 4, [BLOCK_IDS.DIRT]: 4 },
    result: BLOCK_IDS.IRON,
    resultCount: 1,
  },

  // === 特殊ブロック ===
  {
    id: 'enchant_block',
    name: 'エンチャントブロック',
    description: '魔力を込めた神秘的なブロック',
    ingredients: { [BLOCK_IDS.GLASS]: 4, [BLOCK_IDS.IRON]: 2 },
    result: BLOCK_IDS.ENCHANT,
    resultCount: 1,
  },
  {
    id: 'electric_block',
    name: '電気のブロック',
    description: '電力を宿したブロック',
    ingredients: { [BLOCK_IDS.IRON]: 3, [BLOCK_IDS.GLASS]: 1 },
    result: BLOCK_IDS.ELECTRIC,
    resultCount: 1,
  },
  {
    id: 'stairs_block',
    name: '階段',
    description: '木材から作る階段ブロック',
    ingredients: { [BLOCK_IDS.WOOD]: 6 },
    result: BLOCK_IDS.STAIRS,
    resultCount: 4,
  },
  {
    id: 'spawner_block',
    name: 'スポナーブロック',
    description: 'ゴーレムを召喚する神秘のブロック',
    ingredients: {
      [BLOCK_IDS.ENCHANT]: 2,
      [BLOCK_IDS.IRON]: 4,
      [BLOCK_IDS.ELECTRIC]: 1,
    },
    result: BLOCK_IDS.SPAWNER,
    resultCount: 1,
  },
  {
    id: 'grass_from_dirt',
    name: '草付き土ブロック',
    description: '土を草で覆ったブロック',
    ingredients: { [BLOCK_IDS.DIRT]: 1 },
    result: BLOCK_IDS.GRASS,
    resultCount: 1,
  },
  {
    id: 'bed',
    name: 'ベッド',
    description: '木材と草から作るふかふかのベッド',
    ingredients: { [BLOCK_IDS.WOOD]: 3, [BLOCK_IDS.GRASS]: 3 },
    result: BLOCK_IDS.BED,
    resultCount: 1,
  },
  {
    id: 'door',
    name: 'ドア',
    description: '家の入口にぴったりの木製ドア',
    ingredients: { [BLOCK_IDS.WOOD]: 4 },
    result: BLOCK_IDS.DOOR,
    resultCount: 1,
  },
  {
    id: 'ladder',
    name: 'ハシゴ',
    description: '高い場所へ登れる紫のハシゴ',
    ingredients: { [BLOCK_IDS.RAW_WOOD]: 3, [BLOCK_IDS.WOOD]: 1 },
    result: BLOCK_IDS.LADDER,
    resultCount: 1,
  },
  {
    id: 'campfire',
    name: '焚き火',
    description: '村の広場を照らす赤い焚き火',
    ingredients: { [BLOCK_IDS.WOOD]: 3, [BLOCK_IDS.RAW_WOOD]: 2, [BLOCK_IDS.ENCHANT]: 1 },
    result: BLOCK_IDS.CAMPFIRE,
    resultCount: 1,
  },
  {
    id: 'candle',
    name: '蝋燭',
    description: 'やさしく光る小さな蝋燭',
    ingredients: { [BLOCK_IDS.GLASS]: 1, [BLOCK_IDS.GRASS]: 1, [BLOCK_IDS.ENCHANT]: 1 },
    result: BLOCK_IDS.CANDLE,
    resultCount: 2,
  },
  {
    id: 'bedrock',
    name: '岩盤ブロック',
    description: '絶対に壊れない最強のブロック',
    ingredients: { [BLOCK_IDS.IRON]: 4, [BLOCK_IDS.ENCHANT]: 1 },
    result: BLOCK_IDS.BEDROCK,
    resultCount: 1,
  },

  // === ジェットコースター ===
  {
    id: 'rail',
    name: 'レール',
    description: '鉄から作るジェットコースターのレール',
    ingredients: { [BLOCK_IDS.IRON]: 3, [BLOCK_IDS.WOOD]: 1 },
    result: BLOCK_IDS.RAIL,
    resultCount: 8,
  },
  {
    id: 'rail_slope',
    name: '坂道レール',
    description: '高低差をつけるための傾斜レール',
    ingredients: { [BLOCK_IDS.IRON]: 4, [BLOCK_IDS.WOOD]: 2 },
    result: BLOCK_IDS.RAIL_SLOPE,
    resultCount: 4,
  },
  {
    id: 'rail_booster',
    name: 'ブースターレール',
    description: 'カートを加速させるパワーレール',
    ingredients: { [BLOCK_IDS.IRON]: 4, [BLOCK_IDS.ELECTRIC]: 2 },
    result: BLOCK_IDS.RAIL_BOOSTER,
    resultCount: 2,
  },
  {
    id: 'rail_loop',
    name: 'ループレール',
    description: '垂直ループを作る特殊レール',
    ingredients: { [BLOCK_IDS.IRON]: 6, [BLOCK_IDS.ENCHANT]: 2 },
    result: BLOCK_IDS.RAIL_LOOP,
    resultCount: 4,
  },
  {
    id: 'rail_chain',
    name: 'チェーンリフト',
    description: 'モーターとチェーンでカートを引き上げる坂道レール',
    ingredients: { [BLOCK_IDS.IRON]: 5, [BLOCK_IDS.ELECTRIC]: 1, [BLOCK_IDS.WOOD]: 2 },
    result: BLOCK_IDS.RAIL_CHAIN,
    resultCount: 4,
  },

  // === 素材加工 ===
  {
    id: 'stick',
    name: '棒',
    description: '木材から作る基本素材',
    ingredients: { [BLOCK_IDS.WOOD]: 1 },
    result: BLOCK_IDS.STICK,
    resultCount: 4,
  },
  {
    id: 'smelt_iron',
    name: '鉄インゴット',
    description: '鉄鉱石を精錬して作る金属素材',
    ingredients: { [BLOCK_IDS.IRON_ORE]: 1 },
    result: BLOCK_IDS.IRON_INGOT,
    resultCount: 1,
  },
  {
    id: 'smelt_gold',
    name: '金インゴット',
    description: '金鉱石を精錬して作る金属素材',
    ingredients: { [BLOCK_IDS.GOLD_ORE]: 1 },
    result: BLOCK_IDS.GOLD_INGOT,
    resultCount: 1,
  },
  {
    id: 'diamond_from_ore',
    name: 'ダイヤモンド',
    description: 'ダイヤ鉱石から取り出す宝石',
    ingredients: { [BLOCK_IDS.DIAMOND_ORE]: 1 },
    result: BLOCK_IDS.DIAMOND_GEM,
    resultCount: 1,
  },

  // === 木のツール ===
  {
    id: 'wood_pickaxe',
    name: '木のピッケル',
    description: '木材と棒で作る最初のピッケル',
    ingredients: { [BLOCK_IDS.WOOD]: 3, [BLOCK_IDS.STICK]: 2 },
    result: BLOCK_IDS.WOOD,  // ツールはアイテムID扱い
    resultCount: 1,
    toolId: 'wood_pickaxe',
  },
  {
    id: 'wood_axe',
    name: '木の斧',
    description: '木材と棒で作る最初の斧',
    ingredients: { [BLOCK_IDS.WOOD]: 3, [BLOCK_IDS.STICK]: 2 },
    result: BLOCK_IDS.WOOD,
    resultCount: 1,
    toolId: 'wood_axe',
  },
  {
    id: 'wood_shovel',
    name: '木のシャベル',
    description: '木材と棒で作る最初のシャベル',
    ingredients: { [BLOCK_IDS.WOOD]: 1, [BLOCK_IDS.STICK]: 2 },
    result: BLOCK_IDS.WOOD,
    resultCount: 1,
    toolId: 'wood_shovel',
  },
  {
    id: 'wood_sword',
    name: '木の剣',
    description: '木材と棒で作る最初の剣',
    ingredients: { [BLOCK_IDS.WOOD]: 2, [BLOCK_IDS.STICK]: 1 },
    result: BLOCK_IDS.WOOD,
    resultCount: 1,
    toolId: 'wood_sword',
  },

  // === 石のツール ===
  {
    id: 'stone_pickaxe',
    name: '石のピッケル',
    description: '石と棒で作る丈夫なピッケル',
    ingredients: { [BLOCK_IDS.STONE]: 3, [BLOCK_IDS.STICK]: 2 },
    result: BLOCK_IDS.STONE,
    resultCount: 1,
    toolId: 'stone_pickaxe',
  },
  {
    id: 'stone_axe',
    name: '石の斧',
    description: '石と棒で作る丈夫な斧',
    ingredients: { [BLOCK_IDS.STONE]: 3, [BLOCK_IDS.STICK]: 2 },
    result: BLOCK_IDS.STONE,
    resultCount: 1,
    toolId: 'stone_axe',
  },
  {
    id: 'stone_shovel',
    name: '石のシャベル',
    description: '石と棒で作る丈夫なシャベル',
    ingredients: { [BLOCK_IDS.STONE]: 1, [BLOCK_IDS.STICK]: 2 },
    result: BLOCK_IDS.STONE,
    resultCount: 1,
    toolId: 'stone_shovel',
  },
  {
    id: 'stone_sword',
    name: '石の剣',
    description: '石と棒で作る丈夫な剣',
    ingredients: { [BLOCK_IDS.STONE]: 2, [BLOCK_IDS.STICK]: 1 },
    result: BLOCK_IDS.STONE,
    resultCount: 1,
    toolId: 'stone_sword',
  },

  // === 鉄のツール ===
  {
    id: 'iron_pickaxe',
    name: '鉄のピッケル',
    description: '鉄インゴットと棒で作る高性能ピッケル',
    ingredients: { [BLOCK_IDS.IRON_INGOT]: 3, [BLOCK_IDS.STICK]: 2 },
    result: BLOCK_IDS.IRON_INGOT,
    resultCount: 1,
    toolId: 'iron_pickaxe',
  },
  {
    id: 'iron_axe',
    name: '鉄の斧',
    description: '鉄インゴットと棒で作る高性能斧',
    ingredients: { [BLOCK_IDS.IRON_INGOT]: 3, [BLOCK_IDS.STICK]: 2 },
    result: BLOCK_IDS.IRON_INGOT,
    resultCount: 1,
    toolId: 'iron_axe',
  },
  {
    id: 'iron_shovel',
    name: '鉄のシャベル',
    description: '鉄インゴットと棒で作る高性能シャベル',
    ingredients: { [BLOCK_IDS.IRON_INGOT]: 1, [BLOCK_IDS.STICK]: 2 },
    result: BLOCK_IDS.IRON_INGOT,
    resultCount: 1,
    toolId: 'iron_shovel',
  },
  {
    id: 'iron_sword',
    name: '鉄の剣',
    description: '鉄インゴットと棒で作る高性能剣',
    ingredients: { [BLOCK_IDS.IRON_INGOT]: 2, [BLOCK_IDS.STICK]: 1 },
    result: BLOCK_IDS.IRON_INGOT,
    resultCount: 1,
    toolId: 'iron_sword',
  },

  // === ダイヤのツール ===
  {
    id: 'diamond_pickaxe',
    name: 'ダイヤのピッケル',
    description: 'ダイヤモンドと棒で作る最強ピッケル',
    ingredients: { [BLOCK_IDS.DIAMOND_GEM]: 3, [BLOCK_IDS.STICK]: 2 },
    result: BLOCK_IDS.DIAMOND_GEM,
    resultCount: 1,
    toolId: 'diamond_pickaxe',
  },
  {
    id: 'diamond_axe',
    name: 'ダイヤの斧',
    description: 'ダイヤモンドと棒で作る最強斧',
    ingredients: { [BLOCK_IDS.DIAMOND_GEM]: 3, [BLOCK_IDS.STICK]: 2 },
    result: BLOCK_IDS.DIAMOND_GEM,
    resultCount: 1,
    toolId: 'diamond_axe',
  },
  {
    id: 'diamond_shovel',
    name: 'ダイヤのシャベル',
    description: 'ダイヤモンドと棒で作る最強シャベル',
    ingredients: { [BLOCK_IDS.DIAMOND_GEM]: 1, [BLOCK_IDS.STICK]: 2 },
    result: BLOCK_IDS.DIAMOND_GEM,
    resultCount: 1,
    toolId: 'diamond_shovel',
  },
  {
    id: 'diamond_sword',
    name: 'ダイヤの剣',
    description: 'ダイヤモンドと棒で作る最強剣',
    ingredients: { [BLOCK_IDS.DIAMOND_GEM]: 2, [BLOCK_IDS.STICK]: 1 },
    result: BLOCK_IDS.DIAMOND_GEM,
    resultCount: 1,
    toolId: 'diamond_sword',
  },

  // === 革の防具 ===
  {
    id: 'leather_helmet',
    name: '革のヘルメット',
    description: '革で作る基本の頭防具',
    ingredients: { [BLOCK_IDS.GRASS]: 5 },
    result: BLOCK_IDS.GRASS,
    resultCount: 1,
    armorId: 'leather_helmet',
  },
  {
    id: 'leather_chestplate',
    name: '革のチェストプレート',
    description: '革で作る基本の胸当て',
    ingredients: { [BLOCK_IDS.GRASS]: 8 },
    result: BLOCK_IDS.GRASS,
    resultCount: 1,
    armorId: 'leather_chestplate',
  },
  {
    id: 'leather_leggings',
    name: '革のレギンス',
    description: '革で作る基本の足防具',
    ingredients: { [BLOCK_IDS.GRASS]: 7 },
    result: BLOCK_IDS.GRASS,
    resultCount: 1,
    armorId: 'leather_leggings',
  },
  {
    id: 'leather_boots',
    name: '革のブーツ',
    description: '革で作る基本のブーツ',
    ingredients: { [BLOCK_IDS.GRASS]: 4 },
    result: BLOCK_IDS.GRASS,
    resultCount: 1,
    armorId: 'leather_boots',
  },

  // === 鉄の防具 ===
  {
    id: 'iron_helmet',
    name: '鉄のヘルメット',
    description: '鉄インゴットで作る頑丈な頭防具',
    ingredients: { [BLOCK_IDS.IRON_INGOT]: 5 },
    result: BLOCK_IDS.IRON_INGOT,
    resultCount: 1,
    armorId: 'iron_helmet',
  },
  {
    id: 'iron_chestplate',
    name: '鉄のチェストプレート',
    description: '鉄インゴットで作る頑丈な胸当て',
    ingredients: { [BLOCK_IDS.IRON_INGOT]: 8 },
    result: BLOCK_IDS.IRON_INGOT,
    resultCount: 1,
    armorId: 'iron_chestplate',
  },
  {
    id: 'iron_leggings',
    name: '鉄のレギンス',
    description: '鉄インゴットで作る頑丈な足防具',
    ingredients: { [BLOCK_IDS.IRON_INGOT]: 7 },
    result: BLOCK_IDS.IRON_INGOT,
    resultCount: 1,
    armorId: 'iron_leggings',
  },
  {
    id: 'iron_boots',
    name: '鉄のブーツ',
    description: '鉄インゴットで作る頑丈なブーツ',
    ingredients: { [BLOCK_IDS.IRON_INGOT]: 4 },
    result: BLOCK_IDS.IRON_INGOT,
    resultCount: 1,
    armorId: 'iron_boots',
  },

  // === ダイヤの防具 ===
  {
    id: 'diamond_helmet',
    name: 'ダイヤのヘルメット',
    description: 'ダイヤモンドで作る最強の頭防具',
    ingredients: { [BLOCK_IDS.DIAMOND_GEM]: 5 },
    result: BLOCK_IDS.DIAMOND_GEM,
    resultCount: 1,
    armorId: 'diamond_helmet',
  },
  {
    id: 'diamond_chestplate',
    name: 'ダイヤのチェストプレート',
    description: 'ダイヤモンドで作る最強の胸当て',
    ingredients: { [BLOCK_IDS.DIAMOND_GEM]: 8 },
    result: BLOCK_IDS.DIAMOND_GEM,
    resultCount: 1,
    armorId: 'diamond_chestplate',
  },
  {
    id: 'diamond_leggings',
    name: 'ダイヤのレギンス',
    description: 'ダイヤモンドで作る最強の足防具',
    ingredients: { [BLOCK_IDS.DIAMOND_GEM]: 7 },
    result: BLOCK_IDS.DIAMOND_GEM,
    resultCount: 1,
    armorId: 'diamond_leggings',
  },
  {
    id: 'diamond_boots',
    name: 'ダイヤのブーツ',
    description: 'ダイヤモンドで作る最強のブーツ',
    ingredients: { [BLOCK_IDS.DIAMOND_GEM]: 4 },
    result: BLOCK_IDS.DIAMOND_GEM,
    resultCount: 1,
    armorId: 'diamond_boots',
  },

  // === ポーション ===
  {
    id: 'speed_potion',
    name: '俊足のポーション',
    description: '60秒間 移動速度が40%アップ',
    ingredients: { [BLOCK_IDS.GRASS]: 3, [BLOCK_IDS.DIAMOND_GEM]: 1 },
    result: BLOCK_IDS.GRASS,
    resultCount: 1,
    potionId: 'speed_potion',
  },
  {
    id: 'strength_potion',
    name: '怪力のポーション',
    description: '60秒間 攻撃力が3増加',
    ingredients: { [BLOCK_IDS.IRON_INGOT]: 3, [BLOCK_IDS.GOLD_INGOT]: 1 },
    result: BLOCK_IDS.IRON_INGOT,
    resultCount: 1,
    potionId: 'strength_potion',
  },
  {
    id: 'regeneration_potion',
    name: '再生のポーション',
    description: '45秒間 HPが徐々に回復',
    ingredients: { [BLOCK_IDS.GOLD_INGOT]: 3, [BLOCK_IDS.DIAMOND_GEM]: 1 },
    result: BLOCK_IDS.GOLD_INGOT,
    resultCount: 1,
    potionId: 'regeneration_potion',
  },
  {
    id: 'fire_resistance_potion',
    name: '耐火のポーション',
    description: '3分間 炎と溶岩のダメージを無効化',
    ingredients: { [BLOCK_IDS.IRON_INGOT]: 5, [BLOCK_IDS.LAVA]: 1 },
    result: BLOCK_IDS.IRON_INGOT,
    resultCount: 1,
    potionId: 'fire_resistance_potion',
  },
  {
    id: 'water_breathing_potion',
    name: '水中呼吸のポーション',
    description: '3分間 水中で息が減らなくなる',
    ingredients: { [BLOCK_IDS.IRON_INGOT]: 3, [BLOCK_IDS.WATER]: 1 },
    result: BLOCK_IDS.IRON_INGOT,
    resultCount: 1,
    potionId: 'water_breathing_potion',
  },
  {
    id: 'night_vision_potion',
    name: '暗視のポーション',
    description: '3分間 暗闇でも明るく見える',
    ingredients: { [BLOCK_IDS.GOLD_INGOT]: 3, [BLOCK_IDS.TORCH]: 2 },
    result: BLOCK_IDS.GOLD_INGOT,
    resultCount: 1,
    potionId: 'night_vision_potion',
  },
  {
    id: 'jump_boost_potion',
    name: '跳躍のポーション',
    description: '60秒間 ジャンプ力がアップ',
    ingredients: { [BLOCK_IDS.GRASS]: 5, [BLOCK_IDS.IRON_INGOT]: 1 },
    result: BLOCK_IDS.GRASS,
    resultCount: 1,
    potionId: 'jump_boost_potion',
  },

  // === 農業 ===
  {
    id: 'wheat_seeds',
    name: '小麦の種',
    description: '草ブロックから小麦の種を入手',
    ingredients: { [BLOCK_IDS.GRASS]: 2 },
    result: BLOCK_IDS.WHEAT_SEEDS,
    resultCount: 4,
  },
  {
    id: 'farmland',
    name: '耕地',
    description: '草ブロックを耕して耕地にする',
    ingredients: { [BLOCK_IDS.GRASS]: 1 },
    result: BLOCK_IDS.FARMLAND,
    resultCount: 1,
  },
];
