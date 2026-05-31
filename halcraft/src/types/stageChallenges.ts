// ステージ別チャレンジ定義
// 各マップに「もう一回遊びたくなる」3つの達成目標を持たせる

import { BLOCK_IDS, type BlockId } from './blocks';

export type StageChallengeMetric =
  | 'blocks_placed'
  | 'blocks_broken'
  | 'ores_mined'
  | 'enemies_defeated'
  | 'boss_defeated'
  | 'machine_gun_hits'
  | 'rocket_hits'
  | 'lightsaber_hits'
  | 'vehicle_hits'
  | 'detonations'
  | 'block_group_placed';

export type StageChallengeMedal = 'none' | 'bronze' | 'silver' | 'gold';

export interface StageChallengeDefinition {
  id: string;
  icon: string;
  title: string;
  description: string;
  metric: StageChallengeMetric;
  target: number;
  accent: string;
  blockIds?: BlockId[];
}

export interface StageChallengeStats {
  blocksPlaced: number;
  blocksBroken: number;
  oresMined: number;
  enemiesDefeated: number;
  bossDefeated: number;
  machineGunHits: number;
  rocketHits: number;
  lightsaberHits: number;
  vehicleHits: number;
  detonations: number;
  placedBlockCounts: Partial<Record<BlockId, number>>;
}

export interface StageChallengeProgress {
  current: number;
  target: number;
  ratio: number;
  completed: boolean;
}

export const EMPTY_STAGE_CHALLENGE_STATS: StageChallengeStats = {
  blocksPlaced: 0,
  blocksBroken: 0,
  oresMined: 0,
  enemiesDefeated: 0,
  bossDefeated: 0,
  machineGunHits: 0,
  rocketHits: 0,
  lightsaberHits: 0,
  vehicleHits: 0,
  detonations: 0,
  placedBlockCounts: {},
};

const LIGHT_BLOCKS: BlockId[] = [
  BLOCK_IDS.TORCH,
  BLOCK_IDS.CANDLE,
  BLOCK_IDS.CAMPFIRE,
  BLOCK_IDS.GLOWSTONE,
  BLOCK_IDS.ELECTRIC,
];

const RAIL_BLOCKS: BlockId[] = [
  BLOCK_IDS.RAIL,
  BLOCK_IDS.RAIL_SLOPE,
  BLOCK_IDS.RAIL_BOOSTER,
  BLOCK_IDS.RAIL_LOOP,
  BLOCK_IDS.RAIL_CHAIN,
];

const DEFENSE_BLOCKS: BlockId[] = [
  BLOCK_IDS.TURRET,
  BLOCK_IDS.TORCH,
  BLOCK_IDS.CAMPFIRE,
  BLOCK_IDS.STONE,
  BLOCK_IDS.TNT,
];

export const STAGE_CHALLENGES: Record<string, StageChallengeDefinition[]> = {
  'build-forest': [
    {
      id: 'forest-builder',
      icon: '🪵',
      title: '森をひらく',
      description: '森の制作広場に40ブロック以上置く',
      metric: 'blocks_placed',
      target: 40,
      accent: '#9bdcff',
    },
    {
      id: 'forest-lights',
      icon: '🔥',
      title: 'あかりの小道',
      description: '松明や焚き火を10個置く',
      metric: 'block_group_placed',
      target: 10,
      accent: '#ffd37a',
      blockIds: LIGHT_BLOCKS,
    },
    {
      id: 'forest-coaster',
      icon: '🎢',
      title: '森のコースター',
      description: 'レール系ブロックを12個置く',
      metric: 'block_group_placed',
      target: 12,
      accent: '#c8e6c9',
      blockIds: RAIL_BLOCKS,
    },
  ],
  'build-tropical': [
    {
      id: 'tropical-builder',
      icon: '🌴',
      title: '島を広げる',
      description: '南国に45ブロック以上置く',
      metric: 'blocks_placed',
      target: 45,
      accent: '#ffcf7a',
    },
    {
      id: 'tropical-water-glass',
      icon: '🌊',
      title: '水辺リゾート',
      description: '水とガラスを18個置く',
      metric: 'block_group_placed',
      target: 18,
      accent: '#80deea',
      blockIds: [BLOCK_IDS.WATER, BLOCK_IDS.GLASS],
    },
    {
      id: 'tropical-lights',
      icon: '✨',
      title: '夜でも映える島',
      description: '光る飾りを8個置く',
      metric: 'block_group_placed',
      target: 8,
      accent: '#fff176',
      blockIds: LIGHT_BLOCKS,
    },
  ],
  'build-snow': [
    {
      id: 'snow-builder',
      icon: '❄️',
      title: '雪の王国づくり',
      description: '雪原に45ブロック以上置く',
      metric: 'blocks_placed',
      target: 45,
      accent: '#bbdefb',
    },
    {
      id: 'snow-castle',
      icon: '🏰',
      title: '氷の城壁',
      description: '雪・ガラス・光る石を24個置く',
      metric: 'block_group_placed',
      target: 24,
      accent: '#e1f5fe',
      blockIds: [BLOCK_IDS.SNOW, BLOCK_IDS.GLASS, BLOCK_IDS.GLOWSTONE],
    },
    {
      id: 'snow-beacon',
      icon: '💡',
      title: '吹雪の目印',
      description: '光るブロックを8個置く',
      metric: 'block_group_placed',
      target: 8,
      accent: '#fff59d',
      blockIds: LIGHT_BLOCKS,
    },
  ],
  'build-desert': [
    {
      id: 'desert-builder',
      icon: '🏜️',
      title: '砂漠の大工事',
      description: '砂漠に50ブロック以上置く',
      metric: 'blocks_placed',
      target: 50,
      accent: '#ffe082',
    },
    {
      id: 'desert-pyramid',
      icon: '🔺',
      title: 'ピラミッドの土台',
      description: '砂・石・階段を25個置く',
      metric: 'block_group_placed',
      target: 25,
      accent: '#ffcc80',
      blockIds: [BLOCK_IDS.SAND, BLOCK_IDS.STONE, BLOCK_IDS.STAIRS],
    },
    {
      id: 'desert-oasis',
      icon: '💧',
      title: 'オアシス完成',
      description: '水と光を8個置く',
      metric: 'block_group_placed',
      target: 8,
      accent: '#80deea',
      blockIds: [BLOCK_IDS.WATER, ...LIGHT_BLOCKS],
    },
  ],
  'war-forest': [
    {
      id: 'forest-defense-kills',
      icon: '⚔️',
      title: '森の防衛線',
      description: '敵を25体たおす',
      metric: 'enemies_defeated',
      target: 25,
      accent: '#ffb36d',
    },
    {
      id: 'forest-defense-build',
      icon: '🛡️',
      title: '守りを固める',
      description: '防衛ブロックを8個置く',
      metric: 'block_group_placed',
      target: 8,
      accent: '#dce775',
      blockIds: DEFENSE_BLOCKS,
    },
    {
      id: 'forest-boss',
      icon: '👑',
      title: '森のボス撃破',
      description: '出現した巨大ボスをたおす',
      metric: 'boss_defeated',
      target: 1,
      accent: '#ffdd66',
    },
  ],
  'war-tropical': [
    {
      id: 'tropical-rush-kills',
      icon: '🌴',
      title: '強襲を止める',
      description: '敵を35体たおす',
      metric: 'enemies_defeated',
      target: 35,
      accent: '#ffb36d',
    },
    {
      id: 'tropical-machine-gun',
      icon: '🔫',
      title: '機関銃で押し返す',
      description: '機関銃を18回命中させる',
      metric: 'machine_gun_hits',
      target: 18,
      accent: '#ffe28a',
    },
    {
      id: 'tropical-blast',
      icon: '💥',
      title: 'TNT一掃',
      description: 'TNTや爆発を2回使う',
      metric: 'detonations',
      target: 2,
      accent: '#ff9a66',
    },
  ],
  'war-snow': [
    {
      id: 'snow-front-kills',
      icon: '❄️',
      title: '極寒前線',
      description: '敵を20体たおす',
      metric: 'enemies_defeated',
      target: 20,
      accent: '#bbdefb',
    },
    {
      id: 'snow-fortify',
      icon: '🧊',
      title: '凍った防壁',
      description: '雪・ガラス・光を10個置く',
      metric: 'block_group_placed',
      target: 10,
      accent: '#e1f5fe',
      blockIds: [BLOCK_IDS.SNOW, BLOCK_IDS.GLASS, BLOCK_IDS.GLOWSTONE, BLOCK_IDS.TORCH],
    },
    {
      id: 'snow-saber',
      icon: '⚔️',
      title: '白い戦場の剣',
      description: 'ライトセイバーを8回命中させる',
      metric: 'lightsaber_hits',
      target: 8,
      accent: '#c8b0ff',
    },
  ],
  'war-desert': [
    {
      id: 'desert-showdown-kills',
      icon: '🏜️',
      title: '砂漠決戦',
      description: '敵を30体たおす',
      metric: 'enemies_defeated',
      target: 30,
      accent: '#ffcc80',
    },
    {
      id: 'desert-rockets',
      icon: '🛞',
      title: '乗り物火力制圧',
      description: '戦車や飛行機で8回命中させる',
      metric: 'vehicle_hits',
      target: 8,
      accent: '#ffc06d',
    },
    {
      id: 'desert-traps',
      icon: '🧨',
      title: '砂漠の罠',
      description: 'TNTや電気を6個置く',
      metric: 'block_group_placed',
      target: 6,
      accent: '#ff8a65',
      blockIds: [BLOCK_IDS.TNT, BLOCK_IDS.ELECTRIC],
    },
  ],
};

export function getStageChallenges(stageId: string | null | undefined): StageChallengeDefinition[] {
  if (!stageId) return [];
  return STAGE_CHALLENGES[stageId] ?? [];
}

export function getStageChallengeProgress(
  challenge: StageChallengeDefinition,
  stats: StageChallengeStats,
): StageChallengeProgress {
  let current = 0;

  switch (challenge.metric) {
    case 'blocks_placed':
      current = stats.blocksPlaced;
      break;
    case 'blocks_broken':
      current = stats.blocksBroken;
      break;
    case 'ores_mined':
      current = stats.oresMined;
      break;
    case 'enemies_defeated':
      current = stats.enemiesDefeated;
      break;
    case 'boss_defeated':
      current = stats.bossDefeated;
      break;
    case 'machine_gun_hits':
      current = stats.machineGunHits;
      break;
    case 'rocket_hits':
      current = stats.rocketHits;
      break;
    case 'lightsaber_hits':
      current = stats.lightsaberHits;
      break;
    case 'vehicle_hits':
      current = stats.vehicleHits;
      break;
    case 'detonations':
      current = stats.detonations;
      break;
    case 'block_group_placed':
      current = (challenge.blockIds ?? []).reduce<number>(
        (sum, blockId) => sum + (stats.placedBlockCounts[blockId] ?? 0),
        0,
      );
      break;
  }

  const target = Math.max(1, challenge.target);
  const ratio = Math.max(0, Math.min(1, current / target));
  return {
    current,
    target,
    ratio,
    completed: current >= target,
  };
}

export function getCompletedStageChallenges(
  stageId: string | null | undefined,
  stats: StageChallengeStats,
): string[] {
  return getStageChallenges(stageId)
    .filter((challenge) => getStageChallengeProgress(challenge, stats).completed)
    .map((challenge) => challenge.id);
}

export function getStageChallengeMedal(
  completedCount: number,
  totalCount: number,
): StageChallengeMedal {
  if (completedCount <= 0 || totalCount <= 0) return 'none';
  if (completedCount >= totalCount) return 'gold';
  if (completedCount >= Math.max(2, totalCount - 1)) return 'silver';
  return 'bronze';
}

export function getStageChallengeMedalLabel(medal: StageChallengeMedal): string {
  switch (medal) {
    case 'gold':
      return 'GOLD';
    case 'silver':
      return 'SILVER';
    case 'bronze':
      return 'BRONZE';
    case 'none':
      return '未達成';
  }
}
