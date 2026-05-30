// ステージチャレンジ達成時の報酬定義
// 達成した瞬間に、マップとモードに合った補給が返るようにする

import { BLOCK_DEFS, BLOCK_IDS, type BlockId } from './blocks';
import { getStageCondition } from './stageConditions';
import { getStageById } from './stages';

export type StageChallengeRewardKind = 'build_supply' | 'war_supply' | 'recovery' | 'rocket_ready';

export interface StageChallengeRewardBlock {
  blockId: BlockId;
  count: number;
}

export interface StageChallengeRewardDefinition {
  kind: StageChallengeRewardKind;
  label: string;
  detail: string;
  accent: string;
  blocks: StageChallengeRewardBlock[];
  heal: number;
  hunger: number;
  rocketReady: boolean;
}

interface WarRewardPreset {
  name: string;
  kind: StageChallengeRewardKind;
  accent: string;
  blocks: StageChallengeRewardBlock[];
  heal: number;
  hunger: number;
  rocketReady?: boolean;
}

const WAR_REWARD_PRESETS: Record<string, WarRewardPreset> = {
  'war-forest': {
    name: '防衛補給',
    kind: 'recovery',
    accent: '#dce775',
    blocks: [
      { blockId: BLOCK_IDS.TURRET, count: 1 },
      { blockId: BLOCK_IDS.TORCH, count: 8 },
    ],
    heal: 4,
    hunger: 2,
  },
  'war-tropical': {
    name: '強襲補給',
    kind: 'war_supply',
    accent: '#ffe28a',
    blocks: [
      { blockId: BLOCK_IDS.TNT, count: 3 },
      { blockId: BLOCK_IDS.CAMPFIRE, count: 1 },
    ],
    heal: 3,
    hunger: 3,
  },
  'war-snow': {
    name: '持久補給',
    kind: 'recovery',
    accent: '#c8b0ff',
    blocks: [
      { blockId: BLOCK_IDS.GLOWSTONE, count: 4 },
      { blockId: BLOCK_IDS.CAMPFIRE, count: 1 },
    ],
    heal: 5,
    hunger: 2,
  },
  'war-desert': {
    name: '爆風補給',
    kind: 'rocket_ready',
    accent: '#ffc06d',
    blocks: [
      { blockId: BLOCK_IDS.TNT, count: 4 },
      { blockId: BLOCK_IDS.ELECTRIC, count: 2 },
    ],
    heal: 2,
    hunger: 2,
    rocketReady: true,
  },
};

function getShortBlockName(blockId: BlockId): string {
  return (BLOCK_DEFS[blockId]?.name ?? `ID${blockId}`)
    .replace('ブロック', '')
    .replace('草付き土', '草')
    .replace('木の', '木')
    .replace('電気の', '電気')
    .replace('グロウストーン', '光る石');
}

function formatBlockRewards(blocks: StageChallengeRewardBlock[]): string {
  return blocks
    .filter((block) => block.count > 0)
    .map((block) => `${getShortBlockName(block.blockId)} +${block.count}`)
    .join(' / ');
}

function multiplyBlocks(blocks: StageChallengeRewardBlock[], multiplier: number): StageChallengeRewardBlock[] {
  return blocks.map((block) => ({
    blockId: block.blockId,
    count: Math.max(1, block.count * multiplier),
  }));
}

function compactRewardLabel(parts: string[]): string {
  return parts.filter(Boolean).join(' / ');
}

export function getStageChallengeReward(
  stageId: string | null | undefined,
  completedCount: number,
  totalCount: number,
): StageChallengeRewardDefinition | null {
  if (!stageId) return null;
  const stage = getStageById(stageId);
  if (!stage) return null;

  const isGold = totalCount > 0 && completedCount >= totalCount;
  const stepMultiplier = isGold ? 2 : completedCount >= 2 ? 1.5 : 1;

  if (stage.category === 'build') {
    const condition = getStageCondition(stageId);
    if (!condition || condition.effect.kind !== 'resource') return null;

    const primaryCount = Math.max(1, Math.round(condition.effect.count * stepMultiplier));
    const blocks: StageChallengeRewardBlock[] = [
      { blockId: condition.effect.blockId, count: primaryCount },
    ];

    if (isGold && condition.effect.blockId !== BLOCK_IDS.GLOWSTONE) {
      blocks.push({ blockId: BLOCK_IDS.GLOWSTONE, count: 2 });
    }

    return {
      kind: 'build_supply',
      label: compactRewardLabel([formatBlockRewards(blocks)]),
      detail: `${condition.title}の素材補給`,
      accent: condition.accent,
      blocks,
      heal: 0,
      hunger: 0,
      rocketReady: false,
    };
  }

  const preset = WAR_REWARD_PRESETS[stageId] ?? WAR_REWARD_PRESETS['war-forest'];
  const blocks = multiplyBlocks(preset.blocks, isGold ? 2 : 1);
  const heal = preset.heal + (isGold ? 2 : 0);
  const hunger = preset.hunger + (isGold ? 1 : 0);
  const rewardParts = [
    formatBlockRewards(blocks),
    heal > 0 ? `HP +${heal}` : '',
    hunger > 0 ? `満腹 +${hunger}` : '',
    preset.rocketReady ? 'ロケット即応' : '',
  ];

  return {
    kind: preset.kind,
    label: `${preset.name}: ${compactRewardLabel(rewardParts)}`,
    detail: isGold ? '金メダル補給' : '戦闘継続補給',
    accent: preset.accent,
    blocks,
    heal,
    hunger,
    rocketReady: Boolean(preset.rocketReady),
  };
}
