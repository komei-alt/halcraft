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
];
