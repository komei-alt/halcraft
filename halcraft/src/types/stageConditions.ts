// ステージ別コンディション定義
// マップごとの「らしい行動」をゲージ化し、短いボーナスとして返す

import { BLOCK_IDS, type BlockId } from './blocks';

export type StageConditionWeapon =
  | 'builder'
  | 'rocket_launcher'
  | 'machine_gun'
  | 'lightsaber'
  | 'gravity_glove'
  | 'bomb_slinger';

export type StageConditionEffect =
  | {
      kind: 'resource';
      blockId: BlockId;
      count: number;
      label: string;
    }
  | {
      kind: 'regen';
      healOnActivate: number;
      healPerSecond: number;
      label: string;
    }
  | {
      kind: 'rocket_ready';
      label: string;
    };

export interface StageConditionDefinition {
  id: string;
  stageId: string;
  icon: string;
  title: string;
  description: string;
  triggerLabel: string;
  target: number;
  activeDurationMs: number;
  accent: string;
  blockIds?: BlockId[];
  weaponItems?: StageConditionWeapon[];
  countsEnemyDefeats?: boolean;
  countsDetonations?: boolean;
  effect: StageConditionEffect;
}

const FOREST_BUILD_BLOCKS: BlockId[] = [
  BLOCK_IDS.WOOD,
  BLOCK_IDS.RAW_WOOD,
  BLOCK_IDS.LEAVES,
  BLOCK_IDS.TORCH,
  BLOCK_IDS.CAMPFIRE,
];

const TROPICAL_BUILD_BLOCKS: BlockId[] = [
  BLOCK_IDS.WATER,
  BLOCK_IDS.GLASS,
  BLOCK_IDS.ELECTRIC,
  BLOCK_IDS.TORCH,
  BLOCK_IDS.CANDLE,
];

const SNOW_BUILD_BLOCKS: BlockId[] = [
  BLOCK_IDS.SNOW,
  BLOCK_IDS.GLASS,
  BLOCK_IDS.GLOWSTONE,
  BLOCK_IDS.TORCH,
];

const DESERT_BUILD_BLOCKS: BlockId[] = [
  BLOCK_IDS.SAND,
  BLOCK_IDS.STONE,
  BLOCK_IDS.WATER,
  BLOCK_IDS.GLOWSTONE,
];

const DEFENSE_BLOCKS: BlockId[] = [
  BLOCK_IDS.TURRET,
  BLOCK_IDS.TORCH,
  BLOCK_IDS.CAMPFIRE,
  BLOCK_IDS.STONE,
  BLOCK_IDS.TNT,
];

export const STAGE_CONDITIONS: Record<string, StageConditionDefinition> = {
  'build-forest': {
    id: 'forest-inspiration',
    stageId: 'build-forest',
    icon: '🌿',
    title: '森のひらめき',
    description: '木材・葉・灯りを置くと、森づくりの素材が少し戻ってくる。',
    triggerLabel: '木・葉・灯り',
    target: 12,
    activeDurationMs: 9000,
    accent: '#9bdcff',
    blockIds: FOREST_BUILD_BLOCKS,
    effect: {
      kind: 'resource',
      blockId: BLOCK_IDS.WOOD,
      count: 8,
      label: '木材 +8',
    },
  },
  'build-tropical': {
    id: 'tropical-resort-flow',
    stageId: 'build-tropical',
    icon: '🌊',
    title: 'リゾート気分',
    description: '水・ガラス・光を使うほど、透明な建築素材が戻ってくる。',
    triggerLabel: '水・ガラス・光',
    target: 12,
    activeDurationMs: 9000,
    accent: '#80deea',
    blockIds: TROPICAL_BUILD_BLOCKS,
    effect: {
      kind: 'resource',
      blockId: BLOCK_IDS.GLASS,
      count: 6,
      label: 'ガラス +6',
    },
  },
  'build-snow': {
    id: 'snow-castle-focus',
    stageId: 'build-snow',
    icon: '❄️',
    title: '氷の集中',
    description: '雪・ガラス・光の建築で、城づくり用の光る素材が戻ってくる。',
    triggerLabel: '雪・ガラス・光',
    target: 12,
    activeDurationMs: 9000,
    accent: '#bbdefb',
    blockIds: SNOW_BUILD_BLOCKS,
    effect: {
      kind: 'resource',
      blockId: BLOCK_IDS.GLOWSTONE,
      count: 2,
      label: 'グロウストーン +2',
    },
  },
  'build-desert': {
    id: 'desert-oasis-work',
    stageId: 'build-desert',
    icon: '🏜️',
    title: 'オアシス工事',
    description: '砂・石・水で大工事を進めると、砂の資材がまとまって戻る。',
    triggerLabel: '砂・石・水',
    target: 14,
    activeDurationMs: 9000,
    accent: '#ffe082',
    blockIds: DESERT_BUILD_BLOCKS,
    effect: {
      kind: 'resource',
      blockId: BLOCK_IDS.SAND,
      count: 12,
      label: '砂 +12',
    },
  },
  'war-forest': {
    id: 'forest-defense-stance',
    stageId: 'war-forest',
    icon: '🛡️',
    title: '防衛態勢',
    description: '敵撃破と防衛ブロックで態勢を整えると、少しずつHPが戻る。',
    triggerLabel: '撃破・防衛ブロック',
    target: 8,
    activeDurationMs: 12000,
    accent: '#dce775',
    blockIds: DEFENSE_BLOCKS,
    countsEnemyDefeats: true,
    effect: {
      kind: 'regen',
      healOnActivate: 2,
      healPerSecond: 0.45,
      label: 'HP回復',
    },
  },
  'war-tropical': {
    id: 'tropical-rush-momentum',
    stageId: 'war-tropical',
    icon: '🔫',
    title: 'ラッシュ制圧',
    description: '連続撃破や機関銃ヒットで勢いを作ると、HPが戻る。',
    triggerLabel: '撃破・機関銃',
    target: 9,
    activeDurationMs: 10000,
    accent: '#ffe28a',
    weaponItems: ['machine_gun'],
    countsEnemyDefeats: true,
    effect: {
      kind: 'regen',
      healOnActivate: 3,
      healPerSecond: 0.28,
      label: '突撃回復',
    },
  },
  'war-snow': {
    id: 'snow-front-resolve',
    stageId: 'war-snow',
    icon: '⚔️',
    title: '極寒集中',
    description: '敵撃破やライトセイバー命中で集中が高まり、HPがじわじわ戻る。',
    triggerLabel: '撃破・光の剣',
    target: 7,
    activeDurationMs: 11000,
    accent: '#c8b0ff',
    weaponItems: ['lightsaber'],
    countsEnemyDefeats: true,
    effect: {
      kind: 'regen',
      healOnActivate: 2,
      healPerSecond: 0.65,
      label: '持久回復',
    },
  },
  'war-desert': {
    id: 'desert-blast-overdrive',
    stageId: 'war-desert',
    icon: '🚀',
    title: '熱砂オーバードライブ',
    description: 'ロケット命中や爆発で勢いを作ると、ロケットをすぐ撃てる。',
    triggerLabel: 'ロケット・爆発',
    target: 5,
    activeDurationMs: 8000,
    accent: '#ffc06d',
    weaponItems: ['rocket_launcher'],
    countsDetonations: true,
    effect: {
      kind: 'rocket_ready',
      label: 'ロケット即応',
    },
  },
};

export function getStageCondition(stageId: string | null | undefined): StageConditionDefinition | null {
  if (!stageId) return null;
  return STAGE_CONDITIONS[stageId] ?? null;
}

export function getStageConditionProgress(charge: number, target: number): number {
  return Math.max(0, Math.min(1, charge / Math.max(1, target)));
}
