// ステージシステム定義
// 2カテゴリ（建築/戦争）× 4バイオーム = 計8ステージ

/** ステージカテゴリ */
export type StageCategory = 'build' | 'war';

/** バイオームID */
export type BiomeId = 'forest' | 'tropical' | 'snow' | 'desert';

/** リセットポリシー */
export interface ResetPolicy {
  /** 自動リセットの有無 */
  autoReset: boolean;
  /** 自動リセット間隔（ミリ秒）。autoReset=true の場合のみ */
  autoResetIntervalMs?: number;
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
}

/** 1日 = 24時間（ミリ秒） */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** 全ステージ定義 */
export const STAGES: StageDefinition[] = [
  // ─── 建築カテゴリ ───
  {
    id: 'build-forest',
    name: '森の建築場',
    description: '緑豊かな森で自由に建築しよう',
    icon: '🌲',
    category: 'build',
    biome: 'forest',
    color: '#4caf50',
    resetPolicy: { autoReset: false },
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
  },
  // ─── 戦争カテゴリ ───
  {
    id: 'war-forest',
    name: '森の戦場',
    description: '森に潜む敵を倒して生き延びろ',
    icon: '🌲',
    category: 'war',
    biome: 'forest',
    color: '#388e3c',
    resetPolicy: { autoReset: true, autoResetIntervalMs: ONE_DAY_MS },
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
