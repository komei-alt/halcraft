// デバイス検出ユーティリティ
// タッチデバイスかどうかの判定と、モバイル関連のヘルパー

/**
 * タッチ対応デバイスかどうかを判定
 * iOSのSafari、Android Chromeなどを検出
 */
export function isTouchDevice(): boolean {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0
  );
}

/**
 * モバイルビューポート（幅768px以下）かどうかを判定
 */
export function isMobileViewport(): boolean {
  return window.innerWidth <= 768;
}

/**
 * モバイルデバイスかどうかの総合判定
 * タッチ対応 かつ モバイルビューポート
 */
export function isMobile(): boolean {
  return isTouchDevice() && isMobileViewport();
}

/**
 * iOS Safari かどうかを判定
 * PointerLockの挙動が異なるため区別が必要
 */
export function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
  return isIOS && isSafari;
}

/**
 * iOS デバイスかどうかを判定（Safari以外も含む）
 */
export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * PWA（ホーム画面追加）として起動しているかを判定
 */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    ('standalone' in navigator && (navigator as Record<string, unknown>).standalone === true)
  );
}

/**
 * フルスクリーンを試みる（対応ブラウザのみ）
 */
export function requestFullscreen(): void {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
    msRequestFullscreen?: () => void;
  };
  if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => { /* 対応外 */ });
  } else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen().catch(() => { /* 対応外 */ });
  }
}
