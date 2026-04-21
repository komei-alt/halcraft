// 武器切替時に現在の装備と操作を短時間案内するポップオーバー

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayerStore, type EquippedItem } from '../../stores/usePlayerStore';
import { useGameStore } from '../../stores/useGameStore';
import { isTouchDevice } from '../../utils/device';

const SHOW_DURATION_MS = 2200;
const TRANSITION_MS = 220;

interface PopoverContent {
  icon: string;
  title: string;
  subtitle: string;
  controls: string[];
  accent: string;
  glow: string;
}

const CONTENT_BY_ITEM: Record<EquippedItem, PopoverContent> = {
  builder: {
    icon: '⛏️',
    title: '建築モード',
    subtitle: 'ブロック破壊と設置が使えます',
    controls: [
      '左クリック: こわす / 攻撃',
      '右クリック: ブロック設置',
      'V: ロケットに切り替え',
    ],
    accent: '#b6e2ff',
    glow: 'rgba(116, 194, 255, 0.28)',
  },
  rocket_launcher: {
    icon: '🚀',
    title: 'ロケット装備',
    subtitle: '広範囲にダメージを与える重火器です',
    controls: [
      '左クリック または R: 発射',
      '爆風: 周囲まとめてダメージ',
      'V: 建築モードに戻る',
    ],
    accent: '#ffc48a',
    glow: 'rgba(255, 145, 72, 0.3)',
  },
};

function getMobileContent(item: EquippedItem): PopoverContent {
  const base = CONTENT_BY_ITEM[item];
  if (item === 'builder') {
    return {
      ...base,
      controls: [
        'タップ: こわす',
        '長押し: ブロック設置',
        '右上の⛏️/🚀で切り替え',
      ],
    };
  }

  return {
    ...base,
    controls: [
      '💥 ボタン: ロケット発射',
      '爆風: 周囲まとめてダメージ',
      '右上の⛏️/🚀で切り替え',
    ],
  };
}

export function WeaponSwitchPopover() {
  const phase = useGameStore((s) => s.phase);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const isTouch = isTouchDevice();
  const prevItemRef = useRef<EquippedItem>(equippedItem);
  const dismissTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const [displayItem, setDisplayItem] = useState<EquippedItem>(equippedItem);

  const clearTimers = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hidePopover = useCallback(() => {
    clearTimers();
    setEntered(false);
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setVisible(false);
    }, TRANSITION_MS);
  }, [clearTimers]);

  useEffect(() => {
    if (phase !== 'playing') {
      prevItemRef.current = equippedItem;
      clearTimers();
      const frame = window.requestAnimationFrame(() => {
        setEntered(false);
        setVisible(false);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (prevItemRef.current === equippedItem) {
      return;
    }
    prevItemRef.current = equippedItem;
    clearTimers();

    const frame = window.requestAnimationFrame(() => {
      setDisplayItem(equippedItem);
      setVisible(true);
      setEntered(true);
      dismissTimerRef.current = window.setTimeout(() => {
        dismissTimerRef.current = null;
        hidePopover();
      }, SHOW_DURATION_MS);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [clearTimers, equippedItem, hidePopover, phase]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (!visible || phase !== 'playing') return null;

  const content = isTouch ? getMobileContent(displayItem) : CONTENT_BY_ITEM[displayItem];

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: isTouch ? 'calc(126px + env(safe-area-inset-bottom))' : 106,
        transform: entered
          ? 'translateX(-50%) translateY(0) scale(1)'
          : 'translateX(-50%) translateY(14px) scale(0.96)',
        opacity: entered ? 1 : 0,
        transition: `transform ${TRANSITION_MS}ms ease, opacity ${TRANSITION_MS}ms ease`,
        zIndex: 135,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: -8,
          borderRadius: 24,
          background: `radial-gradient(circle, ${content.glow} 0%, rgba(0,0,0,0) 72%)`,
          filter: 'blur(12px)',
        }}
      />
      <div
        style={{
          position: 'relative',
          minWidth: isTouch ? 248 : 290,
          maxWidth: isTouch ? 286 : 340,
          padding: isTouch ? '12px 14px' : '12px 16px',
          borderRadius: 16,
          border: `1px solid ${content.glow}`,
          background: 'rgba(12, 15, 20, 0.84)',
          backdropFilter: 'blur(14px)',
          boxShadow: '0 18px 40px rgba(0, 0, 0, 0.38)',
          fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
          color: '#fff',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: isTouch ? 38 : 42,
              height: isTouch ? 38 : 42,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: isTouch ? 22 : 24,
              background: `${content.glow}`,
              border: `1px solid ${content.accent}55`,
              boxShadow: `0 0 0 1px ${content.accent}14 inset`,
            }}
          >
            {content.icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: isTouch ? 15 : 16,
                fontWeight: 800,
                letterSpacing: '0.03em',
                color: content.accent,
              }}
            >
              {content.title}
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: isTouch ? 11 : 12,
                color: 'rgba(255,255,255,0.72)',
              }}
            >
              {content.subtitle}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          {content.controls.map((control) => (
            <div
              key={control}
              style={{
                fontSize: isTouch ? 11 : 12,
                color: 'rgba(255,255,255,0.88)',
                lineHeight: 1.35,
              }}
            >
              {control}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
