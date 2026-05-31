// ステージシステム定義
// マップ選択、ゲームモード、初期支給、敵の出方、進行表示を同じ定義から動かす

import { BLOCK_IDS, type BlockId } from './blocks';
import type { TerrainShape } from './biomes';
import type { StageEnemyProfileId } from './stageEnemyProfiles';
import type { ToolId } from './tools';

/** ステージカテゴリ */
export type StageCategory = 'build' | 'war';

/** バイオームID */
export type BiomeId = 'forest' | 'tropical' | 'snow' | 'desert';

/**
 * ステージ固有の地形プロファイル
 * ベースのバイオーム設定を上書きし、同じバイオームでもステージごとに地形を変える。
 * 例: 森でも build と war でシード・形状・起伏を変えて別マップにする。
 */
export interface StageTerrainProfile {
  /** ノイズシード（変えると地形配置が丸ごと変わる） */
  noiseSeed?: number;
  /** 地形の基本形状 */
  terrainShape?: TerrainShape;
  /** 基準高さ */
  baseHeight?: number;
  /** 高低差の振幅 */
  heightVariation?: number;
  /** 細かい凹凸の振幅 */
  detailVariation?: number;
  /** 大地形ノイズ周波数 */
  noiseFrequency?: number;
  /** 木の密度 */
  treeDensity?: number;
  /** 地表装飾の密度 */
  decorDensity?: number;
}

/** リセットポリシー */
export interface ResetPolicy {
  /** 自動リセットの有無 */
  autoReset: boolean;
  /** 自動リセット間隔（ミリ秒）。autoReset=true の場合のみ */
  autoResetIntervalMs?: number;
}

/** ステージ開始時に渡すアイテム */
export interface StageStarterKit {
  /** ブロック支給数 */
  blocks: Partial<Record<BlockId, number>>;
  /** ツール支給 */
  tools: ToolId[];
  /** 開始時に装備するツール */
  equippedToolId: ToolId | null;
  /** 開始時の空腹値 */
  hunger: number;
}

/** 敵スポーンとやり込み進行の差分 */
export interface StageEnemyTuning {
  /** 敵の硬さ・速さ・報酬を変える編成プロファイル */
  threatProfileId: StageEnemyProfileId;
  /** 同時に残せる敵の数 */
  maxHostileMobs: number;
  /** 敵が湧く最短距離 */
  spawnDistanceMin: number;
  /** 敵が湧く最遠距離 */
  spawnDistanceMax: number;
  /** ゾンビのスポーン間隔 */
  zombieIntervalSeconds: number;
  /** クモのスポーン間隔 */
  spiderIntervalSeconds: number;
  /** ダーウィンのスポーン間隔 */
  darwinIntervalSeconds: number;
  /** クモの最大数 */
  maxSpiders: number;
  /** ダーウィンの最大数 */
  maxDarwins: number;
  /** この撃破数に到達したらボス出現 */
  bossAfterDefeats: number;
  /** XP獲得倍率 */
  xpMultiplier: number;
}

/** HUD に出すステージ目標 */
export interface StageObjective {
  title: string;
  description: string;
  progressLabel: string;
  targetCount: number | null;
  prompts: string[];
}

/** ステージ固有の遊びルール */
export interface StageGameplayRules {
  modeLabel: string;
  shortPitch: string;
  objective: StageObjective;
  featureTags: string[];
  landmarkName: string;
  dayDurationSeconds: number;
  startTime: number;
  ambientIntensity: number;
  starterKit: StageStarterKit;
  enemyTuning: StageEnemyTuning | null;
}

/** ステージ定義 */
export interface StageDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: StageCategory;
  biome: BiomeId;
  color: string;
  resetPolicy: ResetPolicy;
  rules: StageGameplayRules;
  /** ステージ固有の地形プロファイル（ベースバイオームを上書き） */
  terrain?: StageTerrainProfile;
}

/** 1日 = 24時間（ミリ秒） */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const BUILD_KIT: StageStarterKit = {
  blocks: {
    [BLOCK_IDS.GRASS]: 64,
    [BLOCK_IDS.DIRT]: 64,
    [BLOCK_IDS.WOOD]: 96,
    [BLOCK_IDS.RAW_WOOD]: 64,
    [BLOCK_IDS.GLASS]: 48,
    [BLOCK_IDS.TORCH]: 32,
    [BLOCK_IDS.CANDLE]: 16,
    [BLOCK_IDS.RAIL]: 48,
    [BLOCK_IDS.RAIL_SLOPE]: 24,
    [BLOCK_IDS.RAIL_BOOSTER]: 12,
  },
  tools: ['wood_pickaxe', 'wood_axe', 'wood_shovel'],
  equippedToolId: 'wood_pickaxe',
  hunger: 20,
};

const WAR_KIT: StageStarterKit = {
  blocks: {
    [BLOCK_IDS.WOOD]: 24,
    [BLOCK_IDS.STONE]: 24,
    [BLOCK_IDS.TORCH]: 12,
    [BLOCK_IDS.CAMPFIRE]: 2,
    [BLOCK_IDS.TURRET]: 2,
    [BLOCK_IDS.TNT]: 4,
  },
  tools: ['stone_pickaxe', 'stone_sword'],
  equippedToolId: 'stone_sword',
  hunger: 18,
};

function buildRules(args: {
  modeLabel: string;
  shortPitch: string;
  objectiveTitle: string;
  objectiveDescription: string;
  prompts: string[];
  featureTags: string[];
  landmarkName: string;
  startTime?: number;
  ambientIntensity?: number;
  extraBlocks?: Partial<Record<BlockId, number>>;
}): StageGameplayRules {
  return {
    modeLabel: args.modeLabel,
    shortPitch: args.shortPitch,
    objective: {
      title: args.objectiveTitle,
      description: args.objectiveDescription,
      progressLabel: 'つくったもの',
      targetCount: null,
      prompts: args.prompts,
    },
    featureTags: args.featureTags,
    landmarkName: args.landmarkName,
    dayDurationSeconds: 1500,
    startTime: args.startTime ?? 0.08,
    ambientIntensity: args.ambientIntensity ?? 1,
    starterKit: {
      ...BUILD_KIT,
      blocks: {
        ...BUILD_KIT.blocks,
        ...args.extraBlocks,
      },
    },
    enemyTuning: null,
  };
}

function warRules(args: {
  modeLabel: string;
  shortPitch: string;
  objectiveTitle: string;
  objectiveDescription: string;
  targetCount: number;
  prompts: string[];
  featureTags: string[];
  landmarkName: string;
  dayDurationSeconds: number;
  startTime: number;
  ambientIntensity: number;
  enemyTuning: StageEnemyTuning;
  extraBlocks?: Partial<Record<BlockId, number>>;
  extraTools?: ToolId[];
}): StageGameplayRules {
  return {
    modeLabel: args.modeLabel,
    shortPitch: args.shortPitch,
    objective: {
      title: args.objectiveTitle,
      description: args.objectiveDescription,
      progressLabel: '敵をたおした数',
      targetCount: args.targetCount,
      prompts: args.prompts,
    },
    featureTags: args.featureTags,
    landmarkName: args.landmarkName,
    dayDurationSeconds: args.dayDurationSeconds,
    startTime: args.startTime,
    ambientIntensity: args.ambientIntensity,
    starterKit: {
      ...WAR_KIT,
      blocks: {
        ...WAR_KIT.blocks,
        ...args.extraBlocks,
      },
      tools: [...WAR_KIT.tools, ...(args.extraTools ?? [])],
    },
    enemyTuning: args.enemyTuning,
  };
}

/** 全ステージ定義 */
export const STAGES: StageDefinition[] = [
  {
    id: 'build-forest',
    name: '森の建築場',
    description: '緑豊かな森で自由に建築しよう',
    icon: '🌲',
    category: 'build',
    biome: 'forest',
    color: '#4caf50',
    resetPolicy: { autoReset: false },
    terrain: { noiseSeed: 0.50, terrainShape: 'rolling', treeDensity: 0.42 },
    rules: buildRules({
      modeLabel: '建築 / 森の工房',
      shortPitch: '木材と明かりを使って、森の中に暮らせる場所を広げるステージ',
      objectiveTitle: '森の工房を育てよう',
      objectiveDescription: '家、道、灯り、コースターをつないで、村まで続く森の拠点を作ろう。',
      prompts: ['木のアーチ', '村までの小道', '焚き火広場'],
      featureTags: ['平和', '木材多め', '飛行建築', '村づくり'],
      landmarkName: '森の制作広場',
      extraBlocks: {
        [BLOCK_IDS.LEAVES]: 64,
        [BLOCK_IDS.CAMPFIRE]: 4,
      },
    }),
  },
  {
    id: 'build-tropical',
    name: '南国パラダイス',
    description: 'ヤシの木が揺れるトロピカルな楽園',
    icon: '🌴',
    category: 'build',
    biome: 'tropical',
    color: '#ff9800',
    resetPolicy: { autoReset: false },
    // 島とラグーンだが、建築しやすいよう陸地を広めに（水没を抑える）
    terrain: { noiseSeed: 0.70, terrainShape: 'islands', baseHeight: 21, heightVariation: 8 },
    rules: buildRules({
      modeLabel: '建築 / 南国リゾート',
      shortPitch: '水辺とガラスを活かして、明るいリゾートを作るステージ',
      objectiveTitle: '南国リゾートを作ろう',
      objectiveDescription: '水路、ガラス床、光る飾りで、乗り物から見ても楽しい島を作ろう。',
      prompts: ['水辺のデッキ', 'ガラス展望台', 'ヤシ並木'],
      featureTags: ['水辺', 'ガラス', '明るい空', '乗り物映え'],
      landmarkName: 'リゾート桟橋',
      ambientIntensity: 1.1,
      extraBlocks: {
        [BLOCK_IDS.WATER]: 48,
        [BLOCK_IDS.GLASS]: 96,
        [BLOCK_IDS.ELECTRIC]: 16,
      },
    }),
  },
  {
    id: 'build-snow',
    name: '雪の王国',
    description: '雪が積もる極寒の世界で氷の城を建てよう',
    icon: '❄️',
    category: 'build',
    biome: 'snow',
    color: '#90caf9',
    resetPolicy: { autoReset: false },
    terrain: { noiseSeed: 0.30, terrainShape: 'hills', heightVariation: 12 },
    rules: buildRules({
      modeLabel: '建築 / 雪の王国',
      shortPitch: '白い地形とガラスで、遠くから見える城を作るステージ',
      objectiveTitle: '雪の城を完成させよう',
      objectiveDescription: '塔、橋、光る門を作って、吹雪の中でも目印になる王国を作ろう。',
      prompts: ['高い塔', '氷の橋', '光る入口'],
      featureTags: ['雪原', 'ガラス城', '高低差', '遠景'],
      landmarkName: '雪の王冠台座',
      ambientIntensity: 1.2,
      extraBlocks: {
        [BLOCK_IDS.SNOW]: 128,
        [BLOCK_IDS.GLASS]: 96,
        [BLOCK_IDS.GLOWSTONE]: 12,
      },
    }),
  },
  {
    id: 'build-desert',
    name: '砂漠のオアシス',
    description: '広大な砂漠にピラミッドを建てよう',
    icon: '🏜️',
    category: 'build',
    biome: 'desert',
    color: '#ffc107',
    resetPolicy: { autoReset: false },
    // 平らな砂地で巨大建築しやすいよう、起伏を抑えた平原寄りに
    terrain: { noiseSeed: 0.90, terrainShape: 'plains', heightVariation: 3 },
    rules: buildRules({
      modeLabel: '建築 / 砂の大工事',
      shortPitch: '平らな砂地を活かして、大きな建造物を一気に作るステージ',
      objectiveTitle: '砂漠の目印を作ろう',
      objectiveDescription: 'ピラミッド、オアシス、地下入口を作って、迷わない砂漠を作ろう。',
      prompts: ['ピラミッド', '水のオアシス', '地下入口'],
      featureTags: ['広い平地', '砂', '巨大建築', '水を配置'],
      landmarkName: 'オアシス基壇',
      ambientIntensity: 1.15,
      extraBlocks: {
        [BLOCK_IDS.SAND]: 160,
        [BLOCK_IDS.WATER]: 32,
        [BLOCK_IDS.GLOWSTONE]: 12,
      },
    }),
  },
  {
    id: 'war-forest',
    name: '森の戦場',
    description: '森に潜む敵を倒して生き延びろ',
    icon: '🌲',
    category: 'war',
    biome: 'forest',
    color: '#388e3c',
    resetPolicy: { autoReset: true, autoResetIntervalMs: ONE_DAY_MS },
    // 建築場と別マップに。起伏を強めて見通しを悪くし、木も濃いめ
    terrain: { noiseSeed: 0.18, terrainShape: 'hills', heightVariation: 13, treeDensity: 0.5 },
    rules: warRules({
      modeLabel: '戦争 / 森の防衛',
      shortPitch: '見通しの悪い森で、拠点を守りながら敵を倒す標準戦場',
      objectiveTitle: '森の防衛線',
      objectiveDescription: '木陰から近づく敵を倒し、灯りとタレットで拠点を保とう。',
      targetCount: 25,
      prompts: ['見張り台', '松明の線', 'タレット2基'],
      featureTags: ['標準難度', '視界注意', 'タレット支給', 'ボスあり'],
      landmarkName: '森の防衛コア',
      dayDurationSeconds: 1050,
      startTime: 0.46,
      ambientIntensity: 1.05,
      enemyTuning: {
        threatProfileId: 'forest_siege',
        maxHostileMobs: 18,
        spawnDistanceMin: 28,
        spawnDistanceMax: 44,
        zombieIntervalSeconds: 2.8,
        spiderIntervalSeconds: 3.6,
        darwinIntervalSeconds: 18,
        maxSpiders: 5,
        maxDarwins: 2,
        bossAfterDefeats: 25,
        xpMultiplier: 1,
      },
    }),
  },
  {
    id: 'war-tropical',
    name: 'ジャングル戦線',
    description: 'ジャングルの奥地で敵と戦え',
    icon: '🌴',
    category: 'war',
    biome: 'tropical',
    color: '#e65100',
    resetPolicy: { autoReset: true, autoResetIntervalMs: ONE_DAY_MS },
    // 島より陸地多めの起伏ジャングル。近距離戦向けに密集
    terrain: { noiseSeed: 0.62, terrainShape: 'hills', heightVariation: 10, treeDensity: 0.45 },
    rules: warRules({
      modeLabel: '戦争 / ジャングル強襲',
      shortPitch: '敵の数が多く、動き回って切り抜けるラッシュ型ステージ',
      objectiveTitle: 'ジャングル強襲を止めろ',
      objectiveDescription: '多めに湧く敵を、機関銃と水辺の距離管理で押し返そう。',
      targetCount: 35,
      prompts: ['退路を確保', '水辺で引き撃ち', 'TNTでまとめて倒す'],
      featureTags: ['敵多め', '近距離戦', 'XP多め', '機関銃向き'],
      landmarkName: 'ジャングル前線キャンプ',
      dayDurationSeconds: 950,
      startTime: 0.5,
      ambientIntensity: 1.18,
      extraBlocks: {
        [BLOCK_IDS.TNT]: 8,
        [BLOCK_IDS.WATER]: 24,
      },
      extraTools: ['iron_sword'],
      enemyTuning: {
        threatProfileId: 'tropical_swarm',
        maxHostileMobs: 24,
        spawnDistanceMin: 24,
        spawnDistanceMax: 38,
        zombieIntervalSeconds: 1.9,
        spiderIntervalSeconds: 2.4,
        darwinIntervalSeconds: 14,
        maxSpiders: 8,
        maxDarwins: 3,
        bossAfterDefeats: 35,
        xpMultiplier: 1.15,
      },
    }),
  },
  {
    id: 'war-snow',
    name: '極寒の前線',
    description: '吹雪の中で敵を迎え撃て',
    icon: '❄️',
    category: 'war',
    biome: 'snow',
    color: '#1565c0',
    resetPolicy: { autoReset: true, autoResetIntervalMs: ONE_DAY_MS },
    // 険しい雪山で視界が遮られる持久戦地形
    terrain: { noiseSeed: 0.42, terrainShape: 'mountains', baseHeight: 24, heightVariation: 16 },
    rules: warRules({
      modeLabel: '戦争 / 極寒持久戦',
      shortPitch: '敵は少なめでも長く硬く、準備と拠点防衛が効くステージ',
      objectiveTitle: '極寒の前線を守れ',
      objectiveDescription: '視界の白い戦場で、光る目印と防壁を作って持久戦を勝ち切ろう。',
      targetCount: 20,
      prompts: ['光る塔', '雪の防壁', '補給キャンプ'],
      featureTags: ['敵少なめ', '硬い敵', '準備重視', '視界悪め'],
      landmarkName: '極寒ビーコン',
      dayDurationSeconds: 1150,
      startTime: 0.52,
      ambientIntensity: 1.35,
      extraBlocks: {
        [BLOCK_IDS.SNOW]: 64,
        [BLOCK_IDS.GLASS]: 32,
        [BLOCK_IDS.GLOWSTONE]: 8,
      },
      enemyTuning: {
        threatProfileId: 'snow_armored',
        maxHostileMobs: 15,
        spawnDistanceMin: 34,
        spawnDistanceMax: 48,
        zombieIntervalSeconds: 3.4,
        spiderIntervalSeconds: 4.4,
        darwinIntervalSeconds: 16,
        maxSpiders: 4,
        maxDarwins: 3,
        bossAfterDefeats: 20,
        xpMultiplier: 1.2,
      },
    }),
  },
  {
    id: 'war-desert',
    name: '砂漠の決戦',
    description: '灼熱の砂漠で生き残れ',
    icon: '🏜️',
    category: 'war',
    biome: 'desert',
    color: '#f57f17',
    resetPolicy: { autoReset: true, autoResetIntervalMs: ONE_DAY_MS },
    // 砂丘の高台と窪地で、乗り物と待ち伏せが効く開けた決戦地形
    terrain: { noiseSeed: 0.78, terrainShape: 'dunes', heightVariation: 7 },
    rules: warRules({
      modeLabel: '戦争 / 砂漠決戦',
      shortPitch: '見通しは良いが逃げ場が少ない、乗り物と爆発が強い決戦ステージ',
      objectiveTitle: '砂漠の決戦に勝て',
      objectiveDescription: '開けた砂地で遠くから敵を見つけ、戦車や飛行機の火力で押し切ろう。',
      targetCount: 30,
      prompts: ['戦車を確保', '砂丘の高台', 'TNTで待ち伏せ'],
      featureTags: ['開けた地形', '乗り物向き', '爆発多め', '夜が速い'],
      landmarkName: '砂漠の戦闘ピラミッド',
      dayDurationSeconds: 900,
      startTime: 0.48,
      ambientIntensity: 1.25,
      extraBlocks: {
        [BLOCK_IDS.SAND]: 64,
        [BLOCK_IDS.TNT]: 10,
        [BLOCK_IDS.ELECTRIC]: 8,
      },
      extraTools: ['iron_pickaxe'],
      enemyTuning: {
        threatProfileId: 'desert_raiders',
        maxHostileMobs: 20,
        spawnDistanceMin: 36,
        spawnDistanceMax: 55,
        zombieIntervalSeconds: 2.3,
        spiderIntervalSeconds: 3.2,
        darwinIntervalSeconds: 12,
        maxSpiders: 5,
        maxDarwins: 4,
        bossAfterDefeats: 30,
        xpMultiplier: 1.1,
      },
    }),
  },
];

/** カテゴリ別のステージ一覧を取得 */
export function getCategoryStages(category: StageCategory): StageDefinition[] {
  return STAGES.filter((s) => s.category === category);
}

/** ステージIDからステージ定義を取得 */
export function getStageById(id: string): StageDefinition | undefined {
  return STAGES.find((s) => s.id === id);
}

/** カテゴリが建築（平和）モードかどうか */
export function isBuildCategory(category: StageCategory): boolean {
  return category === 'build';
}

/** ステージIDからカテゴリを取得 */
export function getStageCategoryFromId(stageId: string): StageCategory {
  return stageId.startsWith('build-') ? 'build' : 'war';
}
