// ブロック種別の定義
// ハルクラのすべてのブロック型を管理する

import * as THREE from 'three';

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
  TORCH: 14,
  BED: 15,
  LEAVES: 16,
} as const;

export type BlockId = (typeof BLOCK_IDS)[keyof typeof BLOCK_IDS];

/** 面別テクスチャ指定（マイクラ風のブロック用） */
export interface FaceTextures {
  /** 上面テクスチャ */
  top: string;
  /** 側面テクスチャ（前後左右共通） */
  side: string;
  /** 底面テクスチャ */
  bottom: string;
}

/** ブロック情報 */
export interface BlockInfo {
  id: BlockId;
  name: string;
  /** テクスチャファイル名（public/textures/blocks/ 配下） */
  texture: string;
  /** 面別テクスチャ（指定時は texture より優先） */
  faceTextures?: FaceTextures;
  /** 半透明か（ガラス等） */
  transparent: boolean;
  /** 破壊不可か（岩盤） */
  unbreakable: boolean;
  /** 発光するか */
  emissive: boolean;
  /** 発光色（emissive=true の場合） */
  emissiveColor?: THREE.Color;
  /** 発光強度 */
  emissiveIntensity?: number;
  /** ポイントライトの色（光源ブロックの場合） */
  lightColor?: THREE.Color;
  /** ポイントライトの強度 */
  lightIntensity?: number;
  /** ポイントライトの到達距離 */
  lightDistance?: number;
  /** 非標準形状か（松明など、1x1x1ボックスではないもの） */
  nonStandard?: boolean;
  /** 当たり判定がないか（松明のように通過できるもの） */
  noCollision?: boolean;
}

/** 全ブロックの定義テーブル */
export const BLOCK_DEFS: Record<number, BlockInfo> = {
  [BLOCK_IDS.GRASS]: {
    id: BLOCK_IDS.GRASS,
    name: '草付き土ブロック',
    texture: 'grass.png',
    faceTextures: {
      top: 'grass_top.png',
      side: 'grass_side.png',
      bottom: 'dirt.png',
    },
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
    emissiveColor: new THREE.Color(0x6633cc),
    emissiveIntensity: 0.6,
    lightColor: new THREE.Color(0x8844ff),
    lightIntensity: 1.5,
    lightDistance: 12,
  },
  [BLOCK_IDS.ELECTRIC]: {
    id: BLOCK_IDS.ELECTRIC,
    name: '電気のブロック',
    texture: 'electric.png',
    transparent: false,
    unbreakable: false,
    emissive: true,
    emissiveColor: new THREE.Color(0x00ddff),
    emissiveIntensity: 1.0,
    lightColor: new THREE.Color(0x44eeff),
    lightIntensity: 3.0,
    lightDistance: 18,
  },
  [BLOCK_IDS.SPAWNER]: {
    id: BLOCK_IDS.SPAWNER,
    name: 'アイアンゴーレムが無限に出てくるブロック',
    texture: 'spawner.png',
    transparent: false,
    unbreakable: false,
    emissive: true,
    emissiveColor: new THREE.Color(0xff4422),
    emissiveIntensity: 0.5,
    lightColor: new THREE.Color(0xff6633),
    lightIntensity: 1.0,
    lightDistance: 8,
  },
  [BLOCK_IDS.STAIRS]: {
    id: BLOCK_IDS.STAIRS,
    name: '階段',
    texture: 'stairs.png',
    transparent: false,
    unbreakable: false,
    emissive: false,
  },
  [BLOCK_IDS.TORCH]: {
    id: BLOCK_IDS.TORCH,
    name: '松明',
    texture: 'torch.png',
    transparent: true,
    unbreakable: false,
    emissive: true,
    emissiveColor: new THREE.Color(0xff8833),
    emissiveIntensity: 1.0,
    lightColor: new THREE.Color(0xffaa44),
    lightIntensity: 2.5,
    lightDistance: 15,
    nonStandard: true,
    noCollision: true,
  },
  [BLOCK_IDS.BED]: {
    id: BLOCK_IDS.BED,
    name: 'ベッド',
    texture: 'bed.png',
    transparent: false,
    unbreakable: false,
    emissive: false,
    nonStandard: true,
    noCollision: true,
  },
  [BLOCK_IDS.LEAVES]: {
    id: BLOCK_IDS.LEAVES,
    name: '葉っぱブロック',
    texture: 'leaves.png',
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
  BLOCK_IDS.TORCH,
];

/** チャンクサイズ定数 */
export const CHUNK_SIZE = 16;
/** ワールドの高さ限界 */
export const WORLD_HEIGHT = 64;
/** 初期のレンダリング距離（チャンク数） — 村を含む広い世界 */
export const RENDER_DISTANCE = 8;
