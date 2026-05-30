// 熟練度HUD
// 現在装備している道具の成長と、直近の上達イベントを表示する

import { useEffect } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import {
  getMasteryProgress,
  getMasteryTitle,
  MASTERY_DEFS,
  useMasteryStore,
} from '../../stores/useMasteryStore';
import { getMasteryPerkSummary, getNextMasteryPerkSummary } from '../../types/masteryPerks';
import { isTouchDevice } from '../../utils/device';

export function MasteryHUD() {
  const phase = useGameStore((s) => s.phase);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const mastery = useMasteryStore((s) => s.items[equippedItem]);
  const recentEvent = useMasteryStore((s) => s.recentEvent);
  const clearRecentEvent = useMasteryStore((s) => s.clearRecentEvent);
  const isTouch = isTouchDevice();

  useEffect(() => {
    if (!recentEvent) return undefined;
    const timer = window.setTimeout(() => {
      clearRecentEvent();
    }, 1900);
    return () => window.clearTimeout(timer);
  }, [clearRecentEvent, recentEvent]);

  if (phase !== 'playing' || !mastery) return null;

  const def = MASTERY_DEFS[equippedItem];
  const progress = getMasteryProgress(mastery);
  const title = getMasteryTitle(equippedItem, mastery.level);
  const perkSummary = getMasteryPerkSummary(equippedItem, mastery.level);
  const nextPerkSummary = getNextMasteryPerkSummary(equippedItem, mastery.level);
  const eventMatches = recentEvent?.item === equippedItem;
  const statLabel = equippedItem === 'builder'
    ? `${mastery.blocksChanged} ブロック`
    : `${mastery.hits} HIT / ${mastery.defeats} DOWN`;

  return (
    <div
      id="mastery-hud"
      style={{
        position: 'fixed',
        left: isTouch ? 14 : 16,
        top: isTouch ? 170 : 'auto',
        bottom: isTouch ? 'auto' : 116,
        zIndex: 101,
        width: isTouch ? 'min(238px, calc(100vw - 28px))' : 252,
        padding: isTouch ? '9px 10px' : '10px 12px',
        borderRadius: 8,
        border: `1px solid ${def.accent}66`,
        background: 'rgba(9, 12, 18, 0.58)',
        boxShadow: `0 0 18px ${def.glow}`,
        backdropFilter: 'blur(9px)',
        WebkitBackdropFilter: 'blur(9px)',
        color: '#fff',
        pointerEvents: 'none',
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <div
          style={{
            width: isTouch ? 30 : 34,
            height: isTouch ? 30 : 34,
            borderRadius: 7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: def.glow,
            border: `1px solid ${def.accent}66`,
            fontSize: isTouch ? 17 : 19,
            flex: '0 0 auto',
          }}
        >
          {def.icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              color: def.accent,
              fontSize: isTouch ? 10 : 11,
              lineHeight: '13px',
              fontWeight: 900,
              letterSpacing: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {def.shortLabel} Lv.{mastery.level}
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.94)',
              fontSize: isTouch ? 12 : 13,
              lineHeight: '16px',
              fontWeight: 900,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
        </div>
        <div
          style={{
            minWidth: 46,
            textAlign: 'right',
            color: 'rgba(255,255,255,0.74)',
            fontSize: isTouch ? 9 : 10,
            lineHeight: '12px',
            fontWeight: 800,
            fontFamily: 'monospace',
          }}
        >
          {statLabel}
        </div>
      </div>

      <div
        style={{
          marginTop: 7,
          height: 5,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.13)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: '100%',
            borderRadius: 999,
            background: `linear-gradient(90deg, ${def.accent}, #ffffff)`,
            boxShadow: `0 0 10px ${def.glow}`,
            transition: 'width 0.28s ease',
          }}
        />
      </div>

      <div
        style={{
          marginTop: 6,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          color: 'rgba(255,255,255,0.62)',
          fontSize: isTouch ? 9 : 10,
          lineHeight: '13px',
          fontWeight: 800,
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {def.actionLabel}
        </span>
        <span style={{ flex: '0 0 auto', fontFamily: 'monospace' }}>
          {mastery.xp}/{mastery.xpToNextLevel}
        </span>
      </div>

      <div
        style={{
          marginTop: 5,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          color: def.accent,
          fontSize: isTouch ? 9 : 10,
          lineHeight: '13px',
          fontWeight: 900,
        }}
      >
        <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          特典: {perkSummary}
        </span>
        {nextPerkSummary && (
          <span
            style={{
              color: 'rgba(255,255,255,0.48)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            次: {nextPerkSummary}
          </span>
        )}
      </div>

      {eventMatches && (
        <div
          key={recentEvent.id}
          style={{
            marginTop: 7,
            padding: '5px 7px',
            borderRadius: 5,
            background: recentEvent.leveledUp
              ? 'rgba(255, 230, 120, 0.22)'
              : 'rgba(255,255,255,0.08)',
            color: recentEvent.leveledUp ? '#fff0a8' : 'rgba(255,255,255,0.82)',
            fontSize: isTouch ? 10 : 11,
            lineHeight: '14px',
            fontWeight: 900,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            animation: 'masteryPulse 0.42s ease-out',
          }}
        >
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {recentEvent.leveledUp ? 'レベルアップ！' : recentEvent.label}
          </span>
          <span style={{ flex: '0 0 auto', fontFamily: 'monospace' }}>
            +{recentEvent.xp} XP
            {recentEvent.streak >= 3 ? ` x${recentEvent.streak}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
