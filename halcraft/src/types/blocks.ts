// ブロック種別の定義
// ハルクラのすべてのブロック型を管理する

/** ブロックIDの定数定義 */
export const BLOCK_IDS = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  WOOD: 3,
  IRON: 4,
  IRON_CRACKED: 5,
  IRON_MOSSY: 6,
  BEDROCK: 7,
  RAW_WOOD: 8,
  GLASS: 9,
  ENCHANT: 10,
  ELECTRIC: 11,
  SPAWNER: 12,
  STAIRS: 13,
} as const;

export type BlockId = (typeof BLOCK_IDS)[keyof typeof BLOCK_IDS];

/** ブロック情報 */
export interface BlockInfo {
  id: BlockId;
  name: string;
  /** テクスチャファイル名（public/textures/blocks/ 配下） */
  texture: string;
  /** 半透明か（ガラス等） */
  transparent: boolean;
  /** 破壊不可か（岩盤） */
  unbreakable: boolean;
  /** 発光するか */
  emissive: boolean;
}

/** 全ブロックの定義テーブル */
export const BLOCK_DEFS: Record<number, BlockInfo> = {
  [BLOCK_IDS.GRASS]: {
    id: BLOCK_IDS.GRASS,
    name: '草付き土ブロック',
    texture: 'grass.png',
    transparent: false,
    unbreakable: false,
    emissive: false,
  },
  [BLOCK_IDS.DIRT]: {
    id: BLOCK_IDS.DIRT,
    name: '土ブロック',
    texture: 'dirt.png',
    transparent: false,
    unbreakable: false,
    emissive: false,
  },
  [BLOCK_IDS.WOOD]: {
    id: BLOCK_IDS.WOOD,
    name: '木のブロック',
    texture: 'wood.png',
    transparent: false,
    unbreakable: false,
    emissive: false,
  },
  [BLOCK_IDS.IRON]: {
    id: BLOCK_IDS.IRON,
    name: '鉄ブロック',
    texture: 'iron.png',
    transparent: false,
    unbreakable: false,
    emissive: false,
  },
  [BLOCK_IDS.IRON_CRACKED]: {
    id: BLOCK_IDS.IRON_CRACKED,
    name: 'ひびが入った鉄ブロック',
    texture: 'iron_cracked.png',
    transparent: false,
    unbreakable: false,
    emissive: false,
  },
  [BLOCK_IDS.IRON_MOSSY]: {
    id: BLOCK_IDS.IRON_MOSSY,
    name: 'カビが生えた鉄ブロック',
    texture: 'iron_mossy.png',
    transparent: false,
    unbreakable: false,
    emissive: false,
  },
  [BLOCK_IDS.BEDROCK]: {
    id: BLOCK_IDS.BEDROCK,
    name: '岩盤ブロック',
    texture: 'bedrock.png',
    transparent: false,
    unbreakable: true,
    emissive: false,
  },
  [BLOCK_IDS.RAW_WOOD]: {
    id: BLOCK_IDS.RAW_WOOD,
    name: '生の木ブロック',
    texture: 'raw_wood.png',
    transparent: false,
    unbreakable: false,
    emissive: false,
  },
  [BLOCK_IDS.GLASS]: {
    id: BLOCK_IDS.GLASS,
    name: 'ガラスブロック',
    texture: 'glass.png',
    transparent: true,
    unbreakable: false,
    emissive: false,
  },
  [BLOCK_IDS.ENCHANT]: {
    id: BLOCK_IDS.ENCHANT,
    name: 'エンチャントブロック',
    texture: 'enchant.png',
    transparent: false,
    unbreakable: false,
    emissive: true,
  },
  [BLOCK_IDS.ELECTRIC]: {
    id: BLOCK_IDS.ELECTRIC,
    name: '電気のブロック',
    texture: 'electric.png',
    transparent: false,
    unbreakable: false,
    emissive: true,
  },
  [BLOCK_IDS.SPAWNER]: {
    id: BLOCK_IDS.SPAWNER,
    name: 'アイアンゴーレムが無限に出てくるブロック',
    texture: 'spawner.png',
    transparent: false,
    unbreakable: false,
    emissive: true,
  },
  [BLOCK_IDS.STAIRS]: {
    id: BLOCK_IDS.STAIRS,
    name: '階段',
    texture: 'stairs.png',
    transparent: false,
    unbreakable: false,
    emissive: false,
  },
};

/** ホットバーに並ぶブロックの順番 */
export const HOTBAR_BLOCKS: BlockId[] = [
  BLOCK_IDS.GRASS,
  BLOCK_IDS.DIRT,
  BLOCK_IDS.WOOD,
  BLOCK_IDS.RAW_WOOD,
  BLOCK_IDS.IRON,
  BLOCK_IDS.GLASS,
  BLOCK_IDS.ENCHANT,
  BLOCK_IDS.ELECTRIC,
  BLOCK_IDS.STAIRS,
];

/** チャンクサイズ定数 */
export const CHUNK_SIZE = 16;
/** ワールドの高さ限界 */
export const WORLD_HEIGHT = 64;
/** 初期のレンダリング距離（チャンク数） */
export const RENDER_DISTANCE = 4;
