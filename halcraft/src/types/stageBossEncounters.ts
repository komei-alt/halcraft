// 戦争マップごとのボス戦定義
// ボスの性格・弱点・報酬を同じ定義からAI、演出、結果画面へ渡す

import { BLOCK_DEFS, BLOCK_IDS, type BlockId } from './blocks';

export type StageBossEncounterId =
  | 'forest_guardian'
  | 'tropical_swarm_king'
  | 'snow_colossus'
  | 'desert_warlord';

export type StageBossSummonType = 'zombie' | 'spider' | 'darwin';

export interface StageBossRewardBlock {
  blockId: BlockId;
  count: number;
}

export interface StageBossEncounter {
  id: StageBossEncounterId;
  stageId: string;
  icon: string;
  title: string;
  shortLabel: string;
  detail: string;
  weakness: string;
  rewardLabel: string;
  accent: string;
  hpMultiplier: number;
  speedMultiplier: number;
  attackMultiplier: number;
  xpMultiplier: number;
  summonType: StageBossSummonType;
  summonLabel: string;
  summonMinSeconds: number;
  summonMaxSeconds: number;
  rewardBlocks: StageBossRewardBlock[];
}

export const STAGE_BOSS_ENCOUNTERS: Record<StageBossEncounterId, StageBossEncounter> = {
  forest_guardian: {
    id: 'forest_guardian',
    stageId: 'war-forest',
    icon: '🌲',
    title: '森の番人',
    shortLabel: '防衛線を崩す巨人',
    detail: '硬いゾンビを呼びながら、守りのブロックへじわじわ近づく。',
    weakness: 'タレットと松明のラインで足止めする',
    rewardLabel: '防衛素材の大補給',
    accent: '#dce775',
    hpMultiplier: 0.95,
    speedMultiplier: 0.92,
    attackMultiplier: 0.95,
    xpMultiplier: 1.08,
    summonType: 'zombie',
    summonLabel: '森の歩兵を召喚',
    summonMinSeconds: 7,
    summonMaxSeconds: 18,
    rewardBlocks: [
      { blockId: BLOCK_IDS.TURRET, count: 2 },
      { blockId: BLOCK_IDS.TORCH, count: 16 },
      { blockId: BLOCK_IDS.WOOD, count: 24 },
    ],
  },
  tropical_swarm_king: {
    id: 'tropical_swarm_king',
    stageId: 'war-tropical',
    icon: '🌴',
    title: '密林の群れ王',
    shortLabel: '高速ラッシュの主',
    detail: '軽くて速いクモを呼び、近距離の混戦を作ってくる。',
    weakness: '機関銃とTNTで近づかれる前に数を減らす',
    rewardLabel: '強襲素材の補給',
    accent: '#ffe28a',
    hpMultiplier: 0.82,
    speedMultiplier: 1.12,
    attackMultiplier: 1,
    xpMultiplier: 1.18,
    summonType: 'spider',
    summonLabel: '跳ねグモを召喚',
    summonMinSeconds: 4,
    summonMaxSeconds: 11,
    rewardBlocks: [
      { blockId: BLOCK_IDS.TNT, count: 8 },
      { blockId: BLOCK_IDS.WATER, count: 12 },
      { blockId: BLOCK_IDS.CAMPFIRE, count: 2 },
    ],
  },
  snow_colossus: {
    id: 'snow_colossus',
    stageId: 'war-snow',
    icon: '❄️',
    title: '氷壁の巨像',
    shortLabel: '重装の持久ボス',
    detail: 'とても硬く遅い。重装ダーウィンを呼び、白い視界で圧をかける。',
    weakness: '光る目印を置き、ライトセイバーで確実に削る',
    rewardLabel: '持久戦の光る補給',
    accent: '#c8b0ff',
    hpMultiplier: 1.22,
    speedMultiplier: 0.78,
    attackMultiplier: 1.08,
    xpMultiplier: 1.25,
    summonType: 'darwin',
    summonLabel: '重装ダーウィンを召喚',
    summonMinSeconds: 8,
    summonMaxSeconds: 20,
    rewardBlocks: [
      { blockId: BLOCK_IDS.GLOWSTONE, count: 8 },
      { blockId: BLOCK_IDS.SNOW, count: 32 },
      { blockId: BLOCK_IDS.GLASS, count: 16 },
    ],
  },
  desert_warlord: {
    id: 'desert_warlord',
    stageId: 'war-desert',
    icon: '🏜️',
    title: '砂嵐の将軍',
    shortLabel: '高火力の決戦ボス',
    detail: '攻撃が重く、砂嵐隊長を呼ぶ。開けた地形で距離を取るほど戦いやすい。',
    weakness: 'ロケットとTNTで遠距離から削る',
    rewardLabel: '爆風素材の大補給',
    accent: '#ffc06d',
    hpMultiplier: 1.08,
    speedMultiplier: 0.98,
    attackMultiplier: 1.22,
    xpMultiplier: 1.2,
    summonType: 'darwin',
    summonLabel: '砂嵐隊長を召喚',
    summonMinSeconds: 6,
    summonMaxSeconds: 15,
    rewardBlocks: [
      { blockId: BLOCK_IDS.TNT, count: 10 },
      { blockId: BLOCK_IDS.ELECTRIC, count: 6 },
      { blockId: BLOCK_IDS.SAND, count: 32 },
    ],
  },
};

const BOSS_BY_STAGE_ID = Object.fromEntries(
  Object.values(STAGE_BOSS_ENCOUNTERS).map((encounter) => [encounter.stageId, encounter]),
) as Record<string, StageBossEncounter>;

function getShortBlockName(blockId: BlockId): string {
  return (BLOCK_DEFS[blockId]?.name ?? `ID${blockId}`)
    .replace('ブロック', '')
    .replace('草付き土', '草')
    .replace('生の木', '原木')
    .replace('グロウストーン', '光る石')
    .replace('電気の', '電気');
}

export function getStageBossEncounter(stageId: string | null | undefined): StageBossEncounter | null {
  if (!stageId) return null;
  return BOSS_BY_STAGE_ID[stageId] ?? null;
}

export function getStageBossEncounterById(id: StageBossEncounterId | null | undefined): StageBossEncounter | null {
  if (!id) return null;
  return STAGE_BOSS_ENCOUNTERS[id] ?? null;
}

export function formatStageBossReward(encounter: StageBossEncounter): string {
  return encounter.rewardBlocks
    .map((reward) => `${getShortBlockName(reward.blockId)}x${reward.count}`)
    .join(' / ');
}
