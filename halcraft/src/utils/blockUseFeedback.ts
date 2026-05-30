// ブロック使用時の手触りをまとめる定義
// ホットバーのヒント、トースト、SE、3Dエフェクトで同じ意味づけを共有する

import { BLOCK_DEFS, BLOCK_IDS, type BlockId } from '../types/blocks';
import { getStageCondition } from '../types/stageConditions';

export type BlockUseFeedbackKind =
  | 'condition'
  | 'defense'
  | 'explosive'
  | 'light'
  | 'liquid'
  | 'rail'
  | 'summon'
  | 'switch'
  | 'utility';

export type BlockUseFeedbackSoundKind =
  | 'condition'
  | 'defense'
  | 'explosive'
  | 'light'
  | 'liquid'
  | 'rail'
  | 'summon'
  | 'switch'
  | 'utility';

export interface BlockUseFeedbackContext {
  detonatedCount?: number;
  spawnedIronGolem?: boolean;
}

export interface BlockUseFeedbackContent {
  icon: string;
  eyebrow: string;
  title: string;
  detail: string;
  accent: string;
  glow: string;
  kind: BlockUseFeedbackKind;
  soundKind: BlockUseFeedbackSoundKind;
}

const LIGHT_BLOCKS = new Set<BlockId>([
  BLOCK_IDS.TORCH,
  BLOCK_IDS.CANDLE,
  BLOCK_IDS.CAMPFIRE,
  BLOCK_IDS.GLOWSTONE,
  BLOCK_IDS.ELECTRIC,
]);

const RAIL_BLOCKS = new Set<BlockId>([
  BLOCK_IDS.RAIL,
  BLOCK_IDS.RAIL_SLOPE,
  BLOCK_IDS.RAIL_BOOSTER,
  BLOCK_IDS.RAIL_LOOP,
  BLOCK_IDS.RAIL_CHAIN,
]);

function getConditionHint(blockId: BlockId, stageId: string | null | undefined): string | null {
  const condition = getStageCondition(stageId);
  if (!condition) return null;
  if (condition.blockIds?.includes(blockId)) {
    return `${condition.title}ゲージ +1`;
  }
  if (condition.countsDetonations && (blockId === BLOCK_IDS.TNT || blockId === BLOCK_IDS.LEVER)) {
    return `${condition.title}は爆発で進む`;
  }
  return null;
}

function getConditionFeedback(blockId: BlockId, stageId: string | null | undefined): BlockUseFeedbackContent | null {
  const condition = getStageCondition(stageId);
  if (!condition?.blockIds?.includes(blockId)) return null;
  return {
    icon: condition.icon,
    eyebrow: 'マップ相性',
    title: `${condition.title} +1`,
    detail: `${condition.triggerLabel}で${condition.effect.label}`,
    accent: condition.accent,
    glow: `${condition.accent}44`,
    kind: 'condition',
    soundKind: 'condition',
  };
}

function getExplosionConditionDetail(stageId: string | null | undefined): string | null {
  const condition = getStageCondition(stageId);
  if (!condition?.countsDetonations) return null;
  return `${condition.title}ゲージも進む`;
}

export function getBlockUseHint(blockId: BlockId, stageId?: string | null): string {
  const conditionHint = getConditionHint(blockId, stageId);
  if (conditionHint) return conditionHint;

  if (blockId === BLOCK_IDS.TNT) return '右クリックで起爆 / レバーで連鎖';
  if (blockId === BLOCK_IDS.LEVER) return '隣のTNTを遠隔起爆';
  if (blockId === BLOCK_IDS.SPAWNER) return '置くとゴーレム召喚';
  if (blockId === BLOCK_IDS.TURRET) return '敵を自動射撃';
  if (LIGHT_BLOCKS.has(blockId)) return '暗い場所を照らす';
  if (RAIL_BLOCKS.has(blockId)) return 'コースター用レール';
  if (blockId === BLOCK_IDS.WATER || blockId === BLOCK_IDS.LAVA) return '流れる地形ブロック';
  return '置くと1個消費';
}

export function getBlockUseFeedback(
  blockId: BlockId,
  stageId?: string | null,
  context: BlockUseFeedbackContext = {},
): BlockUseFeedbackContent | null {
  const blockName = BLOCK_DEFS[blockId]?.name ?? 'ブロック';
  const explosionDetail = getExplosionConditionDetail(stageId);

  if (blockId === BLOCK_IDS.LEVER) {
    const count = context.detonatedCount ?? 0;
    return {
      icon: '⚡',
      eyebrow: count > 0 ? '起爆成功' : '起爆装置',
      title: count > 0 ? `TNT ${count}個を起爆` : 'レバー設置',
      detail: count > 0
        ? (explosionDetail ?? '隣のTNTをまとめて爆発させた')
        : '隣にTNTを置くと遠隔起爆できる',
      accent: '#ffd166',
      glow: 'rgba(255, 209, 102, 0.35)',
      kind: 'switch',
      soundKind: count > 0 ? 'explosive' : 'switch',
    };
  }

  if (blockId === BLOCK_IDS.TNT) {
    const count = context.detonatedCount ?? 0;
    return {
      icon: '💥',
      eyebrow: count > 0 ? '爆発発動' : '爆薬設置',
      title: count > 0 ? 'TNT起爆' : 'TNT設置',
      detail: count > 0
        ? (explosionDetail ?? '周囲のブロックと敵に大ダメージ')
        : '右クリックかレバーで起爆できる',
      accent: '#ff7a45',
      glow: 'rgba(255, 112, 67, 0.38)',
      kind: 'explosive',
      soundKind: count > 0 ? 'explosive' : 'utility',
    };
  }

  if (blockId === BLOCK_IDS.SPAWNER) {
    return {
      icon: '🛡️',
      eyebrow: '味方召喚',
      title: context.spawnedIronGolem ? 'ゴーレム出撃' : 'スポナー設置',
      detail: 'アイアンゴーレムが近くの敵を迎撃する',
      accent: '#ff9f6e',
      glow: 'rgba(255, 120, 80, 0.35)',
      kind: 'summon',
      soundKind: 'summon',
    };
  }

  if (blockId === BLOCK_IDS.TURRET) {
    return {
      icon: '🎯',
      eyebrow: '自動防衛',
      title: 'タレット展開',
      detail: '近づく敵を自動で狙う防衛ポイント',
      accent: '#ff6b8a',
      glow: 'rgba(255, 90, 120, 0.34)',
      kind: 'defense',
      soundKind: 'defense',
    };
  }

  if (LIGHT_BLOCKS.has(blockId)) {
    return {
      icon: blockId === BLOCK_IDS.CAMPFIRE ? '🔥' : '✨',
      eyebrow: '明かり配置',
      title: blockName,
      detail: getConditionHint(blockId, stageId) ?? '周囲を照らして目印になる',
      accent: '#ffe082',
      glow: 'rgba(255, 214, 120, 0.36)',
      kind: 'light',
      soundKind: 'light',
    };
  }

  if (RAIL_BLOCKS.has(blockId)) {
    return {
      icon: '🎢',
      eyebrow: 'レール部品',
      title: blockName,
      detail: blockId === BLOCK_IDS.RAIL_BOOSTER
        ? 'カートを加速するポイント'
        : blockId === BLOCK_IDS.RAIL_CHAIN
          ? '上り坂でカートを引き上げる'
          : 'コースターの走行ルートを伸ばす',
      accent: '#80deea',
      glow: 'rgba(128, 222, 234, 0.32)',
      kind: 'rail',
      soundKind: 'rail',
    };
  }

  if (blockId === BLOCK_IDS.WATER || blockId === BLOCK_IDS.LAVA) {
    const isWater = blockId === BLOCK_IDS.WATER;
    return {
      icon: isWater ? '🌊' : '🌋',
      eyebrow: isWater ? '水流配置' : '危険地形',
      title: blockName,
      detail: getConditionHint(blockId, stageId) ?? (isWater ? '水辺や逃げ道を作れる' : '触れると大ダメージの罠になる'),
      accent: isWater ? '#7ddcff' : '#ff8a3d',
      glow: isWater ? 'rgba(98, 210, 255, 0.32)' : 'rgba(255, 100, 40, 0.36)',
      kind: 'liquid',
      soundKind: 'liquid',
    };
  }

  return getConditionFeedback(blockId, stageId);
}
