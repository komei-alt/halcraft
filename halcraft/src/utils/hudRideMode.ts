// 乗車モード（乗り物 / コースター）の共通判定
// 徒歩用HUDを畳むときに使う

import { useCoasterStore } from '../stores/useCoasterStore';
import { useVehicleStore } from '../stores/useVehicleStore';

/** 乗り物またはコースターに乗っているか（表示用・再レンダー対応） */
export function useIsRideMode(): boolean {
  const inVehicle = useVehicleStore((s) => s.activeVehicle !== null);
  const onCoaster = useCoasterStore((s) => s.isBoarded);
  return inVehicle || onCoaster;
}

/** 非React経路用スナップショット */
export function isRideModeNow(): boolean {
  return useVehicleStore.getState().activeVehicle !== null
    || useCoasterStore.getState().isBoarded;
}
