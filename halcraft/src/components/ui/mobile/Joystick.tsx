// バーチャルジョイスティック
// 左下に配置され、タッチ操作で移動入力を提供

import { useRef, useCallback, useEffect } from 'react';
import { joystickInput } from '../../../utils/touchInput';

/** ジョイスティックのサイズ定数 */
const BASE_SIZE = 120;
const KNOB_SIZE = 50;
const MAX_DISTANCE = (BASE_SIZE - KNOB_SIZE) / 2;

export function Joystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const activeTouchId = useRef<number | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });

  const updateKnob = useCallback((touchX: number, touchY: number) => {
    const dx = touchX - centerRef.current.x;
    const dy = touchY - centerRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(distance, MAX_DISTANCE);

    let normX = 0;
    let normY = 0;

    if (distance > 0) {
      normX = (dx / distance) * clampedDist;
      normY = (dy / distance) * clampedDist;
    }

    // ジョイスティック入力を更新（yは反転：画面上が前方=正）
    joystickInput.x = normX / MAX_DISTANCE;
    joystickInput.y = -normY / MAX_DISTANCE;

    // ノブの位置を更新
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${normX}px, ${normY}px)`;
    }
  }, []);

  const resetKnob = useCallback(() => {
    joystickInput.x = 0;
    joystickInput.y = 0;
    activeTouchId.current = null;
    if (knobRef.current) {
      knobRef.current.style.transform = 'translate(0px, 0px)';
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeTouchId.current !== null) return;

    const touch = e.changedTouches[0];
    activeTouchId.current = touch.identifier;

    const rect = baseRef.current?.getBoundingClientRect();
    if (rect) {
      centerRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }

    updateKnob(touch.clientX, touch.clientY);
  }, [updateKnob]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === activeTouchId.current) {
        updateKnob(touch.clientX, touch.clientY);
        break;
      }
    }
  }, [updateKnob]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchId.current) {
        resetKnob();
        break;
      }
    }
  }, [resetKnob]);

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
      ref={baseRef}
      onTouchStart={handleTouchStart}
      style={{
        position: 'fixed',
        left: 20,
        bottom: 'calc(40px + env(safe-area-inset-bottom))',
        width: BASE_SIZE,
        height: BASE_SIZE,
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.08)',
        border: '2px solid rgba(255, 255, 255, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 120,
        touchAction: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* ノブ */}
      <div
        ref={knobRef}
        style={{
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.25)',
          border: '2px solid rgba(255, 255, 255, 0.4)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          transition: 'none',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
