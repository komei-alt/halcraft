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
