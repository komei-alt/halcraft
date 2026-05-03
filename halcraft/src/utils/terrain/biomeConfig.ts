// バイオーム設定マネージャー
// 現在のバイオーム設定をグローバルに管理し、地形生成の各モジュールが参照する

import { BIOME_CONFIGS, type BiomeConfig } from '../../types/biomes';

/** 現在アクティブなバイオーム設定 */
let currentBiome: BiomeConfig = BIOME_CONFIGS.forest;

/** 現在のバイオーム設定を取得 */
export function getCurrentBiome(): BiomeConfig {
  return currentBiome;
}

/** バイオーム設定を変更（ステージ切替時に呼ばれる） */
export function setCurrentBiome(config: BiomeConfig): void {
  currentBiome = config;
}
