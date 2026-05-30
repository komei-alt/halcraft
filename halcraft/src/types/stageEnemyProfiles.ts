// 戦争マップごとの敵編成プロファイル
// 湧き方だけでなく、敵の硬さ・速さ・攻撃・報酬・見た目をマップごとに変える

import { BLOCK_IDS, type BlockId } from './blocks';

export type StageEnemyProfileId =
  | 'forest_siege'
  | 'tropical_swarm'
  | 'snow_armored'
  | 'desert_raiders';

export type StageEnemyRole = 'zombie' | 'spider' | 'darwin';

export interface StageEnemyRoleModifier {
  hpMultiplier: number;
  speedMultiplier: number;
  attackMultiplier: number;
  xpMultiplier: number;
  dropBlockId: BlockId;
  dropChance: number;
  roleLabel: string;
}

export interface StageEnemyProfile {
  id: StageEnemyProfileId;
  stageId: string;
  icon: string;
  title: string;
  shortLabel: string;
  detail: string;
  accent: string;
  roleFocus: string;
  modifiers: Record<StageEnemyRole, StageEnemyRoleModifier>;
}

export const DEFAULT_STAGE_ENEMY_MODIFIER: StageEnemyRoleModifier = {
  hpMultiplier: 1,
  speedMultiplier: 1,
  attackMultiplier: 1,
  xpMultiplier: 1,
  dropBlockId: BLOCK_IDS.IRON,
  dropChance: 0.05,
  roleLabel: '標準',
};

export const STAGE_ENEMY_PROFILES: Record<StageEnemyProfileId, StageEnemyProfile> = {
  forest_siege: {
    id: 'forest_siege',
    stageId: 'war-forest',
    icon: '🌲',
    title: '木陰の包囲',
    shortLabel: '守り崩し',
    detail: '足は少し遅いが粘る敵が多く、灯りと防衛線を押し込んでくる。',
    accent: '#dce775',
    roleFocus: 'ゾンビ:硬め / クモ:控えめ / ダーウィン:標準',
    modifiers: {
      zombie: {
        hpMultiplier: 1.15,
        speedMultiplier: 0.94,
        attackMultiplier: 1,
        xpMultiplier: 1.04,
        dropBlockId: BLOCK_IDS.WOOD,
        dropChance: 0.12,
        roleLabel: '森の歩兵',
      },
      spider: {
        hpMultiplier: 1,
        speedMultiplier: 0.92,
        attackMultiplier: 0.96,
        xpMultiplier: 1,
        dropBlockId: BLOCK_IDS.TORCH,
        dropChance: 0.1,
        roleLabel: '木陰グモ',
      },
      darwin: {
        hpMultiplier: 1.08,
        speedMultiplier: 0.96,
        attackMultiplier: 1.04,
        xpMultiplier: 1.08,
        dropBlockId: BLOCK_IDS.TURRET,
        dropChance: 0.08,
        roleLabel: '森の隊長',
      },
    },
  },
  tropical_swarm: {
    id: 'tropical_swarm',
    stageId: 'war-tropical',
    icon: '🌴',
    title: '密林ラッシュ',
    shortLabel: '高速群れ',
    detail: '軽い敵が近距離から多く来る。機関銃で押し返すほどXPが伸びる。',
    accent: '#ffe28a',
    roleFocus: 'ゾンビ:速め / クモ:高速 / ダーウィン:数で圧力',
    modifiers: {
      zombie: {
        hpMultiplier: 0.9,
        speedMultiplier: 1.12,
        attackMultiplier: 1,
        xpMultiplier: 1.08,
        dropBlockId: BLOCK_IDS.WOOD,
        dropChance: 0.1,
        roleLabel: '密林ランナー',
      },
      spider: {
        hpMultiplier: 0.85,
        speedMultiplier: 1.2,
        attackMultiplier: 1.05,
        xpMultiplier: 1.12,
        dropBlockId: BLOCK_IDS.CAMPFIRE,
        dropChance: 0.08,
        roleLabel: '跳ねグモ',
      },
      darwin: {
        hpMultiplier: 0.96,
        speedMultiplier: 1.08,
        attackMultiplier: 1.08,
        xpMultiplier: 1.16,
        dropBlockId: BLOCK_IDS.TNT,
        dropChance: 0.1,
        roleLabel: '強襲隊長',
      },
    },
  },
  snow_armored: {
    id: 'snow_armored',
    stageId: 'war-snow',
    icon: '❄️',
    title: '凍結重装',
    shortLabel: '硬い前線',
    detail: '敵は遅いが硬く、近接で仕留めると光る素材を落としやすい。',
    accent: '#c8b0ff',
    roleFocus: 'ゾンビ:硬い / クモ:少数 / ダーウィン:重装',
    modifiers: {
      zombie: {
        hpMultiplier: 1.28,
        speedMultiplier: 0.82,
        attackMultiplier: 1.04,
        xpMultiplier: 1.12,
        dropBlockId: BLOCK_IDS.SNOW,
        dropChance: 0.14,
        roleLabel: '凍った歩兵',
      },
      spider: {
        hpMultiplier: 1.15,
        speedMultiplier: 0.9,
        attackMultiplier: 1,
        xpMultiplier: 1.08,
        dropBlockId: BLOCK_IDS.TORCH,
        dropChance: 0.1,
        roleLabel: '雪グモ',
      },
      darwin: {
        hpMultiplier: 1.35,
        speedMultiplier: 0.78,
        attackMultiplier: 1.12,
        xpMultiplier: 1.22,
        dropBlockId: BLOCK_IDS.GLOWSTONE,
        dropChance: 0.16,
        roleLabel: '重装ダーウィン',
      },
    },
  },
  desert_raiders: {
    id: 'desert_raiders',
    stageId: 'war-desert',
    icon: '🏜️',
    title: '砂嵐レイダー',
    shortLabel: '遠距離圧力',
    detail: '見通しの良い砂地に攻撃の強い敵が来る。爆発で倒すと補給が増えやすい。',
    accent: '#ffc06d',
    roleFocus: 'ゾンビ:標準 / クモ:回り込み / ダーウィン:高火力',
    modifiers: {
      zombie: {
        hpMultiplier: 1,
        speedMultiplier: 1.02,
        attackMultiplier: 1.1,
        xpMultiplier: 1.06,
        dropBlockId: BLOCK_IDS.SAND,
        dropChance: 0.1,
        roleLabel: '砂地の歩兵',
      },
      spider: {
        hpMultiplier: 0.95,
        speedMultiplier: 1.08,
        attackMultiplier: 1.12,
        xpMultiplier: 1.1,
        dropBlockId: BLOCK_IDS.ELECTRIC,
        dropChance: 0.09,
        roleLabel: '砂走りグモ',
      },
      darwin: {
        hpMultiplier: 1.16,
        speedMultiplier: 0.98,
        attackMultiplier: 1.18,
        xpMultiplier: 1.18,
        dropBlockId: BLOCK_IDS.TNT,
        dropChance: 0.16,
        roleLabel: '砂嵐隊長',
      },
    },
  },
};

const PROFILE_BY_STAGE_ID = Object.fromEntries(
  Object.values(STAGE_ENEMY_PROFILES).map((profile) => [profile.stageId, profile]),
) as Record<string, StageEnemyProfile>;

export function getStageEnemyProfile(stageId: string | null | undefined): StageEnemyProfile | null {
  if (!stageId) return null;
  return PROFILE_BY_STAGE_ID[stageId] ?? null;
}

export function getStageEnemyProfileById(profileId: StageEnemyProfileId | null | undefined): StageEnemyProfile | null {
  if (!profileId) return null;
  return STAGE_ENEMY_PROFILES[profileId] ?? null;
}

export function getStageEnemyModifier(
  profileId: StageEnemyProfileId | null | undefined,
  role: StageEnemyRole,
): StageEnemyRoleModifier {
  const profile = getStageEnemyProfileById(profileId);
  return profile?.modifiers[role] ?? DEFAULT_STAGE_ENEMY_MODIFIER;
}

export function getStageEnemyAccent(profileId: StageEnemyProfileId | null | undefined): string | undefined {
  return getStageEnemyProfileById(profileId)?.accent;
}

export function formatStageEnemyProfile(profile: StageEnemyProfile): string {
  return `${profile.shortLabel} / ${profile.roleFocus}`;
}
