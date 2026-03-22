// タッチ入力のグローバル状態管理
// Player.tsx と BlockInteraction.tsx がここから入力を読み取る

/** ジョイスティックの入力値（-1.0 ~ 1.0） */
export const joystickInput = {
  x: 0, // 左右（右=正）
  y: 0, // 前後（前=正）
};

/** タッチによるカメラ回転の変位量（フレーム単位でリセット） */
export const touchLook = {
  deltaX: 0,
  deltaY: 0,
};

/** モバイルアクションの状態 */
export const mobileActions = {
  jump: false,
  /** ブロック破壊トリガー（1回消費で自動false） */
  breakBlock: false,
  /** ブロック設置トリガー（1回消費で自動false） */
  placeBlock: false,
};

/**
 * touchLookの変位量をリセット（毎フレーム呼ばれる）
 */
export function resetTouchLookDelta(): void {
  touchLook.deltaX = 0;
  touchLook.deltaY = 0;
}

/**
 * ブロック破壊を消費（1回使ったらfalseに戻す）
 */
export function consumeBreakBlock(): boolean {
  if (mobileActions.breakBlock) {
    mobileActions.breakBlock = false;
    return true;
  }
  return false;
}

/**
 * ブロック設置を消費
 */
export function consumePlaceBlock(): boolean {
  if (mobileActions.placeBlock) {
    mobileActions.placeBlock = false;
    return true;
  }
  return false;
}
