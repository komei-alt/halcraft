// ゲームキャンバスの取得と入力有効化をまとめるユーティリティ

function isHtmlCanvasElement(node: Element | null): node is HTMLCanvasElement {
  return node instanceof HTMLCanvasElement;
}

function isEditableElement(node: Element | null): boolean {
  return node instanceof HTMLInputElement
    || node instanceof HTMLTextAreaElement
    || (node instanceof HTMLElement && node.isContentEditable);
}

let desktopGameplayActivated = false;

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
    try {
      const lockRequest = canvas.requestPointerLock?.();
      if (lockRequest instanceof Promise) {
        lockRequest.catch(() => undefined);
      }
    } catch {
      // 埋め込みブラウザなど Pointer Lock が使えない環境では focus だけで操作を有効にする
    }
  }

  desktopGameplayActivated = true;
  return isDesktopGameplayInputActive();
}

/** デスクトップ入力が有効かどうか */
export function isDesktopGameplayInputActive(): boolean {
  const canvas = getGameCanvas();
  if (!canvas) return false;

  if (document.pointerLockElement === canvas || document.activeElement === canvas) {
    return true;
  }

  return desktopGameplayActivated && document.hasFocus() && !isEditableElement(document.activeElement);
}
