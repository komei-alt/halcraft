// HUD情報密度の判定ヘルパー
// シンプル表示を既定にし、詳細パネルは設定または広い画面でのみ出す

import { useSettingsStore } from '../stores/useSettingsStore';
import { isTouchDevice } from './device';

/** 狭い画面（モバイル／狭いウィンドウ）かどうか */
export function isNarrowGameplayHud(): boolean {
  if (typeof window === 'undefined') return isTouchDevice();
  return isTouchDevice() || window.innerWidth <= 560;
}

/** 詳細HUD（ツール／ステージ詳細レール等）を出すか */
export function shouldShowDetailedHud(): boolean {
  const { hudDensity } = useSettingsStore.getState();
  return hudDensity === 'detailed' && !isNarrowGameplayHud();
}

/** React コンポーネント向け: 情報負荷を抑えた表示か */
export function useSimpleHud(): boolean {
  const hudDensity = useSettingsStore((s) => s.hudDensity);
  return hudDensity === 'simple' || isNarrowGameplayHud();
}
