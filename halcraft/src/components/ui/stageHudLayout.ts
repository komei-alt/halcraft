// ステージ系HUDの右側レール配置
// 時刻表示とマップ差分HUDが重ならないよう、同じ基準値を共有する

export const STAGE_RIGHT_RAIL_TOP = {
  condition: 106,
  pressure: 206,
  eventWithoutPressure: 206,
  eventWithPressure: 324,
  modeWithoutPressure: 302,
  modeWithPressure: 420,
} as const;

