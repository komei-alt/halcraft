// ブラウザ側の予期しないエラーを RSDM へ送る。
// 送信失敗してもゲーム操作を止めない。

type TelemetryPayload = {
  source: 'window.onerror' | 'unhandledrejection';
  message: string;
  stack?: string;
  route: string;
  pageUrl: string;
  userAgent: string;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
};

declare global {
  interface Window {
    __halcraftTelemetryRegistered?: boolean;
  }
}

const SERVER_URL = import.meta.env.PROD
  ? 'https://halcraft-ws.rosch.jp'
  : `http://${window.location.hostname}:4001`;
const MAX_TEXT_LENGTH = 2000;
const RECENT_TTL_MS = 30_000;
const recentFingerprints = new Map<string, number>();

function truncate(value: string, maxLength = MAX_TEXT_LENGTH): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
}

function errorLikeMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'message' in value) {
    return String((value as { message?: unknown }).message ?? 'Unknown client error');
  }
  return 'Unknown client error';
}

function errorLikeStack(value: unknown): string | undefined {
  if (value instanceof Error) return value.stack;
  if (value && typeof value === 'object' && 'stack' in value) {
    const stack = (value as { stack?: unknown }).stack;
    return typeof stack === 'string' ? stack : undefined;
  }
  return undefined;
}

function fingerprint(message: string, stack?: string): string {
  return `${message.slice(0, 120)}|${(stack ?? '').split('\n').slice(0, 3).join('|')}`;
}

function shouldSend(message: string, stack?: string): boolean {
  const now = Date.now();
  for (const [key, ts] of recentFingerprints.entries()) {
    if (now - ts > RECENT_TTL_MS) recentFingerprints.delete(key);
  }
  const key = fingerprint(message, stack);
  if (recentFingerprints.has(key)) return false;
  recentFingerprints.set(key, now);
  return true;
}

function sendTelemetry(payload: TelemetryPayload): void {
  if (!shouldSend(payload.message, payload.stack)) return;
  const body = JSON.stringify({
    ...payload,
    message: truncate(payload.message, 500),
    stack: payload.stack ? truncate(payload.stack) : undefined,
  });

  const url = `${SERVER_URL}/api/telemetry/client-error`;
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon(url, blob)) return;
  }

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // RSDM 送信失敗でゲームを止めない。
  });
}

function basePayload(source: TelemetryPayload['source'], message: string, stack?: string): TelemetryPayload {
  return {
    source,
    message,
    stack,
    route: window.location.pathname,
    pageUrl: window.location.href,
    userAgent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
  };
}

export function registerClientTelemetry(): void {
  if (typeof window === 'undefined') return;
  if (window.__halcraftTelemetryRegistered) return;
  window.__halcraftTelemetryRegistered = true;

  window.addEventListener('error', (event) => {
    const message = event.message || errorLikeMessage(event.error);
    const stack = errorLikeStack(event.error);
    sendTelemetry(basePayload('window.onerror', message, stack));
  });

  window.addEventListener('unhandledrejection', (event) => {
    const message = errorLikeMessage(event.reason);
    const stack = errorLikeStack(event.reason);
    sendTelemetry(basePayload('unhandledrejection', message, stack));
  });
}
