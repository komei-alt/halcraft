// ゲームキャンバスの取得と入力有効化をまとめるユーティリティ

function isHtmlCanvasElement(node: Element | null): node is HTMLCanvasElement {
  return node instanceof HTMLCanvasElement;
}

/** ゲーム描画用の canvas 要素を取得 */
export function getGameCanvas(): HTMLCanvasElement | null {
  const canvas = document.querySelector('canvas');
  return isHtmlCanvasElement(canvas) ? canvas : null;
}

/** canvas にフォーカスを与える */
export function focusGameCanvas(): boolean {
  const canvas = getGameCanvas();
  if (!canvas) return false;
  canvas.focus();
  return document.activeElement === canvas;
}

/** Pointer Lock を試行しつつ canvas をアクティブ化する */
export function activateDesktopGameplayInput(): boolean {
  const canvas = getGameCanvas();
  if (!canvas) return false;

  canvas.focus();

  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
  }

  return isDesktopGameplayInputActive();
}

/** デスクトップ入力が有効かどうか */
export function isDesktopGameplayInputActive(): boolean {
  const canvas = getGameCanvas();
  if (!canvas) return false;

  return document.pointerLockElement === canvas || document.activeElement === canvas;
}
