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

interface BlockPurposeDefinition {
  icon: string;
  eyebrow: string;
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

const BLOCK_PURPOSES: Partial<Record<BlockId, BlockPurposeDefinition>> = {
  [BLOCK_IDS.GRASS]: {
    icon: '🌱',
    eyebrow: '地面づくり',
    detail: '自然な床や丘を広げられる',
    accent: '#8ddf6a',
    glow: 'rgba(120, 220, 100, 0.3)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.DIRT]: {
    icon: '🟫',
    eyebrow: '土台づくり',
    detail: '地形の穴埋めや仮足場に使える',
    accent: '#c08a55',
    glow: 'rgba(170, 105, 52, 0.28)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.WOOD]: {
    icon: '🪵',
    eyebrow: '建材配置',
    detail: '壁・床・橋をすばやく組める',
    accent: '#d6a15f',
    glow: 'rgba(214, 150, 84, 0.3)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.RAW_WOOD]: {
    icon: '🌳',
    eyebrow: '柱づくり',
    detail: '木の柱や森らしい骨組みに使える',
    accent: '#b77942',
    glow: 'rgba(170, 110, 54, 0.3)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.IRON]: {
    icon: '⬜',
    eyebrow: '要塞建材',
    detail: '硬い壁や基地の外装に向く',
    accent: '#dbe4ee',
    glow: 'rgba(210, 226, 238, 0.26)',
    kind: 'defense',
    soundKind: 'defense',
  },
  [BLOCK_IDS.IRON_CRACKED]: {
    icon: '◻️',
    eyebrow: '古い要塞材',
    detail: '壊れた基地や遺跡の表情を作れる',
    accent: '#bfc8d3',
    glow: 'rgba(190, 202, 214, 0.24)',
    kind: 'defense',
    soundKind: 'defense',
  },
  [BLOCK_IDS.IRON_MOSSY]: {
    icon: '🟩',
    eyebrow: '苔むした外装',
    detail: '古い建物や森の廃墟に合う',
    accent: '#98c48d',
    glow: 'rgba(140, 190, 120, 0.26)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.BEDROCK]: {
    icon: '⬛',
    eyebrow: '最硬土台',
    detail: '絶対に崩したくない境界を作る',
    accent: '#9aa0aa',
    glow: 'rgba(150, 156, 168, 0.22)',
    kind: 'defense',
    soundKind: 'defense',
  },
  [BLOCK_IDS.GLASS]: {
    icon: '🔷',
    eyebrow: '透明建材',
    detail: '展望台や窓で景色を見せられる',
    accent: '#9fe8ff',
    glow: 'rgba(130, 220, 255, 0.3)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.ENCHANT]: {
    icon: '🔮',
    eyebrow: '魔法装置',
    detail: '拠点の中心や特別な部屋を演出する',
    accent: '#b388ff',
    glow: 'rgba(160, 100, 255, 0.34)',
    kind: 'utility',
    soundKind: 'condition',
  },
  [BLOCK_IDS.STAIRS]: {
    icon: '↗️',
    eyebrow: '段差づくり',
    detail: '入口・屋根・登れる道を整えられる',
    accent: '#d2b48c',
    glow: 'rgba(190, 150, 104, 0.28)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.BED]: {
    icon: '🛏️',
    eyebrow: '休憩ポイント',
    detail: '右クリックで休憩してHPと朝を整えられる',
    accent: '#ff9fb3',
    glow: 'rgba(255, 130, 160, 0.3)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.LEAVES]: {
    icon: '🍃',
    eyebrow: '緑の飾り',
    detail: '木陰・庭・森の輪郭を作れる',
    accent: '#9ee66c',
    glow: 'rgba(120, 220, 110, 0.3)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.CORE]: {
    icon: '💠',
    eyebrow: '拠点コア',
    detail: '基地や作品の中心マーカーになる',
    accent: '#80cbc4',
    glow: 'rgba(100, 210, 200, 0.3)',
    kind: 'utility',
    soundKind: 'condition',
  },
  [BLOCK_IDS.DOOR]: {
    icon: '🚪',
    eyebrow: '入口づくり',
    detail: '右クリックで開閉できる入口を作る',
    accent: '#d49a59',
    glow: 'rgba(200, 130, 70, 0.3)',
    kind: 'utility',
    soundKind: 'switch',
  },
  [BLOCK_IDS.LADDER]: {
    icon: '🪜',
    eyebrow: '縦移動',
    detail: '塔や地下への上り下りを作れる',
    accent: '#c8955d',
    glow: 'rgba(190, 130, 75, 0.28)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.SNOW]: {
    icon: '❄️',
    eyebrow: '雪景色づくり',
    detail: '白い屋根・城・雪原の形を作れる',
    accent: '#d8f6ff',
    glow: 'rgba(185, 230, 255, 0.3)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.SAND]: {
    icon: '🏜️',
    eyebrow: '砂地づくり',
    detail: '砂漠の土台や大きな斜面を作れる',
    accent: '#ffd27a',
    glow: 'rgba(255, 202, 110, 0.3)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.STONE]: {
    icon: '🪨',
    eyebrow: '石の足場',
    detail: '戦場の遮蔽や建物の基礎に使える',
    accent: '#b9c0c8',
    glow: 'rgba(170, 178, 188, 0.26)',
    kind: 'defense',
    soundKind: 'defense',
  },
  [BLOCK_IDS.COAL_ORE]: {
    icon: '⚫',
    eyebrow: '鉱石配置',
    detail: '採掘場や洞窟の資源感を出せる',
    accent: '#8f969c',
    glow: 'rgba(130, 136, 144, 0.24)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.IRON_ORE]: {
    icon: '⛏️',
    eyebrow: '鉱脈配置',
    detail: '採掘目標や洞窟の見どころになる',
    accent: '#d0d7df',
    glow: 'rgba(190, 200, 210, 0.26)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.GOLD_ORE]: {
    icon: '🟡',
    eyebrow: '宝鉱石',
    detail: '宝物部屋や目立つ報酬地点に使える',
    accent: '#ffd96a',
    glow: 'rgba(255, 210, 90, 0.3)',
    kind: 'utility',
    soundKind: 'condition',
  },
  [BLOCK_IDS.DIAMOND_ORE]: {
    icon: '💎',
    eyebrow: 'レア鉱石',
    detail: '一番見つけたい場所の目印になる',
    accent: '#80ffff',
    glow: 'rgba(100, 240, 255, 0.3)',
    kind: 'condition',
    soundKind: 'condition',
  },
  [BLOCK_IDS.CHEST]: {
    icon: '📦',
    eyebrow: '保管ポイント',
    detail: '右クリックでマップ補給を開けられる',
    accent: '#d79b52',
    glow: 'rgba(210, 145, 70, 0.28)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.FURNACE]: {
    icon: '🔥',
    eyebrow: '作業設備',
    detail: '右クリックで鉱石を一括精錬できる',
    accent: '#ffad66',
    glow: 'rgba(255, 150, 80, 0.3)',
    kind: 'utility',
    soundKind: 'light',
  },
  [BLOCK_IDS.IRON_INGOT]: {
    icon: '🔩',
    eyebrow: '素材配置',
    detail: '工房や宝箱まわりの素材表現に使える',
    accent: '#d5dde8',
    glow: 'rgba(200, 210, 225, 0.24)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.GOLD_INGOT]: {
    icon: '🏅',
    eyebrow: '宝素材',
    detail: '報酬部屋やゴール地点を明るくする',
    accent: '#ffd166',
    glow: 'rgba(255, 200, 90, 0.3)',
    kind: 'condition',
    soundKind: 'condition',
  },
  [BLOCK_IDS.DIAMOND_GEM]: {
    icon: '💎',
    eyebrow: '宝石素材',
    detail: '特別な報酬や王座の飾りに使える',
    accent: '#76f7ff',
    glow: 'rgba(90, 230, 255, 0.32)',
    kind: 'condition',
    soundKind: 'condition',
  },
  [BLOCK_IDS.STICK]: {
    icon: '🪵',
    eyebrow: '小物素材',
    detail: '柵・支柱・細かい飾りの代わりになる',
    accent: '#c58b55',
    glow: 'rgba(190, 125, 70, 0.24)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.WHEAT_SEEDS]: {
    icon: '🌾',
    eyebrow: '畑の種',
    detail: '畑や村の暮らしを表現できる',
    accent: '#d6e86e',
    glow: 'rgba(200, 220, 90, 0.28)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.FARMLAND]: {
    icon: '🚜',
    eyebrow: '畑づくり',
    detail: '村や拠点の食料エリアを作れる',
    accent: '#a87948',
    glow: 'rgba(150, 100, 55, 0.26)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.NETHERRACK]: {
    icon: '🌋',
    eyebrow: '異世界地形',
    detail: '危険な洞窟やボス部屋の雰囲気を作る',
    accent: '#ff6f61',
    glow: 'rgba(255, 90, 70, 0.3)',
    kind: 'explosive',
    soundKind: 'utility',
  },
  [BLOCK_IDS.SOUL_SAND]: {
    icon: '🕳️',
    eyebrow: '不気味な床',
    detail: '暗い通路や罠っぽい地形を作れる',
    accent: '#9b7aa0',
    glow: 'rgba(140, 100, 150, 0.28)',
    kind: 'utility',
    soundKind: 'utility',
  },
  [BLOCK_IDS.NETHER_PORTAL]: {
    icon: '🌀',
    eyebrow: 'ポータル演出',
    detail: '触れるか右クリックで別世界へ移動できる',
    accent: '#9c6bff',
    glow: 'rgba(130, 80, 255, 0.34)',
    kind: 'condition',
    soundKind: 'condition',
  },
};

function createPurposeFeedback(blockId: BlockId): BlockUseFeedbackContent | null {
  const purpose = BLOCK_PURPOSES[blockId];
  if (!purpose) return null;
  return {
    icon: purpose.icon,
    eyebrow: purpose.eyebrow,
    title: BLOCK_DEFS[blockId]?.name ?? 'ブロック',
    detail: purpose.detail,
    accent: purpose.accent,
    glow: purpose.glow,
    kind: purpose.kind,
    soundKind: purpose.soundKind,
  };
}

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
  return BLOCK_PURPOSES[blockId]?.detail ?? '置くと1個消費';
}

export function getBlockUseProfile(
  blockId: BlockId,
  stageId?: string | null,
): BlockUseFeedbackContent {
  return getConditionFeedback(blockId, stageId)
    ?? getBlockUseFeedback(blockId, stageId)
    ?? {
      icon: '⬛',
      eyebrow: 'ブロック配置',
      title: BLOCK_DEFS[blockId]?.name ?? 'ブロック',
      detail: '置くと1個消費',
      accent: '#d7dee8',
      glow: 'rgba(210, 220, 235, 0.24)',
      kind: 'utility',
      soundKind: 'utility',
    };
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

  return getConditionFeedback(blockId, stageId) ?? createPurposeFeedback(blockId);
}
