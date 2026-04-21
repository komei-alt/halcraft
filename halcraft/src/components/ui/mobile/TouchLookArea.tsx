// タッチ視点操作コンポーネント
// 画面右半分のスワイプで視点を回転させる
// ジョイスティック & ボタン領域と干渉しないように制御

import { useRef, useEffect, useCallback } from 'react';
import { touchLook, mobileActions } from '../../../utils/touchInput';
import { usePlayerStore } from '../../../stores/usePlayerStore';

/** タッチ感度 */
const TOUCH_SENSITIVITY = 0.004;
/** ブロック操作のタップ判定閾値（px） */
const TAP_THRESHOLD = 10;
/** 長押し判定時間（ms） — 設置モード時は即座にタップ判定 */
const LONG_PRESS_DURATION = 400;

interface TouchInfo {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  moved: boolean;
}

export function TouchLookArea() {
  const activeTouches = useRef<Map<number, TouchInfo>>(new Map());
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const info: TouchInfo = {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        startTime: Date.now(),
        moved: false,
      };
      activeTouches.current.set(touch.identifier, info);

      // 長押しタイマー開始（設置用）
      longPressTimer.current = setTimeout(() => {
        const touchInfo = activeTouches.current.get(touch.identifier);
        if (touchInfo && !touchInfo.moved) {
          if (usePlayerStore.getState().equippedItem !== 'builder') return;
          // 長押し → ブロック設置
          mobileActions.placeBlock = true;
        }
      }, LONG_PRESS_DURATION);
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const info = activeTouches.current.get(touch.identifier);
      if (!info) continue;

      const dx = touch.clientX - info.lastX;
      const dy = touch.clientY - info.lastY;

      // 移動量が閾値を超えたら「移動した」と判定
      const totalDx = touch.clientX - info.startX;
      const totalDy = touch.clientY - info.startY;
      if (Math.abs(totalDx) > TAP_THRESHOLD || Math.abs(totalDy) > TAP_THRESHOLD) {
        info.moved = true;
        // 長押しキャンセル
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      }

      // 視点回転
      touchLook.deltaX += dx * TOUCH_SENSITIVITY;
      touchLook.deltaY += dy * TOUCH_SENSITIVITY;

      info.lastX = touch.clientX;
      info.lastY = touch.clientY;
    }
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const info = activeTouches.current.get(touch.identifier);
      if (!info) continue;

      // タップ判定（移動していない短いタッチ）
      const elapsed = Date.now() - info.startTime;
      if (!info.moved && elapsed < LONG_PRESS_DURATION) {
        if (usePlayerStore.getState().equippedItem !== 'builder') {
          activeTouches.current.delete(touch.identifier);
          continue;
        }
        // タップ → 設置モードならブロック設置、破壊モードならブロック破壊
        const isPlaceMode = usePlayerStore.getState().isPlaceMode;
        if (isPlaceMode) {
          mobileActions.placeBlock = true;
        } else {
          mobileActions.breakBlock = true;
        }
      }

      // 長押しタイマーをクリア
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }

      activeTouches.current.delete(touch.identifier);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);
    return () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchMove, handleTouchEnd]);

  return (
    <div
      onTouchStart={handleTouchStart}
      style={{
        position: 'fixed',
        // 右半分（ジョイスティックと重ならないように）
        top: 0,
        right: 0,
        width: '55%',
        height: '100%',
        zIndex: 110,
        touchAction: 'none',
        WebkitTapHighlightColor: 'transparent',
        // デバッグ用（本番ではtransparent）
        // background: 'rgba(0,255,0,0.05)',
      }}
    />
  );
}
