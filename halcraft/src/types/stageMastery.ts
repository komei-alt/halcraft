// マップごとのやり込み度を、チャレンジ達成と作品評価からまとめて見せる

import {
  BUILD_SCORE_MILESTONES,
  getStageBuildStyle,
} from './stageBuildStyles';
import { BLOCK_DEFS, BLOCK_IDS, type BlockId } from './blocks';
import type { StageCategory, StageDefinition } from './stages';
import { TOOL_DEFS, type ToolId } from './tools';

export type StageMasteryRank = 'new' | 'bronze' | 'silver' | 'gold' | 'master';

export interface StageMasterySummary {
  score: number;
  rank: StageMasteryRank;
  rankLabel: string;
  title: string;
  nextLabel: string;
  accent: string;
  glow: string;
  challengeScore: number;
  buildScore: number;
  mastered: boolean;
}

export interface StageMasteryPerkBlock {
  blockId: BlockId;
  count: number;
}

export interface StageMasteryPerk {
  rank: Exclude<StageMasteryRank, 'new'>;
  rankValue: number;
  rankLabel: string;
  icon: string;
  title: string;
  shortLabel: string;
  detail: string;
  accent: string;
  glow: string;
  blocks: StageMasteryPerkBlock[];
  tools: ToolId[];
  hunger: number;
  shieldMs: number;
  rocketReady: boolean;
  buildFocusMs: number;
}

interface StageMasteryInput {
  stage: StageDefinition;
  completedCount: number;
  challengeCount: number;
  buildScore?: number;
}

const FINAL_BUILD_SCORE = BUILD_SCORE_MILESTONES[BUILD_SCORE_MILESTONES.length - 1];

const RANK_LABELS: Record<StageMasteryRank, string> = {
  new: '未開拓',
  bronze: 'BRONZE',
  silver: 'SILVER',
  gold: 'GOLD',
  master: 'MASTER',
};

const RANK_ACCENTS: Record<StageMasteryRank, string> = {
  new: 'rgba(255,255,255,0.72)',
  bronze: '#ffc58a',
  silver: '#dce8ff',
  gold: '#ffe680',
  master: '#a6ffcf',
};

const RANK_VALUES: Record<StageMasteryRank, number> = {
  new: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  master: 4,
};

const STAGE_MASTERY_SUPPLIES: Record<string, StageMasteryPerkBlock[]> = {
  'build-forest': [
    { blockId: BLOCK_IDS.WOOD, count: 4 },
    { blockId: BLOCK_IDS.LEAVES, count: 3 },
    { blockId: BLOCK_IDS.TORCH, count: 1 },
  ],
  'build-tropical': [
    { blockId: BLOCK_IDS.GLASS, count: 4 },
    { blockId: BLOCK_IDS.WATER, count: 2 },
    { blockId: BLOCK_IDS.ELECTRIC, count: 1 },
  ],
  'build-snow': [
    { blockId: BLOCK_IDS.SNOW, count: 5 },
    { blockId: BLOCK_IDS.GLASS, count: 3 },
    { blockId: BLOCK_IDS.GLOWSTONE, count: 1 },
  ],
  'build-desert': [
    { blockId: BLOCK_IDS.SAND, count: 6 },
    { blockId: BLOCK_IDS.STONE, count: 3 },
    { blockId: BLOCK_IDS.WATER, count: 1 },
  ],
  'war-forest': [
    { blockId: BLOCK_IDS.TORCH, count: 2 },
    { blockId: BLOCK_IDS.CAMPFIRE, count: 1 },
  ],
  'war-tropical': [
    { blockId: BLOCK_IDS.TNT, count: 1 },
    { blockId: BLOCK_IDS.WATER, count: 2 },
  ],
  'war-snow': [
    { blockId: BLOCK_IDS.SNOW, count: 4 },
    { blockId: BLOCK_IDS.GLOWSTONE, count: 1 },
  ],
  'war-desert': [
    { blockId: BLOCK_IDS.TNT, count: 1 },
    { blockId: BLOCK_IDS.STONE, count: 3 },
    { blockId: BLOCK_IDS.WATER, count: 1 },
  ],
};

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function clampContribution(score: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(score)));
}

function getRank(score: number): StageMasteryRank {
  if (score >= 100) return 'master';
  if (score >= 80) return 'gold';
  if (score >= 55) return 'silver';
  if (score >= 25) return 'bronze';
  return 'new';
}

function getRankTitle(category: StageCategory, rank: StageMasteryRank): string {
  const titles: Record<StageCategory, Record<StageMasteryRank, string>> = {
    build: {
      new: '制作これから',
      bronze: '制作見習い',
      silver: '拠点職人',
      gold: 'マップ職人',
      master: 'マップマスター',
    },
    war: {
      new: '初陣これから',
      bronze: '前線参加',
      silver: '前線突破',
      gold: '防衛隊長',
      master: '戦場マスター',
    },
  };
  return titles[category][rank];
}

function getNextLabel(input: StageMasteryInput, challengeScore: number, buildScore: number): string {
  if (input.stage.category === 'build') {
    const style = getStageBuildStyle(input.stage.id);
    const currentBuildScore = Math.max(0, input.buildScore ?? 0);
    if (style && buildScore < 40) {
      return `${style.shortLabel} あと${Math.max(0, FINAL_BUILD_SCORE - Math.min(currentBuildScore, FINAL_BUILD_SCORE))}pt`;
    }
  }

  if (input.completedCount < input.challengeCount) {
    return `チャレンジあと${Math.max(0, input.challengeCount - input.completedCount)}`;
  }

  if (challengeScore + buildScore < 100) {
    return 'もう少しで熟練アップ';
  }

  return '完全制覇';
}

export function getStageMasterySummary(input: StageMasteryInput): StageMasterySummary {
  const challengeWeight = input.stage.category === 'build' ? 60 : 100;
  const challengeRatio = input.challengeCount > 0
    ? input.completedCount / input.challengeCount
    : 0;
  const challengeScore = clampContribution(challengeRatio * challengeWeight, challengeWeight);
  const buildScore = input.stage.category === 'build'
    ? clampContribution((Math.max(0, input.buildScore ?? 0) / FINAL_BUILD_SCORE) * 40, 40)
    : 0;
  const score = clampScore(challengeScore + buildScore);
  const rank = getRank(score);
  const accent = RANK_ACCENTS[rank];

  return {
    score,
    rank,
    rankLabel: RANK_LABELS[rank],
    title: getRankTitle(input.stage.category, rank),
    nextLabel: getNextLabel(input, challengeScore, buildScore),
    accent,
    glow: rank === 'new' ? 'rgba(255,255,255,0.14)' : `${accent}38`,
    challengeScore,
    buildScore,
    mastered: rank === 'master',
  };
}

function getShortBlockName(blockId: BlockId): string {
  return (BLOCK_DEFS[blockId]?.name ?? `ID${blockId}`)
    .replace('ブロック', '')
    .replace('草付き土', '草')
    .replace('グロウストーン', '光る石')
    .replace('電気の', '電気');
}

function getMasteryPerkTools(category: StageCategory, rankValue: number): ToolId[] {
  if (rankValue >= 4) return category === 'build' ? ['diamond_pickaxe'] : ['diamond_sword'];
  if (rankValue >= 3) return category === 'build' ? ['iron_pickaxe'] : ['iron_sword'];
  if (rankValue >= 2) return category === 'build' ? ['stone_pickaxe'] : ['stone_sword'];
  return [];
}

export function getStageMasteryPerk(
  stage: StageDefinition | null | undefined,
  mastery: StageMasterySummary | null | undefined,
): StageMasteryPerk | null {
  if (!stage || !mastery || mastery.rank === 'new') return null;

  const rankValue = RANK_VALUES[mastery.rank];
  if (rankValue <= 0) return null;

  const supplies = STAGE_MASTERY_SUPPLIES[stage.id] ?? [];
  const isWar = stage.category === 'war';
  const buildFocusMs = isWar ? 0 : 2800 + rankValue * 1400;
  return {
    rank: mastery.rank,
    rankValue,
    rankLabel: mastery.rankLabel,
    icon: mastery.mastered ? '👑' : stage.icon,
    title: stage.category === 'build' ? '熟練大工の支度' : '熟練作戦の支度',
    shortLabel: `${mastery.rankLabel}熟練`,
    detail: `${stage.name}のやり込み度で、次の開始支給が強くなる。`,
    accent: mastery.accent,
    glow: mastery.glow,
    blocks: supplies.map((block) => ({
      blockId: block.blockId,
      count: block.count * rankValue,
    })),
    tools: getMasteryPerkTools(stage.category, rankValue),
    hunger: isWar ? rankValue : 0,
    shieldMs: isWar ? rankValue * 900 : 0,
    rocketReady: isWar && rankValue >= 4,
    buildFocusMs,
  };
}

export function getStageMasteryPerkForProgress(input: StageMasteryInput): StageMasteryPerk | null {
  return getStageMasteryPerk(input.stage, getStageMasterySummary(input));
}

export function formatStageMasteryPerkLabel(perk: StageMasteryPerk): string {
  const blockLabel = perk.blocks
    .filter((block) => block.count > 0)
    .map((block) => `${getShortBlockName(block.blockId)} +${block.count}`)
    .join(' / ');
  const toolLabel = perk.tools
    .map((toolId) => TOOL_DEFS[toolId]?.name ?? toolId)
    .join(' / ');
  const parts = [
    blockLabel,
    toolLabel ? `道具 ${toolLabel}` : '',
    perk.hunger > 0 ? `満腹 +${perk.hunger}` : '',
    perk.shieldMs > 0 ? `開幕安全 +${Math.round(perk.shieldMs / 1000)}s` : '',
    perk.rocketReady ? 'ロケット即応' : '',
    perk.buildFocusMs > 0 ? `開幕高速建築 +${Math.round(perk.buildFocusMs / 1000)}s` : '',
  ].filter(Boolean);

  return parts.join(' / ');
}
