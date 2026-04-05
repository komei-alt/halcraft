// ============================================
// プッシュ通知ユーティリティ
// Service Worker 登録 + Web Push 購読管理
// ============================================

/** サーバーURL */
const SERVER_URL = import.meta.env.PROD
  ? 'https://halcraft-ws.rosch.jp'
  : `http://${window.location.hostname}:4001`;

/** VAPID公開鍵 */
const VAPID_PUBLIC_KEY = 'BMIodx4H334etYD9e8PldzeiSnZCgUcov8DX4DNXXAyGSDu_TccUqWOo8ycnoOaO3hL_FYusMRN_4zU_OQTax6Y';

/** Base64URL → Uint8Array 変換 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

/** プッシュ通知がサポートされているか */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** PWAとして起動しているか */
export function isRunningAsPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** 現在の通知許可状態を取得 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/** 既にプッシュ購読済みかを確認 */
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

/**
 * Service Worker を登録し、プッシュ通知を購読する
 * @returns 成功したら true
 */
export async function subscribePush(): Promise<boolean> {
  if (!isPushSupported()) {
    console.warn('[Push] このブラウザはプッシュ通知に対応していません');
    return false;
  }

  try {
    // 1. 通知許可をリクエスト
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[Push] 通知許可が拒否されました');
      return false;
    }

    // 2. Service Worker を登録
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    console.log('[Push] Service Worker 登録完了');

    // 3. 既存のサブスクリプションを確認
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // 4. 新規購読
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
      console.log('[Push] プッシュ購読完了');
    }

    // 5. サーバーにサブスクリプションを送信
    const json = subscription.toJSON();
    const res = await fetch(`${SERVER_URL}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
      }),
    });

    if (!res.ok) {
      console.error('[Push] サーバーへの登録に失敗:', res.status);
      return false;
    }

    console.log('[Push] サーバーにサブスクリプションを登録完了');
    return true;
  } catch (err) {
    console.error('[Push] プッシュ通知の設定に失敗:', err);
    return false;
  }
}

/**
 * プッシュ通知の購読を解除
 */
export async function unsubscribePush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      // サーバーから削除
      await fetch(`${SERVER_URL}/api/push/subscribe`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * ゲーム開始時に呼ぶ: PWAなら自動購読、ブラウザなら何もしない
 * 既に購読済みの場合はスキップ
 */
export async function initPushIfPWA(): Promise<void> {
  if (!isPushSupported() || !isRunningAsPWA()) return;

  // 既に購読済みならスキップ
  if (await isSubscribed()) return;

  // 通知許可が既に拒否されていたら何もしない
  if (Notification.permission === 'denied') return;

  // PWA起動時は自動で購読を試みる
  await subscribePush();
}
