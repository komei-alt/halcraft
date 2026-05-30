// 建築ステージ別の作品評価定義
// マップのテーマに合うブロックを使うほど、作品スコアと節目演出が進む

import { BLOCK_IDS, type BlockId } from './blocks';

export const BUILD_SCORE_MILESTONES = [25, 60, 110] as const;

export type BuildScoreMilestone = (typeof BUILD_SCORE_MILESTONES)[number];

export interface StageBuildStyleBlock {
  blockId: BlockId;
  points: number;
  label: string;
}

interface StageBuildMilestoneText {
  title: string;
  detail: string;
}

export interface StageBuildStyle {
  stageId: string;
  icon: string;
  title: string;
  shortLabel: string;
  detail: string;
  focusLabel: string;
  accent: string;
  glow: string;
  blocks: StageBuildStyleBlock[];
  milestones: Record<BuildScoreMilestone, StageBuildMilestoneText>;
}

export const STAGE_BUILD_STYLES: Record<string, StageBuildStyle> = {
  'build-forest': {
    stageId: 'build-forest',
    icon: '🌲',
    title: '森の秘密基地',
    shortLabel: '木と灯り',
    detail: '木・葉・焚き火・レールで、森の中に遊び場を育てると高評価。',
    focusLabel: '木材・葉・灯り・レール',
    accent: '#9bdcff',
    glow: 'rgba(120, 220, 170, 0.3)',
    blocks: [
      { blockId: BLOCK_IDS.CAMPFIRE, points: 5, label: '焚き火' },
      { blockId: BLOCK_IDS.RAIL_LOOP, points: 5, label: 'ループ' },
      { blockId: BLOCK_IDS.RAIL_BOOSTER, points: 4, label: '加速レール' },
      { blockId: BLOCK_IDS.LEAVES, points: 3, label: '葉' },
      { blockId: BLOCK_IDS.TORCH, points: 3, label: '松明' },
      { blockId: BLOCK_IDS.RAW_WOOD, points: 2, label: '原木' },
      { blockId: BLOCK_IDS.WOOD, points: 2, label: '木材' },
      { blockId: BLOCK_IDS.RAIL, points: 2, label: 'レール' },
    ],
    milestones: {
      25: {
        title: '木かげの入口',
        detail: '森らしい素材が集まり、秘密基地の入口が見えてきた。',
      },
      60: {
        title: 'あかりの小道',
        detail: '灯りと木のリズムで、歩きたくなる森になってきた。',
      },
      110: {
        title: '森の大作品',
        detail: '基地とコースターがつながり、遊べる森として完成度が高い。',
      },
    },
  },
  'build-tropical': {
    stageId: 'build-tropical',
    icon: '🏝️',
    title: 'きらきら島リゾート',
    shortLabel: '水とガラス',
    detail: '水辺・ガラス・光る飾りで、夜でも映えるリゾートを作ると高評価。',
    focusLabel: '水・ガラス・光・電気',
    accent: '#80deea',
    glow: 'rgba(80, 220, 230, 0.3)',
    blocks: [
      { blockId: BLOCK_IDS.ELECTRIC, points: 5, label: '電気' },
      { blockId: BLOCK_IDS.GLOWSTONE, points: 5, label: '光る石' },
      { blockId: BLOCK_IDS.WATER, points: 4, label: '水' },
      { blockId: BLOCK_IDS.GLASS, points: 4, label: 'ガラス' },
      { blockId: BLOCK_IDS.CANDLE, points: 3, label: 'キャンドル' },
      { blockId: BLOCK_IDS.TORCH, points: 2, label: '松明' },
      { blockId: BLOCK_IDS.RAIL_BOOSTER, points: 2, label: '加速レール' },
    ],
    milestones: {
      25: {
        title: '小さな水辺',
        detail: '透明な素材が入り、島にリゾート感が出てきた。',
      },
      60: {
        title: '夜景スポット',
        detail: '水と光がつながり、夜でも見に行きたくなる島になった。',
      },
      110: {
        title: '南国リゾート完成',
        detail: '水辺・光・移動ルートがそろい、遊べる島として仕上がった。',
      },
    },
  },
  'build-snow': {
    stageId: 'build-snow',
    icon: '🏰',
    title: '氷の城づくり',
    shortLabel: '雪と光',
    detail: '雪・ガラス・光る石で、寒くても明るい城を作ると高評価。',
    focusLabel: '雪・ガラス・光る石',
    accent: '#bbdefb',
    glow: 'rgba(170, 220, 255, 0.32)',
    blocks: [
      { blockId: BLOCK_IDS.GLOWSTONE, points: 6, label: '光る石' },
      { blockId: BLOCK_IDS.GLASS, points: 4, label: 'ガラス' },
      { blockId: BLOCK_IDS.SNOW, points: 4, label: '雪' },
      { blockId: BLOCK_IDS.CANDLE, points: 3, label: 'キャンドル' },
      { blockId: BLOCK_IDS.TORCH, points: 2, label: '松明' },
      { blockId: BLOCK_IDS.STAIRS, points: 2, label: '階段' },
      { blockId: BLOCK_IDS.STONE, points: 1, label: '石' },
    ],
    milestones: {
      25: {
        title: '雪の土台',
        detail: '雪と透明な素材で、城のかたちが見え始めた。',
      },
      60: {
        title: '光る城壁',
        detail: '吹雪の中でも分かる、明るい城壁が育ってきた。',
      },
      110: {
        title: '氷の王国',
        detail: '雪・光・段差がそろい、王国らしい立体感が生まれた。',
      },
    },
  },
  'build-desert': {
    stageId: 'build-desert',
    icon: '🔺',
    title: '砂漠のオアシス遺跡',
    shortLabel: '砂と水',
    detail: '砂・石・水・光で、遺跡とオアシスが同居する作品にすると高評価。',
    focusLabel: '砂・石・水・光',
    accent: '#ffe082',
    glow: 'rgba(255, 210, 110, 0.32)',
    blocks: [
      { blockId: BLOCK_IDS.GLOWSTONE, points: 5, label: '光る石' },
      { blockId: BLOCK_IDS.WATER, points: 5, label: '水' },
      { blockId: BLOCK_IDS.STAIRS, points: 4, label: '階段' },
      { blockId: BLOCK_IDS.SAND, points: 3, label: '砂' },
      { blockId: BLOCK_IDS.STONE, points: 3, label: '石' },
      { blockId: BLOCK_IDS.CAMPFIRE, points: 2, label: '焚き火' },
      { blockId: BLOCK_IDS.TNT, points: 2, label: 'TNT' },
    ],
    milestones: {
      25: {
        title: '砂の土台',
        detail: '砂漠らしい素材で、大きな工事の土台ができてきた。',
      },
      60: {
        title: 'オアシスの目印',
        detail: '水と光が入り、遠くからでも分かる場所になってきた。',
      },
      110: {
        title: '砂漠の大遺跡',
        detail: '遺跡・水辺・光がそろい、冒険したくなる作品になった。',
      },
    },
  },
};

export function getStageBuildStyle(stageId: string | null | undefined): StageBuildStyle | null {
  if (!stageId) return null;
  return STAGE_BUILD_STYLES[stageId] ?? null;
}

export function getStageBuildBlockScore(
  stageId: string | null | undefined,
  blockId: BlockId,
): StageBuildStyleBlock | null {
  const style = getStageBuildStyle(stageId);
  if (!style) return null;
  return style.blocks.find((block) => block.blockId === blockId) ?? null;
}

export function getNextStageBuildMilestone(
  score: number,
  achievedMilestones: number[],
): BuildScoreMilestone | null {
  return BUILD_SCORE_MILESTONES.find(
    (milestone) => score < milestone && !achievedMilestones.includes(milestone),
  ) ?? null;
}

export function getReachedStageBuildMilestone(
  previousScore: number,
  nextScore: number,
  achievedMilestones: number[],
): BuildScoreMilestone | null {
  return BUILD_SCORE_MILESTONES.find(
    (milestone) =>
      previousScore < milestone &&
      nextScore >= milestone &&
      !achievedMilestones.includes(milestone),
  ) ?? null;
}

export function formatStageBuildFocus(style: StageBuildStyle, limit = 4): string {
  return style.blocks
    .slice(0, limit)
    .map((block) => `${block.label}+${block.points}`)
    .join(' / ');
}
