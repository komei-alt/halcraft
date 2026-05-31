// モード別の上達ルール
// 建築はテーマ配置で「ひらめき」、戦争は連続撃破で「戦意」をためて実利ある補給を発動する

import { BLOCK_DEFS, BLOCK_IDS, type BlockId } from './blocks';
import { getStageBuildBlockScore } from './stageBuildStyles';
import { getStageById, type StageCategory } from './stages';
import type { MobType } from '../stores/useMobStore';

export interface StageModeRewardBlock {
  blockId: BlockId;
  count: number;
}

export interface StageModeReward {
  blocks: StageModeRewardBlock[];
  heal: number;
  hunger: number;
  shieldMs: number;
  rocketReady: boolean;
  buildFocusMs: number;
}

export interface StageModeRule {
  stageId: string;
  category: StageCategory;
  icon: string;
  title: string;
  shortLabel: string;
  meterLabel: string;
  actionLabel: string;
  detail: string;
  accent: string;
  glow: string;
  threshold: number;
  reward: StageModeReward;
  comboWindowMs?: number;
}

const EMPTY_REWARD: StageModeReward = {
  blocks: [],
  heal: 0,
  hunger: 0,
  shieldMs: 0,
  rocketReady: false,
  buildFocusMs: 0,
};

function reward(overrides: Partial<StageModeReward>): StageModeReward {
  return {
    ...EMPTY_REWARD,
    ...overrides,
    blocks: overrides.blocks ?? [],
  };
}

export const STAGE_MODE_RULES: Record<string, StageModeRule> = {
  'build-forest': {
    stageId: 'build-forest',
    category: 'build',
    icon: '🌿',
    title: '森づくりのひらめき',
    shortLabel: 'テーマ配置で木材補給',
    meterLabel: 'ひらめき',
    actionLabel: '木・葉・灯り・レールを置く',
    detail: '森らしい素材を置くほど制作テンポが上がり、次の木材補給につながる。',
    accent: '#b7ff72',
    glow: 'rgba(120, 220, 170, 0.32)',
    threshold: 100,
    reward: reward({
      blocks: [
        { blockId: BLOCK_IDS.WOOD, count: 10 },
        { blockId: BLOCK_IDS.LEAVES, count: 8 },
        { blockId: BLOCK_IDS.TORCH, count: 4 },
      ],
      buildFocusMs: 5200,
    }),
  },
  'build-tropical': {
    stageId: 'build-tropical',
    category: 'build',
    icon: '🌊',
    title: 'リゾート制作のひらめき',
    shortLabel: '水辺づくりで透明素材補給',
    meterLabel: 'ひらめき',
    actionLabel: '水・ガラス・光を置く',
    detail: '水辺や光る素材を配置すると、島づくりの素材循環が起きる。',
    accent: '#65fff2',
    glow: 'rgba(80, 220, 230, 0.34)',
    threshold: 100,
    reward: reward({
      blocks: [
        { blockId: BLOCK_IDS.GLASS, count: 10 },
        { blockId: BLOCK_IDS.WATER, count: 6 },
        { blockId: BLOCK_IDS.ELECTRIC, count: 2 },
      ],
      hunger: 1,
      buildFocusMs: 5200,
    }),
  },
  'build-snow': {
    stageId: 'build-snow',
    category: 'build',
    icon: '✨',
    title: '雪城づくりのひらめき',
    shortLabel: '雪と光で城素材補給',
    meterLabel: 'ひらめき',
    actionLabel: '雪・ガラス・光を置く',
    detail: '白い城に合う素材を重ねるほど、遠くから見える城づくりが進む。',
    accent: '#d8f6ff',
    glow: 'rgba(170, 220, 255, 0.34)',
    threshold: 100,
    reward: reward({
      blocks: [
        { blockId: BLOCK_IDS.SNOW, count: 14 },
        { blockId: BLOCK_IDS.GLASS, count: 8 },
        { blockId: BLOCK_IDS.GLOWSTONE, count: 3 },
      ],
      heal: 1,
      buildFocusMs: 5600,
    }),
  },
  'build-desert': {
    stageId: 'build-desert',
    category: 'build',
    icon: '🏜️',
    title: '大工事のひらめき',
    shortLabel: '砂と水で遺跡素材補給',
    meterLabel: 'ひらめき',
    actionLabel: '砂・石・水・光を置く',
    detail: '砂漠らしい大きな形を作るほど、巨大建築向けの補給が回る。',
    accent: '#ffd27a',
    glow: 'rgba(255, 210, 110, 0.34)',
    threshold: 100,
    reward: reward({
      blocks: [
        { blockId: BLOCK_IDS.SAND, count: 18 },
        { blockId: BLOCK_IDS.STONE, count: 8 },
        { blockId: BLOCK_IDS.WATER, count: 3 },
      ],
      buildFocusMs: 5400,
    }),
  },
  'war-forest': {
    stageId: 'war-forest',
    category: 'war',
    icon: '🛡️',
    title: '防衛テンション',
    shortLabel: '連続撃破で守り補給',
    meterLabel: '戦意',
    actionLabel: '8秒以内に撃破・機関銃命中',
    detail: '敵を途切れず倒すほど防衛線が乗り、タレットと安全時間が戻る。',
    accent: '#dce775',
    glow: 'rgba(220, 231, 117, 0.32)',
    threshold: 100,
    comboWindowMs: 8000,
    reward: reward({
      blocks: [{ blockId: BLOCK_IDS.TURRET, count: 1 }],
      heal: 2,
      shieldMs: 3500,
    }),
  },
  'war-tropical': {
    stageId: 'war-tropical',
    category: 'war',
    icon: '💥',
    title: '強襲テンション',
    shortLabel: '連続撃破で爆発補給',
    meterLabel: '戦意',
    actionLabel: '近い間隔で撃破・機関銃命中',
    detail: 'ラッシュを押し返すほどTNTと満腹が戻り、攻め続けられる。',
    accent: '#ffe28a',
    glow: 'rgba(255, 226, 138, 0.34)',
    threshold: 100,
    comboWindowMs: 7600,
    reward: reward({
      blocks: [{ blockId: BLOCK_IDS.TNT, count: 2 }],
      hunger: 2,
    }),
  },
  'war-snow': {
    stageId: 'war-snow',
    category: 'war',
    icon: '🔥',
    title: '持久テンション',
    shortLabel: '連続撃破で回復補給',
    meterLabel: '戦意',
    actionLabel: '撃破・セイバー命中で前線維持',
    detail: '硬い敵を崩し続けると、焚き火と回復で持久戦を立て直せる。',
    accent: '#c8b0ff',
    glow: 'rgba(200, 176, 255, 0.34)',
    threshold: 100,
    comboWindowMs: 9200,
    reward: reward({
      blocks: [{ blockId: BLOCK_IDS.CAMPFIRE, count: 1 }],
      heal: 4,
      shieldMs: 3000,
    }),
  },
  'war-desert': {
    stageId: 'war-desert',
    category: 'war',
    icon: '🚀',
    title: '決戦テンション',
    shortLabel: '連続撃破で火力窓',
    meterLabel: '戦意',
    actionLabel: '遠距離撃破・ロケット命中',
    detail: '開けた砂地で倒し続けるほど、ロケット再装填と爆発補給が戻る。',
    accent: '#ffc06d',
    glow: 'rgba(255, 192, 109, 0.34)',
    threshold: 100,
    comboWindowMs: 8200,
    reward: reward({
      blocks: [{ blockId: BLOCK_IDS.TNT, count: 2 }],
      rocketReady: true,
    }),
  },
};

function shortBlockName(blockId: BlockId): string {
  return (BLOCK_DEFS[blockId]?.name ?? `ID${blockId}`)
    .replace('ブロック', '')
    .replace('草付き土', '草')
    .replace('生の木', '原木')
    .replace('グロウストーン', '光る石')
    .replace('電気の', '電気');
}

export function getStageModeRule(stageId: string | null | undefined): StageModeRule | null {
  if (!stageId || !getStageById(stageId)) return null;
  return STAGE_MODE_RULES[stageId] ?? null;
}

export function getStageModeBuildGain(stageId: string | null | undefined, blockId: BlockId): number {
  const rule = getStageModeRule(stageId);
  if (!rule || rule.category !== 'build') return 0;
  const blockScore = getStageBuildBlockScore(stageId, blockId);
  return blockScore ? blockScore.points * 10 : 3;
}

export function getStageModeEnemyGain(stageId: string | null | undefined, mobType: MobType, streak: number): number {
  const rule = getStageModeRule(stageId);
  if (!rule || rule.category !== 'war') return 0;
  if (mobType === 'boss_giant') return rule.threshold;
  const streakBonus = Math.min(18, Math.max(0, streak - 1) * 3);
  return 22 + streakBonus;
}

export function formatStageModeRewardDetail(reward: StageModeReward): string {
  const blockLabel = reward.blocks
    .filter((block) => block.count > 0)
    .map((block) => `${shortBlockName(block.blockId)} +${block.count}`)
    .join(' / ');
  const parts = [
    blockLabel,
    reward.heal > 0 ? `HP +${reward.heal}` : '',
    reward.hunger > 0 ? `満腹 +${reward.hunger}` : '',
    reward.shieldMs > 0 ? `安全 +${Math.round(reward.shieldMs / 1000)}s` : '',
    reward.rocketReady ? 'ロケット即応' : '',
    reward.buildFocusMs > 0 ? `高速建築 +${Math.round(reward.buildFocusMs / 1000)}s` : '',
  ].filter(Boolean);

  return parts.join(' / ');
}

export function formatStageModeReward(rule: StageModeRule): string {
  return formatStageModeRewardDetail(rule.reward);
}
