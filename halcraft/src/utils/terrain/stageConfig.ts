// 地形生成側で現在のステージを参照するための軽量な共有設定

import type { StageDefinition } from '../../types/stages';

let currentStage: StageDefinition | null = null;

/** 現在のステージを地形生成モジュールへ通知する */
export function setCurrentTerrainStage(stage: StageDefinition | null): void {
  currentStage = stage;
}

/** 地形生成中に現在のステージ定義を取得する */
export function getCurrentTerrainStage(): StageDefinition | null {
  return currentStage;
}
