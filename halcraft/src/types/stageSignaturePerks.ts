// マップ称号を取った後の開始特典
// やり込み称号を次回プレイの実効ボーナスに変え、マップ固有の遊び方をさらに強める

import { BLOCK_DEFS, BLOCK_IDS, type BlockId } from './blocks';
import type { StageDefinition } from './stages';
import { getStageSignatureAward, type StageSignatureAward } from './stageSignatureAwards';
import { TOOL_DEFS, type ToolId } from './tools';

export interface StageSignaturePerkBlock {
  blockId: BlockId;
  count: number;
}

export interface StageSignaturePerk {
  stageId: string;
  icon: string;
  title: string;
  shortLabel: string;
  detail: string;
  accent: string;
  blocks: StageSignaturePerkBlock[];
  tools: ToolId[];
  hunger: number;
  shieldMs: number;
  rocketReady: boolean;
  buildFocusMs: number;
  combatFocusMs: number;
}

interface StageSignaturePerkPreset {
  icon: string;
  title: string;
  detail: string;
  blocks: StageSignaturePerkBlock[];
  tools: ToolId[];
  hunger?: number;
  shieldMs?: number;
  rocketReady?: boolean;
  buildFocusMs?: number;
  combatFocusMs?: number;
}

const STAGE_SIGNATURE_PERKS: Record<string, StageSignaturePerkPreset> = {
  'build-forest': {
    icon: '🌿',
    title: '森の称号クラフト',
    detail: '木と灯りを一気に伸ばせる、森の秘密基地職人だけの開幕支度。',
    blocks: [
      { blockId: BLOCK_IDS.WOOD, count: 24 },
      { blockId: BLOCK_IDS.LEAVES, count: 14 },
      { blockId: BLOCK_IDS.TORCH, count: 8 },
      { blockId: BLOCK_IDS.CAMPFIRE, count: 2 },
    ],
    tools: ['diamond_pickaxe'],
    buildFocusMs: 9500,
  },
  'build-tropical': {
    icon: '🌊',
    title: '南国の称号クラフト',
    detail: '水辺とガラスをすぐ広げられる、リゾート設計士の開幕支度。',
    blocks: [
      { blockId: BLOCK_IDS.WATER, count: 16 },
      { blockId: BLOCK_IDS.GLASS, count: 22 },
      { blockId: BLOCK_IDS.ELECTRIC, count: 6 },
      { blockId: BLOCK_IDS.RAIL_BOOSTER, count: 4 },
    ],
    tools: ['diamond_pickaxe'],
    buildFocusMs: 9500,
  },
  'build-snow': {
    icon: '❄️',
    title: '氷城の称号クラフト',
    detail: '雪・光・ガラスで城の見せ場を作れる、氷城クラフターの開幕支度。',
    blocks: [
      { blockId: BLOCK_IDS.SNOW, count: 28 },
      { blockId: BLOCK_IDS.GLASS, count: 14 },
      { blockId: BLOCK_IDS.GLOWSTONE, count: 6 },
      { blockId: BLOCK_IDS.CANDLE, count: 4 },
    ],
    tools: ['diamond_pickaxe'],
    buildFocusMs: 9800,
  },
  'build-desert': {
    icon: '🏜️',
    title: '砂漠の称号クラフト',
    detail: '大きな遺跡とオアシスを一気に作れる、砂漠遺跡ビルダーの開幕支度。',
    blocks: [
      { blockId: BLOCK_IDS.SAND, count: 34 },
      { blockId: BLOCK_IDS.STONE, count: 16 },
      { blockId: BLOCK_IDS.WATER, count: 8 },
      { blockId: BLOCK_IDS.TNT, count: 2 },
    ],
    tools: ['diamond_pickaxe'],
    buildFocusMs: 9800,
  },
  'war-forest': {
    icon: '🛡️',
    title: '森の称号防衛',
    detail: '防衛線をすぐ厚くできる、森の防衛隊長だけの開幕作戦。',
    blocks: [
      { blockId: BLOCK_IDS.TURRET, count: 2 },
      { blockId: BLOCK_IDS.TORCH, count: 10 },
      { blockId: BLOCK_IDS.CAMPFIRE, count: 2 },
      { blockId: BLOCK_IDS.STONE, count: 12 },
    ],
    tools: ['diamond_sword'],
    hunger: 3,
    shieldMs: 4200,
    combatFocusMs: 7200,
  },
  'war-tropical': {
    icon: '💥',
    title: '南国の称号強襲',
    detail: '機関銃ラッシュと爆発で押し返す、ジャングル制圧手の開幕作戦。',
    blocks: [
      { blockId: BLOCK_IDS.TNT, count: 4 },
      { blockId: BLOCK_IDS.WATER, count: 8 },
      { blockId: BLOCK_IDS.TURRET, count: 1 },
      { blockId: BLOCK_IDS.ELECTRIC, count: 4 },
    ],
    tools: ['diamond_sword'],
    hunger: 3,
    shieldMs: 4200,
    combatFocusMs: 7600,
  },
  'war-snow': {
    icon: '⚔️',
    title: '極寒の称号前線',
    detail: 'ライトセイバーで踏み込む時間を作る、極寒前線剣士の開幕作戦。',
    blocks: [
      { blockId: BLOCK_IDS.CAMPFIRE, count: 2 },
      { blockId: BLOCK_IDS.GLOWSTONE, count: 5 },
      { blockId: BLOCK_IDS.SNOW, count: 18 },
      { blockId: BLOCK_IDS.TORCH, count: 8 },
    ],
    tools: ['diamond_sword'],
    hunger: 4,
    shieldMs: 4600,
    combatFocusMs: 7600,
  },
  'war-desert': {
    icon: '🚀',
    title: '熱砂の称号火力',
    detail: 'ロケットと爆発をすぐ押し込める、熱砂ロケット隊長の開幕作戦。',
    blocks: [
      { blockId: BLOCK_IDS.TNT, count: 5 },
      { blockId: BLOCK_IDS.STONE, count: 14 },
      { blockId: BLOCK_IDS.WATER, count: 6 },
      { blockId: BLOCK_IDS.ELECTRIC, count: 4 },
    ],
    tools: ['diamond_sword'],
    hunger: 4,
    shieldMs: 4600,
    rocketReady: true,
    combatFocusMs: 8000,
  },
};

function getShortBlockName(blockId: BlockId): string {
  return (BLOCK_DEFS[blockId]?.name ?? `ID${blockId}`)
    .replace('ブロック', '')
    .replace('草付き土', '草')
    .replace('生の木', '原木')
    .replace('グロウストーン', '光る石')
    .replace('電気の', '電気');
}

export function getStageSignaturePerkForAward(
  stage: StageDefinition | null | undefined,
  award: StageSignatureAward | null | undefined,
): StageSignaturePerk | null {
  if (!stage || !award?.unlocked) return null;

  const preset = STAGE_SIGNATURE_PERKS[stage.id];
  if (!preset) return null;

  return {
    stageId: stage.id,
    icon: preset.icon,
    title: preset.title,
    shortLabel: '称号特典',
    detail: preset.detail,
    accent: award.accent,
    blocks: preset.blocks,
    tools: preset.tools,
    hunger: preset.hunger ?? 0,
    shieldMs: preset.shieldMs ?? 0,
    rocketReady: preset.rocketReady ?? false,
    buildFocusMs: preset.buildFocusMs ?? 0,
    combatFocusMs: preset.combatFocusMs ?? 0,
  };
}

export function getStageSignaturePerkForProgress(
  args: Parameters<typeof getStageSignatureAward>[0],
): StageSignaturePerk | null {
  return getStageSignaturePerkForAward(args.stage, getStageSignatureAward(args));
}

export function formatStageSignaturePerkLabel(perk: StageSignaturePerk): string {
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
    perk.buildFocusMs > 0 ? `称号高速建築 +${Math.round(perk.buildFocusMs / 1000)}s` : '',
    perk.combatFocusMs > 0 ? `作戦集中 +${Math.round(perk.combatFocusMs / 1000)}s` : '',
  ].filter(Boolean);

  return parts.join(' / ');
}
