// ステージランドマークの共通定義
// 地形生成、3D演出、HUDが同じ座標と役割説明を参照する

import type { StageDefinition } from './stages';

export interface StageWorldPosition {
  x: number;
  y?: number;
  z: number;
}

export interface StageLandmarkBriefing {
  name: string;
  shortRole: string;
  actionLabel: string;
  arrivalLabel: string;
  modeLabel: string;
}

// スポーン地点から約75m先に置き、谷越しに景観の主役として読める距離を確保する。
export const STAGE_LANDMARK_CENTER = Object.freeze({ x: -42, z: 62 });
export const STAGE_LANDMARK_WORLD_CENTER = Object.freeze({
  x: STAGE_LANDMARK_CENTER.x + 0.5,
  z: STAGE_LANDMARK_CENTER.z + 0.5,
});
export const STAGE_LANDMARK_RADIUS = 18;

const LANDMARK_BRIEFINGS: Record<string, Omit<StageLandmarkBriefing, 'name'>> = {
  'build-forest': {
    shortRole: '木と灯りの制作拠点',
    actionLabel: '小道と焚き火を広げる',
    arrivalLabel: '森の材料を集めて広場を育てよう',
    modeLabel: '制作起点',
  },
  'build-tropical': {
    shortRole: '水路とガラスのリゾート桟橋',
    actionLabel: '水辺にデッキを伸ばす',
    arrivalLabel: '水とガラスで明るい島を作ろう',
    modeLabel: 'リゾート起点',
  },
  'build-snow': {
    shortRole: '塔を伸ばす雪の王冠台座',
    actionLabel: '高い塔と光る門を作る',
    arrivalLabel: '白い世界で遠くから見える城を育てよう',
    modeLabel: '王国起点',
  },
  'build-desert': {
    shortRole: '大工事用の広いオアシス基壇',
    actionLabel: '砂と水で大きな目印を作る',
    arrivalLabel: '平らな砂地を使って巨大建築を始めよう',
    modeLabel: '大工事起点',
  },
  'war-forest': {
    shortRole: '森の敵を迎える防衛コア',
    actionLabel: '灯りとタレットで防衛線を作る',
    arrivalLabel: '木陰から来る敵をここで迎え撃とう',
    modeLabel: '防衛中枢',
  },
  'war-tropical': {
    shortRole: '水辺で距離を作る前線キャンプ',
    actionLabel: '退路とTNTの罠を用意する',
    arrivalLabel: '敵のラッシュを水辺でさばこう',
    modeLabel: '強襲拠点',
  },
  'war-snow': {
    shortRole: '吹雪でも見える極寒ビーコン',
    actionLabel: '光と防壁で持久戦に備える',
    arrivalLabel: '白い視界の中で守る場所を固めよう',
    modeLabel: '持久拠点',
  },
  'war-desert': {
    shortRole: '高台火力の戦闘ピラミッド',
    actionLabel: '砂丘と爆発で押し切る',
    arrivalLabel: '開けた砂地で遠距離火力を活かそう',
    modeLabel: '決戦拠点',
  },
};

function fallbackBriefing(stage: StageDefinition): Omit<StageLandmarkBriefing, 'name'> {
  if (stage.category === 'build') {
    return {
      shortRole: '制作を始める目印',
      actionLabel: '素材を置いて拠点を広げる',
      arrivalLabel: 'ここから作品を育てよう',
      modeLabel: '制作起点',
    };
  }

  return {
    shortRole: '敵を迎える守りの目印',
    actionLabel: '防衛線を作って戦う',
    arrivalLabel: 'ここを中心に敵を迎え撃とう',
    modeLabel: '防衛拠点',
  };
}

export function getStageLandmarkBriefing(stage: StageDefinition): StageLandmarkBriefing {
  return {
    name: stage.rules.landmarkName,
    ...(LANDMARK_BRIEFINGS[stage.id] ?? fallbackBriefing(stage)),
  };
}

export function getStageLandmarkDistance(position: StageWorldPosition | null): number | null {
  if (!position) return null;
  const dx = STAGE_LANDMARK_WORLD_CENTER.x - position.x;
  const dz = STAGE_LANDMARK_WORLD_CENTER.z - position.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function getStageLandmarkDirectionLabel(position: StageWorldPosition | null): string {
  if (!position) return '探索中';

  const dx = STAGE_LANDMARK_WORLD_CENTER.x - position.x;
  const dz = STAGE_LANDMARK_WORLD_CENTER.z - position.z;
  if (Math.abs(dx) + Math.abs(dz) < 0.2) return '到着';

  const angle = Math.atan2(dz, dx);
  const sectors = ['東', '南東', '南', '南西', '西', '北西', '北', '北東'];
  const index = Math.round(angle / (Math.PI / 4));
  return sectors[(index + sectors.length) % sectors.length];
}

export function getStageLandmarkRangeLabel(distance: number | null): string {
  if (distance === null) return '位置測定中';
  if (distance <= STAGE_LANDMARK_RADIUS) return '到着';
  if (distance <= 26) return 'すぐそこ';
  if (distance <= 54) return '近い';
  if (distance <= 92) return '探索';
  return '遠征';
}

export function formatStageLandmarkNavigation(position: StageWorldPosition | null): string {
  const distance = getStageLandmarkDistance(position);
  const rangeLabel = getStageLandmarkRangeLabel(distance);
  if (distance === null) return rangeLabel;
  if (distance <= STAGE_LANDMARK_RADIUS) return `${rangeLabel} ${Math.round(distance)}m`;
  return `${rangeLabel} ${Math.round(distance)}m ${getStageLandmarkDirectionLabel(position)}`;
}
