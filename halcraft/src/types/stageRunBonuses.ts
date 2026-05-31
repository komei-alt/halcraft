// ステージ開始時の装備とメダル継続ボーナス
// やり込み結果を次回プレイの手触りに戻し、マップごとの役割を強める

import { BLOCK_DEFS, BLOCK_IDS, type BlockId } from './blocks';
import { BUILD_SCORE_MILESTONES } from './stageBuildStyles';
import { getStageById } from './stages';
import type { StageChallengeMedal } from './stageChallenges';
import { TOOL_DEFS, type ToolId } from './tools';
import type { EquippedItem } from '../stores/usePlayerStore';

export interface StageRunBonusBlock {
  blockId: BlockId;
  count: number;
}

export interface StageRunBonus {
  medal: Exclude<StageChallengeMedal, 'none'>;
  rank: number;
  icon: string;
  title: string;
  shortLabel: string;
  sourceLabel: string;
  detail: string;
  accent: string;
  blocks: StageRunBonusBlock[];
  tools: ToolId[];
  hunger: number;
  shieldMs: number;
  rocketReady: boolean;
}

interface StageRunBonusPreset {
  icon: string;
  title: string;
  detail: string;
  accent: string;
  blocks: StageRunBonusBlock[];
}

const OPENING_ITEMS: Record<string, EquippedItem> = {
  'build-forest': 'builder',
  'build-tropical': 'builder',
  'build-snow': 'builder',
  'build-desert': 'builder',
  'war-forest': 'machine_gun',
  'war-tropical': 'machine_gun',
  'war-snow': 'lightsaber',
  'war-desert': 'rocket_launcher',
};

const MEDAL_RANKS: Record<StageChallengeMedal, number> = {
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
};

const MEDAL_LABELS: Record<Exclude<StageChallengeMedal, 'none'>, string> = {
  bronze: 'BRONZE継続',
  silver: 'SILVER継続',
  gold: 'GOLD継続',
};

const ITEM_LABELS: Record<EquippedItem, string> = {
  builder: '建築セット',
  rocket_launcher: 'ロケット',
  machine_gun: '機関銃',
  lightsaber: 'ライトセイバー',
};

const BONUS_PRESETS: Record<string, StageRunBonusPreset> = {
  'build-forest': {
    icon: '🌿',
    title: '森づくりの継続箱',
    detail: '前回の制作メダルで、木・葉・灯りを多めに持って始める。',
    accent: '#b7ff72',
    blocks: [
      { blockId: BLOCK_IDS.WOOD, count: 12 },
      { blockId: BLOCK_IDS.LEAVES, count: 8 },
      { blockId: BLOCK_IDS.TORCH, count: 4 },
    ],
  },
  'build-tropical': {
    icon: '🌊',
    title: 'リゾート続き箱',
    detail: '水辺づくりの続きをすぐ進められるガラスと水の補給。',
    accent: '#65fff2',
    blocks: [
      { blockId: BLOCK_IDS.GLASS, count: 12 },
      { blockId: BLOCK_IDS.WATER, count: 8 },
      { blockId: BLOCK_IDS.ELECTRIC, count: 3 },
    ],
  },
  'build-snow': {
    icon: '✨',
    title: '雪城の継続箱',
    detail: '塔や目印づくりに効く雪・ガラス・光る石を追加する。',
    accent: '#d8f6ff',
    blocks: [
      { blockId: BLOCK_IDS.SNOW, count: 18 },
      { blockId: BLOCK_IDS.GLASS, count: 10 },
      { blockId: BLOCK_IDS.GLOWSTONE, count: 3 },
    ],
  },
  'build-desert': {
    icon: '🏜️',
    title: '大工事の継続箱',
    detail: 'ピラミッドやオアシスを大きく続けるための砂と石の補給。',
    accent: '#ffd27a',
    blocks: [
      { blockId: BLOCK_IDS.SAND, count: 24 },
      { blockId: BLOCK_IDS.STONE, count: 8 },
      { blockId: BLOCK_IDS.WATER, count: 4 },
    ],
  },
  'war-forest': {
    icon: '🛡️',
    title: '森の防衛予備',
    detail: '灯りとタレットを厚くして、森の拠点防衛を早く立ち上げる。',
    accent: '#dce775',
    blocks: [
      { blockId: BLOCK_IDS.TORCH, count: 6 },
      { blockId: BLOCK_IDS.TURRET, count: 1 },
      { blockId: BLOCK_IDS.CAMPFIRE, count: 1 },
    ],
  },
  'war-tropical': {
    icon: '💥',
    title: 'ジャングル強襲予備',
    detail: 'ラッシュを押し返すTNTと水場づくりの補給。',
    accent: '#ffe28a',
    blocks: [
      { blockId: BLOCK_IDS.TNT, count: 2 },
      { blockId: BLOCK_IDS.WATER, count: 6 },
      { blockId: BLOCK_IDS.CAMPFIRE, count: 1 },
    ],
  },
  'war-snow': {
    icon: '🔥',
    title: '極寒キャンプ予備',
    detail: '火と光の補給で、寒さ対策を作ってから持久戦に入る。',
    accent: '#c8b0ff',
    blocks: [
      { blockId: BLOCK_IDS.CAMPFIRE, count: 1 },
      { blockId: BLOCK_IDS.GLOWSTONE, count: 3 },
      { blockId: BLOCK_IDS.SNOW, count: 12 },
    ],
  },
  'war-desert': {
    icon: '🚀',
    title: '砂漠決戦予備',
    detail: '開けた戦場で爆発とロケットをすぐ使える火力補給。',
    accent: '#ffc06d',
    blocks: [
      { blockId: BLOCK_IDS.TNT, count: 3 },
      { blockId: BLOCK_IDS.STONE, count: 8 },
      { blockId: BLOCK_IDS.WATER, count: 3 },
    ],
  },
};

function getMedalRank(medal: StageChallengeMedal): number {
  return MEDAL_RANKS[medal] ?? 0;
}

function getHigherMedal(a: StageChallengeMedal, b: StageChallengeMedal): StageChallengeMedal {
  return getMedalRank(a) >= getMedalRank(b) ? a : b;
}

export function getBuildScoreMedal(buildScore: number): StageChallengeMedal {
  const safeScore = Math.max(0, Math.floor(buildScore));
  if (safeScore >= BUILD_SCORE_MILESTONES[2]) return 'gold';
  if (safeScore >= BUILD_SCORE_MILESTONES[1]) return 'silver';
  if (safeScore >= BUILD_SCORE_MILESTONES[0]) return 'bronze';
  return 'none';
}

export function getEffectiveStageRunBonusMedal(
  stageId: string | null | undefined,
  challengeMedal: StageChallengeMedal,
  buildScore = 0,
): StageChallengeMedal {
  const stage = stageId ? getStageById(stageId) : null;
  if (!stage || stage.category !== 'build') return challengeMedal;
  return getHigherMedal(challengeMedal, getBuildScoreMedal(buildScore));
}

function getShortBlockName(blockId: BlockId): string {
  return (BLOCK_DEFS[blockId]?.name ?? `ID${blockId}`)
    .replace('ブロック', '')
    .replace('草付き土', '草')
    .replace('グロウストーン', '光る石')
    .replace('電気の', '電気');
}

function getBonusTools(stageId: string, rank: number): ToolId[] {
  const stage = getStageById(stageId);
  if (!stage || rank < 2) return [];

  if (stage.category === 'build') {
    return rank >= 3 ? ['iron_pickaxe'] : ['stone_pickaxe'];
  }

  return rank >= 3 ? ['diamond_sword'] : ['iron_sword'];
}

export function getStageOpeningItem(stageId: string | null | undefined): EquippedItem {
  if (!stageId) return 'builder';
  return OPENING_ITEMS[stageId] ?? 'builder';
}

export function getStageOpeningItemLabel(stageId: string | null | undefined): string {
  return ITEM_LABELS[getStageOpeningItem(stageId)];
}

export function getStageRunBonus(
  stageId: string | null | undefined,
  medal: StageChallengeMedal,
  sourceLabel = 'メダル特典',
): StageRunBonus | null {
  if (!stageId) return null;
  const stage = getStageById(stageId);
  const preset = BONUS_PRESETS[stageId];
  const rank = getMedalRank(medal);
  if (!stage || !preset || rank <= 0 || medal === 'none') return null;

  const blocks = preset.blocks.map((block) => ({
    blockId: block.blockId,
    count: block.count * rank,
  }));
  const isWar = stage.category === 'war';

  return {
    medal,
    rank,
    icon: preset.icon,
    title: preset.title,
    shortLabel: MEDAL_LABELS[medal],
    sourceLabel,
    detail: preset.detail,
    accent: preset.accent,
    blocks,
    tools: getBonusTools(stageId, rank),
    hunger: isWar ? rank : 0,
    shieldMs: isWar ? rank * 1500 : 0,
    rocketReady: false,
  };
}

export function getStageRunBonusForProgress(
  stageId: string | null | undefined,
  challengeMedal: StageChallengeMedal,
  buildScore = 0,
): StageRunBonus | null {
  const effectiveMedal = getEffectiveStageRunBonusMedal(stageId, challengeMedal, buildScore);
  const sourceLabel = effectiveMedal !== challengeMedal ? '作品BEST特典' : 'メダル特典';
  return getStageRunBonus(stageId, effectiveMedal, sourceLabel);
}

export function formatStageRunBonusLabel(bonus: StageRunBonus): string {
  const blockLabel = bonus.blocks
    .filter((block) => block.count > 0)
    .map((block) => `${getShortBlockName(block.blockId)} +${block.count}`)
    .join(' / ');
  const toolLabel = bonus.tools
    .map((toolId) => TOOL_DEFS[toolId]?.name ?? toolId)
    .join(' / ');
  const parts = [
    blockLabel,
    toolLabel ? `道具 ${toolLabel}` : '',
    bonus.hunger > 0 ? `満腹 +${bonus.hunger}` : '',
    bonus.shieldMs > 0 ? `開幕安全 +${Math.round(bonus.shieldMs / 1000)}s` : '',
    bonus.rocketReady ? 'ロケット即応' : '',
  ].filter(Boolean);

  return parts.join(' / ');
}
